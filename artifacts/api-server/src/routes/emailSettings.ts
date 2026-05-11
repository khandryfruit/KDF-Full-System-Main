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

    // Auto-fix FROM address: if smtpFrom domain doesn't match smtpUser, use smtpUser
    const effectiveUser = rest.smtpUser ?? existing?.smtpUser ?? "";
    if (effectiveUser && rest.smtpFrom) {
      const fromDomain = (rest.smtpFrom as string).split("@")[1]?.toLowerCase();
      const userDomain = effectiveUser.split("@")[1]?.toLowerCase();
      if (fromDomain && userDomain && fromDomain !== userDomain) {
        rest.smtpFrom = effectiveUser; // silently correct
      }
    }

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

/* ── Shared helpers ── */

function resolveFrom(smtpUser: string, smtpFrom?: string | null): string {
  if (!smtpFrom) return smtpUser;
  try {
    const fromDomain = smtpFrom.split("@")[1]?.toLowerCase();
    const userDomain = smtpUser.split("@")[1]?.toLowerCase();
    if (!fromDomain || !userDomain || fromDomain !== userDomain) return smtpUser;
    return smtpFrom;
  } catch {
    return smtpUser;
  }
}

function buildTransporter(s: { smtpHost: string; smtpUser: string; smtpPass: string }, port: number) {
  const secure = port === 465;
  return nodemailer.createTransport({
    host:               s.smtpHost,
    port,
    secure,
    auth:               { user: s.smtpUser, pass: s.smtpPass },
    connectionTimeout:  30_000,
    greetingTimeout:    20_000,
    socketTimeout:      30_000,
    tls: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
    ...(secure ? {} : { requireTLS: true }),
  } as any);
}

function smtpErrorHint(msg: string): string {
  if (/535|authentication|Invalid login|EAUTH/i.test(msg))
    return " — Auth failed: check username/password match the Titan SMTP account (smtp.titan.email).";
  if (/ECONNREFUSED|connect/i.test(msg))
    return " — Cannot connect: check Host and Port. Titan uses port 465 (SSL) or 587 (STARTTLS).";
  if (/ETIMEDOUT|timeout|greeting/i.test(msg))
    return " — Timeout: Replit may block outbound SMTP. Try port 465 first, then 587.";
  if (/domain|mismatch|FROM/i.test(msg))
    return " — FROM address domain must match your Titan account domain (e.g. support@khandryfruit.com).";
  if (/TLS|SSL|handshake/i.test(msg))
    return " — TLS error: ensure TLS is enabled and rejectUnauthorized is false.";
  return "";
}

/* ── POST test connection ── */
router.post("/admin/email-settings/test", adminMiddleware as any, async (req: any, res) => {
  try {
    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    if (!settings?.smtpHost || !settings.smtpUser || !settings.smtpPass) {
      return res.status(400).json({
        error: "SMTP not fully configured — please fill in Host, Username, and Password then save first.",
      });
    }

    const primary  = Number(settings.smtpPort) || 587;
    const fallback = primary === 465 ? 587 : 465;
    let lastErr    = "";
    let usedPort   = primary;

    for (const port of [primary, fallback]) {
      try {
        const transport = buildTransporter(settings, port);
        await transport.verify();
        usedPort = port;
        req.log.info({ host: settings.smtpHost, port }, "SMTP Connected — Auth Success ✓");
        return res.json({ success: true, message: `SMTP Connected to ${settings.smtpHost}:${port} — Auth Success ✓` });
      } catch (e: any) {
        lastErr = String(e?.message ?? e);
        req.log.warn({ host: settings.smtpHost, port, err: lastErr }, `SMTP port ${port} failed`);
      }
    }

    req.log.error({ host: settings.smtpHost, err: lastErr }, "SMTP Failed — both ports exhausted");
    return res.status(500).json({ error: `SMTP Failed on ports ${primary} & ${fallback}: ${lastErr}${smtpErrorHint(lastErr)}` });
  } catch (e: any) {
    req.log.error({ err: e.message }, "SMTP test route error");
    return res.status(500).json({ error: `Test error: ${e.message}` });
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

    const from     = resolveFrom(settings.smtpUser, settings.smtpFrom);
    const primary  = Number(settings.smtpPort) || 587;
    const fallback = primary === 465 ? 587 : 465;
    let transport: nodemailer.Transporter | null = null;
    let lastErr = "";

    for (const port of [primary, fallback]) {
      try {
        const t = buildTransporter(settings, port);
        await t.verify();
        transport = t;
        req.log.info({ host: settings.smtpHost, port }, "SMTP Connected for send-test");
        break;
      } catch (e: any) {
        lastErr = String(e?.message ?? e);
        req.log.warn({ port, err: lastErr }, `SMTP port ${port} unavailable for send-test`);
      }
    }

    if (!transport) {
      return res.status(500).json({ error: `SMTP unreachable on ports ${primary} & ${fallback}: ${lastErr}${smtpErrorHint(lastErr)}` });
    }
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
