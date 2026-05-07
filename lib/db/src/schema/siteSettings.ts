import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const siteSettingsTable = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  siteName: text("site_name").notNull().default("KDF NUTS"),
  logoPath: text("logo_path"),
  faviconPath: text("favicon_path"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SiteSettings = typeof siteSettingsTable.$inferSelect;
export type SiteSettingsInsert = typeof siteSettingsTable.$inferInsert;
