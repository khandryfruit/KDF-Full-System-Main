import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { adminMiddleware } from "../lib/auth";
import { sendWhatsAppMessage, sendOrderStatusUpdate, sendFailedDeliveryNotification, sendReviewRequest } from "../lib/whatsapp";
import { syncDeliveryToShopify, buildSyncPayload, type SyncAction } from "../lib/shopifySync.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ═══════════════════════════════════════════════════════
   HELPER — normalise phone to international format
═══════════════════════════════════════════════════════ */
function normalisePhone(raw: string): string {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("92")) return `+${digits}`;
  if (digits.startsWith("0")) return `+92${digits.slice(1)}`;
  if (digits.length === 10) return `+92${digits}`;
  return raw.startsWith("+") ? raw : `+${digits}`;
}

/* ═══════════════════════════════════════════════════════
   HELPER — get delivery settings (auto mode etc.)
═══════════════════════════════════════════════════════ */
async function getDeliverySettings(): Promise<{
  auto_delivery_mode: boolean;
  auto_wa_on_assign: boolean;
  auto_wa_on_status: boolean;
  default_eta_minutes: number;
}> {
  try {
    const rows = await db.execute(sql`SELECT * FROM rider_delivery_settings WHERE id = 1 LIMIT 1`);
    if (rows.rows.length) return rows.rows[0] as any;
  } catch {}
  return { auto_delivery_mode: true, auto_wa_on_assign: true, auto_wa_on_status: true, default_eta_minutes: 30 };
}

/* ═══════════════════════════════════════════════════════
   HELPER — build customer WhatsApp message by status
═══════════════════════════════════════════════════════ */
function buildCustomerStatusMessage(
  status: string,
  order: any,
  delivery: any,
  etaMinutes?: number | null,
): string {
  const orderNum = order?.order_number ?? delivery?.shopify_order_number ?? "—";
  const customerName = delivery?.customer_name ?? "Customer";
  const cod = Number(delivery?.cod_amount ?? 0);
  const isPaid = order?.financial_status === "paid" || delivery?.is_paid;
  const codText = isPaid ? "PAID ✅" : `PKR ${cod.toLocaleString()} Cash on Delivery`;
  const riderName = delivery?.rider_name ?? delivery?.name ?? "";
  const riderPhone = delivery?.rider_phone ?? delivery?.phone ?? "";
  const addr = delivery?.delivery_address ?? "";

  const etaText = etaMinutes
    ? etaMinutes <= 60 ? `${etaMinutes} minutes` : `${Math.floor(etaMinutes / 60)} hour${etaMinutes >= 120 ? "s" : ""}`
    : "30-45 minutes";

  switch (status) {
    case "assigned":
      return `🛵 *Your Order Has Been Assigned!*
━━━━━━━━━━━━━━━━━━━
Hi ${customerName}! 👋

Your order *${orderNum}* has been assigned to our delivery rider.

👤 *Rider Name:* ${riderName || "KDF NUTS Rider"}
📞 *Rider Contact:* ${riderPhone || "Will be shared soon"}
⏱️ *Estimated Delivery:* ${etaText}
💰 *Amount to Prepare:* ${codText}
📍 *Delivering to:* ${addr || "Your address"}

Please keep your phone active and payment ready.
━━━━━━━━━━━━━━━━━━━
🌰 KDF NUTS | Premium Dry Fruits`;

    case "picked":
      return `📦 *Order Picked Up!*
━━━━━━━━━━━━━━━━━━━
Hi ${customerName}!

Great news! 🎉 Your order *${orderNum}* has been picked up by our rider and is on its way to you!

🛵 *Rider:* ${riderName || "KDF NUTS Rider"}
⏱️ *ETA:* ${etaText}
💰 *Keep Ready:* ${codText}

We'll notify you when your rider is near.
━━━━━━━━━━━━━━━━━━━
🌰 KDF NUTS | Premium Dry Fruits`;

    case "out_for_delivery":
      return `🚚 *Your Order is Out for Delivery!*
━━━━━━━━━━━━━━━━━━━
Hi ${customerName}!

Your order *${orderNum}* is on its way! 🛵💨

🛵 *Rider:* ${riderName || "KDF NUTS Rider"}
📞 *Contact:* ${riderPhone || "Available on arrival"}
⏱️ *Arriving in:* ${etaText}
💰 *Please Prepare:* ${codText}

Please be available and keep your phone reachable.
━━━━━━━━━━━━━━━━━━━
🌰 KDF NUTS | Premium Dry Fruits`;

    case "near_customer":
      return `📍 *Rider is Near Your Location!*
━━━━━━━━━━━━━━━━━━━
Hi ${customerName}!

Your KDF NUTS order *${orderNum}* rider is almost there! 🏃

🛵 *Rider:* ${riderName || "KDF NUTS Rider"}
📞 *Call Rider:* ${riderPhone || "—"}
💰 *Amount Due:* ${codText}

Please come to the door — your order is arriving NOW! 🚨
━━━━━━━━━━━━━━━━━━━
🌰 KDF NUTS | Premium Dry Fruits`;

    case "delivered":
      return `✅ *Order Delivered Successfully!*
━━━━━━━━━━━━━━━━━━━
Hi ${customerName}!

Your order *${orderNum}* has been delivered. Thank you for choosing KDF NUTS! 🌰

We hope you love your premium dry fruits!

⭐ *Enjoying our products?* Please share your experience — your feedback means the world to us.

📞 For any queries: Reply to this message.
━━━━━━━━━━━━━━━━━━━
🌰 KDF NUTS | Premium Dry Fruits
🛍️ Shop again: kdfnuts.com`;

    case "delayed":
      return `⏰ *Delivery Slightly Delayed*
━━━━━━━━━━━━━━━━━━━
Hi ${customerName},

We sincerely apologize — your order *${orderNum}* is experiencing a slight delay.

🛵 Our rider is on the way and will be with you shortly.
💰 Amount to keep ready: ${codText}

We appreciate your patience. 🙏
━━━━━━━━━━━━━━━━━━━
🌰 KDF NUTS | Premium Dry Fruits`;

    case "failed":
      return `❌ *Delivery Attempt Failed*
━━━━━━━━━━━━━━━━━━━
Hi ${customerName},

We were unable to deliver your order *${orderNum}* — our rider could not reach you.

📞 Please call us or reply to reschedule your delivery.

We'll try again at your convenience. 🙏
━━━━━━━━━━━━━━━━━━━
🌰 KDF NUTS | Premium Dry Fruits`;

    case "returned":
      return `↩️ *Order Returned*
━━━━━━━━━━━━━━━━━━━
Hi ${customerName},

Your order *${orderNum}* has been returned to our warehouse.

Please contact us to arrange redelivery or for a refund.
📞 Reply to this message or reach out to our support team.
━━━━━━━━━━━━━━━━━━━
🌰 KDF NUTS | Premium Dry Fruits`;

    default:
      return `📦 *Order Update — KDF NUTS*\n\nHi ${customerName}! Your order *${orderNum}* status: *${status.replace(/_/g, " ").toUpperCase()}*.\n\n🌰 KDF NUTS | Thank you for shopping with us!`;
  }
}

/* ═══════════════════════════════════════════════════════
   HELPER — build WhatsApp message text for rider
═══════════════════════════════════════════════════════ */
function buildRiderMessage(order: any, delivery: any): string {
  const items = (() => {
    try {
      const arr = typeof order.line_items === "string" ? JSON.parse(order.line_items) : order.line_items;
      return Array.isArray(arr) ? arr.map((i: any) => `• ${i.name ?? i.title ?? "Item"} × ${i.quantity}`).join("\n") : "";
    } catch { return ""; }
  })();

  const addr = (() => {
    try {
      const a = typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address;
      return [a?.address1, a?.address2, a?.city].filter(Boolean).join(", ");
    } catch { return delivery.delivery_address ?? ""; }
  })();

  const cod = Number(delivery.cod_amount ?? 0);
  const codText = delivery.is_paid ? "PAID ✅ (No collection needed)" : `PKR ${cod.toLocaleString()} cash on delivery`;

  return `🚚 *NEW DELIVERY — KDF NUTS*

📦 *Order:* ${order.order_number ?? delivery.shopify_order_number}
👤 *Customer:* ${delivery.customer_name}
📞 *Customer Phone:* ${delivery.customer_phone}
📍 *Address:* ${addr}

🛒 *Items:*
${items || "See order details"}

💰 *COD Amount:* ${codText}
${delivery.notes ? `📝 *Notes:* ${delivery.notes}` : ""}

━━━━━━━━━━━━━━━━━━━
Please confirm pickup and deliver at your earliest.
Reply *PICKED* when you collect, *DONE* when delivered.
━━━━━━━━━━━━━━━━━━━
KDF NUTS Logistics Team`;
}

/* ═══════════════════════════════════════════════════════
   RIDERS — CRUD
═══════════════════════════════════════════════════════ */

/* GET /api/admin/riders */
router.get("/admin/riders", adminMiddleware, async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT r.*,
        COUNT(d.id) FILTER (WHERE d.status NOT IN ('delivered','returned','failed')) AS active_deliveries,
        COUNT(d.id) FILTER (WHERE d.status = 'delivered') AS total_delivered,
        COUNT(d.id) AS total_assignments
      FROM riders r
      LEFT JOIN rider_deliveries d ON d.rider_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `);
    res.json({ riders: rows.rows ?? [] });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/admin/riders */
router.post("/admin/riders", adminMiddleware, async (req, res) => {
  try {
    const { name, phone, whatsapp_number, delivery_area, status, notes } = req.body;
    if (!name || !phone) res.status(400).json({ error: "name and phone are required" });
    const wa = whatsapp_number || phone;
    const rows = await db.execute(sql`
      INSERT INTO riders (name, phone, whatsapp_number, delivery_area, status, notes)
      VALUES (${name}, ${normalisePhone(phone)}, ${normalisePhone(wa)}, ${delivery_area ?? null}, ${status ?? "active"}, ${notes ?? null})
      RETURNING *
    `);
    res.json({ rider: rows.rows[0] });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/admin/riders/:id */
router.put("/admin/riders/:id", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { name, phone, whatsapp_number, delivery_area, status, notes } = req.body;
    const rows = await db.execute(sql`
      UPDATE riders SET
        name = COALESCE(${name ?? null}, name),
        phone = COALESCE(${phone ? normalisePhone(phone) : null}, phone),
        whatsapp_number = COALESCE(${whatsapp_number ? normalisePhone(whatsapp_number) : null}, whatsapp_number),
        delivery_area = COALESCE(${delivery_area ?? null}, delivery_area),
        status = COALESCE(${status ?? null}, status),
        notes = COALESCE(${notes ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    if (!rows.rows.length) res.status(404).json({ error: "Rider not found" });
    res.json({ rider: rows.rows[0] });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/admin/riders/:id */
router.delete("/admin/riders/:id", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    await db.execute(sql`DELETE FROM riders WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   LAHORE ORDERS — from Shopify with local delivery status
═══════════════════════════════════════════════════════ */

/* GET /api/admin/riders/lahore-orders */
router.get("/admin/riders/lahore-orders", adminMiddleware, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page as string || "1"));
    const limit  = Math.min(100, parseInt(req.query.limit as string || "25"));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined; // pending/assigned/delivered/all
    const search = req.query.search as string | undefined;

    const searchClause = search
      ? `AND (o.order_number ILIKE '%${search.replace(/'/g, "''")}%' OR o.customer_name ILIKE '%${search.replace(/'/g, "''")}%' OR o.customer_phone ILIKE '%${search.replace(/'/g, "''")}%')`
      : "";

    const statusClause = status && status !== "all"
      ? status === "unassigned"
        ? "AND rd.id IS NULL"
        : `AND rd.status = '${status.replace(/'/g, "''")}'`
      : "";

    const countRows = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM shopify_orders o
      LEFT JOIN rider_deliveries rd ON rd.shopify_order_db_id = o.id
      WHERE (o.shipping_address->>'city') ILIKE '%lahore%'
      ${sql.raw(searchClause)} ${sql.raw(statusClause)}
    `);
    const total = (countRows.rows?.[0] as any)?.count ?? 0;

    const rows = await db.execute(sql`
      SELECT
        o.id, o.shopify_order_id, o.order_number, o.customer_name, o.customer_phone,
        o.shipping_address, o.total_price, o.financial_status, o.line_items,
        o.created_at AS order_date,
        rd.id AS delivery_id, rd.rider_id, rd.status AS delivery_status,
        rd.cod_amount, rd.is_paid, rd.wa_sent_at, rd.assigned_at,
        rd.picked_at, rd.out_for_delivery_at, rd.delivered_at,
        rd.notes AS delivery_notes,
        rd.customer_wa_sent_at, rd.delivery_charge, rd.rider_payment_status,
        r.name AS rider_name, r.phone AS rider_phone, r.whatsapp_number AS rider_wa,
        r.delivery_charge_per_order AS rider_delivery_charge
      FROM shopify_orders o
      LEFT JOIN rider_deliveries rd ON rd.shopify_order_db_id = o.id
      LEFT JOIN riders r ON r.id = rd.rider_id
      WHERE (o.shipping_address->>'city') ILIKE '%lahore%'
      ${sql.raw(searchClause)} ${sql.raw(statusClause)}
      ORDER BY o.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    res.json({
      orders: rows.rows ?? [],
      pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/admin/riders/stats */
router.get("/admin/riders/stats", adminMiddleware, async (req, res) => {
  try {
    const totals = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM shopify_orders WHERE (shipping_address->>'city') ILIKE '%lahore%') AS total_lahore,
        (SELECT COUNT(*)::int FROM rider_deliveries) AS total_assigned,
        (SELECT COUNT(*)::int FROM rider_deliveries WHERE status = 'delivered') AS delivered,
        (SELECT COUNT(*)::int FROM rider_deliveries WHERE status = 'out_for_delivery') AS out_for_delivery,
        (SELECT COUNT(*)::int FROM rider_deliveries WHERE status = 'assigned') AS assigned,
        (SELECT COUNT(*)::int FROM rider_deliveries WHERE status = 'picked') AS picked,
        (SELECT COUNT(*)::int FROM rider_deliveries WHERE status = 'failed') AS failed,
        (SELECT COUNT(*)::int FROM rider_deliveries WHERE status = 'returned') AS returned,
        (SELECT COUNT(*)::int FROM riders WHERE status = 'active') AS active_riders,
        (SELECT COALESCE(SUM(cod_amount),0)::int FROM rider_deliveries WHERE status = 'delivered' AND is_paid = false) AS cod_collected
    `);
    const riderStats = await db.execute(sql`
      SELECT r.id, r.name, r.status, r.delivery_area,
        COUNT(d.id) FILTER (WHERE d.status = 'delivered') AS delivered,
        COUNT(d.id) FILTER (WHERE d.status NOT IN ('delivered','returned','failed')) AS active
      FROM riders r
      LEFT JOIN rider_deliveries d ON d.rider_id = r.id
      GROUP BY r.id ORDER BY delivered DESC LIMIT 10
    `);
    res.json({ stats: totals.rows?.[0] ?? {}, riderLeaderboard: riderStats.rows ?? [] });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   ASSIGN ORDER TO RIDER
═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   DELIVERY SETTINGS — GET / PUT
═══════════════════════════════════════════════════════ */
router.get("/admin/riders/delivery-settings", adminMiddleware, async (req, res) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM rider_delivery_settings WHERE id = 1 LIMIT 1`);
    res.json(rows.rows[0] ?? {});
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/admin/riders/delivery-settings", adminMiddleware, async (req, res) => {
  try {
    const { auto_delivery_mode, auto_wa_on_assign, auto_wa_on_status, default_eta_minutes } = req.body;
    const rows = await db.execute(sql`
      UPDATE rider_delivery_settings SET
        auto_delivery_mode   = COALESCE(${auto_delivery_mode   ?? null}, auto_delivery_mode),
        auto_wa_on_assign    = COALESCE(${auto_wa_on_assign    ?? null}, auto_wa_on_assign),
        auto_wa_on_status    = COALESCE(${auto_wa_on_status    ?? null}, auto_wa_on_status),
        default_eta_minutes  = COALESCE(${default_eta_minutes != null ? parseInt(String(default_eta_minutes)) : null}, default_eta_minutes),
        updated_at = NOW()
      WHERE id = 1
      RETURNING *
    `);
    res.json(rows.rows[0] ?? {});
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/* ═══════════════════════════════════════════════════════
   LIVE DASHBOARD — real-time overview
═══════════════════════════════════════════════════════ */
router.get("/admin/riders/live-dashboard", adminMiddleware, async (req, res) => {
  try {
    const stats = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM riders WHERE status = 'active') AS active_riders,
        (SELECT COUNT(*)::int FROM rider_deliveries WHERE status = 'assigned')         AS assigned,
        (SELECT COUNT(*)::int FROM rider_deliveries WHERE status = 'picked')           AS picked,
        (SELECT COUNT(*)::int FROM rider_deliveries WHERE status = 'out_for_delivery') AS out_for_delivery,
        (SELECT COUNT(*)::int FROM rider_deliveries WHERE status = 'near_customer')    AS near_customer,
        (SELECT COUNT(*)::int FROM rider_deliveries WHERE status = 'delivered' AND DATE(delivered_at) = CURRENT_DATE) AS delivered_today,
        (SELECT COUNT(*)::int FROM rider_deliveries WHERE status = 'failed'   AND DATE(updated_at)   = CURRENT_DATE) AS failed_today,
        (SELECT COALESCE(SUM(cod_amount),0) FROM rider_deliveries WHERE status = 'delivered' AND is_paid = false AND DATE(delivered_at) = CURRENT_DATE) AS cod_collected_today,
        (SELECT COUNT(*)::int FROM shopify_orders WHERE (shipping_address->>'city') ILIKE '%lahore%' AND id NOT IN (SELECT shopify_order_db_id FROM rider_deliveries WHERE shopify_order_db_id IS NOT NULL)) AS unassigned
    `);

    const activeRiders = await db.execute(sql`
      SELECT r.id, r.name, r.phone, r.delivery_area,
        COUNT(d.id) FILTER (WHERE d.status NOT IN ('delivered','returned','failed','cancelled')) AS active_orders,
        COUNT(d.id) FILTER (WHERE d.status = 'delivered' AND DATE(d.delivered_at) = CURRENT_DATE) AS delivered_today
      FROM riders r
      LEFT JOIN rider_deliveries d ON d.rider_id = r.id
      WHERE r.status = 'active'
      GROUP BY r.id
      ORDER BY active_orders DESC
    `);

    const recentActivity = await db.execute(sql`
      SELECT d.id, d.status, d.shopify_order_number, d.customer_name, d.updated_at,
             r.name AS rider_name
      FROM rider_deliveries d
      LEFT JOIN riders r ON r.id = d.rider_id
      ORDER BY d.updated_at DESC
      LIMIT 15
    `);

    res.json({
      stats: stats.rows[0] ?? {},
      activeRiders: activeRiders.rows ?? [],
      recentActivity: recentActivity.rows ?? [],
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/* ═══════════════════════════════════════════════════════
   COD REMINDER — send payment reminder to customer
═══════════════════════════════════════════════════════ */
router.post("/admin/riders/deliveries/:id/cod-reminder", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const delRows = await db.execute(sql`
      SELECT d.*, r.name AS rider_name, r.phone AS rider_phone
      FROM rider_deliveries d LEFT JOIN riders r ON r.id = d.rider_id
      WHERE d.id = ${id} LIMIT 1
    `);
    if (!delRows.rows.length) { res.status(404).json({ error: "Delivery not found" }); return; }
    const del = delRows.rows[0] as any;
    const cod = Number(del.cod_amount ?? 0);
    if (del.is_paid || cod === 0) { res.json({ ok: false, message: "Order is prepaid — no COD needed" }); return; }

    const customerPhone = del.customer_phone;
    if (!customerPhone) { res.status(400).json({ error: "No customer phone number" }); return; }

    const message = `💰 *Payment Reminder — KDF NUTS*
━━━━━━━━━━━━━━━━━━━
Hi ${del.customer_name ?? "Customer"}! 👋

Your KDF NUTS order *${del.shopify_order_number ?? del.id}* is on its way!

💵 *Please prepare:* PKR ${cod.toLocaleString()}
📋 *Payment Type:* Cash on Delivery

Our rider will be with you soon. Please keep the exact amount ready for a smooth handover. 🙏
━━━━━━━━━━━━━━━━━━━
🌰 KDF NUTS | Premium Dry Fruits`;

    const sent = await sendWhatsAppMessage({ phone: normalisePhone(customerPhone), message });
    if (sent) {
      await db.execute(sql`UPDATE rider_deliveries SET cod_reminder_sent_at = NOW(), updated_at = NOW() WHERE id = ${id}`);
    }
    res.json({ ok: sent, message: sent ? "COD reminder sent!" : "Send failed" });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/* ═══════════════════════════════════════════════════════
   UPDATE ETA — set delivery estimate
═══════════════════════════════════════════════════════ */
router.put("/admin/riders/deliveries/:id/eta", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { eta_minutes, notify_customer } = req.body;
    if (!eta_minutes || eta_minutes < 1) { res.status(400).json({ error: "eta_minutes required (min 1)" }); return; }

    await db.execute(sql`UPDATE rider_deliveries SET eta_minutes = ${parseInt(String(eta_minutes))}, updated_at = NOW() WHERE id = ${id}`);

    if (notify_customer) {
      const delRows = await db.execute(sql`
        SELECT d.*, r.name AS rider_name, r.phone AS rider_phone
        FROM rider_deliveries d LEFT JOIN riders r ON r.id = d.rider_id
        WHERE d.id = ${id} LIMIT 1
      `);
      const del = delRows.rows[0] as any;
      if (del?.customer_phone) {
        const etaText = eta_minutes <= 60 ? `${eta_minutes} minutes` : `${Math.floor(eta_minutes / 60)} hour(s)`;
        const message = `⏱️ *Delivery Update — KDF NUTS*

Hi ${del.customer_name ?? "Customer"}! Your order *${del.shopify_order_number ?? del.id}* will arrive in approximately *${etaText}*.

${del.rider_name ? `🛵 Rider: ${del.rider_name}` : ""}
💰 Amount ready: PKR ${Number(del.cod_amount ?? 0).toLocaleString()}

🌰 KDF NUTS | Premium Dry Fruits`;
        await sendWhatsAppMessage({ phone: normalisePhone(del.customer_phone), message }).catch(() => {});
      }
    }
    res.json({ ok: true, eta_minutes });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/* POST /api/admin/riders/assign */
router.post("/admin/riders/assign", adminMiddleware, async (req, res) => {
  try {
    const { shopify_order_db_id, rider_id, notes, cod_override, eta_minutes, send_customer_wa } = req.body;
    if (!shopify_order_db_id) { res.status(400).json({ error: "shopify_order_db_id required" }); return; }

    // Get order
    const orderRows = await db.execute(sql`
      SELECT * FROM shopify_orders WHERE id = ${parseInt(shopify_order_db_id)} LIMIT 1
    `);
    if (!orderRows.rows.length) { res.status(404).json({ error: "Order not found" }); return; }
    const order = orderRows.rows[0] as any;

    const addr = (() => {
      try {
        const a = typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address;
        return [a?.address1, a?.address2, a?.city].filter(Boolean).join(", ");
      } catch { return ""; }
    })();

    const codAmount = cod_override != null ? Number(cod_override) : Number(order.total_price ?? 0);
    const isPaid = order.financial_status === "paid";

    // Upsert delivery record
    const existing = await db.execute(sql`SELECT id FROM rider_deliveries WHERE shopify_order_db_id = ${parseInt(shopify_order_db_id)} LIMIT 1`);
    let delivery: any;
    if (existing.rows.length) {
      const upd = await db.execute(sql`
        UPDATE rider_deliveries SET
          rider_id = ${rider_id ? parseInt(rider_id) : null},
          status = 'assigned',
          assigned_at = NOW(),
          notes = COALESCE(${notes ?? null}, notes),
          updated_at = NOW()
        WHERE shopify_order_db_id = ${parseInt(shopify_order_db_id)}
        RETURNING *
      `);
      delivery = upd.rows[0];
    } else {
      const ins = await db.execute(sql`
        INSERT INTO rider_deliveries
          (rider_id, shopify_order_db_id, shopify_order_id, shopify_order_number,
           customer_name, customer_phone, delivery_address, city,
           cod_amount, is_paid, order_items, status, notes, assigned_at)
        VALUES (
          ${rider_id ? parseInt(rider_id) : null},
          ${parseInt(shopify_order_db_id)},
          ${order.shopify_order_id ?? null},
          ${order.order_number ?? null},
          ${order.customer_name ?? null},
          ${order.customer_phone ?? null},
          ${addr},
          ${order.shipping_address && (typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address)?.city || "Lahore"},
          ${codAmount},
          ${isPaid},
          ${JSON.stringify(order.line_items ?? [])},
          'assigned',
          ${notes ?? null},
          NOW()
        )
        RETURNING *
      `);
      delivery = ins.rows[0];
    }

    res.json({ ok: true, delivery });

    /* ── Non-blocking: Shopify sync + auto Customer WA + auto Rider WA ── */
    if (delivery) {
      setImmediate(async () => {
        try {
          let rider: any = null;
          if (rider_id) {
            const rr = await db.execute(sql`SELECT * FROM riders WHERE id = ${parseInt(rider_id)} LIMIT 1`);
            rider = rr.rows[0];
          }
          await syncDeliveryToShopify(buildSyncPayload("assigned", delivery, rider, notes));

          const settings = await getDeliverySettings();

          /* ── Auto WA to RIDER ── always send on assignment if rider has WA number */
          if (rider_id && rider) {
            const riderWaPhone = rider.whatsapp_number || rider.phone;
            if (riderWaPhone) {
              const riderMessage = buildRiderMessage(order, { ...delivery, rider_name: rider.name, rider_phone: rider.phone });
              const riderSent = await sendWhatsAppMessage({ phone: normalisePhone(riderWaPhone), message: riderMessage }).catch(() => false);
              if (riderSent) {
                await db.execute(sql`UPDATE rider_deliveries SET wa_sent_at = NOW(), updated_at = NOW() WHERE id = ${delivery.id}`);
              }
            }
          }

          /* ── Auto WA to CUSTOMER — if auto mode or explicitly requested ── */
          const shouldSendCustomerWa = send_customer_wa !== false && rider_id;
          if (shouldSendCustomerWa) {
            if (settings.auto_wa_on_assign || send_customer_wa === true) {
              const customerPhone = delivery.customer_phone || order.customer_phone;
              if (customerPhone) {
                const etaMins = eta_minutes ? parseInt(String(eta_minutes)) : settings.default_eta_minutes;
                const enrichedDel = { ...delivery, rider_name: rider?.name, rider_phone: rider?.phone || rider?.whatsapp_number };
                const message = buildCustomerStatusMessage("assigned", order, enrichedDel, etaMins);
                const sent = await sendWhatsAppMessage({ phone: normalisePhone(customerPhone), message }).catch(() => false);
                if (sent) {
                  await db.execute(sql`UPDATE rider_deliveries SET customer_wa_assigned_at = NOW(), updated_at = NOW() WHERE id = ${delivery.id}`);
                }
              }
            }
          }
        } catch (err: any) {
          logger.error(err, "rider-assign setImmediate error");
        }
      });
    }
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/admin/riders/auto-assign — Lahore orders without rider */
router.post("/admin/riders/auto-assign", adminMiddleware, async (req, res) => {
  try {
    const { limit: lim = 20 } = req.body;
    // Get unassigned Lahore orders
    const unassigned = await db.execute(sql`
      SELECT o.* FROM shopify_orders o
      LEFT JOIN rider_deliveries rd ON rd.shopify_order_db_id = o.id
      WHERE (o.shipping_address->>'city') ILIKE '%lahore%'
        AND rd.id IS NULL
        AND o.financial_status NOT IN ('refunded','voided')
      ORDER BY o.id DESC
      LIMIT ${parseInt(String(lim))}
    `);

    // Get active riders (round-robin)
    const ridersRows = await db.execute(sql`
      SELECT r.id, r.name,
        COUNT(d.id) FILTER (WHERE d.status NOT IN ('delivered','returned','failed')) AS active_count
      FROM riders r
      LEFT JOIN rider_deliveries d ON d.rider_id = r.id
      WHERE r.status = 'active'
      GROUP BY r.id
      ORDER BY active_count ASC
    `);
    const riders = ridersRows.rows as any[];

    if (!riders.length) res.json({ ok: false, message: "No active riders found", assigned: 0 });

    let assignedCount = 0;
    for (let i = 0; i < unassigned.rows.length; i++) {
      const order = unassigned.rows[i] as any;
      const rider = riders[i % riders.length];
      const addr = (() => {
        try {
          const a = typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address;
          return [a?.address1, a?.address2, a?.city].filter(Boolean).join(", ");
        } catch { return ""; }
      })();
      await db.execute(sql`
        INSERT INTO rider_deliveries
          (rider_id, shopify_order_db_id, shopify_order_id, shopify_order_number,
           customer_name, customer_phone, delivery_address, city,
           cod_amount, is_paid, order_items, status, assigned_at)
        VALUES (
          ${rider.id},
          ${order.id},
          ${order.shopify_order_id ?? null},
          ${order.order_number ?? null},
          ${order.customer_name ?? null},
          ${order.customer_phone ?? null},
          ${addr},
          'Lahore',
          ${Number(order.total_price ?? 0)},
          ${order.financial_status === "paid"},
          ${JSON.stringify(order.line_items ?? [])},
          'assigned',
          NOW()
        )
        ON CONFLICT DO NOTHING
      `);

      /* ── Non-blocking Shopify sync per assignment ── */
      setImmediate(async () => {
        try {
          const delRow = await db.execute(sql`
            SELECT * FROM rider_deliveries
            WHERE shopify_order_db_id = ${order.id} LIMIT 1
          `);
          const del = delRow.rows[0] as any;
          if (del) {
            await syncDeliveryToShopify(buildSyncPayload("assigned", del, rider));
          }
        } catch {}
      });

      assignedCount++;
    }

    res.json({ ok: true, assigned: assignedCount, total: unassigned.rows.length });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   SEND WHATSAPP TO RIDER
═══════════════════════════════════════════════════════ */

/* POST /api/admin/riders/deliveries/:id/send-wa */
router.post("/admin/riders/deliveries/:id/send-wa", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const delRows = await db.execute(sql`SELECT * FROM rider_deliveries WHERE id = ${id} LIMIT 1`);
    if (!delRows.rows.length) { res.status(404).json({ error: "Delivery not found" }); return; }
    const delivery = delRows.rows[0] as any;

    if (!delivery.rider_id) { res.status(400).json({ error: "No rider assigned to this delivery" }); return; }

    const riderRows = await db.execute(sql`SELECT * FROM riders WHERE id = ${delivery.rider_id} LIMIT 1`);
    if (!riderRows.rows.length) { res.status(404).json({ error: "Rider not found" }); return; }
    const rider = riderRows.rows[0] as any;

    const orderRows = await db.execute(sql`SELECT * FROM shopify_orders WHERE id = ${delivery.shopify_order_db_id} LIMIT 1`);
    const order = orderRows.rows?.[0] as any ?? {};

    const waPhone = rider.whatsapp_number || rider.phone;
    if (!waPhone) { res.status(400).json({ error: "Rider has no WhatsApp number configured" }); return; }

    const message = buildRiderMessage(order, delivery);
    const sent = await sendWhatsAppMessage({ phone: normalisePhone(waPhone), message });

    if (sent) {
      await db.execute(sql`UPDATE rider_deliveries SET wa_sent_at = NOW(), updated_at = NOW() WHERE id = ${id}`);
    }

    res.json({ ok: sent, message: sent ? "WhatsApp sent to rider!" : "WhatsApp send failed — check WA settings" });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/admin/riders/orders/:orderId/send-wa — by shopify order DB id */
router.post("/admin/riders/orders/:orderId/send-wa", adminMiddleware, async (req, res) => {
  try {
    const orderId = parseInt(req.params["orderId"] as string);
    const delRows = await db.execute(sql`SELECT * FROM rider_deliveries WHERE shopify_order_db_id = ${orderId} LIMIT 1`);
    if (!delRows.rows.length) { res.status(404).json({ error: "No delivery record found — assign a rider first" }); return; }
    const delivery = delRows.rows[0] as any;

    if (!delivery.rider_id) { res.status(400).json({ error: "No rider assigned" }); return; }
    const riderRows = await db.execute(sql`SELECT * FROM riders WHERE id = ${delivery.rider_id} LIMIT 1`);
    if (!riderRows.rows.length) { res.status(404).json({ error: "Rider not found" }); return; }
    const rider = riderRows.rows[0] as any;

    const orderRows = await db.execute(sql`SELECT * FROM shopify_orders WHERE id = ${orderId} LIMIT 1`);
    const order = orderRows.rows?.[0] as any ?? {};

    const waPhone = rider.whatsapp_number || rider.phone;
    if (!waPhone) { res.status(400).json({ error: "Rider has no WhatsApp number" }); return; }

    const message = buildRiderMessage(order, delivery);
    const sent = await sendWhatsAppMessage({ phone: normalisePhone(waPhone), message });

    if (sent) await db.execute(sql`UPDATE rider_deliveries SET wa_sent_at = NOW(), updated_at = NOW() WHERE id = ${delivery.id}`);
    res.json({ ok: sent, message: sent ? "WhatsApp sent to rider!" : "WhatsApp send failed — check WA settings" });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   STATUS UPDATES
═══════════════════════════════════════════════════════ */

/* PUT /api/admin/riders/deliveries/:id/status */
router.put("/admin/riders/deliveries/:id/status", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { status, notes, skip_customer_wa } = req.body;
    const valid = ["assigned","picked","out_for_delivery","near_customer","delivered","failed","returned","cancelled","delayed","rescheduled"];
    if (!valid.includes(status)) { res.status(400).json({ error: `status must be one of: ${valid.join(", ")}` }); return; }

    const tsField: Record<string, string> = {
      picked:           "picked_at",
      out_for_delivery: "out_for_delivery_at",
      near_customer:    "near_customer_at",
      delivered:        "delivered_at",
      failed:           "failed_at",
      returned:         "returned_at",
      delayed:          "delayed_at",
    };

    let extra = "";
    if (tsField[status]) extra = `, ${tsField[status]} = NOW()`;

    await db.execute(sql.raw(`
      UPDATE rider_deliveries SET status = '${status}', updated_at = NOW() ${extra} WHERE id = ${id}
    `));

    res.json({ ok: true, status });

    /* ── Non-blocking: Shopify sync + Customer WA for ALL status changes ── */
    setImmediate(async () => {
      try {
        const delRow = await db.execute(sql`
          SELECT d.*, r.name AS rider_name, r.phone AS rider_phone, r.whatsapp_number AS rider_wa
          FROM rider_deliveries d
          LEFT JOIN riders r ON r.id = d.rider_id
          WHERE d.id = ${id} LIMIT 1
        `);
        const del = delRow.rows[0] as any;
        if (!del) return;

        const rider = del.rider_name ? { name: del.rider_name, phone: del.rider_phone } : undefined;
        await syncDeliveryToShopify(buildSyncPayload(status as SyncAction, del, rider, notes)).catch(() => {});

        /* ── Auto Customer WA for every status (if not suppressed) ── */
        if (!skip_customer_wa) {
          try {
            const settings = await getDeliverySettings();
            const shouldNotify = settings.auto_wa_on_status;

            if (shouldNotify) {
              const orderRows = await db.execute(sql`
                SELECT * FROM shopify_orders WHERE id = ${del.shopify_order_db_id} LIMIT 1
              `);
              const order = orderRows.rows[0] as any;

              const customerPhone = del.customer_phone || (() => {
                try {
                  const a = typeof order?.shipping_address === "string" ? JSON.parse(order.shipping_address) : order?.shipping_address;
                  return a?.phone;
                } catch { return null; }
              })();

              if (customerPhone) {
                const etaMins = del.eta_minutes ?? settings.default_eta_minutes;
                const message = buildCustomerStatusMessage(status, order, del, etaMins);
                const sent = await sendWhatsAppMessage({ phone: normalisePhone(customerPhone), message }).catch(() => false);
                if (sent) {
                  await db.execute(sql`
                    UPDATE rider_deliveries SET customer_wa_status_at = NOW(), updated_at = NOW() WHERE id = ${id}
                  `).catch(() => {});
                }
              }
            }

            /* ── Extra: for delivered — also send review request ── */
            if (status === "delivered") {
              try {
                const orderRows = await db.execute(sql`SELECT order_number, shipping_address FROM shopify_orders WHERE id = ${del.shopify_order_db_id} LIMIT 1`);
                const order = orderRows.rows[0] as any;
                if (order) {
                  const addr = typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address;
                  const phone = del.customer_phone || addr?.phone;
                  if (phone && settings.auto_wa_on_status) {
                    await sendReviewRequest({ phone: normalisePhone(phone), orderNumber: order.order_number ?? del.id, customerName: del.customer_name }).catch(() => {});
                  }
                }
              } catch {}
            }
          } catch {}
        }
      } catch {}
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   INVOICE HTML — server-rendered
═══════════════════════════════════════════════════════ */

/* GET /api/admin/riders/orders/:orderId/invoice — accepts ?token= for browser direct-open */
router.get("/admin/riders/orders/:orderId/invoice", async (req: any, res): Promise<void> => {
  const { verifyToken } = await import("../lib/auth.js");
  const raw = (req.query.token as string) || (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!raw) { res.status(401).send("<h3>Unauthorized</h3>"); return; }
  try { const u = verifyToken(raw); if (u.role !== "admin") { res.status(403).send("<h3>Forbidden</h3>"); return; } }
  catch { res.status(401).send("<h3>Invalid token</h3>"); return; }
  try {
    const orderId = parseInt(req.params["orderId"] as string);
    const orderRows = await db.execute(sql`SELECT * FROM shopify_orders WHERE id = ${orderId} LIMIT 1`);
    if (!orderRows.rows.length) res.status(404).json({ error: "Order not found" });
    const order = orderRows.rows[0] as any;

    const delRows = await db.execute(sql`
      SELECT d.*, r.name AS rider_name, r.phone AS rider_phone
      FROM rider_deliveries d
      LEFT JOIN riders r ON r.id = d.rider_id
      WHERE d.shopify_order_db_id = ${orderId} LIMIT 1
    `);
    const delivery = delRows.rows?.[0] as any ?? {};

    const addr = (() => {
      try {
        const a = typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address;
        return [a?.address1, a?.address2, a?.city, a?.country].filter(Boolean).join(", ");
      } catch { return ""; }
    })();

    const items = (() => {
      try {
        const arr = typeof order.line_items === "string" ? JSON.parse(order.line_items) : order.line_items;
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    })();

    const deliveryStatus = delivery.status ?? "pending";
    const statusIndex: Record<string,number> = { pending: 0, assigned: 1, picked: 2, out_for_delivery: 3, delivered: 4, failed: 4, returned: 4 };
    const curStep = statusIndex[deliveryStatus] ?? 0;
    const isPaid  = order.financial_status === "paid";
    const isCOD   = !isPaid;
    const codAmt  = Number(delivery.cod_amount ?? order.total_price ?? 0);
    const totalAmt = Number(order.total_price ?? 0);
    const orderDate = new Date(order.created_at ?? Date.now()).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KDF NUTS — Invoice ${order.order_number}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --green: #16a34a; --green-light: #dcfce7; --green-dark: #14532d;
    --amber: #d97706; --amber-light: #fef3c7;
    --blue: #2563eb; --blue-light: #dbeafe;
    --gray: #6b7280; --border: #e5e7eb; --bg: #f9fafb; --text: #111827;
  }
  body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; }

  /* ── HEADER ── */
  .header { background: linear-gradient(135deg, #052e16 0%, #14532d 60%, #166534 100%); color: #fff; padding: 28px 36px 0; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .logo-box { width: 52px; height: 52px; background: #16a34a; border-radius: 14px; display: flex; align-items: center; justify-content: center; border: 2px solid rgba(255,255,255,0.3); }
  .logo-text { font-size: 16px; font-weight: 900; color: #fff; letter-spacing: 1px; line-height: 1; }
  .brand-name { font-size: 22px; font-weight: 800; letter-spacing: 0.3px; }
  .brand-sub  { font-size: 11px; color: rgba(255,255,255,0.65); margin-top: 3px; }
  .inv-right { text-align: right; }
  .inv-label { font-size: 11px; letter-spacing: 2px; font-weight: 700; color: rgba(255,255,255,0.55); text-transform: uppercase; }
  .inv-number { font-size: 26px; font-weight: 900; letter-spacing: 1px; margin-top: 2px; }
  .inv-date { font-size: 12px; color: rgba(255,255,255,0.65); margin-top: 4px; }
  .payment-badge { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; padding: 4px 14px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
  .badge-paid { background: #16a34a; color: #fff; border: 1.5px solid rgba(255,255,255,0.4); }
  .badge-cod  { background: #d97706; color: #fff; border: 1.5px solid rgba(255,255,255,0.4); }

  /* ── PROGRESS BAR ── */
  .progress-bar { display: flex; padding: 0 36px; background: rgba(0,0,0,0.25); }
  .step { flex: 1; text-align: center; padding: 10px 4px 12px; position: relative; }
  .step::after { content: ""; position: absolute; top: 18px; left: 50%; width: 100%; height: 2px; background: rgba(255,255,255,0.15); }
  .step:last-child::after { display: none; }
  .step-dot { width: 12px; height: 12px; border-radius: 50%; margin: 0 auto 6px; background: rgba(255,255,255,0.2); position: relative; z-index: 1; }
  .step-label { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.45); letter-spacing: 0.3px; }
  .step.done .step-dot { background: #86efac; }
  .step.done .step-label { color: #86efac; }
  .step.done::after { background: #86efac; }
  .step.active .step-dot { background: #fff; box-shadow: 0 0 0 4px rgba(255,255,255,0.25); }
  .step.active .step-label { color: #fff; font-weight: 700; }

  /* ── BODY ── */
  .body { max-width: 800px; margin: 0 auto; padding: 28px 36px; }

  /* Info grid */
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 22px; }
  .info-card { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; }
  .info-label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--gray); margin-bottom: 8px; }
  .info-name { font-size: 15px; font-weight: 700; color: var(--text); }
  .info-sub  { font-size: 12.5px; color: var(--gray); margin-top: 3px; line-height: 1.5; }
  .info-phone { display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--green); font-weight: 600; margin-top: 4px; }

  /* Items */
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--gray); margin-bottom: 10px; }
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
  .items-table thead { background: #f1f5f9; }
  .items-table th { padding: 10px 14px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #64748b; text-align: left; }
  .items-table th.r { text-align: right; }
  .items-table td { padding: 11px 14px; font-size: 13.5px; border-top: 1px solid var(--border); }
  .items-table td.r { text-align: right; font-weight: 600; }
  .items-table tbody tr:hover { background: #fafafa; }
  .item-name { font-weight: 600; color: var(--text); }
  .item-sku  { font-size: 11px; color: #94a3b8; margin-top: 2px; }

  /* Totals */
  .totals-box { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; }
  .total-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 13.5px; color: var(--gray); }
  .total-row + .total-row { border-top: 1px solid #f3f4f6; }
  .total-grand { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 12px; border-top: 2px solid var(--border); }
  .grand-label { font-size: 15px; font-weight: 700; color: var(--text); }
  .grand-value { font-size: 22px; font-weight: 900; }
  .grand-paid { color: var(--green); }
  .grand-cod  { color: var(--amber); }
  .cod-note { font-size: 11px; font-weight: 600; letter-spacing: 0.5px; padding: 2px 8px; border-radius: 999px; }
  .cod-note-paid { background: var(--green-light); color: var(--green); }
  .cod-note-cod  { background: var(--amber-light); color: var(--amber); }

  /* Rider card */
  .rider-card { background: linear-gradient(135deg, #eff6ff, #f0fdf4); border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; }
  .rider-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .rider-avatar { width: 32px; height: 32px; border-radius: 8px; background: #2563eb; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; }
  .rider-badge-label { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #2563eb; }
  .rider-name { font-size: 15px; font-weight: 700; color: var(--text); }
  .rider-fields { display: flex; gap: 24px; flex-wrap: wrap; }
  .rider-field span { font-size: 10px; color: var(--gray); display: block; margin-bottom: 2px; }
  .rider-field strong { font-size: 13px; font-weight: 600; color: var(--text); }

  /* COD collection box */
  .cod-box { background: linear-gradient(135deg, #fffbeb, #fef3c7); border: 2px solid #fcd34d; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
  .cod-box-left h4 { font-size: 13px; font-weight: 700; color: #92400e; }
  .cod-box-left p { font-size: 12px; color: #b45309; margin-top: 2px; }
  .cod-amount-big { font-size: 28px; font-weight: 900; color: #92400e; }

  /* Footer */
  .footer { background: #fff; border-top: 1px solid var(--border); padding: 16px 36px; display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: #9ca3af; }
  .footer strong { color: var(--gray); }

  /* Action buttons */
  .actions { text-align: center; margin: 24px 0; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; transition: opacity 0.15s; }
  .btn:hover { opacity: 0.9; }
  .btn-print { background: var(--green); color: #fff; }
  .btn-close  { background: #f1f5f9; color: #374151; border: 1px solid var(--border); }

  /* Thermal print */
  @media print {
    body { background: #fff; font-size: 12px; }
    .actions, .no-print { display: none !important; }
    .header { padding: 16px 20px 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .body { padding: 16px 20px; }
    .footer { padding: 12px 20px; }
    .info-grid { grid-template-columns: 1fr 1fr; }
    .grand-value { font-size: 18px; }
    @page { margin: 0.5cm; size: A4; }
  }
</style>
</head>
<body>
<!-- HEADER -->
<div class="header">
  <div class="header-top">
    <div class="brand">
      <div class="logo-box"><div class="logo-text">KDF</div></div>
      <div>
        <div class="brand-name">KDF NUTS</div>
        <div class="brand-sub">Premium Dry Fruits &amp; Nuts · Lahore, Pakistan</div>
      </div>
    </div>
    <div class="inv-right">
      <div class="inv-label">Delivery Invoice</div>
      <div class="inv-number">${order.order_number}</div>
      <div class="inv-date">${orderDate}</div>
      <div>
        <span class="payment-badge ${isPaid ? "badge-paid" : "badge-cod"}">
          ${isPaid ? "✓ PAID" : "💵 CASH ON DELIVERY"}
        </span>
      </div>
    </div>
  </div>

  <!-- Delivery Progress -->
  <div class="progress-bar">
    ${["Ordered","Assigned","Picked Up","On Route","Delivered"].map((s, i) => {
      const cls = i < curStep ? "done" : i === curStep ? "active" : "";
      return `<div class="step ${cls}"><div class="step-dot"></div><div class="step-label">${s}</div></div>`;
    }).join("")}
  </div>
</div>

<!-- BODY -->
<div class="body">
  <!-- Customer & Address -->
  <div class="info-grid" style="margin-top:20px">
    <div class="info-card">
      <div class="info-label">Customer</div>
      <div class="info-name">${order.customer_name ?? "—"}</div>
      <div class="info-phone">📞 ${order.customer_phone ?? "—"}</div>
    </div>
    <div class="info-card">
      <div class="info-label">Delivery Address</div>
      <div class="info-name" style="font-size:13px;line-height:1.5">${addr || "Lahore, Pakistan"}</div>
    </div>
  </div>

  <!-- Order Items -->
  <div class="section-title">Order Items</div>
  <table class="items-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Product</th>
        <th class="r">Qty</th>
        <th class="r">Unit Price</th>
        <th class="r">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${items.length > 0 ? items.map((item: any, idx: number) => `
        <tr>
          <td style="color:#94a3b8;font-size:12px">${idx + 1}</td>
          <td>
            <div class="item-name">${item.name ?? item.title ?? "—"}</div>
            ${item.sku ? `<div class="item-sku">SKU: ${item.sku}</div>` : ""}
          </td>
          <td class="r">${item.quantity ?? 1}</td>
          <td class="r">PKR ${Number(item.price ?? 0).toLocaleString()}</td>
          <td class="r">PKR ${(Number(item.price ?? 0) * Number(item.quantity ?? 1)).toLocaleString()}</td>
        </tr>
      `).join("") : `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">No items</td></tr>`}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals-box">
    <div class="total-row"><span>Subtotal</span><span>PKR ${totalAmt.toLocaleString()}</span></div>
    <div class="total-row"><span>Delivery Charges</span><span style="color:#16a34a;font-weight:600">FREE</span></div>
    <div class="total-grand">
      <div>
        <div class="grand-label">Total Amount</div>
        <span class="cod-note ${isPaid ? "cod-note-paid" : "cod-note-cod"}">${isPaid ? "PREPAID" : "Collect on Delivery"}</span>
      </div>
      <div class="grand-value ${isPaid ? "grand-paid" : "grand-cod"}">PKR ${codAmt.toLocaleString()}</div>
    </div>
  </div>

  <!-- COD Collection Box (only for COD) -->
  ${isCOD ? `
  <div class="cod-box">
    <div class="cod-box-left">
      <h4>💵 Cash Collection Required</h4>
      <p>Please collect this amount from the customer upon delivery</p>
    </div>
    <div class="cod-amount-big">PKR ${codAmt.toLocaleString()}</div>
  </div>
  ` : ""}

  <!-- Rider Info -->
  ${delivery.rider_name ? `
  <div class="rider-card">
    <div class="rider-header">
      <div class="rider-avatar">${delivery.rider_name.charAt(0).toUpperCase()}</div>
      <div>
        <div class="rider-badge-label">🛵 Assigned Rider</div>
        <div class="rider-name">${delivery.rider_name}</div>
      </div>
    </div>
    <div class="rider-fields">
      <div class="rider-field"><span>Phone</span><strong>${delivery.rider_phone ?? "—"}</strong></div>
      <div class="rider-field"><span>Status</span><strong>${(delivery.status ?? "pending").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</strong></div>
      ${delivery.assigned_at ? `<div class="rider-field"><span>Assigned At</span><strong>${new Date(delivery.assigned_at).toLocaleString("en-PK", { day:"numeric",month:"short",hour:"2-digit",minute:"2-digit" })}</strong></div>` : ""}
      ${delivery.delivered_at ? `<div class="rider-field"><span>Delivered At</span><strong>${new Date(delivery.delivered_at).toLocaleString("en-PK", { day:"numeric",month:"short",hour:"2-digit",minute:"2-digit" })}</strong></div>` : ""}
    </div>
  </div>
  ` : `
  <div style="background:#f8fafc;border:1px dashed #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:20px;text-align:center;color:#94a3b8;font-size:13px">
    No rider assigned yet
  </div>
  `}

  <!-- Actions -->
  <div class="actions no-print">
    <button class="btn btn-print" onclick="window.print()">🖨&nbsp; Print Invoice</button>
    <button class="btn btn-close" onclick="window.close()">✕&nbsp; Close</button>
  </div>
</div>

<!-- FOOTER -->
<div class="footer">
  <div><strong>KDF NUTS</strong> · Premium Dry Fruits &amp; Nuts · Lahore, Pakistan</div>
  <div>Generated ${new Date().toLocaleString("en-PK", { day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit" })}</div>
</div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   RIDER ACCOUNTING — per-rider and summary
═══════════════════════════════════════════════════════ */

/* GET /api/admin/riders/accounting — all-riders accounting summary */
router.get("/admin/riders/accounting", adminMiddleware, async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        r.id, r.name, r.phone, r.delivery_area, r.status,
        r.delivery_charge_per_order,
        COUNT(d.id) FILTER (WHERE d.status = 'delivered') AS delivered_count,
        COUNT(d.id) FILTER (WHERE d.status = 'returned') AS returned_count,
        COUNT(d.id) FILTER (WHERE d.status = 'failed') AS failed_count,
        COUNT(d.id) FILTER (WHERE d.status NOT IN ('delivered','returned','failed')) AS active_count,
        COALESCE(SUM(CASE WHEN d.status = 'delivered' THEN COALESCE(d.delivery_charge, r.delivery_charge_per_order, 500) ELSE 0 END), 0) AS total_earnings,
        COALESCE(SUM(CASE WHEN d.status = 'delivered' AND d.rider_payment_status = 'pending' THEN COALESCE(d.delivery_charge, r.delivery_charge_per_order, 500) ELSE 0 END), 0) AS pending_settlement,
        COALESCE(SUM(CASE WHEN d.status = 'delivered' AND d.rider_payment_status = 'paid' THEN COALESCE(d.delivery_charge, r.delivery_charge_per_order, 500) ELSE 0 END), 0) AS paid_settlement,
        COALESCE(SUM(CASE WHEN d.status = 'delivered' AND d.is_paid = false THEN d.cod_amount ELSE 0 END), 0) AS cod_collected,
        COUNT(d.id) FILTER (WHERE d.status = 'delivered' AND d.rider_payment_status = 'pending') AS pending_count
      FROM riders r
      LEFT JOIN rider_deliveries d ON d.rider_id = r.id
      GROUP BY r.id
      ORDER BY total_earnings DESC
    `);

    const totals = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN d.status = 'delivered' THEN COALESCE(d.delivery_charge, r.delivery_charge_per_order, 500) ELSE 0 END), 0) AS total_earnings,
        COALESCE(SUM(CASE WHEN d.status = 'delivered' AND d.rider_payment_status = 'pending' THEN COALESCE(d.delivery_charge, r.delivery_charge_per_order, 500) ELSE 0 END), 0) AS pending_settlement,
        COALESCE(SUM(CASE WHEN d.status = 'delivered' AND d.is_paid = false THEN d.cod_amount ELSE 0 END), 0) AS total_cod_collected,
        COUNT(d.id) FILTER (WHERE d.status = 'delivered') AS total_delivered
      FROM rider_deliveries d
      JOIN riders r ON r.id = d.rider_id
    `);

    res.json({ riders: rows.rows ?? [], totals: totals.rows?.[0] ?? {} });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/admin/riders/:id/accounting — per-rider detailed accounting */
router.get("/admin/riders/:id/accounting", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const riderRows = await db.execute(sql`SELECT * FROM riders WHERE id = ${id} LIMIT 1`);
    if (!riderRows.rows.length) res.status(404).json({ error: "Rider not found" });
    const rider = riderRows.rows[0] as any;

    const deliveries = await db.execute(sql`
      SELECT d.*, o.order_number, o.total_price, o.financial_status, o.shipping_address, o.line_items
      FROM rider_deliveries d
      LEFT JOIN shopify_orders o ON o.id = d.shopify_order_db_id
      WHERE d.rider_id = ${id}
      ORDER BY d.created_at DESC
    `);

    const summary = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
        COUNT(*) FILTER (WHERE status = 'returned')::int AS returned,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status NOT IN ('delivered','returned','failed'))::int AS active,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN COALESCE(delivery_charge, ${Number(rider.delivery_charge_per_order ?? 500)}) ELSE 0 END), 0) AS total_earnings,
        COALESCE(SUM(CASE WHEN status = 'delivered' AND rider_payment_status = 'pending' THEN COALESCE(delivery_charge, ${Number(rider.delivery_charge_per_order ?? 500)}) ELSE 0 END), 0) AS pending_settlement,
        COALESCE(SUM(CASE WHEN status = 'delivered' AND rider_payment_status = 'paid' THEN COALESCE(delivery_charge, ${Number(rider.delivery_charge_per_order ?? 500)}) ELSE 0 END), 0) AS paid_out,
        COALESCE(SUM(CASE WHEN status = 'delivered' AND is_paid = false THEN cod_amount ELSE 0 END), 0) AS cod_collected,
        COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at - assigned_at)) / 60) FILTER (WHERE status = 'delivered' AND delivered_at IS NOT NULL AND assigned_at IS NOT NULL), 0)::int AS avg_delivery_minutes
      FROM rider_deliveries
      WHERE rider_id = ${id}
    `);

    res.json({ rider, deliveries: deliveries.rows ?? [], summary: summary.rows?.[0] ?? {} });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/admin/riders/:id/settle — mark pending deliveries as paid to rider */
router.post("/admin/riders/:id/settle", adminMiddleware, async (req, res) => {
  try {
    const riderId = parseInt(req.params["id"] as string);
    const { delivery_ids } = req.body; // optional: specific delivery IDs; else all pending
    let whereExtra = sql``;
    if (delivery_ids && Array.isArray(delivery_ids) && delivery_ids.length) {
      const ids = delivery_ids.map(Number).join(",");
      whereExtra = sql.raw(` AND id IN (${ids})`);
    }
    const result = await db.execute(sql`
      UPDATE rider_deliveries
      SET rider_payment_status = 'paid', rider_payment_date = NOW(), updated_at = NOW()
      WHERE rider_id = ${riderId}
        AND status = 'delivered'
        AND rider_payment_status = 'pending'
        ${whereExtra}
      RETURNING id
    `);
    res.json({ ok: true, settled: result.rows.length });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/admin/riders/:id/sheet — printable HTML delivery sheet */
router.get("/admin/riders/:id/sheet", async (req: any, res): Promise<void> => {
  const { verifyToken } = await import("../lib/auth.js");
  const raw = (req.query.token as string) || (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!raw) { res.status(401).send("<h3>Unauthorized</h3>"); return; }
  try { const u = verifyToken(raw); if (u.role !== "admin") { res.status(403).send("<h3>Forbidden</h3>"); return; } }
  catch { res.status(401).send("<h3>Invalid token</h3>"); return; }

  try {
    const riderId = parseInt(req.params["id"] as string);
    const dateFilter = req.query.date as string | undefined; // YYYY-MM-DD

    const riderRows = await db.execute(sql`SELECT * FROM riders WHERE id = ${riderId} LIMIT 1`);
    if (!riderRows.rows.length) { res.status(404).send("<h3>Rider not found</h3>"); return; }
    const rider = riderRows.rows[0] as any;

    const dateClause = dateFilter
      ? `AND DATE(d.assigned_at) = '${dateFilter.replace(/'/g, "''")}'`
      : "AND DATE(d.assigned_at) = CURRENT_DATE";

    const deliveries = await db.execute(sql.raw(`
      SELECT d.*, o.order_number, o.total_price, o.financial_status, o.shipping_address, o.line_items
      FROM rider_deliveries d
      LEFT JOIN shopify_orders o ON o.id = d.shopify_order_db_id
      WHERE d.rider_id = ${riderId} ${dateClause}
      ORDER BY d.id ASC
    `));
    const rows = deliveries.rows as any[];

    const deliveryCharge = Number(rider.delivery_charge_per_order ?? 500);
    const deliveredRows = rows.filter(r => r.status === "delivered");
    const totalEarnings = deliveredRows.length * deliveryCharge;
    const totalCOD = rows.reduce((s: number, r: any) => r.is_paid ? s : s + Number(r.cod_amount ?? 0), 0);
    const sheetDate = dateFilter || new Date().toISOString().split("T")[0];

    const rowsHtml = rows.map((d: any, idx: number) => {
      const addr = (() => {
        try {
          const a = typeof d.shipping_address === "string" ? JSON.parse(d.shipping_address) : d.shipping_address;
          return [a?.address1, a?.address2, a?.city].filter(Boolean).join(", ");
        } catch { return d.delivery_address ?? "—"; }
      })();
      const statusColor: Record<string, string> = {
        delivered: "#d1fae5", failed: "#fee2e2", returned: "#fef3c7",
        out_for_delivery: "#fed7aa", picked: "#e0e7ff", assigned: "#dbeafe"
      };
      return `<tr style="background:${statusColor[d.status] ?? "#fff"}">
        <td style="text-align:center">${idx + 1}</td>
        <td><strong>${d.shopify_order_number ?? d.order_number ?? "—"}</strong></td>
        <td>${d.customer_name ?? "—"}</td>
        <td>${d.customer_phone ?? "—"}</td>
        <td style="font-size:11px">${addr}</td>
        <td style="text-align:center">${d.is_paid ? '<span style="color:#065f46;font-weight:700">PAID</span>' : '<span style="color:#92400e;font-weight:700">COD</span>'}</td>
        <td style="text-align:right;font-weight:600">${d.is_paid ? "—" : `PKR ${Number(d.cod_amount ?? 0).toLocaleString()}`}</td>
        <td style="text-align:center;font-weight:700;color:${d.status === 'delivered' ? '#065f46' : d.status === 'failed' ? '#dc2626' : '#1d4ed8'}">${d.status?.replace(/_/g, " ").toUpperCase() ?? "—"}</td>
        <td style="text-align:right">${d.delivered_at ? new Date(d.delivered_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
        <td><input type="checkbox" style="width:16px;height:16px" /></td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Delivery Sheet — ${rider.name} — ${sheetDate}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; background: #f8f9fa; color: #111; }
  .page { max-width: 1000px; margin: 0 auto; background: #fff; padding: 0; }
  .header { background: linear-gradient(135deg, #1e3a5f, #2c5282); color: #fff; padding: 24px 32px; }
  .header-grid { display: grid; grid-template-columns: 1fr auto; gap: 20px; align-items: start; }
  .brand { font-size: 22px; font-weight: 900; letter-spacing: 1px; }
  .brand-sub { font-size: 11px; opacity: 0.7; margin-top: 2px; }
  .sheet-title { font-size: 16px; font-weight: 700; text-align: right; }
  .sheet-sub { font-size: 12px; opacity: 0.8; text-align: right; margin-top: 4px; }
  .rider-bar { background: rgba(255,255,255,0.12); border-radius: 10px; padding: 14px 20px; margin-top: 16px; display: flex; gap: 32px; flex-wrap: wrap; }
  .rf span { display: block; font-size: 10px; opacity: 0.7; text-transform: uppercase; letter-spacing: 1px; }
  .rf strong { font-size: 15px; font-weight: 700; }
  .body { padding: 24px 32px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f1f5f9; font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #64748b; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e2e8f0; }
  td { padding: 9px 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; vertical-align: middle; }
  tr:hover td { background: #f8fafc; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .scard { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; text-align: center; }
  .scard .val { font-size: 22px; font-weight: 900; color: #1e3a5f; }
  .scard .lbl { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 4px; }
  .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 32px; display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; }
  .sig-box { border: 1px dashed #cbd5e1; border-radius: 8px; padding: 20px; margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .sig-field { text-align: center; }
  .sig-line { border-bottom: 1px solid #94a3b8; margin-top: 32px; margin-bottom: 6px; }
  .sig-label { font-size: 11px; color: #64748b; }
  .no-print { text-align: center; padding: 20px; }
  @media print {
    body { background: #fff; }
    .no-print { display: none; }
    .page { max-width: 100%; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-grid">
      <div>
        <div class="brand">KDF NUTS</div>
        <div class="brand-sub">Premium Dry Fruits &amp; Nuts — Lahore Local Delivery</div>
      </div>
      <div>
        <div class="sheet-title">🛵 RIDER DELIVERY SHEET</div>
        <div class="sheet-sub">Date: ${sheetDate} | Generated: ${new Date().toLocaleString("en-PK")}</div>
      </div>
    </div>
    <div class="rider-bar">
      <div class="rf"><span>Rider Name</span><strong>${rider.name}</strong></div>
      <div class="rf"><span>Phone</span><strong>${rider.phone}</strong></div>
      <div class="rf"><span>Area</span><strong>${rider.delivery_area || "All Lahore"}</strong></div>
      <div class="rf"><span>Vehicle</span><strong>${rider.vehicle_type || "Bike"}</strong></div>
      <div class="rf"><span>Delivery Charge</span><strong>PKR ${deliveryCharge}/order</strong></div>
    </div>
  </div>

  <div class="body">
    <!-- Summary -->
    <div class="summary">
      <div class="scard"><div class="val">${rows.length}</div><div class="lbl">Total Orders</div></div>
      <div class="scard"><div class="val" style="color:#059669">${deliveredRows.length}</div><div class="lbl">Delivered</div></div>
      <div class="scard"><div class="val" style="color:#d97706">PKR ${totalCOD.toLocaleString()}</div><div class="lbl">COD to Collect</div></div>
      <div class="scard"><div class="val" style="color:#7c3aed">PKR ${totalEarnings.toLocaleString()}</div><div class="lbl">Rider Earnings</div></div>
    </div>

    <!-- Delivery Table -->
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Order #</th>
          <th>Customer</th>
          <th>Phone</th>
          <th>Address</th>
          <th>Payment</th>
          <th style="text-align:right">COD Amount</th>
          <th style="text-align:center">Status</th>
          <th style="text-align:right">Del. Time</th>
          <th style="text-align:center">✓</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="10" style="text-align:center;padding:20px;color:#9ca3af">No orders for this date</td></tr>'}
      </tbody>
    </table>

    <!-- Signature boxes -->
    <div class="sig-box">
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Rider Signature — ${rider.name}</div>
      </div>
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Supervisor Signature</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>KDF NUTS Logistics — Lahore, Pakistan</span>
    <span>${rider.name} | ${sheetDate} | ${rows.length} orders assigned</span>
  </div>

  <div class="no-print" style="padding:20px;text-align:center">
    <button onclick="window.print()" style="background:#1e3a5f;color:#fff;border:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-right:10px">🖨 Print Sheet</button>
    <button onclick="window.close()" style="background:#f1f5f9;color:#374151;border:1px solid #e2e8f0;padding:12px 20px;border-radius:8px;font-size:14px;cursor:pointer">Close</button>
  </div>
</div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err: any) {
    req.log.error(err);
    res.status(500).send(`<h3>Error: ${err.message}</h3>`);
  }
});

/* POST /api/admin/riders/orders/:orderId/customer-invoice-wa — send invoice to customer via WhatsApp */
router.post("/admin/riders/orders/:orderId/customer-invoice-wa", adminMiddleware, async (req, res) => {
  try {
    const orderId = parseInt(req.params["orderId"] as string);
    const orderRows = await db.execute(sql`SELECT * FROM shopify_orders WHERE id = ${orderId} LIMIT 1`);
    if (!orderRows.rows.length) res.status(404).json({ error: "Order not found" });
    const order = orderRows.rows[0] as any;

    const delRows = await db.execute(sql`
      SELECT d.*, r.name AS rider_name, r.phone AS rider_phone
      FROM rider_deliveries d
      LEFT JOIN riders r ON r.id = d.rider_id
      WHERE d.shopify_order_db_id = ${orderId} LIMIT 1
    `);
    const delivery = delRows.rows?.[0] as any ?? {};

    const customerPhone = order.customer_phone ?? delivery.customer_phone;
    if (!customerPhone) res.status(400).json({ error: "No customer phone number" });

    const addr = (() => {
      try {
        const a = typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address;
        return [a?.address1, a?.address2, a?.city].filter(Boolean).join(", ");
      } catch { return "Lahore"; }
    })();

    const items = (() => {
      try {
        const arr = typeof order.line_items === "string" ? JSON.parse(order.line_items) : order.line_items;
        return Array.isArray(arr) ? arr.map((i: any) => `• ${i.name ?? i.title} ×${i.quantity} — PKR ${Number(i.price ?? 0).toLocaleString()}`).join("\n") : "";
      } catch { return ""; }
    })();

    const isPaid = order.financial_status === "paid";
    const cod = Number(delivery.cod_amount ?? order.total_price ?? 0);
    const statusEmoji: Record<string, string> = {
      assigned: "⏳", picked: "📦", out_for_delivery: "🚚", delivered: "✅", failed: "❌", returned: "↩️"
    };
    const ds = delivery.status ?? "assigned";

    const message = `🧾 *INVOICE — KDF NUTS*
━━━━━━━━━━━━━━━━━━━
📦 *Order:* ${order.order_number}
📅 *Date:* ${new Date(order.created_at ?? Date.now()).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}

👤 *Customer:* ${order.customer_name}
📍 *Address:* ${addr}

🛒 *Items:*
${items || "See order details"}

━━━━━━━━━━━━━━━━━━━
💰 *Order Total:* PKR ${Number(order.total_price ?? 0).toLocaleString()}
${isPaid ? "✅ *Payment:* PAID (Online)" : `💵 *COD Amount:* PKR ${cod.toLocaleString()}\n(Please keep exact change ready)`}

${statusEmoji[ds]} *Delivery Status:* ${ds.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
${delivery.rider_name ? `🛵 *Rider:* ${delivery.rider_name}` : ""}
━━━━━━━━━━━━━━━━━━━
Thank you for shopping with KDF NUTS! 🌰
For queries: Reply to this message or visit kdfnuts.com`;

    const normalised = (() => {
      const d = String(customerPhone).replace(/\D/g, "");
      if (d.startsWith("92")) return `+${d}`;
      if (d.startsWith("0")) return `+92${d.slice(1)}`;
      if (d.length === 10) return `+92${d}`;
      return customerPhone.startsWith("+") ? customerPhone : `+${d}`;
    })();

    const sent = await sendWhatsAppMessage({ phone: normalised, message });
    if (sent) {
      await db.execute(sql`UPDATE rider_deliveries SET customer_wa_sent_at = NOW(), updated_at = NOW() WHERE shopify_order_db_id = ${orderId}`);
    }
    res.json({ ok: sent, message: sent ? "WhatsApp invoice sent to customer!" : "WhatsApp send failed" });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/admin/riders/backfill-shopify-data
   Links rider_deliveries that have no shopify_order_db_id by matching order number,
   and fills missing order_items / customer phone from shopify_orders. */
router.post("/admin/riders/backfill-shopify-data", adminMiddleware, async (req, res) => {
  try {
    /* 1. Link deliveries that have a shopify_order_number but no shopify_order_db_id */
    const linked = await db.execute(sql`
      UPDATE rider_deliveries rd
      SET
        shopify_order_db_id = so.id,
        customer_phone  = COALESCE(NULLIF(rd.customer_phone,''), so.customer_phone),
        customer_name   = COALESCE(NULLIF(rd.customer_name,''),  so.customer_name),
        order_items     = CASE
                            WHEN rd.order_items IS NULL OR rd.order_items::text = '[]' OR rd.order_items::text = 'null'
                            THEN COALESCE(so.line_items, '[]'::jsonb)
                            ELSE rd.order_items
                          END,
        updated_at      = NOW()
      FROM shopify_orders so
      WHERE rd.shopify_order_db_id IS NULL
        AND rd.shopify_order_number IS NOT NULL
        AND (so.order_number = rd.shopify_order_number OR so.shopify_order_id = rd.shopify_order_id)
      RETURNING rd.id
    `);

    /* 2. Fill missing order_items for linked deliveries */
    const filledItems = await db.execute(sql`
      UPDATE rider_deliveries rd
      SET
        order_items = COALESCE(so.line_items, '[]'::jsonb),
        updated_at  = NOW()
      FROM shopify_orders so
      WHERE rd.shopify_order_db_id = so.id
        AND (rd.order_items IS NULL OR rd.order_items::text = '[]' OR rd.order_items::text = 'null')
        AND so.line_items IS NOT NULL
        AND so.line_items::text <> '[]'
      RETURNING rd.id
    `);

    /* 3. Fill missing customer phone from shopify_orders */
    const filledPhone = await db.execute(sql`
      UPDATE rider_deliveries rd
      SET
        customer_phone = so.customer_phone,
        updated_at     = NOW()
      FROM shopify_orders so
      WHERE rd.shopify_order_db_id = so.id
        AND (rd.customer_phone IS NULL OR rd.customer_phone = '')
        AND so.customer_phone IS NOT NULL
        AND so.customer_phone <> ''
      RETURNING rd.id
    `);

    res.json({
      ok: true,
      linked:      linked.rows.length,
      filledItems: filledItems.rows.length,
      filledPhone: filledPhone.rows.length,
      message:     `Linked ${linked.rows.length}, filled items for ${filledItems.rows.length}, filled phone for ${filledPhone.rows.length} deliveries`,
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/admin/riders/:riderId/deliveries */
router.get("/admin/riders/:riderId/deliveries", adminMiddleware, async (req, res) => {
  try {
    const riderId = parseInt(req.params["riderId"] as string);
    const rows = await db.execute(sql`
      SELECT d.*, o.order_number, o.total_price, o.financial_status, o.line_items, o.shipping_address
      FROM rider_deliveries d
      LEFT JOIN shopify_orders o ON o.id = d.shopify_order_db_id
      WHERE d.rider_id = ${riderId}
      ORDER BY d.created_at DESC
      LIMIT 100
    `);
    res.json({ deliveries: rows.rows ?? [] });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   SHOPIFY SYNC LOG MONITORING
═══════════════════════════════════════════════════════ */

/* GET /api/admin/riders/shopify-sync/logs — last 50 sync attempts */
router.get("/admin/riders/shopify-sync/logs", adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
    const status = req.query.status as string | undefined;
    const rows = await db.execute(sql`
      SELECT id, delivery_id, shopify_order_id, shopify_order_number,
             action, status, attempt, error, next_retry_at, created_at, updated_at
      FROM shopify_sync_log
      ${status ? sql`WHERE status = ${status}` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    res.json({ logs: rows.rows ?? [] });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/admin/riders/shopify-sync/stats — 24-hour breakdown */
router.get("/admin/riders/shopify-sync/stats", adminMiddleware, async (req, res) => {
  try {
    const stats = await db.execute(sql`
      SELECT
        status,
        COUNT(*)::int AS count,
        MAX(created_at) AS last_at
      FROM shopify_sync_log
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY status
    `);
    const total = await db.execute(sql`SELECT COUNT(*)::int AS total FROM shopify_sync_log`);
    const pending = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM shopify_sync_log
      WHERE status = 'pending' AND next_retry_at <= NOW()
    `);
    res.json({
      last24h: stats.rows ?? [],
      total: (total.rows[0] as any)?.total ?? 0,
      pendingRetries: (pending.rows[0] as any)?.count ?? 0,
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/admin/riders/shopify-sync/retry — manually retry failed entries */
router.post("/admin/riders/shopify-sync/retry", adminMiddleware, async (req, res) => {
  try {
    const { ids } = req.body as { ids?: number[] };

    let toRetry: any[];
    if (ids?.length) {
      const rows = await db.execute(sql`
        SELECT payload FROM shopify_sync_log WHERE id = ANY(${ids}::int[]) AND status = 'failed'
      `);
      toRetry = rows.rows as any[];
    } else {
      const rows = await db.execute(sql`
        SELECT payload FROM shopify_sync_log WHERE status = 'failed'
        ORDER BY created_at DESC LIMIT 20
      `);
      toRetry = rows.rows as any[];
    }

    let queued = 0;
    for (const row of toRetry) {
      const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      if (payload?.shopifyOrderId) {
        setImmediate(() => syncDeliveryToShopify(payload, 1).catch(() => {}));
        queued++;
      }
    }
    res.json({ ok: true, queued });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
