import { API_BASE } from "./apiBase";

export async function uploadFile(file: File, folder = "general"): Promise<string> {
  const reqRes = await fetch(`${API_BASE}/api/storage/uploads/request-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}`,
    },
    body: JSON.stringify({
      name: `${folder}/${Date.now()}_${file.name}`,
      size: file.size,
      contentType: file.type || "image/jpeg",
    }),
  });

  if (!reqRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = await reqRes.json();

  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!putRes.ok) throw new Error("Failed to upload file");

  return objectPath as string;
}
