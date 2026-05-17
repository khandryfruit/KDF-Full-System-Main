import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { siteSettingsTable } from "@workspace/db/schema";
import { adminMiddleware } from "../lib/auth";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(siteSettingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const inserted = await db.insert(siteSettingsTable).values({}).returning();
  return inserted[0];
}

function parseKeywordJson(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  return null;
}

/** GET /site-settings — public, used by frontends */
router.get("/site-settings", async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settings);
  } catch {
    res.status(500).json({ error: "Failed to fetch site settings" });
  }
});

/** GET /admin/site-settings */
router.get("/admin/site-settings", adminMiddleware as any, async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settings);
  } catch {
    res.status(500).json({ error: "Failed to fetch site settings" });
  }
});

/** PUT /admin/site-settings */
router.put("/admin/site-settings", adminMiddleware as any, async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  try {
    const existing = await getOrCreateSettings();
    const updated = await db
      .update(siteSettingsTable)
      .set({
        ...(body.siteName !== undefined && { siteName: String(body.siteName) }),
        ...(body.logoPath !== undefined && { logoPath: body.logoPath as string }),
        ...(body.faviconPath !== undefined && { faviconPath: body.faviconPath as string }),
        ...(body.metaTitle !== undefined && { metaTitle: body.metaTitle as string | null }),
        ...(body.metaDescription !== undefined && { metaDescription: body.metaDescription as string | null }),
        ...(body.primaryKeywords !== undefined && {
          primaryKeywords: parseKeywordJson(body.primaryKeywords),
        }),
        ...(body.secondaryKeywords !== undefined && {
          secondaryKeywords: parseKeywordJson(body.secondaryKeywords),
        }),
        ...(body.longTailKeywords !== undefined && {
          longTailKeywords: parseKeywordJson(body.longTailKeywords),
        }),
        ...(body.ogTitle !== undefined && { ogTitle: body.ogTitle as string | null }),
        ...(body.ogDescription !== undefined && { ogDescription: body.ogDescription as string | null }),
        ...(body.twitterCardType !== undefined && { twitterCardType: String(body.twitterCardType) }),
        ...(body.robotsIndex !== undefined && { robotsIndex: Boolean(body.robotsIndex) }),
        ...(body.schemaOrgEnabled !== undefined && { schemaOrgEnabled: Boolean(body.schemaOrgEnabled) }),
        ...(body.schemaBreadcrumbEnabled !== undefined && {
          schemaBreadcrumbEnabled: Boolean(body.schemaBreadcrumbEnabled),
        }),
        ...(body.schemaFaqEnabled !== undefined && { schemaFaqEnabled: Boolean(body.schemaFaqEnabled) }),
        updatedAt: new Date(),
      })
      .where(eq(siteSettingsTable.id, existing.id))
      .returning();
    res.json(updated[0]);
  } catch {
    res.status(500).json({ error: "Failed to update site settings" });
  }
});

export default router;
