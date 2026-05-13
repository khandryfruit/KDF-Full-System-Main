/**
 * Public storefront API origin (scheme + host, no path).
 * Orval/customFetch prepend `/api/...` to this — so env must NOT end with `/api`
 * or we strip it (Railway often sets `https://host/api`).
 */
function normalizeApiOrigin(raw: string): string {
  let base = raw.trim().replace(/\/+$/, "");
  if (base.toLowerCase().endsWith("/api")) {
    base = base.slice(0, -4).replace(/\/+$/, "");
  }
  return base;
}

export function getPublicApiOrigin(): string {
  const env = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (env && typeof env === "string" && env.trim()) {
    return normalizeApiOrigin(env);
  }
  if (typeof window === "undefined") return "";
  const h = window.location.hostname.toLowerCase();
  const map: Record<string, string> = {
    "www.khanbabadryfruits.com": "https://api.khanbabadryfruits.com",
    "khanbabadryfruits.com": "https://api.khanbabadryfruits.com",
  };
  return map[h] ?? "";
}
