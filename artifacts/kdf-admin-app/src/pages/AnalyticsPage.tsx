import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";
import { BarChart3, TrendingUp, ShoppingBag, Users, Package, RefreshCw } from "lucide-react";

function apiFetch(path: string, token: string | null) {
  return fetch(`/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json());
}

function StatCard({
  icon: Icon, label, value, sub, color, bg,
}: {
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
        <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground truncate max-w-[70%]">{label}</span>
        <span className="font-semibold text-foreground">Rs {value.toLocaleString()}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { token } = useAuth();

  const { data: dash, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["analytics-dash"],
    queryFn:  () => apiFetch("/admin/dashboard", token),
    refetchInterval: 60_000,
  });

  const { data: waAnalytics } = useQuery({
    queryKey: ["wa-analytics"],
    queryFn:  () => apiFetch("/admin/wa/analytics", token),
    staleTime: 60_000,
  });

  // Dashboard API returns flat (no stats wrapper)
  const s    = dash ?? {};
  const wa   = waAnalytics ?? {};

  const totalOrders   = s.totalOrders   ?? "—";
  const ordersToday   = s.todayOrders   ?? "—";
  const revenueTotal  = Number(s.totalRevenue ?? 0);
  const revenueToday  = Number(s.todayRevenue ?? 0);
  const totalCust     = s.totalUsers    ?? "—";
  const pendingOrders = s.pendingOrders ?? "—";

  const cityBreakdown: { city: string; revenue: number }[] = dash?.cityBreakdown ?? [];
  const maxCityRev = cityBreakdown.reduce((m, c) => Math.max(m, c.revenue), 0);

  return (
    <AppShell title="Analytics">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              Analytics
            </h2>
            <p className="text-xs text-muted-foreground">Real-time business overview</p>
          </div>
          <button
            onClick={() => refetch()}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/70 transition"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading analytics…</p>
          </div>
        ) : (
          <>
            {/* Revenue cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={TrendingUp}   label="Revenue Today"  value={`Rs ${revenueToday.toLocaleString()}`}  color="text-primary"    bg="bg-primary/10"    />
              <StatCard icon={TrendingUp}   label="Total Revenue"  value={`Rs ${revenueTotal.toLocaleString()}`}  color="text-green-400"  bg="bg-green-500/10"  />
              <StatCard icon={ShoppingBag}  label="Orders Today"   value={ordersToday}  color="text-blue-400"   bg="bg-blue-500/10"   />
              <StatCard icon={Package}      label="Pending Orders" value={pendingOrders} color="text-orange-400" bg="bg-orange-500/10" />
              <StatCard icon={ShoppingBag}  label="Total Orders"   value={totalOrders}  color="text-purple-400" bg="bg-purple-500/10" />
              <StatCard icon={Users}        label="Customers"      value={totalCust}    color="text-pink-400"   bg="bg-pink-500/10"   />
            </div>

            {/* City revenue breakdown */}
            {cityBreakdown.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Revenue by City</h3>
                <div className="space-y-3">
                  {cityBreakdown.slice(0, 6).map((c: any) => (
                    <MiniBar
                      key={c.city}
                      label={c.city}
                      value={Math.round(Number(c.revenue ?? 0))}
                      max={maxCityRev}
                      color="bg-primary"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* WhatsApp stats */}
            {wa && (
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="text-green-500">●</span> WhatsApp Stats
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total Msgs",  value: wa.totalMessages ?? wa.total_messages ?? "—" },
                    { label: "Sent",        value: wa.sent          ?? "—"                        },
                    { label: "Received",    value: wa.received      ?? "—"                        },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className="text-lg font-bold text-foreground">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
