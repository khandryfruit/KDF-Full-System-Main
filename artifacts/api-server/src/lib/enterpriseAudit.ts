import { db } from "@workspace/db";
import { adminActivityLogsTable } from "@workspace/db";
import type { AuthRequest } from "./auth.js";
import { logger } from "./logger.js";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditEntry {
  action: string;
  resource?: string;
  resourceId?: string | number;
  details?: string;
  oldData?: unknown;
  newData?: unknown;
  severity?: AuditSeverity;
  sessionId?: number;
}

function parseUserAgent(ua: string | undefined) {
  if (!ua) return { deviceType: null, browser: null, os: null };
  const lower = ua.toLowerCase();
  let deviceType = "desktop";
  if (/mobile|android|iphone/i.test(ua)) deviceType = "mobile";
  else if (/ipad|tablet/i.test(ua)) deviceType = "tablet";

  let browser = "Unknown";
  if (lower.includes("chrome") && !lower.includes("edg")) browser = "Chrome";
  else if (lower.includes("firefox")) browser = "Firefox";
  else if (lower.includes("safari") && !lower.includes("chrome")) browser = "Safari";
  else if (lower.includes("edg")) browser = "Edge";

  let os = "Unknown";
  if (lower.includes("windows")) os = "Windows";
  else if (lower.includes("mac os")) os = "macOS";
  else if (lower.includes("android")) os = "Android";
  else if (lower.includes("iphone") || lower.includes("ipad")) os = "iOS";
  else if (lower.includes("linux")) os = "Linux";

  return { deviceType, browser, os };
}

export function getClientMeta(req: AuthRequest) {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    null;
  const userAgent = (req.headers["user-agent"] as string) ?? null;
  const { deviceType, browser, os } = parseUserAgent(userAgent ?? undefined);
  const country = (req.headers["cf-ipcountry"] as string) ?? null;
  return { ip, userAgent, deviceType, browser, os, country, city: null as string | null };
}

/** Enterprise audit log — use from any route after mutations */
export async function writeAuditLog(req: AuthRequest, entry: AuditEntry): Promise<void> {
  try {
    const u = req.user;
    const meta = getClientMeta(req);
    await db.insert(adminActivityLogsTable).values({
      userId:     u?.adminUserId ?? u?.id ?? null,
      userEmail:  u?.email ?? null,
      userName:   u?.name ?? null,
      action:     entry.action,
      resource:   entry.resource ?? null,
      resourceId: entry.resourceId != null ? String(entry.resourceId) : null,
      details:    entry.details ?? null,
      oldData:    entry.oldData ?? null,
      newData:    entry.newData ?? null,
      ipAddress:  meta.ip,
      userAgent:  meta.userAgent,
      severity:   entry.severity ?? "info",
      deviceType: meta.deviceType,
      browser:    meta.browser,
      os:         meta.os,
      country:    meta.country,
      city:       meta.city,
      sessionId:  entry.sessionId ?? null,
    } as any);
  } catch (e) {
    logger.warn({ err: e }, "enterprise audit log failed");
  }
}

export function diffFields<T extends Record<string, unknown>>(
  oldObj: T,
  newObj: Partial<T>,
): { oldData: Partial<T>; newData: Partial<T> } {
  const oldData: Partial<T> = {};
  const newData: Partial<T> = {};
  for (const key of Object.keys(newObj) as (keyof T)[]) {
    if (newObj[key] !== undefined && oldObj[key] !== newObj[key]) {
      oldData[key] = oldObj[key];
      newData[key] = newObj[key];
    }
  }
  return { oldData, newData };
}
