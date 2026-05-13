const STORAGE_BASE = "/api/storage";

export function getProductImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/api/storage")) return path;
  if (path.startsWith("/objects/")) return `${STORAGE_BASE}${path}`;
  if (path.startsWith("objects/")) return `${STORAGE_BASE}/${path}`;
  return `${STORAGE_BASE}/objects/${path}`;
}

export function getProductImageSrc(
  path: string | null | undefined,
  fallback?: string
): string {
  return getProductImageUrl(path) ?? fallback ?? "";
}
