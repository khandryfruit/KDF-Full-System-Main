/**
 * Intent switching — reset stale checkout/product context on new topics (greeting, etc.).
 */
import { isGreeting, setConversationState } from "./whatsapp.js";
import { isMixedGreetingProductMessage, isPureGreetingMessage } from "./waProductBrain.js";

export function isGreetingLikeMessage(text: string, menuKeywords?: string | null): boolean {
  const raw = String(text ?? "").trim();
  if (!raw) return false;
  const n = raw.toLowerCase();
  if (/\b(bat|baat)\b/.test(n) && /\b(kr|kre|karo|karni|krna|karna)\b/.test(n)) return false;
  if (isMixedGreetingProductMessage(raw)) return true;
  if (isPureGreetingMessage(raw)) return true;
  if (isGreeting(raw, menuKeywords ?? undefined)) return true;
  return false;
}

/** "Hello bat kre" / talk-to-human — not a catalog or welcome greeting */
export function isTalkToHumanPhrase(text: string): boolean {
  const n = String(text ?? "").trim().toLowerCase();
  return /\b(bat|baat)\b/.test(n) && /\b(kr|kre|karo|karni|krna|karna)\b/.test(n);
}

/** Conversation opener — not a product catalog query */
export function isConversationOpenerNotCatalog(text: string): boolean {
  if (isTalkToHumanPhrase(text)) return false;
  return isGreetingLikeMessage(text) || isMixedGreetingProductMessage(text);
}

export async function resetSalesContextForGreeting(opts: {
  phone: string;
  preserve?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const preserve = opts.preserve ?? {};
  const next: Record<string, unknown> = {
    preferredLanguage: preserve.preferredLanguage ?? preserve.waLang,
    waLang: preserve.waLang ?? preserve.preferredLanguage,
    greetedAt: new Date().toISOString(),
    topicResetAt: new Date().toISOString(),
  };
  await setConversationState(opts.phone, "wa_sales_chat", next);
  return next;
}

/** Map legacy menu button ids → quick-action handlers */
export const LEGACY_MENU_TO_QA: Record<string, string> = {
  payment_methods: "wa_qa_payment",
  shop_products: "wa_qa_order",
  track_order: "wa_qa_track",
  track_again: "wa_qa_track",
  talk_support: "wa_qa_support",
  main_menu: "wa_qa_support",
};

export function resolveQuickActionId(interactionId: string): string {
  return LEGACY_MENU_TO_QA[interactionId] ?? interactionId;
}
