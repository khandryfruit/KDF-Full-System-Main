/**
 * Rider Daily Collection & Delivery Reporting System
 * Sends daily reports via WhatsApp + Email at 8 PM PKT (15:00 UTC)
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { sendWhatsAppMessage } from "./whatsapp.js";
import nodemailer from "nodemailer";
import { emailSettingsTable } from "@workspace/db";

/* ─── Constants ─────────────────────────────────────── */
const REPORT_WA_PHONE    = "03040424252";
const REPORT_EMAILS      = ["kdfmarts@gmail.com", "khandryfruit.pk@gmail.com"];
const REPORT_HOUR_UTC    = 15; /* 8 PM PKT = 15:00 UTC */

/* ─── Types ─────────────────────────────────────────── */
export interface RiderReportRow {
  id:                number;
  name:              string;
  phone:             string;
  delivery_area:     string | null;
  status:            string;
  delivered:         number;
  pending:           number;
  failed:            number;
  returned:          number;
  cod_collected:     number;
  paid_orders:       number;
  zero_amount_orders: number;
  total_settled:     number;
  settlement_pending: number;
  total_assignments: number;
}

export interface DailyReportData {
  date:    string;
  riders:  RiderReportRow[];
  totals: {
    delivered:         number;
    pending:           number;
    failed:            number;
    returned:          number;
    cod_collected:     number;
    total_settled:     number;
    settlement_pending: number;
    total_assignments: number;
    paid_orders:       number;
    zero_amount_orders: number;
  };
}

/* ─── Query ─────────────────────────────────────────── */
export async function generateRiderDailyReport(date?: string): Promise<DailyReportData> {
  const reportDate = date ?? new Date().toISOString().slice(0, 10);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rider_cod_settlements (
      id SERIAL PRIMARY KEY, rider_id INTEGER NOT NULL, type TEXT NOT NULL DEFAULT 'full',
      amount NUMERIC(12,2) NOT NULL, notes TEXT, settled_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rider_report_logs (
      id         SERIAL PRIMARY KEY,
      report_date DATE NOT NULL,
      sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      wa_status  TEXT,
      email_status TEXT,
      report_data JSONB
    )
  `);

  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.name,
      r.phone,
      r.delivery_area,
      r.status,
      COUNT(d.id) FILTER (WHERE d.status = 'delivered')::int                                                             AS delivered,
      COUNT(d.id) FILTER (WHERE d.status NOT IN ('delivered','returned','failed'))::int                                  AS pending,
      COUNT(d.id) FILTER (WHERE d.status = 'failed')::int                                                                AS failed,
      COUNT(d.id) FILTER (WHERE d.status = 'returned')::int                                                              AS returned,
      COALESCE(SUM(CASE WHEN d.status = 'delivered' AND d.is_paid = false THEN d.cod_amount ELSE 0 END), 0)             AS cod_collected,
      COUNT(d.id) FILTER (WHERE d.status = 'delivered' AND d.is_paid = true)::int                                       AS paid_orders,
      COUNT(d.id) FILTER (WHERE d.status = 'delivered' AND COALESCE(d.cod_amount, 0) = 0)::int                          AS zero_amount_orders,
      COUNT(d.id)::int                                                                                                    AS total_assignments,
      COALESCE((SELECT SUM(s.amount) FROM rider_cod_settlements s WHERE s.rider_id = r.id), 0)                          AS total_settled,
      GREATEST(0,
        COALESCE(SUM(CASE WHEN d.status = 'delivered' AND d.is_paid = false THEN d.cod_amount ELSE 0 END), 0)
        - COALESCE((SELECT SUM(s.amount) FROM rider_cod_settlements s WHERE s.rider_id = r.id), 0)
      )                                                                                                                   AS settlement_pending
    FROM riders r
    LEFT JOIN rider_deliveries d ON d.rider_id = r.id
      AND DATE(d.assigned_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Karachi') = ${reportDate}::date
    GROUP BY r.id
    ORDER BY r.name
  `);

  const riders = (rows.rows ?? []).map((r: any) => ({
    id:                 Number(r.id),
    name:               String(r.name ?? ""),
    phone:              String(r.phone ?? ""),
    delivery_area:      r.delivery_area ? String(r.delivery_area) : null,
    status:             String(r.status ?? "inactive"),
    delivered:          Number(r.delivered ?? 0),
    pending:            Number(r.pending ?? 0),
    failed:             Number(r.failed ?? 0),
    returned:           Number(r.returned ?? 0),
    cod_collected:      Number(r.cod_collected ?? 0),
    paid_orders:        Number(r.paid_orders ?? 0),
    zero_amount_orders: Number(r.zero_amount_orders ?? 0),
    total_assignments:  Number(r.total_assignments ?? 0),
    total_settled:      Number(r.total_settled ?? 0),
    settlement_pending: Number(r.settlement_pending ?? 0),
  })) as RiderReportRow[];

  const totals = {
    delivered:          riders.reduce((s, r) => s + r.delivered, 0),
    pending:            riders.reduce((s, r) => s + r.pending, 0),
    failed:             riders.reduce((s, r) => s + r.failed, 0),
    returned:           riders.reduce((s, r) => s + r.returned, 0),
    cod_collected:      riders.reduce((s, r) => s + r.cod_collected, 0),
    paid_orders:        riders.reduce((s, r) => s + r.paid_orders, 0),
    zero_amount_orders: riders.reduce((s, r) => s + r.zero_amount_orders, 0),
    total_assignments:  riders.reduce((s, r) => s + r.total_assignments, 0),
    total_settled:      riders.reduce((s, r) => s + r.total_settled, 0),
    settlement_pending: riders.reduce((s, r) => s + r.settlement_pending, 0),
  };

  return { date: reportDate, riders, totals };
}

/* ─── WhatsApp Message Builder ───────────────────────── */
function buildWhatsAppMessage(report: DailyReportData): string {
  const dateFormatted = new Date(report.date + "T00:00:00+05:00").toLocaleDateString("en-PK", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const activeRiders = report.riders.filter(r => r.total_assignments > 0);

  let msg = `📦 *KDF NUTS — Rider Daily Report*\n`;
  msg += `📅 *${dateFormatted}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (activeRiders.length === 0) {
    msg += `No deliveries assigned today.\n\n`;
  } else {
    for (const r of activeRiders) {
      msg += `👤 *Rider: ${r.name}*\n`;
      if (r.delivery_area) msg += `📍 Area: ${r.delivery_area}\n`;
      msg += `✅ Delivered: ${r.delivered}`;
      if (r.pending > 0)  msg += `  ⏳ Pending: ${r.pending}`;
      msg += `\n`;
      if (r.failed > 0)   msg += `❌ Failed: ${r.failed}\n`;
      if (r.returned > 0) msg += `↩️ Returned: ${r.returned}\n`;
      if (r.cod_collected > 0)
        msg += `💰 COD Collected: Rs. ${r.cod_collected.toLocaleString()}\n`;
      if (r.paid_orders > 0)
        msg += `🟢 Paid Orders: ${r.paid_orders}\n`;
      if (r.zero_amount_orders > 0)
        msg += `⚪ Zero Amount: ${r.zero_amount_orders}\n`;
      if (r.settlement_pending > 0)
        msg += `⚠️ Pending Settlement: Rs. ${r.settlement_pending.toLocaleString()}\n`;
      else if (r.cod_collected > 0)
        msg += `✅ Fully Settled\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    }
  }

  const t = report.totals;
  msg += `\n📊 *DAILY SUMMARY*\n`;
  msg += `👥 Active Riders: ${activeRiders.length}\n`;
  msg += `✅ Total Delivered: ${t.delivered}\n`;
  if (t.pending > 0)  msg += `⏳ Total Pending: ${t.pending}\n`;
  if (t.failed > 0)   msg += `❌ Total Failed: ${t.failed}\n`;
  if (t.returned > 0) msg += `↩️ Total Returned: ${t.returned}\n`;
  msg += `💰 Total COD: Rs. ${t.cod_collected.toLocaleString()}\n`;
  if (t.settlement_pending > 0)
    msg += `⚠️ *Unsettled Cash: Rs. ${t.settlement_pending.toLocaleString()}*\n`;
  else
    msg += `✅ All COD Settled\n`;

  msg += `\n_Sent automatically by KDF NUTS System_`;
  return msg;
}

/* ─── HTML Email Builder ─────────────────────────────── */
function buildEmailHtml(report: DailyReportData): string {
  const dateFormatted = new Date(report.date + "T00:00:00+05:00").toLocaleDateString("en-PK", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const t = report.totals;
  const activeRiders = report.riders.filter(r => r.total_assignments > 0);

  const riderRows = activeRiders.map(r => `
    <tr style="border-bottom:1px solid #f0f0f0">
      <td style="padding:10px 12px;font-weight:600;white-space:nowrap">${r.name}</td>
      <td style="padding:10px 12px;color:#555;font-size:12px">${r.delivery_area ?? "—"}</td>
      <td style="padding:10px 12px;text-align:center;color:#059669;font-weight:700">${r.delivered}</td>
      <td style="padding:10px 12px;text-align:center;color:#d97706">${r.pending}</td>
      <td style="padding:10px 12px;text-align:center;color:#dc2626">${r.failed}</td>
      <td style="padding:10px 12px;text-align:center;color:#7c3aed">${r.returned}</td>
      <td style="padding:10px 12px;text-align:center;color:#1d4ed8">${r.paid_orders}</td>
      <td style="padding:10px 12px;text-align:center;color:#6b7280">${r.zero_amount_orders}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:600;color:#1d4ed8">
        ${r.cod_collected > 0 ? `Rs. ${r.cod_collected.toLocaleString()}` : "—"}
      </td>
      <td style="padding:10px 12px;text-align:right;color:#059669">
        ${r.total_settled > 0 ? `Rs. ${r.total_settled.toLocaleString()}` : "—"}
      </td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;color:${r.settlement_pending > 0 ? "#dc2626" : "#059669"}">
        ${r.settlement_pending > 0 ? `Rs. ${r.settlement_pending.toLocaleString()}` : "✅ Settled"}
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KDF NUTS Rider Daily Report</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:28px 12px">
    <tr><td align="center">
      <table width="900" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;max-width:900px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0A1628,#0D2E4F);padding:28px 36px;text-align:center">
          <h1 style="margin:0;color:#fff;font-size:26px;font-weight:900;letter-spacing:-0.5px">📦 KDF NUTS</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px">Rider Daily Collection & Delivery Report</p>
          <p style="margin:10px 0 0;display:inline-block;background:rgba(0,197,98,0.2);border:1px solid rgba(0,197,98,0.4);color:#00C562;padding:4px 16px;border-radius:999px;font-size:13px;font-weight:600">${dateFormatted}</p>
        </td></tr>

        <!-- Summary tiles -->
        <tr><td style="padding:24px 28px 8px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${[
                { label: "Total Delivered",  value: t.delivered.toString(),                          color: "#059669", bg: "#ECFDF5" },
                { label: "COD Collected",    value: `Rs. ${t.cod_collected.toLocaleString()}`,       color: "#1d4ed8", bg: "#EFF6FF" },
                { label: "Unsettled Cash",   value: `Rs. ${t.settlement_pending.toLocaleString()}`,  color: t.settlement_pending > 0 ? "#dc2626" : "#059669", bg: t.settlement_pending > 0 ? "#FEF2F2" : "#ECFDF5" },
                { label: "Failed / Returned", value: `${t.failed} / ${t.returned}`,                  color: "#7c3aed", bg: "#F5F3FF" },
              ].map(c => `
              <td style="padding:0 6px;width:25%">
                <div style="background:${c.bg};border-radius:10px;padding:14px 16px;text-align:center">
                  <p style="margin:0;font-size:22px;font-weight:900;color:${c.color}">${c.value}</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">${c.label}</p>
                </div>
              </td>`).join("")}
            </tr>
          </table>
        </td></tr>

        <!-- Rider table -->
        <tr><td style="padding:20px 28px 28px">
          <h2 style="margin:0 0 14px;font-size:16px;color:#0A1628;font-weight:800">Rider Breakdown</h2>
          ${activeRiders.length === 0 ? `<p style="color:#888;text-align:center;padding:32px">No delivery activity today.</p>` : `
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:13px">
            <thead>
              <tr style="background:#f8fafc;border-bottom:2px solid #e5e7eb">
                <th style="padding:10px 12px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap">Rider</th>
                <th style="padding:10px 12px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Area</th>
                <th style="padding:10px 12px;text-align:center;color:#059669;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Delivered</th>
                <th style="padding:10px 12px;text-align:center;color:#d97706;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Pending</th>
                <th style="padding:10px 12px;text-align:center;color:#dc2626;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Failed</th>
                <th style="padding:10px 12px;text-align:center;color:#7c3aed;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Returned</th>
                <th style="padding:10px 12px;text-align:center;color:#1d4ed8;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Paid</th>
                <th style="padding:10px 12px;text-align:center;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Zero Amt</th>
                <th style="padding:10px 12px;text-align:right;color:#1d4ed8;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">COD Collected</th>
                <th style="padding:10px 12px;text-align:right;color:#059669;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Settled</th>
                <th style="padding:10px 12px;text-align:right;color:#dc2626;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Pending Settlement</th>
              </tr>
            </thead>
            <tbody>
              ${riderRows}
              <tr style="background:#f8fafc;border-top:2px solid #e5e7eb;font-weight:800">
                <td colspan="2" style="padding:10px 12px;font-size:13px;color:#0A1628">TOTAL (${activeRiders.length} riders)</td>
                <td style="padding:10px 12px;text-align:center;color:#059669">${t.delivered}</td>
                <td style="padding:10px 12px;text-align:center;color:#d97706">${t.pending}</td>
                <td style="padding:10px 12px;text-align:center;color:#dc2626">${t.failed}</td>
                <td style="padding:10px 12px;text-align:center;color:#7c3aed">${t.returned}</td>
                <td style="padding:10px 12px;text-align:center;color:#1d4ed8">${t.paid_orders}</td>
                <td style="padding:10px 12px;text-align:center;color:#6b7280">${t.zero_amount_orders}</td>
                <td style="padding:10px 12px;text-align:right;color:#1d4ed8">Rs. ${t.cod_collected.toLocaleString()}</td>
                <td style="padding:10px 12px;text-align:right;color:#059669">Rs. ${t.total_settled.toLocaleString()}</td>
                <td style="padding:10px 12px;text-align:right;color:${t.settlement_pending > 0 ? "#dc2626" : "#059669"}">
                  ${t.settlement_pending > 0 ? `Rs. ${t.settlement_pending.toLocaleString()}` : "✅ All Settled"}
                </td>
              </tr>
            </tbody>
          </table>`}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:16px 28px;text-align:center;border-top:1px solid #e5e7eb">
          <p style="margin:0;color:#9ca3af;font-size:12px">Automated report by KDF NUTS System · Generated ${new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} PKT</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* ─── Email Transport (same pattern as email.ts) ─────── */
async function getMailTransport() {
  try {
    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    if (!settings?.emailEnabled || !settings.smtpHost || !settings.smtpUser) return null;
    return {
      transport: nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort ?? 587,
        secure: settings.smtpPort === 465,
        auth: { user: settings.smtpUser, pass: settings.smtpPass },
      }),
      from: settings.smtpFrom || settings.smtpUser,
    };
  } catch { return null; }
}

/* ─── Send Report ─────────────────────────────────────── */
export async function sendRiderDailyReport(date?: string): Promise<{
  waOk: boolean; emailOk: boolean; date: string; riders: number;
}> {
  const report = await generateRiderDailyReport(date);
  let waOk = false;
  let emailOk = false;

  /* WhatsApp */
  try {
    const msg = buildWhatsAppMessage(report);
    waOk = await sendWhatsAppMessage({ phone: REPORT_WA_PHONE, message: msg, templateName: "rider_daily_report" });
    logger.info({ waOk, date: report.date }, "Rider daily report WhatsApp sent");
  } catch (e) {
    logger.error({ err: e }, "Rider daily report WhatsApp failed");
  }

  /* Email */
  try {
    const mail = await getMailTransport();
    if (mail) {
      const html = buildEmailHtml(report);
      const subject = `📦 KDF NUTS Rider Daily Report — ${report.date}`;
      await mail.transport.sendMail({
        from: mail.from,
        to: REPORT_EMAILS,
        subject,
        html,
      });
      emailOk = true;
      logger.info({ emails: REPORT_EMAILS, date: report.date }, "Rider daily report email sent");
    } else {
      logger.warn("Rider daily report: email not configured — skipping");
    }
  } catch (e) {
    logger.error({ err: e }, "Rider daily report email failed");
  }

  /* Log to DB */
  try {
    await db.execute(sql`
      INSERT INTO rider_report_logs (report_date, wa_status, email_status, report_data)
      VALUES (
        ${report.date}::date,
        ${waOk ? "sent" : "failed"},
        ${emailOk ? "sent" : (await getMailTransport()) === null ? "not_configured" : "failed"},
        ${JSON.stringify(report)}::jsonb
      )
    `);
  } catch (e) {
    logger.warn({ err: e }, "Could not log rider report to DB");
  }

  return { waOk, emailOk, date: report.date, riders: report.riders.length };
}

/* ─── Scheduler ───────────────────────────────────────── */
let _lastReportDate = "";

export function startRiderReportScheduler(): void {
  logger.info("Rider daily report scheduler started (8 PM PKT / 15:00 UTC)");

  const check = async () => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const todayPKT = now.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }); /* YYYY-MM-DD */

    if (utcHour === REPORT_HOUR_UTC && _lastReportDate !== todayPKT) {
      _lastReportDate = todayPKT;
      logger.info({ date: todayPKT }, "Rider daily report scheduler — sending report");
      try {
        const result = await sendRiderDailyReport(todayPKT);
        logger.info(result, "Rider daily report scheduler — done");
      } catch (e) {
        logger.error({ err: e }, "Rider daily report scheduler — error");
      }
    }
  };

  setInterval(check, 60 * 60 * 1000); /* check every hour */
  check(); /* check immediately on startup */
}
