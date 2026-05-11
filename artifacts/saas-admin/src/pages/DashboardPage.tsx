import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLocation } from "wouter";
import {
  Users, TrendingUp, Activity, CreditCard, Building2,
  ArrowUpRight, Clock, CheckCircle2, XCircle, PauseCircle,
  Zap, Plus, Globe, ShoppingBag,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  trial:     { label: "Trial",     color: "text-amber-400",  icon: Clock },
  active:    { label: "Active",    color: "text-green-400",  icon: CheckCircle2 },
  suspended: { label: "Suspended", color: "text-red-400",    icon: PauseCircle },
  cancelled: { label: "Cancelled", color: "text-gray-400",   icon: XCircle },
  pending:   { label: "Pending",   color: "text-blue-400",   icon: Clock },
};

const INDUSTRY_ICONS: Record<string, string> = {
  grocery: "🛒", fashion: "👗", electronics: "💻", pharmacy: "💊",
  food: "🍕", beauty: "💄", sports: "⚽", furniture: "🪑", books: "📚", other: "🏪",
};

const CHART_COLORS = ["#22c55e", "#0ea5e9", "#a855f7", "#f59e0b", "#ef4444"];

function StatCard({ title, value, sub, icon: Icon, color }: { title: string; value: number | string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery({
    queryKey: ["saas-dashboard"],
    queryFn: () => apiFetch("/saas/admin/dashboard"),
    refetchInterval: 30000,
  });

  const t = data?.totals;
  const byIndustry: any[] = data?.byIndustry ?? [];
  const byPlan: any[] = data?.byPlan ?? [];
  const recentTenants: any[] = data?.recentTenants ?? [];
  const recentActivity: any[] = data?.recentActivity ?? [];
  const plans: any[] = data?.plans ?? [];

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Platform Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Multi-tenant SaaS control center</p>
        </div>
        <button
          onClick={() => setLocation("/tenants/new")}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-all"
        >
          <Plus className="w-4 h-4" /> Add Tenant
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Tenants"  value={t?.total ?? 0}     icon={Users}      color="bg-primary/20 text-primary" />
        <StatCard title="Active"         value={t?.active ?? 0}    icon={CheckCircle2} color="bg-green-500/20 text-green-400" sub={`${t?.trial ?? 0} on trial`} />
        <StatCard title="This Month"     value={t?.thisMonth ?? 0} icon={TrendingUp}  color="bg-blue-500/20 text-blue-400" sub="New signups" />
        <StatCard title="Suspended"      value={t?.suspended ?? 0} icon={PauseCircle} color="bg-red-500/20 text-red-400" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By industry */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">Tenants by Industry</h3>
          {byIndustry.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byIndustry.map(r => ({ name: r.industry, value: Number(r.cnt) }))} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${INDUSTRY_ICONS[name] ?? "🏪"} ${name} (${value})`} labelLine={false}>
                  {byIndustry.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [v, "Tenants"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
          )}
        </div>

        {/* By plan */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">Tenants by Plan</h3>
          {byPlan.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byPlan.map(r => ({ name: r.planName ?? "No Plan", count: Number(r.cnt) }))}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
          )}
        </div>
      </div>

      {/* Plans overview */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-4">Active Plans</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {plans.map((p: any) => (
            <div key={p.id} className="border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: p.color ?? "#6366f1" }} />
                <span className="font-semibold text-sm">{p.name}</span>
                {p.badgeLabel && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">{p.badgeLabel}</span>}
              </div>
              <p className="text-xl font-bold">Rs. {Number(p.priceMonthly).toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
              <p className="text-xs text-muted-foreground">{p.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent tenants */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Recent Tenants</h3>
            <button onClick={() => setLocation("/tenants")} className="text-xs text-primary hover:underline">View all</button>
          </div>
          {recentTenants.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No tenants yet</div>
          ) : (
            <div className="space-y-3">
              {recentTenants.slice(0, 6).map((t: any) => {
                const sc = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.trial;
                const SI = sc.icon;
                return (
                  <button key={t.id} onClick={() => setLocation(`/tenants/${t.id}`)} className="w-full flex items-center gap-3 hover:bg-accent p-2 rounded-lg transition-all text-left">
                    <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-sm flex-shrink-0">
                      {INDUSTRY_ICONS[t.industry] ?? "🏪"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{t.storeName}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.email}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <SI className={`w-3.5 h-3.5 ${sc.color}`} />
                      <span className={`text-xs font-medium ${sc.color}`}>{sc.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Recent Activity</h3>
            <button onClick={() => setLocation("/activity")} className="text-xs text-primary hover:underline">View all</button>
          </div>
          {recentActivity.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No activity yet</div>
          ) : (
            <div className="space-y-2">
              {recentActivity.slice(0, 8).map((a: any) => (
                <div key={a.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Activity className="w-3 h-3 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{a.action.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
