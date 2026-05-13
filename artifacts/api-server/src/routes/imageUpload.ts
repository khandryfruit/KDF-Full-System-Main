import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage";
import {
  getImageOptSettings,
  saveImageOptSettings,
  processImage,
} from "../lib/imageOptimizer";
import { adminMiddleware } from "../lib/auth";
import { isCloudinaryConfigured, uploadBufferToCloudinary } from "../lib/cloudinaryStorage";

/** True when running inside a Replit container (REPL_ID is always set there). */
function isRunningOnReplit(): boolean {
  return !!process.env.REPL_ID;
}

// Explicit allowlist of MIME types accepted for public review image uploads.
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

// ACL policy metadata key, matching objectAcl.ts
const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

/**
 * Verify actual file content against known image magic bytes.
 * This prevents attackers from uploading HTML/scripts with a fake image MIME type.
 *
 * Signatures checked:
 *   JPEG  — FF D8 FF
 *   PNG   — 89 50 4E 47 0D 0A 1A 0A
 *   GIF87 — 47 49 46 38 37 61  (GIF87a)
 *   GIF89 — 47 49 46 38 39 61  (GIF89a)
 *   WebP  — 52 49 46 46 ?? ?? ?? ?? 57 45 42 50  (RIFF....WEBP)
 */
function hasImageMagicBytes(buf: Buffer): boolean {
  if (buf.length < 12) return false;

  // JPEG: starts with FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;

  // PNG: 8-byte signature 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return true;

  // GIF87a / GIF89a: 47 49 46 38 (37|39) 61
  if (
    buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61
  ) return true;

  // WebP: RIFF....WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return true;

  return false;
}

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const objectStorageService = new ObjectStorageService();

function parseGcsPath(fullPath: string): { bucketName: string; objectName: string } {
  const normalized = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const parts = normalized.split("/");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function uploadBufferToGcs(
  buffer: Buffer,
  contentType: string,
  extension: string,
  visibility: "public" | "private" = "private"
): Promise<string> {
  // On Railway (or any non-Replit host), prefer Cloudinary when configured.
  // Cloudinary errors propagate directly — no silent fallback to GCS, which is
  // not available outside of Replit. This gives clear error messages instead of
  // a confusing second failure from unconfigured object storage.
  if (!isRunningOnReplit()) {
    if (!isCloudinaryConfigured()) {
      throw new Error(
        "Image uploads on Railway require Cloudinary to be configured. " +
        "Please set CLOUDINARY_URL (format: cloudinary://api_key:api_secret@cloud_name) " +
        "in your Railway environment variables and redeploy."
      );
    }
    return uploadBufferToCloudinary(buffer, "kdf-uploads");
  }

  // Replit / local: use Replit Object Storage (GCS-compatible).
  const privateDir = objectStorageService.getPrivateObjectDir();
  const objectId = randomUUID();
  const fullPath = `${privateDir}/uploads/${objectId}.${extension}`;
  const { bucketName, objectName } = parseGcsPath(fullPath);

  const bucket = objectStorageClient.bucket(bucketName);
  const gcsFile = bucket.file(objectName);
  await gcsFile.save(buffer, {
    contentType,
    metadata: { cacheControl: "public, max-age=31536000" },
  });

  // Set ACL policy metadata so the download route can enforce access control.
  await gcsFile.setMetadata({
    metadata: {
      [ACL_POLICY_METADATA_KEY]: JSON.stringify({ owner: "system", visibility }),
    },
  });

  return `/objects/uploads/${objectId}.${extension}`;
}

/**
 * POST /uploads/review-image
 * Public endpoint for review image uploads (max 5 MB, auto-optimised).
 */
const reviewUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post(
  "/uploads/review-image",
  reviewUpload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }

    // Reject any upload whose MIME type is not an explicitly allowed image type
    // before any processing or fallback path is reached.
    if (!ALLOWED_IMAGE_MIME_TYPES.has(req.file.mimetype)) {
      res.status(400).json({ error: "Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed." });
      return;
    }

    // Verify actual file content via magic-byte signature to prevent attackers
    // from uploading HTML/scripts with a forged image MIME type.
    if (!hasImageMagicBytes(req.file.buffer)) {
      res.status(400).json({ error: "File content does not match an allowed image format." });
      return;
    }

    const settings = await getImageOptSettings();
    try {
      const processed = await processImage(req.file.buffer, req.file.mimetype, { ...settings, maxWidthPx: Math.min(settings.maxWidthPx ?? 1200, 800) });
      // Mark as public so GET /storage/objects/* serves it without requiring auth.
      const objectPath = await uploadBufferToGcs(processed.buffer, processed.contentType, processed.extension, "public");
      res.json({ objectPath, originalSize: processed.originalSize, processedSize: processed.processedSize });
    } catch {
      try {
        const ext = req.file.mimetype.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
        // Mark as public so GET /storage/objects/* serves it without requiring auth.
        const objectPath = await uploadBufferToGcs(req.file.buffer, req.file.mimetype, ext, "public");
        res.json({ objectPath, originalSize: req.file.size, processedSize: req.file.size });
      } catch (fallbackErr: any) {
        res.status(500).json({ error: "Upload failed", detail: fallbackErr?.message ?? String(fallbackErr) });
      }
    }
  }
);

/**
 * POST /storage/uploads/image
 * Multipart upload with processing: WebP conversion, compression, resize.
 * Requires admin auth.
 */
router.post(
  "/storage/uploads/image",
  adminMiddleware as any,
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.has(req.file.mimetype)) {
      res.status(400).json({ error: "Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed." });
      return;
    }

    if (!hasImageMagicBytes(req.file.buffer)) {
      res.status(400).json({ error: "File content does not match an allowed image format." });
      return;
    }

    const settings = await getImageOptSettings();
    let objectPath: string;
    let processedSize = 0;
    let originalSize = req.file.size;
    let contentType = req.file.mimetype;

    try {
      const processed = await processImage(
        req.file.buffer,
        req.file.mimetype,
        settings
      );
      objectPath = await uploadBufferToGcs(
        processed.buffer,
        processed.contentType,
        processed.extension,
        "public"
      );
      processedSize = processed.processedSize;
      originalSize = processed.originalSize;
      contentType = processed.contentType;
    } catch (err: any) {
      req.log.warn({ err }, "Image processing or upload failed, falling back to original");
      // Only fall back to raw upload if Cloudinary is NOT configured.
      // If Cloudinary is configured but failed, surface the real error.
      if (isCloudinaryConfigured() && !isRunningOnReplit()) {
        req.log.error({ err }, "Cloudinary upload failed");
        res.status(500).json({
          error: "Upload failed",
          detail: err?.message ?? String(err),
        });
        return;
      }
      try {
        const ext = req.file.mimetype.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
        objectPath = await uploadBufferToGcs(
          req.file.buffer,
          req.file.mimetype,
          ext,
          "public"
        );
        processedSize = req.file.size;
      } catch (fallbackErr: any) {
        req.log.error({ err: fallbackErr }, "Fallback upload also failed");
        res.status(500).json({ error: "Upload failed", detail: fallbackErr?.message ?? String(fallbackErr) });
        return;
      }
    }

    const savedBytes = originalSize - processedSize;
    const savedPct =
      originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0;

    res.json({
      objectPath,
      originalSize,
      processedSize,
      savedBytes,
      savedPct,
      contentType,
    });
  }
);

/**
 * POST /storage/uploads/video
 * Multipart video upload for banners. Requires admin auth.
 * Accepts MP4, WebM up to 100 MB. Stored as public upload.
 */
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
]);

router.post(
  "/storage/uploads/video",
  adminMiddleware as any,
  videoUpload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    if (!ALLOWED_VIDEO_MIME_TYPES.has(req.file.mimetype)) {
      res.status(400).json({ error: "Invalid file type. Only MP4, WebM, OGG, and MOV videos are allowed." });
      return;
    }

    try {
      const extMap: Record<string, string> = {
        "video/mp4": "mp4",
        "video/webm": "webm",
        "video/ogg": "ogv",
        "video/quicktime": "mov",
      };
      const ext = extMap[req.file.mimetype] ?? "mp4";
      const objectPath = await uploadBufferToGcs(
        req.file.buffer,
        req.file.mimetype,
        ext,
        "public"
      );
      res.json({ objectPath, size: req.file.size, contentType: req.file.mimetype });
    } catch (err: any) {
      req.log.error({ err }, "Video upload failed");
      res.status(500).json({ error: "Upload failed", detail: err?.message ?? String(err) });
    }
  }
);

/**
 * GET /admin/upload-diagnostics
 * Safe diagnostic: confirms storage backend, env vars (presence only), and platform.
 * Requires admin auth.
 */
router.get(
  "/admin/upload-diagnostics",
  adminMiddleware as any,
  async (_req: Request, res: Response) => {
    const onReplit = isRunningOnReplit();
    const cloudinaryOk = isCloudinaryConfigured();

    // Test a tiny Cloudinary upload if configured and not on Replit
    let cloudinaryTest: string | null = null;
    if (cloudinaryOk && !onReplit) {
      try {
        // 1×1 white JPEG — ~631 bytes
        const tinyJpeg = Buffer.from(
          "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U" +
          "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN" +
          "DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy" +
          "MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAA" +
          "AAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAA" +
          "AAAA/9oADAMBAAIRAxEAPwCwABmX/9k=",
          "base64"
        );
        cloudinaryTest = await uploadBufferToCloudinary(tinyJpeg, "kdf-diagnostics");
      } catch (e: any) {
        cloudinaryTest = `ERROR: ${e?.message ?? String(e)}`;
      }
    }

    res.json({
      platform: onReplit ? "replit" : "other (railway/vps)",
      repl_id_set: !!process.env.REPL_ID,
      cloudinary: {
        configured: cloudinaryOk,
        cloud_name_set: !!process.env.CLOUDINARY_CLOUD_NAME,
        api_key_set: !!process.env.CLOUDINARY_API_KEY,
        api_secret_set: !!process.env.CLOUDINARY_API_SECRET,
        test_upload: cloudinaryTest,
      },
      private_object_dir_set: !!process.env.PRIVATE_OBJECT_DIR,
      storage_bucket_set: !!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID,
    });
  }
);

/** GET /admin/image-settings */
router.get(
  "/admin/image-settings",
  adminMiddleware as any,
  async (_req: Request, res: Response) => {
    try {
      const settings = await getImageOptSettings();
      res.json(settings);
    } catch {
      res.status(500).json({ error: "Failed to fetch image settings" });
    }
  }
);

/** PUT /admin/image-settings */
router.put(
  "/admin/image-settings",
  adminMiddleware as any,
  async (req: Request, res: Response) => {
    try {
      const updated = await saveImageOptSettings(req.body);
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to save image settings" });
    }
  }
);

export default router;
