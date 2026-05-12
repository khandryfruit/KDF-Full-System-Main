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
        // New fields
        gtmId,
        ga4Id,
        orgName,
        orgPhone,
        orgAddress,
        orgEmail,
        orgLogo,
        localBusinessJson,
        breadcrumbEnabled,
        faqSchemaEnabled,
        reviewSchemaEnabled,
      } = req.body as Record<string, any>;

      // Build raw SET clause for new columns (not in Drizzle schema yet)
      const { sql } = await import("drizzle-orm");

      await db.execute(sql`
        UPDATE seo_settings SET
          google_verification_code = COALESCE(${googleVerificationCode ?? null}, google_verification_code),
          robots_txt_content       = COALESCE(${robotsTxtContent ?? null}, robots_txt_content),
          site_noindex             = COALESCE(${siteNoindex ?? null}, site_noindex),
          sitemap_enabled          = COALESCE(${sitemapEnabled ?? null}, sitemap_enabled),
          canonical_domain         = COALESCE(${canonicalDomain ?? null}, canonical_domain),
          gtm_id                   = COALESCE(${gtmId ?? null}, gtm_id),
          ga4_id                   = COALESCE(${ga4Id ?? null}, ga4_id),
          org_name                 = COALESCE(${orgName ?? null}, org_name),
          org_phone                = COALESCE(${orgPhone ?? null}, org_phone),
          org_address              = COALESCE(${orgAddress ?? null}, org_address),
          org_email                = COALESCE(${orgEmail ?? null}, org_email),
          org_logo                 = COALESCE(${orgLogo ?? null}, org_logo),
          local_business_json      = COALESCE(${localBusinessJson ? JSON.stringify(localBusinessJson) : null}::jsonb, local_business_json),
          breadcrumb_enabled       = COALESCE(${breadcrumbEnabled ?? null}, breadcrumb_enabled),
          faq_schema_enabled       = COALESCE(${faqSchemaEnabled ?? null}, faq_schema_enabled),
          review_schema_enabled    = COALESCE(${reviewSchemaEnabled ?? null}, review_schema_enabled),
          updated_at               = NOW()
        WHERE id = ${existing!.id}
      `);

      const { sql: sql2 } = await import("drizzle-orm");
      const rows = await db.execute(sql2`SELECT * FROM seo_settings WHERE id = ${existing!.id}`);
      res.json((rows as any).rows?.[0] ?? {});
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update SEO settings" });
    }
  }
);

export default router;
