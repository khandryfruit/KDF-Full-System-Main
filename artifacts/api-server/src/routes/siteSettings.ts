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
  const { siteName, logoPath, faviconPath } = req.body as {
    siteName?: string;
    logoPath?: string;
    faviconPath?: string;
  };

  try {
    const existing = await getOrCreateSettings();
    const updated = await db
      .update(siteSettingsTable)
      .set({
        ...(siteName !== undefined && { siteName }),
        ...(logoPath !== undefined && { logoPath }),
        ...(faviconPath !== undefined && { faviconPath }),
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
