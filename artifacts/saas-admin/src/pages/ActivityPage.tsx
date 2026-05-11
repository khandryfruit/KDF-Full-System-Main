import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

const ACTION_ICONS: Record<string, string> = {
  create_tenant: "🏪", update_tenant: "✏️", cancel_tenant: "❌", change_plan: "📦",
  register: "🆕", suspend: "⚠️", activate: "✅", login: "🔑", default: "📋",
};

export default function ActivityPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.activity().then(setLogs).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Activity Log</h1>
        <p className="text-slate-400 text-sm mt-1">All platform events and actions</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800">
        {logs.map(log => (
          <div key={log.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-800/30 transition-colors">
            <div className="text-xl flex-shrink-0">{ACTION_ICONS[log.action] || ACTION_ICONS.default}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-medium text-sm">{log.action.replace(/_/g, " ")}</span>
                {log.entity && (
                  <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                    {log.entity}
                    {log.entityId ? ` #${log.entityId}` : ""}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${log.actorType === "super_admin" ? "bg-indigo-500/20 text-indigo-300" : "bg-slate-700 text-slate-300"}`}>
                  {log.actorType === "super_admin" ? "Super Admin" : "Tenant"}
                </span>
              </div>
              {log.meta && Object.keys(log.meta).length > 0 && (
                <div className="text-xs text-slate-500 mt-1 font-mono bg-slate-800/50 rounded px-2 py-1 truncate">
                  {JSON.stringify(log.meta)}
                </div>
              )}
            </div>
            <div className="text-xs text-slate-500 flex-shrink-0 text-right">
              <div>{formatDateTime(log.createdAt)}</div>
              {log.ip && <div className="text-slate-600 mt-0.5">IP: {log.ip}</div>}
            </div>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="py-16 text-center text-slate-500">No activity logged yet.</div>
        )}
      </div>
    </div>
  );
}
