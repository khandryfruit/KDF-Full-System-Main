/**
 * When the admin SPA is on a different origin than api-server (Railway: admin.* vs api.*),
 * relative `fetch("/api/...")` must be rewritten to `VITE_API_BASE_URL + "/api/..."`.
 * Same pattern as kdf-plus `apiFetchBootstrap.ts`.
 */
import { getApiBase } from "./lib/apiBase";

function apiOriginPrefix(): string {
  return getApiBase().replace(/\/$/, "");
}

function rewriteInput(input: RequestInfo | URL): RequestInfo | URL {
  const prefix = apiOriginPrefix();
  if (!prefix || typeof window === "undefined") return input;

  if (typeof input === "string") {
    if (input.startsWith("/api")) return `${prefix}${input}`;
    return input;
  }

  if (input instanceof URL) {
    if (input.origin === window.location.origin && input.pathname.startsWith("/api")) {
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
    if (u.origin === window.location.origin && u.pathname.startsWith("/api")) {
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
