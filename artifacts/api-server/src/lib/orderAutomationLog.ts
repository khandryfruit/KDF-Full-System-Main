/**
 * Structured logging for Shopify → rider → customer automation.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export type AutomationEventType =
  | "webhook_received"
  | "order_confirmed_wa"
  | "rider_assign"
  | "rider_push"
  | "rider_wa"
  | "customer_tracking_wa"
  | "status_wa"
  | "payment_wa"
  | "cancelled_wa"
  | "delayed_wa"
  | "automation_complete";

export type AutomationLogStatus = "pending" | "success" | "failed" | "skipped";

export async function logOrderAutomation(row: {
  shopifyOrderDbId?: number | null;
  shopifyOrderId?: string | null;
  orderNumber?: string | null;
  deliveryId?: number | null;
  eventType: AutomationEventType;
  status: AutomationLogStatus;
  message?: string | null;
  errorMessage?: string | null;
  payload?: Record<string, unknown>;
  waMessageId?: string | null;
  scheduleRetry?: boolean;
}): Promise<number> {
  const retry = row.status === "failed" && row.scheduleRetry !== false;
  try {
    const ins = await db.execute(sql`
      INSERT INTO order_automation_logs (
        shopify_order_db_id, shopify_order_id, order_number, delivery_id,
        event_type, status, message, error_message, payload, wa_message_id,
        retry_count, next_retry_at, updated_at
      ) VALUES (
        ${row.shopifyOrderDbId ?? null},
        ${row.shopifyOrderId ?? null},
        ${row.orderNumber ?? null},
        ${row.deliveryId ?? null},
        ${row.eventType},
        ${row.status},
        ${(row.message ?? "").slice(0, 500)},
        ${(row.errorMessage ?? "").slice(0, 1000)},
        ${JSON.stringify(row.payload ?? {})}::jsonb,
        ${row.waMessageId ?? null},
        0,
        ${retry ? sql`NOW() + INTERVAL '3 minutes'` : null},
        NOW()
      )
      RETURNING id
    `);
    return Number((ins.rows[0] as { id: number })?.id ?? 0);
  } catch (err) {
    logger.warn({ err, eventType: row.eventType }, "order_automation_logs insert failed");
    return 0;
  }
}

export async function markAutomationRetryDone(id: number, success: boolean, error?: string): Promise<void> {
  await db.execute(sql`
    UPDATE order_automation_logs SET
      status = ${success ? "success" : "failed"},
      error_message = COALESCE(${error ?? null}, error_message),
      retry_count = retry_count + 1,
      next_retry_at = CASE
        WHEN ${success} THEN NULL
        WHEN retry_count + 1 >= max_retries THEN NULL
        ELSE NOW() + (INTERVAL '1 minute' * POWER(2, LEAST(retry_count + 1, 5)))
      END,
      updated_at = NOW()
    WHERE id = ${id}
  `).catch(() => {});
}
