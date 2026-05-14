/**
 * Normalised API base URL for browser → api-server (scheme + host, no path, no trailing slash).
 *
 * Railway: set `VITE_API_BASE_URL=https://api.khanbabadryfruits.com` (also accepts `VITE_API_URL`).
 * Dockerfiles default this at build time so login and `/api` calls never hit the static host when unset.
 * Never set it to `https://admin.*` — that breaks uploads, SSE, and Shopify webhooks.
 *
 * Strips accidental trailing `/api` or `/` so `API_BASE + "/api/..."` never doubles `/api`.
 */

/** Fixes copy-paste like `Value: https://api...` or `https://Value: https://api...`. */
function sanitizeMessyApiOriginString(raw: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  s = s.replace(/^\s*(value|variable|url|api\s*url|env)\s*:\s*/i, "").trim();
  s = s.replace(/\b(value|variable)\s*:\s*/gi, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^["']+|["']+$/g, "").trim();

  const tokenRe = /https?:\/\/[^\s"'<>]+/gi;
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(s)) !== null) {
    const t = m[0].replace(/["')]+$/g, "").trim();
    try {
      const u = new URL(t);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      const host = u.hostname.toLowerCase();
      if (!host || host === "value") continue;
      tokens.push(`${u.protocol}//${u.host}`);
    } catch {
      /* skip */
    }
  }
  let pick = "";
  const apiTok = tokens.find((x) => /\/\/api\./i.test(x));
  if (apiTok) pick = apiTok;
  else if (tokens.length) pick = tokens[tokens.length - 1] ?? "";
  if (pick) return pick.replace(/\/+$/, "").replace(/\/api\/?$/i, "");
  const oneWord = s.replace(/\s+/g, "").replace(/^["']+|["']+$/g, "");
  if (oneWord && !/\s/.test(oneWord) && !/^https?:\/\//i.test(oneWord)) {
    return `https://${oneWord.replace(/\/api\/?$/i, "").replace(/\/+$/, "")}`;
  }
  return "";
}

function readEnvApiBase(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const candidates = [
    env.VITE_API_BASE_URL,
    env.VITE_API_URL,
    env.VITE_NEXT_PUBLIC_API_URL,
    env.API_BASE_URL,
    env.PUBLIC_API_ORIGIN,
  ];
  for (const v of candidates) {
    if (v && String(v).trim()) {
      const cleaned = sanitizeMessyApiOriginString(String(v).trim());
      if (cleaned) return cleaned;
    }
  }
  return "";
}

/**
 * `railway-static-server.mjs` injects `window.__KDF_API_PUBLIC_ORIGIN__` into `index.html` at runtime
 * so API base is correct even if CDN/browser cached an older JS bundle without env bake-in.
 */
function readRuntimeInjectedApiOrigin(): string {
  if (typeof window === "undefined" || !import.meta.env.PROD) return "";
  try {
    const w = (window as Window & { __KDF_API_PUBLIC_ORIGIN__?: string }).__KDF_API_PUBLIC_ORIGIN__;
    if (typeof w !== "string" || !w.trim()) return "";
    const cleaned = sanitizeMessyApiOriginString(w.trim());
    if (!cleaned) return "";
    let raw = cleaned.replace(/\/api\/?$/i, "").replace(/\/+$/, "");
    if (!raw.startsWith("http")) raw = `https://${raw}`;
    const host = new URL(raw).hostname.toLowerCase();
    if (host.startsWith("admin.") || host === "value") return "";
    return raw.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/** When env is missing/wrong, derive API origin from the page hostname (split admin / storefront). */
function inferApiBaseFromWindow(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname.toLowerCase();
  if (h.startsWith("admin.")) {
    const rest = h.slice("admin.".length);
    return `${window.location.protocol}//api.${rest}`.replace(/\/+$/, "");
  }
  const map: Record<string, string> = {
    "www.khanbabadryfruits.com": "https://api.khanbabadryfruits.com",
    "khanbabadryfruits.com": "https://api.khanbabadryfruits.com",
  };
  if (map[h]) return map[h];
  if (h.endsWith("khanbabadryfruits.com") && !h.startsWith("api.")) {
    return "https://api.khanbabadryfruits.com";
  }
  return "";
}

export function getApiBase(): string {
  const injected = readRuntimeInjectedApiOrigin();
  if (injected) return injected;

  let raw = readEnvApiBase();
  let base = raw.replace(/\/api\/?$/i, "").replace(/\/+$/, "");

  if (base) {
    try {
      const url = new URL(base.startsWith("http") ? base : `https://${base}`);
      const host = url.hostname.toLowerCase();
      if (host.startsWith("admin.")) {
        base = "";
      }
    } catch {
      base = "";
    }
  }

  if (!base) {
    base = inferApiBaseFromWindow();
  }

  return base.replace(/\/+$/, "");
}

const PROD_API_FALLBACK = "https://api.khanbabadryfruits.com";

/**
 * Origin used for all browser → api-server traffic (fetch patch, Orval `setBaseUrl`, `apiPublicUrl`).
 * In production builds, never empty — avoids relative `/api` hitting the static admin host.
 */
export function getEffectiveApiOrigin(): string {
  const b = getApiBase().replace(/\/+$/, "");
  if (b) return b;
  if (import.meta.env.PROD) return PROD_API_FALLBACK;
  return "";
}

/**
 * Absolute URL for `/api/...` paths. Use for `EventSource` (fetch patch does not apply).
 */
export function apiPublicUrl(pathWithQuery: string): string {
  const p = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const base = getEffectiveApiOrigin().replace(/\/+$/, "");
  if (!base) return p;
  return `${base}${p}`;
}

/** Path like `/admin/shopify/store` → URL for `/api/admin/shopify/store` (absolute when API base is set). */
export function adminApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return apiPublicUrl(`/api${p}`);
}

/**
 * @deprecated Prefer `getApiBase()` or `apiPublicUrl("/api/...")` at call time.
 * Module-load snapshot can be empty before hostname/env is available in some bundles.
 */
export const API_BASE = getApiBase();
