import { db, socialLeadsTable, socialSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const ORDER_SOCIAL_MESSAGES: Record<string, string> = {
  confirmed:  "✅ آپ کا آرڈر confirm ہو گیا!\n\nOrder #{number} process ہو رہا ہے۔ جلد pack کر کے send کریں گے! 😊\n\n— KDF NUTS Team 💚",
  shipped:    "🚚 آپ کا آرڈر ship ہو گیا!\n\nOrder #{number} on the way ہے۔ جلد پہنچے گا! Track کریں:\n\n— KDF NUTS Team 💚",
  delivered:  "✅ آرڈر Deliver ہو گیا!\n\nOrder #{number} آپ تک پہنچ گیا۔ Enjoy کریں! 🎉\n\nReview ضرور دیں 🙏 — KDF NUTS",
  cancelled:  "❌ آرڈر Cancel ہو گیا\n\nOrder #{number} cancel ہو گیا۔ کوئی مسئلہ ہو تو inbox میں message کریں! 💚\n\n— KDF NUTS Team",
};

export async function sendSocialOrderMessage(opts: {
  phone: string;
  orderNumber: string;
  status: string;
  customerName?: string;
}): Promise<void> {
  try {
    const { phone, orderNumber, status, customerName } = opts;
    const template = ORDER_SOCIAL_MESSAGES[status];
    if (!template) return;

    const normalised = phone.replace(/\s|-/g, "");
    const leads = await db.select({
      platform: socialLeadsTable.platform,
      senderId:  socialLeadsTable.senderId,
    })
      .from(socialLeadsTable)
      .where(eq(socialLeadsTable.phone, normalised))
      .limit(1);

    if (leads.length === 0) return;
    const [lead] = leads;

    const [settings] = await db.select({
      pageAccessToken: socialSettingsTable.pageAccessToken,
      fbPageId:        socialSettingsTable.fbPageId,
      isEnabled:       socialSettingsTable.isEnabled,
    }).from(socialSettingsTable).limit(1);

    if (!settings?.isEnabled || !settings.pageAccessToken) return;

    const greeting = customerName ? `${customerName}! 👋\n\n` : "";
    const message  = greeting + template.replace("{number}", orderNumber);

    const META_GRAPH_BASE = "https://graph.facebook.com/v22.0";
    if (lead.platform === "facebook" && settings.fbPageId) {
      await fetch(`${META_GRAPH_BASE}/${settings.fbPageId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient:      { id: lead.senderId },
          message:        { text: message },
          messaging_type: "MESSAGE_TAG",
          tag:            "POST_PURCHASE_UPDATE",
          access_token:   settings.pageAccessToken,
        }),
      });
    } else if (lead.platform === "instagram") {
      await fetch(`${META_GRAPH_BASE}/me/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.pageAccessToken}` },
        body: JSON.stringify({
          recipient: { id: lead.senderId },
          message:   { text: message },
        }),
      });
    }

    logger.info({ phone, orderNumber, status, platform: lead.platform }, "Social order message sent");
  } catch (err) {
    logger.warn({ err }, "sendSocialOrderMessage failed (non-critical)");
  }
}
