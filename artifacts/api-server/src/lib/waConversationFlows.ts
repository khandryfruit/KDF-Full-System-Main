/**
 * Human conversation-first flows — text replies by default; buttons only in context.
 */
import { sendCtaUrlMessage } from "./whatsapp.js";
import type { WaLang } from "./waPremiumJourney.js";
import { extractProductQueryFromMessage, isRomanUrduWa } from "./waProductBrain.js";
import { productRootTermsFromQuery } from "./shopifyProductSearch.js";
import { KDF_STORE, buildMapsUrl } from "./waSupportFlows.js";

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

/** Pure text welcome — no buttons (Hey / Hello / Salam). */
export function buildHumanWelcomeText(textBody: string | undefined, lang: WaLang): string {
  const roman = textBody ? isRomanUrduWa(textBody) : lang !== "ur";
  if (lang === "en") {
    return `Assalam o Alaikum 😊\n\nWelcome to *Khan Dry Fruits*.\n\nHope you are well 🌟\n\nHow can I help you today?`;
  }
  if (roman) {
    return `Assalam o Alaikum 😊\n\n*Khan Dry Fruits* mein khush aamdeed.\n\nUmeed hai aap khairyat se honge 🌟\n\nAaj kis cheez mein madad kar sakta hoon?`;
  }
  return `السلام علیکم 😊\n\n*Khan Dry Fruits* میں خوش آمدید۔\n\nامید ہے آپ خیریت سے ہوں گے 🌟\n\nآج کس چیز میں مدد کر سکتا ہوں؟`;
}

/** Delivery charges — natural text + ask city. No menus. */
export function buildDeliveryConversationText(textBody: string, lang: WaLang): string {
  const roman = isRomanUrduWa(textBody);
  if (lang === "en") {
    return (
      `Ji 😊\n\nIn *Lahore*, delivery is usually around *Rs.300* (same-day often available).\n\n` +
      `For *other cities*, it is typically *Rs.300–500* depending on city and weight.\n\n` +
      `Orders *Rs.10,000+* may qualify for *free delivery* when the offer is active.\n\n` +
      `Which city are you asking for? 😊`
    );
  }
  if (roman) {
    return (
      `Ji 😊\n\n*Lahore* mein aksar *Rs.300* hoti hai (same-day bhi ho sakti hai).\n\n` +
      `*Doosre shehron* mein taqreeban *Rs.300–500* (city/weight ke hisaab se).\n\n` +
      `*Rs.10,000+* par kabhi kabhi *free delivery* bhi hoti hai.\n\n` +
      `Aap kis shehar ke liye pooch rahe hain? 😊`
    );
  }
  return (
    `جی 😊\n\n*Lahore* میں اکثر *Rs.300* ہوتی ہے (same-day بھی دستیاب ہو سکتی ہے)۔\n\n` +
    `*دیگر شہروں* میں تقریباً *Rs.300–500* (شہر/وزن کے حساب سے)۔\n\n` +
    `*Rs.10,000+* پر کبھی کبھی *free delivery* بھی ہوتی ہے۔\n\n` +
    `آپ کس شہر کے لیے پوچھ رہے ہیں؟ 😊`
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
      `If you want, I can share *price*, *quality* details, or help you *order* — just tell me 😊`
    );
  }
  const roman = isRomanUrduWa(textBody);
  if (roman) {
    return (
      `Ji 😊\n\n*${name}* kaafi pasand kiye jate hain.\n\nAam tor par:\n\n${lines}\n\n` +
      `Agar chahain to *price*, *quality*, ya *order* — bas bata dein 😊`
    );
  }
  return (
    `جی 😊\n\n*${name}* کافی پسند کیے جاتے ہیں۔\n\nعام طور پر:\n\n${lines}\n\n` +
    `اگر چاہیں تو *price*، *quality*، یا *order* — بتا دیں 😊`
  );
}

export function buildProductQualityMessage(textBody: string, lang: WaLang): string {
  const query = extractProductQueryFromMessage(textBody);
  const name = displayProductName(query || textBody);
  if (lang === "en") {
    return (
      `Ji 😊\n\n*${name}* at Khan Dry Fruits:\n\n` +
      `✓ Hand-selected premium grade\n✓ Fresh stock rotation\n✓ Sealed hygienic packing\n✓ Trusted by Lahore customers\n\n` +
      `Tell me if you want *price* or to *order* 😊`
    );
  }
  return (
    `جی 😊\n\n*${name}* — Khan Dry Fruits:\n\n` +
    `✓ Premium hand-selected\n✓ Fresh stock\n✓ Hygienic packing\n✓ Lahore customers ki pasand\n\n` +
    `*Price* یا *order* — بتا دیں 😊`
  );
}

export function buildShopAddressText(textBody: string, lang: WaLang): string {
  const roman = isRomanUrduWa(textBody);
  const addr = KDF_STORE.addressLines.join("\n");
  if (lang === "en") {
    return `Ji 😊\n\n*Our shop:*\n\n📍 ${addr}\n\n📞 ${KDF_STORE.phone}\n📱 WhatsApp: ${KDF_STORE.whatsapp}\n\nI can send the map location if you like 😊`;
  }
  if (roman) {
    return `Ji 😊\n\n*Hamari shop:*\n\n📍 ${addr}\n\n📞 ${KDF_STORE.phone}\n📱 WhatsApp: ${KDF_STORE.whatsapp}\n\nChahain to location bhej sakta hoon 😊`;
  }
  return `جی 😊\n\n*ہماری shop:*\n\n📍 ${addr}\n\n📞 ${KDF_STORE.phone}\n📱 WhatsApp: ${KDF_STORE.whatsapp}\n\nاگر چاہیں location بھیج سکتا ہوں 😊`;
}

/** Address FAQ: text first, then ONLY map CTA when relevant. */
export async function sendAddressWithLocationCta(opts: {
  phone: string;
  textBody: string;
  lang: WaLang;
  waSettings: WaSettings;
  sendText: (phone: string, text: string, template: string) => Promise<void>;
}): Promise<void> {
  await opts.sendText(opts.phone, buildShopAddressText(opts.textBody, opts.lang), "shop_address_text");
  await sendCtaUrlMessage({
    phone: opts.phone,
    text: opts.lang === "en" ? "Tap to open our location on Google Maps 👇" : "📍 Location map 👇",
    buttonText: "📍 Open Location",
    url: buildMapsUrl(),
    settings: opts.waSettings,
    templateName: "shop_address_map_cta",
  });
}

export function buildProductPriceIntro(productQuery: string, lang: WaLang): string {
  const name = displayProductName(productQuery);
  if (lang === "en") return `Ji 😊 One moment — checking *${name}* for you 👇`;
  return `جی 😊 ایک لمحہ — *${name}* check کرتا ہوں 👇`;
}
