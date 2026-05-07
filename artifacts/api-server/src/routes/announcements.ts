import { Router } from "express";
import { db, announcementsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

router.get("/announcements", async (req, res) => {
  try {
    const { all } = req.query;
    const rows = await db
      .select()
      .from(announcementsTable)
      .where(all ? undefined : eq(announcementsTable.isActive, true))
      .orderBy(asc(announcementsTable.sortOrder), asc(announcementsTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to load announcements" });
  }
});

router.post("/announcements", adminMiddleware as any, async (req, res) => {
  try {
    const { text, isActive, sortOrder, speed, bgColor, textColor } = req.body;
    if (!text?.trim()) { res.status(400).json({ error: "text is required" }); return; }
    const [row] = await db.insert(announcementsTable).values({
      text: text.trim(),
      isActive: isActive ?? true,
      sortOrder: sortOrder ?? 0,
      speed: speed ?? 40,
      bgColor: bgColor ?? "#c0392b",
      textColor: textColor ?? "white",
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create announcement" });
  }
});

router.put("/announcements/:id", adminMiddleware as any, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(announcementsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(announcementsTable.id, id))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update announcement" });
  }
});

router.patch("/announcements/:id/toggle", adminMiddleware as any, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [current] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, id)).limit(1);
    if (!current) { res.status(404).json({ error: "Not found" }); return; }
    const [row] = await db.update(announcementsTable)
      .set({ isActive: !current.isActive, updatedAt: new Date() })
      .where(eq(announcementsTable.id, id))
      .returning();
    res.json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to toggle" });
  }
});

router.delete("/announcements/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(announcementsTable).where(eq(announcementsTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete" });
  }
});

export default router;
