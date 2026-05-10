import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const googleIndexingSettingsTable = pgTable("google_indexing_settings", {
  id:                  serial("id").primaryKey(),
  serviceAccountJson:  text("service_account_json"),
  siteUrl:             text("site_url"),
  autoIndexEnabled:    boolean("auto_index_enabled").notNull().default(false),
  dailyQuotaUsed:      integer("daily_quota_used").notNull().default(0),
  quotaResetDate:      text("quota_reset_date"),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
});

export const indexingLogsTable = pgTable("indexing_logs", {
  id:              serial("id").primaryKey(),
  url:             text("url").notNull(),
  contentType:     text("content_type").notNull(),
  action:          text("action").notNull().default("URL_UPDATED"),
  status:          text("status").notNull().default("pending"),
  googleResponse:  text("google_response"),
  errorMessage:    text("error_message"),
  triggeredBy:     text("triggered_by").notNull().default("auto"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
});

export type GoogleIndexingSettings = typeof googleIndexingSettingsTable.$inferSelect;
export type IndexingLog = typeof indexingLogsTable.$inferSelect;
