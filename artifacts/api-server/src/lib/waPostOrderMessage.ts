/**
 * Premium post-order thank you + helpful app install (not forced).
 */
import { sendWhatsAppMessage, sendCtaUrlMessage, sendInteractiveButtons } from "./whatsapp.js";
import { KHAN_WEBSITE_URL } from "./waMenuDefaults.js";
import type { WaLang } from "./waPremiumJourney.js";

export const KDF_APP_INSTALL_URL = "https://open.khandryfruits.com/";
export const KDF_SUPPORT_WHATSAPP = "03049996000";
export const KDF_SUPPORT_CALL = "04237444400";

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

export function buildOrderThankYouMessage(orderNumber: string, lang: WaLang): string {
  const id = orderNumber.startsWith("#") ? orderNumber : `#${orderNumber}`;
  if (lang === "en") {
    return (
      `🌟 Thank you 😊\n\n` +
      `Thank you for trusting *Khan Dry Fruits* and placing your order.\n\n` +
      `Your order has been received successfully ✅\n\n` +
      `🧾 *Order Number:* ${id}\n\n` +
      `🚚 Delivery updates will be sent on this WhatsApp chat.\n\n` +
      `Questions?\n` +
      `💬 WhatsApp: ${KDF_SUPPORT_WHATSAPP}\n` +
      `📞 Call: ${KDF_SUPPORT_CALL}`
    );
  }
  return (
    `🌟 جزاک اللہ 😊\n\n` +
    `*Khan Dry Fruits* پر اعتماد کرنے اور آرڈر کرنے کا بہت شکریہ۔\n\n` +
    `آپ کا آرڈر کامیابی سے موصول ہو گیا ہے ✅\n\n` +
    `🧾 *Order Number:*\n${id}\n\n` +
    `🚚 Delivery updates آپ کو اسی WhatsApp پر ملتی رہیں گی۔\n\n` +
    `اگر کوئی سوال ہو:\n` +
    `💬 WhatsApp: ${KDF_SUPPORT_WHATSAPP}\n` +
    `📞 Call: ${KDF_SUPPORT_CALL}`
  );
}

export function buildAppInstallPitch(lang: WaLang): string {
  if (lang === "en") {
    return (
      `📱 A small request 😊\n\n` +
      `For easier shopping, offers, order tracking and fast updates — try our mobile app.\n` +
      `Your support means a lot to us 🌟\n\n` +
      `With the app:\n` +
      `✅ Fast ordering\n` +
      `✅ Order tracking\n` +
      `✅ Latest deals\n` +
      `✅ Easy re-order\n` +
      `✅ Exclusive offers`
    );
  }
  return (
    `📱 ایک چھوٹی سی گزارش 😊\n\n` +
    `مزید آسان shopping، offers، order tracking اور fast updates کے لیے ہماری mobile app install کریں۔\n` +
    `آپ کی support اور اعتماد ہمارے لیے بہت اہم ہے 🌟\n\n` +
    `App کے ذریعے:\n` +
    `✅ Fast ordering\n` +
    `✅ Order tracking\n` +
    `✅ Latest deals\n` +
    `✅ Easy re-order\n` +
    `✅ Exclusive offers`
  );
}

export function buildOrderClosingMessage(lang: WaLang): string {
  if (lang === "en") {
    return (
      `May Allah bless you 😊\n\n` +
      `We hope to serve you again.\n\n` +
      `Thank you for choosing *Khan Dry Fruits* 🌟`
    );
  }
  return (
    `اللہ آپ کو خوش رکھے 😊\n\n` +
    `امید ہے دوبارہ خدمت کا موقع ملے گا۔\n\n` +
    `*Khan Dry Fruits* منتخب کرنے کا شکریہ 🌟`
  );
}

/** Full premium sequence after successful order save */
export async function sendPremiumOrderConfirmationSequence(opts: {
  phone: string;
  orderNumber: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const thankYou = buildOrderThankYouMessage(opts.orderNumber, opts.lang);
  await sendWhatsAppMessage({
    phone: opts.phone,
    message: thankYou,
    templateName: "order_thank_you_premium",
  });

  const appPitch = buildAppInstallPitch(opts.lang);
  await sendWhatsAppMessage({
    phone: opts.phone,
    message: appPitch,
    templateName: "order_app_install_pitch",
  });

  await sendCtaUrlMessage({
    phone: opts.phone,
    text: opts.lang === "en"
      ? "Install the KDF app for the best experience 👇"
      : "Behtar experience ke liye app install karein 👇",
    buttonText: "📲 Install App",
    url: KDF_APP_INSTALL_URL,
    settings: opts.waSettings,
    templateName: "order_app_install_cta",
  });

  await sendInteractiveButtons({
    phone: opts.phone,
    text: opts.lang === "en" ? "Quick actions:" : "Agla step:",
    buttons: [
      { id: "wa_post_visit_website", title: "🌐 Website" },
      { id: "wa_post_shop_again", title: "🛒 Shop Again" },
      { id: "wa_post_track_order", title: "📦 Track Order" },
    ],
    settings: opts.waSettings,
    templateName: "order_post_actions",
  });

  const closing = buildOrderClosingMessage(opts.lang);
  await sendWhatsAppMessage({
    phone: opts.phone,
    message: closing,
    templateName: "order_closing_premium",
  });
}
