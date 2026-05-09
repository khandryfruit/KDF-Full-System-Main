/**
 * TCS Courier Integration — Official COD API v1
 *
 * Booking API (api.tcscourier.com/production/v1/cod):
 *   Auth: Authorization: Bearer {bearerToken} + X-IBM-Client-Id: {clientId}
 *   POST /create-order  → bookingReply.CN = consignment number
 *   GET  /countries, /cities  → reference data
 *   PUT  /cancel-order  → cancel shipment
 *
 * Tracking API (api.tcscourier.com/production/track/v1):
 *   Auth: X-IBM-Client-Id: {trackingClientId}  (may be same clientId)
 *   GET  /shipments/detail?consignmentNo={CN}
 *
 * NOTE: bearerToken is a long-lived JWT (~10 yr) obtained from TCS ENVO Portal.
 * Paste it directly — no auto-generation needed.
 */

import https from "node:https";
import http  from "node:http";
import { logger } from "./logger";

/* ─── Constants ─────────────────────────────────────────────────────────── */
export const TCS_COD_URL         = "https://api.tcscourier.com/production/v1/cod";
export const TCS_COD_SANDBOX_URL = "https://api.tcscourier.com/sandbox/v1/cod";

/* Tracking API — IBM API Gateway */
export const TCS_TRACK_URL         = "https://api.tcscourier.com/production/track/v1";
export const TCS_TRACK_SANDBOX_URL = "https://api.tcscourier.com/sandbox/track/v1";

/* Public tracking link */
export const TCS_TRACKING_LINK = "https://ociconnect.tcscourier.com/tracking/index.html";

/* ─── Settings shape ────────────────────────────────────────────────────── */
export interface TcsSettings {
  /* COD API auth — both used as request headers */
  bearerToken: string;   /* Long-lived JWT from TCS ENVO Portal — paste directly  */
  clientId:    string;   /* X-IBM-Client-Id embedded in JWT payload (e.g. "215627768") */

  /* Booking body credentials */
  username: string;   /* TCS username — goes into booking body as "userName"  */
  password: string;   /* TCS password — goes into booking body as "password"  */

  /* Tracking API (IBM Gateway) — may be same as clientId */
  trackingClientId?: string;

  /* Booking config */
  costcentercode?: string;   /* costCenterCode in booking payload */
  serviceCode?:    string;   /* services field: O=Overnight, S=SameDay, E=Economy */
  defaultWeight?:  number;   /* kg, decimal e.g. 0.5 */
  fragile?:        boolean;
  defaultRemarks?: string;

  /* Shipper / origin info */
  shipperName?:    string;
  shipperAddress?: string;
  shipperCity?:    string;   /* originCityName in booking payload */
  shipperPhone?:   string;

  /* Flags */
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

export function clearCache(): { bearerCleared: number; ecomCleared: number } {
  /* No token cache in COD API flow — bearer token is stored in settings */
  logger.info({}, "TCS — clearCache called (no cache in COD flow)");
  return { bearerCleared: 0, ecomCleared: 0 };
}

export function getCacheStatus() {
  return { bearer: [], ecom: [], note: "COD API uses stored bearer token — no in-memory cache" };
}

/* ─── HTTP helper ────────────────────────────────────────────────────────── */
export function httpReq(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: Record<string, any> | null,
  timeoutMs = 18000,
): Promise<{ status: number; text: string; data: Record<string, any> }> {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const bodyStr = body != null ? JSON.stringify(body) : null;

    const reqHeaders: Record<string, string> = { ...headers };
    if (bodyStr != null) {
      reqHeaders["Content-Type"]   = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(bodyStr).toString();
    }

    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   method.toUpperCase(),
      headers:  reqHeaders,
    };

    const mod = isHttps ? https : http;
    const req = mod.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(Buffer.from(c)));
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
    if (bodyStr != null) req.write(bodyStr);
    req.end();
  });
}

/* ─── Auth Headers ───────────────────────────────────────────────────────
 * COD API requires both:
 *   Authorization: Bearer {bearerToken}
 *   X-IBM-Client-Id: {clientId}
 */
export function getAuthHeaders(settings: TcsSettings): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept":       "application/json",
    "Content-Type": "application/json",
  };

  const token    = settings.bearerToken?.trim();
  const clientId = settings.clientId?.trim();

  if (token)    headers["Authorization"]   = `Bearer ${token}`;
  if (clientId) headers["X-IBM-Client-Id"] = clientId;

  return headers;
}

/* ─── Validate settings before booking ──────────────────────────────────── */
export function validateSettings(settings: TcsSettings): string[] {
  const errs: string[] = [];
  if (!settings.bearerToken?.trim())
    errs.push("Bearer Token is empty — paste your long-lived JWT from TCS ENVO Portal in Couriers → TCS Settings");
  if (!settings.clientId?.trim())
    errs.push("X-IBM-Client-Id is empty — enter the clientId embedded in your JWT (e.g. 215627768)");
  if (!settings.username?.trim())
    errs.push("TCS Username is empty");
  if (!settings.password?.trim())
    errs.push("TCS Password is empty");
  return errs;
}

/* ─── Weight helper ──────────────────────────────────────────────────────
 * Returns decimal kg (e.g. 0.5). Handles "500g", "1kg", 0.5, 1
 */
function tcsWeight(raw?: number | string): number {
  if (raw == null) return 0.5;
  const s = String(raw).trim().toLowerCase();
  if (s.endsWith("g"))   return Math.max(0.5, parseFloat(s) / 1000);
  if (s.endsWith("kg"))  return Math.max(0.5, parseFloat(s));
  const n = Number(raw);
  /* If value looks like grams (>= 100), convert; else treat as kg */
  if (!isNaN(n) && n >= 100) return Math.max(0.5, n / 1000);
  return Math.max(0.5, isNaN(n) || n <= 0 ? 0.5 : n);
}

/* ─── Tracking URL ───────────────────────────────────────────────────────── */
export function getTcsTrackingUrl(trackingId: string): string {
  return `${TCS_TRACKING_LINK}?cg=${encodeURIComponent(trackingId)}`;
}

/* ─── Test COD API connection (GET /cities) ─────────────────────────────── */
export async function testConnection(
  settings: TcsSettings,
): Promise<{ ok: boolean; steps: Array<{ step: string; status: string; detail: string; raw?: string }> }> {
  type S = "ok" | "fail" | "info" | "warn";
  const steps: Array<{ step: string; status: S; detail: string; raw?: string }> = [];

  /* Validate config */
  const configErrs = validateSettings(settings);
  steps.push({
    step:   "Config",
    status: configErrs.length === 0 ? "info" : "warn",
    detail: configErrs.length === 0
      ? `clientId: ${settings.clientId} | username: ${settings.username} | mode: ${settings.sandbox ? "SANDBOX" : "PRODUCTION"}`
      : `Missing: ${configErrs.join("; ")}`,
  });
  if (configErrs.length > 0) return { ok: false, steps };

  const baseUrl = settings.sandbox ? TCS_COD_SANDBOX_URL : TCS_COD_URL;
  const headers = getAuthHeaders(settings);

  /* Test /cities */
  const citiesUrl = `${baseUrl}/cities`;
  const t0 = Date.now();
  try {
    const { status, text, data } = await httpReq(citiesUrl, "GET", headers, undefined, 12000);
    const cities: any[] = Array.isArray(data?.city) ? data.city : [];
    steps.push({
      step:   "GET /cities",
      status: status < 300 && cities.length > 0 ? "ok" : "fail",
      detail: status < 300 && cities.length > 0
        ? `✅ ${cities.length} cities returned (${Math.round(Date.now() - t0)}ms)`
        : `HTTP ${status} — ${text.slice(0, 200)}`,
      raw: JSON.stringify(data, null, 2).slice(0, 600),
    });
    if (status >= 300 || cities.length === 0) return { ok: false, steps };
  } catch (e: any) {
    steps.push({ step: "GET /cities", status: "fail", detail: `Network error: ${e.message}` });
    return { ok: false, steps };
  }

  /* Test /countries */
  const countriesUrl = `${baseUrl}/countries`;
  try {
    const { status, data } = await httpReq(countriesUrl, "GET", headers, undefined, 10000);
    const countries: any[] = Array.isArray(data?.country) ? data.country : [];
    steps.push({
      step:   "GET /countries",
      status: status < 300 && countries.length > 0 ? "ok" : "warn",
      detail: status < 300 && countries.length > 0
        ? `✅ ${countries.length} countries returned`
        : `HTTP ${status}`,
    });
  } catch (e: any) {
    steps.push({ step: "GET /countries", status: "warn", detail: `${e.message}` });
  }

  steps.push({ step: "Auth", status: "ok", detail: "✅ Bearer token + X-IBM-Client-Id are working. Ready to book." });
  return { ok: true, steps };
}

/* ─── Create Booking ─────────────────────────────────────────────────────
 * POST {TCS_COD_URL}/create-order
 *   Headers: Authorization: Bearer {token} + X-IBM-Client-Id: {clientId}
 *   Body: { userName, password, costCenterCode, consigneeName, consigneeAddress,
 *           consigneeMobNo, consigneeEmail, originCityName, destinationCityName,
 *           weight, pieces, codAmount, customerReferenceNo, services, productDetails, fragile }
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
    city?: string; zip?: string; postal_code?: string;
    phone?: string; email?: string;
  },
  service?: string,
): Promise<{ trackingId: string; trackingUrl: string; rawResponse: Record<string, any> }> {

  /* ── Pre-flight validation ── */
  const configErrs = validateSettings(settings);
  const bookingErrs: string[] = [];

  const rawPhone = (address.phone ?? "").replace(/\D/g, "");
  if (rawPhone.length < 10)
    bookingErrs.push(`Consignee phone invalid: "${address.phone}" — need 10–11 digit Pakistani number`);

  const destCity = (address.city ?? "").trim();
  if (!destCity)
    bookingErrs.push("Consignee city is empty");

  const addr = [address.address1 ?? address.address, address.address2]
    .filter(Boolean).join(", ").trim();
  if (!addr)
    bookingErrs.push("Consignee address is empty");

  const weightKg = tcsWeight(order.weight ?? settings.defaultWeight);

  const allErrs = [...configErrs, ...bookingErrs];
  if (allErrs.length > 0)
    throw new Error(`TCS booking validation failed:\n• ${allErrs.join("\n• ")}`);

  /* ── Build payload ── */
  const fullName     = (address.name ?? address.firstName ?? "Customer").trim();
  const pieces       = Math.max(1, parseInt(String(order.pieces ?? 1), 10));
  const isCod        = !order.paymentMethod || order.paymentMethod === "cod";
  const codAmount    = isCod ? String(Math.round(Number(order.total ?? 0))) : "0";
  const items        = Array.isArray(order.items) ? order.items : [];
  const productDesc  = items.length > 0 ? items.map(i => i.name).join(", ").slice(0, 100) : "Dry Fruits";
  const orderRef     = String(order.orderNumber ?? order.id ?? Date.now());
  const svcCode      = (service ?? settings.serviceCode ?? "O");
  const originCity   = (settings.shipperCity ?? "Lahore").trim();
  const isFragile    = order.fragile ?? settings.fragile ?? false;
  const remarks      = (order.specialInstructions ?? order.notes ?? settings.defaultRemarks ?? "").slice(0, 200);

  /* Normalize phone: 03XX → 0311XXXXXXX (keep as-is if starts with 0) */
  const consigneeMobNo = rawPhone.length === 10 ? `0${rawPhone}` : rawPhone;

  const payload: Record<string, any> = {
    userName:           settings.username,
    password:           settings.password,
    costCenterCode:     settings.costcentercode ?? "",
    consigneeName:      fullName.slice(0, 100),
    consigneeAddress:   addr.slice(0, 200),
    consigneeMobNo:     consigneeMobNo,
    consigneeEmail:     (address.email ?? "").slice(0, 100),
    originCityName:     originCity,
    destinationCityName: destCity.slice(0, 100),
    weight:             weightKg,          /* number, decimal kg — e.g. 0.5 */
    pieces:             pieces,
    codAmount:          codAmount,         /* string per swagger */
    customerReferenceNo: orderRef.slice(0, 50),
    services:           svcCode,           /* O=Overnight, S=SameDay, E=Economy */
    productDetails:     productDesc,
    fragile:            isFragile ? "Yes" : "No",
  };

  if (remarks) payload.remarks = remarks;

  const baseUrl  = settings.sandbox ? TCS_COD_SANDBOX_URL : TCS_COD_URL;
  const bookUrl  = `${baseUrl}/create-order`;
  const headers  = getAuthHeaders(settings);
  const t0       = Date.now();

  logger.info({ bookUrl, username: settings.username, orderRef, weightKg, codAmount, svcCode, originCity, destCity }, "TCS booking — calling COD API");

  let result: Awaited<ReturnType<typeof httpReq>>;
  try {
    result = await httpReq(bookUrl, "POST", headers, payload, 25000);
  } catch (netErr: any) {
    pushLog({ ts: new Date().toISOString(), step: "booking", url: bookUrl, method: "POST", reqBody: `order:${orderRef}`, httpStatus: null, success: false, error: netErr.message, durationMs: Date.now() - t0 });
    throw new Error(`TCS booking network error: ${netErr.message}`);
  }

  const durationMs = Date.now() - t0;
  const { status, text, data } = result;

  pushLog({
    ts: new Date().toISOString(), step: "booking", url: bookUrl, method: "POST",
    reqBody: JSON.stringify({ ...payload, password: "●●●" }).slice(0, 600),
    httpStatus: status, resBody: text.slice(0, 600), durationMs, success: false,
  });

  /* ── Parse response ──
   * COD API response: { returnStatus: { code: "0200", status: "SUCCESS" }, bookingReply: { CN: "..." } }
   */
  const rs = data?.returnStatus ?? {};
  const cn = data?.bookingReply?.CN
          ?? data?.CN
          ?? data?.consignmentNo ?? data?.consignment_no
          ?? data?.ConsignmentNo ?? data?.consignmentNumber;

  if (!cn || String(cn).trim() === "") {
    const rsMsg    = rs.message ?? rs.status ?? "";
    const rsCode   = rs.code ?? "";
    const httpMsg  = `HTTP ${status}`;
    const errDetail = rsMsg || rsCode ? `TCS error ${rsCode}: ${rsMsg}` : httpMsg;
    const raw = text.slice(0, 400);

    pushLog({ ts: new Date().toISOString(), step: "booking", url: bookUrl, method: "POST", httpStatus: status, resBody: raw, durationMs, success: false, error: errDetail });
    throw new Error(
      `TCS booking failed — no consignment number in response.\n` +
      `${errDetail}\nResponse: ${raw}`
    );
  }

  /* Mark success in log */
  if (_log[0]?.step === "booking") _log[0].success = true;
  logger.info({ cn, durationMs, username: settings.username, orderRef }, "TCS booking — SUCCESS");
  return { trackingId: String(cn), trackingUrl: getTcsTrackingUrl(String(cn)), rawResponse: data };
}

/* ─── Track Shipment ─────────────────────────────────────────────────────
 * Official TCS Tracking API (IBM API Gateway):
 *   GET https://api.tcscourier.com/production/track/v1/shipments/detail
 *   Query: consignmentNo={CN}
 *   Header: X-IBM-Client-Id: {trackingClientId}
 *
 * Response: { returnStatus: { code: "0200" }, TrackDetailReply: { DeliveryInfo, Checkpoints } }
 * DeliveryInfo[].code: OK=delivered, RO=returned, OFD=out_for_delivery
 */
export async function trackShipment(
  settings: TcsSettings,
  trackingId: string,
): Promise<{ status: string; rawResponse: Record<string, any> }> {
  /* Use trackingClientId if set, otherwise fall back to clientId */
  const clientId = (settings.trackingClientId?.trim() || settings.clientId?.trim());
  const trackUrl = settings.sandbox ? TCS_TRACK_SANDBOX_URL : TCS_TRACK_URL;
  const url = `${trackUrl}/shipments/detail?consignmentNo=${encodeURIComponent(trackingId)}`;
  const t0  = Date.now();

  if (!clientId) {
    logger.warn({ trackingId }, "TCS tracking — no clientId configured");
    return {
      status: "in_transit",
      rawResponse: { note: "X-IBM-Client-Id not configured. Add it in Couriers → TCS Settings." },
    };
  }

  logger.info({ url, trackingId }, "TCS tracking — calling official tracking API");

  let result: Awaited<ReturnType<typeof httpReq>>;
  try {
    result = await httpReq(url, "GET", { "X-IBM-Client-Id": clientId, "Accept": "application/json" }, undefined, 15000);
  } catch (netErr: any) {
    pushLog({ ts: new Date().toISOString(), step: "tracking", url, method: "GET", httpStatus: null, success: false, error: netErr.message, durationMs: Date.now() - t0 });
    return { status: "in_transit", rawResponse: { error: netErr.message } };
  }

  const { status, text, data } = result;
  const durationMs = Date.now() - t0;
  pushLog({ ts: new Date().toISOString(), step: "tracking", url, method: "GET", httpStatus: status, resBody: text.slice(0, 600), durationMs, success: status < 400 });

  /* Check TCS returnStatus */
  const rs = data?.returnStatus ?? {};
  if (rs.code && rs.code !== "0200") {
    logger.warn({ code: rs.code, message: rs.message, trackingId }, "TCS tracking — non-success returnStatus");
    return { status: "in_transit", rawResponse: data };
  }

  /* Parse tracking detail */
  const detail      = data?.TrackDetailReply ?? data;
  const deliveries: any[] = Array.isArray(detail?.DeliveryInfo) ? detail.DeliveryInfo : [];
  const checkpoints: any[] = Array.isArray(detail?.Checkpoints) ? detail.Checkpoints : [];

  const latest = deliveries[0];
  const chk    = checkpoints[0];

  let shipStatus = "in_transit";

  if (latest?.code) {
    const code = String(latest.code).toUpperCase();
    if      (code === "OK" || code === "DEL") shipStatus = "delivered";
    else if (code === "RO" || code === "RET") shipStatus = "returned";
    else if (code === "OFD")                  shipStatus = "out_for_delivery";
  }

  if (shipStatus === "in_transit" && latest?.status) {
    const s = String(latest.status).toLowerCase();
    if      (s.includes("deliver"))          shipStatus = "delivered";
    else if (s.includes("return"))           shipStatus = "returned";
    else if (s.includes("out for delivery")) shipStatus = "out_for_delivery";
  }

  if (shipStatus === "in_transit" && chk?.status) {
    const s = String(chk.status).toLowerCase();
    if      (s.includes("deliver"))          shipStatus = "delivered";
    else if (s.includes("return"))           shipStatus = "returned";
    else if (s.includes("out for delivery")) shipStatus = "out_for_delivery";
  }

  logger.info({ trackingId, shipStatus, durationMs }, "TCS tracking — complete");
  return { status: shipStatus, rawResponse: data };
}
