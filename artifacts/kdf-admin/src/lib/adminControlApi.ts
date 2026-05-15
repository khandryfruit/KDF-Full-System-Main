import { apiPublicUrl } from "@/lib/apiBase";

const authH = () => ({
  Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}`,
  "Content-Type": "application/json",
});

export async function controlFetch<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(apiPublicUrl(path), {
    ...opts,
    headers: { ...authH(), ...(opts?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}
