import { pgTable, text, serial, integer, boolean, timestamp, jsonb, pgEnum, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shipmentStatusEnum = pgEnum("shipment_status", [
  "pending",
  "processing",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "returned",
]);

export const paymentGatewayTypeEnum = pgEnum("payment_gateway_type", [
  "cod",
  "jazzcash",
  "easypaisa",
  "stripe",
  "bank_transfer",
  "wallet",
  "card",
]);

export const couriersTable = pgTable("couriers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  apiEndpoint: text("api_endpoint"),
  isActive: boolean("is_active").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  settings: jsonb("settings").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shipmentsTable = pgTable("shipments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  courierId: integer("courier_id"),
  courierSlug: text("courier_slug"),
  trackingId: text("tracking_id"),
  status: shipmentStatusEnum("status").notNull().default("pending"),
  statusHistory: jsonb("status_history").$type<{ status: string; timestamp: string; note?: string }[]>().default([]),
  weight: numeric("weight", { precision: 8, scale: 2 }),
  dimensions: text("dimensions"),
  lastTrackedAt: timestamp("last_tracked_at"),
  rawResponse: jsonb("raw_response").$type<Record<string, any>>().default({}),
  shopifyOrderId: text("shopify_order_id"),
  shopifyOrderNumber: text("shopify_order_number"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerAddress: text("customer_address"),
  customerCity: text("customer_city"),
  codAmount: numeric("cod_amount", { precision: 10, scale: 2 }).default("0"),
  pieces: integer("pieces").default(1),
  contentDesc: text("content_desc").default("KDF Nuts Products"),
  serviceCode: text("service_code").default("O"),
  specialInstructions: text("special_instructions"),
  isCod: boolean("is_cod").default(false),
  codStatus: text("cod_status").default("pending"),
  isCancelled: boolean("is_cancelled").default(false),
  notifyWhatsapp: boolean("notify_whatsapp").default(true),
  bookingSource: text("booking_source").default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const paymentGatewaysTable = pgTable("payment_gateways", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: paymentGatewayTypeEnum("type").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  apiKey: text("api_key"),
  secretKey: text("secret_key"),
  webhookSecret: text("webhook_secret"),
  isActive: boolean("is_active").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  config: jsonb("config").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const manualPaymentsTable = pgTable("manual_payments", {
  id: serial("id").primaryKey(),
  bankName: text("bank_name").notNull(),
  accountTitle: text("account_title").notNull(),
  accountNumber: text("account_number").notNull(),
  iban: text("iban"),
  instructions: text("instructions"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sameDayDeliverySettingsTable = pgTable("same_day_delivery_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  price: integer("price").notNull().default(250),
  city: text("city").notNull().default("Lahore"),
  cutoffHour: integer("cutoff_hour").notNull().default(15),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const courierRetargetingQueueTable = pgTable("courier_retargeting_queue", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").notNull(),
  orderId: integer("order_id").notNull(),
  trackingId: text("tracking_id"),
  courierSlug: text("courier_slug"),
  customerName: text("customer_name"),
  customerPhone: text("phone"),
  customerEmail: text("email"),
  orderTotal: numeric("order_total", { precision: 10, scale: 2 }),
  deliveredAt: timestamp("delivered_at"),
  scheduledFor: timestamp("scheduled_for"),
  channel: text("channel").notNull().default("whatsapp"),
  message: text("message"),
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const courierNotificationLogsTable = pgTable("courier_notification_logs", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").notNull(),
  orderId: integer("order_id").notNull(),
  trackingId: text("tracking_id"),
  courierSlug: text("courier_slug"),
  shipmentStatus: text("shipment_status"),
  channel: text("channel").notNull(),
  phone: text("phone"),
  email: text("email"),
  customerName: text("customer_name"),
  message: text("message"),
  success: boolean("success").notNull().default(false),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCourierSchema = createInsertSchema(couriersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShipmentSchema = createInsertSchema(shipmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentGatewaySchema = createInsertSchema(paymentGatewaysTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertManualPaymentSchema = createInsertSchema(manualPaymentsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type Courier = typeof couriersTable.$inferSelect;
export type Shipment = typeof shipmentsTable.$inferSelect;
export type PaymentGateway = typeof paymentGatewaysTable.$inferSelect;
export type ManualPayment = typeof manualPaymentsTable.$inferSelect;
export type SameDayDeliverySettings = typeof sameDayDeliverySettingsTable.$inferSelect;
export type CourierNotificationLog = typeof courierNotificationLogsTable.$inferSelect;
export type CourierRetargetingQueue = typeof courierRetargetingQueueTable.$inferSelect;
