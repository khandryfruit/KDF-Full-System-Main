/**
 * Canonical Meta template trigger events + aliases for approved templates in DB.
 */
import {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  getSettings,
  normalizePhone,
} from "./whatsapp.js";
import { logger } from "./logger.js";

/** Primary trigger_event → alternate keys stored in DB or legacy code */
export const TEMPLATE_TRIGGER_ALIASES: Record<string, string[]> = {
  order_confirmation: ["order_confirmation", "order_confirmed"],
  paid_order_message: ["paid_order_message", "payment_confirmed"],
  order_shipped: ["order_shipped"],
  order_processing: ["order_processing", "status_picked"],
  order_out_for_delivery: ["order_out_for_delivery", "status_out_for_delivery", "status_near"],
  order_delivered: ["order_delivered", "status_delivered"],
  cancel_order: ["cancel_order", "order_cancelled"],
  shipment_return_update: ["shipment_return_update", "order_return", "status_returned"],
  abandoned_cart_recovery: ["abandoned_cart_recovery"],
  rider_assigned: ["rider_assigned", "premium_rider_assigned"],
  order_failed_delivery: ["order_failed_delivery", "status_failed"],
};

export type ApprovedTemplate = {
  id: number;
  name: string;
  language: string;
  paramCount: number;
  triggerEvent: string | null;
};

export async function getApprovedTemplateForEvent(
  triggerEvent: string,
): Promise<ApprovedTemplate | null> {
  const { getSyncedApprovedTemplate } = await import("./metaTemplateSync.js");
  const tpl = await getSyncedApprovedTemplate(triggerEvent);
  if (!tpl) return null;
  return {
    id: tpl.id,
    name: tpl.name,
    language: tpl.language,
    paramCount: tpl.paramCount,
    triggerEvent: tpl.triggerEvent,
  };
}

function sanitizeParam(v: string): string {
  return v.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
}

/** Send approved Meta template or fall back to free-text. */
export async function sendLifecycleWhatsApp(opts: {
  triggerEvent: string;
  phone: string;
  bodyParams?: string[];
  fallbackText: string;
  userId?: number;
  shopifyOrderId?: string;
}): Promise<{ success: boolean; error?: string; messageId?: string; usedTemplate?: boolean }> {
  const settings = await getSettings();
  if (!settings?.isActive) {
    return { success: false, error: "WhatsApp inactive" };
  }

  const phone = normalizePhone(opts.phone);
  const tpl = await getApprovedTemplateForEvent(opts.triggerEvent);

  if (tpl && tpl.paramCount >= 0) {
    const parts = (opts.bodyParams ?? []).map((p) => sanitizeParam(p));
    while (parts.length < tpl.paramCount) parts.push("—");
    const result = await sendWhatsAppTemplate({
      phone,
      templateName: tpl.name,
      languageCode: tpl.language,
      components:
        tpl.paramCount > 0
          ? [
              {
                type: "body",
                parameters: parts
                  .slice(0, tpl.paramCount)
                  .map((t) => ({ type: "text" as const, text: t.slice(0, 900) })),
              },
            ]
          : [],
      userId: opts.userId,
    });
    if (result.success) {
      return { success: true, messageId: result.messageId, usedTemplate: true };
    }
    logger.warn({ triggerEvent: opts.triggerEvent, error: result.error }, "Template send failed, using fallback text");
  }

  const ok = await sendWhatsAppMessage({
    phone,
    message: opts.fallbackText,
    templateName: opts.triggerEvent,
    userId: opts.userId,
  });
  return { success: ok, usedTemplate: false, error: ok ? undefined : "Fallback text send failed" };
}

/** Dedupe: skip if same trigger + order sent in last N hours */
export async function wasLifecycleMessageSentRecently(
  triggerEvent: string,
  shopifyOrderId: string,
  hours = 4,
): Promise<boolean> {
  const { sql } = await import("drizzle-orm");
  const { db: database } = await import("@workspace/db");
  const keys = TEMPLATE_TRIGGER_ALIASES[triggerEvent] ?? [triggerEvent];
  for (const key of keys) {
    const rows = await database.execute(sql`
      SELECT id FROM whatsapp_logs
      WHERE status IN ('sent', 'pending')
        AND created_at > NOW() - (${hours} || ' hours')::interval
        AND (
          (shopify_order_id = ${shopifyOrderId} AND (trigger_event = ${key} OR template_name = ${key}))
          OR (template_name = ${key} AND message LIKE ${"%" + shopifyOrderId + "%"})
        )
      LIMIT 1
    `).catch(() => ({ rows: [] }));
    if (rows.rows.length > 0) return true;
  }
  return false;
}
