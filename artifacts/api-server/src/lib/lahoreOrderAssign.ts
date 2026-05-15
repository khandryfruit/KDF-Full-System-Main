/**
 * Single Lahore auto-assign path: rider pick, delivery row, rider push/WA, customer tracking WA.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger.js";
import { sendExpoPush } from "./ondriveEngine.js";
import { sendWhatsAppMessage, normalizePhone } from "./whatsapp.js";
import { syncDeliveryToShopify, buildSyncPayload } from "./shopifySync.js";
import { sendPremiumRiderAssignedNotification } from "./deliveryWaPremium.js";
import { isLahoreShippingAddress, parseShippingAddress } from "./lahoreShipping.js";
import { logOrderAutomation } from "./orderAutomationLog.js";

export type LahoreAssignInput = {
  shopifyOrderDbId: number;
  shopifyOrderId: string;
  orderNumber: string;
  customerPhone: string | null;
  customerName: string | null;
  shippingAddress: unknown;
  totalPrice: string | null;
  financialStatus: string | null;
  lineItems: unknown[];
};

export type LahoreAssignResult = {
  assigned: boolean;
  deliveryId?: number;
  riderId?: number;
  riderName?: string;
  message: string;
};

async function isAutoDeliveryEnabled(): Promise<boolean> {
  try {
    const settingsRow = await db
      .execute(
        sql`SELECT auto_delivery_mode FROM rider_delivery_settings WHERE id = 1 LIMIT 1`,
      )
      .catch(() => ({ rows: [] }));
    return (settingsRow.rows?.[0] as { auto_delivery_mode?: boolean })?.auto_delivery_mode ?? true;
  } catch {
    return true;
  }
}

async function pickRiderForAssignment(): Promise<Record<string, unknown> | null> {
  const build = (onlineOnly: boolean) =>
    db.execute(sql`
      SELECT r.id, r.name, r.phone, r.whatsapp_number, r.expo_push_token, r.is_online,
        COALESCE(r.max_active_orders, 200) AS max_active_orders,
        COUNT(d.id) FILTER (WHERE d.status NOT IN ('delivered','returned','failed','cancelled')) AS active_count
      FROM riders r
      LEFT JOIN rider_deliveries d ON d.rider_id = r.id
      WHERE r.status = 'active'
        AND COALESCE(r.auto_assign_enabled, true) = true
        ${onlineOnly ? sql`AND r.is_online = true` : sql``}
      GROUP BY r.id
      HAVING COUNT(d.id) FILTER (WHERE d.status NOT IN ('delivered','returned','failed','cancelled'))
        < COALESCE(r.max_active_orders, 200)
      ORDER BY COALESCE(r.priority, 1) DESC, r.is_online DESC, active_count ASC
      LIMIT 1
    `);

  let res = await build(true);
  if (!res.rows.length) res = await build(false);
  return (res.rows[0] as Record<string, unknown>) ?? null;
}

/** Assign Lahore order to rider + notify rider app, rider WA, and customer tracking WA. */
export async function assignLahoreOrderWithNotifications(
  input: LahoreAssignInput,
): Promise<LahoreAssignResult> {
  if (!isLahoreShippingAddress(input.shippingAddress)) {
    return { assigned: false, message: "Not a Lahore order" };
  }

  if (!(await isAutoDeliveryEnabled())) {
    return { assigned: false, message: "Auto delivery mode is disabled" };
  }

  const { full: deliveryAddr, city } = parseShippingAddress(input.shippingAddress);
  const phone = input.customerPhone ? normalizePhone(input.customerPhone) : null;
  const isPaid = ["paid", "partially_paid"].includes(input.financialStatus ?? "");
  const codAmount = isPaid ? 0 : Number(input.totalPrice ?? 0);

  const existing = await db.execute(sql`
    SELECT id, rider_id, status FROM rider_deliveries
    WHERE shopify_order_db_id = ${input.shopifyOrderDbId}
    ORDER BY id DESC
    LIMIT 1
  `);
  const existingRow = existing.rows[0] as
    | { id: number; rider_id: number | null; status: string }
    | undefined;

  if (existingRow?.rider_id) {
    return {
      assigned: false,
      deliveryId: existingRow.id,
      message: "Rider already assigned",
    };
  }

  const rider = await pickRiderForAssignment();
  if (!rider) {
    if (existingRow && !existingRow.rider_id) {
      return {
        assigned: false,
        deliveryId: existingRow.id,
        message: "Delivery pending — no eligible riders",
      };
    }
    const pending = await db.execute(sql`
      INSERT INTO rider_deliveries
        (shopify_order_db_id, shopify_order_id, shopify_order_number,
         customer_name, customer_phone, delivery_address, city,
         cod_amount, is_paid, order_items, status)
      VALUES (
        ${input.shopifyOrderDbId}, ${input.shopifyOrderId}, ${input.orderNumber},
        ${input.customerName ?? null}, ${phone ?? null}, ${deliveryAddr}, ${city},
        ${codAmount}, ${isPaid}, ${JSON.stringify(input.lineItems)}, 'pending'
      )
      RETURNING id
    `);
    const pendingId = Number((pending.rows[0] as { id: number })?.id);
    logger.warn({ orderNumber: input.orderNumber, pendingId }, "Lahore order: no riders — pending row");
    return {
      assigned: false,
      deliveryId: pendingId || undefined,
      message: "No eligible riders — delivery pending",
    };
  }

  const riderId = Number(rider.id);
  const riderName = String(rider.name ?? "Rider");
  let deliveryId: number;

  if (existingRow) {
    const upd = await db.execute(sql`
      UPDATE rider_deliveries SET
        rider_id = ${riderId},
        shopify_order_id = COALESCE(shopify_order_id, ${input.shopifyOrderId}),
        shopify_order_number = COALESCE(shopify_order_number, ${input.orderNumber}),
        customer_name = COALESCE(customer_name, ${input.customerName ?? null}),
        customer_phone = COALESCE(customer_phone, ${phone ?? null}),
        delivery_address = COALESCE(delivery_address, ${deliveryAddr}),
        city = COALESCE(city, ${city}),
        cod_amount = ${codAmount},
        is_paid = ${isPaid},
        order_items = COALESCE(order_items, ${JSON.stringify(input.lineItems)}::jsonb),
        status = 'assigned',
        assigned_at = COALESCE(assigned_at, NOW()),
        updated_at = NOW()
      WHERE id = ${existingRow.id}
      RETURNING id
    `);
    deliveryId = Number((upd.rows[0] as { id: number })?.id ?? existingRow.id);
  } else {
    const ins = await db.execute(sql`
      INSERT INTO rider_deliveries
        (rider_id, shopify_order_db_id, shopify_order_id, shopify_order_number,
         customer_name, customer_phone, delivery_address, city,
         cod_amount, is_paid, order_items, status, assigned_at)
      VALUES (
        ${riderId}, ${input.shopifyOrderDbId}, ${input.shopifyOrderId}, ${input.orderNumber},
        ${input.customerName ?? null}, ${phone ?? null}, ${deliveryAddr}, ${city},
        ${codAmount}, ${isPaid}, ${JSON.stringify(input.lineItems)}, 'assigned', NOW()
      )
      RETURNING id
    `);
    deliveryId = Number((ins.rows[0] as { id: number })?.id);
    if (!deliveryId) {
      return { assigned: false, message: "Failed to create delivery row" };
    }
  }

  const codText = isPaid ? "PAID ✅" : `COD Rs.${codAmount.toLocaleString()}`;
  const itemsList = (input.lineItems as any[])
    .slice(0, 4)
    .map((i) => `• ${i.title ?? i.name ?? "Product"} × ${i.quantity ?? 1}`)
    .join("\n");
  const codLine = isPaid
    ? "PAID ✅ (No collection needed)"
    : `PKR ${codAmount.toLocaleString()} — cash on delivery`;

  try {
    const delRow = await db.execute(sql`SELECT * FROM rider_deliveries WHERE id = ${deliveryId} LIMIT 1`);
    const del = delRow.rows[0] as Record<string, unknown>;
    if (del) {
      await syncDeliveryToShopify(
        buildSyncPayload("assigned", del as any, {
          name: riderName,
          phone: rider.phone as string | undefined,
        }),
      ).catch(() => {});
    }

    const waPhone = (rider.whatsapp_number || rider.phone) as string | undefined;
    if (waPhone) {
      const msg =
        `🚚 *NEW DELIVERY — Khan Dry Fruits*\n\n` +
        `📦 *Order:* ${input.orderNumber}\n` +
        `👤 *Customer:* ${input.customerName ?? "Customer"}\n` +
        `📞 *Phone:* ${phone ?? "—"}\n` +
        `📍 *Address:* ${deliveryAddr}\n\n` +
        `🛒 *Items:*\n${itemsList || "See order"}\n\n` +
        `💰 *Payment:* ${codLine}\n\n` +
        `Open the KDF Rider app to view details.`;
      const riderWaOk = await sendWhatsAppMessage({ phone: normalizePhone(waPhone), message: msg }).catch(() => false);
      if (riderWaOk) {
        await db
          .execute(sql`UPDATE rider_deliveries SET wa_sent_at = NOW() WHERE id = ${deliveryId}`)
          .catch(() => {});
      }
      await logOrderAutomation({
        shopifyOrderDbId: input.shopifyOrderDbId,
        shopifyOrderId: input.shopifyOrderId,
        orderNumber: input.orderNumber,
        deliveryId,
        eventType: "rider_wa",
        status: riderWaOk ? "success" : "failed",
        message: riderWaOk ? `Rider WA sent to ${riderName}` : "Rider WA send failed",
        scheduleRetry: !riderWaOk,
      });
    }

    const expoPushToken = rider.expo_push_token as string | undefined;
    if (expoPushToken?.startsWith("ExponentPushToken")) {
      const pushOk = await sendExpoPush({
        expoPushToken,
        title: `🚚 نیا آرڈر! ${input.orderNumber}`,
        body: `${input.customerName ?? "Customer"} · ${deliveryAddr} · ${codText}`,
        data: {
          type: "new_order",
          deliveryId: String(deliveryId),
          orderId: String(input.shopifyOrderDbId),
          orderNumber: input.orderNumber,
          screen: "order_detail",
        },
        badge: 1,
        riderId,
        deliveryId,
        orderNumber: input.orderNumber,
      });
      await logOrderAutomation({
        shopifyOrderDbId: input.shopifyOrderDbId,
        shopifyOrderId: input.shopifyOrderId,
        orderNumber: input.orderNumber,
        deliveryId,
        eventType: "rider_push",
        status: pushOk ? "success" : "failed",
        message: pushOk ? "Expo push sent to rider" : "Expo push failed",
        scheduleRetry: !pushOk,
      });
    }

    if (phone) {
      const orderRow = await db.execute(sql`
        SELECT * FROM shopify_orders WHERE id = ${input.shopifyOrderDbId} LIMIT 1
      `);
      const trackingWa = await sendPremiumRiderAssignedNotification({
        deliveryId,
        shopifyOrderDbId: input.shopifyOrderDbId,
        order: (orderRow.rows[0] as Record<string, unknown>) ?? {
          order_number: input.orderNumber,
          customer_phone: phone,
          line_items: input.lineItems,
          total_price: input.totalPrice,
          financial_status: input.financialStatus,
        },
        delivery: (delRow.rows[0] as Record<string, unknown>) ?? {
          id: deliveryId,
          shopify_order_db_id: input.shopifyOrderDbId,
          customer_phone: phone,
          customer_name: input.customerName,
        },
        rider,
      }).catch((waErr) => {
        logger.warn(waErr, "Premium customer WA on Lahore assign failed");
        return { success: false, error: String(waErr) };
      });
      await logOrderAutomation({
        shopifyOrderDbId: input.shopifyOrderDbId,
        shopifyOrderId: input.shopifyOrderId,
        orderNumber: input.orderNumber,
        deliveryId,
        eventType: "customer_tracking_wa",
        status: trackingWa.success ? "success" : "failed",
        message: trackingWa.success ? "Customer tracking WA sent" : (trackingWa.error ?? "Tracking WA failed"),
        errorMessage: trackingWa.error,
        scheduleRetry: !trackingWa.success,
      });
    }

    try {
      const { broadcastSSE } = await import("./sse.js");
      broadcastSSE("rider_assigned", {
        deliveryId,
        orderNumber: input.orderNumber,
        shopifyOrderId: input.shopifyOrderId,
        riderName,
        riderId,
        assignedAt: new Date().toISOString(),
      });
    } catch {}

    await logOrderAutomation({
      shopifyOrderDbId: input.shopifyOrderDbId,
      shopifyOrderId: input.shopifyOrderId,
      orderNumber: input.orderNumber,
      deliveryId,
      eventType: "rider_assign",
      status: "success",
      message: `Assigned to ${riderName}`,
      payload: { riderId, riderName },
    });

    logger.info({ orderNumber: input.orderNumber, riderName, deliveryId }, "Lahore order assigned");
    return {
      assigned: true,
      deliveryId,
      riderId,
      riderName,
      message: `Assigned to ${riderName}`,
    };
  } catch (err) {
    logger.error(err, "Lahore assign notifications failed");
    return {
      assigned: true,
      deliveryId,
      riderId,
      riderName,
      message: "Assigned but some notifications failed",
    };
  }
}

/** Retry Lahore deliveries stuck without a rider (e.g. no rider was online at order time). */
export async function retryPendingLahoreAssignments(): Promise<number> {
  const rows = await db.execute(sql`
    SELECT
      d.shopify_order_db_id AS id,
      d.shopify_order_id,
      d.shopify_order_number AS order_number,
      d.customer_name,
      d.customer_phone,
      o.shipping_address,
      o.total_price,
      o.financial_status,
      o.line_items
    FROM rider_deliveries d
    JOIN shopify_orders o ON o.id = d.shopify_order_db_id
    WHERE d.rider_id IS NULL
      AND d.status IN ('pending', 'confirmed')
      AND (d.city ILIKE '%lahore%' OR o.shipping_address::text ILIKE '%lahore%')
      AND d.created_at > NOW() - INTERVAL '48 hours'
    ORDER BY d.created_at ASC
    LIMIT 8
  `);

  let assigned = 0;
  for (const row of rows.rows as Record<string, unknown>[]) {
    const result = await assignLahoreOrderWithNotifications({
      shopifyOrderDbId: Number(row.id),
      shopifyOrderId: String(row.shopify_order_id ?? ""),
      orderNumber: String(row.order_number ?? ""),
      customerPhone: row.customer_phone ? String(row.customer_phone) : null,
      customerName: row.customer_name ? String(row.customer_name) : null,
      shippingAddress: row.shipping_address,
      totalPrice: row.total_price != null ? String(row.total_price) : null,
      financialStatus: row.financial_status ? String(row.financial_status) : null,
      lineItems: Array.isArray(row.line_items) ? (row.line_items as unknown[]) : [],
    });
    if (result.assigned) assigned += 1;
  }
  if (assigned > 0) {
    logger.info({ assigned, pending: rows.rows.length }, "Retried pending Lahore assignments");
  }
  return assigned;
}
