import { useQuery } from "@tanstack/react-query";

export interface SiteSettings {
  id: number;
  siteName: string;
  logoPath: string | null;
  faviconPath: string | null;
  updatedAt: string;
}

async function fetchSettings(): Promise<SiteSettings> {
  const res = await fetch("/api/site-settings");
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function useSiteSettings() {
  return useQuery<SiteSettings>({
    queryKey: ["site-settings"],
    queryFn: fetchSettings,
    /** Logo / name rarely change — long stale window cuts duplicate work on every navigation. */
    staleTime: 300_000,
    gcTime: 600_000,
  });
}

export function logoSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  return `/api/storage${path}`;
}
