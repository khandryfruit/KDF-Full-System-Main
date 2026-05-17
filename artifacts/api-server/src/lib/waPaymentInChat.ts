/**
 * In-chat payment UX — no external links; COD / bank / Easypaisa inside WhatsApp.
 */
import { sendInteractiveButtons } from "./whatsapp.js";
import {
  buildBankTransferMessage,
  buildEasypaisaMessage,
  buildCodSelectedMessage,
  loadWaBankDetails,
  type WaLang,
} from "./waPremiumJourney.js";

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

export async function sendStandalonePaymentMenu(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const body = opts.lang === "en"
    ? "💳 *Payment methods*\n\nAll payments are handled here in chat — no website needed.\n\nSelect an option 👇"
    : "💳 *Payment methods*\n\nSab payment yahin chat mein — website ki zaroorat nahi.\n\nOption select karein 👇";
  await sendInteractiveButtons({
    phone: opts.phone,
    text: body,
    buttons: [
      { id: "wa_info_pay_cod", title: "💵 COD" },
      { id: "wa_info_pay_bank", title: "🏦 Bank" },
      { id: "wa_info_pay_easy", title: "📱 Easypaisa" },
    ],
    settings: opts.waSettings,
    templateName: "payment_info_menu",
  });
}

export async function sendBankDetailsInChat(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
  checkoutMode?: boolean;
}): Promise<void> {
  const text = await buildBankTransferMessage(opts.lang);
  const buttons = opts.checkoutMode
    ? [
        { id: "wa_payment_done", title: "✅ Payment Done" },
        { id: "wa_payment_upload", title: "📤 Upload Screenshot" },
        { id: "wa_payment_help", title: "❓ Need Help" },
      ]
    : [
        { id: "wa_info_pay_cod", title: "💵 COD" },
        { id: "wa_info_pay_easy", title: "📱 Easypaisa" },
        { id: "main_menu", title: "🏠 Main Menu" },
      ];
  await sendInteractiveButtons({
    phone: opts.phone,
    text,
    buttons,
    settings: opts.waSettings,
    templateName: "bank_details_in_chat",
  });
}

export async function sendEasypaisaDetailsInChat(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
  checkoutMode?: boolean;
}): Promise<void> {
  const text = await buildEasypaisaMessage(opts.lang);
  const buttons = opts.checkoutMode
    ? [
        { id: "wa_payment_done", title: "✅ Paid" },
        { id: "wa_payment_upload", title: "📤 Upload Proof" },
        { id: "wa_payment_help", title: "❓ Need Help" },
      ]
    : [
        { id: "wa_info_pay_bank", title: "🏦 Bank" },
        { id: "wa_info_pay_cod", title: "💵 COD" },
        { id: "main_menu", title: "🏠 Main Menu" },
      ];
  await sendInteractiveButtons({
    phone: opts.phone,
    text,
    buttons,
    settings: opts.waSettings,
    templateName: "easypaisa_details_in_chat",
  });
}

export async function sendCodCheckoutConfirm(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const body = opts.lang === "en"
    ? `Ji 😊\n\n*Cash on Delivery* selected.\n\nPayment will be collected when you receive the parcel.`
    : `Ji 😊\n\n*Cash on Delivery* select ho gaya.\n\nPayment delivery ke waqt hogi.`;
  await sendInteractiveButtons({
    phone: opts.phone,
    text: body,
    buttons: [
      { id: "wa_cod_continue", title: "✅ Continue Order" },
      { id: "wa_checkout_back", title: "⬅️ Back" },
      { id: "wa_checkout_cancel", title: "❌ Cancel" },
    ],
    settings: opts.waSettings,
    templateName: "cod_checkout_confirm",
  });
}

export async function sendCodInfoOnly(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  await sendInteractiveButtons({
    phone: opts.phone,
    text: opts.lang === "en"
      ? "💵 *Cash on Delivery (COD)*\n\nPay when you receive your parcel. Available on all orders."
      : "💵 *Cash on Delivery (COD)*\n\nParcel receive karte waqt payment. Tamam orders par available.",
    buttons: [
      { id: "wa_info_pay_bank", title: "🏦 Bank" },
      { id: "wa_info_pay_easy", title: "📱 Easypaisa" },
      { id: "main_menu", title: "🏠 Main Menu" },
    ],
    settings: opts.waSettings,
    templateName: "cod_info",
  });
}

export async function sendPaymentUploadPrompt(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  await sendInteractiveButtons({
    phone: opts.phone,
    text: opts.lang === "en"
      ? "📤 Please send your *payment screenshot* as an image in the next message."
      : "📤 Agla message mein *payment screenshot* image bhej dein.",
    buttons: [
      { id: "wa_payment_done", title: "✅ Done" },
      { id: "wa_checkout_back", title: "⬅️ Back" },
      { id: "wa_payment_help", title: "❓ Help" },
    ],
    settings: opts.waSettings,
    templateName: "payment_upload_prompt",
  });
}

export { loadWaBankDetails };
