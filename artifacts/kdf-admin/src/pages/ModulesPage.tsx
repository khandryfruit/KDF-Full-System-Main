import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getApiBase } from "@/lib/apiBase";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart, Truck, Navigation, FileText, MessageCircle,
  TrendingUp, BarChart2, GitBranch, Bell, CreditCard,
  Package, Settings, Smartphone, Monitor, Users, Zap,
  RefreshCw, Activity, Wifi, WifiOff,
} from "lucide-react";

function adminApiRoot(): string {
  const b = getApiBase().replace(/\/$/, "");
  return b ? `${b}/api` : "/api";
}
const API = adminApiRoot();
const token = () => localStorage.getItem("kdf_admin_token") ?? "";
const h = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
async function apiFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, { ...opts, headers: { ...h(), ...(opts.headers ?? {}) } });
  return r.json();
}

const MODULE_ICONS: Record<string, any> = {
  ecommerce: ShoppingCart, logistics: Truck, riders: Navigation,
  billing: FileText, whatsapp: MessageCircle, marketing: TrendingUp,
  analytics: BarChart2, branches: GitBranch, notifications: Bell,
  payments: CreditCard, store: Package, settings: Settings,
};

const MODULE_COLORS: Record<string, string> = {
  ecommerce: "#3B82F6", logistics: "#10B981", riders: "#00C562",
  billing: "#F59E0B", whatsapp: "#22C55E", marketing: "#EC4899",
  analytics: "#8B5CF6", branches: "#06B6D4", notifications: "#F97316",
  payments: "#10B981", store: "#6366F1", settings: "#94A3B8",
};

function ModuleCard({ mod, onToggle }: { mod: any; onToggle: (key: string, val: boolean) => void }) {
  const Icon = MODULE_ICONS[mod.module_key] ?? Package;
  const color = MODULE_COLORS[mod.module_key] ?? "#6366F1";
  const enabled = mod.is_enabled;

  return (
    <div className={`relative rounded-2xl border p-5 transition-all duration-200 ${
      enabled
        ? "bg-white border-border shadow-sm hover:shadow-md"
        : "bg-slate-50/60 border-slate-200/60 opacity-65"
    }`}>
      {/* Enable/Disable toggle */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${color}18` }}
          >
            <Icon size={20} style={{ color }} />
          </div>
          <div>
            <p className="font-bold text-sm text-slate-800">{mod.module_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {mod.description || "—"}
            </p>
          </div>
        </div>
        {/* Toggle switch */}
        <button
          onClick={() => onToggle(mod.module_key, !enabled)}
          className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
            enabled ? "bg-green-500" : "bg-slate-200"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              enabled ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Visibility badges */}
      <div className="flex gap-2 mt-3">
        <span className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg font-semibold ${
          mod.app_visible ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-slate-100 text-slate-400"
        }`}>
          <Smartphone size={9} />
          App
        </span>
        <span className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg font-semibold ${
          mod.web_visible ? "bg-purple-50 text-purple-600 border border-purple-100" : "bg-slate-100 text-slate-400"
        }`}>
          <Monitor size={9} />
          Web
        </span>
        <span className={`ml-auto text-[10px] px-2 py-1 rounded-lg font-bold ${
          enabled
            ? "bg-green-50 text-green-600 border border-green-100"
            : "bg-red-50 text-red-500 border border-red-100"
        }`}>
          {enabled ? "ENABLED" : "DISABLED"}
        </span>
      </div>
    </div>
  );
}

export default function ModulesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sseConnected, setSseConnected] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["system-modules"],
    queryFn: () => apiFetch("/admin/modules"),
  });

  const modules: any[] = data?.modules ?? [];
  const enabledCount = modules.filter(m => m.is_enabled).length;

  /* SSE live sync */
  useEffect(() => {
    const es = new EventSource(`${API}/admin/modules/events`, {
      // @ts-ignore — withCredentials not in types for EventSource constructor options
    });
    sseRef.current = es;
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "module_update") {
          qc.setQueryData(["system-modules"], (old: any) => {
            if (!old) return old;
            return {
              ...old,
              modules: old.modules.map((m: any) =>
                m.module_key === msg.module.module_key ? { ...m, ...msg.module } : m
              ),
            };
          });
        }
      } catch {}
    };
    return () => { es.close(); setSseConnected(false); };
  }, []);

  const toggleMutation = useMutation({
    mutationFn: ({ key, val }: { key: string; val: boolean }) =>
      apiFetch(`/admin/modules/${key}/toggle`, {
        method: "PUT",
        body: JSON.stringify({ is_enabled: val }),
      }),
    onMutate: async ({ key, val }) => {
      await qc.cancelQueries({ queryKey: ["system-modules"] });
      const prev = qc.getQueryData(["system-modules"]);
      qc.setQueryData(["system-modules"], (old: any) => ({
        ...old,
        modules: old.modules.map((m: any) =>
          m.module_key === key ? { ...m, is_enabled: val } : m
        ),
      }));
      return { prev };
    },
    onError: (_e, _v, ctx: any) => {
      qc.setQueryData(["system-modules"], ctx?.prev);
      toast({ title: "Failed to update module", variant: "destructive" });
    },
    onSuccess: (_d, { val }) => {
      toast({ title: `Module ${val ? "enabled" : "disabled"} ✓` });
    },
  });

  const handleToggle = (key: string, val: boolean) => {
    toggleMutation.mutate({ key, val });
  };

  const enableAll = async () => {
    for (const m of modules.filter(x => !x.is_enabled)) {
      await apiFetch(`/admin/modules/${m.module_key}/toggle`, {
        method: "PUT", body: JSON.stringify({ is_enabled: true }),
      });
    }
    refetch();
    toast({ title: "All modules enabled" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Module Control Center</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Enable or disable features across web admin and mobile apps in real-time
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            sseConnected
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-slate-50 text-slate-400 border-slate-200"
          }`}>
            {sseConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {sseConnected ? "Live Sync Active" : "Connecting..."}
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-border rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Modules", value: modules.length, icon: Package, color: "#6366F1" },
          { label: "Enabled", value: enabledCount, icon: Activity, color: "#10B981" },
          { label: "Disabled", value: modules.length - enabledCount, icon: WifiOff, color: "#EF4444" },
          { label: "App Visible", value: modules.filter(m => m.app_visible && m.is_enabled).length, icon: Smartphone, color: "#3B82F6" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-border p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <Zap size={16} className="text-blue-500 shrink-0" />
        <p className="text-sm text-blue-700">
          Changes sync instantly to <strong>Web Admin</strong>, <strong>Khan Baba Admin App</strong>, and <strong>Rider App</strong> via live SSE connection — no refresh needed.
        </p>
        {modules.some(m => !m.is_enabled) && (
          <button
            onClick={enableAll}
            className="ml-auto text-xs font-semibold text-blue-600 whitespace-nowrap hover:underline"
          >
            Enable All
          </button>
        )}
      </div>

      {/* Module Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-36 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((mod) => (
            <ModuleCard key={mod.module_key} mod={mod} onToggle={handleToggle} />
          ))}
        </div>
      )}

      {/* Role access info */}
      <div className="bg-slate-50 rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-slate-500" />
          <p className="text-sm font-semibold text-slate-700">Role Access per Module</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {modules.map((mod) => (
            <div key={mod.module_key} className="flex items-center justify-between text-xs py-1.5 px-3 bg-white rounded-lg border border-border">
              <span className="text-slate-600 font-medium">{mod.module_name}</span>
              <div className="flex gap-1 flex-wrap justify-end">
                {(mod.role_access ?? []).map((r: string) => (
                  <Badge key={r} variant="secondary" className="text-[9px] py-0 px-1.5">
                    {r.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
