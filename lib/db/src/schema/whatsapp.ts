import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const whatsappSettingsTable = pgTable("whatsapp_settings", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token"),
  phoneNumberId: text("phone_number_id"),
  businessAccountId: text("business_account_id"),
  webhookVerifyToken: text("webhook_verify_token").default("kdfnuts_webhook_token"),
  isActive: boolean("is_active").notNull().default(false),
  rateLimitDelaySeconds: integer("rate_limit_delay_seconds").notNull().default(2),
  chatButtonEnabled: boolean("chat_button_enabled").notNull().default(false),
  chatButtonPhone: text("chat_button_phone"),
  chatButtonMessage: text("chat_button_message").default("Hi! I'd like to know more about your products."),
  abandonedRecoveryEnabled: boolean("abandoned_recovery_enabled").notNull().default(false),
  abandonedRecoveryDelayMinutes: integer("abandoned_recovery_delay_minutes").notNull().default(45),
  abandonedRecoveryCouponCode: text("abandoned_recovery_coupon_code"),
  notifyOrderConfirmation: boolean("notify_order_confirmation").notNull().default(true),
  notifyOrderProcessing: boolean("notify_order_processing").notNull().default(true),
  notifyOrderShipped: boolean("notify_order_shipped").notNull().default(true),
  notifyOrderOutForDelivery: boolean("notify_order_out_for_delivery").notNull().default(true),
  notifyOrderDelivered: boolean("notify_order_delivered").notNull().default(true),
  notifyOrderCancelled: boolean("notify_order_cancelled").notNull().default(false),
  notifyRestock: boolean("notify_restock").notNull().default(true),
  notifyBiddingWinner: boolean("notify_bidding_winner").notNull().default(true),
  qrMessage: text("qr_message").default("Hello! I want to place an order 🥜"),
  qrScanCount: integer("qr_scan_count").notNull().default(0),
  qrVersion: integer("qr_version").notNull().default(1),
  qrLastScanned: timestamp("qr_last_scanned"),
  appSecret: text("app_secret"),
  apiVersion: text("api_version").default("v18.0"),
  businessPortfolioId: text("business_portfolio_id"),
  verifiedName: text("verified_name"),
  qualityRating: text("quality_rating"),
  metaStatus: text("meta_status"),
  connectedAt: timestamp("connected_at"),
  connectionMethod: text("connection_method"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const whatsappTemplatesTable = pgTable("whatsapp_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  templateId: text("template_id"),
  triggerKeyword: text("trigger_keyword"),
  messageBody: text("message_body").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  category: text("category").notNull().default("UTILITY"),
  language: text("language").notNull().default("en_US"),
  headerText: text("header_text"),
  footerText: text("footer_text"),
  paramCount: integer("param_count").notNull().default(0),
  triggerEvent: text("trigger_event"),
  metaTemplateId: text("meta_template_id"),
  approvalStatus: text("approval_status").notNull().default("draft"),
  rejectionReason: text("rejection_reason"),
  submittedToMeta: boolean("submitted_to_meta").notNull().default(false),
  metaSubmittedAt: timestamp("meta_submitted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const whatsappLogsTable = pgTable("whatsapp_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  phone: text("phone"),
  messageId: text("message_id"),
  deliveryStatus: text("delivery_status"),
  templateName: text("template_name"),
  message: text("message"),
  status: text("status").notNull().default("pending"),
  response: text("response"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatbotSettingsTable = pgTable("chatbot_settings", {
  id:                    serial("id").primaryKey(),
  isEnabled:             boolean("is_enabled").notNull().default(false),
  orderingEnabled:       boolean("ordering_enabled").notNull().default(false),
  aiModel:               text("ai_model").notNull().default("gpt-4o-mini"),
  systemPrompt:          text("system_prompt").notNull().default("You are a helpful customer support assistant for KDF NUTS, a premium dry fruits and nuts store in Pakistan. Be friendly, concise, and helpful in both English and Urdu. Answer questions about products, orders, shipping, and returns. If order context is provided at the top of this conversation, use it to give accurate, personalised answers about the customer's orders. If you don't know something specific, offer to connect them with the team."),
  fallbackMessage:       text("fallback_message").notNull().default("Thank you for your message! Our team will get back to you shortly. 🙏"),
  orderContextEnabled:   boolean("order_context_enabled").notNull().default(true),
  replyDelaySec:         integer("reply_delay_sec").notNull().default(30),
  maxDailyReplies:       integer("max_daily_replies").notNull().default(100),
  // ── Welcome Menu ──
  menuEnabled:           boolean("menu_enabled").notNull().default(false),
  menuGreetingKeywords:  text("menu_greeting_keywords").default("hi,hello,hey,salam,salaam,asslam,start,menu,help,shop,helo,hii"),
  menuItems:             jsonb("menu_items"),  // array of MenuItem objects
  greetingMessage:       text("greeting_message"),  // custom greeting text
  catalogEnabled:        boolean("catalog_enabled").notNull().default(false),
  catalogMaxProducts:    integer("catalog_max_products").notNull().default(3),
  websiteUrl:            text("website_url").default("https://kdfnuts.com"),
  discountCode:          text("discount_code").default("WELCOME10"),
  discountMessage:       text("discount_message").default("Here's your exclusive discount code! 🎁\n\n*Code:* WELCOME10\n*Save:* 10% on your next order\n\nShop now and use the code at checkout 🛒"),
  hotDealsMessage:       text("hot_deals_message").default("🔥 *Today's Hot Deals at KDF NUTS* 🥜\n\nCheck our latest offers on premium nuts and dry fruits!\n\nVisit our website to see all deals 👇"),
  updatedAt:             timestamp("updated_at").notNull().defaultNow(),
});

export const whatsappCampaignsTable = pgTable("whatsapp_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("custom"),
  messageBody: text("message_body").notNull().default(""),
  templateId: text("template_id"),
  templateParams: text("template_params"),
  headerImageUrl: text("header_image_url"),
  audience: text("audience").notNull().default("all_customers"),
  audienceFilter: text("audience_filter"),
  customPhones: text("custom_phones"),
  rateLimitDelay: integer("rate_limit_delay").notNull().default(2),
  maxDelay: integer("max_delay").notNull().default(5),
  frequencyCapHours: integer("frequency_cap_hours").notNull().default(24),
  status: text("status").notNull().default("draft"),
  recipientCount: integer("recipient_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  deliveredCount: integer("delivered_count").notNull().default(0),
  readCount: integer("read_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  // ── Phase 5: Scheduling + pause support ──
  scheduledAt: timestamp("scheduled_at"),
  pausedAt: timestamp("paused_at"),
  tags: text("tags"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Conversation state machine — tracks per-phone flow state ──
export const whatsappConversationStatesTable = pgTable("whatsapp_conversation_states", {
  id:        serial("id").primaryKey(),
  phone:     text("phone").notNull().unique(),
  state:     text("state").notNull().default("idle"),
  stateData: text("state_data"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Phase 4: Editable AI Flow Builder ──
export const waFlowsTable = pgTable("wa_flows", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull().default("keyword"),
  keywords:    jsonb("keywords").default([]),
  action:      text("action").notNull().default("ai_reply"),
  actionData:  jsonb("action_data").default({}),
  isEnabled:   boolean("is_enabled").notNull().default(true),
  priority:    integer("priority").notNull().default(0),
  firedCount:  integer("fired_count").notNull().default(0),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});

export const insertWhatsappSettingsSchema = createInsertSchema(whatsappSettingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWhatsappTemplateSchema = createInsertSchema(whatsappTemplatesTable).omit({ id: true, createdAt: true });
export const insertWhatsappLogSchema = createInsertSchema(whatsappLogsTable).omit({ id: true, createdAt: true });

export type WhatsappSettings = typeof whatsappSettingsTable.$inferSelect;
export type WhatsappTemplate = typeof whatsappTemplatesTable.$inferSelect;
export type WhatsappLog = typeof whatsappLogsTable.$inferSelect;
export type WhatsappCampaign = typeof whatsappCampaignsTable.$inferSelect;
export type WhatsappConversationState = typeof whatsappConversationStatesTable.$inferSelect;
export type WaFlow = typeof waFlowsTable.$inferSelect;
