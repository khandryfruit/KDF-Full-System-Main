import { db, aiSettingsTable, chatbotSettingsTable } from "@workspace/db";
import { KDF_WHATSAPP_SALES_MASTER_PROMPT } from "./kdfWhatsappSalesPrompt.js";

export type AiBrainChannel =
  | "whatsapp"
  | "website_chat"
  | "admin_test"
  | "shopify"
  | "marketing"
  | "support"
  | "catalog"
  | "order_flow"
  | "template"
  | "follow_up"
  | "recommendations";

export type AiBrainPromptResult = {
  systemPrompt: string;
  promptLoaded: boolean;
  promptSource: "Global AI Settings" | "Chatbot Settings" | "Global + Channel Settings" | "Missing";
  promptLength: number;
  promptPreview: string;
  promptVersion: string;
};

export async function loadAiBrainSettings() {
  const [[chatbot], [globalAi]] = await Promise.all([
    db.select().from(chatbotSettingsTable).limit(1),
    db.select().from(aiSettingsTable).limit(1),
  ]);
  return { chatbot: chatbot ?? null, globalAi: globalAi ?? null };
}

export function buildAiBrainSystemPrompt(
  chatbot: any,
  opts: {
    channel: AiBrainChannel;
    detectedIntent?: string;
    contextBlocks?: Array<string | null | undefined>;
    extraInstructions?: string;
    globalAiSettings?: any;
    memorySummary?: string | null;
  },
): AiBrainPromptResult {
  const globalPrompt = String(opts.globalAiSettings?.systemPrompt ?? "").trim();
  const channelPrompt = String(chatbot?.systemPrompt ?? "").trim();
  const promptLoaded = globalPrompt.length > 0 || channelPrompt.length > 0;
  const context = (opts.contextBlocks ?? [])
    .map((block) => String(block ?? "").trim())
    .filter(Boolean)
    .join("\n\n");

  const centralRules = `GLOBAL AI BEHAVIOUR ENGINE — KDF MART Master Prompt V5 (Hybrid):
- Human sales rep for KDF MART / Khan Dry Fruits — NEVER robotic. TEXT first; system adds context buttons below.
- Do NOT duplicate button menus in text. Greeting: welcome only, no catalog. Mixed "Hello badam chahiye": greet + product intent.
- Buttons by context: Greeting→Order+Support | Product→Price+Benefits+Buy | Payment→Payment | Support→Call+Website
- Remember context; never restart. Max 2–4 products. Official prices/stock only. Real ecommerce orders. No fake discounts.
- DELIVERY: Answer Rs.300 Lahore / Rs.300–500 other cities in natural text; ask which city. No menus.
- ADDRESS: Shop address in text; map/location CTA only when relevant. No extra menus.
- PAYMENT: Payment options ONLY when customer asks about payment — not on greeting.
- PRICE: Answer and guide in text first; product card (image/price/variants) only after — not before.
- EDUCATION: Full benefits/quality answer in text — no catalog dump.
- DISCOUNTS: NEVER invent, offer, or negotiate — official only.
- ORDER: Checkout buttons only when customer is ready to buy. Never guess prices/stock/reviews.`;

  const fallbackAdminPrompt =
    opts.channel === "whatsapp"
      ? KDF_WHATSAPP_SALES_MASTER_PROMPT
      : "Be friendly, concise, helpful, accurate, and human-like. Ask natural follow-up questions and never invent business data.";

  const promptSource: AiBrainPromptResult["promptSource"] =
    globalPrompt && channelPrompt ? "Global + Channel Settings"
      : globalPrompt ? "Global AI Settings"
      : channelPrompt ? "Chatbot Settings"
      : "Missing";
  const promptVersionParts = [
    opts.globalAiSettings?.updatedAt ? `global:${new Date(opts.globalAiSettings.updatedAt).toISOString()}` : null,
    chatbot?.updatedAt ? `channel:${new Date(chatbot.updatedAt).toISOString()}` : null,
  ].filter(Boolean);
  const promptVersion = promptVersionParts.join("|") || "missing";

  const systemPrompt = [
    centralRules,
    `AI channel: ${opts.channel}`,
    opts.detectedIntent ? `Detected intent: ${opts.detectedIntent}` : "",
    "MASTER GLOBAL ADMIN AI BEHAVIOUR INSTRUCTIONS:",
    globalPrompt || fallbackAdminPrompt,
    channelPrompt ? `CHANNEL PROMPT / OVERRIDES:\n${channelPrompt}` : "",
    opts.memorySummary ? `PERSISTENT MEMORY:\n${opts.memorySummary}` : "",
    opts.extraInstructions ? `CHANNEL-SPECIFIC INSTRUCTIONS:\n${opts.extraInstructions}` : "",
    context ? `OFFICIAL CONTEXT:\n${context}` : "",
    `Today's date: ${new Date().toLocaleDateString("en-PK", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`,
  ].filter(Boolean).join("\n\n");

  return {
    systemPrompt,
    promptLoaded,
    promptSource,
    promptLength: (globalPrompt + channelPrompt).length,
    promptPreview: (globalPrompt || channelPrompt || fallbackAdminPrompt).slice(0, 800),
    promptVersion,
  };
}
