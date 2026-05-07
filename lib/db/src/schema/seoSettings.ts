import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const seoSettingsTable = pgTable("seo_settings", {
  id: serial("id").primaryKey(),
  googleVerificationCode: text("google_verification_code"),
  robotsTxtContent: text("robots_txt_content").default(
    "User-agent: *\nAllow: /\n\nSitemap: /sitemap.xml"
  ),
  siteNoindex: boolean("site_noindex").notNull().default(false),
  sitemapEnabled: boolean("sitemap_enabled").notNull().default(true),
  canonicalDomain: text("canonical_domain"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSeoSettingsSchema = createInsertSchema(seoSettingsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertSeoSettings = z.infer<typeof insertSeoSettingsSchema>;
export type SeoSettings = typeof seoSettingsTable.$inferSelect;
