/**
 * Premium WhatsApp sales agent — category browse → product → variant → order.
 * All data from synced Shopify catalog only.
 */
import {
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

/** Search catalog for a category / product family (up to 20 matches) */
export async function searchCategoryProducts(query: string, limit = 20): Promise<{
  category: WaSalesCategory | null;
  products: ShopifyCatalogProduct[];
  query: string;
  roots: string[];
}> {
  const q = String(query ?? "").trim();
  const roots = productRootTermsFromQuery(q);
  const category = resolveSalesCategoryFromQuery(q);
  const products = await searchShopifyCatalog(q, limit);
  return { category, products, query: q, roots };
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

/** Category product list (step 1 of sales flow) */
export function formatCategoryProductListReply(opts: {
  category: WaSalesCategory | null;
  products: ShopifyCatalogProduct[];
  roman: boolean;
}): string {
  const { category, products, roman } = opts;
  if (!products.length) {
    return roman
      ? "Ji 😊 is category mein abhi koi exact match nahi mila. Please product naam bhej dein (jaise: Australian badam, Irani pista)."
      : "جی 😊 اس category میں ابھی کوئی exact match نہیں ملا۔ براہ کرم product نام بھیج دیں۔";
  }

  const label = category
    ? (roman ? `${category.emoji} *${category.labelEn}*` : `${category.emoji} *${category.labelUr}*`)
    : (roman ? "🛒 *Available Products*" : "🛒 *دستیاب Products*");

  const lines = products.slice(0, 12).map((p, i) => {
    const priceHint = p.rawPrice ? ` — from ${formatRupees(p.rawPrice)}` : "";
    const stock = p.inStock ? "" : roman ? " (out of stock)" : " (out of stock)";
    return `${i + 1}️⃣ ${p.name}${priceHint}${stock}`;
  });

  if (roman) {
    return `Ji 😊 yeh ${category?.labelEn ?? "products"} available hain:\n\n${label}\n\n${lines.join("\n\n")}\n\n━━━━━━━━━━━\n\nPlease number select karein (1, 2, 3…)\nMain variants aur price bata dunga 😊`;
  }
  return `جی 😊 yeh ${category?.labelUr ?? "products"} available hain:\n\n${label}\n\n${lines.join("\n\n")}\n\n━━━━━━━━━━━\n\nبراہ کرم نمبر منتخب کریں (1، 2، 3…)\nمیں variants اور price بتاؤں گا 😊`;
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

  const { category, products, roots } = await searchCategoryProducts(query, 20);
  if (!products.length) return null;

  const top = products[0]!;
  const minScore = roots.length > 0 ? 35 : 20;
  if ((top.score ?? 0) < minScore) return null;

  const roman = isRomanUrduSales(textBody);
  const waProducts = toWhatsAppCatalogProducts(products);

  return {
    mode: products.length === 1 ? "single" : "category",
    reply: formatCategoryProductListReply({ category, products, roman }),
    category,
    products,
    waProducts,
    query,
    roots,
    score: top.score ?? 0,
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
