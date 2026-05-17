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
    ? `Ji 😊\n\nIt looks like the *payment page / link* had an issue.\n\nNo problem — you can complete payment *here in chat* 👇`
    : `Ji 😊\n\nLagta hai *payment page / link* issue kar rahi hai.\n\nKoi baat nahi — aap *yahin chat* mein payment select kar sakte hain 👇`;
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
}): Promise<void> {
  const roman = isRomanUrduWa(opts.textBody);
  const lang = resolveWaLang({}, opts.textBody);
  const addr = KDF_STORE.addressLines.join("\n");
  const body = roman
    ? `Ji 😊\n\n*Our address:*\n\n📍 ${addr}\n\n📞 ${KDF_STORE.phone}\n📱 WhatsApp: ${KDF_STORE.whatsapp}`
    : `Ji 😊\n\n*Hamara address:*\n\n📍 ${addr}\n\n📞 ${KDF_STORE.phone}\n📱 WhatsApp: ${KDF_STORE.whatsapp}`;

  await sendCtaUrlMessage({
    phone: opts.phone,
    text: body,
    buttonText: "📍 Open Location",
    url: buildMapsUrl(),
    settings: opts.waSettings,
    templateName: "shop_address_map",
  });

  await sendInteractiveButtons({
    phone: opts.phone,
    text: lang === "en" ? "Quick actions:" : "Agla step:",
    buttons: [
      { id: "wa_support_call", title: "📞 Call Store" },
      { id: "wa_support_wa", title: "💬 WhatsApp" },
      { id: "main_menu", title: "🏠 Main Menu" },
    ],
    settings: opts.waSettings,
    templateName: "shop_address_actions",
  });
}

export async function sendDeliveryInfoButtons(opts: {
  phone: string;
  textBody: string;
  waSettings: WaSettings;
}): Promise<void> {
  const body = await buildDeliveryReply(opts.textBody);
  await sendInteractiveButtons({
    phone: opts.phone,
    text: body,
    buttons: [
      { id: "wa_delivery_lahore", title: "🚚 Lahore" },
      { id: "wa_delivery_nation", title: "📦 Nationwide" },
      { id: "wa_delivery_time", title: "⏱ Time" },
    ],
    settings: opts.waSettings,
    templateName: "delivery_info_buttons",
  });
}

export async function sendRiskRecovery(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
  reason?: string;
}): Promise<void> {
  const body = opts.lang === "en"
    ? `Ji 😊\n\nLooks like something went wrong. I'm here to help.`
    : `Ji 😊\n\nLagta hai issue aa gaya hai. Main madad karta hoon.`;
  await sendInteractiveButtons({
    phone: opts.phone,
    text: body,
    buttons: [
      { id: "wa_session_resume", title: "🔄 Retry Order" },
      { id: "wa_support_wa", title: "💬 Support" },
      { id: "wa_support_call", title: "📞 Call Now" },
    ],
    settings: opts.waSettings,
    templateName: "risk_recovery",
  });
}

export async function sendIntentClarification(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  await sendInteractiveButtons({
    phone: opts.phone,
    text: opts.lang === "en"
      ? "Ji 😊 Are you asking about a *payment issue* or *ordering a product*?"
      : "Ji 😊 Kya aap *payment issue* ki baat kar rahe hain ya *product order*?",
    buttons: [
      { id: "wa_info_pay_cod", title: "💳 Payment" },
      { id: "wa_browse_badam", title: "🛒 Products" },
      { id: "wa_support_wa", title: "💬 Support" },
    ],
    settings: opts.waSettings,
    templateName: "intent_clarify",
  });
}

export async function tryHandleClassifiedSupport(opts: {
  phone: string;
  textBody: string;
  waSettings: WaSettings;
  classified: ClassifiedMessage;
  logStep?: (detail: Record<string, unknown>) => Promise<void>;
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
    await sendStandalonePaymentMenu({ phone: opts.phone, lang, waSettings: opts.waSettings });
    return true;
  }
  if (intent === "address_faq") {
    await sendShopAddressCard({ phone: opts.phone, textBody: opts.textBody, waSettings: opts.waSettings });
    return true;
  }
  if (intent === "delivery") {
    await sendDeliveryInfoButtons({ phone: opts.phone, textBody: opts.textBody, waSettings: opts.waSettings });
    return true;
  }
  if (intent === "tracking") {
    const roman = isRomanUrduWa(opts.textBody);
    await sendInteractiveButtons({
      phone: opts.phone,
      text: roman
        ? "Ji 😊 Send your *order number* or phone to track."
        : "Ji 😊 Order track karne ke liye *order number* ya phone bhej dein.",
      buttons: [
        { id: "track_again", title: "📦 Track Order" },
        { id: "wa_support_wa", title: "💬 Support" },
        { id: "main_menu", title: "🏠 Menu" },
      ],
      settings: opts.waSettings,
      templateName: "tracking_prompt",
    });
    return true;
  }
  if (intent === "clarify") {
    await sendIntentClarification({ phone: opts.phone, lang, waSettings: opts.waSettings });
    return true;
  }
  if (intent === "complaint" || (intent === "support" && /\b(problem|issue|masla|help)\b/i.test(opts.textBody))) {
    await sendRiskRecovery({ phone: opts.phone, lang, waSettings: opts.waSettings });
    return true;
  }
  if (intent === "support") {
    await sendIntentClarification({ phone: opts.phone, lang, waSettings: opts.waSettings });
    return true;
  }
  return false;
}
