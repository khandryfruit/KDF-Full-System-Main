import { pgTable, text, serial, integer, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { branchesTable } from "./branches";

/* ── Branch Users (staff per branch) ──────────────────── */
export const branchUsersTable = pgTable("branch_users", {
  id:           serial("id").primaryKey(),
  branchId:     integer("branch_id").notNull().references(() => branchesTable.id, { onDelete: "cascade" }),
  username:     text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name:         text("name").notNull(),
  phone:        text("phone"),
  email:        text("email"),
  role:         text("role").notNull().default("cashier"), // cashier | manager | sales | operator
  permissions:  jsonb("permissions").$type<Record<string, boolean>>().notNull().default({}),
  isActive:     boolean("is_active").notNull().default(true),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});

/* ── Branch Customers (local customer DB per branch) ───── */
export const branchCustomersTable = pgTable("branch_customers", {
  id:          serial("id").primaryKey(),
  branchId:    integer("branch_id").notNull().references(() => branchesTable.id, { onDelete: "cascade" }),
  name:        text("name").notNull(),
  phone:       text("phone").notNull(),
  email:       text("email"),
  address:     text("address"),
  totalOrders: integer("total_orders").notNull().default(0),
  totalSpent:  numeric("total_spent", { precision: 12, scale: 2 }).notNull().default("0"),
  notes:       text("notes"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

/* ── Branch Invoices ─────────────────────────────────────── */
export const branchInvoicesTable = pgTable("branch_invoices", {
  id:              serial("id").primaryKey(),
  branchId:        integer("branch_id").notNull().references(() => branchesTable.id, { onDelete: "cascade" }),
  createdByUserId: integer("created_by_user_id").references(() => branchUsersTable.id),
  invoiceNo:       text("invoice_no").notNull(),
  type:            text("type").notNull().default("invoice"), // invoice | bill
  status:          text("status").notNull().default("completed"),
  // draft | completed | edited | returned | partially_returned | exchanged | refunded
  customerId:      integer("customer_id").references(() => branchCustomersTable.id),
  customerName:    text("customer_name"),
  customerPhone:   text("customer_phone"),
  customerAddress: text("customer_address"),
  supplierName:    text("supplier_name"),
  supplierPhone:   text("supplier_phone"),
  supplierCity:    text("supplier_city"),
  items:           jsonb("items").$type<any[]>().notNull().default([]),
  subtotal:        numeric("subtotal",      { precision: 12, scale: 2 }).notNull().default("0"),
  discountPct:     numeric("discount_pct",  { precision: 5,  scale: 2 }).notNull().default("0"),
  discountAmt:     numeric("discount_amt",  { precision: 12, scale: 2 }).notNull().default("0"),
  shipping:        numeric("shipping",      { precision: 12, scale: 2 }).notNull().default("0"),
  taxRate:         numeric("tax_rate",      { precision: 5,  scale: 2 }).notNull().default("0"),
  taxAmt:          numeric("tax_amt",       { precision: 12, scale: 2 }).notNull().default("0"),
  grandTotal:      numeric("grand_total",   { precision: 12, scale: 2 }).notNull().default("0"),
  paymentMethod:   text("payment_method").notNull().default("cash"),
  paymentStatus:   text("payment_status").notNull().default("unpaid"),
  paidAmount:      numeric("paid_amount",   { precision: 12, scale: 2 }).notNull().default("0"),
  notes:           text("notes"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
});

/* ── Branch Audit Logs ───────────────────────────────────── */
export const branchAuditLogsTable = pgTable("branch_audit_logs", {
  id:        serial("id").primaryKey(),
  branchId:  integer("branch_id").notNull().references(() => branchesTable.id, { onDelete: "cascade" }),
  invoiceId: integer("invoice_id").references(() => branchInvoicesTable.id, { onDelete: "set null" }),
  userId:    integer("user_id").references(() => branchUsersTable.id, { onDelete: "set null" }),
  userName:  text("user_name"),
  action:    text("action").notNull(), // create | edit | delete | return | exchange | refund
  oldData:   jsonb("old_data"),
  newData:   jsonb("new_data"),
  note:      text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ── Branch Returns ──────────────────────────────────────── */
export const branchReturnsTable = pgTable("branch_returns", {
  id:                   serial("id").primaryKey(),
  branchId:             integer("branch_id").notNull().references(() => branchesTable.id, { onDelete: "cascade" }),
  originalInvoiceId:    integer("original_invoice_id").notNull().references(() => branchInvoicesTable.id, { onDelete: "cascade" }),
  returnInvoiceNo:      text("return_invoice_no").notNull(),
  processedByUserId:    integer("processed_by_user_id").references(() => branchUsersTable.id),
  processedByName:      text("processed_by_name"),
  returnType:           text("return_type").notNull().default("full_return"),
  // full_return | partial_return | exchange | store_credit
  items:                jsonb("items").$type<any[]>().notNull().default([]),
  exchangeItems:        jsonb("exchange_items").$type<any[]>().default([]),
  returnAmount:         numeric("return_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  storeCredit:          numeric("store_credit",  { precision: 12, scale: 2 }).notNull().default("0"),
  refundMethod:         text("refund_method").default("cash"),
  reason:               text("reason"),
  notes:                text("notes"),
  status:               text("status").notNull().default("completed"),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
});

export type BranchUser      = typeof branchUsersTable.$inferSelect;
export type BranchCustomer  = typeof branchCustomersTable.$inferSelect;
export type BranchInvoice   = typeof branchInvoicesTable.$inferSelect;
export type BranchAuditLog  = typeof branchAuditLogsTable.$inferSelect;
export type BranchReturn    = typeof branchReturnsTable.$inferSelect;
