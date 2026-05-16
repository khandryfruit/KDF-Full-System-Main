/**
 * Strict product-family matching for Shopify catalog search.
 * Ensures "almonds" / "بادام" never returns sunflower, dates, etc.
 */
import { WA_PRODUCT_ALIASES, productRootTermsFromQuery } from "./shopifyProductSearch.js";

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Expand query roots to all searchable synonyms (EN + Urdu + Roman) */
export function expandFamilyTerms(roots: string[]): string[] {
  const out = new Set<string>();
  for (const root of roots) {
    const r = normalizeText(root);
    if (r.length >= 2) out.add(r);
    for (const syn of WA_PRODUCT_ALIASES[root] ?? []) {
      const s = normalizeText(syn);
      if (s.length >= 2) out.add(s);
    }
    for (const [key, syns] of Object.entries(WA_PRODUCT_ALIASES)) {
      if (key === r || syns.some((s) => normalizeText(s) === r)) {
        out.add(normalizeText(key));
        for (const s of syns) out.add(normalizeText(s));
      }
    }
  }
  return [...out].filter((t) => t.length >= 2);
}

/** Primary product families — block cross-family contamination */
const CROSS_FAMILY_BLOCK: Record<string, RegExp> = {
  almond: /\b(sunflower|sooraj|mukhi|pumpkin|melon|til|sesame|chia|hazelnut|filbert|kaju|cashew|pistachio|pista|akhrot|walnut|khajoor|date|chuara|anjeer|fig|kishmish|raisin|peanut|mungphali)\b/i,
  almonds: /\b(sunflower|sooraj|mukhi|pumpkin|kaju|cashew|pistachio|akhrot|walnut|khajoor|date|hazelnut)\b/i,
  badam: /\b(sunflower|sooraj|mukhi|pumpkin|kaju|cashew|pistachio|akhrot|walnut|khajoor|date|hazelnut)\b/i,
  بادام: /\b(sunflower|sooraj|mukhi|kaju|cashew|pistachio|akhrot|walnut|khajoor|date)\b/i,
  pista: /\b(sunflower|sooraj|almond|badam|walnut|akhrot|kaju|cashew|khajoor|date|hazelnut|peanut)\b/i,
  pistachio: /\b(sunflower|sooraj|almond|badam|walnut|akhrot|kaju|cashew|khajoor|date|hazelnut)\b/i,
  pistachios: /\b(sunflower|sooraj|almond|badam|walnut|akhrot|kaju|cashew|khajoor|date)\b/i,
  پستہ: /\b(sunflower|sooraj|almond|badam|walnut|akhrot|kaju|cashew|khajoor|date)\b/i,
  kaju: /\b(sunflower|sooraj|almond|badam|walnut|akhrot|pistachio|pista|khajoor|date|hazelnut|peanut)\b/i,
  cashew: /\b(sunflower|sooraj|almond|badam|walnut|akhrot|pistachio|pista|khajoor|date|hazelnut)\b/i,
  cashews: /\b(sunflower|sooraj|almond|badam|walnut|akhrot|pistachio|khajoor|date)\b/i,
  کاجو: /\b(sunflower|sooraj|almond|badam|walnut|akhrot|pistachio|khajoor|date)\b/i,
  akhrot: /\b(sunflower|sooraj|almond|badam|pistachio|pista|kaju|cashew|khajoor|date|hazelnut|peanut)\b/i,
  walnut: /\b(sunflower|sooraj|almond|badam|pistachio|pista|kaju|cashew|khajoor|date|hazelnut)\b/i,
  walnuts: /\b(sunflower|sooraj|almond|badam|pistachio|kaju|cashew|khajoor|date)\b/i,
  اخروٹ: /\b(sunflower|sooraj|almond|badam|pistachio|kaju|cashew|khajoor|date)\b/i,
  khajoor: /\b(sunflower|sooraj|almond|badam|pistachio|pista|kaju|cashew|akhrot|walnut|hazelnut|peanut)\b/i,
  dates: /\b(sunflower|sooraj|almond|badam|pistachio|pista|kaju|cashew|akhrot|walnut|hazelnut)\b/i,
  date: /\b(sunflower|sooraj|almond|badam|pistachio|kaju|cashew|akhrot|walnut|hazelnut)\b/i,
  کھجور: /\b(sunflower|sooraj|almond|badam|pistachio|kaju|cashew|akhrot|walnut)\b/i,
};

export function resolveQueryFamilies(query: string): string[] {
  return productRootTermsFromQuery(query);
}

/** True if product title/tags belong to the queried product family */
export function productBelongsToFamilies(
  title: string,
  tags: unknown,
  description: unknown,
  families: string[],
): boolean {
  if (!families.length) return true;

  const blob = normalizeText(
    `${title} ${Array.isArray(tags) ? tags.join(" ") : tags ?? ""} ${description ?? ""}`,
  );
  const terms = expandFamilyTerms(families);

  const hasFamily = terms.some((t) => {
    if (t.length >= 3) return blob.includes(t);
    if (t.length === 2 && /[\u0600-\u06FF]/.test(t)) return blob.includes(t);
    return false;
  });
  if (!hasFamily) return false;

  for (const family of families) {
    const block = CROSS_FAMILY_BLOCK[family];
    if (block && block.test(blob)) return false;
  }

  return true;
}

export function primaryFamilyLabel(families: string[]): string {
  const f = families[0] ?? "";
  const labels: Record<string, string> = {
    almond: "Almond / Badam",
    almonds: "Almond / Badam",
    badam: "Badam / Almond",
    بادام: "بادام / Badam",
    pista: "Pista / Pistachio",
    pistachio: "Pistachio / Pista",
    pistachios: "Pistachio / Pista",
    پستہ: "پستہ / Pista",
    kaju: "Kaju / Cashew",
    cashew: "Cashew / Kaju",
    cashews: "Cashew / Kaju",
    کاجو: "کاجو / Kaju",
    akhrot: "Akhrot / Walnut",
    walnut: "Walnut / Akhrot",
    walnuts: "Walnut / Akhrot",
    اخروٹ: "اخروٹ / Akhrot",
    khajoor: "Khajoor / Dates",
    dates: "Dates / Khajoor",
    date: "Dates / Khajoor",
    کھجور: "کھجور / Dates",
  };
  return labels[f] ?? f;
}
