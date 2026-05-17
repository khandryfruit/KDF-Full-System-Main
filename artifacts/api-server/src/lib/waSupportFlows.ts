/**
 * Premium in-chat support flows — payment recovery, address, delivery, risk recovery.
 */
import { sendInteractiveButtons, sendCtaUrlMessage } from "./whatsapp.js";
import { resolveWaLang, type WaLang } from "./waPremiumJourney.js";
import { sendStandalonePaymentMenu } from "./waPaymentInChat.js";
import { buildDeliveryReply } from "./waIntentEngine.js";
import { isRomanUrduWa } from "./waProductBrain.js";
import type { ClassifiedMessage } from "./waIntentClassifier.js";

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

export const KDF_STORE = {
  name: "Khan Dry Fruit (KDF MART)",
  addressLines: [
    "M Block, Khokhar Chowk,",
    "Block M Phase 2 Johar Town,",
    "Lahore",
  ],
  phone: "04237444400",
  whatsapp: "03049996000",
  website: "https://www.khandryfruit.com",
  mapsQuery: "Khan Dry Fruit, Johar Town, Lahore",
};

export function buildMapsUrl(): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(KDF_STORE.mapsQuery)}`;
}

export async function sendPaymentIssueRecovery(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const body = opts.lang === "en"
    ? `Ji 😊\n\nI can help with that.\n\nDo you need to *verify payment* or see *transfer details*?\n\nSelect below 👇`
    : `Ji 😊\n\nMain madad karta hoon.\n\nKya *payment verify* karni hai ya *transfer details* chahiye?\n\nNeeche select karein 👇`;
  await sendInteractiveButtons({
    phone: opts.phone,
    text: body,
    buttons: [
      { id: "wa_info_pay_cod", title: "💵 COD" },
      { id: "wa_info_pay_bank", title: "🏦 Bank Transfer" },
      { id: "wa_info_pay_easy", title: "📱 Easypaisa" },
    ],
    settings: opts.waSettings,
    templateName: "payment_issue_recovery",
  });
}

export async function sendShopAddressCard(opts: {
  phone: string;
  textBody: string;
  waSettings: WaSettings;
  sendText?: (phone: string, text: string, template: string) => Promise<void>;
}): Promise<void> {
  const lang = resolveWaLang({}, opts.textBody);
  const { sendAddressWithLocationCta } = await import("./waConversationFlows.js");
  const sendText =
    opts.sendText ??
    (async (phone: string, text: string) => {
      const { sendWhatsAppMessage } = await import("./whatsapp.js");
      await sendWhatsAppMessage({ phone, text, settings: opts.waSettings });
    });
  await sendAddressWithLocationCta({
    phone: opts.phone,
    textBody: opts.textBody,
    lang,
    waSettings: opts.waSettings,
    sendText,
  });
}

export async function sendDeliveryInfoButtons(opts: {
  phone: string;
  textBody: string;
  waSettings: WaSettings;
  sendText: (phone: string, text: string, template: string) => Promise<void>;
}): Promise<void> {
  const { buildDeliveryConversationText } = await import("./waConversationFlows.js");
  const lang = resolveWaLang({}, opts.textBody);
  await opts.sendText(opts.phone, buildDeliveryConversationText(opts.textBody, lang), "delivery_conversation");
}

export async function sendRiskRecovery(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
  reason?: string;
  sendText?: (phone: string, text: string, template: string) => Promise<void>;
}): Promise<void> {
  const body = opts.lang === "en"
    ? `Ji 😊 Sorry for the trouble — I am here to help.\n\nTell me what happened, or call *${KDF_STORE.phone}* / WhatsApp *${KDF_STORE.whatsapp}*.`
    : `Ji 😊 Maafi — main madad ke liye hoon.\n\nMasla likh dein, ya call *${KDF_STORE.phone}* / WhatsApp *${KDF_STORE.whatsapp}*.`;
  const sendText =
    opts.sendText ??
    (async (phone: string, text: string) => {
      const { sendWhatsAppMessage } = await import("./whatsapp.js");
      await sendWhatsAppMessage({ phone, message: text, templateName: "risk_recovery_text" });
    });
  await sendText(opts.phone, body, "risk_recovery_text");
}

export async function sendIntentClarification(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
  sendText: (phone: string, text: string, template: string) => Promise<void>;
}): Promise<void> {
  const body = opts.lang === "en"
    ? "Ji 😊 I am here to help 😊\n\nYou can ask about *products*, *prices*, *delivery*, *payment*, or *orders* — just type your question."
    : "Ji 😊 Main madad ke liye hoon 😊\n\n*Product*, *price*, *delivery*, *payment*, ya *order* — jo poochna ho likh dein.";
  await opts.sendText(opts.phone, body, "support_conversation");
}

export async function tryHandleClassifiedSupport(opts: {
  phone: string;
  textBody: string;
  waSettings: WaSettings;
  classified: ClassifiedMessage;
  logStep?: (detail: Record<string, unknown>) => Promise<void>;
  sendText?: (phone: string, text: string, template: string) => Promise<void>;
}): Promise<boolean> {
  const lang = resolveWaLang({}, opts.textBody);
  const { intent, topic } = opts.classified;

  await opts.logStep?.({
    step: "support_route",
    intent,
    topic,
    reason: opts.classified.reason,
    blockProductCatalog: opts.classified.blockProductCatalog,
    text: opts.textBody.slice(0, 200),
  });

  if (intent === "payment_issue") {
    await sendPaymentIssueRecovery({ phone: opts.phone, lang, waSettings: opts.waSettings });
    return true;
  }
  if (intent === "payment_info") {
    const intro = lang === "en"
      ? "Ji 😊 I can help with payment.\n\nDo you need to verify a payment or see transfer details?"
      : "Ji 😊 Main payment mein madad karta hoon.\n\nKya payment verify karni hai ya transfer details chahiye?";
    const { sendWhatsAppMessage } = await import("./whatsapp.js");
    await sendWhatsAppMessage({ phone: opts.phone, message: intro, templateName: "payment_info_intro" });
    await sendStandalonePaymentMenu({ phone: opts.phone, lang, waSettings: opts.waSettings });
    return true;
  }
  if (intent === "address_faq") {
    await sendShopAddressCard({ phone: opts.phone, textBody: opts.textBody, waSettings: opts.waSettings });
    return true;
  }
  const sendText =
    opts.sendText ??
    (async (phone: string, text: string, template: string) => {
      const { sendWhatsAppMessage } = await import("./whatsapp.js");
      await sendWhatsAppMessage({ phone, message: text, templateName: template });
    });

  if (intent === "delivery") {
    await sendDeliveryInfoButtons({
      phone: opts.phone,
      textBody: opts.textBody,
      waSettings: opts.waSettings,
      sendText: async (p, t, tmpl) => { await sendText(p, t); await opts.logStep?.({ step: tmpl }); },
    });
    return true;
  }
  if (intent === "tracking") {
    const roman = isRomanUrduWa(opts.textBody);
    await sendText(
      opts.phone,
      roman
        ? "Ji 😊 Please send your *order number* or the *phone* used for the order — I will check status for you 😊"
        : "Ji 😊 *Order number* ya order wala *phone* bhej dein — status check kar leta hoon 😊",
    );
    return true;
  }
  if (intent === "clarify" || intent === "support") {
    await sendIntentClarification({
      phone: opts.phone,
      lang,
      waSettings: opts.waSettings,
      sendText: async (p, t) => { await sendText(p, t); },
    });
    return true;
  }
  if (intent === "complaint" || (intent === "support" && /\b(problem|issue|masla)\b/i.test(opts.textBody))) {
    await sendRiskRecovery({
      phone: opts.phone,
      lang,
      waSettings: opts.waSettings,
      sendText: async (p, t, tmpl) => { await sendText(p, t, tmpl); },
    });
    return true;
  }
  return false;
}
