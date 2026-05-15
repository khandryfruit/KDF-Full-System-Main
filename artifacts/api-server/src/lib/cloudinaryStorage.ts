// NOTE: Do NOT add a top-level `import cloudinary from "cloudinary"` here.
// The Cloudinary SDK reads and validates CLOUDINARY_URL at module-load time,
// which crashes the server on startup if the env var is missing or malformed.
// Instead, we import it lazily inside the upload function so startup is safe.

let _configured = false;

/**
 * Parse CLOUDINARY_URL env var to extract credentials.
 * Format: cloudinary://api_key:api_secret@cloud_name
 */
function parseCloudinaryUrl(url: string): {
  cloud_name: string;
  api_key: string;
  api_secret: string;
} | null {
  try {
    const match = url.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (!match) return null;
    return { api_key: match[1], api_secret: match[2], cloud_name: match[3] };
  } catch {
    return null;
  }
}

/**
 * Resolve Cloudinary credentials from env vars.
 * Priority: individual vars (if cloud_name is a plain name) → CLOUDINARY_URL parse.
 * Ignores CLOUDINARY_CLOUD_NAME if it looks like a full URL (common misconfiguration).
 */
export function resolveCloudinaryConfig(): {
  cloud_name: string;
  api_key: string;
  api_secret: string;
} | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const cloudinaryUrl = process.env.CLOUDINARY_URL;

  // Use individual vars only when CLOUDINARY_CLOUD_NAME is a plain name,
  // not a URL string (e.g. someone accidentally pasted the full URL there).
  const cloudNameValid =
    cloudName &&
    !cloudName.includes("://") &&
    !cloudName.includes("=") &&
    !cloudName.includes(" ");

  if (cloudNameValid && apiKey && apiSecret) {
    return { cloud_name: cloudName!, api_key: apiKey, api_secret: apiSecret };
  }

  // Fall back to parsing CLOUDINARY_URL.
  if (cloudinaryUrl) {
    const parsed = parseCloudinaryUrl(cloudinaryUrl);
    if (parsed) return parsed;
  }

  return null;
}

export function isCloudinaryConfigured(): boolean {
  return resolveCloudinaryConfig() !== null;
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  folder = "kdf-uploads"
): Promise<string> {
  const cfg = resolveCloudinaryConfig();
  if (!cfg) throw new Error("Cloudinary is not configured");

  // Lazy import — avoids the SDK's startup-time CLOUDINARY_URL validation
  // which crashes the server if the env var is absent or malformed.
  const { v2: cloudinary } = await import("cloudinary");

  // Always configure programmatically so env-var quirks don't matter.
  if (!_configured) {
    cloudinary.config({
      cloud_name: cfg.cloud_name,
      api_key: cfg.api_key,
      api_secret: cfg.api_secret,
      secure: true,
    });
    _configured = true;
  }

  return new Promise<string>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        format: "webp",
        quality: "auto",
        fetch_format: "auto",
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("No result from Cloudinary"));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

/** Cloudinary delivery URL → on-the-fly thumbnail (no extra upload). */
export function cloudinaryDeliveryThumbnailUrl(fullUrl: string): string | null {
  if (!fullUrl || typeof fullUrl !== "string") return null;
  const marker = "/upload/";
  const i = fullUrl.indexOf(marker);
  if (i === -1) return null;
  return `${fullUrl.slice(0, i + marker.length)}c_limit,w_320,h_320,q_auto,f_auto/${fullUrl.slice(i + marker.length)}`;
}
