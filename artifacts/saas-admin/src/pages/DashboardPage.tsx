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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboard().then(setStats).finally(() => setLoading(false));
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

  const statCards = [
    { label: "Total Tenants", value: totals.total, icon: "🏪", color: "text-white" },
    { label: "Active", value: totals.active, icon: "✅", color: "text-emerald-400" },
    { label: "Trial", value: totals.trial, icon: "⏳", color: "text-blue-400" },
    { label: "Suspended", value: totals.suspended, icon: "⚠️", color: "text-amber-400" },
    { label: "New This Month", value: totals.thisMonth, icon: "🆕", color: "text-indigo-400" },
    { label: "Cancelled", value: totals.cancelled, icon: "❌", color: "text-red-400" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Overview of all tenants and activity</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xl mb-2">{card.icon}</div>
            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
            <div className="text-xs text-slate-500 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

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
              <div key={item.planName} className="flex items-center justify-between">
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
                    <div className="text-xs text-slate-500">{t.industry}</div>
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
