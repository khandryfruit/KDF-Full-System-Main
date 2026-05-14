/**
 * Normalised API base URL for browser → api-server (scheme + host, no path, no trailing slash).
 *
 * Railway: set `VITE_API_BASE_URL=https://api.khanbabadryfruits.com` (also accepts `VITE_API_URL`).
 * Dockerfiles default this at build time so login and `/api` calls never hit the static host when unset.
 * Never set it to `https://admin.*` — that breaks uploads, SSE, and Shopify webhooks.
 *
 * Strips accidental trailing `/api` or `/` so `API_BASE + "/api/..."` never doubles `/api`.
 */

function readEnvApiBase(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const candidates = [
    env.VITE_API_BASE_URL,
    env.VITE_API_URL,
    env.VITE_NEXT_PUBLIC_API_URL,
    env.API_BASE_URL,
  ];
  for (const v of candidates) {
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

export function getApiBase(): string {
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

  if (!base && typeof window !== "undefined") {
    const h = window.location.hostname.toLowerCase();
    if (h.startsWith("admin.")) {
      const rest = h.slice("admin.".length);
      base = `${window.location.protocol}//api.${rest}`.replace(/\/+$/, "");
    }
    const map: Record<string, string> = {
      "www.khanbabadryfruits.com": "https://api.khanbabadryfruits.com",
      "khanbabadryfruits.com": "https://api.khanbabadryfruits.com",
    };
    if (!base && map[h]) base = map[h];
    /* Last-resort for split deploys: any storefront or admin host on this zone → API host. */
    if (!base && h.endsWith("khanbabadryfruits.com") && !h.startsWith("api.")) {
      base = "https://api.khanbabadryfruits.com";
    }
  }

  return base.replace(/\/+$/, "");
}

/**
 * Absolute URL for `/api/...` paths. Use for `EventSource` (fetch patch does not apply).
 */
export function apiPublicUrl(pathWithQuery: string): string {
  const p = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const base = getApiBase().replace(/\/+$/, "");
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
