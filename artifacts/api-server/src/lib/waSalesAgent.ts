/**
 * Premium WhatsApp sales agent — category browse → product → variant → order.
 * All data from synced Shopify catalog only.
 */
import {
  loadAllCatalogProducts,
  searchShopifyCatalog,
  toWhatsAppCatalogProducts,
  type ShopifyCatalogProduct,
} from "./shopifyProductKnowledge.js";
import { productBelongsToFamilies, primaryFamilyLabel, resolveQueryFamilies } from "./catalogProductMatcher.js";
import { productRootTermsFromQuery } from "./shopifyProductSearch.js";

export type WaSalesCategory = {
  id: string;
  emoji: string;
  labelEn: string;
  labelUr: string;
  /** Roots used for family matching */
  families: string[];
};

export const WA_SALES_CATEGORIES: WaSalesCategory[] = [
  { id: "almonds", emoji: "🥜", labelEn: "Almonds", labelUr: "بادام", families: ["almond", "almonds", "badam", "بادام"] },
  { id: "pistachio", emoji: "🌰", labelEn: "Pistachio", labelUr: "پستہ", families: ["pista", "pistachio", "pistachios", "پستہ", "پستے"] },
  { id: "cashew", emoji: "🌰", labelEn: "Cashew", labelUr: "کاجو", families: ["kaju", "cashew", "cashews", "کاجو"] },
  { id: "walnut", emoji: "🌰", labelEn: "Walnuts", labelUr: "اخروٹ", families: ["akhrot", "walnut", "walnuts", "اخروٹ"] },
  { id: "dates", emoji: "🌴", labelEn: "Dates", labelUr: "کھجور", families: ["khajoor", "dates", "date", "کھجور", "chuara"] },
  { id: "berries", emoji: "🍇", labelEn: "Berries", labelUr: "بیریز", families: ["berry", "berries", "goji", "cranberry", "blueberry", "strawberry"] },
  { id: "raisins", emoji: "🍇", labelEn: "Raisins", labelUr: "کشمش", families: ["kishmish", "raisin", "raisins", "munakka", "کشمش"] },
  { id: "figs", emoji: "🫐", labelEn: "Figs", labelUr: "انجیر", families: ["anjeer", "fig", "figs", "انجیر"] },
  { id: "peanuts", emoji: "🥜", labelEn: "Peanuts", labelUr: "مونگ پھلی", families: ["peanut", "peanuts", "mungphali"] },
  { id: "seeds", emoji: "🌻", labelEn: "Seeds", labelUr: "بیج", families: ["sunflower", "pumpkin", "chia", "sesame", "til", "melon", "flax"] },
  { id: "pine", emoji: "🌲", labelEn: "Chilgoza", labelUr: "چلغوزہ", families: ["chilgoza", "pine nut", "pine nuts"] },
  { id: "makhana", emoji: "🪷", labelEn: "Makhana", labelUr: "مکھانہ", families: ["makhana", "foxnut"] },
  { id: "honey", emoji: "🍯", labelEn: "Honey", labelUr: "شہد", families: ["honey", "shahad", "شہد"] },
  { id: "oils", emoji: "🫒", labelEn: "Oils & Butters", labelUr: "آئل", families: ["oil", "butter", "paste"] },
  { id: "mixed", emoji: "🎁", labelEn: "Mixed & Gift Packs", labelUr: "مکس / گفٹ", families: ["mix", "mixed", "combo", "hamper", "gift", "pack"] },
  { id: "spices", emoji: "🌶️", labelEn: "Spices", labelUr: "مصالحہ", families: ["spice", "spices", "masala", "cumin", "zeera", "haldi", "turmeric"] },
  { id: "tea", emoji: "🍵", labelEn: "Tea & Herbs", labelUr: "چائے", families: ["tea", "chai", "herb", "herbal", "green tea"] },
  { id: "chocolate", emoji: "🍫", labelEn: "Chocolate & Sweets", labelUr: "چاکلیٹ", families: ["chocolate", "cocoa", "sweet", "candy"] },
  { id: "coconut", emoji: "🥥", labelEn: "Coconut", labelUr: "ناریل", families: ["coconut", "narial", "nariel"] },
];

function formatRupees(value: unknown): string {
  const n = Number.parseFloat(String(value ?? "0"));
  return `Rs. ${Number.isFinite(n) ? Math.round(n).toLocaleString("en-PK") : "0"}`;
}

export function isRomanUrduSales(text: string): boolean {
  return /[a-z]/i.test(text) && !/[اآبپتٹثجچحخدڈذرڑزژسشصضطظعغفقکگلمنوہھیے]/.test(text);
}

/** Map customer query to a sales category */
export function resolveSalesCategoryFromQuery(query: string): WaSalesCategory | null {
  const roots = resolveQueryFamilies(query);
  if (!roots.length) return null;

  for (const cat of WA_SALES_CATEGORIES) {
    if (roots.some((r) => cat.families.some((f) => f === r || r.includes(f) || f.includes(r)))) {
      return cat;
    }
    if (cat.families.some((f) => roots.includes(f))) return cat;
  }

  const primary = roots[0]!;
  return {
    id: primary,
    emoji: "🥜",
    labelEn: primaryFamilyLabel(roots),
    labelUr: primaryFamilyLabel(roots),
    families: roots,
  };
}

export function classifyProductCategory(
  title: string,
  tags?: unknown,
  description?: unknown,
): WaSalesCategory | null {
  for (const cat of WA_SALES_CATEGORIES) {
    if (productBelongsToFamilies(title, tags, description, cat.families)) {
      return cat;
    }
  }
  return null;
}

const CATEGORY_PAGE_SIZE = 25;

let catalogIndexCache: {
  at: number;
  grouped: Map<string, ShopifyCatalogProduct[]>;
  uncategorized: ShopifyCatalogProduct[];
  total: number;
} | null = null;

const INDEX_TTL_MS = 60_000;

/** Build in-memory index of ALL active products by sales category */
export async function buildFullCatalogIndex(): Promise<{
  grouped: Map<string, ShopifyCatalogProduct[]>;
  uncategorized: ShopifyCatalogProduct[];
  total: number;
}> {
  const now = Date.now();
  if (catalogIndexCache && now - catalogIndexCache.at < INDEX_TTL_MS) {
    return catalogIndexCache;
  }

  const all = await loadAllCatalogProducts();
  const grouped = new Map<string, ShopifyCatalogProduct[]>();
  const uncategorized: ShopifyCatalogProduct[] = [];

  for (const cat of WA_SALES_CATEGORIES) grouped.set(cat.id, []);

  for (const product of all) {
    const cat = classifyProductCategory(product.name, product.tags, product.description);
    if (cat) {
      const list = grouped.get(cat.id) ?? [];
      list.push(product);
      grouped.set(cat.id, list);
    } else {
      uncategorized.push(product);
    }
  }

  for (const [id, list] of grouped) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    grouped.set(id, list);
  }
  uncategorized.sort((a, b) => a.name.localeCompare(b.name));

  catalogIndexCache = { at: now, grouped, uncategorized, total: all.length };
  return catalogIndexCache;
}

export function invalidateFullCatalogIndex(): void {
  catalogIndexCache = null;
}

/** Every product in a category from full DB (not search-limited) */
export async function listProductsByCategoryId(categoryId: string): Promise<{
  category: WaSalesCategory | null;
  products: ShopifyCatalogProduct[];
}> {
  const index = await buildFullCatalogIndex();
  if (categoryId === "other" || categoryId === "uncategorized") {
    return { category: null, products: index.uncategorized };
  }
  const category = WA_SALES_CATEGORIES.find((c) => c.id === categoryId) ?? null;
  const products = index.grouped.get(categoryId) ?? [];
  return { category, products };
}

export async function getCategorySummaries(): Promise<Array<{
  category: WaSalesCategory;
  count: number;
}>> {
  const index = await buildFullCatalogIndex();
  const out: Array<{ category: WaSalesCategory; count: number }> = [];
  for (const cat of WA_SALES_CATEGORIES) {
    const count = index.grouped.get(cat.id)?.length ?? 0;
    if (count > 0) out.push({ category: cat, count });
  }
  if (index.uncategorized.length > 0) {
    out.push({
      category: {
        id: "other",
        emoji: "📦",
        labelEn: "More Products",
        labelUr: "دیگر Products",
        families: [],
      },
      count: index.uncategorized.length,
    });
  }
  return out;
}

/** Search catalog for a category — uses full index when family match */
export async function searchCategoryProducts(query: string, limit = 80): Promise<{
  category: WaSalesCategory | null;
  products: ShopifyCatalogProduct[];
  query: string;
  roots: string[];
}> {
  const q = String(query ?? "").trim();
  const roots = productRootTermsFromQuery(q);
  const category = resolveSalesCategoryFromQuery(q);

  if (category) {
    const { products: allInCat } = await listProductsByCategoryId(category.id);
    if (allInCat.length > 0) {
      return { category, products: allInCat.slice(0, limit), query: q, roots };
    }
  }

  const products = await searchShopifyCatalog(q, Math.min(limit, 50));
  return { category, products, query: q, roots };
}

export function isFullCatalogBrowseMessage(text: string): boolean {
  const t = String(text ?? "")
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;
  const exact = new Set([
    "products", "product", "catalog", "catalogue", "menu", "shop", "list",
    "all products", "full catalog", "full list", "price list", "rate list",
    "sari products", "saari products", "tamam products", "sab products",
    "sare products", "all items", "show products", "show all",
    "products list", "product list", "kya kya hai", "kya kya milta hai",
    "تمام products", "ساری products", "تمام پروڈکٹس", "ساری پروڈکٹس",
    "catalog dikhao", "products dikhao", "list dikhao",
  ]);
  if (exact.has(t)) return true;
  return /\b(sari|saari|tamam|sab|sare|all)\s+(product|products|item|items|cheez|cheezen)\b/i.test(t)
    || /\b(product|products)\s+(list|catalog|menu|dikhao|batao|bata do)\b/i.test(t)
    || /\b(shop|catalog)\s+(menu|list)\b/i.test(t);
}

export function isCatalogNextPageMessage(text: string): boolean {
  const t = String(text ?? "").trim().toLowerCase();
  return /^(next|more|agay|aage|aur|continue|next page|agla|مزید|اگلے|اگلا)$/i.test(t);
}

/** Master menu: all categories covering 313+ products */
export async function formatMasterCatalogMenuReply(roman: boolean): Promise<string> {
  const index = await buildFullCatalogIndex();
  const summaries = await getCategorySummaries();
  const lines = summaries.map((s, i) =>
    `${i + 1}️⃣ ${s.category.emoji} ${roman ? s.category.labelEn : s.category.labelUr} (${s.count})`,
  );

  if (roman) {
    return `Ji 😊 Khan Dry Fruits — *${index.total} products* Shopify catalog se live hain ✅\n\n*Categories:*\n\n${lines.join("\n")}\n\n━━━━━━━━━━━\n\nCategory number reply karein (jaise *1* for Almonds)\nYa direct product naam: badam, pista, kaju 😊`;
  }
  return `جی 😊 Khan Dry Fruits — *${index.total} products* Shopify catalog سے live ہیں ✅\n\n*Categories:*\n\n${lines.join("\n")}\n\n━━━━━━━━━━━\n\nCategory number reply کریں (جیسے *1* بادام)\nیا direct product نام: badam، pista، kaju 😊`;
}

export function resolveCategoryFromMenuNumber(num: number, summaries: Array<{ category: WaSalesCategory }>): WaSalesCategory | null {
  if (!Number.isFinite(num) || num < 1) return null;
  return summaries[num - 1]?.category ?? null;
}

export type WaCatalogBrowseResult = {
  mode: "category" | "single";
  reply: string;
  category: WaSalesCategory | null;
  products: ShopifyCatalogProduct[];
  waProducts: ReturnType<typeof toWhatsAppCatalogProducts>;
  query: string;
  roots: string[];
  score: number;
};

/** Category product list (step 1 of sales flow) — paginated for full category */
export function formatCategoryProductListReply(opts: {
  category: WaSalesCategory | null;
  products: ShopifyCatalogProduct[];
  roman: boolean;
  page?: number;
  pageSize?: number;
  totalInCategory?: number;
}): string {
  const { category, products, roman } = opts;
  const page = Math.max(0, opts.page ?? 0);
  const pageSize = opts.pageSize ?? CATEGORY_PAGE_SIZE;
  const total = opts.totalInCategory ?? products.length;

  if (!products.length) {
    return roman
      ? "Ji 😊 is category mein abhi koi exact match nahi mila. Please product naam bhej dein (jaise: Australian badam, Irani pista)."
      : "جی 😊 اس category میں ابھی کوئی exact match نہیں ملا۔ براہ کرم product نام بھیج دیں۔";
  }

  const slice = products.slice(page * pageSize, (page + 1) * pageSize);
  const label = category
    ? (roman ? `${category.emoji} *${category.labelEn}*` : `${category.emoji} *${category.labelUr}*`)
    : (roman ? "🛒 *Available Products*" : "🛒 *دستیاب Products*");

  const startNum = page * pageSize + 1;
  const lines = slice.map((p, i) => {
    const priceHint = p.rawPrice ? ` — from ${formatRupees(p.rawPrice)}` : "";
    const stock = p.inStock ? "" : " (out of stock)";
    return `${startNum + i}️⃣ ${p.name}${priceHint}${stock}`;
  });

  const hasMore = (page + 1) * pageSize < total;
  const pageInfo = total > pageSize
    ? (roman ? `\n\n_Page ${page + 1} — showing ${startNum}–${startNum + slice.length - 1} of ${total}_` : `\n\n_Page ${page + 1} — ${total} میں سے ${startNum}–${startNum + slice.length - 1}_`)
    : "";
  const moreHint = hasMore
    ? (roman ? "\n\nReply *next* for more products in this category ➡️" : "\n\nمزید products کے لیے *next* reply کریں ➡️")
    : "";

  if (roman) {
    return `Ji 😊 yeh ${category?.labelEn ?? "products"} available hain (${total} total):\n\n${label}\n\n${lines.join("\n\n")}${pageInfo}${moreHint}\n\n━━━━━━━━━━━\n\nProduct number select karein (1, 2, 3…)`;
  }
  return `جی 😊 yeh ${category?.labelUr ?? "products"} available hain (${total} total):\n\n${label}\n\n${lines.join("\n\n")}${pageInfo}${moreHint}\n\n━━━━━━━━━━━\n\nProduct number select کریں (1، 2، 3…)`;
}

/** Variant menu after product selection (step 2) */
export function formatVariantSelectionReply(opts: {
  product: ShopifyCatalogProduct;
  roman: boolean;
}): string {
  const { product: p, roman } = opts;
  const lines = p.variantOptions.length
    ? p.variantOptions.map((v, i) => {
        const label = v.title.replace(/^default title$/i, "Standard");
        const stock = (v.inventoryQuantity ?? 0) > 0 ? "✅" : "❌";
        return `${i + 1}️⃣ ${label} — ${formatRupees(v.price)} ${stock}`;
      })
    : [`1️⃣ ${p.price}`];

  if (roman) {
    return `*${p.name}* available:\n\n${lines.join("\n")}\n\nStock: ${p.inStock ? "Available ✅" : "Limited ❌"}\n\nDelivery:\n• Lahore: Same Day\n• Pakistan: Nationwide\n\nPlease quantity/size select karein — number reply (1, 2, 3)`;
  }
  return `*${p.name}* دستیاب:\n\n${lines.join("\n")}\n\nStock: ${p.inStock ? "Available ✅" : "Limited ❌"}\n\nDelivery:\n• Lahore: Same Day\n• Pakistan: Nationwide\n\nبراہ کرم size منتخب کریں — نمبر reply (1، 2، 3)`;
}

/** Order preview before checkout (step 3) */
export function formatOrderPreviewReply(opts: {
  productName: string;
  variantTitle: string;
  unitPrice: number;
  quantity?: number;
  roman: boolean;
}): string {
  const qty = opts.quantity ?? 1;
  const total = opts.unitPrice * qty;
  const sizeLine = `${qty > 1 ? `${qty} x ` : ""}${opts.variantTitle}`;

  if (opts.roman) {
    return `*${opts.productName}*\n${sizeLine}\n\nPrice: *${formatRupees(total)}*\n\nDelivery:\n• Lahore: Same Day ✅\n• Pakistan: Nationwide Shipping\n\nKya order confirm karna chahte hain?\n\n1️⃣ Yes — confirm order\n2️⃣ No — cancel`;
  }
  return `*${opts.productName}*\n${sizeLine}\n\nPrice: *${formatRupees(total)}*\n\nDelivery:\n• Lahore: Same Day ✅\n• Pakistan: Nationwide Shipping\n\nکیا order confirm کرنا چاہتے ہیں؟\n\n1️⃣ Yes — order confirm\n2️⃣ No — cancel`;
}

export async function buildCatalogBrowseReply(opts: {
  query: string;
  textBody: string;
}): Promise<WaCatalogBrowseResult | null> {
  const { query, textBody } = opts;
  if (!query || query.length < 2) return null;

  const { category, products, roots } = await searchCategoryProducts(query, 100);
  if (!products.length) return null;

  const top = products[0]!;
  const minScore = roots.length > 0 ? 35 : 20;
  if ((top.score ?? 0) < minScore) return null;

  const roman = isRomanUrduSales(textBody);
  const waProducts = toWhatsAppCatalogProducts(products);

  return {
    mode: products.length === 1 ? "single" : "category",
    reply: formatCategoryProductListReply({
      category,
      products,
      roman,
      page: 0,
      totalInCategory: products.length,
    }),
    category,
    products,
    waProducts,
    query,
    roots,
    score: top.score ?? 0,
  };
}

export async function buildFullCatalogMenuReply(textBody: string): Promise<{
  reply: string;
  totalProducts: number;
} | null> {
  if (!isFullCatalogBrowseMessage(textBody)) return null;
  const roman = isRomanUrduSales(textBody);
  const index = await buildFullCatalogIndex();
  const reply = await formatMasterCatalogMenuReply(roman);
  return { reply, totalProducts: index.total };
}

export async function buildCategoryBrowseFromMenuPick(opts: {
  categoryId: string;
  textBody: string;
  page?: number;
}): Promise<{
  reply: string;
  category: WaSalesCategory | null;
  products: ShopifyCatalogProduct[];
  waProducts: ReturnType<typeof toWhatsAppCatalogProducts>;
  page: number;
  hasMore: boolean;
} | null> {
  const { products, category } = await listProductsByCategoryId(opts.categoryId);
  if (!products.length) return null;

  const page = opts.page ?? 0;
  const roman = isRomanUrduSales(opts.textBody);
  const waProducts = toWhatsAppCatalogProducts(products);
  const hasMore = (page + 1) * CATEGORY_PAGE_SIZE < products.length;

  return {
    reply: formatCategoryProductListReply({
      category,
      products,
      roman,
      page,
      totalInCategory: products.length,
    }),
    category,
    products,
    waProducts,
    page,
    hasMore,
  };
}

export function listAllCategoryDefinitions(): Array<{
  id: string;
  emoji: string;
  labelEn: string;
  labelUr: string;
  familyCount: number;
}> {
  return WA_SALES_CATEGORIES.map((c) => ({
    id: c.id,
    emoji: c.emoji,
    labelEn: c.labelEn,
    labelUr: c.labelUr,
    familyCount: c.families.length,
  }));
}
