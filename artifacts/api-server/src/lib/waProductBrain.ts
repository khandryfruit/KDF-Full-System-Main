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

/** Strip filler words so "I need almonds" → "almonds" */
export function extractProductQueryFromMessage(text: string): string {
  let q = String(text ?? "").trim();
  const patterns = [
    /^(i|me|we|please|pls|kindly|want|need|looking for|searching for|show me|give me|send me|mujhe|muje|mje|mjy|chahiye|chaye|chahye|chaiye|lena|lenay|karna hai|krna hai)\b/gi,
    /\b(please|pls|want|need|some|any|a|an|the|for me|for us)\b/gi,
  ];
  for (const re of patterns) q = q.replace(re, " ");
  return q.replace(/\s+/g, " ").trim() || String(text ?? "").trim();
}

export function productRootsInMessage(text: string): string[] {
  return productRootTermsFromQuery(text);
}

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
    "salam", "salaam", "assalam", "assalam o alaikum", "assalamualaikum", "aoa", "aslam",
    "koi hai", "kia hal hai", "kaise ho", "good morning", "good evening",
    "السلام علیکم", "سلام", "جی", "hello ji",
  ]);
  if (exact.has(n)) return true;
  if (n.split(/\s+/).length <= 4 && /^(hi|hello|hey|salam|salaam|assalam|aoa|salamualaikum)\b/.test(n)) return true;
  return false;
}

export function isVariantMenuSelection(text: string): boolean {
  return /^[1-9]$/.test(String(text ?? "").trim());
}

export function isOrderAffirmationMessage(text: string): boolean {
  const t = String(text ?? "").trim().toLowerCase();
  return /^(haan|han|yes|ji|jee|jee haan|ok|okay|theek|thik|order|order start|start order|kr do|kar do|krna hai|karna hai|confirm|place order)$/i.test(t);
}

/** Product inquiry: has catalog root or known product word */
export function isLikelyProductInquiry(text: string, intent?: string): boolean {
  return isProductInquiryMessage(text) || (intent != null && ["product_search", "pricing", "recommendation", "bulk_order"].includes(intent));
}

export function isProductInquiryMessage(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t || isPureGreetingMessage(t) || isVariantMenuSelection(t)) return false;
  if (productRootsInMessage(t).length > 0) return true;
  const lower = t.toLowerCase();
  for (const key of Object.keys(WA_PRODUCT_ALIASES)) {
    if (lower.includes(key)) return true;
  }
  return /\b(almond|badam|pista|kaju|akhrot|walnut|cashew|khajoor|anjeer|kishmish|dry fruit|nuts)\b/i.test(t);
}

export function shouldUseProductDatabaseFirst(intent: string, text: string): boolean {
  if (isPureGreetingMessage(text) || isVariantMenuSelection(text)) return false;
  if (intent === "greeting") return false;
  if (isProductInquiryMessage(text)) return true;
  if (["product_search", "pricing", "recommendation", "bulk_order"].includes(intent)) return true;
  if (intent === "order_start" && productRootsInMessage(text).length > 0) return true;
  return false;
}

const MIN_PRODUCT_SCORE = 35;

export async function tryWaProductCatalogReply(opts: {
  textBody: string;
  productQuery?: string;
}): Promise<WaProductBrainHit | null> {
  const query = extractProductQueryFromMessage(
    buildWaProductSearchQuery(opts.textBody, opts.productQuery),
  );
  if (!query || query.length < 2) return null;

  const roots = productRootsInMessage(query);
  let products = await searchShopifyCatalog(query, 6);

  if (!products.length && roots.length > 0) {
    products = await searchShopifyCatalog(roots[0]!, 6);
  }

  const minScore = roots.length > 0 ? MIN_PRODUCT_SCORE : 20;
  const top = products[0];
  if (!top || (top.score ?? 0) < minScore) return null;

  const roman = isRomanUrduWa(opts.textBody);
  const reply = formatShopifyCatalogWhatsAppReply(products.slice(0, 3), roman);

  return {
    reply,
    product: top,
    products: products.slice(0, 3),
    query,
    matchedRoots: roots,
    score: top.score,
  };
}

export function buildWaProductSearchQuery(textBody: string, productQuery?: string): string {
  const full = String(textBody ?? "").trim();
  const hint = String(productQuery ?? "").trim();
  if (!hint || hint.length < 2) return full;
  if (/\b\d+(?:\.\d+)?\s*(kg|kgs|g|gm|gram|grams)\b/i.test(full)) return full;
  if (full.toLowerCase().includes(hint.toLowerCase())) return full;
  return hint.length >= 3 ? `${hint} ${full}`.trim() : full;
}

export function buildHumanWelcomeReply(textBody: string): string {
  const roman = isRomanUrduWa(textBody);
  if (roman) {
    return `Assalam o Alaikum 😊
Welcome to Khan Dry Fruits.

I can help you with products, prices, orders, or delivery.`;
  }
  return `اسلام علیکم 😊
خوش آمدید Khan Dry Fruits میں۔

میں پروڈکٹس، قیمت، آرڈر، یا ڈیلیوری کے بارے میں مدد کر سکتا ہوں۔`;
}

/** Never send the old robotic fallback */
export function buildHelpfulPromptReply(textBody: string, hadProductContext: boolean): string {
  const roman = isRomanUrduWa(textBody);
  if (hadProductContext) {
    return roman
      ? "Ji 😊 number reply kar dein (1, 2, 3) ya product ka naam / weight bhej dein."
      : "جی 😊 نمبر reply کر دیں (1، 2، 3) یا product کا نام / weight بھیج دیں۔";
  }
  if (isProductInquiryMessage(textBody)) {
    return roman
      ? "Ji 😊 ek lamha — catalog se exact product check kar raha hoon. Please thora specific bhej dein (jaise soft shell badam 500g)."
      : "جی 😊 ایک لمحہ — catalog سے exact product check کر رہا ہوں۔ تھوڑا specific بھیج دیں (جیسے soft shell badam 500g)۔";
  }
  return roman
    ? "Ji 😊 kaunsa product dekhna chahte hain? Jaise: badam, pista, akhrot, kaju."
    : "جی 😊 کونسا product دیکھنا چاہتے ہیں؟ جیسے: badam، pista، akhrot، kaju۔";
}
