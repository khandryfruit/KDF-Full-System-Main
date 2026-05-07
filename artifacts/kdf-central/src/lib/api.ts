const BASE = "/api";

export function getToken(): string | null {
  return localStorage.getItem("kdf_central_token");
}

export function setToken(token: string) {
  localStorage.setItem("kdf_central_token", token);
}

export function clearToken() {
  localStorage.removeItem("kdf_central_token");
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
    ...opts,
  });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error ?? res.statusText);
  }
  return res.json();
}

export type Branch = {
  id: number;
  name: string;
  slug: string;
  city: string;
  address: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  managerName: string | null;
  managerPhone: string | null;
  email: string | null;
  isActive: boolean;
  isHeadOffice: boolean;
  monthlyTarget: string | null;
  createdAt: string;
};

export type DashboardData = {
  global: {
    totalOrders: number;
    todayOrders: number;
    monthOrders: number;
    totalRevenue: number;
    todayRevenue: number;
    monthRevenue: number;
    activeRiders: number;
    totalDeliveries: number;
    todayDeliveries: number;
    codCollected: number;
  };
  branches: Branch[];
  branchOrders: { city: string; orders: number; revenue: string; today_orders: number; today_revenue: string }[];
  dailyRevenue: { day: string; raw_date: string; orders: number; revenue: string }[];
  recentWebhooks: { topic: string; shopify_id: string; processed: boolean; error: string | null; received_at: string }[];
  topCities: { city: string; orders: number; revenue: string }[];
};

export type BranchStats = {
  branch: Branch;
  orders: { total: number; today: number; thisMonth: number; paid: number; cod: number; fulfilled: number; cancelled: number };
  revenue: { total: number; today: number; thisMonth: number };
  riders: { total: number; active: number; deliveries: number; delivered: number; inProgress: number; todayDeliveries: number; codCollected: number };
  topProducts: { product: string; total_qty: number }[];
  dailyRevenue: { day: string; orders: number; revenue: string }[];
};

export const api = {
  login: (email: string, password: string) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(async (r) => {
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Login failed"); }
      return r.json() as Promise<{ token: string; user: { name: string; email: string; role: string } }>;
    }),
  getDashboard: () => apiFetch<DashboardData>("/admin/branches/dashboard"),
  getBranches: () => apiFetch<{ branches: Branch[] }>("/admin/branches"),
  getBranchStats: (id: number) => apiFetch<BranchStats>(`/admin/branches/${id}/stats`),
  createBranch: (data: Partial<Branch>) =>
    apiFetch<{ branch: Branch }>("/admin/branches", { method: "POST", body: JSON.stringify(data) }),
  updateBranch: (id: number, data: Partial<Branch>) =>
    apiFetch<{ branch: Branch }>(`/admin/branches/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBranch: (id: number) =>
    apiFetch<{ ok: boolean }>(`/admin/branches/${id}`, { method: "DELETE" }),
  seedBranches: () =>
    apiFetch<{ ok: boolean; branches?: Branch[]; message?: string }>("/admin/branches/seed", { method: "POST" }),
};
