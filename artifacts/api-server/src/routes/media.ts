import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { mediaAssetsTable } from "@workspace/db/schema";
import { adminMiddleware } from "../lib/auth";
import { hasImageMagicBytes } from "../lib/imageMagicBytes";
import { processAndUploadMedia } from "../lib/mediaProcessor";
import {
  deleteMediaAsset,
  findDuplicateByHash,
  getMediaAsset,
  getMediaUsageRecords,
  hashBuffer,
  linkPathToEntity,
  listFolders,
  listMediaAssets,
  registerMediaUsage,
  unregisterMediaUsage,
  getFolderBySlug,
} from "../lib/mediaService";

const router: IRouter = Router();

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 200 },
});

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return raw.split(",").map((t) => t.trim()).filter(Boolean);
    }
  }
  return [];
}

async function ingestFile(
  file: Express.Multer.File,
  opts: {
    folderId?: number;
    folderSlug?: string;
    tags?: string[];
    altText?: string;
    title?: string;
    uploadedBy?: number;
    skipDuplicate?: boolean;
  }
) {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    return { ok: false as const, error: `Invalid type: ${file.originalname}` };
  }
  if (!hasImageMagicBytes(file.buffer)) {
    return { ok: false as const, error: `Invalid image content: ${file.originalname}` };
  }

  const contentHash = hashBuffer(file.buffer);

  if (opts.skipDuplicate !== false) {
    const existing = await findDuplicateByHash(contentHash);
    if (existing) {
      return {
        ok: true as const,
        duplicate: true,
        asset: existing,
        message: "Reused existing image (duplicate detected)",
      };
    }
  }

  let folderId = opts.folderId;
  if (!folderId && opts.folderSlug) {
    const folder = await getFolderBySlug(opts.folderSlug);
    folderId = folder?.id;
  }

  const processed = await processAndUploadMedia(file.buffer, file.originalname);
  const filename = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 200);

  const [asset] = await db
    .insert(mediaAssetsTable)
    .values({
      folderId: folderId ?? null,
      filename,
      originalFilename: file.originalname,
      objectPath: processed.objectPath,
      contentHash,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      originalSize: processed.originalSize,
      processedSize: processed.processedSize,
      variants: processed.variants,
      tags: (opts.tags ?? []).map((t) => t.toLowerCase()),
      altText: opts.altText ?? null,
      title: opts.title ?? null,
      uploadedBy: opts.uploadedBy ?? null,
    })
    .returning();

  return { ok: true as const, duplicate: false, asset };
}

/** GET /admin/media/folders */
router.get("/admin/media/folders", adminMiddleware as any, async (_req, res) => {
  try {
    const folders = await listFolders();
    res.json({ folders });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to list folders", detail: e?.message });
  }
});

/** GET /admin/media */
router.get("/admin/media", adminMiddleware as any, async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    const result = await listMediaAssets({
      folderId: q.folderId ? parseInt(q.folderId, 10) : undefined,
      folderSlug: q.folderSlug,
      search: q.search,
      tags: q.tags ? q.tags.split(",").map((t) => t.trim()) : undefined,
      page: q.page ? parseInt(q.page, 10) : 1,
      limit: q.limit ? parseInt(q.limit, 10) : 48,
      sort: (q.sort as "newest" | "oldest" | "name" | "size") ?? "newest",
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to list media", detail: e?.message });
  }
});

/** GET /admin/media/:id */
router.get("/admin/media/:id", adminMiddleware as any, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const asset = await getMediaAsset(id);
  if (!asset) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const usage = await getMediaUsageRecords(id);
  res.json({ asset, usage });
});

/** GET /admin/media/:id/usage */
router.get("/admin/media/:id/usage", adminMiddleware as any, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const usage = await getMediaUsageRecords(id);
  res.json({ usage, count: usage.length });
});

/** POST /admin/media/upload — single file */
router.post(
  "/admin/media/upload",
  adminMiddleware as any,
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    const body = req.body as Record<string, string>;
    try {
      const result = await ingestFile(req.file, {
        folderId: body.folderId ? parseInt(body.folderId, 10) : undefined,
        folderSlug: body.folderSlug ?? "general",
        tags: parseTags(body.tags),
        altText: body.altText,
        title: body.title,
        skipDuplicate: body.skipDuplicate !== "false",
      });
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({
        asset: result.asset,
        duplicate: result.duplicate,
        objectPath: result.asset.objectPath,
        message: result.duplicate ? result.message : "Uploaded and optimized",
        variants: result.asset.variants,
      });
    } catch (e: any) {
      req.log?.error?.({ err: e }, "Media upload failed");
      res.status(500).json({ error: "Upload failed", detail: e?.message ?? String(e) });
    }
  }
);

/** POST /admin/media/upload-bulk — multiple files */
router.post(
  "/admin/media/upload-bulk",
  adminMiddleware as any,
  upload.array("files", 200),
  async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) {
      res.status(400).json({ error: "No files provided" });
      return;
    }
    const body = req.body as Record<string, string>;
    const tags = parseTags(body.tags);
    const folderSlug = body.folderSlug ?? "general";
    const results: unknown[] = [];
    let ok = 0;
    let dup = 0;
    let failed = 0;

    for (const file of files) {
      try {
        const result = await ingestFile(file, {
          folderSlug,
          tags,
          folderId: body.folderId ? parseInt(body.folderId, 10) : undefined,
          skipDuplicate: body.skipDuplicate !== "false",
        });
        if (!result.ok) {
          failed++;
          results.push({ name: file.originalname, error: result.error });
        } else {
          ok++;
          if (result.duplicate) dup++;
          results.push({
            name: file.originalname,
            assetId: result.asset.id,
            objectPath: result.asset.objectPath,
            duplicate: result.duplicate,
          });
        }
      } catch (e: any) {
        failed++;
        results.push({ name: file.originalname, error: e?.message ?? "Upload failed" });
      }
    }

    res.json({ ok, duplicate: dup, failed, total: files.length, results });
  }
);

/** PATCH /admin/media/:id */
router.patch("/admin/media/:id", adminMiddleware as any, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { tags, altText, title, folderId } = req.body as {
    tags?: string[];
    altText?: string;
    title?: string;
    folderId?: number;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (tags) updates.tags = tags.map((t) => t.toLowerCase());
  if (altText !== undefined) updates.altText = altText;
  if (title !== undefined) updates.title = title;
  if (folderId !== undefined) updates.folderId = folderId;

  const [asset] = await db
    .update(mediaAssetsTable)
    .set(updates)
    .where(eq(mediaAssetsTable.id, id))
    .returning();

  if (!asset) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ asset });
});

/** POST /admin/media/:id/link — register usage */
router.post("/admin/media/:id/link", adminMiddleware as any, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { entityType, entityId, fieldName } = req.body as {
    entityType: string;
    entityId: number;
    fieldName?: string;
  };
  if (!entityType || !entityId) {
    res.status(400).json({ error: "entityType and entityId required" });
    return;
  }
  await registerMediaUsage({ mediaId: id, entityType, entityId, fieldName });
  res.json({ ok: true });
});

/** POST /admin/media/link-by-path */
router.post("/admin/media/link-by-path", adminMiddleware as any, async (req, res) => {
  const { objectPath, entityType, entityId, fieldName } = req.body as {
    objectPath: string;
    entityType: string;
    entityId: number;
    fieldName?: string;
  };
  if (!objectPath || !entityType || !entityId) {
    res.status(400).json({ error: "objectPath, entityType, entityId required" });
    return;
  }
  await linkPathToEntity(objectPath, entityType, entityId, fieldName);
  res.json({ ok: true });
});

/** DELETE /admin/media/:id/unlink */
router.delete("/admin/media/:id/unlink", adminMiddleware as any, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { entityType, entityId, fieldName } = req.query as Record<string, string>;
  if (!entityType || !entityId) {
    res.status(400).json({ error: "entityType and entityId required" });
    return;
  }
  await unregisterMediaUsage({
    mediaId: id,
    entityType,
    entityId: parseInt(entityId, 10),
    fieldName,
  });
  res.json({ ok: true });
});

/** DELETE /admin/media/:id */
router.delete("/admin/media/:id", adminMiddleware as any, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const force = req.query.force === "true";
  const result = await deleteMediaAsset(id, force);
  if (!result.ok) {
    res.status(409).json({
      error: "Image is in use",
      usage: result.usage,
      count: result.usage.length,
      message: `This image is used in ${result.usage.length} place(s). Remove links first or use ?force=true.`,
    });
    return;
  }
  res.json({ ok: true });
});

export default router;
