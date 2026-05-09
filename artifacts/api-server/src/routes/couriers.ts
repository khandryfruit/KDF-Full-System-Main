import { Router } from "express";
import { db, couriersTable, shipmentsTable, ordersTable, usersTable, whatsappSettingsTable, emailSettingsTable, courierNotificationLogsTable, courierRetargetingQueueTable, aiSettingsTable } from "@workspace/db";
import { eq, desc, sql, and, gte, lte, ne } from "drizzle-orm";
import { adminMiddleware, authMiddleware, type AuthRequest } from "../lib/auth";
import { sendOrderStatusUpdate } from "../lib/whatsapp";
import { logger } from "../lib/logger";
import OpenAI from "openai";
import type { Response } from "express";
import https from "node:https";
import http from "node:http";

/**
 * httpJsonRequest — makes ANY HTTP/HTTPS request with a JSON body, including GET.
 * Node.js native fetch BLOCKS GET+body (Fetch spec restriction).
 * This helper uses node:https / node:http directly — no such restriction.
 */
function httpJsonRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: Record<string, any> | null,
  timeoutMs = 15000,
): Promise<{ status: number; text: string; data: Record<string, any> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const bodyStr = body !== null ? JSON.stringify(body) : null;
    const reqHeaders: Record<string, string> = { ...headers };
    if (bodyStr !== null) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(bodyStr).toString();
    }
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: method.toUpperCase(),
      headers: reqHeaders,
    };
    const mod = isHttps ? https : http;
    const req = mod.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data: Record<string, any> = {};
        try { data = JSON.parse(text); } catch { data = {}; }
        resolve({ status: res.statusCode ?? 0, text, data });
      });
      res.on("error", reject);
    });
    req.setTimeout(timeoutMs, () => { req.destroy(new Error(`Timeout after ${timeoutMs}ms`)); });
    req.on("error", reject);
    if (bodyStr !== null) req.write(bodyStr);
    req.end();
  });
}

const router = Router();

/* ─── Public: list active couriers (for checkout) ─── */
router.get("/couriers/active", async (req, res): Promise<void> => {
  try {
    const couriers = await db.select({
      id: couriersTable.id,
      name: couriersTable.name,
      slug: couriersTable.slug,
      isDefault: couriersTable.isDefault,
    }).from(couriersTable).where(eq(couriersTable.isActive, true)).orderBy(couriersTable.name);
    res.json(couriers);
    return;
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch couriers" });
  }
});

/* ─── Admin: list all couriers ─────────────────────── */
router.get("/admin/couriers", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const couriers = await db.select().from(couriersTable).orderBy(couriersTable.name);
    res.json(couriers);
    return;
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch couriers" });
  }
});

/* ─── Admin: create or update courier ──────────────── */
router.post("/admin/couriers", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, slug, apiKey, apiSecret, apiEndpoint, isActive, isDefault, settings } = req.body;
    if (!name || !slug) { res.status(400).json({ error: "name and slug are required" }); return; }

    if (isDefault) {
      await db.update(couriersTable).set({ isDefault: false });
    }

    const existing = await db.select().from(couriersTable).where(eq(couriersTable.slug, slug)).limit(1);
    let courier;
    if (existing.length > 0) {
      [courier] = await db.update(couriersTable).set({
        name, apiKey, apiSecret, apiEndpoint,
        isActive: isActive ?? existing[0].isActive,
        isDefault: isDefault ?? false,
        settings: settings ?? existing[0].settings,
        updatedAt: new Date(),
      }).where(eq(couriersTable.slug, slug)).returning();
    } else {
      [courier] = await db.insert(couriersTable).values({
        name, slug, apiKey, apiSecret, apiEndpoint,
        isActive: isActive ?? false,
        isDefault: isDefault ?? false,
        settings: settings ?? {},
      }).returning();
    }
    res.json(courier);
    return;
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to save courier" });
  }
});

/* ─── Admin: TCS – test connection ─────────────────── */
router.post("/admin/couriers/tcs/test", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  type StepStatus = "ok" | "fail" | "info" | "warn";
  const steps: Array<{ step: string; status: StepStatus; detail: string }> = [];

  try {
    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "tcs")).limit(1);
    if (!courierRow) {
      res.status(404).json({ ok: false, steps, error: "TCS courier not configured in admin yet" }); return;
    }
    const settings = (courierRow.settings ?? {}) as Record<string, any>;
    const bearer    = getTcsStaticBearer(settings);
    const baseUrl   = settings.sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;
    const hasStaleToken = !!(settings.accessToken?.trim());

    /* ── Step 1: Configuration ── */
    const missingConfig: string[] = [];
    if (!bearer) missingConfig.push("ENVO Bearer Token (Advanced Settings → ENVO Portal Bearer Token)");
    if (!settings.username?.trim()) missingConfig.push("Username");
    if (!settings.password?.trim()) missingConfig.push("Password");
    if (!settings.tcsaccount?.trim()) missingConfig.push("TCS Account Number");

    steps.push({
      step: "Configuration",
      status: missingConfig.length === 0 ? "ok" : bearer ? "warn" : "fail",
      detail: [
        `🔑 ENVO Bearer Token: ${bearer ? `✅ Present (${bearer.length} chars)` : "❌ MISSING — add in Advanced Settings"}`,
        `👤 Username: ${settings.username ? `✅ ${settings.username}` : "❌ NOT SET"}`,
        `🔒 Password: ${settings.password ? "✅ Set" : "❌ NOT SET"}`,
        `🏢 Account Number: ${settings.tcsaccount ? `✅ ${settings.tcsaccount}` : "❌ NOT SET"}`,
        `🌐 Environment: ${settings.sandbox ? "🧪 SANDBOX (safe)" : "🚀 PRODUCTION"}`,
        `📡 Base URL: ${baseUrl}`,
        hasStaleToken
          ? `⚠ Direct ECOM Token: SET — may override auto Step-2 and cause "Invalid Bearer" errors. Clear it in Advanced Settings!`
          : `✅ Direct ECOM Token: Not set (auto Step-2 will be used)`,
        missingConfig.length > 0 ? `❌ Missing: ${missingConfig.join(", ")}` : "✅ All required fields present",
      ].join("\n"),
    });

    if (!bearer) {
      res.json({ ok: false, steps, error: "ENVO Bearer Token not configured" }); return;
    }

    /* ── Step 2: ECOM Token (Step-2 auth) ── */
    let ecomToken = "";
    try {
      const t0 = Date.now();
      ecomToken = await getTcsEcomToken(settings, bearer, baseUrl);
      const ms = Date.now() - t0;
      steps.push({
        step: "ECOM Access Token (Step-2)",
        status: "ok",
        detail: [
          `✅ Token obtained in ${ms}ms`,
          `Method: POST /ecom/api/authentication/token`,
          `Token tail: ●●●●…${ecomToken.slice(-16)}`,
          hasStaleToken ? "⚠ Used manual Direct ECOM Token (from settings) — consider clearing it to use auto Step-2" : "✅ Auto-generated via Username + Password + Bearer",
        ].join("\n"),
      });
    } catch (e: any) {
      steps.push({
        step: "ECOM Access Token (Step-2)",
        status: "fail",
        detail: [
          `❌ Token generation FAILED: ${e.message}`,
          ``,
          `Common fixes:`,
          `• If "Invalid Bearer token": Clear "Direct ECOM Access Token" in Advanced Settings`,
          `• If "Unauthorized" / 401: Check Username + Password are correct`,
          `• If timeout: TCS server unreachable — check sandbox vs production setting`,
          `• If account mismatch: Username (${settings.username || "not set"}) may need to match TCS ENVO credentials`,
        ].join("\n"),
      });
      res.json({ ok: false, steps, error: e.message }); return;
    }

    /* ── Step 3: Booking Payload Validation (dry-run, no API call) ── */
    const payloadErrors: string[] = [];
    if (!settings.tcsaccount?.trim()) payloadErrors.push("TCS Account Number is empty");
    if (!settings.shipperCity?.trim()) payloadErrors.push("Shipper City is empty (Pickup Address section)");
    if (!settings.shipperAddress?.trim()) payloadErrors.push("Shipper Address is empty (Pickup Address section)");
    if (!settings.shipperName?.trim()) payloadErrors.push("Shipper Name is empty (Pickup Address section)");
    const defWeight = parseFloat(settings.defaultWeight ?? "0");
    if (isNaN(defWeight) || defWeight <= 0) payloadErrors.push(`Default Weight is invalid: "${settings.defaultWeight || "not set"}" — must be > 0 kg`);

    steps.push({
      step: "Booking Payload Validation",
      status: payloadErrors.length === 0 ? "ok" : "warn",
      detail: payloadErrors.length === 0
        ? [
          `✅ All required booking fields are configured`,
          `Account: ${settings.tcsaccount}`,
          `Shipper: ${settings.shipperName} — ${settings.shipperCity} (${settings.shipperCityCode || "no city code"})`,
          `Default Weight: ${settings.defaultWeight} kg`,
          `Service Code: ${settings.serviceCode || "O"}`,
        ].join("\n")
        : [
          `⚠ Booking will fail — missing fields:`,
          ...payloadErrors.map(e => `• ${e}`),
          ``,
          `Fix: Go to Couriers → TCS Settings → Edit → fill in missing fields → Save`,
        ].join("\n"),
    });

    const anyFail = steps.some(s => s.status === "fail");
    const anyWarn = steps.some(s => s.status === "warn");
    const overallOk = !anyFail;

    res.json({
      ok: overallOk,
      steps,
      ecomTokenOk: true,
      configWarnings: payloadErrors,
      message: anyFail
        ? "TCS connection test FAILED — see steps above"
        : anyWarn
          ? "TCS auth OK but some booking fields need attention — see warnings"
          : "All checks passed — TCS ready for bookings ✅",
    });
  } catch (err: any) {
    req.log.error(err);
    steps.push({ step: "Unexpected Error", status: "fail", detail: String(err.message ?? err) });
    res.status(502).json({ ok: false, steps, error: err.message ?? "TCS test failed" });
  }
});

/* ─── Admin: quick server outbound IP check ──────────── */
router.get("/admin/couriers/server-ip", adminMiddleware as any, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    let ip = "unknown";
    let env = "unknown";
    try {
      const r = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
      const d = await r.json() as { ip?: string };
      ip = d.ip ?? "unknown";
    } catch { /* non-fatal */ }

    const domains = (process.env.REPLIT_DOMAINS ?? "").split(",").map(d => d.trim()).filter(Boolean);
    const isProduction = domains.some(d => !d.includes("replit.dev") && !d.includes("replit.app"));
    env = isProduction ? "production" : domains.length ? "development" : "unknown";

    res.json({
      ip,
      env,
      domains,
      hint: `Share this IP with TCS and ask them to whitelist it: ${ip}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Helper: fetch outbound server IP ──────────────── */
async function getServerIp(): Promise<string> {
  try {
    const r = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(4000) });
    const d = await r.json() as { ip?: string };
    return d.ip ?? "unknown";
  } catch { return "unknown"; }
}

/* ─── Admin: TCS – professional auth debug ───────────── */
router.post("/admin/couriers/tcs/debug-auth", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  type StepStatus = "ok" | "fail" | "info" | "warn";
  const steps: Array<{ step: string; status: StepStatus; detail: string; raw?: string }> = [];

  try {
    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "tcs")).limit(1);
    if (!courierRow) { res.status(404).json({ error: "TCS courier not configured in admin yet" }); return; }
    const settings = (courierRow.settings ?? {}) as Record<string, any>;

    const bearerPasted = (settings.bearerToken ?? "").trim();
    const bearerEnv    = (process.env["TCS_STATIC_BEARER_TOKEN"] ?? "").trim();
    const bearer       = bearerPasted || bearerEnv;
    const baseUrl      = settings.sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;

    /* ── Step 1: Configuration ── */
    steps.push({
      step: "Configuration",
      status: bearer ? "info" : "fail",
      detail: [
        `Auth Mode: STATIC BEARER TOKEN ONLY`,
        `Environment: ${settings.sandbox ? "🧪 SANDBOX" : "🚀 PRODUCTION"}`,
        `TCS Account (tcsaccount): ${settings.tcsaccount || "❌ NOT SET"}`,
        `Shipper City Code: ${settings.shipperCityCode || "(default: LHE)"}`,
        `Default Weight: ${settings.defaultWeight || "(default: 0.5 kg)"}`,
        `ENVO Bearer Token: ${bearerPasted
          ? `✅ Pasted in Settings (${bearerPasted.length} chars)`
          : bearerEnv
            ? `✅ From TCS_STATIC_BEARER_TOKEN env var (${bearerEnv.length} chars)`
            : "❌ NOT SET — add it in Advanced Settings → ENVO Portal Bearer Token"}`,
      ].join("\n"),
    });

    if (!bearer) {
      const serverIp = await getServerIp();
      res.json({ ok: false, steps, serverIp, error: "ENVO Bearer Token not configured" });
      return;
    }

    /* ── Step 2: Bearer token JWT analysis ── */
    try {
      const jwtPayload = JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString());
      const expMs    = typeof jwtPayload.exp === "number" ? jwtPayload.exp * 1000 : null;
      const daysLeft = expMs ? Math.floor((expMs - Date.now()) / 86400000) : null;
      const valid    = jwtIsValid(bearer);
      steps.push({
        step: "ENVO Bearer Token (JWT)",
        status: valid ? "ok" : "fail",
        detail: [
          `Source: ${bearerPasted ? "Settings field (pasted manually)" : "TCS_STATIC_BEARER_TOKEN environment variable"}`,
          `Client ID: ${jwtPayload.clientid ?? "N/A"}`,
          `Services: ${String(jwtPayload.services ?? "").split(",").filter(Boolean).length} services`,
          `Issuer: ${jwtPayload.iss ?? "N/A"}`,
          `Issued: ${jwtPayload.iat ? new Date(jwtPayload.iat * 1000).toISOString() : "N/A"}`,
          `Expiry: ${daysLeft != null ? `${daysLeft} days remaining` : "No exp claim"} — ${valid ? "✅ VALID" : "❌ EXPIRED — get a new token from ENVO Portal"}`,
          `Token tail: ●●●●…${bearer.slice(-12)}`,
        ].join("\n"),
      });
      if (!valid) {
        const serverIp = await getServerIp();
        res.json({ ok: false, steps, serverIp, error: "Bearer token is expired — regenerate from ENVO Portal" });
        return;
      }
    } catch {
      steps.push({
        step: "ENVO Bearer Token",
        status: "info",
        detail: "Token present but not a standard JWT (opaque token — still usable).\nWill proceed with live API test.",
      });
    }

    /* ── Step 3: ECOM Access Token (Step-2 auth) ── */
    const username = (settings.username ?? "").trim();
    const password = (settings.password ?? "").trim();
    const manualAccessToken = (settings.accessToken ?? "").trim();

    if (manualAccessToken) {
      steps.push({
        step: "ECOM Access Token (Step-2)",
        status: "ok",
        detail: [
          `Mode: ✅ Direct ECOM Access Token (manual — Step-2 skipped)`,
          `Token tail: ●●●●…${manualAccessToken.slice(-12)}`,
          `This token goes into the booking body as "accesstoken".`,
        ].join("\n"),
      });
    } else if (username && password) {
      /* Try to generate ECOM token live */
      try {
        const ecomUrl = `${baseUrl}/ecom/api/authentication/token`;
        const ecomResp = await fetch(ecomUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${bearer}`, "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
          signal: AbortSignal.timeout(15000),
        });
        let ecomData: Record<string, any> = {};
        try { ecomData = await ecomResp.json(); } catch { ecomData = {}; }
        const ecomToken =
          ecomData.accessToken ?? ecomData.accesstoken ??
          ecomData.token ??
          ecomData.result?.accessToken ?? ecomData.result?.accesstoken ??
          ecomData.data?.accessToken ?? ecomData.data?.token;

        if (ecomToken) {
          /* Cache immediately */
          const cacheKey = `${settings.tcsaccount ?? ""}:${username}`;
          tcsEcomCache.set(cacheKey, { token: ecomToken, expiresAt: Date.now() + 55 * 60 * 1000 });
          steps.push({
            step: "ECOM Access Token (Step-2)",
            status: "ok",
            detail: [
              `Mode: ✅ Auto-generated via Step-2 (username + password + bearer)`,
              `Endpoint: POST ${ecomUrl}`,
              `HTTP Status: ${ecomResp.status}`,
              `Username: ${username}`,
              `Token tail: ●●●●…${ecomToken.slice(-12)}`,
              `Cached for 55 minutes — will auto-refresh before expiry.`,
            ].join("\n"),
            raw: JSON.stringify(ecomData).slice(0, 300),
          });
        } else {
          const msg = ecomData.message ?? ecomData.statusMessage ?? ecomData.error ?? `HTTP ${ecomResp.status}`;
          steps.push({
            step: "ECOM Access Token (Step-2)",
            status: "fail",
            detail: [
              `❌ Step-2 auth failed: ${msg}`,
              `Endpoint: POST ${ecomUrl}`,
              `HTTP Status: ${ecomResp.status}`,
              `Username: ${username}`,
              `Fix: Check TCS Username + Password, OR paste a Direct ECOM Access Token in Advanced Settings.`,
            ].join("\n"),
            raw: JSON.stringify(ecomData).slice(0, 300),
          });
          const serverIp = await getServerIp();
          res.json({ ok: false, steps, serverIp, error: `TCS Step-2 auth failed: ${msg}` });
          return;
        }
      } catch (e: any) {
        steps.push({
          step: "ECOM Access Token (Step-2)",
          status: "warn",
          detail: `Network/timeout error during Step-2: ${e.message}\n\nMay be a firewall restriction. Try pasting a Direct ECOM Access Token.`,
        });
      }
    } else {
      steps.push({
        step: "ECOM Access Token (Step-2)",
        status: "fail",
        detail: [
          `❌ Cannot generate ECOM Access Token — no username/password configured.`,
          `Fix options:`,
          `  A) Add TCS Username + Password in Courier Settings (auto Step-2)`,
          `  B) Paste a Direct ECOM Access Token in Advanced Settings → "Direct ECOM Access Token"`,
        ].join("\n"),
      });
      const serverIp = await getServerIp();
      res.json({ ok: false, steps, serverIp, error: "ECOM Access Token not available — configure username/password or paste a Direct Access Token" });
      return;
    }

    /* ── Step 4: Live Tracking API test ── */
    const trackUrl = `${baseUrl}/tracking/api/Tracking/GetDynamicTrackDetail`;
    try {
      const trackResp = await fetch(trackUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({ consignee: ["TEST0000000000"] }),
        signal: AbortSignal.timeout(10000),
      });
      const trackText = await trackResp.text();
      /* 400/404 = auth ok (bad test CN is expected). 401/403 = token rejected. */
      const authOk = trackResp.status !== 401 && trackResp.status !== 403;
      steps.push({
        step: "Live API Test (Tracking)",
        status: authOk ? "ok" : "fail",
        detail: [
          `Endpoint: POST ${trackUrl}`,
          `Header: Authorization: Bearer ●●●●…${bearer.slice(-12)}`,
          `HTTP Status: ${trackResp.status}`,
          authOk
            ? "✅ Bearer token accepted — TCS API is reachable and auth is working."
            : `❌ Token rejected (${trackResp.status}) — check if token is for the correct TCS account.\nResponse: ${trackText.slice(0, 300)}`,
        ].join("\n"),
        raw: trackText.slice(0, 500),
      });
      if (!authOk) {
        const serverIp = await getServerIp();
        res.json({ ok: false, steps, serverIp, error: `TCS rejected bearer token (HTTP ${trackResp.status})` });
        return;
      }
    } catch (e: any) {
      steps.push({
        step: "Live API Test (Tracking)",
        status: "warn",
        detail: `Network timeout or connection error: ${e.message}\n\nThis may be a firewall/IP restriction. The bearer token may still work for booking.\nAsk TCS to whitelist your server IP if this persists.`,
      });
    }

    /* ── Step 5: Server IP ── */
    const serverIp = await getServerIp();
    steps.push({
      step: "Server Outbound IP",
      status: "info",
      detail: `IP: ${serverIp}\n\nIf TCS booking returns HTTP 401/403, ask TCS support to whitelist this IP.\nPortal: https://ociconnect.tcscourier.com/ecom/index.html`,
    });

    res.json({
      ok: true,
      mode: manualAccessToken ? "direct-ecom-manual" : "step2-auto",
      sandbox: !!(settings.sandbox),
      serverIp,
      steps,
      hint: manualAccessToken
        ? "Direct ECOM Access Token mode — manual token in settings bypasses Step-2. To switch to auto Step-2, clear the Direct ECOM Access Token field."
        : "Auto Step-2 mode — ECOM Access Token is auto-generated from Username + Password + Bearer (cached 55 min).",
    });
    return;
  } catch (err: any) {
    steps.push({ step: "Fatal Error", status: "fail", detail: err.message });
    res.status(500).json({ ok: false, steps, error: err.message });
  }
});

/* ─── Admin: TCS – Clear ECOM token cache ────────────── */
router.post("/admin/couriers/tcs/clear-cache", adminMiddleware as any, async (_req: AuthRequest, res: Response): Promise<void> => {
  const ecomCount   = tcsEcomCache.size;
  const simpleCount = tcsSimpleCache.size;
  tcsEcomCache.clear();
  tcsSimpleCache.clear();
  const total = ecomCount + simpleCount;
  res.json({ ok: true, cleared: total, ecomCleared: ecomCount, simpleCleared: simpleCount, message: `Cleared ${total} cached token(s) (ECOM: ${ecomCount}, Simple: ${simpleCount}). Next booking will generate a fresh token.` });
});

/* ─── Admin: TCS – Live Request/Response Log ─────────── */
router.get("/admin/couriers/tcs/request-log", adminMiddleware as any, async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({ ok: true, count: tcsLiveLog.length, entries: tcsLiveLog.slice(0, 50) });
});

/* ─── Admin: TCS – Test Tracking API ─────────────────── */
router.post("/admin/couriers/tcs/test-tracking", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  type StepStatus = "ok" | "fail" | "info" | "warn";
  const steps: Array<{ step: string; status: StepStatus; detail: string; raw?: string }> = [];
  try {
    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "tcs")).limit(1);
    if (!courierRow) { res.status(404).json({ error: "TCS not configured" }); return; }
    const settings = (courierRow.settings ?? {}) as Record<string, any>;
    const bearer = getTcsStaticBearer(settings);
    const baseUrl = settings.sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;
    const { trackingNumber } = req.body ?? {};
    const cn = (trackingNumber ?? "").toString().trim() || "TESTCN000000000";

    steps.push({ step: "Config", status: bearer ? "ok" : "fail", detail: `Bearer: ${bearer ? `✅ (${bearer.length} chars)` : "❌ Missing"}\nEnvironment: ${settings.sandbox ? "SANDBOX" : "PRODUCTION"}\nBase URL: ${baseUrl}` });
    if (!bearer) { res.json({ ok: false, steps }); return; }

    /* Test tracking endpoint */
    const trackUrl = `${baseUrl}/tracking/api/Tracking/GetDynamicTrackDetail`;
    const t0 = Date.now();
    let httpStatus = 0; let rawText = "";
    try {
      const trackResp = await fetch(trackUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({ consignee: [cn] }),
        signal: AbortSignal.timeout(12000),
      });
      httpStatus = trackResp.status;
      rawText = await trackResp.text();
      const durationMs = Date.now() - t0;
      const authOk = httpStatus !== 401 && httpStatus !== 403;
      pushTcsLog({ ts: new Date().toISOString(), type: "test_tracking", url: trackUrl, method: "POST", reqBody: JSON.stringify({ consignee: [cn] }), httpStatus, resBody: rawText.slice(0, 600), durationMs, success: authOk, error: authOk ? undefined : `HTTP ${httpStatus}` });
      steps.push({
        step: "Tracking API",
        status: authOk ? "ok" : "fail",
        detail: `URL: POST ${trackUrl}\nTracking Number: ${cn}\nHTTP Status: ${httpStatus}\nDuration: ${durationMs}ms\n${authOk ? "✅ API reachable — token accepted" : `❌ Token rejected (${httpStatus})`}`,
        raw: rawText.slice(0, 600),
      });
      res.json({ ok: authOk, steps, httpStatus, durationMs, raw: rawText.slice(0, 600) });
    } catch (e: any) {
      const durationMs = Date.now() - t0;
      pushTcsLog({ ts: new Date().toISOString(), type: "test_tracking", url: trackUrl, method: "POST", reqBody: JSON.stringify({ consignee: [cn] }), httpStatus: null, resBody: e.message, durationMs, success: false, error: e.message });
      steps.push({ step: "Tracking API", status: "fail", detail: `Network error: ${e.message}\nDuration: ${durationMs}ms` });
      res.json({ ok: false, steps, error: e.message });
    }
  } catch (err: any) {
    steps.push({ step: "Fatal", status: "fail", detail: err.message });
    res.status(500).json({ ok: false, steps, error: err.message });
  }
});

/* ─── Admin: TCS – Test Booking (dry-run / sandbox safe) ─ */
router.post("/admin/couriers/tcs/test-booking", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  type StepStatus = "ok" | "fail" | "info" | "warn";
  const steps: Array<{ step: string; status: StepStatus; detail: string; raw?: string }> = [];
  try {
    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "tcs")).limit(1);
    if (!courierRow) { res.status(404).json({ error: "TCS not configured" }); return; }
    const settings = (courierRow.settings ?? {}) as Record<string, any>;
    const bearer = getTcsStaticBearer(settings);
    const baseUrl = settings.sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;

    steps.push({
      step: "Config Check",
      status: "info",
      detail: [
        `Environment: ${settings.sandbox ? "🧪 SANDBOX (safe)" : "🚀 PRODUCTION — test booking will be REAL"}`,
        `Base URL: ${baseUrl}`,
        `Account: ${settings.tcsaccount || "❌ NOT SET"}`,
        `Bearer Token: ${bearer ? `✅ (${bearer.length} chars)` : "❌ MISSING"}`,
        `Username: ${settings.username || "❌ NOT SET"}`,
        `Shipper City Code: ${settings.shipperCityCode || "(not set)"}`,
      ].join("\n"),
    });

    if (!bearer) {
      res.json({ ok: false, steps, error: "Bearer token not configured" }); return;
    }

    /* Get ECOM token */
    let ecomToken = "";
    try {
      const t0 = Date.now();
      ecomToken = await getTcsEcomToken(settings, bearer, baseUrl);
      steps.push({ step: "ECOM Token", status: "ok", detail: `✅ Token obtained in ${Date.now() - t0}ms\nTail: ●●●●…${ecomToken.slice(-12)}` });
    } catch (e: any) {
      steps.push({ step: "ECOM Token", status: "fail", detail: `❌ ${e.message}` });
      res.json({ ok: false, steps, error: e.message }); return;
    }

    /* Build test booking payload — full official nested structure per TCS PHP Guide */
    const testOrderNo = `KDFTEST-${Date.now()}`;
    const nowT = new Date();
    const padT = (n: number) => String(n).padStart(2, "0");
    const shipDateT = `${padT(nowT.getDate())}/${padT(nowT.getMonth() + 1)}/${nowT.getFullYear()} ${padT(nowT.getHours())}:${padT(nowT.getMinutes())}:${padT(nowT.getSeconds())}`;
    const shipperNameT  = (settings.shipperName    || "KDF Nuts").slice(0, 50);
    const shipperAddrT  = (settings.shipperAddress || "Liberty Market, Lahore").slice(0, 120);
    const shipperCityT  = (settings.shipperCity    || "Lahore").slice(0, 50);
    const shipperCodeT  = (settings.shipperCityCode || "LHE").toUpperCase();
    const shipperPhoneT = (settings.shipperPhone   || "03001234567").replace(/\D/g, "").slice(-11);

    const bookingPayload = {
      accesstoken:   ecomToken,   /* ECOM token in body — NO Authorization header */
      consignmentno: "",           /* Required empty string per official PHP guide */
      shipperinfo: {
        tcsaccount:  settings.tcsaccount || "",
        shippername: shipperNameT,
        address1:    shipperAddrT,
        address2: "", address3: "", zip: "",
        countrycode: "PK", countryname: "Pakistan",
        citycode:    shipperCodeT, cityname: shipperCityT,
        mobile:      shipperPhoneT,
      },
      consigneeinfo: {
        consigneecode: "",
        firstname: "KDF", middlename: ".", lastname: "Test",
        address1:  "House 10, Block B, DHA Phase 5",
        address2: "", address3: "", zip: "74000",
        countrycode: "PK", countryname: "Pakistan",
        citycode: "", cityname: "Karachi",
        email: "", areacode: "", areaname: "",
        blockcode: "", blockname: "", lat: "", lng: "", landmark: "",
        mobile: "03219876543",
      },
      vendorinfo: {                /* Required per official PHP guide */
        name: shipperNameT, address1: shipperAddrT,
        address2: "", address3: "",
        citycode: shipperCodeT, cityname: shipperCityT,
        mobile: shipperPhoneT,
      },
      shipmentinfo: {
        costcentercode: (settings.costcentercode ?? "").toString().slice(0, 20),
        referenceno:    testOrderNo,
        contentdesc:    "Test Dry Fruits Pack",
        servicecode:    (settings.serviceCode || "O").slice(0, 6),
        parametertype:  "Standard",   /* Required per PHP guide */
        shipmentdate:   shipDateT,    /* DD/MM/YYYY HH:MM:SS */
        shippingtype: "", currency: "PKR",
        codamount:      0,
        declaredvalue: null, insuredvalue: null,
        transactiontype: "", dsflag: "", carrierslug: "",
        weightinkg:     0.5, pieces: 1, fragile: false,
        remarks:        "TEST BOOKING — DO NOT DELIVER",
        skus: [{
          description: "KDF Nuts Test Product",
          quantity: 1, weight: 0.5,
          uom: "KG",               /* Required per PHP guide */
          unitprice: 1,
          declaredvalue: null, insuredvalue: null,
        }],
      },
    };

    steps.push({
      step: "Booking Payload (Official Nested Structure)",
      status: "info",
      detail: [
        `Order No: ${testOrderNo}`,
        `Shipper: ${bookingPayload.shipperinfo.shippername} (${bookingPayload.shipperinfo.tcsaccount})`,
        `Consignee: KDF Test → Karachi`,
        `Weight: 0.50 kg | COD: 0 | Service: ${bookingPayload.shipmentinfo.servicecode}`,
        `Structure: ✅ Official nested (shipperinfo + consigneeinfo + shipmentinfo)`,
        `Auth: Bearer = ENVO Bearer | accesstoken in body = ECOM token`,
        `⚠ ${settings.sandbox ? "Sandbox — safe test" : "PRODUCTION — this creates a REAL shipment!"}`,
      ].join("\n"),
      raw: JSON.stringify({ ...bookingPayload, accesstoken: "●●●" }, null, 2).slice(0, 1000),
    });

    /* Per official TCS PHP guide: booking endpoint does NOT use Authorization header.
     * The accesstoken in body IS the authentication. Only Content-Type + Accept. */
    const bookHeaders = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    /* Official endpoint first, fallback second */
    const bookUrls = [
      `${baseUrl}/ecom/api/booking/create`,   /* ✅ Official spec */
      `${baseUrl}/ecom/api/shipment/book`,    /* Fallback */
    ];
    let booked = false;
    for (const bookUrl of bookUrls) {
      const t0 = Date.now();
      let httpStatus = 0; let rawText = "";
      try {
        const bookResp = await fetch(bookUrl, {
          method: "POST",
          headers: bookHeaders,
          body: JSON.stringify(bookingPayload),
          signal: AbortSignal.timeout(18000),
        });
        httpStatus = bookResp.status;
        rawText = await bookResp.text();
        const durationMs = Date.now() - t0;
        let data: Record<string, any> = {};
        try { data = JSON.parse(rawText); } catch { data = {}; }
        const cn = data.consignmentNo ?? data.ConsignmentNo ?? data.consignment_no ?? data.trackingNumber ?? data.result?.consignmentNo;
        const success = !!cn || data.message?.toUpperCase() === "SUCCESS" || data.status === true;
        pushTcsLog({ ts: new Date().toISOString(), type: "test_booking", url: bookUrl, method: "POST", reqBody: JSON.stringify({ ...bookingPayload, accesstoken: "●●●" }), httpStatus, resBody: rawText.slice(0, 600), durationMs, success, error: success ? undefined : (data.message ?? data.statusMessage ?? `HTTP ${httpStatus}`) });
        if (success) {
          steps.push({ step: `Booking API (${bookUrl.split("/").pop()})`, status: "ok", detail: `✅ Booking SUCCESSFUL!\nHTTP Status: ${httpStatus}\nConsignment No: ${cn ?? "see raw"}\nDuration: ${durationMs}ms\nURL: POST ${bookUrl}`, raw: rawText.slice(0, 600) });
          booked = true;
          res.json({ ok: true, steps, consignmentNo: cn, bookUrl, httpStatus, durationMs, warning: settings.sandbox ? undefined : "⚠ PRODUCTION booking created — consignment exists in TCS system" });
          return;
        } else if (httpStatus === 404) {
          steps.push({ step: `Booking URL (${bookUrl.split("/").pop()})`, status: "warn", detail: `HTTP 404 — endpoint not found, trying fallback\nURL: ${bookUrl}`, raw: rawText.slice(0, 200) });
          continue;
        } else {
          const errMsg = data.message ?? data.statusMessage ?? data.error ?? `HTTP ${httpStatus}`;
          steps.push({ step: `Booking API (${bookUrl.split("/").pop()})`, status: "fail", detail: `❌ Booking failed: ${errMsg}\nHTTP Status: ${httpStatus}\nDuration: ${durationMs}ms\nURL: POST ${bookUrl}`, raw: rawText.slice(0, 600) });
          res.json({ ok: false, steps, error: errMsg, httpStatus, bookUrl, raw: rawText.slice(0, 400) });
          return;
        }
      } catch (e: any) {
        const durationMs = Date.now() - t0;
        pushTcsLog({ ts: new Date().toISOString(), type: "test_booking", url: bookUrl, method: "POST", reqBody: JSON.stringify({ ...bookingPayload, accesstoken: "●●●" }), httpStatus: null, resBody: e.message, durationMs, success: false, error: e.message });
        steps.push({ step: `Booking URL (${bookUrl.split("/").pop()})`, status: "warn", detail: `Network error: ${e.message}\nDuration: ${durationMs}ms` });
      }
    }
    if (!booked) {
      res.json({ ok: false, steps, error: "All booking URL variants failed — check debug steps above" });
    }
  } catch (err: any) {
    steps.push({ step: "Fatal", status: "fail", detail: err.message });
    res.status(500).json({ ok: false, steps, error: err.message });
  }
});

/* ─── Admin: TCS – Full Diagnostics ─────────────────── */
router.post("/admin/couriers/tcs/full-diagnostics", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  type StepStatus = "ok" | "fail" | "info" | "warn";
  const steps: Array<{ step: string; status: StepStatus; detail: string; raw?: string }> = [];
  const startTs = Date.now();
  try {
    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "tcs")).limit(1);
    if (!courierRow) { res.status(404).json({ error: "TCS not configured" }); return; }
    const settings = (courierRow.settings ?? {}) as Record<string, any>;
    const bearerPasted = (settings.bearerToken ?? "").trim();
    const bearerEnv    = (process.env["TCS_STATIC_BEARER_TOKEN"] ?? "").trim();
    const bearer       = bearerPasted || bearerEnv;
    const baseUrl      = settings.sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;
    const serverIp     = await getServerIp();

    /* 1. Environment Check */
    steps.push({
      step: "1 · Environment",
      status: "info",
      detail: [
        `Mode: ${settings.sandbox ? "🧪 SANDBOX (devconnect.tcscourier.com)" : "🚀 PRODUCTION (ociconnect.tcscourier.com)"}`,
        `Base URL: ${baseUrl}`,
        `Server IP: ${serverIp}`,
        `Username: ${settings.username || "❌ NOT SET"}`,
        `TCS Account: ${settings.tcsaccount || "❌ NOT SET"}`,
        `Shipper: ${settings.shipperName || "not set"} · ${settings.shipperCity || "?"} (${settings.shipperCityCode || "?"})`,
        `Service Code: ${settings.serviceCode || "O"} · Weight: ${settings.defaultWeight || "0.5"} kg`,
        `API Variant: ${settings.tcsApiVariant || "ecom"}`,
      ].join("\n"),
    });

    /* 2. Bearer Token */
    if (!bearer) {
      steps.push({ step: "2 · ENVO Bearer Token", status: "fail", detail: "❌ Not configured\nGet from: ENVO Portal → API Access → Bearer Token" });
      res.json({ ok: false, steps, serverIp, totalMs: Date.now() - startTs });
      return;
    }
    let bearerValid = true;
    try {
      const jwtPayload = JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString());
      const expMs    = typeof jwtPayload.exp === "number" ? jwtPayload.exp * 1000 : null;
      const daysLeft = expMs ? Math.floor((expMs - Date.now()) / 86400000) : null;
      bearerValid    = jwtIsValid(bearer);
      steps.push({
        step: "2 · ENVO Bearer Token",
        status: bearerValid ? "ok" : "fail",
        detail: [
          `Source: ${bearerPasted ? "Settings field" : "TCS_STATIC_BEARER_TOKEN env var"}`,
          `Length: ${bearer.length} chars`,
          `Client ID: ${jwtPayload.clientid ?? "N/A"}`,
          `Issuer: ${jwtPayload.iss ?? "N/A"}`,
          `Issued: ${jwtPayload.iat ? new Date(jwtPayload.iat * 1000).toISOString() : "N/A"}`,
          `Expiry: ${daysLeft != null ? `${daysLeft} days remaining` : "No exp claim"} — ${bearerValid ? "✅ VALID" : "❌ EXPIRED"}`,
          `Tail: ●●●●…${bearer.slice(-12)}`,
        ].join("\n"),
      });
      if (!bearerValid) { res.json({ ok: false, steps, serverIp, totalMs: Date.now() - startTs }); return; }
    } catch {
      steps.push({ step: "2 · ENVO Bearer Token", status: "info", detail: `Opaque token (not JWT) — ${bearer.length} chars. Will test live.\nSource: ${bearerPasted ? "Settings field" : "env var"}\nTail: ●●●●…${bearer.slice(-12)}` });
    }

    /* 3. Tracking API test (uses bearer) */
    const trackUrl = `${baseUrl}/tracking/api/Tracking/GetDynamicTrackDetail`;
    const t0t = Date.now();
    try {
      const trackResp = await fetch(trackUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({ consignee: ["KDFTEST000001"] }),
        signal: AbortSignal.timeout(10000),
      });
      const trackText = await trackResp.text();
      const durationMs = Date.now() - t0t;
      const authOk = trackResp.status !== 401 && trackResp.status !== 403;
      pushTcsLog({ ts: new Date().toISOString(), type: "diagnostics", url: trackUrl, method: "POST", reqBody: '{"consignee":["KDFTEST000001"]}', httpStatus: trackResp.status, resBody: trackText.slice(0, 400), durationMs, success: authOk });
      steps.push({
        step: "3 · Tracking API (Bearer test)",
        status: authOk ? "ok" : "fail",
        detail: `URL: POST ${trackUrl}\nHTTP Status: ${trackResp.status}\nDuration: ${durationMs}ms\n${authOk ? "✅ Bearer accepted by TCS API" : `❌ Bearer rejected (${trackResp.status})`}`,
        raw: trackText.slice(0, 400),
      });
    } catch (e: any) {
      steps.push({ step: "3 · Tracking API (Bearer test)", status: "warn", detail: `Network/timeout: ${e.message}\nDuration: ${Date.now() - t0t}ms` });
    }

    /* 4. Step-2 ECOM Token */
    const manualToken = (settings.accessToken ?? "").trim();
    const username    = (settings.username ?? "").trim();
    const password    = (settings.password ?? "").trim();
    let ecomToken     = "";
    if (manualToken) {
      ecomToken = manualToken;
      steps.push({ step: "4 · ECOM Token (Step-2)", status: "ok", detail: `Mode: ✅ Manual Direct Token (bypasses Step-2)\nTail: ●●●●…${manualToken.slice(-12)}` });
    } else if (username && password) {
      const t0e = Date.now();
      try {
        /* CONFIRMED by live curl (May 2026): only GET /token is valid.
         * Query params work best (no Content-Length confusion for GET).
         * POST /token → 405. generateToken → 404. */
        const qpUrlD = `${baseUrl}/ecom/api/authentication/token?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        const attempts: Array<{ url: string; method: "GET" | "POST"; body: Record<string, any> | null }> = [
          { url: qpUrlD,                                            method: "GET", body: null },
          { url: `${baseUrl}/ecom/api/authentication/token`,        method: "GET", body: { username, password } },
          { url: `${baseUrl}/ecom/api/authentication/token`,        method: "GET", body: { Username: username, Password: password } },
        ];
        let found = false;
        const attemptResults: string[] = [];
        for (let i = 0; i < attempts.length; i++) {
          const { url: aUrl, method: aMethod, body: aBody } = attempts[i];
          const ta = Date.now();
          try {
            /* Use httpJsonRequest — node:https bypasses fetch GET+body restriction */
            const aResult = await httpJsonRequest(aUrl, aMethod, { "Authorization": `Bearer ${bearer}` }, aBody, 10000);
            const aResp = { status: aResult.status };
            const aText = aResult.text;
            const aDuration = Date.now() - ta;
            let aData: Record<string, any> = aResult.data;
            const aToken = aData.accessToken ?? aData.accesstoken ?? aData.token ?? aData.result?.accessToken ?? aData.data?.accessToken;
            const fieldStyle = Object.keys(aBody).includes("Username") ? "PascalCase" : "lowercase";
            const statusHint =
              aResp.status === 401 ? "❌ HTTP 401 — Bearer token expired or wrong credentials" :
              aResp.status === 403 ? "❌ HTTP 403 — Access denied (bearer token invalid)" :
              aResp.status === 404 ? "❌ HTTP 404 — endpoint not found" :
              aResp.status === 405 ? "❌ HTTP 405 — wrong HTTP method" :
              aToken ? "✅ TOKEN OK" : `❌ no token: ${aData.message ?? aData.error ?? ""}`;
            attemptResults.push(`Attempt ${i + 1}: ${aMethod} ${aUrl.split("/").slice(-2).join("/")} (${fieldStyle}) → HTTP ${aResp.status} (${aDuration}ms) ${statusHint}`);
            pushTcsLog({ ts: new Date().toISOString(), type: "auth_step2", url: aUrl, method: aMethod, reqBody: JSON.stringify({ ...aBody, password: "●●●" }), httpStatus: aResp.status, resBody: aText.slice(0, 400), durationMs: aDuration, success: !!aToken, attempt: i + 1 });
            if (aToken) {
              ecomToken = aToken;
              found = true;
              tcsEcomCache.set(`${settings.tcsaccount}:${username}`, { token: aToken, expiresAt: Date.now() + 55 * 60 * 1000 });
              break;
            }
            /* 401/403 = credentials wrong — stop immediately, no point trying PascalCase */
            if (aResp.status === 401 || aResp.status === 403) break;
            /* 404/405 = wrong endpoint/method — try next variant */
            if (aResp.status !== 404 && aResp.status !== 405) break;
          } catch (ae: any) {
            attemptResults.push(`Attempt ${i + 1}: ${aMethod} ${aUrl.split("/").slice(-2).join("/")} → Network error: ${ae.message}`);
          }
        }
        steps.push({
          step: "4 · ECOM Token (Step-2)",
          status: found ? "ok" : "fail",
          detail: [
            found ? `✅ Token obtained in ${Date.now() - t0e}ms` : "❌ All Step-2 URL variants failed",
            found ? `Tail: ●●●●…${ecomToken.slice(-12)}` : "Fix: Check Username/Password or paste Direct ECOM Token",
            "",
            "URL Probe Results:",
            ...attemptResults,
          ].join("\n"),
        });
        if (!found) { res.json({ ok: false, steps, serverIp, totalMs: Date.now() - startTs }); return; }
      } catch (e: any) {
        steps.push({ step: "4 · ECOM Token (Step-2)", status: "fail", detail: `Error: ${e.message}` });
        res.json({ ok: false, steps, serverIp, totalMs: Date.now() - startTs }); return;
      }
    } else {
      steps.push({ step: "4 · ECOM Token (Step-2)", status: "warn", detail: "No Username/Password set — cannot test Step-2 auto-generation.\nFix: Add credentials in Settings, or paste a Direct ECOM Token." });
    }

    /* 5. Booking URL probe (no actual booking — just OPTIONS check)
       Official endpoint is /ecom/api/booking/create (listed first) */
    const bookUrls = [`${baseUrl}/ecom/api/booking/create`, `${baseUrl}/ecom/api/shipment/book`];
    for (const bUrl of bookUrls) {
      const t0b = Date.now();
      try {
        const bResp = await fetch(bUrl, {
          method: "OPTIONS",
          headers: { "Authorization": `Bearer ${ecomToken || bearer}` },
          signal: AbortSignal.timeout(6000),
        });
        const durationMs = Date.now() - t0b;
        const reachable = bResp.status !== 404;
        pushTcsLog({ ts: new Date().toISOString(), type: "diagnostics", url: bUrl, method: "OPTIONS", reqBody: "", httpStatus: bResp.status, resBody: "", durationMs, success: reachable });
        steps.push({ step: `5 · Booking URL Probe (${bUrl.split("/").pop()})`, status: reachable ? "ok" : "warn", detail: `URL: OPTIONS ${bUrl}\nHTTP: ${bResp.status} — ${reachable ? "✅ Endpoint reachable" : "❌ 404 Not Found"}\nDuration: ${durationMs}ms` });
      } catch (e: any) {
        steps.push({ step: `5 · Booking URL Probe (${bUrl.split("/").pop()})`, status: "warn", detail: `Network error: ${e.message}\nDuration: ${Date.now() - t0b}ms` });
      }
    }

    /* 6. Summary */
    const ok = steps.every(s => s.status !== "fail");
    const totalMs = Date.now() - startTs;
    steps.push({
      step: "6 · Summary",
      status: ok ? "ok" : "fail",
      detail: [
        ok ? "✅ All checks passed — TCS is ready for booking!" : "❌ Some checks failed — see steps above",
        `Server IP: ${serverIp} (share with TCS if needed for whitelisting)`,
        `Total time: ${totalMs}ms`,
        "",
        "Next steps if booking fails:",
        "  1. Ensure server IP is whitelisted with TCS",
        "  2. Verify ENVO Bearer Token is not expired",
        "  3. Try Test Booking button to simulate a real booking call",
        `  4. Portal: ${baseUrl}/ecom/index.html`,
      ].join("\n"),
    });

    res.json({ ok, steps, serverIp, totalMs });
  } catch (err: any) {
    steps.push({ step: "Fatal Error", status: "fail", detail: err.message });
    res.status(500).json({ ok: false, steps, error: err.message, totalMs: Date.now() - startTs });
  }
});

/* ─── Admin: TCS – CN / Label Print ─────────────────── */
router.post("/admin/couriers/tcs/print-label", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { consignmentNumber, shipmentIds } = req.body ?? {};
    if (!consignmentNumber && (!Array.isArray(shipmentIds) || shipmentIds.length === 0)) {
      res.status(400).json({ error: "Provide consignmentNumber (single) or shipmentIds[] (batch)" }); return;
    }

    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "tcs")).limit(1);
    if (!courierRow) { res.status(404).json({ error: "TCS courier not configured" }); return; }
    const settings = (courierRow.settings ?? {}) as Record<string, any>;
    const bearer = getTcsStaticBearer(settings);
    const baseUrl = settings.sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;
    /* Label API uses ECOM token in Authorization header (same as booking) */
    const ecomToken = await getTcsEcomToken(settings, bearer, baseUrl);

    /* Build consignment list — single or batch */
    const cnList: string[] = consignmentNumber
      ? [String(consignmentNumber)]
      : shipmentIds.map((id: any) => String(id));

    const printResp = await fetch(`${baseUrl}/ecom/api/print/label`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${ecomToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ consignmentNo: cnList[0], consignmentno: cnList }),
      signal: AbortSignal.timeout(20000),
    });

    const contentType = printResp.headers.get("content-type") ?? "";
    if (contentType.includes("application/pdf") || contentType.includes("octet-stream")) {
      const buf = await printResp.arrayBuffer();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="tcs-label-${cnList[0]}.pdf"`);
      res.send(Buffer.from(buf));
      return;
    }

    /* JSON or HTML response — pass through */
    const text = await printResp.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!printResp.ok) {
      res.status(502).json({ error: data.message ?? `TCS print API returned HTTP ${printResp.status}`, raw: data });
      return;
    }

    /* Some TCS responses return base64 PDF in a JSON envelope */
    const b64 = data.result?.labelData ?? data.labelData ?? data.data ?? null;
    if (typeof b64 === "string" && b64.length > 100) {
      const buf = Buffer.from(b64, "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="tcs-label-${cnList[0]}.pdf"`);
      res.send(buf);
      return;
    }

    res.json({ ok: printResp.ok, consignments: cnList, data });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "TCS print label failed" });
  }
});

/* ─── Admin: PostEx proxy – fetch live order types ─── */
router.get("/admin/couriers/postex/order-types", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "postex")).limit(1);
    if (!courierRow?.apiKey || !courierRow?.apiEndpoint) {
      res.json(["Normal", "Reversed", "Replacement"]);
      return;
    }
    const resp = await fetch(`${courierRow.apiEndpoint}/v1/get-order-types`, {
      headers: { token: courierRow.apiKey },
      signal: AbortSignal.timeout(8000),
    });
    const raw = await resp.json() as Record<string, any>;
    const types: string[] = Array.isArray(raw?.dist) ? raw.dist : ["Normal", "Reversed", "Replacement"];
    res.json(types);
    return;
  } catch {
    res.json(["Normal", "Reversed", "Replacement"]);
  }
});

/* ─── Admin: PostEx proxy – fetch merchant pickup addresses ── */
router.get("/admin/couriers/postex/addresses", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "postex")).limit(1);
    if (!courierRow?.apiKey || !courierRow?.apiEndpoint) { res.json([]); return; }
    const resp = await fetch(`${courierRow.apiEndpoint}/v1/get-merchant-address`, {
      headers: { token: courierRow.apiKey },
      signal: AbortSignal.timeout(8000),
    });
    const raw = await resp.json() as Record<string, any>;
    const addresses: any[] = Array.isArray(raw?.dist) ? raw.dist : [];
    res.json(addresses.map((a: any) => ({
      addressCode: a.addressCode,
      addressType: a.addressType ?? "Pickup Address",
      address: a.address?.trim() ?? "",
      cityName: a.cityName ?? "",
      contactPersonName: a.contactPersonName ?? "",
    })));
    return;
  } catch {
    res.json([]);
  }
});

/* ─── Admin: PostEx – Airway Bill PDF (label) ────────── */
router.get("/admin/couriers/postex/airway-bill", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "postex")).limit(1);
    if (!courierRow?.apiKey || !courierRow?.apiEndpoint) { res.status(400).json({ error: "PostEx not configured" }); return; }
    const trackingNumbers = String(req.query.trackingNumbers ?? "");
    if (!trackingNumbers) { res.status(400).json({ error: "trackingNumbers query param required" }); return; }
    const pdfResp = await fetch(`${courierRow.apiEndpoint}/v1/get-invoice?trackingNumbers=${encodeURIComponent(trackingNumbers)}`, {
      headers: { token: courierRow.apiKey },
      signal: AbortSignal.timeout(15000),
    });
    if (!pdfResp.ok) { res.status(502).json({ error: `PostEx returned ${pdfResp.status}` }); return; }
    const contentType = pdfResp.headers.get("content-type") ?? "application/pdf";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="postex-label-${trackingNumbers}.pdf"`);
    const buf = Buffer.from(await pdfResp.arrayBuffer());
    res.send(buf);
    return;
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch PostEx airway bill" });
  }
});

/* ─── Admin: PostEx – Cancel Order ──────────────────── */
router.post("/admin/couriers/postex/cancel", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "postex")).limit(1);
    if (!courierRow?.apiKey || !courierRow?.apiEndpoint) { res.status(400).json({ error: "PostEx not configured" }); return; }
    const { trackingNumber } = req.body as { trackingNumber?: string };
    if (!trackingNumber) { res.status(400).json({ error: "trackingNumber is required" }); return; }
    const cancelResp = await fetch(`${courierRow.apiEndpoint}/v1/cancel-order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", token: courierRow.apiKey },
      body: JSON.stringify({ trackingNumber }),
      signal: AbortSignal.timeout(10000),
    });
    const raw = await cancelResp.json() as Record<string, any>;
    if (!cancelResp.ok && raw?.statusCode !== "200" && raw?.statusCode !== 200) {
      res.status(502).json({ error: raw?.statusMessage ?? `PostEx cancel failed: HTTP ${cancelResp.status}` });
      return;
    }
    res.json({ success: true, message: raw?.statusMessage ?? "Order cancelled" });
    return;
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to cancel PostEx order" });
  }
});

/* ─── Admin: PostEx proxy – fetch operational cities ── */
router.get("/admin/couriers/postex/cities", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "postex")).limit(1);
    if (!courierRow?.apiKey || !courierRow?.apiEndpoint) {
      res.json([]); return;
    }
    const resp = await fetch(`${courierRow.apiEndpoint}/v2/get-operational-city`, {
      headers: { token: courierRow.apiKey },
      signal: AbortSignal.timeout(8000),
    });
    const raw = await resp.json() as Record<string, any>;
    const cities: any[] = Array.isArray(raw?.dist) ? raw.dist : [];
    res.json(cities.map((c: any) => c.operationalCityName).filter(Boolean).sort());
    return;
  } catch {
    res.json([]);
  }
});

/* ─── Admin: update courier ─────────────────────────── */
router.patch("/admin/couriers/:id", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const updates = req.body;

    if (updates.isDefault === true) {
      await db.update(couriersTable).set({ isDefault: false });
    }

    const [courier] = await db.update(couriersTable).set({
      ...updates,
      updatedAt: new Date(),
    }).where(eq(couriersTable.id, id)).returning();

    if (!courier) { res.status(404).json({ error: "Courier not found" }); return; }
    res.json(courier);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update courier" });
  }
});

/* ─── Create shipment for an order ─────────────────── */
router.post("/admin/shipments", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId, courierSlug, service, weight, dimensions } = req.body;
    if (!orderId) { res.status(400).json({ error: "orderId is required" }); return; }

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const slug = courierSlug ?? order.courier ?? "tcs";
    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, slug)).limit(1);

    let trackingId: string;
    let rawResponse: Record<string, any> = {};

    if (courierRow) {
      const settings = (courierRow.settings ?? {}) as Record<string, any>;
      const hasApiCreds = courierRow.slug === "tcs"
        ? !!(settings.accessToken || settings.bearerToken || (settings.username && settings.password))
        : !!(courierRow.apiKey && courierRow.apiEndpoint);
      if (hasApiCreds) {
        try {
          const result = await callCourierApi(courierRow, order, service);
          trackingId = result.trackingId;
          rawResponse = { ...result.rawResponse, trackingUrl: result.trackingUrl };
        } catch (apiErr: any) {
          req.log.warn({ err: apiErr }, "Courier API failed");
          res.status(502).json({ error: apiErr.message ?? "Courier booking failed" });
          return;
        }
      } else {
        trackingId = generateTrackingId(slug);
        rawResponse = { note: "Generated locally — courier not configured" };
      }
    } else {
      trackingId = generateTrackingId(slug);
      rawResponse = { note: "Generated locally — courier not found" };
    }

    const now = new Date().toISOString();
    const [shipment] = await db.insert(shipmentsTable).values({
      orderId,
      courierId: courierRow?.id ?? null,
      courierSlug: slug,
      trackingId,
      status: "pending",
      statusHistory: [{ status: "pending", timestamp: now, note: "Shipment created" }],
      weight: weight ? String(weight) : null,
      dimensions: dimensions ?? null,
      rawResponse,
    }).returning();

    await db.update(ordersTable).set({ trackingId, courier: slug, updatedAt: new Date() }).where(eq(ordersTable.id, orderId));

    res.json(shipment);
    return;
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create shipment" });
  }
});

/* ─── Manual booking (no linked order) ─────────────── */
router.post("/admin/couriers/manual-book", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      courierSlug = "tcs",
      customerName, phone, address, city, email = "",
      codAmount = 0, weight = 0.5, serviceCode = "O",
      remarks = "", pieces = 1, fragile = false,
      declaredValue = null, insuredValue = null,
      contentDesc = "KDF Nuts Products",
      orderId = null,
      /* per-courier extras */
      specialInstructions = "",
      postexOrderType = null,
      invoiceAmount = null,
    } = req.body;

    if (!customerName || !phone || !address || !city) {
      res.status(400).json({ error: "customerName, phone, address and city are required" });
      return;
    }

    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, courierSlug)).limit(1);
    if (!courierRow) { res.status(404).json({ error: `Courier "${courierSlug}" not configured` }); return; }

    const fakeOrder: Record<string, any> = {
      id: orderId ?? 0,
      orderNumber: `MAN-${Date.now()}`,
      paymentMethod: codAmount > 0 ? "cod" : "online",
      total: codAmount,
      notes: remarks,
      items: [{ name: contentDesc, qty: pieces, price: codAmount }],
      shippingAddress: { name: customerName, phone, address, city, email },
      courier: courierSlug,
      /* per-courier extra fields — read in callCourierApi per-courier handlers */
      weight,
      pieces,
      fragile,
      contentDesc,
      specialInstructions,
      postexOrderType,
      invoiceAmount: invoiceAmount ?? codAmount,
    };

    let trackingId: string;
    let rawResponse: Record<string, any> = {};

    const settings = (courierRow.settings ?? {}) as Record<string, any>;
    const hasApiCreds = courierRow.slug === "tcs"
      ? !!(settings.accessToken || settings.bearerToken || (settings.username && settings.password))
      : !!(courierRow.apiKey && courierRow.apiEndpoint);

    if (hasApiCreds) {
      try {
        /* PostEx does NOT use serviceCode (that's TCS-specific: "O","P","C").
           Pass undefined so callCourierApi uses postexOrderType from fakeOrder instead. */
        const serviceParam = courierSlug === "postex" ? undefined : serviceCode;
        const result = await callCourierApi(courierRow, fakeOrder, serviceParam);
        trackingId = result.trackingId;
        rawResponse = { ...result.rawResponse, trackingUrl: result.trackingUrl };
      } catch (apiErr: any) {
        res.status(502).json({ error: apiErr.message ?? "Booking failed" });
        return;
      }
    } else {
      trackingId = generateTrackingId(courierSlug);
      rawResponse = { note: "Generated locally — no API credentials" };
    }

    const now = new Date().toISOString();
    const [shipment] = await db.insert(shipmentsTable).values({
      orderId: orderId ?? null,
      courierId: courierRow.id,
      courierSlug,
      trackingId,
      status: "pending",
      statusHistory: [{ status: "pending", timestamp: now, note: "Manual booking" }],
      weight: String(weight),
      customerName,
      customerPhone: phone,
      rawResponse: { ...rawResponse, manualBooking: true, codAmount, serviceCode, contentDesc, fragile, pieces, declaredValue, insuredValue },
    }).returning();

    if (orderId) {
      await db.update(ordersTable).set({ trackingId, courier: courierSlug, updatedAt: new Date() }).where(eq(ordersTable.id, orderId));
    }

    res.json({ ok: true, shipment, trackingId });
    return;
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Manual booking failed" });
  }
});

/* ─── Get label data for a shipment ────────────────── */
router.get("/admin/shipments/:id/label", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return; }

    const [courierRow] = shipment.courierId
      ? await db.select().from(couriersTable).where(eq(couriersTable.id, shipment.courierId)).limit(1)
      : [null];

    const settings = (courierRow?.settings ?? {}) as Record<string, any>;
    let order: any = null;
    if (shipment.orderId) {
      [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, shipment.orderId)).limit(1);
    }

    const label = {
      trackingId: shipment.trackingId,
      barcode: shipment.trackingId,
      courierName: courierRow?.name ?? (shipment.courierSlug ?? "").toUpperCase(),
      courierSlug: shipment.courierSlug,
      status: shipment.status,
      createdAt: shipment.createdAt,
      customerName:  shipment.customerName  ?? order?.shippingAddress?.name  ?? "—",
      customerPhone: shipment.customerPhone ?? order?.shippingAddress?.phone ?? "—",
      address:  order?.shippingAddress?.address  ?? (shipment.rawResponse as any)?.address  ?? "—",
      city:     order?.shippingAddress?.city     ?? (shipment.rawResponse as any)?.city     ?? "—",
      codAmount: (shipment.rawResponse as any)?.codAmount ?? (order?.paymentMethod === "cod" ? order?.total : 0) ?? 0,
      weight: shipment.weight ?? "—",
      pieces: (shipment.rawResponse as any)?.pieces ?? 1,
      serviceCode: (shipment.rawResponse as any)?.serviceCode ?? settings.serviceCode ?? "O",
      contentDesc: (shipment.rawResponse as any)?.contentDesc ?? "KDF Nuts Products",
      remarks: (shipment.rawResponse as any)?.remarks ?? "",
      shipperName:    settings.shipperName    ?? "KDF NUTS",
      shipperAddress: settings.shipperAddress ?? "",
      shipperCity:    settings.shipperCity    ?? "",
      shipperPhone:   settings.shipperPhone   ?? "",
      tcsAccount:     settings.tcsaccount     ?? "",
      orderId:        shipment.orderId,
      orderNumber:    order?.orderNumber ?? `#${shipment.orderId ?? "—"}`,
    };

    res.json(label);
    return;
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Failed to get label" });
  }
});

/* ─── Get label by order ID (PostEx → official PDF, others → JSON) ── */
router.get("/admin/orders/:orderId/label", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orderId = parseInt(req.params.orderId as string);
    if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order ID" }); return; }

    const [shipment] = await db.select().from(shipmentsTable)
      .where(eq(shipmentsTable.orderId, orderId))
      .orderBy(desc(shipmentsTable.createdAt))
      .limit(1);

    if (!shipment) { res.status(404).json({ error: "No shipment found for this order" }); return; }

    const courierSlug = shipment.courierSlug ?? "";

    /* PostEx: stream the official airway-bill PDF directly */
    if (courierSlug === "postex" && shipment.trackingId) {
      const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "postex")).limit(1);
      if (!courierRow?.apiKey || !courierRow?.apiEndpoint) { res.status(400).json({ error: "PostEx not configured" }); return; }
      const pdfResp = await fetch(
        `${courierRow.apiEndpoint}/v1/get-invoice?trackingNumbers=${encodeURIComponent(shipment.trackingId)}`,
        { headers: { token: courierRow.apiKey }, signal: AbortSignal.timeout(15000) },
      );
      if (!pdfResp.ok) { res.status(502).json({ error: `PostEx returned ${pdfResp.status}` }); return; }
      const ct = pdfResp.headers.get("content-type") ?? "application/pdf";
      res.setHeader("Content-Type", ct);
      res.setHeader("Content-Disposition", `inline; filename="postex-label-${shipment.trackingId}.pdf"`);
      res.send(Buffer.from(await pdfResp.arrayBuffer()));
      return;
    }

    /* Other couriers: return JSON for custom HTML label */
    const [courierRow] = shipment.courierId
      ? await db.select().from(couriersTable).where(eq(couriersTable.id, shipment.courierId)).limit(1)
      : [null as any];
    const settings = (courierRow?.settings ?? {}) as Record<string, any>;
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);

    res.json({
      trackingId:     shipment.trackingId,
      barcode:        shipment.trackingId,
      courierName:    courierRow?.name ?? courierSlug.toUpperCase(),
      courierSlug,
      status:         shipment.status,
      createdAt:      shipment.createdAt,
      customerName:   (shipment as any).customerName  ?? order?.shippingAddress?.name  ?? "—",
      customerPhone:  (shipment as any).customerPhone ?? order?.shippingAddress?.phone ?? "—",
      address:        order?.shippingAddress?.address ?? "—",
      city:           order?.shippingAddress?.city    ?? "—",
      codAmount:      (shipment.rawResponse as any)?.codAmount ?? (order?.paymentMethod === "cod" ? order?.total : 0) ?? 0,
      weight:         shipment.weight ?? "—",
      pieces:         (shipment.rawResponse as any)?.pieces ?? 1,
      serviceCode:    (shipment.rawResponse as any)?.serviceCode ?? settings.serviceCode ?? "O",
      contentDesc:    (shipment.rawResponse as any)?.contentDesc ?? "KDF Nuts Products",
      remarks:        (shipment.rawResponse as any)?.remarks ?? "",
      shipperName:    settings.shipperName    ?? "KDF NUTS",
      shipperAddress: settings.shipperAddress ?? "",
      shipperCity:    settings.shipperCity    ?? "",
      shipperPhone:   settings.shipperPhone   ?? "",
      tcsAccount:     settings.tcsaccount     ?? "",
      orderId:        shipment.orderId,
      orderNumber:    order?.orderNumber ?? `#${shipment.orderId ?? "—"}`,
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Failed to get label" });
  }
});

/* ─── Courier global settings ───────────────────────── */
router.get("/admin/settings/courier", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const couriers = await db.select().from(couriersTable).orderBy(couriersTable.name);
    const defaultCourier = couriers.find(c => c.isDefault) ?? couriers.find(c => c.slug === "tcs") ?? couriers[0] ?? null;
    const settings = (defaultCourier?.settings ?? {}) as Record<string, any>;
    res.json({
      defaultCourierSlug:  defaultCourier?.slug ?? "tcs",
      defaultServiceCode:  settings.serviceCode ?? "O",
      defaultWeight:       settings.defaultWeight ?? 0.5,
      autoBooking:         settings.autoBooking ?? false,
      codDefault:          settings.codDefault ?? true,
      defaultRemarks:      settings.defaultRemarks ?? "KDF NUTS Order",
      deliveryChargeRule:  settings.deliveryChargeRule ?? "flat",
      flatCharge:          settings.flatCharge ?? 200,
      freeAbove:           settings.freeAbove ?? 0,
      couriers:            couriers.map(c => ({ id: c.id, slug: c.slug, name: c.name, isActive: c.isActive, isDefault: c.isDefault })),
    });
    return;
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get courier settings" });
  }
});

router.put("/admin/settings/courier", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { defaultCourierSlug, defaultServiceCode, defaultWeight, autoBooking, codDefault, defaultRemarks, deliveryChargeRule, flatCharge, freeAbove } = req.body;

    if (defaultCourierSlug) {
      await db.update(couriersTable).set({ isDefault: false });
      const [target] = await db.select().from(couriersTable).where(eq(couriersTable.slug, defaultCourierSlug)).limit(1);
      if (target) {
        const currentSettings = (target.settings ?? {}) as Record<string, any>;
        const newSettings = {
          ...currentSettings,
          ...(defaultServiceCode !== undefined ? { serviceCode: defaultServiceCode } : {}),
          ...(defaultWeight !== undefined ? { defaultWeight } : {}),
          ...(autoBooking !== undefined ? { autoBooking } : {}),
          ...(codDefault !== undefined ? { codDefault } : {}),
          ...(defaultRemarks !== undefined ? { defaultRemarks } : {}),
          ...(deliveryChargeRule !== undefined ? { deliveryChargeRule } : {}),
          ...(flatCharge !== undefined ? { flatCharge } : {}),
          ...(freeAbove !== undefined ? { freeAbove } : {}),
        };
        await db.update(couriersTable).set({ isDefault: true, settings: newSettings, updatedAt: new Date() }).where(eq(couriersTable.id, target.id));
      }
    }

    res.json({ ok: true });
    return;
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to save courier settings" });
  }
});

/* ─── Get shipments list (admin) ────────────────────── */
router.get("/admin/shipments", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = ((parseInt(req.query.page as string) || 1) - 1) * limit;
    const shipments = await db.select().from(shipmentsTable).orderBy(desc(shipmentsTable.createdAt)).limit(limit).offset(offset);
    res.json(shipments);
    return;
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch shipments" });
  }
});

/* ─── Get tracking for an order (public/user) ────────── */
router.get("/orders/:orderId/tracking", authMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orderId = parseInt(req.params.orderId as string);
    const [shipment] = await db.select().from(shipmentsTable)
      .where(eq(shipmentsTable.orderId, orderId))
      .orderBy(desc(shipmentsTable.createdAt))
      .limit(1);

    if (!shipment) { res.json(null); return; }

    const courierNames: Record<string, string> = {
      tcs: "TCS Couriers", leopards: "Leopards", postex: "PostEx", trax: "Trax",
    };

    res.json({
      ...shipment,
      courierName: courierNames[shipment.courierSlug ?? ""] ?? shipment.courierSlug,
    });
    return;
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch tracking" });
  }
});

/* ─── Admin: refresh tracking from courier API ────────── */
router.post("/admin/shipments/:id/refresh", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return; }

    const courierRow = shipment.courierId
      ? (await db.select().from(couriersTable).where(eq(couriersTable.id, shipment.courierId)).limit(1))[0]
      : null;

    let newStatus = shipment.status;
    let rawResponse: Record<string, any> = {};

    if (courierRow && shipment.trackingId) {
      try {
        const result = await trackWithCourierApi(courierRow, shipment.trackingId);
        newStatus = result.status as any;
        rawResponse = result.rawResponse;
      } catch (apiErr: any) {
        rawResponse = { error: apiErr.message };
      }
    } else {
      rawResponse = { note: "No courier config — status unchanged" };
    }

    const history = [...(shipment.statusHistory ?? [])];
    if (newStatus !== shipment.status) {
      history.push({ status: newStatus, timestamp: new Date().toISOString(), note: "Updated via courier API" });
    }

    const [updated] = await db.update(shipmentsTable).set({
      status: newStatus,
      statusHistory: history,
      rawResponse,
      lastTrackedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(shipmentsTable.id, id)).returning();

    if (newStatus !== shipment.status) {
      await db.update(ordersTable).set({
        status: mapShipmentStatusToOrder(newStatus),
        updatedAt: new Date(),
      }).where(eq(ordersTable.id, shipment.orderId));

      sendCourierNotification({ ...shipment, status: newStatus }, newStatus, req).catch(() => {});
    }

    res.json(updated);
    return;
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to refresh tracking" });
  }
});

/* ─── Admin: cancel a TCS shipment ──────────────────── */
router.post("/admin/shipments/:id/cancel", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return; }
    if (!shipment.trackingId) { res.status(400).json({ error: "No tracking ID on this shipment" }); return; }

    const courierRow = shipment.courierId
      ? (await db.select().from(couriersTable).where(eq(couriersTable.id, shipment.courierId)).limit(1))[0]
      : null;

    if (!courierRow || courierRow.slug !== "tcs") {
      res.status(400).json({ error: "Cancel is only supported for TCS shipments" }); return;
    }

    const settings = (courierRow.settings ?? {}) as Record<string, any>;
    const bearer = getTcsStaticBearer(settings);
    const baseUrl = settings.sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;
    /* Cancel API uses ECOM token in Authorization header (same as booking) */
    const ecomToken = await getTcsEcomToken(settings, bearer, baseUrl);

    const cancelResp = await fetch(`${baseUrl}/ecom/api/booking/cancel`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${ecomToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ consignmentNumber: shipment.trackingId }),
      signal: AbortSignal.timeout(10000),
    });
    const cancelData = await cancelResp.json() as Record<string, any>;

    if (cancelData.message !== "SUCCESS") {
      throw new Error(cancelData.message ?? "TCS cancel failed");
    }

    const history = [...(shipment.statusHistory ?? []), {
      status: "returned", timestamp: new Date().toISOString(), note: "Cancelled via TCS API",
    }];
    const [updated] = await db.update(shipmentsTable).set({
      status: "returned",
      statusHistory: history,
      rawResponse: { ...((shipment.rawResponse ?? {}) as object), cancelResponse: cancelData },
      updatedAt: new Date(),
    }).where(eq(shipmentsTable.id, id)).returning();

    res.json({ ok: true, shipment: updated });
    return;
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Failed to cancel shipment" });
  }
});

/* ─── Admin: manually update shipment status ─────────── */
router.patch("/admin/shipments/:id/status", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const { status, note } = req.body;
    if (!status) { res.status(400).json({ error: "status is required" }); return; }

    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return; }

    const history = [...(shipment.statusHistory ?? []), {
      status, timestamp: new Date().toISOString(), note: note ?? "Updated manually",
    }];

    const [updated] = await db.update(shipmentsTable).set({
      status, statusHistory: history, updatedAt: new Date(),
    }).where(eq(shipmentsTable.id, id)).returning();

    await db.update(ordersTable).set({
      status: mapShipmentStatusToOrder(status as any),
      updatedAt: new Date(),
    }).where(eq(ordersTable.id, shipment.orderId));

    res.json(updated);
    return;
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update shipment status" });
  }
});

/* ─── Admin: courier analytics dashboard ─────────────── */
router.get("/admin/courier-analytics", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { courier, status, from, to } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (courier) conditions.push(eq(shipmentsTable.courierSlug, courier));
    if (status)  conditions.push(eq(shipmentsTable.status, status as any));
    if (from)    conditions.push(gte(shipmentsTable.createdAt, new Date(from)));
    if (to)      conditions.push(lte(shipmentsTable.createdAt, new Date(to + "T23:59:59")));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [stats] = await db.select({
      total:            sql<number>`count(*)`,
      pending:          sql<number>`count(*) filter (where status = 'pending')`,
      processing:       sql<number>`count(*) filter (where status = 'processing')`,
      shipped:          sql<number>`count(*) filter (where status = 'shipped')`,
      in_transit:       sql<number>`count(*) filter (where status = 'in_transit')`,
      out_for_delivery: sql<number>`count(*) filter (where status = 'out_for_delivery')`,
      delivered:        sql<number>`count(*) filter (where status = 'delivered')`,
      failed:           sql<number>`count(*) filter (where status = 'failed')`,
      returned:         sql<number>`count(*) filter (where status = 'returned')`,
    }).from(shipmentsTable).where(where as any);

    const allCouriers = await db.select().from(couriersTable);
    const byCourierRaw = await db.select({
      slug:      shipmentsTable.courierSlug,
      total:     sql<number>`count(*)`,
      delivered: sql<number>`count(*) filter (where status = 'delivered')`,
    }).from(shipmentsTable).where(where as any)
      .groupBy(shipmentsTable.courierSlug);

    const byCourier = byCourierRaw.map(c => {
      const courierInfo = allCouriers.find(x => x.slug === c.slug);
      return {
        slug: c.slug,
        name: courierInfo?.name ?? c.slug,
        total: c.total,
        delivered: c.delivered,
        deliveryRate: c.total > 0 ? Math.round((c.delivered / c.total) * 100) : 0,
      };
    }).sort((a, b) => b.total - a.total);

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);

    const dailyRaw = await db.select({
      day:   sql<string>`date_trunc('day', created_at)::date::text`,
      total: sql<number>`count(*)`,
    }).from(shipmentsTable)
      .where(and(gte(shipmentsTable.createdAt, sevenDaysAgo), ...(conditions.length > 0 ? conditions : [])) as any)
      .groupBy(sql`date_trunc('day', created_at)`)
      .orderBy(sql`date_trunc('day', created_at)`);

    const dailyMap: Record<string, number> = {};
    dailyRaw.forEach(d => { dailyMap[d.day] = d.total; });

    const dailyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyTrend.push({
        date: key,
        label: d.toLocaleDateString("en-PK", { month: "short", day: "numeric" }),
        total: dailyMap[key] ?? 0,
      });
    }

    const [notifStats] = await db.select({
      notificationsSent: sql<number>`count(*) filter (where success = true)`,
    }).from(courierNotificationLogsTable);

    res.json({ ...stats, byCourier, dailyTrend, notificationsSent: notifStats?.notificationsSent ?? 0 });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch courier analytics" });
  }
});

/* ─── Admin: shipments with customer info ──────────────── */
router.get("/admin/shipments-v2", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { courier, status, from, to } = req.query as Record<string, string>;
    const limit = 200;

    const conditions: any[] = [];
    if (courier) conditions.push(eq(shipmentsTable.courierSlug, courier));
    if (status)  conditions.push(eq(shipmentsTable.status, status as any));
    if (from)    conditions.push(gte(shipmentsTable.createdAt, new Date(from)));
    if (to)      conditions.push(lte(shipmentsTable.createdAt, new Date(to + "T23:59:59")));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const shipments = await db.select().from(shipmentsTable)
      .where(where as any)
      .orderBy(desc(shipmentsTable.createdAt))
      .limit(limit);

    const orderIds = [...new Set(shipments.map(s => s.orderId))];
    let orders: any[] = [];
    if (orderIds.length > 0) {
      orders = await db.select({
        id: ordersTable.id,
        shippingAddress: ordersTable.shippingAddress,
        userId: ordersTable.userId,
      }).from(ordersTable)
        .where(sql`${ordersTable.id} = ANY(ARRAY[${sql.raw(orderIds.join(","))}])`);
    }

    const orderMap = new Map(orders.map(o => [o.id, o]));

    const enriched = shipments.map(s => {
      const order = orderMap.get(s.orderId);
      const addr = (order?.shippingAddress as any) ?? {};
      return {
        ...s,
        customerName:  addr.name  ?? null,
        customerPhone: addr.phone ?? null,
        customerEmail: addr.email ?? null,
      };
    });

    res.json({ shipments: enriched, total: enriched.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch shipments" });
  }
});

/* ─── Admin: bulk refresh all active shipments ─────────── */
/* ─── Admin: sync ALL TCS shipments (old + new) ────────── */
router.post("/admin/couriers/sync-all", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { courierSlug = "tcs", includeFinalized = false } = req.body ?? {};

    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, courierSlug)).limit(1);
    if (!courierRow) { res.status(404).json({ error: `Courier "${courierSlug}" not found` }); return; }

    let query = db.select().from(shipmentsTable).where(eq(shipmentsTable.courierSlug, courierSlug));
    if (!includeFinalized) {
      query = db.select().from(shipmentsTable).where(
        and(
          eq(shipmentsTable.courierSlug, courierSlug),
          sql`status NOT IN ('delivered', 'returned', 'failed')`,
        )
      ) as any;
    }

    const shipments = await query;
    let synced = 0, changed = 0, errors = 0;

    for (const shipment of shipments) {
      if (!shipment.trackingId) continue;
      try {
        const result = await trackWithCourierApi(courierRow, shipment.trackingId);
        const prevStatus = shipment.status;
        const newStatus = result.status;

        const history = [...(shipment.statusHistory ?? [])];
        if (newStatus !== prevStatus) {
          history.push({ status: newStatus, timestamp: new Date().toISOString(), note: `Synced from ${courierSlug.toUpperCase()} API` });
          changed++;
        }

        await db.update(shipmentsTable).set({
          status: newStatus as any,
          statusHistory: history,
          rawResponse: result.rawResponse,
          lastTrackedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(shipmentsTable.id, shipment.id));

        if (newStatus !== prevStatus) {
          await db.update(ordersTable).set({
            status: mapShipmentStatusToOrder(newStatus),
            updatedAt: new Date(),
          }).where(eq(ordersTable.id, shipment.orderId));
          await sendCourierNotification({ ...shipment, status: newStatus }, newStatus, req).catch(() => {});
        }
        synced++;
        await new Promise(r => setTimeout(r, 200));
      } catch { errors++; }
    }

    res.json({ ok: true, total: shipments.length, synced, changed, errors });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Sync failed" });
  }
});

router.post("/admin/courier-analytics/bulk-refresh", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const activeStatuses = ["pending", "processing", "shipped", "in_transit", "out_for_delivery"] as const;
    const activeShipments = await db.select().from(shipmentsTable)
      .where(sql`status = ANY(ARRAY['pending','processing','shipped','in_transit','out_for_delivery']::shipment_status[])`);

    let refreshed = 0;
    for (const shipment of activeShipments) {
      if (!shipment.trackingId || !shipment.courierId) continue;
      try {
        const courierRow = (await db.select().from(couriersTable).where(eq(couriersTable.id, shipment.courierId)).limit(1))[0];
        if (!courierRow) continue;

        const result = await trackWithCourierApi(courierRow, shipment.trackingId);
        const prevStatus = shipment.status;
        const newStatus = result.status;

        const history = [...(shipment.statusHistory ?? [])];
        if (newStatus !== prevStatus) {
          history.push({ status: newStatus, timestamp: new Date().toISOString(), note: "Auto-synced" });
        }

        await db.update(shipmentsTable).set({
          status: newStatus as any,
          statusHistory: history,
          rawResponse: result.rawResponse,
          lastTrackedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(shipmentsTable.id, shipment.id));

        if (newStatus !== prevStatus) {
          await db.update(ordersTable).set({
            status: mapShipmentStatusToOrder(newStatus),
            updatedAt: new Date(),
          }).where(eq(ordersTable.id, shipment.orderId));

          await sendCourierNotification(shipment, newStatus, req);
        }
        refreshed++;
      } catch {
      }
    }

    res.json({ ok: true, refreshed });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to bulk refresh" });
  }
});

/* ─── Admin: send notification for a shipment ──────────── */
router.post("/admin/courier-notifications/send/:id", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return; }

    await sendCourierNotification(shipment, shipment.status, req);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

/* ─── Admin: get courier notification logs ─────────────── */
router.get("/admin/courier-notification-logs", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const logs = await db.select().from(courierNotificationLogsTable)
      .orderBy(desc(courierNotificationLogsTable.createdAt))
      .limit(200);
    res.json(logs);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch notification logs" });
  }
});

/* ─── Admin: financial analytics ──────────────────────── */
router.get("/admin/courier-financial", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { courier, from, to } = req.query as Record<string, string>;

    const sConditions: any[] = [];
    if (courier) sConditions.push(eq(shipmentsTable.courierSlug, courier));
    if (from)    sConditions.push(gte(shipmentsTable.createdAt, new Date(from)));
    if (to)      sConditions.push(lte(shipmentsTable.createdAt, new Date(to + "T23:59:59")));
    const sWhere = sConditions.length > 0 ? and(...sConditions) : undefined;

    const shipments = await db.select({
      orderId:     shipmentsTable.orderId,
      status:      shipmentsTable.status,
      courierSlug: shipmentsTable.courierSlug,
      createdAt:   shipmentsTable.createdAt,
    }).from(shipmentsTable).where(sWhere as any);

    const orderIds = [...new Set(shipments.map(s => s.orderId))];
    if (orderIds.length === 0) {
      res.json({ totalRevenue: 0, deliveredRevenue: 0, pendingRevenue: 0, receivedRevenue: 0, totalDeliveryCost: 0, netProfit: 0, codTotal: 0, prepaidTotal: 0, paidCount: 0, unpaidCount: 0, byCourier: [] });
      return;
    }

    const orders = await db.select({
      id:            ordersTable.id,
      total:         ordersTable.total,
      deliveryFee:   ordersTable.deliveryFee,
      paymentMethod: ordersTable.paymentMethod,
      paymentStatus: ordersTable.paymentStatus,
      status:        ordersTable.status,
    }).from(ordersTable)
      .where(sql`${ordersTable.id} = ANY(ARRAY[${sql.raw(orderIds.join(","))}])`);

    const orderMap = new Map(orders.map(o => [o.id, o]));

    let totalRevenue = 0, deliveredRevenue = 0, pendingRevenue = 0, receivedRevenue = 0;
    let totalDeliveryCost = 0, codTotal = 0, prepaidTotal = 0, paidCount = 0, unpaidCount = 0;

    const byCourierMap: Record<string, { slug: string; total: number; delivered: number; revenue: number; deliveryCost: number; }> = {};

    for (const s of shipments) {
      const order = orderMap.get(s.orderId);
      if (!order) continue;

      const total = parseFloat(String(order.total ?? 0));
      const deliveryFee = parseFloat(String(order.deliveryFee ?? 0));
      const slug = s.courierSlug ?? "unknown";

      totalRevenue += total;
      totalDeliveryCost += deliveryFee;

      if (!byCourierMap[slug]) byCourierMap[slug] = { slug, total: 0, delivered: 0, revenue: 0, deliveryCost: 0 };
      byCourierMap[slug].total++;
      byCourierMap[slug].revenue += total;
      byCourierMap[slug].deliveryCost += deliveryFee;

      if (s.status === "delivered") {
        deliveredRevenue += total;
        byCourierMap[slug].delivered++;
        if (order.paymentMethod === "cod" || order.paymentMethod?.includes("cod")) {
          if (order.paymentStatus === "paid") { receivedRevenue += total; paidCount++; }
          else { pendingRevenue += total; unpaidCount++; }
          codTotal += total;
        } else {
          receivedRevenue += total;
          prepaidTotal += total;
          paidCount++;
        }
      } else if (["in_transit", "shipped", "out_for_delivery", "processing", "pending"].includes(s.status)) {
        pendingRevenue += total;
        unpaidCount++;
      }
    }

    const byCourier = Object.values(byCourierMap).sort((a, b) => b.total - a.total);
    const netProfit = deliveredRevenue - totalDeliveryCost;

    res.json({
      totalRevenue:      Math.round(totalRevenue),
      deliveredRevenue:  Math.round(deliveredRevenue),
      pendingRevenue:    Math.round(pendingRevenue),
      receivedRevenue:   Math.round(receivedRevenue),
      totalDeliveryCost: Math.round(totalDeliveryCost),
      netProfit:         Math.round(netProfit),
      codTotal:          Math.round(codTotal),
      prepaidTotal:      Math.round(prepaidTotal),
      paidCount,
      unpaidCount,
      byCourier,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch financial analytics" });
  }
});

/* ─── Admin: advanced reports ──────────────────────────── */
router.get("/admin/courier-reports", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { period = "weekly" } = req.query as Record<string, string>;

    const now = new Date();
    let daysBack = 30;
    let groupFormat = "YYYY-MM-DD";
    if (period === "daily")   { daysBack = 14; groupFormat = "YYYY-MM-DD"; }
    if (period === "weekly")  { daysBack = 84; groupFormat = "IYYY-IW"; }
    if (period === "monthly") { daysBack = 365; groupFormat = "YYYY-MM"; }

    const since = new Date(now);
    since.setDate(now.getDate() - daysBack);

    const gfRaw = sql.raw(`'${groupFormat}'`);
    const periodRaw = await db.select({
      period:    sql<string>`to_char(created_at, ${gfRaw})`,
      total:     sql<number>`count(*)::int`,
      delivered: sql<number>`count(*) filter (where status = 'delivered')::int`,
      returned:  sql<number>`count(*) filter (where status = 'returned')::int`,
      failed:    sql<number>`count(*) filter (where status = 'failed')::int`,
    }).from(shipmentsTable)
      .where(gte(shipmentsTable.createdAt, since))
      .groupBy(sql`to_char(created_at, ${gfRaw})`)
      .orderBy(sql`to_char(created_at, ${gfRaw})`);

    const courierPerfRaw = await db.select({
      slug:      shipmentsTable.courierSlug,
      total:     sql<number>`count(*)`,
      delivered: sql<number>`count(*) filter (where status = 'delivered')`,
      returned:  sql<number>`count(*) filter (where status = 'returned')`,
      failed:    sql<number>`count(*) filter (where status = 'failed')`,
    }).from(shipmentsTable)
      .where(gte(shipmentsTable.createdAt, since))
      .groupBy(shipmentsTable.courierSlug);

    const allCouriers = await db.select().from(couriersTable);
    const courierPerf = courierPerfRaw.map(c => ({
      ...c,
      name: allCouriers.find(x => x.slug === c.slug)?.name ?? c.slug,
      deliveryRate: c.total > 0 ? Math.round((c.delivered / c.total) * 100) : 0,
      returnRate:   c.total > 0 ? Math.round((c.returned  / c.total) * 100) : 0,
      failRate:     c.total > 0 ? Math.round((c.failed    / c.total) * 100) : 0,
    }));

    res.json({ periods: periodRaw, courierPerf, period });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

/* ─── Admin: build retargeting queue ──────────────────── */
router.post("/admin/courier-retargeting/build", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { daysAfterDelivery = 2 } = req.body ?? {};
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(daysAfterDelivery));
    const maxAge = new Date();
    maxAge.setDate(maxAge.getDate() - 30);

    const eligibleShipments = await db.select().from(shipmentsTable)
      .where(and(
        eq(shipmentsTable.status, "delivered"),
        lte(shipmentsTable.updatedAt, cutoff),
        gte(shipmentsTable.updatedAt, maxAge),
      ));

    const existingIds = new Set(
      (await db.select({ shipmentId: courierRetargetingQueueTable.shipmentId })
        .from(courierRetargetingQueueTable)).map(r => r.shipmentId)
    );

    let added = 0;
    for (const s of eligibleShipments) {
      if (existingIds.has(s.id)) continue;

      const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, s.orderId)).limit(1);
      if (!order) continue;

      const addr = (order.shippingAddress as any) ?? {};
      const scheduledFor = new Date(s.updatedAt);
      scheduledFor.setDate(scheduledFor.getDate() + Number(daysAfterDelivery));

      await db.insert(courierRetargetingQueueTable).values({
        shipmentId:    s.id,
        orderId:       s.orderId,
        trackingId:    s.trackingId,
        courierSlug:   s.courierSlug,
        customerName:  addr.name ?? null,
        customerPhone: addr.phone ?? null,
        customerEmail: addr.email ?? null,
        orderTotal:    order.total,
        deliveredAt:   s.updatedAt,
        scheduledFor,
        channel:       addr.phone ? "whatsapp" : "email",
        status:        "pending",
      });
      added++;
    }

    res.json({ ok: true, added, total: eligibleShipments.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to build retargeting queue" });
  }
});

/* ─── Admin: list retargeting queue ────────────────────── */
router.get("/admin/courier-retargeting", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (status) conditions.push(eq(courierRetargetingQueueTable.status, status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const items = await db.select().from(courierRetargetingQueueTable)
      .where(where as any)
      .orderBy(desc(courierRetargetingQueueTable.createdAt))
      .limit(200);
    res.json(items);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch retargeting queue" });
  }
});

/* ─── Admin: AI generate retargeting message ────────────── */
router.post("/admin/courier-retargeting/ai-generate", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { customerName, orderTotal, channel = "whatsapp", tone = "friendly", offer = "discount" } = req.body ?? {};

    const [aiSettings] = await db.select().from(aiSettingsTable).limit(1);
    if (!aiSettings?.openaiApiKey || !(aiSettings as any).aiEnabled) {
      res.status(400).json({ error: "AI is not configured. Please add your OpenAI API key in AI Settings." });
      return;
    }

    const openai = new OpenAI({ apiKey: aiSettings.openaiApiKey });

    const name = customerName ?? "Customer";
    const total = orderTotal ? `PKR ${orderTotal}` : "their recent order";

    const prompt = channel === "whatsapp"
      ? `Write a short WhatsApp retargeting message (max 3 sentences) for a customer named "${name}" who recently received ${total} from KDF NUTS (Pakistan's premium nuts brand). Tone: ${tone}. Include a ${offer}. Use simple Pakistani-friendly English. No markdown, no bullet points, just the message text. End with a call to action.`
      : `Write a short retargeting email (subject line + 3-4 sentences of body) for a customer named "${name}" who received ${total} from KDF NUTS. Tone: ${tone}. Include a ${offer}. Format as JSON: {"subject": "...", "body": "..."}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";

    if (channel === "email") {
      try {
        const parsed = JSON.parse(text);
        res.json({ subject: parsed.subject ?? "", body: parsed.body ?? text });
      } catch {
        res.json({ body: text });
      }
    } else {
      res.json({ message: text });
    }
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "AI generation failed" });
  }
});

/* ─── Admin: send single retargeting message ─────────────── */
router.post("/admin/courier-retargeting/send/:id", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const { message, subject } = req.body ?? {};

    const [item] = await db.select().from(courierRetargetingQueueTable).where(eq(courierRetargetingQueueTable.id, id)).limit(1);
    if (!item) { res.status(404).json({ error: "Retargeting item not found" }); return; }

    let success = false;
    let error = "";

    if (item.channel === "whatsapp" && item.customerPhone) {
      const [waSettings] = await db.select().from(whatsappSettingsTable).limit(1);
      if (!waSettings?.isActive) { res.status(400).json({ error: "WhatsApp is not active" }); return; }

      const msg = message ?? `Hi ${item.customerName ?? "there"}! Thank you for your recent order from KDF NUTS. We hope you enjoyed it! 🎉 Order again and get a special discount. Reply YES to reorder.`;
      success = await (await import("../lib/whatsapp.js")).sendWhatsAppMessage({ phone: item.customerPhone, message: msg }).catch(() => false);
      if (!success) error = "WhatsApp send failed";
    } else if (item.channel === "email" && item.customerEmail) {
      try {
        const [emailSettings] = await db.select().from(emailSettingsTable).limit(1);
        if (!emailSettings?.emailEnabled) { res.status(400).json({ error: "Email is not configured" }); return; }

        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          host: emailSettings.smtpHost, port: emailSettings.smtpPort,
          secure: emailSettings.smtpPort === 465,
          auth: { user: emailSettings.smtpUser, pass: emailSettings.smtpPass },
        });
        const emailBody = message ?? `Hi ${item.customerName ?? "there"}, thank you for your order! We'd love to have you shop with us again. Use code REORDER10 for 10% off your next purchase.`;
        await transporter.sendMail({
          from: emailSettings.smtpFrom, to: item.customerEmail,
          subject: subject ?? "We miss you! Special offer inside 🎉",
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px"><h2 style="color:#0D2B00">${subject ?? "A Special Offer For You"}</h2><p style="font-size:16px;color:#333">${emailBody.replace(/\n/g, "<br>")}</p><div style="text-align:center;margin-top:28px"><a href="#" style="background:#5FA800;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">Shop Now at KDF NUTS</a></div><p style="color:#999;font-size:12px;margin-top:24px">KDF NUTS · Pakistan's Premium Nuts Brand</p></div>`,
        });
        success = true;
      } catch (e: any) {
        error = e.message;
      }
    }

    await db.update(courierRetargetingQueueTable).set({
      status:  success ? "sent" : "failed",
      sentAt:  success ? new Date() : undefined,
      message: message ?? item.message,
      error:   error || undefined,
    }).where(eq(courierRetargetingQueueTable.id, id));

    res.json({ ok: success, error: error || null });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Send failed" });
  }
});

/* ─── Admin: bulk send all pending retargeting ─────────── */
router.post("/admin/courier-retargeting/send-all", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { message } = req.body ?? {};
    const pending = await db.select().from(courierRetargetingQueueTable)
      .where(eq(courierRetargetingQueueTable.status, "pending"))
      .limit(50);

    let sent = 0, failed = 0;
    for (const item of pending) {
      try {
        let success = false;
        const msg = message ?? `Hi ${item.customerName ?? "there"}! Thanks for shopping with KDF NUTS 🥜 Order again today and enjoy a special discount. Reply REORDER or visit our website.`;

        if (item.channel === "whatsapp" && item.customerPhone) {
          success = await (await import("../lib/whatsapp.js")).sendWhatsAppMessage({ phone: item.customerPhone, message: msg }).catch(() => false);
        } else if (item.channel === "email" && item.customerEmail) {
          const [emailSettings] = await db.select().from(emailSettingsTable).limit(1);
          if (emailSettings?.emailEnabled) {
            const nodemailer = await import("nodemailer");
            const t = nodemailer.createTransport({ host: emailSettings.smtpHost, port: emailSettings.smtpPort, secure: emailSettings.smtpPort === 465, auth: { user: emailSettings.smtpUser, pass: emailSettings.smtpPass } });
            await t.sendMail({ from: emailSettings.smtpFrom, to: item.customerEmail, subject: "We have an offer for you! 🎉", html: `<p>${msg}</p>` });
            success = true;
          }
        }

        await db.update(courierRetargetingQueueTable).set({
          status: success ? "sent" : "failed",
          sentAt: success ? new Date() : undefined,
          message: msg,
        }).where(eq(courierRetargetingQueueTable.id, item.id));

        if (success) sent++; else failed++;
        await new Promise(r => setTimeout(r, 400));
      } catch { failed++; }
    }

    res.json({ ok: true, sent, failed });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Bulk send failed" });
  }
});

/* ─── Helper: send courier status notification ─────────── */
async function sendCourierNotification(shipment: any, newStatus: string, req: any): Promise<void> {
  try {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, shipment.orderId)).limit(1);
    if (!order) return;

    const addr = (order.shippingAddress as any) ?? {};
    const phone = addr.phone ?? "";
    const email = addr.email ?? "";
    const customerName = addr.name ?? "Customer";
    const orderNumber = String(order.orderNumber ?? order.id);

    const statusMessages: Record<string, string> = {
      shipped:          `Your order #${orderNumber} has been shipped! 📦 Tracking: ${shipment.trackingId ?? "N/A"}`,
      in_transit:       `Your order #${orderNumber} is in transit 🚚 Tracking: ${shipment.trackingId ?? "N/A"}`,
      out_for_delivery: `Your order #${orderNumber} is out for delivery today! 🛵 Tracking: ${shipment.trackingId ?? "N/A"}`,
      delivered:        `Your order #${orderNumber} has been delivered! ✅ Thank you for shopping with us.`,
      failed:           `We had trouble delivering your order #${orderNumber}. Our team will contact you shortly.`,
      returned:         `Your order #${orderNumber} is being returned. Please contact us for assistance.`,
    };

    const notifyStatuses = ["shipped", "in_transit", "out_for_delivery", "delivered", "failed", "returned"];
    if (!notifyStatuses.includes(newStatus)) return;

    const [waSettings] = await db.select().from(whatsappSettingsTable).limit(1);
    const [emailSettings] = await db.select().from(emailSettingsTable).limit(1);

    if (waSettings?.isActive && phone) {
      const waOk = await sendOrderStatusUpdate({
        phone,
        orderNumber,
        status: newStatus,
        trackingId: shipment.trackingId ?? undefined,
      }).catch(() => false);

      await db.insert(courierNotificationLogsTable).values({
        shipmentId:    shipment.id,
        orderId:       shipment.orderId,
        trackingId:    shipment.trackingId,
        courierSlug:   shipment.courierSlug,
        shipmentStatus: newStatus,
        channel:       "whatsapp",
        phone,
        customerName,
        message:       statusMessages[newStatus] ?? newStatus,
        success:       waOk as boolean,
      });
    }

    if (emailSettings?.emailEnabled && email) {
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          host:   emailSettings.smtpHost,
          port:   emailSettings.smtpPort,
          secure: emailSettings.smtpPort === 465,
          auth:   { user: emailSettings.smtpUser, pass: emailSettings.smtpPass },
        });

        const msg = statusMessages[newStatus] ?? `Your order #${orderNumber} status: ${newStatus}`;
        await transporter.sendMail({
          from:    emailSettings.smtpFrom,
          to:      email,
          subject: `Order #${orderNumber} Update — ${newStatus.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <h2 style="color:#0D2B00">Hello ${customerName},</h2>
              <p style="font-size:16px;color:#333">${msg}</p>
              <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin-top:20px">
                <p style="margin:0;color:#666;font-size:14px"><strong>Order:</strong> #${orderNumber}</p>
                <p style="margin:4px 0 0;color:#666;font-size:14px"><strong>Tracking:</strong> ${shipment.trackingId ?? "N/A"}</p>
                <p style="margin:4px 0 0;color:#666;font-size:14px"><strong>Status:</strong> ${newStatus.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
              </div>
              <p style="color:#999;font-size:12px;margin-top:24px">KDF NUTS · Pakistan's Premium Nuts Brand</p>
            </div>`,
        });

        await db.insert(courierNotificationLogsTable).values({
          shipmentId:    shipment.id,
          orderId:       shipment.orderId,
          trackingId:    shipment.trackingId,
          courierSlug:   shipment.courierSlug,
          shipmentStatus: newStatus,
          channel:       "email",
          email,
          customerName,
          message:       msg,
          success:       true,
        });
      } catch (emailErr: any) {
        req.log?.warn?.({ err: emailErr }, "Courier email notification failed");
        await db.insert(courierNotificationLogsTable).values({
          shipmentId:    shipment.id,
          orderId:       shipment.orderId,
          trackingId:    shipment.trackingId,
          courierSlug:   shipment.courierSlug,
          shipmentStatus: newStatus,
          channel:       "email",
          email,
          customerName,
          message:       statusMessages[newStatus] ?? newStatus,
          success:       false,
          error:         emailErr.message,
        });
      }
    }
  } catch (err: any) {
    req.log?.warn?.({ err }, "sendCourierNotification failed");
  }
}

/* ─── Helpers ─────────────────────────────────────────── */
const TCS_SANDBOX_URL = "https://devconnect.tcscourier.com";
const TCS_PROD_URL = "https://ociconnect.tcscourier.com";

/* ── TCS ECOM token in-memory cache — 55-min TTL, auto-refreshes on next booking ── */
interface TcsEcomCacheEntry { token: string; expiresAt: number; }
const tcsEcomCache = new Map<string, TcsEcomCacheEntry>();

/* ── TCS Simple API (api.tcscourier.com) — single-step token cache ── */
const TCS_SIMPLE_URL = "https://api.tcscourier.com";
const tcsSimpleCache = new Map<string, TcsEcomCacheEntry>();

/* ── TCS Live Request/Response Log — last 100 calls, in-memory ── */
interface TcsLogEntry {
  id: number; ts: string;
  type: "auth_step2" | "booking" | "tracking" | "label" | "test_booking" | "test_tracking" | "test_label" | "diagnostics" | "auth_step1" | "clear_cache";
  url: string; method: string;
  reqBody: string; httpStatus: number | null;
  resBody: string; durationMs: number;
  success: boolean; error?: string; attempt?: number;
}
let tcsLogSeq = 0;
const tcsLiveLog: TcsLogEntry[] = [];
function pushTcsLog(e: Omit<TcsLogEntry, "id">) {
  tcsLiveLog.unshift({ ...e, id: ++tcsLogSeq });
  if (tcsLiveLog.length > 100) tcsLiveLog.splice(100);
}

/**
 * TCS Simple API single-step auth:
 *   POST https://api.tcscourier.com/auth  {username, password, accountNo}
 *   → response.accessToken
 * Token cached 50 min. Used for /bookShipment endpoint.
 */
async function getTcsSimpleToken(settings: Record<string, any>): Promise<string> {
  const username  = (settings.username  ?? "").trim();
  const password  = (settings.password  ?? "").trim();
  const accountNo = (settings.tcsaccount ?? "").trim();

  const cacheKey = `simple:${accountNo}:${username}`;
  const cached = tcsSimpleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    logger.info({ cacheKey }, "TCS Simple token — cache hit");
    return cached.token;
  }

  const authUrl = `${TCS_SIMPLE_URL}/auth`;
  logger.info({ authUrl, username, accountNo }, "TCS Simple token — calling auth endpoint");

  const resp = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, accountNo }),
    signal: AbortSignal.timeout(15000),
  });

  let data: Record<string, any> = {};
  try { data = await resp.json(); } catch { data = {}; }

  const token =
    data.accessToken ?? data.token ?? data.access_token ??
    data.result?.accessToken ?? data.data?.accessToken;

  if (!token) {
    const msg = data.message ?? data.statusMessage ?? data.error ?? `HTTP ${resp.status}`;
    throw new Error(`TCS Simple auth failed: ${msg}. Check Username, Password and Account No.`);
  }

  tcsSimpleCache.set(cacheKey, { token, expiresAt: Date.now() + 50 * 60 * 1000 }); // 50-min TTL
  logger.info({ accountNo, username }, "TCS Simple token — auth success, cached 50 min");
  return token;
}
/* ─── Courier tracking URLs ──────────────────────────── */
function getTrackingUrl(slug: string, trackingId: string): string {
  const id = encodeURIComponent(trackingId);
  const urls: Record<string, string> = {
    tcs:      `https://ociconnect.tcscourier.com/tracking/index.html?cg=${id}`,
    postex:   `https://postex.pk/tracking/${id}`,
    leopards: `https://leopardscourier.com/leopards-tracking/?title=leopards&tracking_number=${id}`,
    trax:     `https://traxpk.com/tracking/${id}`,
  };
  return urls[slug] ?? `https://track.kdfnuts.com/?id=${id}&courier=${slug}`;
}

/**
 * TCS Static Bearer Token — the ONLY auth mechanism.
 *
 * HOW IT WORKS:
 *   Source: settings.bearerToken (pasted in Admin UI) OR TCS_STATIC_BEARER_TOKEN env var.
 *   Every TCS API call sends: Authorization: Bearer <token>
 *   NO ECOM token, NO Step 2, NO username/password runtime auth.
 *
 * IMPORTANT: This is the ENVO Portal Bearer Token (JWT with clientid).
 *            It goes in the Authorization header ONLY — never in the request body.
 */
function getTcsStaticBearer(settings: Record<string, any>): string {
  const bearer =
    (settings.bearerToken ?? "").trim() ||
    (process.env["TCS_STATIC_BEARER_TOKEN"] ?? "").trim();
  if (!bearer) {
    throw new Error(
      "TCS not configured: ENVO Portal Bearer Token is required. " +
      "Add it in Courier Settings → TCS → Advanced Settings → ENVO Portal Bearer Token field."
    );
  }
  return bearer;
}

/* ── JWT expiry checker (no external lib needed) ── */
function jwtExpiresAt(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch { return null; }
}

function jwtIsValid(token: string): boolean {
  const exp = jwtExpiresAt(token);
  if (!exp) return true;
  return (exp - Date.now()) > 5 * 60 * 1000;
}

function generateTrackingId(slug: string): string {
  const prefix: Record<string, string> = {
    tcs: "TCS", leopards: "LP", postex: "PX", trax: "TX",
  };
  const p = prefix[slug] ?? "KDF";
  return `${p}${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
}

function mapShipmentStatusToOrder(shipmentStatus: string): any {
  const map: Record<string, string> = {
    pending: "pending",
    processing: "processing",
    shipped: "shipped",
    in_transit: "shipped",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    failed: "processing",
    returned: "cancelled",
  };
  return map[shipmentStatus] ?? "processing";
}

async function getTcsBearerToken(clientId: string, clientSecret: string, sandbox?: boolean): Promise<{ bearerToken: string }> {
  const baseUrl = sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;
  const url = `${baseUrl}/auth/api/auth`;
  const body = JSON.stringify({ clientid: clientId, clientsecret: clientSecret });

  /* Try POST first (more widely supported), then GET with body */
  for (const method of ["POST", "GET"] as const) {
    let resp: Response;
    try {
      resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(12000),
      });
    } catch { continue; }

    let data: Record<string, any> = {};
    try { data = await resp.json(); } catch { continue; }

    /* Official docs: response is { result: { accessToken, expiry }, status, code } */
    const token =
      data.result?.accessToken ?? data.result?.accesstoken ??
      data.accessToken ?? data.accesstoken ??
      data.bearerToken ?? data.token;

    if (resp.ok && token) return { bearerToken: token };
    if (!resp.ok) {
      const msg = data.message ?? data.error ?? `HTTP ${resp.status}`;
      throw new Error(`TCS Authorization (Step 1) failed [${resp.status}]: ${msg}`);
    }
  }
  throw new Error("TCS Authorization API — no token returned. Check clientId and clientSecret.");
}


/**
 * TCS Step-2: Generate ECOM Access Token (goes in booking body as `accesstoken`).
 *
 * Priority:
 *   1. settings.accessToken (Direct ECOM Access Token — manual, bypasses Step 2)
 *   2. In-memory cache (55-min TTL)
 *   3. POST /ecom/api/authentication/token  with bearer + username + password
 *
 * Throws a descriptive error if neither manual token nor credentials are available.
 */
async function getTcsEcomToken(settings: Record<string, any>, bearer: string, baseUrl: string): Promise<string> {
  /* Priority 1: Manual Direct ECOM Access Token pasted by admin */
  const manual = (settings.accessToken ?? "").trim();
  if (manual) {
    logger.info({ src: "manual" }, "TCS ECOM token — using Direct Access Token from settings");
    return manual;
  }

  const username = (settings.username ?? "").trim();
  const password = (settings.password ?? "").trim();

  if (!username || !password) {
    throw new Error(
      "TCS: ECOM Access Token required. Either (a) paste a Direct ECOM Access Token in " +
      "Courier → TCS → Advanced Settings → \"Direct ECOM Access Token\" field, OR " +
      "(b) configure your TCS Username + Password so it can be auto-generated."
    );
  }

  /* Priority 2: In-memory cache (keyed by account + username)
   * Skip cache when tcsDebugNoCache=true (admin enables in Settings for fresh-token debugging) */
  const cacheKey = `${settings.tcsaccount ?? ""}:${username}`;
  if (!settings.tcsDebugNoCache) {
    const cached = tcsEcomCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      logger.info({ cacheKey, expiresInMin: Math.round((cached.expiresAt - Date.now()) / 60000) }, "TCS ECOM token — cache hit");
      return cached.token;
    }
  } else {
    logger.info({ cacheKey }, "TCS ECOM token — cache BYPASSED (debug mode)");
    tcsEcomCache.delete(cacheKey); /* also evict stale entry so next normal call is fresh */
  }

  /* Priority 3: Step-2 — GET /ecom/api/authentication/token
   * CONFIRMED by live curl tests on ociconnect.tcscourier.com (May 2026):
   *   GET  /token?username=X&password=Y  → 401 valid bearer needed (query params WORK)
   *   GET  /token  + JSON body           → 401 valid bearer needed (body ALSO works)
   *   POST /token                        → 405 (Method Not Allowed)
   *   GET  /generateToken                → 404 (endpoint does not exist)
   * Strategy: try query-params first (no body = no Content-Length issue), then body.
   * Response: { message: "success", accesstoken: "...", expiry: "..." }            */
  const qpUrl = `${baseUrl}/ecom/api/authentication/token?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const STEP2_ATTEMPTS: Array<{ url: string; method: "GET" | "POST"; body: Record<string, any> | null }> = [
    /* ✅ Primary: GET + query params (no body = no Content-Length confusion) */
    { url: qpUrl,                                             method: "GET", body: null },
    /* Fallback: GET + lowercase JSON body */
    { url: `${baseUrl}/ecom/api/authentication/token`,        method: "GET", body: { username, password } },
    /* Fallback: GET + PascalCase JSON body */
    { url: `${baseUrl}/ecom/api/authentication/token`,        method: "GET", body: { Username: username, Password: password } },
  ];

  let lastError = "";
  let lastStatus = 0;
  let lastRaw = "";

  for (let i = 0; i < STEP2_ATTEMPTS.length; i++) {
    const { url: attemptUrl, method: attemptMethod, body: attemptBody } = STEP2_ATTEMPTS[i];
    const t0 = Date.now();
    logger.info({ url: attemptUrl, method: attemptMethod, attempt: i + 1, username, tcsaccount: settings.tcsaccount }, "TCS ECOM token — Step-2 attempt");

    let respStatus = 0;
    let data: Record<string, any> = {};
    let rawText = "";
    try {
      /* httpJsonRequest uses node:https — no GET+body restriction unlike native fetch */
      const result = await httpJsonRequest(attemptUrl, attemptMethod, { "Authorization": `Bearer ${bearer}` }, attemptBody, 12000);
      respStatus = result.status;
      rawText = result.text;
      data = result.data;
    } catch (netErr: any) {
      const durationMs = Date.now() - t0;
      pushTcsLog({ ts: new Date().toISOString(), type: "auth_step2", url: attemptUrl, method: attemptMethod, reqBody: JSON.stringify({ ...attemptBody, password: "●●●" }), httpStatus: null, resBody: netErr.message, durationMs, success: false, error: netErr.message, attempt: i + 1 });
      lastError = `Network error: ${netErr.message}`;
      continue;
    }

    const durationMs = Date.now() - t0;
    lastStatus = respStatus;
    lastRaw = rawText.slice(0, 400);

    /* 405 / 404 — try next body-field variant */
    if (respStatus === 405 || respStatus === 404) {
      pushTcsLog({ ts: new Date().toISOString(), type: "auth_step2", url: attemptUrl, method: attemptMethod, reqBody: JSON.stringify({ ...attemptBody, password: "●●●" }), httpStatus: respStatus, resBody: rawText.slice(0, 200), durationMs, success: false, error: `HTTP ${respStatus} — trying next variant`, attempt: i + 1 });
      logger.warn({ url: attemptUrl, method: attemptMethod, status: respStatus, attempt: i + 1 }, "TCS Step-2 — trying next variant");
      lastError = `HTTP ${respStatus} on ${attemptMethod} ${attemptUrl}`;
      continue;
    }

    /* 401 — endpoint reached but bearer/credentials rejected */
    if (respStatus === 401 || respStatus === 403) {
      const apiMsg = data.message ?? data.statusMessage ?? data.error ?? "";
      pushTcsLog({ ts: new Date().toISOString(), type: "auth_step2", url: attemptUrl, method: attemptMethod, reqBody: JSON.stringify({ ...attemptBody, password: "●●●" }), httpStatus: respStatus, resBody: rawText.slice(0, 400), durationMs, success: false, error: `HTTP ${respStatus} — bearer/credentials rejected`, attempt: i + 1 });
      logger.warn({ url: attemptUrl, method: attemptMethod, status: respStatus, attempt: i + 1, apiMsg }, "TCS Step-2 — credentials rejected");
      lastError =
        `HTTP ${respStatus} — TCS rejected your credentials. ` +
        `Two possible causes:\n` +
        `  1. ENVO Bearer Token (TCS_STATIC_BEARER_TOKEN env var) is EXPIRED — get a fresh one from TCS ENVO Portal.\n` +
        `  2. TCS Username/Password is wrong — verify in Couriers → TCS → Advanced Settings.\n` +
        `TCS response: ${apiMsg || rawText.slice(0, 100)}`;
      lastStatus = respStatus;
      lastRaw = rawText.slice(0, 300);
      break; /* 401 is definitive — no point trying PascalCase variant with same bad credentials */
    }

    const token =
      data.accessToken ?? data.accesstoken ??
      data.token ??
      data.result?.accessToken ?? data.result?.accesstoken ??
      data.data?.accessToken ?? data.data?.token;

    if (token) {
      pushTcsLog({ ts: new Date().toISOString(), type: "auth_step2", url: attemptUrl, method: attemptMethod, reqBody: JSON.stringify({ ...attemptBody, password: "●●●" }), httpStatus: respStatus, resBody: rawText.slice(0, 400), durationMs, success: true, attempt: i + 1 });
      /* Official response uses lowercase "accesstoken" and "expiry" (string) */
      const expiry = data.expiry ? new Date(data.expiry).getTime() - Date.now() : 55 * 60 * 1000;
      const ttlMs = typeof data.expiresIn === "number"
        ? Math.min(data.expiresIn * 1000, 55 * 60 * 1000)
        : Math.min(Math.max(expiry, 5 * 60 * 1000), 55 * 60 * 1000);
      tcsEcomCache.set(cacheKey, { token, expiresAt: Date.now() + ttlMs });
      logger.info({ tcsaccount: settings.tcsaccount, username, attempt: i + 1, method: attemptMethod, url: attemptUrl, ttlMin: Math.round(ttlMs / 60000) }, "TCS ECOM token — Step-2 success, cached");
      return token;
    }

    /* Got 2xx/3xx response but no token field — unexpected format */
    const msg = data.message ?? data.statusMessage ?? data.error ?? `HTTP ${respStatus} — no token in response`;
    pushTcsLog({ ts: new Date().toISOString(), type: "auth_step2", url: attemptUrl, method: attemptMethod, reqBody: JSON.stringify({ ...attemptBody, password: "●●●" }), httpStatus: respStatus, resBody: rawText.slice(0, 400), durationMs, success: false, error: msg, attempt: i + 1 });
    lastError = `${msg} — Raw: ${rawText.slice(0, 150)}`;
    lastStatus = respStatus;
    lastRaw = rawText.slice(0, 300);
    continue; /* try PascalCase variant */
  }

  /* Build a clear, actionable error message */
  const is401 = lastStatus === 401 || lastStatus === 403;
  const hint = is401
    ? "ACTION: (1) Go to TCS ENVO Portal → re-copy your Bearer Token → update TCS_STATIC_BEARER_TOKEN env var. OR (2) Paste a fresh Direct ECOM Access Token in Couriers → TCS settings."
    : `Verify TCS Username/Password and ENVO Bearer Token, or paste a Direct ECOM Access Token to bypass Step-2.`;

  throw new Error(
    `TCS ECOM token (Step-2) failed at GET /ecom/api/authentication/token:\n${lastError}\n\n${hint}`
  );
}

/**
 * TCS weight formatter — returns a STRING decimal e.g. "0.50", "1.00", "1.25".
 * TCS API rejects JS integers (1 → JSON "1") but accepts string decimals ("1.00").
 * Min 0.5 kg; NaN/zero/negative → fallback "0.50".
 */
function tcsWeight(raw: any): string {
  const n = Number(raw);
  const safe = (isNaN(n) || n <= 0) ? 0.5 : n;
  /* TCS requires a string decimal: "0.50", "1.00", etc. — NOT a JS integer */
  return Math.max(0.5, safe).toFixed(2);
}

function formatTcsShipmentDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function mapTcsStatusToInternal(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("delivered") || s.includes("ok")) return "delivered";
  if (s.includes("out for delivery") || s.includes("ofd")) return "out_for_delivery";
  if (s.includes("return") || s.includes("ro")) return "returned";
  if (s.includes("transit") || s.includes("arrived") || s.includes("in transit")) return "in_transit";
  if (s.includes("booked") || s.includes("process") || s.includes("pickup")) return "processing";
  if (s.includes("ship") || s.includes("dispatch")) return "shipped";
  return "in_transit";
}

async function callCourierApi(courier: any, order: any, service?: string): Promise<{ trackingId: string; trackingUrl: string; rawResponse: Record<string, any> }> {
  const address = order.shippingAddress ?? {};

  if (courier.slug === "tcs") {
    const settings = (courier.settings ?? {}) as Record<string, any>;
    const bearer = getTcsStaticBearer(settings);
    const baseUrl = settings.sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;
    const codAmount = order.paymentMethod === "cod" ? Number(order.total) : 0;
    const items: any[] = Array.isArray(order.items) ? order.items : [];

    /* ── API Variant: "simple" vs "ecom" ────────────────────────────────────
       simple → POST https://api.tcscourier.com/auth  + POST /bookShipment
       ecom   → 2-step ociconnect flow (default, per official guide)            */
    const apiVariant = (settings.tcsApiVariant ?? "ecom").toLowerCase();

    if (apiVariant === "simple") {
      /* ── Simple API (api.tcscourier.com) single-step flow ── */
      const simpleToken = await getTcsSimpleToken(settings);
      const simplePayload: Record<string, any> = {
        orderNo:            String(order.orderNumber ?? order.id),
        consigneeName:      (address.name ?? address.firstName ?? "Customer").trim().slice(0, 100),
        consigneePhone:     (address.phone ?? "").replace(/\D/g, "").slice(-11),
        consigneeAddress:   [address.address1 ?? address.address, address.address2].filter(Boolean).join(", ").slice(0, 200) || address.address || "",
        destinationCity:    address.city ?? "",
        codAmount:          codAmount,
        weight:             tcsWeight(order.weight ?? settings.defaultWeight), // string decimal e.g. "0.50"
        pieces:             parseInt(String(order.pieces ?? 1), 10),
        serviceType:        service ?? settings.serviceType ?? "OVERNIGHT",
        remarks:            (order.specialInstructions || settings.defaultRemarks || order.notes || "KDF Nuts Order").slice(0, 200),
      };

      logger.info({ url: `${TCS_SIMPLE_URL}/bookShipment`, simplePayload }, "TCS Simple booking — sending");

      const simpleResp = await fetch(`${TCS_SIMPLE_URL}/bookShipment`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${simpleToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(simplePayload),
        signal: AbortSignal.timeout(15000),
      });

      const simpleText = await simpleResp.text();
      let simpleData: Record<string, any> = {};
      try { simpleData = JSON.parse(simpleText); } catch { simpleData = { raw: simpleText }; }

      logger.info({ status: simpleResp.status, simpleData }, "TCS Simple booking — response");

      const simpleTracking =
        simpleData.trackingNumber ?? simpleData.consignmentNumber ??
        simpleData.consignmentNo  ?? simpleData.bookingNo ??
        simpleData.data?.trackingNumber ?? simpleData.data?.consignmentNo;

      if (!simpleResp.ok || (!simpleTracking && simpleData.message?.toLowerCase().includes("fail"))) {
        const errMsg = simpleData.message ?? `TCS Simple booking failed (HTTP ${simpleResp.status}): ${simpleText.slice(0, 300)}`;
        throw new Error(`TCS: ${errMsg}`);
      }

      const tid = simpleTracking ?? generateTrackingId("tcs");
      return { trackingId: tid, trackingUrl: getTrackingUrl("tcs", tid), rawResponse: simpleData };
    }

    /* ── Step 2: Get ECOM Access Token ─────────────────────────────────────
       TCS 2-Token architecture (official guide):
         • Bearer Token (Step 1)  → used ONLY to generate ECOM token via Step-2
         • ECOM Access Token (Step 2) → goes in Authorization: Bearer header for
           ALL booking/tracking/label calls.  NOT in request body.
       getTcsEcomToken(): manual override → in-memory cache → Step-2 API call.    */
    const ecomToken = await getTcsEcomToken(settings, bearer, baseUrl);

    /* ── Duplicate booking protection ─────────────────────────────────────
     * If TCS shipment already exists for this order with a real CN, skip.     */
    if (order.id) {
      const existing = await db.select().from(shipmentsTable)
        .where(eq(shipmentsTable.orderId, order.id))
        .limit(1);
      const alreadyBooked = existing.find(
        (s: any) => s.courierSlug === "tcs" &&
          s.trackingId &&
          !s.trackingId.startsWith("TCS") && /* skip our own generated fake IDs */
          s.trackingId.length > 5
      );
      /* Also accept our generated IDs only if courier confirms it (trackingId from TCS API = real) */
      const hasRealCn = existing.find(
        (s: any) => s.courierSlug === "tcs" && s.trackingId && s.rawApiResponse
      );
      if (hasRealCn && settings.preventDuplicateBookings !== false) {
        logger.info({ orderId: order.id, trackingId: hasRealCn.trackingId }, "TCS booking — duplicate skip (already booked)");
        return {
          trackingId: hasRealCn.trackingId,
          trackingUrl: getTrackingUrl("tcs", hasRealCn.trackingId),
          rawResponse: { _skipped: true, reason: "Already booked", existingCN: hasRealCn.trackingId },
        };
      }
    }

    /* ── Pre-flight payload validation ────────────────────────────────────
     * Validate required fields BEFORE making any API call.                */
    const validationErrors: string[] = [];
    if (!settings.tcsaccount?.trim())
      validationErrors.push("TCS Account Number is empty — set it in Couriers → TCS Settings → TCS Account Number");
    if (settings.tcsaccount?.trim() === settings.username?.trim())
      logger.warn({ tcsaccount: settings.tcsaccount, username: settings.username }, "TCS: Account Number equals Username — they may be different fields. Proceeding anyway.");
    const rawPhone = (address.phone ?? "").replace(/\D/g, "");
    if (rawPhone.length < 10)
      validationErrors.push(`Consignee mobile invalid: "${address.phone ?? "(empty)"}". Need 10–11 digit Pakistani number.`);
    if (!address.city?.trim())
      validationErrors.push("Consignee city is empty");
    const rawAddr = [address.address1 ?? address.address, address.address2].filter(Boolean).join(", ").trim();
    if (!rawAddr)
      validationErrors.push("Consignee address is empty");
    const rawWeight = Number(order.weight ?? settings.defaultWeight ?? 0);
    if (isNaN(rawWeight) || rawWeight <= 0)
      validationErrors.push(`Weight invalid: "${order.weight ?? settings.defaultWeight}". Must be > 0 kg.`);
    if (validationErrors.length > 0) {
      throw new Error(`TCS: Pre-booking validation failed:\n• ${validationErrors.join("\n• ")}`);
    }

    /* ── Official TCS ECOM nested booking payload ─────────────────────────
     * Per official guide: /ecom/api/booking/create
     *   Authorization header = ENVO Bearer Token (Step-1)
     *   Body root: accesstoken (ECOM token, Step-2) + shipperinfo + consigneeinfo + shipmentinfo
     * Reference: TCS COD API Node.js Integration Guide v1.0                        */
    const weightKg  = parseFloat(tcsWeight(order.weight ?? settings.defaultWeight));
    const pieces    = parseInt(String(order.pieces ?? 1), 10);
    const orderRef  = String(order.orderNumber ?? order.id);

    /* Split consignee full name into firstname / middlename / lastname */
    const fullName  = (address.name ?? address.firstName ?? "Customer").trim();
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] ?? fullName;
    const lastName  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
    const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : ".";

    const consigneeAddr = [address.address1 ?? address.address, address.address2]
      .filter(Boolean).join(", ").slice(0, 120) || address.address || "";
    const consigneePhone = (address.phone ?? "").replace(/\D/g, "").slice(-11);
    const serviceCode = (service ?? settings.serviceCode ?? "O").slice(0, 6);
    const costCenter  = (settings.costcentercode ?? "").toString().slice(0, 20);
    const itemDesc = items.length > 0
      ? items.map((i: any) => i.name).join(", ").slice(0, 100)
      : "KDF Nuts Products";

    /* shipmentdate in TCS format: DD/MM/YYYY HH:MM:SS */
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const shipmentDate = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const shipperCityCode = (settings.shipperCityCode || "LHE").toUpperCase().slice(0, 10);
    const shipperCityName = (settings.shipperCity || "Lahore").slice(0, 50);
    const shipperName     = (settings.shipperName || "KDF Nuts").trim().slice(0, 50);
    const shipperAddr     = (settings.shipperAddress || "").slice(0, 120);
    const shipperPhone    = (settings.shipperPhone || "").replace(/\D/g, "").slice(-11);

    const bookingPayload: Record<string, any> = {
      accesstoken:   ecomToken,    /* ECOM token goes IN BODY (per official TCS PHP guide) */
      consignmentno: "",           /* Empty string at root — per official PHP guide */
      shipperinfo: {
        tcsaccount:  settings.tcsaccount || "",
        shippername: shipperName,
        address1:    shipperAddr,
        address2:    "",
        address3:    "",
        zip:         "",
        countrycode: "PK",
        countryname: "Pakistan",
        citycode:    shipperCityCode,
        cityname:    shipperCityName,
        mobile:      shipperPhone,
      },
      consigneeinfo: {
        consigneecode: "",
        firstname:   firstName.slice(0, 50),
        middlename:  middleName.slice(0, 50),
        lastname:    lastName.slice(0, 50),
        address1:    consigneeAddr,
        address2:    (address.address2 ?? "").slice(0, 120),
        address3:    "",
        zip:         (address.zip ?? address.postal_code ?? "").slice(0, 20),
        countrycode: "PK",
        countryname: "Pakistan",
        citycode:    "",           /* TCS cityname is sufficient; citycode can be blank */
        cityname:    (address.city ?? "").slice(0, 50),
        email:       (address.email ?? "").slice(0, 100),
        areacode:    "",
        areaname:    "",
        blockcode:   "",
        blockname:   "",
        lat:         "",
        lng:         "",
        landmark:    "",
        mobile:      consigneePhone,
      },
      vendorinfo: {               /* Required per official PHP guide */
        name:     shipperName,
        address1: shipperAddr,
        address2: "",
        address3: "",
        citycode: shipperCityCode,
        cityname: shipperCityName,
        mobile:   shipperPhone,
      },
      shipmentinfo: {
        costcentercode: costCenter,
        referenceno:    orderRef.slice(0, 50),
        contentdesc:    itemDesc,
        servicecode:    serviceCode,
        parametertype:  "Standard",   /* Required per official PHP guide */
        shipmentdate:   shipmentDate, /* DD/MM/YYYY HH:MM:SS format */
        shippingtype:   "",
        currency:       "PKR",
        codamount:      codAmount,
        declaredvalue:  null,
        insuredvalue:   null,
        transactiontype: "",
        dsflag:         "",
        carrierslug:    "",
        weightinkg:     weightKg,
        pieces:         pieces,
        fragile:        !!(order.fragile ?? settings.fragile),
        remarks:        (order.specialInstructions || settings.defaultRemarks || order.notes || "KDF Nuts Order").slice(0, 200),
        skus: [{
          description:   itemDesc,
          quantity:      pieces,
          weight:        weightKg,
          uom:           "KG",         /* Required per official PHP guide */
          unitprice:     codAmount > 0 ? codAmount : 1,
          declaredvalue: null,
          insuredvalue:  null,
        }],
      },
    };

    logger.info({
      weightKg, pieces, codAmount, orderRef, serviceCode, costCenter,
      tcsaccount:   settings.tcsaccount,
      consigneeCity: address.city,
      shipperCity:   settings.shipperCity,
      ecomTokSrc:   settings.accessToken?.trim() ? "Direct (manual)" : (tcsEcomCache.has(`${settings.tcsaccount ?? ""}:${(settings.username ?? "").trim()}`) ? "cache" : "Step-2 fresh"),
      sandbox:      !!settings.sandbox,
    }, "TCS ECOM booking — nested payload ready");

    /* Per official TCS PHP guide: booking endpoint does NOT use Authorization header.
     * The accesstoken in the request body IS the authentication for booking.
     * Only Content-Type + Accept are sent — matching the official PHP curl example. */
    const bookHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept":       "application/json",
    };

    /* ── Official: POST /ecom/api/booking/create
       Fallback: /ecom/api/shipment/book (some older TCS instances)          */
    const bookUrls = [
      `${baseUrl}/ecom/api/booking/create`,   /* ✅ Official guide endpoint */
      `${baseUrl}/ecom/api/shipment/book`,    /* Fallback */
    ];

    let bookData: Record<string, any> = {};
    let bookText = "";
    let lastStatus = 0;
    let usedUrl = bookUrls[0];

    for (const bookUrl of bookUrls) {
      usedUrl = bookUrl;
      logger.info({ bookUrl }, "TCS booking — trying URL");
      const resp = await fetch(bookUrl, {
        method: "POST",
        headers: bookHeaders,
        body: JSON.stringify(bookingPayload),
        signal: AbortSignal.timeout(18000),
      });
      lastStatus = resp.status;
      bookText = await resp.text();
      try { bookData = JSON.parse(bookText); } catch { bookData = { raw: bookText }; }

      logger.info({ bookUrl, status: lastStatus, body: bookText.slice(0, 300) }, "TCS booking — URL response");

      /* If 404, endpoint doesn't exist — try next URL */
      if (resp.status === 404) {
        logger.warn({ bookUrl }, "TCS booking — 404, trying fallback URL");
        continue;
      }
      /* Any other status — stop here, this URL exists */
      break;
    }

    /* ── Extract REAL consignment number from TCS response ────────────────
     * We ONLY accept bookings where TCS returns an actual consignment number.
     * No fake/generated tracking IDs are allowed — if TCS doesn't give a CN,
     * the booking is treated as failed regardless of HTTP status.              */
    const realCn =
      bookData.consignmentNo ??
      bookData.consignment_no ??
      bookData.consignmentNumber ??
      bookData.ConsignmentNo ??
      bookData.data?.consignmentNo ??
      bookData.data?.bookingNo ??
      bookData.result?.consignmentNo;

    /* Build a structured error message from TCS errorList / message */
    function buildTcsErrorMsg(): string {
      const errorList: any[] = Array.isArray(bookData.errorList) ? bookData.errorList : [];
      const legacyError: any[] = Array.isArray(bookData.error) ? bookData.error : [];
      const acct = settings.tcsaccount ? ` [account: ${settings.tcsaccount}]` : " [account: EMPTY — set in Couriers → TCS Settings]";
      const urlHint = ` [endpoint: ${usedUrl.split("/").slice(-3).join("/")}]`;
      const tokenHint = settings.accessToken?.trim()
        ? " | ACTION REQUIRED: Clear 'Direct ECOM Access Token' in Advanced Settings — stale manual token detected!"
        : "";
      const acctHint = settings.tcsaccount?.trim() === settings.username?.trim()
        ? ` | NOTE: Account Number (${settings.tcsaccount}) is the same as Username — they are usually different fields. If booking fails, update Account Number with the real account ID from your TCS contract.`
        : "";
      const raw = errorList.length > 0
        ? errorList.map((e: any) => `${e.key ?? ""}: ${e.errormessage ?? e.message ?? JSON.stringify(e)}`).join(" | ")
        : legacyError.length > 0
          ? Object.values(legacyError[0]).join(", ")
          : bookData.message ?? bookData.statusMessage ?? `HTTP ${lastStatus}: ${bookText.slice(0, 200)}`;
      return `TCS: ${raw}${acct}${urlHint}${tokenHint}${acctHint}`;
    }

    /* Succeed ONLY if we have a real CN from TCS */
    if (!realCn) {
      /* HTTP 200 but no CN = TCS accepted request but returned no tracking number */
      if (lastStatus >= 200 && lastStatus < 300) {
        const msg = bookData.message ?? bookData.statusMessage ?? "No consignment number in response";
        if (msg.toLowerCase().includes("success") || bookData.status === true) {
          /* Some TCS responses return success with CN in a different shape */
          logger.warn({ bookData }, "TCS booking — HTTP 200 SUCCESS but no CN found in response");
        }
      }
      throw new Error(buildTcsErrorMsg());
    }

    logger.info({ realCn, usedUrl, account: settings.tcsaccount }, "TCS booking — SUCCESS, real consignment number received");
    pushTcsLog({ ts: new Date().toISOString(), type: "booking", url: usedUrl, method: "POST", reqBody: "see log", httpStatus: lastStatus, resBody: bookText.slice(0, 400), durationMs: 0, success: true });

    return { trackingId: realCn, trackingUrl: getTrackingUrl("tcs", realCn), rawResponse: { ...bookData, _usedUrl: usedUrl } };
  }

  /* ── Leopards ── */
  if (courier.slug === "leopards") {
    const settings = (courier.settings ?? {}) as Record<string, any>;
    if (!courier.apiKey || !courier.apiSecret) throw new Error("Leopards: API Key and API Password are required in settings");

    const svc = service ?? settings.serviceCode ?? "overnight";
    const serviceTypeIdMap: Record<string, number> = { overnight: 1, same_day: 2, economy: 3, overland: 3 };
    const shipmentTypeId = serviceTypeIdMap[svc] ?? 1;
    const weight = order.weight ?? settings.defaultWeight ?? 0.5;
    const pieces = order.pieces ?? 1;
    const codAmount = order.paymentMethod === "cod" ? Number(order.total) : 0;

    const payload: Record<string, any> = {
      api_key: courier.apiKey,
      api_password: courier.apiSecret,
      consignee_name: address.name ?? "",
      consignee_phone: address.phone ?? "",
      consignee_address: address.address ?? "",
      consignee_city: address.city ?? "",
      order_id: String(order.orderNumber ?? order.id),
      special_instructions: order.specialInstructions ?? order.notes ?? "",
      collect_amount: codAmount,
      weights: String(weight),
      number_of_pieces: pieces,
      shipment_type_id: shipmentTypeId,
      enable_ior: 0,
      packet_weight: String(weight),
    };

    const resp = await fetch(`${courier.apiEndpoint}/storeShipment/format/json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const raw = await resp.json() as Record<string, any>;
    if (!resp.ok || raw.status === 0 || raw.error === 1) {
      throw new Error(`Leopards booking failed: ${raw.status_message ?? raw.error_message ?? raw.message ?? JSON.stringify(raw).slice(0, 200)}`);
    }
    const trackId = raw.track_number ?? raw.cn_number ?? raw.CN ?? raw.packet_cn ?? generateTrackingId("leopards");
    const tId = String(trackId);
    return { trackingId: tId, trackingUrl: getTrackingUrl("leopards", tId), rawResponse: raw };
  }

  /* ── PostEx ── */
  if (courier.slug === "postex") {
    const settings = (courier.settings ?? {}) as Record<string, any>;
    if (!courier.apiKey) throw new Error("PostEx: API Token is required in settings");

    /* Valid PostEx orderType values per official API docs.
       The `service` param is courier-generic and may carry TCS codes ("O","P","C") —
       those are NOT valid PostEx order types. Always validate and default to "Normal". */
    const VALID_POSTEX_ORDER_TYPES = ["Normal", "Reversed", "Replacement"];
    const rawOrderType = order.postexOrderType ?? settings.orderType ?? service ?? "Normal";
    const orderType = VALID_POSTEX_ORDER_TYPES.includes(rawOrderType) ? rawOrderType : "Normal";
    if (rawOrderType !== orderType) {
      logger.warn({ rawOrderType, resolvedTo: orderType }, "PostEx: invalid orderType — clamped to Normal");
    }
    const items: any[] = Array.isArray(order.items) ? order.items : [];
    const isCod = order.paymentMethod === "cod";

    /* invoicePayment: if markPaidAsZero and NOT cod, send 0; else use invoiceAmount or order total */
    let invoicePayment: number;
    if (!isCod && settings.markPaidAsZero !== false) {
      invoicePayment = 0;
    } else {
      invoicePayment = Number(order.invoiceAmount ?? order.total ?? 0);
    }

    /* pieces: if autoCalculatePieces, count from items array; else use order.pieces or 1 */
    const pieceCount = settings.autoCalculatePieces && items.length > 0
      ? items.length
      : (Number(order.pieces) || 1);

    /* transactionNotes: use addOrderRemarks + shipperRemarks + order notes */
    const defaultRemarks = settings.shipperRemarks ?? "call before delivery";
    const orderNotes = (order.notes ?? order.specialInstructions ?? "").trim();
    const transactionNotes = settings.addOrderRemarks && orderNotes
      ? `${defaultRemarks} | ${orderNotes}`
      : defaultRemarks;

    /* orderDetail: based on labelPrintOption setting */
    const labelPrintOption = settings.labelPrintOption ?? "Print Product Name";
    let orderDetail: string;
    if (labelPrintOption === "Print Order ID") {
      orderDetail = String(order.orderNumber ?? order.id);
    } else if (labelPrintOption === "Print Both" && items.length > 0) {
      orderDetail = `#${order.orderNumber ?? order.id} - ${items.slice(0, 3).map((i: any) => i.name).join(", ")}`;
    } else {
      orderDetail = items.length > 0
        ? items.map((i: any) => `${i.name} x${i.qty ?? 1}`).join(", ")
        : (order.contentDesc ?? String(order.orderNumber ?? order.id));
    }

    const payload: Record<string, any> = {
      orderRefNumber: String(order.orderNumber ?? order.id),
      customerName: address.name ?? "",
      customerPhone: address.phone ?? "",
      deliveryAddress: address.address ?? "",
      cityName: address.city ?? "",
      invoicePayment: Number(invoicePayment),   /* docs: integer/number — NOT string */
      invoiceDivision: 1,
      items: pieceCount,
      orderType,
      transactionNotes,
      orderDetail,
    };
    /* PostEx addressCode is a short string like "001", "002" — NOT a number.
       Only trust settings.pickupAddressCode if it looks like a real code (≤10 chars, no spaces).
       Otherwise auto-fetch the first address from PostEx merchant address list. */
    const storedCode = String(settings.pickupAddressCode ?? "").trim();
    const isValidCode = storedCode.length > 0 && storedCode.length <= 10 && !/\s/.test(storedCode);

    if (isValidCode) {
      payload.pickupAddressCode = storedCode;
    } else {
      /* Code not configured or looks like an address text — auto-fetch */
      try {
        const addrResp = await fetch(`${courier.apiEndpoint}/v1/get-merchant-address`, {
          headers: { token: courier.apiKey },
          signal: AbortSignal.timeout(8000),
        });
        const addrRaw = await addrResp.json() as Record<string, any>;
        const distList = addrRaw?.dist;
        const firstAddr = Array.isArray(distList) ? distList[0] : distList;
        const addressCode = (addrRaw?.addressCode ?? firstAddr?.addressCode) as string | undefined;
        if (addressCode) {
          payload.pickupAddressCode = String(addressCode);
        } else {
          throw new Error("PostEx: No Pickup Address Code configured. Please select one in Courier → PostEx settings.");
        }
      } catch (addrErr: any) {
        if (addrErr.message?.startsWith("PostEx:")) throw addrErr;
        throw new Error("PostEx: Could not fetch pickup address. Please select a Pickup Address Code in PostEx settings.");
      }
    }

    /* ── Full payload debug log before API call ── */
    logger.info({
      postex_endpoint: `${courier.apiEndpoint}/v3/create-order`,
      orderRefNumber:    payload.orderRefNumber,
      orderType:         payload.orderType,
      cityName:          payload.cityName,
      invoicePayment:    payload.invoicePayment,
      items:             payload.items,
      pickupAddressCode: payload.pickupAddressCode,
      customerPhone:     payload.customerPhone,
      transactionNotes:  payload.transactionNotes,
    }, "PostEx booking — full payload");

    const resp = await fetch(`${courier.apiEndpoint}/v3/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "token": courier.apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const raw = await resp.json() as Record<string, any>;
    logger.info({ httpStatus: resp.status, statusCode: raw?.statusCode, statusMessage: raw?.statusMessage }, "PostEx booking — API response");
    if (raw?.statusCode !== "200" && raw?.statusCode !== 200) {
      throw new Error(`PostEx booking failed: ${raw?.statusMessage ?? raw?.message ?? `HTTP ${resp.status}`}`);
    }
    const trackId = raw.dist?.trackingNumber ?? raw.dist?.orderRefNumber ?? raw.orderRefNumber ?? generateTrackingId("postex");
    const pId = String(trackId);
    return { trackingId: pId, trackingUrl: getTrackingUrl("postex", pId), rawResponse: raw };
  }

  /* ── Trax ── */
  if (courier.slug === "trax") {
    const settings = (courier.settings ?? {}) as Record<string, any>;
    if (!courier.apiKey) throw new Error("Trax: API Key / Bearer Token is required in settings");

    const svc = service ?? settings.serviceCode ?? "overnight";
    const weight = order.weight ?? settings.defaultWeight ?? 0.5;
    const codAmount = order.paymentMethod === "cod" ? Number(order.total) : 0;

    const resp = await fetch(`${courier.apiEndpoint}/create_order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${courier.apiKey}` },
      body: JSON.stringify({
        recipient: address.name ?? "",
        phone: address.phone ?? "",
        address: address.address ?? "",
        city: address.city ?? "",
        order_id: String(order.orderNumber ?? order.id),
        cod_amount: codAmount,
        weight: String(weight),
        service_type: svc,
        notes: order.notes ?? order.specialInstructions ?? "",
      }),
      signal: AbortSignal.timeout(10000),
    });
    const raw = await resp.json() as Record<string, any>;
    if (!resp.ok) throw new Error(`Trax booking failed: ${raw.message ?? raw.error ?? `HTTP ${resp.status}`}`);
    const trackId = raw.tracking_id ?? raw.trackingId ?? raw.id ?? generateTrackingId("trax");
    const tId = String(trackId);
    return { trackingId: tId, trackingUrl: getTrackingUrl("trax", tId), rawResponse: raw };
  }

  throw new Error(`No API implementation for courier: ${courier.slug}`);
}

async function trackWithCourierApi(courier: any, trackingId: string): Promise<{ status: string; rawResponse: Record<string, any> }> {
  try {
    if (courier.slug === "tcs") {
      const settings = (courier.settings ?? {}) as Record<string, any>;
      let bearerToken: string;
      try {
        bearerToken = getTcsStaticBearer(settings);
      } catch (authErr: any) {
        return { status: "in_transit", rawResponse: { note: "TCS auth failed", error: authErr.message } };
      }

      const baseUrl = (settings.sandbox ?? false) ? TCS_SANDBOX_URL : TCS_PROD_URL;
      const resp = await fetch(`${baseUrl}/tracking/api/Tracking/GetDynamicTrackDetail`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${bearerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ consignee: [trackingId] }),
        signal: AbortSignal.timeout(12000),
      });
      const raw = await resp.json() as Record<string, any>;

      if (raw.message === "FAIL" || !raw.checkpoints) {
        return { status: "in_transit", rawResponse: raw };
      }

      const checkpoints: any[] = Array.isArray(raw.checkpoints) ? raw.checkpoints : [];
      const deliveryInfo: any[] = Array.isArray(raw.deliveryinfo) ? raw.deliveryinfo : [];
      const latestDelivery = deliveryInfo[0];
      const latestCheckpoint = checkpoints[0];

      let status = "in_transit";
      if (latestDelivery?.code === "OK") status = "delivered";
      else if (latestDelivery?.code === "RO") status = "returned";
      else if (latestDelivery?.code === "OFD") status = "out_for_delivery";
      else if (latestCheckpoint?.status) status = mapTcsStatusToInternal(latestCheckpoint.status);

      return { status, rawResponse: raw };
    }

    let url = "";
    const headers: Record<string, string> = {};

    if (courier.slug === "leopards") {
      url = `${courier.apiEndpoint}/getTrackingInfo?api_key=${courier.apiKey}&api_password=${courier.apiSecret}&track_numbers=${trackingId}`;
    } else if (courier.slug === "postex") {
      url = `${courier.apiEndpoint}/v1/track-order/${trackingId}`;
      headers["token"] = courier.apiKey;
    } else if (courier.slug === "trax") {
      url = `${courier.apiEndpoint}/track_order/${trackingId}`;
      headers["Authorization"] = `Bearer ${courier.apiKey}`;
    } else {
      return { status: "in_transit", rawResponse: { note: "Unknown courier" } };
    }

    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    const raw = await resp.json() as Record<string, any>;

    let rawStatus: string;
    if (courier.slug === "postex") {
      const dist = (raw?.dist ?? {}) as Record<string, any>;
      const history: any[] = Array.isArray(dist?.transactionStatusHistory) ? dist.transactionStatusHistory : [];
      const lastCode = history.length > 0 ? String(history[history.length - 1]?.transactionStatusMessageCode ?? "") : "";
      /* PostEx transactionStatusMessageCode → internal status (section 3.8.3 of API docs) */
      const postexCodeMap: Record<string, string> = {
        "0001": "processing",        // At Merchant's Warehouse
        "0002": "returned",          // Returned
        "0003": "in_transit",        // At PostEx Warehouse
        "0004": "in_transit",        // Package on Route
        "0005": "delivered",         // Delivered
        "0006": "returned",          // Returned
        "0007": "returned",          // Returned
        "0008": "failed",            // Delivery Under Review
        "0013": "failed",            // Attempt Made
      };
      /* PostEx transactionStatus text → internal status (section 3.15 of API docs) */
      const postexTextMap: Record<string, string> = {
        "unbooked": "processing",
        "booked": "processing",
        "postex warehouse": "in_transit",
        "out for delivery": "out_for_delivery",
        "delivered": "delivered",
        "returned": "returned",
        "un-assigned by me": "processing",
        "expired": "failed",
        "delivery under review": "failed",
        "picked by postex": "in_transit",
        "out for return": "returned",
        "attempted": "failed",
        "en-route to postex warehouse": "in_transit",
      };
      const statusText = (dist?.transactionStatus ?? "").toLowerCase();
      rawStatus = postexCodeMap[lastCode] ?? postexTextMap[statusText] ?? normalizeShipmentStatus(statusText);
      return { status: rawStatus, rawResponse: raw };
    }

    rawStatus = (raw.status ?? raw.Status ?? raw.shipment_status ?? "") as string;
    return { status: normalizeShipmentStatus(rawStatus), rawResponse: raw };
  } catch (err: any) {
    return { status: "in_transit", rawResponse: { error: err.message } };
  }
}

function normalizeShipmentStatus(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("deliver")) return "delivered";
  if (s.includes("out for") || s.includes("ofd")) return "out_for_delivery";
  if (s.includes("transit") || s.includes("in-transit")) return "in_transit";
  if (s.includes("ship") || s.includes("dispatch")) return "shipped";
  if (s.includes("process") || s.includes("pack") || s.includes("unbook") || s.includes("warehouse") || s.includes("booked")) return "processing";
  if (s.includes("fail") || s.includes("return")) return "failed";
  return "in_transit";
}

/* ─── Admin: Debug Logs — enriched shipments for debugging ── */
router.get("/admin/shipments/debug-logs", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { courier, source, search, from, to } = req.query as Record<string, string>;
    const limit = 200;

    const conditions: any[] = [];
    if (courier && courier !== "all") conditions.push(eq(shipmentsTable.courierSlug, courier));
    if (from) conditions.push(gte(shipmentsTable.createdAt, new Date(from)));
    if (to)   conditions.push(lte(shipmentsTable.createdAt, new Date(to + "T23:59:59")));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const shipments = await db.select().from(shipmentsTable)
      .where(where as any)
      .orderBy(desc(shipmentsTable.createdAt))
      .limit(limit);

    /* Enrich each shipment with debug fields */
    const enriched = shipments.map(s => {
      const raw = (s.rawResponse ?? {}) as Record<string, any>;
      const isRealApi = raw.realApiBooking === true;
      const isLocal   = raw.localTracking  === true;
      const duration  = raw.apiCallDurationMs as number | undefined;
      const bookedAt  = raw.bookedAt as string | undefined;
      const errorNote = raw.note ?? raw.error ?? null;

      return {
        id:               s.id,
        courierSlug:      s.courierSlug,
        courierName:      (s.courierSlug === "tcs" ? "TCS Couriers" : s.courierSlug === "postex" ? "PostEx" : s.courierSlug === "leopards" ? "Leopards" : s.courierSlug === "trax" ? "Trax" : s.courierSlug) ?? "—",
        trackingId:       s.trackingId,
        shopifyOrderNumber: (s as any).shopifyOrderNumber,
        shopifyOrderId:   (s as any).shopifyOrderId,
        customerName:     (s as any).customerName,
        customerPhone:    (s as any).customerPhone,
        customerCity:     (s as any).customerCity,
        codAmount:        (s as any).codAmount,
        status:           s.status,
        bookingSource:    (s as any).bookingSource ?? "manual",
        isRealApi,
        isLocal,
        duration,
        bookedAt,
        errorNote,
        rawResponse:      raw,
        createdAt:        s.createdAt,
        updatedAt:        s.updatedAt,
      };
    }).filter(s => {
      /* source filter: real / local */
      if (source === "real"  && !s.isRealApi) return false;
      if (source === "local" &&  s.isRealApi) return false;
      /* text search */
      if (search) {
        const q = search.toLowerCase();
        return [s.trackingId, s.shopifyOrderNumber, s.customerName, s.customerPhone, s.customerCity, s.courierSlug]
          .some(v => v && String(v).toLowerCase().includes(q));
      }
      return true;
    });

    const stats = {
      total:     enriched.length,
      realApi:   enriched.filter(s => s.isRealApi).length,
      local:     enriched.filter(s => s.isLocal).length,
      avgDuration: (() => {
        const real = enriched.filter(s => s.duration != null);
        return real.length > 0 ? Math.round(real.reduce((a, s) => a + (s.duration ?? 0), 0) / real.length) : 0;
      })(),
    };

    res.json({ logs: enriched, stats });
    return;
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch debug logs" });
  }
});

/* ─── Admin: Retry booking for a local/failed shipment ─── */
router.post("/admin/shipments/:id/retry-booking", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return; }

    const raw = (shipment.rawResponse ?? {}) as Record<string, any>;
    if (raw.realApiBooking) {
      res.status(400).json({ error: "This shipment already has a real API booking" }); return;
    }

    const [courierRow] = shipment.courierId
      ? await db.select().from(couriersTable).where(eq(couriersTable.id, shipment.courierId!)).limit(1)
      : await db.select().from(couriersTable).where(eq(couriersTable.slug, shipment.courierSlug ?? "")).limit(1);

    if (!courierRow) { res.status(404).json({ error: "Courier configuration not found" }); return; }

    const settings = (courierRow.settings ?? {}) as Record<string, any>;
    const hasApiCreds = courierRow.slug === "tcs"
      ? !!(settings.bearerToken || (settings.username && settings.password))
      : !!(courierRow.apiKey && courierRow.apiEndpoint);

    if (!hasApiCreds) {
      res.status(422).json({
        error: `Courier API not configured for ${courierRow.name}. Add credentials in Courier Settings → Integrations.`,
        notConfigured: true,
      }); return;
    }

    /* Reconstruct order object from shipment fields */
    const s = shipment as any;
    const retryOrder: Record<string, any> = {
      id:          s.orderId,
      orderNumber: s.shopifyOrderNumber ?? s.orderId,
      paymentMethod: s.isCod ? "cod" : "online",
      total:       parseFloat(s.codAmount ?? "0"),
      invoiceAmount: parseFloat(s.codAmount ?? "0"),
      notes: "",
      contentDesc: s.contentDesc ?? "KDF Nuts Products",
      specialInstructions: s.specialInstructions ?? "",
      items: [],
      shippingAddress: {
        name:    s.customerName ?? "",
        phone:   s.customerPhone ?? "",
        address: s.customerAddress ?? "",
        city:    s.customerCity ?? "",
        email:   "",
      },
      weight: parseFloat(String(s.weight ?? "0.5")),
      pieces: s.pieces ?? 1,
      postexOrderType: "Normal",
    };

    const apiStart = Date.now();
    let newTrackingId: string;
    let newRawResponse: Record<string, any>;

    try {
      /* PostEx does NOT use serviceCode — use postexOrderType already set in retryOrder */
      const retryService = courierRow.slug === "postex" ? undefined : (s.serviceCode ?? "O");
      const result = await callCourierApi(courierRow, retryOrder, retryService);
      newTrackingId = result.trackingId;
      newRawResponse = {
        ...result.rawResponse,
        realApiBooking: true,
        apiCallDurationMs: Date.now() - apiStart,
        bookedAt: new Date().toISOString(),
        courier: courierRow.slug,
        trackingUrl: result.trackingUrl,
        retryOf: id,
      };
    } catch (apiErr: any) {
      req.log.warn({ err: apiErr, courierSlug: courierRow.slug }, "Retry booking failed");
      res.status(422).json({
        error: apiErr.message ?? "Courier API booking failed",
        apiError: true,
        durationMs: Date.now() - apiStart,
      }); return;
    }

    const history = [...((shipment.statusHistory as any[]) ?? []),
      { status: "pending", timestamp: new Date().toISOString(), note: `Retry booking via ${courierRow.name} API · tracking: ${newTrackingId}` }
    ];

    const [updated] = await db.update(shipmentsTable).set({
      trackingId: newTrackingId,
      rawResponse: newRawResponse,
      statusHistory: history,
      updatedAt: new Date(),
    } as any).where(eq(shipmentsTable.id, id)).returning();

    req.log.info({ newTrackingId, courier: courierRow.slug, shipmentId: id }, "Retry booking success");
    res.json({ ok: true, shipment: updated, trackingId: newTrackingId, courierName: courierRow.name });
    return;
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Retry failed" });
  }
});

/* ─── Exported helpers for shopify.ts ─────────────────── */
export { callCourierApi as callCourierApiForShopify, trackWithCourierApi as trackWithCourierApiForShopify };

export default router;
