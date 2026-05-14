import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/* ─── Footer Settings ─────────────────────────────────── */
export const footerSettingsTable = pgTable("footer_settings", {
  id:            serial("id").primaryKey(),
  logoPath:      text("logo_path"),
  description:   text("description"),
  address:       text("address"),
  phone:         text("phone"),
  email:         text("email"),
  copyrightText: text("copyright_text"),
  /** JSON string: newsletter copy, AI rotating lines, Instagram URLs, section toggles — see kdf-plus Footer */
  premiumConfig: text("premium_config"),
  isActive:      boolean("is_active").notNull().default(true),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
});

export const insertFooterSettingsSchema = createInsertSchema(footerSettingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFooterSettings = z.infer<typeof insertFooterSettingsSchema>;
export type FooterSettings = typeof footerSettingsTable.$inferSelect;

/* ─── Footer Menus ────────────────────────────────────── */
export const footerMenusTable = pgTable("footer_menus", {
  id:        serial("id").primaryKey(),
  title:     text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive:  boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFooterMenuSchema = createInsertSchema(footerMenusTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFooterMenu = z.infer<typeof insertFooterMenuSchema>;
export type FooterMenu = typeof footerMenusTable.$inferSelect;

/* ─── Footer Menu Items ───────────────────────────────── */
export const footerMenuItemsTable = pgTable("footer_menu_items", {
  id:          serial("id").primaryKey(),
  menuId:      integer("menu_id").notNull(),
  label:       text("label").notNull(),
  linkType:    text("link_type").notNull().default("custom"),
  linkValue:   text("link_value").notNull(),
  openInNewTab: boolean("open_in_new_tab").notNull().default(false),
  sortOrder:   integer("sort_order").notNull().default(0),
  isActive:    boolean("is_active").notNull().default(true),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});

export const insertFooterMenuItemSchema = createInsertSchema(footerMenuItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFooterMenuItem = z.infer<typeof insertFooterMenuItemSchema>;
export type FooterMenuItem = typeof footerMenuItemsTable.$inferSelect;

/* ─── Policies ────────────────────────────────────────── */
export const policiesTable = pgTable("policies", {
  id:              serial("id").primaryKey(),
  title:           text("title").notNull(),
  slug:            text("slug").notNull().unique(),
  content:         text("content").notNull().default(""),
  metaTitle:       text("meta_title"),
  metaDescription: text("meta_description"),
  isActive:        boolean("is_active").notNull().default(true),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
});

export const insertPolicySchema = createInsertSchema(policiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type Policy = typeof policiesTable.$inferSelect;

/* ─── App Links ───────────────────────────────────────── */
export const appLinksTable = pgTable("app_links", {
  id:          serial("id").primaryKey(),
  androidLink: text("android_link"),
  iosLink:     text("ios_link"),
  qrImagePath: text("qr_image_path"),
  downloadCountLabel: text("download_count_label"),
  androidLabel: text("android_label"),
  iosLabel:     text("ios_label"),
  isActive:    boolean("is_active").notNull().default(true),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});

export const insertAppLinksSchema = createInsertSchema(appLinksTable).omit({ id: true, updatedAt: true });
export type InsertAppLinks = z.infer<typeof insertAppLinksSchema>;
export type AppLinks = typeof appLinksTable.$inferSelect;

/* ─── Social Links ────────────────────────────────────── */
export const socialLinksTable = pgTable("social_links", {
  id:        serial("id").primaryKey(),
  platform:  text("platform").notNull(),
  url:       text("url").notNull(),
  icon:      text("icon").notNull().default("link"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive:  boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSocialLinkSchema = createInsertSchema(socialLinksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSocialLink = z.infer<typeof insertSocialLinkSchema>;
export type SocialLink = typeof socialLinksTable.$inferSelect;
