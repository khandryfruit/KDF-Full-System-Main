const IMAGE_UPLOAD = "/image/upload/";

/**
 * Injects Cloudinary delivery transforms (auto format, quality, optional max width).
 * No-op for non-Cloudinary URLs.
 */
export function optimizeCloudinaryDelivery(url: string, maxWidth?: number): string {
  if (!url) return url;
  const lower = url.toLowerCase();
  if (!lower.includes("cloudinary.com") && !lower.includes(IMAGE_UPLOAD)) return url;
  const idx = url.indexOf(IMAGE_UPLOAD);
  if (idx === -1) return url;
  const tail = url.slice(idx + IMAGE_UPLOAD.length);
  if (/\bf_auto\b/i.test(tail)) return url;
  const cap =
    maxWidth != null && maxWidth > 0 ? Math.min(Math.round(maxWidth), 2000) : 0;
  const transforms =
    cap > 0 ? `f_auto,q_auto:good,c_limit,w_${cap},dpr_auto` : `f_auto,q_auto:good`;
  return `${url.slice(0, idx + IMAGE_UPLOAD.length)}${transforms}/${tail}`;
}
