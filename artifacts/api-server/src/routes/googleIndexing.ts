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
  repairIndexingLogUrls,
  retryFailedIndexingLogs,
  buildIndexingPathUrl,
  normalizeIndexingUrl,
  normalizeSiteUrl,
} from "../lib/googleIndexing";

const router: IRouter = Router();

router.get("/admin/seo/indexing/settings", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const safe = await getSafeSettings();
    res.json({ ...safe, queueLength: getQueueLength() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch indexing settings" });
  }
});

router.put("/admin/seo/indexing/settings", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { serviceAccountJson, siteUrl, autoIndexEnabled } = req.body as {
      serviceAccountJson?: string;
      siteUrl?: string;
      autoIndexEnabled?: boolean;
    };

    const rows = await db.select().from(googleIndexingSettingsTable).limit(1);
    const existing = rows[0] ?? (await db.insert(googleIndexingSettingsTable).values({}).returning())[0];

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

    const normalizedSite = siteUrl !== undefined ? normalizeSiteUrl(siteUrl) : undefined;

    await db
      .update(googleIndexingSettingsTable)
      .set({
        ...(serviceAccountJson !== undefined && { serviceAccountJson }),
        ...(normalizedSite !== undefined && { siteUrl: normalizedSite }),
        ...(autoIndexEnabled !== undefined && { autoIndexEnabled }),
        updatedAt: new Date(),
      })
      .where(eq(googleIndexingSettingsTable.id, existing.id));

    const safe = await getSafeSettings();
    res.json(safe);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update indexing settings" });
  }
});

router.delete("/admin/seo/indexing/credentials", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(googleIndexingSettingsTable).limit(1);
    if (rows[0]) {
      await db
        .update(googleIndexingSettingsTable)
        .set({ serviceAccountJson: null, updatedAt: new Date() })
        .where(eq(googleIndexingSettingsTable.id, rows[0].id));
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to remove credentials" });
  }
});

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

router.get("/admin/seo/indexing/logs", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string || "100")));
    const offset = Math.max(0, parseInt(req.query.offset as string || "0"));
    const status = (req.query.status as string) || "all";
    const logs = await getIndexingLogs(limit, offset, status === "all" ? undefined : status);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(indexingLogsTable);
    res.json({ logs, total: count, limit, offset });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

router.delete("/admin/seo/indexing/logs", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    await db.delete(indexingLogsTable);
    res.json({ ok: true, message: "All indexing logs cleared" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to clear logs" });
  }
});

router.post("/admin/seo/indexing/repair-urls", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { requeueFailed = true } = (req.body ?? {}) as { requeueFailed?: boolean };
    const result = await repairIndexingLogUrls({ requeueFailed });
    res.json({
      ok: true,
      message: `Fixed ${result.fixed} URLs, requeued ${result.requeued}, ${result.errors} could not be normalized`,
      ...result,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to repair URLs" });
  }
});

router.post("/admin/seo/indexing/retry-failed", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { logIds } = (req.body ?? {}) as { logIds?: number[] };
    const result = await retryFailedIndexingLogs(logIds);
    res.json({
      ok: true,
      requeued: result.requeued,
      message: `${result.requeued} failed URL(s) re-queued with corrected https:// format`,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to retry URLs" });
  }
});

router.post("/admin/seo/indexing/retry/:id", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid log id" });
      return;
    }
    const result = await retryFailedIndexingLogs([id]);
    res.json({ ok: true, requeued: result.requeued });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to retry URL" });
  }
});

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
    const totalN = total[0]?.count ?? 0;
    const successN = success[0]?.count ?? 0;
    const failedN = failed[0]?.count ?? 0;

    res.json({
      total: totalN,
      success: successN,
      failed: failedN,
      pending: pending[0]?.count ?? 0,
      rateLimited: rateL[0]?.count ?? 0,
      successRate: totalN > 0 ? Math.round((successN / totalN) * 100) : 0,
      failedRate: totalN > 0 ? Math.round((failedN / totalN) * 100) : 0,
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

router.post("/admin/seo/indexing/submit", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { url, contentType = "page", action = "URL_UPDATED" } = req.body as {
      url?: string;
      contentType?: string;
      action?: string;
    };

    if (!url?.trim()) {
      res.status(400).json({ error: "URL is required" });
      return;
    }

    const rows = await db.select().from(googleIndexingSettingsTable).limit(1);
    const canonical = normalizeIndexingUrl(url, rows[0]?.siteUrl);
    if (!canonical.url) {
      res.status(400).json({ error: canonical.error ?? "Invalid URL — use full https:// format" });
      return;
    }

    const { logId, url: finalUrl, error } = await manualIndex(canonical.url, contentType as any, action as any);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    res.json({
      ok: true,
      logId,
      url: finalUrl,
      normalized: canonical.wasFixed,
      message: "URL queued for indexing",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to submit URL" });
  }
});

router.post("/admin/seo/indexing/bulk", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { type } = req.body as { type: "products" | "categories" | "blogs" | "all" };

    const rows = await db.select().from(googleIndexingSettingsTable).limit(1);
    const siteUrl = normalizeSiteUrl(rows[0]?.siteUrl);
    if (!siteUrl) {
      res.status(400).json({ error: "Site URL not configured — use https://khanbabadryfruits.com in Settings" });
      return;
    }

    let queued = 0;
    let skipped = 0;

    const queuePath = async (pathType: "products" | "categories" | "blog", slug: string) => {
      const seg = pathType === "blog" ? "blog" : pathType;
      const full = buildIndexingPathUrl(siteUrl, seg, slug);
      if (!full) {
        skipped++;
        return;
      }
      const r = await manualIndex(full, pathType === "blog" ? "blog" : pathType === "products" ? "product" : "category");
      if (!r.error) queued++;
      else skipped++;
    };

    if (type === "products" || type === "all") {
      const products = await db
        .select({ slug: productsTable.slug })
        .from(productsTable)
        .where(eq(productsTable.active, true))
        .limit(200);
      for (const p of products) {
        if (p.slug) await queuePath("products", p.slug);
      }
    }

    if (type === "categories" || type === "all") {
      const cats = await db
        .select({ slug: categoriesTable.slug })
        .from(categoriesTable)
        .where(eq(categoriesTable.active, true))
        .limit(100);
      for (const c of cats) {
        if (c.slug) await queuePath("categories", c.slug);
      }
    }

    if (type === "blogs" || type === "all") {
      const posts = await db
        .select({ slug: blogPostsTable.slug })
        .from(blogPostsTable)
        .where(eq(blogPostsTable.status, "published"))
        .limit(200);
      for (const b of posts) {
        if (b.slug) await queuePath("blog", b.slug);
      }
    }

    res.json({
      ok: true,
      queued,
      skipped,
      siteUrl,
      message: `${queued} URLs queued (${skipped} skipped) — all URLs use https://`,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to bulk submit" });
  }
});

export default router;
