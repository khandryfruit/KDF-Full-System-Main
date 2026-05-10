import { pgTable, serial, text, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const googleMerchantSettingsTable = pgTable("google_merchant_settings", {
  id:                serial("id").primaryKey(),
  merchantId:        text("merchant_id").notNull().default(""),
  storeName:         text("store_name").notNull().default("KDF NUTS"),
  storeUrl:          text("store_url").notNull().default(""),
  currency:          text("currency").notNull().default("PKR"),
  country:           text("country").notNull().default("PK"),
  language:          text("language").notNull().default("en"),
  brand:             text("brand").notNull().default("KDF NUTS"),
  productCategory:   text("product_category").notNull().default("Food, Beverages & Tobacco > Food Items > Nuts & Seeds"),
  autoSyncEnabled:   boolean("auto_sync_enabled").notNull().default(false),
  feedEnabled:       boolean("feed_enabled").notNull().default(true),
  lastSyncAt:        timestamp("last_sync_at"),
  lastSyncCount:     integer("last_sync_count").notNull().default(0),
  lastSyncError:     text("last_sync_error"),
  gaTrackingId:      text("ga_tracking_id").notNull().default(""),
  gtmContainerId:    text("gtm_container_id").notNull().default(""),
  searchConsoleUrl:  text("search_console_url").notNull().default(""),
  feedSettings:      jsonb("feed_settings").notNull().default({
    includeOutOfStock: false,
    includeVariants: true,
    minPrice: 0,
    maxProducts: 1000,
    customLabel: "",
  }),
  updatedAt:         timestamp("updated_at").notNull().defaultNow(),
});

export const merchantSyncLogsTable = pgTable("merchant_sync_logs", {
  id:           serial("id").primaryKey(),
  action:       text("action").notNull(),
  productCount: integer("product_count").notNull().default(0),
  status:       text("status").notNull().default("success"),
  details:      jsonb("details"),
  error:        text("error"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});

export type GoogleMerchantSettings = typeof googleMerchantSettingsTable.$inferSelect;
export type MerchantSyncLog = typeof merchantSyncLogsTable.$inferSelect;
