import { getPublicApiOrigin } from "./lib/apiOrigin";

const origin = getPublicApiOrigin();

if (origin && typeof window !== "undefined") {
  const w = window as Window & { __kdfApiFetchPatched?: boolean };
  if (!w.__kdfApiFetchPatched) {
    w.__kdfApiFetchPatched = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && input.startsWith("/api")) {
        return nativeFetch(`${origin}${input}`, init);
      }
      return nativeFetch(input as RequestInfo, init);
    };
  }
}
