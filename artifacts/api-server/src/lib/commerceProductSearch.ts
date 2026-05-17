/**
 * Commerce → Products (admin `products` table) — PRIMARY source for WhatsApp AI.
 * Search priority: exact name → tags → slug → variations → synonyms → embedding (optional).
 */
import { db, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { ProductVariant } from "@workspace/db";
import { WA_PRODUCT_ALIASES, expandWaProductSearchTerms, productRootTermsFromQuery } from "./shopifyProductSearch.js";
import {
  productBelongsToFamilies,
  resolveQueryFamilies,
  expandFamilyTerms,
} from "./catalogProductMatcher.js";
import { KHAN_WEBSITE_URL } from "./waMenuDefaults.js";
import { logProductSearch } from "./productSearchDebug.js";

const STORE_BASE = (process.env.STOREFRONT_URL ?? process.env.PUBLIC_STORE_URL ?? KHAN_WEBSITE_URL).replace(/\/$/, "");

export type CommerceProductHit = {
  id: string;
  name: string;
  slug: string;
  price: string;
  stock: number;
  image: string | null;
  variations: Array<{
    id?: string;
    name: string;
    value?: string;
    price?: string | number;
    stock?: number;
    sku?: string;
  }>;
  tags: string[];
  url: string;
  score: number;
  matchMethod: string;
  inStock: boolean;
  rawPrice: number;
  description?: string | null;
};

export type CommerceSearchDebug = {
  query: string;
  terms: string[];
  families: string[];
  matchCount: number;
  methods: Record<string, number>;
  topHits: Array<{ id: string; name: string; score: number; method: string }>;
};

const CACHE_TTL_MS = 45_000;
let productCache: { at: number; rows: Awaited<ReturnType<typeof loadActiveCommerceRows>> } | null = null;

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatRupees(n: number): string {
  return `Rs. ${Number.isFinite(n) ? Math.round(n).toLocaleString("en-PK") : "0"}`;
}

function parsePrice(value: unknown): number {
  const n = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function productUrl(slug: string): string {
  return `${STORE_BASE}/products/${slug}`;
}

function expandCommerceTerms(query: string): string[] {
  const terms = new Set<string>();
  for (const t of expandWaProductSearchTerms(query)) terms.add(t);
  const q = normalizeText(query);
  if (q) terms.add(q);
  for (const token of q.split(/\s+/)) {
    if (token.length >= 2) {
      terms.add(token);
      for (const syn of WA_PRODUCT_ALIASES[token] ?? []) terms.add(normalizeText(syn));
    }
  }
  for (const [key, syns] of Object.entries(WA_PRODUCT_ALIASES)) {
    if (key.length >= 3 && q.includes(key)) {
      terms.add(key);
      for (const s of syns) terms.add(normalizeText(s));
    }
  }
  return [...terms].filter((t) => t.length >= 1);
}

async function loadActiveCommerceRows() {
  return db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      slug: productsTable.slug,
      description: productsTable.description,
      price: productsTable.price,
      originalPrice: productsTable.originalPrice,
      stock: productsTable.stock,
      images: productsTable.images,
      tags: productsTable.tags,
      variants: productsTable.variants,
      featured: productsTable.featured,
    })
    .from(productsTable)
    .where(eq(productsTable.active, true))
    .catch(() => []);
}

async function getAllActiveProducts() {
  const now = Date.now();
  if (productCache && now - productCache.at < CACHE_TTL_MS) return productCache.rows;
  const rows = await loadActiveCommerceRows();
  productCache = { at: now, rows };
  return rows;
}

export function invalidateCommerceProductCache(): void {
  productCache = null;
}

function scoreCommerceProduct(
  row: Awaited<ReturnType<typeof loadActiveCommerceRows>>[number],
  query: string,
  terms: string[],
  families: string[],
): { score: number; method: string } | null {
  const name = row.name ?? "";
  const slug = row.slug ?? "";
  const tags = Array.isArray(row.tags) ? row.tags.join(" ") : String(row.tags ?? "");
  const desc = row.description ?? "";
  const variants = Array.isArray(row.variants) ? row.variants : [];
  const variantText = variants
    .map((v: ProductVariant) => `${v.name ?? ""} ${v.value ?? ""} ${v.sku ?? ""}`)
    .join(" ");

  if (families.length > 0 && !productBelongsToFamilies(name, tags, desc, families)) {
    return null;
  }

  const qNorm = normalizeText(query);
  const nameNorm = normalizeText(name);
  const slugNorm = normalizeText(slug.replace(/-/g, " "));
  const tagNorm = normalizeText(tags);
  const variantNorm = normalizeText(variantText);

  let score = 0;
  let method = "lexical";

  if (qNorm && nameNorm === qNorm) {
    return { score: 250, method: "exact_name" };
  }

  if (qNorm.length >= 3 && nameNorm.includes(qNorm)) {
    score = Math.max(score, 200);
    method = "exact_name_contains";
  }

  for (const term of terms) {
    if (term.length < 2) continue;
    if (nameNorm === term) {
      score = Math.max(score, 220);
      method = "exact_name_token";
    } else if (nameNorm.startsWith(term)) {
      score = Math.max(score, 185);
      method = "name_prefix";
    } else if (nameNorm.includes(term)) {
      score = Math.max(score, 160);
      method = "name_match";
    }
    if (tagNorm.includes(term)) {
      score = Math.max(score, 140);
      method = method === "lexical" ? "tags" : method;
    }
    if (slugNorm.includes(term) || slug.includes(term)) {
      score = Math.max(score, 120);
      method = method === "lexical" ? "slug" : method;
    }
    if (variantNorm.includes(term)) {
      score = Math.max(score, 100);
      method = method === "lexical" ? "variation" : method;
    }
  }

  if (families.length > 0) {
    const familyTerms = expandFamilyTerms(families);
    const blob = `${nameNorm} ${tagNorm} ${slugNorm}`;
    const familyHit = familyTerms.some((f) => f.length >= 3 && blob.includes(f));
    if (!familyHit) return null;
    score += 30;
    method = `${method}+family`;
  }

  if (score < 35) return null;
  return { score, method };
}

function descSnippet(d: string | null | undefined): string | null {
  if (!d) return null;
  return String(d).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function mapRowToHit(
  row: Awaited<ReturnType<typeof loadActiveCommerceRows>>[number],
  score: number,
  method: string,
): CommerceProductHit {
  const variants = (Array.isArray(row.variants) ? row.variants : []) as ProductVariant[];
  const imgs = (Array.isArray(row.images) ? row.images : []) as string[];
  const basePrice = parsePrice(row.price);
  const tags = (Array.isArray(row.tags) ? row.tags : []).map(String);
  const inStock = (row.stock ?? 0) > 0 || variants.some((v) => (v.stock ?? 0) > 0);

  const variations = variants.map((v) => ({
    id: v.id,
    name: v.name ?? v.value ?? "Option",
    value: v.value,
    price: v.price ?? basePrice,
    stock: v.stock ?? 0,
    sku: v.sku,
  }));

  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    price: variations.length ? `From ${formatRupees(basePrice)}` : formatRupees(basePrice),
    stock: row.stock ?? 0,
    image: imgs[0] ?? null,
    variations,
    tags,
    url: productUrl(row.slug),
    score,
    matchMethod: method,
    inStock,
    rawPrice: basePrice,
    description: descSnippet(row.description),
  };
}

/** Primary search — Commerce → Products table */
export async function searchCommerceProducts(
  query: string,
  limit = 8,
): Promise<CommerceProductHit[]> {
  const q = String(query ?? "").trim();
  if (!q) return [];

  const terms = expandCommerceTerms(q);
  const families = resolveQueryFamilies(q);
  const rows = await getAllActiveProducts();

  const scored: CommerceProductHit[] = [];
  for (const row of rows) {
    const hit = scoreCommerceProduct(row, q, terms, families);
    if (!hit) continue;
    scored.push(mapRowToHit(row, hit.score, hit.method));
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export async function searchCommerceProductsWithDebug(
  query: string,
  limit = 8,
): Promise<{ products: CommerceProductHit[]; debug: CommerceSearchDebug }> {
  const q = String(query ?? "").trim();
  const products = await searchCommerceProducts(q, limit);
  const methods: Record<string, number> = {};
  for (const p of products) {
    const m = p.matchMethod.split("+")[0] ?? p.matchMethod;
    methods[m] = (methods[m] ?? 0) + 1;
  }
  return {
    products,
    debug: {
      query: q,
      terms: expandCommerceTerms(q),
      families: resolveQueryFamilies(q),
      matchCount: products.length,
      methods,
      topHits: products.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        method: p.matchMethod,
      })),
    },
  };
}

/** List all commerce products in a product family (badam → almonds) */
export async function listCommerceProductsForCustomerQuery(query: string): Promise<{
  products: CommerceProductHit[];
  roots: string[];
  familyId: string | null;
}> {
  const q = String(query ?? "").trim();
  const roots = productRootTermsFromQuery(q);
  const families = resolveQueryFamilies(q);
  const rows = await getAllActiveProducts();

  if (!families.length) {
    const hits = await searchCommerceProducts(q, 50);
    return { products: hits, roots, familyId: null };
  }

  const products: CommerceProductHit[] = [];
  for (const row of rows) {
    const tags = Array.isArray(row.tags) ? row.tags.join(" ") : "";
    if (!productBelongsToFamilies(row.name, tags, row.description, families)) continue;
    products.push(mapRowToHit(row, 100, "family_list"));
  }
  products.sort((a, b) => a.name.localeCompare(b.name));
  return { products, roots, familyId: families[0] ?? null };
}

/** API response shape for GET /api/products/search */
export function toCommerceSearchApiResponse(products: CommerceProductHit[]) {
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    stock: p.stock,
    image: p.image,
    variations: p.variations,
    tags: p.tags,
    url: p.url,
    inStock: p.inStock,
    score: p.score,
    matchMethod: p.matchMethod,
  }));
}

/** WhatsApp catalog card shape (compatible with searchProductsForWa) */
export function commerceToWaCatalogProducts(hits: CommerceProductHit[]) {
  return hits.map((p) => ({
    name: p.name,
    price: p.price,
    compareAt: null as string | null,
    description: p.description ?? null,
    imageUrl: p.image,
    productUrl: p.url,
    variants: p.variations.map((v) => `${v.name}${v.value ? ` (${v.value})` : ""} — ${formatRupees(parsePrice(v.price))}`).join("\n"),
    variantLines: p.variations.map((v) => `${v.name}${v.value ? ` (${v.value})` : ""} — ${formatRupees(parsePrice(v.price))}`),
    inStock: p.inStock,
    source: "commerce" as const,
    rawPrice: p.rawPrice,
    shopifyProductId: p.id,
    commerceProductId: p.id,
    slug: p.slug,
    variantOptions: p.variations.map((v, i) => ({
      id: v.id ?? String(i + 1),
      title: v.value ? `${v.name} (${v.value})` : v.name,
      price: parsePrice(v.price),
      compareAtPrice: null,
      sku: v.sku,
      inventoryQuantity: v.stock ?? 0,
    })),
  }));
}

export function formatCommerceProductsWhatsAppReply(hits: CommerceProductHit[], roman = true): string {
  if (!hits.length) {
    return roman
      ? "Ji 😊 is waqt catalog mein exact match nahi mila. Product naam bhej dein — jaise badam, pista, kaju 😊"
      : "جی 😊 اس وقت catalog میں exact match نہیں ملا۔ product نام بھیجیں — جیسے badam، pista، kaju 😊";
  }

  if (hits.length === 1) {
    const p = hits[0]!;
    const lines = p.variations.length
      ? p.variations.map((v, i) => `${i + 1}️⃣ ${v.name}${v.value ? ` (${v.value})` : ""} — ${formatRupees(parsePrice(v.price))}`)
      : [`1️⃣ ${p.price}`];
    return roman
      ? `🥜 *${p.name}*\n\n${lines.join("\n")}\n\nStock: ${p.inStock ? "Available ✅" : "Out of stock ❌"}\n\nReply *1*, *2*… to select size 😊`
      : `🥜 *${p.name}*\n\n${lines.join("\n")}\n\nStock: ${p.inStock ? "Available ✅" : "Out of stock ❌"}\n\nSize کے لیے *1*, *2*… reply کریں 😊`;
  }

  const header = roman ? "🥜 *Matching products:*\n\n" : "🥜 *Matching products:*\n\n";
  const list = hits
    .slice(0, 12)
    .map((p, i) => `${i + 1}. ${p.name} — ${p.price}${p.inStock ? "" : " (out)"}`)
    .join("\n");
  const footer = roman
    ? "\n\nReply with product number (1, 2, 3…) 😊"
    : "\n\nProduct number reply کریں (1, 2, 3…) 😊";
  return header + list + footer;
}

export async function logCommerceProductSearch(opts: {
  phone?: string | null;
  userQuery: string;
  products: CommerceProductHit[];
  matchMethod?: string;
  gptOutput?: string | null;
}): Promise<void> {
  await logProductSearch({
    phone: opts.phone,
    channel: "whatsapp_commerce",
    userQuery: opts.userQuery,
    matchMethod: opts.matchMethod ?? "commerce_hybrid",
    matches: opts.products.map((p) => ({
      shopifyProductId: p.id,
      name: p.name,
      score: p.score,
      method: p.matchMethod,
    })),
    gptOutput: opts.gptOutput,
  });
}

/** Map commerce hit → ShopifyCatalogProduct shape for shared WA state machine */
export function commerceHitToCatalogProduct(p: CommerceProductHit): import("./shopifyProductKnowledge.js").ShopifyCatalogProduct {
  return {
    id: Number(p.id) || 0,
    shopifyProductId: p.id,
    name: p.name,
    price: p.price,
    rawPrice: p.rawPrice,
    compareAt: null,
    description: p.description ?? null,
    imageUrl: p.image,
    productUrl: p.url,
    variants: p.variations.map((v) => `${v.name} — ${formatRupees(parsePrice(v.price))}`).join("\n"),
    variantLines: p.variations.map((v) => `${v.name}${v.value ? ` (${v.value})` : ""} — ${formatRupees(parsePrice(v.price))}`),
    variantOptions: p.variations.map((v, i) => ({
      id: v.id ?? String(i + 1),
      title: v.value ? `${v.name} (${v.value})` : v.name,
      price: parsePrice(v.price),
      compareAtPrice: null,
      sku: v.sku,
      inventoryQuantity: v.stock ?? 0,
    })),
    inStock: p.inStock,
    tags: p.tags.join(", "),
    category: p.tags[0] ?? null,
    score: p.score,
    source: "shopify",
  };
}

export async function getCommerceProductStats(): Promise<{
  activeProducts: number;
  withImages: number;
  withVariants: number;
}> {
  const rows = await getAllActiveProducts();
  return {
    activeProducts: rows.length,
    withImages: rows.filter((r) => Array.isArray(r.images) && r.images.length > 0).length,
    withVariants: rows.filter((r) => Array.isArray(r.variants) && r.variants.length > 0).length,
  };
}
