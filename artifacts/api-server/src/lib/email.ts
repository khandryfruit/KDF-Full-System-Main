/**
 * KDF NUTS — Transactional Email Engine
 *
 * All email automations funnel through this module:
 *   sendEmail()           — core send + log function
 *   sendOrderConfirmationEmail()
 *   sendOrderPaidEmail()
 *   sendOrderCancelledEmail()
 *   sendCourierBookedEmail()
 *   sendRiderAssignedEmail()
 *   sendOutForDeliveryEmail()
 *   sendDeliveredEmail()
 *   sendRefundEmail()
 */

import nodemailer from "nodemailer";
import { db, emailSettingsTable, emailLogsTable } from "@workspace/db";
import { logger } from "./logger.js";

/* ─── Types ──────────────────────────────────────────────────── */

export interface OrderEmailData {
  orderNumber:    string;
  customerName:   string;
  customerEmail?: string;
  phone?:         string;
  city?:          string;
  address?:       string;
  paymentMethod?: string;
  items?:         Array<{ name: string; variant?: string; price: number; qty: number }>;
  subtotal?:      number;
  deliveryFee?:   number;
  total?:         number;
  trackingId?:    string;
  courierName?:   string;
  trackingUrl?:   string;
  riderName?:     string;
  riderPhone?:    string;
  refundAmount?:  number;
  orderId?:       number;
}

type EmailType =
  | "order_confirm"
  | "order_paid"
  | "order_cancelled"
  | "courier_booked"
  | "rider_assigned"
  | "out_for_delivery"
  | "delivered"
  | "refund"
  | "invoice"
  | "test";

/* ─── Transport ──────────────────────────────────────────────── */

async function getSettings() {
  const [s] = await db.select().from(emailSettingsTable).limit(1);
  return s ?? null;
}

/**
 * Resolves the correct FROM address.
 * Rule: smtpFrom must share the same domain as smtpUser (Titan SMTP requirement).
 * If smtpFrom is a Gmail / mismatched domain → fall back to smtpUser.
 */
function resolveFrom(smtpUser: string, smtpFrom?: string | null): string {
  if (!smtpFrom) return smtpUser;
  try {
    const fromDomain = smtpFrom.split("@")[1]?.toLowerCase();
    const userDomain = smtpUser.split("@")[1]?.toLowerCase();
    if (!fromDomain || !userDomain || fromDomain !== userDomain) {
      logger.warn({ smtpFrom, smtpUser }, "email: FROM domain mismatch — using smtpUser as FROM");
      return smtpUser;
    }
    return smtpFrom;
  } catch {
    return smtpUser;
  }
}

/**
 * Builds a nodemailer transporter with production-safe settings for Titan SMTP.
 * Tries the configured port; caller can override port/secure for fallback.
 */
function buildTransport(s: {
  smtpHost: string;
  smtpUser: string;
  smtpPass: string;
  smtpPort?: number | null;
}, overridePort?: number) {
  const port   = overridePort ?? s.smtpPort ?? 587;
  const secure = port === 465;
  return nodemailer.createTransport({
    host:               s.smtpHost,
    port,
    secure,
    auth:               { user: s.smtpUser, pass: s.smtpPass },
    connectionTimeout:  30_000,
    greetingTimeout:    20_000,
    socketTimeout:      30_000,
    tls: {
      rejectUnauthorized: false,
      minVersion:         "TLSv1.2",
    },
    ...(secure ? {} : { requireTLS: true }),
  } as any);
}

/**
 * Returns a verified transport, attempting port 465 → 587 fallback.
 * Never throws — returns null if SMTP is not configured or both ports fail.
 */
async function getTransport(): Promise<{
  transport: nodemailer.Transporter;
  from: string;
  settings: NonNullable<Awaited<ReturnType<typeof getSettings>>>;
} | null> {
  const s = await getSettings();
  if (!s?.emailEnabled || !s.smtpHost || !s.smtpUser || !s.smtpPass) return null;

  const from      = resolveFrom(s.smtpUser, s.smtpFrom);
  const primary   = s.smtpPort ?? 587;
  const fallback  = primary === 465 ? 587 : 465;

  for (const port of [primary, fallback]) {
    try {
      const transport = buildTransport(s, port);
      await transport.verify();
      logger.info({ host: s.smtpHost, port }, "SMTP connected and verified");
      return { transport, from, settings: s };
    } catch (err: any) {
      logger.warn({ host: s.smtpHost, port, err: err?.message }, `SMTP port ${port} failed — ${port === fallback ? "giving up" : "trying fallback"}`);
    }
  }
  return null;
}

/* ─── Logger ─────────────────────────────────────────────────── */

async function logEmail(opts: {
  type:         EmailType;
  to:           string;
  subject:      string;
  status:       "sent" | "failed";
  errorMessage?: string;
  orderId?:     number;
  orderNumber?: string;
}) {
  try {
    await db.insert(emailLogsTable).values({
      type:         opts.type,
      to:           opts.to,
      subject:      opts.subject,
      status:       opts.status,
      errorMessage: opts.errorMessage ?? null,
      orderId:      opts.orderId ?? null,
      orderNumber:  opts.orderNumber ?? null,
    });
  } catch (e) {
    logger.warn({ err: e }, "email: could not write log entry");
  }
}

/* ─── Core Send ──────────────────────────────────────────────── */

/**
 * Production-safe sendEmail — never throws, never crashes the server.
 * Retries once on transient SMTP errors (ETIMEDOUT, ECONNRESET, greeting).
 */
async function sendEmail(opts: {
  type:         EmailType;
  to:           string;
  subject:      string;
  html:         string;
  orderId?:     number;
  orderNumber?: string;
}): Promise<boolean> {
  let conn: Awaited<ReturnType<typeof getTransport>>;
  try {
    conn = await getTransport();
  } catch (err: any) {
    logger.error({ type: opts.type, err: err?.message }, "email: getTransport() threw unexpectedly");
    conn = null;
  }

  if (!conn) {
    logger.warn({ type: opts.type, to: opts.to }, "email: SMTP not configured or unreachable — skipping");
    return false;
  }

  const TRANSIENT = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|greeting|socket|timeout/i;
  const MAX_RETRIES = 2;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await conn.transport.sendMail({
        from:    conn.from,
        to:      opts.to,
        subject: opts.subject,
        html:    opts.html,
      });
      logger.info({ type: opts.type, to: opts.to, subject: opts.subject, attempt }, "Mail Sent ✓");
      await logEmail({ type: opts.type, to: opts.to, subject: opts.subject, status: "sent", orderId: opts.orderId, orderNumber: opts.orderNumber });
      return true;
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (attempt < MAX_RETRIES && TRANSIENT.test(msg)) {
        logger.warn({ type: opts.type, to: opts.to, attempt, err: msg }, "email: transient error — Retry Triggered");
        await new Promise(r => setTimeout(r, 2000 * attempt));
        continue;
      }
      logger.error({ type: opts.type, to: opts.to, err: msg }, "SMTP Failed ✗");
      await logEmail({ type: opts.type, to: opts.to, subject: opts.subject, status: "failed", errorMessage: msg, orderId: opts.orderId, orderNumber: opts.orderNumber });
      return false;
    }
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════
   SHARED LAYOUT HELPERS
═══════════════════════════════════════════════════════════════ */

function emailShell(opts: {
  title:       string;
  previewText?: string;
  body:        string;
  accent?:     string;
}): string {
  const accent = opts.accent ?? "#5FA800";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${opts.title}</title>
${opts.previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${opts.previewText}</div>` : ""}
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f4;padding:32px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,${accent} 0%,${accent}cc 100%);padding:32px 40px;text-align:center">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-0.5px;font-family:'Helvetica Neue',Arial,sans-serif">KDF NUTS</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;font-weight:400">Pakistan's Premium Dry Fruits Store</p>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:36px 40px">
        ${opts.body}
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f8f9fa;padding:24px 40px;text-align:center;border-top:1px solid #eee">
        <p style="margin:0 0 4px;color:#999;font-size:12px">© ${new Date().getFullYear()} KDF NUTS · Pakistan's Premium Dry Fruits Store</p>
        <p style="margin:0;color:#ccc;font-size:11px">This email was sent automatically — please do not reply.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function statusBadge(label: string, color: string): string {
  return `<span style="display:inline-block;background:${color};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase">${label}</span>`;
}

function orderSummaryTable(data: OrderEmailData): string {
  const items = data.items ?? [];
  if (!items.length) return "";
  const rows = items.map(it => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#333;font-size:14px">
        <strong>${it.name}</strong>${it.variant ? ` <span style="color:#999;font-size:12px">(${it.variant})</span>` : ""}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:center;color:#555;font-size:14px">${it.qty}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right;color:#333;font-size:14px;font-weight:600">Rs.&nbsp;${(it.price * it.qty).toLocaleString()}</td>
    </tr>`).join("");

  return `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #eee;border-radius:10px;overflow:hidden;margin-bottom:24px">
  <thead><tr style="background:#f8f9fa">
    <th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;text-transform:uppercase;font-weight:600;letter-spacing:0.5px">Product</th>
    <th style="padding:10px 14px;text-align:center;font-size:11px;color:#999;text-transform:uppercase;font-weight:600;letter-spacing:0.5px">Qty</th>
    <th style="padding:10px 14px;text-align:right;font-size:11px;color:#999;text-transform:uppercase;font-weight:600;letter-spacing:0.5px">Price</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px">
  <tr><td style="padding:5px 0;color:#777;font-size:14px">Subtotal</td><td style="padding:5px 0;text-align:right;color:#555;font-size:14px">Rs.&nbsp;${(data.subtotal ?? 0).toLocaleString()}</td></tr>
  <tr><td style="padding:5px 0;color:#777;font-size:14px">Delivery</td><td style="padding:5px 0;text-align:right;color:#555;font-size:14px">Rs.&nbsp;${(data.deliveryFee ?? 0).toLocaleString()}</td></tr>
  <tr>
    <td style="padding:10px 0 5px;font-weight:700;font-size:16px;border-top:2px solid #eee;color:#1a1a1a">Total</td>
    <td style="padding:10px 0 5px;text-align:right;font-weight:700;font-size:16px;border-top:2px solid #eee;color:#5FA800">Rs.&nbsp;${(data.total ?? 0).toLocaleString()}</td>
  </tr>
</table>`;
}

function deliveryBox(data: OrderEmailData): string {
  if (!data.address && !data.city) return "";
  return `
<div style="background:#f0f8e8;border:1px solid #c8e6a0;border-radius:10px;padding:16px 20px;margin-bottom:24px">
  <p style="margin:0 0 8px;font-weight:700;color:#1a1a1a;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Delivery Details</p>
  <p style="margin:0;color:#444;font-size:14px;line-height:1.7">
    ${data.customerName}${data.phone ? `<br>${data.phone}` : ""}${data.address ? `<br>${data.address}` : ""}${data.city ? `, ${data.city}` : ""}
  </p>
  ${data.paymentMethod ? `<p style="margin:8px 0 0;font-size:13px;color:#777">Payment: ${data.paymentMethod === "cod" ? "Cash on Delivery" : data.paymentMethod === "bank_transfer" ? "Bank Transfer" : data.paymentMethod}</p>` : ""}
</div>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;color:#888;font-size:13px;width:140px;vertical-align:top">${label}</td>
    <td style="padding:8px 0;color:#1a1a1a;font-size:14px;font-weight:600">${value}</td>
  </tr>`;
}

/* ═══════════════════════════════════════════════════════════════
   1. ORDER CONFIRMATION
═══════════════════════════════════════════════════════════════ */

export async function sendOrderConfirmationEmail(data: OrderEmailData): Promise<void> {
  if (!data.customerEmail) return;
  const s = await getSettings();
  if (!s?.orderConfirmEnabled) return;
  const subject = (s.orderConfirmSubject || "Your KDF Nuts Order Confirmation")
    .replace(/\{\{orderNumber\}\}/g, data.orderNumber);

  const body = `
<h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:800">Order Confirmed! 🎉</h2>
<p style="color:#555;margin:0 0 24px;font-size:15px;line-height:1.6">Hi <strong>${data.customerName}</strong>, thank you for your order! We've received it and will process it shortly.</p>

<div style="background:#f8f9fa;border-radius:10px;padding:16px 20px;margin-bottom:24px">
  <p style="margin:0;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Order Number</p>
  <p style="margin:4px 0 0;font-size:24px;font-weight:900;color:#5FA800;font-family:monospace">${data.orderNumber}</p>
</div>

${orderSummaryTable(data)}
${deliveryBox(data)}
<p style="color:#888;font-size:13px;line-height:1.7;margin:0">Our team will confirm your order shortly. For questions, WhatsApp us or reply to this email.</p>`;

  await sendEmail({ type: "order_confirm", to: data.customerEmail, subject, html: emailShell({ title: subject, previewText: `Order ${data.orderNumber} confirmed! We're processing your order.`, body }), orderId: data.orderId, orderNumber: data.orderNumber });
}

/* ═══════════════════════════════════════════════════════════════
   2. ORDER PAID / PAYMENT CONFIRMED
═══════════════════════════════════════════════════════════════ */

export async function sendOrderPaidEmail(data: OrderEmailData): Promise<void> {
  if (!data.customerEmail) return;
  const s = await getSettings();
  if (!s?.orderPaidEnabled) return;
  const subject = (s.orderPaidSubject || "Payment Confirmed — KDF Nuts Order #{{orderNumber}}")
    .replace(/\{\{orderNumber\}\}/g, data.orderNumber);

  const body = `
<h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:800">Payment Confirmed ✅</h2>
<p style="color:#555;margin:0 0 24px;font-size:15px;line-height:1.6">Hi <strong>${data.customerName}</strong>, your payment for order <strong>#${data.orderNumber}</strong> has been received and confirmed.</p>

<div style="background:#f0f8e8;border:1px solid #c8e6a0;border-radius:10px;padding:20px;margin-bottom:24px;text-align:center">
  ${statusBadge("Payment Confirmed", "#16a34a")}
  <p style="margin:12px 0 0;font-size:22px;font-weight:900;color:#16a34a">Rs.&nbsp;${(data.total ?? 0).toLocaleString()}</p>
  <p style="margin:4px 0 0;color:#666;font-size:13px">Order #${data.orderNumber}</p>
</div>

${deliveryBox(data)}
<p style="color:#888;font-size:13px;line-height:1.7;margin:0">Your order will be dispatched soon. You'll receive another email with tracking details once shipped.</p>`;

  await sendEmail({ type: "order_paid", to: data.customerEmail, subject, html: emailShell({ title: subject, previewText: `Payment of Rs.${data.total} confirmed for order #${data.orderNumber}`, body, accent: "#16a34a" }), orderId: data.orderId, orderNumber: data.orderNumber });
}

/* ═══════════════════════════════════════════════════════════════
   3. ORDER CANCELLED
═══════════════════════════════════════════════════════════════ */

export async function sendOrderCancelledEmail(data: OrderEmailData): Promise<void> {
  if (!data.customerEmail) return;
  const s = await getSettings();
  if (!s?.orderCancelledEnabled) return;
  const subject = (s.orderCancelledSubject || "Your KDF Nuts Order Has Been Cancelled")
    .replace(/\{\{orderNumber\}\}/g, data.orderNumber);

  const body = `
<h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:800">Order Cancelled</h2>
<p style="color:#555;margin:0 0 24px;font-size:15px;line-height:1.6">Hi <strong>${data.customerName}</strong>, we're letting you know that order <strong>#${data.orderNumber}</strong> has been cancelled.</p>

<div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:10px;padding:20px;margin-bottom:24px;text-align:center">
  ${statusBadge("Cancelled", "#dc2626")}
  <p style="margin:12px 0 0;color:#666;font-size:14px">Order #${data.orderNumber}</p>
  ${data.total ? `<p style="margin:4px 0 0;color:#888;font-size:13px">Total: Rs.&nbsp;${data.total.toLocaleString()}</p>` : ""}
</div>

<p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">If you paid online, a refund will be processed within 5–7 business days.</p>
<p style="color:#888;font-size:13px;line-height:1.7;margin:0">If you have any questions, please WhatsApp us or reply to this email. We're sorry for any inconvenience.</p>`;

  await sendEmail({ type: "order_cancelled", to: data.customerEmail, subject, html: emailShell({ title: subject, previewText: `Order #${data.orderNumber} has been cancelled.`, body, accent: "#dc2626" }), orderId: data.orderId, orderNumber: data.orderNumber });
}

/* ═══════════════════════════════════════════════════════════════
   4. COURIER BOOKED / ORDER DISPATCHED
═══════════════════════════════════════════════════════════════ */

export async function sendCourierBookedEmail(data: OrderEmailData): Promise<void> {
  if (!data.customerEmail) return;
  const s = await getSettings();
  if (!s?.courierBookedEnabled) return;
  const subject = (s.courierBookedSubject || "Your Order Is Dispatched — Tracking #{{trackingId}}")
    .replace(/\{\{orderNumber\}\}/g, data.orderNumber)
    .replace(/\{\{trackingId\}\}/g, data.trackingId ?? "");

  const body = `
<h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:800">Your Order Is On Its Way! 🚚</h2>
<p style="color:#555;margin:0 0 24px;font-size:15px;line-height:1.6">Hi <strong>${data.customerName}</strong>, great news! Order <strong>#${data.orderNumber}</strong> has been dispatched.</p>

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f8f9fa;border-radius:10px;padding:20px;margin-bottom:24px">
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      ${data.trackingId ? infoRow("Tracking ID", data.trackingId) : ""}
      ${data.courierName ? infoRow("Courier", data.courierName) : ""}
      ${infoRow("Order", `#${data.orderNumber}`)}
    </table>
    ${data.trackingUrl ? `<div style="margin-top:16px;text-align:center"><a href="${data.trackingUrl}" style="display:inline-block;background:#5FA800;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">Track Your Order →</a></div>` : ""}
  </td></tr>
</table>

${deliveryBox(data)}
<p style="color:#888;font-size:13px;line-height:1.7;margin:0">Your order is expected to arrive within 1–3 business days. For updates, use the tracking link above or contact us on WhatsApp.</p>`;

  await sendEmail({ type: "courier_booked", to: data.customerEmail, subject, html: emailShell({ title: subject, previewText: `Your order #${data.orderNumber} is on its way! Track it now.`, body }), orderId: data.orderId, orderNumber: data.orderNumber });
}

/* ═══════════════════════════════════════════════════════════════
   5. RIDER ASSIGNED
═══════════════════════════════════════════════════════════════ */

export async function sendRiderAssignedEmail(data: OrderEmailData): Promise<void> {
  if (!data.customerEmail) return;
  const s = await getSettings();
  if (!s?.riderAssignedEnabled) return;
  const subject = (s.riderAssignedSubject || "Rider Assigned — Your KDF Nuts Order Is Coming")
    .replace(/\{\{orderNumber\}\}/g, data.orderNumber);

  const body = `
<h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:800">Rider Assigned 🛵</h2>
<p style="color:#555;margin:0 0 24px;font-size:15px;line-height:1.6">Hi <strong>${data.customerName}</strong>, a delivery rider has been assigned for your order <strong>#${data.orderNumber}</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f8f9fa;border-radius:10px;padding:20px;margin-bottom:24px">
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      ${data.riderName ? infoRow("Rider Name", data.riderName) : ""}
      ${data.riderPhone ? infoRow("Rider Phone", data.riderPhone) : ""}
      ${infoRow("Order", `#${data.orderNumber}`)}
    </table>
  </td></tr>
</table>

${deliveryBox(data)}
<p style="color:#888;font-size:13px;line-height:1.7;margin:0">Your rider will contact you shortly before delivery. Please keep your phone reachable. For assistance, WhatsApp us.</p>`;

  await sendEmail({ type: "rider_assigned", to: data.customerEmail, subject, html: emailShell({ title: subject, previewText: `Your order #${data.orderNumber} has a rider assigned. Delivery coming soon!`, body }), orderId: data.orderId, orderNumber: data.orderNumber });
}

/* ═══════════════════════════════════════════════════════════════
   6. OUT FOR DELIVERY
═══════════════════════════════════════════════════════════════ */

export async function sendOutForDeliveryEmail(data: OrderEmailData): Promise<void> {
  if (!data.customerEmail) return;
  const s = await getSettings();
  if (!s?.outForDeliveryEnabled) return;
  const subject = (s.outForDeliverySubject || "Your Order Is Out For Delivery Today!")
    .replace(/\{\{orderNumber\}\}/g, data.orderNumber);

  const body = `
<h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:800">Out For Delivery! 🚀</h2>
<p style="color:#555;margin:0 0 24px;font-size:15px;line-height:1.6">Hi <strong>${data.customerName}</strong>, your order <strong>#${data.orderNumber}</strong> is out for delivery and will arrive today!</p>

<div style="background:linear-gradient(135deg,#f0f8e8,#e8f5d4);border:1px solid #c8e6a0;border-radius:12px;padding:24px;margin-bottom:24px;text-align:center">
  <p style="margin:0;font-size:48px">🚚</p>
  <p style="margin:8px 0 0;font-weight:800;font-size:18px;color:#1a1a1a">On Its Way!</p>
  <p style="margin:4px 0 0;color:#555;font-size:14px">Order #${data.orderNumber}</p>
  ${data.riderName ? `<p style="margin:8px 0 0;color:#5FA800;font-size:13px;font-weight:600">Rider: ${data.riderName}${data.riderPhone ? ` · ${data.riderPhone}` : ""}</p>` : ""}
</div>

${deliveryBox(data)}
<p style="color:#888;font-size:13px;line-height:1.7;margin:0">Please be available to receive your order. If our rider cannot reach you, they will call before returning.</p>`;

  await sendEmail({ type: "out_for_delivery", to: data.customerEmail, subject, html: emailShell({ title: subject, previewText: `Your KDF Nuts order #${data.orderNumber} is arriving today! 🚚`, body }), orderId: data.orderId, orderNumber: data.orderNumber });
}

/* ═══════════════════════════════════════════════════════════════
   7. DELIVERED
═══════════════════════════════════════════════════════════════ */

export async function sendDeliveredEmail(data: OrderEmailData): Promise<void> {
  if (!data.customerEmail) return;
  const s = await getSettings();
  if (!s?.deliveredEnabled) return;
  const subject = (s.deliveredSubject || "Order Delivered — Thank You! 🎉")
    .replace(/\{\{orderNumber\}\}/g, data.orderNumber);

  const body = `
<h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:800">Order Delivered! 🎉</h2>
<p style="color:#555;margin:0 0 24px;font-size:15px;line-height:1.6">Hi <strong>${data.customerName}</strong>, your order <strong>#${data.orderNumber}</strong> has been successfully delivered. Enjoy your premium dry fruits!</p>

<div style="background:linear-gradient(135deg,#f0f8e8,#e8f5d4);border:1px solid #c8e6a0;border-radius:12px;padding:28px;margin-bottom:28px;text-align:center">
  <p style="margin:0;font-size:56px">🌰</p>
  <p style="margin:10px 0 0;font-weight:900;font-size:20px;color:#5FA800">Delivered!</p>
  <p style="margin:4px 0 0;color:#555;font-size:13px">Order #${data.orderNumber} · ${new Date().toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}</p>
</div>

<p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 16px">We hope you love our products! Please share your experience with a review — it helps other customers and means a lot to us.</p>
<div style="text-align:center;margin-bottom:24px">
  <a href="https://khanbabadryfruits.com/reviews" style="display:inline-block;background:#5FA800;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">Leave a Review →</a>
</div>
<p style="color:#888;font-size:13px;line-height:1.7;margin:0">Thank you for choosing KDF NUTS. We look forward to serving you again! 🌰</p>`;

  await sendEmail({ type: "delivered", to: data.customerEmail, subject, html: emailShell({ title: subject, previewText: `Your KDF Nuts order #${data.orderNumber} has been delivered. Thank you!`, body }), orderId: data.orderId, orderNumber: data.orderNumber });
}

/* ═══════════════════════════════════════════════════════════════
   8. REFUND PROCESSED
═══════════════════════════════════════════════════════════════ */

export async function sendRefundEmail(data: OrderEmailData): Promise<void> {
  if (!data.customerEmail) return;
  const s = await getSettings();
  if (!s?.refundEnabled) return;
  const subject = (s.refundSubject || "Refund Processed — KDF Nuts Order #{{orderNumber}}")
    .replace(/\{\{orderNumber\}\}/g, data.orderNumber);

  const body = `
<h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:800">Refund Processed 💰</h2>
<p style="color:#555;margin:0 0 24px;font-size:15px;line-height:1.6">Hi <strong>${data.customerName}</strong>, your refund for order <strong>#${data.orderNumber}</strong> has been processed.</p>

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f8f9fa;border-radius:10px;padding:20px;margin-bottom:24px">
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      ${infoRow("Order", `#${data.orderNumber}`)}
      ${data.refundAmount != null ? infoRow("Refund Amount", `Rs. ${data.refundAmount.toLocaleString()}`) : data.total != null ? infoRow("Refund Amount", `Rs. ${data.total.toLocaleString()}`) : ""}
      ${infoRow("Timeline", "5–7 business days")}
    </table>
  </td></tr>
</table>

<p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 12px">The refund will be credited to your original payment method within 5–7 business days.</p>
<p style="color:#888;font-size:13px;line-height:1.7;margin:0">If you have any questions about your refund, please WhatsApp us or reply to this email.</p>`;

  await sendEmail({ type: "refund", to: data.customerEmail, subject, html: emailShell({ title: subject, previewText: `Your refund for order #${data.orderNumber} has been processed.`, body, accent: "#7c3aed" }), orderId: data.orderId, orderNumber: data.orderNumber });
}

/* ─── Legacy export alias (for existing chat.ts usage) ───────── */
export { sendOrderConfirmationEmail as sendOrderConfirmation };
