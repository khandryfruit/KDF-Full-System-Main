/**
 * WhatsApp order journey — single-product offer, checkout steps, summaries.
 */
import { formatOrderPreviewReply, formatVariantSelectionReply } from "./waSalesAgent.js";

export const WA_CHECKOUT_COLLECTION_STATES = new Set([
  "wa_order_await_name",
  "wa_order_await_phone",
  "wa_order_await_city",
  "wa_order_await_city_search",
  "wa_order_await_area",
  "wa_order_await_address",
  "wa_order_await_delivery_notes",
  "wa_order_await_payment",
  "wa_order_await_cod_confirm",
  "wa_order_await_bank_screenshot",
  "wa_order_await_easypaisa_screenshot",
  "wa_order_await_address_detail",
  "wa_order_await_address_confirm",
  "wa_order_await_address_extras",
  "wa_order_await_landmark",
  "wa_order_await_confirm",
]);

export const WA_PRODUCT_PICK_STATES = new Set([
  "wa_order_await_product",
  "wa_order_await_product_choice",
  "wa_order_await_variant",
  "wa_order_await_preconfirm",
  "wa_order_await_quantity",
]);

export type WaJourneyProduct = {
  name: string;
  price: string;
  description: string | null;
  imageUrl: string | null;
  productUrl: string;
  inStock: boolean;
  variantLines?: string[];
  variantOptions?: Array<{ id: string; title: string; price: number; sku?: string; inventoryQuantity?: number }>;
  source?: string;
  commerceProductId?: string;
  shopifyProductId?: string;
  rawPrice?: number;
};

export function isWaCheckoutCollectionState(state: string): boolean {
  return WA_CHECKOUT_COLLECTION_STATES.has(state);
}

export function isShowMoreProductsMessage(text: string): boolean {
  const t = String(text ?? "").trim().toLowerCase();
  return /\b(show more|more products|aur products|more options|dikhao aur|مزید|اور دکھائیں|or products)\b/i.test(t)
    || t === "more";
}

export function isCheckoutCancellationMessage(text: string): boolean {
  const t = String(text ?? "").trim().toLowerCase();
  return /^(cancel|nahi|nai|no|band|stop|2)$/.test(t)
    || /\b(cancel order|order cancel)\b/i.test(t);
}

export function formatRupeesLocal(value: unknown): string {
  const n = Number.parseFloat(String(value ?? "0").replace(/[^\d.]/g, ""));
  return `Rs. ${Number.isFinite(n) ? Math.round(n).toLocaleString("en-PK") : "0"}`;
}

export function buildSingleProductIntro(product: WaJourneyProduct, roman: boolean): {
  imageCaption: string;
  detailBody: string;
  sizeMenu: string;
} {
  const features = product.description
    ? `⭐ ${product.description.slice(0, 160)}${product.description.length > 160 ? "…" : ""}\n`
    : "⭐ Premium quality · Fresh stock\n";
  const delivery = roman
    ? "🚚 *Delivery:*\n• Lahore: Same day (cut-off apply)\n• Pakistan: 2–5 working days"
    : "🚚 *Delivery:*\n• Lahore: Same day\n• Pakistan: 2–5 working days";
  const stock = product.inStock ? "✅ In stock" : "❌ Out of stock";

  const catalogProduct = {
    name: product.name,
    price: product.price,
    rawPrice: product.rawPrice ?? 0,
    inStock: product.inStock,
    variantOptions: product.variantOptions ?? [],
  } as Parameters<typeof formatVariantSelectionReply>[0]["product"];

  return {
    imageCaption: `🥜 *${product.name}*\n💰 ${product.price}\n${stock}`,
    detailBody:
      `📦 *${product.name}*\n\n` +
      `⚖ *Available sizes:*\n` +
      (product.variantLines?.length
        ? product.variantLines.map((line, i) => `${i + 1}️⃣ ${line}`).join("\n")
        : `1️⃣ ${product.price}`) +
      `\n\n${features}${delivery}\n\n🔗 ${product.productUrl}\n\n` +
      (roman ? "Size select karein — reply *1*, *2*, *3*" : "Size منتخب کریں — *1*, *2*, *3* reply کریں"),
    sizeMenu: formatVariantSelectionReply({ product: catalogProduct, roman }),
  };
}

export function buildPreconfirmMessage(opts: {
  productName: string;
  variantTitle: string;
  unitPrice: number;
  quantity?: number;
  roman: boolean;
}): string {
  return formatOrderPreviewReply({
    productName: opts.productName,
    variantTitle: opts.variantTitle,
    unitPrice: opts.unitPrice,
    quantity: opts.quantity ?? 1,
    roman: opts.roman,
  });
}

export function buildFinalOrderSummary(state: Record<string, any>, roman: boolean): string {
  const cart = Array.isArray(state.cart) ? state.cart : [];
  const item = cart[0];
  const subtotal = Number(state.subtotal ?? 0);
  const delivery = Number(state.delivery ?? 0);
  const discount = Number(state.discount ?? 0);
  const total = Number(state.total ?? subtotal - discount + delivery);

  const header = roman ? "📋 *Order Summary*" : "📋 *Order Summary*";
  const lines = [
    header,
    "",
    `🥜 *Product:* ${item?.productName ?? state.productName ?? "—"}`,
    `⚖ *Variant:* ${item?.variantTitle ?? state.variantTitle ?? "—"}`,
    `📦 *Qty:* ${item?.quantity ?? state.quantity ?? 1}`,
    `💵 *Subtotal:* ${formatRupeesLocal(subtotal)}`,
    discount > 0 ? `🎁 *Discount:* -${formatRupeesLocal(discount)}` : null,
    `🚚 *Delivery:* ${state.deliveryLabel ?? formatRupeesLocal(delivery)}`,
    "━━━━━━━━━━",
    `💵 *Final:* ${formatRupeesLocal(total)}`,
    "",
    `👤 *Name:* ${state.customerName ?? "—"}`,
    `📞 *Phone:* ${state.customerPhone ?? "—"}`,
    `🏙 *City:* ${state.city ?? "—"}`,
    `📍 *Address:* ${state.address ?? "—"}`,
    state.deliveryNotes ? `📝 *Instructions:* ${state.deliveryNotes}` : null,
    "",
    roman
      ? "Sab theek hai? Confirm karein 👇"
      : "سب ٹھیک ہے؟ Confirm کریں 👇",
  ].filter(Boolean);

  return lines.join("\n");
}

export function estimateDeliveryReply(city: string, roman: boolean): string {
  const c = String(city ?? "").toLowerCase();
  const lahore = /\b(lahore|lhr|لاہور)\b/i.test(c);
  if (roman) {
    return lahore
      ? "📍 *Lahore:* Same-day delivery (subject to cut-off & stock)."
      : "📍 *Pakistan:* Estimated 2–5 working days after dispatch.";
  }
  return lahore
    ? "📍 *Lahore:* Same-day delivery (cut-off ke mutabiq)."
    : "📍 *Pakistan:* 2–5 working days (estimated).";
}

export function buildOrderPlacedConfirmation(orderNumber: string, city: string, roman: boolean): string {
  const delivery = estimateDeliveryReply(city, roman);
  if (roman) {
    return (
      `Shukriya 😊\n\n` +
      `Aapka order successfully place ho gaya.\n\n` +
      `🧾 *Order ID:* #${orderNumber}\n\n` +
      `${delivery}\n\n` +
      `Hum jald update dein ge. Tracking ke liye *track order* likh dein.\n\n` +
      `JazakAllah — Khan Dry Fruits 🌟`
    );
  }
  return (
    `شکریہ 😊\n\n` +
    `آپ کا order place ہو گیا۔\n\n` +
    `🧾 *Order ID:* #${orderNumber}\n\n` +
    `${delivery}\n\n` +
    `جلد update ملے گا۔ *track order* لکھیں۔\n\n` +
    `جزاک اللہ — Khan Dry Fruits 🌟`
  );
}

export function buildNumberedProductList(
  products: WaJourneyProduct[],
  roman: boolean,
): string {
  const header = roman ? "🥜 *More matching products:*\n\n" : "🥜 *مزید products:*\n\n";
  const list = products
    .slice(0, 8)
    .map((p, i) => `${i + 1}️⃣ ${p.name} — ${p.price}${p.inStock ? "" : " (out)"}`)
    .join("\n");
  const footer = roman
    ? "\n\nProduct number reply karein (1, 2, 3…)"
    : "\n\nProduct number reply کریں (1، 2، 3…)";
  return header + list + footer;
}
