import { Router } from "express";
import { db, bannersTable } from "@workspace/db";
import { eq, asc, or, and, isNull } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

router.get("/banners", async (req, res) => {
  try {
    const { platform } = req.query;
    const activeFilter = eq(bannersTable.active, true);
    const whereClause = platform
      ? and(
          activeFilter,
          or(
            eq(bannersTable.platform, platform as string),
            eq(bannersTable.platform, "both"),
            isNull(bannersTable.platform)
          )
        )
      : activeFilter;
    const banners = await db
      .select()
      .from(bannersTable)
      .where(whereClause)
      .orderBy(asc(bannersTable.sortOrder));
    res.json(banners);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/banners", adminMiddleware as any, async (req, res) => {
  try {
    const { title, ...rest } = req.body;
    if (!title) { res.status(400).json({ error: "title is required" }); return; }
    const [banner] = await db.insert(bannersTable).values({ title, ...rest }).returning();
    res.status(201).json(banner);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create banner" });
  }
});

router.put("/banners/:id", adminMiddleware as any, async (req, res) => {
  try {
    const [banner] = await db.update(bannersTable).set(req.body).where(eq(bannersTable.id, parseInt(req.params.id))).returning();
    if (!banner) { res.status(404).json({ error: "Not found" }); return; }
    res.json(banner);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.delete("/banners/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(bannersTable).where(eq(bannersTable.id, parseInt(req.params.id)));
    res.json({ success: true, message: "Banner deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
