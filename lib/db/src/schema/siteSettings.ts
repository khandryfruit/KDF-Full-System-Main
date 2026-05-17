import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const siteSettingsTable = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  siteName: text("site_name").notNull().default("KDF NUTS"),
  logoPath: text("logo_path"),
  faviconPath: text("favicon_path"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  primaryKeywords: text("primary_keywords"),
  secondaryKeywords: text("secondary_keywords"),
  longTailKeywords: text("long_tail_keywords"),
  ogTitle: text("og_title"),
  ogDescription: text("og_description"),
  twitterCardType: text("twitter_card_type").default("summary_large_image"),
  robotsIndex: boolean("robots_index").notNull().default(true),
  schemaOrgEnabled: boolean("schema_org_enabled").notNull().default(true),
  schemaBreadcrumbEnabled: boolean("schema_breadcrumb_enabled").notNull().default(true),
  schemaFaqEnabled: boolean("schema_faq_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SiteSettings = typeof siteSettingsTable.$inferSelect;
export type SiteSettingsInsert = typeof siteSettingsTable.$inferInsert;
