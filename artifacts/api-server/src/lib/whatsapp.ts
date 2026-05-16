import { db, whatsappSettingsTable, whatsappLogsTable, whatsappTemplatesTable, whatsappConversationStatesTable } from "@workspace/db";
import { desc, eq, or, sql } from "drizzle-orm";
import { logger } from "./logger";
import { normalizePhone } from "./waPhone";
import { classifyWaFailure } from "./waFailureClassifier.js";
import { createAdminAlert } from "./adminAlerts.js";
import {
  DEFAULT_MENU_ITEMS,
  filterMenuItems,
  getMenuConfig,
  type WaMenuItem,
} from "./waMenuDefaults.js";
export { normalizePhone } from "./waPhone";
export type { WaMenuItem } from "./waMenuDefaults.js";
export { DEFAULT_MENU_ITEMS, KHAN_BRAND_NAME, KHAN_WEBSITE_URL } from "./waMenuDefaults.js";

const DEFAULT_WA_API_VERSION = "v22.0";

function graphBase(apiVersion?: string | null): string {
  const version = (apiVersion || DEFAULT_WA_API_VERSION).trim().replace(/^\/+/, "");
  return `https://graph.facebook.com/${version || DEFAULT_WA_API_VERSION}`;
}

export interface WASendOptions {
  phone: string;
  message: string;
  templateName?: string;
  userId?: number;
  triggerEvent?: string;
  shopifyOrderId?: string;
}

export async function getSettings() {
  const [settings] = await db
    .select()
    .from(whatsappSettingsTable)
    .orderBy(desc(whatsappSettingsTable.isActive), desc(whatsappSettingsTable.updatedAt), desc(whatsappSettingsTable.id))
    .limit(1);
  return settings ?? null;
}

/** Lazy import avoids circular init with waInboxPersist at bundle load time. */
function mirrorOutboundToInbox(opts: {
  phone: string;
  content: string;
  waMessageId?: string | null;
  isBot?: boolean;
  type?: string;
  templateName?: string;
  status?: string;
}) {
  void import("./waInboxPersist.js").then(({ persistWaOutboundMessage }) => persistWaOutboundMessage(opts)).catch(() => {});
}

async function log(opts: {
  userId?: number;
  phone: string;
  templateName?: string;
  triggerEvent?: string;
  shopifyOrderId?: string;
  message: string;
  status: string;
  response?: string;
  messageId?: string;
  failureReason?: string;
}) {
  const trigger = opts.triggerEvent ?? opts.templateName ?? null;
  await db.execute(sql`
    INSERT INTO whatsapp_logs (
      user_id, phone, template_name, trigger_event, shopify_order_id,
      message, status, response, message_id, delivery_status, failure_reason
    ) VALUES (
      ${opts.userId ?? null},
      ${opts.phone},
      ${opts.templateName ?? null},
      ${trigger},
      ${opts.shopifyOrderId ?? null},
      ${opts.message},
      ${opts.status},
      ${opts.response ?? null},
      ${opts.messageId ?? null},
      ${opts.status === "sent" ? "sent" : null},
      ${opts.failureReason ?? null}
    )
  `).catch(() => {
    db.insert(whatsappLogsTable).values({
      userId: opts.userId ?? null,
      phone: opts.phone,
      templateName: opts.templateName ?? null,
      message: opts.message,
      status: opts.status,
      response: opts.response ?? null,
      messageId: opts.messageId ?? null,
      deliveryStatus: opts.status === "sent" ? "sent" : null,
    } as any).catch(() => {});
  });
}

function alertCriticalFailure(classified: ReturnType<typeof classifyWaFailure>, context: string) {
  if (classified.severity !== "disconnected") return;
  void createAdminAlert({
    title: `WhatsApp failed: ${classified.title}`,
    message: `Context: ${context}\nReason: ${classified.detail}\nAction: ${classified.actionRequired}`,
    type: "wa_health",
    dedupeMinutes: 30,
  });
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

/* ─── Get approved template for a trigger event (DB + Meta sync, name or trigger) ─────────── */
export async function getApprovedTemplate(triggerEvent: string) {
  const { getSyncedApprovedTemplate } = await import("./metaTemplateSync.js");
  return getSyncedApprovedTemplate(triggerEvent);
}

/* ─── Send free-form text message ─────────────────────── */
export async function sendWhatsAppMessage(opts: WASendOptions): Promise<boolean> {
  try {
    const settings = await getSettings();
    if (!settings?.isActive || !settings.accessToken || !settings.phoneNumberId) {
      const classified = classifyWaFailure("WhatsApp not configured or inactive");
      await log({ ...opts, status: "failed", failureReason: classified.detail });
      alertCriticalFailure(classified, opts.templateName ?? "free_text_send");
      return false;
    }

    const normalizedPhone = normalizePhone(opts.phone);
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedPhone,
      type: "text",
      text: { preview_url: false, body: opts.message },
    };

    const res = await fetch(`${graphBase(settings.apiVersion)}/${settings.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
      body: JSON.stringify(body),
    });

    const data = await res.json() as any;
    const messageId = data?.messages?.[0]?.id as string | undefined;
    if (res.ok && messageId) {
      await log({ ...opts, status: "sent", response: JSON.stringify(data), messageId });
      mirrorOutboundToInbox({
        phone: opts.phone,
        content: opts.message,
        waMessageId: messageId,
        isBot: !opts.userId,
        templateName: opts.templateName,
        status: "sent",
      });
      return true;
    } else {
      logger.warn({ data }, "WhatsApp message failed");
      const classified = classifyWaFailure(data);
      await log({ ...opts, status: "failed", response: JSON.stringify(data), failureReason: classified.detail });
      alertCriticalFailure(classified, opts.templateName ?? "free_text_send");
      return false;
    }
  } catch (err) {
    logger.error(err, "WhatsApp send error");
    const classified = classifyWaFailure(err);
    await log({ ...opts, status: "failed", response: String(err), failureReason: classified.detail });
    alertCriticalFailure(classified, opts.templateName ?? "free_text_send");
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
  triggerEvent?: string;
  shopifyOrderId?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const settings = await getSettings();
    if (!settings?.isActive || !settings.accessToken || !settings.phoneNumberId) {
      const classified = classifyWaFailure("WhatsApp not configured or inactive");
      await log({
        phone: opts.phone,
        templateName: opts.templateName,
        triggerEvent: opts.triggerEvent,
        shopifyOrderId: opts.shopifyOrderId,
        message: `[template] ${opts.templateName}`,
        status: "failed",
        failureReason: classified.detail,
        userId: opts.userId,
      });
      alertCriticalFailure(classified, opts.templateName);
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

    const res = await fetch(`${graphBase(settings.apiVersion)}/${settings.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    const messageId = data?.messages?.[0]?.id as string | undefined;

    if (res.ok && messageId) {
      await log({ phone: opts.phone, templateName: opts.templateName, triggerEvent: opts.triggerEvent, shopifyOrderId: opts.shopifyOrderId, message: `[template] ${opts.templateName}`, status: "sent", response: JSON.stringify(data), messageId, userId: opts.userId });
      mirrorOutboundToInbox({
        phone: opts.phone,
        content: `[template] ${opts.templateName}`,
        waMessageId: messageId,
        isBot: !opts.userId,
        templateName: opts.templateName,
        type: "template",
        status: "sent",
      });
      return { success: true, messageId };
    } else {
      const errMsg = data?.error?.message ?? `HTTP ${res.status}`;
      const classified = classifyWaFailure(data);
      logger.warn({ data }, "WhatsApp template message failed");
      await log({ phone: opts.phone, templateName: opts.templateName, triggerEvent: opts.triggerEvent, shopifyOrderId: opts.shopifyOrderId, message: `[template] ${opts.templateName}`, status: "failed", response: JSON.stringify(data), failureReason: classified.detail });
      alertCriticalFailure(classified, opts.templateName);
      return { success: false, error: errMsg };
    }
  } catch (err) {
    logger.error(err, "WhatsApp template send error");
    const classified = classifyWaFailure(err);
    await log({
      phone: opts.phone,
      templateName: opts.templateName,
      triggerEvent: opts.triggerEvent,
      shopifyOrderId: opts.shopifyOrderId,
      message: `[template] ${opts.templateName}`,
      status: "failed",
      response: String(err),
      failureReason: classified.detail,
      userId: opts.userId,
    });
    alertCriticalFailure(classified, opts.templateName);
    return { success: false, error: String(err) };
  }
}

/* Build WhatsApp list sections from menu items */
function buildMenuSections(items: WaMenuItem[]): Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> {
  const activeItems = filterMenuItems(items).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const sectionMap = new Map<string, Array<{ id: string; title: string; description?: string }>>();
  for (const item of activeItems) {
    const section = (item.sectionTitle ?? "Options").slice(0, 24);
    if (!sectionMap.has(section)) sectionMap.set(section, []);
    const rowTitle = `${item.emoji ? `${item.emoji} ` : ""}${item.label}`.trim().slice(0, 24);
    sectionMap.get(section)!.push({
      id: item.id,
      title: rowTitle,
      ...(item.description ? { description: item.description.slice(0, 72) } : {}),
    });
  }
  return Array.from(sectionMap.entries()).map(([title, rows]) => ({ title: title.slice(0, 24), rows }));
}

/* ─── Send Interactive List Menu ──────────────────────── */
export async function sendInteractiveMenu(opts: {
  phone: string;
  greeting: string;
  settings: Awaited<ReturnType<typeof getSettings>>;
  customItems?: WaMenuItem[] | null;
}): Promise<boolean> {
  try {
    const { settings } = opts;
    if (!settings?.isActive || !settings.accessToken || !settings.phoneNumberId) return false;
    const normalizedPhone = normalizePhone(opts.phone);

    const menuItems = (opts.customItems && opts.customItems.length > 0) ? opts.customItems : DEFAULT_MENU_ITEMS;
    const menuConfig = getMenuConfig(menuItems);
    let sections = buildMenuSections(menuItems);
    if (sections.length === 0 || sections.every(s => s.rows.length === 0)) {
      sections = buildMenuSections(DEFAULT_MENU_ITEMS);
    }

    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedPhone,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: menuConfig.header.slice(0, 60) },
        body: { text: opts.greeting },
        footer: { text: menuConfig.footer.slice(0, 60) },
        action: { button: menuConfig.button.slice(0, 20), sections },
      },
    };

    const res = await fetch(`${graphBase(settings.apiVersion)}/${settings.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    const messageId = data?.messages?.[0]?.id as string | undefined;

    await log({ phone: opts.phone, templateName: "menu_sent", message: "[Interactive menu]", status: res.ok && messageId ? "sent" : "failed", response: JSON.stringify(data), messageId });
    if (res.ok && messageId) {
      mirrorOutboundToInbox({ phone: opts.phone, content: opts.greeting, waMessageId: messageId, isBot: true, type: "interactive", templateName: "menu_sent" });
    }
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

    const res = await fetch(`${graphBase(settings.apiVersion)}/${settings.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    const messageId = data?.messages?.[0]?.id as string | undefined;

    await log({ phone: opts.phone, templateName: opts.templateName ?? "interactive_buttons", message: opts.text.slice(0, 200), status: res.ok && messageId ? "sent" : "failed", response: JSON.stringify(data), messageId });
    if (res.ok && messageId) {
      mirrorOutboundToInbox({ phone: opts.phone, content: opts.text.slice(0, 500), waMessageId: messageId, isBot: true, type: "interactive", templateName: opts.templateName ?? "interactive_buttons" });
    }
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

    const res = await fetch(`${graphBase(settings.apiVersion)}/${settings.phoneNumberId}/messages`, {
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
  const normalized = normalizePhone(phone);
  const [row] = await db.select().from(whatsappConversationStatesTable)
    .where(or(
      eq(whatsappConversationStatesTable.phone, normalized),
      eq(whatsappConversationStatesTable.phone, phone),
    )).limit(1);
  return row ?? null;
}

export async function setConversationState(phone: string, state: string, stateData?: Record<string, unknown>) {
  const normalized = normalizePhone(phone);
  const existing = await getConversationState(phone);
  const values = {
    phone: normalized,
    state,
    stateData: stateData ? JSON.stringify(stateData) : null,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(whatsappConversationStatesTable)
      .set(values).where(eq(whatsappConversationStatesTable.phone, existing.phone));
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

  const name = opts.customerName ?? "Valued Customer";
  const triggerEvent = opts.type === "return" ? "shipment_return_update" : `order_${opts.type}`;
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

  const name = opts.customerName ?? "Valued Customer";
  const tpl = await getApprovedTemplate("review_request");
  if (tpl) {
    const params = [name, opts.orderNumber, opts.couponCode ?? ""].filter(Boolean).slice(0, tpl.paramCount);
    const result = await sendWhatsAppTemplate({
      phone: opts.phone,
      templateName: tpl.name,
      languageCode: tpl.language,
      components: buildBodyComponents(params),
      userId: opts.userId,
    });
    return result.success;
  }

  const couponLine = opts.couponCode
    ? `\n\n🎁 As a thank-you, here's a *10% discount code* for your next order: *${opts.couponCode}*`
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
