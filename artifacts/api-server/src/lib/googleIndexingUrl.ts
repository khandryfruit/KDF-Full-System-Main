/**
 * Canonical HTTPS URLs for Google Indexing API submissions.
 */

export const DEFAULT_INDEXING_SITE = "https://khanbabadryfruits.com";

export type UrlNormalizeResult = {
  url: string | null;
  error?: string;
  wasFixed?: boolean;
};

/** Normalize admin-configured site base (always https, no trailing slash). */
export function normalizeSiteUrl(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;

  let working = input.trim().replace(/\s+/g, "");
  if (working.startsWith("//")) {
    working = `https:${working}`;
  } else if (!/^https?:\/\//i.test(working)) {
    working = `https://${working.replace(/^\/+/, "")}`;
  }
  working = working.replace(/^http:\/\//i, "https://");

  try {
    const u = new URL(working);
    if (!u.hostname || u.hostname.includes(" ")) return null;
    return `https://${u.hostname.toLowerCase()}`;
  } catch {
    const host = working
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    return host ? `https://${host}` : null;
  }
}

/**
 * Normalize any URL/path to a full https:// URL for Google Indexing API.
 */
export function normalizeIndexingUrl(
  input: string,
  baseSiteUrl?: string | null,
): UrlNormalizeResult {
  const raw = (input ?? "").trim();
  if (!raw) return { url: null, error: "URL is empty" };

  const base = normalizeSiteUrl(baseSiteUrl) ?? DEFAULT_INDEXING_SITE;
  const original = raw;
  let working = raw;

  if (working.startsWith("//")) {
    working = `https:${working}`;
  } else if (working.startsWith("/")) {
    working = `${base}${working}`;
  } else if (!/^https?:\/\//i.test(working)) {
    const firstSeg = working.split("/")[0] ?? "";
    const looksLikeHost = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i.test(firstSeg);
    if (looksLikeHost) {
      working = `https://${working.replace(/^\/+/, "")}`;
    } else {
      working = `${base}/${working.replace(/^\/+/, "")}`;
    }
  }

  working = working.replace(/^http:\/\//i, "https://");

  try {
    const u = new URL(working);
    if (!u.hostname || u.hostname.includes(" ")) {
      return { url: null, error: "Invalid hostname" };
    }
    const path = u.pathname.replace(/\/{2,}/g, "/") || "/";
    const normalized = `https://${u.hostname.toLowerCase()}${path === "/" ? "" : path.replace(/\/$/, "") || path}${u.search}`;
    const wasFixed = normalized !== original && !original.startsWith("https://");
    return { url: normalized, wasFixed: wasFixed || /^http:\/\//i.test(original) };
  } catch {
    return { url: null, error: `Invalid URL format: ${raw.slice(0, 120)}` };
  }
}

export function buildIndexingPathUrl(
  siteUrl: string | null | undefined,
  pathSegment: string,
  slug: string,
): string | null {
  const base = normalizeSiteUrl(siteUrl) ?? DEFAULT_INDEXING_SITE;
  const seg = pathSegment.replace(/^\/+|\/+$/g, "");
  const cleanSlug = slug.replace(/^\/+/, "");
  return normalizeIndexingUrl(`${base}/${seg}/${cleanSlug}`, base).url;
}

export function isValidIndexingUrl(url: string): boolean {
  return normalizeIndexingUrl(url).url != null;
}

/** Human-readable hint when URL was stored without protocol. */
export function describeUrlIssue(url: string): string | null {
  if (!url?.trim()) return "Empty URL";
  if (/^https:\/\//i.test(url.trim())) return null;
  if (/^http:\/\//i.test(url.trim())) return "HTTP should be HTTPS";
  return "Missing https:// protocol — URL was invalid for Google Indexing API";
}
