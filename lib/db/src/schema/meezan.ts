import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const meezanTxnStatusEnum = pgEnum("meezan_txn_status", [
  "initiated",
  "pending",
  "paid",
  "failed",
  "refunded",
  "partial_refund",
  "reversed",
  "disputed",
  "chargeback",
]);

export const meezanTransactionsTable = pgTable("meezan_transactions", {
  id:                serial("id").primaryKey(),
  orderId:           integer("order_id"),
  invoiceNumber:     text("invoice_number"),
  meezanOrderId:     text("meezan_order_id").unique(),
  meezanTxnId:       text("meezan_txn_id"),
  amount:            numeric("amount", { precision: 12, scale: 2 }).notNull(),
  refundedAmount:    numeric("refunded_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  currency:          text("currency").notNull().default("PKR"),
  description:       text("description"),
  customerName:      text("customer_name"),
  customerPhone:     text("customer_phone"),
  customerEmail:     text("customer_email"),
  paymentMethod:     text("payment_method"),
  cardMask:          text("card_mask"),
  status:            meezanTxnStatusEnum("status").notNull().default("initiated"),
  errorCode:         text("error_code"),
  errorMessage:      text("error_message"),
  refundReason:      text("refund_reason"),
  refundTxnId:       text("refund_txn_id"),
  refundedAt:        timestamp("refunded_at"),
  returnUrl:         text("return_url"),
  failUrl:           text("fail_url"),
  registerResponse:  jsonb("register_response").$type<Record<string, unknown>>(),
  statusResponse:    jsonb("status_response").$type<Record<string, unknown>>(),
  callbackPayload:   jsonb("callback_payload").$type<Record<string, unknown>>(),
  isLive:            boolean("is_live").notNull().default(false),
  platformSource:    text("platform_source"),
  externalRef:       text("external_ref"),
  completedAt:       timestamp("completed_at"),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
  updatedAt:         timestamp("updated_at").notNull().defaultNow(),
});

export const meezanSettingsTable = pgTable("meezan_settings", {
  id:                  serial("id").primaryKey(),
  environment:         text("environment").notNull().default("sandbox"),
  sandboxUsername:     text("sandbox_username"),
  sandboxPassword:     text("sandbox_password"),
  sandboxMerchantId:   text("sandbox_merchant_id"),
  liveUsername:        text("live_username"),
  livePassword:        text("live_password"),
  liveMerchantId:      text("live_merchant_id"),
  returnUrl:           text("return_url"),
  failUrl:             text("fail_url"),
  callbackUrl:         text("callback_url"),
  webhookSecret:       text("webhook_secret"),
  isActive:            boolean("is_active").notNull().default(false),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
});

export const meezanAuditLogsTable = pgTable("meezan_audit_logs", {
  id:          serial("id").primaryKey(),
  txnId:       integer("txn_id"),
  action:      text("action").notNull(),
  performedBy: text("performed_by"),
  payload:     jsonb("payload").$type<Record<string, unknown>>(),
  response:    jsonb("response").$type<Record<string, unknown>>(),
  ip:          text("ip"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

/* ── Invoices ── */
export const invoicesTable = pgTable("invoices", {
  id:             serial("id").primaryKey(),
  invoiceNumber:  text("invoice_number").notNull().unique(),
  customerName:   text("customer_name"),
  customerPhone:  text("customer_phone"),
  customerEmail:  text("customer_email"),
  amount:         numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description:    text("description"),
  notes:          text("notes"),
  status:         text("status").notNull().default("draft"),
  dueDate:        timestamp("due_date"),
  meezanOrderId:  text("meezan_order_id"),
  paymentUrl:     text("payment_url"),
  invoiceUrl:     text("invoice_url"),
  sentAt:         timestamp("sent_at"),
  sentVia:        text("sent_via"),
  paidAt:         timestamp("paid_at"),
  platformSource: text("platform_source").default("admin"),
  isLive:         boolean("is_live").notNull().default(false),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

export const insertMeezanTxnSchema = createInsertSchema(meezanTransactionsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertMeezanSettingsSchema = createInsertSchema(meezanSettingsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type MeezanTransaction = typeof meezanTransactionsTable.$inferSelect;
export type MeezanSettings    = typeof meezanSettingsTable.$inferSelect;
export type MeezanAuditLog    = typeof meezanAuditLogsTable.$inferSelect;
export type Invoice            = typeof invoicesTable.$inferSelect;
export type InsertMeezanTxn   = z.infer<typeof insertMeezanTxnSchema>;
