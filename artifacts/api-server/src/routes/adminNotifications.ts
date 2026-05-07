import { Router } from "express";
import { db, adminNotificationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import { addSSEClient, removeSSEClient } from "../lib/sse";
import { verifyToken } from "../lib/auth";
import type { Response } from "express";

const router = Router();

/* ─── SSE Stream (token via query param for EventSource) ─ */
router.get("/admin/sse", (req, res: Response) => {
  /* EventSource cannot send Authorization headers — accept token via ?token= */
  const token = (req.query.token as string) || (req.headers.authorization?.replace("Bearer ", "") ?? "");
  try {
    const user = verifyToken(token);
    if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  } catch {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write("event: connected\ndata: {\"ok\":true}\n\n");

  addSSEClient(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSSEClient(res);
  });
});

/* ─── List Notifications ──────────────────────────────── */
router.get("/admin/notifications", adminMiddleware as any, async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit as string) || 30);
    const rows = await db
      .select()
      .from(adminNotificationsTable)
      .orderBy(desc(adminNotificationsTable.createdAt))
      .limit(limit);
    const unreadCount = rows.filter(r => !r.isRead).length;
    return res.json({ notifications: rows, unreadCount });
  } catch (e: any) {
    req.log?.error(e);
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Mark Single as Read ─────────────────────────────── */
router.patch("/admin/notifications/:id/read", adminMiddleware as any, async (req, res) => {
  try {
    await db
      .update(adminNotificationsTable)
      .set({ isRead: true })
      .where(eq(adminNotificationsTable.id, parseInt(req.params.id)));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Mark All as Read ────────────────────────────────── */
router.patch("/admin/notifications/read-all", adminMiddleware as any, async (req, res) => {
  try {
    await db
      .update(adminNotificationsTable)
      .set({ isRead: true })
      .where(eq(adminNotificationsTable.isRead, false));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Delete Notification ─────────────────────────────── */
router.delete("/admin/notifications/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db
      .delete(adminNotificationsTable)
      .where(eq(adminNotificationsTable.id, parseInt(req.params.id)));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Clear All ───────────────────────────────────────── */
router.delete("/admin/notifications", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(adminNotificationsTable);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

export default router;
