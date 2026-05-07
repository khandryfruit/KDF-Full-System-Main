/**
 * shopifySync.ts — Unified Shopify Delivery Sync Engine
 * ======================================================
 * Handles all rider/admin → Shopify two-way sync:
 *  - Tags (dynamic, no duplicates)
 *  - Order timeline / note append
 *  - Fulfillment creation (delivered)
 *  - Rider metafields (rider name, phone, status, tracking)
 *  - Background retry queue (3 attempts, exponential backoff)
 *  - Failed call logging in shopify_sync_log
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

const SHOPIFY_API_VERSION = "2024-01";

/* ─── Action Types ─── */
export type SyncAction =
  | "assigned"
  | "local_delivery"
  | "picked"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "returned"
  | "cancelled"
  | "delayed"
  | "rescheduled"
  | "reassigned";

/* ─── All managed tags (we own these — safe to replace) ─── */
const ALL_RIDER_TAGS = [
  "rider-assigned",
  "local-delivery",
  "rider-picked",
  "rider-out-for-delivery",
  "rider-delivered",
  "delivery-failed",
  "delivery-returned",
  "delivery-cancelled",
  "delivery-delayed",
  "delivery-rescheduled",
  "cod-pending",
  "cod-collected",
  "urgent-delivery",
];

/* ─── Action → tag mapping ─── */
function getTagsForAction(action: SyncAction, delivery: any): string[] {
  const tags: string[] = [];

  switch (action) {
    case "assigned":      tags.push("rider-assigned"); break;
    case "local_delivery":tags.push("rider-assigned", "local-delivery"); break;
    case "picked":        tags.push("rider-assigned", "rider-picked"); break;
    case "out_for_delivery": tags.push("rider-assigned", "rider-out-for-delivery"); break;
    case "delivered":     tags.push("rider-delivered"); break;
    case "failed":        tags.push("delivery-failed"); break;
    case "returned":      tags.push("delivery-returned"); break;
    case "cancelled":     tags.push("delivery-cancelled"); break;
    case "delayed":       tags.push("rider-assigned", "delivery-delayed", "urgent-delivery"); break;
    case "rescheduled":   tags.push("rider-assigned", "delivery-rescheduled"); break;
    case "reassigned":    tags.push("rider-assigned"); break;
  }

  /* COD tag */
  if (action === "delivered") {
    tags.push(delivery?.is_paid ? "cod-collected" : "cod-pending");
  }

  return tags;
}

/* ─── Action → timeline message ─── */
function getTimelineMessage(action: SyncAction, delivery: any, riderName?: string, riderPhone?: string, notes?: string): string {
  const now = new Date().toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
    hour12: true,
  });

  const rider = riderName
    ? `${riderName}${riderPhone ? ` (${riderPhone})` : ""}`
    : "Rider";

  const notesTxt = notes ? `\nNotes: ${notes}` : "";

  const msgs: Record<SyncAction, string> = {
    assigned:        `[${now}] 📦 Order assigned to ${rider} for local delivery.${notesTxt}`,
    local_delivery:  `[${now}] 🏍️ Local delivery assigned to ${rider}.${notesTxt}`,
    picked:          `[${now}] 📦 Order picked up by ${rider}.${notesTxt}`,
    out_for_delivery:`[${now}] 🚚 Out for delivery — ${rider} is on the way.${notesTxt}`,
    delivered:       `[${now}] ✅ Delivered successfully by ${rider}.${delivery?.is_paid ? " (PAID)" : " COD collected."}${notesTxt}`,
    failed:          `[${now}] ❌ Delivery failed by ${rider}. ${notes ?? "Customer not available."}`,
    returned:        `[${now}] ↩️ Order returned by ${rider}.${notesTxt}`,
    cancelled:       `[${now}] 🚫 Delivery cancelled.${notesTxt}`,
    delayed:         `[${now}] ⏳ Delivery delayed by ${rider}.${notesTxt}`,
    rescheduled:     `[${now}] 📅 Delivery rescheduled by ${rider}.${notesTxt}`,
    reassigned:      `[${now}] 🔄 Order reassigned to ${rider}.${notesTxt}`,
  };

  return msgs[action];
}

/* ─── Core: push one update to Shopify ─── */
interface ShopifySyncPayload {
  deliveryId?: number;
  shopifyOrderId: string | number;
  shopifyOrderNumber?: string | number;
  action: SyncAction;
  delivery: any;
  riderName?: string;
  riderPhone?: string;
  notes?: string;
}

async function pushToShopify(
  payload: ShopifySyncPayload,
  store: any,
): Promise<{ ok: boolean; error?: string }> {
  const { shopifyOrderId, action, delivery, riderName, riderPhone, notes } = payload;

  const accessToken = store.access_token ?? store.accessToken;
  const shopDomain  = store.shop_domain  ?? store.shopDomain;
  const baseUrl     = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}`;
  const headers     = {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
  };

  /* Step 1: Get current order (tags + note) */
  const getRes = await fetch(
    `${baseUrl}/orders/${shopifyOrderId}.json?fields=id,tags,note,fulfillment_status`,
    { headers },
  );
  if (!getRes.ok) {
    return { ok: false, error: `GET order failed: ${getRes.status}` };
  }
  const { order: currentOrder } = (await getRes.json()) as any;

  /* Step 2: Merge tags */
  const newTags    = getTagsForAction(action, delivery);
  const existing   = (currentOrder?.tags ?? "").split(",").map((t: string) => t.trim()).filter(Boolean);
  const preserved  = existing.filter((t: string) => !ALL_RIDER_TAGS.includes(t));
  const merged     = [...new Set([...preserved, ...newTags])];

  /* Step 3: Build timeline note (append to existing) */
  const timelineMsg = getTimelineMessage(action, delivery, riderName, riderPhone, notes);
  const existingNote = currentOrder?.note ?? "";
  const newNote = existingNote
    ? `${existingNote}\n\n${timelineMsg}`
    : timelineMsg;

  /* Step 4: Update order tags + note */
  const updateBody: any = {
    order: {
      id: shopifyOrderId,
      tags: merged.join(", "),
      note: newNote,
    },
  };

  /* Add rider info to note_attributes (visible in Shopify order page) */
  if (riderName) {
    updateBody.order.note_attributes = [
      { name: "Rider Name",   value: riderName },
      { name: "Rider Phone",  value: riderPhone ?? "" },
      { name: "Delivery Status", value: action.replace(/_/g, " ").toUpperCase() },
      { name: "Last Updated", value: new Date().toISOString() },
    ];
  }

  const putRes = await fetch(`${baseUrl}/orders/${shopifyOrderId}.json`, {
    method: "PUT",
    headers,
    body: JSON.stringify(updateBody),
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    return { ok: false, error: `PUT order failed: ${putRes.status} — ${errText.slice(0, 200)}` };
  }

  /* Step 5: Delivered → create fulfillment */
  if (action === "delivered" && currentOrder?.fulfillment_status !== "fulfilled") {
    try {
      const locRes = await fetch(`${baseUrl}/locations.json?limit=1`, { headers });
      const locData = locRes.ok ? ((await locRes.json()) as any) : {};
      const locationId = locData?.locations?.[0]?.id;

      if (locationId) {
        const deliveryTime = delivery?.delivered_at
          ? new Date(delivery.delivered_at).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })
          : new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });

        await fetch(`${baseUrl}/orders/${shopifyOrderId}/fulfillments.json`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            fulfillment: {
              location_id: locationId,
              status:  "success",
              message: `Delivered by ${riderName ?? "KDF Rider"} at ${deliveryTime}. ${notes ?? ""}`.trim(),
              notify_customer: false,
              tracking_number: null,
            },
          }),
        });
      }
    } catch (e: any) {
      logger.warn({ err: e.message }, "shopifySync: fulfillment creation failed (non-fatal)");
    }
  }

  /* Step 6: For failed/returned → cancel fulfillment if exists */
  if ((action === "failed" || action === "returned") && currentOrder?.fulfillment_status === "fulfilled") {
    try {
      const ffRes = await fetch(`${baseUrl}/orders/${shopifyOrderId}/fulfillments.json`, { headers });
      const ffData = ffRes.ok ? ((await ffRes.json()) as any) : {};
      const fulfillmentId = ffData?.fulfillments?.[0]?.id;
      if (fulfillmentId) {
        await fetch(`${baseUrl}/fulfillments/${fulfillmentId}/cancel.json`, {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        });
      }
    } catch {}
  }

  return { ok: true };
}

/* ─── Log to shopify_sync_log ─── */
async function logSync(
  payload: ShopifySyncPayload,
  status: "success" | "failed" | "pending",
  attempt: number,
  error?: string,
  nextRetryAt?: Date,
) {
  try {
    await db.execute(sql`
      INSERT INTO shopify_sync_log
        (delivery_id, shopify_order_id, shopify_order_number, action, status, attempt, payload, error, next_retry_at)
      VALUES (
        ${payload.deliveryId ?? null},
        ${String(payload.shopifyOrderId)},
        ${String(payload.shopifyOrderNumber ?? "")},
        ${payload.action},
        ${status},
        ${attempt},
        ${JSON.stringify(payload)},
        ${error ?? null},
        ${nextRetryAt?.toISOString() ?? null}
      )
    `);
  } catch (e: any) {
    logger.warn({ err: e.message }, "shopifySync: failed to write sync log (non-fatal)");
  }
}

/* ─── Notify Admin SSE ─── */
async function notifySSE(payload: ShopifySyncPayload) {
  try {
    const { broadcastSSE } = await import("./sse.js");
    broadcastSSE("rider_status_update", {
      deliveryId:         payload.deliveryId,
      shopifyOrderId:     payload.shopifyOrderId,
      orderNumber:        payload.shopifyOrderNumber,
      action:             payload.action,
      riderName:          payload.riderName,
      updatedAt:          new Date().toISOString(),
    });
  } catch {}
}

/* ═══════════════════════════════════════════════════════
   PUBLIC API — syncDeliveryToShopify
   Call this from any route (fire-and-forget via setImmediate)
═══════════════════════════════════════════════════════ */
export async function syncDeliveryToShopify(
  payload: ShopifySyncPayload,
  attempt = 1,
): Promise<void> {
  try {
    /* Get Shopify store config */
    const storeRows = await db.execute(
      sql`SELECT * FROM shopify_stores WHERE is_connected = true LIMIT 1`,
    );
    const store = storeRows.rows?.[0] as any;
    if (!store?.access_token && !store?.accessToken) {
      logger.warn("shopifySync: no connected Shopify store found");
      return;
    }

    if (!payload.shopifyOrderId) {
      logger.warn({ payload }, "shopifySync: no shopifyOrderId — skipping");
      return;
    }

    /* Try the push */
    const result = await pushToShopify(payload, store);

    if (result.ok) {
      await logSync(payload, "success", attempt);
      await notifySSE(payload);
      logger.info(
        { action: payload.action, orderId: payload.shopifyOrderId, attempt },
        "shopifySync: Shopify updated successfully",
      );
    } else {
      /* Retry with exponential backoff (max 3 attempts) */
      const MAX_ATTEMPTS = 3;
      if (attempt < MAX_ATTEMPTS) {
        const delayMs = Math.pow(2, attempt) * 5_000; // 10s, 20s
        const nextRetry = new Date(Date.now() + delayMs);
        await logSync(payload, "pending", attempt, result.error, nextRetry);
        logger.warn(
          { action: payload.action, attempt, nextRetry, error: result.error },
          "shopifySync: push failed, will retry",
        );
        setTimeout(() => {
          syncDeliveryToShopify(payload, attempt + 1).catch(() => {});
        }, delayMs);
      } else {
        await logSync(payload, "failed", attempt, result.error);
        logger.error(
          { action: payload.action, orderId: payload.shopifyOrderId, error: result.error },
          "shopifySync: all retries exhausted",
        );
      }
    }
  } catch (err: any) {
    await logSync(payload, "failed", attempt, err.message).catch(() => {});
    logger.warn({ err: err.message }, "shopifySync: unexpected error (non-fatal)");
  }
}

/* ═══════════════════════════════════════════════════════
   HELPER — build payload from delivery + rider records
   Use this in route handlers for convenience
═══════════════════════════════════════════════════════ */
export function buildSyncPayload(
  action: SyncAction,
  delivery: any,
  rider?: any,
  notes?: string,
): ShopifySyncPayload {
  return {
    deliveryId:          delivery.id,
    shopifyOrderId:      delivery.shopify_order_id ?? delivery.shopifyOrderId,
    shopifyOrderNumber:  delivery.shopify_order_number ?? delivery.shopifyOrderNumber,
    action,
    delivery,
    riderName:   rider?.name,
    riderPhone:  rider?.phone,
    notes,
  };
}

/* ═══════════════════════════════════════════════════════
   SYNC LOG MONITORING — for admin route
═══════════════════════════════════════════════════════ */
export async function getSyncLogs(limit = 50) {
  const rows = await db.execute(sql`
    SELECT * FROM shopify_sync_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return rows.rows;
}

export async function getSyncStats() {
  const rows = await db.execute(sql`
    SELECT
      status,
      COUNT(*)::int AS count
    FROM shopify_sync_log
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY status
  `);
  return rows.rows;
}
