import { Router } from "express";
import { db, waAutomationRulesTable, waAutomationLogsTable, waCostTrackingTable, whatsappLogsTable, whatsappCampaignsTable } from "@workspace/db";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

/* ── Automation Rules CRUD ─────────────────────────────── */
router.get("/admin/wa/automation/rules", adminMiddleware as any, async (req, res) => {
  try {
    const rules = await db.select().from(waAutomationRulesTable).orderBy(desc(waAutomationRulesTable.createdAt));
    return res.json(rules);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post("/admin/wa/automation/rules", adminMiddleware as any, async (req, res) => {
  try {
    const { name, triggerType, triggerConfig, conditionType, conditionConfig, actionType, messageTemplate, templateName } = req.body;
    if (!name || !triggerType) return res.status(400).json({ error: "name and triggerType are required" });
    const [rule] = await db.insert(waAutomationRulesTable).values({
      name, triggerType,
      triggerConfig:   triggerConfig   ?? {},
      conditionType:   conditionType   ?? "always",
      conditionConfig: conditionConfig ?? {},
      actionType:      actionType      ?? "send_wa",
      messageTemplate: messageTemplate ?? null,
      templateName:    templateName    ?? null,
      isActive:        true,
    } as any).returning();
    return res.status(201).json(rule);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.put("/admin/wa/automation/rules/:id", adminMiddleware as any, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, triggerType, triggerConfig, conditionType, conditionConfig, actionType, messageTemplate, templateName, isActive } = req.body;
    const [rule] = await db.update(waAutomationRulesTable)
      .set({
        ...(name            !== undefined ? { name }            : {}),
        ...(triggerType     !== undefined ? { triggerType }     : {}),
        ...(triggerConfig   !== undefined ? { triggerConfig }   : {}),
        ...(conditionType   !== undefined ? { conditionType }   : {}),
        ...(conditionConfig !== undefined ? { conditionConfig } : {}),
        ...(actionType      !== undefined ? { actionType }      : {}),
        ...(messageTemplate !== undefined ? { messageTemplate } : {}),
        ...(templateName    !== undefined ? { templateName }    : {}),
        ...(isActive        !== undefined ? { isActive }        : {}),
        updatedAt: new Date(),
      })
      .where(eq(waAutomationRulesTable.id, id))
      .returning();
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    return res.json(rule);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.delete("/admin/wa/automation/rules/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(waAutomationRulesTable).where(eq(waAutomationRulesTable.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.patch("/admin/wa/automation/rules/:id/toggle", adminMiddleware as any, async (req, res) => {
  try {
    const [existing] = await db.select().from(waAutomationRulesTable).where(eq(waAutomationRulesTable.id, Number(req.params.id))).limit(1);
    if (!existing) return res.status(404).json({ error: "Rule not found" });
    const [updated] = await db.update(waAutomationRulesTable)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(waAutomationRulesTable.id, existing.id))
      .returning();
    return res.json(updated);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ── Automation Run Logs ────────────────────────────────── */
router.get("/admin/wa/automation/logs", adminMiddleware as any, async (req, res) => {
  try {
    const ruleId = req.query.ruleId ? Number(req.query.ruleId) : undefined;
    const limit  = Math.min(200, Number(req.query.limit) || 100);
    const rows = await db.select().from(waAutomationLogsTable)
      .where(ruleId !== undefined ? eq(waAutomationLogsTable.ruleId, ruleId) : undefined)
      .orderBy(desc(waAutomationLogsTable.createdAt))
      .limit(limit);
    return res.json(rows);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.get("/admin/wa/automation/stats", adminMiddleware as any, async (req, res) => {
  try {
    const [totals] = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent')    AS total_sent,
        COUNT(*) FILTER (WHERE status = 'failed')  AS total_failed,
        COUNT(*) FILTER (WHERE status = 'skipped') AS total_skipped,
        COUNT(DISTINCT rule_id)                     AS active_rules
      FROM wa_automation_logs
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
    const rules = await db.select({ id: waAutomationRulesTable.id, name: waAutomationRulesTable.name, runCount: waAutomationRulesTable.runCount, lastRunAt: waAutomationRulesTable.lastRunAt, isActive: waAutomationRulesTable.isActive })
      .from(waAutomationRulesTable)
      .orderBy(desc(waAutomationRulesTable.runCount));
    return res.json({ ...totals.rows[0], rules });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ── Campaign Pause / Resume ────────────────────────────── */
router.post("/admin/wa/campaigns/:id/pause", adminMiddleware as any, async (req, res) => {
  try {
    const [campaign] = await db.select().from(whatsappCampaignsTable).where(eq(whatsappCampaignsTable.id, Number(req.params.id))).limit(1);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status !== "sending") return res.status(400).json({ error: "Campaign is not currently sending" });
    await db.execute(sql`UPDATE whatsapp_campaigns SET status = 'paused', paused_at = NOW(), updated_at = NOW() WHERE id = ${Number(req.params.id)}`);
    return res.json({ success: true, message: "Campaign paused — queue will finish current batch then stop" });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post("/admin/wa/campaigns/:id/resume", adminMiddleware as any, async (req, res) => {
  try {
    const [campaign] = await db.select().from(whatsappCampaignsTable).where(eq(whatsappCampaignsTable.id, Number(req.params.id))).limit(1);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status !== "paused") return res.status(400).json({ error: "Campaign is not paused" });
    await db.execute(sql`UPDATE whatsapp_campaigns SET status = 'sending', resume_count = COALESCE(resume_count,0) + 1, updated_at = NOW() WHERE id = ${Number(req.params.id)}`);
    return res.json({ success: true, message: "Campaign resumed" });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post("/admin/wa/campaigns/:id/cancel", adminMiddleware as any, async (req, res) => {
  try {
    await db.execute(sql`UPDATE whatsapp_campaigns SET status = 'cancelled', updated_at = NOW() WHERE id = ${Number(req.params.id)}`);
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ── Campaign Scheduling ────────────────────────────────── */
router.post("/admin/wa/campaigns/:id/schedule", adminMiddleware as any, async (req, res) => {
  try {
    const { scheduledAt } = req.body;
    if (!scheduledAt) return res.status(400).json({ error: "scheduledAt is required (ISO date string)" });
    const dt = new Date(scheduledAt);
    if (isNaN(dt.getTime()) || dt <= new Date()) return res.status(400).json({ error: "scheduledAt must be a future date" });
    await db.execute(sql`UPDATE whatsapp_campaigns SET status = 'scheduled', scheduled_at = ${dt.toISOString()}, updated_at = NOW() WHERE id = ${Number(req.params.id)}`);
    return res.json({ success: true, scheduledAt: dt.toISOString() });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ── WA Cost & Analytics ─────────────────────────────────── */
router.get("/admin/wa/cost-stats", adminMiddleware as any, async (req, res) => {
  try {
    const days = Math.min(90, Number(req.query.days) || 30);

    /* aggregate from logs */
    const [agg] = await db.execute(sql`
      SELECT
        COUNT(*)                                                           AS total_sent,
        COUNT(*) FILTER (WHERE status = 'sent' AND delivery_status = 'delivered') AS total_delivered,
        COUNT(*) FILTER (WHERE status = 'failed')                         AS total_failed,
        COUNT(*) FILTER (WHERE delivery_status = 'read')                  AS total_read,
        COUNT(*) FILTER (WHERE template_name LIKE 'campaign:%')           AS campaign_msgs,
        COUNT(*) FILTER (WHERE template_name NOT LIKE 'campaign:%' AND template_name NOT LIKE 'automation:%' AND status = 'sent') AS utility_msgs,
        COUNT(*) FILTER (WHERE template_name LIKE 'automation:%')         AS automation_msgs,
        COUNT(DISTINCT DATE(created_at))                                  AS active_days
      FROM whatsapp_logs
      WHERE created_at >= NOW() - (${days} || ' days')::interval
    `);

    const stats = agg.rows[0] as any;

    /* Meta WA pricing (Pakistan, 2024 rates in USD) */
    const utilityPerMsg    = 0.0040;
    const marketingPerMsg  = 0.0100;
    const usdToPkr         = 278;

    const utilityCount     = Number(stats.utility_msgs   ?? 0) + Number(stats.automation_msgs ?? 0);
    const marketingCount   = Number(stats.campaign_msgs  ?? 0);
    const totalSent        = Number(stats.total_sent     ?? 0);

    const utilityCostUsd   = utilityCount   * utilityPerMsg;
    const marketingCostUsd = marketingCount * marketingPerMsg;
    const totalCostUsd     = utilityCostUsd + marketingCostUsd;

    /* 7-day daily breakdown */
    const daily = await db.execute(sql`
      SELECT
        DATE(created_at)::text AS date,
        COUNT(*)                                           AS sent,
        COUNT(*) FILTER (WHERE status = 'failed')         AS failed,
        COUNT(*) FILTER (WHERE delivery_status = 'read')  AS read_count,
        COUNT(*) FILTER (WHERE template_name LIKE 'campaign:%')  AS campaign,
        COUNT(*) FILTER (WHERE template_name NOT LIKE 'campaign:%') AS utility
      FROM whatsapp_logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `);

    /* campaign analytics */
    const campaigns = await db.select({
      id: whatsappCampaignsTable.id,
      name: whatsappCampaignsTable.name,
      status: whatsappCampaignsTable.status,
      recipientCount: whatsappCampaignsTable.recipientCount,
      sentCount: whatsappCampaignsTable.sentCount,
      failedCount: whatsappCampaignsTable.failedCount,
      deliveredCount: whatsappCampaignsTable.deliveredCount,
      readCount: whatsappCampaignsTable.readCount,
      skippedCount: whatsappCampaignsTable.skippedCount,
      sentAt: whatsappCampaignsTable.sentAt,
      createdAt: whatsappCampaignsTable.createdAt,
    })
      .from(whatsappCampaignsTable)
      .orderBy(desc(whatsappCampaignsTable.createdAt))
      .limit(20);

    return res.json({
      period: { days, startDate: new Date(Date.now() - days * 86400000).toISOString().split("T")[0], endDate: new Date().toISOString().split("T")[0] },
      totals: {
        totalSent,
        totalDelivered: Number(stats.total_delivered ?? 0),
        totalFailed:    Number(stats.total_failed    ?? 0),
        totalRead:      Number(stats.total_read      ?? 0),
        utilityCount,
        marketingCount,
        automationCount: Number(stats.automation_msgs ?? 0),
        activeDays:     Number(stats.active_days     ?? 0),
      },
      costs: {
        utilityCostUsd:   +utilityCostUsd.toFixed(4),
        marketingCostUsd: +marketingCostUsd.toFixed(4),
        totalCostUsd:     +totalCostUsd.toFixed(4),
        utilityCostPkr:   Math.round(utilityCostUsd   * usdToPkr),
        marketingCostPkr: Math.round(marketingCostUsd * usdToPkr),
        totalCostPkr:     Math.round(totalCostUsd     * usdToPkr),
        rateUtility:      utilityPerMsg,
        rateMarketing:    marketingPerMsg,
        usdToPkr,
      },
      deliveryRate: totalSent > 0 ? +((Number(stats.total_delivered ?? 0) / totalSent) * 100).toFixed(1) : 0,
      readRate:     totalSent > 0 ? +((Number(stats.total_read      ?? 0) / totalSent) * 100).toFixed(1) : 0,
      daily: daily.rows,
      campaigns,
    });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ── Notification Settings: new events ─────────────────── */
router.get("/admin/wa/notification-settings-extended", adminMiddleware as any, async (req, res) => {
  try {
    const [s] = await db.execute(sql`SELECT * FROM whatsapp_settings LIMIT 1`);
    return res.json(s.rows[0] ?? {});
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

export default router;
