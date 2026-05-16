import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface MediaVariantMeta {
  path: string;
  width: number;
  height: number;
  size: number;
  contentType: string;
}

export type MediaVariants = Partial<
  Record<"thumbnail" | "medium" | "large" | "mobile" | "desktop", MediaVariantMeta>
>;

export const mediaFoldersTable = pgTable("media_folders", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mediaAssetsTable = pgTable("media_assets", {
  id: serial("id").primaryKey(),
  folderId: integer("folder_id"),
  filename: text("filename").notNull(),
  originalFilename: text("original_filename").notNull(),
  objectPath: text("object_path").notNull(),
  contentHash: text("content_hash").notNull(),
  mimeType: text("mime_type").notNull().default("image/webp"),
  width: integer("width"),
  height: integer("height"),
  originalSize: integer("original_size").notNull().default(0),
  processedSize: integer("processed_size").notNull().default(0),
  variants: jsonb("variants").$type<MediaVariants>().default({}),
  tags: jsonb("tags").$type<string[]>().default([]),
  altText: text("alt_text"),
  title: text("title"),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const mediaUsageTable = pgTable("media_usage", {
  id: serial("id").primaryKey(),
  mediaId: integer("media_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  fieldName: text("field_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMediaAssetSchema = createInsertSchema(mediaAssetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MediaFolder = typeof mediaFoldersTable.$inferSelect;
export type MediaAsset = typeof mediaAssetsTable.$inferSelect;
export type MediaUsage = typeof mediaUsageTable.$inferSelect;
export type InsertMediaAsset = z.infer<typeof insertMediaAssetSchema>;
