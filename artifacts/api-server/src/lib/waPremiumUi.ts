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
import {
  enrichVariants,
  buildPremiumProductCaption,
  buildVariantPickerBody,
  buildVariantListRows,
  canUseVariantQuickButtons,
  buildVariantQuickButtonTitle,
  formatVariantListTitle,
  normalizeSizeLabel,
  type VariantOption,
} from "./waVariantPresentation.js";

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

function clip(s: string, max: number): string {
  const t = String(s ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** @deprecated Prices belong in list description/body — title is size-only */
export function variantRowTitle(title: string, _price: number): string {
  return formatVariantListTitle(normalizeSizeLabel(title));
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
      { id: "wa_intent_price", title: "💰 Price", description: "All sizes — full prices" },
      { id: "wa_intent_recommend", title: "⭐ Recommend", description: "Best value size for you" },
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
  variantOptions: VariantOption[];
  lang: WaLang;
  waSettings: WaSettings;
  productDescription?: string | null;
}): Promise<void> {
  const variants = opts.variantOptions.slice(0, 10);
  if (!variants.length) return;

  const enriched = enrichVariants(variants, opts.lang);
  const body = buildVariantPickerBody({
    productName: opts.productName,
    variants,
    lang: opts.lang,
  });

  if (canUseVariantQuickButtons(variants.length)) {
    await sendInteractiveButtons({
      phone: opts.phone,
      text: body,
      buttons: enriched.map((v) => ({
        id: `wa_v_${v.index}`,
        title: buildVariantQuickButtonTitle(v.sizeLabel),
      })),
      footer: opts.lang === "en" ? "Full price in message above" : "Price upar message mein hai",
      settings: opts.waSettings,
      templateName: "variant_quick_buttons",
    });
    return;
  }

  await sendInteractiveList({
    phone: opts.phone,
    header: clip(opts.productName, 60),
    body,
    footer: opts.lang === "en" ? "Tap Sizes — prices shown above" : "Sizes tap karein",
    buttonLabel: opts.lang === "en" ? "Sizes" : "Sizes",
    rows: buildVariantListRows(enriched),
    settings: opts.waSettings,
    templateName: "variant_list",
  });
}

export async function sendPremiumProductOffer(opts: {
  phone: string;
  product: {
    name: string;
    imageUrl?: string | null;
    description?: string | null;
    inStock?: boolean;
    variantOptions?: VariantOption[];
  };
  lang: WaLang;
  waSettings: WaSettings;
  sendImage: (p: { phone: string; imageUrl: string; caption: string }) => Promise<void>;
  sendText: (phone: string, text: string, template?: string) => Promise<void>;
}): Promise<void> {
  const variants = opts.product.variantOptions ?? [];
  const caption = buildPremiumProductCaption({
    productName: opts.product.name,
    description: opts.product.description,
    inStock: opts.product.inStock,
    variants,
    lang: opts.lang,
  });

  const imageUrl = opts.product.imageUrl;
  if (imageUrl?.startsWith("https://")) {
    await opts.sendImage({ phone: opts.phone, imageUrl, caption });
    await new Promise((r) => setTimeout(r, 450));
  } else {
    await opts.sendText(opts.phone, caption, "product_card_no_image");
  }

  if (variants.length) {
    await sendVariantPicker({
      phone: opts.phone,
      productName: opts.product.name,
      variantOptions: variants,
      lang: opts.lang,
      waSettings: opts.waSettings,
      productDescription: opts.product.description,
    });
  }
}

export async function sendQuantityPicker(opts: {
  phone: string;
  stateData: Record<string, any>;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const totalBlock = buildLiveTotalPreview(opts.stateData, opts.lang);
  const variantLine = opts.stateData.variantTitle
    ? `\n⚖️ ${opts.stateData.variantTitle} · ${formatRupeesLocal(Number(opts.stateData.unitPrice ?? 0))}`
    : "";
  await sendInteractiveList({
    phone: opts.phone,
    body: `${buildQuantityPrompt(opts.lang)}${variantLine}\n\n${totalBlock}`,
    buttonLabel: opts.lang === "en" ? "Quantity" : "Qty",
    rows: [
      { id: "wa_qty_1", title: "📦 1 Pack", description: "Single pack" },
      { id: "wa_qty_2", title: "📦 2 Packs", description: "2 packs" },
      { id: "wa_qty_3", title: "📦 3 Packs", description: "3 packs" },
      { id: "wa_qty_4", title: "📦 4 Packs", description: "4 packs" },
      { id: "wa_qty_5", title: "📦 5 Packs", description: "5 packs" },
      { id: "wa_qty_6", title: "📦 6 Packs", description: "6 packs" },
      { id: "wa_qty_8", title: "📦 8 Packs", description: "8 packs" },
      { id: "wa_qty_10", title: "📦 10 Packs", description: "10 packs" },
      { id: "wa_qty_custom", title: "✍️ Custom Qty", description: "Type qty 1–99" },
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

export async function sendCityPicker(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
  suggestedCity?: string | null;
}): Promise<void> {
  const { POPULAR_CITIES, cityListRow, cityToSlug } = await import("./waPakistanCities.js");
  const typeHint = opts.lang === "en"
    ? "Type your city in the next message — e.g. *Lahore*, *Lhr*, *Karachi*.\n\nOr pick below 👇"
    : "Agla message mein city likhein — jaise *Lahore*, *Lhr*, *Karachi*.\n\nYa neeche se select karein 👇";

  if (opts.suggestedCity) {
    await sendInteractiveButtons({
      phone: opts.phone,
      text: opts.lang === "en"
        ? `🏙 *City*\n\n${typeHint}\n\n📍 Suggested: *${opts.suggestedCity}*`
        : `🏙 *City*\n\n${typeHint}\n\n📍 Lagta hai: *${opts.suggestedCity}*`,
      buttons: [
        { id: `wa_city_s_${cityToSlug(opts.suggestedCity)}`, title: "✅ Yes" },
        { id: "wa_city_change", title: "✏️ Other City" },
        { id: "wa_checkout_back", title: "⬅️ Back" },
      ],
      settings: opts.waSettings,
      templateName: "city_suggest",
    });
    return;
  }

  const body = opts.lang === "en"
    ? `🏙 *Step: City*\n\n${typeHint}`
    : `🏙 *City*\n\n${typeHint}`;

  const rows = [
    ...POPULAR_CITIES.slice(0, 6).map((c) => cityListRow(c, true)),
    { id: "wa_city_search", title: "🔍 Search City", description: "Type to find" },
    { id: "wa_city_all", title: "📋 Browse All", description: "Optional full list" },
  ];

  await sendInteractiveList({
    phone: opts.phone,
    body,
    buttonLabel: opts.lang === "en" ? "Cities" : "City",
    rows,
    settings: opts.waSettings,
    templateName: "city_list",
  });
}

export async function sendCityConfirmPrompt(opts: {
  phone: string;
  city: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  await sendInteractiveButtons({
    phone: opts.phone,
    text: opts.lang === "en"
      ? `Ji 😊\n\nYour city:\n\n📍 *${opts.city}*`
      : `Ji 😊\n\nAapka city:\n\n📍 *${opts.city}*`,
    buttons: [
      { id: "wa_city_confirm", title: "✅ Confirm" },
      { id: "wa_city_change", title: "✏️ Change" },
      { id: "wa_checkout_back", title: "⬅️ Back" },
    ],
    settings: opts.waSettings,
    templateName: "city_confirm",
  });
}

export async function sendCitySuggestionList(opts: {
  phone: string;
  query: string;
  cities: string[];
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const { cityListRow } = await import("./waPakistanCities.js");
  const rows = [
    ...opts.cities.slice(0, 7).map((c) => cityListRow(c)),
    { id: "wa_city_search", title: "🔍 Search City", description: "Type again" },
    { id: "wa_city_all", title: "📋 Browse All", description: "Full list" },
  ].slice(0, 10);
  await sendInteractiveList({
    phone: opts.phone,
    body: opts.lang === "en"
      ? `Did you mean *${opts.query}*?\n\nPick your city 👇`
      : `*${opts.query}* — yeh city?\n\nSelect karein 👇`,
    buttonLabel: opts.lang === "en" ? "Cities" : "City",
    rows,
    settings: opts.waSettings,
    templateName: "city_suggestions",
  });
}

export async function sendCityNotFoundPrompt(opts: {
  phone: string;
  query: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  await sendInteractiveButtons({
    phone: opts.phone,
    text: opts.lang === "en"
      ? `Ji 😊 "*${opts.query}*" not found.\n\nTry *Lhr*, *Lahore*, or browse the list.`
      : `Ji 😊 "*${opts.query}*" nahi mili.\n\n*Lhr*, *Lahore* try karein ya list dekhein.`,
    buttons: [
      { id: "wa_city_search", title: "🔍 Search City" },
      { id: "wa_city_all", title: "📋 Browse All" },
      { id: "wa_checkout_back", title: "⬅️ Back" },
    ],
    settings: opts.waSettings,
    templateName: "city_not_found",
  });
}

export async function sendCitySearchPrompt(phone: string, lang: WaLang, waSettings: WaSettings): Promise<void> {
  await sendInteractiveButtons({
    phone,
    text: lang === "en"
      ? "🔍 *Search city*\n\nType in the next message — *Lahore*, *Lhr*, *Multan*, *Multn* (we auto-correct typos)."
      : "🔍 *City search*\n\nAgla message mein likhein — *Lahore*, *Lhr*, *Multan* (typo theek ho jayega).",
    buttons: [
      { id: "wa_checkout_back", title: "⬅️ Back" },
      { id: "wa_city_all", title: "📋 Browse All" },
    ],
    settings: waSettings,
    templateName: "city_search_prompt",
  });
}

export async function sendCitySearchResults(opts: {
  phone: string;
  query: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const { searchCities, cityListRow } = await import("./waPakistanCities.js");
  const { resolveCityInput } = await import("./waPakistanCities.js");
  const resolved = resolveCityInput(opts.query);
  if (resolved.kind === "confirm" && resolved.city) {
    await sendCityConfirmPrompt({
      phone: opts.phone,
      city: resolved.city,
      lang: opts.lang,
      waSettings: opts.waSettings,
    });
    return;
  }
  const hits = resolved.suggestions.length ? resolved.suggestions : searchCities(opts.query, 10);
  if (!hits.length) {
    await sendCityNotFoundPrompt({
      phone: opts.phone,
      query: opts.query,
      lang: opts.lang,
      waSettings: opts.waSettings,
    });
    return;
  }
  if (hits.length === 1) {
    await sendCityConfirmPrompt({
      phone: opts.phone,
      city: hits[0]!,
      lang: opts.lang,
      waSettings: opts.waSettings,
    });
    return;
  }
  await sendCitySuggestionList({
    phone: opts.phone,
    query: opts.query,
    cities: hits,
    lang: opts.lang,
    waSettings: opts.waSettings,
  });
}

export async function sendCityPage(opts: {
  phone: string;
  page: number;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const { getCityPage, cityListRow } = await import("./waPakistanCities.js");
  const { cities, page, totalPages } = getCityPage(opts.page, 9);
  const rows = [
    ...cities.map((c) => cityListRow(c)),
    ...(page + 1 < totalPages
      ? [{ id: `wa_city_page_${page + 1}`, title: "➡️ Next Page", description: `Page ${page + 2}/${totalPages}` }]
      : []),
    ...(page > 0
      ? [{ id: `wa_city_page_${page - 1}`, title: "⬅️ Prev Page", description: `Page ${page}/${totalPages}` }]
      : []),
  ].slice(0, 10);
  await sendInteractiveList({
    phone: opts.phone,
    body: opts.lang === "en"
      ? `📋 *All cities* (${page + 1}/${totalPages})`
      : `📋 *Tamam cities* (${page + 1}/${totalPages})`,
    buttonLabel: "City",
    rows,
    settings: opts.waSettings,
    templateName: "city_page",
  });
}

export async function sendAreaPrompt(phone: string, lang: WaLang, waSettings: WaSettings, city: string): Promise<void> {
  await sendInteractiveButtons({
    phone,
    text: lang === "en"
      ? `🏙 City: *${city}*\n\n📍 *Step: Area*\n\nType your area / society / sector in the next message.`
      : `🏙 City: *${city}*\n\n📍 *Area*\n\nAgla message mein apna area / society likhein.`,
    buttons: [
      { id: "wa_checkout_back", title: "⬅️ Back" },
    ],
    settings: waSettings,
    templateName: "area_prompt",
  });
}

export async function sendAddressDetailPrompt(phone: string, lang: WaLang, waSettings: WaSettings): Promise<void> {
  await sendInteractiveButtons({
    phone,
    text: lang === "en"
      ? "📍 *Step: Full address*\n\nHouse #, street, block — type in next message."
      : "📍 *Poora address*\n\nHouse #, street — agla message mein likhein.",
    buttons: [
      { id: "wa_checkout_back", title: "⬅️ Back" },
    ],
    settings: waSettings,
    templateName: "address_detail_prompt",
  });
}

export async function sendLandmarkPrompt(phone: string, lang: WaLang, waSettings: WaSettings): Promise<void> {
  await sendInteractiveButtons({
    phone,
    text: lang === "en"
      ? "📍 *Landmark* (optional)\n\nNearby masjid, shop, or landmark — or tap Skip."
      : "📍 *Landmark* (optional)\n\nQareeb ki nishani likhein ya Skip karein.",
    buttons: [
      { id: "wa_landmark_skip", title: "⏭ Skip" },
      { id: "wa_checkout_back", title: "⬅️ Back" },
    ],
    settings: waSettings,
    templateName: "landmark_prompt",
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

/** @deprecated Use waPaymentInChat.sendBankDetailsInChat */
export async function sendBankPaymentActions(phone: string, lang: WaLang, waSettings: WaSettings): Promise<void> {
  const { sendBankDetailsInChat } = await import("./waPaymentInChat.js");
  await sendBankDetailsInChat({ phone, lang, waSettings, checkoutMode: true });
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
    inStock?: boolean;
    variantOptions?: VariantOption[];
  };
  productQuery: string;
  lang: WaLang;
  waSettings: WaSettings;
  sendImage: (p: { phone: string; imageUrl: string; caption: string }) => Promise<void>;
  sendText: (phone: string, text: string, template?: string) => Promise<void>;
}): Promise<void> {
  await sendPremiumProductOffer({
    phone: opts.phone,
    product: opts.product,
    lang: opts.lang,
    waSettings: opts.waSettings,
    sendImage: opts.sendImage,
    sendText: opts.sendText,
  });
}

export { buildEasypaisaMessage };
