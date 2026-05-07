import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const failedOrdersTable = pgTable("failed_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  orderData: jsonb("order_data").$type<Record<string, any>>(),
  reason: text("reason").notNull().default("unknown"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
