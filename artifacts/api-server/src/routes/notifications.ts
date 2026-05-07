import { Router } from "express";
import { db, pushNotificationsTable, userDevicesTable, usersTable } from "@workspace/db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { authMiddleware, adminMiddleware, type AuthRequest } from "../lib/auth";
import { sendToTokens, sendToTopic } from "../lib/fcm";
import type { Response } from "express";

const router = Router();

/* ──────────────────────────────────────────────────────
   POST /devices/register  — user registers FCM token
────────────────────────────────────────────────────── */
router.post("/devices/register", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const { deviceToken, deviceType = "android" } = req.body;
    if (!deviceToken) { res.status(400).json({ error: "deviceToken required" }); return; }
    const userId = req.user!.id;

    /* Upsert — deactivate old tokens for same user, then insert/update */
    const existing = await db
      .select()
      .from(userDevicesTable)
      .where(and(eq(userDevicesTable.userId, userId), eq(userDevicesTable.deviceToken, deviceToken)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(userDevicesTable)
        .set({ isActive: true, deviceType, updatedAt: new Date() })
        .where(eq(userDevicesTable.id, existing[0].id));
    } else {
      await db.insert(userDevicesTable).values({ userId, deviceToken, deviceType, isActive: true });
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to register device" });
  }
});

/* ──────────────────────────────────────────────────────
   DELETE /devices/:token  — user unregisters token
────────────────────────────────────────────────────── */
router.delete("/devices/:token", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    await db.update(userDevicesTable)
      .set({ isActive: false })
      .where(and(
        eq(userDevicesTable.userId, req.user!.id),
        eq(userDevicesTable.deviceToken, req.params.token as string)
      ));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/* ──────────────────────────────────────────────────────
   GET /notifications/me  — user: own notification history
────────────────────────────────────────────────────── */
router.get("/notifications/me", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const userId = req.user!.id;

    const [items, countRes] = await Promise.all([
      db.select().from(pushNotificationsTable)
        .where(and(
          eq(pushNotificationsTable.status, "sent"),
          sql`(${pushNotificationsTable.userId} = ${userId} OR ${pushNotificationsTable.isBroadcast} = true)`
        ))
        .orderBy(desc(pushNotificationsTable.sentAt))
        .limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(pushNotificationsTable)
        .where(and(
          eq(pushNotificationsTable.status, "sent"),
          sql`(${pushNotificationsTable.userId} = ${userId} OR ${pushNotificationsTable.isBroadcast} = true)`
        )),
    ]);

    res.json({ items, total: Number(countRes[0]?.count ?? 0), page, limit });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/* ──────────────────────────────────────────────────────
   GET /notifications  — admin: full history with filters
────────────────────────────────────────────────────── */
router.get("/notifications", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const { type, status } = req.query;

    const conditions: any[] = [];
    if (type) conditions.push(eq(pushNotificationsTable.type, type as any));
    if (status) conditions.push(eq(pushNotificationsTable.status, status as any));
    const where = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [items, countRes] = await Promise.all([
      db.select().from(pushNotificationsTable)
        .where(where).orderBy(desc(pushNotificationsTable.createdAt))
        .limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(pushNotificationsTable).where(where),
    ]);

    res.json({ items, total: Number(countRes[0]?.count ?? 0), page, limit });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list notifications" });
  }
});

/* ──────────────────────────────────────────────────────
   POST /notifications/send  — admin: send notification
────────────────────────────────────────────────────── */
router.post("/notifications/send", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      message,
      type = "general",
      isBroadcast = false,
      userIds,          /* number[] — send to specific users */
      data: extraData,  /* optional key-value data payload */
    } = req.body as {
      title: string;
      message: string;
      type?: string;
      isBroadcast?: boolean;
      userIds?: number[];
      data?: Record<string, string>;
    };

    if (!title || !message) { res.status(400).json({ error: "title and message required" }); return; }

    /* Determine target user IDs */
    let targetUserIds: number[] = [];
    if (isBroadcast) {
      const allUsers = await db.select({ id: usersTable.id }).from(usersTable);
      targetUserIds = allUsers.map(u => u.id);
    } else if (userIds?.length) {
      targetUserIds = userIds;
    }

    /* Create notification record */
    const [notifRecord] = await db.insert(pushNotificationsTable).values({
      userId: (!isBroadcast && userIds?.length === 1) ? userIds[0] : null,
      title,
      message,
      type: type as any,
      status: "pending",
      isBroadcast,
      data: extraData ? JSON.stringify(extraData) : null,
    }).returning();

    /* Fetch device tokens */
    let fcmResult = { success: 0, failure: 0, errors: [] as string[] };
    let recipientCount = targetUserIds.length;

    if (targetUserIds.length > 0) {
      const devices = await db
        .select({ deviceToken: userDevicesTable.deviceToken })
        .from(userDevicesTable)
        .where(and(
          inArray(userDevicesTable.userId, targetUserIds),
          eq(userDevicesTable.isActive, true)
        ));

      const tokens = devices.map(d => d.deviceToken);
      recipientCount = tokens.length;

      if (tokens.length > 0) {
        fcmResult = await sendToTokens(tokens, {
          title,
          body: message,
          data: { notificationId: String(notifRecord.id), type, ...(extraData ?? {}) },
        });
      }
    } else if (isBroadcast) {
      /* fallback: broadcast via topic */
      const ok = await sendToTopic("all_users", { title, body: message });
      fcmResult.success = ok ? 1 : 0;
      fcmResult.failure = ok ? 0 : 1;
    }

    /* Update record with results */
    const finalStatus = fcmResult.failure === recipientCount && recipientCount > 0 ? "failed" : "sent";
    const [updated] = await db.update(pushNotificationsTable)
      .set({
        status: finalStatus as any,
        sentAt: new Date(),
        recipientCount,
        successCount: fcmResult.success,
        failureCount: fcmResult.failure,
      })
      .where(eq(pushNotificationsTable.id, notifRecord.id))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

/* ──────────────────────────────────────────────────────
   Admin helper: send notification for a specific user
   (called internally by other routes, e.g. orders)
────────────────────────────────────────────────────── */
export async function sendOrderNotification(
  userId: number,
  title: string,
  message: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    const [notifRecord] = await db.insert(pushNotificationsTable).values({
      userId,
      title,
      message,
      type: "order_update",
      status: "pending",
      isBroadcast: false,
    }).returning();

    const devices = await db
      .select({ deviceToken: userDevicesTable.deviceToken })
      .from(userDevicesTable)
      .where(and(eq(userDevicesTable.userId, userId), eq(userDevicesTable.isActive, true)));

    const tokens = devices.map(d => d.deviceToken);
    let success = 0;
    let failure = 0;

    if (tokens.length > 0) {
      const result = await sendToTokens(tokens, { title, body: message, data });
      success = result.success;
      failure = result.failure;
    }

    await db.update(pushNotificationsTable)
      .set({ status: "sent", sentAt: new Date(), recipientCount: tokens.length, successCount: success, failureCount: failure })
      .where(eq(pushNotificationsTable.id, notifRecord.id));
  } catch (err) {
    logger.error({ err }, "Failed to send order notification");
  }
}

import { logger } from "../lib/logger";

export default router;
