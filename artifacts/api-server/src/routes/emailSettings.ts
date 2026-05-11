import { Router } from "express";
import { db, emailSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

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

router.patch("/admin/email-settings", adminMiddleware as any, async (req, res) => {
  try {
    const { smtpPass, ...rest } = req.body;
    let [existing] = await db.select().from(emailSettingsTable).limit(1);
    const update: any = { ...rest, updatedAt: new Date() };
    if (smtpPass !== undefined && smtpPass !== "") update.smtpPass = smtpPass;
    if (!existing) {
      [existing] = await db.insert(emailSettingsTable).values(update).returning();
    } else {
      [existing] = await db.update(emailSettingsTable).set(update).where(eq(emailSettingsTable.id, existing.id)).returning();
    }
    const { smtpPass: _p, ...safe } = existing;
    return res.json({ ...safe, smtpPassSet: !!existing.smtpPass });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/admin/email-settings/test", adminMiddleware as any, async (req: any, res) => {
  try {
    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    if (!settings?.smtpHost || !settings.smtpUser || !settings.smtpPass) {
      return res.status(400).json({ error: "SMTP not fully configured — please fill in Host, Username, and Password then save first." });
    }
    const nodemailer = await import("nodemailer");
    const isPort465 = Number(settings.smtpPort) === 465;
    const transport = nodemailer.default.createTransport({
      host:   settings.smtpHost,
      port:   Number(settings.smtpPort) || 587,
      secure: isPort465,
      auth:   { user: settings.smtpUser, pass: settings.smtpPass },
      tls:    { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout:   8000,
      socketTimeout:     10000,
    } as any);
    await transport.verify();
    req.log.info({ host: settings.smtpHost, port: settings.smtpPort, user: settings.smtpUser }, "SMTP test OK");
    return res.json({ success: true, message: `SMTP connection to ${settings.smtpHost}:${settings.smtpPort} successful!` });
  } catch (e: any) {
    req.log.error({ err: e.message }, "SMTP test failed");
    /* Provide actionable error hints */
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

export default router;
