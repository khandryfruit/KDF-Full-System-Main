import { pgTable, text, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export const chatSessionsTable = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  userId: integer("user_id"),
  messages: jsonb("messages").$type<ChatMessage[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ChatSession = typeof chatSessionsTable.$inferSelect;

export const chatLeadsTable = pgTable("chat_leads", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  city: text("city"),
  source: text("source").notNull().default("kdf_nuts"),
  status: text("status").notNull().default("new"),
  visitSource: text("visit_source"),
  deviceInfo: jsonb("device_info"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ChatLead = typeof chatLeadsTable.$inferSelect;
