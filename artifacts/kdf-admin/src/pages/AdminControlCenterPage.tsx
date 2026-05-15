import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Users, Key, ListChecks, SlidersHorizontal, Activity, Lock,
  Monitor, CheckCircle2, AlertTriangle, Search, RefreshCw, Download,
  ClipboardList, BarChart3, Bell, Crown, Zap, Globe, FileKey, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { PermissionRoute } from "@/components/admin/PermissionRoute";
import { controlFetch } from "@/lib/adminControlApi";
import { apiPublicUrl } from "@/lib/apiBase";
import AdminUsersPage from "@/pages/AdminUsersPage";
import AdminRolesPage from "@/pages/AdminRolesPage";
import ModulesPage from "@/pages/ModulesPage";

type TabId =
  | "overview" | "users" | "roles" | "audit" | "security" | "sessions"
  | "approvals" | "api-keys" | "modules" | "tasks" | "reports";

const TABS: { id: TabId; label: string; icon: typeof Shield; perm?: string; anyOf?: string[] }[] = [
  { id: "overview", label: "Command Center", icon: Shield },
  { id: "users", label: "Admin Users", icon: Users, perm: "users.view" },
  { id: "roles", label: "Roles & Permissions", icon: Key, perm: "roles.view" },
  { id: "audit", label: "Audit Logs", icon: ListChecks, perm: "logs.view" },
  { id: "security", label: "Security", icon: Lock, perm: "security.manage" },
  { id: "sessions", label: "Sessions", icon: Monitor, anyOf: ["users.sessions", "logs.security"] },
  { id: "approvals", label: "Approvals", icon: CheckCircle2, anyOf: ["approvals.manage", "approvals.request"] },
  { id: "api-keys", label: "API Keys", icon: FileKey, perm: "apikeys.manage" },
  { id: "modules", label: "Module Controls", icon: SlidersHorizontal, perm: "modules.manage" },
  { id: "tasks", label: "Team Tasks", icon: ClipboardList, perm: "tasks.manage" },
  { id: "reports", label: "Reports", icon: BarChart3, anyOf: ["reports.sales", "finance.reports", "analytics.view"] },
];

function useTab(): [TabId, (t: TabId) => void] {
  const search = useSearch();
  const [, setLoc] = useLocation();
  const tab = (new URLSearchParams(search).get("tab") as TabId) || "overview";
  const setTab = (t: TabId) => setLoc(`/admin/control-center?tab=${t}`);
  return [tab, setTab];
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: typeof Users; accent: string }) {
  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardContent className="p-4 flex items-center gap-4">
        <motion.div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accent}18`, color: accent }}
          whileHover={{ scale: 1.05 }}
        >
          <Icon className="w-5 h-5" />
        </motion.div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewPanel() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["control-overview"],
    queryFn: () => controlFetch<{ ok: boolean; stats: Record<string, number>; recentActivity: unknown[]; widgets: string[] }>(
      "/api/admin/control-center/overview",
    ),
  });
  const stats = data?.stats ?? { activeUsers: 0, roles: 0, pendingApprovals: 0, unreadAlerts: 0 };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active admins" value={stats.activeUsers ?? 0} icon={Users} accent="#6366f1" />
        <StatCard label="Roles" value={stats.roles ?? 0} icon={Key} accent="#8b5cf6" />
        <StatCard label="Pending approvals" value={stats.pendingApprovals ?? 0} icon={CheckCircle2} accent="#f59e0b" />
        <StatCard label="Unread alerts" value={stats.unreadAlerts ?? 0} icon={Bell} accent="#ef4444" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Recent activity
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto">
            {(data?.recentActivity as { action: string; userName?: string; createdAt: string }[] ?? []).map((log, i) => (
              <div key={i} className="flex items-start gap-2 text-sm py-2 border-b border-border/50 last:border-0">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{log.action}</p>
                  <p className="text-xs text-muted-foreground">{log.userName ?? "System"} · {new Date(log.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {!data?.recentActivity?.length && <p className="text-sm text-muted-foreground py-4 text-center">No recent activity</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" /> Your dashboard widgets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <motion.div className="flex flex-wrap gap-2">
              {(data?.widgets ?? []).map(w => (
                <Badge key={w} variant="secondary" className="font-mono text-xs">{w}</Badge>
              ))}
            </motion.div>
            <p className="text-xs text-muted-foreground mt-4">
              Widgets are configured per role. Edit a role to customize KPIs and modules visible to that team.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AuditPanel() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["control-audit", search],
    queryFn: () => controlFetch<{ logs: Record<string, unknown>[]; total: number }>(
      `/api/admin/control-center/audit-logs?limit=80${search ? `&search=${encodeURIComponent(search)}` : ""}`,
    ),
  });
  const { hasPermission } = useAdminAuth();

  const exportLogs = () => {
    const token = localStorage.getItem("kdf_admin_token");
    fetch(apiPublicUrl("/api/admin/control-center/audit-logs/export"), {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.blob()).then(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `audit-logs-${Date.now()}.json`;
      a.click();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search actions, users, resources…" className="pl-9" />
        </div>
        {hasPermission("logs.export") && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportLogs}>
            <Download className="w-4 h-4" /> Export
          </Button>
        )}
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="p-3 font-medium">Time</th>
                  <th className="p-3 font-medium">User</th>
                  <th className="p-3 font-medium">Action</th>
                  <th className="p-3 font-medium">Resource</th>
                  <th className="p-3 font-medium">IP</th>
                  <th className="p-3 font-medium">Device</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                ) : (data?.logs ?? []).map((log: Record<string, unknown>) => (
                  <tr key={log.id as number} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="p-3 whitespace-nowrap text-xs">{new Date(log.createdAt as string).toLocaleString()}</td>
                    <td className="p-3">{log.userName as string ?? log.userEmail as string ?? "—"}</td>
                    <td className="p-3 font-mono text-xs">{log.action as string}</td>
                    <td className="p-3 text-xs text-muted-foreground">{log.resource as string}{log.resourceId ? ` #${log.resourceId}` : ""}</td>
                    <td className="p-3 text-xs font-mono">{log.ipAddress as string ?? "—"}</td>
                    <td className="p-3 text-xs">{[log.browser, log.os].filter(Boolean).join(" / ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="p-3 text-xs text-muted-foreground border-t">{data?.total ?? 0} total entries</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ["control-security"],
    queryFn: () => controlFetch<{ settings: Record<string, unknown> }>("/api/admin/control-center/security"),
  });
  const [form, setForm] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data?.settings]);

  const save = useMutation({
    mutationFn: () => controlFetch("/api/admin/control-center/security", { method: "PATCH", body: JSON.stringify(form) }),
    onSuccess: () => { toast({ title: "Security settings saved" }); qc.invalidateQueries({ queryKey: ["control-security"] }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Password policy</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Minimum length</label>
            <Input type="number" value={Number(form.passwordMinLength ?? 10)} onChange={e => set("passwordMinLength", parseInt(e.target.value, 10))} />
          </div>
          {[
            ["passwordRequireUpper", "Require uppercase"],
            ["passwordRequireNumber", "Require number"],
            ["passwordRequireSymbol", "Require symbol"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!form[key]} onChange={e => set(key, e.target.checked)} className="rounded" />
              {label}
            </label>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Session & lockout</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Session timeout (minutes)</label>
            <Input type="number" value={Number(form.sessionTimeoutMinutes ?? 480)} onChange={e => set("sessionTimeoutMinutes", parseInt(e.target.value, 10))} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Max failed logins before lock</label>
            <Input type="number" value={Number(form.maxFailedLogins ?? 5)} onChange={e => set("maxFailedLogins", parseInt(e.target.value, 10))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.twoFactorEnabled} onChange={e => set("twoFactorEnabled", e.target.checked)} />
            Require 2FA (enforced on next login when enabled globally)
          </label>
        </CardContent>
      </Card>
      <div className="lg:col-span-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save security settings</Button>
      </div>
    </div>
  );
}

function SessionsPanel() {
  const { data, refetch } = useQuery({
    queryKey: ["control-sessions"],
    queryFn: () => controlFetch<{ sessions: Record<string, unknown>[] }>("/api/admin/control-center/sessions"),
  });
  const qc = useQueryClient();
  const revoke = useMutation({
    mutationFn: (id: number) => controlFetch(`/api/admin/control-center/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["control-sessions"] }); },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row justify-between">
        <CardTitle className="text-base">Active sessions</CardTitle>
        <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5" /></Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {(data?.sessions ?? []).map((s: Record<string, unknown>) => (
          <div key={s.id as number} className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-card">
            <div>
              <p className="text-sm font-medium">{s.browser as string} · {s.os as string}</p>
              <p className="text-xs text-muted-foreground font-mono">{s.ipAddress as string} · Last seen {new Date(s.lastSeenAt as string).toLocaleString()}</p>
            </div>
            {s.isActive === true && (
              <Button size="sm" variant="destructive" onClick={() => revoke.mutate(s.id as number)}>Revoke</Button>
            )}
          </div>
        ))}
        {!data?.sessions?.length && <p className="text-sm text-muted-foreground text-center py-6">No active sessions</p>}
      </CardContent>
    </Card>
  );
}

function ApprovalsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ["control-approvals"],
    queryFn: () => controlFetch<{ approvals: Record<string, unknown>[] }>("/api/admin/control-center/approvals?status=pending"),
  });
  const review = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "approved" | "rejected" }) =>
      controlFetch(`/api/admin/control-center/approvals/${id}/review`, {
        method: "POST", body: JSON.stringify({ status }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["control-approvals"] }); toast({ title: "Review submitted" }); },
  });

  return (
    <div className="space-y-3">
      {(data?.approvals ?? []).map((a: Record<string, unknown>) => (
        <Card key={a.id as number}>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div>
              <Badge variant="outline" className="mb-1">{a.type as string}</Badge>
              <p className="font-medium">{a.title as string}</p>
              <p className="text-xs text-muted-foreground">{new Date(a.createdAt as string).toLocaleString()}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={() => review.mutate({ id: a.id as number, status: "approved" })}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => review.mutate({ id: a.id as number, status: "rejected" })}>Reject</Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {!data?.approvals?.length && <p className="text-center text-muted-foreground py-12">No pending approvals</p>}
    </div>
  );
}

function ApiKeysPanel() {
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ["control-apikeys"],
    queryFn: () => controlFetch<{ keys: Record<string, unknown>[] }>("/api/admin/control-center/api-keys"),
  });
  const create = useMutation({
    mutationFn: () => controlFetch<{ rawKey?: string }>("/api/admin/control-center/api-keys", {
      method: "POST", body: JSON.stringify({ name, scopes: ["read"] }),
    }),
    onSuccess: (d) => {
      toast({ title: "API key created", description: d.rawKey ? "Copy the key now — shown once." : undefined });
      setName(""); qc.invalidateQueries({ queryKey: ["control-apikeys"] });
    },
  });

  return (
    <motion.div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex gap-2">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Key name (e.g. ERP sync)" className="max-w-xs" />
          <Button onClick={() => create.mutate()} disabled={!name.trim()}>Generate key</Button>
        </CardContent>
      </Card>
      {(data?.keys ?? []).map((k: Record<string, unknown>) => (
        <Card key={k.id as number}>
          <CardContent className="p-4 flex justify-between items-center">
            <div>
              <p className="font-medium">{k.name as string}</p>
              <p className="text-xs font-mono text-muted-foreground">{k.keyPrefix as string}…</p>
            </div>
            <Badge variant={k.isActive ? "default" : "secondary"}>{k.isActive ? "Active" : "Revoked"}</Badge>
          </CardContent>
        </Card>
      ))}
    </motion.div>
  );
}

function TasksPanel() {
  const [title, setTitle] = useState("");
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["control-tasks"],
    queryFn: () => controlFetch<{ tasks: Record<string, unknown>[] }>("/api/admin/control-center/tasks"),
  });
  const add = useMutation({
    mutationFn: () => controlFetch("/api/admin/control-center/tasks", { method: "POST", body: JSON.stringify({ title }) }),
    onSuccess: () => { setTitle(""); qc.invalidateQueries({ queryKey: ["control-tasks"] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="New task…" />
        <Button onClick={() => add.mutate()} disabled={!title.trim()}>Add</Button>
      </div>
      {(data?.tasks ?? []).map((t: Record<string, unknown>) => (
        <Card key={t.id as number}><CardContent className="p-3 flex justify-between">
          <span className="font-medium">{t.title as string}</span>
          <Badge variant="outline">{t.status as string}</Badge>
        </CardContent></Card>
      ))}
    </div>
  );
}

function ReportsPanel() {
  const { data } = useQuery({
    queryKey: ["control-reports"],
    queryFn: () => controlFetch<{ reports: { key: string; name: string; module: string }[] }>("/api/admin/control-center/reports/summary"),
  });
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {(data?.reports ?? []).map(r => (
        <Card key={r.key} className="hover:border-primary/40 transition-colors cursor-pointer">
          <CardContent className="p-4">
            <BarChart3 className="w-5 h-5 text-primary mb-2" />
            <p className="font-semibold">{r.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{r.module}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function GlobalSearch({ onPick }: { onPick: (href: string) => void }) {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["control-search", q],
    queryFn: () => controlFetch<{ results: { type: string; label: string; sub: string; href: string }[] }>(
      `/api/admin/control-center/search?q=${encodeURIComponent(q)}`,
    ),
    enabled: q.length >= 2,
  });

  return (
    <div className="relative max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search users, roles, logs…" className="pl-9 h-9" />
      {q.length >= 2 && data?.results?.length ? (
        <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
          {data.results.map((r, i) => (
            <button key={i} className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center gap-2" onClick={() => { onPick(r.href); setQ(""); }}>
              <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
              <span className="truncate">{r.label}</span>
              <ChevronRight className="w-3 h-3 ml-auto shrink-0 opacity-40" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminControlCenterPage() {
  const [tab, setTab] = useTab();
  const { hasPermission, hasAnyPermission, user } = useAdminAuth();
  const { toast } = useToast();
  const [, setLoc] = useLocation();

  const visibleTabs = useMemo(() => TABS.filter(t => {
    if (!t.perm && !t.anyOf) return true;
    if (t.perm) return hasPermission(t.perm);
    if (t.anyOf) return hasAnyPermission(t.anyOf);
    return true;
  }), [hasPermission, hasAnyPermission]);

  const seed = useMutation({
    mutationFn: () => controlFetch("/api/admin/control-center/seed", { method: "POST" }),
    onSuccess: (d: { permissionCount?: number }) => toast({ title: "IAM seeded", description: `${d.permissionCount ?? ""} permissions` }),
    onError: (e: Error) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  return (
    <PermissionRoute anyOf={["users.view", "roles.view", "logs.view", "modules.manage", "security.manage"]}>
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
        {/* Hero header */}
        <div className="border-b border-border/60 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="px-4 md:px-6 py-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight">Enterprise Control Center</h1>
                  <p className="text-xs text-muted-foreground">
                    RBAC · Audit · Security · Approvals · {user?.roles?.[0]?.name ?? "Admin"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {hasPermission("search.global") && (
                  <GlobalSearch onPick={href => setLoc(href.includes("control-center") ? href : `/admin/control-center?tab=users`)} />
                )}
                {hasPermission("roles.manage") && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => seed.mutate()} disabled={seed.isPending}>
                    <RefreshCw className={`w-3.5 h-3.5 ${seed.isPending ? "animate-spin" : ""}`} /> Sync permissions
                  </Button>
                )}
              </div>
            </div>

            {/* Tab strip */}
            <div className="flex gap-1 mt-4 overflow-x-auto pb-1 scrollbar-none">
              {visibleTabs.map(t => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-4 md:px-6 py-6 max-w-[1600px] mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
            >
              {tab === "overview" && <OverviewPanel />}
              {tab === "users" && <PermissionRoute permission="users.view"><AdminUsersPage /></PermissionRoute>}
              {tab === "roles" && <PermissionRoute permission="roles.view"><AdminRolesPage /></PermissionRoute>}
              {tab === "audit" && <PermissionRoute permission="logs.view"><AuditPanel /></PermissionRoute>}
              {tab === "security" && <PermissionRoute permission="security.manage"><SecurityPanel /></PermissionRoute>}
              {tab === "sessions" && <PermissionRoute anyOf={["users.sessions", "logs.security"]}><SessionsPanel /></PermissionRoute>}
              {tab === "approvals" && <PermissionRoute anyOf={["approvals.manage", "approvals.request"]}><ApprovalsPanel /></PermissionRoute>}
              {tab === "api-keys" && <PermissionRoute permission="apikeys.manage"><ApiKeysPanel /></PermissionRoute>}
              {tab === "modules" && <PermissionRoute permission="modules.manage"><ModulesPage /></PermissionRoute>}
              {tab === "tasks" && <PermissionRoute permission="tasks.manage"><TasksPanel /></PermissionRoute>}
              {tab === "reports" && <PermissionRoute anyOf={["reports.sales", "finance.reports", "analytics.view"]}><ReportsPanel /></PermissionRoute>}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </PermissionRoute>
  );
}
