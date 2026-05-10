import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingBag, Settings, RefreshCw, Copy, CheckCircle2, AlertTriangle,
  ExternalLink, Zap, BarChart2, Globe, Tag, Package, Eye, Info,
  ChevronRight, Database, Wifi, WifiOff, Clock, TrendingUp, List,
  FileText, Code2, Link2, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authH = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authH(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

/* ── Feed URL builder ── */
function getFeedUrls() {
  const base = window.location.origin;
  return {
    googleXml: `${base}/api/feeds/google-merchant.xml`,
    facebookJson: `${base}/api/feeds/facebook-catalog.json`,
    metaJson: `${base}/api/feeds/meta-commerce.json`,
  };
}

/* ── Copy helper ── */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <button onClick={copy} className="ml-2 p-1 rounded hover:bg-white/10 transition-colors" title="Copy">
      {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
    </button>
  );
}

/* ── Feed URL Row ── */
function FeedRow({ label, url, badge, badgeColor }: { label: string; url: string; badge: string; badgeColor: string }) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Badge className={`text-xs font-bold ${badgeColor}`}>{badge}</Badge>
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      <div className="flex items-center gap-2 bg-slate-900/60 rounded px-3 py-2">
        <code className="text-xs text-emerald-300 flex-1 truncate">{url}</code>
        <CopyBtn text={url} />
        <a href={url} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-white/10">
          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
        </a>
      </div>
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-lg font-bold text-white">{value ?? "—"}</p>
      </div>
    </div>
  );
}

/* ── Setup Step ── */
function SetupStep({ n, title, desc, done }: { n: number; title: string; desc: string; done?: boolean }) {
  return (
    <div className="flex gap-4 p-4 rounded-lg border border-slate-700/40 bg-slate-800/30">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${done ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-300"}`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : n}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════ */
export default function GoogleMerchantPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const feedUrls = getFeedUrls();

  /* ── Queries ── */
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ["merchant-settings"],
    queryFn: () => apiFetch("/api/admin/merchant/settings"),
    refetchInterval: 30000,
  });

  const { data: statsData } = useQuery({
    queryKey: ["merchant-stats"],
    queryFn: () => apiFetch("/api/admin/merchant/stats"),
    refetchInterval: 60000,
  });

  const { data: healthData } = useQuery({
    queryKey: ["merchant-health"],
    queryFn: () => apiFetch("/api/admin/merchant/feed-health"),
    refetchInterval: 60000,
  });

  const { data: logsData } = useQuery({
    queryKey: ["merchant-logs"],
    queryFn: () => apiFetch("/api/admin/merchant/sync-logs"),
    refetchInterval: 30000,
  });

  /* ── Local form state ── */
  const [form, setForm] = useState({
    merchantId: "", storeName: "KDF NUTS", storeUrl: "", currency: "PKR",
    country: "PK", brand: "KDF NUTS", productCategory: "Food, Beverages & Tobacco > Food Items > Nuts & Seeds",
    gaTrackingId: "", gtmContainerId: "", searchConsoleUrl: "",
    autoSyncEnabled: false, feedEnabled: true,
    feedSettings: { includeOutOfStock: false, includeVariants: true, minPrice: 0, maxProducts: 1000 },
  });

  useEffect(() => {
    if (settingsData) {
      setForm(prev => ({
        ...prev,
        merchantId: settingsData.merchantId ?? "",
        storeName: settingsData.storeName ?? "KDF NUTS",
        storeUrl: settingsData.storeUrl ?? "",
        currency: settingsData.currency ?? "PKR",
        country: settingsData.country ?? "PK",
        brand: settingsData.brand ?? "KDF NUTS",
        productCategory: settingsData.productCategory ?? "Food, Beverages & Tobacco > Food Items > Nuts & Seeds",
        gaTrackingId: settingsData.gaTrackingId ?? "",
        gtmContainerId: settingsData.gtmContainerId ?? "",
        searchConsoleUrl: settingsData.searchConsoleUrl ?? "",
        autoSyncEnabled: settingsData.autoSyncEnabled ?? false,
        feedEnabled: settingsData.feedEnabled ?? true,
        feedSettings: settingsData.feedSettings ?? prev.feedSettings,
      }));
    }
  }, [settingsData]);

  /* ── Mutations ── */
  const saveMut = useMutation({
    mutationFn: (body: typeof form) => apiFetch("/api/admin/merchant/settings", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["merchant-settings"] }); toast({ title: "Settings saved" }); },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const syncMut = useMutation({
    mutationFn: () => apiFetch("/api/admin/merchant/sync", { method: "POST" }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["merchant-settings", "merchant-logs", "merchant-stats"] });
      toast({ title: `Feed refreshed — ${d.productCount} products ready` });
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  const s = settingsData;
  const stats = statsData?.stats ?? {};
  const health = healthData ?? {};
  const hasStoreUrl = Boolean(form.storeUrl);
  const hasMerchantId = Boolean(form.merchantId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Google Merchant Center</h1>
            <p className="text-sm text-slate-400">Product feeds for Google Shopping, Facebook Catalog & Meta Commerce</p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Badge className={form.feedEnabled ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-red-500/20 text-red-300 border-red-500/30"}>
            {form.feedEnabled ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
            Feed {form.feedEnabled ? "Active" : "Disabled"}
          </Badge>
          {s?.lastSyncAt && (
            <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/50">
              <Clock className="w-3 h-3 mr-1" />
              Last sync: {new Date(s.lastSyncAt).toLocaleString()}
            </Badge>
          )}
          <Button
            size="sm"
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className="ml-auto bg-blue-600 hover:bg-blue-700 text-white"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMut.isPending ? "animate-spin" : ""}`} />
            Refresh Feed
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Products" value={Number(stats.total ?? 0).toLocaleString()} icon={Package} color="bg-blue-500/20 text-blue-400" />
        <StatCard label="Active & In-Stock" value={Number(stats.in_stock ?? 0).toLocaleString()} icon={CheckCircle2} color="bg-emerald-500/20 text-emerald-400" />
        <StatCard label="Missing Image" value={Number(health.missing_image ?? 0)} icon={AlertTriangle} color="bg-amber-500/20 text-amber-400" />
        <StatCard label="Ready to Sync" value={Number(health.ready_to_sync ?? 0).toLocaleString()} icon={TrendingUp} color="bg-purple-500/20 text-purple-400" />
      </div>

      <Tabs defaultValue="feeds" className="space-y-4">
        <TabsList className="bg-slate-800/60 border border-slate-700/50">
          <TabsTrigger value="feeds" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400">
            <Link2 className="w-3.5 h-3.5 mr-1.5" /> Feed URLs
          </TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400">
            <Settings className="w-3.5 h-3.5 mr-1.5" /> Settings
          </TabsTrigger>
          <TabsTrigger value="health" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400">
            <BarChart2 className="w-3.5 h-3.5 mr-1.5" /> Feed Health
          </TabsTrigger>
          <TabsTrigger value="setup" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400">
            <List className="w-3.5 h-3.5 mr-1.5" /> Setup Guide
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400">
            <BarChart2 className="w-3.5 h-3.5 mr-1.5" /> Analytics
          </TabsTrigger>
        </TabsList>

        {/* ── FEED URLs TAB ── */}
        <TabsContent value="feeds" className="space-y-4">
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-5">
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" /> Public Feed Endpoints
            </h2>
            <div className="space-y-3">
              <FeedRow
                label="Google Shopping / Merchant Center"
                url={feedUrls.googleXml}
                badge="XML"
                badgeColor="bg-blue-500/20 text-blue-300 border-blue-500/30"
              />
              <FeedRow
                label="Facebook / Meta Product Catalog"
                url={feedUrls.facebookJson}
                badge="JSON"
                badgeColor="bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
              />
              <FeedRow
                label="Meta Commerce Manager"
                url={feedUrls.metaJson}
                badge="JSON"
                badgeColor="bg-purple-500/20 text-purple-300 border-purple-500/30"
              />
            </div>
            <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs text-blue-300 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                These are live public feed URLs. Copy and paste them directly into Google Merchant Center → Products → Feeds → File URL, or Facebook Commerce Manager → Catalog → Data Sources.
              </p>
            </div>
          </div>

          {/* Feed contents preview */}
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-5">
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-400" /> What's In The Feed
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "Active products", value: stats.active ?? "—" },
                { label: "With images", value: stats.with_image ?? "—" },
                { label: "With prices", value: stats.with_price ?? "—" },
                { label: "In stock", value: stats.in_stock ?? "—" },
                { label: "Out of stock", value: stats.out_of_stock ?? "—" },
                { label: "Missing description", value: health.missing_description ?? "—" },
              ].map(item => (
                <div key={item.label} className="bg-slate-900/40 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-white">{item.value}</p>
                  <p className="text-xs text-slate-400 mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent sync logs */}
          {logsData?.logs?.length > 0 && (
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-5">
              <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" /> Recent Activity
              </h2>
              <div className="space-y-2">
                {logsData.logs.slice(0, 5).map((log: any) => (
                  <div key={log.id} className="flex items-center gap-3 text-sm">
                    <Badge className={log.status === "success" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}>
                      {log.status}
                    </Badge>
                    <span className="text-slate-300">{log.action.replace(/_/g, " ")}</span>
                    <span className="text-slate-500 ml-auto text-xs">{new Date(log.createdAt).toLocaleString()}</span>
                    {log.productCount > 0 && <Badge className="bg-slate-700 text-slate-300">{log.productCount} products</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── SETTINGS TAB ── */}
        <TabsContent value="settings" className="space-y-4">
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-5 space-y-5">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-400" /> Merchant Configuration
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Google Merchant ID</Label>
                <Input
                  value={form.merchantId}
                  onChange={e => setForm(p => ({ ...p, merchantId: e.target.value }))}
                  placeholder="e.g. 123456789"
                  className="bg-slate-900/60 border-slate-600/50 text-white placeholder:text-slate-500"
                />
                <p className="text-xs text-slate-500">Found in Merchant Center → Settings → Business info</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Store Name</Label>
                <Input
                  value={form.storeName}
                  onChange={e => setForm(p => ({ ...p, storeName: e.target.value }))}
                  className="bg-slate-900/60 border-slate-600/50 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Store URL (canonical domain)</Label>
                <Input
                  value={form.storeUrl}
                  onChange={e => setForm(p => ({ ...p, storeUrl: e.target.value }))}
                  placeholder="https://kdfnuts.com"
                  className="bg-slate-900/60 border-slate-600/50 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Brand Name</Label>
                <Input
                  value={form.brand}
                  onChange={e => setForm(p => ({ ...p, brand: e.target.value }))}
                  className="bg-slate-900/60 border-slate-600/50 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Currency</Label>
                <Input value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="bg-slate-900/60 border-slate-600/50 text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Country Code</Label>
                <Input value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} className="bg-slate-900/60 border-slate-600/50 text-white" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Google Product Category</Label>
              <Input
                value={form.productCategory}
                onChange={e => setForm(p => ({ ...p, productCategory: e.target.value }))}
                className="bg-slate-900/60 border-slate-600/50 text-white"
              />
              <p className="text-xs text-slate-500">Full Google taxonomy path — <a href="https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">browse taxonomy</a></p>
            </div>

            <div className="border-t border-slate-700/40 pt-4 space-y-3">
              <h3 className="text-sm font-medium text-white">Feed Options</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300">Feed Enabled</p>
                  <p className="text-xs text-slate-500">Allow public access to product feed URLs</p>
                </div>
                <Switch checked={form.feedEnabled} onCheckedChange={v => setForm(p => ({ ...p, feedEnabled: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300">Include Out-of-Stock Products</p>
                  <p className="text-xs text-slate-500">Include items with 0 inventory in feed</p>
                </div>
                <Switch
                  checked={Boolean(form.feedSettings.includeOutOfStock)}
                  onCheckedChange={v => setForm(p => ({ ...p, feedSettings: { ...p.feedSettings, includeOutOfStock: v } }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300">Include Variants as Separate Items</p>
                  <p className="text-xs text-slate-500">Each weight variant = separate feed item</p>
                </div>
                <Switch
                  checked={Boolean(form.feedSettings.includeVariants)}
                  onCheckedChange={v => setForm(p => ({ ...p, feedSettings: { ...p.feedSettings, includeVariants: v } }))}
                />
              </div>
            </div>

            <div className="border-t border-slate-700/40 pt-4 space-y-4">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-blue-400" /> Google Analytics & Tracking
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">GA4 Measurement ID</Label>
                  <Input
                    value={form.gaTrackingId}
                    onChange={e => setForm(p => ({ ...p, gaTrackingId: e.target.value }))}
                    placeholder="G-XXXXXXXXXX"
                    className="bg-slate-900/60 border-slate-600/50 text-white placeholder:text-slate-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">GTM Container ID</Label>
                  <Input
                    value={form.gtmContainerId}
                    onChange={e => setForm(p => ({ ...p, gtmContainerId: e.target.value }))}
                    placeholder="GTM-XXXXXXX"
                    className="bg-slate-900/60 border-slate-600/50 text-white placeholder:text-slate-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Search Console Property URL</Label>
                  <Input
                    value={form.searchConsoleUrl}
                    onChange={e => setForm(p => ({ ...p, searchConsoleUrl: e.target.value }))}
                    placeholder="https://kdfnuts.com"
                    className="bg-slate-900/60 border-slate-600/50 text-white placeholder:text-slate-500"
                  />
                </div>
              </div>
            </div>

            <Button
              onClick={() => saveMut.mutate(form)}
              disabled={saveMut.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saveMut.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Save Settings
            </Button>
          </div>
        </TabsContent>

        {/* ── FEED HEALTH TAB ── */}
        <TabsContent value="health" className="space-y-4">
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-5">
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-emerald-400" /> Product Feed Health Check
            </h2>
            <div className="space-y-3">
              {[
                { key: "ready_to_sync",  label: "Products Ready to Sync",     good: true,  desc: "Active + in stock + has price" },
                { key: "missing_image",  label: "Missing Product Image",       good: false, desc: "Google requires images for Shopping ads" },
                { key: "missing_description", label: "Missing Description",   good: false, desc: "Add descriptions to improve ad quality score" },
                { key: "missing_price",  label: "Missing or Zero Price",       good: false, desc: "Products without prices are excluded from feeds" },
                { key: "missing_sku",    label: "Missing SKU",                 good: false, desc: "SKU helps Google deduplicate products" },
              ].map(item => {
                const val = Number(health[item.key] ?? 0);
                const isGood = item.good ? val > 0 : val === 0;
                return (
                  <div key={item.key} className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/40">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isGood ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                      {isGood ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <p className="text-xs text-slate-400">{item.desc}</p>
                    </div>
                    <Badge className={isGood ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}>
                      {val}
                    </Badge>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs text-blue-300">
                To fix issues: Go to <strong>Shopify Products</strong> and add missing images, descriptions, and prices. Then click <strong>Refresh Feed</strong> above.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* ── SETUP GUIDE TAB ── */}
        <TabsContent value="setup" className="space-y-4">
          {/* Google Merchant Center */}
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-blue-400" />
              </div>
              <h2 className="text-base font-semibold text-white">Google Merchant Center Setup</h2>
            </div>
            <div className="space-y-3">
              <SetupStep n={1} title="Create Merchant Center Account" desc="Go to merchants.google.com → Create account → Enter business name, country, website URL" done={hasMerchantId} />
              <SetupStep n={2} title="Verify & Claim Your Website" desc="In Merchant Center → Business info → Website → Add verification HTML tag to your site's <head>. Use the SEO Settings page to add the tag." done={hasStoreUrl} />
              <SetupStep n={3} title="Configure Store Settings" desc="Enter your Merchant ID and Store URL in the Settings tab above, then click Save Settings." done={hasMerchantId && hasStoreUrl} />
              <SetupStep n={4} title="Add Product Feed" desc={`In Merchant Center → Products → Feeds → Add feed → Scheduled fetch → Paste: ${feedUrls.googleXml}`} />
              <SetupStep n={5} title="Set Feed Schedule" desc="Set fetch frequency to Daily. Google will automatically pull updated products every day." />
              <SetupStep n={6} title="Fix Any Disapproved Products" desc="After 24-48 hours, check Merchant Center → Products → Diagnostics for any disapproved items." />
              <SetupStep n={7} title="Link to Google Ads" desc="In Merchant Center → Performance → Google Ads → Link account. Then create Shopping campaigns." />
            </div>
          </div>

          {/* Facebook Catalog */}
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <Layers className="w-4 h-4 text-indigo-400" />
              </div>
              <h2 className="text-base font-semibold text-white">Facebook / Meta Catalog Setup</h2>
            </div>
            <div className="space-y-3">
              <SetupStep n={1} title="Open Meta Commerce Manager" desc="Go to business.facebook.com → Commerce Manager → Catalogs → Create Catalog" />
              <SetupStep n={2} title="Add Data Source" desc="Choose 'Data Feed' → Scheduled feed → Paste the Facebook Catalog JSON URL from Feed URLs tab" />
              <SetupStep n={3} title="Map Product Fields" desc="Meta auto-detects fields. Verify: id, title, description, price, image_link, availability, link" />
              <SetupStep n={4} title="Set Fetch Schedule" desc="Set to Daily. Your catalog will auto-update every 24 hours." />
              <SetupStep n={5} title="Create Product Sets" desc="In Catalog → Product Sets → Create sets for campaigns (e.g. 'Almonds', 'Pistachios')" />
              <SetupStep n={6} title="Link to Ad Account" desc="Connect catalog to your Meta Ad account for Dynamic Product Ads and Retargeting" />
            </div>
          </div>

          {/* Google Analytics Setup */}
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <BarChart2 className="w-4 h-4 text-orange-400" />
              </div>
              <h2 className="text-base font-semibold text-white">Google Analytics 4 + GTM</h2>
            </div>
            <div className="space-y-3">
              <SetupStep n={1} title="Create GA4 Property" desc="analytics.google.com → Admin → Create Property → Web stream → Copy Measurement ID (G-XXXXXXXX)" />
              <SetupStep n={2} title="Create GTM Container" desc="tagmanager.google.com → Create container → Web → Copy Container ID (GTM-XXXXXXX)" />
              <SetupStep n={3} title="Add IDs to Settings" desc="Enter your GA4 Measurement ID and GTM Container ID in the Settings tab above" />
              <SetupStep n={4} title="Add GTM snippet to Storefront" desc="Add GTM head + body snippets to your kdf-nuts/kdf-plus storefront HTML" done={Boolean(form.gtmContainerId)} />
              <SetupStep n={5} title="Configure Enhanced Ecommerce" desc="In GTM → Tags → Add GA4 Event tag for purchase events with transaction data" />
            </div>
            {form.gtmContainerId && (
              <div className="mt-4 p-3 rounded-lg bg-slate-900/60 border border-slate-700/30">
                <p className="text-xs text-slate-400 mb-2 font-medium">GTM Head Snippet (add to &lt;head&gt;):</p>
                <pre className="text-xs text-emerald-300 overflow-x-auto whitespace-pre-wrap">{`<!-- Google Tag Manager -->\n<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${form.gtmContainerId}');</script>\n<!-- End Google Tag Manager -->`}</pre>
                <CopyBtn text={`<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${form.gtmContainerId}');</script>`} />
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── ANALYTICS TAB ── */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-5">
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-blue-400" /> Google Ecosystem Overview
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  title: "Google Merchant Center",
                  subtitle: "Product feed & Shopping",
                  icon: ShoppingBag,
                  color: "from-blue-600 to-blue-700",
                  url: "https://merchants.google.com",
                  status: hasMerchantId ? "Configured" : "Not configured",
                  statusColor: hasMerchantId ? "text-emerald-400" : "text-amber-400",
                  desc: form.merchantId ? `Merchant ID: ${form.merchantId}` : "Add Merchant ID in Settings tab",
                },
                {
                  title: "Google Analytics 4",
                  subtitle: "Traffic & conversion tracking",
                  icon: BarChart2,
                  color: "from-orange-600 to-orange-700",
                  url: "https://analytics.google.com",
                  status: form.gaTrackingId ? "Configured" : "Not configured",
                  statusColor: form.gaTrackingId ? "text-emerald-400" : "text-amber-400",
                  desc: form.gaTrackingId || "Add GA4 ID in Settings tab",
                },
                {
                  title: "Google Search Console",
                  subtitle: "SEO & indexing performance",
                  icon: Globe,
                  color: "from-emerald-600 to-emerald-700",
                  url: "https://search.google.com/search-console",
                  status: form.searchConsoleUrl ? "Configured" : "Not configured",
                  statusColor: form.searchConsoleUrl ? "text-emerald-400" : "text-amber-400",
                  desc: "Use Fast Indexing for URL submission",
                },
                {
                  title: "Google Tag Manager",
                  subtitle: "Tag & event management",
                  icon: Tag,
                  color: "from-slate-600 to-slate-700",
                  url: "https://tagmanager.google.com",
                  status: form.gtmContainerId ? "Configured" : "Not configured",
                  statusColor: form.gtmContainerId ? "text-emerald-400" : "text-amber-400",
                  desc: form.gtmContainerId || "Add GTM ID in Settings tab",
                },
                {
                  title: "Google Shopping Ads",
                  subtitle: "Performance Max campaigns",
                  icon: Zap,
                  color: "from-yellow-600 to-yellow-700",
                  url: "https://ads.google.com",
                  status: hasMerchantId ? "Ready" : "Needs Merchant Center",
                  statusColor: hasMerchantId ? "text-emerald-400" : "text-slate-400",
                  desc: "Link Merchant Center to Google Ads",
                },
                {
                  title: "Fast Indexing API",
                  subtitle: "URL submission to Google",
                  icon: Zap,
                  color: "from-purple-600 to-purple-700",
                  url: "/seo/fast-indexing",
                  status: "Active",
                  statusColor: "text-emerald-400",
                  desc: "Auto-submit products to Google index",
                  internal: true,
                },
              ].map(card => (
                <a
                  key={card.title}
                  href={card.internal ? card.url : card.url}
                  target={card.internal ? undefined : "_blank"}
                  rel={card.internal ? undefined : "noreferrer"}
                  className="block p-4 rounded-xl border border-slate-700/40 bg-slate-900/40 hover:border-slate-600 transition-colors group"
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-3`}>
                    <card.icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">{card.title}</p>
                  <p className="text-xs text-slate-400 mb-2">{card.subtitle}</p>
                  <p className={`text-xs font-medium ${card.statusColor}`}>{card.status}</p>
                  <p className="text-xs text-slate-500 mt-1 truncate">{card.desc}</p>
                  <ExternalLink className="w-3 h-3 text-slate-600 mt-2 group-hover:text-slate-400 transition-colors" />
                </a>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
