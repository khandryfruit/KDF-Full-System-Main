import { Router } from "express";
import { db, mobileReelsTable } from "@workspace/db";
import { eq, asc, and, or, isNull, lte, gte, sql } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

/* ── Public: active reels ── */
router.get("/mobile-reels", async (req, res) => {
  try {
    const now = new Date();
    const { category } = req.query;

    const conditions: any[] = [
      eq(mobileReelsTable.active, true),
      or(isNull(mobileReelsTable.startDate), lte(mobileReelsTable.startDate, now)) as any,
      or(isNull(mobileReelsTable.endDate), gte(mobileReelsTable.endDate, now)) as any,
    ];

    if (category) conditions.push(eq(mobileReelsTable.category, category as string));

    const reels = await db
      .select()
      .from(mobileReelsTable)
      .where(and(...conditions))
      .orderBy(asc(mobileReelsTable.sortOrder));

    res.json(reels);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch reels" });
  }
});

/* ── Public: increment view count ── */
router.post("/mobile-reels/:id/view", async (req, res) => {
  try {
    await db
      .update(mobileReelsTable)
      .set({ viewCount: sql`${mobileReelsTable.viewCount} + 1` })
      .where(eq(mobileReelsTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/* ── Admin: list all ── */
router.get("/admin/mobile-reels", adminMiddleware as any, async (req, res) => {
  try {
    const reels = await db
      .select()
      .from(mobileReelsTable)
      .orderBy(asc(mobileReelsTable.sortOrder));
    res.json(reels);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/* ── Admin: create ── */
router.post("/admin/mobile-reels", adminMiddleware as any, async (req, res) => {
  try {
    const { title, ...rest } = req.body;
    if (!title) { res.status(400).json({ error: "title is required" }); return; }
    const [reel] = await db.insert(mobileReelsTable).values({ title, ...rest }).returning();
    res.status(201).json(reel);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create reel" });
  }
});

/* ── Admin: update ── */
router.put("/admin/mobile-reels/:id", adminMiddleware as any, async (req, res) => {
  try {
    const [reel] = await db
      .update(mobileReelsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(mobileReelsTable.id, parseInt(req.params.id)))
      .returning();
    if (!reel) { res.status(404).json({ error: "Not found" }); return; }
    res.json(reel);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/* ── Admin: delete ── */
router.delete("/admin/mobile-reels/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(mobileReelsTable).where(eq(mobileReelsTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
