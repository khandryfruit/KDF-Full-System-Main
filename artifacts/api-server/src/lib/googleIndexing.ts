/**
 * Google Indexing API integration
 * Uses service account JWT to call https://indexing.googleapis.com/v3/urlNotifications:publish
 * Rate limit: 200 requests/day (configurable quota guard)
 */

import { createSign } from "crypto";
import { db } from "@workspace/db";
import { googleIndexingSettingsTable, indexingLogsTable } from "@workspace/db/schema";
import { eq, desc, sql, inArray, and } from "drizzle-orm";
import { logger } from "./logger";
import {
  buildIndexingPathUrl,
  describeUrlIssue,
  normalizeIndexingUrl,
  normalizeSiteUrl,
} from "./googleIndexingUrl";

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

interface QueueItem {
  url: string;
  contentType: ContentType;
  action: IndexingAction;
  triggeredBy: string;
  retries: number;
  logId?: number;
}

const queue: QueueItem[] = [];
const queuedUrlKeys = new Set<string>();
let processingQueue = false;
const MAX_RETRIES = 3;
const DAILY_QUOTA = 180;
const QUEUE_DELAY_MS = 350;
const QUEUE_DELAY_BULK_MS = 250;

let cachedToken: { token: string; expiresAt: number; email: string } | null = null;

/* ─── JWT helpers ────────────────────────────────────── */

function base64url(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.email === sa.client_email && cachedToken.expiresAt > now + 120) {
    return cachedToken.token;
  }

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

  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    throw new Error(`OAuth token error: ${tokenData.error ?? JSON.stringify(tokenData)}`);
  }

  cachedToken = {
    token: tokenData.access_token,
    expiresAt: now + 3500,
    email: sa.client_email,
  };
  return tokenData.access_token;
}

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection test failed";
    return { ok: false, error: message };
  }
}

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

async function resolveCanonicalUrl(
  url: string,
  siteUrl?: string | null,
): Promise<{ url: string | null; error?: string }> {
  const settings = await getSettings();
  const base = normalizeSiteUrl(siteUrl ?? settings.siteUrl);
  return normalizeIndexingUrl(url, base);
}

async function checkAndIncrementQuota(): Promise<boolean> {
  const settings = await getSettings();
  const today = new Date().toISOString().slice(0, 10);

  let quotaUsed = settings.dailyQuotaUsed ?? 0;
  if (settings.quotaResetDate !== today) {
    quotaUsed = 0;
    await db
      .update(googleIndexingSettingsTable)
      .set({ dailyQuotaUsed: 0, quotaResetDate: today })
      .where(eq(googleIndexingSettingsTable.id, settings.id));
  }

  if (quotaUsed >= DAILY_QUOTA) {
    logger.warn({ quotaUsed, DAILY_QUOTA }, "Google Indexing daily quota exhausted");
    return false;
  }

  await db
    .update(googleIndexingSettingsTable)
    .set({ dailyQuotaUsed: quotaUsed + 1 })
    .where(eq(googleIndexingSettingsTable.id, settings.id));

  return true;
}

async function submitToGoogle(
  url: string,
  action: IndexingAction,
  accessToken: string,
): Promise<{ ok: boolean; response: string }> {
  const apiUrl = "https://indexing.googleapis.com/v3/urlNotifications:publish";
  logger.info({ url, action }, "Submitting URL to Google Indexing API");

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, type: action }),
  });

  const data = (await res.json()) as Record<string, unknown>;
  const responseText = JSON.stringify(data);

  if (!res.ok) {
    logger.error({ url, status: res.status, data }, "Google Indexing API error");
    return { ok: false, response: responseText };
  }

  logger.info({ url, data }, "Google Indexing API success");
  return { ok: true, response: responseText };
}

function queueKey(url: string, action: IndexingAction): string {
  return `${action}::${url.toLowerCase()}`;
}

function enqueueItem(item: QueueItem): boolean {
  const key = queueKey(item.url, item.action);
  if (queuedUrlKeys.has(key)) {
    logger.info({ url: item.url }, "Skipping duplicate indexing queue entry");
    return false;
  }
  queuedUrlKeys.add(key);
  queue.push(item);
  return true;
}

function dequeueItem(item: QueueItem): void {
  queuedUrlKeys.delete(queueKey(item.url, item.action));
}

async function processQueue(): Promise<void> {
  if (processingQueue || queue.length === 0) return;
  processingQueue = true;

  let accessToken: string | null = null;
  let sa: ServiceAccount | null = null;

  while (queue.length > 0) {
    const item = queue[0];

    try {
      const settings = await getSettings();

      if (!settings.autoIndexEnabled && item.triggeredBy === "auto") {
        dequeueItem(item);
        queue.shift();
        if (item.logId) {
          await db
            .update(indexingLogsTable)
            .set({ status: "skipped", errorMessage: "Auto-indexing disabled" })
            .where(eq(indexingLogsTable.id, item.logId));
        }
        continue;
      }

      if (!settings.serviceAccountJson) {
        dequeueItem(item);
        queue.shift();
        if (item.logId) {
          await db
            .update(indexingLogsTable)
            .set({ status: "failed", errorMessage: "No service account configured" })
            .where(eq(indexingLogsTable.id, item.logId));
        }
        continue;
      }

      const canonical = normalizeIndexingUrl(item.url, settings.siteUrl);
      if (!canonical.url) {
        dequeueItem(item);
        queue.shift();
        if (item.logId) {
          await db
            .update(indexingLogsTable)
            .set({
              status: "failed",
              errorMessage: canonical.error ?? "Invalid URL — must be full https:// URL",
            })
            .where(eq(indexingLogsTable.id, item.logId));
        }
        continue;
      }

      if (canonical.url !== item.url && item.logId) {
        item.url = canonical.url;
        await db.update(indexingLogsTable).set({ url: canonical.url }).where(eq(indexingLogsTable.id, item.logId));
      }

      const canProceed = await checkAndIncrementQuota();
      if (!canProceed) {
        if (item.logId) {
          await db
            .update(indexingLogsTable)
            .set({ status: "rate_limited", errorMessage: "Daily quota exhausted (180/day)" })
            .where(eq(indexingLogsTable.id, item.logId));
        }
        dequeueItem(item);
        queue.shift();
        continue;
      }

      if (!sa) sa = parseServiceAccount(settings.serviceAccountJson);
      if (!accessToken) accessToken = await getAccessToken(sa);

      const result = await submitToGoogle(item.url, item.action, accessToken);

      if (item.logId) {
        const urlIssue = describeUrlIssue(item.url);
        await db
          .update(indexingLogsTable)
          .set({
            status: result.ok ? "success" : "failed",
            googleResponse: result.response,
            errorMessage: result.ok
              ? null
              : urlIssue
                ? `${urlIssue}. ${result.response.slice(0, 240)}`
                : `API error: ${result.response.slice(0, 300)}`,
          })
          .where(eq(indexingLogsTable.id, item.logId));
      }

      dequeueItem(item);
      queue.shift();

      if (queue.length > 0) {
        await new Promise((r) => setTimeout(r, queue.length > 20 ? QUEUE_DELAY_BULK_MS : QUEUE_DELAY_MS));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error({ err: message, url: item.url, retry: item.retries }, "Indexing queue error");

      if (item.retries < MAX_RETRIES) {
        item.retries++;
        dequeueItem(item);
        const requeued = queue.shift()!;
        enqueueItem(requeued);
        await new Promise((r) => setTimeout(r, 4000 * item.retries));
      } else {
        if (item.logId) {
          await db
            .update(indexingLogsTable)
            .set({ status: "failed", errorMessage: message.slice(0, 500) })
            .where(eq(indexingLogsTable.id, item.logId));
        }
        dequeueItem(item);
        queue.shift();
      }
    }
  }

  processingQueue = false;
}

async function indexUrl(
  rawUrl: string,
  contentType: ContentType,
  action: IndexingAction,
  triggeredBy: "auto" | "manual",
): Promise<{ logId: number; url: string; skipped?: boolean; error?: string }> {
  const settings = await getSettings();
  const canonical = await resolveCanonicalUrl(rawUrl, settings.siteUrl);

  if (!canonical.url) {
    const [log] = await db
      .insert(indexingLogsTable)
      .values({
        url: rawUrl.slice(0, 500),
        contentType,
        action,
        triggeredBy,
        status: "failed",
        errorMessage: canonical.error ?? "Invalid URL",
      })
      .returning();
    return { logId: log.id, url: rawUrl, error: canonical.error };
  }

  const [log] = await db
    .insert(indexingLogsTable)
    .values({
      url: canonical.url,
      contentType,
      action,
      triggeredBy,
      status: "pending",
    })
    .returning();

  const item: QueueItem = {
    url: canonical.url,
    contentType,
    action,
    triggeredBy,
    retries: 0,
    logId: log.id,
  };

  const added = enqueueItem(item);
  if (added) {
    processQueue().catch((e) => logger.error(e, "Queue process error"));
  } else if (log.id) {
    await db
      .update(indexingLogsTable)
      .set({ status: "skipped", errorMessage: "Duplicate URL already in queue" })
      .where(eq(indexingLogsTable.id, log.id));
    return { logId: log.id, url: canonical.url, skipped: true };
  }

  return { logId: log.id, url: canonical.url };
}

export async function autoIndex(
  url: string,
  contentType: ContentType,
  action: IndexingAction = "URL_UPDATED",
): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.autoIndexEnabled || !settings.serviceAccountJson) return;
    await indexUrl(url, contentType, action, "auto");
  } catch (err) {
    logger.error(err, "autoIndex enqueue failed");
  }
}

export async function manualIndex(
  url: string,
  contentType: ContentType,
  action: IndexingAction = "URL_UPDATED",
): Promise<{ logId: number; url: string; error?: string }> {
  const result = await indexUrl(url, contentType, action, "manual");
  return { logId: result.logId, url: result.url, error: result.error };
}

export { buildIndexingPathUrl, normalizeIndexingUrl, normalizeSiteUrl };

/**
 * Fix stored log URLs missing https:// and optionally re-queue failed rows.
 */
export async function repairIndexingLogUrls(options?: {
  requeueFailed?: boolean;
}): Promise<{ fixed: number; requeued: number; errors: number }> {
  const settings = await getSettings();
  const base = normalizeSiteUrl(settings.siteUrl);
  const rows = await db.select().from(indexingLogsTable).orderBy(desc(indexingLogsTable.createdAt)).limit(5000);

  let fixed = 0;
  let requeued = 0;
  let errors = 0;

  for (const row of rows) {
    const canonical = normalizeIndexingUrl(row.url, base);
    if (!canonical.url) {
      errors++;
      if (row.status === "failed" || row.status === "pending") {
        await db
          .update(indexingLogsTable)
          .set({
            errorMessage: canonical.error ?? "Could not normalize URL",
          })
          .where(eq(indexingLogsTable.id, row.id));
      }
      continue;
    }

    const needsUrlUpdate = canonical.url !== row.url;
    const shouldRequeue =
      options?.requeueFailed &&
      (row.status === "failed" || (needsUrlUpdate && row.status !== "success"));

    if (needsUrlUpdate) {
      await db
        .update(indexingLogsTable)
        .set({
          url: canonical.url,
          ...(shouldRequeue
            ? { status: "pending", errorMessage: null, googleResponse: null }
            : {}),
        })
        .where(eq(indexingLogsTable.id, row.id));
      fixed++;
    }

    if (shouldRequeue) {
      enqueueItem({
        url: canonical.url,
        contentType: row.contentType as ContentType,
        action: row.action as IndexingAction,
        triggeredBy: "manual",
        retries: 0,
        logId: row.id,
      });
      requeued++;
    }
  }

  if (requeued > 0) {
    processQueue().catch((e) => logger.error(e, "Repair requeue error"));
  }

  return { fixed, requeued, errors };
}

export async function retryFailedIndexingLogs(logIds?: number[]): Promise<{ requeued: number }> {
  const settings = await getSettings();
  const base = normalizeSiteUrl(settings.siteUrl);

  const conditions = logIds?.length
    ? and(inArray(indexingLogsTable.id, logIds), eq(indexingLogsTable.status, "failed"))
    : eq(indexingLogsTable.status, "failed");

  const failed = await db.select().from(indexingLogsTable).where(conditions).limit(500);

  let requeued = 0;
  for (const row of failed) {
    const canonical = normalizeIndexingUrl(row.url, base);
    if (!canonical.url) {
      await db
        .update(indexingLogsTable)
        .set({ errorMessage: canonical.error ?? "Invalid URL" })
        .where(eq(indexingLogsTable.id, row.id));
      continue;
    }

    await db
      .update(indexingLogsTable)
      .set({ url: canonical.url, status: "pending", errorMessage: null, googleResponse: null })
      .where(eq(indexingLogsTable.id, row.id));

    if (enqueueItem({
      url: canonical.url,
      contentType: row.contentType as ContentType,
      action: row.action as IndexingAction,
      triggeredBy: "manual",
      retries: 0,
      logId: row.id,
    })) {
      requeued++;
    }
  }

  if (requeued > 0) {
    processQueue().catch((e) => logger.error(e, "Retry queue error"));
  }

  return { requeued };
}

export async function getIndexingLogs(limit = 100, offset = 0, status?: string) {
  if (status && status !== "all") {
    return db
      .select()
      .from(indexingLogsTable)
      .where(eq(indexingLogsTable.status, status))
      .orderBy(desc(indexingLogsTable.createdAt))
      .limit(limit)
      .offset(offset);
  }
  return db
    .select()
    .from(indexingLogsTable)
    .orderBy(desc(indexingLogsTable.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getSafeSettings() {
  const settings = await getSettings();
  const hasCredentials = !!settings.serviceAccountJson;
  let clientEmail: string | null = null;

  if (hasCredentials) {
    try {
      const parsed = JSON.parse(settings.serviceAccountJson!) as ServiceAccount;
      clientEmail = parsed.client_email ?? null;
    } catch {
      /* ignore */
    }
  }

  const normalizedSite = normalizeSiteUrl(settings.siteUrl);
  if (normalizedSite && normalizedSite !== settings.siteUrl) {
    await db
      .update(googleIndexingSettingsTable)
      .set({ siteUrl: normalizedSite, updatedAt: new Date() })
      .where(eq(googleIndexingSettingsTable.id, settings.id));
  }

  return {
    id: settings.id,
    siteUrl: normalizedSite ?? settings.siteUrl,
    autoIndexEnabled: settings.autoIndexEnabled,
    hasCredentials,
    clientEmail,
    dailyQuotaUsed: settings.dailyQuotaUsed,
    quotaResetDate: settings.quotaResetDate,
    updatedAt: settings.updatedAt,
  };
}

export function getQueueLength(): number {
  return queue.length;
}
