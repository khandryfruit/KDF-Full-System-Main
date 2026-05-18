import OpenAI from "openai";
import { db, aiSettingsTable, chatbotSettingsTable } from "@workspace/db";

export type ResolveOpenAIResult = {
  client: OpenAI;
  /** True when `OPENAI_API_KEY` was used because the database key is empty */
  keyFromEnv: boolean;
};

/**
 * OpenAI client for server routes (widget chat, WhatsApp AI, vision, etc.).
 *
 * Key resolution order: `ai_settings.openai_api_key` → `process.env.OPENAI_API_KEY`
 *
 * Enable gate:
 * - `ai_settings.ai_enabled === true`, OR
 * - No `ai_settings` row yet but `OPENAI_API_KEY` is set (bootstrap / first deploy), OR
 * - DB key empty, `OPENAI_API_KEY` set, and `ai_enabled` is true (Railway env-only pattern)
 *
 * If `ai_enabled` is explicitly false in DB, requests are rejected even when env has a key
 * (admins must re-enable AI in Admin → AI Content).
 */
export async function resolveOpenAIClient(): Promise<ResolveOpenAIResult> {
  const [s] = await db.select().from(aiSettingsTable).limit(1);
  const [chatbot] = await db.select().from(chatbotSettingsTable).limit(1).catch(() => []);
  const whatsappChatbotOn = chatbot?.isEnabled === true;

  const dbKey = (s?.openaiApiKey ?? "").trim();
  const envKey = (process.env.OPENAI_API_KEY ?? "").trim();
  const apiKey = dbKey || envKey;
  const keyFromEnv = !dbKey && !!envKey;

  if (!apiKey) {
    throw Object.assign(
      new Error(
        "OpenAI API key is missing. Add it in Admin → AI Content, or set OPENAI_API_KEY on the API server."
      ),
      { status: 503, code: "OPENAI_NO_KEY" }
    );
  }

  const noRow = s === undefined;
  const aiContentOn = s?.aiEnabled === true;
  const explicitlyDisabled = s !== undefined && s.aiEnabled === false;
  /**
   * Allow OpenAI when:
   * - AI Content enabled, OR
   * - fresh DB + env key, OR
   * - WhatsApp chatbot enabled + key (common Railway: key in env, AI Content toggle forgotten)
   */
  const aiAllowed =
    (noRow && !!envKey) || aiContentOn || (whatsappChatbotOn && !!apiKey);

  if (explicitlyDisabled && !whatsappChatbotOn) {
    throw Object.assign(
      new Error("AI is turned off in Admin → AI Content. Enable AI and save, then try again."),
      { status: 503, code: "AI_DISABLED" }
    );
  }

  if (!aiAllowed) {
    throw Object.assign(
      new Error(
        "AI is not enabled. Open Admin → AI Content (enable AI) OR WhatsApp chatbot settings (enable bot), and set OPENAI_API_KEY.",
      ),
      { status: 503, code: "AI_NOT_CONFIGURED" }
    );
  }

  const org = (s?.openaiOrgId ?? "").trim();
  const client = new OpenAI({
    apiKey,
    organization: org || undefined,
  });

  return { client, keyFromEnv };
}
