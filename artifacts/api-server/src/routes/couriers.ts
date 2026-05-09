import { Router } from "express";
import { db, couriersTable, shipmentsTable, ordersTable, usersTable, whatsappSettingsTable, emailSettingsTable, courierNotificationLogsTable, courierRetargetingQueueTable, aiSettingsTable } from "@workspace/db";
import { eq, desc, sql, and, gte, lte, ne } from "drizzle-orm";
import { adminMiddleware, authMiddleware, type AuthRequest } from "../lib/auth";
import { sendOrderStatusUpdate } from "../lib/whatsapp";
import OpenAI from "openai";
import type { Response } from "express";

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
  try {
    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "tcs")).limit(1);
    const settings = (courierRow?.settings ?? {}) as Record<string, any>;
    const { accessToken, mode } = await resolveTcsTokens(settings);
    const modeLabel = mode === "direct" ? "Direct Access Token" : mode === "cached" ? "Cached token (valid)" : "Fresh 2-step auth";
    res.json({ ok: true, message: `TCS connection successful — ${modeLabel}`, accessTokenLength: accessToken.length, mode });
    return;
  } catch (err: any) {
    req.log.error(err);
    res.status(502).json({ error: err.message ?? "TCS connection test failed" });
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

/* ─── Admin: TCS – full auth debug ──────────────────── */
router.post("/admin/couriers/tcs/debug-auth", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  const log: string[] = [];
  const ts = () => new Date().toISOString();
  try {
    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.slug, "tcs")).limit(1);
    if (!courierRow) { res.status(404).json({ error: "TCS courier not configured in admin yet" }); return; }
    const settings = (courierRow.settings ?? {}) as Record<string, any>;

    log.push(`[${ts()}] TCS settings loaded — mode: ${settings.sandbox ? "SANDBOX" : "PRODUCTION"}`);
    log.push(`[${ts()}] ── Credentials ──`);
    log.push(`[${ts()}] directAccessToken (Mode A): ${settings.accessToken ? `set (len=${String(settings.accessToken).length})` : "not set"}`);
    log.push(`[${ts()}] staticBearerToken (skip Step 1): ${settings.bearerToken ? `set (len=${String(settings.bearerToken).length})` : "not set"}`);
    log.push(`[${ts()}] clientId   (Step 1 – Authorization): ${settings.clientId ? `set (${String(settings.clientId).slice(0, 6)}…)` : `not set (fallback: username=${settings.username ? "set" : "not set"})`}`);
    log.push(`[${ts()}] clientSecret (Step 1 – Authorization): ${settings.clientSecret ? "set" : `not set (fallback: password=${settings.password ? "set" : "not set"})`}`);
    log.push(`[${ts()}] username (Step 2 – E-COM Auth): ${settings.username ? "set" : "not set"}`);
    log.push(`[${ts()}] password (Step 2 – E-COM Auth): ${settings.password ? "set" : "not set"}`);
    log.push(`[${ts()}] ── Account Info ──`);
    log.push(`[${ts()}] tcsaccount: ${settings.tcsaccount || "(empty)"}`);
    log.push(`[${ts()}] shipperCityCode: ${settings.shipperCityCode || "(empty — fallback: LHE)"}`);
    log.push(`[${ts()}] shipperName: ${settings.shipperName || "(empty — fallback: KDF Nuts)"}`);
    log.push(`[${ts()}] defaultWeight: ${settings.defaultWeight || "(empty — fallback: 0.5 kg)"}`);

    /* Invalidate cache for this test */
    tcsTokenCache.clear();
    log.push(`[${ts()}] Token cache cleared`);

    let resolvedMode = "";
    let accessToken = "";
    try {
      const tokens = await resolveTcsTokens(settings);
      resolvedMode = tokens.mode;
      accessToken = tokens.accessToken;
      log.push(`[${ts()}] ✅ resolveTcsTokens succeeded — mode=${tokens.mode}, accessToken length=${tokens.accessToken.length}`);
    } catch (authErr: any) {
      log.push(`[${ts()}] ❌ resolveTcsTokens FAILED: ${authErr.message}`);
      res.json({ ok: false, log, error: authErr.message }); return;
    }

    /* Try a test booking with a dummy consignment to verify the access token works */
    const baseUrl = settings.sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;
    log.push(`[${ts()}] Testing booking endpoint: ${baseUrl}/ecom/api/booking/create`);
    /* We don't actually book — just check the /ecom/api/authentication/validate or similar */
    /* Instead verify by calling the tracking endpoint with a dummy number */
    const trackResp = await fetch(`${baseUrl}/tracking/api/Tracking/GetDynamicTrackDetail`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ consignee: ["TEST0000000000"] }),
      signal: AbortSignal.timeout(10000),
    });
    const trackText = await trackResp.text();
    log.push(`[${ts()}] Tracking endpoint HTTP status: ${trackResp.status}`);
    log.push(`[${ts()}] Tracking response: ${trackText.slice(0, 200)}`);

    /* Fetch server outbound IP — helps diagnose TCS 403 IP whitelist issues */
    let serverIp = "unknown";
    try {
      const ipResp = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(4000) });
      const ipData = await ipResp.json() as { ip?: string };
      serverIp = ipData.ip ?? "unknown";
    } catch { /* non-fatal */ }
    log.push(`[${ts()}] Server outbound IP: ${serverIp}`);

    res.json({
      ok: true,
      mode: resolvedMode,
      accessTokenLength: accessToken.length,
      sandbox: !!(settings.sandbox),
      serverIp,
      log,
      hint: resolvedMode === "direct"
        ? "Using Direct Access Token — no auto-refresh. Paste a new token if it expires."
        : resolvedMode === "cached"
        ? "Token served from cache (< 50 min old)."
        : "Fresh token obtained via 2-step auth — will be cached for 50 min.",
      ipHint: `If TCS returns HTTP 403, ask TCS to whitelist this server IP: ${serverIp}`,
    });
    return;
  } catch (err: any) {
    log.push(`[${ts()}] ❌ Fatal: ${err.message}`);
    res.status(500).json({ ok: false, log, error: err.message });
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
    const { accessToken } = await resolveTcsTokens(settings);
    const baseUrl = settings.sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;

    /* Build consignment list — single or batch */
    const cnList: string[] = consignmentNumber
      ? [String(consignmentNumber)]
      : shipmentIds.map((id: any) => String(id));

    const printResp = await fetch(`${baseUrl}/ecom/api/print/label`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ consignmentno: cnList }),
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
        const result = await callCourierApi(courierRow, fakeOrder, serviceCode);
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
    const { bearerToken, accessToken } = await resolveTcsTokens(settings);
    const baseUrl = settings.sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;

    const cancelResp = await fetch(`${baseUrl}/ecom/api/booking/cancel`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${bearerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ consignmentNumber: shipment.trackingId, accesstoken: accessToken }),
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

/* In-memory TCS token cache — 50-min TTL, auto-refreshes on next request */
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

const tcsTokenCache = new Map<string, { bearerToken: string; accessToken: string; expiresAt: number }>();

/**
 * Unified TCS token resolver — official 2-step flow per TCS API docs:
 *
 *  Step 1 — Authorization API  (POST /auth/api/auth):
 *    Body: { clientid, clientsecret }  →  returns bearerToken
 *
 *  Step 2 — E-COM Authentication (GET /ecom/api/authentication/token):
 *    Header: Authorization: Bearer {step1BearerToken}
 *    Body: { username, password }  →  returns accessToken
 *
 * Mode overrides:
 *  A. directAccessToken set → skip both steps, use as accessToken
 *  B. staticBearerToken set → skip Step 1, run Step 2 with stored bearer
 *
 * Results cached 50 minutes to avoid hammering the auth endpoint.
 */
async function resolveTcsTokens(settings: Record<string, any>): Promise<{
  bearerToken: string; accessToken: string; mode: string;
}> {
  /* ── Mode A: Direct Access Token pasted — skip all auth ── */
  const directToken = (settings.accessToken ?? "").trim();
  if (directToken) {
    return { bearerToken: directToken, accessToken: directToken, mode: "direct" };
  }

  /* ── Step 1 credentials: clientId + clientSecret (ONLY if explicitly set — never fall back to username) ── */
  const clientId     = (settings.clientId ?? "").trim();
  const clientSecret = (settings.clientSecret ?? "").trim();

  /* ── Step 2 credentials: TCS E-COM username + password ── */
  const username = (settings.username || "").trim();
  const password = (settings.password || "").trim();

  /* ── Mode B: Static bearer token provided (skip Step 1) ── */
  const staticBearerToken = (settings.bearerToken ?? "").trim();

  /* Cache key */
  const cacheKey = [
    settings.tcsaccount || "anon",
    settings.sandbox ? "sb" : "live",
    staticBearerToken ? staticBearerToken.slice(-8)
      : clientId ? clientId.slice(-6)
      : username.slice(-6),
  ].join(":");

  const cached = tcsTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached, mode: "cached" };
  }

  /* Validate we have enough to proceed */
  if (!staticBearerToken && !clientId && !username) {
    throw new Error(
      "TCS not configured. Enter Username + Password in Courier Settings → TCS, then Save."
    );
  }

  /* ── Step 1: get Bearer Token from Authorization API ── */
  let bearerToken: string;
  let mode = "fresh";
  if (staticBearerToken) {
    /* Mode B — pre-supplied bearer, skip Step 1 */
    bearerToken = staticBearerToken;
    mode = "static-bearer";
  } else if (clientId && clientSecret) {
    /* Mode C — full 2-step: explicit clientId+clientSecret → bearer token */
    const result = await getTcsBearerToken(clientId, clientSecret, settings.sandbox);
    bearerToken = result.bearerToken;
    mode = "full-2step";
  } else {
    /* Mode D — username+password only: skip Step 1, authenticate directly at Step 2.
       IMPORTANT: Do NOT use username as clientId — they are different credential sets.
       getTcsAccessToken will POST {username,password} directly to the E-COM auth endpoint. */
    bearerToken = "";
    mode = "direct-creds";
  }

  /* ── Step 2: get E-COM Access Token ── */
  if (!username || !password) {
    throw new Error(
      "TCS Username and Password are required. Add them in Courier Settings → TCS."
    );
  }

  let accessToken: string;
  try {
    accessToken = await getTcsAccessToken(bearerToken, username, password, settings.sandbox);
  } catch (step2Err: any) {
    throw new Error(
      `TCS authentication failed: ${step2Err.message ?? "unknown error"}. ` +
      "Check that TCS Username and Password are correct in Courier Settings."
    );
  }

  /* Cache 50 minutes */
  tcsTokenCache.set(cacheKey, { bearerToken, accessToken, expiresAt: Date.now() + 50 * 60 * 1000 });
  return { bearerToken, accessToken, mode };
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

async function getTcsAccessToken(bearerToken: string, username: string, password: string, sandbox?: boolean): Promise<string> {
  if (!username || !password) throw new Error("TCS username and password are required in settings");
  const baseUrl = sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;

  /* Build auth header conditionally — omit Bearer header entirely when no Step 1 token available */
  const authHeader = bearerToken ? { "Authorization": `Bearer ${bearerToken}` } : {};

  const attempts: Array<() => Promise<Response>> = [
    /* Attempt 1: POST with body {username, password} — works with or without Step 1 bearer */
    () => fetch(`${baseUrl}/ecom/api/authentication/token`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(10000),
    }),
    /* Attempt 2: GET with query params — some TCS environments prefer this */
    () => fetch(`${baseUrl}/ecom/api/authentication/token?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`, {
      method: "GET",
      headers: { ...authHeader },
      signal: AbortSignal.timeout(10000),
    }),
    /* Attempt 3: GET with credentials in custom headers */
    () => fetch(`${baseUrl}/ecom/api/authentication/token`, {
      method: "GET",
      headers: { ...authHeader, "username": username, "password": password, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    }),
    /* Attempt 4 (fallback): POST without any Authorization header — pure username/password */
    () => fetch(`${baseUrl}/ecom/api/authentication/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(10000),
    }),
  ];

  let lastError = "";
  for (const attempt of attempts) {
    const resp = await attempt();
    const text = await resp.text();
    let data: Record<string, any> = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    const token = data.accessToken ?? data.accesstoken ?? data.token ?? data.access_token ?? data.data?.accessToken ?? data.data?.token ?? data.result?.accessToken ?? data.result?.token;
    if (resp.ok && token) return token;
    if (resp.ok) {
      lastError = `HTTP 200 but no token field found in: ${text.slice(0, 300)}`;
      break;
    }
    lastError = `HTTP ${resp.status}: ${data.message ?? text.slice(0, 200)}`;
    if (resp.status !== 400 && resp.status !== 405) break;
  }
  throw new Error(`TCS Authentication failed — ${lastError}`);
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
    const { bearerToken, accessToken } = await resolveTcsTokens(settings);
    const baseUrl = settings.sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;
    const codAmount = order.paymentMethod === "cod" ? Number(order.total) : 0;
    const items: any[] = Array.isArray(order.items) ? order.items : [];

    const payload = {
      accesstoken: accessToken,
      consignmentno: "",
      shipperinfo: {
        tcsaccount: settings.tcsaccount || "",
        shippername: (settings.shipperName || "KDF Nuts").trim().slice(0, 50),
        address1: settings.shipperAddress || "",
        address2: "",
        address3: "",
        zip: "",
        countrycode: "PK",
        countryname: "Pakistan",
        citycode: (settings.shipperCityCode || "LHE").trim().toUpperCase().slice(0, 5),
        cityname: settings.shipperCity || "Lahore",
        mobile: settings.shipperPhone || "",
      },
      consigneeinfo: {
        consigneecode: "",
        firstname: address.name ?? "",
        middlename: "",
        lastname: "",
        address1: address.address ?? "",
        address2: "",
        address3: "",
        zip: "",
        countrycode: "PK",
        countryname: "Pakistan",
        citycode: "",
        cityname: address.city ?? "",
        email: address.email ?? "",
        areacode: "",
        areaname: "",
        blockcode: "",
        blockname: "",
        lat: "",
        lng: "",
        landmark: "",
        mobile: address.phone ?? "",
      },
      shipmentinfo: {
        costcentercode: settings.costcentercode ?? "",
        referenceno: String(order.orderNumber ?? order.id),
        contentdesc: order.contentDesc ?? (items.length > 0 ? items.map((i: any) => i.name).join(", ") : "KDF Nuts Products"),
        servicecode: service ?? settings.serviceCode ?? "O",
        parametertype: "",
        shipmentdate: formatTcsShipmentDate(),
        shippingtype: "",
        currency: "PKR",
        codamount: codAmount,
        declaredvalue: order.declaredValue ?? (settings.declaredValue > 0 ? settings.declaredValue : null),
        insuredvalue: order.insuredValue ?? (settings.insuredValue > 0 ? settings.insuredValue : null),
        transactiontype: "",
        dsflag: "",
        carrierslug: "",
        weightinkg: Math.max(0.5, parseFloat(Number(order.weight || settings.defaultWeight || 0.5).toFixed(2))),
        pieces: parseInt(String(order.pieces ?? 1), 10),
        fragile: order.fragile ?? settings.fragile ?? false,
        remarks: order.specialInstructions || settings.defaultRemarks || order.notes || "",
        skus: items.length > 0
          ? items.map((item: any) => ({
              description: item.name ?? "Product",
              quantity: parseInt(String(item.qty ?? 1), 10),
              weight: Math.max(0.5, parseFloat(Number(settings.defaultWeight || 0.5).toFixed(2))),
              uom: "KG",
              unitprice: Number(item.price ?? 0),
              declaredvalue: settings.declaredValue > 0 ? Number(settings.declaredValue) : null,
              insuredvalue: settings.insuredValue > 0 ? Number(settings.insuredValue) : null,
            }))
          : [{
              description: "KDF Nuts Products",
              quantity: 1,
              weight: Math.max(0.5, parseFloat(Number(settings.defaultWeight || 0.5).toFixed(2))),
              uom: "KG",
              unitprice: codAmount,
              declaredvalue: settings.declaredValue > 0 ? settings.declaredValue : null,
              insuredvalue: settings.insuredValue > 0 ? settings.insuredValue : null,
            }],
      },
    };

    const bookResp = await fetch(`${baseUrl}/ecom/api/booking/create`, {
      method: "POST",
      /* Per TCS docs: booking APIs use the Step 2 accessToken (E-COM token), not the Step 1 bearerToken */
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const bookText = await bookResp.text();
    let bookData: Record<string, any> = {};
    try { bookData = JSON.parse(bookText); } catch { bookData = { raw: bookText }; }

    const isSuccess =
      bookData.message?.toUpperCase() === "SUCCESS" ||
      bookData.code === "200" ||
      bookData.code === 200 ||
      bookData.status === true ||
      bookData.status === "SUCCESS" ||
      (bookResp.ok && !bookData.message?.toUpperCase().startsWith("FAIL"));

    if (!isSuccess) {
      /* TCS returns errorList (not error) — extract field + message pairs */
      const errorList: any[] = Array.isArray(bookData.errorList) ? bookData.errorList : [];
      const legacyError: any[] = Array.isArray(bookData.error) ? bookData.error : [];
      const errMsg = errorList.length > 0
        ? errorList.map((e: any) => `${e.key ?? ""}: ${e.errormessage ?? e.message ?? JSON.stringify(e)}`).join(" | ")
        : legacyError.length > 0
          ? Object.values(legacyError[0]).join(", ")
          : bookData.message ?? `TCS booking error (HTTP ${bookResp.status}): ${bookText.slice(0, 300)}`;
      throw new Error(`TCS: ${errMsg}`);
    }

    const trackingId =
      bookData.consignmentNo ??
      bookData.consignment_no ??
      bookData.consignmentNumber ??
      bookData.bookingNo ??
      bookData.data?.consignmentNo ??
      bookData.data?.bookingNo ??
      bookData.result?.consignmentNo ??
      generateTrackingId("tcs");
    return { trackingId, trackingUrl: getTrackingUrl("tcs", trackingId), rawResponse: bookData };
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

    const orderType = service ?? order.postexOrderType ?? settings.orderType ?? "Normal";
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
      invoicePayment: String(invoicePayment),   /* docs: String type */
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

    const resp = await fetch(`${courier.apiEndpoint}/v3/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "token": courier.apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const raw = await resp.json() as Record<string, any>;
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
        const tokens = await resolveTcsTokens(settings);
        bearerToken = tokens.bearerToken;
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
      const result = await callCourierApi(courierRow, retryOrder, s.serviceCode ?? "O");
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
