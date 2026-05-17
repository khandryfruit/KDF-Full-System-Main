/**
 * eCommerce DB → WhatsApp product card (image, price, URL, order buttons).
 * Single pipeline for all product replies — no plain 1,2,3 text lists.
 */
import { sendWhatsAppImage, sendCtaUrlMessage, sendInteractiveButtons } from "./whatsapp.js";
import { resolveCommerceImageUrl } from "./commerceProductSearch.js";
import { sendPremiumProductOffer } from "./waPremiumUi.js";
import { formatRupeesLocal } from "./waOrderJourney.js";
import type { WaLang } from "./waPremiumJourney.js";
import type { VariantOption } from "./waVariantPresentation.js";

export type CommerceCardProduct = {
  name: string;
  price: string;
  rawPrice?: number;
  imageUrl?: string | null;
  productUrl: string;
  description?: string | null;
  inStock?: boolean;
  variantOptions?: VariantOption[];
  slug?: string;
  commerceProductId?: string;
};

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

function buildCtaBody(product: CommerceCardProduct, lang: WaLang): string {
  const stock =
    product.inStock !== false
      ? lang === "en"
        ? "📦 *Stock:* Available ✅"
        : "📦 *Stock:* Available ✅"
      : lang === "en"
        ? "📦 *Stock:* Out of stock ❌"
        : "📦 *Stock:* Out of stock ❌";
  const priceLine =
    product.rawPrice && product.rawPrice > 0
      ? `💰 *Price:* ${formatRupeesLocal(product.rawPrice)}`
      : `💰 *Price:* ${product.price}`;
  const feat = product.description?.trim()
    ? `⭐ ${product.description.trim().slice(0, 100)}${product.description.length > 100 ? "…" : ""}`
    : lang === "en"
      ? "⭐ Premium quality · Fresh stock"
      : "⭐ Premium quality · Fresh stock";
  return `🥜 *${product.name}*\n\n${priceLine}\n${feat}\n${stock}`;
}

/** Full product card from Commerce → Products table */
export async function sendCommerceProductCard(opts: {
  phone: string;
  product: CommerceCardProduct;
  lang: WaLang;
  waSettings: WaSettings;
  opener?: string;
}): Promise<void> {
  const { phone, product, lang, waSettings } = opts;
  const imageUrl = resolveCommerceImageUrl(product.imageUrl) ?? product.imageUrl ?? null;
  const variants = product.variantOptions ?? [];
  const url = String(product.productUrl ?? "").trim();

  if (opts.opener?.trim()) {
    const { sendWhatsAppMessage } = await import("./whatsapp.js");
    await sendWhatsAppMessage({
      phone,
      message: opts.opener.trim(),
      templateName: "product_card_opener",
    });
    await new Promise((r) => setTimeout(r, 350));
  }

  await sendPremiumProductOffer({
    phone,
    product: {
      name: product.name,
      imageUrl: imageUrl?.startsWith("https://") ? imageUrl : null,
      description: product.description ?? null,
      inStock: product.inStock ?? true,
      variantOptions: variants,
    },
    lang,
    waSettings,
    sendImage: async (p) => {
      await sendWhatsAppImage({
        phone: p.phone,
        imageUrl: p.imageUrl,
        caption: p.caption,
        settings: waSettings,
        templateName: "commerce_product_image",
      });
    },
    sendText: async (p, text, template) => {
      const { sendWhatsAppMessage } = await import("./whatsapp.js");
      await sendWhatsAppMessage({
        phone: p,
        message: text,
        templateName: template ?? "commerce_product_text",
      });
    },
  });

  if (url.startsWith("https://")) {
    await new Promise((r) => setTimeout(r, 400));
    await sendCtaUrlMessage({
      phone,
      text: buildCtaBody(product, lang),
      buttonText: lang === "en" ? "View Product" : "View Product",
      url,
      settings: waSettings,
      templateName: "commerce_product_url",
    });
  }

  await new Promise((r) => setTimeout(r, 350));
  const orderHint =
    lang === "en"
      ? variants.length
        ? "🛒 Tap a *size* above, then we'll complete your order."
        : "🛒 Tap *Order Now* to start checkout."
      : variants.length
        ? "🛒 Upar *size* select karein, phir order complete karte hain."
        : "🛒 *Order Now* tap karein checkout ke liye.";

  await sendInteractiveButtons({
    phone,
    text: orderHint,
    buttons: variants.length
      ? [
          { id: "wa_intent_order", title: "🛒 Order Now" },
          { id: "wa_intent_price", title: "💰 Prices" },
        ]
      : [
          { id: "wa_intent_order", title: "🛒 Order Now" },
          { id: "wa_intent_delivery", title: "🚚 Delivery" },
        ],
    settings: waSettings,
    templateName: "commerce_product_actions",
  });
}

export function catalogProductToCard(p: {
  name: string;
  price: string;
  rawPrice?: number;
  imageUrl?: string | null;
  productUrl: string;
  description?: string | null;
  inStock?: boolean;
  variantOptions?: Array<{ id: string; title: string; price: number }>;
  slug?: string;
  commerceProductId?: string;
}): CommerceCardProduct {
  return {
    name: p.name,
    price: p.price,
    rawPrice: p.rawPrice,
    imageUrl: p.imageUrl,
    productUrl: p.productUrl,
    description: p.description ?? null,
    inStock: p.inStock ?? true,
    variantOptions: (p.variantOptions ?? []).map((v) => ({
      id: String(v.id),
      title: String(v.title),
      price: Number(v.price) || 0,
    })),
    slug: p.slug,
    commerceProductId: p.commerceProductId,
  };
}
