import { pgTable, text, serial, integer, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const socialSettingsTable = pgTable("social_settings", {
  id: serial("id").primaryKey(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  igEnabled: boolean("ig_enabled").notNull().default(true),
  fbEnabled: boolean("fb_enabled").notNull().default(true),
  pageAccessToken: text("page_access_token"),
  igBusinessAccountId: text("ig_business_account_id"),
  fbPageId: text("fb_page_id"),
  webhookVerifyToken: text("webhook_verify_token").default("kdfnuts_social_token"),
  aiModel: text("ai_model").notNull().default("gpt-4o-mini"),
  systemPrompt: text("system_prompt").notNull().default(
    "You are an AI Customer Support & Sales Assistant for KDF NUTS, a premium nuts and dry fruits brand in Pakistan. Reply like a friendly, knowledgeable human — never robotic. Keep replies short and clear. Use the customer's name if available. Mix English and Urdu naturally (Roman Urdu is fine). Always try to convert the conversation into a sale. For product queries give name, price and benefits. For order intent, ask for name, address, phone. For comments, reply briefly and push them to DM. Never argue, never spam links."
  ),
  commentReplyEnabled: boolean("comment_reply_enabled").notNull().default(true),
  dmReplyEnabled: boolean("dm_reply_enabled").notNull().default(true),
  autoFollowUpDm: boolean("auto_follow_up_dm").notNull().default(true),
  replyDelaySec: integer("reply_delay_sec").notNull().default(10),
  maxDailyReplies: integer("max_daily_replies").notNull().default(200),
  connectionMethod: text("connection_method"),
  fbPageName: text("fb_page_name"),
  igUsername: text("ig_username"),
  connectedAt: timestamp("connected_at"),
  tokenExpiresAt: timestamp("token_expires_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const socialLogsTable = pgTable("social_logs", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  type: text("type").notNull(),
  senderId: text("sender_id"),
  senderName: text("sender_name"),
  messageId: text("message_id"),
  postId: text("post_id"),
  commentId: text("comment_id"),
  incomingText: text("incoming_text"),
  aiReply: text("ai_reply"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const socialLeadsTable = pgTable("social_leads", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name"),
  phone: text("phone"),
  interest: text("interest"),
  messageCount: integer("message_count").notNull().default(1),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  isConverted: boolean("is_converted").notNull().default(false),
  notes: text("notes"),
});

export const insertSocialSettingsSchema = createInsertSchema(socialSettingsTable).omit({ id: true, updatedAt: true });
export const insertSocialLogSchema = createInsertSchema(socialLogsTable).omit({ id: true, createdAt: true });

export type SocialSettings = typeof socialSettingsTable.$inferSelect;
export type SocialLog = typeof socialLogsTable.$inferSelect;
export type SocialLead = typeof socialLeadsTable.$inferSelect;
