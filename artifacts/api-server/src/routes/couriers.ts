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
import * as Tcs from "../lib/tcs";
import { getServerIp } from "../lib/meezan";

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

/* ─── GET /admin/couriers/server-ip ─── */
router.get("/admin/couriers/server-ip", adminMiddleware as any, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ip = await getServerIp();
    const env = process.env.NODE_ENV === "production" ? "production" : "development";
    res.json({ ip, env });
  } catch (err: any) {
    res.json({ ip: null, env: "unknown", error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════════════
 * TCS COURIER ROUTES — COD API rebuild (May 2026)
 * Official COD API: api.tcscourier.com/production/v1/cod
 * Auth: Authorization: Bearer {storedToken} + X-IBM-Client-Id: {clientId}
 * Booking body contains userName + password directly — NO 3-step ECOM flow.
 * All TCS logic lives in src/lib/tcs.ts
 * ══════════════════════════════════════════════════════════════════════════ */

/* ─── Helper: load TCS settings from DB ── */
async function getTcsSettings(): Promise<Tcs.TcsSettings | null> {
  const [row] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "tcs")).limit(1);
  return row ? (row.settings ?? {}) as Tcs.TcsSettings : null;
}

/* ─── POST /admin/couriers/tcs/test — COD API connection test ─── */
router.post("/admin/couriers/tcs/test", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const s = await getTcsSettings();
    if (!s) {
      res.json({ ok: false, steps: [{ step: "Config", status: "fail", detail: "TCS not configured — go to Couriers → TCS and save settings first" }] });
      return;
    }
    const result = await Tcs.testConnection(s);
    res.json({ ...result, message: result.ok ? "TCS COD API connection validated — Bearer token + X-IBM-Client-Id working" : undefined });
  } catch (err: any) {
    req.log.error(err);
    res.json({ ok: false, steps: [{ step: "Error", status: "fail", detail: err.message }], error: err.message });
  }
});

/* ─── POST /admin/couriers/tcs/debug-auth — COD API auth debug ─── */
router.post("/admin/couriers/tcs/debug-auth", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  type S = "ok" | "fail" | "info" | "warn";
  const steps: Array<{ step: string; status: S; detail: string; raw?: string }> = [];
  try {
    const s = await getTcsSettings();
    if (!s) { res.json({ ok: false, steps: [{ step: "Config", status: "fail", detail: "TCS not configured" }] }); return; }

    const baseUrl = s.sandbox ? Tcs.TCS_COD_SANDBOX_URL : Tcs.TCS_COD_URL;
    const serverIp = await getServerIp().catch(() => "unavailable");

    steps.push({ step: "Server IP", status: "info", detail: serverIp });
    steps.push({
      step: "Config", status: "info",
      detail: [
        `bearerToken: ${s.bearerToken ? `${s.bearerToken.slice(0, 20)}…` : "(EMPTY — required)"}`,
        `username: ${s.username || "(empty)"}`,
        `password: ${s.password ? "●●●" : "(empty)"}`,
        `mode: ${s.sandbox ? "SANDBOX" : "PRODUCTION"}`,
      ].join(" | "),
    });

    const missing = Tcs.validateSettings(s);
    if (missing.length > 0) {
      steps.push({ step: "Missing required fields", status: "fail", detail: missing.join("\n") });
      res.json({ ok: false, steps, error: missing.join("; "), serverIp }); return;
    }

    steps.push({ step: "Bearer Token", status: "ok", detail: `✅ Token present (${s.bearerToken.length} chars)\nHeader: Authorization: Bearer {token}\nContent-Type: application/json` });

    const testResult = await Tcs.testConnection(s);
    steps.push(...(testResult.steps as any[]));

    steps.push({
      step: "Booking ready", status: testResult.ok ? "ok" : "warn",
      detail: testResult.ok
        ? `✅ Ready to book.\nPOST ${baseUrl}/create-order\nBody: { userName, password, consignee details, codAmount… }`
        : "API test failed — check bearer token, username, password",
    });

    res.json({ ok: testResult.ok, steps, serverIp });
  } catch (err: any) {
    req.log.error(err);
    res.json({ ok: false, steps, error: err.message });
  }
});

/* ─── POST /admin/couriers/tcs/clear-cache ─── */
router.post("/admin/couriers/tcs/clear-cache", adminMiddleware as any, async (_req: AuthRequest, res: Response): Promise<void> => {
  const result = Tcs.clearCache();
  res.json({ ok: true, message: "TCS COD API uses a stored bearer token — no in-memory cache. Token is read fresh from DB settings on every request.", ...result });
});

/* ─── GET /admin/couriers/tcs/request-log ─── */
router.get("/admin/couriers/tcs/request-log", adminMiddleware as any, async (_req: AuthRequest, res: Response): Promise<void> => {
  const entries = Tcs.getLog(50);
  res.json({ ok: true, count: entries.length, entries });
});

/* ─── POST /admin/couriers/tcs/test-tracking ─── */
router.post("/admin/couriers/tcs/test-tracking", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  type S = "ok" | "fail" | "info" | "warn";
  const steps: Array<{ step: string; status: S; detail: string; raw?: string }> = [];
  try {
    const s = await getTcsSettings();
    if (!s) { res.json({ ok: false, steps: [{ step: "Config", status: "fail", detail: "TCS not configured" }] }); return; }

    const trackingNumber = (req.body?.trackingNumber ?? "TEST123456").toString();
    const hasTrackingClientId = !!s.trackingClientId?.trim();
    steps.push({
      step: "Config",
      status: hasTrackingClientId ? "info" : "warn",
      detail: `CN: ${trackingNumber} | mode: ${s.sandbox ? "SANDBOX" : "PRODUCTION"} | X-IBM-Client-Id: ${hasTrackingClientId ? "✅ configured" : "⚠ MISSING — tracking will return in_transit without real data. Add Tracking API Client ID from developer.tcscourier.com"}`,
    });
    steps.push({
      step: "API",
      status: "info",
      detail: `URL: ${s.sandbox ? "api.tcscourier.com/sandbox" : "api.tcscourier.com/production"}/track/v1/shipments/detail?consignmentNo=${trackingNumber}`,
    });

    let result: { status: string; rawResponse: Record<string, any> };
    try {
      result = await Tcs.trackShipment(s, trackingNumber);
      const isReal = !result.rawResponse?.note;
      steps.push({
        step: "Tracking API",
        status: isReal ? "ok" : "warn",
        detail: isReal
          ? `✅ Response received | shipStatus: ${result.status}`
          : `⚠ ${result.rawResponse?.note ?? "No tracking data"}`,
        raw: JSON.stringify(result.rawResponse, null, 2).slice(0, 1000),
      });
    } catch (e: any) {
      steps.push({ step: "Tracking API", status: "fail", detail: e.message });
      res.json({ ok: false, steps, error: e.message }); return;
    }

    res.json({ ok: true, steps, status: result.status, rawResponse: result.rawResponse });
  } catch (err: any) {
    req.log.error(err);
    res.json({ ok: false, steps, error: err.message });
  }
});

/* ─── POST /admin/couriers/tcs/test-booking ─── */
router.post("/admin/couriers/tcs/test-booking", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  type S = "ok" | "fail" | "info" | "warn";
  const steps: Array<{ step: string; status: S; detail: string; raw?: string }> = [];
  try {
    const s = await getTcsSettings();
    if (!s) { res.json({ ok: false, steps: [{ step: "Config", status: "fail", detail: "TCS not configured" }] }); return; }
    const configErrs = Tcs.validateSettings(s);
    if (configErrs.length > 0) {
      steps.push({ step: "Config validation", status: "fail", detail: configErrs.join("\n") });
      res.json({ ok: false, steps }); return;
    }

    steps.push({ step: "Config", status: "ok", detail: `username: ${s.username} | clientId: ${s.clientId} | mode: ${s.sandbox ? "SANDBOX ✅ Safe" : "⚠ PRODUCTION — real shipment will be created"}` });

    const testOrder = {
      id: "TEST001",
      orderNumber: `KDF-TEST-${Date.now().toString().slice(-6)}`,
      paymentMethod: "cod",
      total: 100,
      weight: s.defaultWeight ?? 0.5,
      pieces: 1,
      items: [{ name: "Test Product" }],
      notes: "TCS API test booking — please ignore",
    };
    const testAddress = {
      name: "Test Customer",
      address1: "123 Test Street",
      city: "Lahore",
      phone: "03001234567",
    };

    let result: { trackingId: string; trackingUrl: string; rawResponse: Record<string, any> };
    try {
      result = await Tcs.createBooking(s, testOrder, testAddress, s.serviceCode);
      steps.push({ step: "Booking API", status: "ok", detail: `✅ Booking successful! Consignment No: ${result.trackingId}\nTracking URL: ${result.trackingUrl}`, raw: JSON.stringify(result.rawResponse, null, 2).slice(0, 800) });
    } catch (e: any) {
      steps.push({ step: "Booking API", status: "fail", detail: e.message });
      res.json({ ok: false, steps, error: e.message }); return;
    }

    res.json({ ok: true, steps, consignmentNo: result.trackingId, trackingUrl: result.trackingUrl, rawResponse: result.rawResponse });
  } catch (err: any) {
    req.log.error(err);
    res.json({ ok: false, steps, error: err.message });
  }
});

/* ─── POST /admin/couriers/tcs/print-label ─── */
router.post("/admin/couriers/tcs/print-label", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { consignmentNumber, shipmentIds } = req.body ?? {};
    if (!consignmentNumber && (!Array.isArray(shipmentIds) || shipmentIds.length === 0)) {
      res.status(400).json({ error: "Provide consignmentNumber (single) or shipmentIds[] (batch)" }); return;
    }

    const s = await getTcsSettings();
    if (!s) { res.status(404).json({ error: "TCS courier not configured" }); return; }

    const headers = Tcs.getAuthHeaders(s);
    const cnList: string[] = consignmentNumber ? [String(consignmentNumber)] : shipmentIds.map((id: any) => String(id));
    const baseUrl = s.sandbox ? Tcs.TCS_COD_SANDBOX_URL : Tcs.TCS_COD_URL;

    const printResp = await fetch(`${baseUrl}/shipment-label`, {
      method: "POST",
      headers,
      body: JSON.stringify({ userName: s.username, password: s.password, consignmentNo: cnList[0], consignmentno: cnList }),
      signal: AbortSignal.timeout(20000),
    });

    const contentType = printResp.headers.get("content-type") ?? "";
    if (contentType.includes("application/pdf") || contentType.includes("octet-stream")) {
      const buf = await printResp.arrayBuffer();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="tcs-label-${cnList[0]}.pdf"`);
      res.send(Buffer.from(buf)); return;
    }

    const text = await printResp.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!printResp.ok) { res.status(502).json({ error: data.message ?? `TCS print API returned HTTP ${printResp.status}`, raw: data }); return; }

    const b64 = data.result?.labelData ?? data.labelData ?? data.data ?? null;
    if (typeof b64 === "string" && b64.length > 100) {
      const buf = Buffer.from(b64, "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="tcs-label-${cnList[0]}.pdf"`);
      res.send(buf); return;
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

    const settings = (courierRow.settings ?? {}) as Tcs.TcsSettings;
    const cancelHeaders = Tcs.getAuthHeaders(settings);
    const cancelBaseUrl = settings.sandbox ? Tcs.TCS_COD_SANDBOX_URL : Tcs.TCS_COD_URL;

    const cancelResp = await fetch(`${cancelBaseUrl}/cancel-order`, {
      method: "PUT",
      headers: cancelHeaders,
      body: JSON.stringify({ userName: settings.username, password: settings.password, consignmentNumber: shipment.trackingId }),
      signal: AbortSignal.timeout(10000),
    });
    const cancelData = await cancelResp.json() as Record<string, any>;

    const cancelOk = cancelData?.returnStatus?.code === "0200" || cancelData?.returnStatus?.status === "SUCCESS" || cancelData.message === "SUCCESS";
    if (!cancelOk) {
      throw new Error(cancelData?.returnStatus?.message ?? cancelData.message ?? "TCS cancel failed");
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
/* ─── Shared Courier Helpers ─────────────────────────── */
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

/**
 * TCS weight formatter — returns a STRING decimal e.g. "0.50", "1.00", "1.25".
 * TCS API rejects JS integers (1 → JSON "1") but accepts string decimals ("1.00").
 * Min 0.5 kg; NaN/zero/negative → fallback "0.50".
 */
async function callCourierApi(courier: any, order: any, service?: string): Promise<{ trackingId: string; trackingUrl: string; rawResponse: Record<string, any> }> {
  const address = order.shippingAddress ?? {};
  /* ── TCS — via src/lib/tcs.ts (clean modular implementation) ── */
  if (courier.slug === "tcs") {
    const settings = (courier.settings ?? {}) as Tcs.TcsSettings;
    return await Tcs.createBooking(settings, order, address, service);
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
    /* ── TCS — via src/lib/tcs.ts ── */
    if (courier.slug === "tcs") {
      const settings = (courier.settings ?? {}) as Tcs.TcsSettings;
      return await Tcs.trackShipment(settings, trackingId);
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
