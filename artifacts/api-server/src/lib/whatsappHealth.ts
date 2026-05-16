import { db, whatsappSettingsTable, whatsappLogsTable, whatsappTemplatesTable, waWebhookFailuresTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { classifyWaFailure, type WaHealthSeverity } from "./waFailureClassifier.js";
import { createAdminAlert } from "./adminAlerts.js";
import { logger } from "./logger.js";

type HealthCheckStatus = "ok" | "warning" | "down";

interface HealthCheck {
  id: string;
  label: string;
  status: HealthCheckStatus;
  reason: string;
  action: string;
  lastSeenAt?: string | null;
}

function asRows<T = Record<string, unknown>>(result: unknown): T[] {
  const maybe = result as { rows?: T[] };
  return Array.isArray(maybe?.rows) ? maybe.rows : (Array.isArray(result) ? result as T[] : []);
}

function overallFromChecks(checks: HealthCheck[]): WaHealthSeverity {
  if (checks.some((c) => c.status === "down")) return "disconnected";
  if (checks.some((c) => c.status === "warning")) return "warning";
  return "connected";
}

function check(id: string, label: string, status: HealthCheckStatus, reason: string, action: string, lastSeenAt?: unknown): HealthCheck {
  return {
    id,
    label,
    status,
    reason,
    action,
    lastSeenAt: lastSeenAt ? new Date(String(lastSeenAt)).toISOString() : null,
  };
}

export async function buildWhatsappHealthReport() {
  const now = new Date();
  const since1h = new Date(now.getTime() - 60 * 60 * 1000);
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [settings] = await db
    .select()
    .from(whatsappSettingsTable)
    .orderBy(desc(whatsappSettingsTable.isActive), desc(whatsappSettingsTable.updatedAt), desc(whatsappSettingsTable.id))
    .limit(1);

  const logStats = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'sent' AND created_at >= ${since24h})::int AS sent_24h,
      COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= ${since24h})::int AS failed_24h,
      COUNT(*) FILTER (WHERE status = 'received' AND created_at >= ${since24h})::int AS inbound_24h,
      COUNT(*) FILTER (WHERE status = 'received' AND created_at >= ${since1h})::int AS inbound_1h,
      COUNT(*) FILTER (WHERE delivery_status = 'failed' AND created_at >= ${since24h})::int AS delivery_failed_24h,
      COUNT(*) FILTER (WHERE status = 'failed' AND COALESCE(retry_count, 0) < 3 AND created_at >= ${since24h})::int AS retry_backlog,
      COUNT(*) FILTER (WHERE status = 'sent' AND delivery_status = 'sent' AND created_at < NOW() - INTERVAL '30 minutes' AND created_at >= ${since24h})::int AS stuck_sent,
      MAX(created_at) FILTER (WHERE status IN ('sent','received') OR delivery_status IN ('delivered','read')) AS last_success_at,
      MAX(created_at) FILTER (WHERE status = 'failed' OR delivery_status = 'failed') AS last_failed_at,
      MAX(created_at) FILTER (WHERE status = 'received') AS last_inbound_at
    FROM whatsapp_logs
  `);
  const stats = asRows<Record<string, unknown>>(logStats)[0] ?? {};

  const rejectedTemplates = await db.select()
    .from(whatsappTemplatesTable)
    .where(eq(whatsappTemplatesTable.approvalStatus, "rejected"))
    .orderBy(desc(whatsappTemplatesTable.createdAt))
    .limit(10)
    .catch(() => []);

  const webhookFailures = await db.select()
    .from(waWebhookFailuresTable)
    .orderBy(desc(waWebhookFailuresTable.createdAt))
    .limit(20)
    .catch(() => []);

  const recentFailures = await db.select()
    .from(whatsappLogsTable)
    .where(eq(whatsappLogsTable.status, "failed"))
    .orderBy(desc(whatsappLogsTable.createdAt))
    .limit(20)
    .catch(() => []);

  const failedByReasonResult = await db.execute(sql`
    SELECT COALESCE(failure_reason, response, 'Unknown') AS reason, COUNT(*)::int AS count
    FROM whatsapp_logs
    WHERE (status = 'failed' OR delivery_status = 'failed')
      AND created_at >= ${since24h}
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 10
  `).catch(() => ({ rows: [] }));

  const orderWaResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE created_at >= ${since24h})::int AS orders_with_wa_24h,
      COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= ${since24h})::int AS order_wa_failed_24h,
      COUNT(*) FILTER (WHERE status = 'sent' AND created_at >= ${since24h})::int AS order_wa_sent_24h,
      COUNT(*) FILTER (WHERE status = 'pending' AND created_at < NOW() - INTERVAL '10 minutes')::int AS order_wa_pending_stuck,
      COALESCE(SUM(retry_count) FILTER (WHERE created_at >= ${since24h}), 0)::int AS order_wa_retry_attempts
    FROM whatsapp_logs
    WHERE shopify_order_id IS NOT NULL OR trigger_event IN ('order_confirmed', 'order_confirmed_wa', 'payment_wa', 'status_wa', 'cancelled_wa')
  `).catch(() => ({ rows: [] }));

  const hmacFailures24h = webhookFailures.filter((f: any) => String(f.error ?? "").includes("invalid_hmac") && new Date(f.createdAt).getTime() >= since24h.getTime()).length;
  const latestWebhookFailure = webhookFailures[0] as any;
  const failureClassifications = [
    ...recentFailures.slice(0, 10).map((f: any) => ({
      id: f.id,
      source: "message",
      phone: f.phone,
      createdAt: f.createdAt,
      retryCount: f.retryCount ?? 0,
      rawReason: f.failureReason ?? f.response ?? "Failed",
      ...classifyWaFailure(f.failureReason ?? f.response ?? f.message),
    })),
    ...webhookFailures.slice(0, 5).map((f: any) => ({
      id: f.id,
      source: "webhook",
      createdAt: f.createdAt,
      rawReason: f.error,
      ...classifyWaFailure(f.error ?? f.payload),
    })),
  ];

  const checks: HealthCheck[] = [];
  checks.push(settings?.isActive && settings.accessToken && settings.phoneNumberId
    ? check("api", "API status", "ok", "WhatsApp API credentials are configured.", "No action needed.")
    : check("api", "API status", "down", "WhatsApp API is inactive or missing credentials.", "Save Access Token and Phone Number ID, then enable WhatsApp."));

  checks.push(settings?.accessToken
    ? check("token", "Token status", Number(stats.failed_24h ?? 0) > 0 && failureClassifications.some((f) => f.code === "TOKEN_EXPIRED_OR_INVALID") ? "down" : "ok", "Token is present.", "If messages fail with token errors, reconnect WhatsApp.")
    : check("token", "Token status", "down", "Access token is missing.", "Generate/save a valid Meta access token."));

  checks.push(hmacFailures24h > 0
    ? check("webhook", "Webhook status", "down", `${hmacFailures24h} webhook event(s) rejected because App Secret/HMAC did not match.`, "Fix App Secret in admin settings and Railway env.", latestWebhookFailure?.createdAt)
    : check("webhook", "Webhook status", settings?.appSecret || process.env.META_APP_SECRET ? "ok" : "warning", settings?.appSecret || process.env.META_APP_SECRET ? "Webhook App Secret is configured." : "Webhook App Secret is missing; production webhooks can be rejected.", "Set Meta App Secret for verified webhooks.", stats.last_inbound_at));

  checks.push(Number(stats.stuck_sent ?? 0) > 0
    ? check("delivery", "Message delivery status", "warning", `${stats.stuck_sent} message(s) are still sent-only after 30 minutes; delivery webhooks may be delayed or not subscribed.`, "Confirm Meta webhook field 'messages' is subscribed and retry failures.")
    : check("delivery", "Message delivery status", Number(stats.delivery_failed_24h ?? 0) > 0 ? "warning" : "ok", `${Number(stats.delivery_failed_24h ?? 0)} delivery failure(s) in the last 24h.`, "Review failed messages and retry valid ones.", stats.last_success_at));

  checks.push(rejectedTemplates.length > 0
    ? check("templates", "Template status", "down", `${rejectedTemplates.length} template(s) rejected by Meta.`, "Fix rejected templates and resubmit in Meta.", (rejectedTemplates[0] as any)?.createdAt)
    : check("templates", "Template status", "ok", "No rejected templates found.", "No action needed."));

  checks.push(Number(stats.retry_backlog ?? 0) > 20 || Number(stats.stuck_sent ?? 0) > 20
    ? check("queue", "Queue status", "warning", `Retry backlog is ${stats.retry_backlog ?? 0}; sent-only queue is ${stats.stuck_sent ?? 0}.`, "Auto-retry is running; reduce campaigns and inspect failed reasons.")
    : check("queue", "Queue status", "ok", `Retry backlog is ${stats.retry_backlog ?? 0}.`, "No action needed."));

  const overall = overallFromChecks(checks);
  const criticalIssue = checks.find((c) => c.status === "down") ?? checks.find((c) => c.status === "warning") ?? null;

  return {
    generatedAt: now.toISOString(),
    overall,
    statusLabel: overall === "connected" ? "Connected" : overall === "disconnected" ? "Disconnected" : "Warning",
    mainIssue: criticalIssue,
    checks,
    metrics: {
      sent24h: Number(stats.sent_24h ?? 0),
      failed24h: Number(stats.failed_24h ?? 0),
      inbound24h: Number(stats.inbound_24h ?? 0),
      inbound1h: Number(stats.inbound_1h ?? 0),
      deliveryFailed24h: Number(stats.delivery_failed_24h ?? 0),
      retryBacklog: Number(stats.retry_backlog ?? 0),
      stuckSent: Number(stats.stuck_sent ?? 0),
      lastSuccessfulMessageAt: stats.last_success_at ?? null,
      lastFailedMessageAt: stats.last_failed_at ?? null,
      lastInboundAt: stats.last_inbound_at ?? null,
    },
    rootCauses: failureClassifications,
    failedByReason: asRows(failedByReasonResult).map((row: any) => ({ ...row, classification: classifyWaFailure(row.reason) })),
    recentFailures,
    webhookFailures,
    rejectedTemplates,
    orderMonitoring: asRows(orderWaResult)[0] ?? {
      orders_with_wa_24h: 0,
      order_wa_failed_24h: 0,
      order_wa_sent_24h: 0,
      order_wa_pending_stuck: 0,
      order_wa_retry_attempts: 0,
    },
  };
}

let healthTimer: ReturnType<typeof setInterval> | null = null;

export function startWhatsappHealthAlertScheduler(intervalMinutes = 5) {
  if (healthTimer) return;

  const run = async () => {
    try {
      const report = await buildWhatsappHealthReport();
      const downChecks = report.checks.filter((c) => c.status === "down");
      const warnChecks = report.checks.filter((c) => c.status === "warning");
      for (const item of downChecks.slice(0, 3)) {
        await createAdminAlert({
          title: `WhatsApp ${item.label}: ${item.reason}`,
          message: `Reason: ${item.reason}\nAction: ${item.action}`,
          type: "wa_health",
          dedupeMinutes: 45,
        });
      }
      if (downChecks.length === 0 && warnChecks.length > 0) {
        const item = warnChecks[0]!;
        await createAdminAlert({
          title: `WhatsApp warning: ${item.label}`,
          message: `Reason: ${item.reason}\nAction: ${item.action}`,
          type: "wa_health",
          dedupeMinutes: 60,
        });
      }
    } catch (err) {
      logger.warn({ err }, "WhatsApp health alert scheduler failed");
    }
  };

  healthTimer = setInterval(() => void run(), intervalMinutes * 60_000);
  void run();
  logger.info({ intervalMinutes }, "WhatsApp health alert scheduler started");
}
