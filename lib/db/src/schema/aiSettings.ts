import { pgTable, serial, text, varchar, boolean, timestamp } from "drizzle-orm/pg-core";

export const aiSettingsTable = pgTable("ai_settings", {
  id:           serial("id").primaryKey(),
  openaiApiKey: text("openai_api_key").notNull().default(""),
  openaiOrgId:  text("openai_org_id").notNull().default(""),
  aiEnabled:    boolean("ai_enabled").notNull().default(false),
  systemPrompt: text("system_prompt").notNull().default(
    "You are an expert eCommerce content writer for KDF NUTS, a premium dry fruits and nuts store in Pakistan. Write high-converting, SEO-optimized content in a friendly yet professional tone."
  ),
  tone:         varchar("tone", { length: 50 }).notNull().default("professional"),
  language:     varchar("language", { length: 20 }).notNull().default("english"),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});
