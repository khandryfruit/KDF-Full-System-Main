/**
 * Multilingual product search metadata for each Shopify SKU.
 */
import { WA_PRODUCT_ALIASES } from "./shopifyProductSearch.js";
import { resolveCanonicalCategoryId } from "./waCategoryIndex.js";

const URDU_RE = /[\u0600-\u06FF]/;

export type ProductSearchMeta = {
  id: string;
  name: string;
  urdu_name: string;
  roman_keywords: string[];
  keywords: string[];
  price: string;
  variants: string[];
  category: string;
  stock: string;
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatRupees(value: unknown): string {
  const n = Number.parseFloat(String(value ?? "0"));
  return `Rs. ${Number.isFinite(n) ? Math.round(n).toLocaleString("en-PK") : "0"}`;
}

function parseUnitPrice(value: unknown): number {
  const matches = String(value ?? "").match(/\d[\d,]*(?:\.\d+)?/g);
  if (!matches?.length) return 0;
  const n = Number.parseFloat(matches[matches.length - 1]!.replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  if (n >= 50000 && Number.isInteger(n) && n % 100 === 0) return n / 100;
  return n;
}

function extractUrduFromText(...parts: string[]): string {
  for (const p of parts) {
    const tokens = String(p ?? "").split(/[\s,|]+/).filter((t) => URDU_RE.test(t));
    if (tokens.length) return tokens.join(" ");
  }
  return "";
}

function romanKeywordsForProduct(title: string, tags: string): string[] {
  const blob = normalizeText(`${title} ${tags}`);
  const out = new Set<string>();
  for (const [root, syns] of Object.entries(WA_PRODUCT_ALIASES)) {
    if (!/[a-z]/i.test(root)) continue;
    if (blob.includes(root)) {
      out.add(root);
      for (const s of syns) {
        if (/[a-z]/i.test(s)) out.add(normalizeText(s));
      }
    }
  }
  for (const token of blob.split(/\s+/)) {
    if (token.length >= 3 && WA_PRODUCT_ALIASES[token]) {
      out.add(token);
      for (const s of WA_PRODUCT_ALIASES[token]) {
        if (/[a-z]/i.test(s)) out.add(normalizeText(s));
      }
    }
  }
  return [...out].filter((k) => k.length >= 2).slice(0, 24);
}

function keywordsForProduct(title: string, tags: string, handle: string): string[] {
  const keys = new Set<string>();
  const titleNorm = normalizeText(title);
  if (titleNorm) keys.add(titleNorm);
  for (const t of titleNorm.split(/\s+/)) if (t.length >= 2) keys.add(t);
  if (handle) {
    keys.add(normalizeText(handle.replace(/-/g, " ")));
    for (const t of handle.split("-")) if (t.length >= 2) keys.add(normalizeText(t));
  }
  for (const tag of String(tags ?? "").split(",").map((t) => t.trim()).filter(Boolean)) {
    keys.add(normalizeText(tag));
    for (const syn of WA_PRODUCT_ALIASES[normalizeText(tag)] ?? []) keys.add(normalizeText(syn));
  }
  for (const [root, syns] of Object.entries(WA_PRODUCT_ALIASES)) {
    if (titleNorm.includes(root) || normalizeText(tags).includes(root)) {
      keys.add(root);
      for (const s of syns) keys.add(normalizeText(s));
    }
  }
  const catId = resolveCanonicalCategoryId(title) ?? resolveCanonicalCategoryId(tags);
  if (catId) keys.add(catId);
  return [...keys].filter((k) => k.length >= 1).slice(0, 40);
}

export function buildProductSearchMeta(row: {
  shopifyProductId: string;
  title: string;
  tags?: string | null;
  handle?: string | null;
  price?: unknown;
  variants?: unknown;
  inventoryQuantity?: number | null;
  collections?: unknown;
}): ProductSearchMeta {
  const variantsArr = Array.isArray(row.variants) ? row.variants : [];
  const variantTitles = variantsArr
    .map((v: { title?: string }) => String(v?.title ?? "").trim())
    .filter((t) => t && !/^default title$/i.test(t))
    .slice(0, 12);

  let cheapest = parseUnitPrice(row.price);
  for (const v of variantsArr as Array<{ price?: unknown }>) {
    const p = parseUnitPrice(v?.price);
    if (p > 0 && (cheapest === 0 || p < cheapest)) cheapest = p;
  }

  const collections = Array.isArray(row.collections) ? row.collections : [];
  const category =
    (collections[0] as { title?: string })?.title ??
    resolveCanonicalCategoryId(row.title) ??
    "";

  const tags = String(row.tags ?? "");
  const urduFromTags = extractUrduFromText(tags, row.title);
  const urduFromAliases = Object.keys(WA_PRODUCT_ALIASES).filter((k) => URDU_RE.test(k) && normalizeText(`${row.title} ${tags}`).includes(normalizeText(k)));

  const inStock =
    (row.inventoryQuantity ?? 0) > 0 ||
    variantsArr.some((v: { inventoryQuantity?: number }) => (v?.inventoryQuantity ?? 0) > 0);

  return {
    id: row.shopifyProductId,
    name: row.title,
    urdu_name: urduFromTags || urduFromAliases.join(" ") || "",
    roman_keywords: romanKeywordsForProduct(row.title, tags),
    keywords: keywordsForProduct(row.title, tags, row.handle ?? ""),
    price: cheapest > 0 ? formatRupees(cheapest) : formatRupees(row.price),
    variants: variantTitles,
    category: String(category),
    stock: inStock ? "in_stock" : "out_of_stock",
  };
}

export function buildSearchDocument(meta: ProductSearchMeta): string {
  return [
    meta.name,
    meta.urdu_name,
    meta.category,
    meta.roman_keywords.join(" "),
    meta.keywords.join(" "),
    meta.variants.join(" "),
    meta.price,
    meta.stock,
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 6000);
}
