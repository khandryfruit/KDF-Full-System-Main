import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";

function apiFetch(path: string, token: string | null) {
  return fetch(`/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json());
}

function KPICard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { token } = useAuth();

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

  const stats         = dash?.stats ?? {};
  const rs            = riderStats?.stats ?? {};
  const todayOrders   = stats.ordersToday    ?? "—";
  const todayRevenue  = stats.revenueToday   ?? 0;
  const onlineRiders  = rs.online_count      ?? rs.onlineCount  ?? "—";
  const unassigned    = rs.unassigned_count  ?? rs.unassignedCount ?? "—";

  return (
    <AppShell title="Dashboard">
      <div className="p-4 space-y-4">
        {/* Greeting */}
        <div className="pt-2">
          <h2 className="text-lg font-bold text-foreground">Good day 👋</h2>
          <p className="text-sm text-muted-foreground">Here's what's happening today</p>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 gap-3">
          <KPICard label="Orders Today"  value={todayOrders}                     color="text-primary"     />
          <KPICard label="Revenue Today" value={`Rs ${Number(todayRevenue).toLocaleString()}`} color="text-green-400" />
          <KPICard label="Riders Online" value={onlineRiders}                    color="text-blue-400"    sub="available now" />
          <KPICard label="Unassigned"    value={unassigned}                      color="text-orange-400"  sub="need assignment" />
        </div>

        {/* Quick Actions */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
          <div className="space-y-2">
            {[
              { label: "Auto-Assign Riders",       action: () => autoAssign(token!), icon: "⚡", color: "bg-primary/10 text-primary border-primary/20" },
              { label: "View Pending Orders",       action: () => window.location.href = `${import.meta.env.BASE_URL}orders`, icon: "📦", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
              { label: "Manage Module Visibility",  action: () => window.location.href = `${import.meta.env.BASE_URL}modules`, icon: "🔧", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
            ].map(a => (
              <button
                key={a.label}
                onClick={a.action}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition hover:opacity-80 active:scale-[0.98] ${a.color}`}
              >
                <span className="text-base">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

async function autoAssign(token: string) {
  try {
    const r = await fetch("/api/admin/riders/auto-assign", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 50 }),
    });
    const d = await r.json();
    alert(`✅ Assigned ${d.assigned ?? 0} orders`);
  } catch {
    alert("Error running auto-assign");
  }
}
