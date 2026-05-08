import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const waConversationsTable = pgTable("wa_conversations", {
  id: serial("id").primaryKey(),
  contactPhone: text("contact_phone").notNull().unique(),
  contactName: text("contact_name"),
  contactWaId: text("contact_wa_id"),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at"),
  unreadCount: integer("unread_count").notNull().default(0),
  botMode: text("bot_mode").notNull().default("auto"),
  status: text("status").notNull().default("open"),
  customerUserId: integer("customer_user_id"),
  assignedTo: text("assigned_to"),
  agentName: text("agent_name"),
  lastAgentAt: timestamp("last_agent_at"),
  internalNote: text("internal_note"),
  isStarred: boolean("is_starred").default(false),
  intent: text("intent"),
  tags: text("tags"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const waMessagesTable = pgTable("wa_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  waMessageId: text("wa_message_id"),
  direction: text("direction").notNull(),
  type: text("type").notNull().default("text"),
  content: text("content"),
  mediaUrl: text("media_url"),
  caption: text("caption"),
  reaction: text("reaction"),
  status: text("status").notNull().default("sent"),
  isBot: boolean("is_bot").notNull().default(false),
  templateName: text("template_name"),
  agentName: text("agent_name"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const waAgentNotesTable = pgTable("wa_agent_notes", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  phone: text("phone").notNull(),
  agentName: text("agent_name").notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const waWebhookFailuresTable = pgTable("wa_webhook_failures", {
  id: serial("id").primaryKey(),
  payload: jsonb("payload"),
  error: text("error"),
  signature: text("signature"),
  retryCount: integer("retry_count").default(0),
  resolved: boolean("resolved").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WaConversation  = typeof waConversationsTable.$inferSelect;
export type WaMessage       = typeof waMessagesTable.$inferSelect;
export type WaAgentNote     = typeof waAgentNotesTable.$inferSelect;
export type WaWebhookFail   = typeof waWebhookFailuresTable.$inferSelect;
