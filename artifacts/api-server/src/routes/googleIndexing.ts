import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  googleIndexingSettingsTable,
  indexingLogsTable,
  productsTable,
  categoriesTable,
  blogPostsTable,
} from "@workspace/db/schema";
import { adminMiddleware } from "../lib/auth";
import {
  manualIndex,
  getSafeSettings,
  getIndexingLogs,
  getQueueLength,
  testGoogleConnection,
} from "../lib/googleIndexing";

const router: IRouter = Router();

/* ─── Settings ───────────────────────────────────────── */

/** GET /admin/seo/indexing/settings */
router.get("/admin/seo/indexing/settings", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const safe = await getSafeSettings();
    res.json({ ...safe, queueLength: getQueueLength() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch indexing settings" });
  }
});

/** PUT /admin/seo/indexing/settings */
router.put("/admin/seo/indexing/settings", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { serviceAccountJson, siteUrl, autoIndexEnabled } = req.body as {
      serviceAccountJson?: string;
      siteUrl?: string;
      autoIndexEnabled?: boolean;
    };

    const rows = await db.select().from(googleIndexingSettingsTable).limit(1);
    const existing = rows[0] ?? (await db.insert(googleIndexingSettingsTable).values({}).returning())[0];

    // Validate service account JSON if provided
    if (serviceAccountJson) {
      try {
        const sa = JSON.parse(serviceAccountJson) as { private_key?: string; client_email?: string };
        if (!sa.private_key || !sa.client_email) {
          res.status(400).json({ error: "Invalid service account: missing private_key or client_email" });
          return;
        }
      } catch {
        res.status(400).json({ error: "Invalid JSON in service account" });
        return;
      }
    }

    const [updated] = await db.update(googleIndexingSettingsTable)
      .set({
        ...(serviceAccountJson !== undefined && { serviceAccountJson }),
        ...(siteUrl !== undefined && { siteUrl }),
        ...(autoIndexEnabled !== undefined && { autoIndexEnabled }),
        updatedAt: new Date(),
      })
      .where(eq(googleIndexingSettingsTable.id, existing.id))
      .returning();

    const safe = await getSafeSettings();
    res.json(safe);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update indexing settings" });
  }
});

/** DELETE /admin/seo/indexing/credentials — remove service account */
router.delete("/admin/seo/indexing/credentials", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(googleIndexingSettingsTable).limit(1);
    if (rows[0]) {
      await db.update(googleIndexingSettingsTable)
        .set({ serviceAccountJson: null, updatedAt: new Date() })
        .where(eq(googleIndexingSettingsTable.id, rows[0].id));
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to remove credentials" });
  }
});

/** POST /admin/seo/indexing/test-connection */
router.post("/admin/seo/indexing/test-connection", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { serviceAccountJson } = req.body as { serviceAccountJson?: string };
    const result = await testGoogleConnection(serviceAccountJson || undefined);
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ ok: false, error: "Test failed unexpectedly" });
  }
});

/* ─── Logs ───────────────────────────────────────────── */

/** GET /admin/seo/indexing/logs?limit=&offset= */
router.get("/admin/seo/indexing/logs", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string || "100")));
    const offset = Math.max(0, parseInt(req.query.offset as string || "0"));
    const logs = await getIndexingLogs(limit, offset);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(indexingLogsTable);
    res.json({ logs, total: count, limit, offset });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

/** DELETE /admin/seo/indexing/logs — clear all logs */
router.delete("/admin/seo/indexing/logs", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    await db.delete(indexingLogsTable);
    res.json({ ok: true, message: "All indexing logs cleared" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to clear logs" });
  }
});

/* ─── Stats ──────────────────────────────────────────── */

/** GET /admin/seo/indexing/stats */
router.get("/admin/seo/indexing/stats", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const [total, success, failed, pending, rateL] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(indexingLogsTable),
      db.select({ count: sql<number>`count(*)::int` }).from(indexingLogsTable).where(eq(indexingLogsTable.status, "success")),
      db.select({ count: sql<number>`count(*)::int` }).from(indexingLogsTable).where(eq(indexingLogsTable.status, "failed")),
      db.select({ count: sql<number>`count(*)::int` }).from(indexingLogsTable).where(eq(indexingLogsTable.status, "pending")),
      db.select({ count: sql<number>`count(*)::int` }).from(indexingLogsTable).where(eq(indexingLogsTable.status, "rate_limited")),
    ]);

    const safe = await getSafeSettings();

    res.json({
      total: total[0]?.count ?? 0,
      success: success[0]?.count ?? 0,
      failed: failed[0]?.count ?? 0,
      pending: pending[0]?.count ?? 0,
      rateLimited: rateL[0]?.count ?? 0,
      dailyQuotaUsed: safe.dailyQuotaUsed,
      dailyQuotaLimit: 180,
      quotaResetDate: safe.quotaResetDate,
      queueLength: getQueueLength(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

/* ─── Manual submit ──────────────────────────────────── */

/** POST /admin/seo/indexing/submit — submit single URL */
router.post("/admin/seo/indexing/submit", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { url, contentType = "page", action = "URL_UPDATED" } = req.body as {
      url?: string;
      contentType?: string;
      action?: string;
    };

    if (!url || !url.startsWith("http")) {
      res.status(400).json({ error: "Valid URL is required (must start with http)" });
      return;
    }

    const { logId } = await manualIndex(url, contentType as any, action as any);
    res.json({ ok: true, logId, message: "URL queued for indexing" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to submit URL" });
  }
});

/* ─── Bulk submit ────────────────────────────────────── */

/** POST /admin/seo/indexing/bulk — bulk submit by type */
router.post("/admin/seo/indexing/bulk", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { type } = req.body as { type: "products" | "categories" | "blogs" | "all" };

    const rows = await db.select().from(googleIndexingSettingsTable).limit(1);
    const settings = rows[0];
    if (!settings?.siteUrl) {
      res.status(400).json({ error: "Site URL not configured in indexing settings" });
      return;
    }

    const siteUrl = settings.siteUrl.replace(/\/$/, "");
    let queued = 0;

    if (type === "products" || type === "all") {
      const products = await db.select({ slug: productsTable.slug }).from(productsTable)
        .where(eq(productsTable.active, true)).limit(200);
      for (const p of products) {
        if (p.slug) {
          await manualIndex(`${siteUrl}/products/${p.slug}`, "product");
          queued++;
        }
      }
    }

    if (type === "categories" || type === "all") {
      const cats = await db.select({ slug: categoriesTable.slug }).from(categoriesTable)
        .where(eq(categoriesTable.active, true)).limit(100);
      for (const c of cats) {
        if (c.slug) {
          await manualIndex(`${siteUrl}/categories/${c.slug}`, "category");
          queued++;
        }
      }
    }

    if (type === "blogs" || type === "all") {
      const posts = await db.select({ slug: blogPostsTable.slug }).from(blogPostsTable)
        .where(eq(blogPostsTable.status, "published")).limit(200);
      for (const b of posts) {
        if (b.slug) {
          await manualIndex(`${siteUrl}/blog/${b.slug}`, "blog");
          queued++;
        }
      }
    }

    res.json({ ok: true, queued, message: `${queued} URLs queued for indexing` });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to bulk submit" });
  }
});

export default router;
