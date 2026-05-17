/**
 * Deterministic human-like conversation flows — welcome, education, delivery (with buttons).
 */
import { sendInteractiveButtons, sendInteractiveList } from "./whatsapp.js";
import type { WaLang } from "./waPremiumJourney.js";
import { extractProductQueryFromMessage, isRomanUrduWa } from "./waProductBrain.js";
import { buildDeliveryReply } from "./waIntentEngine.js";
import { productRootTermsFromQuery } from "./shopifyProductSearch.js";

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

const PRODUCT_BENEFIT_LINES: Record<string, string[]> = {
  badam: ["Protein source", "Healthy fats", "Daily nutrition support", "Energy support"],
  almond: ["Protein source", "Healthy fats", "Daily nutrition support", "Energy support"],
  pista: ["Healthy fats", "Fiber", "Antioxidants", "Popular snack"],
  pistachio: ["Healthy fats", "Fiber", "Antioxidants", "Popular snack"],
  kaju: ["Healthy fats", "Minerals", "Energy support", "Creamy taste"],
  cashew: ["Healthy fats", "Minerals", "Energy support", "Creamy taste"],
  akhrot: ["Omega-3 fats", "Brain health support", "Fiber", "Premium nuts"],
  walnut: ["Omega-3 fats", "Brain health support", "Fiber", "Premium nuts"],
  khajoor: ["Natural sweetness", "Energy", "Fiber", "Traditional dry fruit"],
  kishmish: ["Natural energy", "Fiber", "Iron support", "Light snack"],
};

const GENERIC_BENEFITS = ["Natural nutrition", "Energy support", "Healthy snacking", "Premium quality"];

function displayProductName(query: string): string {
  const roots = productRootTermsFromQuery(query);
  const key = roots[0] ?? query.toLowerCase().split(/\s+/)[0] ?? "product";
  const map: Record<string, string> = {
    badam: "Badam (Almonds)",
    almond: "Almonds",
    pista: "Pista",
    pistachio: "Pistachio",
    kaju: "Kaju",
    cashew: "Cashew",
    akhrot: "Akhrot",
    walnut: "Walnut",
    khajoor: "Khajoor",
    kishmish: "Kishmish",
  };
  return map[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

export function buildProductQualityMessage(textBody: string, lang: WaLang): string {
  const query = extractProductQueryFromMessage(textBody);
  const name = displayProductName(query || textBody);
  if (lang === "en") {
    return (
      `Ji 😊\n\n*${name}* at Khan Dry Fruits:\n\n` +
      `✓ Hand-selected premium grade\n✓ Fresh stock rotation\n✓ Sealed hygienic packing\n✓ Trusted by Lahore customers\n\n` +
      `Would you like *price* or to *order*? 😊`
    );
  }
  return (
    `جی 😊\n\n*${name}* — Khan Dry Fruits:\n\n` +
    `✓ Premium hand-selected\n✓ Fresh stock\n✓ Hygienic packing\n✓ Lahore customers ki pasand\n\n` +
    `*Price* دیکھیں یا *order* کریں؟ 😊`
  );
}

export function buildProductEducationMessage(textBody: string, lang: WaLang): string {
  const query = extractProductQueryFromMessage(textBody);
  const roots = productRootTermsFromQuery(query);
  const key = roots[0] ?? "";
  const benefits = PRODUCT_BENEFIT_LINES[key] ?? GENERIC_BENEFITS;
  const name = displayProductName(query || textBody);
  const lines = benefits.map((b) => `✓ ${b}`).join("\n");

  if (lang === "en") {
    return (
      `Ji 😊\n\n*${name}* is quite popular.\n\nUsually:\n\n${lines}\n\n` +
      `Would you like to see *price*, know more about *quality*, or *order*? 😊`
    );
  }
  return (
    `جی 😊\n\n*${name}* کافی پسند کیے جاتے ہیں۔\n\nعام طور پر:\n\n${lines}\n\n` +
    `کیا آپ *price* بھی دیکھنا چاہیں گے یا *quality* کے بارے میں جاننا چاہتے ہیں؟ 😊`
  );
}

export async function sendPremiumWelcomeWithButtons(opts: {
  phone: string;
  textBody?: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const roman = opts.textBody ? isRomanUrduWa(opts.textBody) : opts.lang !== "ur";
  const body = opts.lang === "en"
    ? `Assalam o Alaikum 😊\n\nWelcome to *Khan Dry Fruits*.\n\nHow can I help you today? 🌟`
    : roman
      ? `Assalam o Alaikum 😊\n\n*Khan Dry Fruits* mein khush aamdeed.\n\nUmeed hai aap khairyat se honge 🌟\n\nAaj kis cheez mein madad kar sakta hoon?`
      : `السلام علیکم 😊\n\n*Khan Dry Fruits* میں خوش آمدید۔\n\nامید ہے آپ خیریت سے ہوں گے 🌟\n\nآج کس چیز میں مدد کر سکتا ہوں؟`;

  await sendInteractiveList({
    phone: opts.phone,
    body,
    buttonLabel: opts.lang === "en" ? "Options" : "Menu",
    rows: [
      { id: "wa_conv_shop", title: "🛒 Shop Products", description: "Browse dry fruits" },
      { id: "wa_conv_delivery", title: "🚚 Delivery", description: "Charges & timing" },
      { id: "wa_conv_track", title: "📦 Track Order", description: "Order status" },
      { id: "wa_conv_support", title: "💬 Support", description: "Talk to us" },
    ],
    settings: opts.waSettings,
    templateName: "premium_welcome_menu",
  });
}

export async function sendProductEducationWithButtons(opts: {
  phone: string;
  textBody: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const body = buildProductEducationMessage(opts.textBody, opts.lang);
  await sendInteractiveButtons({
    phone: opts.phone,
    text: body,
    buttons: [
      { id: "wa_edu_price", title: "💰 Price" },
      { id: "wa_edu_quality", title: "⭐ Quality" },
      { id: "wa_edu_order", title: "🛒 Order" },
    ],
    settings: opts.waSettings,
    templateName: "product_education_guide",
  });
}

export async function sendDeliveryFaqWithButtons(opts: {
  phone: string;
  textBody: string;
  waSettings: WaSettings;
}): Promise<void> {
  const roman = isRomanUrduWa(opts.textBody);
  let body = await buildDeliveryReply(opts.textBody);
  if (roman && !body.includes("Same day")) {
    body = `Ji 😊\n\n*Lahore:*\nSame day available\nDelivery: Rs.300\n\n*Other cities:*\nRs.300–500\n\n*Orders 10,000+:*\nFREE delivery 🌟`;
  } else if (!roman && !body.includes("same day")) {
    body = `جی 😊\n\n*Lahore:*\nSame day available\nDelivery: Rs.300\n\n*Other cities:*\nRs.300–500\n\n*10,000+ orders:*\nFREE delivery 🌟`;
  }

  await sendInteractiveButtons({
    phone: opts.phone,
    text: body,
    buttons: [
      { id: "wa_conv_track", title: "📦 Track Order" },
      { id: "wa_conv_address", title: "📍 Address" },
      { id: "wa_conv_support", title: "💬 Support" },
    ],
    settings: opts.waSettings,
    templateName: "delivery_faq_buttons",
  });
}
