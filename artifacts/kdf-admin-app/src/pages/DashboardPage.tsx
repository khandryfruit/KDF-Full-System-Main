import { useQuery, useMutation } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";
import { useLocation } from "wouter";
import { TrendingUp, ShoppingBag, Bike, AlertCircle, Zap, Package, Users, BarChart3, MessageCircle } from "lucide-react";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiFetch(path: string, token: string | null, opts?: RequestInit) {
  return fetch(`/api${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  }).then(r => r.json());
}

function KPICard({ icon: Icon, label, value, sub, color, bg }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number; sub?: string;
  color: string; bg: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-xl font-bold leading-tight ${color}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { token, user } = useAuth();
  const [, navigate]    = useLocation();
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<string | null>(null);

  const { data: dash } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn:  () => apiFetch("/admin/dashboard", token),
    refetchInterval: 30_000,
  });

  const { data: riderStats } = useQuery({
    queryKey: ["rider-stats-app"],
    queryFn:  () => apiFetch("/admin/riders/stats", token),
    refetchInterval: 15_000,
  });

  // Dashboard API returns flat (no stats wrapper)
  const s  = dash ?? {};
  const rs = riderStats?.stats ?? {};

  const todayOrders   = s.todayOrders    ?? "—";
  const todayRevenue  = Number(s.todayRevenue  ?? 0);
  const pendingOrders = s.pendingOrders  ?? "—";
  const totalCust     = s.totalUsers     ?? "—";
  const onlineRiders  = rs.active_riders ?? "—";
  const unassigned    = rs.total_lahore != null ? (Number(rs.total_lahore) - Number(rs.total_assigned ?? 0)) : "—";

  async function handleAutoAssign() {
    setAssigning(true);
    setAssignResult(null);
    try {
      const d = await apiFetch("/admin/riders/auto-assign", token, { method: "POST", body: JSON.stringify({ limit: 50 }) });
      setAssignResult(`✅ ${d.assigned ?? 0} orders assigned`);
    } catch {
      setAssignResult("❌ Failed to auto-assign");
    } finally {
      setAssigning(false);
    }
  }

  const quickActions = [
    { label: "Auto-Assign Riders", icon: Zap,          action: handleAutoAssign,                                                      color: "bg-primary/10 text-primary border-primary/20"          },
    { label: "View Orders",        icon: Package,       action: () => navigate(`${BASE}/orders`),                                      color: "bg-blue-500/10 text-blue-400 border-blue-500/20"       },
    { label: "WhatsApp Chats",     icon: MessageCircle, action: () => navigate(`${BASE}/wa`),                                          color: "bg-green-500/10 text-green-400 border-green-500/20"    },
    { label: "Customers",          icon: Users,         action: () => navigate(`${BASE}/customers`),                                   color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
    { label: "Analytics",          icon: BarChart3,     action: () => navigate(`${BASE}/analytics`),                                   color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
    { label: "Rider Management",   icon: Bike,          action: () => navigate(`${BASE}/riders`),                                      color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  ];

  return (
    <AppShell title="Dashboard">
      <div className="p-4 space-y-4">
        {/* Greeting */}
        <div className="pt-2 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Good day{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
            </h2>
            <p className="text-xs text-muted-foreground">Here's what's happening today</p>
          </div>
          {(unassigned !== "—" && Number(unassigned) > 0) && (
            <span className="flex items-center gap-1 text-[10px] font-semibold bg-orange-500/15 text-orange-400 px-2 py-1 rounded-full">
              <AlertCircle className="w-3 h-3" /> {unassigned} unassigned
            </span>
          )}
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 gap-3">
          <KPICard icon={ShoppingBag} label="Orders Today"  value={todayOrders}                                  color="text-primary"    bg="bg-primary/10"    />
          <KPICard icon={TrendingUp}  label="Revenue Today" value={`Rs ${todayRevenue.toLocaleString()}`}         color="text-green-400"  bg="bg-green-500/10"  />
          <KPICard icon={Bike}        label="Riders Online" value={onlineRiders} sub="available now"              color="text-blue-400"   bg="bg-blue-500/10"   />
          <KPICard icon={AlertCircle} label="Pending"       value={pendingOrders} sub="orders"                   color="text-orange-400" bg="bg-orange-500/10" />
        </div>

        {/* Auto-assign result */}
        {assignResult && (
          <div className="bg-card border border-border rounded-xl px-4 py-2.5 text-sm font-medium text-foreground">
            {assignResult}
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map(a => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  onClick={a.action}
                  disabled={a.label === "Auto-Assign Riders" && assigning}
                  className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border text-xs font-semibold transition active:scale-95 disabled:opacity-50 ${a.color}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-left leading-tight">
                    {a.label === "Auto-Assign Riders" && assigning ? "Assigning…" : a.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Customers stat */}
        {totalCust !== "—" && (
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-muted-foreground/40 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-foreground">{Number(totalCust).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Customers</p>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
