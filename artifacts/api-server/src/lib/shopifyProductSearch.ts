import { db, shopifyProductAliasesTable, shopifyProductsTable } from "@workspace/db";
import { eq, and, inArray, sql, ilike, or } from "drizzle-orm";
import { logger } from "./logger.js";

/** Roman Urdu / English / Urdu script roots → search synonyms */
export const WA_PRODUCT_ALIASES: Record<string, string[]> = {
  badam: ["almond", "almonds", "بادام"],
  almond: ["badam", "almonds", "بادام"],
  almonds: ["badam", "almond", "بادام"],
  بادام: ["badam", "almond", "almonds"],
  pista: ["pistachio", "pistachios", "pistay", "پستہ", "پستے"],
  pistachio: ["pista", "pistachios", "پستہ"],
  pistachios: ["pista", "pistachio", "پستہ"],
  kaju: ["cashew", "cashews", "کاجو"],
  cashew: ["kaju", "cashews", "کاجو"],
  cashews: ["kaju", "cashew", "کاجو"],
  کاجو: ["kaju", "cashew", "cashews"],
  akhrot: ["walnut", "walnuts", "اخروٹ"],
  walnut: ["akhrot", "walnuts", "اخروٹ"],
  walnuts: ["akhrot", "walnut", "اخروٹ"],
  اخروٹ: ["akhrot", "walnut", "walnuts"],
  kaghzi: ["kaghazi", "paper shell", "soft shell"],
  kaghazi: ["kaghzi", "paper shell", "soft shell"],
  khajoor: ["dates", "date", "کھجور"],
  dates: ["khajoor", "کھجور"],
  anjeer: ["fig", "figs", "انجیر"],
  kishmish: ["raisin", "raisins", "کشمش"],
  munakka: ["raisin", "raisins"],
  chilgoza: ["pine nut", "pine nuts"],
  makhana: ["foxnut", "fox nuts"],
  peanut: ["peanuts", "mungphali", "مونگ پھلی"],
  peanuts: ["peanut", "mungphali"],
};

const PRODUCT_ROOT_WORDS = new Set([
  ...Object.keys(WA_PRODUCT_ALIASES),
  "khajoor", "dates", "anjeer", "fig", "figs", "kishmish", "raisin", "raisins", "munakka", "makhana",
  "peanut", "peanuts", "chilgoza", "dry fruit", "dry fruits",
]);

function normalizeAliasText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForAliases(text: string): string[] {
  const n = normalizeAliasText(text);
  if (!n) return [];
  const tokens = new Set<string>([n]);
  for (const part of n.split(/\s+/)) {
    if (part.length > 1) tokens.add(part);
  }
  return [...tokens];
}

export function expandWaProductSearchTerms(query: string): string[] {
  const q = normalizeAliasText(query);
  const terms = new Set<string>();
  if (q) terms.add(q);
  for (const token of q.split(/\s+/)) {
    if (token.length < 2) continue;
    terms.add(token);
    for (const alias of WA_PRODUCT_ALIASES[token] ?? []) {
      terms.add(normalizeAliasText(alias));
    }
  }
  return [...terms].filter((t) => t.length > 1);
}

export async function rebuildShopifyProductAliases(opts?: { shopifyProductId?: string }): Promise<{ indexed: number; aliases: number }> {
  const where = opts?.shopifyProductId
    ? eq(shopifyProductsTable.shopifyProductId, opts.shopifyProductId)
    : eq(shopifyProductsTable.status, "active");

  const products = await db
    .select({
      shopifyProductId: shopifyProductsTable.shopifyProductId,
      title: shopifyProductsTable.title,
      tags: shopifyProductsTable.tags,
      handle: shopifyProductsTable.handle,
      variants: shopifyProductsTable.variants,
    })
    .from(shopifyProductsTable)
    .where(where)
    .catch(() => []);

  if (!products.length) return { indexed: 0, aliases: 0 };

  if (opts?.shopifyProductId) {
    await db.delete(shopifyProductAliasesTable).where(eq(shopifyProductAliasesTable.shopifyProductId, opts.shopifyProductId)).catch(() => {});
  } else {
    await db.delete(shopifyProductAliasesTable).catch(() => {});
  }

  const rows: Array<{ shopifyProductId: string; alias: string; aliasType: string; locale: string }> = [];
  const seen = new Set<string>();

  const pushAlias = (productId: string, alias: string, aliasType: string, locale = "any") => {
    const a = normalizeAliasText(alias);
    if (!a || a.length < 2) return;
    const key = `${productId}::${a}::${locale}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ shopifyProductId: productId, alias: a, aliasType, locale });
  };

  for (const p of products) {
    const id = p.shopifyProductId;
    pushAlias(id, p.title, "title");
    for (const token of tokenizeForAliases(p.title)) pushAlias(id, token, "title_token");
    if (p.handle) {
      pushAlias(id, p.handle.replace(/-/g, " "), "handle");
      for (const token of p.handle.split("-")) pushAlias(id, token, "handle_token");
    }
    if (p.tags) {
      for (const tag of String(p.tags).split(",").map((t) => t.trim()).filter(Boolean)) {
        pushAlias(id, tag, "tag");
        for (const token of tokenizeForAliases(tag)) pushAlias(id, token, "tag_token");
      }
    }
    const titleNorm = normalizeAliasText(p.title);
    for (const [root, synonyms] of Object.entries(WA_PRODUCT_ALIASES)) {
      if (titleNorm.includes(root) || (p.tags && normalizeAliasText(p.tags).includes(root))) {
        pushAlias(id, root, "synonym_root");
        for (const syn of synonyms) pushAlias(id, syn, "synonym");
      }
    }
    const variants = Array.isArray(p.variants) ? p.variants : [];
    for (const v of variants as Array<{ title?: string }>) {
      const vt = String(v?.title ?? "").trim();
      if (!vt || /^default title$/i.test(vt)) continue;
      pushAlias(id, vt, "variant");
      for (const token of tokenizeForAliases(vt)) pushAlias(id, token, "variant_token");
    }
  }

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await db.insert(shopifyProductAliasesTable).values(chunk).onConflictDoNothing().catch((err) => {
      logger.warn({ err }, "shopify_product_aliases batch insert failed (table may need migration)");
    });
  }

  return { indexed: products.length, aliases: rows.length };
}

export async function searchShopifyProductIdsByAlias(query: string, limit = 12): Promise<string[]> {
  const terms = expandWaProductSearchTerms(query);
  if (!terms.length) return [];

  const ids = new Set<string>();
  try {
    const aliasRows = await db
      .select({ shopifyProductId: shopifyProductAliasesTable.shopifyProductId })
      .from(shopifyProductAliasesTable)
      .where(or(...terms.map((term) => ilike(shopifyProductAliasesTable.alias, `%${term}%`))))
      .limit(limit * 3);
    for (const row of aliasRows) ids.add(row.shopifyProductId);
  } catch {
    /* table may not exist yet */
  }

  if (ids.size < limit) {
    const titleRows = await db
      .select({ shopifyProductId: shopifyProductsTable.shopifyProductId })
      .from(shopifyProductsTable)
      .where(and(
        eq(shopifyProductsTable.status, "active"),
        or(...terms.map((term) => ilike(shopifyProductsTable.title, `%${term}%`))),
      ))
      .limit(limit * 2)
      .catch(() => []);
    for (const row of titleRows) ids.add(row.shopifyProductId);
  }

  return [...ids].slice(0, limit);
}

export async function fetchShopifyProductsByIds(productIds: string[]) {
  if (!productIds.length) return [];
  return db
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
      collections: shopifyProductsTable.collections,
      tags: shopifyProductsTable.tags,
    })
    .from(shopifyProductsTable)
    .where(and(
      eq(shopifyProductsTable.status, "active"),
      inArray(shopifyProductsTable.shopifyProductId, productIds),
    ))
    .catch(() => []);
}

export function productRootTermsFromQuery(query: string): string[] {
  const q = normalizeAliasText(query);
  const roots = new Set<string>();
  for (const token of q.split(/\s+/)) {
    if (PRODUCT_ROOT_WORDS.has(token)) {
      roots.add(token);
      for (const alias of WA_PRODUCT_ALIASES[token] ?? []) roots.add(normalizeAliasText(alias));
    }
  }
  return [...roots];
}
