const BASE = "/api";

export function getToken() { return localStorage.getItem("saas_admin_token") ?? ""; }
export function setToken(t: string) { localStorage.setItem("saas_admin_token", t); }
export function clearToken() { localStorage.removeItem("saas_admin_token"); }

export async function apiFetch<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
