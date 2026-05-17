/**
 * Premium WhatsApp sales journey — language, quantity, payment (COD / bank), summaries.
 */
import { db, manualPaymentsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { isRomanUrduWa } from "./waProductBrain.js";
import { formatRupeesLocal, estimateDeliveryReply } from "./waOrderJourney.js";
import { parseCityButtonId } from "./waPakistanCities.js";

export type WaLang = "ur" | "en" | "ps";

export const WA_AWAIT_LANGUAGE_STATE = "wa_await_language";
export const WA_ORDER_AWAIT_BANK_SCREENSHOT = "wa_order_await_bank_screenshot";
export const WA_ORDER_AWAIT_EASYPAISA_SCREENSHOT = "wa_order_await_easypaisa_screenshot";
export const WA_ORDER_AWAIT_ADDRESS_DETAIL = "wa_order_await_address_detail";
export const WA_ORDER_AWAIT_ADDRESS_EXTRAS = "wa_order_await_address_extras";

export { WA_ORDER_AWAIT_CITY_SEARCH, WA_ORDER_AWAIT_AREA, WA_ORDER_AWAIT_LANDMARK, WA_ORDER_AWAIT_COD_CONFIRM } from "./waCheckoutFlow.js";

/** Default bank details (user-provided); DB manual_payments overrides when configured */
export const KDF_DEFAULT_BANK = {
  bankName: "Meezan Bank",
  accountTitle: "Khan Dry Fruit",
  accountNumber: "02460105204017",
  iban: "" as string | null,
  easypaisa: "03049996000",
  easypaisaName: "Qadir Khan",
};

export type BankDetails = typeof KDF_DEFAULT_BANK;

let bankCache: { at: number; details: BankDetails } | null = null;

export async function loadWaBankDetails(): Promise<BankDetails> {
  const now = Date.now();
  if (bankCache && now - bankCache.at < 120_000) return bankCache.details;
  try {
    const [row] = await db
      .select()
      .from(manualPaymentsTable)
      .where(eq(manualPaymentsTable.isActive, true))
      .orderBy(asc(manualPaymentsTable.sortOrder))
      .limit(1);
    if (row) {
      const details: BankDetails = {
        bankName: row.bankName,
        accountTitle: row.accountTitle,
        accountNumber: row.accountNumber,
        iban: row.iban ?? null,
        easypaisa: KDF_DEFAULT_BANK.easypaisa,
        easypaisaName: KDF_DEFAULT_BANK.easypaisaName,
      };
      bankCache = { at: now, details };
      return details;
    }
  } catch { /* use defaults */ }
  bankCache = { at: now, details: KDF_DEFAULT_BANK };
  return KDF_DEFAULT_BANK;
}

export function resolveWaLang(stateData: Record<string, unknown>, textFallback?: string): WaLang {
  const saved = String(stateData.preferredLanguage ?? stateData.waLang ?? "").toLowerCase();
  if (saved === "en" || saved === "ps" || saved === "ur") return saved;
  if (textFallback && /[اآبپتٹثجچحخدڈذرڑزژسشصضطظعغفقکگلمنوہھیے]/.test(textFallback)) return "ur";
  if (textFallback && /[ښږۍېۆة]/.test(textFallback)) return "ps";
  if (textFallback && isRomanUrduWa(textFallback)) return "ur";
  return "ur";
}

export function useRomanUrdu(lang: WaLang, text?: string): boolean {
  if (lang === "en") return true;
  if (lang === "ps") return false;
  return text ? isRomanUrduWa(text) : true;
}

export function buildLanguageWelcomeMessage(): string {
  return `Assalam o Alaikum 😊

*KDF MART* mein khush amdeed.

Main aapki madad *products*, *prices*, *delivery*, *orders* aur *payments* mein kar sakta hoon.

Aap kis zuban mein baat karna pasand kareinge? 👇`;
}

export function buildLanguageSavedAck(lang: WaLang): string {
  if (lang === "en") {
    return `Thank you 😊\n\nI'll continue in *English*.\n\nWhat would you like help with today?`;
  }
  if (lang === "ps") {
    return `مننه 😊\n\nزه به په *پښتو* کې دوام ورکړم.\n\nنن مو څه مرسته غواړئ؟`;
  }
  return `Shukriya 😊\n\nMain *اردو* mein baat karunga.\n\nAaj aap kis cheez ke baare mein poochna chahenge?`;
}

export function buildProductIntentPrompt(productName: string, lang: WaLang): string {
  const name = productName.trim();
  if (lang === "en") return `Yes 😊\n\nWhat would you like about *${name}*?`;
  if (lang === "ps") return `هو 😊\n\nد *${name}* په اړه څه غواړئ؟`;
  return `Ji 😊\n\nAap *${name}* ke baare mein kya dekhna chahenge?`;
}

export function buildLiveTotalPreview(state: Record<string, any>, lang: WaLang): string {
  const unit = Number(state.unitPrice ?? state.cart?.[0]?.unitPrice ?? 0);
  const qty = Number(state.quantity ?? state.cart?.[0]?.quantity ?? 1);
  const subtotal = Number(state.subtotal ?? unit * qty);
  let delivery = Number(state.delivery ?? 0);
  let deliveryLabel = String(state.deliveryLabel ?? "").trim();
  if (!deliveryLabel) {
    const city = String(state.city ?? "").toLowerCase();
    const lahore = /\b(lahore|lhr|لاہور)\b/i.test(city);
    delivery = subtotal >= 10000 ? 0 : lahore ? 300 : 300;
    deliveryLabel = delivery === 0
      ? "Rs. 0 (FREE above Rs. 10,000)"
      : lahore
        ? "Rs. 300 (Lahore est.)"
        : "Rs. 300 (Pakistan est.)";
  }
  const discount = Number(state.discount ?? 0);
  const total = Number(state.total ?? Math.max(0, subtotal - discount + delivery));
  const L = (ur: string, en: string, ps: string) => (lang === "en" ? en : lang === "ps" ? ps : ur);
  return [
    L("💰 *Live total*", "💰 *Live total*", "💰 *Live total*"),
    `${L("Subtotal", "Subtotal", "Subtotal")}: ${formatRupeesLocal(subtotal)}`,
    `${L("Delivery", "Delivery", "Delivery")}: ${deliveryLabel || formatRupeesLocal(delivery)}`,
    `${L("Est. final", "Est. final", "Est. final")}: ${formatRupeesLocal(total)}`,
  ].join("\n");
}

export async function buildEasypaisaMessage(lang: WaLang): Promise<string> {
  const b = await loadWaBankDetails();
  if (lang === "en") {
    return (
      `Yes 😊\n\n*Easypaisa payment:*\n\n` +
      `📱 *Number:* ${b.easypaisa}\n` +
      `👤 *Name:* ${b.easypaisaName}\n\n` +
      `Send *screenshot* after payment 📸`
    );
  }
  if (lang === "ps") {
    return (
      `هو 😊\n\n*ایزی پیسہ:*\n\n` +
      `📱 ${b.easypaisa}\n` +
      `👤 ${b.easypaisaName}\n\n` +
      `تادیې وروسته screenshot ولېږئ 📸`
    );
  }
  return (
    `Ji 😊\n\n*Easypaisa payment:*\n\n` +
    `📱 *Number:* ${b.easypaisa}\n` +
    `👤 *Name:* ${b.easypaisaName}\n\n` +
    `Payment ke baad *screenshot* bhej dein 📸`
  );
}

export function buildProductIntroLine(productName: string, lang: WaLang): string {
  const name = productName.trim();
  if (lang === "en") return `Yes 😊\n\nWe have premium *${name}* available.`;
  if (lang === "ps") return `هو 😊\n\nموږ د *${name}* غوره کیفیت لرو.`;
  return `Ji 😊\n\nHumare paas premium *${name}* available hain.`;
}

export function buildQuantityPrompt(lang: WaLang): string {
  if (lang === "en") return `How many packs would you like? 👇`;
  if (lang === "ps") return `څو پیکونه غواړئ؟ 👇`;
  return `Kitni quantity chahiye? 👇`;
}

export function buildNamePrompt(lang: WaLang): string {
  if (lang === "en") return `👤 Please send your *full name*:`;
  if (lang === "ps") return `👤 خپل *بشپړ نوم* ولېږئ:`;
  return `👤 Apna *poora naam* bhej dein:`;
}

export function buildPhonePrompt(opts: { name: string; detectedPhone: string; lang: WaLang }): string {
  if (opts.lang === "en") {
    return `Thank you *${opts.name}* 😊\n\n📞 Detected: *${opts.detectedPhone}*\n\nTap a button below 👇`;
  }
  if (opts.lang === "ps") {
    return `مننه *${opts.name}* 😊\n\n📞 ستاسو نمبر: *${opts.detectedPhone}*\n\nلاندې تڼۍ وټاکئ 👇`;
  }
  return `Shukriya *${opts.name}* 😊\n\n📞 Phone: *${opts.detectedPhone}* (WhatsApp)\n\nNeeche button select karein 👇`;
}

export function buildCityPrompt(lang: WaLang): string {
  if (lang === "en") return `🏙 Send your *city* (e.g. Lahore, Karachi):`;
  if (lang === "ps") return `🏙 خپل *ښار* ولېږئ (د بېلګې په توګه لاهور):`;
  return `🏙 Apni *city* ka naam bhej dein (jaise: Lahore, Karachi):`;
}

export function buildAddressPrompt(lang: WaLang): string {
  if (lang === "en") {
    return `📍 Send your *full address*:\n\nHouse #\nArea / Society\nLandmark (optional)\nCity`;
  }
  if (lang === "ps") {
    return `📍 خپل *بشپړ پته* ولېږئ:\n\nکور نمبر\nسیمه\nنښه (اختیاري)`;
  }
  return `📍 Ab *complete address* bhej dein:\n\nHouse #\nArea / Society\nLandmark (optional)`;
}

export function buildPaymentMethodPrompt(lang: WaLang): string {
  if (lang === "en") return `💳 Select *payment method* 👇`;
  if (lang === "ps") return `💳 د تادیې طریقه وټاکئ 👇`;
  return `💳 *Payment method* select karein 👇`;
}

export function buildCodSelectedMessage(lang: WaLang): string {
  if (lang === "en") {
    return `Yes 😊\n\n*Cash on Delivery* selected.\n\nYou will pay when you receive the parcel.\n\nI'll share your order summary for confirmation now.`;
  }
  if (lang === "ps") {
    return `هو 😊\n\n*Cash on Delivery* وټاکل شو.\n\nتاسو به پارسل ترلاسه کولو وخت تادیه وکړئ.\n\nاوس به ستاسو د امر لنډیز وښیم.`;
  }
  return `Ji 😊\n\n*Cash on Delivery* select ho gaya.\n\nAap parcel receive karte waqt payment kareinge.\n\nAb main aapka order summary confirm karta hoon.`;
}

export async function buildBankTransferMessage(lang: WaLang): Promise<string> {
  const b = await loadWaBankDetails();
  if (lang === "en") {
    return (
      `Yes 😊\n\nPayment account details:\n\n` +
      `🏦 *Bank:* ${b.bankName}\n` +
      `👤 *Account Title:* ${b.accountTitle}\n` +
      `🔢 *Account Number:* ${b.accountNumber}\n` +
      (b.iban ? `📋 *IBAN:* ${b.iban}\n` : "") +
      `📱 *Easypaisa:* ${b.easypaisa}\n` +
      `👤 *Easypaisa Name:* ${b.easypaisaName}\n\n` +
      `After transfer, please send a *screenshot* 😊`
    );
  }
  if (lang === "ps") {
    return (
      `هو 😊\n\nد تادیې حساب:\n\n` +
      `🏦 *بانک:* ${b.bankName}\n` +
      `👤 *نوم:* ${b.accountTitle}\n` +
      `🔢 *حساب:* ${b.accountNumber}\n` +
      `📱 *ایزی پیسہ:* ${b.easypaisa}\n` +
      `👤 *نوم:* ${b.easypaisaName}\n\n` +
      `تادیې وروسته *screenshot* ولېږئ 😊`
    );
  }
  return (
    `Ji 😊\n\nPayment ke liye account details niche hain:\n\n` +
    `🏦 *Bank:* ${b.bankName}\n` +
    `👤 *Account Title:* ${b.accountTitle}\n` +
    `🔢 *Account Number:* ${b.accountNumber}\n` +
    (b.iban ? `📋 *IBAN:* ${b.iban}\n` : "") +
    `📱 *Easypaisa:* ${b.easypaisa}\n` +
    `👤 *Easypaisa Name:* ${b.easypaisaName}\n\n` +
    `Agar payment transfer kar dein to *screenshot* bhej dein 😊`
  );
}

export function buildPaymentScreenshotAck(lang: WaLang): string {
  if (lang === "en") {
    return `Thank you 😊\n\nYour payment screenshot was received. After verification, your order will be confirmed.\n\nPlease review the summary below 👇`;
  }
  if (lang === "ps") {
    return `مننه 😊\n\nستاسو د تادیې screenshot ترلاسه شو. د تایید وروسته به امر تایید شي.\n\nلاندې لنډیز وګورئ 👇`;
  }
  return `Shukriya 😊\n\nPayment screenshot receive ho gaya. Verify hone ke baad aapka order confirm kar diya jayega.\n\nNeeche summary dekhein 👇`;
}

export function buildPremiumOrderSummary(state: Record<string, any>, lang: WaLang): string {
  const cart = Array.isArray(state.cart) ? state.cart : [];
  const item = cart[0];
  const subtotal = Number(state.subtotal ?? 0);
  const delivery = Number(state.delivery ?? 0);
  const discount = Number(state.discount ?? 0);
  const total = Number(state.total ?? subtotal - discount + delivery);
  const pay = String(state.paymentMethod ?? "COD");
  const payLabel = /easypaisa/i.test(pay)
    ? "Easypaisa"
    : /bank/i.test(pay)
      ? "Bank Transfer"
      : "Cash on Delivery (COD)";

  const L = (ur: string, en: string, ps: string) => (lang === "en" ? en : lang === "ps" ? ps : ur);

  return [
    L("📋 *Order Summary*", "📋 *Order Summary*", "📋 *د امر لنډیز*"),
    "",
    `${L("📦", "📦", "📦")} *${L("Product", "Product", "محصول")}:* ${item?.productName ?? state.productName ?? "—"}`,
    `${L("⚖", "⚖", "⚖")} *${L("Variant", "Variant", "سایز")}:* ${item?.variantTitle ?? state.variantTitle ?? "—"}`,
    `${L("📦", "📦", "📦")} *${L("Quantity", "Qty", "مقدار")}:* ${item?.quantity ?? state.quantity ?? 1}`,
    `${L("💰", "💰", "💰")} *${L("Subtotal", "Subtotal", "ذیلی مجموعہ")}:* ${formatRupeesLocal(subtotal)}`,
    discount > 0 ? `${L("🎁", "🎁", "🎁")} *${L("Discount", "Discount", "رعایت")}:* -${formatRupeesLocal(discount)}` : null,
    `${L("🚚", "🚚", "🚚")} *${L("Delivery", "Delivery", "ڈیلیوری")}:* ${state.deliveryLabel ?? formatRupeesLocal(delivery)}`,
    `${L("💳", "💳", "💳")} *${L("Payment", "Payment", "تادیہ")}:* ${payLabel}`,
    "━━━━━━━━━━",
    `${L("💵", "💵", "💵")} *${L("Final", "Final", "کل")}:* ${formatRupeesLocal(total)}`,
    "",
    `${L("👤", "👤", "👤")} *${L("Name", "Name", "نوم")}:* ${state.customerName ?? "—"}`,
    `${L("📞", "📞", "📞")} *${L("Phone", "Phone", "فون")}:* ${state.customerPhone ?? "—"}`,
    `${L("🏙", "🏙", "🏙")} *${L("City", "City", "ښار")}:* ${state.city ?? "—"}`,
    `${L("📍", "📍", "📍")} *${L("Address", "Address", "پته")}:* ${state.address ?? "—"}`,
    state.deliveryNotes ? `${L("📝", "📝", "📝")} ${state.deliveryNotes}` : null,
    "",
    L("Sab theek hai? Neeche confirm karein 👇", "Everything correct? Confirm below 👇", "ټول سم دی؟ لاندې تایید کړئ 👇"),
  ].filter(Boolean).join("\n");
}

export function buildOrderPlacedPremium(
  orderNumber: string,
  city: string,
  paymentMethod: string,
  lang: WaLang,
): string {
  const delivery = estimateDeliveryReply(city, useRomanUrdu(lang));
  const pay = /easypaisa/i.test(paymentMethod)
    ? "Easypaisa"
    : /bank/i.test(paymentMethod)
      ? "Bank Transfer"
      : "Cash on Delivery (COD)";
  if (lang === "en") {
    return (
      `Thank you 😊\n\nYour order was placed successfully.\n\n` +
      `🧾 *Order ID:* #${orderNumber}\n` +
      `💳 *Payment:* ${pay}\n\n` +
      `${delivery}\n\n` +
      `We'll update you soon. Type *track order* anytime.\n\nJazakAllah — Khan Dry Fruits 🌟`
    );
  }
  if (lang === "ps") {
    return (
      `مننه 😊\n\nستاسو امر بریالۍ ثبت شو.\n\n` +
      `🧾 *Order ID:* #${orderNumber}\n` +
      `💳 *تادیہ:* ${pay}\n\n` +
      `${delivery}\n\n` +
      `ژر به تازه معلومات درکړو. *track order* ولیکئ.\n\nمننه — Khan Dry Fruits 🌟`
    );
  }
  return (
    `Shukriya 😊\n\nAapka order successfully place ho gaya.\n\n` +
    `🧾 *Order ID:* #${orderNumber}\n` +
    `💳 *Payment:* ${pay}\n\n` +
    `${delivery}\n\n` +
    `Hum jald update dein ge. *track order* likh dein.\n\nJazakAllah — Khan Dry Fruits 🌟`
  );
}

export function buildTrackOrderTimeline(status: string, orderNumber: string, lang: WaLang): string {
  const rank: Record<string, number> = {
    pending: 0,
    confirmed: 1,
    processing: 2,
    shipped: 3,
    out_for_delivery: 4,
    delivered: 5,
  };
  const cur = rank[status] ?? 0;
  const step = (n: number, label: string) => (cur >= n ? label : `⚪ ${label.slice(2)}`);
  const header = lang === "en" ? "📦 *Order tracking*" : lang === "ps" ? "📦 *د امر تعقیب*" : "📦 *Order tracking*";
  return [
    header,
    "",
    `🧾 *${orderNumber}*`,
    "",
    step(0, lang === "en" ? "🟢 Placed" : lang === "ps" ? "🟢 ثبت" : "🟢 Placed"),
    step(1, lang === "en" ? "🟢 Confirmed" : lang === "ps" ? "🟢 تایید" : "🟢 Confirmed"),
    step(2, lang === "en" ? "🟡 Processing" : lang === "ps" ? "🟡 پروسس" : "🟡 Processing"),
    step(3, lang === "en" ? "🚚 Shipped" : lang === "ps" ? "🚚 لېږل" : "🚚 Shipped"),
    step(5, lang === "en" ? "✅ Delivered" : lang === "ps" ? "✅ سپارل" : "✅ Delivered"),
  ].join("\n");
}

export function parseLanguageChoice(textOrId: string): WaLang | null {
  const t = String(textOrId ?? "").trim().toLowerCase();
  if (t === "wa_lang_en" || t === "2" || t === "english" || t === "en") return "en";
  if (t === "wa_lang_ps" || t === "3" || t === "pashto" || t === "ps" || t === "پښتو") return "ps";
  if (t === "wa_lang_ur" || t === "1" || t === "urdu" || t === "ur" || t === "اردو") return "ur";
  return null;
}

export function parseQuantityChoice(textOrId: string): number | null {
  const t = String(textOrId ?? "").trim().toLowerCase();
  const map: Record<string, number> = {
    wa_qty_1: 1, wa_qty_2: 2, wa_qty_3: 3, wa_qty_4: 4, wa_qty_5: 5,
    wa_qty_6: 6, wa_qty_8: 8, wa_qty_10: 10,
  };
  if (map[t] != null) return map[t];
  if (/^wa_qty_(\d+)$/.test(t)) {
    const n = Number.parseInt(t.replace(/\D/g, ""), 10);
    if (n >= 1 && n <= 99) return n;
  }
  const n = Number.parseInt(t.replace(/[^\d]/g, ""), 10);
  if (n >= 1 && n <= 99) return n;
  return null;
}

export function parseVariantListId(id: string): number | null {
  const m = String(id ?? "").match(/^wa_v_(\d+)$/i);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseCityChoice(id: string): string | null {
  const parsed = parseCityButtonId(id);
  if (
    parsed === "__search__" ||
    parsed === "__page__" ||
    parsed === "__other__" ||
    parsed === "__confirm__" ||
    parsed === "__change__"
  ) {
    return parsed;
  }
  return parsed;
}
