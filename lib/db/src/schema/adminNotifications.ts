import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const adminNotificationsTable = pgTable("admin_notifications", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("order"),
  isRead: boolean("is_read").notNull().default(false),
  orderId: integer("order_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AdminNotification = typeof adminNotificationsTable.$inferSelect;
