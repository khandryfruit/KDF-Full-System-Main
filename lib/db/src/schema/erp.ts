import { pgTable, text, serial, integer, boolean, timestamp, jsonb, numeric, date } from "drizzle-orm/pg-core";
import { branchesTable } from "./branches";
import { branchProductsTable } from "./branchStock";
import { branchInvoicesTable } from "./branchInvoice";

export const erpPartiesTable = pgTable("erp_parties", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("supplier"),
  name: text("name").notNull(),
  code: text("code").unique(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  creditLimit: numeric("credit_limit", { precision: 12, scale: 2 }).default("0"),
  openingBalance: numeric("opening_balance", { precision: 12, scale: 2 }).default("0"),
  paymentTermsDays: integer("payment_terms_days").default(0),
  taxId: text("tax_id"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const erpPartyLedgerTable = pgTable("erp_party_ledger", {
  id: serial("id").primaryKey(),
  partyId: integer("party_id").notNull().references(() => erpPartiesTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  entryType: text("entry_type").notNull(),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  debit: numeric("debit", { precision: 12, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 12, scale: 2 }).notNull().default("0"),
  balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }),
  dueDate: date("due_date"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const erpPurchasesTable = pgTable("erp_purchases", {
  id: serial("id").primaryKey(),
  purchaseNo: text("purchase_no").notNull().unique(),
  partyId: integer("party_id").notNull().references(() => erpPartiesTable.id),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  status: text("status").notNull().default("completed"),
  purchaseDate: date("purchase_date").notNull(),
  dueDate: date("due_date"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxAmt: numeric("tax_amt", { precision: 12, scale: 2 }).notNull().default("0"),
  otherExpenses: numeric("other_expenses", { precision: 12, scale: 2 }).notNull().default("0"),
  grandTotal: numeric("grand_total", { precision: 12, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  notes: text("notes"),
  branchInvoiceId: integer("branch_invoice_id").references(() => branchInvoicesTable.id, { onDelete: "set null" }),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const erpPurchaseLinesTable = pgTable("erp_purchase_lines", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id").notNull().references(() => erpPurchasesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => branchProductsTable.id, { onDelete: "set null" }),
  itemCode: text("item_code"),
  name: text("name").notNull(),
  qty: numeric("qty", { precision: 12, scale: 3 }).notNull(),
  unit: text("unit").notNull().default("KG"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  taxAmt: numeric("tax_amt", { precision: 12, scale: 2 }).default("0"),
  batchNo: text("batch_no"),
});

export const erpCostLayersTable = pgTable("erp_cost_layers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => branchProductsTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  purchaseId: integer("purchase_id").references(() => erpPurchasesTable.id, { onDelete: "set null" }),
  purchaseLineId: integer("purchase_line_id").references(() => erpPurchaseLinesTable.id, { onDelete: "set null" }),
  qtyReceived: numeric("qty_received", { precision: 12, scale: 3 }).notNull(),
  qtyRemaining: numeric("qty_remaining", { precision: 12, scale: 3 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

export const erpPriceHistoryTable = pgTable("erp_price_history", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => branchProductsTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
  salePrice: numeric("sale_price", { precision: 12, scale: 2 }),
  avgCost: numeric("avg_cost", { precision: 12, scale: 2 }),
  source: text("source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const erpPriceSuggestionsTable = pgTable("erp_price_suggestions", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => branchProductsTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  currentSalePrice: numeric("current_sale_price", { precision: 12, scale: 2 }),
  suggestedSalePrice: numeric("suggested_sale_price", { precision: 12, scale: 2 }).notNull(),
  avgCost: numeric("avg_cost", { precision: 12, scale: 2 }),
  marginPct: numeric("margin_pct", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: integer("resolved_by"),
});

export const erpBranchTransfersTable = pgTable("erp_branch_transfers", {
  id: serial("id").primaryKey(),
  transferNo: text("transfer_no").notNull().unique(),
  fromBranchId: integer("from_branch_id").notNull().references(() => branchesTable.id),
  toBranchId: integer("to_branch_id").notNull().references(() => branchesTable.id),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  requestedBy: integer("requested_by"),
  approvedBy: integer("approved_by"),
  receivedBy: integer("received_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  receivedAt: timestamp("received_at"),
});

export const erpBranchTransferLinesTable = pgTable("erp_branch_transfer_lines", {
  id: serial("id").primaryKey(),
  transferId: integer("transfer_id").notNull().references(() => erpBranchTransfersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => branchProductsTable.id),
  itemCode: text("item_code"),
  name: text("name").notNull(),
  qty: numeric("qty", { precision: 12, scale: 3 }).notNull(),
  unit: text("unit").default("KG"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
  qtyReceived: numeric("qty_received", { precision: 12, scale: 3 }),
});

export const erpAuditLogsTable = pgTable("erp_audit_logs", {
  id: serial("id").primaryKey(),
  module: text("module").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: integer("resource_id"),
  branchId: integer("branch_id"),
  userId: integer("user_id"),
  userEmail: text("user_email"),
  oldData: jsonb("old_data"),
  newData: jsonb("new_data"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ErpParty = typeof erpPartiesTable.$inferSelect;
export type ErpPurchase = typeof erpPurchasesTable.$inferSelect;
