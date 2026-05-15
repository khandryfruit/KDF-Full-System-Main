import { apiPublicUrl } from "@/lib/apiBase";

const token = () => localStorage.getItem("kdf_admin_token") ?? "";

export async function erpFetch<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(apiPublicUrl(`/api/admin/erp${path}`), {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...(opts?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}
