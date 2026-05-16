/**
 * Backfill wa_conversations / wa_messages from whatsapp_logs when inbox is empty or stale.
 */
import { db, waConversationsTable, waMessagesTable, whatsappLogsTable } from "@workspace/db";
import { eq, or, sql, desc } from "drizzle-orm";
import { normalizePhone } from "./waPhone";
import { logger } from "./logger";

let lastSyncAt = 0;
const SYNC_COOLDOWN_MS = 45_000;

const BOT_TEMPLATES = new Set([
  "ai_reply",
  "ai_fallback",
  "deterministic_reply",
  "human_greeting",
  "catalog_intro",
  "quick_order_menu",
]);

function phoneLookupKeys(raw: string, normalized: string): string[] {
  const keys = new Set<string>([raw, normalized].filter(Boolean));
  if (normalized.startsWith("92")) keys.add("0" + normalized.slice(2));
  return [...keys];
}

export async function syncWaInboxFromWhatsappLogs(opts?: {
  force?: boolean;
  phoneLimit?: number;
  messagesPerPhone?: number;
}): Promise<{ conversationsUpserted: number; messagesInserted: number }> {
  const now = Date.now();
  if (!opts?.force && now - lastSyncAt < SYNC_COOLDOWN_MS) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(waConversationsTable)
      .catch(() => [{ count: 0 }]);
    if (Number(count ?? 0) > 0) {
      return { conversationsUpserted: 0, messagesInserted: 0 };
    }
  }
  lastSyncAt = now;

  const phoneLimit = Math.min(500, opts?.phoneLimit ?? 350);
  const messagesPerPhone = Math.min(120, opts?.messagesPerPhone ?? 60);

  const phoneRows = await db.execute(sql`
    SELECT
      phone,
      MAX(created_at) AS last_at,
      (ARRAY_AGG(COALESCE(NULLIF(TRIM(message), ''), template_name) ORDER BY created_at DESC))[1] AS last_msg,
      COUNT(*) FILTER (WHERE template_name = 'incoming' OR status = 'received')::int AS inbound_cnt
    FROM whatsapp_logs
    WHERE phone IS NOT NULL AND TRIM(phone) <> '' AND phone <> 'unknown'
    GROUP BY phone
    ORDER BY MAX(created_at) DESC
    LIMIT ${phoneLimit}
  `);

  let conversationsUpserted = 0;
  let messagesInserted = 0;

  for (const row of (phoneRows.rows ?? []) as Array<{
    phone: string;
    last_at: string | Date;
    last_msg: string | null;
    inbound_cnt: number;
  }>) {
    try {
      const rawPhone = String(row.phone ?? "").trim();
      const phone = normalizePhone(rawPhone);
      if (!phone || phone === "unknown") continue;

      const lastAt = row.last_at ? new Date(row.last_at) : new Date();
      const preview = String(row.last_msg ?? "").slice(0, 120) || "Message";
      const keys = phoneLookupKeys(rawPhone, phone);

      const [conv] = await db
        .insert(waConversationsTable)
        .values({
          contactPhone: phone,
          contactWaId: phone,
          lastMessage: preview,
          lastMessageAt: lastAt,
          unreadCount: Math.min(Number(row.inbound_cnt ?? 0), 99),
          botMode: "auto",
          status: "open",
        })
        .onConflictDoUpdate({
          target: waConversationsTable.contactPhone,
          set: {
            lastMessage: preview,
            lastMessageAt: lastAt,
            updatedAt: new Date(),
          },
        })
        .returning({ id: waConversationsTable.id });

      const convId = conv?.id;
      if (!convId) continue;
      conversationsUpserted++;

      const logs = await db
        .select()
        .from(whatsappLogsTable)
        .where(or(...keys.map((k) => eq(whatsappLogsTable.phone, k))))
        .orderBy(desc(whatsappLogsTable.createdAt))
        .limit(messagesPerPhone);

      for (const log of logs.reverse()) {
        const text = String(log.message ?? "").trim();
        if (!text && log.templateName !== "incoming") continue;

        if (log.messageId) {
          const [dup] = await db
            .select({ id: waMessagesTable.id })
            .from(waMessagesTable)
            .where(eq(waMessagesTable.waMessageId, log.messageId))
            .limit(1);
          if (dup) continue;
        }

        const isInbound = log.templateName === "incoming" || log.status === "received";
        const direction = isInbound ? "in" : "out";
        const tpl = log.templateName ?? undefined;

        await db
          .insert(waMessagesTable)
          .values({
            conversationId: convId,
            waMessageId: log.messageId ?? null,
            direction,
            type: "text",
            content: text || `[${tpl ?? log.status}]`,
            status: log.deliveryStatus ?? log.status ?? "sent",
            isBot: !isInbound && (BOT_TEMPLATES.has(tpl ?? "") || tpl?.startsWith("catalog_") === true),
            templateName: tpl ?? null,
            createdAt: log.createdAt ?? new Date(),
          })
          .catch(() => {});

        messagesInserted++;
      }
    } catch (err) {
      logger.warn({ err, phone: row.phone }, "WA inbox sync row failed");
    }
  }

  if (conversationsUpserted > 0) {
    logger.info({ conversationsUpserted, messagesInserted }, "WA inbox synced from whatsapp_logs");
  }

  return { conversationsUpserted, messagesInserted };
}
