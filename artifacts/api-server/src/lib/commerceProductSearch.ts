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
  productMatchesCategoryPrimary,
  productExcludedForSpecificQuery,
  productMatchesSpecificKey,
  resolveQueryFamilies,
  expandFamilyTerms,
} from "./catalogProductMatcher.js";
import { resolveCanonicalCategoryId } from "./waCategoryIndex.js";
import { resolveCanonicalCategoryFromDb, getProductIdsForDbCategory } from "./waCommerceCategories.js";
import { KHAN_WEBSITE_URL } from "./waMenuDefaults.js";
import { logProductSearch } from "./productSearchDebug.js";
import {
  extractWaProductEntity,
  isGenericBerryBrowse,
  resolveSpecificProductKey,
} from "./waProductEntity.js";
import { matchStorefrontCategory } from "./waStorefrontCategories.js";

const STORE_BASE = (process.env.STOREFRONT_URL ?? process.env.PUBLIC_STORE_URL ?? KHAN_WEBSITE_URL).replace(/\/$/, "");
const API_PUBLIC_BASE = (process.env.API_PUBLIC_URL ?? process.env.PUBLIC_API_URL ?? "").replace(/\/$/, "");

/** Absolute HTTPS URL for WhatsApp image messages */
export function resolveCommerceImageUrl(image: string | null | undefined): string | null {
  const raw = String(image ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) {
    if (API_PUBLIC_BASE) return `${API_PUBLIC_BASE}${raw}`;
    return `${STORE_BASE}${raw}`;
  }
  return `${STORE_BASE}/${raw.replace(/^\//, "")}`;
}

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
  entity: string;
  specificKey: string | null;
  terms: string[];
  families: string[];
  matchCount: number;
  confidence: number;
  topScore: number;
  secondScore: number;
  ambiguous: boolean;
  methods: Record<string, number>;
  topHits: Array<{ id: string; name: string; score: number; method: string }>;
};

export type CommerceRankedSearch = {
  products: CommerceProductHit[];
  entity: string;
  specificKey: string | null;
  confidence: number;
  ambiguous: boolean;
  debug: CommerceSearchDebug;
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

function expandCommerceTerms(query: string, specificKey: string | null): string[] {
  const terms = new Set<string>();
  for (const t of expandWaProductSearchTerms(query)) terms.add(t);
  const q = normalizeText(query);
  if (q) terms.add(q);
  const hasSpecificBerry = Boolean(specificKey && ["goji", "cranberry", "blueberry", "strawberry"].includes(specificKey));
  for (const token of q.split(/\s+/)) {
    if (token.length >= 2) {
      terms.add(token);
      if (!(hasSpecificBerry && (token === "berry" || token === "berries"))) {
        for (const syn of WA_PRODUCT_ALIASES[token] ?? []) terms.add(normalizeText(syn));
      }
    }
  }
  for (const [key, syns] of Object.entries(WA_PRODUCT_ALIASES)) {
    if (key.length >= 3 && q.includes(key)) {
      if (hasSpecificBerry && (key === "berry" || key === "berries")) continue;
      terms.add(key);
      for (const s of syns) {
        const sn = normalizeText(s);
        if (hasSpecificBerry && /\b(berry|berries)\b/.test(sn) && !sn.includes(specificKey!)) continue;
        terms.add(sn);
      }
    }
  }
  if (specificKey) {
    terms.add(specificKey);
    for (const syn of WA_PRODUCT_ALIASES[specificKey] ?? []) terms.add(normalizeText(syn));
  }
  return [...terms].filter((t) => t.length >= 1);
}

function computeSearchConfidence(topScore: number, secondScore: number): { confidence: number; ambiguous: boolean } {
  if (topScore < 35) return { confidence: 0, ambiguous: false };
  const gap = topScore - secondScore;
  if (topScore >= 220) return { confidence: 98, ambiguous: false };
  if (topScore >= 180 && gap >= 50) return { confidence: 95, ambiguous: false };
  if (topScore >= 150 && gap >= 70) return { confidence: 92, ambiguous: false };
  if (gap < 25 && secondScore >= 100) return { confidence: 55, ambiguous: true };
  if (topScore >= 120 && gap >= 40) return { confidence: 88, ambiguous: false };
  return { confidence: Math.min(85, Math.round((topScore / 250) * 100)), ambiguous: gap < 30 && secondScore >= 80 };
}

function filterByConfidence(scored: CommerceProductHit[]): CommerceProductHit[] {
  if (!scored.length) return [];
  const top = scored[0]!.score;
  const second = scored[1]?.score ?? 0;
  const { confidence, ambiguous } = computeSearchConfidence(top, second);
  if (confidence >= 80 || (top >= 150 && top - second >= 50)) return [scored[0]!];
  if (ambiguous && scored.length >= 2) return scored.slice(0, 2);
  if (top >= 100) return [scored[0]!];
  return scored.slice(0, Math.min(2, scored.length));
}

async function loadActiveCommerceRows() {
  return db
    .select({
      id: productsTable.id,
      categoryId: productsTable.categoryId,
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

const SPECIFIC_KEY_TO_CATEGORY: Record<string, string> = {
  pista: "pistachio",
  badam: "almonds",
  kaju: "cashew",
  akhrot: "walnut",
  khajoor: "dates",
  anjeer: "figs",
  kishmish: "raisins",
};

/** True when customer wants a category listing (Pistachios, Dates) not one weighted SKU */
export function isCategoryBrowseQuery(query: string): boolean {
  const raw = String(query ?? "").trim();
  if (matchStorefrontCategory(raw)) return true;
  const q = normalizeText(raw);
  if (!q) return false;
  if (/\b\d+(?:\.\d+)?\s*(kg|kgs|g|gm|gram|grams)\b/i.test(raw)) return false;
  if (/\b(all|sari|tamam|catalog|menu|list|dikhao|show)\b/i.test(q)) return true;
  if (
    /\b(pistachios?|almonds?|walnuts?|cashews?|dates?|figs?|raisins?|berries?|dried figs?|dried berries?|dried fruits?)\b/i.test(
      q,
    )
  ) {
    return true;
  }
  const catId = resolveCanonicalCategoryId(query);
  if (!catId) return false;
  const words = q.split(/\s+/).filter(Boolean);
  return words.length <= 2;
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
  specificKey: string | null,
): { score: number; method: string } | null {
  const name = row.name ?? "";
  const slug = row.slug ?? "";
  const tags = Array.isArray(row.tags) ? row.tags.join(" ") : String(row.tags ?? "");
  const desc = row.description ?? "";
  const variants = Array.isArray(row.variants) ? row.variants : [];
  const variantText = variants
    .map((v: ProductVariant) => `${v.name ?? ""} ${v.value ?? ""} ${v.sku ?? ""}`)
    .join(" ");

  if (specificKey) {
    if (!productMatchesSpecificKey(name, tags, desc, specificKey)) return null;
    if (productExcludedForSpecificQuery(name, tags, desc, specificKey)) return null;
    const catForKey = SPECIFIC_KEY_TO_CATEGORY[specificKey];
    if (catForKey && !productMatchesCategoryPrimary(name, tags, desc, catForKey)) return null;
  } else {
    const categoryId = resolveCanonicalCategoryId(query);
    if (categoryId && categoryId !== "berries" && !productMatchesCategoryPrimary(name, tags, desc, categoryId)) {
      return null;
    }
    if (categoryId === "berries" && !isGenericBerryBrowse(query)) {
      /* specific berry handled via specificKey */
    }
    if (families.length > 0 && !productBelongsToFamilies(name, tags, desc, families)) {
      return null;
    }
  }

  const qNorm = normalizeText(query);
  const entityNorm = normalizeText(extractWaProductEntity(query).entity);
  const nameNorm = normalizeText(name);
  const slugNorm = normalizeText(slug.replace(/-/g, " "));
  const tagNorm = normalizeText(tags);
  const variantNorm = normalizeText(variantText);
  const blob = `${nameNorm} ${tagNorm} ${slugNorm} ${variantNorm}`;

  let score = 0;
  let method = "lexical";

  if (entityNorm.length >= 4 && nameNorm.includes(entityNorm)) {
    return { score: 280, method: "exact_entity_phrase" };
  }

  if (qNorm && nameNorm === qNorm) {
    return { score: 250, method: "exact_name" };
  }

  if (qNorm.length >= 3 && nameNorm.includes(qNorm)) {
    score = Math.max(score, 200);
    method = "exact_name_contains";
  }

  if (specificKey && blob.includes(specificKey)) {
    score = Math.max(score, 240);
    method = "specific_key";
  }

  for (const term of terms) {
    if (term.length < 2) continue;
    if (specificKey && term === "berry" && term !== specificKey) continue;
    if (nameNorm === term) {
      score = Math.max(score, 220);
      method = "exact_name_token";
    } else if (nameNorm.startsWith(term)) {
      score = Math.max(score, 185);
      method = "name_prefix";
    } else if (nameNorm.includes(term)) {
      score = Math.max(score, 160);
      method = "name_match";
    } else if (term.length >= 4 && blob.includes(term)) {
      score = Math.max(score, 90);
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

  if (specificKey) {
    const others = ["goji", "cranberry", "blueberry", "strawberry"].filter((b) => b !== specificKey);
    for (const other of others) {
      if (blob.includes(other) && !blob.includes(specificKey)) {
        score = Math.max(0, score - 120);
      }
    }
  }

  if (families.length > 0 && !specificKey) {
    const familyTerms = expandFamilyTerms(families);
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

  const orig = parsePrice(row.originalPrice);
  const hasDiscount = orig > basePrice && orig > 0;

  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    price: hasDiscount
      ? `${formatRupees(basePrice)} ~~${formatRupees(orig)}~~`
      : variations.length
        ? `From ${formatRupees(basePrice)}`
        : formatRupees(basePrice),
    stock: row.stock ?? 0,
    image: resolveCommerceImageUrl(imgs[0] ?? null),
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

async function scoreAllCommerceProducts(query: string): Promise<CommerceProductHit[]> {
  const q = String(query ?? "").trim();
  if (!q) return [];

  const { entity, specificKey } = extractWaProductEntity(q);
  const searchQ = entity || q;
  const terms = expandCommerceTerms(searchQ, specificKey);
  const families = specificKey ? [specificKey] : resolveQueryFamilies(searchQ);
  const rows = await getAllActiveProducts();

  const scored: CommerceProductHit[] = [];
  for (const row of rows) {
    const hit = scoreCommerceProduct(row, searchQ, terms, families, specificKey);
    if (!hit) continue;
    scored.push(mapRowToHit(row, hit.score, hit.method));
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/** Primary search — Commerce → Products table */
export async function searchCommerceProducts(
  query: string,
  limit = 8,
): Promise<CommerceProductHit[]> {
  const scored = await scoreAllCommerceProducts(query);
  return scored.slice(0, limit);
}

/** Ranked search with confidence — use for WhatsApp single-product replies */
export async function searchCommerceProductsRanked(
  query: string,
  limit = 8,
): Promise<CommerceRankedSearch> {
  const q = String(query ?? "").trim();
  const { entity, specificKey } = extractWaProductEntity(q);
  const searchQ = entity || q;

  if (isCategoryBrowseQuery(q)) {
    const catId =
      resolveCanonicalCategoryId(q) ??
      (specificKey ? SPECIFIC_KEY_TO_CATEGORY[specificKey] ?? null : null);
    if (catId) {
      const products = await listCommerceProductsInCategory(catId, limit);
      return {
        products,
        entity: searchQ,
        specificKey,
        confidence: products.length ? 95 : 0,
        ambiguous: products.length > 1,
        debug: {
          query: q,
          entity: searchQ,
          specificKey,
          terms: expandCommerceTerms(searchQ, specificKey),
          families: [catId],
          matchCount: products.length,
          confidence: products.length ? 95 : 0,
          topScore: 150,
          secondScore: 0,
          ambiguous: products.length > 1,
          methods: { category_list: products.length },
          topHits: products.slice(0, 6).map((p) => ({
            id: p.id,
            name: p.name,
            score: p.score,
            method: p.matchMethod,
          })),
        },
      };
    }
  }

  const scored = await scoreAllCommerceProducts(q);
  const filtered = filterByConfidence(scored);
  const topScore = scored[0]?.score ?? 0;
  const secondScore = scored[1]?.score ?? 0;
  const { confidence, ambiguous } = computeSearchConfidence(topScore, secondScore);

  const methods: Record<string, number> = {};
  for (const p of scored) {
    const m = p.matchMethod.split("+")[0] ?? p.matchMethod;
    methods[m] = (methods[m] ?? 0) + 1;
  }

  const products = (confidence >= 80 ? filtered : scored).slice(0, limit);

  return {
    products: products.length ? products : filtered.slice(0, limit),
    entity: searchQ,
    specificKey,
    confidence,
    ambiguous,
    debug: {
      query: q,
      entity: searchQ,
      specificKey,
      terms: expandCommerceTerms(searchQ, specificKey),
      families: specificKey ? [specificKey] : resolveQueryFamilies(searchQ),
      matchCount: scored.length,
      confidence,
      topScore,
      secondScore,
      ambiguous,
      methods,
      topHits: scored.slice(0, 6).map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        method: p.matchMethod,
      })),
    },
  };
}

/** Related / same-family products when exact query has no hit (never leave customer empty) */
export async function searchRelatedCommerceProducts(
  query: string,
  limit = 4,
): Promise<CommerceProductHit[]> {
  const q = String(query ?? "").trim();
  if (!q) return getCommerceFeaturedProducts(limit);

  const categoryId = resolveCanonicalCategoryId(q);
  const families = resolveQueryFamilies(q);
  const rows = await getAllActiveProducts();
  const related: CommerceProductHit[] = [];

  for (const row of rows) {
    const tags = Array.isArray(row.tags) ? row.tags.join(" ") : "";
    if (categoryId && !productMatchesCategoryPrimary(row.name, tags, row.description, categoryId)) continue;
    if (!categoryId && families.length > 0 && !productBelongsToFamilies(row.name, tags, row.description, families)) continue;
    related.push(mapRowToHit(row, 45, categoryId ? "related_category" : "related_family"));
  }

  if (related.length > 0) {
    related.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name));
    return related.slice(0, limit);
  }

  const loose = await searchCommerceProducts(q, limit * 2);
  if (loose.length > 0) return loose.slice(0, limit);

  return getCommerceFeaturedProducts(limit);
}

/** All active commerce products in a canonical category (strict primary-token match) */
export async function listCommerceProductsInCategory(
  categoryId: string,
  limit = 8,
): Promise<CommerceProductHit[]> {
  const storefront = matchStorefrontCategory(categoryId);
  const dbResolved = await resolveCanonicalCategoryFromDb(categoryId);
  const canonicalId = storefront?.canonicalId ?? dbResolved.canonicalId ?? categoryId;
  const rows = await getAllActiveProducts();
  const products: CommerceProductHit[] = [];

  let allowedIds: Set<number> | null = null;
  if (dbResolved.dbCategoryId) {
    const ids = await getProductIdsForDbCategory(dbResolved.dbCategoryId);
    if (ids.length) allowedIds = new Set(ids);
  }

  for (const row of rows) {
    if (allowedIds && row.categoryId != null && !allowedIds.has(row.categoryId)) continue;
    const tags = Array.isArray(row.tags) ? row.tags.join(" ") : "";
    if (!productMatchesCategoryPrimary(row.name, tags, row.description, canonicalId)) continue;
    products.push(mapRowToHit(row, 150, allowedIds ? "db_category" : "category_list"));
  }

  products.sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return products.slice(0, limit);
}

export async function getCommerceFeaturedProducts(limit = 4): Promise<CommerceProductHit[]> {
  const rows = await getAllActiveProducts();
  const featured = rows.filter((r) => r.featured && (r.stock ?? 0) > 0);
  const pool = featured.length ? featured : rows.filter((r) => (r.stock ?? 0) > 0);
  return pool.slice(0, limit).map((row) => mapRowToHit(row, 30, "featured_fallback"));
}

export async function searchCommerceProductsWithDebug(
  query: string,
  limit = 8,
): Promise<{ products: CommerceProductHit[]; debug: CommerceSearchDebug }> {
  const ranked = await searchCommerceProductsRanked(query, limit);
  return { products: ranked.products, debug: ranked.debug };
}

/** List all commerce products in a product family (badam → almonds) */
export async function listCommerceProductsForCustomerQuery(query: string): Promise<{
  products: CommerceProductHit[];
  roots: string[];
  familyId: string | null;
}> {
  const q = String(query ?? "").trim();
  const roots = productRootTermsFromQuery(q);
  const specificKey = resolveSpecificProductKey(q);

  if (isCategoryBrowseQuery(q)) {
    const catId =
      resolveCanonicalCategoryId(q) ??
      (specificKey ? SPECIFIC_KEY_TO_CATEGORY[specificKey] ?? null : null);
    if (catId) {
      const listed = await listCommerceProductsInCategory(catId, 12);
      if (listed.length) return { products: listed, roots, familyId: catId };
    }
  }

  if (specificKey && !isCategoryBrowseQuery(q)) {
    const ranked = await searchCommerceProductsRanked(q, 8);
    return { products: ranked.products, roots, familyId: specificKey };
  }

  const families = resolveQueryFamilies(q);
  const categoryId = resolveCanonicalCategoryId(q);
  if (!families.length && !categoryId) {
    const hits = await searchCommerceProducts(q, 50);
    return { products: hits, roots, familyId: null };
  }

  if (categoryId === "berries" && !isGenericBerryBrowse(q)) {
    const ranked = await searchCommerceProductsRanked(q, 12);
    return { products: ranked.products, roots, familyId: "berries" };
  }

  const rows = await getAllActiveProducts();
  const products: CommerceProductHit[] = [];
  const catKey = categoryId ?? (families[0] ? resolveCanonicalCategoryId(families[0]) : null);
  for (const row of rows) {
    const tags = Array.isArray(row.tags) ? row.tags.join(" ") : "";
    if (catKey && !productMatchesCategoryPrimary(row.name, tags, row.description, catKey)) continue;
    if (families.length && !productBelongsToFamilies(row.name, tags, row.description, families)) continue;
    products.push(mapRowToHit(row, 100, "family_list"));
  }
  products.sort((a, b) => a.name.localeCompare(b.name));
  const final = products.length > 0 ? products : (await searchCommerceProductsRanked(q, 8)).products;
  return { products: final, roots, familyId: families[0] ?? null };
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
    imageUrl: resolveCommerceImageUrl(p.image),
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

export function formatSingleCommerceProductReply(hit: CommerceProductHit, roman = true): string {
  const variantLines = hit.variations.length
    ? hit.variations.map((v, i) => `${i + 1}️⃣ ${v.name}${v.value ? ` (${v.value})` : ""} — ${formatRupees(parsePrice(v.price))}`).join("\n")
    : "";
  const stock = hit.inStock
    ? roman ? "📦 *Stock:* Available ✅" : "📦 *Stock:* Available ✅"
    : roman ? "📦 *Stock:* Out of stock ❌" : "📦 *Stock:* Out of stock ❌";
  const opener = roman ? "😊 Ji bilkul — yeh available hai:\n\n" : "😊 جی بالکل — یہ available ہے:\n\n";
  return (
    opener +
    `🥜 *${hit.name}*\n\n` +
    `💰 *Price:* ${hit.price}\n` +
    `${stock}\n` +
    (variantLines ? `⭐ *Variants:*\n${variantLines}\n` : "") +
    (roman ? "\n🛒 Size select karne ke liye *1*, *2*… reply karein 😊" : "\n🛒 Size کے لیے *1*, *2*… reply کریں 😊")
  );
}

export function formatCommerceProductsWhatsAppReply(hits: CommerceProductHit[], roman = true): string {
  if (!hits.length) {
    return roman
      ? "Ji 😊 is waqt catalog mein exact match nahi mila. Product naam bhej dein — jaise badam, pista, kaju 😊"
      : "جی 😊 اس وقت catalog میں exact match نہیں ملا۔ product نام بھیجیں — جیسے badam، pista، kaju 😊";
  }

  if (hits.length === 1) {
    return formatSingleCommerceProductReply(hits[0]!, roman);
  }

  if (hits.length === 2) {
    const header = roman ? "😊 Dono options mil gaye — kaunsa chahiye?\n\n" : "😊 دونوں options ملے — کون سا چاہیے؟\n\n";
    const list = hits
      .map((p, i) => `${i + 1}. ${p.name} — ${p.price}${p.inStock ? "" : " (out)"}`)
      .join("\n");
    const footer = roman ? "\n\nReply *1* ya *2* 😊" : "\n\n*1* یا *2* reply کریں 😊";
    return header + list + footer;
  }

  return formatSingleCommerceProductReply(hits[0]!, roman);
}

export async function logCommerceProductSearch(opts: {
  phone?: string | null;
  userQuery: string;
  products: CommerceProductHit[];
  matchMethod?: string;
  debug?: CommerceSearchDebug;
  gptOutput?: string | null;
}): Promise<void> {
  const entityNote = opts.debug
    ? `entity=${opts.debug.entity}; confidence=${opts.debug.confidence}; top=${opts.debug.topScore}`
    : undefined;
  await logProductSearch({
    phone: opts.phone,
    channel: "whatsapp_commerce",
    userQuery: opts.userQuery,
    matchMethod: opts.matchMethod ?? entityNote ?? "commerce_hybrid",
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
    source: "commerce",
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
