/**
 * OnDrive Logistics Engine
 * Connects: Shopify Orders ↔ WhatsApp Confirmations ↔ Real Courier APIs
 */

import { db, couriersTable, shipmentsTable, shopifyOrdersTable, whatsappTemplatesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendInteractiveButtons,
  normalizePhone,
  getSettings as getWaSettings,
} from "./whatsapp";
import { logger } from "./logger";
import { RIDER_PUSH_CHANNEL_ID, RIDER_PUSH_SOUND } from "./riderPushConfig.js";

/* ══════════════════════════════════════════════════════
   EXPO PUSH NOTIFICATION HELPER
   Sends push to rider device via Expo push API.
   No FCM key needed — Expo handles it internally.
══════════════════════════════════════════════════════ */
export async function sendExpoPush(params: {
  expoPushToken: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string | null;
  badge?: number;
  riderId?: number;
  deliveryId?: number;
  orderNumber?: string;
  channelId?: string;
}): Promise<boolean> {
  const {
    expoPushToken,
    title,
    body,
    data,
    sound = RIDER_PUSH_SOUND,
    badge,
    riderId,
    deliveryId,
    orderNumber,
    channelId = RIDER_PUSH_CHANNEL_ID,
  } = params;
  if (!expoPushToken || !expoPushToken.startsWith("ExponentPushToken")) return false;

  const MAX_ATTEMPTS = 3;
  const tokenSlice = expoPushToken.slice(-12);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 1200));
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
        },
        body: JSON.stringify({
          to: expoPushToken,
          title,
          body,
          data: data ?? {},
          sound,
          ...(badge !== undefined ? { badge } : {}),
          priority: "high",
          channelId,
        }),
      });
      const result = await res.json() as any;

      if (result?.data?.status === "error") {
        const errMsg = result.data.message ?? "Expo delivery error";
        logger.warn({ token: tokenSlice, error: errMsg, attempt }, "Expo push: delivery error");
        await db.execute(sql`
          INSERT INTO notification_logs
            (rider_id, delivery_id, order_number, expo_push_token, title, body, status, attempt, error, response, created_at)
          VALUES
            (${riderId ?? null}, ${deliveryId ?? null}, ${orderNumber ?? null}, ${tokenSlice},
             ${title}, ${body}, 'failed', ${attempt}, ${errMsg}, ${JSON.stringify(result)}, NOW())
        `).catch(() => {});
        if (attempt === MAX_ATTEMPTS) return false;
        continue;
      }

      await db.execute(sql`
        INSERT INTO notification_logs
          (rider_id, delivery_id, order_number, expo_push_token, title, body, status, attempt, response, sent_at, created_at)
        VALUES
          (${riderId ?? null}, ${deliveryId ?? null}, ${orderNumber ?? null}, ${tokenSlice},
           ${title}, ${body}, 'sent', ${attempt}, ${JSON.stringify(result)}, NOW(), NOW())
      `).catch(() => {});
      logger.info({ token: tokenSlice, attempt }, "Expo push: sent");
      return true;

    } catch (err) {
      const errMsg = String(err);
      logger.warn({ err, attempt }, "Expo push: network error");
      await db.execute(sql`
        INSERT INTO notification_logs
          (rider_id, delivery_id, order_number, expo_push_token, title, body, status, attempt, error, created_at)
        VALUES
          (${riderId ?? null}, ${deliveryId ?? null}, ${orderNumber ?? null}, ${tokenSlice},
           ${title}, ${body}, 'failed', ${attempt}, ${errMsg}, NOW())
      `).catch(() => {});
      if (attempt === MAX_ATTEMPTS) return false;
    }
  }
  return false;
}

/* ── Confirmation keywords (Urdu + English) ── */
const CONFIRM_KEYWORDS = [
  "confirm", "confirmed", "yes", "yeah", "yep", "ok", "okay", "done",
  "proceed", "book", "booked", "ship", "go", "agree", "accept",
  "han", "haan", "haa", "ha", "ji", "ji han", "theek", "theek hai",
  "bilkul", "zaroor", "send", "bhejo", "kar do", "kar dain",
  "order confirm", "confirm order", "yes please", "sure", "absolutely",
];

export function isConfirmationReply(text: string): boolean {
  const normalized = text.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  return CONFIRM_KEYWORDS.some(k => {
    const kn = k.toLowerCase().trim().replace(/[_-]+/g, " ");
    return normalized === kn || normalized.startsWith(kn + " ") || normalized.endsWith(" " + kn);
  });
}

function isExplicitOrderConfirmationReply(text: string): boolean {
  const normalized = text.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  return [
    "confirm order",
    "order confirm",
    "yes confirm",
    "yes please confirm",
    "confirm krdo",
    "confirm kar do",
    "confirm kar dain",
    "order bhejo",
    "order send",
    "proceed order",
  ].some(k => normalized === k || normalized.includes(k));
}

export function isCancellationReply(text: string): boolean {
  const kws = ["cancel", "cancel order", "cancel_order", "no", "nahi", "nope", "dont", "don't", "stop", "reject", "nahi chahiye"];
  const normalized = text.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  return kws.some(k => normalized === k || normalized.startsWith(k + " "));
}

function isExplicitOrderCancellationReply(text: string): boolean {
  const normalized = text.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  return ["cancel order", "order cancel", "cancel krdo", "cancel kar do", "nahi chahiye", "reject order"].some(k => normalized === k || normalized.includes(k));
}

/* ── Weight calculation using DB weight rules ── */
export async function calculateShipmentWeight(lineItems: any[]): Promise<number> {
  if (!lineItems?.length) return 0.5;
  const rulesRes = await db.execute(sql`SELECT * FROM courier_weight_rules ORDER BY id`).catch(() => ({ rows: [] }));
  const rules = (rulesRes.rows ?? []) as Record<string, any>[];
  let total = 0;
  for (const li of lineItems) {
    const qty = Number(li.quantity ?? 1);
    if (li.grams && Number(li.grams) > 0) { total += (Number(li.grams) / 1000) * qty; continue; }
    const sku = (li.sku ?? "").toUpperCase();
    const title = (li.title ?? li.name ?? "").toLowerCase();
    let unitWeight = 0.5;
    for (const rule of rules) {
      if (rule.sku_pattern && sku.startsWith(String(rule.sku_pattern).replace("%", ""))) { unitWeight = Number(rule.weight_per_unit); break; }
      if (rule.product_type && title.includes(String(rule.product_type).toLowerCase())) { unitWeight = Number(rule.weight_per_unit); break; }
    }
    total += unitWeight * qty;
  }
  return Math.max(0.1, Math.round(total * 100) / 100);
}

/* ── Smart courier recommendation ── */
export async function selectBestCourier(params: { city: string; weight: number; codAmount: number }): Promise<any | null> {
  const couriers = await db.select().from(couriersTable).where(eq(couriersTable.isActive, true));
  if (!couriers.length) return null;

  /* Performance data from last 30 days */
  const perfRes = await db.execute(sql`
    SELECT courier_slug,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered
    FROM shipments WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY courier_slug
  `).catch(() => ({ rows: [] }));
  const perfMap: Record<string, any> = {};
  for (const p of (perfRes.rows ?? []) as any[]) perfMap[p.courier_slug] = p;

  /* Check automation settings for default courier */
  const settingsRes = await db.execute(sql`SELECT * FROM courier_automation_settings WHERE id = 1 LIMIT 1`).catch(() => ({ rows: [] }));
  const autoSettings = ((settingsRes.rows ?? [])[0] ?? {}) as Record<string, any>;

  /* Auto-book rules */
  const rules: any[] = Array.isArray(autoSettings.rules) ? autoSettings.rules : [];
  const { city = "", weight = 0.5, codAmount = 0 } = params;

  for (const rule of rules) {
    if (!rule.enabled) continue;
    let matches = true;
    if (rule.condition === "weight_gt" && weight <= Number(rule.value)) matches = false;
    if (rule.condition === "weight_lt" && weight >= Number(rule.value)) matches = false;
    if (rule.condition === "cod_gt" && codAmount <= Number(rule.value)) matches = false;
    if (rule.condition === "city_is" && !city.toLowerCase().includes(String(rule.value).toLowerCase())) matches = false;
    if (rule.condition === "is_paid" && codAmount > 0) matches = false;
    if (rule.condition === "is_cod" && codAmount === 0) matches = false;
    if (matches && rule.courierSlug) {
      const c = couriers.find((x: any) => x.slug === rule.courierSlug);
      if (c) return c;
    }
  }

  /* Use configured default courier */
  if (autoSettings.default_courier_slug) {
    const c = couriers.find((x: any) => x.slug === autoSettings.default_courier_slug);
    if (c) return c;
  }

  /* Scoring fallback */
  const cityLower = city.toLowerCase();
  const majorCities = ["karachi", "lahore", "islamabad", "rawalpindi", "faisalabad", "multan", "peshawar", "quetta"];
  const isMajor = majorCities.some(m => cityLower.includes(m));

  let best = couriers[0];
  let bestScore = -1;

  for (const c of couriers) {
    let score = 40;
    const settings = (c.settings ?? {}) as Record<string, any>;
    const hasApi = c.slug === "tcs"
      ? !!(settings.bearerToken || (settings.username && settings.password))
      : !!(c.apiKey && c.apiEndpoint);
    if (hasApi) score += 20;

    if (c.slug === "postex") {
      if (isMajor) score += 15;
      if (weight <= 2) score += 10;
      if (codAmount > 0 && codAmount <= 15000) score += 10;
    }
    if (c.slug === "tcs") {
      score += 5;
      if (weight > 2) score += 15;
      if (!isMajor) score += 10;
    }
    if (c.slug === "leopards") {
      if (cityLower.includes("karachi")) score += 20;
      if (isMajor) score += 8;
    }

    const perf = perfMap[c.slug];
    if (perf?.total > 0) {
      const rate = perf.delivered / perf.total;
      if (rate >= 0.85) score += 15;
      else if (rate < 0.60) score -= 10;
    }

    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best ?? null;
}

/* ── Send OnDrive branded WhatsApp confirmation with interactive buttons ── */
export async function upsertOrderConfirmationRecord(params: {
  shopifyOrderId: string;
  orderNumber: string;
  shopifyOrderDbId?: number;
  phone: string;
  customerName: string;
  messageId?: string | null;
}) {
  const normalizedPhone = normalizePhone(params.phone);
  await db.execute(sql`
    INSERT INTO shopify_order_confirmations
      (shopify_order_id, shopify_order_number, shopify_order_db_id, customer_phone, customer_name,
       wa_message_id, status, last_sent_at, auto_book_enabled)
    VALUES
      (${params.shopifyOrderId}, ${params.orderNumber}, ${params.shopifyOrderDbId ?? null}, ${normalizedPhone},
       ${params.customerName}, ${params.messageId ?? null}, 'pending', NOW(), TRUE)
    ON CONFLICT (shopify_order_id) DO UPDATE SET
      status = CASE WHEN shopify_order_confirmations.status = 'confirmed' THEN 'confirmed' ELSE 'pending' END,
      wa_message_id = COALESCE(${params.messageId ?? null}, shopify_order_confirmations.wa_message_id),
      last_sent_at = NOW(),
      retry_count = shopify_order_confirmations.retry_count + 1,
      updated_at = NOW()
  `).catch(() => {});
}

export async function hasOrderConfirmationBeenSent(shopifyOrderId: string, shopifyOrderDbId?: number | null): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT 1
    FROM shopify_order_confirmations c
    WHERE c.shopify_order_id = ${shopifyOrderId}
      AND c.last_sent_at IS NOT NULL
      AND c.status IN ('pending', 'confirmed', 'booked', 'cancelled')
    LIMIT 1
  `).catch(() => ({ rows: [] }));
  if ((rows.rows ?? []).length > 0) return true;

  const sentLog = await db.execute(sql`
    SELECT 1
    FROM whatsapp_logs
    WHERE status = 'sent'
      AND shopify_order_id = ${shopifyOrderId}
      AND (
        trigger_event IN ('order_confirmation', 'order_confirmed', 'order_confirmed_wa', 'order_confirm')
        OR template_name IN ('order_confirmation', 'order_confirmed', 'order_confirmed_wa', 'order_confirm', 'order_confromd_')
      )
    LIMIT 1
  `).catch(() => ({ rows: [] }));
  if ((sentLog.rows ?? []).length > 0) return true;

  if (shopifyOrderDbId) {
    const orderFlag = await db.execute(sql`
      SELECT 1 FROM shopify_orders
      WHERE id = ${shopifyOrderDbId}
        AND COALESCE(wa_notification_sent, FALSE) = TRUE
      LIMIT 1
    `).catch(() => ({ rows: [] }));
    if ((orderFlag.rows ?? []).length > 0) return true;
  }
  return false;
}

export async function claimOrderConfirmationSend(params: {
  shopifyOrderId: string;
  orderNumber: string;
  shopifyOrderDbId?: number | null;
  phone: string;
  customerName: string;
}): Promise<{ allowed: boolean; reason?: string }> {
  if (await hasOrderConfirmationBeenSent(params.shopifyOrderId, params.shopifyOrderDbId)) {
    return { allowed: false, reason: "Order confirmation already sent for this Shopify order" };
  }

  const normalizedPhone = normalizePhone(params.phone);
  const inserted = await db.execute(sql`
    INSERT INTO shopify_order_confirmations
      (shopify_order_id, shopify_order_number, shopify_order_db_id, customer_phone, customer_name,
       status, auto_book_enabled, updated_at)
    VALUES
      (${params.shopifyOrderId}, ${params.orderNumber}, ${params.shopifyOrderDbId ?? null}, ${normalizedPhone},
       ${params.customerName}, 'sending', TRUE, NOW())
    ON CONFLICT (shopify_order_id) DO NOTHING
    RETURNING id
  `).catch(() => ({ rows: [] }));

  if ((inserted.rows ?? []).length > 0) return { allowed: true };

  const existing = await db.execute(sql`
    SELECT status, last_sent_at, wa_message_id, updated_at
    FROM shopify_order_confirmations
    WHERE shopify_order_id = ${params.shopifyOrderId}
    LIMIT 1
  `).catch(() => ({ rows: [] }));
  const row = (existing.rows ?? [])[0] as any;
  if (!row) return { allowed: false, reason: "Confirmation lock could not be created" };
  if (row.last_sent_at || row.wa_message_id || ["pending", "confirmed", "booked", "cancelled"].includes(String(row.status))) {
    return { allowed: false, reason: "Order confirmation already sent or waiting for customer reply" };
  }
  if (String(row.status) === "sending") {
    const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();
    if (Date.now() - updatedAt > 10 * 60 * 1000) {
      await db.execute(sql`
        UPDATE shopify_order_confirmations
        SET status = 'sending',
            customer_phone = ${normalizedPhone},
            customer_name = ${params.customerName},
            updated_at = NOW()
        WHERE shopify_order_id = ${params.shopifyOrderId}
      `).catch(() => {});
      return { allowed: true };
    }
    return { allowed: false, reason: "Order confirmation send already in progress" };
  }
  await db.execute(sql`
    UPDATE shopify_order_confirmations
    SET status = 'sending',
        customer_phone = ${normalizedPhone},
        customer_name = ${params.customerName},
        shopify_order_db_id = COALESCE(shopify_order_db_id, ${params.shopifyOrderDbId ?? null}),
        updated_at = NOW()
    WHERE shopify_order_id = ${params.shopifyOrderId}
      AND status = 'failed'
  `).catch(() => {});
  return { allowed: true };
}

export async function markOrderConfirmationSendResult(params: {
  shopifyOrderId: string;
  success: boolean;
  messageId?: string | null;
  error?: string | null;
}) {
  await db.execute(sql`
    UPDATE shopify_order_confirmations
    SET status = ${params.success ? "pending" : "failed"},
        wa_message_id = COALESCE(${params.messageId ?? null}, wa_message_id),
        last_sent_at = CASE WHEN ${params.success} THEN NOW() ELSE last_sent_at END,
        confirmation_reply = CASE WHEN ${params.success} THEN confirmation_reply ELSE ${params.error ?? "send_failed"} END,
        retry_count = CASE WHEN ${params.success} THEN retry_count ELSE retry_count + 1 END,
        updated_at = NOW()
    WHERE shopify_order_id = ${params.shopifyOrderId}
  `).catch(() => {});
}

export async function sendOrderConfirmationWA(params: {
  phone: string;
  orderNumber: string;
  customerName: string;
  total: string;
  items: any[];
  isPaid: boolean;
  codAmount: number;
  shopifyOrderId: string;
  shopifyOrderDbId: number;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const waSettings = await getWaSettings();
    if (!waSettings?.isActive || !waSettings.accessToken || !waSettings.phoneNumberId) {
      return { success: false, error: "WhatsApp not configured" };
    }

    const { phone, orderNumber, customerName, total, items, isPaid, codAmount, shopifyOrderId, shopifyOrderDbId } = params;
    const normalizedPhone = normalizePhone(phone);
    const name = customerName?.split(" ")[0] || "Customer";
    const itemsList = items.slice(0, 3).map((li: any) => `• ${li.quantity ?? 1}x ${li.title ?? li.name ?? "Product"}`).join("\n");
    const codLine = isPaid
      ? "✅ *Payment:* Paid Online"
      : `💵 *COD Amount:* Rs. ${Number(codAmount).toLocaleString()}`;

    const branding = await getOnDriveBranding();

    /* ── Primary: DB-approved order_confirmation template, else legacy Meta name ── */
    const paymentLabel = isPaid ? "Paid Online ✅" : `COD Rs. ${Number(codAmount).toLocaleString()}`;
    const { getApprovedTemplate } = await import("./whatsapp.js");
    const tpl = await getApprovedTemplate("order_confirmation");
    const templateName = tpl?.name ?? "order_confromd_";
    const bodyParams = [
      orderNumber,
      name,
      `Rs. ${Number(total).toLocaleString()}`,
      paymentLabel,
    ];
    const selectedParams = tpl?.paramCount != null ? bodyParams.slice(0, tpl.paramCount) : bodyParams;
    const templateResult = await sendWhatsAppTemplate({
      phone: normalizedPhone,
      templateName,
      languageCode: tpl?.language ?? "en_US",
      triggerEvent: "order_confirmation",
      shopifyOrderId,
      components: selectedParams.length
        ? [
            {
              type: "body",
              parameters: selectedParams.map((text) => ({ type: "text", text })),
            },
          ]
        : [],
    });

    let messageId: string | undefined = templateResult.messageId;
    let success = templateResult.success;

    /* ── Fallback: interactive buttons (works within 24h session window) ── */
    if (!success) {
      logger.warn({ orderNumber, templateName, templateError: templateResult.error }, "Order confirmation template failed — trying interactive fallback");
      const msgText = `📦 *New Order Received!*\n\n` +
        `Hello *${name}*! 👋\n\n` +
        `Your order has been placed at *Khan Dry Fruits* 🥜\n\n` +
        `🧾 *Order:* ${orderNumber}\n` +
        `💰 *Total:* Rs. ${Number(total).toLocaleString()}\n` +
        `${codLine}\n\n` +
        (itemsList ? `📋 *Items:*\n${itemsList}\n\n` : "") +
        `Please *CONFIRM* your order so we can dispatch it immediately.\n\n` +
        `Reply *CONFIRM* to proceed or *CANCEL* to cancel.\n\n` +
        `_Powered by ${branding}_`;

      const result = await sendInteractiveButtons({
        phone: normalizedPhone,
        text: msgText,
        buttons: [
          { id: `confirm_order_${shopifyOrderId}`, title: "✅ Confirm Order" },
          { id: `cancel_order_${shopifyOrderId}`,  title: "❌ Cancel Order" },
        ],
        settings: waSettings,
        templateName: "ondrive_order_confirm",
      });
      success = result;
      messageId = undefined;
    }

    /* Store pending confirmation record */
    await markOrderConfirmationSendResult({
      shopifyOrderId,
      success,
      messageId,
      error: success ? null : "WhatsApp send failed",
    });

    return { success, messageId, error: success ? undefined : "WhatsApp send failed" };
  } catch (err: any) {
    logger.error(err, "sendOrderConfirmationWA error");
    return { success: false, error: String(err) };
  }
}

/* ── Get OnDrive branding from settings ── */
async function getOnDriveBranding(): Promise<string> {
  const res = await db.execute(sql`SELECT notify_branding FROM courier_automation_settings WHERE id = 1 LIMIT 1`).catch(() => ({ rows: [] }));
  return (res.rows?.[0] as any)?.notify_branding ?? "OnDrive Logistics";
}

/* ── Send tracking update via WhatsApp ── */
export async function sendTrackingUpdateWA(params: {
  phone: string;
  customerName: string;
  orderNumber: string;
  trackingId: string;
  courierName: string;
  courierSlug: string;
}): Promise<boolean> {
  try {
    const { phone, customerName, orderNumber, trackingId, courierName, courierSlug } = params;
    const branding = await getOnDriveBranding();
    const name = customerName?.split(" ")[0] || "Customer";

    const trackingUrls: Record<string, string> = {
      postex:   `https://postex.pk/tracking/${trackingId}`,
      tcs:      `https://www.tcsexpress.com/track/${trackingId}`,
      leopards: `https://leopardscourier.com/tracking?tracking_number=${trackingId}`,
      trax:     `https://trax.pk/tracking/${trackingId}`,
    };
    const trackingUrl = trackingUrls[courierSlug] ?? "";

    const msg = `📦 *Shipment Booked — ${branding}*\n\n` +
      `Hi *${name}*! Your order is on its way! 🚀\n\n` +
      `🧾 *Order:* ${orderNumber}\n` +
      `🚚 *Courier:* ${courierName}\n` +
      `🔍 *Tracking ID:* *${trackingId}*\n` +
      (trackingUrl ? `🌐 *Track:* ${trackingUrl}\n` : "") +
      `\nExpected delivery in 2-3 working days.\n\n` +
      `Thank you for choosing *Khan Dry Fruits* 🥜❤️\n` +
      `_${branding} — Fast & Reliable Delivery_`;

    return sendWhatsAppMessage({ phone: normalizePhone(phone), message: msg, templateName: "ondrive_tracking" });
  } catch (err) {
    logger.error(err, "sendTrackingUpdateWA error");
    return false;
  }
}

/* ── CORE: Auto-book real courier shipment for Shopify order ── */
export async function autoBookShipmentForOrder(params: {
  shopifyOrderDbId: number;
  triggeredBy: string;
  courierSlugOverride?: string;
}): Promise<{
  success: boolean;
  trackingId?: string;
  courierSlug?: string;
  courierName?: string;
  error?: string;
  isRealApi: boolean;
}> {
  const { shopifyOrderDbId, triggeredBy, courierSlugOverride } = params;

  try {
    /* Load order */
    const [order] = await db.select().from(shopifyOrdersTable).where(eq(shopifyOrdersTable.id, shopifyOrderDbId)).limit(1);
    if (!order) return { success: false, error: "Order not found", isRealApi: false };

    /* Skip if already booked */
    if (order.trackingNumber) {
      return { success: false, error: `Already booked: ${order.trackingNumber}`, isRealApi: false };
    }

    const addr = (order.shippingAddress as any) ?? {};
    const lineItems: any[] = Array.isArray(order.lineItems) ? order.lineItems : [];
    const isPaid = ["paid", "partially_paid"].includes(order.financialStatus ?? "");
    const codAmount = isPaid ? 0 : Number(order.totalPrice ?? 0);
    const weight = await calculateShipmentWeight(lineItems);
    const city = addr.city ?? "";

    /* ── Lahore = local rider — skip courier booking ── */
    if (city.toLowerCase().includes("lahore")) {
      const riderCheck = await db.execute(sql`
        SELECT id, rider_id FROM rider_deliveries
        WHERE shopify_order_db_id = ${shopifyOrderDbId}
          AND status NOT IN ('failed','returned','cancelled')
        LIMIT 1
      `).catch(() => ({ rows: [] }));
      if ((riderCheck.rows ?? []).length > 0) {
        const rd = (riderCheck.rows[0] as any);
        return { success: false, error: `Lahore order already assigned to local rider (delivery #${rd.id})`, isRealApi: false };
      }
    }

    /* Check high-risk city */
    const settingsRes = await db.execute(sql`SELECT * FROM courier_automation_settings WHERE id = 1 LIMIT 1`).catch(() => ({ rows: [] }));
    const autoSettings = ((settingsRes.rows ?? [])[0] ?? {}) as Record<string, any>;
    const highRisk: string[] = Array.isArray(autoSettings.high_risk_cities) ? autoSettings.high_risk_cities : [];
    if (highRisk.some(c => city.toLowerCase().includes(c.toLowerCase()))) {
      return { success: false, error: `High-risk city flagged for manual review: ${city}`, isRealApi: false };
    }

    /* Select courier */
    let courierRow: any = null;
    if (courierSlugOverride) {
      const [c] = await db.select().from(couriersTable).where(eq(couriersTable.slug, courierSlugOverride)).limit(1);
      courierRow = c;
    }
    if (!courierRow) {
      courierRow = await selectBestCourier({ city, weight, codAmount });
    }
    if (!courierRow) return { success: false, error: "No active courier available", isRealApi: false };

    /* Build order object for callCourierApi */
    const resolvedName    = addr.name    ?? order.customerName    ?? "";
    const resolvedPhone   = addr.phone   ?? order.customerPhone   ?? "";
    const resolvedAddress = addr.address1 ?? addr.address         ?? "";

    const courierOrderObj: Record<string, any> = {
      id:             order.id,
      orderNumber:    order.orderNumber,
      paymentMethod:  isPaid ? "online" : "cod",
      total:          codAmount,
      invoiceAmount:  codAmount,
      notes:          order.note ?? "",
      specialInstructions: "",
      contentDesc:    lineItems.slice(0, 3).map((li: any) => li.title ?? "KDF Nuts").join(", ") || "KDF Nuts Products",
      items:          lineItems.map((li: any) => ({ name: li.title ?? "Product", qty: li.quantity ?? 1, price: Number(li.price ?? 0) })),
      shippingAddress: { name: resolvedName, phone: resolvedPhone, address: resolvedAddress, city, email: order.customerEmail ?? "" },
      weight,
      pieces:         Math.max(1, lineItems.length),
      postexOrderType: "Normal",
    };

    /* Try REAL courier API */
    let trackingId: string;
    let rawResponse: Record<string, any> = {};
    let isRealApi = false;

    const courierSettings = (courierRow.settings ?? {}) as Record<string, any>;
    const hasApiCreds = courierRow.slug === "tcs"
      ? !!(courierSettings.bearerToken || (courierSettings.username && courierSettings.password))
      : !!(courierRow.apiKey && courierRow.apiEndpoint);

    if (hasApiCreds) {
      try {
        const { callCourierApiForShopify } = await import("../routes/couriers.js");
        const result = await callCourierApiForShopify(courierRow, courierOrderObj);
        trackingId = result.trackingId;
        rawResponse = result.rawResponse;
        isRealApi = true;
        logger.info({ trackingId, courier: courierRow.slug, orderId: shopifyOrderDbId }, "OnDrive: Real courier API booking success");
      } catch (apiErr: any) {
        logger.warn({ err: apiErr, courier: courierRow.slug }, "OnDrive: Real courier API failed — using local tracking ID");
        trackingId = generateLocalTrackingId(courierRow.slug);
        rawResponse = { note: `API failed: ${apiErr.message}`, localTracking: true, triggeredBy };
        isRealApi = false;
      }
    } else {
      trackingId = generateLocalTrackingId(courierRow.slug);
      rawResponse = { note: `Courier API not configured for ${courierRow.slug}`, localTracking: true, triggeredBy };
      isRealApi = false;
    }

    const now = new Date().toISOString();
    const branding = await getOnDriveBranding();

    /* Save shipment to DB */
    const [shipment] = await db.insert(shipmentsTable).values({
      orderId: order.id,
      courierId: courierRow.id,
      courierSlug: courierRow.slug,
      trackingId,
      status: "pending",
      statusHistory: [{ status: "pending", timestamp: now, note: `Auto-booked by OnDrive Engine · ${triggeredBy} · ${isRealApi ? "Real API" : "Local ID"}` }],
      weight: String(weight),
      shopifyOrderId: order.shopifyOrderId,
      shopifyOrderNumber: order.orderNumber,
      customerName: resolvedName,
      customerPhone: resolvedPhone,
      customerAddress: resolvedAddress,
      customerCity: city,
      codAmount: String(codAmount),
      pieces: Math.max(1, lineItems.length),
      contentDesc: courierOrderObj.contentDesc,
      isCod: codAmount > 0,
      codStatus: "pending",
      notifyWhatsapp: true,
      bookingSource: triggeredBy === "whatsapp_confirmation" ? "whatsapp" : "auto",
      rawResponse,
    } as any).returning();

    /* Update Shopify order */
    await db.update(shopifyOrdersTable).set({
      trackingNumber: trackingId,
      status: "fulfilled",
      fulfillmentStatus: "fulfilled",
      tags: order.tags ? `${order.tags},packed,dispatched` : "packed,dispatched",
      updatedAt: new Date(),
    }).where(eq(shopifyOrdersTable.id, shopifyOrderDbId));

    /* Push fulfillment to Shopify API */
    try {
      const { pushFulfillmentToShopify } = await import("./shopifyAutoSync.js");
      const storeRes = await db.execute(sql`SELECT * FROM shopify_stores WHERE is_connected = true LIMIT 1`).catch(() => ({ rows: [] }));
      const store = (storeRes.rows ?? [])[0] as any;
      if (store && trackingId) {
        await pushFulfillmentToShopify(store, order.shopifyOrderId!, trackingId, courierRow.name);
        logger.info({ trackingId, shopifyOrderId: order.shopifyOrderId }, "OnDrive: Shopify fulfillment pushed");
      }
    } catch (fulfillErr) {
      logger.warn(fulfillErr, "OnDrive: Shopify fulfillment push failed (non-fatal)");
    }

    /* Update confirmation record */
    await db.execute(sql`
      UPDATE shopify_order_confirmations
      SET status = 'booked', courier_slug = ${courierRow.slug}, tracking_id = ${trackingId},
          shipment_id = ${(shipment as any)?.id ?? null}, updated_at = NOW()
      WHERE shopify_order_id = ${order.shopifyOrderId}
    `).catch(() => {});

    /* Log automation */
    await db.execute(sql`
      INSERT INTO courier_automation_logs
        (shopify_order_id, shopify_order_number, action, courier_slug, tracking_id,
         rule_matched, calculated_weight, cod_amount, status, details)
      VALUES (${order.shopifyOrderId}, ${order.orderNumber}, 'auto_booked',
        ${courierRow.slug}, ${trackingId}, ${triggeredBy}, ${weight}, ${codAmount},
        'success', ${JSON.stringify({ isRealApi, branding, isPaid })})
    `).catch(() => {});

    /* Send WhatsApp tracking update */
    if (resolvedPhone) {
      await sendTrackingUpdateWA({
        phone: resolvedPhone,
        customerName: resolvedName,
        orderNumber: order.orderNumber ?? "",
        trackingId,
        courierName: courierRow.name,
        courierSlug: courierRow.slug,
      }).catch(() => {});
    }

    return { success: true, trackingId, courierSlug: courierRow.slug, courierName: courierRow.name, isRealApi };
  } catch (err: any) {
    logger.error(err, "autoBookShipmentForOrder error");
    await db.execute(sql`
      INSERT INTO courier_automation_logs
        (shopify_order_id, action, status, error, details)
      VALUES (${String(shopifyOrderDbId)}, 'auto_book_failed', 'failed', ${err.message ?? "Unknown error"}, ${JSON.stringify({ triggeredBy })})
    `).catch(() => {});
    return { success: false, error: err.message ?? "Auto-booking failed", isRealApi: false };
  }
}

/* ── Process WhatsApp confirmation reply ── */
export async function processWhatsAppConfirmation(params: {
  phone: string;
  text: string;
  interactionId?: string;
}): Promise<{ handled: boolean; action?: string; orderId?: string }> {
  const { phone, text, interactionId } = params;
  const normalizedPhone = normalizePhone(phone);
  const normalizedInteraction = String(interactionId ?? "").toLowerCase().replace(/[_-]+/g, " ").trim();

  /* Check interactive button replies */
  if (interactionId) {
    if (interactionId.startsWith("confirm_order_")) {
      const shopifyOrderId = interactionId.replace("confirm_order_", "");
      return await handleConfirmation(normalizedPhone, shopifyOrderId, "button_click");
    }
    if (interactionId.startsWith("cancel_order_")) {
      const shopifyOrderId = interactionId.replace("cancel_order_", "");
      await handleCancellation(normalizedPhone, shopifyOrderId);
      return { handled: true, action: "cancelled", orderId: shopifyOrderId };
    }
  }

  /* Check if this phone has a pending confirmation */
  const confRes = await db.execute(sql`
    SELECT * FROM shopify_order_confirmations
    WHERE customer_phone = ${normalizedPhone}
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `).catch(() => ({ rows: [] }));
  const conf = ((confRes.rows ?? [])[0]) as Record<string, any> | undefined;
  if (!conf) return { handled: false };

  /* Text confirmation must be explicit. Generic "yes/ok/ji" is reserved for active checkout state only. */
  if (isExplicitOrderConfirmationReply(text) || isExplicitOrderConfirmationReply(normalizedInteraction)) {
    return await handleConfirmation(normalizedPhone, conf.shopify_order_id, "text_reply");
  }

  /* Check cancellation */
  if (isExplicitOrderCancellationReply(text) || isExplicitOrderCancellationReply(normalizedInteraction)) {
    await handleCancellation(normalizedPhone, conf.shopify_order_id);
    return { handled: true, action: "cancelled", orderId: conf.shopify_order_id };
  }

  return { handled: false };
}

async function handleConfirmation(phone: string, shopifyOrderId: string, method: string): Promise<{ handled: boolean; action: string; orderId: string }> {
  try {
    const orderRes = await db.execute(sql`SELECT * FROM shopify_orders WHERE shopify_order_id = ${shopifyOrderId} LIMIT 1`).catch(() => ({ rows: [] }));
    const order = ((orderRes.rows ?? [])[0]) as Record<string, any> | undefined;
    if (!order) {
      logger.error({ shopifyOrderId, phone, method }, "OnDrive: refusing confirmation because order row is missing");
      await db.execute(sql`
        UPDATE shopify_order_confirmations
        SET status = 'failed', updated_at = NOW()
        WHERE shopify_order_id = ${shopifyOrderId}
          AND status = 'pending'
      `).catch(() => {});
      await sendWhatsAppMessage({
        phone,
        message: "Sorry, order confirmation complete nahi ho saki kyunki order record nahi mila. Hamari team ko alert kar diya gaya hai.",
        templateName: "ondrive_confirm_failed",
      }).catch(() => {});
      return { handled: true, action: "order_missing", orderId: shopifyOrderId };
    }

    /* Mark as confirmed once; duplicate Meta callbacks must not re-run side effects. */
    const updateRes = await db.execute(sql`
      UPDATE shopify_order_confirmations
      SET status = 'confirmed', confirmation_reply = ${method},
          confirmation_received_at = NOW(), updated_at = NOW()
      WHERE shopify_order_id = ${shopifyOrderId}
        AND (customer_phone = ${phone} OR ${method} = 'button_click')
        AND status = 'pending'
      RETURNING id
    `).catch(() => {});
    const updatedRows = Array.isArray((updateRes as any)?.rows) ? (updateRes as any).rows : [];
    if (updatedRows.length === 0) {
      const current = await db.execute(sql`
        SELECT status FROM shopify_order_confirmations
        WHERE shopify_order_id = ${shopifyOrderId}
        LIMIT 1
      `).catch(() => ({ rows: [] }));
      const status = String(((current.rows ?? [])[0] as any)?.status ?? "");
      if (["confirmed", "booked"].includes(status)) {
        logger.info({ shopifyOrderId, phone, status }, "OnDrive: duplicate confirmation click ignored");
        return { handled: true, action: "already_confirmed", orderId: shopifyOrderId };
      }
      if (status === "cancelled") {
        return { handled: true, action: "already_cancelled", orderId: shopifyOrderId };
      }
      logger.warn({ shopifyOrderId, phone, status }, "OnDrive: confirmation click received but no pending confirmation row matched");
      return { handled: true, action: "not_pending", orderId: shopifyOrderId };
    }

    /* Also update local shopify_orders status → confirmed */
    await db.execute(sql`
      UPDATE shopify_orders
      SET status = 'confirmed',
          tags = TRIM(BOTH ',' FROM CONCAT_WS(',', NULLIF(tags, ''), 'wa_confirmed')),
          updated_at = NOW()
      WHERE shopify_order_id = ${shopifyOrderId}
    `).catch(() => {});

    /* Send acknowledgement first */
    await sendWhatsAppMessage({
      phone,
      message: `Thank you 😊\n\n✅ Your order *${order.order_number}* has been confirmed successfully.\n\nOur team is preparing your order now. You will receive packing and delivery updates soon 📦\n\n*Khan Dry Fruits*`,
      templateName: "ondrive_confirm_ack",
      shopifyOrderId,
    });

    /* Check auto-book enabled */
    const confRes = await db.execute(sql`SELECT auto_book_enabled FROM shopify_order_confirmations WHERE shopify_order_id = ${shopifyOrderId} LIMIT 1`).catch(() => ({ rows: [] }));
    const autoBook = (confRes.rows?.[0] as any)?.auto_book_enabled !== false;

    if (autoBook) {
      setImmediate(async () => {
        const result = await autoBookShipmentForOrder({
          shopifyOrderDbId: Number(order.id),
          triggeredBy: "whatsapp_confirmation",
        });
        if (!result.success) {
          logger.warn({ shopifyOrderId, orderNumber: order.order_number, error: result.error }, "OnDrive: auto-booking failed after confirmation");
        }
      });
    }

    return { handled: true, action: "confirmed", orderId: shopifyOrderId };
  } catch (err) {
    logger.error(err, "handleConfirmation error");
    return { handled: true, action: "error", orderId: shopifyOrderId };
  }
}

async function handleCancellation(phone: string, shopifyOrderId: string): Promise<void> {
  const updateRes = await db.execute(sql`
    UPDATE shopify_order_confirmations
    SET status = 'cancelled', confirmation_reply = 'cancelled',
        confirmation_received_at = NOW(), updated_at = NOW()
    WHERE shopify_order_id = ${shopifyOrderId}
      AND customer_phone = ${phone}
      AND status IN ('pending', 'sending', 'failed')
    RETURNING id
  `).catch(() => {});
  const updatedRows = Array.isArray((updateRes as any)?.rows) ? (updateRes as any).rows : [];
  if (updatedRows.length === 0) {
    const current = await db.execute(sql`
      SELECT status FROM shopify_order_confirmations
      WHERE shopify_order_id = ${shopifyOrderId}
      LIMIT 1
    `).catch(() => ({ rows: [] }));
    const status = String(((current.rows ?? [])[0] as any)?.status ?? "");
    if (["cancelled", "confirmed", "booked"].includes(status)) {
      logger.info({ shopifyOrderId, phone, status }, "OnDrive: duplicate/late cancellation click ignored");
      return;
    }
  }

  /* Also update local shopify_orders status → cancelled */
  await db.execute(sql`
    UPDATE shopify_orders
    SET status = 'cancelled',
        tags = TRIM(BOTH ',' FROM CONCAT_WS(',', NULLIF(tags, ''), 'wa_cancelled')),
        updated_at = NOW()
    WHERE shopify_order_id = ${shopifyOrderId}
  `).catch(() => {});

  const orderRes = await db.execute(sql`SELECT order_number FROM shopify_orders WHERE shopify_order_id = ${shopifyOrderId} LIMIT 1`).catch(() => ({ rows: [] }));
  const orderNum = ((orderRes.rows ?? [])[0] as any)?.order_number ?? shopifyOrderId;

  /* ── PRIMARY: Use approved Meta template "order_cancelled" (1 param: order number) ── */
  const cancelTpl = await db.select()
    .from(whatsappTemplatesTable)
    .where(and(
      eq(whatsappTemplatesTable.approvalStatus, "approved"),
      eq(whatsappTemplatesTable.triggerEvent, "order_cancelled"),
    ))
    .limit(1)
    .catch(() => []);

  if (cancelTpl.length > 0) {
    const tpl = cancelTpl[0]!;
    const result = await sendWhatsAppTemplate({
      phone,
      templateName: tpl.name,
      languageCode: tpl.language ?? "en_US",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: orderNum },   /* {{1}} order number */
          ],
        },
      ],
    });
    if (result.success) {
      logger.info({ orderNum, phone, template: tpl.name }, "OnDrive: order_cancelled template sent successfully");
      return;
    }
    logger.warn({ error: result.error, template: tpl.name }, "OnDrive: order_cancelled template failed — falling back to plain text");
  }

  /* ── FALLBACK: plain text (within 24h session window) ── */
  await sendWhatsAppMessage({
    phone,
    message: `❌ *Order ${orderNum} Cancelled*\n\nWe've received your cancellation request. If this was a mistake, please contact us or visit our website.\n\nThank you for reaching out! 🥜`,
    templateName: "ondrive_cancelled_fallback",
  }).catch(() => {});
}

/* ═══════════════════════════════════════════════════════════════
   FULL ORDER AUTOMATION — triggered on Shopify orders/create webhook
   Smart routing: Lahore → local rider, Others → WA confirmation
═══════════════════════════════════════════════════════════════ */
export async function triggerNewOrderAutomation(params: {
  shopifyOrderDbId: number;
  shopifyOrderId: string;
  orderNumber: string;
  customerPhone: string | null;
  customerName: string | null;
  shippingAddress: any;
  totalPrice: string | null;
  financialStatus: string | null;
  lineItems: any[];
}): Promise<{ routed: "lahore_rider" | "wa_confirmation" | "skipped"; message: string }> {
  const { runShopifyOrderAutomation } = await import("./orderAutomationEngine.js");
  const result = await runShopifyOrderAutomation({
    ...params,
    source: "webhook",
  });
  return {
    routed: result.routed,
    message: result.message,
  };
}

/* ── Generate local tracking ID (when API not configured) ── */
function generateLocalTrackingId(courierSlug: string): string {
  const prefix: Record<string, string> = { tcs: "TCS", leopards: "LP", postex: "PX", trax: "TX" };
  const p = prefix[courierSlug] ?? "KDF";
  return `${p}${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 9999).toString().padStart(4, "0")}`;
}

export default {
  isConfirmationReply,
  isCancellationReply,
  calculateShipmentWeight,
  selectBestCourier,
  sendOrderConfirmationWA,
  sendTrackingUpdateWA,
  autoBookShipmentForOrder,
  processWhatsAppConfirmation,
  triggerNewOrderAutomation,
};
