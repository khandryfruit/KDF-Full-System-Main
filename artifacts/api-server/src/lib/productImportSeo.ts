import { generateSlugFromName } from "./slugify.js";
import type { CatalogRow } from "./unifiedProductImport.js";

const BRAND_SITE = "Khan Dry Fruits";

export type ProductSeoFields = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  focusKeywords: string[];
  altText: string;
};

/** Build SEO fields for an imported catalog row. */
export function buildProductSeo(row: CatalogRow, uniqueSlug?: string): ProductSeoFields {
  const slug = uniqueSlug ?? generateSlugFromName(row.productName);
  const categoryPart = row.subcategory
    ? `${row.subcategory} · ${row.category}`
    : row.category;
  const brandPart = row.brand || BRAND_SITE;

  const focusKeywords = [
    row.productName,
    row.brand,
    row.category,
    row.subcategory,
    row.unit ? `${row.productName} ${row.unit}` : "",
    categoryPart,
    "dry fruits Pakistan",
    "online delivery Lahore",
  ]
    .map((k) => k?.trim())
    .filter(Boolean)
    .filter((k, i, arr) => arr.findIndex((x) => x.toLowerCase() === k.toLowerCase()) === i)
    .slice(0, 8);

  const metaTitle = truncate(
    row.brand
      ? `${row.productName} — ${row.brand} | ${BRAND_SITE}`
      : `${row.productName} | ${BRAND_SITE}`,
    60,
  );

  const metaDescription = truncate(
    row.description?.replace(/\s+/g, " ").trim() ||
      `Buy ${row.productName}${categoryPart ? ` (${categoryPart})` : ""} online at ${BRAND_SITE}. ` +
        `Fresh quality, fast delivery${row.salePrice ? ` from Rs. ${Math.round(row.salePrice)}` : ""}.`,
    160,
  );

  const altText = truncate(
    `${row.productName}${row.brand ? ` by ${row.brand}` : ""} — ${BRAND_SITE}`,
    125,
  );

  return { slug, metaTitle, metaDescription, focusKeywords, altText };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

/** Encode focus keywords in product tags (no separate DB column). */
export function tagsWithSeoKeywords(baseTags: string[], focusKeywords: string[]): string[] {
  const kwTags = focusKeywords.map((k) => `kw:${k.toLowerCase().replace(/\s+/g, "-")}`);
  const merged = [...baseTags, ...kwTags];
  return merged.filter((t, i) => merged.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
}
