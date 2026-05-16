/**
 * Premium WhatsApp copy for order lifecycle — Khan Dry Fruits.
 */
import {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendCtaUrlMessage,
  getSettings,
  normalizePhone,
} from "./whatsapp.js";
import { createTrackingToken } from "./deliveryWaPremium.js";
import { parseShippingAddress } from "./lahoreShipping.js";

const BRAND = "Khan Dry Fruits";
const STORE_URL = (process.env.PUBLIC_STORE_URL ?? "https://khanbabadryfruits.com").replace(/\/$/, "");
const SUPPORT =
  process.env.WHATSAPP_SUPPORT_PHONE?.trim() ||
  process.env.SUPPORT_PHONE?.trim() ||
  "0300-1234567";

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
  const n = name.trim().split(/\s+/)[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "Customer";
}

function formatMoney(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString("en-PK")}`;
}

function buildItemsList(items: unknown[], max = 6): string {
  try {
    const arr = Array.isArray(items) ? items : [];
    const lines = arr.slice(0, max).map((li: Record<string, unknown>) => {
      const title = String(li.title ?? li.name ?? "Item");
      const qty = Number(li.quantity ?? 1);
      return `• ${qty} × ${title}`;
    });
    if (arr.length > max) lines.push(`• +${arr.length - max} more item(s)`);
    return lines.join("\n");
  } catch {
    return "• As per your checkout";
  }
}

function paymentSummary(ctx: OrderWaContext): string {
  const paid = ctx.isPaid || ctx.financialStatus === "paid";
  if (paid) return "Paid online";
  const cod = ctx.codAmount ?? Number(ctx.totalPrice ?? 0);
  return `Cash on delivery (${formatMoney(cod)})`;
}

function deliveryCity(ctx: OrderWaContext): string {
  try {
    const { city } = parseShippingAddress(ctx.shippingAddress);
    return city || "Pakistan";
  } catch {
    return "Pakistan";
  }
}

function brandFooter(): string {
  return `\n—\n*${BRAND}*\n${STORE_URL}\nSupport: ${SUPPORT}`;
}

/** Meta template body parameters (clean, single-line values). */
function buildTemplateParams(trigger: string, ctx: OrderWaContext): string[] {
  const name = firstName(ctx.customerName);
  const total = formatMoney(Number(ctx.totalPrice ?? ctx.codAmount ?? 0));
  const orderNo = ctx.orderNumber;

  switch (trigger) {
    case "order_confirmation":
      return [name, orderNo, total, paymentSummary(ctx)];
    case "paid_order_message":
      return [name, orderNo, total];
    case "cancel_order":
      return [name, orderNo];
    case "order_shipped":
      return [name, orderNo, "Tracking shared separately"];
    case "order_delivered":
      return [name, orderNo];
    case "order_out_for_delivery":
      return [name, orderNo];
    case "order_processing":
      return [name, orderNo];
    case "rider_assigned":
      return [name, orderNo, ctx.rider?.name ?? "Assigned rider", ctx.etaLabel ?? "30–45 min"];
    case "shipment_return_update":
      return [name, orderNo];
    case "order_failed_delivery":
      return [name, orderNo];
    case "abandoned_cart_recovery":
      return [name, total];
    default:
      return [name, orderNo];
  }
}

async function sendPremiumText(
  phone: string,
  message: string,
  templateName: string,
  opts?: {
    cta?: { buttonText: string; url: string };
    ctx?: OrderWaContext;
    templateParams?: string[];
  },
): Promise<{ success: boolean; error?: string }> {
  const norm = normalizePhone(phone);
  const settings = await getSettings();
  if (!settings?.isActive) {
    return { success: false, error: "WhatsApp not configured" };
  }

  const { getApprovedTemplateForEvent } = await import("./waTemplateEvents.js");
  const tpl = await getApprovedTemplateForEvent(templateName);

  if (tpl) {
    const params =
      opts?.templateParams ??
      (opts?.ctx ? buildTemplateParams(templateName, opts.ctx) : []);
    const bodyParams = params.length ? params : [message.slice(0, 900)];
    while (bodyParams.length < tpl.paramCount) bodyParams.push("—");

    const tplRes = await sendWhatsAppTemplate({
      phone: norm,
      templateName: tpl.name,
      languageCode: tpl.language,
      triggerEvent: templateName,
      shopifyOrderId: opts?.ctx?.shopifyOrderId,
      components:
        tpl.paramCount > 0
          ? [
              {
                type: "body",
                parameters: bodyParams
                  .slice(0, tpl.paramCount)
                  .map((t) => ({ type: "text" as const, text: String(t).slice(0, 900) })),
              },
            ]
          : [],
    });
    if (tplRes.success) return { success: true };
  }

  if (opts?.cta) {
    const ok = await sendCtaUrlMessage({
      phone: norm,
      text: message.slice(0, 1020),
      buttonText: opts.cta.buttonText,
      url: opts.cta.url,
      settings,
      templateName,
    });
    if (ok) return { success: true };
  }

  const textOk = await sendWhatsAppMessage({ phone: norm, message, templateName });
  return { success: Boolean(textOk), error: textOk ? undefined : "Send failed" };
}

/** New order — order_confirmation */
export async function sendPremiumOrderConfirmed(ctx: OrderWaContext): Promise<{ success: boolean; error?: string }> {
  const name = firstName(ctx.customerName);
  const items = buildItemsList(ctx.lineItems);
  const total = formatMoney(Number(ctx.totalPrice ?? ctx.codAmount ?? 0));
  const city = deliveryCity(ctx);

  const msg =
    `*Order Confirmed*\n` +
    `*${BRAND}*\n\n` +
    `Assalam o Alaikum *${name}*,\n\n` +
    `Thank you for choosing *${BRAND}*. Your order has been received and is now being prepared with care.\n\n` +
    `*Order reference*\n${ctx.orderNumber}\n\n` +
    `*Your items*\n${items}\n\n` +
    `*Order total*\n${total}\n` +
    `*Payment*\n${paymentSummary(ctx)}\n` +
    `*Delivery city*\n${city}\n\n` +
    `We will notify you on WhatsApp when your order is dispatched and out for delivery.\n` +
    `For any change or question, reply to this chat — our team is here to help.` +
    brandFooter();

  return sendPremiumText(ctx.customerPhone, msg, "order_confirmation", { ctx });
}

export async function sendPremiumPaymentConfirmed(ctx: OrderWaContext): Promise<{ success: boolean; error?: string }> {
  const name = firstName(ctx.customerName);
  const total = formatMoney(Number(ctx.totalPrice ?? 0));

  const msg =
    `*Payment Received*\n` +
    `*${BRAND}*\n\n` +
    `Assalam o Alaikum *${name}*,\n\n` +
    `We have successfully received your payment.\n\n` +
    `*Order*\n${ctx.orderNumber}\n` +
    `*Amount paid*\n${total}\n\n` +
    `Your order is confirmed and will be prepared for dispatch shortly. ` +
    `You will receive further updates on this chat.` +
    brandFooter();

  return sendPremiumText(ctx.customerPhone, msg, "paid_order_message", { ctx });
}

export async function sendPremiumOrderCancelled(ctx: OrderWaContext): Promise<{ success: boolean; error?: string }> {
  const name = firstName(ctx.customerName);

  const msg =
    `*Order Cancelled*\n` +
    `*${BRAND}*\n\n` +
    `Assalam o Alaikum *${name}*,\n\n` +
    `Your order *${ctx.orderNumber}* has been cancelled as requested.\n\n` +
    `If you cancelled by mistake or would like to place a new order, ` +
    `reply here and our team will assist you promptly.` +
    brandFooter();

  return sendPremiumText(ctx.customerPhone, msg, "cancel_order", { ctx });
}

export async function sendPremiumRiderAssignedWithTracking(opts: {
  ctx: OrderWaContext;
  order: Record<string, unknown>;
  delivery: Record<string, unknown>;
  rider: Record<string, unknown> | null;
  etaMinutes?: number;
}): Promise<{ success: boolean; error?: string; trackingUrl?: string }> {
  const { ctx, rider } = opts;
  if (!ctx.deliveryId || !ctx.shopifyOrderDbId) {
    return { success: false, error: "Missing delivery id" };
  }

  const { url: trackingUrl } = await createTrackingToken(ctx.deliveryId, ctx.shopifyOrderDbId);
  const name = firstName(ctx.customerName);
  const riderName = rider?.name ? String(rider.name) : "Your delivery partner";
  const eta = ctx.etaLabel ?? "within 30–45 minutes";

  const msg =
    `*Out for Delivery*\n` +
    `*${BRAND}*\n\n` +
    `Assalam o Alaikum *${name}*,\n\n` +
    `Your order *${ctx.orderNumber}* has been assigned to our delivery team.\n\n` +
    `*Rider*\n${riderName}\n` +
    `*Estimated arrival*\n${eta}\n` +
    `*Payment*\n${paymentSummary(ctx)}\n\n` +
    `Track your order in real time using the link below.` +
    brandFooter();

  const res = await sendPremiumText(ctx.customerPhone, msg, "rider_assigned", {
    ctx: { ...ctx, rider: { name: riderName, phone: rider?.phone as string }, etaLabel: eta, trackingUrl },
    cta: { buttonText: "Track order", url: trackingUrl },
  });

  const settings = await getSettings();
  if (settings && rider?.phone) {
    await sendWhatsAppMessage({
      phone: normalizePhone(ctx.customerPhone),
      message: `*Rider contact*\n${String(rider.phone)}\n\nPlease call only for delivery-related queries.`,
      templateName: "rider_contact",
    }).catch(() => {});
  }

  return { ...res, trackingUrl };
}

const STATUS_BUILDERS: Record<string, (ctx: OrderWaContext) => string> = {
  picked: (ctx) => {
    const n = firstName(ctx.customerName);
    return (
      `*Order Update — Packed*\n*${BRAND}*\n\n` +
      `Dear *${n}*, your order *${ctx.orderNumber}* has been packed and handed to our delivery team.\n` +
      (ctx.trackingUrl ? `\nTrack: ${ctx.trackingUrl}\n` : "\n") +
      `*Payment:* ${paymentSummary(ctx)}`
    );
  },
  out_for_delivery: (ctx) => {
    const n = firstName(ctx.customerName);
    const rider = ctx.rider?.name ?? "our rider";
    return (
      `*Out for Delivery*\n*${BRAND}*\n\n` +
      `Dear *${n}*, your order *${ctx.orderNumber}* is on the way.\n\n` +
      `*Rider:* ${rider}\n` +
      (ctx.etaLabel ? `*ETA:* ${ctx.etaLabel}\n` : "") +
      (ctx.trackingUrl ? `*Track:* ${ctx.trackingUrl}\n` : "") +
      `\nPlease keep your phone available for a smooth handover.\n` +
      `*Payment:* ${paymentSummary(ctx)}`
    );
  },
  near_customer: (ctx) => {
    const n = firstName(ctx.customerName);
    return (
      `*Rider Nearby*\n*${BRAND}*\n\n` +
      `Dear *${n}*, our rider is approaching your location for order *${ctx.orderNumber}*.\n` +
      `Please be available to receive your package.\n` +
      `*Payment:* ${paymentSummary(ctx)}`
    );
  },
  delivered: (ctx) => {
    const n = firstName(ctx.customerName);
    return (
      `*Delivered Successfully*\n*${BRAND}*\n\n` +
      `Dear *${n}*, your order *${ctx.orderNumber}* has been delivered.\n\n` +
      `Thank you for trusting us with your order. ` +
      `We would love to serve you again — visit ${STORE_URL} anytime.`
    );
  },
  delayed: (ctx) => {
    const n = firstName(ctx.customerName);
    return (
      `*Delivery Update*\n*${BRAND}*\n\n` +
      `Dear *${n}*, order *${ctx.orderNumber}* is experiencing a short delay due to high order volume.\n` +
      `We are prioritising your delivery and will update you shortly. Thank you for your patience.`
    );
  },
  failed: (ctx) => {
    const n = firstName(ctx.customerName);
    return (
      `*Delivery Attempt Unsuccessful*\n*${BRAND}*\n\n` +
      `Dear *${n}*, we were unable to complete delivery for order *${ctx.orderNumber}* today.\n` +
      `Our team will contact you to arrange the next attempt. Reply here if you need immediate assistance.`
    );
  },
  returned: (ctx) => {
    const n = firstName(ctx.customerName);
    return (
      `*Return / Refund Update*\n*${BRAND}*\n\n` +
      `Dear *${n}*, we have recorded a return update for order *${ctx.orderNumber}*.\n` +
      `Our support team will follow up regarding refund or redelivery. Reply to this chat for help.`
    );
  },
};

export async function sendPremiumDeliveryStatus(
  status: string,
  ctx: OrderWaContext,
): Promise<{ success: boolean; error?: string }> {
  const builder = STATUS_BUILDERS[status] ?? STATUS_BUILDERS.picked;
  const templateMap: Record<string, string> = {
    picked: "order_processing",
    out_for_delivery: "order_out_for_delivery",
    near_customer: "order_out_for_delivery",
    delivered: "order_delivered",
    delayed: "order_processing",
    failed: "order_failed_delivery",
    returned: "shipment_return_update",
  };
  const trigger = templateMap[status] ?? "order_processing";
  const msg = builder(ctx) + brandFooter();
  const cta =
    ctx.trackingUrl && status !== "delivered"
      ? { buttonText: "Track order", url: ctx.trackingUrl }
      : undefined;
  return sendPremiumText(ctx.customerPhone, msg, trigger, { ctx, cta });
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
