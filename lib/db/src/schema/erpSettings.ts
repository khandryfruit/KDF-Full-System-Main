import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const erpSettingsTable = pgTable("erp_settings", {
  id:        serial("id").primaryKey(),
  section:   text("section").notNull().unique(),
  settings:  jsonb("settings").$type<Record<string, any>>().notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: integer("updated_by"),
});

export const insertErpSettingsSchema = createInsertSchema(erpSettingsTable).omit({ id: true, updatedAt: true });

export type ErpSettings = typeof erpSettingsTable.$inferSelect;
export type InsertErpSettings = z.infer<typeof insertErpSettingsSchema>;

export const ERP_SECTIONS = [
  "company", "invoice", "branch", "pos", "stock", "staff", "backup", "mobile",
] as const;

export type ErpSection = typeof ERP_SECTIONS[number];
