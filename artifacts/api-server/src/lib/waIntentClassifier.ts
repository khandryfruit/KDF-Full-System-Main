/**
 * Unified WhatsApp intent classification — support/payment BEFORE product search.
 */
import { isDeliveryOnlyMessage, isTrackingOnlyMessage } from "./waIntentEngine.js";
import {
  isPureGreetingMessage,
  isMixedGreetingProductMessage,
  productRootsInMessage,
  extractProductQueryFromMessage,
} from "./waProductBrain.js";
import {
  isBareProductMention,
  isStandaloneFaqMessage,
  hasExplicitProductShowIntent,
  isProductEducationMessage,
} from "./waSalesConversation.js";
import { productRootTermsFromQuery } from "./shopifyProductSearch.js";

export type WaTopic =
  | "payment"
  | "address"
  | "delivery"
  | "tracking"
  | "order"
  | "product"
  | "support"
  | "greeting"
  | "general";

export type WaClassifiedIntent =
  | "greeting"
  | "payment_issue"
  | "payment_info"
  | "address_faq"
  | "delivery"
  | "tracking"
  | "support"
  | "complaint"
  | "conversation"
  | "variant_selection"
  | "product_search"
  | "pricing"
  | "recommendation"
  | "bulk_order"
  | "order_start"
  | "cancellation"
  | "clarify"
  | "general";

export type ClassifiedMessage = {
  intent: WaClassifiedIntent;
  topic: WaTopic;
  confidence: number;
  reason: string;
  productQuery?: string;
  blockProductCatalog: boolean;
};

export type IntentContext = {
  lastTopic?: string;
  lastIntent?: string;
  currentState?: string;
};

function norm(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(t: string, words: string[]): boolean {
  return words.some((w) => t === w || t.includes(` ${w} `) || t.startsWith(`${w} `) || t.endsWith(` ${w}`) || t === w);
}

/** Payment link / transfer / checkout failures */
export function isPaymentIssueMessage(text: string): boolean {
  const t = norm(text);
  if (!t) return false;
  const pay = /\b(payment|pay|paid|transfer|easypaisa|jazzcash|jazz cash|bank|cod|checkout|receipt|screenshot)\b/i.test(t);
  const fail = /\b(link|page|url|website|open|khul|nahi|fail|failed|broken|error|issue|problem|masla|stuck|kaam nahi|not working|nahi ho|nahin)\b/i.test(t);
  if (/\bpayment link\b/i.test(t)) return true;
  if (/\blink\b.*\b(open|khul|nahi|fail|broken)\b/i.test(t) && pay) return true;
  if (pay && fail) return true;
  if (/\b(payment|pay)\b/i.test(t) && /\b(help|madad|masla|problem)\b/i.test(t)) return true;
  return false;
}

export function isPaymentInfoMessage(text: string): boolean {
  const t = norm(text);
  if (isPaymentIssueMessage(text)) return false;
  return /\b(payment method|payment methods|payment option|kaise pay|kesay pay|cod|easypaisa|bank transfer)\b/i.test(t)
    || /^(payment|payments)$/i.test(t.trim());
}

export function isAddressFaqMessage(text: string): boolean {
  const t = norm(text);
  if (/\b(deliver|delivery|shipping|courier)\b/i.test(t)) return false;
  return /\b(address|location|shop address|store address|dokan|dukan|kahan se|kaha se|kahan hain|where are you|shop kahan|office)\b/i.test(t)
    || /^(address|location|shop|store)$/i.test(t.trim());
}

export function isAmbiguousFollowUp(text: string): boolean {
  const t = norm(text);
  return t.length <= 40 && /\b(nahi|not|fail|broken|stuck|kaam nahi|not working|nahi ho|error|issue|problem|masla|help)\b/i.test(t);
}

export function shouldBlockProductCatalog(classified: ClassifiedMessage): boolean {
  if (classified.blockProductCatalog) return true;
  const blocked: WaClassifiedIntent[] = [
    "payment_issue", "payment_info", "address_faq", "delivery", "tracking",
    "support", "complaint", "conversation", "greeting", "clarify",
  ];
  return blocked.includes(classified.intent);
}

export function classifyWaMessage(text: string, ctx: IntentContext = {}): ClassifiedMessage {
  const t = norm(text);
  const raw = String(text ?? "").trim();
  const lastTopic = String(ctx.lastTopic ?? "").toLowerCase();

  if (!t) {
    return { intent: "general", topic: "general", confidence: 0.2, reason: "empty", blockProductCatalog: true };
  }

  if (isMixedGreetingProductMessage(raw)) {
    return {
      intent: "product_search",
      topic: "product",
      confidence: 0.9,
      reason: "mixed greeting + product intent",
      productQuery: extractProductQueryFromMessage(raw),
      blockProductCatalog: true,
    };
  }

  if (/\b(bat|baat)\b/.test(t) && /\b(kr|kre|karo|karni|krna|karna)\b/.test(t)) {
    return { intent: "conversation", topic: "support", confidence: 0.9, reason: "talk to human phrase", blockProductCatalog: true };
  }

  if (isPureGreetingMessage(raw)) {
    return { intent: "greeting", topic: "greeting", confidence: 0.92, reason: "pure greeting", blockProductCatalog: true };
  }

  if (isProductEducationMessage(raw)) {
    return {
      intent: "conversation",
      topic: "product_education",
      confidence: 0.9,
      reason: "benefits/usage/education question",
      productQuery: extractProductQueryFromMessage(raw),
      blockProductCatalog: true,
    };
  }

  if (isAmbiguousFollowUp(raw) && (lastTopic === "payment" || lastTopic === "payment_issue")) {
    return {
      intent: "payment_issue",
      topic: "payment",
      confidence: 0.9,
      reason: "context: payment topic + failure follow-up",
      blockProductCatalog: true,
    };
  }

  if (isPaymentIssueMessage(raw)) {
    return {
      intent: "payment_issue",
      topic: "payment",
      confidence: 0.95,
      reason: "payment failure / link issue",
      blockProductCatalog: true,
    };
  }

  if (isPaymentInfoMessage(raw)) {
    return {
      intent: "payment_info",
      topic: "payment",
      confidence: 0.9,
      reason: "payment methods inquiry",
      blockProductCatalog: true,
    };
  }

  if (isAddressFaqMessage(raw)) {
    return { intent: "address_faq", topic: "address", confidence: 0.92, reason: "shop address FAQ", blockProductCatalog: true };
  }

  if (isDeliveryOnlyMessage(raw)) {
    return { intent: "delivery", topic: "delivery", confidence: 0.92, reason: "delivery only", blockProductCatalog: true };
  }

  if (isTrackingOnlyMessage(raw) || hasAny(t, ["track order", "order status", "parcel kahan", "mera order"])) {
    return { intent: "tracking", topic: "tracking", confidence: 0.9, reason: "tracking", blockProductCatalog: true };
  }

  if (hasAny(t, ["cancel order", "order cancel", "cancel kr"])) {
    return { intent: "cancellation", topic: "order", confidence: 0.94, reason: "cancel", blockProductCatalog: true };
  }

  if (hasAny(t, ["complaint", "shikayat", "refund", "return", "bad quality", "damage"])) {
    return { intent: "complaint", topic: "support", confidence: 0.9, reason: "complaint", blockProductCatalog: true };
  }

  if (hasAny(t, ["human", "agent", "representative", "real person", "call me", "baat karna", "bat krna"])) {
    return { intent: "conversation", topic: "support", confidence: 0.88, reason: "human support", blockProductCatalog: true };
  }

  if (isStandaloneFaqMessage(raw)) {
    if (/^(price|prices|qeemat|rate)/i.test(t)) {
      return { intent: "support", topic: "product", confidence: 0.85, reason: "standalone price FAQ", blockProductCatalog: false };
    }
    if (/^(address|location|shop|store)/i.test(t)) {
      return { intent: "address_faq", topic: "address", confidence: 0.88, reason: "standalone address FAQ", blockProductCatalog: true };
    }
    return { intent: "delivery", topic: "delivery", confidence: 0.85, reason: "standalone delivery FAQ", blockProductCatalog: true };
  }

  const productWords = [
    "almond", "badam", "pista", "kaju", "akhrot", "walnut", "khajoor", "anjeer", "kishmish", "dry fruit", "nuts",
  ];
  const hasProductWord = productWords.some((w) => t.includes(w)) || productRootsInMessage(raw).length > 0;

  if (hasAny(t, ["bulk", "wholesale", "carton"]) && hasProductWord) {
    return {
      intent: "bulk_order",
      topic: "product",
      confidence: 0.9,
      reason: "bulk",
      productQuery: extractProductQueryFromMessage(raw),
      blockProductCatalog: false,
    };
  }

  if (hasProductWord && hasAny(t, ["order", "buy", "checkout", "bill", "mangwana"])) {
    return {
      intent: "order_start",
      topic: "order",
      confidence: 0.9,
      reason: "product + order",
      productQuery: extractProductQueryFromMessage(raw),
      blockProductCatalog: false,
    };
  }

  if (isBareProductMention(raw) && !hasExplicitProductShowIntent(raw)) {
    return {
      intent: "product_search",
      topic: "product",
      confidence: 0.82,
      reason: "bare product mention",
      productQuery: extractProductQueryFromMessage(raw),
      blockProductCatalog: false,
    };
  }

  const roots = productRootTermsFromQuery(raw);
  if (roots.length > 0 && t.split(/\s+/).length <= 12 && !hasAny(t, ["payment", "link", "track", "address"])) {
    if (hasAny(t, ["price", "rate", "qeemat", "kitna"])) {
      return {
        intent: "pricing",
        topic: "product",
        confidence: 0.85,
        reason: `price + ${roots[0]}`,
        productQuery: extractProductQueryFromMessage(raw),
        blockProductCatalog: false,
      };
    }
    if (t.split(/\s+/).length <= 2 && !hasExplicitProductShowIntent(raw)) {
      return {
        intent: "product_search",
        topic: "product",
        confidence: 0.75,
        reason: `catalog root: ${roots[0]}`,
        productQuery: extractProductQueryFromMessage(raw),
        blockProductCatalog: false,
      };
    }
  }

  if (/^[1-9]$/.test(t)) {
    return { intent: "variant_selection", topic: "order", confidence: 0.9, reason: "numeric menu", blockProductCatalog: true };
  }

  if (hasAny(t, ["help", "madad", "support", "sawal", "question"])) {
    return { intent: "support", topic: "support", confidence: 0.75, reason: "support keyword", blockProductCatalog: true };
  }

  if (hasProductWord && !isPaymentIssueMessage(raw)) {
    return {
      intent: "product_search",
      topic: "product",
      confidence: 0.6,
      reason: "weak product signal",
      productQuery: extractProductQueryFromMessage(raw),
      blockProductCatalog: false,
    };
  }

  if (isAmbiguousFollowUp(raw)) {
    return {
      intent: "clarify",
      topic: (lastTopic as WaTopic) || "general",
      confidence: 0.55,
      reason: "ambiguous follow-up",
      blockProductCatalog: true,
    };
  }

  return { intent: "general", topic: "general", confidence: 0.45, reason: "no strong signal", blockProductCatalog: false };
}

/** Map legacy WaIntent string from classifyWaMessage */
export function toLegacyWaIntent(c: ClassifiedMessage): string {
  if (c.intent === "payment_issue" || c.intent === "payment_info") return "support";
  return c.intent;
}
