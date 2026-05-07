import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mobileReelsTable = pgTable("mobile_reels", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),

  /* ── Video sources ── */
  cfStreamId: text("cf_stream_id"),
  cfAccountId: text("cf_account_id"),
  directVideoUrl: text("direct_video_url"),
  instagramUrl: text("instagram_url"),
  youtubeUrl: text("youtube_url"),

  /* ── Thumbnail ── */
  thumbnailUrl: text("thumbnail_url"),

  /* ── Playback ── */
  autoplay: boolean("autoplay").notNull().default(true),
  muted: boolean("muted").notNull().default(true),
  loop: boolean("loop").notNull().default(true),
  duration: integer("duration"),

  /* ── CTA & product link ── */
  ctaLabel: text("cta_label"),
  ctaUrl: text("cta_url"),
  linkedProductId: integer("linked_product_id"),

  /* ── Category ── */
  category: text("category").default("general"),

  /* ── Meta ── */
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  viewCount: integer("view_count").notNull().default(0),
  likeCount: integer("like_count").notNull().default(0),

  /* ── Scheduling ── */
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMobileReelSchema = createInsertSchema(mobileReelsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  viewCount: true,
  likeCount: true,
});

export type InsertMobileReel = z.infer<typeof insertMobileReelSchema>;
export type MobileReel = typeof mobileReelsTable.$inferSelect;
