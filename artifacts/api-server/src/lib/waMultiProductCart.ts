/**
 * Multi-product shopping cart for WhatsApp commerce checkout.
 */
import { sendInteractiveButtons, sendInteractiveList } from "./whatsapp.js";
import { searchCommerceProductsRanked, commerceToWaCatalogProducts, resolveCommerceImageUrl } from "./commerceProductSearch.js";
import { extractProductSearchQuery, extractWaProductEntity } from "./waProductEntity.js";
import { productRootTermsFromQuery } from "./shopifyProductSearch.js";
import { formatRupeesLocal } from "./waOrderJourney.js";
import type { WaLang } from "./waPremiumJourney.js";

export type WaCartLineItem = {
  productName: string;
  commerceProductId: string | number;
  shopifyProductId: string;
  variantId: string;
  variantTitle: string;
  quantity: number;
  unitPrice: number;
  imageUrl?: string | null;
  sku?: string;
};

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

/** Split "kaju, badam aur khajoor" → separate product queries */
export function parseMultiProductQueries(text: string): string[] {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  const parts = raw
    .split(/\s*(?:,|،| aur | and |\+|&|\n)\s*/i)
    .map((p) => extractProductSearchQuery(p).trim())
    .filter((p) => p.length >= 2);
  if (parts.length >= 2) return parts;

  const roots = productRootTermsFromQuery(raw);
  if (roots.length >= 2) return roots;

  const entity = extractWaProductEntity(raw);
  if (entity.specificKey && /\b(aur|and|,|،)\b/i.test(raw)) {
    return parts.length ? parts : [entity.entity];
  }
  return [];
}

export function isMultiProductOrderMessage(text: string): boolean {
  return parseMultiProductQueries(text).length >= 2;
}

/** "بادام بھی add کرو", "500g dates add", "add to cart badam" */
export function isAddToCartIntentMessage(text: string): boolean {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return false;
  if (/\b(cart|checkout|view cart|remove|delete)\b/i.test(t) && !/\b(add|shamil|include)\b/i.test(t)) {
    return false;
  }
  return (
    /\b(add|shamil|include|bhi|also|aur|more)\b/i.test(t) &&
    (productRootTermsFromQuery(t).length > 0 ||
      /\b(kg|g|gram|kilo|1kg|500g|250g)\b/i.test(t) ||
      /\b(chahiye|chahye|dena|bhejo|order|buy)\b/i.test(t))
  );
}

export function isViewCartIntentMessage(text: string): boolean {
  return /\b(view cart|cart dikhao|mera cart|my cart|cart dekho|cart check)\b/i.test(String(text ?? ""));
}

export function isCheckoutIntentMessage(text: string): boolean {
  return /\b(checkout|confirm order|place order|order confirm|bill banao)\b/i.test(String(text ?? ""));
}

function parseWeightFromMessage(text: string): { productQuery: string; quantity: number; variantHint?: string } {
  const raw = String(text ?? "").trim();
  const weightMatch = raw.match(/\b(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|g|gm|gram|grams)\b/i);
  const qtyMatch =
    raw.match(/\b(?:qty|quantity|pack|pcs)\s*(\d+)\b/i) ?? raw.match(/\b(\d+)\s*(?:x|pcs|pack)\b/i);
  const variantHint = weightMatch
    ? `${weightMatch[1]}${weightMatch[2]!.toLowerCase().startsWith("k") ? "KG" : "g"}`
    : undefined;
  const quantity = qtyMatch ? Math.max(1, Number(qtyMatch[1])) : 1;
  const productQuery =
    extractProductSearchQuery(
      raw
        .replace(/\b(add|shamil|bhi|also|aur|cart|karo|krdo|please|mujhe|chahiye)\b/gi, " ")
        .replace(/\b\d+(?:\.\d+)?\s*(?:kg|kgs|g|gm|gram|grams)\b/gi, " ")
        .trim(),
    ) || extractProductSearchQuery(raw);
  return { productQuery, quantity, variantHint };
}

/** Resolve one product line (with optional weight) and merge into session cart */
export async function tryAddSingleProductToCart(opts: {
  phone: string;
  textBody: string;
  waSettings: WaSettings;
  existingCart?: WaCartLineItem[];
}): Promise<{ cart: WaCartLineItem[]; line: WaCartLineItem } | null> {
  const parsed = parseWeightFromMessage(opts.textBody);
  let productQuery = parsed.productQuery;
  let quantity = parsed.quantity;
  let variantHint = parsed.variantHint;

  const roots = productRootTermsFromQuery(opts.textBody);
  if (!productQuery && roots.length) productQuery = roots[0]!;
  if (!productQuery || productQuery.length < 2) return null;

  const ranked = await searchCommerceProductsRanked(productQuery, 3);
  if (!ranked.products.length) return null;

  const wa = commerceToWaCatalogProducts(ranked.products)[0];
  if (!wa) return null;

  let variant = (wa.variantOptions ?? [])[0];
  if (variantHint && wa.variantOptions?.length) {
    const wanted = variantHint.toLowerCase().replace(/\s/g, "");
    variant =
      wa.variantOptions.find((v) => {
        const vt = String(v.title).toLowerCase().replace(/\s/g, "");
        return vt.includes(wanted) || wanted.includes(vt);
      }) ?? variant;
  }

  const unitPrice = variant ? parsePrice(variant.price) : parsePrice(wa.rawPrice);
  const line: WaCartLineItem = {
    productName: wa.name,
    commerceProductId: wa.commerceProductId ?? wa.shopifyProductId ?? "",
    shopifyProductId: String(wa.commerceProductId ?? wa.shopifyProductId ?? ""),
    variantId: variant ? String(variant.id) : "default",
    variantTitle: variant ? String(variant.title) : "Standard",
    quantity,
    unitPrice,
    imageUrl: resolveCommerceImageUrl(wa.imageUrl) ?? wa.imageUrl,
    sku: variant?.sku,
  };

  const cart = mergeCartItems(opts.existingCart ?? [], line);
  return { cart, line };
}

function parsePrice(value: unknown): number {
  const n = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export async function resolveCartLineFromQuery(query: string): Promise<WaCartLineItem | null> {
  const q = extractProductSearchQuery(query) || query;
  const ranked = await searchCommerceProductsRanked(q, 3);
  if (!ranked.products.length) return null;

  const wa = commerceToWaCatalogProducts(ranked.products)[0];
  if (!wa) return null;

  const variant = (wa.variantOptions ?? [])[0];
  const unitPrice = variant ? parsePrice(variant.price) : parsePrice(wa.rawPrice);
  const commerceProductId = wa.commerceProductId ?? wa.shopifyProductId ?? "";

  return {
    productName: wa.name,
    commerceProductId,
    shopifyProductId: String(commerceProductId),
    variantId: variant ? String(variant.id) : "default",
    variantTitle: variant ? String(variant.title) : "Standard",
    quantity: 1,
    unitPrice,
    imageUrl: resolveCommerceImageUrl(wa.imageUrl) ?? wa.imageUrl,
    sku: variant?.sku,
  };
}

export function mergeCartItems(existing: WaCartLineItem[], item: WaCartLineItem): WaCartLineItem[] {
  const cart = [...existing];
  const key = `${item.commerceProductId}::${item.variantId}`;
  const idx = cart.findIndex((c) => `${c.commerceProductId}::${c.variantId}` === key);
  if (idx >= 0) {
    cart[idx] = { ...cart[idx]!, quantity: cart[idx]!.quantity + item.quantity };
  } else {
    cart.push(item);
  }
  return cart;
}

export function cartSubtotal(cart: WaCartLineItem[]): number {
  return cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}

export function formatCartSummaryText(cart: WaCartLineItem[], lang: WaLang): string {
  if (!cart.length) {
    return lang === "en" ? "Cart is empty." : "Cart khali hai.";
  }
  const lines = cart.map(
    (i) => `• ${i.quantity}× ${i.productName} (${i.variantTitle}) — ${formatRupeesLocal(i.unitPrice * i.quantity)}`,
  );
  const total = cartSubtotal(cart);
  const header = lang === "en" ? "🛒 *Your cart:*\n\n" : "🛒 *Aapka cart:*\n\n";
  const footer =
    lang === "en"
      ? `\n💵 *Subtotal:* ${formatRupeesLocal(total)}\n\nNeeche se option choose karein 👇`
      : `\n💵 *Subtotal:* ${formatRupeesLocal(total)}\n\nOption select karein 👇`;
  return header + lines.join("\n") + footer;
}

export async function sendWaCartActions(opts: {
  phone: string;
  cart: WaCartLineItem[];
  lang: WaLang;
  waSettings: WaSettings;
  intro?: string;
}): Promise<void> {
  const body = (opts.intro ? `${opts.intro}\n\n` : "") + formatCartSummaryText(opts.cart, opts.lang);
  await sendInteractiveButtons({
    phone: opts.phone,
    text: body.slice(0, 1020),
    buttons: [
      { id: "wa_cart_add_more", title: "➕ Add More" },
      { id: "wa_cart_checkout", title: "🛒 Checkout" },
      { id: "wa_cart_view", title: "👁 View Cart" },
    ],
    settings: opts.waSettings,
    templateName: "wa_cart_actions",
  });
}

export async function sendWaCartViewList(opts: {
  phone: string;
  cart: WaCartLineItem[];
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const rows = opts.cart.slice(0, 10).map((item, i) => ({
    id: `wa_cart_rm_${i}`,
    title: `${item.productName}`.slice(0, 24),
    description: `${item.variantTitle} ×${item.quantity} — ${formatRupeesLocal(item.unitPrice * item.quantity)}`.slice(0, 72),
  }));
  await sendInteractiveList({
    phone: opts.phone,
    body: formatCartSummaryText(opts.cart, opts.lang).slice(0, 900),
    buttonLabel: opts.lang === "en" ? "Remove" : "Remove",
    rows,
    settings: opts.waSettings,
    templateName: "wa_cart_view_list",
  });
}

/** Add multiple products from one message; returns false if <2 products detected */
export async function tryBuildMultiProductCart(opts: {
  phone: string;
  textBody: string;
  waSettings: WaSettings;
  existingCart?: WaCartLineItem[];
}): Promise<{ cart: WaCartLineItem[]; added: WaCartLineItem[]; failed: string[] } | null> {
  const queries = parseMultiProductQueries(opts.textBody);
  if (queries.length < 2) return null;

  let cart = [...(opts.existingCart ?? [])];
  const added: WaCartLineItem[] = [];
  const failed: string[] = [];

  for (const q of queries) {
    const line = await resolveCartLineFromQuery(q);
    if (!line) {
      failed.push(q);
      continue;
    }
    cart = mergeCartItems(cart, line);
    added.push(line);
  }

  if (!added.length) return null;
  return { cart, added, failed };
}
