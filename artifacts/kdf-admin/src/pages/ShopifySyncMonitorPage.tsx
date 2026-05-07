import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Wifi, WifiOff, AlertTriangle, CheckCircle2, XCircle,
  Loader2, Zap, Clock, Package, Users, ShoppingCart, Webhook,
  Activity, TrendingUp, Bell, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

function fmtRelative(iso: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    idle:    { color: "bg-gray-100 text-gray-600 border-gray-200",    label: "Idle",    icon: <Clock className="w-3 h-3" /> },
    running: { color: "bg-blue-50 text-blue-600 border-blue-200",     label: "Running", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    success: { color: "bg-green-50 text-green-700 border-green-200",  label: "OK",      icon: <CheckCircle2 className="w-3 h-3" /> },
    error:   { color: "bg-red-50 text-red-600 border-red-200",        label: "Error",   icon: <XCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? map.idle!;
  return (
    <Badge variant="outline" className={`flex items-center gap-1 text-xs font-semibold ${s.color}`}>
      {s.icon} {s.label}
    </Badge>
  );
}

function WebhookTopicBadge({ topic }: { topic: string }) {
  const color =
    topic.startsWith("orders/create") ? "bg-green-100 text-green-700" :
    topic.startsWith("orders/") ? "bg-blue-100 text-blue-700" :
    topic.startsWith("products/") ? "bg-orange-100 text-orange-700" :
    topic.startsWith("customers/") ? "bg-purple-100 text-purple-700" :
    topic.startsWith("fulfillments/") ? "bg-teal-100 text-teal-700" :
    "bg-gray-100 text-gray-600";
  return (
    <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${color}`}>{topic}</span>
  );
}

function WebhookRow({ log }: { log: any }) {
  const [expanded, setExpanded] = useState(false);
  const ok = log.status === "processed";
  const payload = (() => {
    try { return JSON.stringify(JSON.parse(log.payload ?? "{}"), null, 2); }
    catch { return log.payload ?? "—"; }
  })();

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${ok ? "border-green-100" : "border-red-100"}`}>
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 ${ok ? "bg-green-50/40" : "bg-red-50/40"}`}
        onClick={() => setExpanded(v => !v)}
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-green-500" : "bg-red-400"}`} />
        <WebhookTopicBadge topic={log.topic ?? "—"} />
        <span className="text-xs text-muted-foreground flex-1 truncate">{log.shopDomain ?? log.shop_domain ?? "—"}</span>
        <span className="text-xs text-muted-foreground">{fmtTime(log.receivedAt ?? log.received_at)}</span>
        {ok
          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </div>
      {expanded && (
        <div className="px-4 py-3 border-t border-border bg-muted/20">
          {log.error && (
            <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 font-mono">
              ❌ {log.error}
            </div>
          )}
          <pre className="text-[10px] text-muted-foreground overflow-x-auto font-mono leading-relaxed max-h-48">
            {payload.slice(0, 1200)}{payload.length > 1200 ? "\n…(truncated)" : ""}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function ShopifySyncMonitorPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: syncStatus, isLoading: sl } = useQuery({
    queryKey: ["shopify-auto-sync-status"],
    queryFn: () => api("/admin/shopify/auto-sync/status").then(r => r.json()),
    refetchInterval: 10_000,
  });

  const { data: webhookLogs, isLoading: wl } = useQuery({
    queryKey: ["shopify-webhook-logs"],
    queryFn: () => api("/admin/shopify/auto-sync/logs?limit=50").then(r => r.json()),
    refetchInterval: 15_000,
  });

  const { data: storeData } = useQuery({
    queryKey: ["shopify-store"],
    queryFn: () => api("/admin/shopify/store").then(r => r.json()),
  });

  const triggerMutation = useMutation({
    mutationFn: () => api("/admin/shopify/auto-sync/trigger", { method: "POST" }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Incremental sync triggered", description: "Running in background — refresh in 30s." });
      qc.invalidateQueries({ queryKey: ["shopify-auto-sync-status"] });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["shopify-auto-sync-status"] }), 8000);
    },
    onError: () => toast({ title: "Failed to trigger sync", variant: "destructive" }),
  });

  const webhookRegMutation = useMutation({
    mutationFn: () => api("/admin/shopify/webhooks/register", { method: "POST" }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: `Webhooks: ${data.registered?.length ?? 0} registered, ${data.skipped?.length ?? 0} already active` });
    },
    onError: () => toast({ title: "Webhook registration failed", variant: "destructive" }),
  });

  const sync = syncStatus?.autoSync ?? syncStatus ?? {};
  const logs: any[] = Array.isArray(webhookLogs) ? webhookLogs : (webhookLogs?.logs ?? []);

  const orderLogs = logs.filter((l: any) => (l.topic ?? "").startsWith("orders/"));
  const errorLogs = logs.filter((l: any) => l.status !== "processed");

  const isConnected = storeData?.isConnected;
  const lastResult = sync.lastSyncResult;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sync Monitor</h1>
          <p className="text-muted-foreground text-sm">Live status — webhooks, background sync, and order routing</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isConnected
            ? <span className="flex items-center gap-1.5 text-sm text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg"><Wifi className="w-3.5 h-3.5" /> Store Connected</span>
            : <span className="flex items-center gap-1.5 text-sm text-red-500 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg"><WifiOff className="w-3.5 h-3.5" /> Not Connected</span>
          }
          <Button
            size="sm"
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending || sync.status === "running"}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {triggerMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Sync Now
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => webhookRegMutation.mutate()}
            disabled={webhookRegMutation.isPending}
          >
            <Webhook className="w-3.5 h-3.5 mr-1.5" />
            {webhookRegMutation.isPending ? "Registering…" : "Re-register Webhooks"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => qc.invalidateQueries()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Auto-Sync Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            icon: Activity,
            label: "Sync Status",
            value: sl ? "..." : (sync.status ?? "idle"),
            sub: fmtRelative(sync.lastSyncAt),
            color: sync.status === "error" ? "bg-red-500" : sync.status === "running" ? "bg-blue-500" : "bg-green-500",
            badge: sl ? null : <StatusPill status={sync.status ?? "idle"} />,
          },
          {
            icon: Clock,
            label: "Interval",
            value: `${sync.intervalMinutes ?? 15} min`,
            sub: `${sync.totalSyncsRun ?? 0} total runs`,
            color: "bg-indigo-500",
          },
          {
            icon: TrendingUp,
            label: "Last Sync",
            value: lastResult ? `${(lastResult.orders ?? 0) + (lastResult.customers ?? 0) + (lastResult.products ?? 0)}` : "—",
            sub: lastResult ? `${lastResult.orders ?? 0} orders · ${lastResult.products ?? 0} products` : "No sync yet",
            color: "bg-purple-500",
          },
          {
            icon: Webhook,
            label: "Webhooks Recv",
            value: sync.webhookEventsProcessed ?? 0,
            sub: `${errorLogs.length} errors in last 50`,
            color: errorLogs.length > 0 ? "bg-red-500" : "bg-teal-500",
          },
        ].map(({ icon: Icon, label, value, sub, color, badge }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-lg font-bold text-foreground capitalize">{String(value)}</p>
                {badge}
              </div>
              {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Error Alert */}
      {sync.lastError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">Last Sync Error</p>
            <p className="text-xs text-red-600 mt-0.5 font-mono">{sync.lastError}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 text-red-600 border-red-300"
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending}
            >
              <RefreshCw className="w-3 h-3 mr-1.5" /> Retry Sync
            </Button>
          </div>
        </div>
      )}

      {/* Order Routing Stats */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-green-500" />
          <h2 className="font-semibold">Order Routing & Automation</h2>
          <Badge variant="outline" className="ml-auto text-xs bg-green-50 text-green-700 border-green-200">Auto Active</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-muted/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2 text-blue-600">
              <ShoppingCart className="w-4 h-4" />
              <span className="font-semibold text-sm">Lahore Orders</span>
            </div>
            <p className="text-xs text-muted-foreground">Auto-assigned to rider with fewest active deliveries + WhatsApp notification sent</p>
            <div className="mt-2 text-xs text-blue-600 font-mono bg-blue-50 rounded px-2 py-1">Trigger: orders/create</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2 text-purple-600">
              <Users className="w-4 h-4" />
              <span className="font-semibold text-sm">Other Cities</span>
            </div>
            <p className="text-xs text-muted-foreground">WA confirmation sent to customer with Confirm/Cancel buttons for courier booking</p>
            <div className="mt-2 text-xs text-purple-600 font-mono bg-purple-50 rounded px-2 py-1">Trigger: orders/create</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2 text-green-600">
              <Package className="w-4 h-4" />
              <span className="font-semibold text-sm">Background Sync</span>
            </div>
            <p className="text-xs text-muted-foreground">Incremental sync every {sync.intervalMinutes ?? 15} min. New orders also trigger automation.</p>
            <div className="mt-2 text-xs text-green-600 font-mono bg-green-50 rounded px-2 py-1">Runs: every {sync.intervalMinutes ?? 15} min</div>
          </div>
        </div>
      </div>

      {/* Webhook Logs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Webhook className="w-4 h-4 text-indigo-500" />
              Webhook Logs
              <span className="text-xs text-muted-foreground font-normal">(last 50 events)</span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {errorLogs.length > 0 && (
              <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs">
                <XCircle className="w-3 h-3 mr-1" /> {errorLogs.length} errors
              </Badge>
            )}
            <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 text-xs">
              {orderLogs.length} order events
            </Badge>
          </div>
        </div>

        {wl ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading webhook logs…</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
            <Webhook className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No webhook events received yet.</p>
            <p className="text-xs mt-1">Register webhooks in Shopify → Settings → Notifications.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => webhookRegMutation.mutate()} disabled={webhookRegMutation.isPending}>
              <Zap className="w-3.5 h-3.5 mr-1.5" /> Auto-Register Webhooks
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log: any, i: number) => (
              <WebhookRow key={log.id ?? i} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
