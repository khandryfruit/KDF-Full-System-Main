/**
 * KDF Shopify Product Knowledge — ONE catalog for WhatsApp + Website OpenAI chat.
 * All product name / price / variant lookups must use searchShopifyCatalog().
 */

import { db, shopifyProductsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import {
  expandWaProductSearchTerms,
  productRootTermsFromQuery,
  WA_PRODUCT_ALIASES,
} from "./shopifyProductSearch.js";

const STORE_URL = "https://khanbabadryfruits.com";

const CATALOG_CACHE_TTL_MS = 60_000;
let catalogCache: { at: number; rows: any[] } | null = null;

export type ShopifyCatalogVariant = {
  id: string;
  title: string;
  price: number;
  compareAtPrice?: number | null;
  sku?: string;
  inventoryQuantity?: number;
};

export type ShopifyCatalogProduct = {
  id: number;
  shopifyProductId: string;
  name: string;
  price: string;
  rawPrice: number;
  compareAt: string | null;
  description: string | null;
  imageUrl: string | null;
  productUrl: string;
  variants: string;
  variantLines: string[];
  variantOptions: ShopifyCatalogVariant[];
  inStock: boolean;
  tags?: string | null;
  productType?: string | null;
  category?: string | null;
  score: number;
  source: "shopify";
};

function formatRupees(value: unknown): string {
  const n = Number.parseFloat(String(value ?? "0"));
  return `Rs. ${Number.isFinite(n) ? Math.round(n).toLocaleString("en-PK") : "0"}`;
}

function parseMoneyValue(value: unknown): number {
  const matches = String(value ?? "").match(/\d[\d,]*(?:\.\d+)?/g);
  if (!matches?.length) return 0;
  const n = Number.parseFloat(matches[matches.length - 1]!.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function parseCatalogUnitPrice(value: unknown): number {
  const n = parseMoneyValue(value);
  if (!Number.isFinite(n)) return 0;
  if (n >= 50000 && Number.isInteger(n) && n % 100 === 0) return n / 100;
  return n;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVariantText(value: string): string {
  return normalizeText(value)
    .replace(/\bgrams?\b/g, "g")
    .replace(/\bgm\b/g, "g")
    .replace(/\bkgs?\b/g, "kg")
    .replace(/\s+/g, "");
}

function normalizeCatalogQuery(query: string): string {
  return normalizeText(query)
    .replace(/\b(price|rate|qeemat|kitna|how much|available|chahiye|order|buy|please)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandAllSearchTerms(query: string): string[] {
  const terms = new Set<string>();
  for (const t of expandWaProductSearchTerms(query)) terms.add(t);
  const q = normalizeCatalogQuery(query) || normalizeText(query);
  if (q) terms.add(q);
  for (const token of q.split(/\s+/)) {
    if (token.length > 1) terms.add(token);
    if (WA_PRODUCT_ALIASES[token]) {
      for (const syn of WA_PRODUCT_ALIASES[token]) terms.add(normalizeText(syn));
    }
  }
  return [...terms].filter((t) => t.length > 1);
}

function productRootsFromQuery(query: string): string[] {
  const roots = new Set<string>(productRootTermsFromQuery(query));
  const q = normalizeText(query);
  for (const key of Object.keys(WA_PRODUCT_ALIASES)) {
    if (q.includes(key) || q.split(/\s+/).includes(key)) {
      roots.add(key);
      for (const syn of WA_PRODUCT_ALIASES[key]) roots.add(normalizeText(syn));
    }
  }
  return [...roots];
}

function queryWantsBundle(query: string): boolean {
  return /\b(gift|box|combo|mix|mixed|assorted|portion|hamper|basket)\b/.test(normalizeText(query));
}

function isBundleName(name: string): boolean {
  return /\b(gift|box|combo|mix|mixed|assorted|portion|hamper|basket)\b/.test(normalizeText(name));
}

function extractWeightHint(query: string): string | null {
  const m = normalizeText(query).match(/\b(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms|g|gm|gram|grams)\b/);
  if (!m) return null;
  const num = m[1];
  const unit = m[2].startsWith("k") ? "kg" : "g";
  return `${num}${unit}`;
}

function scoreProduct(query: string, title: string, tags?: unknown): number {
  const terms = expandAllSearchTerms(query);
  const q = normalizeCatalogQuery(query) || normalizeText(query);
  const n = normalizeText(title);
  const tagText = normalizeText(Array.isArray(tags) ? tags.join(" ") : tags);
  const roots = productRootsFromQuery(query);

  if (roots.length > 0 && isBundleName(title) && !queryWantsBundle(query)) return 0;
  if (roots.length > 0 && /\b(oil|butter|powder|paste)\b/.test(n) && !/\b(oil|butter|powder|paste)\b/.test(normalizeText(query))) {
    return 0;
  }

  let score = 0;
  if (n === q) score += 120;
  if (q && n.includes(q)) score += 80;
  for (const root of roots) {
    if (n.split(/\s+/).some((w) => w === root || w.includes(root))) score += 50;
    else if (n.includes(root)) score += 30;
    if (tagText.includes(root)) score += 15;
  }
  for (const term of terms) {
    if (term.length < 2) continue;
    const pos = n.indexOf(term);
    if (pos === 0) score += 35;
    else if (pos > 0 && pos <= 30) score += 22;
    else if (pos > 30) score += 6;
    if (tagText.includes(term)) score += 8;
  }
  if (roots.length > 0 && !roots.some((r) => n.includes(r) || tagText.includes(r))) return 0;
  return score;
}

async function loadAllActiveCatalogRows(): Promise<any[]> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < CATALOG_CACHE_TTL_MS) {
    return catalogCache.rows;
  }
  const rows = await db
    .select({
      id: shopifyProductsTable.id,
      title: shopifyProductsTable.title,
      price: shopifyProductsTable.price,
      compareAtPrice: shopifyProductsTable.compareAtPrice,
      description: shopifyProductsTable.description,
      imageUrl: shopifyProductsTable.imageUrl,
      variants: shopifyProductsTable.variants,
      inventoryQuantity: shopifyProductsTable.inventoryQuantity,
      shopifyProductId: shopifyProductsTable.shopifyProductId,
      handle: shopifyProductsTable.handle,
      tags: shopifyProductsTable.tags,
      productType: shopifyProductsTable.productType,
      collections: shopifyProductsTable.collections,
    })
    .from(shopifyProductsTable)
    .where(eq(shopifyProductsTable.status, "active"))
    .orderBy(desc(shopifyProductsTable.syncedAt))
    .catch(() => []);

  catalogCache = { at: now, rows };
  return rows;
}

export function invalidateCatalogCache(): void {
  catalogCache = null;
}

function formatVariants(variants: unknown, query: string): {
  label: string;
  lines: string[];
  cheapestPrice: number | null;
  options: ShopifyCatalogVariant[];
} {
  const weightHint = extractWeightHint(query);
  const arr = Array.isArray(variants) ? variants : [];
  let options = arr.map((v: any) => {
    const title = String(v.title ?? "Default").replace(/^default title$/i, "Standard");
    const price = parseCatalogUnitPrice(v.price);
    return {
      id: String(v.id ?? ""),
      title,
      price,
      compareAtPrice: v.compareAtPrice ? parseCatalogUnitPrice(v.compareAtPrice) : null,
      sku: v.sku ? String(v.sku) : undefined,
      inventoryQuantity: Number(v.inventoryQuantity ?? 0),
    };
  });

  if (weightHint) {
    const filtered = options.filter((v) => {
      const vt = normalizeVariantText(v.title);
      return vt.includes(weightHint) || vt.includes(weightHint.replace("kg", "")) || weightHint.includes(vt);
    });
    if (filtered.length) options = filtered;
  }

  options = options.slice(0, 12);
  const cheapest = options.length ? Math.min(...options.map((o) => o.price)) : null;
  const lines = options.map((v) => `${v.title} — ${formatRupees(v.price)}`);
  return { label: lines.join("\n"), lines, cheapestPrice: cheapest, options };
}

function mapRowToCatalogProduct(row: any, query: string): ShopifyCatalogProduct | null {
  const matchScore = scoreProduct(query, row.title, row.tags);
  if (matchScore <= 0) return null;
  const variants = formatVariants(row.variants, query);
  const basePrice = variants.cheapestPrice ?? parseCatalogUnitPrice(row.price);
  const handle = row.handle || row.shopifyProductId?.replace(/[^a-z0-9-]/gi, "-").toLowerCase() || "product";
  const collections = Array.isArray(row.collections) ? row.collections : [];
  return {
    id: Number(row.id),
    shopifyProductId: row.shopifyProductId,
    name: row.title,
    price: variants.lines.length ? `From ${formatRupees(basePrice)}` : formatRupees(parseCatalogUnitPrice(row.price)),
    rawPrice: basePrice,
    compareAt: row.compareAtPrice ? formatRupees(parseCatalogUnitPrice(row.compareAtPrice)) : null,
    description: row.description
      ? String(row.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180)
      : null,
    imageUrl: row.imageUrl ?? null,
    productUrl: `${STORE_URL}/products/${handle}`,
    variants: variants.label,
    variantLines: variants.lines,
    variantOptions: variants.options,
    inStock: (row.inventoryQuantity ?? 0) > 0 || variants.options.some((v) => (v.inventoryQuantity ?? 0) > 0),
    tags: row.tags,
    productType: row.productType,
    category: collections[0]?.title ?? null,
    score: matchScore,
    source: "shopify",
  };
}

/** Score entire active catalog — reliable for 300+ products */
async function scoreEntireCatalog(query: string): Promise<ShopifyCatalogProduct[]> {
  const rows = await loadAllActiveCatalogRows();
  return rows
    .map((row) => mapRowToCatalogProduct(row, query))
    .filter((p): p is ShopifyCatalogProduct => Boolean(p))
    .sort((a, b) => b.score - a.score);
}

/**
 * Single entry: search synced Shopify catalog by any name (Urdu / Roman / English / variant weight).
 */
export async function searchShopifyCatalog(query: string, limit = 6): Promise<ShopifyCatalogProduct[]> {
  const q = String(query ?? "").trim();
  if (!q) return [];
  const scored = await scoreEntireCatalog(q);
  return scored.slice(0, limit);
}

/** Count all matches (admin index health / pagination) */
export async function countShopifyCatalogMatches(query: string): Promise<number> {
  const q = String(query ?? "").trim();
  if (!q) return 0;
  return (await scoreEntireCatalog(q)).length;
}

export function formatShopifyCatalogForOpenAI(products: ShopifyCatalogProduct[]): string {
  if (!products.length) return "";
  return products
    .map((p, idx) => {
      const variants = p.variantLines.length
        ? p.variantLines.map((v) => `    - ${v}`).join("\n")
        : `    - ${p.price}`;
      return `${idx + 1}. ${p.name}\n${variants}\n    Stock: ${p.inStock ? "In stock" : "Out of stock"}\n    URL: ${p.productUrl}`;
    })
    .join("\n");
}

/** Roman Urdu / Urdu customer-facing variant list */
export function formatShopifyCatalogWhatsAppReply(products: ShopifyCatalogProduct[], roman = true): string {
  if (!products.length) {
    return roman
      ? "Sorry, is product ka official data nahi mila. Please exact naam ya weight bhej dein."
      : "معذرت، اس product کا official data نہیں ملا۔ براہ کرم exact نام یا weight بھیج دیں۔";
  }
  const p = products[0];
  const lines = p.variantOptions.length
    ? p.variantOptions.map((v, i) => `${i + 1}️⃣ ${v.title} — ${formatRupees(v.price)}${(v.inventoryQuantity ?? 0) > 0 ? "" : " (out of stock)"}`)
    : [`1️⃣ ${p.price}`];
  if (roman) {
    return `Ji 😊\n\n*${p.name}*\nAvailable options:\n\n${lines.join("\n")}\n\nStock: ${p.inStock ? "Available ✅" : "Limited ❌"}\n\nKya aap order start karna chahte hain?`;
  }
  return `جی 😊\n\n*${p.name}*\nAvailable options:\n\n${lines.join("\n")}\n\nStock: ${p.inStock ? "Available ✅" : "Limited ❌"}\n\nکیا آپ order start کرنا چاہتے ہیں؟`;
}

export function toWebsiteChatProductCards(
  products: ShopifyCatalogProduct[],
  sellerScores?: Map<string, number>,
) {
  const topSellers = sellerScores
    ? [...sellerScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t)
    : [];

  return products.map((p) => {
    const minPrice = p.rawPrice;
    const compareAt = p.compareAt ? parseCatalogUnitPrice(p.compareAt) : null;
    const discount =
      compareAt && compareAt > minPrice ? Math.round(((compareAt - minPrice) / compareAt) * 100) : null;
    const sellerRank = topSellers.indexOf(p.name.toLowerCase());
    const badge =
      sellerRank >= 0 && sellerRank < 3 ? "Best Seller" : sellerRank < 7 ? "Popular" : null;
    return {
      id: p.id,
      name: p.name,
      price: minPrice,
      originalPrice: compareAt,
      discount,
      stock: p.inStock ? 1 : 0,
      variants: p.variantOptions.map((v) => ({
        id: v.id,
        name: v.title,
        value: v.title,
        price: v.price,
        stock: v.inventoryQuantity ?? 0,
      })),
      image: p.imageUrl,
      badge,
    };
  });
}

export function toWhatsAppCatalogProducts(products: ShopifyCatalogProduct[]) {
  return products.map((p) => ({
    name: p.name,
    price: p.price,
    compareAt: p.compareAt,
    description: p.description,
    imageUrl: p.imageUrl,
    productUrl: p.productUrl,
    variants: p.variants,
    variantLines: p.variantLines,
    rawPrice: p.rawPrice,
    inStock: p.inStock,
    source: p.source as "shopify",
    shopifyProductId: p.shopifyProductId,
    variantOptions: p.variantOptions,
  }));
}

export async function getShopifyCatalogStats(): Promise<{
  activeProducts: number;
  aliasRows: number;
  indexedProducts: number;
  indexHealthy: boolean;
  indexCoveragePct: number;
}> {
  const [prod] = await db
    .select({ count: sql<number>`count(*)` })
    .from(shopifyProductsTable)
    .where(eq(shopifyProductsTable.status, "active"))
    .catch(() => [{ count: 0 }]);

  const activeProducts = Number(prod?.count ?? 0);
  let aliasRows = 0;
  let indexedProducts = 0;
  try {
    const aliasCount = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM shopify_product_aliases`);
    aliasRows = Number((aliasCount as any).rows?.[0]?.cnt ?? 0);
    const idxCount = await db.execute(sql`SELECT COUNT(DISTINCT shopify_product_id)::int AS cnt FROM shopify_product_aliases`);
    indexedProducts = Number((idxCount as any).rows?.[0]?.cnt ?? 0);
  } catch {
    aliasRows = 0;
    indexedProducts = 0;
  }

  const indexCoveragePct = activeProducts > 0 ? Math.round((indexedProducts / activeProducts) * 100) : 0;
  const indexHealthy = activeProducts === 0 || indexedProducts >= Math.floor(activeProducts * 0.95);

  return { activeProducts, aliasRows, indexedProducts, indexHealthy, indexCoveragePct };
}

export { WA_PRODUCT_ALIASES, rebuildShopifyProductAliases } from "./shopifyProductSearch.js";
