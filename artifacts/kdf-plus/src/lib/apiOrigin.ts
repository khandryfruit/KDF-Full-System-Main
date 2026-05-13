/**
 * Public storefront API origin. Used when the static site is served from a
 * different host than the API (e.g. www → api subdomain) so `/api/...` calls
 * must be rewritten to the API server.
 */
export function getPublicApiOrigin(): string {
  const env = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (env && typeof env === "string" && env.trim()) {
    return env.replace(/\/+$/, "");
  }
  if (typeof window === "undefined") return "";
  const h = window.location.hostname.toLowerCase();
  const map: Record<string, string> = {
    "www.khanbabadryfruits.com": "https://api.khanbabadryfruits.com",
    "khanbabadryfruits.com": "https://api.khanbabadryfruits.com",
  };
  return map[h] ?? "";
}
