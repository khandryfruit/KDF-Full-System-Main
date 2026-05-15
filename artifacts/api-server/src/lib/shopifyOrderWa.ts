/**
 * Shopify order webhooks → approved WhatsApp lifecycle templates.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { resolveCustomerPhone } from "./orderAutomationEngine.js";
import { logOrderAutomation } from "./orderAutomationLog.js";
import {
  sendPremiumOrderConfirmed,
  sendPremiumPaymentConfirmed,
  sendPremiumOrderCancelled,
  type OrderWaContext,
} from "./premiumOrderWa.js";
import { sendLifecycleWhatsApp, wasLifecycleMessageSentRecently } from "./waTemplateEvents.js";
import { logger } from "./logger.js";

function buildCtxFromPayload(payload: Record<string, unknown>, phone: string): OrderWaContext {
  const customer = payload.customer as Record<string, unknown> | undefined;
  const lineItems = (payload.line_items as unknown[]) ?? [];
  const financialStatus = String(payload.financial_status ?? "");
  const isPaid = ["paid", "partially_paid"].includes(financialStatus);
  return {
    orderNumber: String(payload.name ?? `#${payload.order_number}`),
    customerName: customer
      ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
      : "Customer",
    customerPhone: phone,
    lineItems,
    totalPrice: payload.total_price as string,
    financialStatus,
    isPaid,
    codAmount: isPaid ? 0 : Number(payload.total_price ?? 0),
    shopifyOrderId: String(payload.id),
  };
}

async function getOrderDbId(shopifyOrderId: string): Promise<number> {
  const row = await db.execute(sql`
    SELECT id FROM shopify_orders WHERE shopify_order_id = ${shopifyOrderId} LIMIT 1
  `);
  return Number((row.rows[0] as { id?: number })?.id ?? 0);
}

/** orders/fulfilled → order_shipped */
export async function sendShopifyFulfilledWa(payload: Record<string, unknown>): Promise<void> {
  const shopifyOrderId = String(payload.id);
  if (await wasLifecycleMessageSentRecently("order_shipped", shopifyOrderId)) return;

  const phone = resolveCustomerPhone(
    null,
    payload.shipping_address ?? payload.billing_address,
    (payload.phone ?? (payload.shipping_address as { phone?: string })?.phone) as string,
  );
  if (!phone) return;

  const orderNum = String(payload.name ?? `#${payload.order_number}`);
  const tracking =
    (payload.fulfillments as { tracking_number?: string }[])?.[0]?.tracking_number ??
    (payload as { tracking_number?: string }).tracking_number ??
    "";

  const name = buildCtxFromPayload(payload, phone).customerName.split(/\s+/)[0];
  const fallback =
    `🚚 *Order Shipped — Khan Dry Fruits*\n\n` +
    `Assalam o Alaikum *${name}*,\n\n` +
    `Your order *${orderNum}* has been shipped!` +
    (tracking ? `\n\n📦 Tracking: *${tracking}*` : "") +
    `\n\nThank you for shopping with us 🌰`;

  const res = await sendLifecycleWhatsApp({
    triggerEvent: "order_shipped",
    phone,
    bodyParams: [name, orderNum, tracking || "—"],
    fallbackText: fallback,
    shopifyOrderId,
  });

  const dbId = await getOrderDbId(shopifyOrderId);
  await logOrderAutomation({
    shopifyOrderDbId: dbId || undefined,
    shopifyOrderId,
    orderNumber: orderNum,
    eventType: "status_wa",
    status: res.success ? "success" : "failed",
    message: res.usedTemplate ? "order_shipped template" : "order_shipped fallback",
    errorMessage: res.error,
    scheduleRetry: !res.success,
    payload: { topic: "orders/fulfilled", tracking },
  });
}

/** orders/cancelled → cancel_order */
export async function sendShopifyCancelledWa(payload: Record<string, unknown>): Promise<void> {
  const shopifyOrderId = String(payload.id);
  if (await wasLifecycleMessageSentRecently("cancel_order", shopifyOrderId)) return;

  const phone = resolveCustomerPhone(
    null,
    payload.shipping_address ?? payload.billing_address,
    (payload.phone ?? (payload.shipping_address as { phone?: string })?.phone) as string,
  );
  if (!phone) return;

  const ctx = buildCtxFromPayload(payload, phone);
  const res = await sendPremiumOrderCancelled(ctx);

  const dbId = await getOrderDbId(shopifyOrderId);
  await logOrderAutomation({
    shopifyOrderDbId: dbId || undefined,
    shopifyOrderId,
    orderNumber: ctx.orderNumber,
    eventType: "cancelled_wa",
    status: res.success ? "success" : "failed",
    message: "cancel_order template",
    errorMessage: res.error,
    scheduleRetry: !res.success,
  });
}

/** Refund/return on orders/updated */
export async function sendShopifyReturnWaIfNeeded(
  payload: Record<string, unknown>,
  previousFinancialStatus?: string,
): Promise<void> {
  const status = String(payload.financial_status ?? "").toLowerCase();
  if (!["refunded", "partially_refunded", "voided"].includes(status)) return;
  if (previousFinancialStatus === status) return;

  const shopifyOrderId = String(payload.id);
  if (await wasLifecycleMessageSentRecently("shipment_return_update", shopifyOrderId)) return;

  const phone = resolveCustomerPhone(
    null,
    payload.shipping_address ?? payload.billing_address,
    (payload.phone ?? (payload.shipping_address as { phone?: string })?.phone) as string,
  );
  if (!phone) return;

  const orderNum = String(payload.name ?? `#${payload.order_number}`);
  const name = buildCtxFromPayload(payload, phone).customerName.split(/\s+/)[0];
  const fallback =
    `↩️ *Return / Refund Update — Khan Dry Fruits*\n\n` +
    `Hi *${name}*, we've processed an update for order *${orderNum}*.\n\n` +
    `Our team will contact you if any action is needed. 📞`;

  const res = await sendLifecycleWhatsApp({
    triggerEvent: "shipment_return_update",
    phone,
    bodyParams: [name, orderNum],
    fallbackText: fallback,
    shopifyOrderId,
  });

  const dbId = await getOrderDbId(shopifyOrderId);
  await logOrderAutomation({
    shopifyOrderDbId: dbId || undefined,
    shopifyOrderId,
    orderNumber: orderNum,
    eventType: "status_wa",
    status: res.success ? "success" : "failed",
    message: "shipment_return_update",
    errorMessage: res.error,
    scheduleRetry: !res.success,
    payload: { financialStatus: status },
  });
}

/** Re-export helpers used from webhooks */
export { sendPremiumOrderConfirmed, sendPremiumPaymentConfirmed };
