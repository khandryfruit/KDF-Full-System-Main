/**
 * Shopify Auto-Sync Engine
 * ========================
 * Provides:
 *  - Automatic incremental background sync (orders, customers, products)
 *  - Webhook payload processor (orders, fulfillments, products, customers, inventory)
 *  - Webhook registration helper
 *  - HMAC signature verification for incoming Shopify webhooks
 *  - Real-time status / telemetry for the admin monitoring panel
 */

import crypto from "crypto";
import { db } from "@workspace/db";
import {
  shopifyStoresTable,
  shopifyOrdersTable,
  shopifyCustomersTable,
  shopifyProductsTable,
  shopifyWebhookLogsTable,
} from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { logger } from "./logger";

const SHOPIFY_API_VERSION = "2024-01";

/* ──────────────────────────────────────────────────────
   IN-MEMORY STATE
   (single-instance server — safe to store here)
────────────────────────────────────────────────────── */
interface AutoSyncState {
  enabled: boolean;
  isRunning: boolean;
  status: "idle" | "running" | "success" | "error";
  lastSyncAt: Date | null;
  lastError: string | null;
  intervalMinutes: number;
  totalSyncsRun: number;
  lastSyncResult: { orders: number; customers: number; products: number } | null;
  webhookEventsProcessed: number;
  startedAt: Date | null;
}

const state: AutoSyncState = {
  enabled: false,
  isRunning: false,
  status: "idle",
  lastSyncAt: null,
  lastError: null,
  intervalMinutes: 15,
  totalSyncsRun: 0,
  lastSyncResult: null,
  webhookEventsProcessed: 0,
  startedAt: null,
};

let syncTimer: NodeJS.Timeout | null = null;

/* ──────────────────────────────────────────────────────
   SHOPIFY API HELPERS
────────────────────────────────────────────────────── */

function parseNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function shopifyFetch(store: any, path: string, options?: RequestInit) {
  const url = `https://${store.shopDomain}/admin/api/${SHOPIFY_API_VERSION}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": store.accessToken ?? "",
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

/* ──────────────────────────────────────────────────────
   UPSERT HELPERS (duplicated here to avoid circular imports from routes/)
────────────────────────────────────────────────────── */

async function upsertOrder(store: any, o: any) {
  const addr = o.shipping_address ?? o.billing_address ?? {};
  const items = (o.line_items ?? []).map((li: any) => ({
    id: String(li.id), title: li.title, quantity: li.quantity,
    price: li.price, sku: li.sku, variantTitle: li.variant_title,
    imageUrl: li.product?.image?.src,
  }));
  await db.insert(shopifyOrdersTable).values({
    storeId: store.id,
    shopifyOrderId: String(o.id),
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
    shippingAddress: {
      name: addr.name, address1: addr.address1, city: addr.city,
      country: addr.country, phone: addr.phone, zip: addr.zip,
    },
    lineItems: items,
    tags: o.tags ?? null,
    note: o.note ?? null,
    shopifyCreatedAt: o.created_at ? new Date(o.created_at) : null,
    shopifyUpdatedAt: o.updated_at ? new Date(o.updated_at) : null,
    syncedAt: new Date(),
  }).onConflictDoUpdate({
    target: shopifyOrdersTable.shopifyOrderId,
    set: {
      status: o.fulfillment_status ?? "pending",
      fulfillmentStatus: o.fulfillment_status ?? null,
      financialStatus: o.financial_status ?? null,
      totalPrice: o.total_price ?? null,
      lineItems: items,
      shopifyUpdatedAt: o.updated_at ? new Date(o.updated_at) : null,
      syncedAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

async function upsertCustomer(store: any, c: any) {
  const addr = c.default_address ?? {};
  await db.insert(shopifyCustomersTable).values({
    storeId: store.id,
    shopifyCustomerId: String(c.id),
    firstName: c.first_name ?? null,
    lastName: c.last_name ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    city: addr.city ?? null,
    country: addr.country ?? null,
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
      firstName: c.first_name ?? null,
      lastName: c.last_name ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      totalOrders: c.orders_count ?? 0,
      totalSpent: c.total_spent ?? "0",
      tags: c.tags ?? null,
      acceptsMarketing: c.accepts_marketing ?? false,
      syncedAt: new Date(),
      updatedAt: new Date(),
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
    storeId: store.id,
    shopifyProductId: String(p.id),
    title: p.title,
    description: p.body_html ?? null,
    vendor: p.vendor ?? null,
    productType: p.product_type ?? null,
    status: p.status ?? "active",
    tags: p.tags ?? null,
    imageUrl: p.images?.[0]?.src ?? null,
    price: firstVariant.price ?? null,
    compareAtPrice: firstVariant.compare_at_price ?? null,
    inventoryQuantity: firstVariant.inventory_quantity ?? 0,
    sku: firstVariant.sku ?? null,
    variants,
    shopifyCreatedAt: p.created_at ? new Date(p.created_at) : null,
    syncedAt: new Date(),
  }).onConflictDoUpdate({
    target: shopifyProductsTable.shopifyProductId,
    set: {
      title: p.title,
      status: p.status ?? "active",
      price: firstVariant.price ?? null,
      variants,
      imageUrl: p.images?.[0]?.src ?? null,
      inventoryQuantity: firstVariant.inventory_quantity ?? 0,
      syncedAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

/* ──────────────────────────────────────────────────────
   INCREMENTAL SYNC
   Only fetches records updated since last sync — efficient and fast.
────────────────────────────────────────────────────── */

async function runIncrementalSync(store: any) {
  const OVERLAP_MS = 5 * 60 * 1000; // 5-minute overlap to catch edge cases
  const DAY_MS = 24 * 60 * 60 * 1000;
  const WEEK_MS = 7 * DAY_MS;

  const sinceOrders = store.lastOrderSync
    ? new Date(store.lastOrderSync.getTime() - OVERLAP_MS).toISOString()
    : new Date(Date.now() - DAY_MS).toISOString();

  const sinceCustomers = store.lastCustomerSync
    ? new Date(store.lastCustomerSync.getTime() - OVERLAP_MS).toISOString()
    : new Date(Date.now() - DAY_MS).toISOString();

  const sinceProducts = store.lastProductSync
    ? new Date(store.lastProductSync.getTime() - OVERLAP_MS).toISOString()
    : new Date(Date.now() - WEEK_MS).toISOString();

  let ordersSynced = 0;
  let customersSynced = 0;
  let productsSynced = 0;

  /* ── Orders ── */
  if (store.syncOrders) {
    let path: string | null =
      `/orders.json?status=any&updated_at_min=${encodeURIComponent(sinceOrders)}&limit=250&order=updated_at+asc`;
    while (path) {
      const resp = await shopifyFetch(store, path);
      if (!resp.ok) break;
      const { orders } = await resp.json() as any;
      if (!orders?.length) break;
      for (const o of orders) {
        /* Check if this order is NEW before upserting */
        const existCheck = await db
          .select({ id: shopifyOrdersTable.id })
          .from(shopifyOrdersTable)
          .where(eq(shopifyOrdersTable.shopifyOrderId, String(o.id)))
          .limit(1);
        const isNewOrder = existCheck.length === 0;

        await upsertOrder(store, o);
        ordersSynced++;

        /* For new orders: trigger rider assignment / WA automation */
        if (isNewOrder) {
          try {
            const [savedOrder] = await db
              .select()
              .from(shopifyOrdersTable)
              .where(eq(shopifyOrdersTable.shopifyOrderId, String(o.id)))
              .limit(1);
            if (savedOrder) {
              const { triggerNewOrderAutomation } = await import("./ondriveEngine.js");
              setImmediate(() =>
                triggerNewOrderAutomation({
                  shopifyOrderDbId:  savedOrder.id,
                  shopifyOrderId:    String(o.id),
                  orderNumber:       savedOrder.orderNumber ?? o.name ?? `#${o.order_number}`,
                  customerPhone:     savedOrder.customerPhone,
                  customerName:      savedOrder.customerName,
                  shippingAddress:   savedOrder.shippingAddress,
                  totalPrice:        savedOrder.totalPrice,
                  financialStatus:   savedOrder.financialStatus,
                  lineItems:         Array.isArray(savedOrder.lineItems) ? savedOrder.lineItems : [],
                }).catch(e => logger.error(e, "triggerNewOrderAutomation (sync) failed")),
              );
              logger.info({ orderId: savedOrder.id, orderNumber: savedOrder.orderNumber }, "New order detected in sync — automation triggered");
            }
          } catch (e) {
            logger.error(e, "Failed to trigger automation for new order during sync");
          }
        }
      }
      const next = parseNextPageInfo(resp.headers.get("Link"));
      path = next ? `/orders.json?page_info=${encodeURIComponent(next)}&limit=250` : null;
      await new Promise(r => setTimeout(r, 500)); // stay under rate limit (2 req/s)
    }
    if (ordersSynced > 0) {
      await db.update(shopifyStoresTable)
        .set({ lastOrderSync: new Date(), updatedAt: new Date() })
        .where(eq(shopifyStoresTable.id, store.id));
    }
  }

  /* ── Customers ── */
  if (store.syncCustomers) {
    let path: string | null =
      `/customers.json?updated_at_min=${encodeURIComponent(sinceCustomers)}&limit=250&order=updated_at+asc`;
    while (path) {
      const resp = await shopifyFetch(store, path);
      if (!resp.ok) break;
      const { customers } = await resp.json() as any;
      if (!customers?.length) break;
      for (const c of customers) {
        await upsertCustomer(store, c);
        customersSynced++;
      }
      const next = parseNextPageInfo(resp.headers.get("Link"));
      path = next ? `/customers.json?page_info=${encodeURIComponent(next)}&limit=250` : null;
      await new Promise(r => setTimeout(r, 500));
    }
    if (customersSynced > 0) {
      await db.update(shopifyStoresTable)
        .set({ lastCustomerSync: new Date(), updatedAt: new Date() })
        .where(eq(shopifyStoresTable.id, store.id));
    }
  }

  /* ── Products ── */
  if (store.syncProducts) {
    let path: string | null =
      `/products.json?updated_at_min=${encodeURIComponent(sinceProducts)}&limit=250&order=updated_at+asc`;
    while (path) {
      const resp = await shopifyFetch(store, path);
      if (!resp.ok) break;
      const { products } = await resp.json() as any;
      if (!products?.length) break;
      for (const p of products) {
        await upsertProduct(store, p);
        productsSynced++;
      }
      const next = parseNextPageInfo(resp.headers.get("Link"));
      path = next ? `/products.json?page_info=${encodeURIComponent(next)}&limit=250` : null;
      await new Promise(r => setTimeout(r, 500));
    }
    if (productsSynced > 0) {
      await db.update(shopifyStoresTable)
        .set({ lastProductSync: new Date(), updatedAt: new Date() })
        .where(eq(shopifyStoresTable.id, store.id));
    }
  }

  return { orders: ordersSynced, customers: customersSynced, products: productsSynced };
}

/* ──────────────────────────────────────────────────────
   MAIN AUTO-SYNC RUNNER
────────────────────────────────────────────────────── */

async function runAutoSync() {
  if (state.isRunning) {
    logger.debug("Shopify auto-sync: previous run still in progress, skipping");
    return;
  }

  const [store] = await db
    .select()
    .from(shopifyStoresTable)
    .where(eq(shopifyStoresTable.isConnected, true))
    .limit(1);

  if (!store) {
    logger.debug("Shopify auto-sync: no connected store, skipping");
    return;
  }

  state.isRunning = true;
  state.status = "running";

  try {
    logger.info({ storeId: store.id, shop: store.shopDomain }, "Shopify auto-sync: incremental sync started");

    const result = await runIncrementalSync(store);

    state.lastSyncAt = new Date();
    state.lastSyncResult = result;
    state.status = "success";
    state.lastError = null;
    state.totalSyncsRun++;

    const total = result.orders + result.customers + result.products;
    if (total > 0) {
      logger.info({ ...result, total }, "Shopify auto-sync: completed with new/updated records");
    } else {
      logger.debug("Shopify auto-sync: completed (no new/updated records)");
    }
  } catch (err: any) {
    state.status = "error";
    state.lastError = err.message;
    state.lastSyncAt = new Date();
    state.totalSyncsRun++;
    logger.error({ err }, "Shopify auto-sync: error during sync");
  } finally {
    state.isRunning = false;
  }
}

/* ──────────────────────────────────────────────────────
   WEBHOOK HMAC VERIFICATION
────────────────────────────────────────────────────── */

export function verifyShopifyHmac(
  secret: string,
  rawBody: Buffer,
  hmacHeader: string,
): boolean {
  try {
    const digest = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("base64");
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

/* ──────────────────────────────────────────────────────
   WEBHOOK PAYLOAD PROCESSOR
   Called after HMAC is verified and log entry is created.
────────────────────────────────────────────────────── */

export async function processShopifyWebhookPayload(
  topic: string,
  store: any,
  payload: any,
  logId?: number,
): Promise<void> {
  try {
    switch (topic) {
      case "orders/create": {
        await upsertOrder(store, payload);
        /* ── REAL AUTOMATION: smart-route to rider or WA confirmation ── */
        const [savedOrder] = await db
          .select()
          .from(shopifyOrdersTable)
          .where(eq(shopifyOrdersTable.shopifyOrderId, String(payload.id)))
          .limit(1);
        if (savedOrder) {
          /* ── SSE push to admin panel ── */
          try {
            const { broadcastSSE } = await import("./sse.js");
            broadcastSSE("new_shopify_order", {
              id: savedOrder.id,
              orderNumber: savedOrder.orderNumber ?? payload.name,
              customerName: savedOrder.customerName,
              total: savedOrder.totalPrice,
              city: (() => { try { const a = typeof savedOrder.shippingAddress === "string" ? JSON.parse(savedOrder.shippingAddress) : savedOrder.shippingAddress; return a?.city ?? ""; } catch { return ""; } })(),
              financialStatus: savedOrder.financialStatus,
              receivedAt: new Date().toISOString(),
            });
          } catch {}

          /* ── Save admin notification ── */
          try {
            const { adminNotificationsTable: ant } = await import("@workspace/db/schema");
            await db.insert(ant).values({
              type: "new_order",
              title: `New Order ${savedOrder.orderNumber ?? payload.name}`,
              message: `${savedOrder.customerName ?? "Customer"} — Rs. ${savedOrder.totalPrice ?? "0"}`,
              data: { orderId: savedOrder.id, shopifyOrderId: String(payload.id) },
            } as any).catch(() => {});
          } catch {}

          const { triggerNewOrderAutomation } = await import("./ondriveEngine.js");
          setImmediate(() =>
            triggerNewOrderAutomation({
              shopifyOrderDbId:  savedOrder.id,
              shopifyOrderId:    String(payload.id),
              orderNumber:       savedOrder.orderNumber ?? payload.name ?? `#${payload.order_number}`,
              customerPhone:     savedOrder.customerPhone,
              customerName:      savedOrder.customerName,
              shippingAddress:   savedOrder.shippingAddress,
              totalPrice:        savedOrder.totalPrice,
              financialStatus:   savedOrder.financialStatus,
              lineItems:         Array.isArray(savedOrder.lineItems) ? savedOrder.lineItems : [],
            }).catch(e => logger.error(e, "triggerNewOrderAutomation failed")),
          );
        }
        break;
      }

      case "orders/updated":
      case "orders/paid":
      case "orders/fulfilled":
      case "orders/cancelled":
        await upsertOrder(store, payload);
        break;

      case "draft_orders/create":
        /* Log draft order for visibility — no auto-action */
        logger.info({ draftId: payload.id, name: payload.name }, "draft_orders/create webhook received");
        break;

      case "fulfillments/create":
      case "fulfillments/update": {
        const orderId = payload.order_id;
        if (orderId) {
          const tracking = payload.tracking_number ?? null;
          const trackingUrl = payload.tracking_url ?? null;
          await db
            .update(shopifyOrdersTable)
            .set({
              fulfillmentStatus: payload.status ?? null,
              ...(tracking ? { trackingNumber: tracking } : {}),
              ...(trackingUrl ? { trackingUrl } : {}),
              updatedAt: new Date(),
            })
            .where(eq(shopifyOrdersTable.shopifyOrderId, String(orderId)));
        }
        break;
      }

      case "products/create":
      case "products/update":
        await upsertProduct(store, payload);
        break;

      case "customers/create":
      case "customers/update":
        await upsertCustomer(store, payload);
        break;

      case "inventory_levels/update":
        /* best-effort: update inventory_quantity where sku matches */
        if (payload.inventory_item_id != null && payload.available != null) {
          await db.execute(
            sql`UPDATE shopify_products
                SET inventory_quantity = ${Number(payload.available)},
                    updated_at = NOW(),
                    synced_at  = NOW()
                WHERE variants @> ${JSON.stringify([{ inventoryItemId: String(payload.inventory_item_id) }])}::jsonb`,
          ).catch(() => {});
        }
        break;
    }

    state.webhookEventsProcessed++;

    /* mark log entry as processed */
    if (logId) {
      await db
        .update(shopifyWebhookLogsTable)
        .set({ processed: true })
        .where(eq(shopifyWebhookLogsTable.id, logId))
        .catch(() => {});
    }
  } catch (err: any) {
    logger.error({ err, topic }, "Shopify webhook processing error");
    if (logId) {
      await db
        .update(shopifyWebhookLogsTable)
        .set({ error: err.message })
        .where(eq(shopifyWebhookLogsTable.id, logId))
        .catch(() => {});
    }
  }
}

/* ──────────────────────────────────────────────────────
   WEBHOOK REGISTRATION
   Registers all required webhook topics with Shopify.
────────────────────────────────────────────────────── */

const REQUIRED_TOPICS = [
  "orders/create",
  "orders/updated",
  "orders/paid",
  "orders/cancelled",
  "orders/fulfilled",
  "fulfillments/create",
  "fulfillments/update",
  "products/create",
  "products/update",
  "customers/create",
  "customers/update",
  "draft_orders/create",
];

export async function registerShopifyWebhooks(
  store: any,
  callbackBaseUrl: string,
): Promise<{ registered: string[]; skipped: string[]; failed: string[] }> {
  const callbackUrl = `${callbackBaseUrl}/api/shopify/webhook`;

  /* fetch existing webhooks */
  const existingRes = await shopifyFetch(store, "/webhooks.json");
  const existingData = existingRes.ok
    ? ((await existingRes.json()) as any)
    : { webhooks: [] };
  const existing: any[] = existingData.webhooks ?? [];
  const existingTopics = new Set(
    existing
      .filter((w: any) => w.address === callbackUrl)
      .map((w: any) => w.topic),
  );

  const registered: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const topic of REQUIRED_TOPICS) {
    if (existingTopics.has(topic)) {
      skipped.push(topic);
      continue;
    }
    const res = await shopifyFetch(store, "/webhooks.json", {
      method: "POST",
      body: JSON.stringify({ webhook: { topic, address: callbackUrl, format: "json" } }),
    });
    if (res.ok) {
      registered.push(topic);
    } else {
      const errText = await res.text().catch(() => "");
      failed.push(`${topic}: ${errText.slice(0, 120)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  return { registered, skipped, failed };
}

export async function listShopifyWebhooks(store: any): Promise<any[]> {
  const res = await shopifyFetch(store, "/webhooks.json");
  if (!res.ok) return [];
  const data = (await res.json()) as any;
  return data.webhooks ?? [];
}

/* ──────────────────────────────────────────────────────
   AUTO REGISTER WEBHOOKS ON STARTUP
   Runs once after server starts. Silently skips if no
   connected store is found.
────────────────────────────────────────────────────── */

export async function autoRegisterWebhooksOnStartup(): Promise<void> {
  try {
    /* Wait 3s so DB connections stabilise */
    await new Promise(r => setTimeout(r, 3000));

    const [store] = await db
      .select()
      .from(shopifyStoresTable)
      .where(eq(shopifyStoresTable.isConnected, true))
      .limit(1);

    if (!store?.accessToken) {
      logger.info("autoRegisterWebhooks: no connected store — skipping");
      return;
    }

    /* Build public callback URL from REPLIT_DOMAINS env */
    const replitDomains = process.env["REPLIT_DOMAINS"] ?? "";
    const replitPrimary = replitDomains.split(",")[0]?.trim();
    const customDomain = process.env["META_DOMAIN_OVERRIDE"]?.replace(/\/+$/, "") ?? null;

    const baseUrl =
      customDomain ||
      (replitPrimary ? `https://${replitPrimary}` : null) ||
      `https://${process.env["REPLIT_DEV_DOMAIN"] ?? "localhost"}`;

    logger.info({ baseUrl }, "autoRegisterWebhooks: registering with Shopify");

    const result = await registerShopifyWebhooks(store, baseUrl);

    logger.info(
      { registered: result.registered, skipped: result.skipped, failed: result.failed },
      "autoRegisterWebhooks: done",
    );
  } catch (err: any) {
    /* Non-fatal — log and move on */
    logger.warn({ err: err.message }, "autoRegisterWebhooks: error (non-fatal)");
  }
}

/* ──────────────────────────────────────────────────────
   COURIER → SHOPIFY FULFILLMENT SYNC
   Call this when a tracking number is assigned to a Shopify order.
────────────────────────────────────────────────────── */

export async function pushFulfillmentToShopify(
  store: any,
  shopifyOrderId: string,
  trackingNumber: string,
  trackingCompany = "TCS",
): Promise<{ success: boolean; error?: string }> {
  try {
    /* 1. get Shopify order to find the fulfillment location */
    const orderRes = await shopifyFetch(
      store,
      `/orders/${shopifyOrderId}.json?fields=id,fulfillments,line_items`,
    );
    if (!orderRes.ok)
      return { success: false, error: `Shopify order fetch failed: ${orderRes.status}` };

    const { order } = (await orderRes.json()) as any;

    /* 2. get fulfillment order IDs */
    const foRes = await shopifyFetch(
      store,
      `/orders/${shopifyOrderId}/fulfillment_orders.json`,
    );
    if (!foRes.ok)
      return { success: false, error: `Fulfillment orders fetch failed: ${foRes.status}` };

    const { fulfillment_orders: fos } = (await foRes.json()) as any;
    const openFo = (fos ?? []).find(
      (fo: any) => fo.status === "open" || fo.status === "in_progress",
    );
    if (!openFo) return { success: false, error: "No open fulfillment order found" };

    /* 3. create fulfillment */
    const body = {
      fulfillment: {
        line_items_by_fulfillment_order: [
          { fulfillment_order_id: openFo.id },
        ],
        tracking_info: {
          number: trackingNumber,
          company: trackingCompany,
        },
        notify_customer: true,
      },
    };
    const fulfillRes = await shopifyFetch(store, "/fulfillments.json", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!fulfillRes.ok) {
      const errText = await fulfillRes.text().catch(() => "");
      return { success: false, error: `Fulfillment creation failed: ${errText.slice(0, 200)}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/* ──────────────────────────────────────────────────────
   PUBLIC STATUS / TELEMETRY
────────────────────────────────────────────────────── */

export function getAutoSyncStatus() {
  const nextSyncAt =
    state.lastSyncAt && !state.isRunning && state.enabled
      ? new Date(state.lastSyncAt.getTime() + state.intervalMinutes * 60 * 1000)
      : null;
  return { ...state, nextSyncAt };
}

/* ──────────────────────────────────────────────────────
   PUBLIC CONTROLS
────────────────────────────────────────────────────── */

export function triggerImmediateSync(): void {
  setImmediate(() => runAutoSync());
}

export function startShopifyAutoSync(intervalMinutes = 15): void {
  state.intervalMinutes = intervalMinutes;
  state.enabled = true;
  state.startedAt = new Date();

  if (syncTimer) clearInterval(syncTimer);

  /* first run after server warm-up (60 s) */
  setTimeout(() => runAutoSync(), 60_000);

  /* recurring runs */
  syncTimer = setInterval(() => runAutoSync(), intervalMinutes * 60 * 1000);

  logger.info({ intervalMinutes }, "Shopify auto-sync scheduler started");
}

export function stopShopifyAutoSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  state.enabled = false;
  logger.info("Shopify auto-sync scheduler stopped");
}
