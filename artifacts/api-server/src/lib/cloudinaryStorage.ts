import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

let _configured = false;

/**
 * Parse CLOUDINARY_URL env var to extract credentials.
 * Format: cloudinary://api_key:api_secret@cloud_name
 *
 * This is used as a fallback when individual env vars are missing or
 * incorrectly set (e.g. CLOUDINARY_CLOUD_NAME accidentally set to the
 * full URL string instead of just the cloud name).
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
 * Priority: individual vars → CLOUDINARY_URL parse.
 * If CLOUDINARY_CLOUD_NAME looks like a full URL, ignore it and use CLOUDINARY_URL.
 */
function resolveCloudinaryConfig(): {
  cloud_name: string;
  api_key: string;
  api_secret: string;
} | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const cloudinaryUrl = process.env.CLOUDINARY_URL;

  // Use individual vars only if cloud_name looks like a plain name (no slashes/colons).
  // If someone accidentally pasted the full URL into CLOUDINARY_CLOUD_NAME, skip it.
  const cloudNameValid =
    cloudName && !cloudName.includes("://") && !cloudName.includes("=");

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

function getCloudinary() {
  if (!_configured) {
    const cfg = resolveCloudinaryConfig();
    if (!cfg) throw new Error("Cloudinary is not configured");
    cloudinary.config({
      cloud_name: cfg.cloud_name,
      api_key: cfg.api_key,
      api_secret: cfg.api_secret,
      secure: true,
    });
    _configured = true;
  }
  return cloudinary;
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  folder = "kdf-uploads"
): Promise<string> {
  const cld = getCloudinary();

  return new Promise<string>((resolve, reject) => {
    const stream = cld.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        format: "webp",
        quality: "auto",
        fetch_format: "auto",
      },
      (error, result: UploadApiResponse | undefined) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("No result from Cloudinary"));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}
