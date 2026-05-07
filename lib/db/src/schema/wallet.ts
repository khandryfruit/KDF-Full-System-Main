import { pgTable, text, serial, integer, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const txTypeEnum = pgEnum("tx_type", ["credit", "debit"]);

export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  type: txTypeEnum("type").notNull(),
  description: text("description").notNull(),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const loyaltyTransactionsTable = pgTable("loyalty_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  points: integer("points").notNull(),
  type: txTypeEnum("type").notNull(),
  description: text("description").notNull(),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWalletTxSchema = createInsertSchema(walletTransactionsTable).omit({
  id: true,
  createdAt: true,
});

export const insertLoyaltyTxSchema = createInsertSchema(loyaltyTransactionsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertWalletTx = z.infer<typeof insertWalletTxSchema>;
export type WalletTx = typeof walletTransactionsTable.$inferSelect;
export type InsertLoyaltyTx = z.infer<typeof insertLoyaltyTxSchema>;
export type LoyaltyTx = typeof loyaltyTransactionsTable.$inferSelect;
