import { pgTable, text, serial, integer, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const branchProductsTable = pgTable("branch_products", {
  id:                 serial("id").primaryKey(),
  branchId:           integer("branch_id"),
  itemCode:           text("item_code").notNull(),
  name:               text("name").notNull(),
  unit:               text("unit").notNull().default("KG"),
  category:           text("category"),
  purchasePrice:      numeric("purchase_price",       { precision: 12, scale: 2 }),
  salePrice:          numeric("sale_price",           { precision: 12, scale: 2 }),
  stockQty:           numeric("stock_qty",            { precision: 12, scale: 3 }).notNull().default("0"),
  lowStockThreshold:  numeric("low_stock_threshold",  { precision: 12, scale: 3 }).default("1"),
  isActive:           boolean("is_active").notNull().default(true),
  barcode:            text("barcode"),
  description:        text("description"),
  imageUrl:           text("image_url"),
  tags:               jsonb("tags").$type<string[]>().default([]),
  createdAt:          timestamp("created_at").notNull().defaultNow(),
  updatedAt:          timestamp("updated_at").notNull().defaultNow(),
});

export const insertBranchProductSchema = createInsertSchema(branchProductsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type BranchProduct = typeof branchProductsTable.$inferSelect;
export type InsertBranchProduct = z.infer<typeof insertBranchProductSchema>;

export const stockMovementsTable = pgTable("stock_movements", {
  id:            serial("id").primaryKey(),
  productId:     integer("product_id").notNull(),
  branchId:      integer("branch_id"),
  type:          text("type").notNull(),
  qty:           numeric("qty",            { precision: 12, scale: 3 }).notNull(),
  balanceBefore: numeric("balance_before", { precision: 12, scale: 3 }),
  balanceAfter:  numeric("balance_after",  { precision: 12, scale: 3 }),
  reference:     text("reference"),
  referenceType: text("reference_type"),
  notes:         text("notes"),
  createdBy:     integer("created_by"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

export const insertStockMovementSchema = createInsertSchema(stockMovementsTable).omit({
  id: true, createdAt: true,
});

export type StockMovement = typeof stockMovementsTable.$inferSelect;
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
