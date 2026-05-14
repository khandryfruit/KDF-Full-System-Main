/**
 * Normalised API base URL for direct browser → api-server calls.
 *
 * On Replit: VITE_API_BASE_URL is not set → "" → relative URLs → Vite proxy → api-server.
 * On Railway: VITE_API_BASE_URL = "https://workspaceapi-server-production-6674.up.railway.app"
 *             (NO trailing slash, NO /api suffix — we append /api/... ourselves).
 *
 * This function strips any accidental trailing "/api" or "/" so that:
 *   apiBase() + "/api/storage/uploads/image"
 * never becomes "/api/api/storage/uploads/image".
 */
export function getApiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
  let base = raw.replace(/\/api\/?$/, "").replace(/\/$/, "");
  // Production fallback when Railway build forgot VITE_* (same idea as kdf-plus apiOrigin map).
  if (!base && typeof window !== "undefined") {
    const h = window.location.hostname.toLowerCase();
    if (h === "admin.khanbabadryfruits.com") {
      base = "https://api.khanbabadryfruits.com";
    }
  }
  return base;
}

/** Convenience constant — use `API_BASE` in components. */
export const API_BASE = getApiBase();
