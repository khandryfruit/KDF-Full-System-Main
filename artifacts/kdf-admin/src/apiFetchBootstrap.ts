/**
 * When the admin SPA is on a different origin than api-server (Railway: admin.* vs api.*),
 * relative `fetch("/api/...")` must be rewritten to `VITE_API_BASE_URL + "/api/..."`.
 * Also rewrites absolute `https://admin.*/api/...` mistakes to the API origin.
 */
import { getApiBase } from "./lib/apiBase";

function apiOriginPrefix(): string {
  return getApiBase().replace(/\/$/, "");
}

function shouldRewriteApiUrl(u: URL): boolean {
  if (!u.pathname.startsWith("/api")) return false;
  if (typeof window === "undefined") return false;
  if (u.origin === window.location.origin) return true;
  const h = u.hostname.toLowerCase();
  if (h.startsWith("admin.")) return true;
  return false;
}

function rewriteInput(input: RequestInfo | URL): RequestInfo | URL {
  const prefix = apiOriginPrefix();
  if (!prefix || typeof window === "undefined") return input;

  if (typeof input === "string") {
    if (input.startsWith("/api")) return `${prefix}${input}`;
    try {
      const u = new URL(input, window.location.href);
      if (shouldRewriteApiUrl(u)) return `${prefix}${u.pathname}${u.search}${u.hash}`;
    } catch {
      /* ignore */
    }
    return input;
  }

  if (input instanceof URL) {
    if (shouldRewriteApiUrl(input)) {
      return `${prefix}${input.pathname}${input.search}${input.hash}`;
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
    if (shouldRewriteApiUrl(u)) {
      const href = `${prefix}${u.pathname}${u.search}${u.hash}`;
      return new Request(href, input);
    }
    return input;
  }

  return input;
}

function install(): void {
  if (typeof window === "undefined") return;
  if (!apiOriginPrefix()) return;
  const win = window as Window & { __kdfAdminApiFetchPatched?: boolean };
  if (win.__kdfAdminApiFetchPatched) return;
  win.__kdfAdminApiFetchPatched = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    nativeFetch(rewriteInput(input) as RequestInfo, init);
}

install();
