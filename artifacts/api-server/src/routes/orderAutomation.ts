import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { adminMiddleware } from "../lib/auth.js";
import { runShopifyOrderAutomation, retryAutomationLog } from "../lib/orderAutomationEngine.js";
import { processOrderAutomationRetries } from "../lib/orderAutomationRetry.js";
import { assignLahoreOrderWithNotifications } from "../lib/lahoreOrderAssign.js";

const router = Router();

/** GET /api/admin/order-automation/dashboard */
router.get("/admin/order-automation/dashboard", adminMiddleware as any, async (req, res) => {
  try {
    const hours = Math.min(168, parseInt(String(req.query.hours ?? "48"), 10) || 48);

    const [stats, recentFailures, webhookFails, pendingLahore, waFails] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'success')::int AS success_count,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
          COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped_count,
          COUNT(*) FILTER (WHERE event_type = 'rider_assign' AND status = 'success')::int AS assigns_ok,
          COUNT(*) FILTER (WHERE event_type = 'order_confirmed_wa' AND status = 'success')::int AS confirms_ok
        FROM order_automation_logs
        WHERE created_at > NOW() - (${hours} || ' hours')::interval
      `).catch(() => ({ rows: [{}] })),
      db.execute(sql`
        SELECT id, order_number, event_type, message, error_message, retry_count, created_at
        FROM order_automation_logs
        WHERE status = 'failed'
        ORDER BY created_at DESC
        LIMIT 50
      `).catch(() => ({ rows: [] })),
      db.execute(sql`
        SELECT id, topic, shopify_id, error, processed, received_at
        FROM shopify_webhook_logs
        WHERE (processed = false OR error IS NOT NULL)
          AND received_at > NOW() - (${hours} || ' hours')::interval
        ORDER BY received_at DESC
        LIMIT 30
      `).catch(() => ({ rows: [] })),
      db.execute(sql`
        SELECT o.id, o.order_number, o.customer_name, rd.id AS delivery_id
        FROM shopify_orders o
        LEFT JOIN rider_deliveries rd ON rd.shopify_order_db_id = o.id
        WHERE (o.shipping_address::text ILIKE '%lahore%' OR rd.city ILIKE '%lahore%')
          AND (rd.id IS NULL OR (rd.rider_id IS NULL AND rd.status IN ('pending','confirmed')))
          AND o.financial_status NOT IN ('refunded','voided')
        ORDER BY o.id DESC
        LIMIT 30
      `).catch(() => ({ rows: [] })),
      db.execute(sql`
        SELECT id, delivery_id, event_type, phone, status, error_message, retry_count, created_at
        FROM delivery_wa_notifications
        WHERE status = 'failed'
        ORDER BY created_at DESC
        LIMIT 30
      `).catch(() => ({ rows: [] })),
    ]);

    const riderSettings = await db.execute(sql`
      SELECT
        COALESCE(auto_delivery_mode, true) AS auto_delivery_mode,
        COALESCE(auto_wa_on_assign, true) AS auto_wa_on_assign,
        COALESCE(auto_wa_on_status, true) AS auto_wa_on_status,
        COALESCE(premium_wa_on_assign, true) AS premium_wa_on_assign
      FROM rider_delivery_settings WHERE id = 1 LIMIT 1
    `).catch(() => ({ rows: [{}] }));

    const onlineRiders = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM riders WHERE status = 'active' AND is_online = true
    `).catch(() => ({ rows: [{ c: 0 }] }));

    res.json({
      hours,
      stats: stats.rows[0] ?? {},
      settings: riderSettings.rows[0] ?? {},
      onlineRiders: (onlineRiders.rows[0] as { c: number })?.c ?? 0,
      recentFailures: recentFailures.rows,
      webhookFailures: webhookFails.rows,
      pendingLahoreOrders: pendingLahore.rows,
      failedWhatsApp: waFails.rows,
      queueHealth: {
        shopifyAutoSync: "active",
        lahoreRetryJob: "every 2 min",
        automationRetryJob: "every 90 sec",
        deliveryWaRetry: "every 90 sec",
      },
    });
  } catch (err: unknown) {
    req.log?.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Dashboard failed" });
  }
});

/** POST /api/admin/order-automation/retry/:logId */
router.post("/admin/order-automation/retry/:logId", adminMiddleware as any, async (req, res) => {
  const logId = parseInt(req.params.logId, 10);
  const result = await retryAutomationLog(logId);
  res.json(result);
});

/** POST /api/admin/order-automation/retry-all */
router.post("/admin/order-automation/retry-all", adminMiddleware as any, async (_req, res) => {
  const result = await processOrderAutomationRetries();
  res.json({ ok: true, ...result });
});

/** POST /api/admin/order-automation/run/:shopifyOrderDbId — manual full automation */
router.post("/admin/order-automation/run/:orderId", adminMiddleware as any, async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  const orderRows = await db.execute(sql`SELECT * FROM shopify_orders WHERE id = ${orderId} LIMIT 1`);
  if (!orderRows.rows.length) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const o = orderRows.rows[0] as Record<string, unknown>;
  const result = await runShopifyOrderAutomation({
    shopifyOrderDbId: orderId,
    shopifyOrderId: String(o.shopify_order_id),
    orderNumber: String(o.order_number),
    customerPhone: o.customer_phone as string | null,
    customerName: o.customer_name as string | null,
    shippingAddress: o.shipping_address,
    totalPrice: o.total_price as string | null,
    financialStatus: o.financial_status as string | null,
    lineItems: (o.line_items as unknown[]) ?? [],
    source: "manual",
  });
  res.json(result);
});

/** POST /api/admin/order-automation/assign-lahore/:orderId */
router.post("/admin/order-automation/assign-lahore/:orderId", adminMiddleware as any, async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  const orderRows = await db.execute(sql`SELECT * FROM shopify_orders WHERE id = ${orderId} LIMIT 1`);
  if (!orderRows.rows.length) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const o = orderRows.rows[0] as Record<string, unknown>;
  const result = await assignLahoreOrderWithNotifications({
    shopifyOrderDbId: orderId,
    shopifyOrderId: String(o.shopify_order_id),
    orderNumber: String(o.order_number),
    customerName: o.customer_name as string | null,
    customerPhone: o.customer_phone as string | null,
    shippingAddress: o.shipping_address,
    totalPrice: o.total_price as string | null,
    financialStatus: o.financial_status as string | null,
    lineItems: (o.line_items as unknown[]) ?? [],
  });
  res.json(result);
});

export default router;
