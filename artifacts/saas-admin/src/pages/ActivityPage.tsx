import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

const ACTION_META: Record<string, { icon: string; color: string; label: string }> = {
  create_tenant:       { icon: "🏪", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Tenant Created" },
  update_tenant:       { icon: "✏️", color: "text-blue-400 bg-blue-500/10 border-blue-500/20",         label: "Tenant Updated" },
  cancel_tenant:       { icon: "❌", color: "text-red-400 bg-red-500/10 border-red-500/20",             label: "Tenant Cancelled" },
  change_plan:         { icon: "📦", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",    label: "Plan Changed" },
  register:            { icon: "🆕", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Self-Registered" },
  suspend:             { icon: "⏸️", color: "text-amber-400 bg-amber-500/10 border-amber-500/20",       label: "Suspended" },
  activate:            { icon: "▶️", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Activated" },
  extend_trial:        { icon: "⏳", color: "text-blue-400 bg-blue-500/10 border-blue-500/20",          label: "Trial Extended" },
  impersonate_tenant:  { icon: "👤", color: "text-purple-400 bg-purple-500/10 border-purple-500/20",    label: "Impersonated" },
  update_settings:     { icon: "⚙️", color: "text-slate-400 bg-slate-500/10 border-slate-500/20",       label: "Settings Updated" },
  update_theme:        { icon: "🎨", color: "text-pink-400 bg-pink-500/10 border-pink-500/20",           label: "Theme Updated" },
  login:               { icon: "🔑", color: "text-slate-400 bg-slate-500/10 border-slate-500/20",       label: "Login" },
};

const FILTER_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "create_tenant", label: "Tenant Created" },
  { value: "update_tenant", label: "Tenant Updated" },
  { value: "cancel_tenant", label: "Tenant Cancelled" },
  { value: "change_plan", label: "Plan Changed" },
  { value: "extend_trial", label: "Trial Extended" },
  { value: "impersonate_tenant", label: "Impersonation" },
  { value: "register", label: "Self-Registration" },
  { value: "suspend", label: "Suspended" },
  { value: "activate", label: "Activated" },
  { value: "update_settings", label: "Settings Changed" },
];

function getMeta(action: string) {
  return ACTION_META[action] ?? { icon: "📋", color: "text-slate-400 bg-slate-500/10 border-slate-500/20", label: action.replace(/_/g, " ") };
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.activity().then(setLogs).finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter(log => {
    if (actionFilter && log.action !== actionFilter) return false;
    if (actorFilter && log.actorType !== actorFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!log.action?.toLowerCase().includes(q) &&
          !log.entity?.toLowerCase().includes(q) &&
          !JSON.stringify(log.meta ?? {}).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalToday = logs.filter(l => {
    const d = new Date(l.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Activity Log</h1>
          <p className="text-slate-400 text-sm mt-1">All platform events and admin actions</p>
        </div>
        <div className="flex gap-3 text-right">
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-center">
            <div className="text-xl font-bold text-white">{logs.length}</div>
            <div className="text-xs text-slate-500">Total Events</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-center">
            <div className="text-xl font-bold text-emerald-400">{totalToday}</div>
            <div className="text-xs text-slate-500">Today</div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search actions or metadata..."
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 w-64"
        />
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        >
          {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={actorFilter}
          onChange={e => setActorFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        >
          <option value="">All Actors</option>
          <option value="super_admin">Super Admin</option>
          <option value="tenant">Tenant</option>
        </select>
        {(actionFilter || actorFilter || search) && (
          <button
            onClick={() => { setActionFilter(""); setActorFilter(""); setSearch(""); }}
            className="text-xs text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Clear filters
          </button>
        )}
        <span className="text-xs text-slate-500 flex items-center">{filtered.length} results</span>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800/80">
        {filtered.map(log => {
          const meta = getMeta(log.action);
          return (
            <div key={log.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-800/20 transition-colors">
              <div className={`w-9 h-9 rounded-lg border flex items-center justify-center text-base flex-shrink-0 ${meta.color}`}>
                {meta.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium text-sm">{meta.label}</span>
                  {log.entity && (
                    <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                      {log.entity}{log.entityId ? ` #${log.entityId}` : ""}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    log.actorType === "super_admin"
                      ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-300"
                      : "bg-slate-700/50 border-slate-600 text-slate-300"
                  }`}>
                    {log.actorType === "super_admin" ? "Super Admin" : "Tenant"}
                  </span>
                </div>
                {log.meta && Object.keys(log.meta).length > 0 && (
                  <div className="text-xs text-slate-500 mt-1.5 font-mono bg-slate-800/50 rounded px-2 py-1 truncate max-w-xl">
                    {JSON.stringify(log.meta)}
                  </div>
                )}
              </div>
              <div className="text-xs text-slate-500 flex-shrink-0 text-right">
                <div className="font-medium text-slate-400">{formatDateTime(log.createdAt)}</div>
                {log.ip && <div className="text-slate-600 mt-0.5">IP: {log.ip}</div>}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-16 text-center text-slate-500">
            {logs.length > 0 ? "No matching events. Try adjusting your filters." : "No activity logged yet."}
          </div>
        )}
      </div>
    </div>
  );
}
