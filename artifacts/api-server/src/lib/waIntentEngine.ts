import { db, shippingRulesTable, sameDayDeliverySettingsTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import {
  loadConversationMemory,
  persistConversationTurn,
  shouldBlockRepeatedReply,
  isActiveCommerceFlow,
} from "./whatsappConversationMemory.js";

export type WaDeterministicIntent =
  | "delivery"
  | "pricing"
  | "tracking"
  | "support"
  | "order_resume";

const DELIVERY_WORDS = [
  "delivery", "deliver", "shipping", "ship", "courier", "bhejna", "bhej do", "dispatch",
  "parcel", "same day", "sameday", "lahore delivery", "delivery charges", "delivery fee",
  "delivery cost", "kitne ki delivery", "delivery kitni", "ڈیلیوری", "ترسیل",
];

const PRODUCT_HINT_WORDS = [
  "badam", "almond", "pista", "kaju", "akhrot", "walnut", "khajoor", "anjeer", "kishmish",
  "بادام", "پستہ", "کاجو", "اخروٹ", "kg", "gram", "price", "rate", "qeemat",
];

function normalizeIntentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isDeliveryOnlyMessage(text: string): boolean {
  const t = normalizeIntentText(text);
  if (!t) return false;
  const hasDelivery = DELIVERY_WORDS.some((w) => t === w || t.includes(w));
  if (!hasDelivery) return false;
  const hasProduct = PRODUCT_HINT_WORDS.some((w) => t.includes(w));
  return !hasProduct || t.length <= 24;
}

export function isTrackingOnlyMessage(text: string): boolean {
  const t = normalizeIntentText(text);
  return /\b(track|tracking|order status|mera order|parcel kahan|delivery kahan)\b/.test(t);
}

function isRomanUrdu(text: string): boolean {
  return /[a-z]/i.test(text) && !/[اآبپتٹثجچحخدڈذرڑزژسشصضطظعغفقکگلمنوہھیے]/.test(text);
}

async function buildDeliveryReply(textBody: string): Promise<string> {
  const roman = isRomanUrdu(textBody);
  const rules = await db
    .select()
    .from(shippingRulesTable)
    .where(eq(shippingRulesTable.enabled, true))
    .orderBy(asc(shippingRulesTable.priority), asc(shippingRulesTable.id))
    .catch(() => []);

  let lahorePrice = 300;
  let otherMin = 300;
  let otherMax = 500;
  let freeThreshold = 10000;

  for (const rule of rules as any[]) {
    const cities = Array.isArray(rule.cities) ? rule.cities.map((c: string) => String(c).toLowerCase()) : [];
    const price = Number(rule.price ?? 0);
    if (cities.some((c: string) => c.includes("lahore"))) lahorePrice = price || lahorePrice;
    else if (price > 0) {
      otherMin = Math.min(otherMin, price);
      otherMax = Math.max(otherMax, price);
    }
    const minVal = Number(rule.minValue ?? 0);
    if (minVal >= 10000 && Number(rule.price) === 0) freeThreshold = minVal;
  }

  let sameDayLine = "";
  try {
    const [s] = await db.select().from(sameDayDeliverySettingsTable).limit(1);
    if (s?.enabled) {
      const cutoffHour = s.cutoffHour ?? 15;
      const suffix = cutoffHour >= 12 ? "PM" : "AM";
      const hour = cutoffHour % 12 === 0 ? 12 : cutoffHour % 12;
      sameDayLine = roman
        ? `\n\n${s.city} mein same day delivery available hai (Rs.${s.price}), order ${hour}:00 ${suffix} se pehle.`
        : `\n\n${s.city} میں same day delivery available ہے (Rs.${s.price})، order ${hour}:00 ${suffix} سے پہلے۔`;
    }
  } catch { /* optional */ }

  if (roman) {
    return `Ji 😊

Delivery charges:

Lahore: Rs.${lahorePrice}
Other cities: Rs.${otherMin}–${otherMax}
Orders above Rs.${freeThreshold.toLocaleString("en-PK")}: FREE delivery 👍${sameDayLine}

Aap city bata dein to exact estimate bhi de sakta hoon.`;
  }

  return `جی 😊

Delivery charges:

لاہور: Rs.${lahorePrice}
دیگر شہروں میں: Rs.${otherMin}–${otherMax}
Rs.${freeThreshold.toLocaleString("en-PK")}+ پر free delivery 👍${sameDayLine}

آپ city بتا دیں تو exact estimate بھی دے سکتا ہوں۔`;
}

async function buildContextualPriceReply(phone: string, textBody: string): Promise<string | null> {
  const mem = await loadConversationMemory(phone);
  const roman = isRomanUrdu(textBody);
  if (mem.selectedProductName) {
    return roman
      ? `Ji 😊 aap ne *${mem.selectedProductName}*${mem.selectedVariantTitle ? ` (${mem.selectedVariantTitle})` : ""} select kiya hua hai. Variant number ya weight bhej dein, main exact price confirm kar deta hoon.`
      : `جی 😊 آپ نے *${mem.selectedProductName}*${mem.selectedVariantTitle ? ` (${mem.selectedVariantTitle})` : ""} select کیا ہوا ہے۔ variant number یا weight بھیج دیں، میں exact price confirm کر دیتا ہوں۔`;
  }
  return roman
    ? "Ji 😊 kis product ki price chahiye? Jaise: badam 500g, akhrot 1kg, pista."
    : "جی 😊 کس product کی price چاہیے؟ جیسے: badam 500g، akhrot 1kg، pista۔";
}

async function buildOrderResumeHint(phone: string): Promise<string | null> {
  const mem = await loadConversationMemory(phone);
  if (!isActiveCommerceFlow(mem.state)) return null;
  const roman = true;
  const product = mem.selectedProductName;
  if (product) {
    return roman
      ? `Ji 😊 order continue hai — *${product}*${mem.selectedVariantTitle ? ` (${mem.selectedVariantTitle})` : ""}. Agla step complete karne ke liye wahi detail bhej dein jo main ne manga thi.`
      : `جی 😊 order continue ہے — *${product}*${mem.selectedVariantTitle ? ` (${mem.selectedVariantTitle})` : ""}۔ اگلا step complete کرنے کے لیے وہی detail بھیج دیں جو میں نے مانگی تھی۔`;
  }
  return null;
}

/**
 * Returns a deterministic reply when we should NOT call OpenAI (delivery, tracking prompt, etc.)
 */
export async function tryDeterministicWaReply(opts: {
  phone: string;
  textBody: string;
  currentState: string;
  detectedIntent: string;
  productQuery?: string;
}): Promise<string | null> {
  const { phone, textBody, currentState, detectedIntent, productQuery } = opts;
  const t = normalizeIntentText(textBody);
  const inCheckout = isActiveCommerceFlow(currentState);

  if (isDeliveryOnlyMessage(textBody) || detectedIntent === "delivery") {
    return buildDeliveryReply(textBody);
  }

  if (isTrackingOnlyMessage(textBody) || detectedIntent === "tracking") {
    const roman = isRomanUrdu(textBody);
    return roman
      ? "Ji 😊 order track karne ke liye apna order number, tracking ID, ya phone number bhej dein."
      : "جی 😊 order track کرنے کے لیے اپنا order number، tracking ID، یا phone number بھیج دیں۔";
  }

  if (
    (detectedIntent === "pricing" || /\b(price|rate|qeemat|kitna|how much)\b/.test(t)) &&
    !productQuery &&
    t.split(" ").length <= 4
  ) {
    return buildContextualPriceReply(phone, textBody);
  }

  if (inCheckout && !isDeliveryOnlyMessage(textBody) && !isTrackingOnlyMessage(textBody)) {
    const resume = await buildOrderResumeHint(phone);
    if (resume && /^(order|buy|price|delivery|help|menu)$/i.test(t)) return resume;
  }

  return null;
}

export async function sendDeterministicWaReply(opts: {
  phone: string;
  textBody: string;
  reply: string;
  intent: string;
  send: (phone: string, message: string, templateName: string) => Promise<unknown>;
}): Promise<boolean> {
  const mem = await loadConversationMemory(opts.phone);
  let reply = opts.reply;
  if (shouldBlockRepeatedReply(reply, mem) && !/^[1-9]$/.test(opts.textBody.trim())) {
    const roman = isRomanUrdu(opts.textBody);
    reply = roman
      ? "Ji 😊 delivery / price / order ke bare mein aur kya confirm karna hai?"
      : "جی 😊 delivery / price / order کے بارے میں اور کیا confirm کرنا ہے؟";
  }
  await opts.send(opts.phone, reply, "deterministic_reply");
  await persistConversationTurn(opts.phone, {
    intent: opts.intent,
    topic: opts.intent,
    assistantReply: reply,
    deliveryDiscussed: opts.intent === "delivery",
  });
  return true;
}
