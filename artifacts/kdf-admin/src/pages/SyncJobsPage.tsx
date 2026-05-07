import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, Clock, RefreshCw, ChevronDown, ChevronRight, Package, FileText, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";

async function fetchJobs() {
  const res = await fetch("/api/sync-jobs?limit=100", {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN()}` },
  });
  if (!res.ok) throw new Error("Failed to fetch sync jobs");
  return res.json();
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    pending: { icon: <Clock className="w-3 h-3" />, cls: "bg-gray-50 text-gray-500 border-gray-200", label: "Pending" },
    running: { icon: <Loader2 className="w-3 h-3 animate-spin" />, cls: "bg-blue-50 text-blue-600 border-blue-200", label: "Running" },
    completed: { icon: <CheckCircle2 className="w-3 h-3" />, cls: "bg-green-50 text-green-700 border-green-200", label: "Completed" },
    failed: { icon: <XCircle className="w-3 h-3" />, cls: "bg-red-50 text-red-600 border-red-200", label: "Failed" },
  };
  const s = map[status] ?? map.pending!;
  return (
    <Badge variant="outline" className={`flex items-center gap-1 text-xs ${s.cls}`}>
      {s.icon} {s.label}
    </Badge>
  );
}

function IntegrationIcon({ type }: { type: string }) {
  const map: Record<string, { icon: string; label: string; cls: string }> = {
    shopify: { icon: "🛍️", label: "Shopify", cls: "bg-green-50" },
    woocommerce: { icon: "🛒", label: "WooCommerce", cls: "bg-purple-50" },
    csv_import: { icon: "📄", label: "CSV Import", cls: "bg-blue-50" },
  };
  const s = map[type] ?? { icon: "🔄", label: type, cls: "bg-gray-50" };
  return (
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${s.cls}`}>
      {s.icon}
    </div>
  );
}

function JobRow({ job }: { job: any }) {
  const [expanded, setExpanded] = useState(false);
  const logs: string[] = job.logs ?? [];
  const duration = job.completedAt
    ? Math.round((new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime()) / 1000)
    : null;

  return (
    <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
      <div className="p-4 flex items-center gap-4">
        <IntegrationIcon type={job.integrationType} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm capitalize">{job.integrationType.replace("_", " ")}</span>
            <StatusBadge status={job.status} />
            <span className="text-xs text-muted-foreground ml-auto hidden sm:block">
              {new Date(job.createdAt).toLocaleString()}
              {duration !== null && ` · ${duration}s`}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span>Total: <b className="text-foreground">{job.totalItems ?? 0}</b></span>
            <span className="text-green-600">✓ {job.successCount ?? 0} imported</span>
            {(job.failedCount ?? 0) > 0 && <span className="text-red-500">✗ {job.failedCount} failed</span>}
            {job.meta?.storeUrl && <span className="truncate max-w-[180px]">{job.meta.storeUrl}</span>}
            {job.meta?.filename && <span className="truncate max-w-[180px]">{job.meta.filename}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              {logs.length} logs
            </button>
          )}
          <span className="text-xs text-muted-foreground font-mono">#{job.id}</span>
        </div>
      </div>

      {expanded && logs.length > 0 && (
        <div className="border-t border-border bg-muted/30 p-3 max-h-48 overflow-y-auto">
          {logs.map((log, i) => {
            const isError = log.toLowerCase().includes("error") || log.toLowerCase().includes("failed");
            const isSuccess = log.toLowerCase().includes("complete") || log.toLowerCase().includes("imported");
            return (
              <div key={i} className={`flex items-start gap-2 text-xs py-0.5 font-mono ${isError ? "text-red-600" : isSuccess ? "text-green-600" : "text-muted-foreground"}`}>
                <span className="text-muted-foreground/50 select-none">{String(i + 1).padStart(2, "0")}</span>
                {log}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SyncJobsPage() {
  const { data: jobs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["/api/sync-jobs"],
    queryFn: fetchJobs,
    refetchInterval: 5000,
  });

  const pending = (jobs ?? []).filter((j: any) => j.status === "running" || j.status === "pending").length;
  const completed = (jobs ?? []).filter((j: any) => j.status === "completed").length;
  const failed = (jobs ?? []).filter((j: any) => j.status === "failed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sync Jobs</h1>
          <p className="text-muted-foreground text-sm mt-1">Background import jobs from Shopify, WooCommerce, and CSV uploads</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Jobs", value: jobs?.length ?? 0, icon: <Package className="w-4 h-4" />, cls: "text-foreground" },
          { label: "Running", value: pending, icon: <Loader2 className="w-4 h-4 animate-spin" />, cls: "text-blue-600" },
          { label: "Completed", value: completed, icon: <CheckCircle2 className="w-4 h-4" />, cls: "text-green-600" },
          { label: "Failed", value: failed, icon: <XCircle className="w-4 h-4" />, cls: "text-red-500" },
        ].map(stat => (
          <div key={stat.label} className="border rounded-xl bg-card p-4 shadow-sm">
            <div className={`flex items-center gap-2 ${stat.cls} mb-1`}>
              {stat.icon}
              <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
            </div>
            <div className={`text-2xl font-bold ${stat.cls}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Auto-refresh notice */}
      {pending > 0 && (
        <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
          {pending} job{pending > 1 ? "s" : ""} running — page auto-refreshes every 5 seconds
        </div>
      )}

      {/* Jobs List */}
      <div className="space-y-3">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="border rounded-xl bg-card p-4 flex items-center gap-4">
              <Skeleton className="w-9 h-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          ))
        ) : jobs?.length > 0 ? (
          jobs.map((job: any) => <JobRow key={job.id} job={job} />)
        ) : (
          <div className="border rounded-xl bg-card p-12 text-center text-muted-foreground">
            <RefreshCw className="w-10 h-10 opacity-20 mx-auto mb-3" />
            <p className="font-semibold">No sync jobs yet</p>
            <p className="text-sm mt-1">Jobs appear here when you import products or trigger a sync from the Integrations page.</p>
          </div>
        )}
      </div>
    </div>
  );
}
