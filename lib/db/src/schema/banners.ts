import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bannersTable = pgTable("banners", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  imageUrl: text("image_url"),
  mobileImageUrl: text("mobile_image_url"),
  linkUrl: text("link_url"),
  targetType: text("target_type"),
  targetId: integer("target_id"),
  bgColor: text("bg_color").default("from-[#5FA800] to-[#4d8a00]"),
  textColor: text("text_color").default("white"),
  label: text("label"),
  cta: text("cta").default("Shop Now"),
  platform: text("platform").default("both"),
  /** hero | header | promo — keeps storefront sections independent */
  placement: text("placement").notNull().default("hero"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  countdownEndAt: timestamp("countdown_end_at"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  offerProductIds: jsonb("offer_product_ids").$type<number[]>().default([]),
  offerCategoryIds: jsonb("offer_category_ids").$type<number[]>().default([]),
  offerMode: text("offer_mode").default("discount_products"),
  offerDisplayCount: integer("offer_display_count").notNull().default(8),
  offerSort: text("offer_sort").default("featured"),
  showTimer: boolean("show_timer").notNull().default(true),
  buttonBgColor: text("button_bg_color"),
  buttonTextColor: text("button_text_color"),
  videoUrl: text("video_url"),
  mobileVideoUrl: text("mobile_video_url"),
  videoAutoplay: boolean("video_autoplay").default(true),
  videoMuted: boolean("video_muted").default(true),
  videoLoop: boolean("video_loop").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBannerSchema = createInsertSchema(bannersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertBanner = z.infer<typeof insertBannerSchema>;
export type Banner = typeof bannersTable.$inferSelect;
