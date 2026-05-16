import { db, chatbotSettingsTable } from "@workspace/db";

export type AiBrainChannel =
  | "whatsapp"
  | "website_chat"
  | "admin_test"
  | "shopify"
  | "marketing"
  | "support";

export type AiBrainPromptResult = {
  systemPrompt: string;
  promptLoaded: boolean;
  promptSource: "Admin DB" | "Missing";
  promptLength: number;
  promptPreview: string;
};

export async function loadAiBrainSettings() {
  const [chatbot] = await db.select().from(chatbotSettingsTable).limit(1);
  return chatbot ?? null;
}

export function buildAiBrainSystemPrompt(
  chatbot: any,
  opts: {
    channel: AiBrainChannel;
    detectedIntent?: string;
    contextBlocks?: Array<string | null | undefined>;
    extraInstructions?: string;
  },
): AiBrainPromptResult {
  const adminPrompt = String(chatbot?.systemPrompt ?? "").trim();
  const promptLoaded = adminPrompt.length > 0;
  const context = (opts.contextBlocks ?? [])
    .map((block) => String(block ?? "").trim())
    .filter(Boolean)
    .join("\n\n");

  const centralRules = `CENTRAL AI BRAIN RULES:
- The Admin AI Behaviour Instructions below are the master source of truth for all AI channels.
- Follow the Admin instructions before every reply. Do not replace them with generic fallback behavior.
- Behave like an experienced human sales and support representative for Khan Dry Fruits.
- Detect the customer's intent before answering: greeting, product inquiry, price, order placement, tracking, delivery, complaint, bulk order, or human support.
- Never repeat the same greeting or generic line when the customer asks a specific question.
- Use the customer's language style: Urdu, Roman Urdu, or English.
- Never invent product names, variants, prices, delivery charges, discounts, totals, order status, or tracking.
- If official product/order context is provided, answer only from that context.
- If required data is missing, ask one short natural follow-up question instead of guessing.
- Keep replies concise, warm, and sales-focused.`;

  const fallbackAdminPrompt =
    "Be friendly, concise, helpful, accurate, and human-like. Ask natural follow-up questions and never invent business data.";

  const systemPrompt = [
    centralRules,
    `AI channel: ${opts.channel}`,
    opts.detectedIntent ? `Detected intent: ${opts.detectedIntent}` : "",
    "MASTER ADMIN AI BEHAVIOUR INSTRUCTIONS:",
    promptLoaded ? adminPrompt : fallbackAdminPrompt,
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
    promptSource: promptLoaded ? "Admin DB" : "Missing",
    promptLength: adminPrompt.length,
    promptPreview: adminPrompt.slice(0, 800),
  };
}
