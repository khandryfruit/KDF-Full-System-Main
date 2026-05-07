import { Router, type Request, type Response, type NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { adminMiddleware } from "../lib/auth";
import { logger } from "../lib/logger";
import { syncDeliveryToShopify, buildSyncPayload, type SyncAction } from "../lib/shopifySync.js";

const router = Router();

const JWT_SECRET = process.env.SESSION_SECRET || "kdf-rider-secret";

/* ══════════════════════════════════════════════════════════
   SHOPIFY STATUS SYNC — delegated to lib/shopifySync.ts
══════════════════════════════════════════════════════════ */

function normalisePhone(raw: string): string {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("92")) return `+${digits}`;
  if (digits.startsWith("0")) return `+92${digits.slice(1)}`;
  if (digits.length === 10) return `+92${digits}`;
  return raw.startsWith("+") ? raw : `+${digits}`;
}

function riderMiddleware(req: any, res: Response, next: NextFunction): void {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.role !== "rider" && payload.role !== "admin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    req.rider = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" }); return;
  }
}

/* ═══════════════════════════════════════════════════════
   ADMIN: SET RIDER PASSWORD
═══════════════════════════════════════════════════════ */

router.post("/admin/riders/:id/set-password", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { password } = req.body;
    if (!password || password.length < 4) {
      res.status(400).json({ error: "Password must be at least 4 characters" }); return;
    }
    const hash = await bcrypt.hash(password, 10);
    const rows = await db.execute(sql`
      UPDATE riders SET password_hash = ${hash}, updated_at = NOW()
      WHERE id = ${id} RETURNING id, name, phone
    `);
    if (!rows.rows.length) { res.status(404).json({ error: "Rider not found" }); return; }
    res.json({ ok: true, rider: rows.rows[0] });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   RIDER AUTH
═══════════════════════════════════════════════════════ */

router.post("/rider/auth/login", async (req: any, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      res.status(400).json({ error: "Phone and password are required" }); return;
    }

    const normalised = normalisePhone(String(phone));
    const rows = await db.execute(sql`
      SELECT * FROM riders WHERE (phone = ${normalised} OR whatsapp_number = ${normalised}) LIMIT 1
    `);

    if (!rows.rows.length) {
      res.status(401).json({ error: "Invalid phone or password" }); return;
    }
    const rider = rows.rows[0] as any;

    if (rider.status !== "active") {
      res.status(403).json({ error: "Your account is inactive. Contact admin." }); return;
    }

    if (!rider.password_hash) {
      res.status(401).json({ error: "No password set. Contact admin to set your password." }); return;
    }

    const valid = await bcrypt.compare(String(password), rider.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Invalid phone or password" }); return;
    }

    const token = jwt.sign(
      { id: rider.id, phone: rider.phone, name: rider.name, role: "rider" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      ok: true,
      token,
      rider: {
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        whatsapp_number: rider.whatsapp_number,
        delivery_area: rider.delivery_area,
        vehicle_type: rider.vehicle_type,
        status: rider.status,
        delivery_charge_per_order: rider.delivery_charge_per_order,
      },
    });
  } catch (err: any) {
    req.log?.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/rider/auth/me", riderMiddleware, async (req: any, res) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM riders WHERE id = ${req.rider.id} LIMIT 1`);
    if (!rows.rows.length) { res.status(404).json({ error: "Rider not found" }); return; }
    const rider = rows.rows[0] as any;
    res.json({
      rider: {
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        whatsapp_number: rider.whatsapp_number,
        delivery_area: rider.delivery_area,
        vehicle_type: rider.vehicle_type,
        status: rider.status,
        delivery_charge_per_order: rider.delivery_charge_per_order,
        cnic: rider.cnic,
      },
    });
  } catch (err: any) {
    req.log?.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   RIDER LIVE LOCATION — UPDATE (called from mobile app)
═══════════════════════════════════════════════════════ */

router.put("/rider/location", riderMiddleware, async (req: any, res) => {
  try {
    const riderId = req.rider.id;
    const { lat, lng, accuracy, speed, heading } = req.body;
    if (lat == null || lng == null) { res.status(400).json({ error: "lat and lng required" }); return; }
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) { res.status(400).json({ error: "Invalid coordinates" }); return; }
    const accNum     = accuracy != null  ? parseFloat(accuracy)  : null;
    const speedNum   = speed    != null  ? parseFloat(speed)     : null;
    const headingNum = heading  != null  ? parseFloat(heading)   : null;
    await db.execute(sql`
      UPDATE riders
      SET location_lat        = ${latNum},
          location_lng        = ${lngNum},
          location_updated_at = NOW(),
          location_accuracy   = ${accNum},
          location_speed      = ${speedNum},
          location_heading    = ${headingNum},
          updated_at          = NOW()
      WHERE id = ${riderId}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    req.log?.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   ADMIN: GET ALL RIDERS LIVE LOCATIONS
═══════════════════════════════════════════════════════ */

router.get("/admin/riders/live-locations", adminMiddleware, async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        r.id, r.name, r.phone, r.status, r.vehicle_type, r.delivery_area,
        r.location_lat, r.location_lng, r.location_updated_at,
        r.location_accuracy, r.location_speed, r.location_heading,
        COUNT(d.id) FILTER (WHERE d.status NOT IN ('delivered','returned','failed')) AS active_deliveries,
        (
          SELECT jsonb_agg(jsonb_build_object(
            'id', d2.id,
            'customer_name', d2.customer_name,
            'delivery_address', d2.delivery_address,
            'status', d2.status,
            'cod_amount', d2.cod_amount,
            'shopify_order_number', d2.shopify_order_number
          ) ORDER BY d2.assigned_at DESC)
          FROM rider_deliveries d2
          WHERE d2.rider_id = r.id AND d2.status NOT IN ('delivered','returned','failed')
        ) AS active_orders
      FROM riders r
      LEFT JOIN rider_deliveries d ON d.rider_id = r.id
      WHERE r.status != 'inactive'
      GROUP BY r.id
      ORDER BY r.name
    `);
    res.json({ riders: rows.rows ?? [] });
  } catch (err: any) {
    req.log?.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   PUSH TOKEN REGISTRATION
═══════════════════════════════════════════════════════ */

router.put("/rider/push-token", riderMiddleware, async (req: any, res) => {
  try {
    const riderId = req.rider.id;
    const { expo_push_token } = req.body;
    if (!expo_push_token) { res.status(400).json({ error: "expo_push_token required" }); return; }
    await db.execute(sql`
      UPDATE riders SET expo_push_token = ${expo_push_token}, updated_at = NOW() WHERE id = ${riderId}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    req.log?.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   RIDER STATS
═══════════════════════════════════════════════════════ */

router.get("/rider/stats", riderMiddleware, async (req: any, res) => {
  try {
    const riderId = req.rider.id;
    const statsRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('delivered','returned','failed')) AS pending,
        COUNT(*) FILTER (WHERE status = 'delivered') AS total_delivered,
        COUNT(*) FILTER (WHERE status = 'delivered' AND DATE(delivered_at) = CURRENT_DATE) AS delivered_today,
        COUNT(*) FILTER (WHERE DATE(assigned_at) = CURRENT_DATE) AS assigned_today,
        COUNT(*) FILTER (WHERE status = 'out_for_delivery') AS on_route,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COALESCE(SUM(CASE WHEN status = 'delivered' AND DATE(delivered_at) = CURRENT_DATE
          THEN COALESCE(delivery_charge, 0) ELSE 0 END), 0) AS earnings_today,
        COALESCE(SUM(CASE WHEN status = 'delivered'
          THEN COALESCE(delivery_charge, 0) ELSE 0 END), 0) AS total_earnings,
        COALESCE(SUM(CASE WHEN status NOT IN ('delivered','returned','failed') AND is_paid = false
          THEN cod_amount ELSE 0 END), 0) AS cod_pending
      FROM rider_deliveries
      WHERE rider_id = ${riderId}
    `);
    res.json({ stats: statsRows.rows[0] ?? {} });
  } catch (err: any) {
    req.log?.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   RIDER DELIVERIES
═══════════════════════════════════════════════════════ */

router.get("/rider/deliveries", riderMiddleware, async (req: any, res) => {
  try {
    const riderId = req.rider.id;
    const { status, date } = req.query;

    let conditions = [`rd.rider_id = ${riderId}`];
    if (status && status !== "all") {
      conditions.push(`rd.status = '${String(status).replace(/'/g, "''")}'`);
    }
    if (date) {
      conditions.push(`DATE(rd.assigned_at) = '${String(date).replace(/'/g, "''")}'`);
    }

    const whereClause = conditions.join(" AND ");

    const rows = await db.execute(sql`
      SELECT
        rd.*,
        o.order_number,
        o.total_price,
        o.financial_status,
        o.line_items,
        o.shipping_address,
        o.customer_name AS shopify_customer_name,
        o.customer_phone AS shopify_customer_phone,
        o.customer_email
      FROM rider_deliveries rd
      LEFT JOIN shopify_orders o ON o.id = rd.shopify_order_db_id
      WHERE rd.rider_id = ${riderId}
      ORDER BY
        CASE rd.status
          WHEN 'out_for_delivery' THEN 1
          WHEN 'picked' THEN 2
          WHEN 'assigned' THEN 3
          WHEN 'delivered' THEN 4
          WHEN 'failed' THEN 5
          WHEN 'returned' THEN 6
        END ASC,
        rd.assigned_at DESC
      LIMIT 200
    `);

    let deliveries = rows.rows as any[];

    if (status && status !== "all") {
      deliveries = deliveries.filter((d: any) => d.status === status);
    }
    if (date) {
      deliveries = deliveries.filter((d: any) => {
        if (!d.assigned_at) return false;
        const assigned = new Date(d.assigned_at).toISOString().slice(0, 10);
        return assigned === date;
      });
    }

    res.json({ deliveries });
  } catch (err: any) {
    req.log?.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/rider/deliveries/:id", riderMiddleware, async (req: any, res) => {
  try {
    const riderId = req.rider.id;
    const id = parseInt(req.params["id"] as string);
    const rows = await db.execute(sql`
      SELECT rd.*, o.order_number, o.total_price, o.financial_status, o.line_items,
        o.shipping_address, o.customer_name AS shopify_customer_name,
        o.customer_phone AS shopify_customer_phone, o.customer_email
      FROM rider_deliveries rd
      LEFT JOIN shopify_orders o ON o.id = rd.shopify_order_db_id
      WHERE rd.id = ${id} AND rd.rider_id = ${riderId}
      LIMIT 1
    `);
    if (!rows.rows.length) { res.status(404).json({ error: "Delivery not found" }); return; }
    res.json({ delivery: rows.rows[0] });
  } catch (err: any) {
    req.log?.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   UPDATE DELIVERY STATUS
═══════════════════════════════════════════════════════ */

router.put("/rider/deliveries/:id/status", riderMiddleware, async (req: any, res) => {
  try {
    const riderId = req.rider.id;
    const id = parseInt(req.params["id"] as string);
    const { status, notes } = req.body;

    const valid = ["picked", "out_for_delivery", "delivered", "failed", "returned"];
    if (!valid.includes(status)) {
      res.status(400).json({ error: `Status must be one of: ${valid.join(", ")}` }); return;
    }

    const check = await db.execute(sql`SELECT id FROM rider_deliveries WHERE id = ${id} AND rider_id = ${riderId} LIMIT 1`);
    if (!check.rows.length) { res.status(404).json({ error: "Delivery not found" }); return; }

    if (status === "picked") {
      await db.execute(sql`
        UPDATE rider_deliveries SET status=${status}, notes=COALESCE(${notes ?? null}, notes),
          picked_at=COALESCE(picked_at, NOW()), updated_at=NOW()
        WHERE id=${id} AND rider_id=${riderId}
      `);
    } else if (status === "out_for_delivery") {
      await db.execute(sql`
        UPDATE rider_deliveries SET status=${status}, notes=COALESCE(${notes ?? null}, notes),
          picked_at=COALESCE(picked_at, NOW()), updated_at=NOW()
        WHERE id=${id} AND rider_id=${riderId}
      `);
    } else if (status === "delivered") {
      await db.execute(sql`
        UPDATE rider_deliveries SET status=${status}, notes=COALESCE(${notes ?? null}, notes),
          delivered_at=COALESCE(delivered_at, NOW()), updated_at=NOW()
        WHERE id=${id} AND rider_id=${riderId}
      `);
    } else {
      await db.execute(sql`
        UPDATE rider_deliveries SET status=${status}, notes=COALESCE(${notes ?? null}, notes),
          updated_at=NOW()
        WHERE id=${id} AND rider_id=${riderId}
      `);
    }

    const updated = await db.execute(sql`SELECT * FROM rider_deliveries WHERE id = ${id} LIMIT 1`);
    const updatedDelivery = updated.rows[0] as any;
    res.json({ ok: true, delivery: updatedDelivery });

    /* ── Async: sync rider status back to Shopify via unified engine ── */
    if (updatedDelivery) {
      setImmediate(async () => {
        try {
          const riderRows = await db.execute(sql`SELECT name, phone FROM riders WHERE id = ${riderId} LIMIT 1`);
          const rider = riderRows.rows[0] as any;
          await syncDeliveryToShopify(buildSyncPayload(status as SyncAction, updatedDelivery, rider, notes));
        } catch {}
      });
    }
  } catch (err: any) {
    req.log?.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   RIDER INVOICE (HTML — viewable in browser)
═══════════════════════════════════════════════════════ */

router.get("/rider/deliveries/:id/invoice", async (req: any, res): Promise<void> => {
  const raw = (req.query.token as string) || (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!raw) { res.status(401).send("<h3>Unauthorized</h3>"); return; }

  let riderId: number;
  let isAdmin = false;
  try {
    const payload = jwt.verify(raw, JWT_SECRET) as any;
    if (payload.role !== "rider" && payload.role !== "admin") { res.status(403).send("<h3>Forbidden</h3>"); return; }
    riderId = Number(payload.id);
    isAdmin = payload.role === "admin";
  } catch { res.status(401).send("<h3>Invalid token</h3>"); return; }

  try {
    const delivId = parseInt(req.params["id"] as string);

    /* Step 1: get delivery row (with rider ownership check unless admin) */
    const delRows = isAdmin
      ? await db.execute(sql`SELECT * FROM rider_deliveries WHERE id = ${delivId} LIMIT 1`)
      : await db.execute(sql`SELECT * FROM rider_deliveries WHERE id = ${delivId} AND rider_id = ${riderId} LIMIT 1`);

    if (!delRows.rows.length) { res.status(404).send("<h3>Delivery not found</h3>"); return; }
    const del = delRows.rows[0] as any;

    /* Step 2: get shopify order separately to avoid column conflicts */
    let shopOrder: any = {};
    if (del.shopify_order_db_id) {
      const oRows = await db.execute(sql`SELECT * FROM shopify_orders WHERE id = ${del.shopify_order_db_id} LIMIT 1`);
      if (oRows.rows.length) shopOrder = oRows.rows[0] as any;
    }

    /* Merge: delivery fields take priority for customer/cod info */
    const d = { ...shopOrder, ...del };

    const addr = (() => {
      try {
        const src = d.shipping_address;
        const a = typeof src === "string" ? JSON.parse(src) : src;
        const fromObj = [a?.address1, a?.address2, a?.city, a?.province].filter(Boolean).join(", ");
        return fromObj || d.delivery_address || "";
      } catch { return d.delivery_address ?? ""; }
    })();

    const items = (() => {
      try {
        const src = d.order_items ?? d.line_items;
        const arr = typeof src === "string" ? JSON.parse(src) : src;
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    })();

    const cod = Number(d.cod_amount ?? d.total_price ?? 0);
    const isPaid = Boolean(d.is_paid) || d.financial_status === "paid";
    const orderNum = d.shopify_order_number ?? d.order_number ?? del.id;
    const orderDate = new Date(d.created_at ?? d.assigned_at ?? Date.now()).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });
    const dc = Number(d.delivery_charge ?? 0);

    const itemRows = items.map((i: any) => `
      <tr>
        <td>${i.title ?? i.name ?? "Item"}${i.variant_title ? `<br><small style="color:#666">${i.variant_title}</small>` : ""}</td>
        <td style="text-align:center">${i.quantity ?? 1}</td>
        <td style="text-align:right">Rs. ${Number(i.price ?? 0).toLocaleString()}</td>
        <td style="text-align:right">Rs. ${(Number(i.price ?? 0) * (i.quantity ?? 1)).toLocaleString()}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Khan Dry Fruits — Invoice #${orderNum}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; background: #f5f7fb; color: #0a1929; font-size: 14px; }
  .page { max-width: 680px; margin: 0 auto; background: #fff; min-height: 100vh; }
  .header { background: #0D2137; color: #fff; padding: 24px 28px; }
  .header h1 { font-size: 22px; font-weight: 800; letter-spacing: 1px; margin-bottom: 4px; }
  .header p { color: rgba(255,255,255,0.6); font-size: 12px; }
  .logo-badge { display: inline-block; background: #00B85A; color: #fff; font-weight: 800; font-size: 16px; border-radius: 10px; padding: 6px 14px; margin-bottom: 12px; letter-spacing: 1px; }
  .body { padding: 24px 28px; }
  .order-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .order-num { font-size: 20px; font-weight: 800; color: #0D2137; }
  .order-date { color: #6B7A99; font-size: 13px; margin-top: 4px; }
  .status-badge { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .status-delivered { background: #E8F5E9; color: #2E7D32; }
  .status-assigned { background: #E3F2FD; color: #1565C0; }
  .status-picked { background: #FFF3E0; color: #E65100; }
  .status-out_for_delivery { background: #F3E5F5; color: #6A1B9A; }
  .status-failed { background: #FFEBEE; color: #B71C1C; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 24px; }
  .info-box { background: #F2F5FB; border-radius: 12px; padding: 14px; }
  .info-box-label { font-size: 10px; font-weight: 700; color: #6B7A99; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .info-box-value { font-size: 14px; font-weight: 600; color: #0A1929; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #0D2137; color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 10px 12px; text-align: left; }
  td { padding: 11px 12px; border-bottom: 1px solid #E4EAF4; vertical-align: top; }
  tr:nth-child(even) td { background: #F8FAFF; }
  .totals { background: #F2F5FB; border-radius: 12px; padding: 16px; margin-bottom: 24px; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
  .total-row.grand { font-size: 18px; font-weight: 800; border-top: 2px solid #E4EAF4; padding-top: 10px; margin-top: 4px; }
  .cod-banner { border-radius: 12px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .cod-banner.cod { background: #FFF8E1; border: 2px solid #FFD54F; }
  .cod-banner.paid { background: #E8F5E9; border: 2px solid #A5D6A7; }
  .footer { border-top: 1px solid #E4EAF4; padding: 16px 28px; text-align: center; color: #6B7A99; font-size: 12px; }
  @media print { body { background: #fff; } .page { box-shadow: none; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo-badge">Khan Dry Fruits</div>
    <h1>Delivery Invoice</h1>
    <p>Khan Dry Fruits — Premium Quality Dry Fruits, Lahore, Pakistan</p>
  </div>
  <div class="body">
    <div class="order-header">
      <div>
        <div class="order-num">Order #${orderNum}</div>
        <div class="order-date">${orderDate}</div>
      </div>
      <span class="status-badge status-${d.status ?? "assigned"}">${(d.status ?? "assigned").replace("_", " ")}</span>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <div class="info-box-label">Customer</div>
        <div class="info-box-value">${d.customer_name ?? "—"}<br>${d.customer_phone ?? ""}</div>
      </div>
      <div class="info-box">
        <div class="info-box-label">Delivery Address</div>
        <div class="info-box-value">${addr || "—"}</div>
      </div>
    </div>

    ${items.length > 0 ? `
    <table>
      <thead>
        <tr><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    ` : ""}

    <div class="totals">
      <div class="total-row"><span>Subtotal</span><span>Rs. ${cod.toLocaleString()}</span></div>
      ${dc > 0 ? `<div class="total-row"><span>Delivery Charge</span><span>Rs. ${dc.toLocaleString()}</span></div>` : ""}
      <div class="total-row grand"><span>Total</span><span style="color:#00B85A">Rs. ${(cod + dc).toLocaleString()}</span></div>
    </div>

    <div class="cod-banner ${isPaid ? "paid" : "cod"}">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;opacity:0.7;margin-bottom:4px">${isPaid ? "Payment Status" : "Cash on Delivery"}</div>
        <div style="font-size:20px;font-weight:800">${isPaid ? "✓ PAID" : `Rs. ${cod.toLocaleString()}`}</div>
      </div>
      <div style="font-size:13px;opacity:0.8">${isPaid ? "No cash collection needed" : "Collect cash from customer"}</div>
    </div>
  </div>
  <div class="footer">
    Khan Dry Fruits — Premium Quality Since 2010 • Lahore, Pakistan<br>
    Generated on ${new Date().toLocaleString("en-PK")}
  </div>
</div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err: any) {
    req.log?.error(err);
    res.status(500).send(`<h3>Error: ${err.message}</h3>`);
  }
});

export default router;

