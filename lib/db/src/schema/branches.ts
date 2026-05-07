import { pgTable, text, serial, integer, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const branchesTable = pgTable("branches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  city: text("city").notNull(),
  address: text("address"),
  phone: text("phone"),
  whatsappNumber: text("whatsapp_number"),
  managerName: text("manager_name"),
  managerPhone: text("manager_phone"),
  email: text("email"),
  isActive: boolean("is_active").notNull().default(true),
  isHeadOffice: boolean("is_head_office").notNull().default(false),
  settings: jsonb("settings").$type<Record<string, any>>().default({}),
  monthlyTarget: numeric("monthly_target", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBranchSchema = createInsertSchema(branchesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Branch = typeof branchesTable.$inferSelect;
export type InsertBranch = z.infer<typeof insertBranchSchema>;
