import { useQuery } from "@tanstack/react-query";

export interface SiteSettings {
  id: number;
  siteName: string;
  logoPath: string | null;
  faviconPath: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  twitterCardType: string | null;
  robotsIndex: boolean;
  updatedAt: string;
}

async function fetchSettings(): Promise<SiteSettings> {
  const res = await fetch("/api/site-settings");
  if (!res.ok) throw new Error("Failed");
  const raw = await res.json();
  return {
    ...raw,
    robotsIndex: raw.robotsIndex ?? raw.robots_index ?? true,
  };
}

export function useSiteSettings() {
  return useQuery<SiteSettings>({
    queryKey: ["site-settings"],
    queryFn: fetchSettings,
    staleTime: 300_000,
    gcTime: 600_000,
  });
}

export function logoSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  return `/api/storage${path}`;
}
