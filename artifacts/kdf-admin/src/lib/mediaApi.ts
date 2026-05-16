import { apiPublicUrl } from "./apiBase";
import { getProductImageSrc } from "./imageUrl";

export interface MediaFolder {
  id: number;
  slug: string;
  name: string;
  sortOrder: number;
}

export interface MediaVariantMeta {
  path: string;
  width: number;
  height: number;
  size: number;
  contentType: string;
}

export interface MediaAsset {
  id: number;
  folderId: number | null;
  filename: string;
  originalFilename: string;
  objectPath: string;
  contentHash: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  originalSize: number;
  processedSize: number;
  variants: Partial<Record<"thumbnail" | "medium" | "large" | "mobile" | "desktop", MediaVariantMeta>>;
  tags: string[];
  altText: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaUsageRef {
  entityType: string;
  entityId: number;
  fieldName?: string | null;
  label: string;
}

function authHeaders(json = false): HeadersInit {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export function mediaSrc(path: string, size: "thumbnail" | "medium" | "large" = "medium"): string {
  return getProductImageSrc(path);
}

export async function fetchMediaFolders(): Promise<MediaFolder[]> {
  const res = await fetch(apiPublicUrl("/api/admin/media/folders"), { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load folders");
  const data = await res.json();
  return data.folders ?? [];
}

export async function fetchMediaList(params: {
  folderSlug?: string;
  folderId?: number;
  search?: string;
  tags?: string;
  page?: number;
  limit?: number;
  sort?: string;
}): Promise<{ items: MediaAsset[]; total: number; page: number; totalPages: number }> {
  const q = new URLSearchParams();
  if (params.folderSlug) q.set("folderSlug", params.folderSlug);
  if (params.folderId) q.set("folderId", String(params.folderId));
  if (params.search) q.set("search", params.search);
  if (params.tags) q.set("tags", params.tags);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.sort) q.set("sort", params.sort);
  const res = await fetch(apiPublicUrl(`/api/admin/media?${q}`), { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load media");
  return res.json();
}

export async function uploadMediaFile(
  file: File,
  opts?: { folderSlug?: string; tags?: string[] }
): Promise<{ asset: MediaAsset; duplicate: boolean; objectPath: string }> {
  const form = new FormData();
  form.append("file", file);
  if (opts?.folderSlug) form.append("folderSlug", opts.folderSlug);
  if (opts?.tags?.length) form.append("tags", JSON.stringify(opts.tags));

  const res = await fetch(apiPublicUrl("/api/admin/media/upload"), {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string; error?: string }).detail ?? (err as { error?: string }).error ?? "Upload failed");
  }
  return res.json();
}

export async function uploadMediaBulk(
  files: File[],
  opts?: { folderSlug?: string; tags?: string[] }
): Promise<{ ok: number; duplicate: number; failed: number; total: number }> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  if (opts?.folderSlug) form.append("folderSlug", opts.folderSlug);
  if (opts?.tags?.length) form.append("tags", JSON.stringify(opts.tags));

  const res = await fetch(apiPublicUrl("/api/admin/media/upload-bulk"), {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Bulk upload failed");
  }
  return res.json();
}

export async function updateMediaAsset(
  id: number,
  patch: { tags?: string[]; altText?: string; title?: string; folderId?: number }
): Promise<MediaAsset> {
  const res = await fetch(apiPublicUrl(`/api/admin/media/${id}`), {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Update failed");
  const data = await res.json();
  return data.asset;
}

export async function fetchMediaUsage(id: number): Promise<MediaUsageRef[]> {
  const res = await fetch(apiPublicUrl(`/api/admin/media/${id}/usage`), { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load usage");
  const data = await res.json();
  return data.usage ?? [];
}

export async function deleteMediaAsset(id: number, force = false): Promise<void> {
  const res = await fetch(
    apiPublicUrl(`/api/admin/media/${id}${force ? "?force=true" : ""}`),
    { method: "DELETE", headers: authHeaders() }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string; error?: string }).message ?? (err as { error?: string }).error ?? "Delete failed");
  }
}

export async function linkMediaToEntity(
  objectPath: string,
  entityType: string,
  entityId: number,
  fieldName?: string
): Promise<void> {
  await fetch(apiPublicUrl("/api/admin/media/link-by-path"), {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ objectPath, entityType, entityId, fieldName }),
  });
}
