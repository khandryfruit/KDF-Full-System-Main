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
    const totalsResult = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent')    AS total_sent,
        COUNT(*) FILTER (WHERE status = 'failed')  AS total_failed,
        COUNT(*) FILTER (WHERE status = 'skipped') AS total_skipped,
        COUNT(DISTINCT rule_id)                     AS active_rules
      FROM wa_automation_logs
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
    const totals = totalsResult.rows[0] as any ?? {};
    const rules = await db.select({ id: waAutomationRulesTable.id, name: waAutomationRulesTable.name, runCount: waAutomationRulesTable.runCount, lastRunAt: waAutomationRulesTable.lastRunAt, isActive: waAutomationRulesTable.isActive })
      .from(waAutomationRulesTable)
      .orderBy(desc(waAutomationRulesTable.runCount));
    return res.json({ ...totals, rules });
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
    const agg = await db.execute(sql`
      SELECT
        COUNT(*)                                                                    AS total_sent,
        COUNT(*) FILTER (WHERE status = 'sent' AND delivery_status = 'delivered')  AS total_delivered,
        COUNT(*) FILTER (WHERE status = 'failed')                                  AS total_failed,
        COUNT(*) FILTER (WHERE delivery_status = 'read')                           AS total_read,
        COUNT(*) FILTER (WHERE template_name LIKE 'campaign:%')                    AS campaign_msgs,
        COUNT(*) FILTER (WHERE template_name NOT LIKE 'campaign:%' AND template_name NOT LIKE 'automation:%') AS utility_msgs,
        COUNT(*) FILTER (WHERE template_name LIKE 'automation:%')                  AS automation_msgs
      FROM whatsapp_logs
      WHERE created_at >= NOW() - (${days} || ' days')::interval
    `);
    const stats = agg.rows[0] as any;

    /* Meta WA pricing (Pakistan, 2024 rates in USD) */
    const utilityPerMsg   = 0.0040;
    const marketingPerMsg = 0.0100;
    const usdToPkr        = 278;

    const totalSent      = Number(stats.total_sent    ?? 0);
    const totalDelivered = Number(stats.total_delivered ?? 0);
    const totalFailed    = Number(stats.total_failed   ?? 0);
    const totalRead      = Number(stats.total_read     ?? 0);
    const marketingCount = Number(stats.campaign_msgs  ?? 0);
    const utilityCount   = Number(stats.utility_msgs   ?? 0) + Number(stats.automation_msgs ?? 0);
    const automationCount = Number(stats.automation_msgs ?? 0);

    const utilityCostUsd   = utilityCount   * utilityPerMsg;
    const marketingCostUsd = marketingCount * marketingPerMsg;
    const totalCostUsd     = utilityCostUsd + marketingCostUsd;
    const totalCostPkr     = Math.round(totalCostUsd * usdToPkr);

    /* daily trend with per-day cost estimate */
    const dailyRaw = await db.execute(sql`
      SELECT
        DATE(created_at)::text                                              AS date,
        COUNT(*)                                                            AS sent,
        COUNT(*) FILTER (WHERE status = 'sent' AND delivery_status = 'delivered') AS delivered,
        COUNT(*) FILTER (WHERE status = 'failed')                          AS failed,
        COUNT(*) FILTER (WHERE delivery_status = 'read')                   AS read_count,
        COUNT(*) FILTER (WHERE template_name LIKE 'campaign:%')            AS campaign,
        COUNT(*) FILTER (WHERE template_name NOT LIKE 'campaign:%')        AS utility
      FROM whatsapp_logs
      WHERE created_at >= NOW() - (${days} || ' days')::interval
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `);

    const dailyTrend = (dailyRaw.rows as any[]).map(r => {
      const dayCampaign = Number(r.campaign ?? 0);
      const dayUtility  = Number(r.utility  ?? 0);
      const dayCostUsd  = dayCampaign * marketingPerMsg + dayUtility * utilityPerMsg;
      return {
        date:             r.date,
        sent:             Number(r.sent ?? 0),
        delivered:        Number(r.delivered ?? 0),
        failed:           Number(r.failed ?? 0),
        readCount:        Number(r.read_count ?? 0),
        estimatedCostPKR: Math.round(dayCostUsd * usdToPkr),
      };
    });

    /* by-type breakdown */
    const byTypeRaw = await db.execute(sql`
      SELECT
        COALESCE(template_name, 'unknown') AS type,
        COUNT(*)                           AS count
      FROM whatsapp_logs
      WHERE created_at >= NOW() - (${days} || ' days')::interval
        AND template_name IS NOT NULL
      GROUP BY template_name
      ORDER BY count DESC
      LIMIT 15
    `);
    const byType = (byTypeRaw.rows as any[]).map(r => ({
      type:  r.type as string,
      count: Number(r.count),
    }));

    /* campaign performance */
    const campaignsRaw = await db.select({
      id:             whatsappCampaignsTable.id,
      name:           whatsappCampaignsTable.name,
      status:         whatsappCampaignsTable.status,
      sentCount:      whatsappCampaignsTable.sentCount,
      failedCount:    whatsappCampaignsTable.failedCount,
      deliveredCount: whatsappCampaignsTable.deliveredCount,
      readCount:      whatsappCampaignsTable.readCount,
      sentAt:         whatsappCampaignsTable.sentAt,
      createdAt:      whatsappCampaignsTable.createdAt,
    }).from(whatsappCampaignsTable).orderBy(desc(whatsappCampaignsTable.createdAt)).limit(20);

    const campaignPerformance = campaignsRaw.map(c => {
      const sent = Number(c.sentCount ?? 0);
      const delivered = Number(c.deliveredCount ?? 0);
      const failed = Number(c.failedCount ?? 0);
      return {
        campaignId:   c.id,
        name:         c.name,
        status:       c.status,
        sent,
        delivered,
        failed,
        readCount:    Number(c.readCount ?? 0),
        deliveryRate: sent > 0 ? +((delivered / sent) * 100).toFixed(1) : 0,
        sentAt:       c.sentAt,
      };
    });

    return res.json({
      /* top-level KPIs — matches frontend field names */
      totalMessages:          totalSent,
      delivered:              totalDelivered,
      failed:                 totalFailed,
      readCount:              totalRead,
      deliveryRate:           totalSent > 0 ? +((totalDelivered / totalSent) * 100).toFixed(1) : 0,
      readRate:               totalSent > 0 ? +((totalRead       / totalSent) * 100).toFixed(1) : 0,

      /* cost estimates */
      estimatedCostPKR:       totalCostPkr,
      estimatedCostUSD:       +totalCostUsd.toFixed(4),
      utilityCostPKR:         Math.round(utilityCostUsd   * usdToPkr),
      marketingCostPKR:       Math.round(marketingCostUsd * usdToPkr),

      /* conversation type counts */
      marketingConversations: marketingCount,
      utilityConversations:   utilityCount,
      serviceConversations:   automationCount,

      /* breakdowns */
      byType,
      dailyTrend,
      campaignPerformance,

      /* meta */
      period: { days, startDate: new Date(Date.now() - days * 86400000).toISOString().split("T")[0], endDate: new Date().toISOString().split("T")[0] },
      rates:  { utilityPerMsg, marketingPerMsg, usdToPkr },
    });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ── Notification Settings: new events ─────────────────── */
router.get("/admin/wa/notification-settings-extended", adminMiddleware as any, async (req, res) => {
  try {
    const sResult = await db.execute(sql`SELECT * FROM whatsapp_settings LIMIT 1`);
    return res.json(sResult.rows[0] ?? {});
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

export default router;
