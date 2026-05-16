/**
 * Enterprise Shopify order automation: confirm → assign rider (Lahore) → tracking WA.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { isLahoreShippingAddress, parseShippingAddress } from "./lahoreShipping.js";
import { assignLahoreOrderWithNotifications } from "./lahoreOrderAssign.js";
import { sendOrderConfirmationWA, upsertOrderConfirmationRecord } from "./ondriveEngine.js";
import {
  sendPremiumOrderConfirmed,
  sendPremiumPaymentConfirmed,
  type OrderWaContext,
} from "./premiumOrderWa.js";
import { logOrderAutomation } from "./orderAutomationLog.js";
import { normalizePhone } from "./whatsapp.js";
import { logger } from "./logger.js";

export type ShopifyAutomationInput = {
  shopifyOrderDbId: number;
  shopifyOrderId: string;
  orderNumber: string;
  customerPhone: string | null;
  customerName: string | null;
  shippingAddress: unknown;
  totalPrice: string | null;
  financialStatus: string | null;
  lineItems: unknown[];
  source?: "webhook" | "sync" | "manual";
};

export type ShopifyAutomationResult = {
  routed: "lahore_rider" | "wa_confirmation" | "skipped";
  message: string;
  assigned?: boolean;
  deliveryId?: number;
};

/** Resolve best customer phone from order row + shipping JSON. */
export function resolveCustomerPhone(
  customerPhone: string | null | undefined,
  shippingAddress: unknown,
  payloadPhone?: string | null,
): string | null {
  const candidates = [
    customerPhone,
    payloadPhone,
    parseShippingAddress(shippingAddress).phone,
  ];
  for (const p of candidates) {
    if (p?.trim()) {
      try {
        return normalizePhone(p.trim());
      } catch {
        continue;
      }
    }
  }
  return null;
}

export async function runShopifyOrderAutomation(
  input: ShopifyAutomationInput,
): Promise<ShopifyAutomationResult> {
  const phone = resolveCustomerPhone(input.customerPhone, input.shippingAddress);
  const isLahore = isLahoreShippingAddress(input.shippingAddress);
  const isPaid = ["paid", "partially_paid"].includes(input.financialStatus ?? "");
  const codAmount = isPaid ? 0 : Number(input.totalPrice ?? 0);

  const waCtx: OrderWaContext = {
    orderNumber: input.orderNumber,
    customerName: input.customerName ?? "Customer",
    customerPhone: phone ?? "",
    lineItems: input.lineItems,
    totalPrice: input.totalPrice,
    financialStatus: input.financialStatus,
    shippingAddress: input.shippingAddress,
    codAmount,
    isPaid,
    shopifyOrderId: input.shopifyOrderId,
    shopifyOrderDbId: input.shopifyOrderDbId,
  };

  await logOrderAutomation({
    shopifyOrderDbId: input.shopifyOrderDbId,
    shopifyOrderId: input.shopifyOrderId,
    orderNumber: input.orderNumber,
    eventType: "webhook_received",
    status: "success",
    message: `Automation started (${input.source ?? "webhook"}) — Lahore: ${isLahore}`,
    payload: { isLahore, hasPhone: Boolean(phone) },
  });

  /* ── LAHORE: order confirmed + rider assign + tracking ── */
  if (isLahore) {
    if (phone) {
      const confirmRes = await sendPremiumOrderConfirmed(waCtx);
      await upsertOrderConfirmationRecord({
        shopifyOrderId: input.shopifyOrderId,
        orderNumber: input.orderNumber,
        shopifyOrderDbId: input.shopifyOrderDbId,
        phone,
        customerName: input.customerName ?? "Customer",
        messageId: null,
      });
      await logOrderAutomation({
        shopifyOrderDbId: input.shopifyOrderDbId,
        shopifyOrderId: input.shopifyOrderId,
        orderNumber: input.orderNumber,
        eventType: "order_confirmed_wa",
        status: confirmRes.success ? "success" : "failed",
        message: confirmRes.success ? "Premium order confirmed sent" : confirmRes.error,
        errorMessage: confirmRes.error,
        scheduleRetry: !confirmRes.success,
      });
    } else {
      await logOrderAutomation({
        shopifyOrderDbId: input.shopifyOrderDbId,
        orderNumber: input.orderNumber,
        eventType: "order_confirmed_wa",
        status: "skipped",
        message: "No customer phone for confirmation",
      });
    }

    try {
      const assign = await assignLahoreOrderWithNotifications({
        shopifyOrderDbId: input.shopifyOrderDbId,
        shopifyOrderId: input.shopifyOrderId,
        orderNumber: input.orderNumber,
        customerPhone: phone,
        customerName: input.customerName,
        shippingAddress: input.shippingAddress,
        totalPrice: input.totalPrice,
        financialStatus: input.financialStatus,
        lineItems: input.lineItems,
      });

      await logOrderAutomation({
        shopifyOrderDbId: input.shopifyOrderDbId,
        shopifyOrderId: input.shopifyOrderId,
        orderNumber: input.orderNumber,
        deliveryId: assign.deliveryId,
        eventType: "rider_assign",
        status: assign.assigned ? "success" : assign.deliveryId ? "skipped" : "failed",
        message: assign.message,
        errorMessage: assign.assigned ? null : assign.message,
        scheduleRetry: !assign.assigned && !assign.deliveryId,
        payload: { riderId: assign.riderId, riderName: assign.riderName },
      });

      await logOrderAutomation({
        shopifyOrderDbId: input.shopifyOrderDbId,
        orderNumber: input.orderNumber,
        deliveryId: assign.deliveryId,
        eventType: "automation_complete",
        status: assign.assigned ? "success" : "failed",
        message: assign.message,
      });

      return {
        routed: "lahore_rider",
        message: assign.message,
        assigned: assign.assigned,
        deliveryId: assign.deliveryId,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(err, "Lahore automation failed");
      await logOrderAutomation({
        shopifyOrderDbId: input.shopifyOrderDbId,
        orderNumber: input.orderNumber,
        eventType: "rider_assign",
        status: "failed",
        message: "Assignment exception",
        errorMessage: msg,
        scheduleRetry: true,
      });
      return { routed: "skipped", message: msg };
    }
  }

  /* ── NON-LAHORE: confirmation / courier flow ── */
  if (!phone) {
    await logOrderAutomation({
      shopifyOrderDbId: input.shopifyOrderDbId,
      orderNumber: input.orderNumber,
      eventType: "order_confirmed_wa",
      status: "skipped",
      message: "No customer phone",
    });
    return { routed: "skipped", message: "No customer phone — skipping WA confirmation" };
  }

  const premium = await sendPremiumOrderConfirmed(waCtx);
  let success = premium.success;
  let errMsg = premium.error;

  if (success) {
    await upsertOrderConfirmationRecord({
      shopifyOrderId: input.shopifyOrderId,
      orderNumber: input.orderNumber,
      shopifyOrderDbId: input.shopifyOrderDbId,
      phone,
      customerName: input.customerName ?? "Customer",
      messageId: null,
    });
  }

  if (!success) {
    const legacy = await sendOrderConfirmationWA({
      phone,
      orderNumber: input.orderNumber,
      customerName: input.customerName ?? "Customer",
      total: input.totalPrice ?? "0",
      items: input.lineItems,
      isPaid,
      codAmount,
      shopifyOrderId: input.shopifyOrderId,
      shopifyOrderDbId: input.shopifyOrderDbId,
    });
    success = legacy.success;
    errMsg = legacy.error;
  }

  await logOrderAutomation({
    shopifyOrderDbId: input.shopifyOrderDbId,
    shopifyOrderId: input.shopifyOrderId,
    orderNumber: input.orderNumber,
    eventType: "order_confirmed_wa",
    status: success ? "success" : "failed",
    message: success ? "Order confirmation sent" : errMsg,
    errorMessage: errMsg,
    scheduleRetry: !success,
  });

  return {
    routed: "wa_confirmation",
    message: success ? "WA confirmation sent" : `WA failed: ${errMsg}`,
  };
}

/** Retry failed automation log entry by id. */
export async function retryAutomationLog(logId: number): Promise<{ ok: boolean; message: string }> {
  const rows = await db.execute(sql`
    SELECT * FROM order_automation_logs WHERE id = ${logId} LIMIT 1
  `);
  const log = rows.rows[0] as Record<string, unknown> | undefined;
  if (!log) return { ok: false, message: "Log not found" };

  const orderRows = log.shopify_order_db_id
    ? await db.execute(sql`SELECT * FROM shopify_orders WHERE id = ${log.shopify_order_db_id} LIMIT 1`)
    : { rows: [] };
  const order = orderRows.rows[0] as Record<string, unknown> | undefined;
  if (!order) return { ok: false, message: "Order not found" };

  const eventType = String(log.event_type);
  if (eventType === "rider_assign" || eventType === "automation_complete") {
    const result = await runShopifyOrderAutomation({
      shopifyOrderDbId: Number(order.id),
      shopifyOrderId: String(order.shopify_order_id),
      orderNumber: String(order.order_number),
      customerPhone: order.customer_phone as string | null,
      customerName: order.customer_name as string | null,
      shippingAddress: order.shipping_address,
      totalPrice: order.total_price as string | null,
      financialStatus: order.financial_status as string | null,
      lineItems: (order.line_items as unknown[]) ?? [],
      source: "manual",
    });
    return { ok: result.assigned !== false, message: result.message };
  }

  if (eventType === "order_confirmed_wa") {
    const phone = resolveCustomerPhone(
      order.customer_phone as string,
      order.shipping_address,
    );
    if (!phone) return { ok: false, message: "No phone" };
    const res = await sendPremiumOrderConfirmed({
      orderNumber: String(order.order_number),
      customerName: String(order.customer_name ?? "Customer"),
      customerPhone: phone,
      lineItems: (order.line_items as unknown[]) ?? [],
      totalPrice: order.total_price as string,
      financialStatus: order.financial_status as string,
      codAmount: Number(order.total_price ?? 0),
      isPaid: order.financial_status === "paid",
    });
    return { ok: res.success, message: res.error ?? "Sent" };
  }

  return { ok: false, message: `Unsupported retry type: ${eventType}` };
}
