/**
 * Premium post-order thank you + helpful app install (not forced).
 */
import { sendWhatsAppMessage, sendCtaUrlMessage } from "./whatsapp.js";
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
      `🌟 JazakAllah 😊\n\n` +
      `Thank you for ordering from *Khan Dry Fruits*.\n\n` +
      `Your order is confirmed ✅\n\n` +
      `🧾 *Order:* ${id}\n\n` +
      `We hope to serve you again 🌟`
    );
  }
  return (
    `🌟 جزاک اللہ 😊\n\n` +
    `*Khan Dry Fruits* سے آرڈر کرنے کا بہت شکریہ۔\n\n` +
    `آپ کا آرڈر موصول ہو گیا ہے ✅\n\n` +
    `🧾 *Order:* ${id}\n\n` +
    `امید ہے دوبارہ خدمت کا موقع ملے گا 🌟`
  );
}

export function buildAppInstallPitch(lang: WaLang): string {
  if (lang === "en") {
    return (
      `⭐ If you liked our service, please install our mobile app 😊\n\n` +
      `Faster ordering · tracking · exclusive offers`
    );
  }
  return (
    `⭐ Agar service pasand aaye to hamari mobile app install karein 😊\n\n` +
    `آسان ordering · tracking · exclusive offers`
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
      ? "Tap below to install 👇"
      : "Neeche tap karke install karein 👇",
    buttonText: "📲 Install App",
    url: KDF_APP_INSTALL_URL,
    settings: opts.waSettings,
    templateName: "order_app_install_cta",
  });
}
