import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPublicUrl } from "@/lib/apiBase";

export interface SiteSettings {
  id: number;
  siteName: string;
  logoPath: string | null;
  faviconPath: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  primaryKeywords: string | null;
  secondaryKeywords: string | null;
  longTailKeywords: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  twitterCardType: string | null;
  robotsIndex: boolean;
  schemaOrgEnabled: boolean;
  schemaBreadcrumbEnabled: boolean;
  schemaFaqEnabled: boolean;
  updatedAt: string;
}

export type SiteSettingsUpdate = Partial<
  Pick<
    SiteSettings,
    | "siteName"
    | "logoPath"
    | "faviconPath"
    | "metaTitle"
    | "metaDescription"
    | "primaryKeywords"
    | "secondaryKeywords"
    | "longTailKeywords"
    | "ogTitle"
    | "ogDescription"
    | "twitterCardType"
    | "robotsIndex"
    | "schemaOrgEnabled"
    | "schemaBreadcrumbEnabled"
    | "schemaFaqEnabled"
  >
>;

async function fetchSettings(): Promise<SiteSettings> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  const res = await fetch(apiPublicUrl("/api/admin/site-settings"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  const raw = await res.json();
  return {
    ...raw,
    robotsIndex: raw.robotsIndex ?? raw.robots_index ?? true,
    schemaOrgEnabled: raw.schemaOrgEnabled ?? raw.schema_org_enabled ?? true,
    schemaBreadcrumbEnabled: raw.schemaBreadcrumbEnabled ?? raw.schema_breadcrumb_enabled ?? true,
    schemaFaqEnabled: raw.schemaFaqEnabled ?? raw.schema_faq_enabled ?? false,
  };
}

async function updateSettings(data: SiteSettingsUpdate): Promise<SiteSettings> {
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
