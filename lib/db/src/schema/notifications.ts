import { pgTable, text, serial, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationTypeEnum = pgEnum("notification_type", [
  "order_update",
  "promotion",
  "general",
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
]);

export const deviceTypeEnum = pgEnum("device_type", ["android", "ios", "web"]);

export const pushNotificationsTable = pgTable("push_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: notificationTypeEnum("type").notNull().default("general"),
  status: notificationStatusEnum("status").notNull().default("pending"),
  isBroadcast: boolean("is_broadcast").notNull().default(false),
  recipientCount: integer("recipient_count").default(0),
  successCount: integer("success_count").default(0),
  failureCount: integer("failure_count").default(0),
  data: text("data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
});

export const userDevicesTable = pgTable("user_devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceToken: text("device_token").notNull(),
  deviceType: deviceTypeEnum("device_type").notNull().default("android"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPushNotificationSchema = createInsertSchema(pushNotificationsTable).omit({
  id: true, createdAt: true, sentAt: true,
});

export const insertUserDeviceSchema = createInsertSchema(userDevicesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type PushNotification = typeof pushNotificationsTable.$inferSelect;
export type InsertPushNotification = z.infer<typeof insertPushNotificationSchema>;
export type UserDevice = typeof userDevicesTable.$inferSelect;
export type InsertUserDevice = z.infer<typeof insertUserDeviceSchema>;
