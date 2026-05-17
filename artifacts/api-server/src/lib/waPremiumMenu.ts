/**
 * Premium WhatsApp menu UX — human welcome, main menu, product categories.
 */
import { sendInteractiveList, sendCtaUrlMessage } from "./whatsapp.js";
import { resolveWaLang, type WaLang } from "./waPremiumJourney.js";
import { isRomanUrduWa } from "./waProductBrain.js";
import {
  buildCategoryBrowseFromMenuPick,
  listProductsByCategoryId,
  type WaSalesCategory,
} from "./waSalesAgent.js";
import { toWhatsAppCatalogProducts } from "./shopifyProductKnowledge.js";
import { setConversationState } from "./whatsapp.js";
import { KDF_APP_INSTALL_URL } from "./waPostOrderMessage.js";
import { loadAllCatalogProducts } from "./shopifyProductKnowledge.js";

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

export const QA = {
  products: "wa_qa_products",
  placeOrder: "wa_qa_place_order",
  payment: "wa_qa_payment",
  delivery: "wa_qa_delivery",
  address: "wa_qa_address",
  track: "wa_qa_track",
  support: "wa_qa_support",
  app: "wa_qa_app",
  order: "wa_qa_order",
  buy: "wa_qa_buy",
} as const;

export const CAT_PREFIX = "wa_cat_";

/** Curated category rows for product picker (max 8 for one list section). */
export const PRODUCT_CATEGORY_MENU: Array<{
  id: string;
  title: string;
  description: string;
  categoryId: string;
}> = [
  { id: `${CAT_PREFIX}almonds`, title: "🥜 Almonds", description: "Premium badam", categoryId: "almonds" },
  { id: `${CAT_PREFIX}pistachio`, title: "🌰 Pistachios", description: "Irani & roasted pista", categoryId: "pistachio" },
  { id: `${CAT_PREFIX}cashew`, title: "🥜 Cashews", description: "Kaju — W180 & more", categoryId: "cashew" },
  { id: `${CAT_PREFIX}honey`, title: "🍯 Honey", description: "Pure shahad", categoryId: "honey" },
  { id: `${CAT_PREFIX}dried`, title: "🥭 Dried Fruits", description: "Khajoor, anjeer, kishmish", categoryId: "dates" },
  { id: `${CAT_PREFIX}bestsellers`, title: "⭐ Best Sellers", description: "Customer favourites", categoryId: "bestsellers" },
  { id: `${CAT_PREFIX}hotdeals`, title: "🔥 Hot Deals", description: "Offers & savings", categoryId: "hotdeals" },
  { id: `${CAT_PREFIX}all`, title: "📋 All Products", description: "Full catalog browse", categoryId: "all" },
];

export function buildPremiumWelcomeText(textBody: string | undefined, lang: WaLang, repeatCustomer = false): string {
  const roman = textBody ? isRomanUrduWa(textBody) : lang !== "ur";
  const welcomeBack = repeatCustomer
    ? (roman ? "Dobara khush aamdeed 😊\n\n" : "دوبارہ خوش آمدید 😊\n\n")
    : "";

  if (lang === "en") {
    return (
      `${welcomeBack}🌟 Assalam o Alaikum 😊\n\n` +
      `Welcome to *KDF MART*.\n\n` +
      `Hope you are well 🤝\n\n` +
      `🥜 Premium Dry Fruits\n` +
      `🚚 Fast Delivery\n` +
      `💳 Easy Payment\n` +
      `📍 Lahore Same Day Delivery\n\n` +
      `How can I help you today?\n\n` +
      `Choose an option below 👇`
    );
  }
  if (roman) {
    return (
      `${welcomeBack}🌟 Assalam o Alaikum 😊\n\n` +
      `*KDF MART* mein khush aamdeed.\n\n` +
      `Umeed hai aap khairyat se honge 🤝\n\n` +
      `🥜 Premium Dry Fruits\n` +
      `🚚 Fast Delivery\n` +
      `💳 Easy Payment\n` +
      `📍 Lahore Same Day Delivery\n\n` +
      `Aaj kis cheez mein madad kar sakta hoon?\n\n` +
      `Neeche se option choose kar lein 👇`
    );
  }
  return (
    `${welcomeBack}🌟 السلام علیکم 😊\n\n` +
    `*KDF MART* میں خوش آمدید۔\n\n` +
    `امید ہے آپ خیریت سے ہوں گے 🤝\n\n` +
    `🥜 Premium Dry Fruits\n` +
    `🚚 Fast Delivery\n` +
    `💳 Easy Payment\n` +
    `📍 Lahore Same Day Delivery\n\n` +
    `آج کس چیز میں مدد کر سکتا ہوں؟\n\n` +
    `نیچے سے option choose کر لیں 👇`
  );
}

export function buildNaturalGreetingShort(textBody: string | undefined, lang: WaLang): string {
  const roman = textBody ? isRomanUrduWa(textBody) : lang !== "ur";
  if (lang === "en") {
    return "Assalam o Alaikum 😊\n\nWelcome to *KDF MART*.\n\nHow can I help you today?";
  }
  if (roman) {
    return "Assalam o Alaikum 😊\n\n*KDF MART* mein khush aamdeed.\n\nKya madad kar sakta hoon?";
  }
  return "السلام علیکم 😊\n\n*KDF MART* میں خوش آمدید۔\n\nکیا مدد کر سکتا ہوں؟";
}

export function buildProductMemoryReply(productQuery: string, lang: WaLang): string {
  const roman = isRomanUrduWa(productQuery);
  const name = productQuery.charAt(0).toUpperCase() + productQuery.slice(1);
  if (lang === "en") {
    return `Ji 😊 *${name}* — great choice.\n\nPopular sizes:\n• 250g\n• 500g\n• 1KG\n\nTell me which size, or I can suggest the best option 😊`;
  }
  if (roman) {
    return `Ji 😊 *${name}* chahiye — bohat acha choice 😊\n\nPopular sizes:\n• 250g\n• 500g\n• 1KG\n\nBatayein kitni quantity — ya main best option suggest kar doon 😊`;
  }
  return `جی 😊 *${name}* چاہیے — بہت اچھا choice 😊\n\nPopular sizes:\n• 250g\n• 500g\n• 1KG\n\nبتائیے کتنی quantity — یا میں best option suggest کر دوں 😊`;
}

export async function sendPremiumMainMenu(opts: {
  phone: string;
  waSettings: WaSettings;
  lang?: WaLang;
  textBody?: string;
}): Promise<void> {
  const lang = opts.lang ?? resolveWaLang({}, opts.textBody ?? "");
  const footer = lang === "en" ? "Tap to continue 😊" : "Option select karein 😊";

  await sendInteractiveList({
    phone: opts.phone,
    body: footer,
    buttonLabel: lang === "en" ? "Menu" : "Menu",
    rows: [
      { id: QA.products, title: "🛒 Products", description: "Browse categories" },
      { id: QA.placeOrder, title: "📦 Place Order", description: "Start your order" },
      { id: QA.payment, title: "💳 Payment Methods", description: "COD, bank, Easypaisa" },
      { id: QA.delivery, title: "🚚 Delivery Charges", description: "Lahore & nationwide" },
      { id: QA.address, title: "📍 Address & Location", description: "Shop & maps" },
      { id: QA.track, title: "📦 Track Order", description: "Order status" },
      { id: QA.support, title: "☎ Support", description: "Call & WhatsApp" },
      { id: QA.app, title: "📱 Install App", description: "Mobile app" },
    ],
    settings: opts.waSettings,
    templateName: "premium_main_menu",
  });
}

export async function sendProductCategoryMenu(opts: {
  phone: string;
  waSettings: WaSettings;
  lang?: WaLang;
}): Promise<void> {
  const lang = opts.lang ?? resolveWaLang({});
  const intro =
    lang === "en"
      ? "🥜 *KDF MART Products*\n\nWhich category interests you? 😊"
      : "🥜 *KDF MART Products*\n\nAap kis category mein interested hain? 😊";

  await sendInteractiveList({
    phone: opts.phone,
    body: intro,
    buttonLabel: lang === "en" ? "Categories" : "Categories",
    rows: PRODUCT_CATEGORY_MENU.map((r) => ({
      id: r.id,
      title: r.title.slice(0, 24),
      description: r.description.slice(0, 72),
    })),
    settings: opts.waSettings,
    templateName: "premium_product_categories",
  });
}

async function pickBestsellerProducts(limit = 6) {
  const out: Awaited<ReturnType<typeof listProductsByCategoryId>>["products"] = [];
  for (const id of ["almonds", "pistachio", "cashew", "walnut", "dates", "honey"]) {
    if (out.length >= limit) break;
    const { products } = await listProductsByCategoryId(id);
    if (products[0]) out.push(products[0]);
  }
  return out.slice(0, limit);
}

async function pickHotDealProducts(limit = 6) {
  const all = await loadAllCatalogProducts();
  const deals = all.filter((p) => {
    const price = Number(p.rawPrice ?? 0);
    const compareStr = String(p.compareAt ?? "");
    const compareMatch = compareStr.match(/\d[\d,]*/);
    const compare = compareMatch ? Number(compareMatch[0].replace(/,/g, "")) : Number(p.compareAtPrice ?? 0);
    return compare > price && price > 0;
  });
  if (deals.length >= 2) return deals.slice(0, limit);
  return all.filter((p) => p.inStock).slice(0, limit);
}

function compactCategoryLabel(cat: WaSalesCategory | null, roman: boolean): string {
  if (!cat) return roman ? "Products" : "Products";
  return roman ? cat.labelEn : cat.labelUr;
}

/** Show top products only (no full catalog spam). */
export async function sendCategoryProductPicker(opts: {
  phone: string;
  categoryId: string;
  waSettings: WaSettings;
  lang?: WaLang;
  textBody?: string;
}): Promise<boolean> {
  const lang = opts.lang ?? resolveWaLang({}, opts.textBody ?? "");
  const roman = opts.textBody ? isRomanUrduWa(opts.textBody) : lang !== "ur";
  let products: Awaited<ReturnType<typeof listProductsByCategoryId>>["products"] = [];
  let category: WaSalesCategory | null = null;

  if (opts.categoryId === "bestsellers") {
    products = await pickBestsellerProducts(8);
    category = {
      id: "bestsellers",
      emoji: "⭐",
      labelEn: "Best Sellers",
      labelUr: "Best Sellers",
      families: [],
    };
  } else if (opts.categoryId === "hotdeals") {
    products = await pickHotDealProducts(8);
    category = {
      id: "hotdeals",
      emoji: "🔥",
      labelEn: "Hot Deals",
      labelUr: "Hot Deals",
      families: [],
    };
  } else if (opts.categoryId === "dried") {
    const merged: typeof products = [];
    for (const id of ["dates", "figs", "raisins", "berries"]) {
      const block = await listProductsByCategoryId(id);
      merged.push(...block.products.slice(0, 3));
    }
    products = merged.slice(0, 8);
    category = {
      id: "dried",
      emoji: "🥭",
      labelEn: "Dried Fruits",
      labelUr: "Dry Fruits",
      families: [],
    };
  } else {
    const browse = await buildCategoryBrowseFromMenuPick({
      categoryId: opts.categoryId,
      textBody: opts.textBody ?? opts.categoryId,
      page: 0,
    });
    if (!browse?.products.length) return false;
    products = browse.products.slice(0, 8);
    category = browse.category;
  }

  if (!products.length) return false;

  const label = compactCategoryLabel(category, roman);
  const header = roman
    ? `🥜 Popular *${label}* options:\n\n`
    : `🥜 Popular *${label}* options:\n\n`;

  const lines = products.slice(0, 8).map((p, i) => {
    const price = p.rawPrice ? ` — from Rs. ${Math.round(p.rawPrice).toLocaleString("en-PK")}` : "";
    return `${i + 1}️⃣ ${p.name}${price}`;
  });

  const body =
    header +
    lines.join("\n") +
    (roman
      ? "\n\nReply with the number (1, 2, 3…) — main price, quality aur order help karunga 😊"
      : "\n\nنمبر reply کریں (1, 2, 3…) — price, quality aur order میں مدد کروں گا 😊");

  const waProducts = toWhatsAppCatalogProducts(products);
  await setConversationState(opts.phone, "wa_order_await_product_choice", {
    products: waProducts,
    categoryId: opts.categoryId,
    categoryProducts: products,
    productQuery: opts.categoryId,
    catalogPage: 0,
    pendingProductQuery: products[0]?.name ?? opts.categoryId,
    preferredLanguage: lang,
    waLang: lang,
  });

  const { sendWhatsAppMessage } = await import("./whatsapp.js");
  await sendWhatsAppMessage({
    phone: opts.phone,
    message: body,
    templateName: "premium_category_picker",
  });
  return true;
}

export async function sendAppInstallCta(opts: {
  phone: string;
  waSettings: WaSettings;
  lang?: WaLang;
}): Promise<void> {
  const lang = opts.lang ?? resolveWaLang({});
  const text =
    lang === "en"
      ? "📱 Install the *KDF MART* app for faster ordering, tracking & exclusive offers 😊"
      : "📱 *KDF MART* app install karein — fast ordering, tracking aur exclusive offers 😊";

  await sendCtaUrlMessage({
    phone: opts.phone,
    text,
    buttonText: "📲 Install App",
    url: KDF_APP_INSTALL_URL,
    settings: opts.waSettings,
    templateName: "app_install_cta",
  });
}

export function resolveCategoryIdFromButtonId(buttonId: string): string | null {
  if (!buttonId.startsWith(CAT_PREFIX)) return null;
  const key = buttonId.slice(CAT_PREFIX.length);
  const row = PRODUCT_CATEGORY_MENU.find((r) => r.id === buttonId || r.categoryId === key);
  return row?.categoryId ?? key;
}
