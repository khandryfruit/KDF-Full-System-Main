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

/** Must appear in product title/tags — blocks badam-giri / shell-only false walnut hits */
export const CATEGORY_PRIMARY_TOKENS: Record<string, RegExp> = {
  almonds: /\b(almond|almonds|badam|بادام|mamra|kagzi|kaghzi|kagazi|gurbandi|girdi)\b/i,
  pistachio: /\b(pista|pistachio|pistachios|پستہ|پستے)\b/i,
  cashew: /\b(kaju|cashew|cashews|کاجو)\b/i,
  walnut: /\b(walnut|walnuts|akhrot|اخروٹ)\b/i,
  dates: /\b(khajoor|dates|date|کھجور|ajwa|mazafati|sukkari|kalmi|amber)\b/i,
  raisins: /\b(kishmish|raisin|raisins|munakka|کشمش)\b/i,
  figs: /\b(anjeer|fig|figs|انجیر)\b/i,
  peanuts: /\b(peanut|peanuts|mungphali|مونگ)\b/i,
  hazelnut: /\b(hazelnut|hazelnuts|filbert)\b/i,
  berries: /\b(goji|cranberry|blueberry|strawberry|berry|berries)\b/i,
  goji: /\b(goji|گوجی)\b/i,
  cranberry: /\b(cranberr(?:y|ies)|کرین)\b/i,
  blueberry: /\b(blueberr(?:y|ies)|بلیو)\b/i,
  mango: /\b(mango|آم)\b/i,
  kiwi: /\b(kiwi)\b/i,
};

/** When customer asks for one berry, block other berries in results */
const SPECIFIC_PRODUCT_EXCLUDES: Record<string, RegExp> = {
  goji: /\b(cranberr|blueberr|strawberr)\b/i,
  cranberry: /\b(goji|blueberr|strawberr)\b/i,
  blueberry: /\b(goji|cranberr|strawberr)\b/i,
  strawberry: /\b(goji|cranberr|blueberr)\b/i,
  pista: /\b(almond|badam|cashew|kaju|walnut|akhrot|cranberr|goji)\b/i,
  badam: /\b(pista|pistachio|kaju|cashew|walnut|akhrot|goji|cranberr)\b/i,
  kaju: /\b(almond|badam|pista|pistachio|walnut|akhrot)\b/i,
  akhrot: /\b(almond|badam|pista|pistachio|kaju|cashew)\b/i,
};

export function productExcludedForSpecificQuery(
  title: string,
  tags: unknown,
  description: unknown,
  specificKey: string,
): boolean {
  const exclude = SPECIFIC_PRODUCT_EXCLUDES[specificKey];
  if (!exclude) return false;
  const blob = `${title} ${Array.isArray(tags) ? tags.join(" ") : tags ?? ""} ${description ?? ""}`;
  return exclude.test(blob);
}

export function productMatchesSpecificKey(
  title: string,
  tags: unknown,
  description: unknown,
  specificKey: string,
): boolean {
  const primary = CATEGORY_PRIMARY_TOKENS[specificKey];
  if (!primary) return true;
  const blob = `${title} ${Array.isArray(tags) ? tags.join(" ") : tags ?? ""} ${description ?? ""}`;
  return primary.test(blob);
}

export function productMatchesCategoryPrimary(
  title: string,
  tags: unknown,
  description: unknown,
  categoryId: string,
): boolean {
  const primary = CATEGORY_PRIMARY_TOKENS[categoryId];
  if (!primary) return true;
  const blob = `${title} ${Array.isArray(tags) ? tags.join(" ") : tags ?? ""} ${description ?? ""}`;
  if (!primary.test(blob)) return false;
  const cat = categoryId === "almonds" ? "almonds" : categoryId;
  const families = categoryId === "almonds"
    ? ["almond", "almonds", "badam", "بادام"]
    : productRootTermsFromQuery(categoryId);
  return productBelongsToFamilies(title, tags, description, families.length ? families : [categoryId]);
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
