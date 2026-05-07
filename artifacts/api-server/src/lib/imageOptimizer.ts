import sharp from "sharp";
import { pool } from "@workspace/db";

export interface ImageOptSettings {
  enabled: boolean;
  convertToWebP: boolean;
  quality: number;
  maxWidthPx: number;
  generateThumbs: boolean;
  thumbWidthPx: number;
}

const DEFAULTS: ImageOptSettings = {
  enabled: true,
  convertToWebP: true,
  quality: 82,
  maxWidthPx: 1200,
  generateThumbs: false,
  thumbWidthPx: 300,
};

let _colEnsured = false;

async function ensureColumn(): Promise<void> {
  if (_colEnsured) return;
  await pool.query(
    `ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS img_opt_settings text`
  );
  _colEnsured = true;
}

export async function getImageOptSettings(): Promise<ImageOptSettings> {
  try {
    await ensureColumn();
    const result = await pool.query(
      `SELECT img_opt_settings FROM site_settings LIMIT 1`
    );
    const raw = result.rows[0]?.img_opt_settings;
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveImageOptSettings(
  partial: Partial<ImageOptSettings>
): Promise<ImageOptSettings> {
  await ensureColumn();
  const current = await getImageOptSettings();
  const merged = { ...current, ...partial };

  const countRes = await pool.query(
    `SELECT id FROM site_settings LIMIT 1`
  );
  if (countRes.rows.length === 0) {
    await pool.query(
      `INSERT INTO site_settings (site_name, img_opt_settings, updated_at)
       VALUES ('KDF NUTS', $1, NOW())`,
      [JSON.stringify(merged)]
    );
  } else {
    await pool.query(
      `UPDATE site_settings SET img_opt_settings = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(merged), countRes.rows[0].id]
    );
  }
  return merged;
}

export interface ProcessedImage {
  buffer: Buffer;
  contentType: string;
  extension: string;
  originalSize: number;
  processedSize: number;
}

function extFor(ct: string): string {
  const map: Record<string, string> = {
    "image/webp": "webp",
    "image/png": "png",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  return map[ct] ?? "jpg";
}

export async function processImage(
  inputBuffer: Buffer,
  originalContentType: string,
  settings: ImageOptSettings
): Promise<ProcessedImage> {
  const originalSize = inputBuffer.length;

  if (!settings.enabled) {
    return {
      buffer: inputBuffer,
      contentType: originalContentType,
      extension: extFor(originalContentType),
      originalSize,
      processedSize: originalSize,
    };
  }

  const isSvg = originalContentType === "image/svg+xml";
  const isGif = originalContentType === "image/gif";

  if (isSvg || isGif) {
    return {
      buffer: inputBuffer,
      contentType: originalContentType,
      extension: extFor(originalContentType),
      originalSize,
      processedSize: originalSize,
    };
  }

  let pipeline = sharp(inputBuffer);
  const meta = await pipeline.metadata();

  if (meta.width && meta.width > settings.maxWidthPx) {
    pipeline = pipeline.resize(settings.maxWidthPx, undefined, {
      withoutEnlargement: true,
      fit: "inside",
    });
  }

  const isAlreadyWebP = originalContentType === "image/webp";
  const shouldConvert = settings.convertToWebP && !isAlreadyWebP;
  const isJpeg =
    originalContentType === "image/jpeg" ||
    originalContentType === "image/jpg";

  let outBuffer: Buffer;
  let outContentType: string;
  let outExt: string;

  if (shouldConvert) {
    outBuffer = await pipeline.webp({ quality: settings.quality }).toBuffer();
    outContentType = "image/webp";
    outExt = "webp";
  } else if (isAlreadyWebP) {
    outBuffer = await pipeline.webp({ quality: settings.quality }).toBuffer();
    outContentType = "image/webp";
    outExt = "webp";
  } else if (isJpeg) {
    outBuffer = await pipeline
      .jpeg({ quality: settings.quality, mozjpeg: true })
      .toBuffer();
    outContentType = "image/jpeg";
    outExt = "jpg";
  } else {
    outBuffer = await pipeline
      .png({ compressionLevel: 9, quality: settings.quality })
      .toBuffer();
    outContentType = "image/png";
    outExt = "png";
  }

  if (outBuffer.length > originalSize && !shouldConvert) {
    return {
      buffer: inputBuffer,
      contentType: originalContentType,
      extension: extFor(originalContentType),
      originalSize,
      processedSize: originalSize,
    };
  }

  return {
    buffer: outBuffer,
    contentType: outContentType,
    extension: outExt,
    originalSize,
    processedSize: outBuffer.length,
  };
}
