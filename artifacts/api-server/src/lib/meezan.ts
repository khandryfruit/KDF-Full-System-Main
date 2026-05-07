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
 * Currency : PKR = ISO 586, amounts sent in paisa (× 100)
 */

import { logger } from "./logger";

const SANDBOX_BASE = "https://test-securepayment.meezanbank.com/payment/rest";
const LIVE_BASE    = "https://securepayment.meezanbank.com/payment/rest";

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
      method:  "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept":       "application/json,text/json,*/*",
      },
      body:   new URLSearchParams(body).toString(),
      signal: ctrl.signal,
    });
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
    const res = await fetch(`${url}?${qs}`, {
      headers: { "Accept": "application/json,text/json,*/*" },
      signal:  ctrl.signal,
    });
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
    try {
      const raw = await this.post("register.do", {
        userName:    this.user,
        password:    this.pass,
        orderNumber: p.orderNumber,
        amount:      this.paisas(p.amountPKR),
        currency:    "586",
        returnUrl:   p.returnUrl || this.defaultReturn,
        failUrl:     p.failUrl   || this.defaultFail,
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
    try {
      const raw = await this.post("registerPreAuth.do", {
        userName:    this.user,
        password:    this.pass,
        orderNumber: p.orderNumber,
        amount:      this.paisas(p.amountPKR),
        currency:    "586",
        returnUrl:   p.returnUrl || this.defaultReturn,
        failUrl:     p.failUrl   || this.defaultFail,
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
  async refund(meezanOrderId: string, amountPKR?: number): Promise<RefundResult> {
    try {
      const params: Record<string, string> = {
        userName: this.user,
        password: this.pass,
        orderId:  meezanOrderId,
        language: "EN",
      };
      if (amountPKR !== undefined) params.amount = this.paisas(amountPKR);
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

/** Returns true when Meezan orderStatus === 2 (APPROVED / PAID) */
export function isPaid(orderStatus: number | undefined): boolean {
  return orderStatus === 2;
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
 * Meezan orderStatus codes:
 *  0 → registered (not paid)
 *  1 → pre-authorised
 *  2 → PAID / APPROVED
 *  3 → DECLINED / FAILED
 *  4 → reversed
 *  5 → refunded
 *  6 → partially refunded
 */
export const ORDER_STATUS_LABELS: Record<number, string> = {
  0: "Registered",
  1: "Pre-Authorised",
  2: "Paid",
  3: "Declined",
  4: "Reversed",
  5: "Refunded",
  6: "Partial Refund",
};
