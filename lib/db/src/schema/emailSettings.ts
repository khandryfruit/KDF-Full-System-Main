import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const emailSettingsTable = pgTable("email_settings", {
  id:                       serial("id").primaryKey(),

  /* ── Master toggle ───────────────────────────────────────── */
  emailEnabled:             boolean("email_enabled").notNull().default(false),

  /* ── SMTP ────────────────────────────────────────────────── */
  smtpHost:                 text("smtp_host").notNull().default(""),
  smtpPort:                 integer("smtp_port").notNull().default(587),
  smtpUser:                 text("smtp_user").notNull().default(""),
  smtpPass:                 text("smtp_pass").notNull().default(""),
  smtpFrom:                 text("smtp_from").notNull().default(""),

  /* ── Per-automation toggles + subjects ───────────────────── */
  orderConfirmEnabled:      boolean("order_confirm_enabled").notNull().default(true),
  orderConfirmSubject:      text("order_confirm_subject").notNull().default("Your KDF Nuts Order Confirmation"),
  orderConfirmTemplate:     text("order_confirm_template").notNull().default(""),

  orderPaidEnabled:         boolean("order_paid_enabled").notNull().default(true),
  orderPaidSubject:         text("order_paid_subject").notNull().default("Payment Confirmed — KDF Nuts Order #{{orderNumber}}"),

  orderCancelledEnabled:    boolean("order_cancelled_enabled").notNull().default(true),
  orderCancelledSubject:    text("order_cancelled_subject").notNull().default("Your KDF Nuts Order Has Been Cancelled"),

  courierBookedEnabled:     boolean("courier_booked_enabled").notNull().default(true),
  courierBookedSubject:     text("courier_booked_subject").notNull().default("Your Order Is Dispatched — Tracking #{{trackingId}}"),

  riderAssignedEnabled:     boolean("rider_assigned_enabled").notNull().default(true),
  riderAssignedSubject:     text("rider_assigned_subject").notNull().default("Rider Assigned — Your KDF Nuts Order Is Coming"),

  outForDeliveryEnabled:    boolean("out_for_delivery_enabled").notNull().default(true),
  outForDeliverySubject:    text("out_for_delivery_subject").notNull().default("Your Order Is Out For Delivery Today!"),

  deliveredEnabled:         boolean("delivered_enabled").notNull().default(true),
  deliveredSubject:         text("delivered_subject").notNull().default("Order Delivered — Thank You! 🎉"),

  refundEnabled:            boolean("refund_enabled").notNull().default(true),
  refundSubject:            text("refund_subject").notNull().default("Refund Processed — KDF Nuts Order #{{orderNumber}}"),

  invoiceEnabled:           boolean("invoice_enabled").notNull().default(false),
  invoiceSubject:           text("invoice_subject").notNull().default("Invoice for Order #{{orderNumber}}"),

  updatedAt:                timestamp("updated_at").notNull().defaultNow(),
});

export type EmailSettings = typeof emailSettingsTable.$inferSelect;

/* ─────────────────────────────────────────────────────────────
   EMAIL LOGS  — record of every transactional email attempted
───────────────────────────────────────────────────────────── */
export const emailLogsTable = pgTable("email_logs", {
  id:             serial("id").primaryKey(),
  type:           text("type").notNull(),          /* order_confirm | order_paid | order_cancelled | courier_booked | rider_assigned | out_for_delivery | delivered | refund | invoice | test */
  to:             text("to").notNull(),
  subject:        text("subject").notNull(),
  status:         text("status").notNull().default("sent"), /* sent | failed */
  errorMessage:   text("error_message"),
  orderId:        integer("order_id"),
  orderNumber:    text("order_number"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export type EmailLog = typeof emailLogsTable.$inferSelect;
