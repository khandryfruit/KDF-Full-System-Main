/**
 * Campaign Message Queue Processor
 *
 * Processes queued WhatsApp / Email messages gradually to avoid
 * API rate limits. Picks up to BATCH_SIZE pending messages every
 * INTERVAL_MS, sends them, and updates status.
 */
import { db } from "@workspace/db";
import { campaignMessageQueueTable, shopifyCampaignsTable, shopifyEmailCampaignsTable } from "@workspace/db/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { sendWhatsAppMessage, normalizePhone } from "./whatsapp";
import { logger } from "./logger";
import nodemailer from "nodemailer";
import { emailSettingsTable } from "@workspace/db/schema";

const INTERVAL_MS = 30_000;  // run every 30 seconds
const BATCH_SIZE  = 8;        // messages per tick  (~16/min ≈ 960/hr)

async function getMailTransport() {
  try {
    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    if (!settings?.emailEnabled || !settings.smtpHost || !settings.smtpUser) return null;
    return {
      transport: nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort,
        secure: settings.smtpPort === 465,
        auth: { user: settings.smtpUser, pass: settings.smtpPass },
      }),
      from: `${settings.smtpFrom || "KDF NUTS"} <${settings.smtpUser}>`,
    };
  } catch { return null; }
}

async function processQueue() {
  try {
    const now = new Date();
    const pending = await db
      .select()
      .from(campaignMessageQueueTable)
      .where(and(
        eq(campaignMessageQueueTable.status, "pending"),
        lte(campaignMessageQueueTable.scheduledAt, now),
      ))
      .orderBy(campaignMessageQueueTable.scheduledAt)
      .limit(BATCH_SIZE);

    if (pending.length === 0) return;

    logger.info({ count: pending.length }, "Campaign queue: processing batch");

    for (const msg of pending) {
      // Mark as sending immediately to avoid double-processing
      await db.update(campaignMessageQueueTable)
        .set({ status: "sending" })
        .where(eq(campaignMessageQueueTable.id, msg.id));

      let success = false;
      let errorMessage: string | undefined;

      try {
        if (msg.campaignType === "whatsapp" && msg.phone) {
          await sendWhatsAppMessage({
            phone: normalizePhone(msg.phone),
            message: msg.message ?? "",
          });
          success = true;
        } else if (msg.campaignType === "email" && msg.email) {
          const conn = await getMailTransport();
          if (conn) {
            await conn.transport.sendMail({
              from: conn.from,
              to: msg.email,
              subject: msg.subject ?? "Message from KDF NUTS",
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
                <h2 style="color:#5FA800">KDF NUTS</h2>
                <div style="white-space:pre-line;font-size:15px;line-height:1.7;color:#333">${(msg.message ?? "").replace(/\n/g, "<br>")}</div>
                <hr style="margin:24px 0;border:none;border-top:1px solid #eee">
                <p style="font-size:12px;color:#aaa">KDF NUTS · Pakistan's Premium Dry Fruits</p>
              </div>`,
            });
            success = true;
          } else {
            errorMessage = "Email not configured";
          }
        } else {
          errorMessage = "No valid contact method";
        }
      } catch (err: any) {
        errorMessage = String(err?.message ?? err);
      }

      const newStatus = success ? "sent" : "failed";
      await db.update(campaignMessageQueueTable)
        .set({
          status: newStatus,
          sentAt: success ? new Date() : undefined,
          errorMessage: errorMessage ?? null,
          retries: (msg.retries ?? 0) + (success ? 0 : 1),
        })
        .where(eq(campaignMessageQueueTable.id, msg.id));

      // Update campaign aggregate counts
      if (msg.campaignId) {
        if (msg.campaignType === "whatsapp") {
          if (success) {
            await db.execute(sql`UPDATE shopify_campaigns SET total_sent = total_sent + 1, updated_at = now() WHERE id = ${msg.campaignId}`);
          } else {
            await db.execute(sql`UPDATE shopify_campaigns SET total_failed = total_failed + 1, updated_at = now() WHERE id = ${msg.campaignId}`);
          }
        } else if (msg.campaignType === "email") {
          if (success) {
            await db.execute(sql`UPDATE shopify_email_campaigns SET total_sent = total_sent + 1, total_delivered = total_delivered + 1, updated_at = now() WHERE id = ${msg.campaignId}`);
          } else {
            await db.execute(sql`UPDATE shopify_email_campaigns SET total_failed = total_failed + 1, updated_at = now() WHERE id = ${msg.campaignId}`);
          }
        }
      }

      // Brief pause between sends (WA rate limit safety)
      if (msg.campaignType === "whatsapp") {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    logger.info({ count: pending.length }, "Campaign queue: batch done");
  } catch (err) {
    logger.error({ err }, "Campaign queue processor error");
  }
}

export function startCampaignQueueProcessor() {
  logger.info("Campaign queue processor started");
  setInterval(processQueue, INTERVAL_MS);
  // Run immediately on startup
  processQueue();
}

/** Helper: enqueue messages for a campaign, distributed over `spreadHours` hours (0 = immediate) */
export async function enqueueCampaignMessages(opts: {
  campaignId?: number;
  campaignType: "whatsapp" | "email";
  messages: Array<{
    customerId?: number;
    customerName?: string;
    phone?: string;
    email?: string;
    message: string;
    subject?: string;
  }>;
  spreadHours?: number;
}) {
  const { campaignId, campaignType, messages, spreadHours = 0 } = opts;
  const now = Date.now();
  const spreadMs = spreadHours * 60 * 60 * 1000;

  const rows = messages.map((m, i) => ({
    campaignId: campaignId ?? null,
    campaignType,
    customerId: m.customerId ?? null,
    customerName: m.customerName ?? null,
    phone: m.phone ?? null,
    email: m.email ?? null,
    message: m.message,
    subject: m.subject ?? null,
    status: "pending" as const,
    scheduledAt: spreadMs > 0
      ? new Date(now + Math.floor((i / Math.max(messages.length - 1, 1)) * spreadMs))
      : new Date(now),
  }));

  // Batch insert in chunks of 100
  for (let i = 0; i < rows.length; i += 100) {
    await db.insert(campaignMessageQueueTable).values(rows.slice(i, i + 100));
  }

  return rows.length;
}
