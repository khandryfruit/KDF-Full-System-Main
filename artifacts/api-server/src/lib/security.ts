import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger.js";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** Reject legacy admin JWTs (no adminUserId) in production — closes RBAC bypass. */
export function rejectLegacyAdminToken(req: Request, res: Response, next: NextFunction): void {
  const u = (req as any).user;
  if (IS_PRODUCTION && u?.role === "admin" && !u?.adminUserId) {
    logger.warn({ ip: req.ip }, "Rejected legacy admin token in production");
    res.status(401).json({ ok: false, error: "Session invalid — please log in again" });
    return;
  }
  next();
}

/** Shared secret for server-to-server payment ingest (Shopify apps, POS hubs). */
export function requireExternalPaymentKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.PAYMENT_EXTERNAL_API_KEY;
  if (!expected) {
    if (IS_PRODUCTION) {
      res.status(503).json({ error: "External payment API not configured" });
      return;
    }
    next();
    return;
  }
  const provided =
    (req.headers["x-kdf-payment-key"] as string) ??
    (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "");
  if (provided !== expected) {
    logger.warn({ ip: req.ip }, "Invalid external payment API key");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/** Bootstrap only when explicitly enabled OR no admin users exist (first deploy). */
export function bootstrapGuard() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (process.env.ADMIN_BOOTSTRAP_ENABLED === "true") {
      next();
      return;
    }
    if (!IS_PRODUCTION) {
      next();
      return;
    }
    try {
      const { db } = await import("@workspace/db");
      const { adminUsersTable } = await import("@workspace/db");
      const { sql } = await import("drizzle-orm");
      const count = await db.select({ c: sql<number>`count(*)::int` }).from(adminUsersTable);
      if (Number(count[0]?.c) === 0) {
        next();
        return;
      }
    } catch {
      res.status(503).json({ ok: false, error: "Bootstrap unavailable" });
      return;
    }
    logger.warn({ ip: req.ip }, "Blocked admin bootstrap — admins already exist");
    res.status(404).json({ ok: false, error: "Not found" });
  };
}

export function sanitizeClientError(err: unknown, fallback = "Internal server error"): string {
  if (!IS_PRODUCTION) {
    return err instanceof Error ? err.message : String(err ?? fallback);
  }
  if (err && typeof err === "object" && "expose" in err && (err as { expose?: boolean }).expose) {
    return err instanceof Error ? err.message : String(err);
  }
  return fallback;
}

/** In-memory rate limiter (no extra deps) — use for auth + webhooks. */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function createRateLimiter(opts: {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
  message?: string;
}) {
  const { windowMs, max, keyFn = (req) => req.ip ?? "unknown", message = "Too many requests" } = opts;
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyFn(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.status(429).json({ ok: false, error: message });
      return;
    }
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    next();
  };
}

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: IS_PRODUCTION ? 20 : 200,
  keyFn: req => `auth:${req.ip}:${(req.body as { email?: string })?.email ?? ""}`,
  message: "Too many login attempts — try again later",
});

export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: IS_PRODUCTION ? 300 : 2000,
});

export const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: IS_PRODUCTION ? 120 : 1000,
});

export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: IS_PRODUCTION ? 10 : 100,
});

/** Security response headers (helmet-lite without dependency). */
/** Verify Meta x-hub-signature-256 for IG/FB webhooks when secrets are configured. */
export async function verifyMetaWebhookOrReject(
  req: Request,
  res: Response,
): Promise<boolean> {
  const { verifyMetaWebhookSignatureAny } = await import("./metaWebhookVerify.js");
  const signature = req.headers["x-hub-signature-256"] as string | undefined;
  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  const secrets = [
    process.env.META_APP_SECRET?.trim(),
  ].filter((s): s is string => !!s);
  if (secrets.length === 0) {
    if (IS_PRODUCTION) {
      res.sendStatus(403);
      return false;
    }
    return true;
  }
  if (!signature || !rawBody || !verifyMetaWebhookSignatureAny(rawBody, signature, secrets).ok) {
    res.sendStatus(403);
    return false;
  }
  return true;
}

/** Block common scanner paths — do not reveal stack or admin. */
const BLOCKED_PATHS = [
  /^\/\.env/i, /^\/\.git/i, /^\/wp-admin/i, /^\/wp-login/i,
  /^\/admin$/i, /^\/admin\/login/i, /^\/phpmyadmin/i, /^\/server-status/i,
  /^\/api\/admin-auth\/bootstrap/i,
];

export function blockScannerPaths(req: Request, res: Response, next: NextFunction): void {
  const path = req.path ?? req.url?.split("?")[0] ?? "";
  if (BLOCKED_PATHS.some(p => p.test(path))) {
    if (IS_PRODUCTION) {
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
  }
  next();
}

/** Admin routes only from admin subdomain or when explicitly allowed. */
export function adminHostGuard(req: Request, res: Response, next: NextFunction): void {
  if (!IS_PRODUCTION) { next(); return; }
  const host = (req.headers.host ?? "").split(":")[0]!.toLowerCase();
  const allowed = (process.env.ADMIN_ALLOWED_HOSTS ?? "admin.khanbabadryfruits.com,admin.khandryfruit.com")
    .split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
  const isAdminHost = host.startsWith("admin.") || allowed.includes(host);
  const path = req.path ?? "";
  const isAdminApi = path.startsWith("/api/admin-auth") || path.startsWith("/api/admin/");
  if (isAdminApi && !isAdminHost && process.env.ADMIN_API_ALLOW_ANY_HOST !== "true") {
    logger.warn({ host, path }, "Admin API blocked from non-admin host");
    res.status(404).json({ ok: false, error: "Not found" });
    return;
  }
  next();
}

export function adminIpAllowlist(req: Request, res: Response, next: NextFunction): void {
  const raw = process.env.ADMIN_IP_ALLOWLIST?.trim();
  if (!raw || !IS_PRODUCTION) { next(); return; }
  const allowed = raw.split(",").map(s => s.trim()).filter(Boolean);
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "";
  if (!allowed.some(a => ip === a || ip.startsWith(a))) {
    logger.warn({ ip }, "Admin request blocked by IP allowlist");
    res.status(403).json({ ok: false, error: "Access denied" });
    return;
  }
  next();
}

export const trackRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: IS_PRODUCTION ? 15 : 100,
  keyFn: req => `track:${req.ip}`,
  message: "Too many tracking lookups — try again later",
});

export const geocodeRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: IS_PRODUCTION ? 20 : 200,
  keyFn: req => `geo:${req.ip}`,
});

export const chatRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: IS_PRODUCTION ? 30 : 300,
  keyFn: req => `chat:${req.ip}`,
});

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (IS_PRODUCTION) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    res.setHeader("X-DNS-Prefetch-Control", "off");
  }
  next();
}

/** No default webhook verify tokens in production. */
export function resolveWebhookVerifyToken(
  dbToken: string | null | undefined,
  fallbacks: string[],
): string | null {
  if (dbToken?.trim()) return dbToken.trim();
  if (IS_PRODUCTION) return null;
  for (const f of fallbacks) {
    if (f?.trim()) return f.trim();
  }
  return null;
}
