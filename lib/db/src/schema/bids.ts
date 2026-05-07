import { pgTable, text, serial, integer, boolean, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bidAuctionStatusEnum = pgEnum("bid_auction_status", [
  "draft",
  "active",
  "ended",
  "cancelled",
]);

export const bidStatusEnum = pgEnum("bid_status", [
  "active",
  "won",
  "outbid",
  "cancelled",
]);

export const productBidConfigTable = pgTable("product_bid_config", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().unique(),
  isActive: boolean("is_active").notNull().default(false),
  status: bidAuctionStatusEnum("status").notNull().default("draft"),
  startingPrice: numeric("starting_price", { precision: 10, scale: 2 }).notNull().default("0"),
  currentBid: numeric("current_bid", { precision: 10, scale: 2 }).notNull().default("0"),
  minIncrement: numeric("min_increment", { precision: 10, scale: 2 }).notNull().default("50"),
  reservePrice: numeric("reserve_price", { precision: 10, scale: 2 }),
  buyNowPrice: numeric("buy_now_price", { precision: 10, scale: 2 }),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  totalBids: integer("total_bids").notNull().default(0),
  winnerBidId: integer("winner_bid_id"),
  winnerNotified: boolean("winner_notified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const bidsTable = pgTable("bids", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  bidConfigId: integer("bid_config_id").notNull(),
  userId: integer("user_id"),
  bidderName: text("bidder_name").notNull(),
  bidderPhone: text("bidder_phone").notNull(),
  bidderEmail: text("bidder_email"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: bidStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProductBidConfigSchema = createInsertSchema(productBidConfigTable).omit({
  id: true, createdAt: true, updatedAt: true, currentBid: true, totalBids: true,
  winnerBidId: true, winnerNotified: true,
});
export const insertBidSchema = createInsertSchema(bidsTable).omit({ id: true, createdAt: true, status: true });

export type ProductBidConfig = typeof productBidConfigTable.$inferSelect;
export type Bid = typeof bidsTable.$inferSelect;
export type InsertProductBidConfig = z.infer<typeof insertProductBidConfigSchema>;
export type InsertBid = z.infer<typeof insertBidSchema>;
