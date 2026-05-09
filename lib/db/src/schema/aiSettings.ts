import { pgTable, serial, text, varchar, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

export const aiSettingsTable = pgTable("ai_settings", {
  id:           serial("id").primaryKey(),
  openaiApiKey: text("openai_api_key").notNull().default(""),
  openaiOrgId:  text("openai_org_id").notNull().default(""),
  aiEnabled:    boolean("ai_enabled").notNull().default(false),
  systemPrompt: text("system_prompt").notNull().default(
    "You are an expert eCommerce sales and content expert for KDF NUTS, a premium dry fruits and nuts brand in Pakistan. You talk like a real human — warm, confident, and persuasive. You never sound robotic. You understand both English and Urdu naturally."
  ),
  tone:         varchar("tone", { length: 50 }).notNull().default("professional"),
  language:     varchar("language", { length: 20 }).notNull().default("english"),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),

  /* ── Multi-Provider ── */
  primaryProvider:   varchar("primary_provider", { length: 30 }).notNull().default("openai"),
  fallbackProvider:  varchar("fallback_provider", { length: 30 }).notNull().default(""),
  geminiApiKey:      text("gemini_api_key").notNull().default(""),
  deepseekApiKey:    text("deepseek_api_key").notNull().default(""),
  claudeApiKey:      text("claude_api_key").notNull().default(""),

  /* ── Task Routing ── */
  taskRouting: jsonb("task_routing").notNull().default({
    chat:       "openai",
    content:    "openai",
    seo:        "openai",
    image:      "gemini",
    whatsapp:   "openai",
  }),

  /* ── AI Personality ── */
  personality:       varchar("personality", { length: 50 }).notNull().default("professional"),
  creativityLevel:   integer("creativity_level").notNull().default(70),
  responseLength:    varchar("response_length", { length: 20 }).notNull().default("medium"),
  salesAggressiveness: integer("sales_aggressiveness").notNull().default(60),
  humanLikeLevel:    integer("human_like_level").notNull().default(80),

  /* ── Image Generation ── */
  imageProvider:     varchar("image_provider", { length: 30 }).notNull().default("openai"),
  imageStyle:        varchar("image_style", { length: 50 }).notNull().default("premium-ecommerce"),
  autoGenerateImages: boolean("auto_generate_images").notNull().default(false),
  imageQuality:      varchar("image_quality", { length: 20 }).notNull().default("standard"),
  brandColors:       text("brand_colors").notNull().default("#5FA800,#F58300"),
});
