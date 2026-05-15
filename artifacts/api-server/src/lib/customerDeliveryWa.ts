/**
 * Customer WhatsApp on rider delivery status changes (rider app + admin).
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  sendWhatsAppMessage,
  sendOrderStatusUpdate,
  sendFailedDeliveryNotification,
  sendReturnRefundNotification,
} from "./whatsapp.js";
import { revokeTrackingTokens } from "./deliveryWaPremium.js";
import { logger } from "./logger.js";

function normalisePhone(raw: string): string {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("92")) return `+${digits}`;
  if (digits.startsWith("0")) return `+92${digits.slice(1)}`;
  if (digits.length === 10) return `+92${digits}`;
  return raw.startsWith("+") ? raw : `+${digits}`;
}

async function getDeliverySettings(): Promise<{
  auto_wa_on_status: boolean;
  default_eta_minutes: number;
}> {
  try {
    const rows = await db.execute(sql`
      SELECT COALESCE(auto_wa_on_status, true) AS auto_wa_on_status,
        COALESCE(default_eta_minutes, 45) AS default_eta_minutes
      FROM rider_delivery_settings WHERE id = 1 LIMIT 1
    `);
    const r = rows.rows[0] as Record<string, unknown> | undefined;
    if (r) {
      return {
        auto_wa_on_status: Boolean(r.auto_wa_on_status),
        default_eta_minutes: Number(r.default_eta_minutes) || 45,
      };
    }
  } catch {}
  return { auto_wa_on_status: true, default_eta_minutes: 45 };
}

function buildCustomerStatusMessage(
  status: string,
  order: Record<string, unknown> | null,
  delivery: Record<string, unknown>,
  etaMinutes?: number | null,
): string {
  const orderNum = order?.order_number ?? delivery?.shopify_order_number ?? "—";
  const customerName = delivery?.customer_name ?? "Customer";
  const cod = Number(delivery?.cod_amount ?? 0);
  const isPaid = order?.financial_status === "paid" || delivery?.is_paid;
  const codText = isPaid ? "PAID ✅" : `PKR ${cod.toLocaleString()} Cash on Delivery`;
  const riderName = delivery?.rider_name ?? "";
  const riderPhone = delivery?.rider_phone ?? "";
  const addr = delivery?.delivery_address ?? "";
  const etaText = etaMinutes
    ? etaMinutes <= 60
      ? `${etaMinutes} minutes`
      : `${Math.floor(etaMinutes / 60)} hour${etaMinutes >= 120 ? "s" : ""}`
    : "30-45 minutes";

  switch (status) {
    case "picked":
      return `📦 *Order Picked Up!*\n\nHi ${customerName}!\n\nOrder *${orderNum}* has been picked up and is on its way.\n\n🛵 *Rider:* ${riderName || "KDF Rider"}\n⏱️ *ETA:* ${etaText}\n💰 *${codText}*\n\n🌰 Khan Dry Fruits`;
    case "out_for_delivery":
      return `🚚 *Out for Delivery!*\n\nHi ${customerName}!\n\nOrder *${orderNum}* is on its way.\n\n🛵 *Rider:* ${riderName || "KDF Rider"}\n📞 ${riderPhone || "Available on arrival"}\n⏱️ *Arriving in:* ${etaText}\n💰 *${codText}*\n\n🌰 Khan Dry Fruits`;
    case "near_customer":
      return `📍 *Rider is Near You!*\n\nHi ${customerName}!\n\nYour order *${orderNum}* — rider is nearby. Please keep your phone on.\n\n💰 *${codText}*\n\n🌰 Khan Dry Fruits`;
    case "delivered":
      return `✅ *Delivered!*\n\nHi ${customerName}!\n\nOrder *${orderNum}* has been delivered. Thank you for shopping with Khan Dry Fruits! 🌰`;
    case "failed":
      return `⚠️ *Delivery Update*\n\nHi ${customerName},\n\nWe could not complete delivery for order *${orderNum}*. Our team will contact you shortly.\n\n🌰 Khan Dry Fruits`;
    default:
      return `📦 *Order Update*\n\nHi ${customerName}! Order *${orderNum}*: *${status.replace(/_/g, " ")}*.\n\n🌰 Khan Dry Fruits`;
  }
}

/** Notify customer on delivery status change (non-blocking; call from setImmediate). */
export async function notifyCustomerOnDeliveryStatus(
  deliveryId: number,
  status: string,
  opts?: { skip?: boolean },
): Promise<void> {
  if (opts?.skip) return;

  const settings = await getDeliverySettings();
  if (!settings.auto_wa_on_status) return;

  const delRow = await db.execute(sql`
    SELECT d.*, r.name AS rider_name, r.phone AS rider_phone
    FROM rider_deliveries d
    LEFT JOIN riders r ON r.id = d.rider_id
    WHERE d.id = ${deliveryId}
    LIMIT 1
  `);
  const del = delRow.rows[0] as Record<string, unknown> | undefined;
  if (!del) return;

  const orderRows = del.shopify_order_db_id
    ? await db.execute(sql`SELECT * FROM shopify_orders WHERE id = ${del.shopify_order_db_id} LIMIT 1`)
    : { rows: [] };
  const order = (orderRows.rows[0] as Record<string, unknown>) ?? null;

  let customerPhone = del.customer_phone as string | null;
  if (!customerPhone && order?.shipping_address) {
    try {
      const a =
        typeof order.shipping_address === "string"
          ? JSON.parse(order.shipping_address)
          : order.shipping_address;
      customerPhone = (a as { phone?: string })?.phone ?? null;
    } catch {}
  }
  if (!customerPhone) return;

  const normPhone = normalisePhone(String(customerPhone));
  const orderNumber = String(order?.order_number ?? del.shopify_order_number ?? deliveryId);

  const TEMPLATE_STATUS: Record<string, string> = {
    assigned: "processing",
    picked: "processing",
    out_for_delivery: "out_for_delivery",
    near_customer: "out_for_delivery",
    delivered: "delivered",
  };

  let sent = false;
  const templateStatus = TEMPLATE_STATUS[status];

  if (templateStatus) {
    sent = Boolean(
      await sendOrderStatusUpdate({
        phone: normPhone,
        orderNumber,
        status: templateStatus as "processing" | "out_for_delivery" | "delivered",
        trackingId: order?.tracking_number as string | undefined,
      }).catch(() => false),
    );
  } else if (status === "failed") {
    sent = Boolean(
      await sendFailedDeliveryNotification({
        phone: normPhone,
        orderNumber,
        customerName: del.customer_name as string | undefined,
      }).catch(() => false),
    );
  } else if (status === "returned") {
    sent = Boolean(
      await sendReturnRefundNotification({
        phone: normPhone,
        orderNumber,
        customerName: del.customer_name as string | undefined,
        type: "return",
      }).catch(() => false),
    );
  } else {
    const message = buildCustomerStatusMessage(
      status,
      order,
      del,
      Number(del.eta_minutes) || settings.default_eta_minutes,
    );
    sent = Boolean(await sendWhatsAppMessage({ phone: normPhone, message }).catch(() => false));
  }

  if (sent) {
    await db
      .execute(
        sql`UPDATE rider_deliveries SET customer_wa_status_at = NOW(), updated_at = NOW() WHERE id = ${deliveryId}`,
      )
      .catch(() => {});
  }

  if (status === "delivered") {
    await revokeTrackingTokens(deliveryId).catch(() => {});
    await db
      .execute(sql`
        UPDATE delivery_wa_notifications SET status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE delivery_id = ${deliveryId}
      `)
      .catch(() => {});
  }
}
