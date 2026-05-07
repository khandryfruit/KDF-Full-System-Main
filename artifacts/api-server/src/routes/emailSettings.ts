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

router.post("/admin/email-settings/test", adminMiddleware as any, async (_req, res) => {
  try {
    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    if (!settings?.smtpHost || !settings.smtpUser || !settings.smtpPass) {
      return res.status(400).json({ error: "SMTP not fully configured" });
    }
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.default.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpPort === 465,
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
    });
    await transport.verify();
    return res.json({ success: true, message: "SMTP connection successful" });
  } catch (e: any) {
    return res.status(500).json({ error: `SMTP test failed: ${e.message}` });
  }
});

export default router;
