import { db, chatbotSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { KDF_WHATSAPP_SALES_MASTER_PROMPT } from "./kdfWhatsappSalesPrompt.js";

/** Ensure WhatsApp chatbot row exists with sales prompt + catalog-first enabled */
export async function ensureChatbotDefaults(): Promise<void> {
  const [existing] = await db.select().from(chatbotSettingsTable).limit(1).catch(() => []);
  if (!existing) {
    await db.insert(chatbotSettingsTable).values({
      isEnabled: true,
      orderingEnabled: true,
      menuEnabled: false,
      aiModel: "gpt-4o-mini",
      systemPrompt: KDF_WHATSAPP_SALES_MASTER_PROMPT,
      greetingMessage: null,
      fallbackMessage: "جی 😊 ایک لمحہ — catalog سے check کر رہا ہوں۔",
      maxDailyReplies: 500,
      replyDelaySec: 0,
      orderContextEnabled: true,
    } as any).catch(() => {});
    return;
  }

  const updates: Record<string, unknown> = {};
  if (!String(existing.systemPrompt ?? "").trim()) {
    updates.systemPrompt = KDF_WHATSAPP_SALES_MASTER_PROMPT;
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
