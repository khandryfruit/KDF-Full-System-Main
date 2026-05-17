/**
 * Guards for human-like AI sales — no catalog spam, no repeat welcome, education-first.
 */
import { hasExplicitProductShowIntent, isProductEducationMessage } from "./waSalesConversation.js";
import { loadConversationMemory } from "./whatsappConversationMemory.js";

export { isProductEducationMessage } from "./waSalesConversation.js";

const GREETING_PHRASES = [
  "assalam o alaikum",
  "assalamu alaikum",
  "khush aamdeed",
  "welcome to khan",
  "welcome to *khan",
  "khan dry fruits mein khush",
];

export function isOrderReadyMessage(text: string): boolean {
  const t = String(text ?? "").toLowerCase();
  return /\b(order|buy|purchase|book|send|bhej|mangwana|bill|checkout|lena hai|chahiye ab|place order)\b/i.test(t) && !isProductEducationMessage(text);
}

export function shouldSkipAiCatalogPreload(opts: {
  text: string;
  intent: string;
  state: string;
}): boolean {
  const { text, intent, state } = opts;
  if (isProductEducationMessage(text)) return true;
  if (intent === "conversation" || intent === "support" || intent === "complaint" || intent === "greeting") return true;
  if (intent === "delivery" || intent === "tracking") return true;
  if (/^(delivery|shipping|address|location|payment|help|madad)\b/i.test(text.trim())) return true;
  if (!isOrderReadyMessage(text) && !hasExplicitProductShowIntent(text)) {
    if (intent === "product_search" && isProductEducationMessage(text)) return true;
    if (intent === "conversation") return true;
  }
  if (/^wa_order_await_/.test(state) || state === "wa_sales_chat") return true;
  return false;
}

export function looksLikeRepeatWelcome(reply: string): boolean {
  const n = String(reply ?? "").toLowerCase().replace(/\s+/g, " ");
  return GREETING_PHRASES.some((p) => n.includes(p)) && n.length < 280;
}

export async function hasConversationStarted(phone: string): Promise<boolean> {
  const mem = await loadConversationMemory(phone);
  if (mem.lastIntent && mem.lastIntent !== "greeting") return true;
  if (mem.selectedProductName || mem.city || mem.customerName) return true;
  if (mem.recentAssistantReplies.length > 0) return true;
  const greeted = Boolean((mem.stateData as any)?.greetedAt);
  return greeted || mem.recentAssistantReplies.length > 0;
}

export function buildGreetingContinueReply(text: string): string {
  const roman = /[a-z]/i.test(text) && !/[اآبپتٹثجچحخدڈذرڑزژسشصضطظعغفقکگلمنوہھیے]/.test(text);
  return roman
    ? "Ji 😊 Batayein, aaj kis cheez mein madad chahiye? Product, price, delivery ya order 😊"
    : "جی 😊 بتائیے، آج کس چیز میں مدد چاہیے؟ Product، price، delivery یا order 😊";
}
