import { db, aiSettingsTable, chatbotSettingsTable } from "@workspace/db";

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

  const centralRules = `GLOBAL AI BEHAVIOUR ENGINE:
- The Global AI Settings prompt is the master source of truth for all AI channels: WhatsApp, website chat, Shopify/catalog, orders, templates, marketing, support, follow-ups, and recommendations.
- Channel-specific prompts may add context, but they must never override global business rules, product rules, price rules, discount rules, tone, or safety rules.
- Follow this response priority strictly:
  1. Existing customer/order/cart memory and active flow state.
  2. Customer message intent.
  3. Global Admin AI Behaviour Instructions.
  4. Official Shopify/live catalog/order/template context supplied below.
  5. Business rules and channel-specific instructions.
  6. Generate one natural human response.
- Behave like an experienced human sales and support representative for Khan Dry Fruits.
- Detect the customer's intent before answering: greeting, product inquiry, price, order placement, tracking, delivery, complaint, bulk order, or human support.
- Never repeat the same greeting or generic line when the customer asks a specific question.
- Use the customer's language style: Urdu, Roman Urdu, or English.
- Never invent product names, variants, prices, delivery charges, discounts, totals, order status, or tracking.
- If official product/order context is provided, answer only from that context.
- If required data is missing, ask one short natural follow-up question instead of guessing.
- Preserve conversation memory: selected product, variant, quantity, customer name, phone, address, city, cart, order stage, and previous question.
- If AI fails and a fallback is needed, keep the same customer intent and active order stage instead of restarting the conversation.
- Keep replies concise, warm, premium, and sales-focused. Never sound robotic.`;

  const fallbackAdminPrompt =
    "Be friendly, concise, helpful, accurate, and human-like. Ask natural follow-up questions and never invent business data.";

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
