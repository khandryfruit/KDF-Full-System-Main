/**
 * Premium Lahore rider-assigned delivery WhatsApp notifications — Khan Dry Fruits
 */
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendCtaUrlMessage,
  sendInteractiveButtons,
  getApprovedTemplate,
  getSettings,
} from "./whatsapp.js";
import { normalizePhone } from "./waPhone.js";
import { logger } from "./logger.js";

const BRAND = "Khan Dry Fruits";

export type DeliveryProgressStatus =
  | "preparing"
  | "assigned"
  | "picked"
  | "out_for_delivery"
  | "near_you"
  | "delivered";

export const STATUS_LABELS: Record<DeliveryProgressStatus, string> = {
  preparing: "Preparing your order",
  assigned: "Rider assigned",
  picked: "Picked up",
  out_for_delivery: "Out for delivery",
  near_you: "Rider is near you",
  delivered: "Delivered",
};

export function getPublicSiteBase(): string {
  const raw =
    process.env.PUBLIC_STORE_URL?.trim() ||
    process.env.PUBLIC_API_URL?.trim() ||
    "https://khanbabadryfruits.com";
  return raw.replace(/\/$/, "");
}

/** Live tracking pages are served by api-server (`/track/live/:token`). */
export function getTrackingPublicBase(): string {
  let raw = process.env.PUBLIC_API_URL?.trim() || process.env.API_PUBLIC_URL?.trim();
  if (!raw && process.env.RAILWAY_PUBLIC_DOMAIN) {
    const host = process.env.RAILWAY_PUBLIC_DOMAIN.replace(/^https?:\/\//, "");
    raw = `https://${host}`;
  }
  return (raw || "https://api.khanbabadryfruits.com").replace(/\/$/, "");
}

export function mapDeliveryStatus(status: string): DeliveryProgressStatus {
  switch (status) {
    case "pending":
    case "confirmed":
      return "preparing";
    case "assigned":
      return "assigned";
    case "picked":
    case "local_delivery":
      return "picked";
    case "in_transit":
    case "out_for_delivery":
      return "out_for_delivery";
    case "near_customer":
      return "near_you";
    case "delivered":
      return "delivered";
    default:
      return "assigned";
  }
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length < 6) return "***";
  return `***${d.slice(-4)}`;
}

function maskAddress(addr: string | null | undefined): string {
  if (!addr?.trim()) return "Lahore";
  const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  return `${parts[0]}, ${parts[parts.length - 1]}`;
}

function parseLineItems(order: Record<string, unknown>, delivery: Record<string, unknown>) {
  const raw = order?.line_items ?? delivery?.order_items ?? [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr.map((li: Record<string, unknown>) => ({
      name: String(li.title ?? li.name ?? "Item"),
      qty: Number(li.quantity ?? 1),
      variant: li.variant_title ?? li.variantTitle ?? null,
      price: Number(li.price ?? li.unit_price ?? 0),
    }));
  } catch {
    return [];
  }
}

function formatMoney(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString("en-PK")}`;
}

export function buildInvoiceSnapshot(order: Record<string, unknown>, delivery: Record<string, unknown>) {
  const items = parseLineItems(order, delivery);
  const subtotal = Number(order.subtotal_price ?? 0) || items.reduce((s, i) => s + i.price * i.qty, 0);
  const discounts = Number(order.total_discounts ?? 0);
  const total = Number(order.total_price ?? delivery.cod_amount ?? 0);
  const deliveryCharge = Math.max(0, total - subtotal + discounts);
  const isPaid = order.financial_status === "paid" || delivery.is_paid;
  const paymentMethod = isPaid ? "Paid Online" : "Cash on Delivery (COD)";

  return {
    orderNumber: String(order.order_number ?? delivery.shopify_order_number ?? "—"),
    customerName: String(delivery.customer_name ?? order.customer_name ?? "Customer"),
    orderDate: order.shopify_created_at ?? order.created_at ?? new Date().toISOString(),
    addressMasked: maskAddress(String(delivery.delivery_address ?? "")),
    items,
    subtotal,
    discounts,
    deliveryCharge,
    total,
    paymentMethod,
    codAmount: Number(delivery.cod_amount ?? 0),
    isPaid,
  };
}

export function computeEtaWindow(opts: {
  etaMinutes?: number | null;
  riderActiveCount?: number;
  riderLat?: number | null;
  riderLng?: number | null;
}): { label: string; from: Date; to: Date } {
  let mins = opts.etaMinutes ?? 45;
  if (opts.riderActiveCount && opts.riderActiveCount > 2) mins += Math.min(30, opts.riderActiveCount * 5);
  const from = new Date(Date.now() + Math.max(15, mins - 15) * 60_000);
  const to = new Date(Date.now() + (mins + 30) * 60_000);
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" });
  return { label: `${fmt(from)} – ${fmt(to)}`, from, to };
}

export async function createTrackingToken(deliveryId: number, shopifyOrderDbId: number): Promise<{
  token: string;
  url: string;
}> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.execute(sql`
    INSERT INTO delivery_track_tokens (token, delivery_id, shopify_order_db_id, expires_at)
    VALUES (${token}, ${deliveryId}, ${shopifyOrderDbId}, ${expiresAt.toISOString()})
  `);
  const url = `${getTrackingPublicBase()}/track/live/${token}`;
  return { token, url };
}

export async function revokeTrackingTokens(deliveryId: number): Promise<void> {
  await db.execute(sql`
    UPDATE delivery_track_tokens SET revoked_at = NOW() WHERE delivery_id = ${deliveryId} AND revoked_at IS NULL
  `);
}

function buildPremiumMessage(opts: {
  invoice: ReturnType<typeof buildInvoiceSnapshot>;
  rider: Record<string, unknown> | null;
  progress: DeliveryProgressStatus;
  eta: { label: string };
  trackingUrl: string;
  showRiderPhone: boolean;
  mapUrl?: string | null;
}): string {
  const { invoice, rider, progress, eta, trackingUrl, showRiderPhone, mapUrl } = opts;
  const progressIcon =
    progress === "delivered" ? "✅" : progress === "near_you" ? "📍" : progress === "out_for_delivery" ? "🚚" : "🛵";

  const itemLines = invoice.items
    .slice(0, 8)
    .map((i) => {
      const variant = i.variant ? ` (${i.variant})` : "";
      const lineTotal = i.price > 0 ? ` — ${formatMoney(i.price * i.qty)}` : "";
      return `• ${i.qty}× ${i.name}${variant}${lineTotal}`;
    })
    .join("\n");

  const discountLine =
    invoice.discounts > 0 ? `\n🏷️ *Discount:* −${formatMoney(invoice.discounts)}` : "";
  const deliveryLine =
    invoice.deliveryCharge > 0 ? `\n🚚 *Delivery:* ${formatMoney(invoice.deliveryCharge)}` : "";

  const riderName = rider?.name ? String(rider.name) : "Your delivery rider";
  const riderPhone = showRiderPhone && rider?.phone ? String(rider.phone) : null;
  const vehicle = rider?.vehicle_type ? String(rider.vehicle_type) : "bike";

  const orderTime = new Date(String(invoice.orderDate)).toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  });

  return (
    `✅ *Order Confirmed — ${BRAND}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `Hello *${invoice.customerName.split(" ")[0]}*! 👋\n\n` +
    `${progressIcon} *${STATUS_LABELS[progress]}*\n\n` +
    `🧾 *Order ID:* ${invoice.orderNumber}\n` +
    `📅 *Placed:* ${orderTime}\n` +
    `📍 *Deliver to:* ${invoice.addressMasked}\n\n` +
    `*🛵 Rider Assigned*\n` +
    `👤 ${riderName}\n` +
    (riderPhone ? `📞 ${riderPhone}\n` : "") +
    `🛵 Vehicle: ${vehicle}\n\n` +
    `⏱️ *Expected delivery:*\n${eta.label}\n\n` +
    `*🧾 Order Summary*\n` +
    `${itemLines || "• See invoice on tracking page"}\n` +
    `${discountLine}${deliveryLine}\n` +
    `💰 *Total:* *${formatMoney(invoice.total)}*\n` +
    `💳 *Payment:* ${invoice.isPaid ? "Paid ✅" : `COD — ${formatMoney(invoice.codAmount)}`}\n\n` +
    `📍 *Live tracking:*\n${trackingUrl}\n` +
    (mapUrl ? `🗺️ *Map:* ${mapUrl}\n` : "") +
    `\n━━━━━━━━━━━━━━━━━━━\n` +
    `Thank you for choosing *${BRAND}* 🌰`
  ).slice(0, 3800);
}

async function getPremiumSettings(): Promise<{
  premiumWaOnAssign: boolean;
  showRiderPhone: boolean;
  defaultEtaMinutes: number;
}> {
  try {
    const rows = await db.execute(sql`
      SELECT
        COALESCE(premium_wa_on_assign, true) AS premium_wa_on_assign,
        COALESCE(show_rider_phone_to_customer, true) AS show_rider_phone,
        COALESCE(default_eta_minutes, 45) AS default_eta_minutes
      FROM rider_delivery_settings WHERE id = 1 LIMIT 1
    `);
    const r = rows.rows[0] as Record<string, unknown> | undefined;
    if (r) {
      return {
        premiumWaOnAssign: Boolean(r.premium_wa_on_assign),
        showRiderPhone: Boolean(r.show_rider_phone),
        defaultEtaMinutes: Number(r.default_eta_minutes) || 45,
      };
    }
  } catch { /* columns may not exist yet */ }
  return { premiumWaOnAssign: true, showRiderPhone: true, defaultEtaMinutes: 45 };
}

async function logNotification(row: {
  deliveryId: number;
  shopifyOrderDbId: number;
  phone: string;
  trackingToken: string;
  trackingUrl: string;
  invoice: Record<string, unknown>;
  status: string;
  waMessageId?: string;
  errorMessage?: string;
  templateName?: string;
  messagePreview?: string;
}): Promise<number> {
  const ins = await db.execute(sql`
    INSERT INTO delivery_wa_notifications (
      delivery_id, shopify_order_db_id, event_type, phone, status,
      wa_message_id, template_name, message_preview, tracking_token, tracking_url,
      invoice_snapshot, error_message, sent_at, updated_at
    ) VALUES (
      ${row.deliveryId},
      ${row.shopifyOrderDbId},
      'rider_assigned',
      ${row.phone},
      ${row.status},
      ${row.waMessageId ?? null},
      ${row.templateName ?? "premium_rider_assigned"},
      ${(row.messagePreview ?? "").slice(0, 500)},
      ${row.trackingToken},
      ${row.trackingUrl},
      ${JSON.stringify(row.invoice)}::jsonb,
      ${row.errorMessage ?? null},
      ${row.status === "sent" ? sql`NOW()` : null},
      NOW()
    )
    RETURNING id
  `);
  return Number((ins.rows[0] as { id: number })?.id ?? 0);
}

async function updateNotificationStatus(
  id: number,
  patch: { status?: string; waMessageId?: string; errorMessage?: string; retryCount?: number },
): Promise<void> {
  await db.execute(sql`
    UPDATE delivery_wa_notifications SET
      status = COALESCE(${patch.status ?? null}, status),
      wa_message_id = COALESCE(${patch.waMessageId ?? null}, wa_message_id),
      error_message = COALESCE(${patch.errorMessage ?? null}, error_message),
      retry_count = COALESCE(${patch.retryCount ?? null}, retry_count),
      sent_at = CASE WHEN ${patch.status ?? ""} = 'sent' THEN NOW() ELSE sent_at END,
      updated_at = NOW()
    WHERE id = ${id}
  `);
}

export async function sendPremiumRiderAssignedNotification(opts: {
  deliveryId: number;
  shopifyOrderDbId: number;
  order: Record<string, unknown>;
  delivery: Record<string, unknown>;
  rider: Record<string, unknown> | null;
  etaMinutes?: number | null;
  force?: boolean;
}): Promise<{ success: boolean; notificationId?: number; error?: string }> {
  const settings = await getPremiumSettings();
  if (!settings.premiumWaOnAssign && !opts.force) {
    return { success: false, error: "Premium WA disabled in settings" };
  }

  const phoneRaw = String(opts.delivery.customer_phone ?? opts.order.customer_phone ?? "");
  if (!phoneRaw) return { success: false, error: "No customer phone" };

  const phone = normalizePhone(phoneRaw);

  /* Skip duplicate within 2h unless forced */
  if (!opts.force) {
    const dup = await db.execute(sql`
      SELECT id FROM delivery_wa_notifications
      WHERE delivery_id = ${opts.deliveryId}
        AND event_type = 'rider_assigned'
        AND status IN ('sent', 'delivered', 'read')
        AND created_at > NOW() - INTERVAL '2 hours'
      LIMIT 1
    `);
    if (dup.rows.length) return { success: true, error: "Already sent recently" };
  }

  const invoice = buildInvoiceSnapshot(opts.order, opts.delivery);
  const { token, url: trackingUrl } = await createTrackingToken(opts.deliveryId, opts.shopifyOrderDbId);

  let riderActiveCount = 0;
  if (opts.rider?.id) {
    const ac = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM rider_deliveries
      WHERE rider_id = ${opts.rider.id} AND status NOT IN ('delivered','returned','failed','cancelled')
    `);
    riderActiveCount = Number((ac.rows[0] as { c: number })?.c ?? 0);
  }

  const eta = computeEtaWindow({
    etaMinutes: opts.etaMinutes ?? settings.defaultEtaMinutes,
    riderActiveCount,
    riderLat: opts.rider?.location_lat != null ? Number(opts.rider.location_lat) : null,
    riderLng: opts.rider?.location_lng != null ? Number(opts.rider.location_lng) : null,
  });

  const lat = opts.rider?.location_lat != null ? Number(opts.rider.location_lat) : null;
  const lng = opts.rider?.location_lng != null ? Number(opts.rider.location_lng) : null;
  const mapUrl =
    lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;

  const progress = mapDeliveryStatus(String(opts.delivery.status ?? "assigned"));
  const bodyText = buildPremiumMessage({
    invoice,
    rider: opts.rider,
    progress,
    eta,
    trackingUrl,
    showRiderPhone: settings.showRiderPhone,
    mapUrl,
  });

  const notifId = await logNotification({
    deliveryId: opts.deliveryId,
    shopifyOrderDbId: opts.shopifyOrderDbId,
    phone,
    trackingToken: token,
    trackingUrl,
    invoice: invoice as unknown as Record<string, unknown>,
    status: "pending",
    messagePreview: bodyText.slice(0, 200),
  });

  try {
    const tpl = await getApprovedTemplate("rider_assigned");
    if (tpl && tpl.paramCount >= 2) {
      const tplResult = await sendWhatsAppTemplate({
        phone,
        templateName: tpl.name,
        languageCode: tpl.language,
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: invoice.customerName.split(" ")[0]! },
              { type: "text", text: invoice.orderNumber },
              { type: "text", text: opts.rider?.name ? String(opts.rider.name) : "our rider" },
              { type: "text", text: eta.label },
            ].slice(0, tpl.paramCount),
          },
        ],
      });
      if (tplResult.success) {
        await sendCtaUrlMessage({
          phone,
          text: `📍 *Track your order live*\n\nOrder *${invoice.orderNumber}* — ${BRAND}`,
          buttonText: "Track Live",
          url: trackingUrl,
          templateName: "premium_track_cta",
        }).catch(() => {});
        await updateNotificationStatus(notifId, { status: "sent", waMessageId: tplResult.messageId });
        await db.execute(sql`
          UPDATE rider_deliveries SET customer_wa_assigned_at = NOW(), updated_at = NOW()
          WHERE id = ${opts.deliveryId}
        `).catch(() => {});
        return { success: true, notificationId: notifId };
      }
    }

    const ctaOk = await sendCtaUrlMessage({
      phone,
      text: bodyText.slice(0, 1020),
      buttonText: "Track Live 📍",
      url: trackingUrl,
      templateName: "premium_rider_assigned",
    });

    if (!ctaOk) {
      const textOk = await sendWhatsAppMessage({
        phone,
        message: bodyText,
        templateName: "premium_rider_assigned",
      });
      if (!textOk) {
        await updateNotificationStatus(notifId, { status: "failed", errorMessage: "Meta API rejected message" });
        return { success: false, notificationId: notifId, error: "Send failed" };
      }
    }

    const buttons: Array<{ id: string; title: string }> = [{ id: "main_menu", title: "💬 Support" }];
    if (settings.showRiderPhone && opts.rider?.phone) {
      /* wa.me link in follow-up text — reply buttons cannot open dialer */
      await sendWhatsAppMessage({
        phone,
        message: `📞 *Contact rider:* ${opts.rider.phone}\n🧾 Tracking: ${trackingUrl}`,
        templateName: "premium_rider_contact",
      }).catch(() => {});
    } else {
      const waSettings = await getSettings();
      if (waSettings) {
        await sendInteractiveButtons({
          phone,
          text: `Need help with order *${invoice.orderNumber}*?`,
          buttons,
          footer: BRAND,
          settings: waSettings,
          templateName: "premium_rider_buttons",
        }).catch(() => {});
      }
    }

    await updateNotificationStatus(notifId, { status: "sent" });
    await db.execute(sql`
      UPDATE rider_deliveries SET customer_wa_assigned_at = NOW(), updated_at = NOW() WHERE id = ${opts.deliveryId}
    `).catch(() => {});

    return { success: true, notificationId: notifId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateNotificationStatus(notifId, { status: "failed", errorMessage: msg });
    logger.error({ err, deliveryId: opts.deliveryId }, "premium delivery WA failed");
    return { success: false, notificationId: notifId, error: msg };
  }
}

export async function resendPremiumNotification(notificationId: number): Promise<{ success: boolean; error?: string }> {
  const rows = await db.execute(sql`
    SELECT n.*, d.*, o.*
    FROM delivery_wa_notifications n
    JOIN rider_deliveries d ON d.id = n.delivery_id
    LEFT JOIN shopify_orders o ON o.id = n.shopify_order_db_id
    WHERE n.id = ${notificationId}
    LIMIT 1
  `);
  if (!rows.rows.length) return { success: false, error: "Notification not found" };
  const row = rows.rows[0] as Record<string, unknown>;
  const riderRows = row.rider_id
    ? await db.execute(sql`SELECT * FROM riders WHERE id = ${row.rider_id} LIMIT 1`)
    : { rows: [] };
  const rider = (riderRows.rows[0] as Record<string, unknown>) ?? null;

  await db.execute(sql`
    UPDATE delivery_wa_notifications SET retry_count = retry_count + 1, status = 'pending', updated_at = NOW()
    WHERE id = ${notificationId}
  `);

  return sendPremiumRiderAssignedNotification({
    deliveryId: Number(row.delivery_id),
    shopifyOrderDbId: Number(row.shopify_order_db_id),
    order: row,
    delivery: row,
    rider,
    force: true,
  });
}

export async function processFailedDeliveryWaRetries(): Promise<void> {
  const rows = await db.execute(sql`
    SELECT id FROM delivery_wa_notifications
    WHERE status = 'failed'
      AND retry_count < 3
      AND created_at > NOW() - INTERVAL '48 hours'
    ORDER BY created_at ASC
    LIMIT 10
  `);
  for (const r of rows.rows as { id: number }[]) {
    await resendPremiumNotification(r.id).catch((err) =>
      logger.warn({ err, id: r.id }, "delivery WA retry failed"),
    );
  }
}

export async function markDeliveryWaFromWebhook(waMessageId: string, deliveryStatus: string): Promise<void> {
  const statusMap: Record<string, string> = {
    sent: "sent",
    delivered: "delivered",
    read: "read",
    failed: "failed",
  };
  const st = statusMap[deliveryStatus];
  if (!st) return;
  await db.execute(sql`
    UPDATE delivery_wa_notifications SET
      status = ${st},
      delivered_at = CASE WHEN ${st} = 'delivered' THEN NOW() ELSE delivered_at END,
      read_at = CASE WHEN ${st} = 'read' THEN NOW() ELSE read_at END,
      updated_at = NOW()
    WHERE wa_message_id = ${waMessageId}
  `);
}

export async function recordTrackingClick(token: string): Promise<void> {
  await db.execute(sql`
    UPDATE delivery_track_tokens SET click_count = click_count + 1, last_clicked_at = NOW()
    WHERE token = ${token} AND revoked_at IS NULL
  `);
  await db.execute(sql`
    UPDATE delivery_wa_notifications SET status = 'clicked', clicked_at = NOW(), updated_at = NOW()
    WHERE tracking_token = ${token} AND clicked_at IS NULL
  `);
}
