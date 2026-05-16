import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const shopifyStoresTable = pgTable("shopify_stores", {
  id: serial("id").primaryKey(),
  shopDomain: text("shop_domain").notNull(),
  accessToken: text("access_token"),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  webhookSecret: text("webhook_secret"),
  storeName: text("store_name"),
  storeEmail: text("store_email"),
  currency: text("currency").default("PKR"),
  isConnected: boolean("is_connected").notNull().default(false),
  syncOrders: boolean("sync_orders").notNull().default(true),
  syncCustomers: boolean("sync_customers").notNull().default(true),
  syncProducts: boolean("sync_products").notNull().default(true),
  lastOrderSync: timestamp("last_order_sync"),
  lastCustomerSync: timestamp("last_customer_sync"),
  lastProductSync: timestamp("last_product_sync"),
  totalOrdersSynced: integer("total_orders_synced").notNull().default(0),
  totalCustomersSynced: integer("total_customers_synced").notNull().default(0),
  totalProductsSynced: integer("total_products_synced").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shopifyOrdersTable = pgTable("shopify_orders", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  shopifyOrderId: text("shopify_order_id").notNull().unique(),
  orderNumber: text("order_number").notNull(),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  status: text("status").notNull().default("pending"),
  fulfillmentStatus: text("fulfillment_status"),
  financialStatus: text("financial_status"),
  currency: text("currency").default("PKR"),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }),
  subtotalPrice: numeric("subtotal_price", { precision: 10, scale: 2 }),
  totalTax: numeric("total_tax", { precision: 10, scale: 2 }),
  totalDiscounts: numeric("total_discounts", { precision: 10, scale: 2 }),
  shippingAddress: jsonb("shipping_address").$type<{
    name?: string; address1?: string; city?: string; country?: string; phone?: string; zip?: string;
  }>(),
  lineItems: jsonb("line_items").$type<Array<{
    id: string; title: string; quantity: number; price: string; sku?: string; variantTitle?: string; imageUrl?: string;
  }>>(),
  tags: text("tags"),
  note: text("note"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  waNotificationSent: boolean("wa_notification_sent").notNull().default(false),
  waLastMessage: text("wa_last_message"),
  shopifyCreatedAt: timestamp("shopify_created_at"),
  shopifyUpdatedAt: timestamp("shopify_updated_at"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shopifyCustomersTable = pgTable("shopify_customers", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().default(0),
  shopifyCustomerId: text("shopify_customer_id").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  city: text("city"),
  country: text("country"),
  totalOrders: integer("total_orders").notNull().default(0),
  totalSpent: numeric("total_spent", { precision: 10, scale: 2 }).default("0"),
  currency: text("currency").default("PKR"),
  tags: text("tags"),
  acceptsMarketing: boolean("accepts_marketing").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  source: text("source").notNull().default("shopify"),
  lastOrderAt: timestamp("last_order_at"),
  shopifyCreatedAt: timestamp("shopify_created_at"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shopifyProductsTable = pgTable("shopify_products", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  shopifyProductId: text("shopify_product_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  vendor: text("vendor"),
  productType: text("product_type"),
  status: text("status").default("active"),
  tags: text("tags"),
  handle: text("handle"),
  collections: jsonb("collections").$type<Array<{ id: string; title: string; handle?: string; type?: string }>>().default([]),
  imageUrl: text("image_url"),
  price: numeric("price", { precision: 10, scale: 2 }),
  compareAtPrice: numeric("compare_at_price", { precision: 10, scale: 2 }),
  inventoryQuantity: integer("inventory_quantity").default(0),
  sku: text("sku"),
  variants: jsonb("variants").$type<Array<{
    id: string; title: string; price: string; sku?: string; inventoryQuantity?: number;
    compareAtPrice?: string | null; inventoryItemId?: string; weight?: number; weightUnit?: string;
    option1?: string | null; option2?: string | null; option3?: string | null; barcode?: string | null;
  }>>(),
  isFeatured: boolean("is_featured").notNull().default(false),
  badge: text("badge"),
  isRecommended: boolean("is_recommended").notNull().default(false),
  recommendPriority: integer("recommend_priority").default(0),
  shopifyCreatedAt: timestamp("shopify_created_at"),
  shopifyUpdatedAt: timestamp("shopify_updated_at"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shopifyCampaignsTable = pgTable("shopify_campaigns", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id"),
  name: text("name").notNull(),
  message: text("message").notNull(),
  imageUrl: text("image_url"),
  status: text("status").notNull().default("draft"),
  targetSegment: text("target_segment").notNull().default("all"),
  minOrderCount: integer("min_order_count"),
  minTotalSpent: numeric("min_total_spent", { precision: 10, scale: 2 }),
  includeAbandoned: boolean("include_abandoned").notNull().default(false),
  discountCode: text("discount_code"),
  discountMessage: text("discount_message"),
  productIds: jsonb("product_ids").$type<string[]>(),
  buttonShopNow: boolean("button_shop_now").notNull().default(false),
  buttonViewProduct: boolean("button_view_product").notNull().default(false),
  buttonApplyDiscount: boolean("button_apply_discount").notNull().default(false),
  shopNowUrl: text("shop_now_url"),
  viewProductUrl: text("view_product_url"),
  totalSent: integer("total_sent").notNull().default(0),
  totalDelivered: integer("total_delivered").notNull().default(0),
  totalFailed: integer("total_failed").notNull().default(0),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shopifyProductAliasesTable = pgTable("shopify_product_aliases", {
  id: serial("id").primaryKey(),
  shopifyProductId: text("shopify_product_id").notNull(),
  alias: text("alias").notNull(),
  aliasType: text("alias_type").notNull().default("synonym"),
  locale: text("locale").notNull().default("any"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shopifyWebhookLogsTable = pgTable("shopify_webhook_logs", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id"),
  topic: text("topic").notNull(),
  shopifyId: text("shopify_id"),
  payload: jsonb("payload"),
  processed: boolean("processed").notNull().default(false),
  error: text("error"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

/* ── Email Campaign Tables ────────────────────────────── */

export const shopifyEmailCampaignsTable = pgTable("shopify_email_campaigns", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id"),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  fromName: text("from_name"),
  status: text("status").notNull().default("draft"),
  targetSegment: text("target_segment").notNull().default("all"),
  minOrderCount: integer("min_order_count"),
  minTotalSpent: numeric("min_total_spent", { precision: 10, scale: 2 }),
  bannerImageUrl: text("banner_image_url"),
  headline: text("headline"),
  bodyText: text("body_text").notNull().default(""),
  discountCode: text("discount_code"),
  discountMessage: text("discount_message"),
  productTitle: text("product_title"),
  productImageUrl: text("product_image_url"),
  productUrl: text("product_url"),
  ctaButtonText: text("cta_button_text"),
  ctaButtonUrl: text("cta_button_url"),
  ctaButton2Text: text("cta_button2_text"),
  ctaButton2Url: text("cta_button2_url"),
  footerText: text("footer_text"),
  customHtml: text("custom_html"),
  totalSent: integer("total_sent").notNull().default(0),
  totalDelivered: integer("total_delivered").notNull().default(0),
  totalFailed: integer("total_failed").notNull().default(0),
  totalOpened: integer("total_opened").notNull().default(0),
  totalClicked: integer("total_clicked").notNull().default(0),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shopifyEmailLogsTable = pgTable("shopify_email_logs", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  customerId: integer("customer_id"),
  email: text("email").notNull(),
  customerName: text("customer_name"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ── Campaign Message Queue ── */
export const campaignMessageQueueTable = pgTable("campaign_message_queue", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id"),
  campaignType: text("campaign_type").notNull().default("whatsapp"),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),
  phone: text("phone"),
  email: text("email"),
  message: text("message"),
  subject: text("subject"),
  status: text("status").notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  retries: integer("retries").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShopifyStoreSchema = createInsertSchema(shopifyStoresTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShopifyOrderSchema = createInsertSchema(shopifyOrdersTable).omit({ id: true, createdAt: true, updatedAt: true, syncedAt: true });
export const insertShopifyCustomerSchema = createInsertSchema(shopifyCustomersTable).omit({ id: true, createdAt: true, updatedAt: true, syncedAt: true });
export const insertShopifyProductSchema = createInsertSchema(shopifyProductsTable).omit({ id: true, createdAt: true, updatedAt: true, syncedAt: true });
export const insertShopifyCampaignSchema = createInsertSchema(shopifyCampaignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShopifyEmailCampaignSchema = createInsertSchema(shopifyEmailCampaignsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type ShopifyStore = typeof shopifyStoresTable.$inferSelect;
export type ShopifyOrder = typeof shopifyOrdersTable.$inferSelect;
export type ShopifyCustomer = typeof shopifyCustomersTable.$inferSelect;
export type ShopifyProduct = typeof shopifyProductsTable.$inferSelect;
export type ShopifyCampaign = typeof shopifyCampaignsTable.$inferSelect;
export type ShopifyEmailCampaign = typeof shopifyEmailCampaignsTable.$inferSelect;
export type CampaignMessageQueue = typeof campaignMessageQueueTable.$inferSelect;
