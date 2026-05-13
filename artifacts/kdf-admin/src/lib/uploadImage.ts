export interface UploadResult {
  objectPath: string;
  originalSize: number;
  processedSize: number;
  savedBytes: number;
  savedPct: number;
  contentType: string;
}

/**
 * API base URL — on Railway, VITE_API_BASE_URL is the api-server's external
 * URL (e.g. https://workspaceapi-server-production-6674.up.railway.app).
 * On Replit (and local dev) it is empty, so all calls use relative paths.
 *
 * This bypasses the Vite proxy entirely on Railway, which can fail with
 * EAI_AGAIN DNS errors when the two Railway services try to talk internally
 * via the public domain.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/**
 * Upload an image file through the optimising API endpoint.
 * The server converts to WebP, compresses, and resizes automatically.
 */
export async function uploadImage(file: File): Promise<string> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/storage/uploads/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    let errMsg = "Image upload failed";
    try {
      const err = await res.json() as { error?: string; detail?: string };
      errMsg = err.detail ?? err.error ?? errMsg;
    } catch {
      errMsg = `Upload failed (HTTP ${res.status})`;
    }
    throw new Error(errMsg);
  }

  const data = (await res.json()) as UploadResult;
  return data.objectPath;
}

/**
 * Legacy presigned-URL upload (for non-image files or as fallback).
 */
export async function uploadFile(file: File, folder = "general"): Promise<string> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";

  const metaRes = await fetch(`${API_BASE}/api/storage/uploads/request-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: `${folder}/${Date.now()}_${file.name}`,
      size: file.size,
      contentType: file.type || "image/jpeg",
    }),
  });

  if (!metaRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = (await metaRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };

  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!putRes.ok) throw new Error("Failed to upload file");
  return objectPath;
}
