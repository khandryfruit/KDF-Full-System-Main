import { Router } from "express";
import { db, syncJobsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

router.get("/sync-jobs", adminMiddleware as any, async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const jobs = await db.select().from(syncJobsTable).orderBy(desc(syncJobsTable.createdAt)).limit(limit);
    res.json(jobs);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

router.get("/sync-jobs/:id", adminMiddleware as any, async (req, res) => {
  try {
    const [job] = await db.select().from(syncJobsTable).where(eq(syncJobsTable.id, parseInt(req.params.id))).limit(1);
    if (!job) { res.status(404).json({ error: "Not found" }); return; }
    res.json(job);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

export default router;
