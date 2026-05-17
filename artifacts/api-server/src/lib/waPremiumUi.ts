/**
 * Premium WhatsApp UI — lists & buttons for one-click commerce (max 3 buttons / 10 list rows).
 */
import { sendInteractiveButtons, sendInteractiveList } from "./whatsapp.js";
import { formatRupeesLocal } from "./waOrderJourney.js";
import {
  resolveWaLang,
  buildProductIntroLine,
  buildQuantityPrompt,
  buildPaymentMethodPrompt,
  buildLiveTotalPreview,
  buildProductIntentPrompt,
  buildEasypaisaMessage,
  type WaLang,
} from "./waPremiumJourney.js";

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

function clip(s: string, max: number): string {
  const t = String(s ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export function variantRowTitle(title: string, price: number): string {
  const p = formatRupeesLocal(price).replace("Rs. ", "Rs");
  const raw = `⚖ ${title} — ${p}`;
  return clip(raw, 24);
}

export async function sendLanguagePicker(phone: string, body: string, waSettings: WaSettings): Promise<void> {
  await sendInteractiveButtons({
    phone,
    text: body,
    buttons: [
      { id: "wa_lang_ur", title: "🇵🇰 اردو" },
      { id: "wa_lang_en", title: "🇬🇧 English" },
      { id: "wa_lang_ps", title: "🏔 پښتو" },
    ],
    settings: waSettings,
    templateName: "language_welcome",
  });
}

export async function sendProductIntentPicker(opts: {
  phone: string;
  productName: string;
  productQuery: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  await sendInteractiveList({
    phone: opts.phone,
    header: clip(opts.productName, 60),
    body: buildProductIntentPrompt(opts.productName, opts.lang),
    buttonLabel: opts.lang === "en" ? "Choose" : "Select",
    rows: [
      { id: "wa_intent_price", title: "💰 Price", description: "See all sizes & rates" },
      { id: "wa_intent_recommend", title: "⭐ Recommend", description: "Best option for you" },
      { id: "wa_intent_order", title: "🛒 Order", description: "Start quick checkout" },
      { id: "wa_intent_delivery", title: "🚚 Delivery", description: "Charges & timing" },
    ],
    settings: opts.waSettings,
    templateName: "product_intent_list",
  });
}

export async function sendVariantPicker(opts: {
  phone: string;
  productName: string;
  variantOptions: Array<{ id: string; title: string; price: number }>;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const rows = opts.variantOptions.slice(0, 10).map((v, i) => ({
    id: `wa_v_${i}`,
    title: variantRowTitle(v.title, v.price),
    description: clip(v.title, 72),
  }));
  await sendInteractiveList({
    phone: opts.phone,
    header: clip(opts.productName, 60),
    body: opts.lang === "en" ? "Select size 👇" : "Size select karein 👇",
    buttonLabel: opts.lang === "en" ? "Sizes" : "Sizes",
    rows,
    settings: opts.waSettings,
    templateName: "variant_list",
  });
}

export async function sendQuantityPicker(opts: {
  phone: string;
  stateData: Record<string, any>;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const totalBlock = buildLiveTotalPreview(opts.stateData, opts.lang);
  await sendInteractiveList({
    phone: opts.phone,
    body: `${buildQuantityPrompt(opts.lang)}\n\n${totalBlock}`,
    buttonLabel: opts.lang === "en" ? "Quantity" : "Qty",
    rows: [
      { id: "wa_qty_1", title: "📦 1 Pack" },
      { id: "wa_qty_2", title: "📦 2 Packs" },
      { id: "wa_qty_3", title: "📦 3 Packs" },
      { id: "wa_qty_4", title: "📦 4 Packs" },
      { id: "wa_qty_5", title: "📦 5 Packs" },
      { id: "wa_qty_6", title: "📦 6 Packs" },
      { id: "wa_qty_8", title: "📦 8 Packs" },
      { id: "wa_qty_10", title: "📦 10 Packs" },
      { id: "wa_qty_custom", title: "✍️ Custom Qty" },
    ],
    settings: opts.waSettings,
    templateName: "quantity_list",
  });
}

export async function sendNamePicker(opts: {
  phone: string;
  contactName?: string | null;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const name = String(opts.contactName ?? "").trim();
  if (name.length >= 3) {
    await sendInteractiveButtons({
      phone: opts.phone,
      text: opts.lang === "en" ? `👤 Customer name\n*${name}*` : `👤 Naam\n*${name}*`,
      buttons: [
        { id: "wa_name_use", title: "✅ Use This Name" },
        { id: "wa_name_enter", title: "✏️ Change Name" },
      ],
      settings: opts.waSettings,
      templateName: "name_pick",
    });
    return;
  }
  await sendInteractiveList({
    phone: opts.phone,
    body: opts.lang === "en" ? "👤 Select name option:" : "👤 Naam select karein:",
    buttonLabel: "Name",
    rows: [
      { id: "wa_name_guest", title: "👤 Guest Checkout" },
      { id: "wa_name_enter", title: "✏️ Enter Name" },
    ],
    settings: opts.waSettings,
    templateName: "name_list",
  });
}

export async function sendCityPicker(phone: string, lang: WaLang, waSettings: WaSettings): Promise<void> {
  await sendInteractiveList({
    phone,
    body: lang === "en" ? "🏙 Select your city:" : "🏙 City select karein:",
    buttonLabel: lang === "en" ? "Cities" : "City",
    rows: [
      { id: "wa_city_lahore", title: "Lahore" },
      { id: "wa_city_karachi", title: "Karachi" },
      { id: "wa_city_islamabad", title: "Islamabad" },
      { id: "wa_city_rawalpindi", title: "Rawalpindi" },
      { id: "wa_city_faisalabad", title: "Faisalabad" },
      { id: "wa_city_multan", title: "Multan" },
      { id: "wa_city_peshawar", title: "Peshawar" },
      { id: "wa_city_other", title: "Other City" },
    ],
    settings: waSettings,
    templateName: "city_list",
  });
}

export async function sendAddressExtrasButtons(phone: string, lang: WaLang, waSettings: WaSettings): Promise<void> {
  await sendInteractiveButtons({
    phone,
    text: lang === "en" ? "Optional details:" : "Optional:",
    buttons: [
      { id: "wa_postal_skip", title: "⏭ No Postal Code" },
      { id: "wa_landmark_skip", title: "⏭ No Landmark" },
      { id: "wa_addr_done", title: "✅ Continue" },
    ],
    settings: waSettings,
    templateName: "address_extras",
  });
}

export async function sendPaymentPicker(phone: string, stateData: Record<string, any>, waSettings: WaSettings): Promise<void> {
  const lang = resolveWaLang(stateData);
  const totalBlock = buildLiveTotalPreview(stateData, lang);
  await sendInteractiveButtons({
    phone,
    text: `${buildPaymentMethodPrompt(lang)}\n\n${totalBlock}`,
    buttons: [
      { id: "wa_pay_cod", title: "💵 COD" },
      { id: "wa_pay_bank", title: "🏦 Bank" },
      { id: "wa_pay_easypaisa", title: "📱 Easypaisa" },
    ],
    settings: waSettings,
    templateName: "wa_payment_method",
  });
}

export async function sendBankPaymentActions(phone: string, lang: WaLang, waSettings: WaSettings): Promise<void> {
  await sendInteractiveButtons({
    phone,
    text: lang === "en" ? "After payment:" : "Payment ke baad:",
    buttons: [
      { id: "wa_payment_done", title: "✅ Payment Done" },
      { id: "wa_payment_help", title: "❓ Need Help" },
      { id: "wa_chat_order_cancel", title: "❌ Cancel" },
    ],
    settings: waSettings,
    templateName: "wa_bank_actions",
  });
}

export async function sendOrderConfirmButtons(
  phone: string,
  summaryText: string,
  waSettings: WaSettings,
): Promise<void> {
  await sendInteractiveButtons({
    phone,
    text: summaryText,
    buttons: [
      { id: "wa_chat_order_confirm", title: "✅ Confirm Order" },
      { id: "wa_order_edit", title: "✏️ Edit Order" },
      { id: "wa_chat_order_cancel", title: "❌ Cancel" },
    ],
    settings: waSettings,
    templateName: "wa_order_review",
  });
}

export async function sendPostOrderButtons(
  phone: string,
  body: string,
  waSettings: WaSettings,
): Promise<void> {
  await sendInteractiveButtons({
    phone,
    text: body,
    buttons: [
      { id: "wa_track_order", title: "📦 Track Order" },
      { id: "wa_order_again", title: "🛍 Order Again" },
      { id: "main_menu", title: "🏠 Main Menu" },
    ],
    settings: waSettings,
    templateName: "order_placed_actions",
  });
}

export async function sendProductCardWithVariants(opts: {
  phone: string;
  product: {
    name: string;
    imageUrl?: string | null;
    description?: string | null;
    variantOptions?: Array<{ id: string; title: string; price: number }>;
  };
  productQuery: string;
  lang: WaLang;
  waSettings: WaSettings;
  sendImage: (p: { phone: string; imageUrl: string; caption: string }) => Promise<void>;
  sendText: (phone: string, text: string, template?: string) => Promise<void>;
}): Promise<void> {
  const intro = buildProductIntroLine(opts.product.name, opts.lang);
  const imageUrl = opts.product.imageUrl;
  if (imageUrl?.startsWith("https://")) {
    await opts.sendImage({ phone: opts.phone, imageUrl, caption: intro });
  } else {
    await opts.sendText(opts.phone, intro, "product_intro");
  }
  const variants = opts.product.variantOptions ?? [];
  if (variants.length) {
    await sendVariantPicker({
      phone: opts.phone,
      productName: opts.product.name,
      variantOptions: variants,
      lang: opts.lang,
      waSettings: opts.waSettings,
    });
  }
}

export { buildEasypaisaMessage };
