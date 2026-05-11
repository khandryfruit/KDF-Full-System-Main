import {
  pgTable, text, serial, integer, boolean, timestamp, jsonb, numeric, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/* ═══════════════════════════════════════════════════════════════
   SAAS SUPER ADMINS  (platform owners)
═══════════════════════════════════════════════════════════════ */
export const saasSuperAdminsTable = pgTable("saas_super_admins", {
  id:           serial("id").primaryKey(),
  name:         text("name").notNull(),
  email:        text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isActive:     boolean("is_active").notNull().default(true),
  lastLoginAt:  timestamp("last_login_at"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════════════════════
   SAAS PLANS
═══════════════════════════════════════════════════════════════ */
export const saasPlanFeaturesType = z.object({
  website:              z.boolean().default(true),
  products:             z.number().default(50),          // max products (-1 = unlimited)
  orders:               z.number().default(100),         // max orders/month (-1 = unlimited)
  whatsappAutomation:   z.boolean().default(false),
  aiTools:              z.boolean().default(false),
  aiChatbot:            z.boolean().default(false),
  seoTools:             z.boolean().default(false),
  metaIntegration:      z.boolean().default(false),
  courierIntegrations:  z.boolean().default(false),
  analyticsAdvanced:    z.boolean().default(false),
  marketingCampaigns:   z.boolean().default(false),
  multiUser:            z.boolean().default(false),
  customDomain:         z.boolean().default(false),
  storageGb:            z.number().default(1),
  staffAccounts:        z.number().default(1),
  branches:             z.number().default(1),
  prioritySupport:      z.boolean().default(false),
  mobileApp:            z.boolean().default(false),
  apiAccess:            z.boolean().default(false),
  realtimeAnalytics:    z.boolean().default(false),
  themeCustomization:   z.boolean().default(true),
  blogModule:           z.boolean().default(false),
  loyaltyModule:        z.boolean().default(false),
  stripeConnect:        z.boolean().default(false),
});

export type SaasPlanFeatures = z.infer<typeof saasPlanFeaturesType>;

export const saasPlanBillingCycle = ["monthly", "yearly"] as const;
export type SaasPlanBillingCycle = typeof saasPlanBillingCycle[number];

export const saasPlanStatus = ["active", "archived"] as const;

export const saasPlanTier = ["starter", "business", "enterprise", "custom"] as const;
export type SaasPlanTier = typeof saasPlanTier[number];

export const saasPlansTable = pgTable("saas_plans", {
  id:             serial("id").primaryKey(),
  name:           text("name").notNull(),
  slug:           text("slug").notNull().unique(),
  tier:           text("tier").$type<SaasPlanTier>().notNull().default("starter"),
  description:    text("description"),
  priceMonthly:   numeric("price_monthly", { precision: 10, scale: 2 }).notNull().default("0"),
  priceYearly:    numeric("price_yearly",  { precision: 10, scale: 2 }).notNull().default("0"),
  currency:       text("currency").notNull().default("PKR"),
  features:       jsonb("features").$type<SaasPlanFeatures>().notNull().default({}),
  isActive:       boolean("is_active").notNull().default(true),
  isDefault:      boolean("is_default").notNull().default(false),
  displayOrder:   integer("display_order").notNull().default(0),
  badgeLabel:     text("badge_label"),
  color:          text("color").default("#6366f1"),
  trialDays:      integer("trial_days").notNull().default(14),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════════════════════
   SAAS TENANTS
═══════════════════════════════════════════════════════════════ */
export const saasTenantStatus = ["trial", "active", "suspended", "cancelled", "pending"] as const;
export type SaasTenantStatus = typeof saasTenantStatus[number];

export const saasTenantIndustry = [
  "grocery", "fashion", "electronics", "pharmacy",
  "food", "beauty", "sports", "furniture", "books", "other"
] as const;
export type SaasTenantIndustry = typeof saasTenantIndustry[number];

export const saasTenantSettingsType = z.object({
  openaiApiKey:       z.string().optional(),
  whatsappToken:      z.string().optional(),
  whatsappPhoneId:    z.string().optional(),
  whatsappBusinessId: z.string().optional(),
  metaAppId:          z.string().optional(),
  metaAppSecret:      z.string().optional(),
  metaPixelId:        z.string().optional(),
  metaAccessToken:    z.string().optional(),
  googleMapsKey:      z.string().optional(),
  googleAnalyticsId:  z.string().optional(),
  smtpHost:           z.string().optional(),
  smtpPort:           z.number().optional(),
  smtpUser:           z.string().optional(),
  smtpPass:           z.string().optional(),
  timezone:           z.string().default("Asia/Karachi"),
  currency:           z.string().default("PKR"),
  language:           z.string().default("en"),
  country:            z.string().default("PK"),
});
export type SaasTenantSettings = z.infer<typeof saasTenantSettingsType>;

export const saasTenantContactType = z.object({
  phone:      z.string().optional(),
  email:      z.string().optional(),
  address:    z.string().optional(),
  city:       z.string().optional(),
  country:    z.string().default("Pakistan"),
  facebook:   z.string().optional(),
  instagram:  z.string().optional(),
  twitter:    z.string().optional(),
});

export const saasTenantBillingType = z.object({
  cycle:          z.enum(["monthly", "yearly"]).default("monthly"),
  nextBillingDate: z.string().optional(),
  lastPaidAt:     z.string().optional(),
  totalPaid:      z.number().default(0),
  paymentMethod:  z.string().optional(),
});

export const saasTenantTable = pgTable("saas_tenants", {
  id:             serial("id").primaryKey(),
  name:           text("name").notNull(),
  slug:           text("slug").notNull().unique(),
  email:          text("email").notNull().unique(),
  passwordHash:   text("password_hash").notNull(),
  planId:         integer("plan_id").references(() => saasPlansTable.id),
  status:         text("status").$type<SaasTenantStatus>().notNull().default("trial"),
  industry:       text("industry").$type<SaasTenantIndustry>().notNull().default("other"),
  storeName:      text("store_name").notNull(),
  storeSlug:      text("store_slug").notNull().unique(),
  logoUrl:        text("logo_url"),
  faviconUrl:     text("favicon_url"),
  customDomain:   text("custom_domain"),
  domainVerified: boolean("domain_verified").notNull().default(false),
  subdomain:      text("subdomain").unique(),
  settings:       jsonb("settings").$type<SaasTenantSettings>().default({}),
  contact:        jsonb("contact").$type<z.infer<typeof saasTenantContactType>>().default({}),
  billing:        jsonb("billing").$type<z.infer<typeof saasTenantBillingType>>().default({}),
  trialEndsAt:    timestamp("trial_ends_at"),
  suspendedAt:    timestamp("suspended_at"),
  suspendReason:  text("suspend_reason"),
  ownerName:      text("owner_name"),
  ownerPhone:     text("owner_phone"),
  notes:          text("notes"),
  featureOverrides: jsonb("feature_overrides").$type<Partial<SaasPlanFeatures>>().default({}),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════════════════════
   SAAS THEME SETTINGS  (per tenant)
═══════════════════════════════════════════════════════════════ */
export const saasTemplateId = [
  "grocery", "fashion", "electronics", "pharmacy", "default"
] as const;
export type SaasTemplateId = typeof saasTemplateId[number];

export const saasThemeSettingsTable = pgTable("saas_theme_settings", {
  id:           serial("id").primaryKey(),
  tenantId:     integer("tenant_id").notNull().unique().references(() => saasTenantTable.id, { onDelete: "cascade" }),
  templateId:   text("template_id").$type<SaasTemplateId>().notNull().default("default"),
  primaryColor: text("primary_color").notNull().default("#16a34a"),
  accentColor:  text("accent_color").notNull().default("#15803d"),
  bgColor:      text("bg_color").notNull().default("#ffffff"),
  textColor:    text("text_color").notNull().default("#111827"),
  fontFamily:   text("font_family").notNull().default("Inter"),
  borderRadius: text("border_radius").notNull().default("md"),
  headerStyle:  text("header_style").notNull().default("default"),
  heroStyle:    text("hero_style").notNull().default("banner"),
  productCardStyle: text("product_card_style").notNull().default("default"),
  showReviews:  boolean("show_reviews").notNull().default(true),
  showWishlist: boolean("show_wishlist").notNull().default(true),
  showChat:     boolean("show_chat").notNull().default(true),
  showBanner:   boolean("show_banner").notNull().default(true),
  customCss:    text("custom_css"),
  customJs:     text("custom_js"),
  sections:     jsonb("sections").$type<Record<string, any>>().default({}),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════════════════════
   SAAS ACTIVITY LOG
═══════════════════════════════════════════════════════════════ */
export const saasActivityLogTable = pgTable("saas_activity_logs", {
  id:         serial("id").primaryKey(),
  tenantId:   integer("tenant_id").references(() => saasTenantTable.id),
  actorType:  text("actor_type").$type<"super_admin" | "tenant">().notNull(),
  actorId:    integer("actor_id"),
  action:     text("action").notNull(),
  entity:     text("entity"),
  entityId:   text("entity_id"),
  meta:       jsonb("meta").$type<Record<string, any>>().default({}),
  ip:         text("ip"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════════════════════
   INSERT SCHEMAS + TYPES
═══════════════════════════════════════════════════════════════ */
export const insertSaasPlansSchema = createInsertSchema(saasPlansTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSaasTenantSchema = createInsertSchema(saasTenantTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSaasThemeSchema  = createInsertSchema(saasThemeSettingsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type SaasPlan          = typeof saasPlansTable.$inferSelect;
export type InsertSaasPlan    = z.infer<typeof insertSaasPlansSchema>;
export type SaasTenant        = typeof saasTenantTable.$inferSelect;
export type InsertSaasTenant  = z.infer<typeof insertSaasTenantSchema>;
export type SaasTheme         = typeof saasThemeSettingsTable.$inferSelect;
export type SaasSuperAdmin    = typeof saasSuperAdminsTable.$inferSelect;
