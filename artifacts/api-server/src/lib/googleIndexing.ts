/**
 * Google Indexing API integration
 * Uses service account JWT to call https://indexing.googleapis.com/v3/urlNotifications:publish
 * Rate limit: 200 requests/day (configurable quota guard)
 */

import { createSign } from "crypto";
import { db } from "@workspace/db";
import { googleIndexingSettingsTable, indexingLogsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { logger } from "./logger";

/* ─── Types ──────────────────────────────────────────── */

export type IndexingAction = "URL_UPDATED" | "URL_DELETED";
export type ContentType = "product" | "category" | "blog" | "page";

interface ServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  token_uri: string;
}

/* ─── In-memory queue ────────────────────────────────── */

interface QueueItem {
  url: string;
  contentType: ContentType;
  action: IndexingAction;
  triggeredBy: string;
  retries: number;
  logId?: number;
}

const queue: QueueItem[] = [];
let processingQueue = false;
const MAX_RETRIES = 3;
const DAILY_QUOTA = 180; // Keep 20 buffer below Google's 200 limit

/* ─── JWT helpers ────────────────────────────────────── */

function base64url(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/indexing",
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify(claim));
  const signingInput = `${header}.${payload}`;

  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = base64url(sign.sign(sa.private_key));

  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    throw new Error(`OAuth token error: ${tokenData.error ?? JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

/* ─── Connection test (exported) ─────────────────────── */

export async function testGoogleConnection(overrideJson?: string): Promise<{
  ok: boolean;
  clientEmail?: string;
  projectId?: string;
  tokenPreview?: string;
  error?: string;
}> {
  try {
    let saJson: string | null | undefined = overrideJson;
    if (!saJson) {
      const rows = await db.select().from(googleIndexingSettingsTable).limit(1);
      saJson = rows[0]?.serviceAccountJson;
    }
    if (!saJson) return { ok: false, error: "No service account credentials configured" };
    const sa = parseServiceAccount(saJson);
    const token = await getAccessToken(sa);
    return {
      ok: true,
      clientEmail: sa.client_email,
      projectId: sa.project_id,
      tokenPreview: token.slice(0, 24) + "…",
    };
  } catch (err: any) {
    return { ok: false, error: err.message ?? "Connection test failed" };
  }
}

/* ─── Settings helpers ───────────────────────────────── */

async function getSettings() {
  const rows = await db.select().from(googleIndexingSettingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [row] = await db.insert(googleIndexingSettingsTable).values({}).returning();
  return row;
}

function parseServiceAccount(json: string): ServiceAccount {
  try {
    const sa = JSON.parse(json) as ServiceAccount;
    if (!sa.private_key || !sa.client_email) throw new Error("Missing private_key or client_email");
    return sa;
  } catch {
    throw new Error("Invalid service account JSON");
  }
}

/* ─── Quota management ───────────────────────────────── */

async function checkAndIncrementQuota(): Promise<boolean> {
  const settings = await getSettings();
  const today = new Date().toISOString().slice(0, 10);

  let quotaUsed = settings.dailyQuotaUsed ?? 0;
  if (settings.quotaResetDate !== today) {
    quotaUsed = 0;
    await db.update(googleIndexingSettingsTable)
      .set({ dailyQuotaUsed: 0, quotaResetDate: today })
      .where(eq(googleIndexingSettingsTable.id, settings.id));
  }

  if (quotaUsed >= DAILY_QUOTA) {
    logger.warn({ quotaUsed, DAILY_QUOTA }, "Google Indexing daily quota exhausted");
    return false;
  }

  await db.update(googleIndexingSettingsTable)
    .set({ dailyQuotaUsed: quotaUsed + 1 })
    .where(eq(googleIndexingSettingsTable.id, settings.id));

  return true;
}

/* ─── Core submit function ───────────────────────────── */

async function submitToGoogle(url: string, action: IndexingAction, accessToken: string): Promise<{ ok: boolean; response: string }> {
  const apiUrl = "https://indexing.googleapis.com/v3/urlNotifications:publish";
  logger.info({ url, action }, "Submitting URL to Google Indexing API");

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, type: action }),
  });

  const data = await res.json() as Record<string, unknown>;
  const responseText = JSON.stringify(data);

  if (!res.ok) {
    logger.error({ url, status: res.status, data }, "Google Indexing API error");
    return { ok: false, response: responseText };
  }

  logger.info({ url, data }, "Google Indexing API success");
  return { ok: true, response: responseText };
}

/* ─── Queue processor ────────────────────────────────── */

async function processQueue(): Promise<void> {
  if (processingQueue || queue.length === 0) return;
  processingQueue = true;

  while (queue.length > 0) {
    const item = queue[0];

    try {
      const settings = await getSettings();
      if (!settings.autoIndexEnabled && item.triggeredBy === "auto") {
        queue.shift();
        if (item.logId) {
          await db.update(indexingLogsTable)
            .set({ status: "skipped", errorMessage: "Auto-indexing disabled" })
            .where(eq(indexingLogsTable.id, item.logId));
        }
        continue;
      }

      if (!settings.serviceAccountJson) {
        queue.shift();
        if (item.logId) {
          await db.update(indexingLogsTable)
            .set({ status: "failed", errorMessage: "No service account configured" })
            .where(eq(indexingLogsTable.id, item.logId));
        }
        continue;
      }

      const canProceed = await checkAndIncrementQuota();
      if (!canProceed) {
        if (item.logId) {
          await db.update(indexingLogsTable)
            .set({ status: "rate_limited", errorMessage: "Daily quota exhausted (180/day)" })
            .where(eq(indexingLogsTable.id, item.logId));
        }
        queue.shift();
        continue;
      }

      const sa = parseServiceAccount(settings.serviceAccountJson);
      const token = await getAccessToken(sa);
      const result = await submitToGoogle(item.url, item.action, token);

      if (item.logId) {
        await db.update(indexingLogsTable)
          .set({
            status: result.ok ? "success" : "failed",
            googleResponse: result.response,
            errorMessage: result.ok ? null : `API returned error: ${result.response.slice(0, 300)}`,
          })
          .where(eq(indexingLogsTable.id, item.logId));
      }

      queue.shift();

      // Rate limit: 1 req/sec
      if (queue.length > 0) await new Promise(r => setTimeout(r, 1000));

    } catch (err: any) {
      logger.error({ err: err.message, url: item.url, retry: item.retries }, "Indexing queue error");

      if (item.retries < MAX_RETRIES) {
        item.retries++;
        queue.shift();
        queue.push(item); // Retry at end
        await new Promise(r => setTimeout(r, 5000 * item.retries)); // Exponential backoff
      } else {
        if (item.logId) {
          await db.update(indexingLogsTable)
            .set({ status: "failed", errorMessage: err.message?.slice(0, 500) })
            .where(eq(indexingLogsTable.id, item.logId));
        }
        queue.shift();
      }
    }
  }

  processingQueue = false;
}

/* ─── Public API ─────────────────────────────────────── */

/**
 * Queue a URL for Google Indexing (auto-trigger from routes)
 */
export async function autoIndex(url: string, contentType: ContentType, action: IndexingAction = "URL_UPDATED"): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.autoIndexEnabled || !settings.serviceAccountJson) return;

    const [log] = await db.insert(indexingLogsTable).values({
      url, contentType, action, triggeredBy: "auto", status: "pending",
    }).returning();

    queue.push({ url, contentType, action, triggeredBy: "auto", retries: 0, logId: log.id });
    processQueue().catch(e => logger.error(e, "Queue process error"));
  } catch (err) {
    logger.error(err, "autoIndex enqueue failed");
  }
}

/**
 * Manually submit a URL (from admin UI)
 */
export async function manualIndex(url: string, contentType: ContentType, action: IndexingAction = "URL_UPDATED"): Promise<{ logId: number }> {
  const [log] = await db.insert(indexingLogsTable).values({
    url, contentType, action, triggeredBy: "manual", status: "pending",
  }).returning();

  queue.push({ url, contentType, action, triggeredBy: "manual", retries: 0, logId: log.id });
  processQueue().catch(e => logger.error(e, "Queue process error"));

  return { logId: log.id };
}

/**
 * Get recent indexing logs
 */
export async function getIndexingLogs(limit = 100, offset = 0) {
  return db.select().from(indexingLogsTable)
    .orderBy(desc(indexingLogsTable.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Get current settings (safe — no private key exposed)
 */
export async function getSafeSettings() {
  const settings = await getSettings();
  const hasCredentials = !!settings.serviceAccountJson;
  let clientEmail: string | null = null;

  if (hasCredentials) {
    try {
      const sa = JSON.parse(settings.serviceAccountJson!) as ServiceAccount;
      clientEmail = sa.client_email ?? null;
    } catch { /* ignore */ }
  }

  return {
    id: settings.id,
    siteUrl: settings.siteUrl,
    autoIndexEnabled: settings.autoIndexEnabled,
    hasCredentials,
    clientEmail,
    dailyQuotaUsed: settings.dailyQuotaUsed,
    quotaResetDate: settings.quotaResetDate,
    updatedAt: settings.updatedAt,
  };
}

/**
 * Get queue length
 */
export function getQueueLength(): number {
  return queue.length;
}
