/**
 * Admin simulator — preview WhatsApp pipeline without sending to a customer.
 */
import { db, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  searchCommerceProductsRanked,
  commerceToWaCatalogProducts,
  resolveCommerceImageUrl,
  formatSingleCommerceProductReply,
} from "./commerceProductSearch.js";
import { extractWaProductEntity, extractProductSearchQuery } from "./waProductEntity.js";
import { classifyWaMessage } from "./waIntentClassifier.js";
import { buildHumanWelcomeText } from "./waConversationFlows.js";
import { resolveWaLang } from "./waPremiumJourney.js";
import { isPureGreetingMessage } from "./waProductBrain.js";
import { isProductEducationMessage } from "./waSalesConversation.js";
import { shouldDeferToOpenAI } from "./waCustomerPipeline.js";

export type AdminWaChatTestResult = {
  query: string;
  entity: string;
  specificKey: string | null;
  intent: string;
  topic: string;
  route: "greeting" | "product_card" | "education_gpt" | "product_search" | "no_match";
  confidence: number;
  greetingPreview: string | null;
  aiNote: string | null;
  product: {
    id: string;
    name: string;
    slug: string;
    price: string;
    rawPrice: number;
    stock: number;
    inStock: boolean;
    imageUrl: string | null;
    productUrl: string;
    tags: string[];
    variants: Array<{ name: string; price: string; stock: number }>;
    score: number;
    matchMethod: string;
  } | null;
  whatsappCardPreview: string | null;
  alternateProducts: Array<{ name: string; score: number }>;
  debug: Record<string, unknown>;
};

export async function runAdminWaChatTest(opts: {
  query: string;
  productId?: number;
}): Promise<AdminWaChatTestResult> {
  const query = String(opts.query ?? "").trim();
  const entityInfo = extractWaProductEntity(query);
  const searchQ = extractProductSearchQuery(query) || query;
  const classified = classifyWaMessage(query);
  const lang = resolveWaLang({}, query);
  const roman = /[a-z]/i.test(query) && !/[اآبپتٹثجچحخدڈذرڑزژسشصضطظعغفقکگلمنوہھیے]/.test(query);

  if (isPureGreetingMessage(query) || classified.intent === "greeting") {
    return {
      query,
      entity: entityInfo.entity,
      specificKey: entityInfo.specificKey,
      intent: "greeting",
      topic: classified.topic,
      route: "greeting",
      confidence: 100,
      greetingPreview: buildHumanWelcomeText(query, lang, false),
      aiNote: "Live bot sends this greeting + interactive menu (not a product list).",
      product: null,
      whatsappCardPreview: null,
      alternateProducts: [],
      debug: { classified },
    };
  }

  if (isProductEducationMessage(query) || shouldDeferToOpenAI(query, classified)) {
    const ranked = await searchCommerceProductsRanked(
      entityInfo.specificKey ?? searchQ,
      4,
    );
    const top = ranked.products[0];
    let product = top ? mapHit(top) : null;

    if (opts.productId && !product) {
      product = await loadProductById(opts.productId);
    }

    return {
      query,
      entity: entityInfo.entity,
      specificKey: entityInfo.specificKey,
      intent: classified.intent,
      topic: classified.topic,
      route: "education_gpt",
      confidence: ranked.confidence,
      greetingPreview: null,
      aiNote:
        "Live bot: GPT answers benefits/health naturally, then sends ONE product card from Commerce DB (no catalog dump).",
      product,
      whatsappCardPreview: product
        ? formatSingleCommerceProductReply(top!, roman)
        : null,
      alternateProducts: ranked.products.slice(1, 3).map((p) => ({ name: p.name, score: p.score })),
      debug: { classified, ranked: ranked.debug },
    };
  }

  let ranked = await searchCommerceProductsRanked(searchQ, 8);

  if (opts.productId) {
    const forced = await loadProductById(opts.productId);
    if (forced) {
      const wa = commerceToWaCatalogProducts(ranked.products);
      const forcedHit = ranked.products.find((p) => p.id === String(opts.productId));
      if (!forcedHit && forced) {
        ranked = {
          ...ranked,
          products: [
            {
              id: String(opts.productId),
              name: forced.name,
              slug: forced.slug,
              price: forced.price,
              stock: forced.stock,
              image: forced.imageUrl,
              variations: forced.variants.map((v) => ({
                id: v.name,
                name: v.name,
                value: v.name,
                price: v.price,
                stock: v.stock,
              })),
              tags: forced.tags,
              url: forced.productUrl,
              score: 999,
              matchMethod: "admin_forced_product",
              inStock: forced.inStock,
              rawPrice: forced.rawPrice,
              description: null,
            },
          ],
          confidence: 100,
          ambiguous: false,
        };
      }
    }
  }

  const top = ranked.products[0];
  if (!top) {
    return {
      query,
      entity: entityInfo.entity,
      specificKey: entityInfo.specificKey,
      intent: classified.intent,
      topic: classified.topic,
      route: "no_match",
      confidence: 0,
      greetingPreview: null,
      aiNote: "No active Commerce product matched. Check product name, tags, and active status.",
      product: opts.productId ? await loadProductById(opts.productId) : null,
      whatsappCardPreview: null,
      alternateProducts: [],
      debug: { classified, ranked: ranked.debug },
    };
  }

  const product = mapHit(top);

  return {
    query,
    entity: entityInfo.entity,
    specificKey: entityInfo.specificKey,
    intent: classified.intent,
    topic: classified.topic,
    route: "product_card",
    confidence: ranked.confidence,
    greetingPreview: null,
    aiNote:
      "Live bot sends: opener → product image → sizes → View Product URL → Order Now buttons.",
    product,
    whatsappCardPreview: formatSingleCommerceProductReply(top, roman),
    alternateProducts: ranked.products.slice(1, 3).map((p) => ({ name: p.name, score: p.score })),
    debug: { classified, ranked: ranked.debug },
  };
}

function mapHit(hit: Awaited<ReturnType<typeof searchCommerceProductsRanked>>["products"][0]) {
  const imgs = hit.image;
  return {
    id: hit.id,
    name: hit.name,
    slug: hit.slug,
    price: hit.price,
    rawPrice: hit.rawPrice,
    stock: hit.stock,
    inStock: hit.inStock,
    imageUrl: resolveCommerceImageUrl(imgs) ?? imgs,
    productUrl: hit.url,
    tags: hit.tags,
    variants: hit.variations.map((v) => ({
      name: v.value ? `${v.name} (${v.value})` : v.name,
      price: String(v.price ?? hit.rawPrice),
      stock: v.stock ?? 0,
    })),
    score: hit.score,
    matchMethod: hit.matchMethod,
  };
}

async function loadProductById(id: number) {
  const [row] = await db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1);
  if (!row) return null;
  const imgs = Array.isArray(row.images) ? row.images : [];
  const variants = Array.isArray(row.variants) ? row.variants : [];
  const rawPrice = Number.parseFloat(String(row.price ?? "0")) || 0;
  const slug = row.slug ?? String(row.id);
  const storeBase = (process.env.STOREFRONT_URL ?? process.env.PUBLIC_STORE_URL ?? "https://khanbabadryfruits.com").replace(/\/$/, "");
  const url = `${storeBase}/products/${slug}`;
  return {
    id: String(row.id),
    name: row.name,
    slug,
    price: `Rs. ${Math.round(rawPrice).toLocaleString("en-PK")}`,
    rawPrice,
    stock: row.stock ?? 0,
    inStock: (row.stock ?? 0) > 0,
    imageUrl: resolveCommerceImageUrl(imgs[0] ?? null),
    productUrl: url,
    tags: (Array.isArray(row.tags) ? row.tags : []).map(String),
    variants: variants.map((v: { name?: string; value?: string; price?: string; stock?: number }) => ({
      name: v.value ? `${v.name ?? ""} (${v.value})` : String(v.name ?? "Option"),
      price: String(v.price ?? rawPrice),
      stock: v.stock ?? 0,
    })),
    score: 999,
    matchMethod: "admin_product_row",
  };
}
