/**
 * TCS Courier Integration — ECOM API (ociconnect.tcscourier.com)
 *
 * Auth flow (2 steps):
 *   1. GET /ecom/api/authentication/token?username=&password=
 *      Header: X-IBM-Client-Id: {username}
 *      → Response: { accessToken: "..." }
 *
 *   2. POST /ecom/api/booking/create
 *      Header: X-IBM-Client-Id: {username}
 *      Body: { accesstoken, shipperinfo, consigneeinfo, vendorinfo, shipmentinfo }
 *      → Response: { ConsignmentNo: "..." } or { ShipmentInformation: { ConsignmentNo } }
 *
 * Required: username + password only. bearerToken kept optional for tracking fallback.
 */

import https from "node:https";
import http  from "node:http";
import { logger } from "./logger";

/* ─── URL constants ─────────────────────────────────────────────────────── */
export const TCS_ECOM_URL        = "https://ociconnect.tcscourier.com/ecom/api";
export const TCS_ECOM_DEV_URL    = "https://devconnect.tcscourier.com/ecom/api";
export const TCS_COD_URL         = "https://api.tcscourier.com/production/v1/cod";
export const TCS_COD_SANDBOX_URL = "https://api.tcscourier.com/sandbox/v1/cod";
export const TCS_TRACK_URL       = "https://api.tcscourier.com/production/track/v1";
export const TCS_TRACKING_LINK   = "https://ociconnect.tcscourier.com/tracking/index.html";

/* ─── Settings ───────────────────────────────────────────────────────────── */
export interface TcsSettings {
  /* ── Required ── */
  bearerToken: string;   /* IBM API Connect bearer — required for BOTH auth + booking */
  username:    string;   /* TCS username — also X-IBM-Client-Id + tcsaccount in body */
  password:    string;   /* TCS password — sent in auth token step */

  /* ── Optional ── */
  clientId?:     string;   /* Override X-IBM-Client-Id if different from username */
  costCenterCode?: string; /* e.g. "999" — from TCS portal cost center */
  serviceCode?:    string; /* "O"=Overnight, "E"=Economy, "0"=default */
  defaultWeight?:  number;
  fragile?:        boolean;
  defaultRemarks?: string;
  shipperCity?:    string;
  shipperName?:    string;
  shipperAddress?: string;
  shipperPhone?:   string;
  sandbox?:        boolean;
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
  logger.info({}, "TCS clearCache called — no in-memory token cache");
  return { bearerCleared: 0, ecomCleared: 0 };
}
export function getCacheStatus() {
  return { note: "No cache — fresh auth token fetched on every booking request." };
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
export function extractClientIdFromJwt(token: string): string | null {
  try {
    const parts = token.trim().split(".");
    if (parts.length < 2) return null;
    const pad   = (s: string) => s + "=".repeat((4 - (s.length % 4)) % 4);
    const json  = Buffer.from(pad(parts[1].replace(/-/g, "+").replace(/_/g, "/")), "base64").toString("utf8");
    const decoded = JSON.parse(json) as Record<string, unknown>;
    const cid = decoded.clientid ?? decoded.client_id ?? decoded.clientId ?? decoded.sub;
    return cid != null ? String(cid).trim() || null : null;
  } catch { return null; }
}

/** X-IBM-Client-Id = explicit clientId → JWT decode → username (ECOM convention) */
export function resolveClientId(settings: TcsSettings): string | null {
  const explicit = settings.clientId?.trim() || null;
  if (explicit) return explicit;
  const fromJwt = extractClientIdFromJwt(settings.bearerToken ?? "");
  if (fromJwt) return fromJwt;
  return settings.username?.trim() || null;
}

export function getAuthHeaders(settings: TcsSettings): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept":       "application/json",
  };
  const clientId = resolveClientId(settings);
  if (clientId) headers["X-IBM-Client-Id"] = clientId;
  if (settings.bearerToken?.trim()) {
    headers["Authorization"] = `Bearer ${settings.bearerToken.trim()}`;
  }
  return headers;
}

export function validateSettings(settings: TcsSettings): string[] {
  const errs: string[] = [];
  if (!settings.bearerToken?.trim()) errs.push("Bearer Token is empty — get it from TCS ENVO Portal");
  if (!settings.username?.trim()) errs.push("TCS Username is empty");
  if (!settings.password?.trim()) errs.push("TCS Password is empty");
  return errs;
}

export function getTcsTrackingUrl(cn: string): string {
  return `${TCS_TRACKING_LINK}?cg=${encodeURIComponent(cn)}`;
}

/* ─── City helpers ────────────────────────────────────────────────────────
 * TCS ECOM API requires exact city names from their list.
 * citycode is optional — if we don't know it, send empty and let TCS match by name.
 * normalizeCity() strips area/sector prefixes so "DHA Lahore" → "Lahore".
 */
const CITY_CODES: Record<string, string> = {
  lahore: "LHE", karachi: "KHI", islamabad: "ISB", rawalpindi: "RWP",
  faisalabad: "FSD", multan: "MUL", peshawar: "PEW", quetta: "UET",
  gujranwala: "GJW", sialkot: "SKT", hyderabad: "HYD", sargodha: "SGD",
  bahawalpur: "BWP", abbottabad: "ABT", jhelum: "JHM", gujrat: "GRT",
  sahiwal: "SWL", sheikhupura: "SKP", sukkur: "SUK", larkana: "LRK",
  nawabshah: "NWS", mingora: "MNG", mardan: "MRD", swabi: "SWB", nawabshahr: "NWS",
  "rahim yar khan": "RYK", "rahimyar khan": "RYK", "r.y.khan": "RYK",
  "d.g. khan": "DGK", "dera ghazi khan": "DGK", "dg khan": "DGK",
  "d.i. khan": "DIK", "dera ismail khan": "DIK", "di khan": "DIK",
  "mirpur khas": "MPK", "khairpur": "KHP",
  "tando adam": "TDA", "tando allahyar": "TAY", "sanghar": "SNH",
  "badin": "BDN", "thatta": "THA", "jacobabad": "JAC", "shikarpur": "SKP2",
  "muzaffarabad": "MZD", "mirpur": "MPR", "bhimber": "BHM",
  "attock": "ATK", "chakwal": "CKW", "taxila": "TXL",
  "wah cantt": "WAH", "wah": "WAH", "kamra": "KAM",
  "gujranwala": "GJW", "hafizabad": "HFZ", "mandi bahauddin": "MBD",
  "narowal": "NRW", "okara": "OKR", "pakpattan": "PKP",
  "vehari": "VHR", "khanewal": "KNW", "lodhran": "LDR",
  "bahawalnagar": "BHN", "chiniot": "CHN", "jhang": "JHG",
  "toba tek singh": "TTS", "mianwali": "MWL", "khushab": "KSB",
  "layyah": "LAY", "muzaffargarh": "MFG",
};

/* Alias map: compound area names → main city */
const CITY_ALIASES: Array<[RegExp, string]> = [
  [/\bdha\b/i,         ""],   /* strip "DHA" prefix, keep rest */
  [/bahria\s+town/i,   ""],   /* strip "Bahria Town", keep city */
  [/gulberg/i,         "Lahore"],
  [/johar\s*town/i,    "Lahore"],
  [/model\s*town/i,    "Lahore"],
  [/cantt/i,           ""],   /* strip "Cantt" */
  [/cantonment/i,      ""],
  [/phase\s+\w+/i,     ""],   /* strip "Phase 5" etc */
  [/sector\s+\w+/i,    ""],   /* strip "Sector F-10" etc */
  [/block\s+\w+/i,     ""],   /* strip "Block A" etc */
  [/f-\d+/i,           ""],   /* strip "F-10" in Islamabad */
  [/g-\d+/i,           ""],   /* strip "G-11" etc */
  [/i-\d+/i,           ""],
];

function normalizeCity(raw: string): string {
  let city = raw.trim();
  /* Apply alias replacements */
  for (const [pattern, replacement] of CITY_ALIASES) {
    city = city.replace(pattern, replacement);
  }
  /* Collapse whitespace */
  city = city.replace(/\s{2,}/g, " ").trim();
  /* If empty after stripping, use original */
  if (!city) city = raw.trim();
  /* Capitalize first letter of each word */
  return city.replace(/\b\w/g, c => c.toUpperCase());
}

function cityCode(name: string): string {
  const lower = name.toLowerCase().trim();
  /* Direct match */
  if (CITY_CODES[lower]) return CITY_CODES[lower];
  /* Partial match — check if any known city appears in the name */
  for (const [key, code] of Object.entries(CITY_CODES)) {
    if (lower.includes(key)) return code;
  }
  /* Unknown city — return empty, let TCS match by name */
  return "";
}

/* ─── Weight helper ──────────────────────────────────────────────────────── */
function tcsWeight(raw?: number | string): number {
  if (raw == null) return 0.5;
  const s = String(raw).toLowerCase().trim();
  if (s.endsWith("g"))  return Math.max(0.5, parseFloat(s) / 1000);
  if (s.endsWith("kg")) return Math.max(0.5, parseFloat(s));
  const n = Number(raw);
  if (!isNaN(n) && n >= 100) return Math.max(0.5, n / 1000);
  return Math.max(0.5, isNaN(n) || n <= 0 ? 0.5 : n);
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

/* ─── Step 1: Get ECOM Access Token ──────────────────────────────────────
 * GET /ecom/api/authentication/token?username=&password=
 * Header: Authorization: Bearer {bearerToken}   ← IBM API Connect requires this
 * Header: X-IBM-Client-Id: {username}
 * Response: { accessToken: "..." } or { AccessToken: "..." }
 */
export async function getEcomAccessToken(settings: TcsSettings): Promise<string> {
  const baseUrl   = settings.sandbox ? TCS_ECOM_DEV_URL : TCS_ECOM_URL;
  const authUrl   = `${baseUrl}/authentication/token?username=${encodeURIComponent(settings.username)}&password=${encodeURIComponent(settings.password)}`;
  const clientId  = resolveClientId(settings);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept":       "application/json",
  };
  if (clientId) headers["X-IBM-Client-Id"] = clientId;
  /* IBM API Connect gateway validates Bearer on ALL endpoints — including auth */
  if (settings.bearerToken?.trim()) {
    headers["Authorization"] = `Bearer ${settings.bearerToken.trim()}`;
  }

  logger.info({ authUrl, username: settings.username }, "TCS ECOM — auth token request");

  const t0 = Date.now();
  let result: Awaited<ReturnType<typeof httpReq>>;
  try {
    result = await httpReq(authUrl, "GET", headers, null, 15000);
  } catch (e: any) {
    pushLog({ ts: new Date().toISOString(), step: "auth", url: authUrl, method: "GET", httpStatus: null, success: false, error: e.message, durationMs: Date.now() - t0 });
    throw new Error(`TCS auth network error: ${e.message}`);
  }

  const { status, text, data } = result;
  const durationMs = Date.now() - t0;
  const rawToken = data?.accesstoken ?? data?.accessToken ?? data?.AccessToken ?? data?.access_token ?? data?.token;

  pushLog({ ts: new Date().toISOString(), step: "auth", url: authUrl, method: "GET", httpStatus: status, resBody: text.slice(0, 300), durationMs, success: !!rawToken });

  if (!rawToken) {
    const msg = data?.Message ?? data?.message ?? data?.error ?? text.slice(0, 200);
    if (status === 401 || status === 403) {
      throw new Error(`TCS auth rejected (HTTP ${status}) — check username/password.\nTCS response: ${msg}`);
    }
    throw new Error(`TCS auth failed (HTTP ${status}) — no accessToken in response.\nRaw: ${text.slice(0, 300)}`);
  }

  /* TCS returns the token URL-encoded (contains %2F %2B %3D etc) — decode it */
  const token = decodeURIComponent(String(rawToken));
  logger.info({ durationMs, username: settings.username }, "TCS ECOM — auth token OK");
  return token;
}

/* ─── Test Connection ────────────────────────────────────────────────────── */
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

  const resolvedClientId = resolveClientId(settings);
  const baseUrl = settings.sandbox ? TCS_ECOM_DEV_URL : TCS_ECOM_URL;

  steps.push({
    step: "Config", status: "info",
    detail: [
      `bearerToken: ${settings.bearerToken?.trim() ? `${settings.bearerToken.slice(0, 20)}…` : "EMPTY"}`,
      `username: ${settings.username}`,
      `X-IBM-Client-Id: ${resolvedClientId ?? settings.username} (auto from username)`,
      `mode: ${settings.sandbox ? "DEV (devconnect)" : "PRODUCTION (ociconnect)"}`,
    ].join(" | "),
  });

  /* Step 1 — ECOM auth token */
  let accessToken: string;
  try {
    accessToken = await getEcomAccessToken(settings);
    steps.push({
      step: "ECOM Auth Token",
      status: "ok",
      detail: `✅ Auth token received — username/password accepted by TCS`,
    });
  } catch (e: any) {
    steps.push({
      step: "ECOM Auth Token",
      status: "fail",
      detail: `❌ ${e.message}\n\n✅ ACTION: Check username + password in TCS Settings.`,
    });
    return { ok: false, steps };
  }

  steps.push({
    step: "Ready",
    status: "ok",
    detail: `✅ Auth working. POST ${baseUrl}/booking/create is ready.\nBooking body: { accesstoken, shipperinfo: { tcsaccount: "${settings.username}" }, consigneeinfo, shipmentinfo }`,
  });
  return { ok: true, steps };
}

/* ─── Create Booking (ECOM API) ───────────────────────────────────────────
 * 1. GET /authentication/token → accessToken
 * 2. POST /booking/create → ConsignmentNo
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
    name?: string; firstName?: string; lastName?: string;
    address?: string; address1?: string; address2?: string;
    city?: string;
    phone?: string; email?: string;
    zip?: string;
  },
  service?: string,
): Promise<{ trackingId: string; trackingUrl: string; rawResponse: Record<string, any> }> {

  const configErrs = validateSettings(settings);
  if (configErrs.length > 0) throw new Error(`TCS config error:\n• ${configErrs.join("\n• ")}`);

  /* Validate order fields */
  const errs: string[] = [];
  const rawPhone = (address.phone ?? "").replace(/\D/g, "");
  if (rawPhone.length < 10) errs.push(`Phone invalid: "${address.phone}" — need 10–11 digit Pakistani number`);
  const destCityRaw = (address.city ?? "").trim();
  /* Detect placeholder values that Shopify stores when customer never picks a city */
  const CITY_PLACEHOLDERS = ["select city", "selectcity", "choose city", "city", "n/a", "na", "-", "--", "none"];
  if (!destCityRaw || CITY_PLACEHOLDERS.includes(destCityRaw.toLowerCase())) {
    errs.push(`Consignee city is "${destCityRaw || "empty"}" — the customer did not select a real city. Please edit the Shopify order's shipping address and set a valid Pakistani city before booking.`);
  }
  const destCity = normalizeCity(destCityRaw);
  const addr = [address.address1 ?? address.address, address.address2].filter(Boolean).join(", ").trim();
  if (!addr) errs.push("Consignee address is empty");
  if (errs.length > 0) throw new Error(`TCS booking validation:\n• ${errs.join("\n• ")}`);

  /* Step 1: get fresh auth token */
  const accessToken = await getEcomAccessToken(settings);

  /* Build booking payload matching PHP code structure */
  const weightKg    = tcsWeight(order.weight ?? settings.defaultWeight);
  const pieces      = Math.max(1, parseInt(String(order.pieces ?? 1), 10));
  const isCod       = !order.paymentMethod || order.paymentMethod === "cod";
  const codAmount   = isCod ? Math.round(Number(order.total ?? 0)) : 0;
  const items       = Array.isArray(order.items) ? order.items : [];
  const contentDesc = items.length > 0 ? items.map(i => i.name).join(", ").slice(0, 100) : "Dry Fruits";
  const orderRef    = String(order.orderNumber ?? order.id ?? Date.now());
  const remarks     = (order.specialInstructions ?? order.notes ?? settings.defaultRemarks ?? "").trim() || "Handle with care";
  const isFragile   = order.fragile ?? settings.fragile ?? false;
  const originCity  = normalizeCity((settings.shipperCity ?? "Lahore").trim());
  const shipperName = (settings.shipperName ?? "KDF NUTS").trim();
  const shipperAddr = (settings.shipperAddress ?? "").trim();
  const shipperPhone = (settings.shipperPhone ?? "").replace(/\D/g, "");
  const mobNo = rawPhone.length === 10 ? `0${rawPhone}` : rawPhone;

  /* Split full name into first + last */
  const fullName  = (address.name ?? address.firstName ?? "Customer").trim();
  const nameParts = fullName.split(" ");
  const firstName = nameParts[0] ?? fullName;
  const lastName  = nameParts.slice(1).join(" ") || "";

  /* Service code mapping: our "O"/"E"/"S" → TCS "0"/"1"/"2" or keep as-is */
  const svcRaw = service ?? settings.serviceCode ?? "O";
  const svcCode = svcRaw === "O" ? "0" : svcRaw === "E" ? "1" : svcRaw === "S" ? "2" : svcRaw;

  const clientId   = resolveClientId(settings);
  const baseUrl    = settings.sandbox ? TCS_ECOM_DEV_URL : TCS_ECOM_URL;
  const bookUrl    = `${baseUrl}/booking/create`;
  const nowStr     = new Date().toLocaleString("en-GB", { hour12: false }).replace(",", "").replace(/\//g, "/");

  const payload: Record<string, any> = {
    accesstoken:    accessToken,
    consignmentno:  "",
    shipperinfo: {
      tcsaccount:   settings.username,
      shippername:  shipperName,
      address1:     shipperAddr || "Main Office",
      address2:     "",
      address3:     "",
      zip:          "54000",
      countrycode:  "PK",
      countryname:  "Pakistan",
      citycode:     cityCode(originCity),
      cityname:     originCity.slice(0, 50),
      mobile:       shipperPhone || "03000000000",
    },
    consigneeinfo: {
      consigneecode: "",
      firstname:     firstName.slice(0, 50),
      middlename:    "",
      lastname:      lastName.slice(0, 50),
      address1:      addr.slice(0, 100),
      address2:      (address.address2 ?? "").slice(0, 100),
      address3:      "",
      zip:           (address.zip ?? "00000"),
      countrycode:   "PK",
      countryname:   "Pakistan",
      citycode:      cityCode(destCity),
      cityname:      destCity.slice(0, 50),
      email:         (address.email ?? "").slice(0, 100),
      areacode:      "",
      areaname:      "",
      blockcode:     "",
      blockname:     "",
      lat:           "",
      lng:           "",
      landmark:      "",
      mobile:        mobNo,
    },
    vendorinfo: {
      name:      shipperName,
      address1:  shipperAddr || "Lahore, Pakistan",
      address2:  "",
      address3:  "",
      citycode:  cityCode(originCity),
      cityname:  originCity.slice(0, 50),
      mobile:    shipperPhone || "03000000000",
    },
    shipmentinfo: {
      costcentercode: (settings.costCenterCode ?? "").trim(),
      referenceno:    orderRef.slice(0, 50),
      contentdesc:    contentDesc,
      servicecode:    svcCode,
      parametertype:  "Standard",
      shipmentdate:   nowStr,
      shippingtype:   "",
      currency:       "PKR",
      codamount:      codAmount,
      declaredvalue:  null,
      insuredvalue:   null,
      transactiontype: "",
      dsflag:         "",
      carrierslug:    "",
      weightinkg:     weightKg.toFixed(2),
      pieces:         pieces,
      fragile:        isFragile,
      remarks:        remarks.slice(0, 200),
      skus: [{
        description:   contentDesc,
        quantity:      pieces,
        weight:        weightKg.toFixed(2),
        uom:           "KG",
        unitprice:     codAmount,
        declaredvalue: null,
        insuredvalue:  null,
      }],
    },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept":       "application/json",
  };
  if (clientId) headers["X-IBM-Client-Id"] = clientId;
  /* IBM API Connect gateway requires Bearer on booking endpoint too */
  if (settings.bearerToken?.trim()) {
    headers["Authorization"] = `Bearer ${settings.bearerToken.trim()}`;
  }

  const t0 = Date.now();
  const destCityCode = cityCode(destCity);
  logger.info(
    { bookUrl, username: settings.username, orderRef, weightKg, codAmount,
      originCity, originCityCode: cityCode(originCity),
      destCityRaw, destCity, destCityCode },
    "TCS ECOM — booking"
  );

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
    reqBody: JSON.stringify({ ...payload, accesstoken: "●●●" }).slice(0, 500),
    httpStatus: status, resBody: text.slice(0, 600), durationMs, success: false,
  });

  /* Extract CN — TCS ECOM response field names vary */
  const cn =
    data?.ConsignmentNo        ??
    data?.consignmentNo        ??
    data?.ConsignmentNumber    ??
    data?.consignmentno        ??
    data?.ShipmentInformation?.ConsignmentNo ??
    data?.ShipmentInformation?.consignmentNo ??
    data?.bookingReply?.CN     ??
    data?.CN;

  if (!cn || String(cn).trim() === "") {
    const errMsg = data?.Message ?? data?.message ?? data?.Error ?? data?.error ?? `HTTP ${status}`;
    pushLog({ ts: new Date().toISOString(), step: "booking", url: bookUrl, method: "POST", httpStatus: status, resBody: text.slice(0, 400), durationMs, success: false, error: String(errMsg) });
    throw new Error(`TCS booking failed — no consignment number in response.\n${errMsg}\nRaw: ${text.slice(0, 300)}`);
  }

  if (_log[0]?.step === "booking") _log[0].success = true;
  logger.info({ cn, durationMs, orderRef }, "TCS ECOM — booking SUCCESS");
  return { trackingId: String(cn), trackingUrl: getTcsTrackingUrl(String(cn)), rawResponse: data };
}

/* ─── Track Shipment ──────────────────────────────────────────────────────
 * TCS tracking via COD API (if bearer token available)
 * or falls back to a static "in_transit" status.
 */
export async function trackShipment(
  settings: TcsSettings,
  trackingId: string,
): Promise<{ status: string; rawResponse: Record<string, any> }> {
  /* Try COD API tracking if bearer token is set */
  if (settings.bearerToken?.trim()) {
    const trackUrl = settings.sandbox
      ? `https://api.tcscourier.com/sandbox/track/v1`
      : TCS_TRACK_URL;
    const url  = `${trackUrl}/shipments/detail?consignmentNo=${encodeURIComponent(trackingId)}`;
    const t0   = Date.now();
    const hdrs = getAuthHeaders(settings);
    logger.info({ url, trackingId }, "TCS — tracking (COD API)");
    try {
      const { status, text, data } = await httpReq(url, "GET", hdrs, undefined, 15000);
      pushLog({ ts: new Date().toISOString(), step: "tracking", url, method: "GET", httpStatus: status, resBody: text.slice(0, 400), durationMs: Date.now() - t0, success: status < 400 });
      const rs = data?.returnStatus ?? {};
      if (status === 200 && !rs.code) return { status: "in_transit", rawResponse: data };
      const shipStatus = data?.ShipmentInformation?.ShipStatus ?? data?.ShipStatus ?? rs.message ?? "in_transit";
      return { status: String(shipStatus).toLowerCase().replace(/\s+/g, "_"), rawResponse: data };
    } catch {
      /* fall through to basic response */
    }
  }

  /* No bearer token — use ECOM tracking link */
  return {
    status: "in_transit",
    rawResponse: {
      note: "Tracking: visit TCS tracking portal",
      url:  getTcsTrackingUrl(trackingId),
    },
  };
}

/* ─── fetchCities — GET /ecom/api/cities ─────────────────────────────────
 * Returns TCS's full serviceable city list: [{ cityID, cityName, cityCode, area }]
 * Requires bearer token + X-IBM-Client-Id; accesstoken optional.
 */
export async function fetchCities(settings: TcsSettings): Promise<Array<{ cityID: string; cityName: string; cityCode: string; area: string }>> {
  const baseUrl  = settings.sandbox ? TCS_ECOM_DEV_URL : TCS_ECOM_URL;
  const url      = `${baseUrl}/cities`;
  const clientId = resolveClientId(settings);

  const headers: Record<string, string> = {
    "Accept": "application/json",
  };
  if (clientId)                      headers["X-IBM-Client-Id"]  = clientId;
  if (settings.bearerToken?.trim()) headers["Authorization"]     = `Bearer ${settings.bearerToken.trim()}`;

  /* Try with accesstoken first; if we can get one */
  let accessToken = "";
  try { accessToken = await getEcomAccessToken(settings); } catch { /* ignore */ }
  const finalUrl = accessToken ? `${url}?accesstoken=${encodeURIComponent(accessToken)}` : url;

  const result = await httpReq(finalUrl, "GET", headers, null, 20000);
  if (result.status !== 200) {
    throw new Error(`TCS /cities HTTP ${result.status}: ${result.text.slice(0, 200)}`);
  }
  /* Response: { city: [...] } or directly an array */
  const body = result.data;
  const list  = Array.isArray(body) ? body : (Array.isArray(body?.city) ? body.city : []);
  return list as Array<{ cityID: string; cityName: string; cityCode: string; area: string }>;
}
