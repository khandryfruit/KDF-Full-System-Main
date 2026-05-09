/**
 * TCS Courier Integration — Official COD API v1 (Simple)
 *
 * ONLY 3 things needed: bearerToken + username + password
 *
 * BOOKING:
 *   POST https://api.tcscourier.com/production/v1/cod/create-order
 *   Header: Authorization: Bearer {bearerToken}
 *   Body:   { userName, password, consignee details, weight, codAmount, ... }
 *   Response: bookingReply.CN = consignment number
 *
 * TRACKING:
 *   GET https://api.tcscourier.com/production/track/v1/shipments/detail?consignmentNo=CN
 *   Header: Authorization: Bearer {bearerToken}
 *
 * Bearer token is long-lived (~10yr) from TCS ENVO Portal. Paste once — no refresh needed.
 */

import https from "node:https";
import http  from "node:http";
import { logger } from "./logger";

/* ─── URL constants ─────────────────────────────────────────────────────── */
export const TCS_COD_URL         = "https://api.tcscourier.com/production/v1/cod";
export const TCS_COD_SANDBOX_URL = "https://api.tcscourier.com/sandbox/v1/cod";
export const TCS_TRACK_URL       = "https://api.tcscourier.com/production/track/v1";
export const TCS_TRACKING_LINK   = "https://ociconnect.tcscourier.com/tracking/index.html";

/* ─── Settings — only what is actually needed ───────────────────────────── */
export interface TcsSettings {
  /* ── Required: 4 fields ── */
  bearerToken: string;   /* Long-lived JWT from TCS ENVO Portal */
  clientId:    string;   /* X-IBM-Client-Id from TCS ENVO Portal → API Credentials */
  username:    string;   /* TCS username — sent in booking body as "userName" */
  password:    string;   /* TCS password — sent in booking body as "password" */

  /* ── Optional booking defaults ── */
  costCenterCode?: string;   /* Required by COD API — TCS account cost center code */
  serviceCode?:    string;   /* O=Overnight (default), S=SameDay, E=Economy */
  defaultWeight?:  number;   /* kg, e.g. 0.5 */
  fragile?:        boolean;
  defaultRemarks?: string;

  /* ── Optional shipper/origin info ── */
  shipperCity?:    string;   /* originCityName — defaults to "Lahore" */
  shipperName?:    string;
  shipperAddress?: string;
  shipperPhone?:   string;

  /* ── Flags ── */
  sandbox?:                  boolean;
  preventDuplicateBookings?: boolean;
}

/* ─── Request log ───────────────────────────────────────────────────────── */
export interface TcsLogEntry {
  id:          number;
  ts:          string;
  step:        string;
  url:         string;
  method:      string;
  reqBody?:    string;
  httpStatus?: number | null;
  resBody?:    string;
  durationMs?: number;
  success:     boolean;
  error?:      string;
}

let _logSeq = 0;
const _log: TcsLogEntry[] = [];
export function pushLog(e: Omit<TcsLogEntry, "id">) {
  _log.unshift({ ...e, id: ++_logSeq });
  if (_log.length > 100) _log.splice(100);
}
export function getLog(limit = 50) { return _log.slice(0, limit); }
export function clearCache() {
  logger.info({}, "TCS clearCache called — no cache in this flow");
  return { bearerCleared: 0, ecomCleared: 0 };
}
export function getCacheStatus() {
  return { note: "No cache — bearer token is read directly from settings on every request." };
}

/* ─── Decode clientId from JWT payload ────────────────────────────────────
 * IBM API Gateway requires the X-IBM-Client-Id header on every request.
 * TCS embeds "clientid" inside the Bearer JWT payload — extract it automatically
 * so the user never has to enter it separately.
 */
export function extractClientIdFromJwt(token: string): string | null {
  try {
    const parts = token.trim().split(".");
    if (parts.length < 2) return null;
    const pad   = (s: string) => s + "=".repeat((4 - (s.length % 4)) % 4);
    const json  = Buffer.from(pad(parts[1].replace(/-/g, "+").replace(/_/g, "/")), "base64").toString("utf8");
    const decoded = JSON.parse(json) as Record<string, unknown>;
    const cid = decoded.clientid ?? decoded.client_id ?? decoded.clientId ?? decoded.sub;
    return cid != null ? String(cid).trim() || null : null;
  } catch {
    return null;
  }
}

/* ─── Auth headers ───────────────────────────────────────────────────────── */
export function getAuthHeaders(settings: TcsSettings): Record<string, string> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${settings.bearerToken.trim()}`,
    "Content-Type":  "application/json",
    "Accept":        "application/json",
  };
  // IBM API Gateway requires X-IBM-Client-Id
  // Use explicit clientId field first; fall back to JWT decode for backwards compat
  const clientId = settings.clientId?.trim() || extractClientIdFromJwt(settings.bearerToken);
  if (clientId) headers["X-IBM-Client-Id"] = clientId;
  return headers;
}

/* ─── Validate — 4 required fields ──────────────────────────────────────── */
export function validateSettings(settings: TcsSettings): string[] {
  const errs: string[] = [];
  if (!settings.bearerToken?.trim())
    errs.push("Bearer Token is empty — paste your JWT from TCS ENVO Portal in Couriers → TCS Settings");
  if (!settings.clientId?.trim()) {
    // Try JWT fallback — if it works, warn but don't error
    const fromJwt = extractClientIdFromJwt(settings.bearerToken ?? "");
    if (!fromJwt)
      errs.push("X-IBM-Client-Id is empty — find it in TCS ENVO Portal → My APIs → Subscriptions → Client ID");
  }
  if (!settings.username?.trim())
    errs.push("TCS Username is empty");
  if (!settings.password?.trim())
    errs.push("TCS Password is empty");
  return errs;
}

/* ─── HTTP helper ─────────────────────────────────────────────────────────── */
export function httpReq(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: Record<string, any> | null,
  timeoutMs = 20000,
): Promise<{ status: number; text: string; data: Record<string, any> }> {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const bodyStr = body != null ? JSON.stringify(body) : null;

    const reqHeaders: Record<string, string> = { ...headers };
    if (bodyStr != null) {
      reqHeaders["Content-Length"] = Buffer.byteLength(bodyStr).toString();
    }

    const mod = isHttps ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   method.toUpperCase(),
      headers:  reqHeaders,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", c => chunks.push(Buffer.from(c)));
      res.on("end",  () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data: Record<string, any> = {};
        try { data = JSON.parse(text); } catch { data = { _raw: text }; }
        resolve({ status: res.statusCode ?? 0, text, data });
      });
      res.on("error", reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`TCS HTTP timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/* ─── Weight helper ──────────────────────────────────────────────────────── */
function tcsWeight(raw?: number | string): number {
  if (raw == null) return 0.5;
  const s = String(raw).toLowerCase().trim();
  if (s.endsWith("g"))  return Math.max(0.5, parseFloat(s) / 1000);
  if (s.endsWith("kg")) return Math.max(0.5, parseFloat(s));
  const n = Number(raw);
  if (!isNaN(n) && n >= 100) return Math.max(0.5, n / 1000); /* grams */
  return Math.max(0.5, isNaN(n) || n <= 0 ? 0.5 : n);
}

/* ─── Tracking URL ───────────────────────────────────────────────────────── */
export function getTcsTrackingUrl(cn: string): string {
  return `${TCS_TRACKING_LINK}?cg=${encodeURIComponent(cn)}`;
}

/* ─── Test connection ─────────────────────────────────────────────────────
 * Calls GET /cities with Bearer token to verify credentials are working.
 */
export async function testConnection(
  settings: TcsSettings,
): Promise<{ ok: boolean; steps: Array<{ step: string; status: string; detail: string; raw?: string }> }> {
  type S = "ok" | "fail" | "info" | "warn";
  const steps: Array<{ step: string; status: S; detail: string; raw?: string }> = [];

  const errs = validateSettings(settings);
  if (errs.length > 0) {
    steps.push({ step: "Missing fields", status: "fail", detail: errs.join("\n") });
    return { ok: false, steps };
  }

  const explicitClientId = settings.clientId?.trim() || null;
  const jwtClientId = extractClientIdFromJwt(settings.bearerToken);
  const resolvedClientId = explicitClientId ?? jwtClientId;

  steps.push({
    step: "Config", status: "info",
    detail: `username: ${settings.username} | token: ${settings.bearerToken.slice(0, 20)}… | X-IBM-Client-Id: ${resolvedClientId ?? "(MISSING)"} | mode: ${settings.sandbox ? "SANDBOX" : "PRODUCTION"}`,
  });

  if (resolvedClientId) {
    const src = explicitClientId ? "entered in settings" : "auto-decoded from JWT";
    steps.push({ step: "X-IBM-Client-Id", status: "ok", detail: `✅ clientId=${resolvedClientId} (${src}) — will be sent as X-IBM-Client-Id header` });
  } else {
    steps.push({
      step: "X-IBM-Client-Id",
      status: "fail",
      detail: "❌ X-IBM-Client-Id is MISSING — IBM API Gateway will reject every request with 401.\n\n✅ ACTION: Go to TCS ENVO Portal → My APIs → Subscriptions → copy your Client ID → paste it in the X-IBM-Client-Id field in Couriers → TCS Settings.",
    });
    return { ok: false, steps };
  }

  const baseUrl = settings.sandbox ? TCS_COD_SANDBOX_URL : TCS_COD_URL;
  const headers = getAuthHeaders(settings);
  const t0 = Date.now();

  /* Test GET /cities — exists in COD API swagger */
  try {
    const { status, text, data } = await httpReq(`${baseUrl}/cities`, "GET", headers, undefined, 15000);
    /* COD API returns { city: [...] } or { returnStatus: { code: "0200" }, city: [...] } */
    const cities: any[] = Array.isArray(data?.city) ? data.city
      : Array.isArray(data) ? data : [];
    const ok = status < 300 && (cities.length > 0 || status === 200);
    steps.push({
      step: "GET /cities",
      status: ok ? "ok" : "fail",
      detail: ok
        ? `✅ ${cities.length > 0 ? cities.length + " cities" : "Response OK"} (${Date.now() - t0}ms) — Bearer + X-IBM-Client-Id accepted`
        : `HTTP ${status} — ${text.slice(0, 300)}`,
      raw: ok ? undefined : text.slice(0, 500),
    });
    if (!ok) return { ok: false, steps };
  } catch (e: any) {
    const isSandbox = settings.sandbox;
    const econnreset = String(e.message).includes("ECONNRESET") || String(e.message).includes("ECONNREFUSED") || String(e.message).includes("timeout");
    steps.push({
      step: "GET /cities",
      status: "fail",
      detail: econnreset && isSandbox
        ? `Sandbox server is not responding (${e.message}).\n\n⚠️ TCS Sandbox may be offline or unavailable.\n✅ ACTION: In Couriers → TCS Settings → scroll down → disable Sandbox Mode → Save → Test again.`
        : `Network error: ${e.message}`,
    });
    return { ok: false, steps };
  }

  steps.push({ step: "Ready", status: "ok", detail: "✅ Auth working. POST /create-order is ready for bookings." });
  return { ok: true, steps };
}

/* ─── Create Booking ──────────────────────────────────────────────────────
 * POST {TCS_COD_URL}/create-order
 *   Header: Authorization: Bearer {bearerToken}
 *   Body:   { userName, password, consigneeName, consigneeAddress, consigneeMobNo,
 *             consigneeEmail, originCityName, destinationCityName, weight, pieces,
 *             codAmount, customerReferenceNo, services, productDetails, fragile }
 *   Response: { returnStatus: { code: "0200" }, bookingReply: { CN: "..." } }
 */
export async function createBooking(
  settings: TcsSettings,
  order: {
    id?: number | string;
    orderNumber?: string | number;
    paymentMethod?: string;
    total?: number | string;
    weight?: number | string;
    pieces?: number;
    items?: Array<{ name: string }>;
    specialInstructions?: string;
    notes?: string;
    fragile?: boolean;
  },
  address: {
    name?: string; firstName?: string;
    address?: string; address1?: string; address2?: string;
    city?: string;
    phone?: string; email?: string;
  },
  service?: string,
): Promise<{ trackingId: string; trackingUrl: string; rawResponse: Record<string, any> }> {

  /* Validate config */
  const configErrs = validateSettings(settings);
  if (configErrs.length > 0) throw new Error(`TCS config error:\n• ${configErrs.join("\n• ")}`);

  /* Validate order fields */
  const errs: string[] = [];
  const rawPhone = (address.phone ?? "").replace(/\D/g, "");
  if (rawPhone.length < 10) errs.push(`Phone invalid: "${address.phone}" — need 10–11 digit Pakistani number`);
  const destCity = (address.city ?? "").trim();
  if (!destCity) errs.push("Consignee city is empty");
  const addr = [address.address1 ?? address.address, address.address2].filter(Boolean).join(", ").trim();
  if (!addr) errs.push("Consignee address is empty");
  if (errs.length > 0) throw new Error(`TCS booking validation:\n• ${errs.join("\n• ")}`);

  const weightKg    = tcsWeight(order.weight ?? settings.defaultWeight);
  const pieces      = Math.max(1, parseInt(String(order.pieces ?? 1), 10));
  const isCod       = !order.paymentMethod || order.paymentMethod === "cod";
  const codAmount   = isCod ? String(Math.round(Number(order.total ?? 0))) : "0";
  const items       = Array.isArray(order.items) ? order.items : [];
  const productDesc = items.length > 0 ? items.map(i => i.name).join(", ").slice(0, 100) : "Dry Fruits";
  const orderRef    = String(order.orderNumber ?? order.id ?? Date.now());
  const svcCode     = service ?? settings.serviceCode ?? "O";
  const isFragile   = order.fragile ?? settings.fragile ?? false;
  const originCity  = (settings.shipperCity ?? "Lahore").trim();
  const fullName    = (address.name ?? address.firstName ?? "Customer").trim();
  const mobNo       = rawPhone.length === 10 ? `0${rawPhone}` : rawPhone;

  const payload: Record<string, any> = {
    userName:            settings.username,
    password:            settings.password,
    costCenterCode:      (settings.costCenterCode ?? "").trim(),
    consigneeName:       fullName.slice(0, 100),
    consigneeAddress:    addr.slice(0, 200),
    consigneeMobNo:      mobNo,
    consigneeEmail:      (address.email ?? "").slice(0, 100),
    originCityName:      originCity,
    destinationCityName: destCity.slice(0, 100),
    weight:              weightKg,
    pieces:              pieces,
    codAmount:           codAmount,
    customerReferenceNo: orderRef.slice(0, 50),
    services:            svcCode,
    productDetails:      productDesc,
    fragile:             isFragile ? "Yes" : "No",
  };

  const remarks = (order.specialInstructions ?? order.notes ?? settings.defaultRemarks ?? "").trim();
  if (remarks) payload.remarks = remarks.slice(0, 200);

  const baseUrl  = settings.sandbox ? TCS_COD_SANDBOX_URL : TCS_COD_URL;
  const bookUrl  = `${baseUrl}/create-order`;
  const headers  = getAuthHeaders(settings);
  const t0       = Date.now();

  logger.info({ bookUrl, username: settings.username, orderRef, weightKg, codAmount, originCity, destCity }, "TCS — booking");

  let result: Awaited<ReturnType<typeof httpReq>>;
  try {
    result = await httpReq(bookUrl, "POST", headers, payload, 25000);
  } catch (netErr: any) {
    pushLog({ ts: new Date().toISOString(), step: "booking", url: bookUrl, method: "POST", reqBody: `order:${orderRef}`, httpStatus: null, success: false, error: netErr.message, durationMs: Date.now() - t0 });
    throw new Error(`TCS network error: ${netErr.message}`);
  }

  const durationMs = Date.now() - t0;
  const { status, text, data } = result;

  pushLog({
    ts: new Date().toISOString(), step: "booking", url: bookUrl, method: "POST",
    reqBody: JSON.stringify({ ...payload, password: "●●●" }).slice(0, 400),
    httpStatus: status, resBody: text.slice(0, 600), durationMs, success: false,
  });

  /* Extract CN: official field is bookingReply.CN */
  const cn =
    data?.bookingReply?.CN  ??
    data?.CN                ??
    data?.consignmentNo     ??
    data?.consignment_no    ??
    data?.ConsignmentNo;

  if (!cn || String(cn).trim() === "") {
    const rs     = data?.returnStatus ?? {};
    const errMsg = rs.message ? `TCS error ${rs.code ?? ""}: ${rs.message}` : `HTTP ${status}`;
    pushLog({ ts: new Date().toISOString(), step: "booking", url: bookUrl, method: "POST", httpStatus: status, resBody: text.slice(0, 400), durationMs, success: false, error: errMsg });
    throw new Error(`TCS booking failed — no CN in response.\n${errMsg}\nRaw: ${text.slice(0, 300)}`);
  }

  if (_log[0]?.step === "booking") _log[0].success = true;
  logger.info({ cn, durationMs, orderRef }, "TCS — booking SUCCESS");
  return { trackingId: String(cn), trackingUrl: getTcsTrackingUrl(String(cn)), rawResponse: data };
}

/* ─── Track Shipment ──────────────────────────────────────────────────────
 * GET https://api.tcscourier.com/production/track/v1/shipments/detail?consignmentNo=CN
 * Header: Authorization: Bearer {bearerToken}
 */
export async function trackShipment(
  settings: TcsSettings,
  trackingId: string,
): Promise<{ status: string; rawResponse: Record<string, any> }> {
  if (!settings.bearerToken?.trim()) {
    return { status: "in_transit", rawResponse: { note: "Bearer token not configured." } };
  }

  const trackUrl = settings.sandbox ? `https://api.tcscourier.com/sandbox/track/v1` : TCS_TRACK_URL;
  const url = `${trackUrl}/shipments/detail?consignmentNo=${encodeURIComponent(trackingId)}`;
  const t0  = Date.now();

  logger.info({ url, trackingId }, "TCS — tracking");

  let result: Awaited<ReturnType<typeof httpReq>>;
  try {
    result = await httpReq(url, "GET", getAuthHeaders(settings), undefined, 15000);
  } catch (e: any) {
    pushLog({ ts: new Date().toISOString(), step: "tracking", url, method: "GET", httpStatus: null, success: false, error: e.message, durationMs: Date.now() - t0 });
    return { status: "in_transit", rawResponse: { error: e.message } };
  }

  const { status, text, data } = result;
  pushLog({ ts: new Date().toISOString(), step: "tracking", url, method: "GET", httpStatus: status, resBody: text.slice(0, 400), durationMs: Date.now() - t0, success: status < 400 });

  const rs = data?.returnStatus ?? {};
  if (rs.code && rs.code !== "0200") {
    return { status: "in_transit", rawResponse: data };
  }

  const detail     = data?.TrackDetailReply ?? data;
  const deliveries: any[] = Array.isArray(detail?.DeliveryInfo) ? detail.DeliveryInfo : [];
  const checkpoints: any[] = Array.isArray(detail?.Checkpoints)  ? detail.Checkpoints  : [];
  const latest  = deliveries[0];
  const chk     = checkpoints[0];
  let shipStatus = "in_transit";

  const codeMap: Record<string, string> = { OK: "delivered", DEL: "delivered", RO: "returned", RET: "returned", OFD: "out_for_delivery" };
  if (latest?.code) shipStatus = codeMap[String(latest.code).toUpperCase()] ?? shipStatus;

  if (shipStatus === "in_transit") {
    const s = String(latest?.status ?? chk?.status ?? "").toLowerCase();
    if (s.includes("deliver"))          shipStatus = "delivered";
    else if (s.includes("return"))      shipStatus = "returned";
    else if (s.includes("out for del")) shipStatus = "out_for_delivery";
  }

  logger.info({ trackingId, shipStatus, durationMs: Date.now() - t0 }, "TCS — tracking done");
  return { status: shipStatus, rawResponse: data };
}
