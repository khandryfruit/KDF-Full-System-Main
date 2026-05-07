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
