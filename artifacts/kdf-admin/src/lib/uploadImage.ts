export interface UploadResult {
  objectPath: string;
  originalSize: number;
  processedSize: number;
  savedBytes: number;
  savedPct: number;
  contentType: string;
}

/**
 * Upload an image file through the optimizing API endpoint.
 * The server converts to WebP, compresses, and resizes automatically.
 * Falls back to a direct presigned-URL upload if the optimized endpoint fails.
 */
export async function uploadImage(file: File): Promise<string> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/storage/uploads/image", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? "Image upload failed");
  }

  const data = (await res.json()) as UploadResult;
  return data.objectPath;
}

/**
 * Legacy presigned-URL upload (for non-image files or as fallback).
 */
export async function uploadFile(file: File, folder = "general"): Promise<string> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";

  const metaRes = await fetch("/api/storage/uploads/request-url", {
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
