/**
 * Hybrid replies: human text first, context-aware quick-action template second.
 */
import { sendInteractiveButtons, sendInteractiveList } from "./whatsapp.js";
import { resolveWaLang, type WaLang } from "./waPremiumJourney.js";
import { extractProductQueryFromMessage, isRomanUrduWa } from "./waProductBrain.js";
import type { ClassifiedMessage } from "./waIntentClassifier.js";
import { isPaymentIssueMessage } from "./waIntentClassifier.js";
import { isProductEducationMessage } from "./waSalesConversation.js";

export type QuickActionContext =
  | "default"
  | "greeting"
  | "product"
  | "delivery"
  | "payment"
  | "payment_issue"
  | "support"
  | "orders"
  | "education"
  | "none";

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

export type QuickActionItem = { id: string; title: string; description?: string };

const QA = {
  order: "wa_qa_order",
  payment: "wa_qa_payment",
  delivery: "wa_qa_delivery",
  track: "wa_qa_track",
  support: "wa_qa_support",
  orders: "wa_qa_orders",
  prices: "wa_qa_prices",
  quality: "wa_qa_quality",
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

  if (intent === "payment_issue" || isPaymentIssueMessage(text)) return "payment_issue";
  if (intent === "payment_info" || topic === "payment") return "payment";
  if (intent === "delivery" || topic === "delivery") return "delivery";
  if (intent === "tracking" || topic === "tracking") return "orders";
  if (intent === "address_faq") return "support";

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
    /\b(badam|almond|pista|kaju|akhrot|dry fruit|nuts)\b/i.test(text)
  ) {
    return "product";
  }

  if (intent === "greeting" || /^(hi|hello|hey|salam|assalam|aoa)\b/i.test(text.trim())) return "greeting";
  if (intent === "support" || intent === "complaint") return "support";

  return "default";
}

export function buildQuickActions(context: QuickActionContext, lang: WaLang): QuickActionItem[] {
  const en = lang === "en";
  switch (context) {
    case "product":
      return [
        { id: QA.order, title: "🛒 Order", description: en ? "Start order" : "Order shuru" },
        { id: QA.prices, title: "💰 Prices", description: en ? "See prices" : "Prices dekhein" },
        { id: QA.quality, title: "⭐ Quality", description: en ? "Quality info" : "Quality" },
        { id: QA.support, title: "📞 Support", description: en ? "Talk to us" : "Madad" },
      ];
    case "delivery":
      return [
        { id: QA.delivery, title: "🚚 Delivery", description: en ? "Charges & time" : "Charges" },
        { id: QA.track, title: "📦 Track Order", description: en ? "Order status" : "Track" },
        { id: QA.support, title: "📞 Support", description: en ? "Help" : "Madad" },
      ];
    case "payment":
    case "payment_issue":
      return [
        { id: QA.payment, title: "💳 Payment", description: en ? "COD / Bank / Easy" : "Payment methods" },
        { id: QA.support, title: "📞 Support", description: en ? "Help" : "Madad" },
        { id: QA.orders, title: "📋 Orders", description: en ? "Your orders" : "Aapke orders" },
      ];
    case "orders":
      return [
        { id: QA.orders, title: "📋 Orders", description: en ? "Status & history" : "Orders" },
        { id: QA.track, title: "📦 Track", description: en ? "Track parcel" : "Track" },
        { id: QA.support, title: "📞 Support", description: en ? "Help" : "Madad" },
      ];
    case "education":
      return [
        { id: QA.order, title: "🛒 Order", description: en ? "Buy now" : "Order" },
        { id: QA.prices, title: "💰 Prices", description: en ? "Price list" : "Prices" },
        { id: QA.quality, title: "⭐ Quality", description: en ? "More info" : "Quality" },
        { id: QA.support, title: "📞 Support", description: en ? "Help" : "Madad" },
      ];
    case "support":
      return [
        { id: QA.call, title: "📞 Call", description: KDF_STORE_PHONE },
        { id: QA.whatsapp, title: "💬 WhatsApp", description: "Chat with us" },
        { id: QA.website, title: "🌐 Website", description: "khandryfruit.com" },
      ];
    case "greeting":
    case "default":
    default:
      return [
        { id: QA.order, title: "🛒 Order", description: en ? "Place order" : "Order karein" },
        { id: QA.payment, title: "💳 Payment", description: en ? "Payment info" : "Payment" },
        { id: QA.delivery, title: "🚚 Delivery", description: en ? "Delivery charges" : "Delivery" },
        { id: QA.track, title: "📦 Track Order", description: en ? "Track parcel" : "Track" },
        { id: QA.orders, title: "📋 Orders", description: en ? "Past orders" : "Orders" },
        { id: QA.support, title: "📞 Support", description: en ? "Call / chat" : "Madad" },
      ];
  }
}

const KDF_STORE_PHONE = "04237444400";

function quickActionsFooter(lang: WaLang): string {
  return lang === "en" ? "Tap an option below 👇" : "Neeche option select karein 👇";
}

function quickActionsListLabel(lang: WaLang): string {
  return lang === "en" ? "Quick Actions" : "Quick Actions";
}

/** Send quick-action row (list if 4+, else 3 buttons). */
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
    buttonLabel: quickActionsListLabel(lang).slice(0, 20),
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
