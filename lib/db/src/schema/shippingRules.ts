import { pgTable, serial, text, integer, boolean, timestamp, numeric, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shippingRuleTypeEnum = pgEnum("shipping_rule_type", [
  "weight",
  "amount",
  "product",
  "category",
  "flat",
]);

export const shippingRulesTable = pgTable("shipping_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: shippingRuleTypeEnum("type").notNull(),
  methodName: text("method_name").notNull().default("Standard Delivery"),
  deliveryTime: text("delivery_time").notNull().default("2–3 business days"),
  minValue: numeric("min_value", { precision: 10, scale: 2 }),
  maxValue: numeric("max_value", { precision: 10, scale: 2 }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  productIds: jsonb("product_ids").$type<number[]>().default([]),
  categoryIds: jsonb("category_ids").$type<number[]>().default([]),
  cities: jsonb("cities").$type<string[]>().default([]),
  priority: integer("priority").notNull().default(10),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertShippingRuleSchema = createInsertSchema(shippingRulesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ShippingRule = typeof shippingRulesTable.$inferSelect;
export type InsertShippingRule = z.infer<typeof insertShippingRuleSchema>;
