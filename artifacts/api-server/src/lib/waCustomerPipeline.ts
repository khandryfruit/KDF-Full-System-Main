/**
 * Unified WhatsApp customer message pipeline.
 * Priority: Greeting → Product DB → Business rules → GPT-4o mini → Fallback
 */
import { db, aiSettingsTable, chatbotSettingsTable } from "@workspace/db";
import { resolveOpenAIClient } from "./resolveOpenAI.js";
import { classifyWaMessage, shouldBlockProductCatalog, type ClassifiedMessage } from "./waIntentClassifier.js";
import { isProductEducationMessage, isBareProductMention } from "./waSalesConversation.js";
import { isPureGreetingMessage, productRootsInMessage } from "./waProductBrain.js";
import { isGreetingLikeMessage } from "./waIntentSwitch.js";

export type WaPipelineStep =
  | "greeting"
  | "product_db"
  | "rules"
  | "gpt"
  | "fallback"
  | "skipped";

/** AI Command Center (ai_settings) OR legacy chatbot toggle — both must work in production. */
export async function isWaAutoReplyEnabled(): Promise<boolean> {
  const [chatbot] = await db.select().from(chatbotSettingsTable).limit(1).catch(() => []);
  if (chatbot?.isEnabled) return true;
  const [ai] = await db.select().from(aiSettingsTable).limit(1).catch(() => []);
  if (!ai?.aiEnabled) return false;
  try {
    await resolveOpenAIClient();
    return true;
  } catch {
    return false;
  }
}

export async function resolveWaAiModel(): Promise<string> {
  const [chatbot] = await db
    .select({ aiModel: chatbotSettingsTable.aiModel })
    .from(chatbotSettingsTable)
    .limit(1)
    .catch(() => []);
  return String(chatbot?.aiModel ?? "gpt-4o-mini");
}

/** Questions that need natural GPT — never product catalog or generic clarification. */
export function shouldDeferToOpenAI(text: string, classified?: ClassifiedMessage): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  if (isProductEducationMessage(t)) return true;
  if (classified?.topic === "product_education") return true;
  if (classified?.intent === "conversation") return true;
  if (classified?.intent === "general" && classified.blockProductCatalog) return true;
  if (/\b(faide|fayde|benefit|protein|weight gain|weight loss|best hai|behtar|recommend|suggest|kya best|kis liye|health|healthy|nutrition)\b/i.test(t)) {
    return !/\b(order|buy|price|rate|qeemat|kitna|dikhao|bhejo|lena|mangwana)\b/i.test(t.toLowerCase());
  }
  return false;
}

/** True when message is a direct product lookup (badam, pista, بادام) — DB first. */
export function shouldPrioritizeProductDatabase(text: string, classified?: ClassifiedMessage): boolean {
  if (isPureGreetingMessage(text) || isGreetingLikeMessage(text)) return false;
  if (shouldDeferToOpenAI(text, classified)) return false;
  if (classified?.intent === "greeting") return false;
  if (isBareProductMention(text)) return true;
  const roots = productRootsInMessage(text);
  if (roots.length > 0 && text.length <= 40) {
    const lower = text.toLowerCase();
    if (/\b(chahiye|chahye|price|rate|qeemat|kitna|order|buy|dikhao)\b/i.test(lower)) return true;
    if (text.split(/\s+/).length <= 3) return true;
  }
  return false;
}
