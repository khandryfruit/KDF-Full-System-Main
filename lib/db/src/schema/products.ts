import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface ProductVariant {
  id: string;
  name: string;
  value: string;
  hex?: string;
  price?: string;
  stock: number;
  sku?: string;
}

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: numeric("original_price", { precision: 10, scale: 2 }),
  stock: integer("stock").notNull().default(0),
  images: jsonb("images").$type<string[]>().default([]),
  gradient: text("gradient").default("from-gray-100 to-gray-200"),
  tags: jsonb("tags").$type<string[]>().default([]),
  variants: jsonb("variants").$type<ProductVariant[]>().default([]),
  weight: text("weight"),
  unit: text("unit"),
  active: boolean("active").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  rating: numeric("rating", { precision: 3, scale: 2 }).default("0"),
  reviewCount: integer("review_count").notNull().default(0),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  altText: text("alt_text"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
