import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
async function apiFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Zap, Settings, FileText, BookOpen, RefreshCw, Trash2, Upload, CheckCircle2,
  XCircle, Clock, AlertTriangle, Send, Globe, Package, Tag, BarChart2,
  ChevronDown, ChevronUp, Copy, ExternalLink, Info, Shield, Key, Database,
  Layers, Activity, TrendingUp, Wifi, WifiOff, FolderOpen, RotateCcw, Wrench, Link2,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */
interface IndexingSettings {
  siteUrl?: string;
  autoIndexEnabled: boolean;
  hasCredentials: boolean;
  clientEmail?: string;
  dailyQuotaUsed: number;
  quotaResetDate?: string;
  queueLength: number;
}

interface IndexingLog {
  id: number;
  url: string;
  contentType: string;
  action: string;
  status: string;
  googleResponse?: string;
  errorMessage?: string;
  triggeredBy: string;
  createdAt: string;
}

interface Stats {
  total: number;
  success: number;
  failed: number;
  pending: number;
  rateLimited: number;
  successRate: number;
  failedRate: number;
  dailyQuotaUsed: number;
  dailyQuotaLimit: number;
  quotaResetDate?: string;
  queueLength: number;
}

const DEFAULT_SITE = "https://khanbabadryfruits.com";

/** Display / open link — ensures https:// for browser and Google. */
function displayHttpsUrl(url: string, siteBase = DEFAULT_SITE): string {
  const u = url.trim();
  if (!u) return siteBase;
  if (/^https:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("/")) return `${siteBase.replace(/\/$/, "")}${u}`;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i.test(u.split("/")[0] ?? "")) return `https://${u.replace(/^\/+/, "")}`;
  return `${siteBase.replace(/\/$/, "")}/${u.replace(/^\/+/, "")}`;
}

function previewNormalizeUrl(input: string, siteBase?: string): string | null {
  const base = (siteBase || DEFAULT_SITE).replace(/\/$/, "");
  const raw = input.trim();
  if (!raw) return null;
  try {
    return displayHttpsUrl(raw, base);
  } catch {
    return null;
  }
}

/* ─── Status helpers ─────────────────────────────────── */
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  success:      { label: "Success",      color: "bg-green-100 text-green-700 border-green-200",   icon: <CheckCircle2 className="w-3 h-3" /> },
  failed:       { label: "Failed",       color: "bg-red-100 text-red-700 border-red-200",         icon: <XCircle className="w-3 h-3" /> },
  pending:      { label: "Pending",      color: "bg-yellow-100 text-yellow-700 border-yellow-200",icon: <Clock className="w-3 h-3" /> },
  rate_limited: { label: "Rate Limited", color: "bg-orange-100 text-orange-700 border-orange-200",icon: <AlertTriangle className="w-3 h-3" /> },
  skipped:      { label: "Skipped",      color: "bg-gray-100 text-gray-600 border-gray-200",      icon: <Info className="w-3 h-3" /> },
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  product:  <Package className="w-3 h-3 text-blue-500" />,
  category: <Tag className="w-3 h-3 text-purple-500" />,
  blog:     <FileText className="w-3 h-3 text-green-500" />,
  page:     <Globe className="w-3 h-3 text-slate-500" />,
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-slate-100 text-slate-600 border-slate-200", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

/* ─── Tabs ───────────────────────────────────────────── */
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: <BarChart2 className="w-4 h-4" /> },
  { id: "settings",  label: "Settings",  icon: <Settings className="w-4 h-4" /> },
  { id: "submit",    label: "Submit URLs",icon: <Send className="w-4 h-4" /> },
  { id: "logs",      label: "Logs",       icon: <FileText className="w-4 h-4" /> },
  { id: "docs",      label: "Setup Guide",icon: <BookOpen className="w-4 h-4" /> },
] as const;

type TabId = typeof TABS[number]["id"];

/* ─── Main Page ──────────────────────────────────────── */
export default function GoogleIndexingPage() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery<IndexingSettings>({
    queryKey: ["/api/admin/seo/indexing/settings"],
    queryFn: () => apiFetch("/api/admin/seo/indexing/settings"),
    refetchInterval: 10000,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/admin/seo/indexing/stats"],
    queryFn: () => apiFetch("/api/admin/seo/indexing/stats"),
    refetchInterval: 8000,
  });

  const [logStatusFilter, setLogStatusFilter] = useState("all");

  const { data: logsData, isLoading: logsLoading } = useQuery<{ logs: IndexingLog[]; total: number }>({
    queryKey: ["/api/admin/seo/indexing/logs", logStatusFilter],
    queryFn: () => {
      const q = logStatusFilter === "all" ? "" : `&status=${logStatusFilter}`;
      return apiFetch(`/api/admin/seo/indexing/logs?limit=100${q}`);
    },
    refetchInterval: 8000,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/seo/indexing/settings"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/seo/indexing/stats"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/seo/indexing/logs"] });
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Google Fast Indexing</h1>
              <p className="text-xs text-muted-foreground">Automatic URL submission to Google Search</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {settings?.hasCredentials && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] font-semibold">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
            </Badge>
          )}
          {settings?.autoIndexEnabled && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-semibold">
              <Activity className="w-3 h-3 mr-1" /> Auto-Index ON
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={refreshAll} className="h-8 text-xs gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === t.id
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "dashboard" && <DashboardTab stats={stats} settings={settings} />}
      {activeTab === "settings"  && <SettingsTab settings={settings} onSaved={refreshAll} />}
      {activeTab === "submit"    && <SubmitTab settings={settings} onDone={refreshAll} />}
      {activeTab === "logs"      && (
        <LogsTab
          logs={logsData?.logs ?? []}
          total={logsData?.total ?? 0}
          loading={logsLoading}
          filter={logStatusFilter}
          onFilterChange={setLogStatusFilter}
          siteUrl={settings?.siteUrl}
          onRefresh={refreshAll}
        />
      )}
      {activeTab === "docs"      && <DocsTab />}
    </div>
  );
}

/* ═══ Dashboard Tab ══════════════════════════════════════ */
function DashboardTab({ stats, settings }: { stats?: Stats; settings?: IndexingSettings }) {
  const quotaPct = stats ? Math.round((stats.dailyQuotaUsed / stats.dailyQuotaLimit) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Status warning */}
      {!settings?.hasCredentials && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Service Account Not Configured</p>
            <p className="text-amber-700 mt-0.5">Go to the <strong>Settings</strong> tab to upload your Google Service Account JSON key.</p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Submitted", value: stats?.total ?? 0, icon: <Globe className="w-4 h-4 text-blue-500" />, bg: "bg-blue-50" },
          { label: "Successful",      value: stats?.success ?? 0, icon: <CheckCircle2 className="w-4 h-4 text-green-500" />, bg: "bg-green-50" },
          { label: "Failed",          value: stats?.failed ?? 0,  icon: <XCircle className="w-4 h-4 text-red-500" />, bg: "bg-red-50" },
          { label: "In Queue",        value: stats?.queueLength ?? 0, icon: <Clock className="w-4 h-4 text-yellow-500" />, bg: "bg-yellow-50" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border border-border rounded-xl p-4`}>
            <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-muted-foreground font-medium">{s.label}</span></div>
            <p className="text-2xl font-bold text-foreground">{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {(stats?.total ?? 0) > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs text-green-700 font-medium mb-1">Success rate</p>
            <p className="text-2xl font-bold text-green-800">{stats?.successRate ?? 0}%</p>
            <p className="text-[10px] text-green-600 mt-1">{stats?.success ?? 0} of {stats?.total ?? 0} submissions</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-xs text-red-700 font-medium mb-1">Failed rate</p>
            <p className="text-2xl font-bold text-red-800">{stats?.failedRate ?? 0}%</p>
            <p className="text-[10px] text-red-600 mt-1">{stats?.failed ?? 0} failed — repair in Logs tab</p>
          </div>
        </div>
      )}

      {/* Daily quota */}
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <TrendingUp className="w-4 h-4 text-violet-500" /> Daily Quota
          </div>
          <span className="text-xs text-muted-foreground">Resets: {stats?.quotaResetDate ?? "Today"}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all ${quotaPct > 80 ? "bg-red-500" : quotaPct > 50 ? "bg-amber-500" : "bg-green-500"}`}
              style={{ width: `${Math.min(100, quotaPct)}%` }}
            />
          </div>
          <span className="text-sm font-bold text-foreground">{stats?.dailyQuotaUsed ?? 0}/{stats?.dailyQuotaLimit ?? 180}</span>
        </div>
        <p className="text-xs text-muted-foreground">Google allows 200 requests/day. 20 requests reserved as buffer.</p>
      </div>

      {/* Quick info */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-card border rounded-xl p-4 space-y-2 text-sm">
          <p className="font-semibold flex items-center gap-2"><Shield className="w-4 h-4 text-green-500" /> Credential Status</p>
          {settings?.hasCredentials ? (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>✅ Service account connected</p>
              {settings.clientEmail && <p className="font-mono bg-muted rounded px-2 py-1">{settings.clientEmail}</p>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">❌ No service account uploaded. See <strong>Settings</strong> tab.</p>
          )}
        </div>
        <div className="bg-card border rounded-xl p-4 space-y-2 text-sm">
          <p className="font-semibold flex items-center gap-2"><Globe className="w-4 h-4 text-blue-500" /> Site Configuration</p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Site URL: <strong className="text-foreground">{settings?.siteUrl || "Not set"}</strong></p>
            <p>Auto-Index: <strong className={settings?.autoIndexEnabled ? "text-green-600" : "text-red-500"}>{settings?.autoIndexEnabled ? "Enabled" : "Disabled"}</strong></p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ Settings Tab ═══════════════════════════════════════ */
interface TestResult { ok: boolean; clientEmail?: string; projectId?: string; tokenPreview?: string; error?: string; }

function SettingsTab({ settings, onSaved }: { settings?: IndexingSettings; onSaved: () => void }) {
  const [siteUrl, setSiteUrl]     = useState(settings?.siteUrl ?? "");
  const [autoIndex, setAutoIndex] = useState(settings?.autoIndexEnabled ?? false);
  const [saJson, setSaJson]       = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (settings) {
      setSiteUrl(settings.siteUrl ?? "");
      setAutoIndex(settings.autoIndexEnabled);
    }
  }, [settings?.siteUrl, settings?.autoIndexEnabled]);

  /* ── read JSON file helper ── */
  const loadFile = (file: File) => {
    if (!file.name.endsWith(".json")) { toast({ variant: "destructive", title: "Please select a .json file" }); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      try {
        JSON.parse(text); // validate JSON
        setSaJson(text);
        setTestResult(null);
        toast({ title: "✅ JSON file loaded — review and save" });
      } catch {
        toast({ variant: "destructive", title: "Invalid JSON file" });
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  /* ── mutations ── */
  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/admin/seo/indexing/settings", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/seo/indexing/settings"] });
      onSaved(); setSaJson(""); setTestResult(null);
      toast({ title: "✅ Settings saved" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "Save failed" }),
  });

  const testMutation = useMutation({
    mutationFn: () => apiFetch("/api/admin/seo/indexing/test-connection", {
      method: "POST",
      body: JSON.stringify(saJson.trim() ? { serviceAccountJson: saJson.trim() } : {}),
    }),
    onSuccess: (r: TestResult) => setTestResult(r),
    onError: (e: any) => setTestResult({ ok: false, error: e.message }),
  });

  const removeCreds = useMutation({
    mutationFn: () => apiFetch("/api/admin/seo/indexing/credentials", { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/seo/indexing/settings"] }); onSaved(); setSaJson(""); setTestResult(null); toast({ title: "Credentials removed" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const handleSave = () => {
    const body: Record<string, unknown> = { siteUrl, autoIndexEnabled: autoIndex };
    if (saJson.trim()) body.serviceAccountJson = saJson.trim();
    saveMutation.mutate(body);
  };

  const jsonPlaceholder = `{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\\n...\\n-----END RSA PRIVATE KEY-----\\n",
  "client_email": "kdf-indexing@your-project.iam.gserviceaccount.com",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}`;

  return (
    <div className="space-y-5">

      {/* ── Service Account Credentials ── */}
      <Card className="border-2 border-violet-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="w-4 h-4 text-violet-500" /> Google Service Account Credentials
          </CardTitle>
          <CardDescription className="text-xs">
            Upload the <code className="bg-muted px-1 rounded">service-account.json</code> file downloaded from Google Cloud Console
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Current credential status */}
          {settings?.hasCredentials ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-green-700 font-bold">
                  <CheckCircle2 className="w-4 h-4" /> Service Account Connected
                </div>
                <Button
                  variant="outline" size="sm"
                  className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                  onClick={() => removeCreds.mutate()}
                  disabled={removeCreds.isPending}
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </Button>
              </div>
              {settings.clientEmail && (
                <p className="font-mono bg-white/80 border border-green-100 rounded px-2 py-1 text-green-800 break-all">{settings.clientEmail}</p>
              )}
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> No credentials configured</p>
              <p className="mt-1">Upload your <strong>service-account.json</strong> below, then click <strong>Test Connection</strong> before saving.</p>
            </div>
          )}

          {/* ── File upload zone ── */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer ${
              isDragging ? "border-violet-400 bg-violet-50" : "border-border hover:border-violet-300 hover:bg-violet-50/30"
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                <FolderOpen className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {isDragging ? "Drop JSON file here" : "Click to upload or drag & drop"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">service-account.json from Google Cloud Console</p>
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 mt-1 pointer-events-none">
                <Upload className="w-3.5 h-3.5" /> Browse File
              </Button>
            </div>
          </div>

          {/* ── OR paste JSON ── */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">or paste JSON directly</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <Textarea
              placeholder={jsonPlaceholder}
              value={saJson}
              onChange={e => { setSaJson(e.target.value); setTestResult(null); }}
              className="font-mono text-xs h-44 resize-y"
            />
            {saJson.trim() && (
              <p className="text-[10px] text-green-600 font-medium">✅ JSON loaded ({saJson.length.toLocaleString()} chars) — test connection before saving</p>
            )}
          </div>

          {/* ── Test Connection ── */}
          <div className="space-y-2">
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || (!saJson.trim() && !settings?.hasCredentials)}
              className="gap-2 w-full sm:w-auto"
            >
              {testMutation.isPending
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Testing…</>
                : <><Wifi className="w-4 h-4" /> Test Google Connection</>}
            </Button>

            {testResult && (
              <div className={`rounded-xl border p-3 text-xs space-y-1.5 ${testResult.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                {testResult.ok ? (
                  <>
                    <p className="font-bold text-green-700 flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5" /> Connection Successful ✅</p>
                    {testResult.clientEmail && <p className="text-green-700">Account: <span className="font-mono bg-white/60 px-1 rounded">{testResult.clientEmail}</span></p>}
                    {testResult.projectId && <p className="text-green-700">Project: <span className="font-mono bg-white/60 px-1 rounded">{testResult.projectId}</span></p>}
                    {testResult.tokenPreview && <p className="text-green-600">OAuth Token: <span className="font-mono">{testResult.tokenPreview}</span></p>}
                    <p className="text-green-600 font-medium">Google Indexing API is ready to use!</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-red-700 flex items-center gap-1.5"><WifiOff className="w-3.5 h-3.5" /> Connection Failed ❌</p>
                    <p className="text-red-600 font-mono bg-red-100/60 rounded px-2 py-1">{testResult.error}</p>
                    <p className="text-red-600">Check: correct JSON file, Indexing API enabled, service account added to Search Console</p>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Site URL ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4 text-blue-500" /> Site URL</CardTitle>
          <CardDescription className="text-xs">Your storefront's public domain (used to build full indexing URLs)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Site URL</Label>
            <Input
              placeholder="https://khanbabadryfruits.com"
              value={siteUrl}
              onChange={e => setSiteUrl(e.target.value)}
              className="text-sm font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Always use <strong>https://</strong> — bare domains are auto-corrected on save.
            </p>
            <p className="text-[10px] text-muted-foreground">
              Products: <code className="bg-muted px-1 rounded">{displayHttpsUrl("", siteUrl || DEFAULT_SITE)}/products/slug</code>
              {" · "}Blog: <code className="bg-muted px-1 rounded">{siteUrl || "https://yourstore.com"}/blog/slug</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Auto-Indexing ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-green-500" /> Auto-Indexing</CardTitle>
          <CardDescription className="text-xs">Automatically notify Google when products, categories, or blog posts are created/updated</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Enable Auto-Indexing</p>
              <p className="text-xs text-muted-foreground">
                Covers: Products, Categories, Blog Posts · Max 180 requests/day · 1 req/sec queue
              </p>
            </div>
            <Switch checked={autoIndex} onCheckedChange={setAutoIndex} />
          </div>
        </CardContent>
      </Card>

      {/* ── Save button ── */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
          {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Save Settings
        </Button>
        <p className="text-xs text-muted-foreground">Test connection first, then save.</p>
      </div>
    </div>
  );
}

/* ═══ Submit Tab ═════════════════════════════════════════ */
function SubmitTab({ settings, onDone }: { settings?: IndexingSettings; onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [contentType, setContentType] = useState("page");
  const [action, setAction] = useState("URL_UPDATED");
  const { toast } = useToast();
  const normalizedPreview = previewNormalizeUrl(url, settings?.siteUrl);

  const submitMutation = useMutation({
    mutationFn: () => apiFetch("/api/admin/seo/indexing/submit", {
      method: "POST",
      body: JSON.stringify({ url: normalizedPreview ?? url, contentType, action }),
    }),
    onSuccess: (d: { url?: string; normalized?: boolean }) => {
      onDone();
      setUrl("");
      toast({
        title: "✅ URL queued for indexing",
        description: d.normalized ? "URL was normalized to https://" : undefined,
      });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "Submit failed" }),
  });

  const bulkMutation = useMutation({
    mutationFn: (type: string) => apiFetch("/api/admin/seo/indexing/bulk", { method: "POST", body: JSON.stringify({ type }) }),
    onSuccess: (d: any) => { onDone(); toast({ title: `✅ ${d.queued} URLs queued`, description: d.message }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "Bulk submit failed" }),
  });

  const notConfigured = !settings?.hasCredentials || !settings?.siteUrl;

  return (
    <div className="space-y-5">
      {/* Single URL */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Send className="w-4 h-4 text-blue-500" /> Submit Single URL</CardTitle>
          <CardDescription className="text-xs">Manually request Google to index or update a specific URL</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Full URL</Label>
            <Input
              placeholder="https://khanbabadryfruits.com/products/product-slug"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="text-sm font-mono"
            />
            {url.trim() && (
              <div className={`flex items-start gap-2 text-[10px] rounded-lg border p-2 ${normalizedPreview ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                <Link2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {normalizedPreview ? (
                  <span>Will submit: <span className="font-mono font-semibold break-all">{normalizedPreview}</span></span>
                ) : (
                  <span>Could not normalize URL — include domain or full https:// path</span>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Content Type</Label>
              <select
                value={contentType}
                onChange={e => setContentType(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
              >
                <option value="product">Product</option>
                <option value="category">Category</option>
                <option value="blog">Blog Post</option>
                <option value="page">Page</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Action</Label>
              <select
                value={action}
                onChange={e => setAction(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
              >
                <option value="URL_UPDATED">URL Updated (Publish/Update)</option>
                <option value="URL_DELETED">URL Deleted (Remove)</option>
              </select>
            </div>
          </div>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !normalizedPreview || !settings?.hasCredentials}
            className="gap-2"
          >
            {submitMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Request Indexing
          </Button>
          {!settings?.hasCredentials && (
            <p className="text-xs text-amber-600">⚠️ Configure service account credentials in Settings first</p>
          )}
        </CardContent>
      </Card>

      {/* Bulk submit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-violet-500" /> Bulk Submit</CardTitle>
          <CardDescription className="text-xs">Submit all URLs of a content type at once. Max 200 products, 100 categories, 200 blog posts.</CardDescription>
        </CardHeader>
        <CardContent>
          {notConfigured && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-3">
              ⚠️ Configure service account <strong>and</strong> site URL in Settings before bulk submit.
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {[
              { type: "products",   label: "All Products",   icon: <Package className="w-4 h-4 text-blue-500" /> },
              { type: "categories", label: "All Categories", icon: <Tag className="w-4 h-4 text-purple-500" /> },
              { type: "blogs",      label: "All Blog Posts", icon: <FileText className="w-4 h-4 text-green-500" /> },
              { type: "all",        label: "Submit All",     icon: <Zap className="w-4 h-4 text-amber-500" /> },
            ].map(b => (
              <button
                key={b.type}
                onClick={() => bulkMutation.mutate(b.type)}
                disabled={bulkMutation.isPending || notConfigured}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {b.icon}
                <span className="text-xs font-semibold text-center">{b.label}</span>
                {bulkMutation.isPending && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══ Logs Tab ═══════════════════════════════════════════ */
function LogsTab({
  logs,
  total,
  loading,
  filter,
  onFilterChange,
  siteUrl,
  onRefresh,
}: {
  logs: IndexingLog[];
  total: number;
  loading: boolean;
  filter: string;
  onFilterChange: (s: string) => void;
  siteUrl?: string;
  onRefresh: () => void;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { toast } = useToast();
  const base = siteUrl || DEFAULT_SITE;

  const clearMutation = useMutation({
    mutationFn: () => apiFetch("/api/admin/seo/indexing/logs", { method: "DELETE" }),
    onSuccess: () => { onRefresh(); toast({ title: "Logs cleared" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const repairMutation = useMutation({
    mutationFn: () => apiFetch("/api/admin/seo/indexing/repair-urls", {
      method: "POST",
      body: JSON.stringify({ requeueFailed: true }),
    }),
    onSuccess: (d: { message?: string }) => {
      onRefresh();
      toast({ title: "URLs repaired", description: d.message });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const retryAllMutation = useMutation({
    mutationFn: () => apiFetch("/api/admin/seo/indexing/retry-failed", { method: "POST", body: "{}" }),
    onSuccess: (d: { message?: string }) => {
      onRefresh();
      toast({ title: "Retry queued", description: d.message });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const retryOneMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/seo/indexing/retry/${id}`, { method: "POST" }),
    onSuccess: () => { onRefresh(); toast({ title: "URL re-queued" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const failedCount = logs.filter(l => l.status === "failed").length;

  return (
    <div className="space-y-4">
      {/* Filter + Clear */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5">
          {["all", "success", "failed", "pending", "rate_limited"].map(s => (
            <button
              key={s}
              onClick={() => onFilterChange(s)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                filter === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : s === "rate_limited" ? "Rate Limited" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{total} total</span>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => repairMutation.mutate()} disabled={repairMutation.isPending}>
            <Wrench className="w-3 h-3" /> Fix URLs
          </Button>
          <Button
            variant="outline" size="sm"
            className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 border-red-200"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending || logs.length === 0}
          >
            <Trash2 className="w-3 h-3" /> Clear All
          </Button>
        </div>
      </div>

      {failedCount > 0 && filter !== "success" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="font-semibold text-amber-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Failed URLs — use Repair to add https:// and re-queue</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => repairMutation.mutate()} disabled={repairMutation.isPending}>
              <Wrench className="w-3 h-3" /> Repair &amp; Re-queue
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1" onClick={() => retryAllMutation.mutate()} disabled={retryAllMutation.isPending}>
              <RotateCcw className="w-3 h-3" /> Retry All Failed
            </Button>
          </div>
        </div>
      )}

      {loading && <div className="text-center py-10 text-muted-foreground text-sm">Loading logs…</div>}

      {!loading && logs.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm">No logs found.</div>
      )}

      {/* Logs list */}
      <div className="space-y-1.5">
        {logs.map(log => {
          const href = displayHttpsUrl(log.url, base);
          const missingHttps = !/^https:\/\//i.test(log.url.trim());
          return (
          <div key={log.id} className="border rounded-xl bg-card overflow-hidden">
            <div
              className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/30"
              onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
            >
              <div className="shrink-0">{TYPE_ICON[log.contentType] ?? <Globe className="w-3 h-3 text-slate-400" />}</div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-mono truncate ${missingHttps ? "text-amber-700" : "text-foreground"}`}>
                  {log.url}
                  {missingHttps && <span className="ml-1.5 text-[9px] font-bold text-amber-600 bg-amber-100 px-1 py-0.5 rounded">needs https://</span>}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <StatusBadge status={log.status} />
                  <span className="text-[10px] text-muted-foreground capitalize">{log.contentType}</span>
                  <span className="text-[10px] text-muted-foreground">•</span>
                  <span className="text-[10px] text-muted-foreground">{log.triggeredBy}</span>
                  <span className="text-[10px] text-muted-foreground">•</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                {log.status === "failed" && log.errorMessage && expandedId !== log.id && (
                  <p className="text-[10px] text-red-600 mt-1 truncate">{log.errorMessage}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {log.status === "failed" && (
                  <button onClick={e => { e.stopPropagation(); retryOneMutation.mutate(log.id); }} className="p-1 text-muted-foreground hover:text-primary" title="Retry" disabled={retryOneMutation.isPending}>
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(href); toast({ title: "Copied" }); }} className="p-1 text-muted-foreground hover:text-foreground" title="Copy canonical URL">
                  <Copy className="w-3 h-3" />
                </button>
                <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1 text-muted-foreground hover:text-blue-600" title="Open URL">
                  <ExternalLink className="w-3 h-3" />
                </a>
                {expandedId === log.id ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
              </div>
            </div>
            {expandedId === log.id && (
              <div className="border-t bg-muted/20 p-3 space-y-2 text-xs">
                <div className="bg-blue-50 border border-blue-100 rounded p-2">
                  <p className="text-[10px] font-semibold text-blue-800">Canonical URL</p>
                  <p className="font-mono text-blue-900 break-all mt-0.5">{href}</p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                  <span className="font-semibold">Action:</span><span className="font-mono">{log.action}</span>
                  <span className="font-semibold">Type:</span><span className="capitalize">{log.contentType}</span>
                  <span className="font-semibold">Triggered by:</span><span className="capitalize">{log.triggeredBy}</span>
                  <span className="font-semibold">Created:</span><span>{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                {log.googleResponse && (
                  <div>
                    <p className="font-semibold text-muted-foreground mb-1">Google Response:</p>
                    <pre className="text-[10px] bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap">{
                      (() => { try { return JSON.stringify(JSON.parse(log.googleResponse!), null, 2); } catch { return log.googleResponse; } })()
                    }</pre>
                  </div>
                )}
                {log.errorMessage && (
                  <div className="bg-red-50 border border-red-100 rounded p-2 text-red-700">{log.errorMessage}</div>
                )}
                {log.status === "failed" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => retryOneMutation.mutate(log.id)} disabled={retryOneMutation.isPending}>
                    <RotateCcw className="w-3 h-3" /> Retry with corrected URL
                  </Button>
                )}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══ Docs Tab ═══════════════════════════════════════════ */
function DocsTab() {
  const [expanded, setExpanded] = useState<number | null>(0);

  const steps = [
    {
      title: "Create a Google Cloud Project",
      icon: <Database className="w-4 h-4 text-blue-500" />,
      content: (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>1. Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">Google Cloud Console ↗</a></p>
          <p>2. Click <strong className="text-foreground">Select a project</strong> → <strong className="text-foreground">New Project</strong></p>
          <p>3. Name it <code className="bg-muted px-1 rounded">kdf-seo-indexing</code> (or any name)</p>
          <p>4. Click <strong className="text-foreground">Create</strong> and wait for it to complete</p>
          <p>5. Make sure your new project is selected in the top dropdown</p>
        </div>
      ),
    },
    {
      title: "Enable the Indexing API",
      icon: <Zap className="w-4 h-4 text-yellow-500" />,
      content: (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>1. In Google Cloud Console, go to <strong className="text-foreground">APIs & Services → Library</strong></p>
          <p>2. Search for <code className="bg-muted px-1 rounded">Web Search Indexing API</code></p>
          <p>3. Click on it and press <strong className="text-foreground">Enable</strong></p>
          <p>4. Wait for the API to be enabled (usually takes 30 seconds)</p>
        </div>
      ),
    },
    {
      title: "Create a Service Account",
      icon: <Shield className="w-4 h-4 text-green-500" />,
      content: (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>1. Go to <strong className="text-foreground">APIs & Services → Credentials</strong></p>
          <p>2. Click <strong className="text-foreground">+ Create Credentials → Service Account</strong></p>
          <p>3. Name: <code className="bg-muted px-1 rounded">kdf-indexing-bot</code></p>
          <p>4. Role: <code className="bg-muted px-1 rounded">Owner</code> (for indexing, this is fine)</p>
          <p>5. Click <strong className="text-foreground">Done</strong></p>
        </div>
      ),
    },
    {
      title: "Download JSON Key",
      icon: <Key className="w-4 h-4 text-violet-500" />,
      content: (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>1. Click on your newly created service account</p>
          <p>2. Go to the <strong className="text-foreground">Keys</strong> tab</p>
          <p>3. Click <strong className="text-foreground">Add Key → Create new key</strong></p>
          <p>4. Choose <strong className="text-foreground">JSON</strong> format</p>
          <p>5. The JSON file will download automatically — keep it safe!</p>
        </div>
      ),
    },
    {
      title: "Add Service Account to Search Console",
      icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
      content: (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>1. Go to <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">Google Search Console ↗</a></p>
          <p>2. Select your property (or add it if not already added)</p>
          <p>3. Go to <strong className="text-foreground">Settings → Users and permissions</strong></p>
          <p>4. Click <strong className="text-foreground">Add User</strong></p>
          <p>5. Enter the service account email from your JSON file (ends with <code className="bg-muted px-1 rounded">@...iam.gserviceaccount.com</code>)</p>
          <p>6. Set permission to <strong className="text-foreground">Owner</strong></p>
          <p>7. Click <strong className="text-foreground">Add</strong></p>
          <p className="text-amber-600 font-semibold">⚠️ This step is REQUIRED — without it, Google will reject indexing requests!</p>
        </div>
      ),
    },
    {
      title: "Upload Credentials to Admin",
      icon: <Upload className="w-4 h-4 text-blue-500" />,
      content: (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>1. Open the downloaded JSON file in a text editor</p>
          <p>2. Copy the entire contents</p>
          <p>3. Go to the <strong className="text-foreground">Settings</strong> tab in this page</p>
          <p>4. Click <strong className="text-foreground">Show</strong> next to "Paste Service Account JSON"</p>
          <p>5. Paste the JSON content</p>
          <p>6. Also set your <strong className="text-foreground">Site URL</strong> (e.g. https://kdfnuts.com)</p>
          <p>7. Enable <strong className="text-foreground">Auto-Indexing</strong> if desired</p>
          <p>8. Click <strong className="text-foreground">Save Settings</strong></p>
        </div>
      ),
    },
    {
      title: "How Automatic Indexing Works",
      icon: <Activity className="w-4 h-4 text-indigo-500" />,
      content: (
        <div className="space-y-3 text-xs text-muted-foreground">
          <div className="space-y-1">
            <p className="font-semibold text-foreground">Automatic triggers:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Create or update a <strong className="text-foreground">Product</strong> → URL auto-submitted</li>
              <li>Create or update a <strong className="text-foreground">Category</strong> → URL auto-submitted</li>
              <li><strong className="text-foreground">Publish</strong> a blog post → URL auto-submitted</li>
            </ul>
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-foreground">Rate limiting & safety:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Max <strong className="text-foreground">180 requests/day</strong> (20 buffer below Google's 200 limit)</li>
              <li><strong className="text-foreground">Queue system</strong>: all requests go through an in-memory queue processed 1/sec</li>
              <li><strong className="text-foreground">Retry</strong>: failed requests retry up to 3 times with exponential backoff</li>
              <li>All submissions logged in the <strong className="text-foreground">Logs</strong> tab</li>
            </ul>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-blue-800">
            <p className="font-semibold">💡 Pro Tip</p>
            <p className="mt-0.5">After initial setup, use <strong>Bulk Submit → Submit All</strong> to index all existing content at once.</p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 flex items-start gap-3 mb-4">
        <Info className="w-5 h-5 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Complete Setup Guide</p>
          <p className="text-xs mt-0.5 text-blue-700">Follow all 7 steps below to get Google Fast Indexing working. Step 5 (Search Console) is the most commonly missed!</p>
        </div>
      </div>

      {steps.map((step, i) => (
        <div key={i} className="border rounded-xl bg-card overflow-hidden">
          <button
            className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">{i + 1}</div>
            <div className="flex items-center gap-2 flex-1">
              {step.icon}
              <span className="text-sm font-semibold">{step.title}</span>
            </div>
            {expanded === i ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {expanded === i && (
            <div className="border-t bg-muted/10 p-4">{step.content}</div>
          )}
        </div>
      ))}
    </div>
  );
}
