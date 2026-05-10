import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Search, RefreshCw, User, Clock, Globe, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const authH = () => ({ Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}` });
const apiFetch = (url: string) => fetch(url, { headers: authH() }).then(r => r.json());

const ACTION_COLOR: Record<string, string> = {
  "user.create":      "bg-green-100 text-green-800 border-green-200",
  "user.update":      "bg-blue-100 text-blue-800 border-blue-200",
  "user.delete":      "bg-red-100 text-red-800 border-red-200",
  "user.login_as":    "bg-purple-100 text-purple-800 border-purple-200",
  "role.create":      "bg-green-100 text-green-800 border-green-200",
  "role.update":      "bg-blue-100 text-blue-800 border-blue-200",
  "role.delete":      "bg-red-100 text-red-800 border-red-200",
  "profile.update":   "bg-slate-100 text-slate-800 border-slate-200",
  "system.seed":      "bg-orange-100 text-orange-800 border-orange-200",
};
const getActionColor = (a: string) => ACTION_COLOR[a] ?? "bg-gray-100 text-gray-800 border-gray-200";

function LogRow({ log }: { log: any }) {
  const [open, setOpen] = useState(false);
  const hasData = log.oldData || log.newData || log.details;
  return (
    <div className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{log.userName ?? "System"}</span>
            <span className="text-xs text-muted-foreground">{log.userEmail}</span>
            <Badge className={`text-[10px] px-1.5 py-0 border ${getActionColor(log.action)}`}>{log.action}</Badge>
            {log.resource && <span className="text-xs text-muted-foreground">on {log.resource}</span>}
            {log.resourceId && <span className="text-xs font-mono text-muted-foreground">#{log.resourceId}</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(log.createdAt).toLocaleString()}</span>
            {log.ipAddress && <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{log.ipAddress}</span>}
          </div>
        </div>
        {hasData && (
          <button onClick={() => setOpen(v => !v)} className="text-muted-foreground hover:text-foreground p-1 shrink-0">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>
      {open && hasData && (
        <div className="px-4 pb-3 ml-11 space-y-2 text-xs">
          {log.details && <p className="text-muted-foreground">{log.details}</p>}
          {log.oldData && (
            <div className="bg-red-50 border border-red-200 rounded p-2">
              <p className="font-semibold text-red-700 mb-1">Before</p>
              <pre className="text-red-600 whitespace-pre-wrap">{JSON.stringify(log.oldData, null, 2)}</pre>
            </div>
          )}
          {log.newData && (
            <div className="bg-green-50 border border-green-200 rounded p-2">
              <p className="font-semibold text-green-700 mb-1">After</p>
              <pre className="text-green-600 whitespace-pre-wrap">{JSON.stringify(log.newData, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ActivityLogsPage() {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["/api/admin/iam/activity-logs", search, offset],
    queryFn: () => apiFetch(`/api/admin/iam/activity-logs?limit=${limit}&offset=${offset}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  });

  const logs  = data?.logs  ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / limit);
  const page  = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" /> Activity Logs
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Full audit trail of all admin actions</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search actions..."
          value={search}
          onChange={e => { setSearch(e.target.value); setOffset(0); }}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Events", value: total },
          { label: "This Page", value: logs.length },
          { label: "Current Page", value: `${page} / ${pages || 1}` },
          { label: "Per Page", value: limit },
        ].map(s => (
          <Card key={s.label} className="py-3">
            <CardContent className="px-4 py-0">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Logs table */}
      <Card>
        <CardHeader className="pb-0 border-b">
          <CardTitle className="text-base">Audit Trail</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-muted-foreground text-sm">Loading logs…</div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">No activity logs yet</div>
          ) : (
            <div>{logs.map((log: any) => <LogRow key={log.id} log={log} />)}</div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
