import { Router } from "express";
import { db, integrationsTable, shopifyIntegrationsTable, woocommerceIntegrationsTable, marketingIntegrationsTable, syncJobsTable, productsTable } from "@workspace/db";
import { and, eq, desc, or, sql } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import { generateSlugFromName } from "../lib/slugify";
import { logger } from "../lib/logger";

const router = Router();

/* ── Master Integrations ──────────────────────────────── */

router.get("/integrations", adminMiddleware as any, async (req, res) => {
  try {
    const items = await db.select().from(integrationsTable).orderBy(desc(integrationsTable.createdAt));
    res.json(items);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

router.post("/integrations", adminMiddleware as any, async (req, res) => {
  try {
    const { name, type, config, isActive } = req.body;
    if (!name || !type) { res.status(400).json({ error: "name and type are required" }); return; }
    const [item] = await db.insert(integrationsTable).values({ name, type, config: config ?? {}, isActive: isActive ?? false }).returning();
    res.status(201).json(item);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

router.patch("/integrations/:id", adminMiddleware as any, async (req, res) => {
  try {
    const [item] = await db.update(integrationsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(integrationsTable.id, parseInt(req.params.id))).returning();
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    res.json(item);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

router.delete("/integrations/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(integrationsTable).where(eq(integrationsTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

/* ── Shopify ──────────────────────────────────────────── */

router.get("/integrations/shopify", adminMiddleware as any, async (req, res) => {
  try {
    const [item] = await db.select().from(shopifyIntegrationsTable).limit(1);
    res.json(item ?? null);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

router.post("/integrations/shopify", adminMiddleware as any, async (req, res) => {
  try {
    const { storeUrl, apiKey, accessToken } = req.body;
    if (!storeUrl || !apiKey || !accessToken) {
      res.status(400).json({ error: "storeUrl, apiKey, and accessToken are required" }); return;
    }
    const existing = await db.select().from(shopifyIntegrationsTable).limit(1);
    if (existing.length > 0) {
      const [item] = await db.update(shopifyIntegrationsTable).set({ storeUrl, apiKey, accessToken, updatedAt: new Date() }).where(eq(shopifyIntegrationsTable.id, existing[0]!.id)).returning();
      res.json(item);
    } else {
      const [item] = await db.insert(shopifyIntegrationsTable).values({ storeUrl, apiKey, accessToken }).returning();
      res.status(201).json(item);
    }
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

router.post("/integrations/shopify/sync", adminMiddleware as any, async (req, res) => {
  try {
    const [config] = await db.select().from(shopifyIntegrationsTable).limit(1);
    if (!config) { res.status(404).json({ error: "Shopify integration not configured" }); return; }

    const locked = await db
      .update(shopifyIntegrationsTable)
      .set({ syncStatus: "syncing", updatedAt: new Date() })
      .where(and(eq(shopifyIntegrationsTable.id, config.id), sql`${shopifyIntegrationsTable.syncStatus} IS DISTINCT FROM 'syncing'`))
      .returning({ id: shopifyIntegrationsTable.id });

    if (locked.length === 0) {
      res.status(409).json({ error: "A Shopify sync is already in progress. Please wait for it to finish before starting another." });
      return;
    }

    let job: typeof syncJobsTable.$inferSelect;
    try {
      const [inserted] = await db.insert(syncJobsTable).values({
        integrationType: "shopify",
        status: "running",
        logs: [`Starting Shopify sync from ${config.storeUrl}`],
        meta: { storeUrl: config.storeUrl },
      }).returning();
      job = inserted!;
    } catch (insertErr) {
      await db.update(shopifyIntegrationsTable).set({ syncStatus: "failed", errorMessage: "Failed to create sync job", updatedAt: new Date() }).where(eq(shopifyIntegrationsTable.id, config.id));
      throw insertErr;
    }

    res.json({ jobId: job.id, message: "Sync started" });

    setImmediate(async () => {
      const logs: string[] = [];
      let successCount = 0;
      let failedCount = 0;
      try {
        const cleanUrl = config.storeUrl.replace(/\/$/, "");
        const url = `${cleanUrl}/admin/api/2024-01/products.json?limit=250`;
        const response = await fetch(url, {
          headers: { "X-Shopify-Access-Token": config.accessToken, "Content-Type": "application/json" },
        });
        if (!response.ok) throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
        const data: any = await response.json();
        const shopifyProducts: any[] = data.products ?? [];
        logs.push(`Fetched ${shopifyProducts.length} products from Shopify`);

        for (const sp of shopifyProducts) {
          try {
            const price = sp.variants?.[0]?.price ?? "0";
            const stock = sp.variants?.reduce((sum: number, v: any) => sum + (parseInt(v.inventory_quantity) || 0), 0) ?? 0;
            const images = (sp.images ?? []).map((img: any) => img.src).filter(Boolean);
            const shopifyProductId = String(sp.id);
            const candidateSlug = sp.handle ?? generateSlugFromName(sp.title ?? "untitled");
            const name = sp.title ?? "Untitled";
            const description = sp.body_html?.replace(/<[^>]*>/g, "").trim() || undefined;
            const active = sp.status === "active";

            // Four-tier lookup to find any pre-existing product for this Shopify item:
            //
            // Tier 1 — shopify_product_id: stable Shopify numeric ID.
            //           Reliable from the second sync onwards once stored.
            //
            // Tier 2 — shopify_handle = candidateSlug: the last-seen Shopify handle
            //           stored on the DB row. Catches handle changes for products
            //           synced at least once with this code.
            //
            // Tier 3 — slug = candidateSlug: backward-compat for legacy products
            //           (no shopify_product_id / shopify_handle stored yet) where
            //           the handle has not changed since the last old-code sync.
            //
            // Tier 4 — name match on unlinked rows: last-resort heuristic for
            //           legacy products whose Shopify handle changed before the
            //           first sync with this code. Only matches rows that still
            //           lack a shopify_product_id to avoid false positives.
            let [existing] = await db
              .select({ id: productsTable.id, slug: productsTable.slug, images: productsTable.images })
              .from(productsTable)
              .where(
                or(
                  eq(productsTable.shopifyProductId, shopifyProductId),
                  eq(productsTable.shopifyHandle, candidateSlug),
                  eq(productsTable.slug, candidateSlug),
                ),
              )
              .limit(1);

            if (!existing) {
              // Tier 4: case-insensitive name match for unlinked legacy rows.
              // This is a heuristic — log every hit so operators can review
              // potential mislinks (e.g. two products sharing the same name).
              const lowerName = name.toLowerCase();
              const [byName] = await db
                .select({ id: productsTable.id, slug: productsTable.slug, images: productsTable.images })
                .from(productsTable)
                .where(sql`lower(${productsTable.name}) = ${lowerName} AND ${productsTable.shopifyProductId} IS NULL`)
                .limit(1);
              if (byName) {
                logger.warn(
                  { shopifyProductId, shopifyHandle: candidateSlug, productId: byName.id, slug: byName.slug, name },
                  "Shopify sync: Tier-4 name-based match used — verify this link is correct",
                );
                existing = byName;
              }
            }

            if (existing) {
              // Product already exists — update content but preserve the slug.
              // Also store / refresh shopifyProductId and shopifyHandle so future
              // syncs always find this product by the stable Shopify ID.
              // Preserve custom-uploaded images (paths starting with /objects/) —
              // never overwrite them with external Shopify CDN URLs.
              const existingImgs = existing.images as string[] | null | undefined;
              const hasCustomImages = Array.isArray(existingImgs) && existingImgs.some((img: string) => img.startsWith("/objects/"));
              await db.update(productsTable).set({
                name,
                description,
                price: String(price),
                stock,
                ...(hasCustomImages ? {} : { images }),
                active,
                shopifyProductId,
                shopifyHandle: candidateSlug,
                source: "shopify",
                externalId: shopifyProductId,
                updatedAt: new Date(),
              }).where(eq(productsTable.id, existing.id));
            } else {
              // Truly new product — insert with the Shopify handle as the initial slug.
              await db.insert(productsTable).values({
                name,
                slug: candidateSlug,
                shopifyProductId,
                shopifyHandle: candidateSlug,
                description,
                price: String(price),
                stock,
                images,
                active,
                source: "shopify",
                externalId: shopifyProductId,
              });
            }
            successCount++;
          } catch { failedCount++; }
        }
        logs.push(`Sync complete: ${successCount} imported, ${failedCount} failed`);
        await db.update(shopifyIntegrationsTable).set({ syncStatus: "completed", lastSyncAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(shopifyIntegrationsTable.id, config.id));
      } catch (err: any) {
        logs.push(`Error: ${err.message}`);
        await db.update(shopifyIntegrationsTable).set({ syncStatus: "failed", errorMessage: err.message, updatedAt: new Date() }).where(eq(shopifyIntegrationsTable.id, config.id));
      }
      await db.update(syncJobsTable).set({ status: failedCount > 0 && successCount === 0 ? "failed" : "completed", logs, successCount, failedCount, totalItems: successCount + failedCount, completedAt: new Date() }).where(eq(syncJobsTable.id, job.id));
    });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

/* ── WooCommerce ──────────────────────────────────────── */

router.get("/integrations/woocommerce", adminMiddleware as any, async (req, res) => {
  try {
    const [item] = await db.select().from(woocommerceIntegrationsTable).limit(1);
    res.json(item ?? null);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

router.post("/integrations/woocommerce", adminMiddleware as any, async (req, res) => {
  try {
    const { storeUrl, consumerKey, consumerSecret } = req.body;
    if (!storeUrl || !consumerKey || !consumerSecret) {
      res.status(400).json({ error: "storeUrl, consumerKey, and consumerSecret are required" }); return;
    }
    const existing = await db.select().from(woocommerceIntegrationsTable).limit(1);
    if (existing.length > 0) {
      const [item] = await db.update(woocommerceIntegrationsTable).set({ storeUrl, consumerKey, consumerSecret, updatedAt: new Date() }).where(eq(woocommerceIntegrationsTable.id, existing[0]!.id)).returning();
      res.json(item);
    } else {
      const [item] = await db.insert(woocommerceIntegrationsTable).values({ storeUrl, consumerKey, consumerSecret }).returning();
      res.status(201).json(item);
    }
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

router.post("/integrations/woocommerce/sync", adminMiddleware as any, async (req, res) => {
  try {
    const [config] = await db.select().from(woocommerceIntegrationsTable).limit(1);
    if (!config) { res.status(404).json({ error: "WooCommerce integration not configured" }); return; }

    const locked = await db
      .update(woocommerceIntegrationsTable)
      .set({ syncStatus: "syncing", updatedAt: new Date() })
      .where(and(eq(woocommerceIntegrationsTable.id, config.id), sql`${woocommerceIntegrationsTable.syncStatus} IS DISTINCT FROM 'syncing'`))
      .returning({ id: woocommerceIntegrationsTable.id });

    if (locked.length === 0) {
      res.status(409).json({ error: "A WooCommerce sync is already in progress. Please wait for it to finish before starting another." });
      return;
    }

    let job: typeof syncJobsTable.$inferSelect;
    try {
      const [inserted] = await db.insert(syncJobsTable).values({
        integrationType: "woocommerce",
        status: "running",
        logs: [`Starting WooCommerce sync from ${config.storeUrl}`],
        meta: { storeUrl: config.storeUrl },
      }).returning();
      job = inserted!;
    } catch (insertErr) {
      await db.update(woocommerceIntegrationsTable).set({ syncStatus: "failed", errorMessage: "Failed to create sync job", updatedAt: new Date() }).where(eq(woocommerceIntegrationsTable.id, config.id));
      throw insertErr;
    }

    res.json({ jobId: job.id, message: "Sync started" });

    setImmediate(async () => {
      const logs: string[] = [];
      let successCount = 0;
      let failedCount = 0;
      try {
        const cleanUrl = config.storeUrl.replace(/\/$/, "");
        const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
        const url = `${cleanUrl}/wp-json/wc/v3/products?per_page=100`;
        const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
        if (!response.ok) throw new Error(`WooCommerce API error: ${response.status} ${response.statusText}`);
        const wooProducts = await response.json() as any[];
        logs.push(`Fetched ${wooProducts.length} products from WooCommerce`);

        for (const wp of wooProducts) {
          try {
            const price = wp.price || wp.regular_price || "0";
            const originalPrice = wp.regular_price && wp.sale_price ? wp.regular_price : undefined;
            const stock = wp.stock_quantity ?? 0;
            const images = (wp.images ?? []).map((img: any) => img.src).filter(Boolean);
            const woocommerceProductId = String(wp.id);
            const candidateSlug = wp.slug ?? generateSlugFromName(wp.name ?? "untitled");
            const name = wp.name ?? "Untitled";
            const description = wp.description?.replace(/<[^>]*>/g, "").trim() || undefined;
            const active = wp.status === "publish";

            // Three-tier lookup — same strategy as Shopify sync above:
            // Tier 1: woocommerce_product_id (stable numeric ID, populated from first sync onwards)
            // Tier 2: slug = candidateSlug (backward-compat when slug/handle hasn't changed)
            const [existing] = await db
              .select({ id: productsTable.id, slug: productsTable.slug, images: productsTable.images })
              .from(productsTable)
              .where(
                or(
                  eq(productsTable.woocommerceProductId, woocommerceProductId),
                  eq(productsTable.slug, candidateSlug),
                ),
              )
              .limit(1);

            if (existing) {
              // Product already exists — update content but preserve the slug.
              // Refresh woocommerceProductId so future syncs always find it by ID.
              // Preserve custom-uploaded images (paths starting with /objects/) —
              // never overwrite them with external WooCommerce CDN URLs.
              const existingImgs = existing.images as string[] | null | undefined;
              const hasCustomImages = Array.isArray(existingImgs) && existingImgs.some((img: string) => img.startsWith("/objects/"));
              await db.update(productsTable).set({
                name,
                description,
                price: String(price),
                originalPrice: originalPrice ? String(originalPrice) : undefined,
                stock,
                ...(hasCustomImages ? {} : { images }),
                active,
                woocommerceProductId,
                source: "woocommerce",
                externalId: woocommerceProductId,
                updatedAt: new Date(),
              }).where(eq(productsTable.id, existing.id));
            } else {
              // Truly new product — insert with the WooCommerce slug as the initial slug.
              await db.insert(productsTable).values({
                name,
                slug: candidateSlug,
                woocommerceProductId,
                description,
                price: String(price),
                originalPrice: originalPrice ? String(originalPrice) : undefined,
                stock,
                images,
                active,
                source: "woocommerce",
                externalId: woocommerceProductId,
              });
            }
            successCount++;
          } catch { failedCount++; }
        }
        logs.push(`Sync complete: ${successCount} imported, ${failedCount} failed`);
        await db.update(woocommerceIntegrationsTable).set({ syncStatus: "completed", lastSyncAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(woocommerceIntegrationsTable.id, config.id));
      } catch (err: any) {
        logs.push(`Error: ${err.message}`);
        await db.update(woocommerceIntegrationsTable).set({ syncStatus: "failed", errorMessage: err.message, updatedAt: new Date() }).where(eq(woocommerceIntegrationsTable.id, config.id));
      }
      await db.update(syncJobsTable).set({ status: failedCount > 0 && successCount === 0 ? "failed" : "completed", logs, successCount, failedCount, totalItems: successCount + failedCount, completedAt: new Date() }).where(eq(syncJobsTable.id, job.id));
    });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

/* ── Marketing Integrations ───────────────────────────── */

router.get("/integrations/marketing", adminMiddleware as any, async (req, res) => {
  try {
    const items = await db.select().from(marketingIntegrationsTable).orderBy(desc(marketingIntegrationsTable.createdAt));
    res.json(items);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

router.post("/integrations/marketing", adminMiddleware as any, async (req, res) => {
  try {
    const { platform, pixelId, accessToken, isActive, config } = req.body;
    if (!platform) { res.status(400).json({ error: "platform is required" }); return; }
    const existing = await db.select().from(marketingIntegrationsTable).where(eq(marketingIntegrationsTable.platform, platform));
    if (existing.length > 0) {
      const [item] = await db.update(marketingIntegrationsTable).set({ pixelId, accessToken, isActive: isActive ?? false, config: config ?? {}, updatedAt: new Date() }).where(eq(marketingIntegrationsTable.id, existing[0]!.id)).returning();
      res.json(item);
    } else {
      const [item] = await db.insert(marketingIntegrationsTable).values({ platform, pixelId, accessToken, isActive: isActive ?? false, config: config ?? {} }).returning();
      res.status(201).json(item);
    }
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

router.patch("/integrations/marketing/:id", adminMiddleware as any, async (req, res) => {
  try {
    const [item] = await db.update(marketingIntegrationsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(marketingIntegrationsTable.id, parseInt(req.params.id))).returning();
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    res.json(item);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

export default router;
