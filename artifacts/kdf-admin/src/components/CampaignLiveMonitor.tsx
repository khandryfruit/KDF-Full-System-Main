import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, CheckCircle, XCircle, Clock, Send, ChevronDown, ChevronUp,
  RefreshCw, X, AlertCircle, Loader2, MessageCircle, Eye, Zap,
  BarChart3, Users, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

interface LiveCampaign {
  id: number;
  name: string;
  status: string;
  target_segment: string;
  total_sent: number;
  total_failed: number;
  started_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  pending_count: string;
  sending_count: string;
  sent_count: string;
  failed_count: string;
  total_queued: string;
}

interface LogEntry {
  id: number;
  status: string;
  customer_name: string | null;
  phone: string | null;
  email: string | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  retries: number;
  campaign_type: string;
}

function elapsed(dateStr: string | null): string {
  if (!dateStr) return "—";
  const ms = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function timeStr(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: typeof Activity; label: string; pulse?: boolean }> = {
  queued:    { color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",   icon: Clock,        label: "Queued",    pulse: true },
  running:   { color: "text-emerald-700",bg: "bg-emerald-50",border: "border-emerald-200",icon: Activity,     label: "Running",   pulse: true },
  completed: { color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200",  icon: CheckCircle,  label: "Completed" },
  failed:    { color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",    icon: XCircle,      label: "Failed" },
  draft:     { color: "text-gray-600",   bg: "bg-gray-50",   border: "border-gray-200",   icon: Clock,        label: "Draft" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {cfg.pulse
        ? <span className="relative flex h-2 w-2"><span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status === "queued" ? "bg-blue-400" : "bg-emerald-400"}`} /><span className={`relative inline-flex rounded-full h-2 w-2 ${status === "queued" ? "bg-blue-500" : "bg-emerald-500"}`} /></span>
        : <Icon className="w-3 h-3" />
      }
      {cfg.label}
    </span>
  );
}

function ProgressBar({ sent, total, failed }: { sent: number; total: number; failed: number }) {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  const failPct = total > 0 ? Math.round((failed / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground font-medium">{pct}% sent</span>
        <span className="font-semibold tabular-nums">{sent.toLocaleString()} / {total.toLocaleString()}</span>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden flex">
        <div className="h-full bg-green-500 transition-all duration-1000 rounded-l-full" style={{ width: `${pct}%` }} />
        <div className="h-full bg-red-400 transition-all duration-1000" style={{ width: `${failPct}%` }} />
      </div>
    </div>
  );
}

function LogsModal({ campaignId, campaignName, onClose }: { campaignId: number; campaignName: string; onClose: () => void }) {
  const [filter, setFilter] = useState<"all" | "sent" | "failed" | "pending">("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["campaign-logs", campaignId],
    queryFn: () => api(`/admin/shopify/campaigns/${campaignId}/logs`).then(r => r.json()),
    refetchInterval: 10000,
  });

  const logs: LogEntry[] = data?.logs ?? [];
  const summary = data?.summary ?? {};

  const filtered = logs.filter(l => filter === "all" ? true : l.status === filter);

  const statusIcon = (s: string) => {
    if (s === "sent") return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
    if (s === "failed") return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    if (s === "pending") return <Clock className="w-3.5 h-3.5 text-blue-400" />;
    if (s === "sending") return <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />;
    return <AlertCircle className="w-3.5 h-3.5 text-gray-400" />;
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-[#25D366]" />
              Message Logs
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-sm">{campaignName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-border shrink-0">
          {[
            { label: "Total", value: summary.total ?? 0, color: "text-foreground", icon: Users },
            { label: "Sent", value: summary.sent ?? 0, color: "text-green-600", icon: CheckCircle },
            { label: "Failed", value: summary.failed ?? 0, color: "text-red-600", icon: XCircle },
            { label: "Pending", value: summary.pending ?? 0, color: "text-blue-600", icon: Clock },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="text-center bg-muted/30 rounded-xl p-2.5">
              <p className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 px-5 py-2 border-b border-border shrink-0">
          {(["all", "sent", "failed", "pending"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {f} {f !== "all" && <span className="ml-1 opacity-70">({logs.filter(l => l.status === f).length})</span>}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground self-center">Auto-refreshes every 10s</span>
        </div>

        {/* Logs Table */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageCircle className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No messages found</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur-sm">
                <tr>
                  {["Status", "Customer", "Contact", "Sent At", "Error"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <tr key={log.id} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {statusIcon(log.status)}
                        <span className={`font-semibold capitalize ${
                          log.status === "sent" ? "text-green-700" :
                          log.status === "failed" ? "text-red-600" :
                          log.status === "sending" ? "text-amber-600" : "text-blue-600"
                        }`}>{log.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{log.customer_name || "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {log.phone || log.email || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {log.sent_at ? timeStr(log.sent_at) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {log.error_message
                        ? <span className="text-red-600 text-[11px]" title={log.error_message}>{log.error_message.slice(0, 40)}{log.error_message.length > 40 ? "…" : ""}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignCard({ c, onViewLogs }: { c: LiveCampaign; onViewLogs: (id: number, name: string) => void }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const isActive = c.status === "queued" || c.status === "running";
    if (!isActive) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [c.status]);

  const sent = Number(c.sent_count);
  const failed = Number(c.failed_count);
  const pending = Number(c.pending_count);
  const sending = Number(c.sending_count);
  const total = Number(c.total_queued);
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  const isActive = c.status === "queued" || c.status === "running";

  return (
    <div className={`border rounded-2xl p-4 space-y-3 transition-all ${
      isActive ? "border-primary/30 bg-primary/[0.02] shadow-sm" : "border-border bg-card"
    }`}>
      {/* Campaign header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={c.status} />
            {isActive && (
              <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" /> {elapsed(c.started_at ?? c.created_at)}
              </span>
            )}
            {c.completed_at && (
              <span className="text-[11px] text-muted-foreground">
                Done {elapsed(c.completed_at)} ago
              </span>
            )}
          </div>
          <p className="font-semibold text-sm mt-1.5 leading-snug line-clamp-2">{c.name}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => onViewLogs(c.id, c.name)}
          className="shrink-0 gap-1.5 text-xs h-8">
          <Eye className="w-3.5 h-3.5" /> Logs
        </Button>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <ProgressBar sent={sent} total={total} failed={failed} />
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="bg-green-50 border border-green-100 rounded-xl py-2 px-1">
          <p className="text-base font-bold text-green-700 tabular-nums">{sent.toLocaleString()}</p>
          <p className="text-[10px] text-green-600 font-medium">Sent</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl py-2 px-1">
          <p className="text-base font-bold text-blue-700 tabular-nums">{(pending + sending).toLocaleString()}</p>
          <p className="text-[10px] text-blue-600 font-medium">Pending</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl py-2 px-1">
          <p className="text-base font-bold text-red-600 tabular-nums">{failed.toLocaleString()}</p>
          <p className="text-[10px] text-red-500 font-medium">Failed</p>
        </div>
        <div className="bg-muted border border-border rounded-xl py-2 px-1">
          <p className="text-base font-bold tabular-nums">{total.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground font-medium">Total</p>
        </div>
      </div>

      {/* Speed estimate for active campaigns */}
      {isActive && total > 0 && pct < 100 && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          <Zap className="w-3 h-3 text-amber-500" />
          <span>Processing ~8 messages / 30 sec · Estimated {Math.ceil((pending + sending) / 8 * 0.5)} min remaining</span>
        </div>
      )}
    </div>
  );
}

interface OrphanedStats {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  total: number;
  oldestCreated: string | null;
}

interface LiveData {
  campaigns: LiveCampaign[];
  orphaned: OrphanedStats;
}

interface CampaignLiveMonitorProps {
  showAlways?: boolean;
}

export function CampaignLiveMonitor({ showAlways = false }: CampaignLiveMonitorProps) {
  const [expanded, setExpanded] = useState(true);
  const [logsModal, setLogsModal] = useState<{ id: number; name: string } | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());

  const { data, isLoading, refetch } = useQuery<LiveData>({
    queryKey: ["campaigns-live"],
    queryFn: () => api("/admin/shopify/campaigns/live").then(r => r.json()),
    refetchInterval: 10000,
  } as any);

  useEffect(() => {
    if (data) setLastRefreshed(Date.now());
  }, [data]);

  const manualRefresh = useCallback(() => {
    refetch();
    setLastRefreshed(Date.now());
  }, [refetch]);

  const campaigns: LiveCampaign[] = data?.campaigns ?? [];
  const orphaned: OrphanedStats = data?.orphaned ?? { pending: 0, sending: 0, sent: 0, failed: 0, total: 0, oldestCreated: null };

  const activeCampaigns = campaigns.filter(c => c.status === "queued" || c.status === "running");
  const recentCompleted = campaigns.filter(c => c.status === "completed" || c.status === "failed");

  const hasOrphaned = orphaned.pending > 0 || orphaned.sending > 0;
  const hasAnything = campaigns.length > 0 || hasOrphaned;
  if (!hasAnything && !showAlways) return null;

  const activeCount = activeCampaigns.length + (hasOrphaned ? 1 : 0);
  const totalPending = activeCampaigns.reduce((s, c) => s + Number(c.pending_count) + Number(c.sending_count), 0) + orphaned.pending + orphaned.sending;
  const totalSent = campaigns.reduce((s, c) => s + Number(c.sent_count), 0) + orphaned.sent;
  const totalFailed = campaigns.reduce((s, c) => s + Number(c.failed_count), 0) + orphaned.failed;

  return (
    <>
      <div className={`border rounded-2xl overflow-hidden ${activeCount > 0 ? "border-primary/30 shadow-sm" : "border-border"}`}>
        {/* Header bar */}
        <div
          className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
            activeCount > 0 ? "bg-primary/[0.04] hover:bg-primary/[0.07]" : "bg-muted/30 hover:bg-muted/50"
          }`}
          onClick={() => setExpanded(v => !v)}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeCount > 0 ? "bg-primary/15" : "bg-muted"}`}>
              {activeCount > 0
                ? <Activity className="w-4 h-4 text-primary animate-pulse" />
                : <BarChart3 className="w-4 h-4 text-muted-foreground" />
              }
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">
                  {activeCount > 0 ? `${activeCount} Campaign${activeCount > 1 ? "s" : ""} Running` : "Campaign Monitor"}
                </span>
                {activeCount > 0 && (
                  <span className="text-[11px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
                    {totalPending.toLocaleString()} pending
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-green-500" />{totalSent.toLocaleString()} sent</span>
                {totalFailed > 0 && <span className="flex items-center gap-1 text-red-500"><XCircle className="w-3 h-3" />{totalFailed} failed</span>}
                <span>·</span>
                <span>{campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""} (7d)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            <button
              onClick={e => { e.stopPropagation(); manualRefresh(); }}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              title="Refresh now"
            >
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Body */}
        {expanded && (
          <div className="px-4 pb-4 pt-3 space-y-3 border-t border-border/50">
            {isLoading && campaigns.length === 0 && !hasOrphaned ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading campaigns…
              </div>
            ) : !hasAnything ? (
              <div className="flex flex-col items-center py-6 text-muted-foreground">
                <Send className="w-6 h-6 mb-2 opacity-40" />
                <p className="text-sm">No campaigns in the last 7 days</p>
                <p className="text-xs mt-0.5">Launch a campaign from the Customers tab to track it here</p>
              </div>
            ) : (
              <>
                {/* Orphaned (untracked) queue messages */}
                {hasOrphaned && (
                  <div className="border border-amber-200 bg-amber-50/50 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border text-amber-700 bg-amber-100 border-amber-200">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                            </span>
                            Running (Untracked)
                          </span>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Legacy queue
                          </span>
                        </div>
                        <p className="font-semibold text-sm mt-1.5">WhatsApp Queue (Pre-tracking)</p>
                        <p className="text-[11px] text-amber-700 mt-0.5">These messages were queued before campaign tracking was enabled</p>
                      </div>
                    </div>

                    <ProgressBar sent={orphaned.sent} total={orphaned.total} failed={orphaned.failed} />

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-green-50 border border-green-100 rounded-xl py-2 px-1">
                        <p className="text-base font-bold text-green-700 tabular-nums">{orphaned.sent.toLocaleString()}</p>
                        <p className="text-[10px] text-green-600 font-medium">Sent</p>
                      </div>
                      <div className="bg-blue-50 border border-blue-100 rounded-xl py-2 px-1">
                        <p className="text-base font-bold text-blue-700 tabular-nums">{(orphaned.pending + orphaned.sending).toLocaleString()}</p>
                        <p className="text-[10px] text-blue-600 font-medium">Pending</p>
                      </div>
                      <div className="bg-red-50 border border-red-100 rounded-xl py-2 px-1">
                        <p className="text-base font-bold text-red-600 tabular-nums">{orphaned.failed.toLocaleString()}</p>
                        <p className="text-[10px] text-red-500 font-medium">Failed</p>
                      </div>
                      <div className="bg-muted border border-border rounded-xl py-2 px-1">
                        <p className="text-base font-bold tabular-nums">{orphaned.total.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground font-medium">Total</p>
                      </div>
                    </div>

                    {(orphaned.pending + orphaned.sending) > 0 && (
                      <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        <Zap className="w-3 h-3 text-amber-500" />
                        <span>~{(orphaned.pending + orphaned.sending).toLocaleString()} messages still pending · ~{Math.ceil((orphaned.pending + orphaned.sending) / 8 * 0.5)} min remaining</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Named campaigns */}
                {activeCampaigns.length > 0 && (
                  <div className="space-y-3">
                    {hasOrphaned && <div className="h-px bg-border" />}
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Activity className="w-3 h-3 text-primary" /> Active Campaigns
                    </p>
                    {activeCampaigns.map(c => (
                      <CampaignCard key={c.id} c={c} onViewLogs={(id, name) => setLogsModal({ id, name })} />
                    ))}
                  </div>
                )}

                {recentCompleted.length > 0 && (
                  <div className="space-y-2">
                    {(activeCampaigns.length > 0 || hasOrphaned) && <div className="h-px bg-border" />}
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Recent Campaigns (7d)
                    </p>
                    <div className="space-y-2">
                      {recentCompleted.slice(0, 5).map(c => (
                        <div key={c.id} className="flex items-center justify-between border border-border rounded-xl px-4 py-3 hover:bg-muted/20 transition-colors">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <StatusBadge status={c.status} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{c.name}</p>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                                <span className="text-green-600">{Number(c.sent_count).toLocaleString()} sent</span>
                                {Number(c.failed_count) > 0 && <span className="text-red-500">{Number(c.failed_count)} failed</span>}
                                <span>/ {Number(c.total_queued).toLocaleString()} total</span>
                              </div>
                            </div>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => setLogsModal({ id: c.id, name: c.name })}
                            className="gap-1 text-xs h-7 shrink-0">
                            <Eye className="w-3 h-3" /> Logs
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <p className="text-[11px] text-muted-foreground text-right">
              Auto-refreshes every 10s · Last updated {new Date(lastRefreshed).toLocaleTimeString("en-PK")}
            </p>
          </div>
        )}
      </div>

      {logsModal && (
        <LogsModal
          campaignId={logsModal.id}
          campaignName={logsModal.name}
          onClose={() => setLogsModal(null)}
        />
      )}
    </>
  );
}
