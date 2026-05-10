import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, and, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import { googleMerchantSettingsTable, merchantSyncLogsTable, shopifyProductsTable } from "@workspace/db/schema";
import { adminMiddleware } from "../lib/auth";
import { logger } from "../lib/logger";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

/* ── helpers ── */
async function getOrCreateSettings() {
  const rows = await db.select().from(googleMerchantSettingsTable).limit(1);
  if (rows.length) return rows[0]!;
  const [row] = await db.insert(googleMerchantSettingsTable).values({}).returning();
  return row!;
}

function escapeXml(str: string): string {
  return (str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(html: string): string {
  return (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
}

async function fetchActiveProducts(s: typeof googleMerchantSettingsTable.$inferSelect, limit = 1000) {
  const settings = (s.feedSettings ?? {}) as Record<string, unknown>;
  const includeOutOfStock = Boolean(settings["includeOutOfStock"]);
  const minPrice = Number(settings["minPrice"] ?? 0);
  const maxProducts = Math.min(Number(settings["maxProducts"] ?? 1000), 2000);

  const products = await db
    .select()
    .from(shopifyProductsTable)
    .where(
      and(
        eq(shopifyProductsTable.status, "active"),
        includeOutOfStock ? undefined : gt(shopifyProductsTable.inventoryQuantity, 0),
      ),
    )
    .orderBy(desc(shopifyProductsTable.syncedAt))
    .limit(Math.min(limit, maxProducts));

  return products.filter(p => Number(p.price ?? 0) >= minPrice);
}

/* ══════════════════════════════════════════════════
   PUBLIC FEED ENDPOINTS
══════════════════════════════════════════════════ */

/** GET /api/feeds/google-merchant.xml — Google Shopping XML Feed */
router.get("/feeds/google-merchant.xml", async (req: Request, res: Response) => {
  try {
    const s = await getOrCreateSettings();
    if (!s.feedEnabled) {
      res.status(403).send("Feed disabled");
      return;
    }

    const products = await fetchActiveProducts(s);
    const storeUrl = (s.storeUrl || "https://kdfnuts.com").replace(/\/$/, "");
    const brand = s.brand || "KDF NUTS";
    const currency = s.currency || "PKR";
    const category = escapeXml(s.productCategory || "Food, Beverages &amp; Tobacco &gt; Food Items &gt; Nuts &amp; Seeds");

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${escapeXml(s.storeName || "KDF NUTS")}</title>
    <link>${escapeXml(storeUrl)}</link>
    <description>Premium Quality Dry Fruits &amp; Nuts — Pakistan</description>
    <g:updated>${new Date().toISOString()}</g:updated>
`;

    for (const p of products) {
      const price = Number(p.price ?? 0).toFixed(2);
      const available = (p.inventoryQuantity ?? 0) > 0 ? "in stock" : "out of stock";
      const productUrl = `${storeUrl}/products/${p.shopifyProductId}`;
      const imageUrl = p.imageUrl ?? "";
      const desc = escapeXml(stripHtml(p.description ?? p.title));
      const title = escapeXml(p.title);
      const sku = p.sku ? `\n      <g:mpn>${escapeXml(p.sku)}</g:mpn>` : "";
      const productType = p.productType ? `\n      <g:product_type>${escapeXml(p.productType)}</g:product_type>` : "";
      const tags = p.tags ? `\n      <g:custom_label_0>${escapeXml(p.tags.split(",")[0]?.trim() ?? "")}</g:custom_label_0>` : "";

      xml += `
    <item>
      <g:id>${p.shopifyProductId}</g:id>
      <g:title>${title}</g:title>
      <g:description>${desc || title}</g:description>
      <g:link>${escapeXml(productUrl)}</g:link>${imageUrl ? `\n      <g:image_link>${escapeXml(imageUrl)}</g:image_link>` : ""}
      <g:availability>${available}</g:availability>
      <g:price>${price} ${currency}</g:price>${p.compareAtPrice ? `\n      <g:sale_price>${price} ${currency}</g:sale_price>` : ""}
      <g:brand>${escapeXml(brand)}</g:brand>
      <g:condition>new</g:condition>
      <g:google_product_category>${category}</g:google_product_category>${productType}${sku}${tags}
      <g:identifier_exists>no</g:identifier_exists>
      <g:shipping>
        <g:country>PK</g:country>
        <g:service>Standard</g:service>
        <g:price>0.00 PKR</g:price>
      </g:shipping>
    </item>`;

      /* Variants as separate items */
      const includeVariants = (s.feedSettings as any)?.includeVariants !== false;
      if (includeVariants && Array.isArray(p.variants) && p.variants.length > 1) {
        for (const v of p.variants.slice(0, 10)) {
          const vPrice = Number(v.price ?? p.price ?? 0).toFixed(2);
          const vAvail = (v.inventoryQuantity ?? (p.inventoryQuantity ?? 0)) > 0 ? "in stock" : "out of stock";
          const vSku = v.sku ? `\n      <g:mpn>${escapeXml(v.sku)}</g:mpn>` : "";
          xml += `
    <item>
      <g:id>${p.shopifyProductId}_${v.id}</g:id>
      <g:title>${escapeXml(p.title + " — " + v.title)}</g:title>
      <g:description>${desc || title}</g:description>
      <g:link>${escapeXml(productUrl)}?variant=${v.id}</g:link>${imageUrl ? `\n      <g:image_link>${escapeXml(imageUrl)}</g:image_link>` : ""}
      <g:availability>${vAvail}</g:availability>
      <g:price>${vPrice} ${currency}</g:price>
      <g:brand>${escapeXml(brand)}</g:brand>
      <g:condition>new</g:condition>
      <g:google_product_category>${category}</g:google_product_category>
      <g:item_group_id>${p.shopifyProductId}</g:item_group_id>${vSku}
      <g:identifier_exists>no</g:identifier_exists>
    </item>`;
        }
      }
    }

    xml += `
  </channel>
</rss>`;

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.set("X-Feed-Count", String(products.length));
    res.send(xml);

    /* Log sync */
    await db.insert(merchantSyncLogsTable).values({
      action: "feed_served",
      productCount: products.length,
      status: "success",
      details: { feedType: "google-merchant-xml", productCount: products.length },
    }).catch(() => {});

  } catch (err: any) {
    logger.error(err, "Google Merchant XML feed error");
    res.status(500).send("Feed generation failed");
  }
});

/** GET /api/feeds/facebook-catalog.json — Facebook / Meta Catalog JSON Feed */
router.get("/feeds/facebook-catalog.json", async (req: Request, res: Response) => {
  try {
    const s = await getOrCreateSettings();
    if (!s.feedEnabled) {
      res.status(403).json({ error: "Feed disabled" });
      return;
    }

    const products = await fetchActiveProducts(s);
    const storeUrl = (s.storeUrl || "https://kdfnuts.com").replace(/\/$/, "");
    const brand = s.brand || "KDF NUTS";
    const currency = s.currency || "PKR";

    const items = [];
    for (const p of products) {
      const price = Number(p.price ?? 0).toFixed(2);
      const available = (p.inventoryQuantity ?? 0) > 0 ? "in stock" : "out of stock";
      const productUrl = `${storeUrl}/products/${p.shopifyProductId}`;

      items.push({
        id: p.shopifyProductId,
        title: p.title,
        description: stripHtml(p.description ?? p.title).slice(0, 500),
        availability: available,
        condition: "new",
        price: `${price} ${currency}`,
        link: productUrl,
        image_link: p.imageUrl ?? "",
        brand,
        google_product_category: s.productCategory,
        product_type: p.productType ?? "Dry Fruits",
        currency,
        retailer_id: p.shopifyProductId,
        inventory: p.inventoryQuantity ?? 0,
        additional_image_link: p.imageUrl ?? "",
        checkout_url: productUrl,
        sale_price: p.compareAtPrice ? `${price} ${currency}` : undefined,
      });

      /* Variants */
      const includeVariants = (s.feedSettings as any)?.includeVariants !== false;
      if (includeVariants && Array.isArray(p.variants) && p.variants.length > 1) {
        for (const v of p.variants.slice(0, 10)) {
          const vPrice = Number(v.price ?? p.price ?? 0).toFixed(2);
          items.push({
            id: `${p.shopifyProductId}_${v.id}`,
            title: `${p.title} — ${v.title}`,
            description: stripHtml(p.description ?? p.title).slice(0, 500),
            availability: (v.inventoryQuantity ?? (p.inventoryQuantity ?? 0)) > 0 ? "in stock" : "out of stock",
            condition: "new",
            price: `${vPrice} ${currency}`,
            link: `${productUrl}?variant=${v.id}`,
            image_link: p.imageUrl ?? "",
            brand,
            google_product_category: s.productCategory,
            item_group_id: p.shopifyProductId,
            currency,
            retailer_id: `${p.shopifyProductId}_${v.id}`,
          });
        }
      }
    }

    res.set("Content-Type", "application/json; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.json({ data: items, updated: new Date().toISOString(), count: items.length });

  } catch (err: any) {
    logger.error(err, "Facebook Catalog JSON feed error");
    res.status(500).json({ error: "Feed generation failed" });
  }
});

/** GET /api/feeds/meta-commerce.json — Meta Commerce Feed (same format, different caching) */
router.get("/feeds/meta-commerce.json", async (req: Request, res: Response) => {
  req.url = "/feeds/facebook-catalog.json";
  res.redirect(307, "/api/feeds/facebook-catalog.json");
});

/** GET /api/feeds/google-merchant-preview — Preview first 5 products */
router.get("/api/feeds/google-merchant-preview", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const s = await getOrCreateSettings();
    const products = await fetchActiveProducts(s, 5);
    res.json({ products: products.map(p => ({ id: p.shopifyProductId, title: p.title, price: p.price, imageUrl: p.imageUrl, status: p.status, inventory: p.inventoryQuantity })), total: products.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════
   ADMIN SETTINGS ENDPOINTS
══════════════════════════════════════════════════ */

/** GET /api/admin/merchant/settings */
router.get("/admin/merchant/settings", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const s = await getOrCreateSettings();
    /* product count */
    const countResult = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM shopify_products WHERE status = 'active'`);
    const productCount = (countResult.rows?.[0] as any)?.cnt ?? 0;
    res.json({ ...s, productCount });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/admin/merchant/settings */
router.put("/admin/merchant/settings", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const s = await getOrCreateSettings();
    const {
      merchantId, storeName, storeUrl, currency, country, language,
      brand, productCategory, autoSyncEnabled, feedEnabled,
      gaTrackingId, gtmContainerId, searchConsoleUrl, feedSettings,
    } = req.body;

    const [updated] = await db
      .update(googleMerchantSettingsTable)
      .set({
        ...(merchantId    !== undefined && { merchantId }),
        ...(storeName     !== undefined && { storeName }),
        ...(storeUrl      !== undefined && { storeUrl }),
        ...(currency      !== undefined && { currency }),
        ...(country       !== undefined && { country }),
        ...(language      !== undefined && { language }),
        ...(brand         !== undefined && { brand }),
        ...(productCategory !== undefined && { productCategory }),
        ...(autoSyncEnabled !== undefined && { autoSyncEnabled }),
        ...(feedEnabled   !== undefined && { feedEnabled }),
        ...(gaTrackingId  !== undefined && { gaTrackingId }),
        ...(gtmContainerId !== undefined && { gtmContainerId }),
        ...(searchConsoleUrl !== undefined && { searchConsoleUrl }),
        ...(feedSettings  !== undefined && { feedSettings }),
        updatedAt: new Date(),
      })
      .where(eq(googleMerchantSettingsTable.id, s.id))
      .returning();

    res.json(updated);
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/admin/merchant/sync — trigger manual feed refresh + log */
router.post("/admin/merchant/sync", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const s = await getOrCreateSettings();
    const products = await fetchActiveProducts(s);
    const count = products.length;

    await db
      .update(googleMerchantSettingsTable)
      .set({ lastSyncAt: new Date(), lastSyncCount: count, lastSyncError: null, updatedAt: new Date() })
      .where(eq(googleMerchantSettingsTable.id, s.id));

    await db.insert(merchantSyncLogsTable).values({
      action: "manual_sync",
      productCount: count,
      status: "success",
      details: { triggeredBy: "admin", storeUrl: s.storeUrl },
    });

    res.json({ ok: true, productCount: count, syncedAt: new Date().toISOString() });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/merchant/sync-logs */
router.get("/admin/merchant/sync-logs", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const logs = await db
      .select()
      .from(merchantSyncLogsTable)
      .orderBy(desc(merchantSyncLogsTable.createdAt))
      .limit(50);
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/merchant/stats */
router.get("/admin/merchant/stats", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const s = await getOrCreateSettings();
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE inventory_quantity > 0)::int AS in_stock,
        COUNT(*) FILTER (WHERE inventory_quantity = 0)::int AS out_of_stock,
        COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url != '')::int AS with_image,
        COUNT(*) FILTER (WHERE price IS NOT NULL AND price::numeric > 0)::int AS with_price
      FROM shopify_products
    `);
    res.json({ settings: s, stats: result.rows?.[0] ?? {} });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/merchant/feed-health — check for products with issues */
router.get("/admin/merchant/feed-health", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE image_url IS NULL OR image_url = '')::int AS missing_image,
        COUNT(*) FILTER (WHERE description IS NULL OR description = '')::int AS missing_description,
        COUNT(*) FILTER (WHERE price IS NULL OR price::numeric = 0)::int AS missing_price,
        COUNT(*) FILTER (WHERE sku IS NULL OR sku = '')::int AS missing_sku,
        COUNT(*) FILTER (WHERE status = 'active' AND inventory_quantity > 0)::int AS ready_to_sync
      FROM shopify_products WHERE status = 'active'
    `);
    res.json(result.rows?.[0] ?? {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
