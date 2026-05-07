import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ShoppingBag, Users, Package, Megaphone, TrendingUp, RefreshCw,
  CheckCircle, WifiOff, Settings, ChevronRight, ArrowUpRight,
  Mail, MessageCircle, DollarSign, Eye, EyeOff, Send, AlertTriangle,
  BarChart2, MousePointer, Wifi, DatabaseZap, Loader2, CheckCircle2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

function StatCard({ icon: Icon, label, value, sub, color, href }: { icon: any; label: string; value: number | string; sub?: string; color: string; href?: string }) {
  const content = (
    <div className={`bg-card border border-border rounded-xl p-5 flex items-center gap-4 ${href ? "hover:shadow-md transition-all cursor-pointer group" : ""}`}>
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {href && <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default function ShopifyDashboardPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState({ shopDomain: "", accessToken: "", apiKey: "", apiSecret: "", webhookSecret: "" });

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["shopify-analytics"],
    queryFn: () => api("/admin/shopify/analytics").then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: store } = useQuery({
    queryKey: ["shopify-store"],
    queryFn: () => api("/admin/shopify/store").then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) => api("/admin/shopify/store", { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shopify-store"] }); qc.invalidateQueries({ queryKey: ["shopify-analytics"] }); setEditMode(false); toast({ title: "Store settings saved" }); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: () => api("/admin/shopify/store/test", { method: "POST" }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.success) { qc.invalidateQueries({ queryKey: ["shopify-store"] }); qc.invalidateQueries({ queryKey: ["shopify-analytics"] }); toast({ title: `Connected to ${data.shop?.name ?? "Shopify store"}` }); }
      else toast({ title: `Connection failed: ${data.error}`, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api("/admin/shopify/store/disconnect", { method: "POST" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shopify-store"] }); setEditMode(false); toast({ title: "Store disconnected" }); },
  });

  const [fullSyncJobId, setFullSyncJobId] = useState<number | null>(null);

  const syncMutation = useMutation({
    mutationFn: (type: "orders" | "customers" | "products") => api(`/admin/shopify/sync/${type}`, { method: "POST" }).then(r => r.json()),
    onSuccess: (data, type) => { qc.invalidateQueries({ queryKey: ["shopify-analytics"] }); toast({ title: `${data.synced} ${type} synced` }); },
    onError: (_, type) => toast({ title: `Failed to sync ${type}`, variant: "destructive" }),
  });

  const fullSyncMutation = useMutation({
    mutationFn: (types: string[]) => api("/admin/shopify/sync/full", { method: "POST", body: JSON.stringify({ types }) }).then(r => r.json()),
    onSuccess: (data) => {
      setFullSyncJobId(data.jobId);
      toast({ title: "Full sync started", description: "Processing all historical records in the background." });
    },
    onError: () => toast({ title: "Failed to start full sync", variant: "destructive" }),
  });

  const { data: fullSyncJob } = useQuery({
    queryKey: ["shopify-sync-job", fullSyncJobId],
    queryFn: () => api(`/admin/shopify/sync/job/${fullSyncJobId}`).then(r => r.json()),
    enabled: !!fullSyncJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") { qc.invalidateQueries({ queryKey: ["shopify-analytics"] }); return false; }
      return 3000;
    },
  });

  const handleEdit = () => {
    setForm({ shopDomain: store?.shopDomain ?? "", accessToken: store?.accessToken ?? "", apiKey: store?.apiKey ?? "", apiSecret: store?.apiSecret ?? "", webhookSecret: store?.webhookSecret ?? "" });
    setEditMode(true);
  };

  const isConnected = store?.isConnected;
  const a = analytics;
  const emailRate = a?.email?.sent > 0 ? ((a.email.opened / a.email.sent) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shopify Dashboard</h1>
          <p className="text-muted-foreground text-sm">Unified marketing analytics — Shopify + Email + WhatsApp</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isConnected ? (
            <>
              <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg"><Wifi className="w-3.5 h-3.5" /> Connected to {store?.storeName ?? "Shopify"}</span>
              {["orders", "customers", "products"].map(t => (
                <Button key={t} variant="outline" size="sm" onClick={() => syncMutation.mutate(t as any)} disabled={syncMutation.isPending || fullSyncMutation.isPending} className="capitalize">
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncMutation.isPending ? "animate-spin" : ""}`} /> {t}
                </Button>
              ))}
              <Button
                size="sm"
                onClick={() => fullSyncMutation.mutate(["orders", "customers", "products"])}
                disabled={fullSyncMutation.isPending || fullSyncJob?.status === "running"}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <DatabaseZap className="w-3.5 h-3.5 mr-1.5" /> Full Sync
              </Button>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-red-500 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg"><WifiOff className="w-3.5 h-3.5" /> Not Connected</span>
          )}
          <Button variant="outline" size="sm" onClick={handleEdit}><Settings className="w-3.5 h-3.5 mr-1.5" /> Configure</Button>
        </div>
      </div>

      {/* Full Sync Progress Banner */}
      {fullSyncJob && (
        <div className={`border rounded-xl p-4 text-sm ${
          fullSyncJob.status === "completed" ? "bg-green-50 border-green-200" :
          fullSyncJob.status === "failed" ? "bg-red-50 border-red-200" :
          "bg-indigo-50 border-indigo-200"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {fullSyncJob.status === "completed" ? <CheckCircle2 className="w-4 h-4 text-green-600" /> :
             fullSyncJob.status === "failed" ? <XCircle className="w-4 h-4 text-red-500" /> :
             <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />}
            <span className="font-medium capitalize text-foreground">
              Full Sync — {fullSyncJob.status}
              {fullSyncJob.successCount > 0 && ` (${fullSyncJob.successCount.toLocaleString()} records synced)`}
            </span>
            {(fullSyncJob.status === "completed" || fullSyncJob.status === "failed") && (
              <button onClick={() => setFullSyncJobId(null)} className="ml-auto text-muted-foreground hover:text-foreground">✕</button>
            )}
          </div>
          {(fullSyncJob.logs ?? []).slice(-4).map((log: string, i: number) => (
            <p key={i} className="text-xs text-muted-foreground font-mono">{log}</p>
          ))}
        </div>
      )}

      {/* Customer Stats */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Customer Database</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Total Customers" value={a?.customers?.total ?? 0} color="bg-blue-500" href="/shopify/customers" />
          <StatCard icon={Mail} label="With Email" value={a?.customers?.withEmail ?? 0} sub="Email-reachable" color="bg-indigo-500" href="/shopify/customers" />
          <StatCard icon={MessageCircle} label="With Phone" value={a?.customers?.withPhone ?? 0} sub="WA-reachable" color="bg-green-500" href="/shopify/customers" />
          <StatCard icon={ShoppingBag} label="Orders" value={a?.orders ?? 0} color="bg-purple-500" href="/shopify/orders" />
        </div>
      </div>

      {/* Revenue + Products */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-5 h-5 text-green-500" /><span className="text-sm font-semibold">Total Revenue</span></div>
          <p className="text-3xl font-bold text-primary mt-1">
            PKR {a?.revenue ? parseFloat(a.revenue).toLocaleString() : "0"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">From {a?.orders ?? 0} synced orders</p>
        </div>
        <StatCard icon={Package} label="Products Synced" value={a?.products ?? 0} color="bg-orange-500" href="/shopify/products" />
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3"><BarChart2 className="w-5 h-5 text-purple-500" /><span className="text-sm font-semibold">Campaigns</span></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />WhatsApp</span><span className="font-bold">{a?.waCampaigns ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />Email</span><span className="font-bold">{a?.emailCampaigns ?? 0}</span></div>
          </div>
          <Link href="/shopify/campaigns"><Button variant="ghost" size="sm" className="w-full mt-3 text-xs gap-1">View All <ChevronRight className="w-3 h-3" /></Button></Link>
        </div>
      </div>

      {/* Email Analytics */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Email Campaign Analytics</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={Send} label="Emails Sent" value={a?.email?.sent ?? 0} color="bg-blue-500" />
          <StatCard icon={CheckCircle} label="Delivered" value={a?.email?.delivered ?? 0} color="bg-green-500" />
          <StatCard icon={Eye} label="Opened" value={a?.email?.opened ?? 0} sub={`${emailRate}% open rate`} color="bg-purple-500" />
          <StatCard icon={MousePointer} label="Clicked" value={a?.email?.clicked ?? 0} color="bg-orange-500" />
          <StatCard icon={AlertTriangle} label="Failed" value={a?.email?.failed ?? 0} color="bg-red-400" />
        </div>
        <Link href="/shopify/email-campaigns"><Button variant="outline" size="sm" className="mt-3 gap-1.5"><Mail className="w-3.5 h-3.5" /> Manage Email Campaigns <ChevronRight className="w-3.5 h-3.5" /></Button></Link>
      </div>

      {/* WhatsApp + Cost Tracking */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">WhatsApp + Cost Tracking</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3"><MessageCircle className="w-5 h-5 text-green-500" /><span className="font-semibold">WhatsApp Usage</span></div>
            <p className="text-3xl font-bold">{(a?.whatsapp?.sent ?? 0).toLocaleString()}</p>
            <p className="text-sm text-muted-foreground mt-0.5">Total messages sent via campaigns</p>
            <Link href="/shopify/campaigns"><Button variant="outline" size="sm" className="mt-3 gap-1.5 text-xs"><Megaphone className="w-3.5 h-3.5" /> WA Campaigns</Button></Link>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3"><DollarSign className="w-5 h-5 text-yellow-500" /><span className="font-semibold">Cost Estimate</span></div>
            <p className="text-3xl font-bold text-yellow-600">${a?.whatsapp?.estimatedCostUsd ?? "0.00"}</p>
            <p className="text-sm text-muted-foreground mt-0.5">Based on $0.015 / Meta WA message</p>
            <div className="mt-3 text-xs space-y-1 text-muted-foreground">
              <div className="flex justify-between"><span>WhatsApp messages</span><span className="font-medium">{a?.whatsapp?.sent ?? 0}</span></div>
              <div className="flex justify-between"><span>Emails sent</span><span className="font-medium">{a?.email?.sent ?? 0}</span></div>
              <div className="flex justify-between"><span>Email cost (SMTP)</span><span className="font-medium text-green-600">Free</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Navigation</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { href: "/shopify/orders", icon: ShoppingBag, label: "Orders", color: "text-blue-500" },
            { href: "/shopify/customers", icon: Users, label: "Customers", color: "text-purple-500" },
            { href: "/shopify/products", icon: Package, label: "Products", color: "text-orange-500" },
            { href: "/shopify/campaigns", icon: Megaphone, label: "WA Campaigns", color: "text-green-500" },
            { href: "/shopify/email-campaigns", icon: Mail, label: "Email Campaigns", color: "text-indigo-500" },
          ].map(({ href, icon: Icon, label, color }) => (
            <Link key={href} href={href}>
              <div className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all cursor-pointer group text-center">
                <Icon className={`w-8 h-8 ${color} mx-auto mb-2`} />
                <p className="font-semibold text-sm text-foreground">{label}</p>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground mx-auto mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      {a?.recentOrders?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Recent Shopify Orders</h3>
            <Link href="/shopify/orders"><Button variant="ghost" size="sm" className="gap-1 text-xs">View All <ChevronRight className="w-3.5 h-3.5" /></Button></Link>
          </div>
          <div className="space-y-2">
            {a.recentOrders.map((o: any) => (
              <div key={o.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><ShoppingBag className="w-4 h-4 text-blue-500" /></div>
                  <div><p className="text-sm font-medium">{o.orderNumber}</p><p className="text-xs text-muted-foreground">{o.customerName}</p></div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">PKR {parseFloat(o.totalPrice ?? "0").toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground capitalize">{o.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Configure Modal */}
      {editMode && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-xl">
            <h2 className="text-lg font-bold mb-4">Configure Shopify Store</h2>
            <div className="space-y-4">
              <div>
                <Label>Shop Domain</Label>
                <Input placeholder="your-store.myshopify.com" value={form.shopDomain} onChange={e => setForm(f => ({ ...f, shopDomain: e.target.value }))} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Without https://</p>
              </div>
              <div>
                <Label>Admin API Access Token</Label>
                <div className="relative mt-1">
                  <Input
                    type={showToken ? "text" : "password"}
                    placeholder="shpat_xxxx"
                    value={form.accessToken}
                    onChange={e => setForm(f => ({ ...f, accessToken: e.target.value }))}
                    className="pr-10 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showToken ? "Hide token" : "Show token"}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Shopify Admin → Apps → Develop Apps → Admin API</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
                <p className="font-medium text-blue-800 mb-1">Webhook URL for real-time sync</p>
                <code className="text-blue-700 break-all">{window.location.origin}/api/shopify/webhook</code>
              </div>
            </div>
            <div className="flex gap-2 mt-5 flex-wrap">
              <Button className="flex-1" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>
              <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>{testMutation.isPending ? "Testing..." : "Test"}</Button>
              {isConnected && <Button variant="destructive" size="sm" onClick={() => disconnectMutation.mutate()}>Disconnect</Button>}
              <Button variant="ghost" onClick={() => setEditMode(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
