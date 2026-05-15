/**
 * Meezan Bank EPG (Electronic Payment Gateway) Service Layer
 * ===========================================================
 * All Meezan Bank API communication is centralised here.
 * Routes import this module — NO direct Meezan calls from the frontend.
 *
 * Endpoints (official Meezan Bank REST API):
 *   Sandbox : https://test-securepayment.meezanbank.com/payment/rest
 *   Live    : https://securepayment.meezanbank.com/payment/rest
 *
 * Observed: egress that is not yet approved by Meezan often receives HTTP 301 with
 * Location: https://securepayment.meezanbank.com/ (nginx) for any /payment/rest/* URL —
 * the REST API path is not served until IP whitelist / merchant REST access is enabled.
 *
 * Currency : PKR = ISO 586, amounts sent in paisa (× 100)
 *
 * Env:
 *   MEEZAN_HTTP_USER_AGENT — optional override for outbound API User-Agent
 *   MEEZAN_LIVE_REST_BASE / MEEZAN_SANDBOX_REST_BASE — optional override (no trailing slash)
 *   MEEZAN_KNOWN_CHECKOUT_EGRESS_IP — public IP (ipify) of server where checkout+register.do works; if this API host differs, diagnose lists both for Meezan whitelist
 *   MEEZAN_WHITELIST_ALL_IPS — comma-separated extra NAT/LB IPs for whitelist bundle
 */

import { logger } from "./logger";

const SANDBOX_BASE = (
  process.env.MEEZAN_SANDBOX_REST_BASE || "https://test-securepayment.meezanbank.com:9716/payment/rest"
).replace(/\/$/, "");
const LIVE_BASE = (
  process.env.MEEZAN_LIVE_REST_BASE || "https://securepayment.meezanbank.com/payment/rest"
).replace(/\/$/, "");

/** Do not auto-follow redirects — a 302 to an HTML login/WAF page would become HTTP 200 + HTML and hide the root cause. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const DEFAULT_MEEZAN_UA =
  "KDF-Meezan-EPG/1.0 (https://www.kdfnuts.com; integration@kdfnuts.com)";

/** Extra hint when Meezan nginx sends REST clients to site root (whitelist / path not served). */
function meezanRedirectHint(status: number, location: string, requestUrl: string): string {
  const loc = (location || "").trim();
  if (!REDIRECT_STATUSES.has(status) || !loc) return "";
  try {
    const req = new URL(requestUrl);
    const tgt = new URL(loc, requestUrl);
    const toRoot =
      tgt.pathname === "/" &&
      req.pathname.includes("/payment/rest");
    if (toRoot) {
      return (
        " Meezan-specific: 301/302 to the site root for /payment/rest/* usually means this " +
        "server IP is not yet whitelisted for REST, or REST is not enabled on the merchant profile — " +
        "confirm with Meezan Bank tech support (send them your outbound IP from diagnose). " +
        "If they issued a different REST base host, set env MEEZAN_LIVE_REST_BASE."
      );
    }
  } catch {
    /* ignore */
  }
  return "";
}

/* ──────────────────────────────────────────────────────
   TYPES
────────────────────────────────────────────────────── */

export interface MeezanConfig {
  username:   string;
  password:   string;
  isLive:     boolean;
  returnUrl:  string;
  failUrl:    string;
}

export interface RegisterParams {
  orderNumber:  string;
  amountPKR:    number;
  description?: string;
  returnUrl?:   string;
  failUrl?:     string;
  clientId?:    string;
  language?:    string;
}

export interface RegisterResult {
  success:       boolean;
  orderId?:      string;
  formUrl?:      string;
  errorCode?:    string;
  errorMessage?: string;
  raw?:          Record<string, unknown>;
}

export interface StatusResult {
  success:                boolean;
  meezanOrderId?:         string;
  orderNumber?:           string;
  orderStatus?:           number;
  actionCode?:            number;
  actionCodeDescription?: string;
  amountPKR?:             number;
  refundedAmountPKR?:     number;
  depositedAmountPKR?:    number;
  paymentState?:          string;
  cardMask?:              string;
  cardholderName?:        string;
  date?:                  string;
  errorCode?:             string;
  errorMessage?:          string;
  raw?:                   Record<string, unknown>;
}

export interface RefundResult {
  success:       boolean;
  errorCode?:    string;
  errorMessage?: string;
  raw?:          Record<string, unknown>;
}

/**
 * Raw diagnostic result — used by the /diagnose endpoint.
 * Contains the full response body so the admin can see exactly what Meezan returned.
 */
export interface DiagnoseResult {
  reachable:       boolean;
  httpStatus:      number | null;
  contentType:     string | null;
  responseSnippet: string | null;     /* first 1000 chars of the body */
  isJson:          boolean;
  isHtml:          boolean;
  parsedJson?:     Record<string, unknown>;
  errorCode?:      string;
  errorMessage?:   string;
  networkError?:   string;
  endpoint:        string;
  requestedAt:     string;
  durationMs:      number;
  serverIp?:       string;
}

/* ──────────────────────────────────────────────────────
   HTTP HELPERS
────────────────────────────────────────────────────── */

async function rawPost(
  url: string,
  body: Record<string, string>,
  timeoutMs = 15_000,
): Promise<{
  ok: boolean;
  status: number;
  contentType: string;
  text: string;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept":       "application/json,text/json,*/*",
        "User-Agent":   process.env.MEEZAN_HTTP_USER_AGENT || DEFAULT_MEEZAN_UA,
      },
      body:   new URLSearchParams(body).toString(),
      signal: ctrl.signal,
    });

    if (REDIRECT_STATUSES.has(res.status)) {
      const text = await res.text();
      const loc  = res.headers.get("location") || "";
      const hint = meezanRedirectHint(res.status, loc, url);
      throw new Error(
        `Meezan API HTTP ${res.status} redirect (not auto-followed). Location: ${loc || "(missing)"}. ` +
        `Often indicates WAF, session gate, or wrong host — verify IP whitelist and REST base URL.` +
        hint +
        ` Body preview: ${text.replace(/\s+/g, " ").slice(0, 200)}`,
      );
    }

    const text        = await res.text();
    const contentType = res.headers.get("content-type") || "";
    return { ok: res.ok, status: res.status, contentType, text };
  } finally {
    clearTimeout(timer);
  }
}

async function rawGet(
  url: string,
  params: Record<string, string>,
  timeoutMs = 15_000,
): Promise<{
  ok: boolean;
  status: number;
  contentType: string;
  text: string;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const qs  = new URLSearchParams(params).toString();
    const fullUrl = `${url}?${qs}`;
    const res = await fetch(fullUrl, {
      method:   "GET",
      redirect: "manual",
      headers: {
        "Accept":     "application/json,text/json,*/*",
        "User-Agent": process.env.MEEZAN_HTTP_USER_AGENT || DEFAULT_MEEZAN_UA,
      },
      signal: ctrl.signal,
    });

    if (REDIRECT_STATUSES.has(res.status)) {
      const text = await res.text();
      const loc  = res.headers.get("location") || "";
      const hint = meezanRedirectHint(res.status, loc, fullUrl);
      throw new Error(
        `Meezan API HTTP ${res.status} redirect on GET (not auto-followed). Location: ${loc || "(missing)"}.` +
        hint +
        ` Body preview: ${text.replace(/\s+/g, " ").slice(0, 200)}`,
      );
    }

    const text        = await res.text();
    const contentType = res.headers.get("content-type") || "";
    return { ok: res.ok, status: res.status, contentType, text };
  } finally {
    clearTimeout(timer);
  }
}

function detectHtml(contentType: string, text: string): boolean {
  return (
    contentType.toLowerCase().includes("text/html") ||
    text.trimStart().startsWith("<!") ||
    text.trimStart().toLowerCase().startsWith("<html")
  );
}

function parseJsonSafe(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { return null; }
}

function htmlHint(snippet: string): string {
  const lower = snippet.toLowerCase();
  if (lower.includes("jquery") && lower.includes("bootstrap"))
    return "GENERIC_HTML_PORTAL — Often IP not whitelisted, wrong environment, or REST blocked; bank served a web shell instead of JSON.";
  if (lower.includes("not authorized") || lower.includes("403") || lower.includes("forbidden"))
    return "IP_NOT_WHITELISTED — Your server IP is blocked by Meezan Bank's firewall.";
  if (lower.includes("login") || lower.includes("username") || lower.includes("password"))
    return "AUTH_REDIRECT — Meezan Bank's API is redirecting to a login page. Wrong credentials or wrong endpoint.";
  if (lower.includes("maintenance") || lower.includes("unavailable"))
    return "SERVICE_DOWN — Meezan Bank API may be under maintenance.";
  if (lower.includes("404") || lower.includes("not found"))
    return "WRONG_ENDPOINT — The API path returned 404. Verify the endpoint URL.";
  return "UNKNOWN — Meezan Bank returned HTML instead of JSON.";
}

/** Meezan register.do requires absolute HTTPS return/fail URLs (relative paths cause gateway errors / HTML). */
function isAbsoluteHttps(u: string | undefined): boolean {
  if (!u || typeof u !== "string") return false;
  const t = u.trim();
  return /^https:\/\//i.test(t) && t.length >= 12;
}

type MeezanUrlValidation =
  | { ok: true; returnUrl: string; failUrl: string }
  | { ok: false; result: RegisterResult };

function validateMeezanReturnUrls(
  p: RegisterParams,
  defaultReturn: string,
  defaultFail: string,
): MeezanUrlValidation {
  const returnUrl = (p.returnUrl || defaultReturn || "").trim();
  const failUrl   = (p.failUrl   || defaultFail   || "").trim();

  if (!isAbsoluteHttps(returnUrl)) {
    return {
      ok:     false,
      result: {
        success:       false,
        errorCode:     "INVALID_RETURN_URL",
        errorMessage:
          "returnUrl must be a full absolute HTTPS URL (Meezan EPG requirement). " +
          `Received: ${JSON.stringify(p.returnUrl || defaultReturn)}. ` +
          "Fix admin Payment Gateway return/fail URLs or pass returnUrl/failUrl on API requests.",
      },
    };
  }
  if (!isAbsoluteHttps(failUrl)) {
    return {
      ok:     false,
      result: {
        success:       false,
        errorCode:     "INVALID_FAIL_URL",
        errorMessage:
          "failUrl must be a full absolute HTTPS URL. " +
          `Received: ${JSON.stringify(p.failUrl || defaultFail)}.`,
      },
    };
  }
  return { ok: true, returnUrl, failUrl };
}

/* ──────────────────────────────────────────────────────
   EPG CLIENT CLASS
────────────────────────────────────────────────────── */

export class MeezanEpg {
  private base: string;
  private user: string;
  private pass: string;
  private defaultReturn: string;
  private defaultFail:   string;

  constructor(cfg: MeezanConfig) {
    this.base          = cfg.isLive ? LIVE_BASE : SANDBOX_BASE;
    this.user          = cfg.username;
    this.pass          = cfg.password;
    this.defaultReturn = cfg.returnUrl;
    this.defaultFail   = cfg.failUrl;
  }

  private async post(
    endpoint: string,
    body: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const url = `${this.base}/${endpoint}`;
    logger.debug({ url, endpoint }, "Meezan Bank API POST");

    let raw: Awaited<ReturnType<typeof rawPost>>;
    try {
      raw = await rawPost(url, body);
    } catch (networkErr: any) {
      const msg =
        `Network error reaching Meezan Bank API (${url}). ` +
        `Ensure the server's outbound IP (${await getServerIp()}) is reachable and not blocked. ` +
        `Details: ${String(networkErr)}`;
      logger.error({ url, err: networkErr }, "Meezan API network error");
      throw new Error(msg);
    }

    logger.debug(
      { url, status: raw.status, contentType: raw.contentType, snippet: raw.text.slice(0, 200) },
      "Meezan Bank API raw response",
    );

    if (detectHtml(raw.contentType, raw.text)) {
      const snippet = raw.text.slice(0, 800);
      const hint    = htmlHint(snippet);
      throw new Error(
        `Meezan Bank API returned an HTML page (HTTP ${raw.status}). ` +
        `Hint: ${hint} ` +
        `Endpoint: ${url}. ` +
        `HTML snippet: ${snippet.replace(/\s+/g, " ").slice(0, 300)}`,
      );
    }

    if (!raw.ok) {
      throw new Error(`Meezan API HTTP ${raw.status}: ${raw.text.slice(0, 300)}`);
    }

    const parsed = parseJsonSafe(raw.text);
    if (!parsed) {
      throw new Error(`Meezan API returned non-JSON (HTTP ${raw.status}): ${raw.text.slice(0, 300)}`);
    }
    return parsed;
  }

  private async get(
    endpoint: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const url = `${this.base}/${endpoint}`;
    logger.debug({ url, endpoint }, "Meezan Bank API GET");

    let raw: Awaited<ReturnType<typeof rawGet>>;
    try {
      raw = await rawGet(url, params);
    } catch (networkErr: any) {
      throw new Error(
        `Network error reaching Meezan API (${url}). Details: ${String(networkErr)}`,
      );
    }

    logger.debug(
      { url, status: raw.status, contentType: raw.contentType, snippet: raw.text.slice(0, 200) },
      "Meezan Bank API raw response",
    );

    if (detectHtml(raw.contentType, raw.text)) {
      const snippet = raw.text.slice(0, 800);
      const hint    = htmlHint(snippet);
      throw new Error(
        `Meezan Bank API returned an HTML page (HTTP ${raw.status}). ` +
        `Hint: ${hint} Endpoint: ${url}. ` +
        `HTML snippet: ${snippet.replace(/\s+/g, " ").slice(0, 300)}`,
      );
    }

    if (!raw.ok) {
      throw new Error(`Meezan API HTTP ${raw.status}: ${raw.text.slice(0, 300)}`);
    }

    const parsed = parseJsonSafe(raw.text);
    if (!parsed) {
      throw new Error(`Meezan API non-JSON (HTTP ${raw.status}): ${raw.text.slice(0, 300)}`);
    }
    return parsed;
  }

  private paisas(pkr: number): string {
    return Math.round(pkr * 100).toString();
  }

  /* ── Register (initiate payment) ── */
  async register(p: RegisterParams): Promise<RegisterResult> {
    const urls = validateMeezanReturnUrls(p, this.defaultReturn, this.defaultFail);
    if (!urls.ok) return urls.result;

    try {
      const raw = await this.post("register.do", {
        userName:    this.user,
        password:    this.pass,
        orderNumber: p.orderNumber,
        amount:      this.paisas(p.amountPKR),
        currency:    "586",
        returnUrl:   urls.returnUrl,
        failUrl:     urls.failUrl,
        description: p.description || p.orderNumber,
        language:    p.language || "EN",
        ...(p.clientId ? { clientId: p.clientId } : {}),
      });
      const ec = raw.errorCode;
      if (ec !== undefined && String(ec) !== "0") {
        return { success: false, errorCode: String(ec), errorMessage: String(raw.errorMessage ?? ""), raw };
      }
      return { success: true, orderId: String(raw.orderId ?? ""), formUrl: String(raw.formUrl ?? ""), raw };
    } catch (err) {
      return { success: false, errorCode: "NETWORK_ERROR", errorMessage: String(err) };
    }
  }

  /* ── Register Pre-Auth ── */
  async registerPreAuth(p: RegisterParams): Promise<RegisterResult> {
    const urls = validateMeezanReturnUrls(p, this.defaultReturn, this.defaultFail);
    if (!urls.ok) return urls.result;

    try {
      const raw = await this.post("registerPreAuth.do", {
        userName:    this.user,
        password:    this.pass,
        orderNumber: p.orderNumber,
        amount:      this.paisas(p.amountPKR),
        currency:    "586",
        returnUrl:   urls.returnUrl,
        failUrl:     urls.failUrl,
        description: p.description || p.orderNumber,
        language:    p.language || "EN",
      });
      const ec = raw.errorCode;
      if (ec !== undefined && String(ec) !== "0") {
        return { success: false, errorCode: String(ec), errorMessage: String(raw.errorMessage ?? ""), raw };
      }
      return { success: true, orderId: String(raw.orderId ?? ""), formUrl: String(raw.formUrl ?? ""), raw };
    } catch (err) {
      return { success: false, errorCode: "NETWORK_ERROR", errorMessage: String(err) };
    }
  }

  /* ── Order Status (extended) ── */
  async getStatus(meezanOrderId: string): Promise<StatusResult> {
    try {
      const raw = await this.get("getOrderStatusExtended.do", {
        userName: this.user,
        password: this.pass,
        orderId:  meezanOrderId,
        language: "EN",
      });
      const ec = raw.errorCode;
      if (ec !== undefined && String(ec) !== "0") {
        return { success: false, errorCode: String(ec), errorMessage: String(raw.errorMessage ?? ""), raw };
      }
      const pai  = raw.paymentAmountInfo as Record<string, unknown> | undefined;
      const card = raw.cardAuthInfo      as Record<string, unknown> | undefined;
      return {
        success:               true,
        meezanOrderId:         String(raw.orderId ?? meezanOrderId),
        orderNumber:           raw.orderNumber ? String(raw.orderNumber) : undefined,
        orderStatus:           raw.orderStatus !== undefined ? Number(raw.orderStatus)  : undefined,
        actionCode:            raw.actionCode  !== undefined ? Number(raw.actionCode)   : undefined,
        actionCodeDescription: raw.actionCodeDescription ? String(raw.actionCodeDescription) : undefined,
        amountPKR:             raw.amount       !== undefined ? Number(raw.amount)       / 100 : undefined,
        refundedAmountPKR:     pai?.refundedAmount  !== undefined ? Number(pai.refundedAmount)  / 100 : undefined,
        depositedAmountPKR:    pai?.depositedAmount !== undefined ? Number(pai.depositedAmount) / 100 : undefined,
        paymentState:          pai?.paymentState ? String(pai.paymentState) : undefined,
        cardMask:              card?.pan            ? String(card.pan)            : undefined,
        cardholderName:        card?.cardholderName ? String(card.cardholderName) : undefined,
        date:                  raw.date ? String(raw.date) : undefined,
        raw,
      };
    } catch (err) {
      return { success: false, errorCode: "NETWORK_ERROR", errorMessage: String(err) };
    }
  }

  /* ── Refund ── */
  /**
   * Refund a deposited order.
   * Per spec v1.32.3 §2.11, `amount` (in paisa) is MANDATORY for refund.do.
   * Pass the full transaction amount for a full refund, or a lesser amount for a partial refund.
   */
  async refund(meezanOrderId: string, amountPKR: number): Promise<RefundResult> {
    try {
      const params: Record<string, string> = {
        userName: this.user,
        password: this.pass,
        orderId:  meezanOrderId,
        amount:   this.paisas(amountPKR),
        language: "EN",
      };
      const raw = await this.post("refund.do", params);
      const ec  = raw.errorCode;
      if (ec !== undefined && String(ec) !== "0") {
        return { success: false, errorCode: String(ec), errorMessage: String(raw.errorMessage ?? ""), raw };
      }
      return { success: true, raw };
    } catch (err) {
      return { success: false, errorCode: "NETWORK_ERROR", errorMessage: String(err) };
    }
  }

  /* ── Reverse / Void ── */
  async reverse(meezanOrderId: string): Promise<RefundResult> {
    try {
      const raw = await this.post("reverse.do", {
        userName: this.user,
        password: this.pass,
        orderId:  meezanOrderId,
        language: "EN",
      });
      const ec = raw.errorCode;
      if (ec !== undefined && String(ec) !== "0") {
        return { success: false, errorCode: String(ec), errorMessage: String(raw.errorMessage ?? ""), raw };
      }
      return { success: true, raw };
    } catch (err) {
      return { success: false, errorCode: "NETWORK_ERROR", errorMessage: String(err) };
    }
  }

  /* ── Deposit (complete pre-auth) ── */
  async deposit(meezanOrderId: string, amountPKR: number): Promise<RefundResult> {
    try {
      const raw = await this.post("deposit.do", {
        userName: this.user,
        password: this.pass,
        orderId:  meezanOrderId,
        amount:   this.paisas(amountPKR),
        language: "EN",
      });
      const ec = raw.errorCode;
      if (ec !== undefined && String(ec) !== "0") {
        return { success: false, errorCode: String(ec), errorMessage: String(raw.errorMessage ?? ""), raw };
      }
      return { success: true, raw };
    } catch (err) {
      return { success: false, errorCode: "NETWORK_ERROR", errorMessage: String(err) };
    }
  }

  /**
   * Low-level diagnostic probe — does NOT use the EPG client credentials,
   * just hits the endpoint and returns everything raw.
   * Used by the /admin/meezan/diagnose route.
   */
  async probe(endpoint = "register.do"): Promise<DiagnoseResult> {
    const url  = `${this.base}/${endpoint}`;
    const t0   = Date.now();
    const result: DiagnoseResult = {
      reachable:       false,
      httpStatus:      null,
      contentType:     null,
      responseSnippet: null,
      isJson:          false,
      isHtml:          false,
      endpoint:        url,
      requestedAt:     new Date().toISOString(),
      durationMs:      0,
    };

    try {
      const raw = await rawPost(url, {
        userName:    this.user,
        password:    this.pass,
        orderNumber: `PROBE-${Date.now().toString(36).toUpperCase()}`,
        amount:      "100",   /* 1 PKR in paisa */
        currency:    "586",
        returnUrl:   "https://example.com/return",
        failUrl:     "https://example.com/fail",
        description: "connectivity_probe",
        language:    "EN",
      });

      result.reachable       = true;
      result.httpStatus      = raw.status;
      result.contentType     = raw.contentType;
      result.responseSnippet = raw.text.slice(0, 1000);
      result.isHtml          = detectHtml(raw.contentType, raw.text);
      result.isJson          = !result.isHtml && !!parseJsonSafe(raw.text);

      if (result.isJson) {
        const parsed = parseJsonSafe(raw.text)!;
        result.parsedJson   = parsed;
        result.errorCode    = parsed.errorCode !== undefined ? String(parsed.errorCode) : undefined;
        result.errorMessage = parsed.errorMessage ? String(parsed.errorMessage) : undefined;
      } else if (result.isHtml) {
        result.errorCode    = "HTML_RESPONSE";
        result.errorMessage = htmlHint(raw.text.slice(0, 800));
      }
    } catch (netErr: any) {
      result.networkError = String(netErr);
      result.reachable    = false;
    }

    result.durationMs = Date.now() - t0;

    /* Also fetch the server's outbound IP */
    result.serverIp = await getServerIp();

    return result;
  }
}

/* ──────────────────────────────────────────────────────
   STANDALONE DIAGNOSTIC — no credentials needed
   Used by /admin/meezan/diagnose when no EPG client is available
────────────────────────────────────────────────────── */

export async function probeMeezanConnectivity(isLive: boolean): Promise<DiagnoseResult> {
  const base = isLive ? LIVE_BASE : SANDBOX_BASE;
  const url  = `${base}/register.do`;
  const t0   = Date.now();

  const result: DiagnoseResult = {
    reachable:       false,
    httpStatus:      null,
    contentType:     null,
    responseSnippet: null,
    isJson:          false,
    isHtml:          false,
    endpoint:        url,
    requestedAt:     new Date().toISOString(),
    durationMs:      0,
  };

  try {
    /* Send with obviously wrong credentials — we're only checking connectivity */
    const raw = await rawPost(url, {
      userName:    "__probe__",
      password:    "__probe__",
      orderNumber: `PROBE-${Date.now().toString(36).toUpperCase()}`,
      amount:      "100",
      currency:    "586",
      returnUrl:   "https://example.com/return",
      failUrl:     "https://example.com/fail",
      description: "connectivity_probe",
      language:    "EN",
    });

    result.reachable       = true;
    result.httpStatus      = raw.status;
    result.contentType     = raw.contentType;
    result.responseSnippet = raw.text.slice(0, 1000);
    result.isHtml          = detectHtml(raw.contentType, raw.text);
    result.isJson          = !result.isHtml && !!parseJsonSafe(raw.text);

    if (result.isJson) {
      const parsed = parseJsonSafe(raw.text)!;
      result.parsedJson   = parsed;
      result.errorCode    = parsed.errorCode !== undefined ? String(parsed.errorCode) : undefined;
      result.errorMessage = parsed.errorMessage ? String(parsed.errorMessage) : undefined;
    } else if (result.isHtml) {
      result.errorCode    = "HTML_RESPONSE";
      result.errorMessage = htmlHint(raw.text.slice(0, 800));
    }
  } catch (netErr: any) {
    result.networkError = String(netErr);
    result.reachable    = false;
  }

  result.durationMs = Date.now() - t0;
  result.serverIp   = await getServerIp();
  return result;
}

/* ──────────────────────────────────────────────────────
   SERVER IP UTILITY (cached for 5 minutes)
────────────────────────────────────────────────────── */

let _cachedIp: string | null = null;
let _cachedIpAt = 0;

export async function getServerIp(): Promise<string> {
  if (_cachedIp && Date.now() - _cachedIpAt < 5 * 60 * 1000) return _cachedIp;
  try {
    const r = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const d = await r.json() as { ip?: string };
      _cachedIp   = d.ip ?? "unknown";
      _cachedIpAt = Date.now();
      return _cachedIp;
    }
  } catch { /* fallback */ }
  return _cachedIp ?? "unknown";
}

/**
 * Egress context for "hosted acquiring page works but securepayment REST fails" —
 * usually two different outbound IPs; Meezan must whitelist every IP that calls register.do.
 */
export interface MeezanEgressContext {
  detectedOutboundIp: string;
  /** ipify result from the server where checkout already succeeds (set env on THIS host to compare) */
  knownCheckoutEgressIp: string | null;
  matchesKnownCheckout: boolean | null;
  /** De-duplicated list: this host + known checkout + extras — email this bundle to Meezan */
  whitelistBundleIps: string[];
  liveRestBase: string;
  sandboxRestBase: string;
  flowNote: string;
}

export async function getMeezanEgressContext(): Promise<MeezanEgressContext> {
  const detectedOutboundIp = await getServerIp();
  const knownRaw = process.env.MEEZAN_KNOWN_CHECKOUT_EGRESS_IP?.trim();
  const knownCheckoutEgressIp = knownRaw && knownRaw.length > 0 ? knownRaw : null;
  const matchesKnownCheckout =
    knownCheckoutEgressIp === null ? null : knownCheckoutEgressIp === detectedOutboundIp;

  const extras =
    process.env.MEEZAN_WHITELIST_ALL_IPS?.split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0) ?? [];

  const whitelistBundleIps = [
    ...new Set(
      [detectedOutboundIp, ...(knownCheckoutEgressIp ? [knownCheckoutEgressIp] : []), ...extras].filter(
        (ip) => ip && ip !== "unknown",
      ),
    ),
  ];

  return {
    detectedOutboundIp,
    knownCheckoutEgressIp,
    matchesKnownCheckout,
    whitelistBundleIps,
    liveRestBase: LIVE_BASE,
    sandboxRestBase: SANDBOX_BASE,
    flowNote:
      "Customer browser opens acquiring.meezanbank.com (hosted pay page). " +
      "Your backend calls securepayment.meezanbank.com/payment/rest/register.do — different edge; " +
      "HTTP 301 to site / usually means this outbound IP is not allowed for REST until Meezan whitelists it.",
  };
}

/* ──────────────────────────────────────────────────────
   FACTORY HELPERS
────────────────────────────────────────────────────── */

export function buildMeezanClient(
  settings: {
    environment:      string;
    sandboxUsername?: string | null;
    sandboxPassword?: string | null;
    liveUsername?:    string | null;
    livePassword?:    string | null;
    returnUrl?:       string | null;
    failUrl?:         string | null;
  },
  overrideUrls?: { returnUrl: string; failUrl: string },
): MeezanEpg | null {
  const isLive = settings.environment === "live";
  const user   = isLive ? settings.liveUsername   : settings.sandboxUsername;
  const pass   = isLive ? settings.livePassword   : settings.sandboxPassword;
  if (!user || !pass) return null;
  return new MeezanEpg({
    username:  user,
    password:  pass,
    isLive,
    returnUrl: overrideUrls?.returnUrl || settings.returnUrl || "/payment/success",
    failUrl:   overrideUrls?.failUrl   || settings.failUrl   || "/payment/failed",
  });
}

/* ──────────────────────────────────────────────────────
   PURE UTILITY HELPERS
────────────────────────────────────────────────────── */

/**
 * Returns true when a Meezan order is considered paid/approved.
 *
 * Per spec v1.32.3 §2.13 orderStatus values:
 *   1 = Transaction approved (one-phase payment) — funds secured immediately
 *   2 = Amount deposited successfully (two-phase after deposit.do, or confirmed one-phase)
 *
 * Both statuses indicate that the customer's payment has been captured.
 * Checking only status=2 would silently miss one-phase approved orders.
 */
export function isPaid(orderStatus: number | undefined): boolean {
  return orderStatus === 1 || orderStatus === 2;
}

/** Unique order reference for Meezan (e.g. KBDF-M5QAC-XY12) */
export function generateOrderRef(prefix = "KBDF"): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

/** Invoice number (e.g. INV-2026-54321) */
export function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `INV-${year}-${rand}`;
}

/**
 * Meezan orderStatus codes — per official API spec v1.32.3 §2.13:
 *  0 → Order registered, but not paid
 *  1 → Transaction approved (one-phase) / Pre-auth hold (two-phase)
 *  2 → Amount deposited successfully (PAID)
 *  3 → Authorization has been REVERSED
 *  4 → Transaction has been REFUNDED
 *  6 → Authorization DECLINED
 *
 * NOTE: Status 5 does NOT exist in the spec. The sequence jumps from 4 to 6.
 */
export const ORDER_STATUS_LABELS: Record<number, string> = {
  0: "Registered",
  1: "Pre-Authorised",
  2: "Paid",
  3: "Reversed",
  4: "Refunded",
  6: "Declined",
};
