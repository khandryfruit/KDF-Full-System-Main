/**
 * Auto-assign Lahore Shopify orders to available riders + notify rider app.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import { sendExpoPush } from "./ondriveEngine.js";
import { sendWhatsAppMessage, normalizePhone } from "./whatsapp";
import { syncDeliveryToShopify, buildSyncPayload } from "./shopifySync.js";

export type LahoreOrderRow = {
  id: number;
  shopify_order_id?: string | null;
  order_number?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  shipping_address?: unknown;
  total_price?: string | number | null;
  financial_status?: string | null;
  line_items?: unknown;
};

function parseAddress(order: LahoreOrderRow): { full: string; city: string } {
  try {
    const a =
      typeof order.shipping_address === "string"
        ? JSON.parse(order.shipping_address)
        : (order.shipping_address ?? {});
    const full = [a?.address1, a?.address2, a?.city, a?.province].filter(Boolean).join(", ");
    return { full: full || "Lahore", city: a?.city ?? "Lahore" };
  } catch {
    return { full: "Lahore", city: "Lahore" };
  }
}

async function pickRiderForAssignment(): Promise<Record<string, unknown> | null> {
  const build = (onlineOnly: boolean) =>
    db.execute(sql`
      SELECT r.id, r.name, r.phone, r.whatsapp_number, r.expo_push_token, r.is_online,
        COALESCE(r.max_active_orders, 200) AS max_active_orders,
        COUNT(d.id) FILTER (WHERE d.status NOT IN ('delivered','returned','failed')) AS active_count
      FROM riders r
      LEFT JOIN rider_deliveries d ON d.rider_id = r.id
      WHERE r.status = 'active'
        AND COALESCE(r.auto_assign_enabled, true) = true
        ${onlineOnly ? sql`AND r.is_online = true` : sql``}
      GROUP BY r.id
      HAVING COUNT(d.id) FILTER (WHERE d.status NOT IN ('delivered','returned','failed'))
        < COALESCE(r.max_active_orders, 200)
      ORDER BY COALESCE(r.priority, 1) DESC, r.is_online DESC, active_count ASC
      LIMIT 1
    `);

  let res = await build(true);
  if (!res.rows.length) res = await build(false);
  return (res.rows[0] as Record<string, unknown>) ?? null;
}

/** Assign one Lahore order if unassigned. Returns delivery row id when created. */
export async function autoAssignLahoreOrder(order: LahoreOrderRow): Promise<{
  assigned: boolean;
  deliveryId?: number;
  riderId?: number;
  riderName?: string;
}> {
  const { full: addr, city } = parseAddress(order);
  if (!/lahore/i.test(city)) return { assigned: false };

  const existing = await db.execute(sql`
    SELECT id FROM rider_deliveries WHERE shopify_order_db_id = ${order.id} LIMIT 1
  `);
  if (existing.rows.length) return { assigned: false };

  const rider = await pickRiderForAssignment();
  if (!rider) {
    logger.warn({ orderId: order.id }, "Lahore auto-assign: no eligible rider");
    return { assigned: false };
  }

  const isPaid = order.financial_status === "paid";
  const codAmount = isPaid ? 0 : Number(order.total_price ?? 0);
  const riderId = Number(rider.id);

  const ins = await db.execute(sql`
    INSERT INTO rider_deliveries
      (rider_id, shopify_order_db_id, shopify_order_id, shopify_order_number,
       customer_name, customer_phone, delivery_address, city,
       cod_amount, is_paid, order_items, status, assigned_at)
    VALUES (
      ${riderId}, ${order.id},
      ${order.shopify_order_id ?? null}, ${order.order_number ?? null},
      ${order.customer_name ?? null}, ${order.customer_phone ?? null},
      ${addr}, ${city},
      ${codAmount}, ${isPaid},
      ${JSON.stringify(order.line_items ?? [])},
      'assigned', NOW()
    )
    RETURNING id
  `);

  const deliveryId = Number((ins.rows[0] as { id: number })?.id);
  if (!deliveryId) return { assigned: false };

  const riderName = String(rider.name ?? "Rider");
  const codText = isPaid ? "PAID ✅" : `COD Rs.${codAmount.toLocaleString()}`;

  setImmediate(async () => {
    try {
      const delRow = await db.execute(sql`SELECT * FROM rider_deliveries WHERE id = ${deliveryId} LIMIT 1`);
      const del = delRow.rows[0] as Record<string, unknown>;
      if (del) {
        await syncDeliveryToShopify(
          buildSyncPayload("assigned", del as any, { name: riderName, phone: rider.phone }),
        ).catch(() => {});
      }

      const expoToken = rider.expo_push_token as string | undefined;
      if (expoToken) {
        await sendExpoPush({
          expoPushToken: expoToken,
          title: `🚚 نیا آرڈر! #${order.order_number ?? deliveryId}`,
          body: `${order.customer_name ?? "Customer"} · ${city} · ${codText}`,
          data: {
            type: "new_order",
            deliveryId: String(deliveryId),
            orderNumber: String(order.order_number ?? ""),
            customerName: order.customer_name ?? "",
            delivery_address: addr,
            cod_amount: codAmount,
            is_paid: isPaid,
            screen: "order_detail",
          },
          badge: 1,
          riderId,
          deliveryId,
          orderNumber: String(order.order_number ?? ""),
        });
      }

      const waPhone = (rider.whatsapp_number || rider.phone) as string | undefined;
      if (waPhone) {
        const msg =
          `🚚 *NEW DELIVERY — KDF NUTS*\n\n` +
          `📦 *Order:* ${order.order_number}\n` +
          `👤 *Customer:* ${order.customer_name ?? "—"}\n` +
          `📍 *Area:* ${city}\n` +
          `📍 *Address:* ${addr}\n` +
          `💰 *${codText}*\n\nOpen the KDF Rider app to accept.`;
        await sendWhatsAppMessage({ phone: normalizePhone(waPhone), message: msg }).catch(() => false);
      }
    } catch (e) {
      logger.warn({ e, deliveryId }, "Lahore auto-assign notify failed");
    }
  });

  logger.info({ orderId: order.id, deliveryId, riderName }, "Lahore order auto-assigned");
  return { assigned: true, deliveryId, riderId, riderName };
}
