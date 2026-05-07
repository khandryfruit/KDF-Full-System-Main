import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { seoSettingsTable } from "@workspace/db/schema";
import { adminMiddleware } from "../lib/auth";

const router: IRouter = Router();

async function getOrCreateSeoSettings() {
  const rows = await db.select().from(seoSettingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const inserted = await db.insert(seoSettingsTable).values({}).returning();
  return inserted[0];
}

/** GET /seo-settings — public */
router.get("/seo-settings", async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSeoSettings();
    res.json(settings);
  } catch {
    res.status(500).json({ error: "Failed to fetch SEO settings" });
  }
});

/** PUT /seo-settings — admin */
router.put(
  "/seo-settings",
  adminMiddleware as any,
  async (req: Request, res: Response) => {
    try {
      const existing = await getOrCreateSeoSettings();
      const {
        googleVerificationCode,
        robotsTxtContent,
        siteNoindex,
        sitemapEnabled,
        canonicalDomain,
      } = req.body as {
        googleVerificationCode?: string;
        robotsTxtContent?: string;
        siteNoindex?: boolean;
        sitemapEnabled?: boolean;
        canonicalDomain?: string;
      };

      const updated = await db
        .update(seoSettingsTable)
        .set({
          ...(googleVerificationCode !== undefined && { googleVerificationCode }),
          ...(robotsTxtContent !== undefined && { robotsTxtContent }),
          ...(siteNoindex !== undefined && { siteNoindex }),
          ...(sitemapEnabled !== undefined && { sitemapEnabled }),
          ...(canonicalDomain !== undefined && { canonicalDomain }),
          updatedAt: new Date(),
        })
        .where(
          eq(seoSettingsTable.id, existing.id)
        )
        .returning();
      res.json(updated[0]);
    } catch {
      res.status(500).json({ error: "Failed to update SEO settings" });
    }
  }
);

export default router;
