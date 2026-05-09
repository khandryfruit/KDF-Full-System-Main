import { Router } from "express";
import { db, integrationsTable, shopifyIntegrationsTable, woocommerceIntegrationsTable, marketingIntegrationsTable, syncJobsTable, productsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import { generateSlugFromName, ensureUniqueSlug } from "../lib/slugify";

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

    await db.update(shopifyIntegrationsTable).set({ syncStatus: "syncing", updatedAt: new Date() }).where(eq(shopifyIntegrationsTable.id, config.id));

    const [job] = await db.insert(syncJobsTable).values({
      integrationType: "shopify",
      status: "running",
      logs: [`Starting Shopify sync from ${config.storeUrl}`],
      meta: { storeUrl: config.storeUrl },
    }).returning();

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
            const slugBase = sp.handle ?? generateSlugFromName(sp.title ?? "untitled");
            const slug = await ensureUniqueSlug(slugBase);
            await db.insert(productsTable).values({
              name: sp.title ?? "Untitled",
              slug,
              description: sp.body_html?.replace(/<[^>]*>/g, "").trim() || undefined,
              price: String(price),
              stock,
              images,
              active: sp.status === "active",
            });
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

    await db.update(woocommerceIntegrationsTable).set({ syncStatus: "syncing", updatedAt: new Date() }).where(eq(woocommerceIntegrationsTable.id, config.id));

    const [job] = await db.insert(syncJobsTable).values({
      integrationType: "woocommerce",
      status: "running",
      logs: [`Starting WooCommerce sync from ${config.storeUrl}`],
      meta: { storeUrl: config.storeUrl },
    }).returning();

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
            const slugBase = wp.slug ?? generateSlugFromName(wp.name ?? "untitled");
            const slug = await ensureUniqueSlug(slugBase);
            await db.insert(productsTable).values({
              name: wp.name ?? "Untitled",
              slug,
              description: wp.description?.replace(/<[^>]*>/g, "").trim() || undefined,
              price: String(price),
              originalPrice: originalPrice ? String(originalPrice) : undefined,
              stock,
              images,
              active: wp.status === "publish",
            });
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
