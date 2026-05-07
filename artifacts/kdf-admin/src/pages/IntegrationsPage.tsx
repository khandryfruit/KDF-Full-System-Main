import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, RefreshCw, Plug, Store, Megaphone, BarChart3, AlertCircle, ExternalLink, Eye, EyeOff, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

function SyncStatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    idle: { label: "Idle", cls: "bg-gray-50 text-gray-500 border-gray-200" },
    syncing: { label: "Syncing…", cls: "bg-blue-50 text-blue-600 border-blue-200" },
    completed: { label: "Synced", cls: "bg-green-50 text-green-700 border-green-200" },
    failed: { label: "Failed", cls: "bg-red-50 text-red-600 border-red-200" },
  };
  const s = map[status ?? "idle"] ?? map["idle"]!;
  return <Badge variant="outline" className={`text-xs ${s.cls}`}>{s.label}</Badge>;
}

/* ─── Shopify Card ──────────────────────────────────── */
function ShopifyCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({ queryKey: ["/api/integrations/shopify"], queryFn: () => apiFetch("/api/integrations/shopify") });
  const [form, setForm] = useState({ storeUrl: "", apiKey: "", accessToken: "" });
  const [showToken, setShowToken] = useState(false);
  const [editing, setEditing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const save = useMutation({
    mutationFn: () => apiFetch("/api/integrations/shopify", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/integrations/shopify"] }); setEditing(false); toast({ title: "Shopify connected" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const r = await apiFetch("/api/integrations/shopify/sync", { method: "POST" });
      toast({ title: `Sync started (Job #${r.jobId})`, description: "Products will be imported in the background." });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["/api/integrations/shopify"] }), 3000);
    } catch (e: any) { toast({ variant: "destructive", title: e.message }); }
    finally { setSyncing(false); }
  };

  const openEdit = () => {
    setForm({ storeUrl: config?.storeUrl ?? "", apiKey: config?.apiKey ?? "", accessToken: config?.accessToken ?? "" });
    setEditing(true);
  };

  return (
    <IntegrationCard
      icon="🛍️"
      title="Shopify"
      description="Import and sync products from your Shopify store"
      type="ecommerce"
      isConnected={!!config}
      isLoading={isLoading}
      status={config?.syncStatus ?? null}
      lastSync={config?.lastSyncAt ? new Date(config.lastSyncAt).toLocaleString() : null}
      errorMessage={config?.errorMessage}
      onConnect={openEdit}
      onSync={config ? triggerSync : undefined}
      syncing={syncing}
    >
      {editing && (
        <div className="space-y-3 mt-4 pt-4 border-t border-border">
          <div className="space-y-1.5">
            <Label>Store URL</Label>
            <Input value={form.storeUrl} onChange={e => setForm({ ...form, storeUrl: e.target.value })} placeholder="https://your-store.myshopify.com" />
          </div>
          <div className="space-y-1.5">
            <Label>API Key</Label>
            <Input value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} placeholder="shpat_..." />
          </div>
          <div className="space-y-1.5">
            <Label>Access Token</Label>
            <div className="relative">
              <Input type={showToken ? "text" : "password"} value={form.accessToken} onChange={e => setForm({ ...form, accessToken: e.target.value })} placeholder="Access token" />
              <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.storeUrl || !form.apiKey || !form.accessToken} className="flex-1">
              {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </IntegrationCard>
  );
}

/* ─── WooCommerce Card ──────────────────────────────── */
function WooCommerceCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({ queryKey: ["/api/integrations/woocommerce"], queryFn: () => apiFetch("/api/integrations/woocommerce") });
  const [form, setForm] = useState({ storeUrl: "", consumerKey: "", consumerSecret: "" });
  const [showSecret, setShowSecret] = useState(false);
  const [editing, setEditing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const save = useMutation({
    mutationFn: () => apiFetch("/api/integrations/woocommerce", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/integrations/woocommerce"] }); setEditing(false); toast({ title: "WooCommerce connected" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const r = await apiFetch("/api/integrations/woocommerce/sync", { method: "POST" });
      toast({ title: `Sync started (Job #${r.jobId})`, description: "Products will be imported in the background." });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["/api/integrations/woocommerce"] }), 3000);
    } catch (e: any) { toast({ variant: "destructive", title: e.message }); }
    finally { setSyncing(false); }
  };

  const openEdit = () => {
    setForm({ storeUrl: config?.storeUrl ?? "", consumerKey: config?.consumerKey ?? "", consumerSecret: config?.consumerSecret ?? "" });
    setEditing(true);
  };

  return (
    <IntegrationCard
      icon="🛒"
      title="WooCommerce"
      description="Import and sync products from your WooCommerce store"
      type="ecommerce"
      isConnected={!!config}
      isLoading={isLoading}
      status={config?.syncStatus ?? null}
      lastSync={config?.lastSyncAt ? new Date(config.lastSyncAt).toLocaleString() : null}
      errorMessage={config?.errorMessage}
      onConnect={openEdit}
      onSync={config ? triggerSync : undefined}
      syncing={syncing}
    >
      {editing && (
        <div className="space-y-3 mt-4 pt-4 border-t border-border">
          <div className="space-y-1.5">
            <Label>Store URL</Label>
            <Input value={form.storeUrl} onChange={e => setForm({ ...form, storeUrl: e.target.value })} placeholder="https://your-store.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Consumer Key</Label>
            <Input value={form.consumerKey} onChange={e => setForm({ ...form, consumerKey: e.target.value })} placeholder="ck_..." />
          </div>
          <div className="space-y-1.5">
            <Label>Consumer Secret</Label>
            <div className="relative">
              <Input type={showSecret ? "text" : "password"} value={form.consumerSecret} onChange={e => setForm({ ...form, consumerSecret: e.target.value })} placeholder="cs_..." />
              <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.storeUrl || !form.consumerKey || !form.consumerSecret} className="flex-1">
              {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </IntegrationCard>
  );
}

/* ─── Marketing Card ────────────────────────────────── */
function MarketingCard({ platform, icon, description }: { platform: string; icon: string; description: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: allMarketing = [], isLoading } = useQuery({ queryKey: ["/api/integrations/marketing"], queryFn: () => apiFetch("/api/integrations/marketing") });
  const config = (allMarketing as any[]).find((m: any) => m.platform === platform);
  const [form, setForm] = useState({ pixelId: "", accessToken: "" });
  const [editing, setEditing] = useState(false);

  const save = useMutation({
    mutationFn: () => apiFetch("/api/integrations/marketing", { method: "POST", body: JSON.stringify({ platform, pixelId: form.pixelId, accessToken: form.accessToken, isActive: true }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/integrations/marketing"] }); setEditing(false); toast({ title: `${platform} pixel saved` }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const toggle = useMutation({
    mutationFn: (active: boolean) => apiFetch(`/api/integrations/marketing/${config?.id}`, { method: "PATCH", body: JSON.stringify({ isActive: active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/integrations/marketing"] }),
  });

  const openEdit = () => {
    setForm({ pixelId: config?.pixelId ?? "", accessToken: config?.accessToken ?? "" });
    setEditing(true);
  };

  return (
    <IntegrationCard
      icon={icon}
      title={platform}
      description={description}
      type="marketing"
      isConnected={!!config}
      isLoading={isLoading}
      status={config?.isActive ? "completed" : config ? "idle" : null}
      lastSync={null}
      errorMessage={null}
      onConnect={openEdit}
      onSync={undefined}
      syncing={false}
    >
      {config && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            Pixel: <span className="font-mono font-semibold text-foreground">{config.pixelId}</span>
          </div>
          <Switch checked={config.isActive} onCheckedChange={(v) => toggle.mutate(v)} />
        </div>
      )}
      {editing && (
        <div className="space-y-3 mt-4 pt-4 border-t border-border">
          <div className="space-y-1.5">
            <Label>Pixel ID</Label>
            <Input value={form.pixelId} onChange={e => setForm({ ...form, pixelId: e.target.value })} placeholder="1234567890" />
          </div>
          <div className="space-y-1.5">
            <Label>Access Token (optional)</Label>
            <Input type="password" value={form.accessToken} onChange={e => setForm({ ...form, accessToken: e.target.value })} placeholder="EAABz..." />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.pixelId} className="flex-1">
              {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </IntegrationCard>
  );
}

/* ─── Shared Card Shell ─────────────────────────────── */
function IntegrationCard({ icon, title, description, type, isConnected, isLoading, status, lastSync, errorMessage, onConnect, onSync, syncing, children }: {
  icon: string; title: string; description: string; type: string;
  isConnected: boolean; isLoading: boolean; status: string | null;
  lastSync: string | null; errorMessage?: string | null;
  onConnect: () => void; onSync?: () => void; syncing: boolean;
  children?: React.ReactNode;
}) {
  const typeColors: Record<string, string> = {
    ecommerce: "bg-blue-50 text-blue-700 border-blue-200",
    marketing: "bg-purple-50 text-purple-700 border-purple-200",
    analytics: "bg-amber-50 text-amber-700 border-amber-200",
  };

  return (
    <div className={`border rounded-xl bg-card shadow-sm p-5 flex flex-col gap-0 transition-all ${isConnected ? "border-green-200 shadow-green-50/50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-muted rounded-xl flex items-center justify-center text-2xl leading-none">{icon}</div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base leading-tight">{title}</h3>
              {isConnected && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${typeColors[type] ?? ""}`}>{type}</Badge>
      </div>

      {!isLoading && (
        <div className="flex items-center gap-2 mt-3">
          <SyncStatusBadge status={isConnected ? (status ?? "idle") : null} />
          {lastSync && <span className="text-xs text-muted-foreground">Last sync: {lastSync}</span>}
          {!isConnected && <span className="text-xs text-muted-foreground">Not connected</span>}
        </div>
      )}

      {errorMessage && (
        <div className="flex items-start gap-1.5 mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      {children}

      <div className="flex gap-2 mt-4">
        <Button variant={isConnected ? "outline" : "default"} size="sm" onClick={onConnect} className="flex-1">
          <Settings className="w-3.5 h-3.5 mr-1.5" />
          {isConnected ? "Reconfigure" : "Connect"}
        </Button>
        {onSync && (
          <Button variant="outline" size="sm" onClick={onSync} disabled={syncing} className="flex-1">
            {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Sync Now
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────── */
export default function IntegrationsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground text-sm mt-1">Connect your store with third-party platforms and marketing tools</p>
      </div>

      {/* eCommerce */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">eCommerce Platforms</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ShopifyCard />
          <WooCommerceCard />
        </div>
      </section>

      {/* Marketing */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Marketing & Tracking</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <MarketingCard platform="Facebook" icon="📘" description="Track events via Meta Pixel on Facebook" />
          <MarketingCard platform="Instagram" icon="📷" description="Track events via Meta Pixel on Instagram" />
          <MarketingCard platform="TikTok" icon="🎵" description="Track events with TikTok Pixel" />
          <MarketingCard platform="Google" icon="📊" description="Google Analytics & Google Ads conversion tracking" />
          <MarketingCard platform="Snapchat" icon="👻" description="Snapchat Pixel for ad conversion tracking" />
          <MarketingCard platform="Twitter" icon="𝕏" description="X/Twitter Pixel for ad tracking" />
        </div>
      </section>

      {/* Event Tracking Reference */}
      <section className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Event Tracking Reference</h3>
          <Badge variant="outline" className="ml-auto text-xs">Frontend Integration</Badge>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">Add these scripts to your storefront's <code className="bg-muted px-1 rounded">index.html</code> after connecting pixels above.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { event: "PageView", trigger: "Every page load", icon: "👁️" },
              { event: "ViewContent", trigger: "Product detail page", icon: "📦" },
              { event: "AddToCart", trigger: "Add to cart button", icon: "🛒" },
              { event: "InitiateCheckout", trigger: "Checkout page load", icon: "💳" },
              { event: "Purchase", trigger: "Order success page", icon: "✅" },
              { event: "Search", trigger: "Search query performed", icon: "🔍" },
            ].map(ev => (
              <div key={ev.event} className="flex items-center gap-3 bg-muted/30 rounded-lg p-3">
                <span className="text-lg">{ev.icon}</span>
                <div>
                  <div className="text-sm font-semibold font-mono">{ev.event}</div>
                  <div className="text-xs text-muted-foreground">{ev.trigger}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
