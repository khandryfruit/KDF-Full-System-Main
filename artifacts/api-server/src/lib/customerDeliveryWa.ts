/**
 * Customer WhatsApp on rider delivery status changes (rider app + admin).
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { revokeTrackingTokens } from "./deliveryWaPremium.js";
import {
  sendPremiumDeliveryStatus,
  resolveTrackingUrlForDelivery,
  type OrderWaContext,
} from "./premiumOrderWa.js";
import { logOrderAutomation } from "./orderAutomationLog.js";
import { normalizePhone } from "./whatsapp.js";

function normalisePhone(raw: string): string {
  return normalizePhone(raw);
}

async function getDeliverySettings(): Promise<{ auto_wa_on_status: boolean; default_eta_minutes: number }> {
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

  const shopifyOrderDbId = Number(del.shopify_order_db_id ?? order?.id ?? 0);
  let trackingUrl: string | undefined;
  if (shopifyOrderDbId && deliveryId) {
    trackingUrl = await resolveTrackingUrlForDelivery(deliveryId, shopifyOrderDbId);
  }

  const ctx: OrderWaContext = {
    orderNumber: String(order?.order_number ?? del.shopify_order_number ?? deliveryId),
    customerName: String(del.customer_name ?? order?.customer_name ?? "Customer"),
    customerPhone: normalisePhone(String(customerPhone)),
    lineItems: (order?.line_items as unknown[]) ?? [],
    totalPrice: order?.total_price ?? del.cod_amount,
    financialStatus: order?.financial_status as string,
    codAmount: Number(del.cod_amount ?? 0),
    isPaid: Boolean(del.is_paid) || order?.financial_status === "paid",
    deliveryId,
    shopifyOrderDbId,
    rider: {
      name: del.rider_name as string,
      phone: del.rider_phone as string,
    },
    trackingUrl,
    etaLabel:
      del.eta_minutes != null
        ? `${del.eta_minutes} minutes`
        : `${settings.default_eta_minutes} minutes`,
  };

  const sent = await sendPremiumDeliveryStatus(status, ctx);

  await logOrderAutomation({
    shopifyOrderDbId: shopifyOrderDbId || undefined,
    orderNumber: ctx.orderNumber,
    deliveryId,
    eventType: "status_wa",
    status: sent.success ? "success" : "failed",
    message: `Status: ${status}`,
    errorMessage: sent.error,
    scheduleRetry: !sent.success,
    payload: { status },
  });

  if (sent.success) {
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
