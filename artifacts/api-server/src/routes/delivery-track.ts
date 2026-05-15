import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  mapDeliveryStatus,
  recordTrackingClick,
  STATUS_LABELS,
  type DeliveryProgressStatus,
} from "../lib/deliveryWaPremium.js";

const router = Router();

const PROGRESS_STEPS: DeliveryProgressStatus[] = [
  "preparing",
  "assigned",
  "picked",
  "out_for_delivery",
  "near_you",
  "delivered",
];

router.get("/delivery/live/:token", async (req, res) => {
  try {
    const token = String(req.params.token ?? "").trim();
    if (!token || token.length < 16) {
      res.status(400).json({ error: "Invalid token" });
      return;
    }

    const rows = await db.execute(sql`
      SELECT
        t.token, t.expires_at, t.revoked_at,
        d.status, d.customer_name, d.shopify_order_number,
        d.cod_amount, d.is_paid, d.assigned_at, d.picked_at,
        d.out_for_delivery_at, d.delivered_at,
        r.name AS rider_name, r.avatar_url AS rider_avatar,
        r.vehicle_type, r.location_lat, r.location_lng, r.location_updated_at,
        o.order_number, o.total_price, o.financial_status
      FROM delivery_track_tokens t
      JOIN rider_deliveries d ON d.id = t.delivery_id
      LEFT JOIN riders r ON r.id = d.rider_id
      LEFT JOIN shopify_orders o ON o.id = t.shopify_order_db_id
      WHERE t.token = ${token}
      LIMIT 1
    `);

    if (!rows.rows.length) {
      res.status(404).json({ error: "Tracking link not found or expired" });
      return;
    }

    const row = rows.rows[0] as Record<string, unknown>;
    if (row.revoked_at || new Date(String(row.expires_at)).getTime() < Date.now()) {
      res.status(410).json({ error: "This tracking link has expired" });
      return;
    }

    void recordTrackingClick(token);

    const progress = mapDeliveryStatus(String(row.status ?? "assigned"));
    const progressIndex = PROGRESS_STEPS.indexOf(progress);
    const lat = row.location_lat != null ? Number(row.location_lat) : null;
    const lng = row.location_lng != null ? Number(row.location_lng) : null;

    res.json({
      brand: "Khan Dry Fruits",
      orderNumber: row.shopify_order_number ?? row.order_number,
      customerName: row.customer_name ? String(row.customer_name).split(" ")[0] : "Customer",
      status: progress,
      statusLabel: STATUS_LABELS[progress],
      steps: PROGRESS_STEPS.map((s, i) => ({
        key: s,
        label: STATUS_LABELS[s],
        done: i <= progressIndex,
        current: s === progress,
      })),
      rider: row.rider_name
        ? {
            name: row.rider_name,
            vehicle: row.vehicle_type,
            avatarUrl: row.rider_avatar,
            location: lat != null && lng != null ? { lat, lng, updatedAt: row.location_updated_at } : null,
            mapUrl: lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null,
          }
        : null,
      payment: {
        total: Number(row.total_price ?? row.cod_amount ?? 0),
        isPaid: Boolean(row.is_paid) || row.financial_status === "paid",
        codAmount: Number(row.cod_amount ?? 0),
      },
      timeline: {
        assignedAt: row.assigned_at,
        pickedAt: row.picked_at,
        outForDeliveryAt: row.out_for_delivery_at,
        deliveredAt: row.delivered_at,
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

router.get("/track/live/:token", async (req, res) => {
  const token = encodeURIComponent(String(req.params.token ?? ""));
  res.type("html").send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Track Order — Khan Dry Fruits</title>
<style>
body{font-family:system-ui,sans-serif;background:#f5f0e8;margin:0;padding:16px}
.card{max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:20px;box-shadow:0 4px 20px rgba(0,0,0,.08)}
h1{color:#7c4a03;font-size:1.2rem;margin:0 0 4px}
.badge{display:inline-block;background:#dcfce7;color:#166534;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:600;margin:10px 0}
.step{padding:8px 0 8px 14px;border-left:3px solid #e5e7eb;margin-left:6px;font-size:14px}
.step.done{border-color:#25D366}.step.current{border-color:#7c4a03;font-weight:700}
.btn{display:block;text-align:center;background:#25D366;color:#fff;padding:14px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px}
.muted{color:#6b7280;font-size:13px}
</style></head><body>
<div class="card"><h1>Khan Dry Fruits</h1><p class="muted">Live delivery tracking</p><div id="root">Loading…</div></div>
<script>
fetch('/api/delivery/live/${token}').then(r=>r.json()).then(d=>{
  if(d.error){document.getElementById('root').innerHTML='<p>'+d.error+'</p>';return;}
  const steps=(d.steps||[]).map(s=>'<div class="step '+(s.done?'done':'')+' '+(s.current?'current':'')+'">'+s.label+'</div>').join('');
  const map=d.rider&&d.rider.mapUrl?'<a class="btn" href="'+d.rider.mapUrl+'" target="_blank">Open Live Map</a>':'';
  document.getElementById('root').innerHTML='<span class="badge">'+d.statusLabel+'</span><p style="margin-top:12px"><strong>Order #</strong> '+d.orderNumber+'</p><p class="muted">Hi '+d.customerName+'</p>'+(d.rider?'<p style="margin-top:12px"><strong>Rider:</strong> '+d.rider.name+'</p>':'')+'<div style="margin-top:16px">'+steps+'</div>'+map;
}).catch(()=>{document.getElementById('root').innerHTML='<p>Unable to load tracking.</p>';});
</script></body></html>`);
});

export default router;
