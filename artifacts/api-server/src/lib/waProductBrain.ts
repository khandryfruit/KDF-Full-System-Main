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

/** True for short greetings only — never treat as product search. */
export function isPureGreetingMessage(text: string): boolean {
  const raw = String(text ?? "").trim();
  if (!raw || raw.length > 80) return false;
  const n = raw
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const exact = new Set([
    "hi", "hello", "hey", "hy", "hii", "helo",
    "salam", "salaam", "assalam", "assalam o alaikum", "aoa", "aslam",
    "koi hai", "kia hal hai", "kaise ho", "good morning", "good evening",
    "السلام علیکم", "سلام", "جی", "hello ji",
  ]);
  if (exact.has(n)) return true;
  if (n.split(/\s+/).length <= 4 && /^(hi|hello|hey|salam|salaam|assalam|aoa|salamualaikum)\b/.test(n)) return true;
  return false;
}

/** Customer picked a numbered option from a variant list (1–9). */
export function isVariantMenuSelection(text: string): boolean {
  return /^[1-9]$/.test(String(text ?? "").trim());
}

/** Customer confirming they want to order after seeing prices. */
export function isOrderAffirmationMessage(text: string): boolean {
  const t = String(text ?? "").trim().toLowerCase();
  return /^(haan|han|yes|ji|jee|jee haan|ok|okay|theek|thik|order|order start|start order|kr do|kar do|krna hai|karna hai|confirm|place order)$/i.test(t);
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
  if (isPureGreetingMessage(text) || isVariantMenuSelection(text) || isOrderAffirmationMessage(text)) {
    return false;
  }
  if (intent === "greeting") return false;
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
    return `Hello 😊 Welcome to Khan Dry Fruit.

I am here to help you.

You can ask me about our products, prices, orders, or delivery.`;
  }
  return `جی 😊 خوش آمدید خان ڈرائی فروٹس میں۔

میں آپ کی مدد کے لیے موجود ہوں۔

آپ پروڈکٹ، قیمت، آرڈر یا ڈلیوری کے بارے میں پوچھ سکتے ہیں۔`;
}
