/**
 * Canonical query → category mapping + strict product listing for WhatsApp chat.
 * Fixes badam/almond/بادام returning empty or wrong products.
 */
import type { ShopifyCatalogProduct } from "./shopifyProductKnowledge.js";
import { loadAllCatalogProducts } from "./shopifyProductKnowledge.js";
import { productBelongsToFamilies, productMatchesCategoryPrimary } from "./catalogProductMatcher.js";
import { productRootTermsFromQuery } from "./shopifyProductSearch.js";
import { WA_SALES_CATEGORIES, getCategoryById, type WaSalesCategory } from "./waCategoryDefinitions.js";

async function buildFullCatalogIndex() {
  const { buildFullCatalogIndex: build } = await import("./waSalesAgent.js");
  return build();
}

function normalizeQuery(q: string): string {
  return String(q ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every customer keyword → canonical category id in WA_SALES_CATEGORIES */
export const QUERY_TO_CATEGORY_ID: Record<string, string> = {
  badam: "almonds",
  almond: "almonds",
  almonds: "almonds",
  بادام: "almonds",
  mamra: "almonds",
  kagzi: "almonds",
  kagazi: "almonds",
  gurbandi: "almonds",
  desi: "almonds",
  pista: "pistachio",
  pistachio: "pistachio",
  pistachios: "pistachio",
  pistay: "pistachio",
  پستہ: "pistachio",
  پستے: "pistachio",
  kaju: "cashew",
  cashew: "cashew",
  cashews: "cashew",
  کاجو: "cashew",
  akhrot: "walnut",
  walnut: "walnut",
  walnuts: "walnut",
  اخروٹ: "walnut",
  khajoor: "dates",
  dates: "dates",
  date: "dates",
  کھجور: "dates",
  ajwa: "dates",
  mazafati: "dates",
  sukkari: "dates",
  kalmi: "dates",
  anjeer: "figs",
  fig: "figs",
  figs: "figs",
  kishmish: "raisins",
  raisin: "raisins",
  raisins: "raisins",
  کشمش: "raisins",
  hazelnut: "hazelnut",
  hazelnuts: "hazelnut",
  goji: "berries",
  "goji berry": "berries",
  gogi: "berries",
  cranberry: "berries",
  blueberry: "berries",
  mango: "berries",
  kiwi: "berries",
  peanut: "peanuts",
  peanuts: "peanuts",
  chilgoza: "pine",
  makhana: "makhana",
  honey: "honey",
  shahad: "honey",
};

export function resolveCanonicalCategoryId(query: string): string | null {
  const q = normalizeQuery(query);
  if (!q) return null;

  if (QUERY_TO_CATEGORY_ID[q]) return QUERY_TO_CATEGORY_ID[q];

  for (const [key, catId] of Object.entries(QUERY_TO_CATEGORY_ID)) {
    if (key.length >= 3 && (q === key || q.includes(key) || key.includes(q))) {
      return catId;
    }
  }

  const roots = productRootTermsFromQuery(query);
  for (const root of roots) {
    if (QUERY_TO_CATEGORY_ID[root]) return QUERY_TO_CATEGORY_ID[root];
    for (const cat of WA_SALES_CATEGORIES) {
      if (cat.families.includes(root)) return cat.id;
    }
  }

  for (const cat of WA_SALES_CATEGORIES) {
    if (cat.families.some((f) => f.length >= 3 && q.includes(f))) return cat.id;
  }

  return null;
}

export { getCategoryById } from "./waCategoryDefinitions.js";

/** Strict almond-only (etc.) list from full 316+ product index */
export async function listProductsForCustomerQuery(query: string): Promise<{
  category: WaSalesCategory | null;
  products: ShopifyCatalogProduct[];
  roots: string[];
  categoryId: string | null;
}> {
  const q = String(query ?? "").trim();
  const roots = productRootTermsFromQuery(q);
  const categoryId = resolveCanonicalCategoryId(q);

  if (!categoryId) {
    return { category: null, products: [], roots, categoryId: null };
  }

  const category = getCategoryById(categoryId);
  if (!category) {
    return { category: null, products: [], roots, categoryId };
  }

  const index = await buildFullCatalogIndex();
  let products = [...(index.grouped.get(categoryId) ?? [])];

  products = products.filter((p) =>
    productMatchesCategoryPrimary(p.name, p.tags, p.description, categoryId),
  );

  if (!products.length) {
    const all = await loadAllCatalogProducts();
    products = all.filter((p) =>
      productMatchesCategoryPrimary(p.name, p.tags, p.description, categoryId),
    );
  }

  products.sort((a, b) => a.name.localeCompare(b.name));

  return { category, products, roots, categoryId };
}

export async function getCatalogIndexProof(): Promise<{
  totalActiveProducts: number;
  totalVariants: number;
  totalAliasRows: number;
  indexedProductIds: number;
  categorizedProducts: number;
  uncategorizedProducts: number;
  categories: Array<{ id: string; labelEn: string; labelUr: string; count: number }>;
  almondCategoryCount: number;
  sampleAlmondProducts: string[];
}> {
  const index = await buildFullCatalogIndex();
  const all = await loadAllCatalogProducts();
  let totalVariants = 0;
  for (const p of all) {
    totalVariants += p.variantOptions?.length ?? 0;
  }

  const { getShopifyCatalogStats } = await import("./shopifyProductKnowledge.js");
  const stats = await getShopifyCatalogStats();

  const categories = WA_SALES_CATEGORIES.map((cat) => ({
    id: cat.id,
    labelEn: cat.labelEn,
    labelUr: cat.labelUr,
    count: index.grouped.get(cat.id)?.length ?? 0,
  })).filter((c) => c.count > 0);

  const almondCat = getCategoryById("almonds");
  const almondFamilies = almondCat?.families ?? ["almond", "badam", "بادام"];
  const almondProducts = index.grouped.get("almonds") ?? [];
  const strictAlmonds = almondProducts.filter((p) =>
    productBelongsToFamilies(p.name, p.tags, p.description, almondFamilies),
  );

  let categorized = 0;
  for (const cat of WA_SALES_CATEGORIES) {
    categorized += index.grouped.get(cat.id)?.length ?? 0;
  }

  return {
    totalActiveProducts: index.total,
    totalVariants,
    totalAliasRows: stats.aliasRows,
    indexedProductIds: stats.indexedProducts,
    categorizedProducts: categorized,
    uncategorizedProducts: index.uncategorized.length,
    categories,
    almondCategoryCount: strictAlmonds.length,
    sampleAlmondProducts: strictAlmonds.slice(0, 8).map((p) => p.name),
  };
}
