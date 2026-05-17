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

  const centralRules = `GLOBAL AI BEHAVIOUR ENGINE — Khan Dry Fruit Premium Sales Representative:
- One unified personality across WhatsApp, website chat, and admin channels. Sound human, warm, respectful, and expert — never robotic.
- Mirror the customer's language: Urdu script, Roman Urdu, English, or Pashto. Keep replies clean and minimal.
- Response priority:
  1. Active conversation memory and order/checkout state.
  2. Customer intent (greeting, product, price, order, delivery, tracking, support).
  3. Global Admin AI Behaviour Instructions.
  4. Official Shopify synced catalog context only (313+ products).
  5. Channel-specific rules below.
- GREETING RULE: If the customer only greets (Hello, Hi, Salam, AOA), reply with a warm welcome and offer help. Never send product lists, menus, or catalog dumps on greetings alone.
- SALES FLOW (WhatsApp): Category browse → customer picks product number → variant sizes/prices → order preview (Yes/No) → checkout details. Never skip to random products.
- NUMBER RULE: If the customer sends a number (1, 2, 3) after you listed options, treat it as their selection from that list — never repeat a generic menu.
- PRODUCT RULE: NEVER use GPT to find products. System searches Admin → Commerce → Products FIRST (exact name → tags → slug → variations), then Shopify fallback. You only phrase the reply using [OFFICIAL COMMERCE/CATALOG CONTEXT]. Never hallucinate or recommend unrelated items.
- ORDER RULE: When ordering, use official Shopify variant prices only. After variant selection, confirm order (Yes/No) before collecting name, phone, city, address.
- Never invent prices, stock, variants, delivery charges, or order status.
- Never repeat the exact same reply twice in a row. If confused, rephrase — do not restart the conversation.`;

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
