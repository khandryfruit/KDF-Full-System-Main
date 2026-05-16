/**
 * KDF Shopify Product Knowledge — ONE catalog for WhatsApp + Website OpenAI chat.
 * All product name / price / variant lookups must use searchShopifyCatalog().
 */

import { db, shopifyProductsTable } from "@workspace/db";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { expandQuery } from "../routes/search.js";
import {
  expandWaProductSearchTerms,
  searchShopifyProductIdsByAlias,
  fetchShopifyProductsByIds,
  productRootTermsFromQuery,
  WA_PRODUCT_ALIASES,
} from "./shopifyProductSearch.js";

const STORE_URL = "https://khanbabadryfruits.com";

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

function normalizeCatalogQuery(query: string): string {
  return normalizeText(query)
    .replace(/\b\d+(?:\.\d+)?\s*(kg|kgs|kilogram|g|gm|gram|grams)\b/g, " ")
    .replace(/\b(price|rate|qeemat|kitna|how much|available|chahiye|order|buy)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandAllSearchTerms(query: string): string[] {
  const terms = new Set<string>();
  for (const t of expandWaProductSearchTerms(query)) terms.add(t);
  for (const t of expandQuery(query)) terms.add(normalizeText(t));
  const q = normalizeCatalogQuery(query) || normalizeText(query);
  if (q) terms.add(q);
  return [...terms].filter((t) => t.length > 1);
}

function queryWantsBundle(query: string): boolean {
  return /\b(gift|box|combo|mix|mixed|assorted|portion|hamper|basket)\b/.test(normalizeText(query));
}

function isBundleName(name: string): boolean {
  return /\b(gift|box|combo|mix|mixed|assorted|portion|hamper|basket)\b/.test(normalizeText(name));
}

function scoreProduct(query: string, title: string, tags?: unknown): number {
  const terms = expandAllSearchTerms(query);
  const q = terms[0] ?? normalizeText(query);
  const n = normalizeText(title);
  const tagText = normalizeText(Array.isArray(tags) ? tags.join(" ") : tags);
  const roots = productRootTermsFromQuery(query);

  if (roots.length > 0 && isBundleName(title) && !queryWantsBundle(query)) return 0;
  if (roots.length > 0 && /\b(oil|butter|powder|paste)\b/.test(n) && !/\b(oil|butter|powder|paste)\b/.test(normalizeText(query))) {
    return 0;
  }

  let score = 0;
  if (n === q) score += 100;
  if (q && n.includes(q)) score += 70;
  for (const root of roots) {
    if (n.split(/\s+/).includes(root)) score += 45;
    else if (n.includes(root)) score += 25;
    if (tagText.includes(root)) score += 12;
  }
  for (const term of terms.flatMap((t) => t.split(/\s+/)).filter((t) => t.length > 1)) {
    const pos = n.indexOf(term);
    if (pos === 0) score += 30;
    else if (pos > 0 && pos <= 28) score += 20;
    else if (pos > 28) score += 8;
    if (tagText.includes(term)) score += 5;
  }
  if (roots.length > 0 && !roots.some((r) => n.includes(r) || tagText.includes(r))) return 0;
  return score;
}

function formatVariants(variants: unknown): {
  label: string;
  lines: string[];
  cheapestPrice: number | null;
  options: ShopifyCatalogVariant[];
} {
  const arr = Array.isArray(variants) ? variants : [];
  const options = arr
    .filter((v: any) => Number(v?.inventoryQuantity ?? 1) > 0)
    .slice(0, 12)
    .map((v: any) => {
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
  const cheapest = options.length ? Math.min(...options.map((o) => o.price)) : null;
  const lines = options.map((v) => `${v.title} — ${formatRupees(v.price)}`);
  return {
    label: lines.join("\n"),
    lines,
    cheapestPrice: cheapest,
    options,
  };
}

function mapRowToCatalogProduct(row: any, query: string): ShopifyCatalogProduct | null {
  const matchScore = scoreProduct(query, row.title, row.tags);
  if (matchScore <= 0) return null;
  const variants = formatVariants(row.variants);
  const basePrice = variants.cheapestPrice ?? parseCatalogUnitPrice(row.price);
  const handle = row.handle || row.shopifyProductId?.replace(/[^a-z0-9-]/gi, "-").toLowerCase() || "product";
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
    inStock: (row.inventoryQuantity ?? 0) > 0 || variants.lines.length > 0,
    tags: row.tags,
    score: matchScore,
    source: "shopify",
  };
}

/**
 * Single entry: search synced Shopify catalog by any name (Urdu / Roman / English / variant weight).
 */
export async function searchShopifyCatalog(query: string, limit = 6): Promise<ShopifyCatalogProduct[]> {
  const q = String(query ?? "").trim();
  if (!q) return [];

  const terms = expandAllSearchTerms(q);
  const aliasIds = await searchShopifyProductIdsByAlias(q, limit * 4);
  let rows: any[] = [];

  if (aliasIds.length) {
    rows = await fetchShopifyProductsByIds(aliasIds);
  }

  if (rows.length < limit) {
    const fallback = await db
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
      })
      .from(shopifyProductsTable)
      .where(and(
        eq(shopifyProductsTable.status, "active"),
        terms.length
          ? or(
              ...terms.flatMap((term) => [
                ilike(shopifyProductsTable.title, `%${term}%`),
                ilike(shopifyProductsTable.tags, `%${term}%`),
              ]),
            )
          : sql`false`,
      ))
      .orderBy(desc(shopifyProductsTable.inventoryQuantity))
      .limit(limit * 4)
      .catch(() => []);

    const seen = new Set(rows.map((r) => r.shopifyProductId));
    for (const row of fallback) {
      if (!seen.has(row.shopifyProductId)) rows.push(row);
    }
  }

  const scored = rows
    .map((row) => mapRowToCatalogProduct(row, q))
    .filter((p): p is ShopifyCatalogProduct => Boolean(p))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

/** OpenAI system / tool context — official prices only */
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

/** Website chat product cards */
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
      sellerRank >= 0 && sellerRank < 3
        ? "Best Seller"
        : sellerRank < 7
          ? "Popular"
          : null;
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

/** WhatsApp catalog shape (compatible with existing searchProductsForWa) */
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
}> {
  const [prod] = await db
    .select({ count: sql<number>`count(*)` })
    .from(shopifyProductsTable)
    .where(eq(shopifyProductsTable.status, "active"))
    .catch(() => [{ count: 0 }]);
  let aliasRows = 0;
  try {
    const [a] = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM shopify_product_aliases`);
    aliasRows = Number((a as any)?.rows?.[0]?.cnt ?? (a as any)?.cnt ?? 0);
  } catch {
    aliasRows = 0;
  }
  return {
    activeProducts: Number(prod?.count ?? 0),
    aliasRows,
  };
}

export { WA_PRODUCT_ALIASES, rebuildShopifyProductAliases } from "./shopifyProductSearch.js";
