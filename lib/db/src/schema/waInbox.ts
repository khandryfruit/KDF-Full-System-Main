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
  status: text("status").notNull().default("sent"),
  isBot: boolean("is_bot").notNull().default(false),
  templateName: text("template_name"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WaConversation = typeof waConversationsTable.$inferSelect;
export type WaMessage = typeof waMessagesTable.$inferSelect;
