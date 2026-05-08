import { db, whatsappSettingsTable, whatsappLogsTable, whatsappTemplatesTable, whatsappConversationStatesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

const WA_API_VERSION = "v18.0";
const WA_BASE = `https://graph.facebook.com/${WA_API_VERSION}`;

export interface WASendOptions {
  phone: string;
  message: string;
  templateName?: string;
  userId?: number;
}

export async function getSettings() {
  const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
  return settings ?? null;
}

async function log(opts: { userId?: number; phone: string; templateName?: string; message: string; status: string; response?: string; messageId?: string }) {
  await db.insert(whatsappLogsTable).values({
    userId: opts.userId ?? null,
    phone: opts.phone,
    templateName: opts.templateName ?? null,
    message: opts.message,
    status: opts.status,
    response: opts.response ?? null,
    messageId: opts.messageId ?? null,
    deliveryStatus: opts.status === "sent" ? "sent" : null,
  } as any).catch(() => {});
}

/* ─── Normalize phone to international format ─────────── */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return "92" + digits.slice(1);
  return "92" + digits;
}

/* ─── Sanitize template param value for Meta ───────────── */
function sanitizeParam(v: string): string {
  return v.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
}

/* ─── Build Meta body components from param values ──────── */
function buildBodyComponents(paramValues: string[]): object[] {
  if (!paramValues.length) return [];
  return [{ type: "body", parameters: paramValues.map(v => ({ type: "text", text: sanitizeParam(v) })) }];
}

/* ─── Get approved template for a trigger event ─────────── */
async function getApprovedTemplate(triggerEvent: string) {
  const [tpl] = await db.select().from(whatsappTemplatesTable)
    .where(eq(whatsappTemplatesTable.triggerEvent, triggerEvent))
    .limit(1);
  if (!tpl) return null;
  if (tpl.approvalStatus === "approved" && tpl.submittedToMeta) return tpl;
  return null;
}

/* ─── Send free-form text message ─────────────────────── */
export async function sendWhatsAppMessage(opts: WASendOptions): Promise<boolean> {
  try {
    const settings = await getSettings();
    if (!settings?.isActive || !settings.accessToken || !settings.phoneNumberId) return false;

    const normalizedPhone = normalizePhone(opts.phone);
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedPhone,
      type: "text",
      text: { preview_url: false, body: opts.message },
    };

    const res = await fetch(`${WA_BASE}/${settings.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
      body: JSON.stringify(body),
    });

    const data = await res.json() as any;
    const messageId = data?.messages?.[0]?.id as string | undefined;
    if (res.ok && messageId) {
      await log({ ...opts, status: "sent", response: JSON.stringify(data), messageId });
      return true;
    } else {
      logger.warn({ data }, "WhatsApp message failed");
      await log({ ...opts, status: "failed", response: JSON.stringify(data) });
      return false;
    }
  } catch (err) {
    logger.error(err, "WhatsApp send error");
    await log({ ...opts, status: "failed", response: String(err) });
    return false;
  }
}

/* ─── Send Meta template message ──────────────────────── */
export async function sendWhatsAppTemplate(opts: {
  phone: string;
  templateName: string;
  languageCode?: string;
  components?: unknown[];
  userId?: number;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const settings = await getSettings();
    if (!settings?.isActive || !settings.accessToken || !settings.phoneNumberId) {
      return { success: false, error: "WhatsApp not configured or inactive" };
    }
    const normalizedPhone = normalizePhone(opts.phone);

    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedPhone,
      type: "template",
      template: {
        name: opts.templateName,
        language: { code: opts.languageCode ?? "en_US" },
        components: opts.components ?? [],
      },
    };

    const res = await fetch(`${WA_BASE}/${settings.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    const messageId = data?.messages?.[0]?.id as string | undefined;

    if (res.ok && messageId) {
      await log({ phone: opts.phone, templateName: opts.templateName, message: `[template] ${opts.templateName}`, status: "sent", response: JSON.stringify(data), messageId, userId: opts.userId });
      return { success: true, messageId };
    } else {
      const errMsg = data?.error?.message ?? `HTTP ${res.status}`;
      logger.warn({ data }, "WhatsApp template message failed");
      await log({ phone: opts.phone, templateName: opts.templateName, message: `[template] ${opts.templateName}`, status: "failed", response: JSON.stringify(data) });
      return { success: false, error: errMsg };
    }
  } catch (err) {
    logger.error(err, "WhatsApp template send error");
    return { success: false, error: String(err) };
  }
}

/* ─── Send Interactive List Menu ──────────────────────── */
export async function sendInteractiveMenu(opts: {
  phone: string;
  greeting: string;
  settings: Awaited<ReturnType<typeof getSettings>>;
}): Promise<boolean> {
  try {
    const { settings } = opts;
    if (!settings?.isActive || !settings.accessToken || !settings.phoneNumberId) return false;
    const normalizedPhone = normalizePhone(opts.phone);

    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedPhone,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "KDF NUTS 🥜" },
        body: { text: opts.greeting },
        footer: { text: "Reply anytime — we're here to help 💚" },
        action: {
          button: "View Options",
          sections: [
            {
              title: "🛒 Shopping",
              rows: [
                { id: "shop_products",  title: "Shop Products",    description: "Browse premium nuts & dry fruits" },
                { id: "hot_deals",      title: "🔥 Hot Deals",     description: "Today's special offers" },
                { id: "get_discount",   title: "🎁 Get Discount",  description: "Get an exclusive coupon code" },
              ],
            },
            {
              title: "📦 Orders & Support",
              rows: [
                { id: "track_order",   title: "📦 Track Order",   description: "Check your order status" },
                { id: "talk_support",  title: "💬 Talk to Support", description: "Chat with our team" },
                { id: "visit_website", title: "🌐 Visit Website",  description: "Shop online anytime" },
              ],
            },
          ],
        },
      },
    };

    const res = await fetch(`${WA_BASE}/${settings.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    const messageId = data?.messages?.[0]?.id as string | undefined;

    await log({ phone: opts.phone, templateName: "menu_sent", message: "[Interactive menu]", status: res.ok && messageId ? "sent" : "failed", response: JSON.stringify(data), messageId });
    return !!(res.ok && messageId);
  } catch (err) {
    logger.error(err, "sendInteractiveMenu error");
    return false;
  }
}

/* ─── Send Interactive Reply Buttons (up to 3) ──────────── */
export async function sendInteractiveButtons(opts: {
  phone: string;
  text: string;
  buttons: Array<{ id: string; title: string }>;
  footer?: string;
  settings: Awaited<ReturnType<typeof getSettings>>;
  templateName?: string;
}): Promise<boolean> {
  try {
    const { settings } = opts;
    if (!settings?.isActive || !settings.accessToken || !settings.phoneNumberId) return false;
    const normalizedPhone = normalizePhone(opts.phone);

    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedPhone,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: opts.text },
        ...(opts.footer ? { footer: { text: opts.footer } } : {}),
        action: {
          buttons: opts.buttons.slice(0, 3).map(b => ({
            type: "reply",
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    };

    const res = await fetch(`${WA_BASE}/${settings.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    const messageId = data?.messages?.[0]?.id as string | undefined;

    await log({ phone: opts.phone, templateName: opts.templateName ?? "interactive_buttons", message: opts.text.slice(0, 200), status: res.ok && messageId ? "sent" : "failed", response: JSON.stringify(data), messageId });
    if (!res.ok) logger.warn({ data }, "sendInteractiveButtons failed");
    return !!(res.ok && messageId);
  } catch (err) {
    logger.error(err, "sendInteractiveButtons error");
    return false;
  }
}

/* ─── Send CTA URL button ─────────────────────────────── */
export async function sendCtaUrlMessage(opts: {
  phone: string;
  text: string;
  buttonText: string;
  url: string;
  settings: Awaited<ReturnType<typeof getSettings>>;
  templateName?: string;
}): Promise<boolean> {
  try {
    const { settings } = opts;
    if (!settings?.isActive || !settings.accessToken || !settings.phoneNumberId) return false;
    const normalizedPhone = normalizePhone(opts.phone);

    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedPhone,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: opts.text },
        action: {
          name: "cta_url",
          parameters: { display_text: opts.buttonText.slice(0, 20), url: opts.url },
        },
      },
    };

    const res = await fetch(`${WA_BASE}/${settings.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    const messageId = data?.messages?.[0]?.id as string | undefined;

    await log({ phone: opts.phone, templateName: opts.templateName ?? "cta_url", message: opts.text.slice(0, 200), status: res.ok && messageId ? "sent" : "failed", response: JSON.stringify(data), messageId });
    return !!(res.ok && messageId);
  } catch (err) {
    logger.error(err, "sendCtaUrlMessage error");
    return false;
  }
}

/* ─── Conversation State Machine ──────────────────────── */
export async function getConversationState(phone: string) {
  const [row] = await db.select().from(whatsappConversationStatesTable)
    .where(eq(whatsappConversationStatesTable.phone, phone)).limit(1);
  return row ?? null;
}

export async function setConversationState(phone: string, state: string, stateData?: Record<string, unknown>) {
  const existing = await getConversationState(phone);
  const values = {
    phone,
    state,
    stateData: stateData ? JSON.stringify(stateData) : null,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(whatsappConversationStatesTable)
      .set(values).where(eq(whatsappConversationStatesTable.phone, phone));
  } else {
    await db.insert(whatsappConversationStatesTable).values(values).catch(() => {});
  }
}

/* ─── Greeting keyword detector ──────────────────────── */
export function isGreeting(text: string, keywords?: string | null): boolean {
  const kws = (keywords ?? "hi,hello,hey,salam,salaam,asslam,start,menu,help,shop,helo,hii,assalamu,kia,hy")
    .split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
  const normalized = text.trim().toLowerCase().replace(/[^\w\s]/g, "").trim();
  return kws.some(k => normalized === k || normalized.startsWith(k + " ") || normalized.endsWith(" " + k));
}

/* ─── Order Confirmation ──────────────────────────────── */
export async function sendOrderConfirmation(opts: {
  phone: string;
  userId?: number;
  orderNumber: string;
  total: string;
  customerName?: string;
  address?: string;
  items?: Array<{ name: string; qty: number }>;
}): Promise<{ success: boolean; error?: string }> {
  const settings = await getSettings();

  if (!settings) return { success: false, error: "WhatsApp not configured — add settings in the WhatsApp → Settings tab" };
  if (!settings.isActive) return { success: false, error: "WhatsApp is disabled — enable it in the WhatsApp → Settings tab" };
  if (!settings.accessToken) return { success: false, error: "No access token — set it in the WhatsApp → Settings tab" };
  if (!settings.phoneNumberId) return { success: false, error: "No phone number ID — set it in the WhatsApp → Settings tab" };

  if (settings.notifyOrderConfirmation === false) {
    return { success: false, error: "Order confirmation notifications are turned off in Automations" };
  }

  const name    = opts.customerName ?? "Valued Customer";
  const address = opts.address ?? "Pakistan";

  const tpl = await getApprovedTemplate("order_confirmation");
  if (tpl) {
    const allParams = [name, opts.orderNumber, `Rs. ${opts.total}`, address];
    const params = allParams.slice(0, tpl.paramCount);
    const result = await sendWhatsAppTemplate({
      phone: opts.phone,
      templateName: tpl.name,
      languageCode: tpl.language,
      components: buildBodyComponents(params),
      userId: opts.userId,
    });
    return result;
  }

  const itemsLine = opts.items?.length
    ? "\n\nItems:\n" + opts.items.slice(0, 5).map((i) => `• ${i.qty}x ${i.name}`).join("\n")
    : "";

  const message =
    `Hello ${name} 👋\n` +
    `Thank you for your order with *KDF NUTS* 🥜\n\n` +
    `🧾 *Order ID:* ${opts.orderNumber}\n` +
    `💰 *Total:* Rs. ${opts.total}\n` +
    `📍 *Address:* ${address}` +
    itemsLine +
    `\n\nYour order has been received and is being processed.\nWe'll notify you once it ships 🚚\n\nThank you for shopping with us ❤️`;

  const ok = await sendWhatsAppMessage({ phone: opts.phone, message, templateName: "order_confirmation", userId: opts.userId });
  if (ok) return { success: true };
  return { success: false, error: "Meta API rejected the message — check access token and phone number ID" };
}

/* ─── Order Status Update ─────────────────────────────── */
export async function sendOrderStatusUpdate(opts: {
  phone: string;
  userId?: number;
  orderNumber: string;
  status: string;
  trackingId?: string;
}) {
  const settings = await getSettings();
  const toggleMap: Record<string, keyof typeof settings> = {
    processing:       "notifyOrderProcessing",
    shipped:          "notifyOrderShipped",
    out_for_delivery: "notifyOrderOutForDelivery",
    delivered:        "notifyOrderDelivered",
    cancelled:        "notifyOrderCancelled",
  };
  const toggleKey = toggleMap[opts.status];
  if (settings && toggleKey && (settings as any)[toggleKey] === false) return false;

  const triggerEvent = `order_${opts.status}`;
  const tpl = await getApprovedTemplate(triggerEvent);
  if (tpl) {
    const allParams = [opts.orderNumber, opts.trackingId ?? ""].filter(Boolean);
    const params = allParams.slice(0, tpl.paramCount);
    const result = await sendWhatsAppTemplate({
      phone: opts.phone,
      templateName: tpl.name,
      languageCode: tpl.language,
      components: buildBodyComponents(params),
      userId: opts.userId,
    });
    return result.success;
  }

  const STATUS_MSGS: Record<string, string> = {
    processing:       `📦 Your order *#${opts.orderNumber}* has been packed and is ready for dispatch.`,
    shipped:          `🚚 Your order *#${opts.orderNumber}* has been shipped!${opts.trackingId ? `\nTracking: *${opts.trackingId}*` : ""}\nExpect delivery in 2-3 days.`,
    out_for_delivery: `🛵 Your order *#${opts.orderNumber}* is *out for delivery* today. Please be available!`,
    delivered:        `✅ Your order *#${opts.orderNumber}* has been *delivered*!\n\nEnjoy your KDF NUTS products 🥜\nThank you for shopping with us ❤️`,
    cancelled:        `❌ Your order *#${opts.orderNumber}* has been *cancelled*.\n\nContact us if you have any questions.`,
  };

  const message = STATUS_MSGS[opts.status];
  if (!message) return false;

  return sendWhatsAppMessage({ phone: opts.phone, message, templateName: triggerEvent, userId: opts.userId });
}

/* ─── Failed Delivery Notification ───────────────────── */
export async function sendFailedDeliveryNotification(opts: {
  phone: string;
  userId?: number;
  orderNumber: string;
  customerName?: string;
}): Promise<boolean> {
  const settings = await getSettings();
  if (!settings?.isActive || !settings.accessToken || !settings.phoneNumberId) return false;
  if ((settings as any).notifyOrderFailedDelivery === false) return false;

  const name = opts.customerName ?? "Valued Customer";
  const tpl = await getApprovedTemplate("order_failed_delivery");
  if (tpl) {
    const result = await sendWhatsAppTemplate({
      phone: opts.phone,
      templateName: tpl.name,
      languageCode: tpl.language,
      components: buildBodyComponents([name, opts.orderNumber].slice(0, tpl.paramCount)),
      userId: opts.userId,
    });
    return result.success;
  }

  const message =
    `⚠️ Hi ${name}, we tried to deliver your order *#${opts.orderNumber}* but couldn't reach you.\n\n` +
    `📦 Please reply with your preferred delivery time or call us so we can redeliver.\n\n` +
    `We'll try again soon! Thank you for your patience 🙏`;

  return sendWhatsAppMessage({ phone: opts.phone, message, templateName: "order_failed_delivery", userId: opts.userId });
}

/* ─── Return/Refund Notification ─────────────────────── */
export async function sendReturnRefundNotification(opts: {
  phone: string;
  userId?: number;
  orderNumber: string;
  customerName?: string;
  type: "return" | "refund" | "exchange";
  amount?: string;
}): Promise<boolean> {
  const settings = await getSettings();
  if (!settings?.isActive || !settings.accessToken || !settings.phoneNumberId) return false;
  if (opts.type === "refund" && (settings as any).notifyOrderRefund === false) return false;
  if ((opts.type === "return" || opts.type === "exchange") && (settings as any).notifyOrderReturn === false) return false;

  const name = opts.customerName ?? "Valued Customer";
  const triggerEvent = `order_${opts.type}`;
  const tpl = await getApprovedTemplate(triggerEvent);
  if (tpl) {
    const params = [name, opts.orderNumber, opts.amount ?? ""].filter(Boolean).slice(0, tpl.paramCount);
    const result = await sendWhatsAppTemplate({
      phone: opts.phone,
      templateName: tpl.name,
      languageCode: tpl.language,
      components: buildBodyComponents(params),
      userId: opts.userId,
    });
    return result.success;
  }

  const msgs: Record<string, string> = {
    return:   `🔄 Hi ${name}, your return request for order *#${opts.orderNumber}* has been received.\n\nOur team will arrange a pickup within 1-2 business days. Thank you!`,
    refund:   `💰 Hi ${name}, your refund of *Rs. ${opts.amount ?? ""}* for order *#${opts.orderNumber}* has been processed.\n\nIt will reflect in your account within 3-5 business days. Thank you for your patience!`,
    exchange: `🔁 Hi ${name}, your exchange request for order *#${opts.orderNumber}* has been accepted.\n\nYour replacement order will be dispatched within 1-2 business days. Thank you!`,
  };

  const message = msgs[opts.type] ?? msgs["return"]!;
  return sendWhatsAppMessage({ phone: opts.phone, message, templateName: triggerEvent, userId: opts.userId });
}

/* ─── Post-delivery Review Request ───────────────────── */
export async function sendReviewRequest(opts: {
  phone: string;
  userId?: number;
  orderNumber: string;
  customerName?: string;
  couponCode?: string;
}): Promise<boolean> {
  const settings = await getSettings();
  if (!settings?.isActive || !settings.accessToken || !settings.phoneNumberId) return false;
  if ((settings as any).notifyReviewRequest === false) return false;
  /* Fall back to reviewCouponCode from WA settings if rule config doesn't provide one */
  const effectiveCoupon = opts.couponCode || (settings as any).reviewCouponCode || undefined;

  const name = opts.customerName ?? "Valued Customer";
  const tpl = await getApprovedTemplate("review_request");
  if (tpl) {
    const params = [name, opts.orderNumber, effectiveCoupon ?? ""].filter(Boolean).slice(0, tpl.paramCount);
    const result = await sendWhatsAppTemplate({
      phone: opts.phone,
      templateName: tpl.name,
      languageCode: tpl.language,
      components: buildBodyComponents(params),
      userId: opts.userId,
    });
    return result.success;
  }

  const couponLine = effectiveCoupon
    ? `\n\n🎁 As a thank-you, here's a *10% discount code* for your next order: *${effectiveCoupon}*`
    : "";

  const message =
    `⭐ Hi ${name}! We hope you're enjoying your KDF NUTS order *#${opts.orderNumber}*!\n\n` +
    `Your feedback means the world to us. Could you share a quick review?` +
    couponLine +
    `\n\nThank you for choosing KDF NUTS 🥜❤️`;

  return sendWhatsAppMessage({ phone: opts.phone, message, templateName: "review_request", userId: opts.userId });
}

/* ─── Rider Assignment Notification ──────────────────── */
export async function sendRiderAssignedNotification(opts: {
  phone: string;
  userId?: number;
  orderNumber: string;
  customerName?: string;
  riderName?: string;
  riderPhone?: string;
}): Promise<boolean> {
  const settings = await getSettings();
  if (!settings?.isActive || !settings.accessToken || !settings.phoneNumberId) return false;

  const name = opts.customerName ?? "Valued Customer";
  const tpl = await getApprovedTemplate("rider_assigned");
  if (tpl) {
    const params = [name, opts.orderNumber, opts.riderName ?? "our rider"].slice(0, tpl.paramCount);
    const result = await sendWhatsAppTemplate({
      phone: opts.phone,
      templateName: tpl.name,
      languageCode: tpl.language,
      components: buildBodyComponents(params),
      userId: opts.userId,
    });
    return result.success;
  }

  const riderLine = opts.riderName ? `\n🧑 *Rider:* ${opts.riderName}` : "";
  const phoneLine = opts.riderPhone ? `\n📞 *Rider Contact:* ${opts.riderPhone}` : "";

  const message =
    `🛵 Hi ${name}! Your order *#${opts.orderNumber}* is out for delivery!` +
    riderLine + phoneLine +
    `\n\nPlease be available to receive your order. Thank you! 🥜`;

  return sendWhatsAppMessage({ phone: opts.phone, message, templateName: "rider_assigned", userId: opts.userId });
}

export async function getChatButtonConfig() {
  try {
    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    if (!settings?.chatButtonEnabled || !settings.chatButtonPhone) return null;
    return {
      phone: settings.chatButtonPhone,
      message: settings.chatButtonMessage ?? "Hi! I'd like to know more about your products.",
    };
  } catch {
    return null;
  }
}
