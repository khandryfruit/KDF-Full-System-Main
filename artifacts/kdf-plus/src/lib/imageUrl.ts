const IMAGE_UPLOAD = "/image/upload/";

function injectCloudinaryTransforms(absUrl: string, maxWidth?: number): string {
  const lower = absUrl.toLowerCase();
  if (!lower.includes("cloudinary.com") && lower.indexOf(IMAGE_UPLOAD) === -1) return absUrl;
  const idx = absUrl.indexOf(IMAGE_UPLOAD);
  if (idx === -1) return absUrl;
  const tail = absUrl.slice(idx + IMAGE_UPLOAD.length);
  if (/\bf_auto\b/i.test(tail)) return absUrl;
  const cap =
    maxWidth != null && maxWidth > 0 ? Math.min(Math.round(maxWidth), 2000) : 0;
  const transforms =
    cap > 0 ? `f_auto,q_auto:good,c_limit,w_${cap},dpr_auto` : `f_auto,q_auto:good`;
  return `${absUrl.slice(0, idx + IMAGE_UPLOAD.length)}${transforms}/${tail}`;
}

/**
 * Resolves storage-relative paths and applies Cloudinary delivery optimization for remote URLs.
 */
export function getProductImageSrc(
  url: string | undefined,
  opts?: { maxWidth?: number },
): string {
  if (!url) return "/placeholder.jpg";
  let resolved: string;
  if (url.startsWith("//")) resolved = `https:${url}`;
  else if (url.startsWith("http://") || url.startsWith("https://")) resolved = url;
  else if (url.startsWith("/api/storage")) resolved = url;
  else if (url.startsWith("/objects/")) resolved = `/api/storage${url}`;
  else if (url.startsWith("objects/")) resolved = `/api/storage/${url}`;
  else resolved = `/api/storage/objects/${url}`;

  if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
    return injectCloudinaryTransforms(resolved, opts?.maxWidth);
  }
  return resolved;
}
