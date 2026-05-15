/**
 * When Vite `base` is `/admin/` but the user opens `/dashboard` or `/` on the host root,
 * wouter routes do not match and the app can show a blank dark screen. Normalize once at boot.
 */
export function ensureAdminBasePath(): void {
  if (typeof window === "undefined") return;

  const base = (import.meta.env.BASE_URL || "/admin/").replace(/\/$/, "");
  if (!base || base === "/") return;

  const { pathname, search, hash } = window.location;
  if (pathname === base || pathname.startsWith(`${base}/`)) return;

  const suffix = pathname === "/" ? "/" : pathname;
  window.location.replace(`${base}${suffix}${search}${hash}`);
}
