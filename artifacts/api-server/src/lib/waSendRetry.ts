import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendWhatsAppMessage } from "./whatsapp";
import { sendLifecycleWhatsApp } from "./waTemplateEvents.js";
import { logger } from "./logger";

const RETRY_INTERVAL_MS = 60_000;
const MAX_RETRIES = 3;
const BATCH = 15;

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Retry failed free-text sends logged in whatsapp_logs (status=failed, not templates).
 */
async function processFailedMessageRetries() {
  try {
    const rows = await db.execute(sql`
      SELECT id, phone, message, template_name AS "templateName", response, retry_count AS "retryCount"
      FROM whatsapp_logs
      WHERE status = 'failed'
        AND (template_name IS NULL OR (template_name NOT LIKE 'incoming%' AND template_name NOT LIKE 'auto_retry:%'))
        AND message IS NOT NULL
        AND message NOT LIKE '[template]%'
        AND created_at > NOW() - INTERVAL '48 hours'
        AND COALESCE(retry_count, 0) < ${MAX_RETRIES}
        AND (last_retry_at IS NULL OR last_retry_at < NOW() - INTERVAL '5 minutes')
      ORDER BY created_at ASC
      LIMIT ${BATCH}
    `);

    for (const row of rows.rows as Array<{
      id: number;
      phone: string;
      message: string;
      templateName: string | null;
      response: string | null;
      retryCount: number | null;
    }>) {
      if (!row.phone || !row.message) continue;
      let retryCount = Number(row.retryCount ?? 0);
      try {
        const parsed = row.response ? JSON.parse(row.response) : {};
        retryCount = Math.max(retryCount, Number(parsed?.autoRetryCount ?? 0));
      } catch { /* ignore */ }
      if (retryCount >= MAX_RETRIES) continue;

      const ok = await sendWhatsAppMessage({
        phone: row.phone,
        message: row.message,
        templateName: row.templateName ?? undefined,
      });

      await db.execute(sql`
        UPDATE whatsapp_logs
        SET status = ${ok ? "sent" : "failed"},
            delivery_status = ${ok ? "sent" : "failed"},
            retry_count = COALESCE(retry_count, 0) + 1,
            last_retry_at = NOW(),
            response = ${JSON.stringify({ autoRetryCount: retryCount + 1, lastRetryAt: new Date().toISOString(), autoRecovery: true })}
        WHERE id = ${row.id}
      `).catch(() => {});
    }

    const templateRows = await db.execute(sql`
      SELECT id, phone, message, template_name AS "templateName", trigger_event AS "triggerEvent",
             shopify_order_id AS "shopifyOrderId", response, retry_count AS "retryCount"
      FROM whatsapp_logs
      WHERE status = 'failed'
        AND message LIKE '[template]%'
        AND phone IS NOT NULL
        AND created_at > NOW() - INTERVAL '48 hours'
        AND COALESCE(retry_count, 0) < ${MAX_RETRIES}
        AND (last_retry_at IS NULL OR last_retry_at < NOW() - INTERVAL '5 minutes')
      ORDER BY created_at ASC
      LIMIT ${Math.max(5, Math.floor(BATCH / 2))}
    `);

    for (const row of templateRows.rows as Array<{
      id: number;
      phone: string;
      message: string | null;
      templateName: string | null;
      triggerEvent: string | null;
      shopifyOrderId: string | null;
      retryCount: number | null;
    }>) {
      const trigger = row.triggerEvent ?? row.templateName;
      if (!row.phone || !trigger || trigger === "incoming") continue;

      let params = ["Customer", row.shopifyOrderId ?? "Order", "Rs. 0", "Cash on delivery"];
      if (row.shopifyOrderId) {
        const orderRows = await db.execute(sql`
          SELECT order_number, customer_name, total_price, financial_status
          FROM shopify_orders
          WHERE shopify_order_id = ${row.shopifyOrderId}
          LIMIT 1
        `).catch(() => ({ rows: [] }));
        const order = (orderRows.rows[0] as any) ?? null;
        if (order) {
          params = [
            String(order.customer_name ?? "Customer").split(/\s+/)[0] || "Customer",
            String(order.order_number ?? row.shopifyOrderId),
            `Rs. ${Number(order.total_price ?? 0).toLocaleString("en-PK")}`,
            String(order.financial_status ?? "").includes("paid") ? "Paid online" : "Cash on delivery",
          ];
        }
      }

      const result = await sendLifecycleWhatsApp({
        triggerEvent: trigger,
        phone: row.phone,
        bodyParams: params,
        fallbackText: row.message ?? `[template] ${trigger}`,
        shopifyOrderId: row.shopifyOrderId ?? undefined,
      }).catch((err) => ({ success: false, error: String(err) }));

      await db.execute(sql`
        UPDATE whatsapp_logs
        SET retry_count = COALESCE(retry_count, 0) + 1,
            last_retry_at = NOW(),
            response = ${JSON.stringify({ templateAutoRetry: true, success: result.success, error: result.error, lastRetryAt: new Date().toISOString() })}
        WHERE id = ${row.id}
      `).catch(() => {});
    }
  } catch (err) {
    logger.warn({ err }, "WA send retry processor error");
  }
}

export function startWaSendRetryProcessor() {
  if (timer) return;
  timer = setInterval(() => void processFailedMessageRetries(), RETRY_INTERVAL_MS);
  logger.info("WA failed-message retry processor started");
}
