/**
 * Hybrid replies: human text first, context-aware quick-action template second (V5).
 */
import { sendInteractiveButtons, sendInteractiveList } from "./whatsapp.js";
import { resolveWaLang, type WaLang } from "./waPremiumJourney.js";
import { extractProductQueryFromMessage, isRomanUrduWa, isMixedGreetingProductMessage } from "./waProductBrain.js";
import type { ClassifiedMessage } from "./waIntentClassifier.js";
import { isPaymentIssueMessage } from "./waIntentClassifier.js";
import { isProductEducationMessage } from "./waSalesConversation.js";

export type QuickActionContext =
  | "greeting"
  | "product"
  | "delivery"
  | "payment"
  | "payment_issue"
  | "support"
  | "orders"
  | "education"
  | "mixed_greeting_product"
  | "none";

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

export type QuickActionItem = { id: string; title: string; description?: string };

export const QA = {
  order: "wa_qa_order",
  payment: "wa_qa_payment",
  delivery: "wa_qa_delivery",
  track: "wa_qa_track",
  support: "wa_qa_support",
  orders: "wa_qa_orders",
  prices: "wa_qa_prices",
  benefits: "wa_qa_benefits",
  quality: "wa_qa_quality",
  buy: "wa_qa_buy",
  call: "wa_qa_call",
  whatsapp: "wa_qa_whatsapp",
  website: "wa_qa_website",
  ordersStatus: "wa_qa_orders_status",
  ordersPast: "wa_qa_orders_past",
  ordersTrack: "wa_qa_orders_track",
} as const;

export function resolveQuickActionContext(opts: {
  textBody?: string;
  classified?: ClassifiedMessage | null;
  intent?: string;
  stateData?: Record<string, unknown>;
  currentState?: string;
}): QuickActionContext {
  const state = String(opts.currentState ?? "");
  if (/^wa_order_await_/.test(state)) return "none";

  const text = String(opts.textBody ?? "");
  const intent = opts.classified?.intent ?? opts.intent ?? "";
  const topic = opts.classified?.topic ?? "";

  if (isMixedGreetingProductMessage(text)) return "mixed_greeting_product";

  if (intent === "payment_issue" || isPaymentIssueMessage(text)) return "payment_issue";
  if (intent === "payment_info" || topic === "payment") return "payment";
  if (intent === "delivery" || topic === "delivery") return "delivery";
  if (intent === "tracking" || topic === "tracking") return "orders";
  if (intent === "address_faq") return "support";
  if (intent === "complaint") return "support";

  if (isProductEducationMessage(text) || (intent === "conversation" && /faide|fayde|benefit|quality|review/i.test(text))) {
    return "education";
  }

  const productQ =
    String(opts.stateData?.pendingEducationQuery ?? opts.stateData?.pendingProductQuery ?? "").trim() ||
    extractProductQueryFromMessage(text);
  if (
    productQ.length >= 2 ||
    intent === "product_search" ||
    intent === "pricing" ||
    intent === "recommendation" ||
    /\b(badam|almond|pista|kaju|akhrot|dry fruit|nuts|chahiye|chahie)\b/i.test(text)
  ) {
    return "product";
  }

  if (intent === "greeting") return "greeting";
  if (intent === "support") return "support";

  return "greeting";
}

/** V5: minimal relevant buttons per context */
export function buildQuickActions(context: QuickActionContext, lang: WaLang): QuickActionItem[] {
  switch (context) {
    case "greeting":
      return [
        { id: QA.order, title: "🛒 Order" },
        { id: QA.support, title: "📞 Support" },
      ];
    case "mixed_greeting_product":
    case "product":
    case "education":
      return [
        { id: QA.prices, title: "💰 Price" },
        { id: QA.benefits, title: "⭐ Benefits" },
        { id: QA.buy, title: "🛒 Buy" },
      ];
    case "delivery":
      return [
        { id: QA.delivery, title: "🚚 Delivery" },
        { id: QA.track, title: "📦 Track" },
        { id: QA.support, title: "📞 Support" },
      ];
    case "payment":
    case "payment_issue":
      return [{ id: QA.payment, title: "💳 Payment" }];
    case "orders":
      return [
        { id: QA.orders, title: "📋 Orders" },
        { id: QA.track, title: "📦 Track" },
        { id: QA.support, title: "📞 Support" },
      ];
    case "support":
      return [
        { id: QA.call, title: "📞 Call" },
        { id: QA.website, title: "🌐 Website" },
        { id: QA.whatsapp, title: "💬 WhatsApp" },
      ];
    default:
      return [
        { id: QA.order, title: "🛒 Order" },
        { id: QA.support, title: "📞 Support" },
      ];
  }
}

function quickActionsFooter(lang: WaLang): string {
  return lang === "en" ? "Quick actions 👇" : "Neeche option 👇";
}

export async function sendQuickActionTemplate(opts: {
  phone: string;
  context: QuickActionContext;
  lang?: WaLang;
  waSettings: WaSettings;
  textBody?: string;
}): Promise<void> {
  if (opts.context === "none") return;
  const lang = opts.lang ?? resolveWaLang({}, opts.textBody ?? "");
  const items = buildQuickActions(opts.context, lang);
  if (!items.length) return;

  if (items.length <= 3) {
    await sendInteractiveButtons({
      phone: opts.phone,
      text: quickActionsFooter(lang),
      buttons: items.map((i) => ({ id: i.id, title: i.title.slice(0, 20) })),
      settings: opts.waSettings,
      templateName: `quick_actions_${opts.context}`,
    });
    return;
  }

  await sendInteractiveList({
    phone: opts.phone,
    body: quickActionsFooter(lang),
    buttonLabel: "Menu",
    rows: items.map((i) => ({
      id: i.id,
      title: i.title.slice(0, 24),
      description: i.description?.slice(0, 72),
    })),
    settings: opts.waSettings,
    templateName: `quick_actions_list_${opts.context}`,
  });
}

export async function attachQuickActions(opts: {
  phone: string;
  waSettings: WaSettings;
  textBody?: string;
  classified?: ClassifiedMessage | null;
  intent?: string;
  stateData?: Record<string, unknown>;
  currentState?: string;
  context?: QuickActionContext;
}): Promise<void> {
  const context =
    opts.context ??
    resolveQuickActionContext({
      textBody: opts.textBody,
      classified: opts.classified,
      intent: opts.intent,
      stateData: opts.stateData,
      currentState: opts.currentState,
    });
  if (context === "none") return;
  const lang = resolveWaLang(opts.stateData ?? {}, opts.textBody ?? "");
  await sendQuickActionTemplate({
    phone: opts.phone,
    context,
    lang,
    waSettings: opts.waSettings,
    textBody: opts.textBody,
  });
}

export { QA as WA_QUICK_ACTION_IDS };
