/**
 * Premium human-like WhatsApp messages for order lifecycle (Khan Dry Fruits).
 */
import {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendCtaUrlMessage,
  sendInteractiveButtons,
  getApprovedTemplate,
  getSettings,
  normalizePhone,
} from "./whatsapp.js";
import { buildInvoiceSnapshot, createTrackingToken, getTrackingPublicBase } from "./deliveryWaPremium.js";
import { logger } from "./logger.js";

const BRAND = "Khan Dry Fruits";
const SUPPORT = "0300-1234567";

export type OrderWaContext = {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  lineItems: unknown[];
  totalPrice: string | number | null;
  financialStatus?: string | null;
  shippingAddress?: unknown;
  codAmount?: number;
  isPaid?: boolean;
  shopifyOrderId?: string;
  shopifyOrderDbId?: number;
  deliveryId?: number;
  rider?: { name?: string; phone?: string } | null;
  trackingUrl?: string;
  etaLabel?: string;
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Customer";
}

function formatMoney(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString("en-PK")}`;
}

function buildItemsList(items: unknown[], max = 8): string {
  try {
    const arr = Array.isArray(items) ? items : [];
    return arr
      .slice(0, max)
      .map((li: Record<string, unknown>) => {
        const title = String(li.title ?? li.name ?? "Item");
        const qty = Number(li.quantity ?? 1);
        const price = Number(li.price ?? 0);
        const line = price > 0 ? ` — ${formatMoney(price * qty)}` : "";
        return `• ${qty}× ${title}${line}`;
      })
      .join("\n");
  } catch {
    return "• See your order summary online";
  }
}

function paymentLine(ctx: OrderWaContext): string {
  const paid = ctx.isPaid || ctx.financialStatus === "paid";
  if (paid) return "💳 *Payment:* Paid online ✅";
  const cod = ctx.codAmount ?? Number(ctx.totalPrice ?? 0);
  return `💵 *Payment:* Cash on delivery — ${formatMoney(cod)}`;
}

async function sendPremiumText(
  phone: string,
  message: string,
  templateName: string,
  cta?: { buttonText: string; url: string },
): Promise<{ success: boolean; error?: string }> {
  const norm = normalizePhone(phone);
  const settings = await getSettings();
  if (!settings?.isActive) {
    return { success: false, error: "WhatsApp not configured" };
  }

  const tpl = await getApprovedTemplate(templateName);
  if (tpl && tpl.paramCount >= 1) {
    const parts = message.split("\n").filter(Boolean).slice(0, tpl.paramCount);
    while (parts.length < tpl.paramCount) parts.push("—");
    const tplRes = await sendWhatsAppTemplate({
      phone: norm,
      templateName: tpl.name,
      languageCode: tpl.language,
      components: [
        {
          type: "body",
          parameters: parts.slice(0, tpl.paramCount).map((t) => ({ type: "text" as const, text: t.slice(0, 900) })),
        },
      ],
    });
    if (tplRes.success) return { success: true };
  }

  if (cta) {
    const ok = await sendCtaUrlMessage({
      phone: norm,
      text: message.slice(0, 1020),
      buttonText: cta.buttonText,
      url: cta.url,
      settings,
      templateName,
    });
    if (ok) return { success: true };
  }

  const textOk = await sendWhatsAppMessage({ phone: norm, message, templateName });
  return { success: Boolean(textOk), error: textOk ? undefined : "Send failed" };
}

/** Order placed — premium confirmation (all cities including Lahore). */
export async function sendPremiumOrderConfirmed(ctx: OrderWaContext): Promise<{ success: boolean; error?: string }> {
  const name = firstName(ctx.customerName);
  const items = buildItemsList(ctx.lineItems);
  const total = formatMoney(Number(ctx.totalPrice ?? ctx.codAmount ?? 0));
  const msg =
    `✅ *Order Confirmed — ${BRAND}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `Assalam o Alaikum *${name}*,\n\n` +
    `Thank you for shopping with ${BRAND} 💚\n\n` +
    `Your order *${ctx.orderNumber}* has been confirmed successfully.\n\n` +
    `*🧾 Order summary*\n` +
    `${items || "• Items as per checkout"}\n\n` +
    `💰 *Total:* *${total}*\n` +
    `${paymentLine(ctx)}\n\n` +
    `🚚 We will update you at every step of your delivery.\n\n` +
    `📞 Support: ${SUPPORT}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `_Premium dry fruits & nuts — delivered with care_`;

  return sendPremiumText(ctx.customerPhone, msg, "order_confirmed");
}

export async function sendPremiumPaymentConfirmed(ctx: OrderWaContext): Promise<{ success: boolean; error?: string }> {
  const name = firstName(ctx.customerName);
  const msg =
    `✅ *Payment Received — ${BRAND}*\n\n` +
    `Assalam o Alaikum *${name}*,\n\n` +
    `We have received your payment for order *${ctx.orderNumber}*.\n\n` +
    `💰 *Amount:* ${formatMoney(Number(ctx.totalPrice ?? 0))}\n\n` +
    `Your order is now being prepared for dispatch. Thank you! 💚`;

  return sendPremiumText(ctx.customerPhone, msg, "payment_confirmed");
}

export async function sendPremiumOrderCancelled(ctx: OrderWaContext): Promise<{ success: boolean; error?: string }> {
  const name = firstName(ctx.customerName);
  const msg =
    `❌ *Order Cancelled — ${BRAND}*\n\n` +
    `Assalam o Alaikum *${name}*,\n\n` +
    `Your order *${ctx.orderNumber}* has been cancelled as requested.\n\n` +
    `If this was a mistake, reply here or call ${SUPPORT} and we will help you immediately.`;

  return sendPremiumText(ctx.customerPhone, msg, "order_cancelled");
}

export async function sendPremiumRiderAssignedWithTracking(opts: {
  ctx: OrderWaContext;
  order: Record<string, unknown>;
  delivery: Record<string, unknown>;
  rider: Record<string, unknown> | null;
  etaMinutes?: number;
}): Promise<{ success: boolean; error?: string; trackingUrl?: string }> {
  const { ctx, order, delivery, rider } = opts;
  if (!ctx.deliveryId || !ctx.shopifyOrderDbId) {
    return { success: false, error: "Missing delivery id" };
  }

  const { url: trackingUrl } = await createTrackingToken(ctx.deliveryId, ctx.shopifyOrderDbId);
  const invoice = buildInvoiceSnapshot(order, delivery);
  const name = firstName(ctx.customerName);
  const riderName = rider?.name ? String(rider.name) : "your delivery rider";
  const eta = ctx.etaLabel ?? "30–45 minutes";

  const msg =
    `🛵 *Rider Assigned — ${BRAND}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `Assalam o Alaikum *${name}*,\n\n` +
    `Great news! Your order *${ctx.orderNumber}* is out for Lahore delivery.\n\n` +
    `👤 *Rider:* ${riderName}\n` +
    `⏱️ *ETA:* ${eta}\n` +
    `${paymentLine(ctx)}\n\n` +
    `📍 *Live tracking:*\n${trackingUrl}\n\n` +
    `📞 Support: ${SUPPORT}\n` +
    `━━━━━━━━━━━━━━━━━━━`;

  const res = await sendPremiumText(ctx.customerPhone, msg, "rider_assigned", {
    buttonText: "Track Live 📍",
    url: trackingUrl,
  });

  const settings = await getSettings();
  if (settings && rider?.phone) {
    await sendWhatsAppMessage({
      phone: normalizePhone(ctx.customerPhone),
      message: `📞 Rider contact: ${rider.phone}`,
      templateName: "rider_contact",
    }).catch(() => {});
  }

  return { ...res, trackingUrl };
}

const STATUS_BUILDERS: Record<string, (ctx: OrderWaContext) => string> = {
  picked: (ctx) => {
    const n = firstName(ctx.customerName);
    return (
      `📦 *Order Picked Up — ${BRAND}*\n\n` +
      `Assalam o Alaikum *${n}*,\n\n` +
      `Your order *${ctx.orderNumber}* has been picked up and is on the way to you.\n\n` +
      (ctx.trackingUrl ? `📍 Track: ${ctx.trackingUrl}\n\n` : "") +
      `${paymentLine(ctx)}`
    );
  },
  out_for_delivery: (ctx) => {
    const n = firstName(ctx.customerName);
    const rider = ctx.rider?.name ?? "our rider";
    return (
      `🚚 *Out for Delivery — ${BRAND}*\n\n` +
      `Assalam o Alaikum *${n}*,\n\n` +
      `Your order *${ctx.orderNumber}* is on the way! 🛵\n\n` +
      `👤 *Rider:* ${rider}\n` +
      (ctx.etaLabel ? `⏱️ *ETA:* ${ctx.etaLabel}\n` : "") +
      (ctx.trackingUrl ? `\n📍 *Live track:* ${ctx.trackingUrl}\n` : "") +
      `\nPlease keep your phone reachable.\n${paymentLine(ctx)}`
    );
  },
  near_customer: (ctx) => {
    const n = firstName(ctx.customerName);
    return (
      `📍 *Rider is Near You — ${BRAND}*\n\n` +
      `Assalam o Alaikum *${n}*,\n\n` +
      `Your rider is almost at your location for order *${ctx.orderNumber}*.\n\n` +
      `Please be available. ${paymentLine(ctx)}`
    );
  },
  delivered: (ctx) => {
    const n = firstName(ctx.customerName);
    return (
      `✅ *Delivered — ${BRAND}*\n\n` +
      `Assalam o Alaikum *${n}*,\n\n` +
      `Your order *${ctx.orderNumber}* has been delivered successfully.\n\n` +
      `Thank you for choosing ${BRAND} 🌰💚\nWe hope to serve you again soon!`
    );
  },
  delayed: (ctx) => {
    const n = firstName(ctx.customerName);
    return (
      `⏳ *Delivery Update — ${BRAND}*\n\n` +
      `Assalam o Alaikum *${n}*,\n\n` +
      `Your order *${ctx.orderNumber}* is slightly delayed due to high demand.\n\n` +
      `We are prioritizing your delivery. Sorry for the inconvenience.\n📞 ${SUPPORT}`
    );
  },
  failed: (ctx) => {
    const n = firstName(ctx.customerName);
    return (
      `⚠️ *Delivery Attempt — ${BRAND}*\n\n` +
      `Assalam o Alaikum *${n}*,\n\n` +
      `We could not complete delivery for order *${ctx.orderNumber}* today.\n\n` +
      `Our team will contact you shortly. 📞 ${SUPPORT}`
    );
  },
  returned: (ctx) => {
    const n = firstName(ctx.customerName);
    return (
      `↩️ *Return Update — ${BRAND}*\n\n` +
      `Hi *${n}*, order *${ctx.orderNumber}* has been marked as returned.\n\n` +
      `For refunds or redelivery, contact us: ${SUPPORT}`
    );
  },
};

export async function sendPremiumDeliveryStatus(
  status: string,
  ctx: OrderWaContext,
): Promise<{ success: boolean; error?: string }> {
  const builder = STATUS_BUILDERS[status] ?? STATUS_BUILDERS.picked;
  const templateMap: Record<string, string> = {
    picked: "status_picked",
    out_for_delivery: "status_out_for_delivery",
    near_customer: "status_near",
    delivered: "status_delivered",
    delayed: "status_delayed",
    failed: "status_failed",
    returned: "status_returned",
  };
  const msg = builder(ctx);
  const cta =
    ctx.trackingUrl && status !== "delivered"
      ? { buttonText: "Track Order", url: ctx.trackingUrl }
      : undefined;
  return sendPremiumText(ctx.customerPhone, msg, templateMap[status] ?? "status_update", cta);
}

export async function resolveTrackingUrlForDelivery(
  deliveryId: number,
  shopifyOrderDbId: number,
): Promise<string> {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute(sql`
      SELECT tracking_url FROM delivery_wa_notifications
      WHERE delivery_id = ${deliveryId} AND tracking_url IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `);
    const url = (rows.rows[0] as { tracking_url?: string })?.tracking_url;
    if (url) return url;
    const { url: newUrl } = await createTrackingToken(deliveryId, shopifyOrderDbId);
    return newUrl;
  } catch {
    const { url } = await createTrackingToken(deliveryId, shopifyOrderDbId);
    return url;
  }
}
