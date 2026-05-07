import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const videoBannersTable = pgTable("video_banners", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),

  /* ── Cloudflare Stream ── */
  cfStreamId: text("cf_stream_id"),
  cfAccountId: text("cf_account_id"),

  /* ── YouTube ── */
  youtubeUrl: text("youtube_url"),
  youtubeThumbnail: text("youtube_thumbnail"),

  /* ── Direct URL ── */
  directVideoUrl: text("direct_video_url"),
  mobileVideoUrl: text("mobile_video_url"),

  /* ── Fallback image ── */
  fallbackImageUrl: text("fallback_image_url"),
  mobileFallbackImageUrl: text("mobile_fallback_image_url"),

  /* ── Playback settings ── */
  autoplay: boolean("autoplay").notNull().default(true),
  muted: boolean("muted").notNull().default(true),
  loop: boolean("loop").notNull().default(true),
  showControls: boolean("show_controls").notNull().default(false),

  /* ── CTA buttons ── */
  ctaButtons: jsonb("cta_buttons").$type<Array<{ label: string; url: string; style: "primary" | "secondary" | "outline" }>>().default([]),

  /* ── Display settings ── */
  platform: text("platform").notNull().default("both"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  isPriority: boolean("is_priority").notNull().default(false),

  /* ── Scheduling ── */
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),

  /* ── Overlay text style ── */
  overlayOpacity: integer("overlay_opacity").default(50),
  textPosition: text("text_position").default("left"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVideoBannerSchema = createInsertSchema(videoBannersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVideoBanner = z.infer<typeof insertVideoBannerSchema>;
export type VideoBanner = typeof videoBannersTable.$inferSelect;
