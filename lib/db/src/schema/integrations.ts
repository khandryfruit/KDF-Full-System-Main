import { pgTable, text, serial, integer, boolean, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const integrationTypeEnum = pgEnum("integration_type", ["ecommerce", "marketing", "analytics"]);
export const syncStatusEnum = pgEnum("sync_status_type", ["idle", "syncing", "completed", "failed"]);
export const syncJobStatusEnum = pgEnum("sync_job_status", ["pending", "running", "completed", "failed"]);

export const integrationsTable = pgTable("integrations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: integrationTypeEnum("type").notNull(),
  config: jsonb("config").$type<Record<string, any>>().default({}),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shopifyIntegrationsTable = pgTable("shopify_integrations", {
  id: serial("id").primaryKey(),
  storeUrl: text("store_url").notNull(),
  apiKey: text("api_key").notNull(),
  accessToken: text("access_token").notNull(),
  syncStatus: syncStatusEnum("sync_status").default("idle"),
  lastSyncAt: timestamp("last_sync_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const woocommerceIntegrationsTable = pgTable("woocommerce_integrations", {
  id: serial("id").primaryKey(),
  storeUrl: text("store_url").notNull(),
  consumerKey: text("consumer_key").notNull(),
  consumerSecret: text("consumer_secret").notNull(),
  syncStatus: syncStatusEnum("sync_status").default("idle"),
  lastSyncAt: timestamp("last_sync_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const marketingIntegrationsTable = pgTable("marketing_integrations", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  pixelId: text("pixel_id"),
  accessToken: text("access_token"),
  isActive: boolean("is_active").notNull().default(false),
  config: jsonb("config").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const syncJobsTable = pgTable("sync_jobs", {
  id: serial("id").primaryKey(),
  integrationType: text("integration_type").notNull(),
  status: syncJobStatusEnum("status").notNull().default("pending"),
  logs: jsonb("logs").$type<string[]>().default([]),
  totalItems: integer("total_items").default(0),
  successCount: integer("success_count").default(0),
  failedCount: integer("failed_count").default(0),
  meta: jsonb("meta").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertIntegrationSchema = createInsertSchema(integrationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShopifyIntegrationSchema = createInsertSchema(shopifyIntegrationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWooCommerceIntegrationSchema = createInsertSchema(woocommerceIntegrationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMarketingIntegrationSchema = createInsertSchema(marketingIntegrationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSyncJobSchema = createInsertSchema(syncJobsTable).omit({ id: true, createdAt: true });

export type Integration = typeof integrationsTable.$inferSelect;
export type ShopifyIntegration = typeof shopifyIntegrationsTable.$inferSelect;
export type WooCommerceIntegration = typeof woocommerceIntegrationsTable.$inferSelect;
export type MarketingIntegration = typeof marketingIntegrationsTable.$inferSelect;
export type SyncJob = typeof syncJobsTable.$inferSelect;
