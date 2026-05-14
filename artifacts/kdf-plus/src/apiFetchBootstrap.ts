import { getPublicApiOrigin } from "./lib/apiOrigin";

function apiOriginPrefix(): string {
  return getPublicApiOrigin().replace(/\/+$/, "");
}

function rewriteInput(input: RequestInfo | URL): RequestInfo | URL {
  const origin = apiOriginPrefix();
  if (!origin || typeof window === "undefined") return input;

  if (typeof input === "string") {
    if (input.startsWith("/api")) return `${origin}${input}`;
    return input;
  }

  if (input instanceof URL) {
    if (input.origin === window.location.origin && input.pathname.startsWith("/api")) {
      return `${origin}${input.pathname}${input.search}${input.hash}`;
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
      const href = `${origin}${u.pathname}${u.search}${u.hash}`;
      return new Request(href, input);
    }
    return input;
  }

  return input;
}

function install(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { __kdfApiFetchPatched?: boolean };
  if (w.__kdfApiFetchPatched) return;
  w.__kdfApiFetchPatched = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    nativeFetch(rewriteInput(input) as RequestInfo, init);
}

install();
