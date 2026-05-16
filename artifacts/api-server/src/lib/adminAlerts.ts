import { db, adminNotificationsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { broadcastSSE } from "./sse.js";
import { logger } from "./logger.js";

export interface AdminAlertInput {
  title: string;
  message: string;
  type?: string;
  dedupeMinutes?: number;
}

export async function createAdminAlert(input: AdminAlertInput): Promise<void> {
  const type = input.type ?? "wa_health";
  const dedupeMinutes = input.dedupeMinutes ?? 30;

  try {
    const duplicate = await db.execute(sql`
      SELECT id FROM admin_notifications
      WHERE type = ${type}
        AND title = ${input.title}
        AND created_at >= NOW() - (${dedupeMinutes} || ' minutes')::interval
      LIMIT 1
    `);
    if ((duplicate.rows as unknown[]).length > 0) return;

    const [notification] = await db.insert(adminNotificationsTable).values({
      title: input.title,
      message: input.message,
      type,
    }).returning();

    broadcastSSE("admin_notification", notification);
    broadcastSSE("wa_health_alert", notification);
  } catch (err) {
    logger.warn({ err, title: input.title }, "Failed to create admin alert");
  }
}
