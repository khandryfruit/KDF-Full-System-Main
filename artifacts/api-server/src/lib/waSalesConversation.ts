/**
 * Human sales-agent conversation layer — greet, clarify intent, answer FAQs
 * before showing product cards.
 */
import { db, aiSettingsTable, chatbotSettingsTable, footerSettingsTable, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  extractProductQueryFromMessage,
  isProductInquiryMessage,
  isPureGreetingMessage,
  isRomanUrduWa,
  productRootsInMessage,
} from "./waProductBrain.js";
import { resolveCanonicalCategoryId } from "./waCategoryIndex.js";
import { isShowMoreProductsMessage } from "./waOrderJourney.js";
import { buildDeliveryReply, isDeliveryOnlyMessage } from "./waIntentEngine.js";
import { classifyWaMessage, shouldBlockProductCatalog, isPaymentIssueMessage } from "./waIntentClassifier.js";
import { searchCommerceProducts } from "./commerceProductSearch.js";

function formatRupees(value: number): string {
  return `Rs. ${Math.round(value).toLocaleString("en-PK")}`;
}

export const WA_SALES_CHAT_STATE = "wa_sales_chat";
export const WA_AWAIT_PRODUCT_INTENT_STATE = "wa_await_product_intent";

let businessKnowledgeCache: { at: number; block: string } | null = null;
const CACHE_MS = 120_000;

export async function loadBusinessKnowledgeBlock(): Promise<string> {
  const now = Date.now();
  if (businessKnowledgeCache && now - businessKnowledgeCache.at < CACHE_MS) {
    return businessKnowledgeCache.block;
  }

  const [[chatbot], [globalAi], [footer], [branch]] = await Promise.all([
    db.select().from(chatbotSettingsTable).limit(1).catch(() => []),
    db.select().from(aiSettingsTable).limit(1).catch(() => []),
    db.select().from(footerSettingsTable).where(eq(footerSettingsTable.isActive, true)).limit(1).catch(() => []),
    db.select().from(branchesTable).where(eq(branchesTable.isHeadOffice, true)).limit(1).catch(() => []),
  ]);

  const parts: string[] = [];
  const intro = String(chatbot?.systemPrompt ?? globalAi?.systemPrompt ?? "").trim();
  if (intro) {
    parts.push(`[STORE INTRODUCTION / POLICIES — use for address, delivery, timings, FAQs]\n${intro.slice(0, 4000)}`);
  }

  if (footer?.address || footer?.phone || footer?.email) {
    parts.push(
      `[CONTACT]\nAddress: ${footer.address ?? "—"}\nPhone: ${footer.phone ?? "—"}\nEmail: ${footer.email ?? "—"}`,
    );
  }
  if (branch) {
    parts.push(
      `[HEAD OFFICE]\n${branch.name}${branch.city ? `, ${branch.city}` : ""}\n${branch.address ?? ""}\nPhone: ${branch.phone ?? branch.whatsappNumber ?? "—"}`,
    );
  }
  if (chatbot?.websiteUrl) parts.push(`Website: ${chatbot.websiteUrl}`);

  const block = parts.join("\n\n");
  businessKnowledgeCache = { at: now, block };
  return block;
}

function parsePrice(value: unknown): number {
  const n = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/** Single product word only — e.g. "badam", "pista", "بادام" */
export function isBareProductMention(text: string): boolean {
  const q = extractProductQueryFromMessage(text).toLowerCase().trim();
  if (!q || q.length > 24) return false;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 2) return false;
  if (/\b(price|rate|qeemat|kitna|order|buy|delivery|address|shop|store|dikhao|show|recommend|chahiye|lena)\b/i.test(q)) {
    return false;
  }
  return productRootsInMessage(q).length > 0 || resolveCanonicalCategoryId(q) != null;
}

/** "price?", "delivery?", "address?" — FAQ, not catalog search */
export function isStandaloneFaqMessage(text: string): boolean {
  const t = String(text ?? "").trim().toLowerCase().replace(/[^\w\s\u0600-\u06FF?]/gu, "").trim();
  if (!t || t.length > 40) return false;
  if (isDeliveryOnlyMessage(text)) return true;
  if (/^(price|prices|qeemat|kitna|how much|rate|rates)$/.test(t)) return true;
  if (/^(delivery|shipping|courier|delivery charges|delivery charge)$/.test(t)) return true;
  if (/^(address|location|shop|store|shop address|dokan|dukan|kahan|kaha)$/.test(t)) return true;
  if (/^(timing|timings|time|hours|open|close)$/.test(t)) return true;
  return false;
}

/** Benefits, usage, "kya hoti hai" — answer first, no catalog */
export function isProductEducationMessage(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t || hasExplicitProductShowIntent(t)) return false;
  return /\b(faide|fayde|faida|benefit|benefits|uses|use for|kya hoti|kya hai|kya hota|what is|quality|review|reviews|taste|flavour|flavor|kaise use|how to eat|healthy|nutrition|protein|energy)\b/i.test(t);
}

export function hasExplicitProductShowIntent(text: string): boolean {
  const t = String(text ?? "").toLowerCase();
  return (
    isShowMoreProductsMessage(text) ||
    /\b(order|buy|purchase|lena|mangwana|bill|checkout|dikhao|dikha do|bhejo|bhej do|show me|send me|recommend|suggest)\b/i.test(t) ||
    (/\b(price|rate|qeemat)\b/i.test(t) && /\b(dikhao|show|batao|btao|list)\b/i.test(t))
  );
}

export function shouldShowProductCatalogNow(opts: {
  text: string;
  intent: string;
  state: string;
}): boolean {
  const { text, intent, state } = opts;
  const classified = classifyWaMessage(text, {});
  if (shouldBlockProductCatalog(classified)) return false;
  if (isPaymentIssueMessage(text)) return false;
  if (isPureGreetingMessage(text) || intent === "greeting") return false;
  if (isStandaloneFaqMessage(text)) return false;
  if (intent === "conversation" || intent === "support" || intent === "general") return false;
  if (intent === "delivery" || intent === "tracking") return false;
  if (intent === "order_start" || intent === "bulk_order") return true;
  if (hasExplicitProductShowIntent(text)) return true;
  if (isBareProductMention(text)) return false;
  if (intent === "product_search" && isBareProductMention(text)) return false;
  if (intent === "pricing" && !hasExplicitProductShowIntent(text)) return false;
  if (state === WA_AWAIT_PRODUCT_INTENT_STATE && !hasExplicitProductShowIntent(text)) return false;
  return false;
}

export function buildStandalonePricePrompt(roman: boolean): string {
  if (roman) {
    return `Ji 😊 kis product ki price chahiye?\n\nJaise: *badam*, *pista*, *kaju*, *akhrot*\n\nYa product ka naam + weight bhej dein — jaise *badam 500g* 😊`;
  }
  return `جی 😊 کس product کی price چاہیے؟\n\nجیسے: *badam*، *pista*، *kaju*\n\nیا product + weight بھیجیں — جیسے *badam 500g* 😊`;
}

export { buildLanguageWelcomeMessage } from "./waPremiumJourney.js";

export function buildWarmWelcomeReply(textBody: string): string {
  const roman = isRomanUrduWa(textBody);
  if (roman) {
    return `Assalam o Alaikum 😊
Welcome to *Khan Dry Fruits* (KDF MART).

Main aapki madad kar sakta hoon dry fruits, grocery, prices, delivery aur orders mein.

Aaj aap kis cheez ke baare mein poochna chahenge?`;
  }
  return `السلام علیکم 😊
*Khan Dry Fruits* (KDF MART) میں خوش آمدید۔

میں dry fruits، grocery، prices، delivery اور orders میں مدد کر سکتا ہوں۔

آج آپ کس چیز کے بارے میں پوچھنا چاہیں گے؟`;
}

export function buildProductInterestClarification(productLabel: string, roman: boolean): string {
  const name = productLabel.charAt(0).toUpperCase() + productLabel.slice(1);
  if (roman) {
    return `Ji 😊 *${name}* ke baare mein poocha aap ne.

Kya aap:
• *Prices* dekhna chahte hain?
• *Recommendation* chahte hain?
• Ya *order* karna chahte hain?

Reply karein: *price* / *recommend* / *order* 😊`;
  }
  return `جی 😊 *${name}* کے بارے میں پوچھا۔

کیا آپ:
• *Prices* دیکھنا چاہتے ہیں؟
• *Recommendation* چاہیے؟
• یا *order* کرنا چاہتے ہیں؟

Reply: *price* / *recommend* / *order* 😊`;
}

export function buildProductRecommendationIntro(productName: string, roman: boolean): string {
  if (roman) {
    return `Ji 😊 humare paas premium *${productName}* available hai — main aapko best option recommend karta hoon 👇`;
  }
  return `جی 😊 ہمارے پاس premium *${productName}* available ہے — best option recommend کرتا ہوں 👇`;
}

export async function buildShopAddressReply(textBody: string): Promise<string> {
  const roman = isRomanUrduWa(textBody);
  const knowledge = await loadBusinessKnowledgeBlock();
  const addressMatch = knowledge.match(/Address:\s*([^\n]+)/i);
  const phoneMatch = knowledge.match(/Phone:\s*([^\n]+)/i);
  const headBlock = knowledge.match(/\[HEAD OFFICE\]\s*([\s\S]*?)(?:\n\n\[|$)/i);

  let address = addressMatch?.[1]?.trim() ?? "";
  if (!address && headBlock?.[1]) {
    const lines = headBlock[1].split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) address = lines.slice(1).join(", ");
  }
  const phone = phoneMatch?.[1]?.trim() || "04237444400";

  if (!address) {
    return roman
      ? "Ji 😊 visit: https://www.khandryfruit.com — ya call 04237444400 for exact shop location 😊"
      : "جی 😊 https://www.khandryfruit.com — یا 04237444400 پر call کریں 😊";
  }

  if (roman) {
    return `Ji 😊

*Shop / Office:*
${address}

📞 ${phone}

Website: https://www.khandryfruit.com

Shukriya — Allah apko khush rakhe 😊`;
  }
  return `جی 😊

*Shop address:*
${address}

📞 ${phone}

Website: https://www.khandryfruit.com`;
}

export async function buildTextOnlyPriceReply(productQuery: string, roman: boolean): Promise<string | null> {
  const hits = await searchCommerceProducts(productQuery, 1);
  if (!hits.length) return null;
  const p = hits[0]!;
  const lines = p.variations.length
    ? p.variations.map((v) => {
        const label = `${v.name}${v.value ? ` (${v.value})` : ""}`;
        return `• ${label} — ${formatRupees(parsePrice(v.price ?? p.rawPrice))}`;
      })
    : [`• ${p.price}`];

  const deliverySnippet = await buildDeliveryReply(productQuery);
  const deliveryLines = deliverySnippet.split("\n").slice(2, 6).join("\n");

  if (roman) {
    return `Ji 😊

*${p.name}*

${lines.join("\n")}

${deliveryLines}

Kya aap order karna chahenge? Reply *order* ya *recommend* 😊`;
  }
  return `جی 😊

*${p.name}*

${lines.join("\n")}

${deliveryLines}

Order کے لیے *order* reply کریں 😊`;
}

export async function tryConversationalSalesReply(opts: {
  phone: string;
  textBody: string;
  currentState: string;
  stateData?: Record<string, unknown>;
  detectedIntent: string;
  productQuery?: string;
}): Promise<{ handled: boolean; reply?: string; template?: string; clearIntentState?: boolean; triggerProduct?: boolean; productQuery?: string }> {
  const text = String(opts.textBody ?? "").trim();
  const roman = isRomanUrduWa(text);
  const lower = text.toLowerCase();
  const pendingQ = String(opts.stateData?.pendingProductQuery ?? opts.productQuery ?? "").trim();

  if (/\b(address|location|shop|store|dokan|dukan|kahan hai|kaha hai|where)\b/i.test(text) && !/\b(deliver|delivery)\b/i.test(text)) {
    return { handled: true, template: "shop_address_card" };
  }

  if (isPaymentIssueMessage(text)) {
    return { handled: true, template: "payment_issue_recovery" };
  }

  if (isStandaloneFaqMessage(text) && /^(price|prices|qeemat|kitna|how much|rate)/i.test(lower)) {
    return {
      handled: true,
      template: "standalone_price_list",
    };
  }

  if (opts.detectedIntent === "delivery" || isDeliveryOnlyMessage(text) || /^(delivery|shipping)/i.test(lower)) {
    return { handled: true, template: "delivery_info_buttons" };
  }

  if (opts.currentState === WA_AWAIT_PRODUCT_INTENT_STATE && pendingQ) {
    if (/\b(price|rate|qeemat|kitna)\b/i.test(lower) || lower === "1") {
      const priceReply = await buildTextOnlyPriceReply(pendingQ, roman);
      if (priceReply) {
        return { handled: true, reply: priceReply, template: "product_price_text" };
      }
    }
    if (/\b(recommend|suggest|2)\b/i.test(lower)) {
      return {
        handled: false,
        triggerProduct: true,
        productQuery: pendingQ,
        reply: buildProductRecommendationIntro(pendingQ, roman),
        template: "product_recommend_intro",
        clearIntentState: true,
      };
    }
    if (/\b(order|buy|lena|mangwana|checkout|bill|3)\b/i.test(lower)) {
      return {
        handled: false,
        triggerProduct: true,
        productQuery: pendingQ,
        clearIntentState: true,
      };
    }
  }

  if (isProductEducationMessage(text)) {
    return { handled: true, template: "product_education_guide", productQuery: extractProductQueryFromMessage(text) || text };
  }

  if (isBareProductMention(text) && !hasExplicitProductShowIntent(text)) {
    const productQ = extractProductQueryFromMessage(text);
    return {
      handled: true,
      template: "product_interest_clarify",
      productQuery: productQ || text,
    };
  }

  if (opts.detectedIntent === "pricing" && opts.productQuery && !hasExplicitProductShowIntent(text)) {
    const priceReply = await buildTextOnlyPriceReply(opts.productQuery, roman);
    if (priceReply) {
      return {
        handled: true,
        reply: priceReply,
        template: "product_price_text",
      };
    }
  }

  return { handled: false };
}
