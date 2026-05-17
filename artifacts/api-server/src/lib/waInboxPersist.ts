import { db, waConversationsTable, waMessagesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { normalizePhone } from "./waPhone";
import { broadcastSSE } from "./sse";
import { logger } from "./logger";

export interface PersistOutboundOpts {
  phone: string;
  content: string;
  type?: string;
  waMessageId?: string | null;
  isBot?: boolean;
  templateName?: string;
  status?: string;
}

/**
 * Mirror outbound API sends into wa_conversations / wa_messages so Unified Inbox
 * shows full two-way threads (bot, automation, templates — not only admin replies).
 */
export async function persistWaOutboundMessage(opts: PersistOutboundOpts): Promise<number | null> {
  try {
    const phone = normalizePhone(opts.phone);
    const preview = opts.content.slice(0, 120);

    const [conv] = await db
      .insert(waConversationsTable)
      .values({
        contactPhone: phone,
        contactWaId: phone,
        lastMessage: preview,
        lastMessageAt: new Date(),
        unreadCount: 0,
        botMode: "auto",
        status: "open",
      })
      .onConflictDoUpdate({
        target: waConversationsTable.contactPhone,
        set: {
          lastMessage: preview,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning({ id: waConversationsTable.id });

    const conversationId = conv?.id;
    if (!conversationId) return null;

    if (opts.waMessageId) {
      const [existing] = await db
        .select({ id: waMessagesTable.id })
        .from(waMessagesTable)
        .where(eq(waMessagesTable.waMessageId, opts.waMessageId))
        .limit(1);
      if (existing?.id) {
        await db
          .update(waConversationsTable)
          .set({
            lastMessage: preview,
            lastMessageAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(waConversationsTable.id, conversationId));
        broadcastSSE("wa_message", {
          conversationId,
          direction: "out",
          content: opts.content,
          phone,
          isBot: opts.isBot ?? true,
        });
        return existing.id;
      }
    }

    const [msg] = await db
      .values({
        conversationId,
        waMessageId: opts.waMessageId ?? null,
        direction: "out",
        type: opts.type ?? "text",
        content: opts.content,
        status: opts.status ?? "sent",
        isBot: opts.isBot ?? true,
        templateName: opts.templateName ?? null,
      })
      .returning({ id: waMessagesTable.id });

    broadcastSSE("wa_message", {
      conversationId,
      direction: "out",
      content: opts.content,
      phone,
      isBot: opts.isBot ?? true,
    });

    return msg?.id ?? conversationId;
  } catch (err) {
    logger.warn({ err, phone: opts.phone }, "persistWaOutboundMessage failed");
    return null;
  }
}
