/**
 * Central product brain for WhatsApp + website — product DB answers BEFORE OpenAI.
 */
import {
  searchShopifyCatalog,
  formatShopifyCatalogWhatsAppReply,
  type ShopifyCatalogProduct,
} from "./shopifyProductKnowledge.js";
import { productRootTermsFromQuery, WA_PRODUCT_ALIASES } from "./shopifyProductSearch.js";

export type WaProductBrainHit = {
  reply: string;
  product: ShopifyCatalogProduct;
  products: ShopifyCatalogProduct[];
  query: string;
  matchedRoots: string[];
  score: number;
};

export function isRomanUrduWa(text: string): boolean {
  return /[a-z]/i.test(text) && !/[اآبپتٹثجچحخدڈذرڑزژسشصضطظعغفقکگلمنوہھیے]/.test(text);
}

export function buildWaProductSearchQuery(textBody: string, productQuery?: string): string {
  const full = String(textBody ?? "").trim();
  const hint = String(productQuery ?? "").trim();
  if (!hint || hint.length < 2) return full;
  if (/\b\d+(?:\.\d+)?\s*(kg|kgs|g|gm|gram|grams)\b/i.test(full)) return full;
  if (full.toLowerCase().includes(hint.toLowerCase())) return full;
  return hint.length >= 3 ? `${hint} ${full}`.trim() : full;
}

export function productRootsInMessage(text: string): string[] {
  return productRootTermsFromQuery(text);
}

export function isLikelyProductInquiry(text: string, intent?: string): boolean {
  const t = String(text ?? "").trim();
  if (!t || t.length > 120) return false;
  if (intent && ["product_search", "pricing", "recommendation", "bulk_order", "order_start"].includes(intent)) {
    return true;
  }
  const roots = productRootsInMessage(t);
  if (roots.length > 0) return true;
  const lower = t.toLowerCase();
  for (const key of Object.keys(WA_PRODUCT_ALIASES)) {
    if (lower.includes(key)) return true;
  }
  return /\b(shelled|unshelled|raw|roasted|peeled|premium|organic|without shell|with shell)\b/i.test(t)
    && roots.length > 0;
}

export function shouldUseProductDatabaseFirst(intent: string, text: string): boolean {
  if (["product_search", "pricing", "recommendation", "bulk_order"].includes(intent)) return true;
  if (intent === "order_start" && productRootsInMessage(text).length > 0) return true;
  if (intent === "general" && isLikelyProductInquiry(text)) return true;
  return false;
}

const MIN_PRODUCT_SCORE = 18;

export async function tryWaProductCatalogReply(opts: {
  textBody: string;
  productQuery?: string;
}): Promise<WaProductBrainHit | null> {
  const query = buildWaProductSearchQuery(opts.textBody, opts.productQuery);
  if (!query || query.length < 2) return null;

  const roots = productRootsInMessage(query);
  let products = await searchShopifyCatalog(query, 3);

  if ((!products.length || (products[0]?.score ?? 0) < MIN_PRODUCT_SCORE) && roots.length > 0) {
    const alt = await searchShopifyCatalog(roots[0]!, 3);
    if ((alt[0]?.score ?? 0) > (products[0]?.score ?? 0)) products = alt;
  }

  const top = products[0];
  if (!top || (top.score ?? 0) < MIN_PRODUCT_SCORE) return null;

  const roman = isRomanUrduWa(opts.textBody);
  const reply = formatShopifyCatalogWhatsAppReply([top], roman);

  return {
    reply,
    product: top,
    products,
    query,
    matchedRoots: roots,
    score: top.score,
  };
}

export function buildHumanWelcomeReply(textBody: string): string {
  const roman = isRomanUrduWa(textBody);
  if (roman) {
    return `Assalam o Alaikum 😊

Khan Dry Fruits mein khush aamdeed.
Main madad ke liye mojood hoon.

Kya aap kisi product, qeemat ya order ke bare mein poochna chahte hain?`;
  }
  return `السلام علیکم 😊

Khan Dry Fruits میں خوش آمدید۔
میں مدد کے لیے موجود ہوں۔

کیا آپ کسی پروڈکٹ، قیمت یا آرڈر کے بارے میں پوچھنا چاہتے ہیں؟`;
}
