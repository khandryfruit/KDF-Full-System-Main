import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPublicUrl } from "@/lib/apiBase";

export interface SiteSettings {
  id: number;
  siteName: string;
  logoPath: string | null;
  faviconPath: string | null;
  updatedAt: string;
}

async function fetchSettings(): Promise<SiteSettings> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  const res = await fetch(apiPublicUrl("/api/admin/site-settings"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function updateSettings(data: Partial<Pick<SiteSettings, "siteName" | "logoPath" | "faviconPath">>): Promise<SiteSettings> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  const res = await fetch(apiPublicUrl("/api/admin/site-settings"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update");
  return res.json();
}

export function useSiteSettings() {
  return useQuery<SiteSettings>({
    queryKey: ["site-settings"],
    queryFn: fetchSettings,
  });
}

export function useUpdateSiteSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-settings"] });
    },
  });
}

export async function requestUploadUrl(file: File): Promise<{ uploadURL: string; objectPath: string }> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  const res = await fetch(apiPublicUrl("/api/storage/uploads/request-url"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  return res.json();
}

export async function uploadFileToGcs(file: File, uploadURL: string): Promise<void> {
  const res = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("Upload to storage failed");
}
