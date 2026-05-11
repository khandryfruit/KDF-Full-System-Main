import { Router } from "express";
import { db, emailSettingsTable, emailLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import nodemailer from "nodemailer";

const router = Router();

/* ── GET settings (password excluded for security, flag returned) ── */
router.get("/admin/email-settings", adminMiddleware as any, async (_req, res) => {
  try {
    let [settings] = await db.select().from(emailSettingsTable).limit(1);
    if (!settings) {
      [settings] = await db.insert(emailSettingsTable).values({}).returning();
    }
    const { smtpPass: _, ...safe } = settings;
    return res.json({ ...safe, smtpPassSet: !!settings.smtpPass });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── PATCH settings (only updates smtpPass if a new one is provided) ── */
router.patch("/admin/email-settings", adminMiddleware as any, async (req, res) => {
  try {
    const { smtpPass, ...rest } = req.body;
    let [existing] = await db.select().from(emailSettingsTable).limit(1);
    const update: any = { ...rest, updatedAt: new Date() };
    if (smtpPass !== undefined && smtpPass !== "") update.smtpPass = smtpPass;
    if (!existing) {
      [existing] = await db.insert(emailSettingsTable).values(update).returning();
    } else {
      [existing] = await db
        .update(emailSettingsTable)
        .set(update)
        .where(eq(emailSettingsTable.id, existing.id))
        .returning();
    }
    const { smtpPass: _p, ...safe } = existing;
    return res.json({ ...safe, smtpPassSet: !!existing.smtpPass });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── POST test connection ── */
router.post("/admin/email-settings/test", adminMiddleware as any, async (req: any, res) => {
  try {
    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    if (!settings?.smtpHost || !settings.smtpUser || !settings.smtpPass) {
      return res.status(400).json({
        error: "SMTP not fully configured — please fill in Host, Username, and Password then save first.",
      });
    }
    const isPort465 = Number(settings.smtpPort) === 465;
    const transport = nodemailer.createTransport({
      host:   settings.smtpHost,
      port:   Number(settings.smtpPort) || 587,
      secure: isPort465,
      auth:   { user: settings.smtpUser, pass: settings.smtpPass },
      tls:    { rejectUnauthorized: false },
      connectionTimeout: 10_000,
      greetingTimeout:    8_000,
      socketTimeout:     10_000,
    } as any);
    await transport.verify();
    req.log.info({ host: settings.smtpHost, port: settings.smtpPort }, "SMTP test OK");
    return res.json({ success: true, message: `SMTP connection to ${settings.smtpHost}:${settings.smtpPort} successful!` });
  } catch (e: any) {
    req.log.error({ err: e.message }, "SMTP test failed");
    let hint = "";
    if (e.message?.includes("authentication") || e.message?.includes("535") || e.message?.includes("Invalid login")) {
      hint = " — Wrong username or password. For Hostinger: use smtp.hostinger.com port 465.";
    } else if (e.message?.includes("ECONNREFUSED") || e.message?.includes("connect")) {
      hint = " — Cannot reach server. Check Host and Port.";
    } else if (e.message?.includes("timeout")) {
      hint = " — Connection timed out. Check firewall / Host settings.";
    }
    return res.status(500).json({ error: `SMTP test failed: ${e.message}${hint}` });
  }
});

/* ── POST send test email to a specific address ── */
router.post("/admin/email-settings/send-test", adminMiddleware as any, async (req: any, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: "Recipient email (to) is required" });
    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    if (!settings?.smtpHost || !settings.smtpUser || !settings.smtpPass) {
      return res.status(400).json({ error: "SMTP not fully configured. Save settings first." });
    }
    const isPort465 = Number(settings.smtpPort) === 465;
    const transport = nodemailer.createTransport({
      host:   settings.smtpHost,
      port:   Number(settings.smtpPort) || 587,
      secure: isPort465,
      auth:   { user: settings.smtpUser, pass: settings.smtpPass },
      tls:    { rejectUnauthorized: false },
      connectionTimeout: 10_000,
      greetingTimeout:    8_000,
      socketTimeout:     10_000,
    } as any);
    const from = settings.smtpFrom || settings.smtpUser;
    await transport.sendMail({
      from,
      to,
      subject: "KDF NUTS — Email System Test",
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;max-width:600px;width:100%">
<tr><td style="background:linear-gradient(135deg,#5FA800,#4d8a00);padding:32px 40px;text-align:center">
<h1 style="margin:0;color:#fff;font-size:28px;font-weight:900">KDF NUTS</h1>
<p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px">Email System Test</p>
</td></tr>
<tr><td style="padding:36px 40px">
<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:20px">✅ Your email system is working!</h2>
<p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 16px">This is a test email sent from your KDF NUTS admin panel. Your SMTP configuration is correct and email automations will be delivered successfully.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:10px;padding:16px 20px;margin:20px 0">
<tr><td style="color:#888;font-size:13px;padding:4px 0;width:120px">Host</td><td style="color:#333;font-size:13px;font-weight:600;padding:4px 0">${settings.smtpHost}:${settings.smtpPort}</td></tr>
<tr><td style="color:#888;font-size:13px;padding:4px 0">From</td><td style="color:#333;font-size:13px;font-weight:600;padding:4px 0">${from}</td></tr>
<tr><td style="color:#888;font-size:13px;padding:4px 0">Sent at</td><td style="color:#333;font-size:13px;font-weight:600;padding:4px 0">${new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} PKT</td></tr>
</table>
<p style="color:#aaa;font-size:12px;margin:0">KDF NUTS · Pakistan's Premium Dry Fruits Store</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`,
    });
    /* log it */
    await db.insert(emailLogsTable).values({
      type: "test", to, subject: "KDF NUTS — Email System Test", status: "sent",
    }).catch(() => {});
    req.log.info({ to }, "Test email sent");
    return res.json({ success: true, message: `Test email delivered to ${to}` });
  } catch (e: any) {
    req.log.error({ err: e.message }, "Send-test email failed");
    await db.insert(emailLogsTable).values({
      type: "test",
      to: req.body.to ?? "unknown",
      subject: "KDF NUTS — Email System Test",
      status: "failed",
      errorMessage: String(e.message ?? e),
    }).catch(() => {});
    return res.status(500).json({ error: `Failed to send test email: ${e.message}` });
  }
});

/* ── GET email logs ── */
router.get("/admin/email-logs", adminMiddleware as any, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const logs = await db
      .select()
      .from(emailLogsTable)
      .orderBy(desc(emailLogsTable.createdAt))
      .limit(limit)
      .offset(offset);
    return res.json(logs);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── DELETE email logs (clear all) ── */
router.delete("/admin/email-logs", adminMiddleware as any, async (_req, res) => {
  try {
    await db.delete(emailLogsTable);
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
