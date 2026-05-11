const BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("saas_token");
}

export function setToken(token: string) {
  localStorage.setItem("saas_token", token);
}

export function clearToken() {
  localStorage.removeItem("saas_token");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request("/saas/admin/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  seed: (name: string, email: string, password: string) =>
    request("/saas/admin/seed", { method: "POST", body: JSON.stringify({ name, email, password }) }),

  me: () => request("/saas/admin/me"),

  dashboard: () => request("/saas/admin/dashboard"),

  tenants: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request(`/saas/admin/tenants${qs}`);
    },
    get: (id: number) => request(`/saas/admin/tenants/${id}`),
    create: (data: any) => request("/saas/admin/tenants", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: any) => request(`/saas/admin/tenants/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) => request(`/saas/admin/tenants/${id}`, { method: "DELETE" }),
    suspend: (id: number, reason?: string) => request(`/saas/admin/tenants/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) }),
    activate: (id: number) => request(`/saas/admin/tenants/${id}/activate`, { method: "POST" }),
    changePlan: (id: number, planId: number) => request(`/saas/admin/tenants/${id}/plan`, { method: "PUT", body: JSON.stringify({ planId }) }),
    updateFeatures: (id: number, features: any) => request(`/saas/admin/tenants/${id}/features`, { method: "PUT", body: JSON.stringify(features) }),
    getTheme: (id: number) => request(`/saas/admin/tenants/${id}/theme`),
    updateTheme: (id: number, data: any) => request(`/saas/admin/tenants/${id}/theme`, { method: "PUT", body: JSON.stringify(data) }),
  },

  plans: {
    list: () => request("/saas/admin/plans"),
    create: (data: any) => request("/saas/admin/plans", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: any) => request(`/saas/admin/plans/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) => request(`/saas/admin/plans/${id}`, { method: "DELETE" }),
  },

  activity: (tenantId?: number) => {
    const qs = tenantId ? `?tenantId=${tenantId}` : "";
    return request(`/saas/admin/activity${qs}`);
  },
};
