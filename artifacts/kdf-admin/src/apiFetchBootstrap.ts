/**
 * When the admin SPA is on a different origin than api-server (Railway: admin host vs api host),
 * relative fetch URLs that start with /api must be rewritten to the API origin (VITE_API_BASE_URL).
 * Also rewrites mistaken absolute URLs on the admin origin under /api to the API origin.
 */
import { getApiBase } from "./lib/apiBase";

function apiOriginPrefix(): string {
  return getApiBase().replace(/\/$/, "");
}

/** Map same-origin paths to `/api/...` so they can be sent to the API host (Vite base may be `/admin/`). */
function sameOriginApiPath(pathname: string): string | null {
  if (pathname === "/api" || pathname.startsWith("/api/")) return pathname;
  if (pathname === "/admin/api" || pathname.startsWith("/admin/api/")) {
    return pathname.slice("/admin".length) || "/api";
  }
  return null;
}

function shouldRewriteApiUrl(u: URL): boolean {
  if (typeof window === "undefined") return false;
  if (sameOriginApiPath(u.pathname) == null) return false;
  if (u.origin === window.location.origin) return true;
  const h = u.hostname.toLowerCase();
  if (h.startsWith("admin.")) return true;
  return false;
}

function rewriteInput(input: RequestInfo | URL): RequestInfo | URL {
  const prefix = apiOriginPrefix();
  if (!prefix || typeof window === "undefined") return input;

  if (typeof input === "string") {
    let pathPart = input;
    let suffix = "";
    const q = input.indexOf("?");
    const h = input.indexOf("#");
    if (q >= 0) {
      pathPart = input.slice(0, q);
      suffix = input.slice(q);
    } else if (h >= 0) {
      pathPart = input.slice(0, h);
      suffix = input.slice(h);
    }
    const mapped = sameOriginApiPath(pathPart);
    if (mapped != null) {
      return `${prefix}${mapped}${suffix}`;
    }
    try {
      const u = new URL(input, window.location.href);
      const p = sameOriginApiPath(u.pathname);
      if (p != null && shouldRewriteApiUrl(u)) {
        return `${prefix}${p}${u.search}${u.hash}`;
      }
    } catch {
      /* ignore */
    }
    return input;
  }

  if (input instanceof URL) {
    const p = sameOriginApiPath(input.pathname);
    if (p != null && shouldRewriteApiUrl(input)) {
      return `${prefix}${p}${input.search}${input.hash}`;
    }
    return input;
  }

  if (input instanceof Request) {
    let reqUrl: string;
    try {
      reqUrl = input.url;
    } catch {
      return input;
    }
    const u = new URL(reqUrl);
    const p = sameOriginApiPath(u.pathname);
    if (p != null && shouldRewriteApiUrl(u)) {
      const href = `${prefix}${p}${u.search}${u.hash}`;
      return new Request(href, input);
    }
    return input;
  }

  return input;
}

function install(): void {
  if (typeof window === "undefined") return;
  const win = window as Window & { __kdfAdminApiFetchPatched?: boolean };
  if (win.__kdfAdminApiFetchPatched) return;
  win.__kdfAdminApiFetchPatched = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    nativeFetch(rewriteInput(input) as RequestInfo, init);
}

install();
