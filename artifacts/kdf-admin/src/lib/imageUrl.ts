export function getProductImageSrc(url: string | undefined): string {
  if (!url) return "/placeholder.jpg";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/api/storage")) return url;
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  if (url.startsWith("objects/")) return `/api/storage/${url}`;
  return `/api/storage/objects/${url}`;
}
