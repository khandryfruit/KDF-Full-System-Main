import { Router } from "express";
import { db, videoBannersTable } from "@workspace/db";
import { eq, asc, and, or, isNull, lte, gte, sql } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

/* ── Public: active video banners ── */
router.get("/video-banners", async (req, res) => {
  try {
    const { platform } = req.query;
    const now = new Date();

    const conditions: any[] = [
      eq(videoBannersTable.active, true),
      or(isNull(videoBannersTable.startDate), lte(videoBannersTable.startDate, now)) as any,
      or(isNull(videoBannersTable.endDate), gte(videoBannersTable.endDate, now)) as any,
    ];

    if (platform) {
      conditions.push(
        or(
          eq(videoBannersTable.platform, platform as string),
          eq(videoBannersTable.platform, "both"),
          isNull(videoBannersTable.platform)
        ) as any
      );
    }

    const banners = await db
      .select()
      .from(videoBannersTable)
      .where(and(...conditions))
      .orderBy(asc(videoBannersTable.sortOrder));

    res.json(banners);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch video banners" });
  }
});

/* ── Admin: list all ── */
router.get("/admin/video-banners", adminMiddleware as any, async (req, res) => {
  try {
    const banners = await db
      .select()
      .from(videoBannersTable)
      .orderBy(asc(videoBannersTable.sortOrder));
    res.json(banners);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/* ── Admin: create ── */
router.post("/admin/video-banners", adminMiddleware as any, async (req, res) => {
  try {
    const { title, ...rest } = req.body;
    if (!title) { res.status(400).json({ error: "title is required" }); return; }
    const [banner] = await db.insert(videoBannersTable).values({ title, ...rest }).returning();
    res.status(201).json(banner);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create video banner" });
  }
});

/* ── Admin: update ── */
router.put("/admin/video-banners/:id", adminMiddleware as any, async (req, res) => {
  try {
    const [banner] = await db
      .update(videoBannersTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(videoBannersTable.id, parseInt(req.params.id)))
      .returning();
    if (!banner) { res.status(404).json({ error: "Not found" }); return; }
    res.json(banner);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/* ── Admin: reorder ── */
router.put("/admin/video-banners/:id/order", adminMiddleware as any, async (req, res) => {
  try {
    const { sortOrder } = req.body;
    const [banner] = await db
      .update(videoBannersTable)
      .set({ sortOrder, updatedAt: new Date() })
      .where(eq(videoBannersTable.id, parseInt(req.params.id)))
      .returning();
    res.json(banner);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/* ── Admin: delete ── */
router.delete("/admin/video-banners/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(videoBannersTable).where(eq(videoBannersTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
