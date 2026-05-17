import { db, chatbotSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { KDF_WHATSAPP_SALES_MASTER_PROMPT, KDF_WHATSAPP_PROMPT_VERSION } from "./kdfWhatsappSalesPrompt.js";

const PROMPT_VERSION_MARKER = `KDF_PROMPT_V${KDF_WHATSAPP_PROMPT_VERSION}`;

/** Ensure WhatsApp chatbot row exists with sales prompt + catalog-first enabled */
export async function ensureChatbotDefaults(): Promise<void> {
  const [existing] = await db.select().from(chatbotSettingsTable).limit(1).catch(() => []);
  if (!existing) {
    await db.insert(chatbotSettingsTable).values({
      isEnabled: true,
      orderingEnabled: true,
      menuEnabled: false,
      aiModel: "gpt-4o-mini",
      systemPrompt: `${KDF_WHATSAPP_SALES_MASTER_PROMPT}\n\n${PROMPT_VERSION_MARKER}`,
      greetingMessage: null,
      fallbackMessage: "جی 😊 ایک لمحہ — catalog سے check کر رہا ہوں۔",
      maxDailyReplies: 500,
      replyDelaySec: 0,
      orderContextEnabled: true,
    } as any).catch(() => {});
    return;
  }

  const updates: Record<string, unknown> = {};
  const currentPrompt = String(existing.systemPrompt ?? "");
  if (!currentPrompt.trim() || !currentPrompt.includes(PROMPT_VERSION_MARKER)) {
    updates.systemPrompt = `${KDF_WHATSAPP_SALES_MASTER_PROMPT}\n\n${PROMPT_VERSION_MARKER}`;
  }
  if (existing.isEnabled == null) updates.isEnabled = true;
  if (existing.orderingEnabled == null) updates.orderingEnabled = true;

  if (Object.keys(updates).length) {
    await db
      .update(chatbotSettingsTable)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(chatbotSettingsTable.id, existing.id))
      .catch(() => {});
  }
}
