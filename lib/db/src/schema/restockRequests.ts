import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const restockRequestsTable = pgTable("restock_requests", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  name: text("name"),
  email: text("email").notNull(),
  phone: text("phone"),
  notifiedAt: timestamp("notified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRestockRequestSchema = createInsertSchema(restockRequestsTable).omit({
  id: true,
  createdAt: true,
  notifiedAt: true,
});

export type RestockRequest = typeof restockRequestsTable.$inferSelect;
export type InsertRestockRequest = z.infer<typeof insertRestockRequestSchema>;
