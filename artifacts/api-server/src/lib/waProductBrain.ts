/**
 * Central product brain for WhatsApp + website — product DB answers BEFORE OpenAI.
 */
import {
  formatShopifyCatalogWhatsAppReply,
  type ShopifyCatalogProduct,
} from "./shopifyProductKnowledge.js";
import { productRootTermsFromQuery, WA_PRODUCT_ALIASES } from "./shopifyProductSearch.js";
import {
  buildCatalogBrowseReply,
  buildFullCatalogMenuReply,
  buildCategoryBrowseFromMenuPick,
  formatCategoryProductListReply,
  isCatalogNextPageMessage,
  isFullCatalogBrowseMessage,
  getCategorySummaries,
  resolveCategoryFromMenuNumber,
  type WaCatalogBrowseResult,
} from "./waSalesAgent.js";
import { listProductsForCustomerQuery, resolveCanonicalCategoryId } from "./waCategoryIndex.js";
import {
  isBareProductMention,
  hasExplicitProductShowIntent,
  shouldShowProductCatalogNow,
  isStandaloneFaqMessage,
} from "./waSalesConversation.js";
import {
  isPaymentIssueMessage,
  isPaymentInfoMessage,
  isAddressFaqMessage,
} from "./waIntentClassifier.js";
import { extractProductSearchQuery, resolveSpecificProductKey } from "./waProductEntity.js";

export type WaProductBrainHit = {
  reply: string;
  product: ShopifyCatalogProduct;
  products: ShopifyCatalogProduct[];
  query: string;
  matchedRoots: string[];
  score: number;
  mode: "category" | "single" | "legacy" | "catalog_menu" | "catalog_page";
  categoryId?: string | null;
  waProducts?: WaCatalogBrowseResult["waProducts"];
  catalogPage?: number;
  hasMore?: boolean;
};

export function isRomanUrduWa(text: string): boolean {
  return /[a-z]/i.test(text) && !/[اآبپتٹثجچحخدڈذرڑزژسشصضطظعغفقکگلمنوہھیے]/.test(text);
}

/** Strip filler words so "Mujhe goji berry chahiye" → "goji berry" */
export function extractProductQueryFromMessage(text: string): string {
  return extractProductSearchQuery(text);
}

export function productRootsInMessage(text: string): string[] {
  return productRootTermsFromQuery(text);
}

/** Greeting + product in one message e.g. "Hello almonds chahiye" */
export function isMixedGreetingProductMessage(text: string): boolean {
  const raw = String(text ?? "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  const hasGreet =
    /\b(hi|hello|hey|hy|hii|helo|salam|salaam|assalam|assalamu|aoa|aslam|good morning|good evening|السلام|سلام)\b/i.test(lower) ||
    /\b(wa alaikum|walikum|walaikum)\b/i.test(lower);
  if (!hasGreet) return false;
  if (productRootsInMessage(raw).length > 0) return true;
  for (const key of Object.keys(WA_PRODUCT_ALIASES)) {
    if (lower.includes(key)) return true;
  }
  return /\b(almond|badam|pista|kaju|akhrot|walnut|dry fruit|nuts)\b/i.test(lower) &&
    /\b(chahiye|chahie|chaiye|lena|mangwana|need|want)\b/i.test(lower);
}

export function isPureGreetingMessage(text: string): boolean {
  const raw = String(text ?? "").trim();
  if (isMixedGreetingProductMessage(raw)) return false;
  if (!raw || raw.length > 120) return false;
  const n = raw
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const exact = new Set([
    "hi", "hello", "hey", "hy", "hii", "helo", "hello g", "hello ji", "hy g",
    "salam", "salaam", "assalam", "assalam o alaikum", "assalamualaikum", "assalamu alaikum",
    "aoa", "aslam", "asalam o alaikum", "walaikum assalam", "wa alaikum assalam",
    "koi hai", "kia hal hai", "kaise ho", "good morning", "good afternoon", "good evening",
    "السلام علیکم", "سلام", "وعلیکم السلام", "جی",
  ]);
  if (exact.has(n)) return true;
  if (/\b(bat|baat|kr|kre|karo|bol|talk|speak|call)\b/i.test(n)) return false;
  if (
    /^(assalam|salam|salaam|aoa|aslam|assalamu|assalam o|asalam o)\b/.test(n) &&
    /\b(alaikum|alikum|alekum|walaikum|walikum)\b/.test(n) &&
    n.split(/\s+/).length <= 6
  ) {
    return true;
  }
  if (n.split(/\s+/).length <= 5 && /^(hi|hello|hey|hy|hii|helo|salam|salaam|assalam|aoa|aslam|good morning|good afternoon|good evening)\b/.test(n)) {
    return true;
  }
  if (n.split(/\s+/).length <= 3 && /^(السلام|سلام|وعلیکم)/.test(raw.trim())) return true;
  return false;
}

export function isVariantMenuSelection(text: string): boolean {
  return /^[1-9]$/.test(String(text ?? "").trim());
}

export function isOrderAffirmationMessage(text: string): boolean {
  const t = String(text ?? "").trim().toLowerCase();
  return /^(haan|han|yes|ji|jee|jee haan|ok|okay|theek|thik|order|order start|start order|kr do|kar do|krna hai|karna hai|confirm|place order)$/i.test(t);
}

export function isPreOrderConfirmSelection(text: string): boolean {
  return /^[12]$/.test(String(text ?? "").trim());
}

/** Product inquiry: has catalog root or known product word */
export function isLikelyProductInquiry(text: string, intent?: string): boolean {
  return isProductInquiryMessage(text) || (intent != null && ["product_search", "pricing", "recommendation", "bulk_order"].includes(intent));
}

export function isProductInquiryMessage(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t || isPureGreetingMessage(t) || isVariantMenuSelection(t) || isStandaloneFaqMessage(t)) return false;
  if (isPaymentIssueMessage(t) || isPaymentInfoMessage(t) || isAddressFaqMessage(t)) return false;
  if (isBareProductMention(t)) return true;
  if (productRootsInMessage(t).length > 0) return true;
  const lower = t.toLowerCase();
  for (const key of Object.keys(WA_PRODUCT_ALIASES)) {
    if (lower.includes(key)) return true;
  }
  return /\b(almond|almonds|badam|badaam|almod|pista|pistachio|kaju|cashew|akhrot|walnut|khajoor|anjeer|kishmish|dry fruit|nuts|berry|goji|cranberry)\b/i.test(t);
}

export function shouldUseProductDatabaseFirst(intent: string, text: string, state = "idle"): boolean {
  if (isPureGreetingMessage(text) || isVariantMenuSelection(text)) return false;
  if (intent === "greeting") return false;
  if (!shouldShowProductCatalogNow({ text, intent, state })) return false;
  if (intent === "order_start" || intent === "bulk_order") return true;
  if (hasExplicitProductShowIntent(text)) return true;
  if (isBareProductMention(text)) return false;
  if (intent === "pricing" && !hasExplicitProductShowIntent(text)) return false;
  if (["product_search", "recommendation"].includes(intent) && hasExplicitProductShowIntent(text)) return true;
  if (intent === "order_start" && productRootsInMessage(text).length > 0) return true;
  return false;
}

const MIN_PRODUCT_SCORE = 35;

export { isFullCatalogBrowseMessage, isCatalogNextPageMessage };

/** Show all 313+ products via category master menu */
export async function tryWaFullCatalogMenuReply(textBody: string): Promise<WaProductBrainHit | null> {
  const menu = await buildFullCatalogMenuReply(textBody);
  if (!menu) return null;

  if (menu.directAllList && menu.categoryId === "all") {
    const { buildCategoryBrowseFromMenuPick } = await import("./waSalesAgent.js");
    const full = await buildCategoryBrowseFromMenuPick({ categoryId: "all", textBody, page: 0 });
    if (!full?.products.length) return null;
    return {
      reply: full.reply,
      product: full.products[0]!,
      products: full.products,
      query: "all",
      matchedRoots: [],
      score: 100,
      mode: "category",
      categoryId: "all",
      waProducts: full.waProducts,
      catalogPage: 0,
      hasMore: full.hasMore,
    };
  }

  const summaries = await getCategorySummaries();
  const placeholder = {
    name: "Khan Dry Fruits Catalog",
    shopifyProductId: "catalog",
    rawPrice: 0,
    score: 100,
  } as ShopifyCatalogProduct;

  return {
    reply: menu.reply,
    product: placeholder,
    products: [],
    query: "catalog",
    matchedRoots: [],
    score: 100,
    mode: "catalog_menu",
    categoryId: null,
    waProducts: [],
  };
}

/** Primary path: Commerce → Products, then Shopify category index */
async function tryCategoryCatalogReply(opts: {
  textBody: string;
  productQuery?: string;
}): Promise<WaProductBrainHit | null> {
  const raw = String(opts.textBody ?? "").trim();
  const query = extractProductQueryFromMessage(
    buildWaProductSearchQuery(raw, opts.productQuery),
  );
  if (!query || query.length < 1) return null;

  const categoryId = resolveCanonicalCategoryId(query) ?? resolveCanonicalCategoryId(raw);
  const roman = isRomanUrduWa(raw);
  const searchQ = query.length >= 2 ? query : raw;

  const {
    listCommerceProductsForCustomerQuery,
    formatCommerceProductsWhatsAppReply,
    commerceToWaCatalogProducts,
    commerceHitToCatalogProduct,
    searchCommerceProductsRanked,
    logCommerceProductSearch,
  } = await import("./commerceProductSearch.js");

  const specificKey = resolveSpecificProductKey(searchQ) ?? resolveSpecificProductKey(raw);
  const ranked = await searchCommerceProductsRanked(searchQ, 8);
  if (ranked.products.length > 0) {
    const catalogProducts = ranked.products.map(commerceHitToCatalogProduct);
    await logCommerceProductSearch({
      userQuery: raw,
      products: ranked.products,
      matchMethod: `ranked_${ranked.confidence}`,
      debug: ranked.debug,
    }).catch(() => {});
    return {
      reply: formatCommerceProductsWhatsAppReply(ranked.products, roman),
      product: catalogProducts[0]!,
      products: catalogProducts,
      query,
      matchedRoots: productRootTermsFromQuery(searchQ),
      score: ranked.products[0]?.score ?? 100,
      mode: ranked.products.length === 1 || ranked.confidence >= 80 ? "single" : "category",
      categoryId: specificKey ?? categoryId,
      waProducts: commerceToWaCatalogProducts(ranked.products),
      catalogPage: 0,
      hasMore: false,
    };
  }

  if (categoryId && categoryId !== "all" && !specificKey) {
    const commerceListed = await listCommerceProductsForCustomerQuery(searchQ);
    if (commerceListed.products.length > 0 && commerceListed.products.length <= 2) {
      const catalogProducts = commerceListed.products.map(commerceHitToCatalogProduct);
      return {
        reply: formatCommerceProductsWhatsAppReply(commerceListed.products, roman),
        product: catalogProducts[0]!,
        products: catalogProducts,
        query,
        matchedRoots: commerceListed.roots,
        score: 100,
        mode: catalogProducts.length === 1 ? "single" : "category",
        categoryId,
        waProducts: commerceToWaCatalogProducts(commerceListed.products),
        catalogPage: 0,
        hasMore: false,
      };
    }

    const { searchRelatedCommerceProducts } = await import("./commerceProductSearch.js");
    const relatedCommerce = await searchRelatedCommerceProducts(searchQ, 3);
    if (relatedCommerce.length > 0 && relatedCommerce.length <= 2) {
      const catalogProducts = relatedCommerce.map(commerceHitToCatalogProduct);
      return {
        reply: formatCommerceProductsWhatsAppReply(relatedCommerce, roman),
        product: catalogProducts[0]!,
        products: catalogProducts,
        query,
        matchedRoots: productRootTermsFromQuery(searchQ),
        score: 80,
        mode: "category",
        categoryId,
        waProducts: commerceToWaCatalogProducts(relatedCommerce),
        catalogPage: 0,
        hasMore: false,
      };
    }

    const listed = await listProductsForCustomerQuery(searchQ);
    if (listed.category && listed.products.length > 0) {
      const { toWhatsAppCatalogProducts } = await import("./shopifyProductKnowledge.js");
      const waProducts = toWhatsAppCatalogProducts(listed.products);
      return {
        reply: formatCategoryProductListReply({
          category: listed.category,
          products: listed.products,
          roman,
          page: 0,
          totalInCategory: listed.products.length,
        }),
        product: listed.products[0]!,
        products: listed.products,
        query,
        matchedRoots: listed.roots,
        score: 100,
        mode: listed.products.length === 1 ? "single" : "category",
        categoryId: listed.categoryId,
        waProducts,
        catalogPage: 0,
        hasMore: listed.products.length > 30,
      };
    }

    return null;
  }

  const fallbackRanked = await searchCommerceProductsRanked(searchQ, 4);
  if (fallbackRanked.products.length > 0) {
    const catalogProducts = fallbackRanked.products.map(commerceHitToCatalogProduct);
    return {
      reply: formatCommerceProductsWhatsAppReply(fallbackRanked.products, roman),
      product: catalogProducts[0]!,
      products: catalogProducts,
      query,
      matchedRoots: productRootTermsFromQuery(searchQ),
      score: fallbackRanked.products[0]?.score ?? 100,
      mode: fallbackRanked.products.length === 1 ? "single" : "category",
      categoryId: categoryId ?? null,
      waProducts: commerceToWaCatalogProducts(fallbackRanked.products),
      catalogPage: 0,
      hasMore: false,
    };
  }

  return null;
}

export async function tryWaProductCatalogReply(opts: {
  textBody: string;
  productQuery?: string;
}): Promise<WaProductBrainHit | null> {
  const { isCheckoutContinuationMessage } = await import("./waAddressFlow.js");
  if (isCheckoutContinuationMessage(opts.textBody)) return null;

  const query = extractProductQueryFromMessage(
    buildWaProductSearchQuery(opts.textBody, opts.productQuery),
  );
  if (!query || query.length < 1) return null;
  if (isCheckoutContinuationMessage(query)) return null;

  if (isFullCatalogBrowseMessage(query) || isFullCatalogBrowseMessage(opts.textBody)) {
    return tryWaFullCatalogMenuReply(opts.textBody);
  }

  const categoryHit = await tryCategoryCatalogReply(opts);
  if (categoryHit) return categoryHit;

  const browse = await buildCatalogBrowseReply({ query, textBody: opts.textBody });
  if (!browse) return null;

  const top = browse.products[0]!;
  if (!browse.category && browse.roots.length > 0 && (top.score ?? 0) < MIN_PRODUCT_SCORE) return null;

  return {
    reply: browse.reply,
    product: top,
    products: browse.products,
    query: browse.query,
    matchedRoots: browse.roots,
    score: browse.score,
    mode: browse.mode,
    categoryId: browse.category?.id ?? null,
    waProducts: browse.waProducts,
  };
}

/** Legacy single-product variant card (website / fallback) */
export function formatLegacyVariantReply(products: ShopifyCatalogProduct[], roman: boolean): string {
  return formatShopifyCatalogWhatsAppReply(products.slice(0, 3), roman);
}

export function buildWaProductSearchQuery(textBody: string, productQuery?: string): string {
  const full = String(textBody ?? "").trim();
  const hint = String(productQuery ?? "").trim();
  if (!hint || hint.length < 2) return full;
  if (/\b\d+(?:\.\d+)?\s*(kg|kgs|g|gm|gram|grams)\b/i.test(full)) return full;
  if (full.toLowerCase().includes(hint.toLowerCase())) return full;
  return hint.length >= 3 ? `${hint} ${full}`.trim() : full;
}

export { buildWarmWelcomeReply as buildHumanWelcomeReply } from "./waSalesConversation.js";

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
