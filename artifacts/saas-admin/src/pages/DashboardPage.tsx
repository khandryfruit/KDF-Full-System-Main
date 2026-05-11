import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate, statusColor, tierColor } from "@/lib/utils";

interface DashStats {
  totals: { total: number; trial: number; active: number; suspended: number; cancelled: number; thisMonth: number };
  byIndustry: { industry: string; cnt: number }[];
  byPlan: { planName: string | null; tier: string | null; cnt: number }[];
  recentTenants: any[];
  recentActivity: any[];
  plans: any[];
}

interface RevenueData {
  metrics: { mrr: number; arr: number; paying_tenants: number; arpu: number };
  growth: { label: string; count: number }[];
  byPlanRevenue: { name: string; tier: string; color: string; tenant_count: number; monthly_revenue: number }[];
}

function Sparkline({ data }: { data: { label: string; count: number }[] }) {
  if (!data.length) return null;
  const maxVal = Math.max(...data.map(d => d.count), 1);
  const W = 280; const H = 56;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (d.count / maxVal) * H * 0.85 - 2;
    return `${x},${y}`;
  }).join(" ");
  const area = `M ${data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (d.count / maxVal) * H * 0.85 - 2;
    return `${x},${y}`;
  }).join(" L ")} L ${W},${H} L 0,${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkGrad)" />
      <polyline points={pts} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.dashboard().then(setStats),
      api.revenue().then(setRevenue).catch(() => null),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) return null;
  const { totals, byIndustry, byPlan, recentTenants, recentActivity } = stats;
  const mrr = Number(revenue?.metrics?.mrr ?? 0);
  const arr = Number(revenue?.metrics?.arr ?? 0);
  const arpu = Number(revenue?.metrics?.arpu ?? 0);
  const payingTenants = Number(revenue?.metrics?.paying_tenants ?? 0);

  const statCards = [
    { label: "Total Tenants", value: totals.total, icon: "🏪", color: "text-white" },
    { label: "Active", value: totals.active, icon: "✅", color: "text-emerald-400" },
    { label: "Trial", value: totals.trial, icon: "⏳", color: "text-blue-400" },
    { label: "Suspended", value: totals.suspended, icon: "⚠️", color: "text-amber-400" },
    { label: "New This Month", value: totals.thisMonth, icon: "🆕", color: "text-indigo-400" },
    { label: "Cancelled", value: totals.cancelled, icon: "❌", color: "text-red-400" },
  ];

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Overview of all tenants, revenue, and activity</p>
      </div>

      {/* Revenue cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-900/40 to-slate-900 border border-emerald-500/30 rounded-xl p-5">
          <p className="text-xs text-emerald-400/70 font-medium uppercase tracking-wider mb-1">MRR</p>
          <p className="text-2xl font-bold text-emerald-400">Rs. {fmt(mrr)}</p>
          <p className="text-xs text-slate-500 mt-1">Monthly Recurring Revenue</p>
        </div>
        <div className="bg-gradient-to-br from-indigo-900/30 to-slate-900 border border-indigo-500/20 rounded-xl p-5">
          <p className="text-xs text-indigo-400/70 font-medium uppercase tracking-wider mb-1">ARR</p>
          <p className="text-2xl font-bold text-indigo-400">Rs. {fmt(arr)}</p>
          <p className="text-xs text-slate-500 mt-1">Annual Recurring Revenue</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Paying</p>
          <p className="text-2xl font-bold text-white">{payingTenants}</p>
          <p className="text-xs text-slate-500 mt-1">Active subscriptions</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">ARPU</p>
          <p className="text-2xl font-bold text-white">Rs. {fmt(arpu)}</p>
          <p className="text-xs text-slate-500 mt-1">Avg revenue per user</p>
        </div>
      </div>

      {/* Tenant count cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xl mb-2">{card.icon}</div>
            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
            <div className="text-xs text-slate-500 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Growth sparkline + plan breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Growth chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">30-Day Tenant Growth</h2>
            <span className="text-xs text-slate-500">
              {totals.thisMonth} new this month
            </span>
          </div>
          {revenue?.growth && revenue.growth.length > 0 ? (
            <>
              <Sparkline data={revenue.growth} />
              <div className="flex justify-between text-xs text-slate-600 mt-2">
                <span>{revenue.growth[0]?.label}</span>
                <span>{revenue.growth[revenue.growth.length - 1]?.label}</span>
              </div>
            </>
          ) : (
            <div className="h-14 flex items-center justify-center text-slate-600 text-sm">
              No data yet
            </div>
          )}
        </div>

        {/* Revenue by plan */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Revenue by Plan</h2>
          <div className="space-y-3">
            {(revenue?.byPlanRevenue ?? []).map(plan => (
              <div key={plan.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: plan.color || "#6366f1" }} />
                  <span className="text-sm text-slate-300 truncate">{plan.name}</span>
                  <span className="text-xs text-slate-600">({plan.tenant_count})</span>
                </div>
                <span className="text-sm font-semibold text-white flex-shrink-0">
                  Rs. {fmt(Number(plan.monthly_revenue))}
                </span>
              </div>
            ))}
            {!revenue?.byPlanRevenue?.length && <p className="text-slate-500 text-xs">No plan data</p>}
          </div>
        </div>
      </div>

      {/* By industry + By plan + Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">By Industry</h2>
          <div className="space-y-3">
            {byIndustry.slice(0, 8).map(item => (
              <div key={item.industry} className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 capitalize">{item.industry}</span>
                    <span className="text-slate-400">{item.cnt}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full">
                    <div
                      className="h-1.5 bg-emerald-500 rounded-full"
                      style={{ width: `${Math.min(100, (item.cnt / (totals.total || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {byIndustry.length === 0 && <p className="text-slate-500 text-xs">No data yet</p>}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">By Plan</h2>
          <div className="space-y-3">
            {byPlan.map(item => (
              <div key={item.planName ?? "none"} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${tierColor(item.tier || "")}`}>
                    {item.tier || "None"}
                  </span>
                  <span className="text-sm text-slate-300">{item.planName || "No Plan"}</span>
                </div>
                <span className="text-sm font-semibold text-white">{item.cnt}</span>
              </div>
            ))}
            {byPlan.length === 0 && <p className="text-slate-500 text-xs">No data yet</p>}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Recent Activity</h2>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {recentActivity.slice(0, 10).map((log: any) => (
              <div key={log.id} className="flex items-start gap-2 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                <div>
                  <span className="text-slate-300">{log.action.replace(/_/g, " ")}</span>
                  {log.entity && <span className="text-slate-500"> · {log.entity}</span>}
                  <div className="text-slate-600">{formatDate(log.createdAt)}</div>
                </div>
              </div>
            ))}
            {recentActivity.length === 0 && <p className="text-slate-500 text-xs">No activity yet</p>}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Recent Tenants</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-800">
                <th className="text-left py-2 pr-4">Store</th>
                <th className="text-left py-2 pr-4">Email</th>
                <th className="text-left py-2 pr-4">Plan</th>
                <th className="text-left py-2 pr-4">Status</th>
                <th className="text-left py-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {recentTenants.map((t: any) => (
                <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-white">{t.storeName}</div>
                    <div className="text-xs text-slate-500 capitalize">{t.industry}</div>
                  </td>
                  <td className="py-3 pr-4 text-slate-400">{t.email}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${tierColor(t.planName ? "business" : "")}`}>
                      {t.planName || "No Plan"}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(t.status)}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="py-3 text-slate-400">{formatDate(t.createdAt)}</td>
                </tr>
              ))}
              {recentTenants.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                    No tenants yet. Go to Tenants → Add Tenant to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
