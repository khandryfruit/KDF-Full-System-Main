import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const abandonedCheckoutStatusEnum = pgEnum("abandoned_checkout_status", [
  "active",
  "recovered",
  "expired",
]);

export const abandonedCheckoutsTable = pgTable("abandoned_checkouts", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  userId: integer("user_id"),
  customerName: text("customer_name"),
  phone: text("phone"),
  email: text("email"),
  cartItems: jsonb("cart_items")
    .$type<
      Array<{
        productId: number;
        name: string;
        price: string;
        qty: number;
        variant?: string;
        variantLabel?: string;
        image?: string;
      }>
    >()
    .notNull()
    .default([]),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  checkoutStep: text("checkout_step").notNull().default("cart"),
  status: abandonedCheckoutStatusEnum("status").notNull().default("active"),
  /** Customer-facing resume URL (Shopify checkout / abandoned recovery) */
  checkoutUrl: text("checkout_url"),
  /** Shopify checkout.token — matches Order.checkout_token for recovery */
  shopifyCheckoutToken: text("shopify_checkout_token"),
  /** Shopify checkout.id (numeric as string) */
  shopifyCheckoutId: text("shopify_checkout_id"),
  totalDiscounts: numeric("total_discounts", { precision: 12, scale: 2 }),
  currency: text("currency"),
  /** native | shopify_webhook | shopify_rest */
  syncSource: text("sync_source").default("native"),
  customerAddress: text("customer_address"),
  whatsappSent: boolean("whatsapp_sent").notNull().default(false),
  emailSent: boolean("email_sent").notNull().default(false),
  reminderCount: integer("reminder_count").notNull().default(0),
  reminderSentAt: timestamp("reminder_sent_at"),
  discountApplied: text("discount_applied"),
  lastActivity: timestamp("last_activity").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  recoveredAt: timestamp("recovered_at"),
});

export const insertAbandonedCheckoutSchema = createInsertSchema(abandonedCheckoutsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAbandonedCheckout = z.infer<typeof insertAbandonedCheckoutSchema>;
export type AbandonedCheckout = typeof abandonedCheckoutsTable.$inferSelect;
