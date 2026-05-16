import { db, whatsappLogsTable } from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";
import { sendWhatsAppMessage } from "./whatsapp";
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
  } catch (err) {
    logger.warn({ err }, "WA send retry processor error");
  }
}

export function startWaSendRetryProcessor() {
  if (timer) return;
  timer = setInterval(() => void processFailedMessageRetries(), RETRY_INTERVAL_MS);
  logger.info("WA failed-message retry processor started");
}
