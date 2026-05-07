import { useQuery } from "@tanstack/react-query";

export interface SiteSettings {
  id: number;
  siteName: string;
  logoPath: string | null;
  faviconPath: string | null;
  updatedAt: string;
}

const BASE = import.meta.env.BASE_URL ?? "/";

async function fetchSettings(): Promise<SiteSettings> {
  const res = await fetch(`${BASE}api/site-settings`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function useSiteSettings() {
  return useQuery<SiteSettings>({
    queryKey: ["site-settings"],
    queryFn: fetchSettings,
    staleTime: 60_000,
  });
}

export function logoSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  return `/api/storage${path}`;
}
