/**
 * Background retry for failed order automation + WA sends.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { retryAutomationLog, runShopifyOrderAutomation } from "./orderAutomationEngine.js";
import { markAutomationRetryDone } from "./orderAutomationLog.js";
import { retryPendingLahoreAssignments } from "./lahoreOrderAssign.js";
import { processFailedDeliveryWaRetries } from "./deliveryWaPremium.js";

export async function processOrderAutomationRetries(): Promise<{
  automation: number;
  lahore: number;
  deliveryWa: number;
  missedOrders: number;
}> {
  let automation = 0;
  let lahore = 0;
  let missedOrders = 0;

  try {
    const rows = await db.execute(sql`
      SELECT id FROM order_automation_logs
      WHERE status = 'failed'
        AND retry_count < max_retries
        AND (next_retry_at IS NULL OR next_retry_at <= NOW())
      ORDER BY created_at ASC
      LIMIT 15
    `);

    for (const row of rows.rows as { id: number }[]) {
      try {
        const result = await retryAutomationLog(row.id);
        await markAutomationRetryDone(row.id, result.ok, result.message);
        if (result.ok) automation += 1;
      } catch (err) {
        await markAutomationRetryDone(
          row.id,
          false,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  } catch (err) {
    logger.warn(err, "order_automation_logs retry query failed (table may not exist yet)");
  }

  try {
    lahore = await retryPendingLahoreAssignments();
  } catch (err) {
    logger.warn(err, "Lahore pending assign retry failed");
  }

  try {
    await processFailedDeliveryWaRetries();
  } catch (err) {
    logger.warn(err, "delivery WA retry failed");
  }

  try {
    const missed = await db.execute(sql`
      SELECT o.*
      FROM shopify_orders o
      WHERE o.created_at > NOW() - INTERVAL '48 hours'
        AND COALESCE(o.wa_notification_sent, FALSE) = FALSE
        AND COALESCE(o.customer_phone, o.shipping_address->>'phone') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM order_automation_logs l
          WHERE l.shopify_order_db_id = o.id
            AND l.event_type = 'order_confirmed_wa'
            AND l.status = 'success'
        )
        AND NOT EXISTS (
          SELECT 1 FROM shopify_order_confirmations c
          WHERE (c.shopify_order_db_id = o.id OR c.shopify_order_id = o.shopify_order_id)
            AND c.last_sent_at IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM order_automation_logs l
          WHERE l.shopify_order_db_id = o.id
            AND l.event_type = 'order_confirmed_wa'
            AND l.status = 'failed'
            AND COALESCE(l.retry_count, 0) >= COALESCE(l.max_retries, 3)
        )
      ORDER BY o.created_at ASC
      LIMIT 10
    `);

    for (const order of missed.rows as any[]) {
      try {
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
          source: "sync",
        });
        if (result.routed !== "skipped") missedOrders += 1;
      } catch (err) {
        logger.warn({ err, orderId: order.id }, "Missed Shopify order WA recovery failed");
      }
    }
  } catch (err) {
    logger.warn(err, "Missed Shopify order recovery query failed");
  }

  if (automation > 0 || lahore > 0 || missedOrders > 0) {
    logger.info({ automation, lahore, missedOrders }, "Order automation retries processed");
  }

  return { automation, lahore, deliveryWa: 0, missedOrders };
}
