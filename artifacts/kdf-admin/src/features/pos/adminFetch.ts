import { apiPublicUrl } from "@/lib/apiBase";

/** Resolves `/api/...` or `https://...` to an absolute API URL in production. */
function resolveAdminFetchUrl(path: string): string {
  const p = path.trim();
  if (!p) return apiPublicUrl("/api");
  if (/^https?:\/\//i.test(p)) return p;
  const withApi = p.startsWith("/api") ? p : `/api${p.startsWith("/") ? p : `/${p}`}`;
  return apiPublicUrl(withApi);
}

export function adminFetch(path: string, opts: RequestInit = {}): Promise<unknown> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  const url = resolveAdminFetchUrl(path);
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  }).then((r) => {
    if (!r.ok)
      return r.json().then((e: { error?: string; detail?: string }) => {
        const msg = [e.error, e.detail].filter(Boolean).join(" — ");
        throw new Error(msg || r.statusText);
      });
    return r.json();
  });
}
