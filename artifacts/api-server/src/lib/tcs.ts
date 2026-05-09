/**
 * TCS Courier Integration — Clean Modular Implementation
 *
 * Booking Auth Flow (ociconnect.tcscourier.com):
 *   Step 1 → POST /auth/api/auth          {clientId, clientSecret}  → bearerToken
 *   Step 2 → GET  /ecom/api/authentication/token + Bearer header   → accesstoken
 *   Book   → POST /ecom/api/booking/create + Bearer header + accesstoken in body
 *
 * Tracking API (api.tcscourier.com — IBM API Gateway, completely separate):
 *   GET /production/track/v1/shipments/detail?consignmentNo={CN}
 *   Header: X-IBM-Client-Id: {trackingClientId}
 *   Note: trackingClientId is different from booking clientId/clientSecret
 */

import https from "node:https";
import http  from "node:http";
import { logger } from "./logger";

/* ─── Constants ─────────────────────────────────────────────────────────── */
/* Booking API (ECOM, 3-step auth) */
export const TCS_PROD_URL    = "https://ociconnect.tcscourier.com";
export const TCS_SANDBOX_URL = "https://devconnect.tcscourier.com";
/* Tracking API (IBM API Gateway — different auth: X-IBM-Client-Id header) */
export const TCS_TRACK_URL         = "https://api.tcscourier.com/production/track/v1";
export const TCS_TRACK_SANDBOX_URL = "https://api.tcscourier.com/sandbox/track/v1";

/* ─── Settings shape ────────────────────────────────────────────────────── */
export interface TcsSettings {
  /* Booking Step 1 — ENVO Portal app credentials → bearerToken */
  clientId:     string;
  clientSecret: string;
  /* Booking Step 2 — TCS user credentials → accesstoken */
  username: string;
  password: string;
  /* Tracking API — IBM API Gateway (completely separate from booking auth)
   * Get from: TCS Developer Portal → My Apps → X-IBM-Client-Id            */
  trackingClientId?: string;
  /* Booking */
  tcsAccountNo:    string;   /* From TCS contract — NOT the username */
  costcentercode?: string;
  serviceCode?:    string;   /* O=Overnight, S=SameDay, E=Economy, 2D, 3D */
  defaultWeight?:  number;
  defaultRemarks?: string;
  /* Shipper info */
  shipperName?:     string;
  shipperAddress?:  string;
  shipperCity?:     string;
  shipperCityCode?: string;
  shipperPhone?:    string;
  /* Flags */
  sandbox?:                  boolean;
  preventDuplicateBookings?: boolean;
}

/* ─── Request log ───────────────────────────────────────────────────────── */
export interface TcsLogEntry {
  id:         number;
  ts:         string;
  step:       string;  /* "step1_bearer" | "step2_ecom" | "booking" | "tracking" | "label" */
  url:        string;
  method:     string;
  reqBody?:   string;
  httpStatus?: number | null;
  resBody?:   string;
  durationMs?: number;
  success:    boolean;
  error?:     string;
}

let _logSeq = 0;
const _log: TcsLogEntry[] = [];

export function pushLog(e: Omit<TcsLogEntry, "id">) {
  _log.unshift({ ...e, id: ++_logSeq });
  if (_log.length > 100) _log.splice(100);
}

export function getLog(limit = 50) { return _log.slice(0, limit); }

/* ─── Token caches ──────────────────────────────────────────────────────── */
interface CacheEntry { token: string; expiresAt: number; }

const _bearerCache = new Map<string, CacheEntry>();
const _ecomCache   = new Map<string, CacheEntry>();

export function clearCache(): { bearerCleared: number; ecomCleared: number } {
  const b = _bearerCache.size;
  const e = _ecomCache.size;
  _bearerCache.clear();
  _ecomCache.clear();
  logger.info({ bearerCleared: b, ecomCleared: e }, "TCS — token cache cleared");
  return { bearerCleared: b, ecomCleared: e };
}

export function getCacheStatus() {
  const now = Date.now();
  const bearer = [..._bearerCache.entries()].map(([k, v]) => ({
    key: k,
    expiresInMin: Math.round((v.expiresAt - now) / 60000),
    valid: v.expiresAt > now + 60_000,
  }));
  const ecom = [..._ecomCache.entries()].map(([k, v]) => ({
    key: k,
    expiresInMin: Math.round((v.expiresAt - now) / 60000),
    valid: v.expiresAt > now + 60_000,
  }));
  return { bearer, ecom };
}

/* ─── HTTP helper — no GET+body restrictions (uses node:https directly) ── */
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
        try { data = JSON.parse(text); } catch { data = {}; }
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

/* ─── Step 1: Bearer Token ───────────────────────────────────────────────
 * POST /auth/api/auth  {clientid, clientsecret}  → accessToken (= bearerToken)
 */
export async function getBearerToken(settings: TcsSettings, baseUrl: string): Promise<string> {
  const { clientId, clientSecret } = settings;
  if (!clientId || !clientSecret) {
    throw new Error(
      "TCS Step 1: clientId and clientSecret are required. " +
      "Get them from your TCS ENVO Portal and add them in Couriers → TCS Settings."
    );
  }

  const cacheKey = `bearer:${clientId}`;
  const cached   = _bearerCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 2 * 60_000) {
    logger.info({ cacheKey }, "TCS Step 1 — bearer cache hit");
    return cached.token;
  }

  const url = `${baseUrl}/auth/api/auth`;
  const t0  = Date.now();

  logger.info({ url, clientId }, "TCS Step 1 — generating bearer token");

  let result: Awaited<ReturnType<typeof httpReq>>;
  try {
    /* Official guide uses GET with body (axios.get + data) — we try GET then POST */
    result = await httpReq(url, "GET", {}, { clientid: clientId, clientsecret: clientSecret });
    if (result.status === 405) {
      result = await httpReq(url, "POST", {}, { clientid: clientId, clientsecret: clientSecret });
    }
  } catch (err: any) {
    pushLog({ ts: new Date().toISOString(), step: "step1_bearer", url, method: "GET", httpStatus: null, success: false, error: err.message });
    throw new Error(`TCS Step 1 network error: ${err.message}`);
  }

  const durationMs = Date.now() - t0;
  const { status, text, data } = result;

  const token =
    data.accessToken  ?? data.access_token ??
    data.result?.accessToken ?? data.data?.accessToken ??
    data.token;

  pushLog({ ts: new Date().toISOString(), step: "step1_bearer", url, method: "GET", reqBody: `{clientid: "${clientId}", clientsecret: "●●●"}`, httpStatus: status, resBody: text.slice(0, 400), durationMs, success: !!token, error: token ? undefined : (data.message ?? data.error ?? `HTTP ${status}`) });

  if (!token) {
    const msg = data.message ?? data.error ?? data.statusMessage ?? `HTTP ${status}`;
    throw new Error(
      `TCS Step 1 failed (HTTP ${status}): ${msg}. ` +
      `Check clientId and clientSecret in TCS Settings.`
    );
  }

  /* Cache expiry: use response expiry or default 55 min */
  const expMs = data.expiry
    ? Math.max(new Date(data.expiry).getTime() - Date.now() - 60_000, 5 * 60_000)
    : 55 * 60_000;
  _bearerCache.set(cacheKey, { token, expiresAt: Date.now() + expMs });
  logger.info({ clientId, expiresInMin: Math.round(expMs / 60000) }, "TCS Step 1 — bearer token cached");
  return token;
}

/* ─── Step 2: ECOM Access Token ──────────────────────────────────────────
 * GET /ecom/api/authentication/token
 *   Authorization: Bearer {bearerToken}
 *   Credentials: query params (no Content-Length confusion on GET)
 * Response: { message: "success", accesstoken: "...", expiry: "..." }
 */
export async function getEcomToken(settings: TcsSettings, bearerToken: string, baseUrl: string): Promise<string> {
  const { username, password } = settings;
  if (!username || !password) {
    throw new Error(
      "TCS Step 2: username and password are required. " +
      "Add them in Couriers → TCS Settings → Credentials."
    );
  }

  const cacheKey = `ecom:${username}`;
  const cached   = _ecomCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 2 * 60_000) {
    logger.info({ cacheKey }, "TCS Step 2 — ecom cache hit");
    return cached.token;
  }

  /* Query params first (confirmed working by live curl test May 2026) */
  const qpUrl   = `${baseUrl}/ecom/api/authentication/token?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const bodyUrl  = `${baseUrl}/ecom/api/authentication/token`;
  const authHdr  = { "Authorization": `Bearer ${bearerToken}` };

  const attempts: Array<{ url: string; body: null | Record<string, any> }> = [
    { url: qpUrl,    body: null },                           /* query params — no body */
    { url: bodyUrl,  body: { username, password } },         /* json body lowercase */
    { url: bodyUrl,  body: { Username: username, Password: password } }, /* PascalCase */
  ];

  let lastStatus = 0;
  let lastMsg    = "";

  for (const { url, body } of attempts) {
    const t0 = Date.now();
    logger.info({ url: url.split("?")[0], hasQP: url.includes("?"), hasBody: body != null }, "TCS Step 2 — attempt");

    let result: Awaited<ReturnType<typeof httpReq>>;
    try {
      result = await httpReq(url, "GET", authHdr, body, 15000);
    } catch (netErr: any) {
      pushLog({ ts: new Date().toISOString(), step: "step2_ecom", url, method: "GET", httpStatus: null, success: false, error: netErr.message, durationMs: Date.now() - t0 });
      lastMsg = `Network error: ${netErr.message}`;
      continue;
    }

    const { status, text, data } = result;
    const durationMs = Date.now() - t0;

    const token =
      data.accesstoken  ?? data.accessToken ??
      data.token        ?? data.result?.accessToken ??
      data.data?.accesstoken;

    pushLog({ ts: new Date().toISOString(), step: "step2_ecom", url, method: "GET", reqBody: `{username: "${username}", password: "●●●"}`, httpStatus: status, resBody: text.slice(0, 400), durationMs, success: !!token, error: token ? undefined : (data.message ?? data.error ?? `HTTP ${status}`) });

    if (token) {
      const expMs = data.expiry
        ? Math.max(new Date(data.expiry).getTime() - Date.now() - 60_000, 5 * 60_000)
        : 55 * 60_000;
      _ecomCache.set(cacheKey, { token, expiresAt: Date.now() + expMs });
      logger.info({ username, expiresInMin: Math.round(expMs / 60000) }, "TCS Step 2 — ecom token cached");
      return token;
    }

    lastStatus = status;
    lastMsg    = data.message ?? data.error ?? data.statusMessage ?? `HTTP ${status}: ${text.slice(0, 150)}`;

    /* 401/403 = credentials/bearer rejected — stop immediately */
    if (status === 401 || status === 403) {
      throw new Error(
        `TCS Step 2 failed (HTTP ${status}): ${lastMsg}\n` +
        `ACTION: Your bearer token (Step 1) may be expired. ` +
        `Re-check clientId/clientSecret in TCS Settings or get a fresh token from TCS ENVO Portal.`
      );
    }

    /* 404/405 = wrong URL/method variant — try next */
    if (status === 404 || status === 405) continue;

    /* Any other response without token — unexpected */
    throw new Error(`TCS Step 2 unexpected response (HTTP ${status}): ${lastMsg}`);
  }

  throw new Error(`TCS Step 2 failed — all attempts exhausted. Last error: ${lastMsg} (HTTP ${lastStatus})`);
}

/* ─── Get both tokens in sequence ────────────────────────────────────── */
export async function getTcsTokens(
  settings: TcsSettings,
): Promise<{ bearerToken: string; ecomToken: string; baseUrl: string }> {
  const baseUrl    = settings.sandbox ? TCS_SANDBOX_URL : TCS_PROD_URL;
  const bearerToken = await getBearerToken(settings, baseUrl);
  const ecomToken   = await getEcomToken(settings, bearerToken, baseUrl);
  return { bearerToken, ecomToken, baseUrl };
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
function tcsWeight(raw: any): number {
  const n = Number(raw);
  return Math.max(0.5, isNaN(n) || n <= 0 ? 0.5 : n);
}

function tcsShipmentDate(): string {
  const now = new Date();
  const p   = (n: number) => String(n).padStart(2, "0");
  return `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}

export function getTcsTrackingUrl(trackingId: string): string {
  return `https://ociconnect.tcscourier.com/tracking/index.html?cg=${encodeURIComponent(trackingId)}`;
}

/* ─── Create Booking ─────────────────────────────────────────────────────
 * POST /ecom/api/booking/create
 *   Authorization: Bearer {bearerToken}
 *   Body: { accesstoken: ecomToken, shipperinfo, consigneeinfo, vendorinfo, shipmentinfo }
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

  const { bearerToken, ecomToken, baseUrl } = await getTcsTokens(settings);

  /* Pre-flight validation */
  const errs: string[] = [];
  if (!settings.tcsAccountNo?.trim())
    errs.push("TCS Account Number (tcsAccountNo) is empty — set it in Couriers → TCS Settings. NOTE: This is different from your username!");
  const phone = (address.phone ?? "").replace(/\D/g, "");
  if (phone.length < 10)
    errs.push(`Consignee phone invalid: "${address.phone}" — need 10–11 digit Pakistani number`);
  if (!address.city?.trim())
    errs.push("Consignee city is empty");
  const addr = [address.address1 ?? address.address, address.address2].filter(Boolean).join(", ").trim();
  if (!addr)
    errs.push("Consignee address is empty");
  const weightKg = tcsWeight(order.weight ?? settings.defaultWeight);
  if (weightKg <= 0)
    errs.push(`Weight must be > 0 kg (got: ${order.weight ?? settings.defaultWeight})`);
  if (errs.length > 0)
    throw new Error(`TCS booking validation failed:\n• ${errs.join("\n• ")}`);

  /* Build payload */
  const fullName  = (address.name ?? address.firstName ?? "Customer").trim();
  const parts     = fullName.split(/\s+/);
  const firstName = parts[0] ?? fullName;
  const lastName  = parts.length > 1 ? parts[parts.length - 1] : "";
  const middleName = parts.length > 2 ? parts.slice(1, -1).join(" ") : ".";
  const pieces    = Math.max(1, parseInt(String(order.pieces ?? 1), 10));
  const codAmount = order.paymentMethod === "cod" ? Number(order.total ?? 0) : 0;
  const items     = Array.isArray(order.items) ? order.items : [];
  const itemDesc  = items.length > 0 ? items.map(i => i.name).join(", ").slice(0, 100) : "KDF Nuts Products";
  const orderRef  = String(order.orderNumber ?? order.id ?? Date.now());
  const svcCode   = (service ?? settings.serviceCode ?? "O").slice(0, 6);

  const payload: Record<string, any> = {
    accesstoken:   ecomToken,   /* ECOM token in body — per official TCS guide */
    consignmentno: "",           /* Required empty string */
    shipperinfo: {
      tcsaccount:  settings.tcsAccountNo,
      shippername: (settings.shipperName    || "KDF Nuts").slice(0, 50),
      address1:    (settings.shipperAddress || "").slice(0, 120),
      address2:    "", address3: "", zip: "",
      countrycode: "PK", countryname: "Pakistan",
      citycode:    (settings.shipperCityCode || "LHE").toUpperCase(),
      cityname:    (settings.shipperCity     || "Lahore").slice(0, 50),
      mobile:      (settings.shipperPhone    || "").replace(/\D/g, "").slice(-11),
    },
    consigneeinfo: {
      consigneecode: "",
      firstname:   firstName.slice(0, 50),
      middlename:  middleName.slice(0, 50),
      lastname:    lastName.slice(0, 50),
      address1:    addr.slice(0, 120),
      address2:    (address.address2 ?? "").slice(0, 120),
      address3:    "",
      zip:         (address.zip ?? address.postal_code ?? "").slice(0, 20),
      countrycode: "PK", countryname: "Pakistan",
      citycode:    "", cityname: (address.city ?? "").slice(0, 50),
      email:       (address.email ?? "").slice(0, 100),
      areacode: "", areaname: "", blockcode: "", blockname: "",
      lat: "", lng: "", landmark: "",
      mobile:      phone.slice(-11),
    },
    vendorinfo: {
      name:     (settings.shipperName    || "KDF Nuts").slice(0, 50),
      address1: (settings.shipperAddress || "").slice(0, 120),
      address2: "", address3: "",
      citycode: (settings.shipperCityCode || "LHE").toUpperCase(),
      cityname: (settings.shipperCity     || "Lahore").slice(0, 50),
      mobile:   (settings.shipperPhone    || "").replace(/\D/g, "").slice(-11),
    },
    shipmentinfo: {
      costcentercode: (settings.costcentercode ?? "").toString().slice(0, 20),
      referenceno:    orderRef.slice(0, 50),
      contentdesc:    itemDesc,
      servicecode:    svcCode,
      parametertype:  "Standard",
      shipmentdate:   tcsShipmentDate(),   /* DD/MM/YYYY HH:MM:SS */
      shippingtype:   "", currency: "PKR",
      codamount:      codAmount,
      declaredvalue:  null, insuredvalue: null,
      transactiontype: "", dsflag: "", carrierslug: "",
      weightinkg:     weightKg,
      pieces,
      fragile:        !!(order.fragile),
      remarks:        (order.specialInstructions ?? order.notes ?? settings.defaultRemarks ?? "KDF Nuts Order").slice(0, 200),
      skus: [{
        description:   itemDesc,
        quantity:      pieces,
        weight:        weightKg,
        uom:           "KG",
        unitprice:     codAmount > 0 ? codAmount : 1,
        declaredvalue: null, insuredvalue: null,
      }],
    },
  };

  const bookUrl = `${baseUrl}/ecom/api/booking/create`;
  const t0      = Date.now();

  logger.info({ bookUrl, tcsAccountNo: settings.tcsAccountNo, orderRef, weightKg, codAmount, svcCode }, "TCS booking — sending");

  let result: Awaited<ReturnType<typeof httpReq>>;
  try {
    result = await httpReq(bookUrl, "POST", { "Authorization": `Bearer ${bearerToken}`, "Accept": "application/json" }, payload, 20000);
  } catch (netErr: any) {
    pushLog({ ts: new Date().toISOString(), step: "booking", url: bookUrl, method: "POST", reqBody: `order:${orderRef}`, httpStatus: null, success: false, error: netErr.message, durationMs: Date.now() - t0 });
    throw new Error(`TCS booking network error: ${netErr.message}`);
  }

  const durationMs = Date.now() - t0;
  const { status, text, data } = result;

  pushLog({ ts: new Date().toISOString(), step: "booking", url: bookUrl, method: "POST", reqBody: `order:${orderRef}`, httpStatus: status, resBody: text.slice(0, 500), durationMs, success: false });

  const trackingId =
    data.consignmentNo     ?? data.consignment_no ??
    data.consignmentNumber ?? data.ConsignmentNo  ??
    data.data?.consignmentNo ?? data.data?.bookingNo ??
    data.result?.consignmentNo;

  if (!trackingId) {
    const errorList: any[] = Array.isArray(data.errorList) ? data.errorList : [];
    const errDetail = errorList.length > 0
      ? errorList.map((e: any) => `${e.key ?? ""}: ${e.errormessage ?? e.message ?? ""}`).join(" | ")
      : (data.message ?? data.statusMessage ?? `HTTP ${status}: ${text.slice(0, 200)}`);
    throw new Error(`TCS booking failed: ${errDetail} [account: ${settings.tcsAccountNo || "EMPTY"}, endpoint: booking/create]`);
  }

  /* Update log entry as success */
  if (_log[0]?.step === "booking") _log[0].success = true;
  logger.info({ trackingId, durationMs, tcsAccountNo: settings.tcsAccountNo }, "TCS booking — SUCCESS");
  return { trackingId, trackingUrl: getTcsTrackingUrl(trackingId), rawResponse: data };
}

/* ─── Track Shipment ─────────────────────────────────────────────────────
 * Official TCS Tracking API (IBM API Gateway — completely separate from booking):
 *   GET https://api.tcscourier.com/production/track/v1/shipments/detail
 *   Query: consignmentNo={CN}
 *   Header: X-IBM-Client-Id: {trackingClientId}
 *
 * Response: { returnStatus: { code, status, message }, TrackDetailReply: { ... } }
 *   returnStatus.code === "0200" means success.
 *   DeliveryInfo[].code: OK=delivered, RO=returned, OFD=out_for_delivery
 *   Checkpoints[].status: "DELIVERED" | "RETURNED" | "IN TRANSIT" etc.
 */
export async function trackShipment(
  settings: TcsSettings,
  trackingId: string,
): Promise<{ status: string; rawResponse: Record<string, any> }> {
  const clientId = settings.trackingClientId?.trim();
  const trackUrl = settings.sandbox ? TCS_TRACK_SANDBOX_URL : TCS_TRACK_URL;
  const url = `${trackUrl}/shipments/detail?consignmentNo=${encodeURIComponent(trackingId)}`;
  const t0  = Date.now();

  /* If no tracking clientId configured, return graceful fallback */
  if (!clientId) {
    logger.warn({ trackingId }, "TCS tracking — trackingClientId not configured");
    return {
      status: "in_transit",
      rawResponse: {
        note: "TCS Tracking Client ID (X-IBM-Client-Id) not configured. Add it in Couriers → TCS Settings → Tracking API Client ID.",
      },
    };
  }

  logger.info({ url, trackingId }, "TCS tracking — calling official tracking API");

  let result: Awaited<ReturnType<typeof httpReq>>;
  try {
    result = await httpReq(
      url, "GET",
      { "X-IBM-Client-Id": clientId, "Accept": "application/json" },
      undefined,
      15000,
    );
  } catch (netErr: any) {
    pushLog({ ts: new Date().toISOString(), step: "tracking", url, method: "GET", httpStatus: null, success: false, error: netErr.message, durationMs: Date.now() - t0 });
    return { status: "in_transit", rawResponse: { error: netErr.message } };
  }

  const { status, text, data } = result;
  const durationMs = Date.now() - t0;
  pushLog({ ts: new Date().toISOString(), step: "tracking", url, method: "GET", httpStatus: status, resBody: text.slice(0, 600), durationMs, success: status < 400 });

  /* Check TCS returnStatus envelope */
  const rs = data?.returnStatus ?? {};
  if (rs.code && rs.code !== "0200") {
    logger.warn({ code: rs.code, message: rs.message, trackingId }, "TCS tracking — non-success returnStatus");
    return { status: "in_transit", rawResponse: data };
  }

  /* Parse tracking detail — TCS wraps in TrackDetailReply or flat in the body */
  const detail     = data?.TrackDetailReply ?? data;
  const deliveries: any[] = Array.isArray(detail?.DeliveryInfo) ? detail.DeliveryInfo : [];
  const checkpoints: any[] = Array.isArray(detail?.Checkpoints) ? detail.Checkpoints : [];

  const latest = deliveries[0];   /* most-recent delivery event */
  const chk    = checkpoints[0];  /* most-recent checkpoint */

  let shipStatus = "in_transit";

  /* DeliveryInfo.code mapping (from TCS API docs) */
  if (latest?.code) {
    const code = String(latest.code).toUpperCase();
    if      (code === "OK"  || code === "DEL") shipStatus = "delivered";
    else if (code === "RO"  || code === "RET") shipStatus = "returned";
    else if (code === "OFD")                   shipStatus = "out_for_delivery";
  }

  /* Fall back to DeliveryInfo.status text */
  if (shipStatus === "in_transit" && latest?.status) {
    const s = String(latest.status).toLowerCase();
    if      (s.includes("deliver"))          shipStatus = "delivered";
    else if (s.includes("return"))           shipStatus = "returned";
    else if (s.includes("out for delivery")) shipStatus = "out_for_delivery";
  }

  /* Fall back to Checkpoints.status */
  if (shipStatus === "in_transit" && chk?.status) {
    const s = String(chk.status).toLowerCase();
    if      (s.includes("deliver"))          shipStatus = "delivered";
    else if (s.includes("return"))           shipStatus = "returned";
    else if (s.includes("out for delivery")) shipStatus = "out_for_delivery";
    else if (s.includes("transit"))          shipStatus = "in_transit";
  }

  logger.info({ trackingId, shipStatus, durationMs }, "TCS tracking — complete");
  return { status: shipStatus, rawResponse: data };
}
