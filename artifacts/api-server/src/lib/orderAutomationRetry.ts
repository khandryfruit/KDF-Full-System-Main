/**
 * Background retry for failed order automation + WA sends.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { retryAutomationLog } from "./orderAutomationEngine.js";
import { markAutomationRetryDone } from "./orderAutomationLog.js";
import { retryPendingLahoreAssignments } from "./lahoreOrderAssign.js";
import { processFailedDeliveryWaRetries } from "./deliveryWaPremium.js";

export async function processOrderAutomationRetries(): Promise<{
  automation: number;
  lahore: number;
  deliveryWa: number;
}> {
  let automation = 0;
  let lahore = 0;

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

  if (automation > 0 || lahore > 0) {
    logger.info({ automation, lahore }, "Order automation retries processed");
  }

  return { automation, lahore, deliveryWa: 0 };
}
