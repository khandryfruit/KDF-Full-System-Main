import sharp from "sharp";
import { getImageOptSettings, type ImageOptSettings } from "./imageOptimizer";
import { uploadBufferToStorage } from "./objectUpload";
import type { MediaVariants } from "@workspace/db/schema";

export const RESPONSIVE_WIDTHS = {
  thumbnail: 150,
  medium: 600,
  large: 1200,
  mobile: 480,
  desktop: 1920,
} as const;

export type ResponsiveSize = keyof typeof RESPONSIVE_WIDTHS;

export interface ProcessedMediaUpload {
  objectPath: string;
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
  processedSize: number;
  variants: MediaVariants;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 180) || "image";
}

async function encodeVariant(
  input: Buffer,
  maxWidth: number,
  settings: ImageOptSettings,
  preferAvif: boolean
): Promise<{ buffer: Buffer; contentType: string; extension: string; width: number; height: number }> {
  let pipeline = sharp(input);
  const meta = await pipeline.metadata();
  const w = meta.width ?? maxWidth;
  const h = meta.height ?? maxWidth;

  if (w > maxWidth) {
    pipeline = pipeline.resize(maxWidth, undefined, { withoutEnlargement: true, fit: "inside" });
  }

  const resized = await pipeline.toBuffer({ resolveWithObject: true });
  pipeline = sharp(resized.data);
  const outMeta = resized.info;

  const quality = settings.quality ?? 82;

  if (preferAvif) {
    try {
      const avif = await pipeline.avif({ quality, effort: 4 }).toBuffer();
      return {
        buffer: avif,
        contentType: "image/avif",
        extension: "avif",
        width: outMeta.width,
        height: outMeta.height,
      };
    } catch {
      /* fall through to webp */
    }
  }

  if (settings.convertToWebP !== false) {
    const webp = await pipeline.webp({ quality }).toBuffer();
    return {
      buffer: webp,
      contentType: "image/webp",
      extension: "webp",
      width: outMeta.width,
      height: outMeta.height,
    };
  }

  const jpeg = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  return {
    buffer: jpeg,
    contentType: "image/jpeg",
    extension: "jpg",
    width: outMeta.width,
    height: outMeta.height,
  };
}

/**
 * Process upload into responsive variants (thumbnail → desktop), upload each, return metadata.
 */
export async function processAndUploadMedia(
  inputBuffer: Buffer,
  originalFilename: string,
  options?: { preferAvif?: boolean; cloudinaryFolder?: string }
): Promise<ProcessedMediaUpload> {
  const settings = await getImageOptSettings();
  const preferAvif = options?.preferAvif ?? false;
  const folder = options?.cloudinaryFolder ?? "kdf-media";
  const baseName = sanitizeFilename(originalFilename.replace(/\.[^.]+$/, ""));

  const variants: MediaVariants = {};
  let primaryPath = "";
  let totalProcessed = 0;
  let primaryW = 0;
  let primaryH = 0;
  let primaryMime = "image/webp";

  const sizes = Object.entries(RESPONSIVE_WIDTHS) as [ResponsiveSize, number][];

  for (const [key, maxWidth] of sizes) {
    const encoded = await encodeVariant(inputBuffer, maxWidth, settings, preferAvif && key !== "thumbnail");
    const path = await uploadBufferToStorage(
      encoded.buffer,
      encoded.contentType,
      encoded.extension,
      "public",
      `${folder}/${baseName}-${key}`
    );
    variants[key] = {
      path,
      width: encoded.width,
      height: encoded.height,
      size: encoded.buffer.length,
      contentType: encoded.contentType,
    };
    totalProcessed += encoded.buffer.length;

    if (key === "large" || (!primaryPath && key === "medium")) {
      primaryPath = path;
      primaryW = encoded.width;
      primaryH = encoded.height;
      primaryMime = encoded.contentType;
    }
  }

  if (!primaryPath && variants.thumbnail) {
    primaryPath = variants.thumbnail.path;
    primaryW = variants.thumbnail.width;
    primaryH = variants.thumbnail.height;
    primaryMime = variants.thumbnail.contentType;
  }

  return {
    objectPath: primaryPath,
    mimeType: primaryMime,
    width: primaryW,
    height: primaryH,
    originalSize: inputBuffer.length,
    processedSize: totalProcessed,
    variants,
  };
}
