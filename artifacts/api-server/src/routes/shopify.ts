import { Router, type Request } from "express";
import { db } from "@workspace/db";
import {
  shopifyStoresTable, shopifyOrdersTable, shopifyCustomersTable,
  shopifyProductsTable, shopifyCampaignsTable, shopifyWebhookLogsTable,
  shopifyEmailCampaignsTable, shopifyEmailLogsTable,
  syncJobsTable, campaignMessageQueueTable,
  productsTable,
} from "@workspace/db/schema";
import { abandonedCheckoutsTable } from "@workspace/db/schema";
import { emailSettingsTable, aiSettingsTable } from "@workspace/db/schema";
import { couriersTable, shipmentsTable } from "@workspace/db/schema";
import { eq, desc, ilike, and, sql, gte, or, lte, lt } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import { sendWhatsAppMessage, normalizePhone } from "../lib/whatsapp";
import { enqueueCampaignMessages } from "../lib/campaignQueue";
import nodemailer from "nodemailer";
import OpenAI from "openai";
import {
  verifyShopifyHmac,
  processShopifyWebhookPayload,
  registerShopifyWebhooks,
  listShopifyWebhooks,
  getAutoSyncStatus,
  triggerImmediateSync,
  pushFulfillmentToShopify,
} from "../lib/shopifyAutoSync";
import { syncAbandonedCheckoutsFromShopifyRest } from "../lib/shopifyAbandonedCheckoutSync";

const router = Router();
const SHOPIFY_API_VERSION = "2024-01";

/**
 * Shopify webhooks must call the API origin (api.*), never the admin SPA host.
 * Prefer env overrides, then optional body.callbackBaseUrl, then X-Forwarded-Host
 * with admin.* → api.* rewrite.
 */
function resolveShopifyWebhookCallbackBase(req: Request): string {
  const envCandidates = [
    process.env.SHOPIFY_WEBHOOK_BASE_URL,
    process.env.PUBLIC_API_ORIGIN,
    process.env.API_BASE_URL,
  ];
  for (const raw of envCandidates) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const s = raw.trim().replace(/\/+$/, "");
    try {
      return new URL(s.startsWith("http") ? s : `https://${s}`).origin;
    } catch {
      continue;
    }
  }

  const body = (req.body ?? {}) as { callbackBaseUrl?: string };
  const custom = typeof body.callbackBaseUrl === "string" ? body.callbackBaseUrl.trim().replace(/\/+$/, "") : "";
  if (custom) {
    try {
      return new URL(custom.startsWith("http") ? custom : `https://${custom}`).origin;
    } catch {
      /* fall through */
    }
  }

  const fwdHost = ((req.headers["x-forwarded-host"] as string) ?? "").split(",")[0].trim().split(":")[0];
  const fwdProto = ((req.headers["x-forwarded-proto"] as string) ?? "https").split(",")[0].trim() || "https";
  const replitDomains = process.env.REPLIT_DOMAINS ?? "";
  const replitPrimary = replitDomains.split(",")[0]?.trim();

  if (fwdHost && !fwdHost.includes("replit")) {
    let host = fwdHost.toLowerCase();
    if (host.startsWith("admin.")) {
      host = "api." + host.slice("admin.".length);
    }
    return `${fwdProto}://${host}`;
  }
  if (replitPrimary) return `https://${replitPrimary}`;
  return `https://${process.env.REPLIT_DEV_DOMAIN ?? "localhost"}`;
}

/* ─── Cursor-based pagination helper ─────────────────── */
function parseNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return match ? decodeURIComponent(match[1]) : null;
}

/* ─── Upsert helpers (reused by both quick sync and full sync) ── */
async function upsertOrder(store: any, o: any) {
  const addr = o.shipping_address ?? o.billing_address ?? {};
  const items = (o.line_items ?? []).map((li: any) => ({
    id: String(li.id), title: li.title, quantity: li.quantity,
    price: li.price, sku: li.sku, variantTitle: li.variant_title,
    imageUrl: li.product?.image?.src,
  }));
  await db.insert(shopifyOrdersTable).values({
    storeId: store.id, shopifyOrderId: String(o.id),
    orderNumber: o.name ?? `#${o.order_number}`,
    customerName: o.customer ? `${o.customer.first_name ?? ""} ${o.customer.last_name ?? ""}`.trim() : null,
    customerEmail: o.customer?.email ?? null,
    customerPhone: o.customer?.phone ?? addr.phone ?? null,
    status: o.fulfillment_status ?? "pending",
    fulfillmentStatus: o.fulfillment_status ?? null,
    financialStatus: o.financial_status ?? null,
    currency: o.currency ?? "PKR",
    totalPrice: o.total_price ?? null,
    subtotalPrice: o.subtotal_price ?? null,
    totalTax: o.total_tax ?? null,
    totalDiscounts: o.total_discounts ?? null,
    shippingAddress: { name: addr.name, address1: addr.address1, city: addr.city, country: addr.country, phone: addr.phone, zip: addr.zip },
    lineItems: items, tags: o.tags ?? null, note: o.note ?? null,
    shopifyCreatedAt: o.created_at ? new Date(o.created_at) : null,
    shopifyUpdatedAt: o.updated_at ? new Date(o.updated_at) : null,
    syncedAt: new Date(),
  }).onConflictDoUpdate({
    target: shopifyOrdersTable.shopifyOrderId,
    set: {
      status: o.fulfillment_status ?? "pending", fulfillmentStatus: o.fulfillment_status ?? null,
      financialStatus: o.financial_status ?? null, totalPrice: o.total_price ?? null,
      lineItems: items, shopifyUpdatedAt: o.updated_at ? new Date(o.updated_at) : null,
      syncedAt: new Date(), updatedAt: new Date(),
    },
  });
}

async function upsertCustomer(store: any, c: any) {
  const addr = c.default_address ?? {};
  await db.insert(shopifyCustomersTable).values({
    storeId: store.id, shopifyCustomerId: String(c.id),
    firstName: c.first_name ?? null, lastName: c.last_name ?? null,
    email: c.email ?? null, phone: c.phone ?? null,
    city: addr.city ?? null, country: addr.country ?? null,
    totalOrders: c.orders_count ?? 0,
    totalSpent: c.total_spent ?? "0",
    currency: c.currency ?? "PKR",
    tags: c.tags ?? null,
    acceptsMarketing: c.accepts_marketing ?? false,
    lastOrderAt: null,
    shopifyCreatedAt: c.created_at ? new Date(c.created_at) : null,
    syncedAt: new Date(),
  }).onConflictDoUpdate({
    target: shopifyCustomersTable.shopifyCustomerId,
    set: {
      firstName: c.first_name ?? null, lastName: c.last_name ?? null,
      email: c.email ?? null, phone: c.phone ?? null,
      totalOrders: c.orders_count ?? 0, totalSpent: c.total_spent ?? "0",
      tags: c.tags ?? null, acceptsMarketing: c.accepts_marketing ?? false,
      syncedAt: new Date(), updatedAt: new Date(),
    },
  });
}

async function upsertProduct(store: any, p: any) {
  const firstVariant = p.variants?.[0] ?? {};
  const variants = (p.variants ?? []).map((v: any) => ({
    id: String(v.id), title: v.title, price: v.price, sku: v.sku,
    inventoryQuantity: v.inventory_quantity,
  }));
  await db.insert(shopifyProductsTable).values({
    storeId: store.id, shopifyProductId: String(p.id),
    title: p.title, description: p.body_html ?? null,
    vendor: p.vendor ?? null, productType: p.product_type ?? null,
    status: p.status ?? "active", tags: p.tags ?? null,
    imageUrl: p.images?.[0]?.src ?? null,
    price: firstVariant.price ?? null,
    compareAtPrice: firstVariant.compare_at_price ?? null,
    inventoryQuantity: firstVariant.inventory_quantity ?? 0,
    sku: firstVariant.sku ?? null, variants,
    shopifyCreatedAt: p.created_at ? new Date(p.created_at) : null,
    syncedAt: new Date(),
  }).onConflictDoUpdate({
    target: shopifyProductsTable.shopifyProductId,
    set: {
      title: p.title, status: p.status ?? "active",
      price: firstVariant.price ?? null, variants,
      imageUrl: p.images?.[0]?.src ?? null,
      inventoryQuantity: firstVariant.inventory_quantity ?? 0,
      syncedAt: new Date(), updatedAt: new Date(),
    },
  });
}

/* ─── Background full sync (cursor-based, handles 200K+ records) ── */
async function runFullSync(store: any, types: string[], jobId: number) {
  const addLog = async (msg: string) => {
    await db.execute(sql`UPDATE sync_jobs SET logs = logs || ${JSON.stringify([msg])}::jsonb WHERE id = ${jobId}`);
  };
  let totalSynced = 0;
  try {
    if (types.includes("orders")) {
      await addLog("Starting orders full sync...");
      let path: string | null = "/orders.json?status=any&limit=250&order=created_at+asc";
      let page = 0;
      while (path) {
        const resp = await shopifyFetch(store, path);
        if (!resp.ok) { await addLog(`Orders page ${page} error: HTTP ${resp.status}`); break; }
        const { orders } = await resp.json() as any;
        for (const o of (orders ?? [])) { await upsertOrder(store, o); totalSynced++; }
        const next = parseNextPageInfo(resp.headers.get("Link"));
        path = next ? `/orders.json?page_info=${encodeURIComponent(next)}&limit=250` : null;
        page++;
        if (page % 5 === 0) await addLog(`Orders: ${totalSynced} synced (page ${page})`);
        await new Promise(r => setTimeout(r, 300)); // rate limit buffer
      }
      await db.update(shopifyStoresTable).set({ lastOrderSync: new Date(), totalOrdersSynced: totalSynced, updatedAt: new Date() }).where(eq(shopifyStoresTable.id, store.id));
      await addLog(`Orders sync complete: ${totalSynced} total`);
    }

    if (types.includes("customers")) {
      await addLog("Starting customers full sync...");
      let path: string | null = "/customers.json?limit=250&order=created_at+asc";
      let page = 0; let count = 0;
      while (path) {
        const resp = await shopifyFetch(store, path);
        if (!resp.ok) { await addLog(`Customers page ${page} error: HTTP ${resp.status}`); break; }
        const { customers } = await resp.json() as any;
        for (const c of (customers ?? [])) { await upsertCustomer(store, c); count++; }
        const next = parseNextPageInfo(resp.headers.get("Link"));
        path = next ? `/customers.json?page_info=${encodeURIComponent(next)}&limit=250` : null;
        page++;
        if (page % 5 === 0) await addLog(`Customers: ${count} synced (page ${page})`);
        await new Promise(r => setTimeout(r, 300));
      }
      await db.update(shopifyStoresTable).set({ lastCustomerSync: new Date(), totalCustomersSynced: count, updatedAt: new Date() }).where(eq(shopifyStoresTable.id, store.id));
      await addLog(`Customers sync complete: ${count} total`);
      totalSynced += count;
    }

    if (types.includes("products")) {
      await addLog("Starting products full sync...");
      let path: string | null = "/products.json?limit=250";
      let page = 0; let count = 0;
      while (path) {
        const resp = await shopifyFetch(store, path);
        if (!resp.ok) { await addLog(`Products page ${page} error: HTTP ${resp.status}`); break; }
        const { products } = await resp.json() as any;
        for (const p of (products ?? [])) { await upsertProduct(store, p); count++; }
        const next = parseNextPageInfo(resp.headers.get("Link"));
        path = next ? `/products.json?page_info=${encodeURIComponent(next)}&limit=250` : null;
        page++;
        await new Promise(r => setTimeout(r, 300));
      }
      await db.update(shopifyStoresTable).set({ lastProductSync: new Date(), totalProductsSynced: count, updatedAt: new Date() }).where(eq(shopifyStoresTable.id, store.id));
      await addLog(`Products sync complete: ${count} total`);
      totalSynced += count;
    }

    await db.update(syncJobsTable).set({
      status: "completed", successCount: totalSynced, completedAt: new Date(),
    }).where(eq(syncJobsTable.id, jobId));
  } catch (err: any) {
    await addLog(`FATAL ERROR: ${err.message}`);
    await db.update(syncJobsTable).set({
      status: "failed", failedCount: 1, completedAt: new Date(),
    }).where(eq(syncJobsTable.id, jobId));
  }
}

/* ─── Shopify REST helper ─────────────────────────────── */
async function shopifyFetch(store: typeof shopifyStoresTable.$inferSelect, path: string, options?: RequestInit) {
  const url = `https://${store.shopDomain}/admin/api/${SHOPIFY_API_VERSION}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": store.accessToken ?? "",
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  return resp;
}

async function getActiveStore() {
  const [store] = await db.select().from(shopifyStoresTable).where(eq(shopifyStoresTable.isConnected, true)).limit(1);
  return store ?? null;
}

function normalizeShopDomain(domain: string | null | undefined): string {
  return String(domain ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

async function findStoreByShopDomain(shopDomain: string) {
  const normalized = normalizeShopDomain(shopDomain);
  if (!normalized) return null;
  const stores = await db.select().from(shopifyStoresTable);
  return stores.find((s) => normalizeShopDomain(s.shopDomain) === normalized) ?? null;
}

/* ═══════════════════════════════════════════════════════
   STORE CONFIG
══════════════════════════════════════════════════════ */

router.get("/admin/shopify/store", adminMiddleware, async (req, res) => {
  try {
    const [store] = await db.select().from(shopifyStoresTable).limit(1);
    res.json(store ?? null);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch store" });
  }
});

router.put("/admin/shopify/store", adminMiddleware, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const {
      shopDomain,
      accessToken,
      apiKey,
      apiSecret,
      webhookSecret,
      storeName,
      syncOrders,
      syncCustomers,
      syncProducts,
    } = body;

    const [existing] = await db.select().from(shopifyStoresTable).limit(1);

    const trimStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

    /* Empty secret fields from the SPA must NOT wipe DB — user often saves without re-pasting the token. */
    const nextAccess =
      trimStr(accessToken) !== "" ? trimStr(accessToken) : (existing?.accessToken ?? null);
    const nextApiKey =
      trimStr(apiKey) !== "" ? trimStr(apiKey) : (existing?.apiKey ?? null);
    const nextApiSecret =
      trimStr(apiSecret) !== "" ? trimStr(apiSecret) : (existing?.apiSecret ?? null);
    const nextWebhookSecret =
      trimStr(webhookSecret) !== "" ? trimStr(webhookSecret) : (existing?.webhookSecret ?? null);

    const normalizedDomain = trimStr(shopDomain).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    const finalDomain = normalizedDomain || existing?.shopDomain || "";

    if (!finalDomain) {
      return res.status(400).json({ error: "shopDomain is required" });
    }

    const hasLiveCreds = Boolean(finalDomain && nextAccess);

    const data = {
      shopDomain: finalDomain,
      accessToken: nextAccess,
      apiKey: nextApiKey,
      apiSecret: nextApiSecret,
      webhookSecret: nextWebhookSecret,
      storeName: trimStr(storeName) || null,
      syncOrders: syncOrders !== false,
      syncCustomers: syncCustomers !== false,
      syncProducts: syncProducts !== false,
      /* Show as connected once credentials are stored; POST /store/test still validates against Shopify. */
      isConnected: hasLiveCreds ? true : false,
      updatedAt: new Date(),
    };

    let store;
    if (existing) {
      [store] = await db.update(shopifyStoresTable).set(data).where(eq(shopifyStoresTable.id, existing.id)).returning();
    } else {
      if (!trimStr(accessToken)) {
        return res.status(400).json({ error: "accessToken is required for new store configuration" });
      }
      [store] = await db.insert(shopifyStoresTable).values({ ...data }).returning();
    }
    res.json(store);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to save store" });
  }
});

router.post("/admin/shopify/store/test", adminMiddleware, async (req, res) => {
  try {
    const [store] = await db.select().from(shopifyStoresTable).limit(1);
    if (!store?.shopDomain || !store.accessToken) {
      return res.status(400).json({ success: false, error: "Store not configured" });
    }
    const resp = await shopifyFetch(store, "/shop.json");
    if (!resp.ok) {
      const text = await resp.text();
      return res.json({ success: false, error: `Shopify API error ${resp.status}: ${text.slice(0, 200)}` });
    }
    const data = await resp.json() as any;
    await db.update(shopifyStoresTable).set({
      isConnected: true,
      storeName: data.shop?.name ?? store.storeName,
      storeEmail: data.shop?.email ?? store.storeEmail,
      currency: data.shop?.currency ?? store.currency,
      updatedAt: new Date(),
    }).where(eq(shopifyStoresTable.id, store.id));
    res.json({ success: true, shop: data.shop });
  } catch (err) {
    req.log.error(err);
    res.json({ success: false, error: String(err) });
  }
});

router.post("/admin/shopify/store/disconnect", adminMiddleware, async (req, res) => {
  try {
    const [store] = await db.select().from(shopifyStoresTable).limit(1);
    if (store) {
      await db.update(shopifyStoresTable).set({ isConnected: false, accessToken: null, updatedAt: new Date() }).where(eq(shopifyStoresTable.id, store.id));
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

/* ═══════════════════════════════════════════════════════
   DASHBOARD STATS
══════════════════════════════════════════════════════ */

router.get("/admin/shopify/stats", adminMiddleware, async (req, res) => {
  try {
    const [store] = await db.select().from(shopifyStoresTable).limit(1);
    const [orderCount] = await db.select({ count: sql<number>`count(*)` }).from(shopifyOrdersTable);
    const [customerCount] = await db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable);
    const [productCount] = await db.select({ count: sql<number>`count(*)` }).from(shopifyProductsTable);
    const [campaignCount] = await db.select({ count: sql<number>`count(*)` }).from(shopifyCampaignsTable);
    const [revenue] = await db.select({ total: sql<string>`coalesce(sum(total_price), 0)` }).from(shopifyOrdersTable);
    const recentOrders = await db.select().from(shopifyOrdersTable).orderBy(desc(shopifyOrdersTable.createdAt)).limit(5);
    res.json({
      store: store ?? null,
      orders: Number(orderCount?.count ?? 0),
      customers: Number(customerCount?.count ?? 0),
      products: Number(productCount?.count ?? 0),
      campaigns: Number(campaignCount?.count ?? 0),
      revenue: revenue?.total ?? "0",
      recentOrders,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

/* ═══════════════════════════════════════════════════════
   SYNC
══════════════════════════════════════════════════════ */

/* Quick sync: last 250 records (for recent activity top-up) */
/* Quick sync endpoints — fire full background jobs so they handle 20K+ records without HTTP timeout */
router.post("/admin/shopify/sync/orders", adminMiddleware, async (req, res) => {
  try {
    const store = await getActiveStore();
    if (!store) return res.status(400).json({ error: "No connected store" });
    const [job] = await db.insert(syncJobsTable).values({
      integrationType: "shopify", status: "pending",
      logs: ["Orders full sync started (no record limit)"],
      meta: { types: ["orders"], storeId: store.id },
    }).returning();
    setImmediate(() => runFullSync(store, ["orders"], job.id));
    res.json({ success: true, jobId: job.id, message: "Full orders sync started in background — no record limit" });
  } catch (err) { req.log.error(err); res.status(500).json({ error: String(err) }); }
});

router.post("/admin/shopify/sync/customers", adminMiddleware, async (req, res) => {
  try {
    const store = await getActiveStore();
    if (!store) return res.status(400).json({ error: "No connected store" });
    const [job] = await db.insert(syncJobsTable).values({
      integrationType: "shopify", status: "pending",
      logs: ["Customers full sync started (no record limit)"],
      meta: { types: ["customers"], storeId: store.id },
    }).returning();
    setImmediate(() => runFullSync(store, ["customers"], job.id));
    res.json({ success: true, jobId: job.id, message: "Full customers sync started in background — no record limit" });
  } catch (err) { req.log.error(err); res.status(500).json({ error: String(err) }); }
});

router.post("/admin/shopify/sync/products", adminMiddleware, async (req, res) => {
  try {
    const store = await getActiveStore();
    if (!store) return res.status(400).json({ error: "No connected store" });
    const [job] = await db.insert(syncJobsTable).values({
      integrationType: "shopify", status: "pending",
      logs: ["Products full sync started (background job)"],
      meta: { types: ["products"], storeId: store.id },
    }).returning();
    setImmediate(() => runFullSync(store, ["products"], job.id));
    res.json({ success: true, jobId: job.id, message: "Products sync started in background" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/** Pull abandoned checkouts from Shopify (GraphQL primary, REST fallback; Marketing Hub backfill). */
router.post("/admin/shopify/sync/abandoned-checkouts", adminMiddleware, async (req, res) => {
  try {
    const store = await getActiveStore();
    if (!store) return res.status(400).json({ error: "No connected store" });
    const out = await syncAbandonedCheckoutsFromShopifyRest(store);
    const { debugBodySnippet, ...safe } = out;
    if (debugBodySnippet) {
      req.log.debug(
        { snippet: debugBodySnippet.slice(0, 600) },
        "abandoned_checkouts sync response snippet",
      );
    }
    req.log.info(
      {
        upserted: out.upserted,
        source: out.source,
        apiVersion: out.apiVersion,
        adminHost: out.adminHost,
        error: out.error,
        lastUrl: out.lastRequestUrl,
        httpStatus: out.lastHttpStatus,
      },
      "abandoned_checkouts sync finished",
    );
    res.json({
      success: !out.error || (out.upserted ?? 0) > 0,
      ...safe,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* Full historical sync — fire-and-forget background job (handles 200K+ records) */
router.post("/admin/shopify/sync/full", adminMiddleware, async (req, res) => {
  try {
    const store = await getActiveStore();
    if (!store) return res.status(400).json({ error: "No connected store" });
    const types: string[] = req.body.types ?? ["orders", "customers", "products"];
    const [job] = await db.insert(syncJobsTable).values({
      integrationType: "shopify",
      status: "pending",
      logs: [`Full sync started for: ${types.join(", ")}`],
      meta: { types, storeId: store.id },
    }).returning();
    // Fire and forget — do not await
    setImmediate(() => runFullSync(store, types, job.id));
    res.json({ success: true, jobId: job.id, message: `Full sync started for ${types.join(", ")}` });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* Poll sync job status */
router.get("/admin/shopify/sync/job/:id", adminMiddleware, async (req, res) => {
  try {
    const [job] = await db.select().from(syncJobsTable).where(eq(syncJobsTable.id, parseInt(req.params.id))).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════
   ORDERS
══════════════════════════════════════════════════════ */

router.get("/admin/shopify/orders", adminMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const { status, search, financial_status, from, to, city_filter, delivery_type } = req.query;
    const conditions: any[] = [];

    if (status && status !== "all")
      conditions.push(eq(shopifyOrdersTable.status, status as string));
    if (financial_status && financial_status !== "all")
      conditions.push(eq(shopifyOrdersTable.financialStatus, financial_status as string));
    if (from) conditions.push(gte(shopifyOrdersTable.shopifyCreatedAt, new Date(from as string)));
    if (to)   conditions.push(lte(shopifyOrdersTable.shopifyCreatedAt, new Date(to as string)));

    /* Smart delivery-type filters */
    if (city_filter === "lahore")
      conditions.push(sql`(shipping_address->>'city') ILIKE '%lahore%'`);

    if (delivery_type === "lahore")
      conditions.push(sql`(shipping_address->>'city') ILIKE '%lahore%'`);
    else if (delivery_type === "rider_assigned")
      conditions.push(sql`EXISTS (SELECT 1 FROM rider_deliveries rd WHERE rd.shopify_order_db_id = shopify_orders.id)`);
    else if (delivery_type === "courier_booked")
      conditions.push(sql`EXISTS (SELECT 1 FROM shipments s WHERE s.shopify_order_id = shopify_orders.shopify_order_id AND s.is_cancelled IS NOT TRUE)`);
    else if (delivery_type === "paid")
      conditions.push(eq(shopifyOrdersTable.financialStatus, "paid"));
    else if (delivery_type === "cod_pending")
      conditions.push(sql`financial_status IS DISTINCT FROM 'paid' AND total_price IS NOT NULL AND CAST(total_price AS numeric) > 0`);
    else if (delivery_type === "out_for_delivery")
      conditions.push(sql`(
        EXISTS (SELECT 1 FROM shipments s WHERE s.shopify_order_id = shopify_orders.shopify_order_id AND s.status = 'out_for_delivery' AND s.is_cancelled IS NOT TRUE)
        OR EXISTS (SELECT 1 FROM rider_deliveries rd WHERE rd.shopify_order_db_id = shopify_orders.id AND rd.status = 'in_transit')
      )`);
    else if (delivery_type === "delivered")
      conditions.push(sql`(
        EXISTS (SELECT 1 FROM shipments s WHERE s.shopify_order_id = shopify_orders.shopify_order_id AND s.status = 'delivered' AND s.is_cancelled IS NOT TRUE)
        OR EXISTS (SELECT 1 FROM rider_deliveries rd WHERE rd.shopify_order_db_id = shopify_orders.id AND rd.status = 'delivered')
      )`);

    if (search) {
      conditions.push(or(
        ilike(shopifyOrdersTable.customerName, `%${search}%`),
        ilike(shopifyOrdersTable.orderNumber, `%${search}%`),
        ilike(shopifyOrdersTable.customerPhone, `%${search}%`),
      ));
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [items, countResult] = await Promise.all([
      db.select({
        id: shopifyOrdersTable.id,
        storeId: shopifyOrdersTable.storeId,
        shopifyOrderId: shopifyOrdersTable.shopifyOrderId,
        orderNumber: shopifyOrdersTable.orderNumber,
        customerName: shopifyOrdersTable.customerName,
        customerEmail: shopifyOrdersTable.customerEmail,
        customerPhone: shopifyOrdersTable.customerPhone,
        status: shopifyOrdersTable.status,
        fulfillmentStatus: shopifyOrdersTable.fulfillmentStatus,
        financialStatus: shopifyOrdersTable.financialStatus,
        currency: shopifyOrdersTable.currency,
        totalPrice: shopifyOrdersTable.totalPrice,
        subtotalPrice: shopifyOrdersTable.subtotalPrice,
        totalTax: shopifyOrdersTable.totalTax,
        totalDiscounts: shopifyOrdersTable.totalDiscounts,
        shippingAddress: shopifyOrdersTable.shippingAddress,
        lineItems: shopifyOrdersTable.lineItems,
        tags: shopifyOrdersTable.tags,
        note: shopifyOrdersTable.note,
        trackingNumber: shopifyOrdersTable.trackingNumber,
        trackingUrl: shopifyOrdersTable.trackingUrl,
        waNotificationSent: shopifyOrdersTable.waNotificationSent,
        waLastMessage: shopifyOrdersTable.waLastMessage,
        shopifyCreatedAt: shopifyOrdersTable.shopifyCreatedAt,
        shopifyUpdatedAt: shopifyOrdersTable.shopifyUpdatedAt,
        syncedAt: shopifyOrdersTable.syncedAt,
        createdAt: shopifyOrdersTable.createdAt,
        updatedAt: shopifyOrdersTable.updatedAt,
        /* latest shipment info via correlated subquery */
        shipmentCourierSlug: sql<string | null>`(
          SELECT courier_slug FROM shipments
          WHERE shopify_order_id = shopify_orders.shopify_order_id
            AND is_cancelled IS NOT TRUE
          ORDER BY created_at DESC LIMIT 1
        )`,
        shipmentStatus: sql<string | null>`(
          SELECT status::text FROM shipments
          WHERE shopify_order_id = shopify_orders.shopify_order_id
            AND is_cancelled IS NOT TRUE
          ORDER BY created_at DESC LIMIT 1
        )`,
        shipmentTrackingId: sql<string | null>`(
          SELECT tracking_id FROM shipments
          WHERE shopify_order_id = shopify_orders.shopify_order_id
            AND is_cancelled IS NOT TRUE
          ORDER BY created_at DESC LIMIT 1
        )`,
        /* rider info */
        riderName: sql<string | null>`(
          SELECT r.name FROM rider_deliveries rd
          JOIN riders r ON r.id = rd.rider_id
          WHERE rd.shopify_order_db_id = shopify_orders.id
          ORDER BY rd.created_at DESC LIMIT 1
        )`,
        riderStatus: sql<string | null>`(
          SELECT rd.status FROM rider_deliveries rd
          WHERE rd.shopify_order_db_id = shopify_orders.id
          ORDER BY rd.created_at DESC LIMIT 1
        )`,
      }).from(shopifyOrdersTable).where(where).orderBy(desc(shopifyOrdersTable.shopifyCreatedAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(shopifyOrdersTable).where(where),
    ]);
    res.json({ orders: items, total: Number(countResult[0]?.count ?? 0), page, limit });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* GET counts for all delivery-type filter tabs (must be before /:id) */
router.get("/admin/shopify/orders/counts", adminMiddleware, async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS all,
        COUNT(*) FILTER (WHERE (shipping_address->>'city') ILIKE '%lahore%')::int AS lahore,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM shipments s
          WHERE s.shopify_order_id = shopify_orders.shopify_order_id AND s.is_cancelled IS NOT TRUE
        ))::int AS courier_booked,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM rider_deliveries rd WHERE rd.shopify_order_db_id = shopify_orders.id
        ))::int AS rider_assigned,
        COUNT(*) FILTER (WHERE (
          EXISTS (SELECT 1 FROM shipments s WHERE s.shopify_order_id = shopify_orders.shopify_order_id AND s.status = 'out_for_delivery' AND s.is_cancelled IS NOT TRUE)
          OR EXISTS (SELECT 1 FROM rider_deliveries rd WHERE rd.shopify_order_db_id = shopify_orders.id AND rd.status = 'in_transit')
        ))::int AS out_for_delivery,
        COUNT(*) FILTER (WHERE (
          EXISTS (SELECT 1 FROM shipments s WHERE s.shopify_order_id = shopify_orders.shopify_order_id AND s.status = 'delivered' AND s.is_cancelled IS NOT TRUE)
          OR EXISTS (SELECT 1 FROM rider_deliveries rd WHERE rd.shopify_order_db_id = shopify_orders.id AND rd.status = 'delivered')
        ))::int AS delivered,
        COUNT(*) FILTER (WHERE financial_status IS DISTINCT FROM 'paid' AND total_price IS NOT NULL AND CAST(total_price AS numeric) > 0)::int AS cod_pending,
        COUNT(*) FILTER (WHERE financial_status = 'paid')::int AS paid
      FROM shopify_orders
    `);
    res.json(result.rows[0] ?? {});
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch counts" });
  }
});

router.get("/admin/shopify/orders/:id", adminMiddleware, async (req, res) => {
  try {
    const [order] = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.id, parseInt(req.params.id))).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

router.put("/admin/shopify/orders/:id/status", adminMiddleware, async (req, res) => {
  try {
    const { status, trackingNumber, trackingUrl } = req.body;
    const [order] = await db.update(shopifyOrdersTable).set({
      status: status as string,
      trackingNumber: trackingNumber ?? undefined,
      trackingUrl: trackingUrl ?? undefined,
      updatedAt: new Date(),
    }).where(eq(shopifyOrdersTable.id, parseInt(req.params.id))).returning();
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update order" });
  }
});

router.post("/admin/shopify/orders/:id/whatsapp", adminMiddleware, async (req, res) => {
  try {
    const [order] = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.id, parseInt(req.params.id))).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const phone = order.customerPhone;
    if (!phone) return res.status(400).json({ error: "No phone number for this customer" });
    const { message } = req.body;
    const text = (message as string) || `Hi ${order.customerName ?? "there"}! Your Shopify order ${order.orderNumber} is currently *${order.status}*. Thank you for shopping with us! 🛍️`;
    await sendWhatsAppMessage({ phone: normalizePhone(phone), message: text });
    await db.update(shopifyOrdersTable).set({ waNotificationSent: true, waLastMessage: text, updatedAt: new Date() }).where(eq(shopifyOrdersTable.id, order.id));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════
   CUSTOMERS
══════════════════════════════════════════════════════ */

router.get("/admin/shopify/customers", adminMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const { search, segment, city, cities } = req.query;
    const conditions: any[] = [];
    if (search) {
      conditions.push(or(
        ilike(shopifyCustomersTable.firstName, `%${search}%`),
        ilike(shopifyCustomersTable.lastName, `%${search}%`),
        ilike(shopifyCustomersTable.email, `%${search}%`),
        ilike(shopifyCustomersTable.phone, `%${search}%`),
        ilike(shopifyCustomersTable.city, `%${search}%`),
      ));
    }
    /* City filter — multi-city support */
    if (cities) {
      const cityList = (cities as string).split(",").map(c => c.trim()).filter(Boolean);
      if (cityList.length === 1) {
        conditions.push(ilike(shopifyCustomersTable.city, cityList[0]));
      } else if (cityList.length > 1) {
        conditions.push(or(...cityList.map(c => ilike(shopifyCustomersTable.city, c))) as any);
      }
    } else if (city && city !== "all") {
      conditions.push(ilike(shopifyCustomersTable.city, city as string));
    }
    /* Segment filter */
    if (segment === "high_value") conditions.push(gte(shopifyCustomersTable.totalSpent, "5000"));
    if (segment === "vip") conditions.push(gte(shopifyCustomersTable.totalSpent, "15000"));
    if (segment === "repeat") conditions.push(gte(shopifyCustomersTable.totalOrders, 3));
    if (segment === "new") {
      const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      conditions.push(sql`shopify_created_at >= ${d30.toISOString()}`);
    }
    if (segment === "csv") conditions.push(eq(shopifyCustomersTable.source, "csv"));
    if (segment === "with_phone") conditions.push(sql`phone is not null`);
    if (segment === "with_email") conditions.push(sql`email is not null`);
    if (segment === "marketing") conditions.push(eq(shopifyCustomersTable.acceptsMarketing, true));
    if (segment === "inactive") {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      conditions.push(sql`total_orders >= 1`);
      conditions.push(sql`shopify_created_at < ${cutoff.toISOString()}`);
      conditions.push(sql`(last_order_at IS NULL OR last_order_at < ${cutoff.toISOString()})`);
    }
    /* RFM advanced segments */
    if (segment === "one_time") {
      const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      conditions.push(eq(shopifyCustomersTable.totalOrders, 1));
      conditions.push(sql`(last_order_at IS NULL OR last_order_at < ${d30.toISOString()})`);
    }
    if (segment === "at_risk") {
      const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const d90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      conditions.push(gte(shopifyCustomersTable.totalOrders, 2));
      conditions.push(sql`last_order_at < ${d30.toISOString()}`);
      conditions.push(sql`last_order_at >= ${d90.toISOString()}`);
    }
    if (segment === "lost") {
      const d180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      conditions.push(sql`total_orders >= 1`);
      conditions.push(sql`(last_order_at IS NULL OR last_order_at < ${d180.toISOString()})`);
    }
    if (segment === "inactive_30d") {
      const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      conditions.push(sql`total_orders >= 1`);
      conditions.push(sql`(last_order_at IS NULL OR last_order_at < ${d30.toISOString()})`);
    }
    if (segment === "inactive_60d") {
      const d60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      conditions.push(sql`total_orders >= 1`);
      conditions.push(sql`(last_order_at IS NULL OR last_order_at < ${d60.toISOString()})`);
    }
    if (segment === "inactive_90d") {
      const d90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      conditions.push(sql`total_orders >= 1`);
      conditions.push(sql`(last_order_at IS NULL OR last_order_at < ${d90.toISOString()})`);
    }
    const where = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [items, countResult] = await Promise.all([
      db.select().from(shopifyCustomersTable).where(where).orderBy(desc(shopifyCustomersTable.totalSpent)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable).where(where),
    ]);
    res.json({ customers: items, total: Number(countResult[0]?.count ?? 0), page, limit });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

/* Customer segments — must be registered BEFORE /:id to prevent "segments" being parsed as an ID */
router.get("/admin/shopify/customers/segments", adminMiddleware, async (req, res) => {
  try {
    const [
      total, vip, highValue, repeat, inactive, newCustomers, withPhone, withEmail, marketingOptIn,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable),
      db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable)
        .where(sql`cast(total_spent as numeric) >= 15000`),
      db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable)
        .where(sql`cast(total_spent as numeric) >= 5000`),
      db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable)
        .where(sql`total_orders >= 3`),
      db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable)
        .where(and(
          sql`total_orders >= 1`,
          sql`shopify_created_at < now() - interval '90 days'`,
          sql`(last_order_at is null or last_order_at < now() - interval '90 days')`
        )),
      db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable)
        .where(sql`shopify_created_at >= now() - interval '30 days'`),
      db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable)
        .where(sql`phone is not null`),
      db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable)
        .where(sql`email is not null`),
      db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable)
        .where(eq(shopifyCustomersTable.acceptsMarketing, true)),
    ]);
    res.json({
      total: Number(total[0]?.count ?? 0),
      vip: Number(vip[0]?.count ?? 0),
      highValue: Number(highValue[0]?.count ?? 0),
      repeat: Number(repeat[0]?.count ?? 0),
      inactive: Number(inactive[0]?.count ?? 0),
      newCustomers: Number(newCustomers[0]?.count ?? 0),
      withPhone: Number(withPhone[0]?.count ?? 0),
      withEmail: Number(withEmail[0]?.count ?? 0),
      marketingOptIn: Number(marketingOptIn[0]?.count ?? 0),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch segments" });
  }
});

/* City distribution — returns distinct cities with customer counts (case-normalised) */
router.get("/admin/shopify/customers/cities", adminMiddleware, async (req, res) => {
  try {
    const rows = await db.execute<{ city: string; count: string }>(sql`
      SELECT initcap(lower(city)) AS city, count(*) AS count
      FROM shopify_customers
      WHERE city IS NOT NULL AND city != ''
      GROUP BY lower(city)
      ORDER BY count DESC
      LIMIT 30
    `);
    res.json({ cities: (rows.rows ?? rows).map((r: any) => ({ city: r.city, count: Number(r.count) })) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch cities" });
  }
});

/* ── Marketing: queue stats (sent/pending/failed across all queued messages) ── */
router.get("/admin/shopify/marketing/queue/stats", adminMiddleware, async (req, res) => {
  try {
    const [waRow, emailRow, recentRows] = await Promise.all([
      db.execute<{ status: string; cnt: string }>(sql`
        SELECT status, count(*) as cnt FROM campaign_message_queue
        WHERE campaign_type = 'whatsapp'
        GROUP BY status
      `),
      db.execute<{ status: string; cnt: string }>(sql`
        SELECT status, count(*) as cnt FROM campaign_message_queue
        WHERE campaign_type = 'email'
        GROUP BY status
      `),
      db.execute<{ id: string; campaign_type: string; status: string; customer_name: string; sent_at: string; error_message: string; created_at: string; campaign_id: string }>(sql`
        SELECT id, campaign_type, status, customer_name, sent_at, error_message, created_at, campaign_id
        FROM campaign_message_queue
        ORDER BY created_at DESC LIMIT 50
      `),
    ]);
    const toMap = (rows: any[]) => {
      const m: Record<string, number> = { pending: 0, sent: 0, failed: 0, sending: 0 };
      for (const r of (rows.rows ?? rows)) m[r.status] = (m[r.status] ?? 0) + Number(r.cnt);
      return m;
    };
    res.json({
      whatsapp: toMap(waRow.rows ?? (waRow as any)),
      email: toMap(emailRow.rows ?? (emailRow as any)),
      recent: (recentRows.rows ?? (recentRows as any)).slice(0, 50),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch queue stats" });
  }
});

/* ── Marketing: test email (verify SMTP config) ── */
router.post("/admin/shopify/marketing/test-email", adminMiddleware, async (req, res) => {
  try {
    const { to } = req.body as { to: string };
    if (!to) return res.status(400).json({ error: "Recipient email required" });
    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    if (!settings?.emailEnabled || !settings.smtpHost || !settings.smtpUser) {
      return res.status(400).json({ error: "Email not configured. Go to Email Settings first." });
    }
    const transport = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpPort === 465,
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
    });
    await transport.sendMail({
      from: settings.smtpFrom || settings.smtpUser,
      to,
      subject: "✅ KDF NUTS – Email Configuration Test",
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px">
        <h2 style="color:#5FA800">✅ Email is working!</h2>
        <p style="color:#333;font-size:15px">This is a test email from your <strong>KDF NUTS Marketing Hub</strong>.</p>
        <p style="color:#555;font-size:14px">Your SMTP configuration is correct and email campaigns can be sent successfully.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#aaa;font-size:12px">KDF NUTS Admin · Sent ${new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} PKT</p>
      </div>`,
    });
    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (err: any) {
    req.log.error(err, "Test email failed");
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

/* ── Marketing: send email campaign to a segment ── */
router.post("/admin/shopify/marketing/campaign/email", adminMiddleware, async (req, res) => {
  try {
    const { subject, message, segment, spreadHours } = req.body as {
      subject: string; message: string; segment?: string; spreadHours?: number;
    };
    if (!subject?.trim() || !message?.trim()) return res.status(400).json({ error: "Subject and message required" });
    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    if (!settings?.emailEnabled) return res.status(400).json({ error: "Email not configured" });

    /* Build segment filter */
    const conditions: any[] = [sql`email is not null`];
    if (segment === "vip") conditions.push(gte(shopifyCustomersTable.totalSpent, "15000"));
    else if (segment === "high_value") conditions.push(gte(shopifyCustomersTable.totalSpent, "5000"));
    else if (segment === "repeat") conditions.push(gte(shopifyCustomersTable.totalOrders, 2));
    else if (segment === "one_time") {
      const d30 = new Date(Date.now() - 30 * 864e5);
      conditions.push(eq(shopifyCustomersTable.totalOrders, 1));
      conditions.push(sql`(last_order_at IS NULL OR last_order_at < ${d30.toISOString()})`);
    } else if (segment === "inactive_60d") {
      const d60 = new Date(Date.now() - 60 * 864e5);
      conditions.push(sql`total_orders >= 1 AND (last_order_at IS NULL OR last_order_at < ${d60.toISOString()})`);
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];
    const customers = await db.select({
      id: shopifyCustomersTable.id,
      firstName: shopifyCustomersTable.firstName,
      email: shopifyCustomersTable.email,
    }).from(shopifyCustomersTable).where(where);

    const queued = await enqueueCampaignMessages({
      campaignType: "email",
      spreadHours: spreadHours ?? 0,
      messages: customers.map(c => ({
        customerId: c.id,
        customerName: c.firstName ?? undefined,
        email: c.email ?? undefined,
        subject,
        message: message.replace(/\{name\}/gi, c.firstName ?? "there").replace(/\{first_name\}/gi, c.firstName ?? "there"),
      })),
    });

    req.log.info({ queued, segment }, "Email campaign enqueued");
    res.json({ success: true, targeting: customers.length, queued });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ── Marketing Hub: full summary of all RFM segments + cart + campaign stats ── */
router.get("/admin/shopify/marketing/summary", adminMiddleware, async (req, res) => {
  try {
    const d30  = new Date(Date.now() - 30  * 864e5);
    const d60  = new Date(Date.now() - 60  * 864e5);
    const d90  = new Date(Date.now() - 90  * 864e5);
    const d180 = new Date(Date.now() - 180 * 864e5);

    const [
      total, vip, highValue, oneTime, newCust, atRisk,
      inactive30, inactive60, inactive90, lost, withPhone,
      cartActive, cartRecovered, campaignRow,
    ] = await Promise.all([
      db.select({ c: sql<number>`count(*)` }).from(shopifyCustomersTable),
      db.select({ c: sql<number>`count(*)` }).from(shopifyCustomersTable).where(sql`cast(total_spent as numeric)>=15000`),
      db.select({ c: sql<number>`count(*)` }).from(shopifyCustomersTable).where(sql`cast(total_spent as numeric)>=5000`),
      db.select({ c: sql<number>`count(*)` }).from(shopifyCustomersTable).where(and(
        eq(shopifyCustomersTable.totalOrders, 1),
        sql`(last_order_at IS NULL OR last_order_at < ${d30.toISOString()})`
      )),
      db.select({ c: sql<number>`count(*)` }).from(shopifyCustomersTable).where(sql`shopify_created_at >= ${d30.toISOString()}`),
      db.select({ c: sql<number>`count(*)` }).from(shopifyCustomersTable).where(and(
        gte(shopifyCustomersTable.totalOrders, 2),
        sql`last_order_at < ${d30.toISOString()}`,
        sql`last_order_at >= ${d90.toISOString()}`
      )),
      db.select({ c: sql<number>`count(*)` }).from(shopifyCustomersTable).where(sql`total_orders>=1 AND (last_order_at IS NULL OR last_order_at<${d30.toISOString()})`),
      db.select({ c: sql<number>`count(*)` }).from(shopifyCustomersTable).where(sql`total_orders>=1 AND (last_order_at IS NULL OR last_order_at<${d60.toISOString()})`),
      db.select({ c: sql<number>`count(*)` }).from(shopifyCustomersTable).where(sql`total_orders>=1 AND (last_order_at IS NULL OR last_order_at<${d90.toISOString()})`),
      db.select({ c: sql<number>`count(*)` }).from(shopifyCustomersTable).where(sql`total_orders>=1 AND (last_order_at IS NULL OR last_order_at<${d180.toISOString()})`),
      db.select({ c: sql<number>`count(*)` }).from(shopifyCustomersTable).where(sql`phone is not null`),
      db.select({ c: sql<number>`count(*)`, v: sql<number>`coalesce(sum(cast(subtotal as numeric)),0)` }).from(abandonedCheckoutsTable).where(eq(abandonedCheckoutsTable.status, "active")),
      db.select({ c: sql<number>`count(*)` }).from(abandonedCheckoutsTable).where(eq(abandonedCheckoutsTable.status, "recovered")),
      db.select({ c: sql<number>`count(*)`, s: sql<number>`coalesce(sum(total_sent),0)` }).from(shopifyCampaignsTable),
    ]);

    res.json({
      segments: {
        total:      Number(total[0]?.c ?? 0),
        vip:        Number(vip[0]?.c ?? 0),
        highValue:  Number(highValue[0]?.c ?? 0),
        oneTime:    Number(oneTime[0]?.c ?? 0),
        new:        Number(newCust[0]?.c ?? 0),
        atRisk:     Number(atRisk[0]?.c ?? 0),
        inactive30d: Number(inactive30[0]?.c ?? 0),
        inactive60d: Number(inactive60[0]?.c ?? 0),
        inactive90d: Number(inactive90[0]?.c ?? 0),
        lost:       Number(lost[0]?.c ?? 0),
        withPhone:  Number(withPhone[0]?.c ?? 0),
      },
      abandonedCarts: {
        active:      Number(cartActive[0]?.c ?? 0),
        activeValue: Number(cartActive[0]?.v ?? 0),
        recovered:   Number(cartRecovered[0]?.c ?? 0),
      },
      campaigns: {
        total:     Number(campaignRow[0]?.c ?? 0),
        totalSent: Number(campaignRow[0]?.s ?? 0),
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch marketing summary" });
  }
});

/* ── WhatsApp campaign send to a filtered segment ── */
router.post("/admin/shopify/customers/campaign/whatsapp", adminMiddleware, async (req, res) => {
  try {
    const { message, segment, cities, spreadHours } = req.body as {
      message: string; segment?: string; cities?: string[]; spreadHours?: number;
    };
    if (!message?.trim()) return res.status(400).json({ error: "Message is required" });

    /* Build filter */
    const conditions: any[] = [];
    conditions.push(sql`phone is not null`);
    if (Array.isArray(cities) && cities.length > 0) {
      conditions.push(or(...cities.map(c => ilike(shopifyCustomersTable.city, c))) as any);
    }
    if (segment === "high_value") conditions.push(gte(shopifyCustomersTable.totalSpent, "5000"));
    else if (segment === "vip") conditions.push(gte(shopifyCustomersTable.totalSpent, "15000"));
    else if (segment === "repeat") conditions.push(gte(shopifyCustomersTable.totalOrders, 2));
    else if (segment === "new") conditions.push(eq(shopifyCustomersTable.totalOrders, 1));
    else if (segment === "marketing") conditions.push(eq(shopifyCustomersTable.acceptsMarketing, true));
    else if (segment === "inactive") {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      conditions.push(sql`(last_order_at IS NULL OR last_order_at < ${cutoff.toISOString()})`);
    } else if (segment === "one_time") {
      const d30 = new Date(Date.now() - 30 * 864e5);
      conditions.push(eq(shopifyCustomersTable.totalOrders, 1));
      conditions.push(sql`(last_order_at IS NULL OR last_order_at < ${d30.toISOString()})`);
    } else if (segment === "at_risk") {
      const d30 = new Date(Date.now() - 30 * 864e5);
      const d90 = new Date(Date.now() - 90 * 864e5);
      conditions.push(gte(shopifyCustomersTable.totalOrders, 2));
      conditions.push(sql`last_order_at < ${d30.toISOString()}`);
      conditions.push(sql`last_order_at >= ${d90.toISOString()}`);
    } else if (segment === "lost") {
      const d180 = new Date(Date.now() - 180 * 864e5);
      conditions.push(sql`total_orders >= 1 AND (last_order_at IS NULL OR last_order_at < ${d180.toISOString()})`);
    } else if (segment === "inactive_60d") {
      const d60 = new Date(Date.now() - 60 * 864e5);
      conditions.push(sql`total_orders >= 1 AND (last_order_at IS NULL OR last_order_at < ${d60.toISOString()})`);
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];
    const customers = await db.select({
      id: shopifyCustomersTable.id,
      firstName: shopifyCustomersTable.firstName,
      phone: shopifyCustomersTable.phone,
    }).from(shopifyCustomersTable).where(where);

    /* Auto-create a shopify_campaigns record so this campaign can be tracked */
    const segmentLabels: Record<string, string> = {
      all: "All Customers", vip: "VIP", high_value: "High Value", repeat: "Repeat Buyers",
      new: "New Customers", inactive: "Inactive (90d+)", marketing: "Marketing Opt-in",
      with_phone: "Has WhatsApp", with_email: "Has Email", csv: "CSV Imported",
      one_time: "One-Time Buyers", at_risk: "At Risk", lost: "Lost Customers",
      inactive_60d: "Inactive 60d+",
    };
    const segLabel = segmentLabels[segment ?? "all"] ?? (segment ?? "All");
    const cityLabel = Array.isArray(cities) && cities.length > 0 ? ` · ${cities.join(", ")}` : "";
    const campaignName = `WA Campaign — ${segLabel}${cityLabel} · ${new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`;

    const [campaign] = await db.insert(shopifyCampaignsTable).values({
      name: campaignName,
      message,
      targetSegment: segment ?? "all",
      status: "running",
      startedAt: new Date(),
    }).returning();

    /* Enqueue messages via queue (gradual send, respects rate limits) */
    const queued = await enqueueCampaignMessages({
      campaignId: campaign.id,
      campaignType: "whatsapp",
      spreadHours: spreadHours ?? 0,
      messages: customers.map(c => ({
        customerId: c.id,
        customerName: c.firstName ?? undefined,
        phone: c.phone ?? undefined,
        message: message
          .replace(/\{name\}/gi, c.firstName ?? "there")
          .replace(/\{first_name\}/gi, c.firstName ?? "there"),
      })),
    });

    await db.update(shopifyCampaignsTable)
      .set({ status: "queued", updatedAt: new Date() })
      .where(eq(shopifyCampaignsTable.id, campaign.id));

    req.log.info({ queued, segment, cities, campaignId: campaign.id }, "Campaign messages enqueued");
    res.json({ success: true, targeting: customers.length, queued, campaignId: campaign.id });
  } catch (err) {
    req.log.error(err);
    if (!res.headersSent) res.status(500).json({ error: String(err) });
  }
});

/* ── AI-generated marketing message for a segment ── */
router.post("/admin/shopify/customers/ai-message", adminMiddleware, async (req, res) => {
  try {
    const [aiSettings] = await db.select().from(aiSettingsTable).limit(1);
    if (!aiSettings?.openaiApiKey || !aiSettings.aiEnabled) {
      /* Fallback: return a templated message without AI */
      const { segment, cities } = req.body as { segment?: string; cities?: string[] };
      const cityStr = Array.isArray(cities) && cities.length > 0 ? ` in ${cities.join(", ")}` : "";
      const segmentDescMap: Record<string, string> = {
        vip: "VIP customers with PKR 15,000+ in purchases",
        high_value: "high-value customers",
        repeat: "loyal repeat buyers",
        new: "new customers",
        inactive: "customers who haven't ordered in 90+ days",
        all: "all customers",
      };
      const segDesc = segmentDescMap[segment ?? "all"] ?? "customers";
      return res.json({
        message: `Hi {name}! 👋\n\nWe appreciate your trust in KDF NUTS 🥜\n\nAs a special thank you to our ${segDesc}${cityStr}, we have an exclusive offer waiting for you!\n\n🎁 Get 15% OFF — Use code: KDF15\n\nShop fresh dry fruits at kdfnuts.com 🛒`,
      });
    }

    const { segment, cities } = req.body as { segment?: string; cities?: string[] };
    const cityStr = Array.isArray(cities) && cities.length > 0 ? ` in ${cities.join(", ")}` : " across Pakistan";
    const segmentDescMap: Record<string, string> = {
      vip: "VIP customers (highest spenders, PKR 15K+ LTV)",
      high_value: "high-value customers (PKR 5K+ spent)",
      repeat: "loyal repeat buyers (3+ orders)",
      new: "new customers (first order)",
      inactive: "inactive customers (no order in 90 days)",
      marketing: "customers who opted into marketing",
      all: "all customers",
    };
    const segDesc = segmentDescMap[segment ?? "all"] ?? "customers";

    const openai = new OpenAI({ apiKey: aiSettings.openaiApiKey });
    const prompt = `Generate a WhatsApp marketing message for KDF NUTS, a Pakistani premium nuts & dry fruits brand.

Target: ${segDesc}${cityStr}
Tone: Friendly, warm, Pakistani cultural context
Language: English (with Urdu phrases where appropriate)
Length: 3-5 lines maximum — short and punchy

Requirements:
- Start with "Hi {name}! 👋" (keep {name} as placeholder)
- Include a specific, relevant discount offer or exclusive benefit
- Use a made-up discount code (format: KDFXXX where XXX is meaningful)
- End with the shop URL: kdfnuts.com
- Use 1-2 relevant emojis
- Make it feel personal and exclusive for this specific segment

Return only the WhatsApp message text, nothing else.`;

    const response = await openai.chat.completions.create({
      model: aiSettings.openaiModel ?? "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });
    const message = response.choices[0]?.message?.content?.trim() ?? "";
    res.json({ message });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

router.get("/admin/shopify/customers/:id", adminMiddleware, async (req, res) => {
  try {
    const [customer] = await db.select().from(shopifyCustomersTable).where(eq(shopifyCustomersTable.id, parseInt(req.params.id))).limit(1);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    const orders = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.customerEmail, customer.email ?? "")).orderBy(desc(shopifyOrdersTable.shopifyCreatedAt)).limit(10);
    res.json({ ...customer, orders });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch customer" });
  }
});

router.post("/admin/shopify/customers/:id/whatsapp", adminMiddleware, async (req, res) => {
  try {
    const [customer] = await db.select().from(shopifyCustomersTable).where(eq(shopifyCustomersTable.id, parseInt(req.params.id))).limit(1);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    if (!customer.phone) return res.status(400).json({ error: "No phone number" });
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });
    await sendWhatsAppMessage({ phone: normalizePhone(customer.phone), message });
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════
   PRODUCTS
══════════════════════════════════════════════════════ */

router.get("/admin/shopify/products", adminMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const { search, status } = req.query;
    const conditions: any[] = [];
    if (search) conditions.push(ilike(shopifyProductsTable.title, `%${search}%`));
    if (status && status !== "all") conditions.push(eq(shopifyProductsTable.status, status as string));
    const where = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [items, countResult] = await Promise.all([
      db.select().from(shopifyProductsTable).where(where).orderBy(desc(shopifyProductsTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(shopifyProductsTable).where(where),
    ]);
    res.json({ products: items, total: Number(countResult[0]?.count ?? 0), page, limit });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

/* ═══════════════════════════════════════════════════════
   CAMPAIGNS
══════════════════════════════════════════════════════ */

router.get("/admin/shopify/campaigns", adminMiddleware, async (req, res) => {
  try {
    const items = await db.select().from(shopifyCampaignsTable).orderBy(desc(shopifyCampaignsTable.createdAt));
    res.json(items);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

/* ── Live campaign monitor — per-campaign queue stats + orphaned (no campaign_id) ── */
router.get("/admin/shopify/campaigns/live", adminMiddleware, async (req, res) => {
  try {
    const [campaignRows, orphanedRow] = await Promise.all([
      db.execute<{
        id: number; name: string; status: string; target_segment: string;
        total_sent: number; total_failed: number;
        started_at: string | null; created_at: string; updated_at: string; completed_at: string | null;
        pending_count: string; sending_count: string; sent_count: string; failed_count: string; total_queued: string;
      }>(sql`
        SELECT
          sc.id, sc.name, sc.status, sc.target_segment, sc.total_sent, sc.total_failed,
          sc.started_at, sc.created_at, sc.updated_at, sc.completed_at,
          COALESCE(q.pending_count, 0)  AS pending_count,
          COALESCE(q.sending_count, 0)  AS sending_count,
          COALESCE(q.sent_count, 0)     AS sent_count,
          COALESCE(q.failed_count, 0)   AS failed_count,
          COALESCE(q.total_queued, 0)   AS total_queued
        FROM shopify_campaigns sc
        LEFT JOIN (
          SELECT
            campaign_id,
            COUNT(*) FILTER (WHERE status = 'pending')  AS pending_count,
            COUNT(*) FILTER (WHERE status = 'sending')  AS sending_count,
            COUNT(*) FILTER (WHERE status = 'sent')     AS sent_count,
            COUNT(*) FILTER (WHERE status = 'failed')   AS failed_count,
            COUNT(*)                                     AS total_queued
          FROM campaign_message_queue
          WHERE campaign_id IS NOT NULL
          GROUP BY campaign_id
        ) q ON q.campaign_id = sc.id
        WHERE sc.created_at > NOW() - INTERVAL '7 days'
           OR sc.status IN ('running', 'queued')
        ORDER BY sc.created_at DESC
        LIMIT 30
      `),
      /* Orphaned messages (no campaign_id) — legacy campaigns started before tracking */
      db.execute<{
        pending_count: string; sending_count: string; sent_count: string;
        failed_count: string; total_queued: string; oldest_created: string;
      }>(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')  AS pending_count,
          COUNT(*) FILTER (WHERE status = 'sending')  AS sending_count,
          COUNT(*) FILTER (WHERE status = 'sent')     AS sent_count,
          COUNT(*) FILTER (WHERE status = 'failed')   AS failed_count,
          COUNT(*)                                     AS total_queued,
          MIN(created_at)                              AS oldest_created
        FROM campaign_message_queue
        WHERE campaign_id IS NULL
          AND created_at > NOW() - INTERVAL '7 days'
      `),
    ]);

    const orphaned = ((orphanedRow.rows ?? orphanedRow) as any[])[0] ?? {};
    const campaigns = (campaignRows.rows ?? campaignRows) as any[];

    res.json({
      campaigns,
      orphaned: {
        pending: Number(orphaned.pending_count ?? 0),
        sending: Number(orphaned.sending_count ?? 0),
        sent: Number(orphaned.sent_count ?? 0),
        failed: Number(orphaned.failed_count ?? 0),
        total: Number(orphaned.total_queued ?? 0),
        oldestCreated: orphaned.oldest_created ?? null,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch live campaign stats" });
  }
});

/* ── Campaign message logs (per campaign) ── */
router.get("/admin/shopify/campaigns/:id/logs", adminMiddleware, async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    if (isNaN(campaignId)) return res.status(400).json({ error: "Invalid campaign id" });
    const [campaign] = await db.select().from(shopifyCampaignsTable)
      .where(eq(shopifyCampaignsTable.id, campaignId)).limit(1);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const logs = await db.execute<{
      id: number; status: string; customer_name: string | null; phone: string | null;
      email: string | null; sent_at: string | null; error_message: string | null;
      created_at: string; retries: number; campaign_type: string;
    }>(sql`
      SELECT id, status, customer_name, phone, email, sent_at, error_message, created_at, retries, campaign_type
      FROM campaign_message_queue
      WHERE campaign_id = ${campaignId}
      ORDER BY created_at DESC
      LIMIT 500
    `);

    res.json({
      campaign,
      logs: (logs.rows ?? logs) as any[],
      summary: {
        total: Number((logs.rows ?? logs as any[]).length),
        sent: (logs.rows ?? logs as any[]).filter((r: any) => r.status === "sent").length,
        failed: (logs.rows ?? logs as any[]).filter((r: any) => r.status === "failed").length,
        pending: (logs.rows ?? logs as any[]).filter((r: any) => r.status === "pending").length,
        sending: (logs.rows ?? logs as any[]).filter((r: any) => r.status === "sending").length,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch campaign logs" });
  }
});

router.post("/admin/shopify/campaigns", adminMiddleware, async (req, res) => {
  try {
    const {
      name, message, imageUrl, targetSegment, minOrderCount, minTotalSpent,
      includeAbandoned, discountCode, discountMessage, productIds,
      buttonShopNow, buttonViewProduct, buttonApplyDiscount, shopNowUrl, viewProductUrl,
    } = req.body;
    const [campaign] = await db.insert(shopifyCampaignsTable).values({
      name, message, imageUrl: imageUrl ?? null,
      targetSegment: targetSegment ?? "all",
      minOrderCount: minOrderCount ?? null,
      minTotalSpent: minTotalSpent ?? null,
      includeAbandoned: includeAbandoned ?? false,
      discountCode: discountCode ?? null,
      discountMessage: discountMessage ?? null,
      productIds: productIds ?? null,
      buttonShopNow: buttonShopNow ?? false,
      buttonViewProduct: buttonViewProduct ?? false,
      buttonApplyDiscount: buttonApplyDiscount ?? false,
      shopNowUrl: shopNowUrl ?? null,
      viewProductUrl: viewProductUrl ?? null,
      status: "draft",
    }).returning();
    res.json(campaign);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.put("/admin/shopify/campaigns/:id", adminMiddleware, async (req, res) => {
  try {
    const {
      name, message, imageUrl, targetSegment, minOrderCount, minTotalSpent,
      includeAbandoned, discountCode, discountMessage, productIds,
      buttonShopNow, buttonViewProduct, buttonApplyDiscount, shopNowUrl, viewProductUrl, scheduledAt,
    } = req.body;
    const [campaign] = await db.update(shopifyCampaignsTable).set({
      name, message, imageUrl: imageUrl ?? null,
      targetSegment: targetSegment ?? "all",
      minOrderCount: minOrderCount ?? null,
      minTotalSpent: minTotalSpent ?? null,
      includeAbandoned: includeAbandoned ?? false,
      discountCode: discountCode ?? null,
      discountMessage: discountMessage ?? null,
      productIds: productIds ?? null,
      buttonShopNow: buttonShopNow ?? false,
      buttonViewProduct: buttonViewProduct ?? false,
      buttonApplyDiscount: buttonApplyDiscount ?? false,
      shopNowUrl: shopNowUrl ?? null,
      viewProductUrl: viewProductUrl ?? null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      updatedAt: new Date(),
    }).where(eq(shopifyCampaignsTable.id, parseInt(req.params.id))).returning();
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    res.json(campaign);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

router.delete("/admin/shopify/campaigns/:id", adminMiddleware, async (req, res) => {
  try {
    await db.delete(shopifyCampaignsTable).where(eq(shopifyCampaignsTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

router.post("/admin/shopify/campaigns/:id/send", adminMiddleware, async (req, res) => {
  try {
    const { spreadHours } = req.body as { spreadHours?: number };
    const [campaign] = await db.select().from(shopifyCampaignsTable)
      .where(eq(shopifyCampaignsTable.id, parseInt(req.params.id))).limit(1);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    await db.update(shopifyCampaignsTable)
      .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(shopifyCampaignsTable.id, campaign.id));

    /* Build customer filter */
    const conditions: any[] = [sql`phone is not null`];
    if (campaign.targetSegment === "vip") conditions.push(gte(shopifyCustomersTable.totalSpent, "15000"));
    else if (campaign.targetSegment === "high_value") conditions.push(gte(shopifyCustomersTable.totalSpent, "5000"));
    else if (campaign.targetSegment === "repeat") conditions.push(gte(shopifyCustomersTable.totalOrders, 2));
    else if (campaign.targetSegment === "new") conditions.push(eq(shopifyCustomersTable.totalOrders, 1));
    else if (campaign.targetSegment === "one_time") {
      const d30 = new Date(Date.now() - 30 * 864e5);
      conditions.push(eq(shopifyCustomersTable.totalOrders, 1));
      conditions.push(sql`(last_order_at IS NULL OR last_order_at < ${d30.toISOString()})`);
    } else if (campaign.targetSegment === "at_risk") {
      const d30 = new Date(Date.now() - 30 * 864e5);
      const d90 = new Date(Date.now() - 90 * 864e5);
      conditions.push(gte(shopifyCustomersTable.totalOrders, 2));
      conditions.push(sql`last_order_at < ${d30.toISOString()}`);
      conditions.push(sql`last_order_at >= ${d90.toISOString()}`);
    } else if (campaign.targetSegment === "lost") {
      const d180 = new Date(Date.now() - 180 * 864e5);
      conditions.push(sql`(last_order_at IS NULL OR last_order_at < ${d180.toISOString()})`);
    } else if (campaign.targetSegment === "inactive_60d") {
      const d60 = new Date(Date.now() - 60 * 864e5);
      conditions.push(sql`(last_order_at IS NULL OR last_order_at < ${d60.toISOString()})`);
    }
    if (campaign.minOrderCount) conditions.push(gte(shopifyCustomersTable.totalOrders, campaign.minOrderCount));
    if (campaign.minTotalSpent) conditions.push(gte(shopifyCustomersTable.totalSpent, String(campaign.minTotalSpent)));

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];
    const customers = await db.select({
      id: shopifyCustomersTable.id, firstName: shopifyCustomersTable.firstName, phone: shopifyCustomersTable.phone,
    }).from(shopifyCustomersTable).where(where);

    /* Compose message per customer and enqueue */
    const queued = await enqueueCampaignMessages({
      campaignId: campaign.id,
      campaignType: "whatsapp",
      spreadHours: spreadHours ?? 0,
      messages: customers.map(c => {
        let text = campaign.message;
        text = text.replace(/\{name\}/gi, c.firstName ?? "there");
        text = text.replace(/\{first_name\}/gi, c.firstName ?? "there");
        if (campaign.discountCode) text += `\n\n🎁 Use code: *${campaign.discountCode}*`;
        if (campaign.discountMessage) text += `\n${campaign.discountMessage}`;
        const btns: string[] = [];
        if (campaign.buttonShopNow && campaign.shopNowUrl) btns.push(`🛒 Shop Now: ${campaign.shopNowUrl}`);
        if (campaign.buttonViewProduct && campaign.viewProductUrl) btns.push(`👁 View Product: ${campaign.viewProductUrl}`);
        if (campaign.buttonApplyDiscount && campaign.discountCode) btns.push(`💰 Apply Code: ${campaign.discountCode}`);
        if (btns.length) text += "\n\n" + btns.join("\n");
        return { customerId: c.id, customerName: c.firstName ?? undefined, phone: c.phone ?? undefined, message: text };
      }),
    });

    /* Mark campaign as queued; queue processor updates sent/failed counts as messages go out */
    await db.update(shopifyCampaignsTable).set({
      status: "queued", updatedAt: new Date(),
    }).where(eq(shopifyCampaignsTable.id, campaign.id));

    req.log.info({ queued, campaignId: campaign.id, spreadHours }, "Campaign messages enqueued");
    res.json({ success: true, targeting: customers.length, queued });
  } catch (err) {
    req.log.error(err);
    if (!res.headersSent) res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════
   CSV IMPORT
══════════════════════════════════════════════════════ */

router.post("/admin/shopify/customers/import", adminMiddleware, async (req, res) => {
  try {
    const { customers } = req.body as { customers: Array<{
      firstName?: string; lastName?: string; email?: string; phone?: string;
      city?: string; country?: string; totalOrders?: number; totalSpent?: string;
    }> };
    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({ error: "No customers provided" });
    }
    let imported = 0; let skipped = 0;
    for (const c of customers) {
      if (!c.email && !c.phone) { skipped++; continue; }
      const uniqueId = `csv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        await db.insert(shopifyCustomersTable).values({
          storeId: 0,
          shopifyCustomerId: uniqueId,
          firstName: c.firstName ?? null,
          lastName: c.lastName ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          city: c.city ?? null,
          country: c.country ?? "Pakistan",
          totalOrders: c.totalOrders ?? 0,
          totalSpent: c.totalSpent ?? "0",
          source: "csv",
          syncedAt: new Date(),
        });
        imported++;
      } catch { skipped++; }
    }
    res.json({ success: true, imported, skipped });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════
   EMAIL CAMPAIGNS
══════════════════════════════════════════════════════ */

async function getMailTransport() {
  const [s] = await db.select().from(emailSettingsTable).limit(1);
  if (!s?.emailEnabled || !s.smtpHost || !s.smtpUser || !s.smtpPass) return null;
  return {
    transport: nodemailer.createTransport({ host: s.smtpHost, port: s.smtpPort, secure: s.smtpPort === 465, auth: { user: s.smtpUser, pass: s.smtpPass } }),
    from: `${s.smtpFrom || "KDF NUTS"} <${s.smtpUser}>`,
    settings: s,
  };
}

function buildCampaignHtml(c: any, customer: { firstName?: string | null; lastName?: string | null }): string {
  const name = customer.firstName ?? "Valued Customer";
  const body = (c.bodyText ?? "").replace(/\{name\}/gi, name).replace(/\{first_name\}/gi, name);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%">
${c.bannerImageUrl ? `<tr><td><img src="${c.bannerImageUrl}" width="600" style="width:100%;display:block;max-height:240px;object-fit:cover" alt="Banner"></td></tr>` : ""}
<tr><td style="background:linear-gradient(135deg,#5FA800,#4d8a00);padding:24px 40px;text-align:center">
<h1 style="margin:0;color:#fff;font-size:26px;font-weight:900">${c.fromName || "KDF NUTS"}</h1>
<p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px">Pakistan's Premium Dry Fruits Store</p>
</td></tr>
<tr><td style="padding:32px 40px">
${c.headline ? `<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;font-weight:800">${c.headline}</h2>` : ""}
<div style="color:#555;font-size:15px;line-height:1.7;white-space:pre-wrap">${body}</div>
${(c.productTitle || c.productImageUrl) ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #eee;border-radius:10px;overflow:hidden">
<tr>${c.productImageUrl ? `<td width="140"><img src="${c.productImageUrl}" width="140" height="140" style="display:block;object-fit:cover" alt="Product"></td>` : ""}
<td style="padding:16px 20px;vertical-align:top">
${c.productTitle ? `<p style="margin:0 0 6px;font-weight:800;font-size:16px;color:#1a1a1a">${c.productTitle}</p>` : ""}
${c.productUrl ? `<a href="${c.productUrl}" style="color:#5FA800;font-size:13px;text-decoration:none">View Product →</a>` : ""}
</td></tr></table>` : ""}
${c.discountCode ? `<div style="background:linear-gradient(135deg,#fff8f0,#fff3e0);border:2px dashed #F58300;border-radius:12px;padding:20px;text-align:center;margin:24px 0">
<p style="margin:0 0 8px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px">Special Offer</p>
${c.discountMessage ? `<p style="margin:0 0 12px;font-size:16px;color:#1a1a1a;font-weight:600">${c.discountMessage}</p>` : ""}
<p style="margin:0;font-size:28px;font-weight:900;color:#F58300;font-family:monospace;letter-spacing:3px">${c.discountCode}</p>
</div>` : ""}
${(c.ctaButtonText && c.ctaButtonUrl) ? `<div style="text-align:center;margin:28px 0 16px"><a href="${c.ctaButtonUrl}" style="display:inline-block;background:#5FA800;color:#fff;font-weight:700;font-size:16px;padding:14px 40px;border-radius:8px;text-decoration:none">${c.ctaButtonText}</a></div>` : ""}
${(c.ctaButton2Text && c.ctaButton2Url) ? `<div style="text-align:center;margin:0 0 16px"><a href="${c.ctaButton2Url}" style="display:inline-block;background:#F58300;color:#fff;font-weight:700;font-size:15px;padding:12px 32px;border-radius:8px;text-decoration:none">${c.ctaButton2Text}</a></div>` : ""}
</td></tr>
${c.footerText ? `<tr><td style="background:#f8f9fa;padding:16px 40px;text-align:center;border-top:1px solid #eee"><p style="margin:0;color:#aaa;font-size:12px">${c.footerText}</p></td></tr>` : ""}
</table></td></tr></table></body></html>`;
}

router.get("/admin/shopify/email-campaigns", adminMiddleware, async (req, res) => {
  try {
    const items = await db.select().from(shopifyEmailCampaignsTable).orderBy(desc(shopifyEmailCampaignsTable.createdAt));
    res.json(items);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed to fetch" }); }
});

router.post("/admin/shopify/email-campaigns", adminMiddleware, async (req, res) => {
  try {
    const [campaign] = await db.insert(shopifyEmailCampaignsTable).values({
      ...req.body,
      status: "draft",
      scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
    }).returning();
    res.json(campaign);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed to create" }); }
});

router.put("/admin/shopify/email-campaigns/:id", adminMiddleware, async (req, res) => {
  try {
    const [campaign] = await db.update(shopifyEmailCampaignsTable).set({
      ...req.body,
      scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
      updatedAt: new Date(),
    }).where(eq(shopifyEmailCampaignsTable.id, parseInt(req.params.id))).returning();
    if (!campaign) return res.status(404).json({ error: "Not found" });
    res.json(campaign);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed to update" }); }
});

router.delete("/admin/shopify/email-campaigns/:id", adminMiddleware, async (req, res) => {
  try {
    await db.delete(shopifyEmailLogsTable).where(eq(shopifyEmailLogsTable.campaignId, parseInt(req.params.id)));
    await db.delete(shopifyEmailCampaignsTable).where(eq(shopifyEmailCampaignsTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed to delete" }); }
});

router.get("/admin/shopify/email-campaigns/:id/logs", adminMiddleware, async (req, res) => {
  try {
    const logs = await db.select().from(shopifyEmailLogsTable)
      .where(eq(shopifyEmailLogsTable.campaignId, parseInt(req.params.id)))
      .orderBy(desc(shopifyEmailLogsTable.createdAt)).limit(500);
    res.json(logs);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed to fetch logs" }); }
});

router.post("/admin/shopify/email-campaigns/ai-generate", adminMiddleware, async (req, res) => {
  try {
    const [aiSettings] = await db.select().from(aiSettingsTable).limit(1);
    if (!aiSettings?.openaiApiKey || !aiSettings.aiEnabled) {
      return res.status(503).json({ error: "AI not configured. Enable it in the AI Content settings." });
    }
    const { name, headline, bodyText, discountCode } = req.body;
    const openai = new OpenAI({ apiKey: aiSettings.openaiApiKey });
    const prompt = `Write a professional marketing email for a Pakistani nuts & dry fruits store called KDF NUTS.
Campaign: "${name || "Seasonal Sale"}"
${headline ? `Current headline: ${headline}` : ""}
${bodyText ? `Current body text: ${bodyText}` : ""}
${discountCode ? `Discount code: ${discountCode}` : ""}

Return JSON with: subject (email subject line), headline (short catchy headline), bodyText (2-3 paragraph email body using {name} for personalization), ctaButtonText (call-to-action button text).
Be enthusiastic but professional. Target Pakistani audience. Use PKR currency references if needed.`;

    const response = await openai.chat.completions.create({
      model: aiSettings.openaiModel ?? "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 800,
    });
    const result = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    res.json(result);
  } catch (err) { req.log.error(err); res.status(500).json({ error: String(err) }); }
});

router.post("/admin/shopify/email-campaigns/:id/send", adminMiddleware, async (req, res) => {
  try {
    const [campaign] = await db.select().from(shopifyEmailCampaignsTable)
      .where(eq(shopifyEmailCampaignsTable.id, parseInt(req.params.id))).limit(1);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const conn = await getMailTransport();
    if (!conn) return res.status(503).json({ error: "SMTP not configured. Set up email in Email Settings first." });

    const conditions: any[] = [];
    if (campaign.targetSegment === "high_value") conditions.push(gte(shopifyCustomersTable.totalSpent, "5000"));
    else if (campaign.targetSegment === "repeat") conditions.push(gte(shopifyCustomersTable.totalOrders, 2));
    else if (campaign.targetSegment === "new") conditions.push(eq(shopifyCustomersTable.totalOrders, 1));
    if (campaign.minOrderCount) conditions.push(gte(shopifyCustomersTable.totalOrders, campaign.minOrderCount));
    if (campaign.minTotalSpent) conditions.push(gte(shopifyCustomersTable.totalSpent, String(campaign.minTotalSpent)));

    const emailCustomers = (await db.select().from(shopifyCustomersTable).where(
      conditions.length > 1 ? and(...conditions) : conditions[0]
    )).filter(c => c.email && c.email.includes("@"));

    await db.update(shopifyEmailCampaignsTable).set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(shopifyEmailCampaignsTable.id, campaign.id));

    res.json({ success: true, targeting: emailCustomers.length });

    let sent = 0; let failed = 0;
    for (const customer of emailCustomers) {
      try {
        const html = buildCampaignHtml(campaign, { firstName: customer.firstName, lastName: customer.lastName });
        await conn.transport.sendMail({
          from: conn.from,
          to: customer.email!,
          subject: campaign.subject,
          html,
        });
        await db.insert(shopifyEmailLogsTable).values({
          campaignId: campaign.id, customerId: customer.id,
          email: customer.email!, customerName: [customer.firstName, customer.lastName].filter(Boolean).join(" ") || null,
          status: "sent", sentAt: new Date(),
        });
        sent++;
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        failed++;
        await db.insert(shopifyEmailLogsTable).values({
          campaignId: campaign.id, customerId: customer.id,
          email: customer.email!, status: "failed",
          errorMessage: String(e).slice(0, 500),
        }).catch(() => {});
      }
    }
    await db.update(shopifyEmailCampaignsTable).set({
      status: "completed", completedAt: new Date(),
      totalSent: sent, totalDelivered: sent, totalFailed: failed, updatedAt: new Date(),
    }).where(eq(shopifyEmailCampaignsTable.id, campaign.id));
  } catch (err) {
    req.log.error(err);
    if (!res.headersSent) res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════
   ENHANCED STATS (with email + cost tracking)
══════════════════════════════════════════════════════ */

router.get("/admin/shopify/analytics", adminMiddleware, async (req, res) => {
  try {
    const [store] = await db.select().from(shopifyStoresTable).limit(1);
    const [orderCount] = await db.select({ count: sql<number>`count(*)` }).from(shopifyOrdersTable);
    const [customerCount] = await db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable);
    const [emailCustomerCount] = await db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable)
      .where(sql`email IS NOT NULL AND email != ''`);
    const [phoneCustomerCount] = await db.select({ count: sql<number>`count(*)` }).from(shopifyCustomersTable)
      .where(sql`phone IS NOT NULL AND phone != ''`);
    const [productCount] = await db.select({ count: sql<number>`count(*)` }).from(shopifyProductsTable);
    const [waCampaignCount] = await db.select({ count: sql<number>`count(*)` }).from(shopifyCampaignsTable);
    const [emailCampaignCount] = await db.select({ count: sql<number>`count(*)` }).from(shopifyEmailCampaignsTable);
    const [revenue] = await db.select({ total: sql<string>`coalesce(sum(total_price), 0)` }).from(shopifyOrdersTable);
    const [waSent] = await db.select({ count: sql<number>`coalesce(sum(total_sent), 0)` }).from(shopifyCampaignsTable);
    const [emailSent] = await db.select({ count: sql<number>`coalesce(sum(total_sent), 0)` }).from(shopifyEmailCampaignsTable);
    const [emailDelivered] = await db.select({ count: sql<number>`coalesce(sum(total_delivered), 0)` }).from(shopifyEmailCampaignsTable);
    const [emailOpened] = await db.select({ count: sql<number>`coalesce(sum(total_opened), 0)` }).from(shopifyEmailCampaignsTable);
    const [emailFailed] = await db.select({ count: sql<number>`coalesce(sum(total_failed), 0)` }).from(shopifyEmailCampaignsTable);

    const waMessages = Number(waSent?.count ?? 0);
    const estimatedWaCostUsd = waMessages * 0.015;

    const recentEmailCampaigns = await db.select().from(shopifyEmailCampaignsTable)
      .orderBy(desc(shopifyEmailCampaignsTable.createdAt)).limit(5);
    const recentWaCampaigns = await db.select().from(shopifyCampaignsTable)
      .orderBy(desc(shopifyCampaignsTable.createdAt)).limit(5);
    const recentOrders = await db.select().from(shopifyOrdersTable).orderBy(desc(shopifyOrdersTable.shopifyCreatedAt)).limit(5);

    res.json({
      store: store ?? null,
      customers: { total: Number(customerCount?.count ?? 0), withEmail: Number(emailCustomerCount?.count ?? 0), withPhone: Number(phoneCustomerCount?.count ?? 0) },
      orders: Number(orderCount?.count ?? 0),
      products: Number(productCount?.count ?? 0),
      revenue: revenue?.total ?? "0",
      waCampaigns: Number(waCampaignCount?.count ?? 0),
      emailCampaigns: Number(emailCampaignCount?.count ?? 0),
      email: { sent: Number(emailSent?.count ?? 0), delivered: Number(emailDelivered?.count ?? 0), opened: Number(emailOpened?.count ?? 0), failed: Number(emailFailed?.count ?? 0) },
      whatsapp: { sent: waMessages, estimatedCostUsd: parseFloat(estimatedWaCostUsd.toFixed(2)) },
      recentEmailCampaigns, recentWaCampaigns, recentOrders,
    });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed to fetch analytics" }); }
});

/* ═══════════════════════════════════════════════════════
   AUTO-SYNC MONITORING (admin-authenticated)
══════════════════════════════════════════════════════ */

/* GET auto-sync status + telemetry */
router.get("/admin/shopify/auto-sync/status", adminMiddleware, async (req, res) => {
  try {
    const syncState = getAutoSyncStatus();
    const [store] = await db.select({
      id: shopifyStoresTable.id,
      shopDomain: shopifyStoresTable.shopDomain,
      isConnected: shopifyStoresTable.isConnected,
      lastOrderSync: shopifyStoresTable.lastOrderSync,
      lastCustomerSync: shopifyStoresTable.lastCustomerSync,
      lastProductSync: shopifyStoresTable.lastProductSync,
      totalOrdersSynced: shopifyStoresTable.totalOrdersSynced,
      totalCustomersSynced: shopifyStoresTable.totalCustomersSynced,
      totalProductsSynced: shopifyStoresTable.totalProductsSynced,
      syncOrders: shopifyStoresTable.syncOrders,
      syncCustomers: shopifyStoresTable.syncCustomers,
      syncProducts: shopifyStoresTable.syncProducts,
    }).from(shopifyStoresTable).where(eq(shopifyStoresTable.isConnected, true)).limit(1);

    /* recent webhook events */
    const recentWebhooks = await db
      .select()
      .from(shopifyWebhookLogsTable)
      .orderBy(desc(shopifyWebhookLogsTable.receivedAt))
      .limit(10);

    /* recent sync jobs */
    const recentJobs = await db
      .select()
      .from(syncJobsTable)
      .where(eq(syncJobsTable.integrationType, "shopify"))
      .orderBy(desc(syncJobsTable.createdAt))
      .limit(10);

    res.json({
      autoSync: syncState,
      store: store ?? null,
      recentWebhooks,
      recentJobs,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* POST trigger immediate auto-sync */
router.post("/admin/shopify/auto-sync/trigger", adminMiddleware, async (req, res) => {
  try {
    const store = await getActiveStore();
    if (!store) return res.status(400).json({ error: "No connected Shopify store" });
    triggerImmediateSync();
    res.json({ success: true, message: "Incremental sync triggered — running in background" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* GET webhook logs */
router.get("/admin/shopify/auto-sync/logs", adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string || "50"));
    const logs = await db
      .select()
      .from(shopifyWebhookLogsTable)
      .orderBy(desc(shopifyWebhookLogsTable.receivedAt))
      .limit(limit);
    res.json(logs);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════
   WEBHOOK REGISTRATION (admin-authenticated)
══════════════════════════════════════════════════════ */

/* GET list registered webhooks on Shopify */
router.get("/admin/shopify/webhooks/list", adminMiddleware, async (req, res) => {
  try {
    const store = await getActiveStore();
    if (!store) return res.status(400).json({ error: "No connected Shopify store" });
    const webhooks = await listShopifyWebhooks(store);
    res.json({ webhooks });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* POST register all required webhooks */
router.post("/admin/shopify/webhooks/register", adminMiddleware, async (req, res) => {
  try {
    const store = await getActiveStore();
    if (!store) return res.status(400).json({ error: "No connected Shopify store" });

    const baseUrl = resolveShopifyWebhookCallbackBase(req);

    const result = await registerShopifyWebhooks(store, baseUrl);
    res.json({ success: true, callbackUrl: `${baseUrl}/api/shopify/webhook`, ...result });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════
   COURIER → SHOPIFY FULFILLMENT SYNC
══════════════════════════════════════════════════════ */

/* POST push tracking number to Shopify as fulfillment */
router.post("/admin/shopify/orders/:shopifyOrderId/fulfill", adminMiddleware, async (req, res) => {
  try {
    const store = await getActiveStore();
    if (!store) return res.status(400).json({ error: "No connected Shopify store" });
    const { shopifyOrderId } = req.params;
    const { trackingNumber, trackingCompany } = req.body;
    if (!trackingNumber) return res.status(400).json({ error: "trackingNumber is required" });

    const result = await pushFulfillmentToShopify(store, shopifyOrderId, trackingNumber, trackingCompany ?? "TCS");

    if (result.success) {
      await db.update(shopifyOrdersTable)
        .set({ trackingNumber, fulfillmentStatus: "fulfilled", updatedAt: new Date() })
        .where(eq(shopifyOrdersTable.shopifyOrderId, shopifyOrderId));
    }

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════
   SHOPIFY ORDER COURIER BOOKING SYSTEM
══════════════════════════════════════════════════════ */

/* GET shipments for a shopify order */
router.get("/admin/shopify/orders/:id/shipments", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [order] = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const shipments = await db.select().from(shipmentsTable)
      .where(eq(shipmentsTable.shopifyOrderId, order.shopifyOrderId))
      .orderBy(desc(shipmentsTable.createdAt));

    const couriers = await db.select().from(couriersTable);
    const enriched = shipments.map(s => ({
      ...s,
      courierName: couriers.find(c => c.id === s.courierId)?.name ?? s.courierSlug?.toUpperCase() ?? "—",
    }));

    res.json(enriched);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* POST book courier for a shopify order */
router.post("/admin/shopify/orders/:id/book-courier", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [order] = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const {
      courierSlug,
      weight = 0.5,
      pieces = 1,
      codAmount,
      contentDesc = "KDF Nuts Products",
      serviceCode = "O",
      specialInstructions = "",
      notifyWhatsapp = true,
      postexOrderType = "Normal",
      customerName,
      customerPhone,
      customerAddress,
      customerCity,
    } = req.body;

    if (!courierSlug) return res.status(400).json({ error: "courierSlug is required" });

    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, courierSlug)).limit(1);
    if (!courierRow) return res.status(404).json({ error: `Courier "${courierSlug}" not configured` });

    const addr = (order.shippingAddress as any) ?? {};
    const resolvedName    = customerName    ?? addr.name    ?? order.customerName    ?? "";
    const resolvedPhone   = customerPhone   ?? addr.phone   ?? order.customerPhone   ?? "";
    const resolvedAddress = customerAddress ?? addr.address1 ?? addr.address ?? "";
    const resolvedCity    = customerCity    ?? addr.city    ?? "";
    const resolvedCod     = codAmount !== undefined ? Number(codAmount) : Number(order.totalPrice ?? 0);
    const isCod           = resolvedCod > 0;
    const items: any[]    = Array.isArray(order.lineItems) ? order.lineItems : [];

    const fakeOrder: Record<string, any> = {
      id: order.id,
      orderNumber: order.orderNumber,
      paymentMethod: isCod ? "cod" : "online",
      total: resolvedCod,
      notes: specialInstructions,
      items: items.map((li: any) => ({ name: li.title ?? li.name, qty: li.quantity ?? 1, price: Number(li.price ?? 0) })),
      shippingAddress: { name: resolvedName, phone: resolvedPhone, address: resolvedAddress, city: resolvedCity, email: order.customerEmail ?? "" },
      courier: courierSlug,
      weight,
      pieces,
      fragile: false,
      contentDesc,
      specialInstructions,
      postexOrderType,
      invoiceAmount: resolvedCod,
    };

    const settings = (courierRow.settings ?? {}) as Record<string, any>;
    const hasApiCreds = courierSlug === "tcs"
      ? !!(settings.accessToken || settings.bearerToken || (settings.username && settings.password))
      : !!(courierRow.apiKey && courierRow.apiEndpoint);

    /* ── STRICT: Never fake a booking. If no API creds, tell the admin. ── */
    if (!hasApiCreds) {
      return res.status(422).json({
        error: `Courier API not configured for ${courierRow.name}. Go to Courier Settings → Integrations to add API credentials.`,
        notConfigured: true,
        courierName: courierRow.name,
        courierSlug,
      });
    }

    /* ── Make the REAL API call — no silent fallback ── */
    let trackingId: string;
    let rawResponse: Record<string, any> = {};
    const apiStart = Date.now();

    try {
      const { callCourierApiForShopify } = await import("./couriers.js");
      const result = await callCourierApiForShopify(courierRow, fakeOrder, serviceCode);
      trackingId = result.trackingId;
      rawResponse = {
        ...result.rawResponse,
        realApiBooking: true,
        apiCallDurationMs: Date.now() - apiStart,
        bookedAt: new Date().toISOString(),
        courier: courierSlug,
        trackingUrl: result.trackingUrl,
        customerName: resolvedName,
        customerPhone: resolvedPhone,
        customerCity: resolvedCity,
      };
    } catch (apiErr: any) {
      /* Real API failed — return the actual error, never fake a tracking ID */
      req.log.warn({ err: apiErr, courierSlug, orderId: id }, "Courier API booking failed");
      return res.status(422).json({
        error: apiErr.message ?? "Courier API booking failed",
        apiError: true,
        courierName: courierRow.name,
        courierSlug,
        durationMs: Date.now() - apiStart,
      });
    }

    const now = new Date().toISOString();
    const [shipment] = await db.insert(shipmentsTable).values({
      orderId: order.id,
      courierId: courierRow.id,
      courierSlug,
      trackingId,
      status: "pending",
      statusHistory: [{ status: "pending", timestamp: now, note: "Shipment booked from Shopify Orders" }],
      weight: String(weight),
      shopifyOrderId: order.shopifyOrderId,
      shopifyOrderNumber: order.orderNumber,
      customerName: resolvedName,
      customerPhone: resolvedPhone,
      customerAddress: resolvedAddress,
      customerCity: resolvedCity,
      codAmount: String(resolvedCod),
      pieces,
      contentDesc,
      serviceCode,
      specialInstructions,
      isCod,
      codStatus: "pending",
      notifyWhatsapp,
      bookingSource: "shopify",
      rawResponse,
    } as any).returning();

    /* Update shopify order with tracking number */
    await db.update(shopifyOrdersTable).set({
      trackingNumber: trackingId,
      status: "fulfilled",
      updatedAt: new Date(),
    }).where(eq(shopifyOrdersTable.id, id));

    /* Push to Shopify if connected */
    try {
      const store = await getActiveStore();
      if (store && trackingId) {
        await pushFulfillmentToShopify(store, order.shopifyOrderId, trackingId, courierRow.name);
        await db.update(shopifyOrdersTable).set({ fulfillmentStatus: "fulfilled", updatedAt: new Date() })
          .where(eq(shopifyOrdersTable.id, id));
      }
    } catch { /* non-fatal */ }

    /* WhatsApp notification — use order_shipped template, fallback to plain text */
    if (notifyWhatsapp && resolvedPhone) {
      try {
        const phone = normalizePhone(resolvedPhone);
        const { sendOrderStatusUpdate } = await import("../lib/whatsapp.js");
        const templateSent = await sendOrderStatusUpdate({
          phone,
          orderNumber: order.orderNumber ?? "",
          status: "shipped",
          trackingId,
        }).catch(() => false);

        if (!templateSent) {
          const courierNames: Record<string, string> = { tcs: "TCS Couriers", postex: "PostEx", leopards: "Leopards", trax: "Trax" };
          const cName = courierNames[courierSlug] ?? courierSlug.toUpperCase();
          const trackingUrl = (rawResponse as any).trackingUrl ?? "";
          const trackLine = trackingUrl ? `\n\n🔗 Track Live: ${trackingUrl}` : "";
          const msg = `Hi ${resolvedName}! 📦 Your KDF NUTS order *${order.orderNumber}* has been shipped via *${cName}*.\n\n🔍 Tracking ID: *${trackingId}*${trackLine}\n\n⏱ Expected delivery: 2-5 business days\n\nThank you for shopping with KDF NUTS! 🌿`;
          await sendWhatsAppMessage({ phone, message: msg }).catch(() => {});
        }
      } catch { /* non-fatal */ }
    }

    res.status(201).json({
      ...shipment,
      courierName: courierRow.name,
      apiBooking: true,
      durationMs: rawResponse.apiCallDurationMs,
      bookedAt: rawResponse.bookedAt,
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Booking failed" });
  }
});

/* POST cancel shipment for shopify order */
router.post("/admin/shopify/orders/:id/shipments/:shipmentId/cancel", adminMiddleware, async (req, res) => {
  try {
    const shipmentId = parseInt(req.params.shipmentId);
    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, shipmentId)).limit(1);
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });

    const history = [...(shipment.statusHistory ?? []), {
      status: "returned", timestamp: new Date().toISOString(), note: "Cancelled by admin",
    }];

    /* Try API cancel for PostEx */
    if (shipment.courierSlug === "postex" && shipment.trackingId) {
      try {
        const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.id, shipment.courierId!)).limit(1);
        if (courierRow?.apiKey && courierRow?.apiEndpoint) {
          await fetch(`${courierRow.apiEndpoint}/v1/cancel-order`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", token: courierRow.apiKey },
            body: JSON.stringify({ trackingNumber: shipment.trackingId }),
            signal: AbortSignal.timeout(10000),
          });
        }
      } catch { /* non-fatal */ }
    }

    const [updated] = await db.update(shipmentsTable).set({
      status: "returned",
      isCancelled: true,
      statusHistory: history,
      updatedAt: new Date(),
    } as any).where(eq(shipmentsTable.id, shipmentId)).returning();

    res.json({ ok: true, shipment: updated });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Cancel failed" });
  }
});

/* POST refresh tracking for a shipment */
router.post("/admin/shopify/orders/:id/shipments/:shipmentId/refresh", adminMiddleware, async (req, res) => {
  try {
    const shipmentId = parseInt(req.params.shipmentId);
    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, shipmentId)).limit(1);
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });

    const [courierRow] = shipment.courierId
      ? await db.select().from(couriersTable).where(eq(couriersTable.id, shipment.courierId)).limit(1)
      : [null];

    let newStatus = shipment.status;
    if (courierRow && shipment.trackingId) {
      try {
        const { trackWithCourierApiForShopify } = await import("./couriers.js");
        const result = await trackWithCourierApiForShopify(courierRow, shipment.trackingId);
        newStatus = result.status as any;
      } catch { /* keep current status */ }
    }

    const history = [...(shipment.statusHistory ?? [])];
    if (newStatus !== shipment.status) {
      history.push({ status: newStatus, timestamp: new Date().toISOString(), note: "Refreshed from courier API" });
    }

    const [updated] = await db.update(shipmentsTable).set({
      status: newStatus,
      statusHistory: history,
      lastTrackedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(shipmentsTable.id, shipmentId)).returning();

    /* Sync to Shopify if delivered */
    if (newStatus === "delivered" && shipment.shopifyOrderId) {
      await db.update(shopifyOrdersTable).set({ fulfillmentStatus: "fulfilled", status: "fulfilled", updatedAt: new Date() })
        .where(eq(shopifyOrdersTable.shopifyOrderId, shipment.shopifyOrderId));
    }

    res.json(updated);
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Refresh failed" });
  }
});

/* PATCH update COD status */
router.patch("/admin/shopify/orders/:id/shipments/:shipmentId/cod", adminMiddleware, async (req, res) => {
  try {
    const shipmentId = parseInt(req.params.shipmentId);
    const { codStatus } = req.body;
    const [updated] = await db.update(shipmentsTable).set({ codStatus, updatedAt: new Date() } as any)
      .where(eq(shipmentsTable.id, shipmentId)).returning();
    res.json(updated);
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Failed" });
  }
});

/* POST send tracking WhatsApp notification */
router.post("/admin/shopify/orders/:id/shipments/:shipmentId/notify", adminMiddleware, async (req, res) => {
  try {
    const shipmentId = parseInt(req.params.shipmentId);
    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, shipmentId)).limit(1);
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });

    const phone = (shipment as any).customerPhone;
    if (!phone) return res.status(400).json({ error: "No phone number on shipment" });

    const [order] = await db.select().from(shopifyOrdersTable)
      .where(eq(shopifyOrdersTable.shopifyOrderId, (shipment as any).shopifyOrderId ?? "")).limit(1);

    const [courierRow] = shipment.courierId
      ? await db.select().from(couriersTable).where(eq(couriersTable.id, shipment.courierId)).limit(1)
      : [null];

    const courierName = courierRow?.name ?? (shipment.courierSlug ?? "Courier").toUpperCase();
    const trackingId = shipment.trackingId ?? "—";
    const orderNum = (shipment as any).shopifyOrderNumber ?? order?.orderNumber ?? "—";
    const custName = (shipment as any).customerName ?? "Customer";

    const statusEmojis: Record<string, string> = {
      pending: "⏳", processing: "📦", shipped: "🚚", in_transit: "🛤️",
      out_for_delivery: "🏃", delivered: "✅", failed: "❌", returned: "↩️",
    };
    const emoji = statusEmojis[shipment.status] ?? "📦";

    const msg = req.body.message || `Hi ${custName}! ${emoji} Your KDF NUTS order *${orderNum}* update:\n\n*Courier:* ${courierName}\n*Tracking:* ${trackingId}\n*Status:* ${shipment.status.replace(/_/g, " ").toUpperCase()}\n\nThank you for shopping with us! 🌿`;

    await sendWhatsAppMessage({ phone: normalizePhone(phone), message: msg });
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Notification failed" });
  }
});

/* POST bulk book couriers for multiple shopify orders */
router.post("/admin/shopify/orders/bulk-book", adminMiddleware, async (req, res) => {
  try {
    const { orderIds, courierSlug, weight = 0.5, pieces = 1, serviceCode = "O", notifyWhatsapp = true } = req.body;
    if (!orderIds?.length || !courierSlug) return res.status(400).json({ error: "orderIds and courierSlug are required" });

    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, courierSlug)).limit(1);
    if (!courierRow) return res.status(404).json({ error: `Courier "${courierSlug}" not configured` });

    const results: { orderId: number; orderNumber: string; trackingId?: string; error?: string }[] = [];

    for (const orderId of orderIds) {
      try {
        const [order] = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.id, orderId)).limit(1);
        if (!order) { results.push({ orderId, orderNumber: "—", error: "Order not found" }); continue; }

        const addr = (order.shippingAddress as any) ?? {};
        const resolvedName    = addr.name    ?? order.customerName    ?? "";
        const resolvedPhone   = addr.phone   ?? order.customerPhone   ?? "";
        const resolvedAddress = addr.address1 ?? addr.address ?? "";
        const resolvedCity    = addr.city    ?? "";
        const resolvedCod     = Number(order.totalPrice ?? 0);
        const items: any[]    = Array.isArray(order.lineItems) ? order.lineItems : [];

        const fakeOrder: Record<string, any> = {
          id: order.id,
          orderNumber: order.orderNumber,
          paymentMethod: resolvedCod > 0 ? "cod" : "online",
          total: resolvedCod,
          items: items.map((li: any) => ({ name: li.title ?? li.name, qty: li.quantity ?? 1, price: Number(li.price ?? 0) })),
          shippingAddress: { name: resolvedName, phone: resolvedPhone, address: resolvedAddress, city: resolvedCity, email: order.customerEmail ?? "" },
          courier: courierSlug,
          weight,
          pieces,
        };

        const trackingId = generateShopifyTrackingId(courierSlug);
        const now = new Date().toISOString();

        await db.insert(shipmentsTable).values({
          orderId: order.id,
          courierId: courierRow.id,
          courierSlug,
          trackingId,
          status: "pending",
          statusHistory: [{ status: "pending", timestamp: now, note: "Bulk booking from Shopify Orders" }],
          weight: String(weight),
          shopifyOrderId: order.shopifyOrderId,
          shopifyOrderNumber: order.orderNumber,
          customerName: resolvedName,
          customerPhone: resolvedPhone,
          customerAddress: resolvedAddress,
          customerCity: resolvedCity,
          codAmount: String(resolvedCod),
          pieces,
          isCod: resolvedCod > 0,
          bookingSource: "shopify_bulk",
          rawResponse: { note: "Bulk booking — local tracking ID", fakeOrder },
        } as any);

        await db.update(shopifyOrdersTable).set({ trackingNumber: trackingId, status: "fulfilled", updatedAt: new Date() }).where(eq(shopifyOrdersTable.id, orderId));

        if (notifyWhatsapp && resolvedPhone) {
          try {
            const msg = `Hi ${resolvedName}! 📦 Your KDF NUTS order *${order.orderNumber}* has been shipped via *${courierRow.name}*.\n\n🔍 Tracking: *${trackingId}*\n\nThank you! 🌿`;
            await sendWhatsAppMessage({ phone: normalizePhone(resolvedPhone), message: msg });
          } catch { /* non-fatal */ }
        }

        results.push({ orderId, orderNumber: order.orderNumber, trackingId });
      } catch (e: any) {
        results.push({ orderId, orderNumber: "—", error: e.message });
      }
    }

    res.json({ ok: true, results, booked: results.filter(r => r.trackingId).length, failed: results.filter(r => r.error).length });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Bulk booking failed" });
  }
});

function generateShopifyTrackingId(slug: string): string {
  const prefix: Record<string, string> = { tcs: "TCS", leopards: "LP", postex: "PX", trax: "TX" };
  const p = prefix[slug] ?? "KDF";
  return `${p}${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
}

/* ═══════════════════════════════════════════════════════
   SHOPIFY WEBHOOK (public — HMAC-verified)
══════════════════════════════════════════════════════ */

router.post("/shopify/webhook", async (req, res) => {
  const topic = (req.headers["x-shopify-topic"] as string) ?? "unknown";
  const shopDomain = (req.headers["x-shopify-shop-domain"] as string) ?? "";
  const hmacHeader = (req.headers["x-shopify-hmac-sha256"] as string) ?? "";
  const rawBody: Buffer | undefined = (req as any).rawBody;
  const payload = req.body;

  try {
    /* 1. Look up store */
    const store = await findStoreByShopDomain(shopDomain);

    /* 2. HMAC verification — mandatory in production */
    const isProd = process.env.NODE_ENV === "production";
    if (!store) {
      await db.insert(shopifyWebhookLogsTable).values({
        storeId: null,
        topic: `UNKNOWN_SHOP:${topic}`,
        shopifyId: String(payload?.id ?? ""),
        payload: { shopDomain, normalizedShopDomain: normalizeShopDomain(shopDomain), payload },
        processed: false,
        error: "No configured Shopify store matched webhook shop domain",
      }).catch(() => {});
      return res.status(isProd ? 404 : 200).send(isProd ? "unknown shop" : "ok");
    }
    if (isProd && (!store?.webhookSecret || !rawBody || !hmacHeader)) {
      await db.insert(shopifyWebhookLogsTable).values({
        storeId: store.id,
        topic: `REJECTED:${topic}`,
        shopifyId: String(payload?.id ?? ""),
        payload: { reason: "missing_webhook_secret_or_hmac", shopDomain },
        processed: false,
        error: "Missing Shopify webhook secret/raw body/HMAC",
      }).catch(() => {});
      return res.status(401).send("missing hmac");
    }
    if (store?.webhookSecret && rawBody && hmacHeader) {
      const valid = verifyShopifyHmac(store.webhookSecret, rawBody, hmacHeader);
      if (!valid) {
        await db.insert(shopifyWebhookLogsTable).values({
          storeId: store?.id ?? null,
          topic: `REJECTED:${topic}`,
          shopifyId: String(payload?.id ?? ""),
          payload: { reason: "HMAC mismatch" },
          processed: false,
          error: "HMAC signature verification failed",
        }).catch(() => {});
        return res.status(401).send("invalid hmac");
      }
    } else if (isProd) {
      return res.status(401).send("missing hmac");
    }

    /* 3. Log webhook receipt */
    const [logRow] = await db.insert(shopifyWebhookLogsTable).values({
      storeId: store?.id ?? null,
      topic,
      shopifyId: String(payload?.id ?? ""),
      payload,
      processed: false,
    }).returning({ id: shopifyWebhookLogsTable.id }).catch(() => [{ id: undefined }] as any);

    /* 4. Acknowledge only after verification + durable log, then process asynchronously. */
    res.status(200).send("ok");
    setImmediate(() =>
      processShopifyWebhookPayload(topic, store, payload, logRow?.id).catch(async (err) => {
        await db.update(shopifyWebhookLogsTable)
          .set({ processed: false, error: err instanceof Error ? err.message : String(err) })
          .where(eq(shopifyWebhookLogsTable.id, logRow?.id ?? -1))
          .catch(() => {});
      }),
    );
  } catch (err) {
    req.log?.error(err, "Shopify webhook receipt failed before ack");
    if (!res.headersSent) res.status(500).send("webhook receipt failed");
  }
});

/* ═══════════════════════════════════════════════════════
   ONDRIVE LOGISTICS AUTOMATION ENGINE
══════════════════════════════════════════════════════ */

const ONDRIVE_BRAND = "OnDrive Logistics";

/* ── Raw SQL helpers (automation tables not in Drizzle schema yet) ── */
async function getAutomationSettings() {
  const res = await db.execute(sql`SELECT * FROM courier_automation_settings WHERE id = 1 LIMIT 1`);
  return (res.rows?.[0] ?? {}) as Record<string, any>;
}

async function getWeightRules() {
  const res = await db.execute(sql`SELECT * FROM courier_weight_rules ORDER BY id`);
  return (res.rows ?? []) as Record<string, any>[];
}

async function logAutomation(entry: Record<string, any>) {
  await db.execute(sql`
    INSERT INTO courier_automation_logs
      (shopify_order_id, shopify_order_number, action, courier_slug, tracking_id, rule_matched,
       recommended_courier, calculated_weight, cod_amount, status, error, details)
    VALUES (
      ${entry.shopifyOrderId ?? null}, ${entry.shopifyOrderNumber ?? null}, ${entry.action},
      ${entry.courierSlug ?? null}, ${entry.trackingId ?? null}, ${entry.ruleMatched ?? null},
      ${entry.recommendedCourier ?? null}, ${entry.calculatedWeight ?? null},
      ${entry.codAmount ?? null}, ${entry.status ?? "success"}, ${entry.error ?? null},
      ${JSON.stringify(entry.details ?? {})}
    )
  `).catch(() => {});
}

/* ── Weight calculation from line items ── */
function calculateOrderWeight(lineItems: any[], weightRules: Record<string, any>[]): number {
  if (!lineItems?.length) return 0.5;
  let total = 0;
  for (const li of lineItems) {
    const qty = Number(li.quantity ?? 1);
    /* Check if Shopify already has weight on variant */
    if (li.grams && Number(li.grams) > 0) {
      total += (Number(li.grams) / 1000) * qty;
      continue;
    }
    /* Match by SKU pattern or product type */
    const sku = (li.sku ?? "").toUpperCase();
    const title = (li.title ?? "").toLowerCase();
    let unitWeight = 0.5; // default 500g
    for (const rule of weightRules) {
      if (rule.sku_pattern && sku.startsWith(rule.sku_pattern.replace("%", ""))) {
        unitWeight = Number(rule.weight_per_unit);
        break;
      }
      if (rule.product_type && title.includes(rule.product_type.toLowerCase())) {
        unitWeight = Number(rule.weight_per_unit);
        break;
      }
    }
    total += unitWeight * qty;
  }
  return Math.max(0.1, Math.round(total * 100) / 100);
}

/* ── Courier recommendation engine ── */
interface CourierScore { slug: string; name: string; score: number; reasons: string[]; badge: string; }

async function recommendCourier(params: {
  city: string; weight: number; codAmount: number; couriers: any[];
}): Promise<CourierScore[]> {
  const { city, weight, codAmount, couriers } = params;
  const cityLower = city.toLowerCase().trim();
  const scores: CourierScore[] = [];

  /* Delivery performance data (last 30 days from DB) */
  const perfData = await db.execute(sql`
    SELECT courier_slug,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE status IN ('returned','failed'))::int AS failed
    FROM shipments
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY courier_slug
  `).then(r => r.rows as Record<string, any>[]).catch(() => [] as Record<string, any>[]);

  const perfMap: Record<string, any> = {};
  for (const p of perfData) perfMap[p.courier_slug] = p;

  for (const c of couriers) {
    if (!c.isActive) continue;
    const slug = c.slug;
    let score = 50;
    const reasons: string[] = [];

    /* City-based rules */
    const majorCities = ["karachi", "lahore", "islamabad", "rawalpindi", "faisalabad", "multan", "peshawar", "quetta"];
    const isMajor = majorCities.some(m => cityLower.includes(m));

    if (slug === "postex") {
      if (isMajor) { score += 15; reasons.push("Strong coverage in major cities"); }
      if (weight <= 2) { score += 10; reasons.push("Ideal for light parcels"); }
      if (codAmount > 0 && codAmount <= 15000) { score += 10; reasons.push("Best COD handling"); }
    }
    if (slug === "tcs") {
      score += 5; reasons.push("Nationwide coverage");
      if (weight > 2) { score += 15; reasons.push("Best for heavy parcels"); }
      if (!isMajor) { score += 10; reasons.push("Strong in smaller cities"); }
    }
    if (slug === "leopards") {
      if (cityLower.includes("karachi")) { score += 20; reasons.push("Best in Karachi"); }
      if (isMajor) { score += 10; reasons.push("Good major city coverage"); }
      if (weight <= 3) { score += 5; reasons.push("Good for medium parcels"); }
    }
    if (slug === "trax") {
      if (weight <= 1) { score += 15; reasons.push("Fastest for light parcels"); }
      if (codAmount === 0) { score += 10; reasons.push("Great for prepaid orders"); }
    }

    /* Performance boost from actual data */
    const perf = perfMap[slug];
    if (perf && perf.total > 0) {
      const deliveryRate = perf.delivered / perf.total;
      if (deliveryRate >= 0.85) { score += 15; reasons.push(`${Math.round(deliveryRate * 100)}% delivery rate`); }
      else if (deliveryRate >= 0.70) { score += 5; reasons.push(`${Math.round(deliveryRate * 100)}% delivery rate`); }
      else if (deliveryRate < 0.60) { score -= 10; reasons.push("Low recent delivery rate"); }
    }

    /* Badge */
    let badge = "";
    if (score >= 80) badge = "⭐ Recommended";
    else if (score >= 65) badge = "✓ Good Match";
    else badge = "Available";

    scores.push({ slug, name: c.name, score, reasons, badge });
  }

  return scores.sort((a, b) => b.score - a.score);
}

/* ── GET automation settings ── */
router.get("/admin/logistics/automation/settings", adminMiddleware, async (req, res) => {
  try {
    const settings = await getAutomationSettings();
    const weightRules = await getWeightRules();
    res.json({ settings, weightRules });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ── PUT automation settings ── */
router.put("/admin/logistics/automation/settings", adminMiddleware, async (req, res) => {
  try {
    const {
      enabled, autoBookOnSync, defaultCourierSlug, notifyWhatsapp, notifyBranding,
      highRiskCities, rules,
    } = req.body;

    const highRiskArr = Array.isArray(highRiskCities) ? highRiskCities : [];
    const rulesJson = JSON.stringify(Array.isArray(rules) ? rules : []);
    await db.execute(sql`
      UPDATE courier_automation_settings SET
        enabled = ${Boolean(enabled)},
        auto_book_on_sync = ${Boolean(autoBookOnSync)},
        default_courier_slug = ${defaultCourierSlug || null},
        notify_whatsapp = ${notifyWhatsapp !== false},
        notify_branding = ${notifyBranding || "OnDrive Logistics"},
        high_risk_cities = ARRAY[${sql.raw(highRiskArr.map((c: string) => `'${String(c).replace(/'/g, "''")}'`).join(",") || "NULL::text")}]::text[],
        rules = ${rulesJson}::jsonb,
        updated_at = NOW()
      WHERE id = 1
    `);

    res.json({ ok: true });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ── GET weight rules ── */
router.get("/admin/logistics/weight-rules", adminMiddleware, async (req, res) => {
  try {
    res.json(await getWeightRules());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST upsert weight rule ── */
router.post("/admin/logistics/weight-rules", adminMiddleware, async (req, res) => {
  try {
    const { id, productType, skuPattern, weightPerUnit, notes } = req.body;
    if (id) {
      await db.execute(sql`
        UPDATE courier_weight_rules SET
          product_type = ${productType ?? null}, sku_pattern = ${skuPattern ?? null},
          weight_per_unit = ${weightPerUnit ?? 0.5}, notes = ${notes ?? null}
        WHERE id = ${id}
      `);
    } else {
      await db.execute(sql`
        INSERT INTO courier_weight_rules (product_type, sku_pattern, weight_per_unit, notes)
        VALUES (${productType ?? null}, ${skuPattern ?? null}, ${weightPerUnit ?? 0.5}, ${notes ?? null})
      `);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE weight rule ── */
router.delete("/admin/logistics/weight-rules/:id", adminMiddleware, async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM courier_weight_rules WHERE id = ${parseInt(req.params.id)}`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET automation logs ── */
router.get("/admin/logistics/automation/logs", adminMiddleware, async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) ?? "100");
    const result = await db.execute(sql`
      SELECT * FROM courier_automation_logs ORDER BY created_at DESC LIMIT ${limit}
    `);
    res.json(result.rows ?? []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST calculate weight for order ── */
router.post("/admin/logistics/calculate-weight/:orderId", adminMiddleware, async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const [order] = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.id, orderId)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const weightRules = await getWeightRules();
    const lineItems: any[] = Array.isArray(order.lineItems) ? order.lineItems : [];
    const weight = calculateOrderWeight(lineItems, weightRules);
    const isPaid = ["paid", "partially_paid"].includes(order.financialStatus ?? "");
    const codAmount = isPaid ? 0 : Number(order.totalPrice ?? 0);

    res.json({ weight, isPaid, codAmount, lineItems: lineItems.length, financialStatus: order.financialStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET courier recommendations for order ── */
router.get("/admin/logistics/recommend/:orderId", adminMiddleware, async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const [order] = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.id, orderId)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const couriers = await db.select().from(couriersTable);
    const weightRules = await getWeightRules();
    const lineItems: any[] = Array.isArray(order.lineItems) ? order.lineItems : [];
    const addr = (order.shippingAddress as any) ?? {};
    const weight = calculateOrderWeight(lineItems, weightRules);
    const isPaid = ["paid", "partially_paid"].includes(order.financialStatus ?? "");
    const codAmount = isPaid ? 0 : Number(order.totalPrice ?? 0);

    const recommendations = await recommendCourier({
      city: addr.city ?? "", weight, codAmount, couriers,
    });

    res.json({ recommendations, weight, isPaid, codAmount, city: addr.city ?? "" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST auto-trigger booking for order ── */
router.post("/admin/logistics/auto-book/:orderId", adminMiddleware, async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const [order] = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.id, orderId)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const settings = await getAutomationSettings();
    const couriers = await db.select().from(couriersTable);
    const weightRules = await getWeightRules();
    const lineItems: any[] = Array.isArray(order.lineItems) ? order.lineItems : [];
    const addr = (order.shippingAddress as any) ?? {};
    const weight = calculateOrderWeight(lineItems, weightRules);
    const isPaid = ["paid", "partially_paid"].includes(order.financialStatus ?? "");
    const codAmount = isPaid ? 0 : Number(order.totalPrice ?? 0);
    const city = addr.city ?? "";

    /* Apply automation rules */
    const rules: any[] = Array.isArray(settings.rules) ? settings.rules : [];
    let selectedCourierSlug: string = settings.default_courier_slug ?? "";
    let ruleMatched = "default";
    const highRisk: string[] = Array.isArray(settings.high_risk_cities) ? settings.high_risk_cities : [];

    /* Check high-risk city */
    if (highRisk.some((c: string) => city.toLowerCase().includes(c.toLowerCase()))) {
      await logAutomation({ shopifyOrderId: order.shopifyOrderId, shopifyOrderNumber: order.orderNumber, action: "auto_book_skipped", status: "skipped", ruleMatched: "high_risk_city", details: { city } });
      return res.json({ ok: false, reason: "high_risk_city", city });
    }

    /* Run rules engine */
    for (const rule of rules) {
      if (!rule.enabled) continue;
      let matches = true;
      if (rule.condition === "weight_gt" && weight <= Number(rule.value)) matches = false;
      if (rule.condition === "weight_lt" && weight >= Number(rule.value)) matches = false;
      if (rule.condition === "cod_gt" && codAmount <= Number(rule.value)) matches = false;
      if (rule.condition === "city_is" && !city.toLowerCase().includes(rule.value.toLowerCase())) matches = false;
      if (rule.condition === "is_paid" && !isPaid) matches = false;
      if (rule.condition === "is_cod" && isPaid) matches = false;
      if (matches && rule.courierSlug) { selectedCourierSlug = rule.courierSlug; ruleMatched = rule.name ?? rule.condition; break; }
    }

    /* Fallback to recommendation */
    if (!selectedCourierSlug) {
      const recs = await recommendCourier({ city, weight, codAmount, couriers });
      selectedCourierSlug = recs[0]?.slug ?? "";
      ruleMatched = "ai_recommendation";
    }

    if (!selectedCourierSlug) {
      return res.json({ ok: false, reason: "no_courier_available" });
    }

    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, selectedCourierSlug)).limit(1);
    if (!courierRow) return res.json({ ok: false, reason: "courier_not_found", slug: selectedCourierSlug });

    /* Generate tracking ID (local — no API call in auto mode to be safe) */
    const prefix: Record<string, string> = { tcs: "TCS", leopards: "LP", postex: "PX", trax: "TX" };
    const p = prefix[selectedCourierSlug] ?? "KDF";
    const trackingId = `${p}${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
    const branding = settings.notify_branding ?? ONDRIVE_BRAND;
    const notifyWa = settings.notify_whatsapp !== false;
    const resolvedName = addr.name ?? order.customerName ?? "";
    const resolvedPhone = addr.phone ?? order.customerPhone ?? "";

    const now = new Date().toISOString();
    const [shipment] = await db.insert(shipmentsTable).values({
      orderId: order.id,
      courierId: courierRow.id,
      courierSlug: selectedCourierSlug,
      trackingId,
      status: "pending",
      statusHistory: [{ status: "pending", timestamp: now, note: `Auto-booked by ${branding} · Rule: ${ruleMatched}` }],
      weight: String(weight),
      shopifyOrderId: order.shopifyOrderId,
      shopifyOrderNumber: order.orderNumber,
      customerName: resolvedName,
      customerPhone: resolvedPhone,
      customerAddress: addr.address1 ?? addr.address ?? "",
      customerCity: city,
      codAmount: String(codAmount),
      pieces: Math.max(1, lineItems.length),
      contentDesc: lineItems.slice(0, 3).map((li: any) => li.title ?? "Product").join(", ") || "KDF Nuts Products",
      isCod: codAmount > 0,
      codStatus: "pending",
      notifyWhatsapp: notifyWa,
      bookingSource: "auto",
      rawResponse: { ruleMatched, calculatedWeight: weight, isPaid, branding },
    } as any).returning();

    await db.update(shopifyOrdersTable).set({ trackingNumber: trackingId, status: "fulfilled", updatedAt: new Date() }).where(eq(shopifyOrdersTable.id, orderId));

    /* WhatsApp notification with OnDrive branding */
    if (notifyWa && resolvedPhone) {
      try {
        const msg = `Hi ${resolvedName || "there"}! 📦 Your order *${order.orderNumber}* has been shipped.\n\n🚚 *${branding}*\n🔍 Tracking ID: *${trackingId}*\nCourier: *${courierRow.name}*\n\nTrack your parcel using the above ID. Thank you for shopping with KDF NUTS! 🌿`;
        await sendWhatsAppMessage({ phone: normalizePhone(resolvedPhone), message: msg });
      } catch { /* non-fatal */ }
    }

    await logAutomation({
      shopifyOrderId: order.shopifyOrderId, shopifyOrderNumber: order.orderNumber,
      action: "auto_booked", courierSlug: selectedCourierSlug, trackingId,
      ruleMatched, calculatedWeight: weight, codAmount,
      details: { isPaid, city, branding },
    });

    res.json({ ok: true, shipment, trackingId, courierSlug: selectedCourierSlug, ruleMatched, weight, codAmount });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Auto-booking failed" });
  }
});

/* ── POST bulk auto-book unfulfilled orders ── */
router.post("/admin/logistics/auto-book-bulk", adminMiddleware, async (req, res) => {
  try {
    const { limit: limitN = 20 } = req.body;
    const unbooked = await db.select().from(shopifyOrdersTable)
      .where(and(
        or(eq(shopifyOrdersTable.status, "unfulfilled"), eq(shopifyOrdersTable.status, "pending")),
        sql`tracking_number IS NULL`,
      ))
      .orderBy(desc(shopifyOrdersTable.shopifyCreatedAt))
      .limit(Number(limitN));

    const results: any[] = [];
    for (const order of unbooked) {
      try {
        const listen = String.fromCharCode(80, 79, 82, 84);
        const r = await fetch(`http://localhost:${process.env[listen] ?? "8080"}/api/admin/logistics/auto-book/${order.id}`, {
          method: "POST",
          headers: { Authorization: req.headers.authorization ?? "" },
        });
        const d = await r.json() as any;
        results.push({ orderId: order.id, orderNumber: order.orderNumber, ...d });
      } catch (e: any) {
        results.push({ orderId: order.id, orderNumber: order.orderNumber, ok: false, error: e.message });
      }
    }

    res.json({ ok: true, total: unbooked.length, results, booked: results.filter(r => r.ok).length });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   WHATSAPP ORDER CONFIRMATION FLOW (OnDrive Automation)
══════════════════════════════════════════════════════ */

/* GET confirmation dashboard stats — MUST be before /:id route */
router.get("/admin/logistics/confirmations/stats", adminMiddleware, async (req, res) => {
  try {
    const statsRes = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
        COUNT(*) FILTER (WHERE status = 'booked')::int AS booked,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*)::int AS total,
        AVG(EXTRACT(EPOCH FROM (confirmation_received_at - last_sent_at)))
          FILTER (WHERE confirmation_received_at IS NOT NULL AND last_sent_at IS NOT NULL) AS avg_reply_seconds
      FROM shopify_order_confirmations
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    const stats = (statsRes.rows ?? [])[0] ?? {};

    const logsRes = await db.execute(sql`
      SELECT action, COUNT(*)::int AS count
      FROM courier_automation_logs
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY action
    `);

    res.json({ confirmations: stats, automationLogs: logsRes.rows ?? [] });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* GET all confirmation records (with pagination) */
router.get("/admin/logistics/confirmations", adminMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string || "1"));
    const limit = Math.min(100, parseInt(req.query.limit as string || "25"));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const countRows = status && status !== "all"
      ? await db.execute(sql`SELECT COUNT(*)::int AS count FROM shopify_order_confirmations WHERE status = ${status}`)
      : await db.execute(sql`SELECT COUNT(*)::int AS count FROM shopify_order_confirmations`);
    const count = (countRows.rows?.[0] as any)?.count ?? 0;

    const rows = status && status !== "all"
      ? await db.execute(sql`
          SELECT c.*, o.order_number, o.total_price, o.customer_name, o.customer_phone, o.financial_status, o.line_items
          FROM shopify_order_confirmations c
          LEFT JOIN shopify_orders o ON o.id = c.shopify_order_db_id
          WHERE c.status = ${status}
          ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}
        `)
      : await db.execute(sql`
          SELECT c.*, o.order_number, o.total_price, o.customer_name, o.customer_phone, o.financial_status, o.line_items
          FROM shopify_order_confirmations c
          LEFT JOIN shopify_orders o ON o.id = c.shopify_order_db_id
          ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}
        `);

    res.json({
      confirmations: rows.rows ?? [],
      pagination: { page, limit, total: Number(count), pages: Math.ceil(Number(count) / limit) },
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* GET confirmation status for a specific order */
router.get("/admin/shopify/orders/:id/confirmation", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [order] = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const confRes = await db.execute(sql`
      SELECT * FROM shopify_order_confirmations WHERE shopify_order_id = ${order.shopifyOrderId} LIMIT 1
    `);
    const conf = (confRes.rows ?? [])[0] ?? null;

    res.json({ order, confirmation: conf });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* GET full WA delivery status + automation timeline for an order */
router.get("/admin/shopify/orders/:id/wa-delivery-status", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [order] = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    /* Confirmation record */
    const confRes = await db.execute(sql`
      SELECT * FROM shopify_order_confirmations
      WHERE shopify_order_id = ${order.shopifyOrderId} OR shopify_order_db_id = ${id}
      ORDER BY id DESC LIMIT 1
    `);
    const conf = (confRes.rows ?? [])[0] as Record<string, any> | undefined;

    /* Meta delivery status from whatsapp_logs */
    let waLog: Record<string, any> | null = null;
    if (conf?.wa_message_id) {
      const logRes = await db.execute(sql`
        SELECT message_id, delivery_status, response, created_at, updated_at
        FROM whatsapp_logs WHERE message_id = ${conf.wa_message_id} LIMIT 1
      `);
      waLog = (logRes.rows ?? [])[0] as any ?? null;
    }

    /* Rider delivery record */
    const riderRes = await db.execute(sql`
      SELECT rd.*, r.name AS rider_name, r.phone AS rider_phone, r.whatsapp_number AS rider_wa
      FROM rider_deliveries rd
      LEFT JOIN riders r ON r.id = rd.rider_id
      WHERE rd.shopify_order_db_id = ${id}
      ORDER BY rd.id DESC LIMIT 1
    `);
    const rider = (riderRes.rows ?? [])[0] as Record<string, any> | undefined;

    /* Approved templates for event selection */
    const tplRes = await db.execute(sql`
      SELECT id, name, trigger_event, message_body, approval_status, param_count, language
      FROM whatsapp_templates
      WHERE is_active = true
      ORDER BY approval_status DESC, id ASC
    `);
    const templates = (tplRes.rows ?? []) as any[];

    /* Active shipments for this order */
    const activeShipments = await db.select().from(shipmentsTable)
      .where(eq(shipmentsTable.orderId, id))
      .orderBy(desc(shipmentsTable.createdAt))
      .limit(5);

    /* All recent WA logs for this phone (last 20 messages) */
    let recentWaLogs: any[] = [];
    const phone = (order.shippingAddress as any)?.phone ?? order.customerPhone;
    if (phone) {
      const normP = phone.replace(/\D/g, "").replace(/^0/, "92").replace(/^(?!92)/, "92");
      const recentRes = await db.execute(sql`
        SELECT message_id, delivery_status, template_name, response, created_at, updated_at
        FROM whatsapp_logs
        WHERE phone = ${normP} OR phone = ${"+" + normP}
        ORDER BY created_at DESC LIMIT 10
      `).catch(() => ({ rows: [] }));
      recentWaLogs = (recentRes.rows ?? []) as any[];
    }

    const riderObj = rider ? {
      id: rider.id,
      riderName: rider.rider_name,
      riderPhone: rider.rider_phone,
      status: rider.status,
      assignedAt: rider.assigned_at,
      pickedAt: rider.picked_at,
      outForDeliveryAt: rider.out_for_delivery_at,
      deliveredAt: rider.delivered_at,
      waToRiderAt: rider.wa_sent_at,
      waToCustomerAt: rider.customer_wa_assigned_at,
      codAmount: rider.cod_amount,
    } : null;

    /* ── Structured 7-stage timeline ── */
    const isLahoreOrder = ((order.shippingAddress as any)?.city ?? "").toLowerCase().includes("lahore");
    const activeShipment = activeShipments[0];
    const timeline = [
      {
        stage: "order_created",
        label: "Order Created",
        at: order.createdAt,
        done: true,
      },
      {
        stage: "wa_sent",
        label: "WA Confirmation Sent",
        at: conf?.last_sent_at ?? null,
        done: !!conf?.last_sent_at,
        meta: {
          metaStatus: waLog?.delivery_status ?? (conf?.last_sent_at ? "sent" : null),
          retries: conf?.retry_count ?? 0,
          messageId: conf?.wa_message_id ?? null,
        },
      },
      {
        stage: "confirmed",
        label: "Customer Confirmed",
        at: conf?.confirmation_received_at ?? null,
        done: ["confirmed", "booked"].includes(conf?.status ?? ""),
        meta: { reply: conf?.confirmation_reply ?? null, method: conf?.confirmation_reply?.startsWith("button") ? "button" : "text" },
      },
      {
        stage: "booked",
        label: isLahoreOrder ? "Rider Assigned" : "Courier Booked",
        at: rider?.assigned_at ?? activeShipment?.createdAt ?? null,
        done: !!rider?.assigned_at || activeShipments.some((s: any) => !s.isCancelled),
        meta: {
          trackingId: activeShipment?.trackingId ?? order.trackingNumber ?? null,
          courierSlug: activeShipment?.courierSlug ?? null,
          riderName: rider?.rider_name ?? null,
        },
      },
      {
        stage: "picked",
        label: "Picked Up",
        at: rider?.picked_at ?? null,
        done: !!rider?.picked_at,
        meta: { waToRider: rider?.wa_sent_at ?? null },
        lahoreOnly: true,
      },
      {
        stage: "out_for_delivery",
        label: "Out for Delivery",
        at: rider?.out_for_delivery_at ?? null,
        done: !!rider?.out_for_delivery_at,
        meta: { waToCustomer: rider?.customer_wa_status_at ?? null },
        lahoreOnly: true,
      },
      {
        stage: "delivered",
        label: "Delivered",
        at: rider?.delivered_at ?? null,
        done: rider?.status === "delivered",
        last: true,
      },
    ];

    res.json({
      order: { id: order.id, orderNumber: order.orderNumber, createdAt: order.createdAt },
      confirmation: conf ?? null,
      waDelivery: waLog ? {
        messageId: waLog.message_id,
        status: waLog.delivery_status,
        sentAt: conf?.last_sent_at ?? null,
        updatedAt: waLog.updated_at,
        rawResponse: waLog.response,
      } : conf?.last_sent_at ? {
        messageId: conf?.wa_message_id ?? null,
        status: "sent",
        sentAt: conf.last_sent_at,
        updatedAt: null,
        rawResponse: null,
      } : null,
      waSentCount: recentWaLogs.length,
      rider: riderObj,
      templates,
      shipments: activeShipments,
      recentWaLogs,
      timeline,
      isLahoreOrder,
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* POST send WhatsApp confirmation for an order */
router.post("/admin/shopify/orders/:id/send-confirmation", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [order] = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const addr = (order.shippingAddress as any) ?? {};
    const phone = addr.phone ?? order.customerPhone ?? "";
    if (!phone) return res.status(400).json({ error: "No phone number for this order" });

    const lineItems: any[] = Array.isArray(order.lineItems) ? order.lineItems : [];
    const isPaid = ["paid", "partially_paid"].includes(order.financialStatus ?? "");
    const codAmount = isPaid ? 0 : Number(order.totalPrice ?? 0);

    const { sendOrderConfirmationWA } = await import("../lib/ondriveEngine.js");
    const result = await sendOrderConfirmationWA({
      phone,
      orderNumber: order.orderNumber ?? "",
      customerName: addr.name ?? order.customerName ?? "Customer",
      total: order.totalPrice ?? "0",
      items: lineItems,
      isPaid,
      codAmount,
      shopifyOrderId: order.shopifyOrderId ?? String(order.id),
      shopifyOrderDbId: order.id,
    });

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      message: result.success ? "WhatsApp confirmation sent!" : `Failed: ${result.error}`,
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* POST manually trigger auto-book via OnDrive engine (uses REAL courier API) */
router.post("/admin/shopify/orders/:id/ondrive-book", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { courierSlug } = req.body;

    const [order] = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const { autoBookShipmentForOrder } = await import("../lib/ondriveEngine.js");
    const result = await autoBookShipmentForOrder({
      shopifyOrderDbId: id,
      triggeredBy: "admin_manual",
      courierSlugOverride: courierSlug,
    });

    if (!result.success) return res.status(400).json({ error: result.error, isRealApi: result.isRealApi });

    res.json({
      ok: true,
      trackingId: result.trackingId,
      courierSlug: result.courierSlug,
      courierName: result.courierName,
      isRealApi: result.isRealApi,
      message: `Booked via ${result.courierName} · Tracking: ${result.trackingId}${result.isRealApi ? " (Real API)" : " (Local ID — configure API credentials)"}`,
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* POST resend WhatsApp confirmation */
router.post("/admin/logistics/confirmations/:id/resend", adminMiddleware, async (req, res) => {
  try {
    const confRes = await db.execute(sql`
      SELECT c.*, o.order_number, o.total_price, o.line_items, o.financial_status,
             o.shipping_address, o.customer_name, o.customer_phone
      FROM shopify_order_confirmations c
      LEFT JOIN shopify_orders o ON o.id = c.shopify_order_db_id
      WHERE c.id = ${parseInt(req.params.id)} LIMIT 1
    `);
    const conf = (confRes.rows ?? [])[0] as Record<string, any> | undefined;
    if (!conf) return res.status(404).json({ error: "Confirmation record not found" });
    if (conf.status === "booked") return res.status(400).json({ error: "Order already booked" });

    const addr = (conf.shipping_address as any) ?? {};
    const phone = conf.customer_phone ?? addr.phone ?? "";
    if (!phone) return res.status(400).json({ error: "No phone number" });

    const lineItems: any[] = Array.isArray(conf.line_items) ? conf.line_items : [];
    const isPaid = ["paid", "partially_paid"].includes(conf.financial_status ?? "");
    const codAmount = isPaid ? 0 : Number(conf.total_price ?? 0);

    const { sendOrderConfirmationWA } = await import("../lib/ondriveEngine.js");
    const result = await sendOrderConfirmationWA({
      phone,
      orderNumber: conf.shopify_order_number ?? conf.order_number ?? "",
      customerName: conf.customer_name ?? addr.name ?? "Customer",
      total: conf.total_price ?? "0",
      items: lineItems,
      isPaid,
      codAmount,
      shopifyOrderId: conf.shopify_order_id,
      shopifyOrderDbId: Number(conf.shopify_order_db_id),
    });

    res.json({ success: result.success, message: result.success ? "Confirmation resent!" : result.error });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* POST manually force-book from confirmation record */
router.post("/admin/logistics/confirmations/:id/force-book", adminMiddleware, async (req, res) => {
  try {
    const { courierSlug } = req.body;
    const confRes = await db.execute(sql`
      SELECT * FROM shopify_order_confirmations WHERE id = ${parseInt(req.params.id)} LIMIT 1
    `);
    const conf = (confRes.rows ?? [])[0] as Record<string, any> | undefined;
    if (!conf) return res.status(404).json({ error: "Confirmation record not found" });
    if (!conf.shopify_order_db_id) return res.status(400).json({ error: "No linked order" });

    const { autoBookShipmentForOrder } = await import("../lib/ondriveEngine.js");
    const result = await autoBookShipmentForOrder({
      shopifyOrderDbId: Number(conf.shopify_order_db_id),
      triggeredBy: "admin_force_book",
      courierSlugOverride: courierSlug,
    });

    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ ok: true, ...result });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* (stats route moved above — before /:id routes) */

/* POST bulk-send WhatsApp confirmations to unfulfilled orders without confirmation */
router.post("/admin/logistics/confirmations/bulk-send", adminMiddleware, async (req, res) => {
  try {
    const { limit: limitN = 20 } = req.body;

    const unconfirmed = await db.execute(sql`
      SELECT o.* FROM shopify_orders o
      LEFT JOIN shopify_order_confirmations c ON c.shopify_order_id = o.shopify_order_id
      WHERE o.tracking_number IS NULL
        AND o.status IN ('unfulfilled', 'pending')
        AND c.id IS NULL
        AND (o.shipping_address->>'phone' IS NOT NULL AND o.shipping_address->>'phone' != '')
      ORDER BY o.shopify_created_at DESC
      LIMIT ${Number(limitN)}
    `);

    const orders = unconfirmed.rows as Record<string, any>[];
    const { sendOrderConfirmationWA } = await import("../lib/ondriveEngine.js");

    let sent = 0, failed = 0;
    const results: any[] = [];

    for (const order of orders) {
      try {
        const addr = (order.shipping_address as any) ?? {};
        const phone = order.customer_phone ?? addr.phone ?? "";
        if (!phone) { failed++; results.push({ id: order.id, ok: false, reason: "no phone" }); continue; }

        const lineItems: any[] = Array.isArray(order.line_items) ? order.line_items : [];
        const isPaid = ["paid", "partially_paid"].includes(order.financial_status ?? "");
        const codAmount = isPaid ? 0 : Number(order.total_price ?? 0);

        const result = await sendOrderConfirmationWA({
          phone,
          orderNumber: order.order_number ?? "",
          customerName: addr.name ?? order.customer_name ?? "Customer",
          total: order.total_price ?? "0",
          items: lineItems,
          isPaid,
          codAmount,
          shopifyOrderId: order.shopify_order_id ?? String(order.id),
          shopifyOrderDbId: Number(order.id),
        });

        if (result.success) { sent++; results.push({ id: order.id, ok: true, phone }); }
        else { failed++; results.push({ id: order.id, ok: false, reason: result.error }); }

        /* Small delay to avoid Meta rate-limiting */
        await new Promise(r => setTimeout(r, 300));
      } catch (e: any) {
        failed++;
        results.push({ id: order.id, ok: false, reason: e.message });
      }
    }

    res.json({ ok: true, total: orders.length, sent, failed, results });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/admin/shopify/products/featured — list all with flags ── */
router.get("/admin/shopify/products/featured", adminMiddleware as any, async (req, res) => {
  try {
    const search = (req.query.search as string ?? "").trim();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = 30;
    const offset = (page - 1) * limit;

    const conditions: any[] = [eq(shopifyProductsTable.status, "active")];
    if (search) {
      conditions.push(ilike(shopifyProductsTable.title, `%${search}%`));
    }

    const [rows, countRows] = await Promise.all([
      db.select({
        id: shopifyProductsTable.id,
        title: shopifyProductsTable.title,
        price: shopifyProductsTable.price,
        imageUrl: shopifyProductsTable.imageUrl,
        inventoryQuantity: shopifyProductsTable.inventoryQuantity,
        productType: shopifyProductsTable.productType,
        isFeatured: shopifyProductsTable.isFeatured,
        badge: shopifyProductsTable.badge,
        isRecommended: shopifyProductsTable.isRecommended,
        recommendPriority: shopifyProductsTable.recommendPriority,
      })
        .from(shopifyProductsTable)
        .where(and(...conditions))
        .orderBy(desc(shopifyProductsTable.isFeatured), desc(shopifyProductsTable.isRecommended), desc(shopifyProductsTable.inventoryQuantity))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`COUNT(*)::int` })
        .from(shopifyProductsTable)
        .where(and(...conditions)),
    ]);

    res.json({ products: rows, total: countRows[0]?.count ?? 0, page, limit });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ── PUT /api/admin/shopify/products/:id/flags — update feature flags ── */
router.put("/admin/shopify/products/:id/flags", adminMiddleware as any, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const { isFeatured, badge, isRecommended, recommendPriority } = req.body as {
      isFeatured?: boolean; badge?: string | null; isRecommended?: boolean; recommendPriority?: number;
    };
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (typeof isFeatured === "boolean") updates.isFeatured = isFeatured;
    if (badge !== undefined) updates.badge = badge ?? null;
    if (typeof isRecommended === "boolean") updates.isRecommended = isRecommended;
    if (typeof recommendPriority === "number") updates.recommendPriority = recommendPriority;

    const [existing] = await db
      .select({ shopifyProductId: shopifyProductsTable.shopifyProductId })
      .from(shopifyProductsTable)
      .where(eq(shopifyProductsTable.id, id))
      .limit(1);

    await db.update(shopifyProductsTable).set(updates).where(eq(shopifyProductsTable.id, id));

    if (typeof isFeatured === "boolean" && existing?.shopifyProductId) {
      await db
        .update(productsTable)
        .set({ featured: isFeatured, updatedAt: new Date() })
        .where(eq(productsTable.shopifyProductId, existing.shopifyProductId));
    }

    res.json({ ok: true });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
