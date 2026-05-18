import { Router } from "express";
import { db, productsTable, shopifyOrdersTable, shopifyProductsTable } from "@workspace/db";
import { eq, ilike, and, desc, asc, sql, or, exists, inArray } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import { generateSlugFromName, ensureUniqueSlug } from "../lib/slugify";

const router = Router();

/** Storefront list projection — omits heavy HTML fields to shrink JSON and DB I/O. */
const storefrontProductListColumns = {
  id: productsTable.id,
  categoryId: productsTable.categoryId,
  name: productsTable.name,
  slug: productsTable.slug,
  shopifyProductId: productsTable.shopifyProductId,
  shopifyHandle: productsTable.shopifyHandle,
  woocommerceProductId: productsTable.woocommerceProductId,
  price: productsTable.price,
  originalPrice: productsTable.originalPrice,
  stock: productsTable.stock,
  images: productsTable.images,
  gradient: productsTable.gradient,
  tags: productsTable.tags,
  variants: productsTable.variants,
  weight: productsTable.weight,
  unit: productsTable.unit,
  active: productsTable.active,
  featured: productsTable.featured,
  rating: productsTable.rating,
  reviewCount: productsTable.reviewCount,
  altText: productsTable.altText,
  source: productsTable.source,
  externalId: productsTable.externalId,
  createdAt: productsTable.createdAt,
  updatedAt: productsTable.updatedAt,
};

/** Returns true if the slug is already in its canonical clean form */
function isCleanSlug(slug: string): boolean {
  return generateSlugFromName(slug) === slug;
}

/**
 * Returns true when the caller explicitly asked for JSON (API client).
 * Browsers and crawlers typically send Accept headers containing "text/html"
 * or bare "*\/*" with no explicit JSON type.
 *
 * Matches:
 *   application/json
 *   application/vnd.api+json  (JSON:API)
 *   application/vnd.*+json    (any vendor JSON subtype)
 *   application/*             (wildcard application)
 *
 * Matching is case-insensitive and token-based to avoid false positives from
 * substrings (e.g. "text/html,application/xhtml+xml" is NOT treated as JSON).
 */
function wantsJson(req: import("express").Request): boolean {
  const raw = (req.headers.accept ?? "").toLowerCase();
  // Split on comma to get individual media-type tokens, strip quality params.
  const types = raw.split(",").map((t) => t.split(";")[0].trim());
  return types.some(
    (t) =>
      t === "application/json" ||
      t === "application/*" ||
      // vendor subtypes ending in +json (e.g. application/vnd.api+json)
      (t.startsWith("application/") && t.endsWith("+json"))
  );
}

router.get("/products", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const { categoryId, search, featured, sortBy, hasDiscount, ids } = req.query;

    const conditions: any[] = [eq(productsTable.active, true)];
    if (categoryId) conditions.push(eq(productsTable.categoryId, parseInt(categoryId as string)));
    if (ids) {
      const idList = String(ids)
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v) && v > 0);
      if (idList.length > 0) conditions.push(inArray(productsTable.id, idList));
    }
    /* Featured on the storefront must match either `products.featured` (admin Products)
       OR `shopify_products.is_featured` (admin Featured Products / chat flags), which
       historically were not kept in sync. */
    if (featured === "true") {
      conditions.push(
        or(
          eq(productsTable.featured, true),
          exists(
            db
              .select({ id: shopifyProductsTable.id })
              .from(shopifyProductsTable)
              .where(
                and(
                  eq(shopifyProductsTable.shopifyProductId, productsTable.shopifyProductId),
                  eq(shopifyProductsTable.isFeatured, true),
                ),
              ),
          ),
        ),
      );
    }
    if (hasDiscount === "true") {
      conditions.push(sql`${productsTable.originalPrice} IS NOT NULL AND ${productsTable.originalPrice} > ${productsTable.price}`);
    }
    if (search) conditions.push(ilike(productsTable.name, `%${search}%`));

    let orderBy: any = desc(productsTable.createdAt);
    if (sortBy === "price_asc") orderBy = asc(productsTable.price);
    else if (sortBy === "price_desc") orderBy = desc(productsTable.price);
    else if (sortBy === "rating") orderBy = desc(productsTable.rating);
    else if (sortBy === "discount") orderBy = desc(sql`(${productsTable.originalPrice} - ${productsTable.price})`);
    else if (sortBy === "best_sellers") orderBy = desc(productsTable.reviewCount);

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [items, countResult] = await Promise.all([
      db
        .select(storefrontProductListColumns)
        .from(productsTable)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(productsTable).where(where),
    ]);

    req.log.info({ featured, categoryId, search, count: items.length, total: Number(countResult[0]?.count ?? 0) }, "products list");
    res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=120");
    res.json({ items, total: Number(countResult[0]?.count ?? 0), page, limit });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list products" });
  }
});

type RecommendationContext = "product" | "variant" | "cart" | "checkout";

function parseIdList(value: unknown): number[] {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0);
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((v) => v.toLowerCase().trim()).filter(Boolean);
}

function dedupeProducts<T extends { id: number }>(items: T[], limit: number): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

const NAME_STOP_WORDS = new Set([
  "with", "and", "the", "for", "from", "pack", "gift", "premium", "organic", "natural",
  "fresh", "dried", "roasted", "salted", "unsalted", "raw", "whole", "split", "extra",
  "super", "best", "grade", "quality", "mixed", "assorted",
]);

function nameTokens(name: string): string[] {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !NAME_STOP_WORDS.has(t));
}

function parseWeightGrams(weight: string | null | undefined, unit?: string | null): number {
  if (!weight) return 0;
  const raw = String(weight).trim().toLowerCase();
  const m = raw.match(/^([\d.]+)\s*(kg|kilogram|kilograms|g|gm|gram|grams|lb|lbs|pound|pounds|oz)?$/);
  if (m) {
    const val = parseFloat(m[1]);
    const u = m[2] ?? String(unit ?? "g").toLowerCase();
    if (u.startsWith("kg") || u.startsWith("kilo")) return val * 1000;
    if (u.startsWith("lb") || u.startsWith("pound")) return val * 453.592;
    if (u.startsWith("oz")) return val * 28.3495;
    return val;
  }
  const u = String(unit ?? "").toLowerCase();
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (u.startsWith("kg") || u.startsWith("kilo")) return n * 1000;
  return n;
}

function weightFitScore(seedGrams: number, productGrams: number): number {
  if (seedGrams <= 0 || productGrams <= 0) return 0;
  const ratio = productGrams / seedGrams;
  if (ratio >= 0.55 && ratio <= 1.85) return 12;
  if (ratio >= 0.4 && ratio <= 2.5) return 6;
  return 0;
}

function isProductRelevant(s: {
  sameCategory: boolean;
  tagOverlap: number;
  nameFamily: number;
  weightFit: number;
}): boolean {
  return s.sameCategory || s.tagOverlap > 0 || s.nameFamily > 0 || s.weightFit >= 6;
}

async function getShopifyTitleSalesScores(): Promise<Map<string, number>> {
  try {
    const rows = await db.execute(sql`
      SELECT lower(li->>'title') AS title,
             SUM(COALESCE((li->>'quantity')::int, 1))::int AS units
      FROM ${shopifyOrdersTable},
           jsonb_array_elements(COALESCE(${shopifyOrdersTable.lineItems}, '[]'::jsonb)) AS li
      WHERE ${shopifyOrdersTable.shopifyCreatedAt} > NOW() - INTERVAL '120 days'
      GROUP BY lower(li->>'title')
      ORDER BY units DESC
      LIMIT 200
    `);
    const scores = new Map<string, number>();
    for (const row of rows.rows as Array<Record<string, unknown>>) {
      const title = String(row.title ?? "").trim();
      const units = Number(row.units ?? 0);
      if (title && units > 0) scores.set(title, units);
    }
    return scores;
  } catch {
    return new Map();
  }
}

router.get("/products/recommendations", async (req, res) => {
  try {
    const context = String(req.query.context ?? "product") as RecommendationContext;
    const productId = Number(req.query.productId ?? 0);
    const cartProductIds = parseIdList(req.query.cartProductIds);
    const excludeIds = new Set<number>([...cartProductIds, ...(productId > 0 ? [productId] : [])]);
    const limit = Math.min(16, Math.max(4, Number(req.query.limit ?? 10)));

    const [currentProduct] = productId > 0
      ? await db
          .select(storefrontProductListColumns)
          .from(productsTable)
          .where(and(eq(productsTable.active, true), eq(productsTable.id, productId)))
          .limit(1)
      : [];

    const cartProducts = cartProductIds.length > 0
      ? await db
          .select(storefrontProductListColumns)
          .from(productsTable)
          .where(and(eq(productsTable.active, true), inArray(productsTable.id, cartProductIds)))
      : [];

    const seedProducts = [currentProduct, ...cartProducts].filter(Boolean) as any[];
    const seedCategoryIds = new Set(seedProducts.map((p: any) => p.categoryId).filter(Boolean));
    const seedTags = new Set(seedProducts.flatMap((p: any) => normalizeTags(p.tags)));
    const seedNameTokens = new Set(seedProducts.flatMap((p: any) => nameTokens(String(p.name ?? ""))));
    const seedWeightGrams = seedProducts.length
      ? seedProducts.reduce((sum: number, p: any) => sum + parseWeightGrams(p.weight, p.unit), 0) / seedProducts.length
      : 0;
    const seedPrice = seedProducts.length
      ? seedProducts.reduce((sum: number, p: any) => sum + Number(p.price ?? 0), 0) / seedProducts.length
      : 0;

    const [products, shopifyFlags, salesScores] = await Promise.all([
      db
        .select(storefrontProductListColumns)
        .from(productsTable)
        .where(and(eq(productsTable.active, true), sql`${productsTable.stock} > 0`))
        .orderBy(desc(productsTable.featured), desc(productsTable.rating), desc(productsTable.reviewCount), desc(productsTable.createdAt))
        .limit(180),
      db
        .select({
          shopifyProductId: shopifyProductsTable.shopifyProductId,
          isRecommended: shopifyProductsTable.isRecommended,
          recommendPriority: shopifyProductsTable.recommendPriority,
          isFeatured: shopifyProductsTable.isFeatured,
        })
        .from(shopifyProductsTable)
        .where(or(eq(shopifyProductsTable.isRecommended, true), eq(shopifyProductsTable.isFeatured, true))),
      getShopifyTitleSalesScores(),
    ]);

    const flags = new Map((shopifyFlags as any[]).map((p: any) => [p.shopifyProductId, p]));
    const scored = products
      .filter((p: any) => !excludeIds.has(p.id))
      .map((p: any) => {
        const tags = normalizeTags(p.tags);
        const tagOverlap = tags.filter((tag) => seedTags.has(tag)).length;
        const sameCategory = p.categoryId != null && seedCategoryIds.has(p.categoryId);
        const flag = p.shopifyProductId ? flags.get(p.shopifyProductId) : undefined;
        const productPrice = Number(p.price ?? 0);
        const productGrams = parseWeightGrams(p.weight, p.unit);
        const weightFit = weightFitScore(seedWeightGrams, productGrams);
        const nameFamily = nameTokens(String(p.name ?? "")).filter((t) => seedNameTokens.has(t)).length;
        const priceFit =
          seedPrice > 0 && productPrice > 0 && (sameCategory || tagOverlap > 0 || nameFamily > 0)
            ? Math.max(0, 14 - Math.abs(productPrice - seedPrice) / Math.max(seedPrice, 1) * 12)
            : 0;
        const units = salesScores.get(String(p.name ?? "").toLowerCase()) ?? 0;
        const relevant = sameCategory || tagOverlap > 0 || nameFamily > 0;
        const score =
          (sameCategory ? 38 : 0) +
          tagOverlap * 14 +
          nameFamily * 10 +
          weightFit +
          priceFit +
          (relevant && p.featured ? 8 : 0) +
          (relevant && flag?.isRecommended ? 12 : 0) +
          (relevant && flag?.isFeatured ? 6 : 0) +
          (relevant ? Number(flag?.recommendPriority ?? 0) * 2 : 0) +
          (relevant ? Number(p.rating ?? 0) * 3 : 0) +
          (relevant ? Math.min(Number(p.reviewCount ?? 0), 50) * 0.4 : 0) +
          (relevant ? Math.min(units, 80) * 0.6 : 0);
        return { product: p, score, units, price: productPrice, sameCategory, tagOverlap, nameFamily, weightFit };
      })
      .sort((a: any, b: any) => b.score - a.score);

    const relevantScored = scored.filter(isProductRelevant);
    const byScore = relevantScored.map((s: any) => s.product);
    const bestSellers = dedupeProducts(scored.filter((s: any) => s.units > 0 && isProductRelevant(s)).sort((a: any, b: any) => b.units - a.units).map((s: any) => s.product), limit);
    const lowQuantityAddOns = dedupeProducts(relevantScored.filter((s: any) => s.price > 0 && s.price <= Math.max(700, seedPrice * 0.65 || 700)).map((s: any) => s.product), 8);
    const frequentlyBoughtTogether = dedupeProducts(
      relevantScored
        .filter((s: any) =>
          (s.sameCategory && (s.tagOverlap > 0 || s.nameFamily > 0 || s.weightFit >= 6)) ||
          (s.nameFamily > 0 && s.tagOverlap > 0),
        )
        .map((s: any) => s.product),
      limit,
    );
    const relatedProducts = dedupeProducts(byScore, limit);
    const customersAlsoBought = dedupeProducts([...bestSellers, ...byScore], limit);
    const recommendedWithThis = dedupeProducts([...frequentlyBoughtTogether, ...byScore], 8);
    const cartUpsells = dedupeProducts(context === "cart" || context === "checkout" ? [...lowQuantityAddOns, ...frequentlyBoughtTogether, ...bestSellers] : byScore, 8);

    res.set("Cache-Control", "public, max-age=20, s-maxage=60, stale-while-revalidate=180");
    res.json({
      context,
      relatedProducts,
      bestSellers,
      frequentlyBoughtTogether,
      customersAlsoBought,
      recommendedWithThis,
      cartUpsells,
      lowQuantityAddOns,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to build recommendations" });
  }
});

router.get("/products/check-slug", adminMiddleware as any, async (req, res) => {
  try {
    const { slug, excludeId } = req.query;
    if (!slug) { res.status(400).json({ error: "slug required" }); return; }
    const conditions: any[] = [eq(productsTable.slug, slug as string)];
    if (excludeId) conditions.push(sql`${productsTable.id} != ${parseInt(excludeId as string)}`);
    const [existing] = await db.select({ id: productsTable.id }).from(productsTable).where(and(...conditions)).limit(1);
    res.json({ available: !existing, canonical: generateSlugFromName(slug as string) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/**
 * GET /api/admin/products
 * Admin-only: returns ALL products regardless of active status.
 * Supports ?page, ?limit, ?search, ?status=active|inactive|all
 * Must be above /products/:id to avoid route collision.
 */
router.get("/admin/products", adminMiddleware as any, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(200, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const { search, status } = req.query;

    const conditions: any[] = [];
    if (search) conditions.push(ilike(productsTable.name, `%${search}%`));
    if (status === "active")   conditions.push(eq(productsTable.active, true));
    if (status === "inactive") conditions.push(eq(productsTable.active, false));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult, activeCount, inactiveCount] = await Promise.all([
      db.select().from(productsTable).where(where).orderBy(desc(productsTable.updatedAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(productsTable).where(where),
      db.select({ count: sql<number>`count(*)` }).from(productsTable).where(eq(productsTable.active, true)),
      db.select({ count: sql<number>`count(*)` }).from(productsTable).where(eq(productsTable.active, false)),
    ]);

    res.json({
      items,
      total:         Number(countResult[0]?.count ?? 0),
      activeCount:   Number(activeCount[0]?.count ?? 0),
      inactiveCount: Number(inactiveCount[0]?.count ?? 0),
      page,
      limit,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list products" });
  }
});

/**
 * PUT /api/admin/products/:id/toggle-active
 * Admin-only: flip the active flag on a product.
 */
/**
 * POST /api/admin/products/wa-chat-test
 * Simulate WhatsApp + Commerce product card pipeline for admin debugging.
 */
router.post("/admin/products/wa-chat-test", adminMiddleware as any, async (req, res) => {
  try {
    const query = String(req.body?.query ?? "").trim();
    if (!query) return res.status(400).json({ error: "query is required" });
    const productId = req.body?.productId != null ? Number(req.body.productId) : undefined;
    const { runAdminWaChatTest } = await import("../lib/waAdminChatTest.js");
    const result = await runAdminWaChatTest({ query, productId });
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "WA chat test failed" });
  }
});

router.put("/admin/products/:id/toggle-active", adminMiddleware as any, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db
      .select({ active: productsTable.active })
      .from(productsTable)
      .where(eq(productsTable.id, id))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const [product] = await db
      .update(productsTable)
      .set({ active: !existing.active, updatedAt: new Date() })
      .where(eq(productsTable.id, id))
      .returning();
    res.json(product);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to toggle" });
  }
});

/**
 * POST /api/admin/products/backfill-slugs
 * One-time migration: sanitizes all existing product slugs.
 * Safe to run multiple times (idempotent).
 * Must be registered before /products/:id to avoid route collision.
 */
router.post("/admin/products/backfill-slugs", adminMiddleware as any, backfillSlugsHandler);

/**
 * POST /api/products/fix-slugs (legacy alias, kept for backward compat)
 */
router.post("/products/fix-slugs", adminMiddleware as any, backfillSlugsHandler);

async function backfillSlugsHandler(req: any, res: any) {
  try {
    const allProducts = await db
      .select({ id: productsTable.id, name: productsTable.name, slug: productsTable.slug })
      .from(productsTable)
      .orderBy(asc(productsTable.id));

    let fixed = 0;
    let skipped = 0;
    const log: { id: number; old: string; new: string }[] = [];

    for (const p of allProducts) {
      const clean = generateSlugFromName(p.slug);
      if (clean === p.slug) { skipped++; continue; }

      const newSlug = await ensureUniqueSlug(clean, p.id);
      await db.update(productsTable).set({ slug: newSlug, updatedAt: new Date() }).where(eq(productsTable.id, p.id));
      log.push({ id: p.id, old: p.slug, new: newSlug });
      fixed++;
    }

    res.json({ success: true, fixed, skipped, log });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fix slugs" });
  }
}

/**
 * GET /products/:id
 * Supports numeric ID, clean slug, or legacy unclean slug (with spaces/uppercase).
 * If the param is an unclean slug, the product is found via its cleaned form
 * and the response includes X-Canonical-Slug so the frontend can redirect.
 */
/**
 * GET /api/products/search?q=badam
 * Commerce → Products — primary search for WhatsApp AI (exact name → tags → slug → variations).
 */
router.get("/products/search", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const limit = Math.min(25, Math.max(1, parseInt(String(req.query.limit ?? "8"), 10) || 8));
    if (!q) {
      return res.json({ products: [], query: "", source: "commerce" });
    }
    const { searchCommerceProductsWithDebug, toCommerceSearchApiResponse } = await import(
      "../lib/commerceProductSearch.js"
    );
    const { products, debug } = await searchCommerceProductsWithDebug(q, limit);
    return res.json({
      products: toCommerceSearchApiResponse(products),
      query: q,
      count: products.length,
      source: "commerce",
      engine: "Commerce → Products",
      debug,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Search failed" });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const param = req.params.id;
    const isNumeric = /^\d+$/.test(param);
    const jsonClient = wantsJson(req);

    if (isNumeric) {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, parseInt(param))).limit(1);
      if (!product) { res.status(404).json({ error: "Product not found" }); return; }

      if (product.slug) {
        const canonicalUrl = `${req.baseUrl}/products/${product.slug}`;
        if (!jsonClient) {
          // Browsers / crawlers: redirect permanently to the slug URL so they
          // update bookmarks and indexes. This avoids a redirect loop because
          // the target URL is always a clean slug, never a numeric ID.
          res.redirect(301, canonicalUrl);
          return;
        }
        // JSON API consumers: keep backward-compatible 200 but signal the
        // preferred URL via headers so they can update their stored reference.
        res.setHeader("X-Canonical-Slug", product.slug);
        res.setHeader("Deprecation", "true");
        res.setHeader("Link", `<${canonicalUrl}>; rel="canonical"`);
      }
      res.json(product);
      return;
    }

    // Try exact slug match first
    let [product] = await db.select().from(productsTable).where(eq(productsTable.slug, param)).limit(1);

    // Fallback 1: clean the param (handles legacy spaces and uppercase)
    if (!product) {
      const cleaned = generateSlugFromName(param);
      if (cleaned !== param && cleaned.length > 0) {
        [product] = await db.select().from(productsTable).where(eq(productsTable.slug, cleaned)).limit(1);
      }
    }

    // Fallback 2: normalize stored slug (handles spaces/special chars stored in DB)
    // e.g. DB has "almonds 250gm" but URL param is "almonds-250gm"
    if (!product) {
      [product] = await db.select().from(productsTable)
        .where(sql`lower(regexp_replace(regexp_replace(regexp_replace(${productsTable.slug}, '[^a-z0-9\\s-]', '', 'gi'), '[\\s]+', '-', 'g'), '-+', '-', 'g')) = ${param.toLowerCase()}`)
        .limit(1);
    }

    // Fallback 3: case-insensitive ilike match (handles uppercase slugs stored in DB)
    if (!product) {
      [product] = await db.select().from(productsTable).where(ilike(productsTable.slug, param)).limit(1);
    }

    req.log.info(
      {
        param,
        found: !!product,
        slug: product?.slug,
        variantCount: Array.isArray(product?.variants) ? product.variants.length : 0,
        variantValues: Array.isArray(product?.variants)
          ? (product.variants as { value?: string }[]).map((v) => v.value).filter(Boolean)
          : [],
      },
      "product detail lookup",
    );
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    // If the requested param differs from the canonical slug, handle accordingly.
    if (!isCleanSlug(param) || param !== product.slug) {
      const canonicalUrl = `${req.baseUrl}/products/${product.slug}`;
      if (!jsonClient) {
        // Browsers / crawlers: 301 to the canonical slug. No loop risk because
        // the target is always the clean slug and will match exactly on the
        // next request.
        res.redirect(301, canonicalUrl);
        return;
      }
      // JSON API consumers: 200 + headers signalling the preferred URL.
      res.setHeader("X-Canonical-Slug", product.slug);
      res.setHeader("Deprecation", "true");
      res.setHeader("Link", `<${canonicalUrl}>; rel="canonical"`);
    }

    res.json(product);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

async function invalidateCommerceSearchCache() {
  try {
    const { invalidateCommerceProductCache } = await import("../lib/commerceProductSearch.js");
    invalidateCommerceProductCache();
  } catch { /* ok */ }
}

async function createProductHandler(req: any, res: any) {
  try {
    const { name, price, stock, slug: rawSlug, ...rest } = req.body;
    if (!name || !price) { res.status(400).json({ error: "name and price are required" }); return; }
    const baseSlug = rawSlug?.trim() ? rawSlug.trim() : name;
    const slug = await ensureUniqueSlug(baseSlug);
    if (Array.isArray(rest.variants)) {
      req.log.info(
        {
          name,
          variantCount: rest.variants.length,
          variantValues: rest.variants.map((v: { value?: string }) => v.value).filter(Boolean),
        },
        "product create variants",
      );
    }
    const [product] = await db.insert(productsTable).values({ name, price, stock: stock ?? 0, slug, ...rest }).returning();
    await invalidateCommerceSearchCache();
    res.status(201).json(product);
    // Auto-index after response sent
    import("../lib/googleIndexing").then(({ autoIndex, getSafeSettings, buildIndexingPathUrl }) => {
      getSafeSettings().then((s) => {
        if (!s.siteUrl || !s["autoIndexEnabled"]) return;
        const url = buildIndexingPathUrl(s.siteUrl, "products", slug);
        if (url) autoIndex(url, "product");
      }).catch(() => {});
    }).catch(() => {});
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create product" });
  }
}

async function updateProductHandler(req: any, res: any) {
  try {
    const id = parseInt(req.params.id);
    const { slug: rawSlug, name, ...rest } = req.body;

    let finalSlug: string | undefined;
    if (rawSlug !== undefined) {
      // Always sanitize the provided slug through generateSlugFromName
      const base = rawSlug.trim() ? rawSlug.trim() : (name ?? "");
      if (base) finalSlug = await ensureUniqueSlug(base, id);
    } else if (name !== undefined) {
      // If name changed but no explicit slug, re-generate slug from new name
      const [existing] = await db.select({ slug: productsTable.slug }).from(productsTable).where(eq(productsTable.id, id)).limit(1);
      // Only auto-update slug if current slug looks like it was auto-generated from the old name
      // (i.e., don't overwrite manually set slugs on name-only edits)
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    }

    const updateData: any = { ...rest, updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (finalSlug !== undefined) updateData.slug = finalSlug;

    if (Array.isArray(updateData.variants)) {
      req.log.info(
        {
          productId: id,
          variantCount: updateData.variants.length,
          variantValues: updateData.variants.map((v: { value?: string }) => v.value).filter(Boolean),
        },
        "product update variants",
      );
    }

    const [product] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, id)).returning();
    if (!product) { res.status(404).json({ error: "Not found" }); return; }
    await invalidateCommerceSearchCache();
    res.json(product);
    // Auto-index after response sent
    const slugForIndex = finalSlug ?? product.slug;
    if (slugForIndex) {
      import("../lib/googleIndexing").then(({ autoIndex, getSafeSettings, buildIndexingPathUrl }) => {
        getSafeSettings().then((s) => {
          if (!s.siteUrl || !s["autoIndexEnabled"]) return;
          const url = buildIndexingPathUrl(s.siteUrl, "products", slugForIndex);
          if (url) autoIndex(url, "product");
        }).catch(() => {});
      }).catch(() => {});
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update product" });
  }
}

async function deleteProductHandler(req: any, res: any) {
  try {
    await db.delete(productsTable).where(eq(productsTable.id, parseInt(req.params.id)));
    await invalidateCommerceSearchCache();
    res.json({ success: true, message: "Product deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete product" });
  }
}

router.post("/admin/products", adminMiddleware as any, createProductHandler);
router.put("/admin/products/:id", adminMiddleware as any, updateProductHandler);
router.delete("/admin/products/:id", adminMiddleware as any, deleteProductHandler);

router.post("/products", adminMiddleware as any, createProductHandler);
router.put("/products/:id", adminMiddleware as any, updateProductHandler);
router.delete("/products/:id", adminMiddleware as any, deleteProductHandler);

export { generateSlugFromName };
export default router;
