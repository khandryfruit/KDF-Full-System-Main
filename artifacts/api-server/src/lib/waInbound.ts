import { db, waConversationsTable, waMessagesTable, whatsappSettingsTable } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";
import { normalizePhone, normalizeWaContactKey, isWaGroupId } from "./waPhone";
import { broadcastSSE } from "./sse";
import { logger } from "./logger";

export interface InboundMessagePayload {
  phoneRaw: string;
  msgId?: string;
  msgType: string;
  rawText: string;
  mediaUrl?: string | null;
  mediaCaption?: string | null;
  reactionEmoji?: string | null;
  contactName?: string | null;
  metadata?: { phone_number_id?: string; display_phone_number?: string };
}

/**
 * Resolve wa_conversations row by normalized phone (merge legacy un-normalized keys).
 */
export async function resolveWaConversationId(normalizedPhone: string, phoneRaw: string): Promise<number | null> {
  const candidates = [normalizedPhone, phoneRaw].filter((p, i, a) => p && a.indexOf(p) === i);
  for (const key of candidates) {
    const [row] = await db
      .select({ id: waConversationsTable.id, contactPhone: waConversationsTable.contactPhone })
      .from(waConversationsTable)
      .where(or(eq(waConversationsTable.contactPhone, key), eq(waConversationsTable.contactWaId, key)))
      .limit(1);
    if (row?.id) {
      if (row.contactPhone !== normalizedPhone) {
        await db
          .update(waConversationsTable)
          .set({ contactPhone: normalizedPhone, contactWaId: normalizedPhone, updatedAt: new Date() })
          .where(eq(waConversationsTable.id, row.id))
          .catch((err) => logger.warn({ err, from: row.contactPhone, to: normalizedPhone }, "WA conversation phone merge failed"));
      }
      return row.id;
    }
  }
  return null;
}

/** Warn if Meta webhook targets a different phone_number_id than configured. */
export async function verifyWebhookPhoneNumberId(metadata?: { phone_number_id?: string }): Promise<void> {
  const incomingId = metadata?.phone_number_id?.trim();
  if (!incomingId) return;
  const [settings] = await db
    .select({ phoneNumberId: whatsappSettingsTable.phoneNumberId })
    .from(whatsappSettingsTable)
    .limit(1);
  const configured = settings?.phoneNumberId?.trim();
  if (configured && incomingId !== configured) {
    logger.error(
      { incomingId, configuredId: configured },
      "WA webhook phone_number_id mismatch — inbound may be for wrong number; check Meta app WABA binding",
    );
  }
}

/**
 * Persist customer inbound message to wa_conversations + wa_messages (Unified Inbox).
 */
export async function persistInboundWaMessage(
  payload: InboundMessagePayload,
  log: typeof logger = logger,
): Promise<{ conversationId: number | null; phone: string }> {
  const phoneRaw = payload.phoneRaw?.trim() || "unknown";
  if (phoneRaw === "unknown") {
    log.warn("WA inbound skipped: missing sender phone");
    return { conversationId: null, phone: phoneRaw };
  }

  const phone = normalizeWaContactKey(phoneRaw);
  const isGroup = isWaGroupId(phoneRaw);
  await verifyWebhookPhoneNumberId(payload.metadata);

  const preview = (payload.rawText || `[${payload.msgType}]`).slice(0, 120);

  try {
    let conversationId = await resolveWaConversationId(phone, phoneRaw);

    if (conversationId) {
      await db
        .update(waConversationsTable)
        .set({
          ...(payload.contactName ? { contactName: payload.contactName } : {}),
          lastMessage: preview,
          lastMessageAt: new Date(),
          unreadCount: sql`${waConversationsTable.unreadCount} + 1`,
          status: "open",
          updatedAt: new Date(),
        })
        .where(eq(waConversationsTable.id, conversationId));
    } else {
      const [created] = await db
        .insert(waConversationsTable)
        .values({
          contactPhone: phone,
          contactName: payload.contactName ?? undefined,
          contactWaId: phone,
          lastMessage: preview,
          lastMessageAt: new Date(),
          unreadCount: 1,
          botMode: "auto",
          status: "open",
        })
        .returning({ id: waConversationsTable.id });
      conversationId = created?.id ?? null;
    }

    if (!conversationId) {
      log.error({ phone, msgId: payload.msgId }, "WA inbound: failed to upsert conversation");
      return { conversationId: null, phone };
    }

    if (payload.msgId) {
      const [dup] = await db
        .select({ id: waMessagesTable.id })
        .from(waMessagesTable)
        .where(eq(waMessagesTable.waMessageId, payload.msgId))
        .limit(1);
      if (dup?.id) {
        return { conversationId, phone };
      }
    }

    await db.insert(waMessagesTable).values({
      conversationId,
      waMessageId: payload.msgId ?? null,
      direction: "in",
      type: payload.msgType,
      content: payload.rawText,
      mediaUrl: payload.mediaUrl ?? null,
      caption: payload.mediaCaption ?? null,
      reaction: payload.reactionEmoji ?? null,
      status: "received",
      isBot: false,
      metadata: isGroup ? { isGroup: true, groupId: phoneRaw } : undefined,
    });

    broadcastSSE("wa_message", {
      conversationId,
      direction: "in",
      content: payload.rawText,
      phone,
      msgType: payload.msgType,
      mediaUrl: payload.mediaUrl,
      mediaCaption: payload.mediaCaption,
      reactionEmoji: payload.reactionEmoji,
    });

    db.execute(sql`SELECT COALESCE(SUM(unread_count), 0)::int AS total FROM wa_conversations`)
      .then((r: { rows?: Array<{ total?: number }> }) => {
        const total = (r.rows ?? (r as unknown as Array<{ total?: number }>))[0]?.total ?? 0;
        broadcastSSE("wa_unread_count", { total });
      })
      .catch(() => {});

    log.info(
      { phone, conversationId, msgId: payload.msgId, msgType: payload.msgType, preview: preview.slice(0, 80) },
      "WA inbound message stored in inbox",
    );

    return { conversationId, phone };
  } catch (err) {
    log.error({ err, phone, msgId: payload.msgId }, "WA inbound persist failed");
    return { conversationId: null, phone };
  }
}
