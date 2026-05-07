import { useState, useRef } from "react";
import { COURIER_CONFIGS, COURIER_ICONS, printShipmentLabel } from "@/lib/courierLabel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Truck, Package, CheckCircle2, XCircle, RotateCcw, Clock, AlertTriangle,
  RefreshCw, TrendingUp, BarChart2, Search, Bell, DollarSign, Wallet,
  ChevronDown, Loader2, ArrowUpRight, ArrowDownRight, Printer, Sparkles,
  Users, Settings, Wifi, WifiOff, Eye, EyeOff, AlertCircle, MapPin,
  Filter, BookOpen, Star, FileText, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });
async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

const TABS = [
  { key: "dashboard",    label: "Dashboard",       icon: BarChart2  },
  { key: "integrations", label: "Integrations",    icon: Wifi       },
  { key: "shipments",    label: "Shipments",        icon: Package    },
  { key: "manual",       label: "Manual Booking",  icon: BookOpen   },
  { key: "analytics",   label: "Analytics",        icon: TrendingUp },
  { key: "settings",    label: "Settings",         icon: Settings   },
];

const COURIER_PRESETS = [
  { name: "TCS Couriers", slug: "tcs",      icon: "🟢", apiEndpoint: "https://ociconnect.tcscourier.com",                color: "bg-green-50 border-green-200" },
  { name: "Leopards",     slug: "leopards", icon: "🟡", apiEndpoint: "https://api.leopardscourier.com/api",              color: "bg-yellow-50 border-yellow-200" },
  { name: "PostEx",       slug: "postex",   icon: "🔵", apiEndpoint: "https://api.postex.pk/services/integration/api/order", color: "bg-blue-50 border-blue-200" },
  { name: "Trax",         slug: "trax",     icon: "🟠", apiEndpoint: "https://app.traxlogistics.com/web/api",            color: "bg-orange-50 border-orange-200" },
];

const TCS_SERVICE_CODES: { code: string; label: string }[] = [
  { code: "O",  label: "Overnight" },
  { code: "S",  label: "Same Day" },
  { code: "E",  label: "Economy" },
  { code: "2D", label: "2-Day" },
  { code: "3D", label: "3-Day" },
  { code: "L",  label: "Logistics" },
];

/* COURIER_CONFIGS, COURIER_ICONS, buildLabelHtml, printShipmentLabel — imported from @/lib/courierLabel */

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  pending:          { bg: "bg-gray-50",   text: "text-gray-500",   border: "border-gray-200",  label: "Pending" },
  processing:       { bg: "bg-blue-50",   text: "text-blue-600",   border: "border-blue-200",  label: "Processing" },
  shipped:          { bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-200",label: "Shipped" },
  in_transit:       { bg: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-200",label: "In Transit" },
  out_for_delivery: { bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200",label: "Out for Delivery" },
  delivered:        { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200", label: "Delivered" },
  failed:           { bg: "bg-red-50",    text: "text-red-600",    border: "border-red-200",   label: "Failed" },
  returned:         { bg: "bg-rose-50",   text: "text-rose-600",   border: "border-rose-200",  label: "Returned" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return <Badge variant="outline" className={`text-xs capitalize ${s.bg} ${s.text} ${s.border}`}>{s.label}</Badge>;
}

function StatCard({ icon: Icon, label, value, sub, color, trend }: {
  icon: any; label: string; value: string | number; sub?: string; color: string; trend?: "up" | "down";
}) {
  return (
    <div className="bg-card border rounded-xl p-5 shadow-sm flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {trend === "up"   && <ArrowUpRight  className="w-4 h-4 text-green-500" />}
          {trend === "down" && <ArrowDownRight className="w-4 h-4 text-red-500"  />}
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function RateBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{pct}% ({value})</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const fmt = (n: number) => {
  if (n >= 1_000_000) return `₨${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₨${(n / 1_000).toFixed(1)}K`;
  return `₨${n.toLocaleString()}`;
};

/* ─── Label Print ─────────────────────────────────────── */
/* buildLabelHtml and printShipmentLabel imported from @/lib/courierLabel */

/* ─── TCS Integration Card ─────────────────────────── */
interface TcsFormState {
  bearerToken: string; username: string; password: string;
  tcsaccount: string; costcentercode: string; shipperName: string;
  shipperAddress: string; shipperCityCode: string; shipperCity: string;
  shipperPhone: string; sandbox: boolean; defaultWeight: string;
  serviceCode: string; fragile: boolean; defaultRemarks: string;
}

function TcsCourierCard({ preset }: { preset: typeof COURIER_PRESETS[0] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: couriers = [] } = useQuery({ queryKey: ["/api/admin/couriers"], queryFn: () => apiFetch("/api/admin/couriers") });
  const config = (couriers as any[]).find((c: any) => c.slug === "tcs");
  const [editing, setEditing] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState<TcsFormState>({
    bearerToken: "", username: "", password: "", tcsaccount: "", costcentercode: "",
    shipperName: "", shipperAddress: "", shipperCityCode: "", shipperCity: "",
    shipperPhone: "", sandbox: false, defaultWeight: "0.5", serviceCode: "O",
    fragile: false, defaultRemarks: "KDF NUTS Order",
  });

  const loadForm = () => {
    const s = (config?.settings ?? {}) as any;
    setForm({
      bearerToken: s.bearerToken ?? "", username: s.username ?? "", password: s.password ?? "",
      tcsaccount: s.tcsaccount ?? "", costcentercode: s.costcentercode ?? "",
      shipperName: s.shipperName ?? "", shipperAddress: s.shipperAddress ?? "",
      shipperCityCode: s.shipperCityCode ?? "", shipperCity: s.shipperCity ?? "",
      shipperPhone: s.shipperPhone ?? "", sandbox: s.sandbox ?? false,
      defaultWeight: s.defaultWeight ?? "0.5", serviceCode: s.serviceCode ?? "O",
      fragile: s.fragile ?? false, defaultRemarks: s.defaultRemarks ?? "KDF NUTS Order",
    });
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { name: "TCS Couriers", slug: "tcs", apiKey: "", apiSecret: "", apiEndpoint: preset.apiEndpoint, isActive: true, settings: { ...form } };
      return apiFetch("/api/admin/couriers", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/couriers"] }); setEditing(false); toast({ title: "TCS settings saved" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const testConn = useMutation({
    mutationFn: () => apiFetch("/api/admin/couriers/tcs/test", { method: "POST" }),
    onSuccess: (d: any) => toast({ title: d.message ?? "TCS connection OK" }),
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const toggleActive = useMutation({
    mutationFn: () => {
      if (!config) return Promise.reject(new Error("Not configured yet"));
      return apiFetch(`/api/admin/couriers/${config.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !config.isActive }) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/couriers"] }),
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const f = (k: keyof TcsFormState) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));
  const isActive = config?.isActive ?? false;

  return (
    <div className={`border-2 rounded-xl overflow-hidden ${preset.color}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{preset.icon}</span>
            <div>
              <p className="font-semibold text-sm">{preset.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {config ? (isActive
                  ? <><Wifi className="w-3 h-3 text-green-500" /><span className="text-xs text-green-600 font-medium">Active</span></>
                  : <><WifiOff className="w-3 h-3 text-gray-400" /><span className="text-xs text-gray-400">Disabled</span></>)
                  : <span className="text-xs text-muted-foreground">Not configured</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            {config && <Switch checked={isActive} onCheckedChange={() => toggleActive.mutate()} />}
            <Button variant="ghost" size="sm" onClick={loadForm}><Settings className="w-3.5 h-3.5" /></Button>
            {config && (
              <Button variant="ghost" size="sm" onClick={() => testConn.mutate()} disabled={testConn.isPending}>
                {testConn.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
              </Button>
            )}
          </div>
        </div>
        {config && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>Account: {(config.settings as any)?.tcsaccount || "—"} · Mode: {(config.settings as any)?.sandbox ? "Sandbox" : "Production"}</p>
            <p>Auth: {(config.settings as any)?.bearerToken ? "Bearer Token" : (config.settings as any)?.username ? "Username/Password" : "Not set"}</p>
          </div>
        )}
      </div>
      {editing && (
        <div className="border-t bg-white/60 p-4 space-y-3">
          <p className="font-medium text-sm">TCS API Configuration</p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
            Provide either a <strong>Static Bearer Token</strong> OR your <strong>Username + Password</strong> for auto token refresh. Both are used for live tracking.
          </div>
          <div className="space-y-2">
            <div><Label className="text-xs">Static Bearer Token</Label>
              <Input value={form.bearerToken} onChange={f("bearerToken")} placeholder="Paste TCS bearer token" className="text-xs mt-1" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Username / Client ID</Label>
                <Input value={form.username} onChange={f("username")} placeholder="TCS username" className="text-xs mt-1" /></div>
              <div><Label className="text-xs">Password / Client Secret</Label>
                <div className="relative mt-1">
                  <Input type={showPw ? "text" : "password"} value={form.password} onChange={f("password")} placeholder="TCS password" className="text-xs pr-8" />
                  <button onClick={() => setShowPw(!showPw)} className="absolute right-2 top-2 text-muted-foreground">
                    {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">TCS Account #</Label>
                <Input value={form.tcsaccount} onChange={f("tcsaccount")} placeholder="Account number" className="text-xs mt-1" /></div>
              <div><Label className="text-xs">Cost Center</Label>
                <Input value={form.costcentercode} onChange={f("costcentercode")} className="text-xs mt-1" /></div>
            </div>
            <div><Label className="text-xs">Shipper Name</Label>
              <Input value={form.shipperName} onChange={f("shipperName")} placeholder="Your business name" className="text-xs mt-1" /></div>
            <div><Label className="text-xs">Shipper Address</Label>
              <Input value={form.shipperAddress} onChange={f("shipperAddress")} className="text-xs mt-1" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Shipper City</Label>
                <Input value={form.shipperCity} onChange={f("shipperCity")} className="text-xs mt-1" /></div>
              <div><Label className="text-xs">City Code</Label>
                <Input value={form.shipperCityCode} onChange={f("shipperCityCode")} placeholder="e.g. LHE" className="text-xs mt-1" /></div>
            </div>
            <div><Label className="text-xs">Shipper Phone</Label>
              <Input value={form.shipperPhone} onChange={f("shipperPhone")} className="text-xs mt-1" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Default Weight (KG)</Label>
                <Input value={form.defaultWeight} onChange={f("defaultWeight")} type="number" step="0.1" className="text-xs mt-1" /></div>
              <div><Label className="text-xs">Default Service</Label>
                <select value={form.serviceCode} onChange={f("serviceCode")} className="w-full border rounded-lg px-2 py-1.5 text-xs bg-background mt-1">
                  {TCS_SERVICE_CODES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div><Label className="text-xs">Default Remarks</Label>
              <Input value={form.defaultRemarks} onChange={f("defaultRemarks")} className="text-xs mt-1" /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.fragile} onCheckedChange={v => setForm(p => ({ ...p, fragile: v }))} />
              <Label className="text-xs">Mark as Fragile by default</Label>
              <Switch checked={form.sandbox} onCheckedChange={v => setForm(p => ({ ...p, sandbox: v }))} className="ml-4" />
              <Label className="text-xs">Sandbox / Test Mode</Label>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="flex-1">
              {save.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "Save TCS Settings"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── PostEx Integration Card ───────────────────────── */
interface PostExFormState {
  apiToken: string; apiEndpoint: string;
  pickupAddress: string; pickupAddressCode: string; returnAddress: string;
  defaultWeight: string; shipperRemarks: string;
  shipperType: string; shipperHandling: string; labelPrintOption: string;
  autoOrderFulfillment: boolean; autoCalculateWeight: boolean;
  autoSaveTracking: boolean; autoCalculatePieces: boolean;
  markPaidAsZero: boolean; addOrderRemarks: boolean;
}

function PostExCourierCard({ preset }: { preset: typeof COURIER_PRESETS[0] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: couriers = [] } = useQuery({ queryKey: ["/api/admin/couriers"], queryFn: () => apiFetch("/api/admin/couriers") });
  const config = (couriers as any[]).find((c: any) => c.slug === "postex");
  const [editing, setEditing] = useState(false);
  const [showApiToken, setShowApiToken] = useState(false);
  const { data: postexAddresses = [], refetch: refetchAddresses } = useQuery<any[]>({
    queryKey: ["/api/admin/couriers/postex/addresses"],
    queryFn: () => apiFetch("/api/admin/couriers/postex/addresses"),
    enabled: editing && !!config?.apiKey,
    staleTime: 60_000,
  });
  const [form, setForm] = useState<PostExFormState>({
    apiToken: "", apiEndpoint: preset.apiEndpoint,
    pickupAddress: "", pickupAddressCode: "", returnAddress: "",
    defaultWeight: "0.25", shipperRemarks: "call before delivery",
    shipperType: "Normal", shipperHandling: "Normal", labelPrintOption: "Print Product Name",
    autoOrderFulfillment: true, autoCalculateWeight: true,
    autoSaveTracking: true, autoCalculatePieces: false,
    markPaidAsZero: true, addOrderRemarks: false,
  });

  const loadForm = () => {
    const s = (config?.settings ?? {}) as any;
    setForm({
      apiToken: config?.apiKey ?? "",
      apiEndpoint: config?.apiEndpoint ?? preset.apiEndpoint,
      pickupAddress: s.pickupAddress ?? "",
      pickupAddressCode: s.pickupAddressCode ?? "",
      returnAddress: s.returnAddress ?? "",
      defaultWeight: s.defaultWeight ?? "0.25",
      shipperRemarks: s.shipperRemarks ?? "call before delivery",
      shipperType: s.shipperType ?? "Normal",
      shipperHandling: s.shipperHandling ?? "Normal",
      labelPrintOption: s.labelPrintOption ?? "Print Product Name",
      autoOrderFulfillment: s.autoOrderFulfillment ?? true,
      autoCalculateWeight: s.autoCalculateWeight ?? true,
      autoSaveTracking: s.autoSaveTracking ?? true,
      autoCalculatePieces: s.autoCalculatePieces ?? false,
      markPaidAsZero: s.markPaidAsZero ?? true,
      addOrderRemarks: s.addOrderRemarks ?? false,
    });
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const { apiToken, apiEndpoint, ...settings } = form;
      const body = { name: "PostEx", slug: "postex", apiKey: apiToken, apiEndpoint, isActive: true, settings };
      return apiFetch("/api/admin/couriers", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/couriers"] }); setEditing(false); toast({ title: "PostEx settings saved" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const toggleActive = useMutation({
    mutationFn: () => {
      if (!config) return Promise.reject(new Error("Not configured yet"));
      return apiFetch(`/api/admin/couriers/${config.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !config.isActive }) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/couriers"] }),
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const f = (k: keyof PostExFormState) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));
  const tog = (k: keyof PostExFormState) => (v: boolean) => setForm(p => ({ ...p, [k]: v }));
  const isActive = config?.isActive ?? false;
  const s = (config?.settings ?? {}) as any;

  return (
    <div className={`border-2 rounded-xl overflow-hidden ${preset.color}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{preset.icon}</span>
            <div>
              <p className="font-semibold text-sm">{preset.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {config ? (isActive
                  ? <><Wifi className="w-3 h-3 text-green-500" /><span className="text-xs text-green-600 font-medium">Active</span></>
                  : <><WifiOff className="w-3 h-3 text-gray-400" /><span className="text-xs text-gray-400">Disabled</span></>)
                  : <span className="text-xs text-muted-foreground">Not configured</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            {config && <Switch checked={isActive} onCheckedChange={() => toggleActive.mutate()} />}
            <Button data-testid="postex-settings-btn" variant="ghost" size="sm" onClick={loadForm}><Settings className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
        {config && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>Token: {config.apiKey ? `${config.apiKey.slice(0, 10)}…` : "—"}</p>
            <p>Pickup: {s.pickupAddress ? s.pickupAddress.slice(0, 30) + "…" : "—"} · Type: {s.shipperType ?? "Normal"}</p>
          </div>
        )}
      </div>
      {editing && (
        <div className="border-t bg-white/60 p-4 space-y-3">
          <p className="font-medium text-sm">PostEx Courier</p>
          <p className="text-xs text-muted-foreground">Here you can enter PostEx Courier settings.</p>

          {/* Credentials */}
          <div>
            <Label className="text-xs">API Token *</Label>
            <div className="relative mt-1">
              <Input
                type={showApiToken ? "text" : "password"}
                value={form.apiToken}
                onChange={f("apiToken")}
                placeholder="Your PostEx API token"
                className="text-xs pr-9 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiToken(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showApiToken ? "Hide token" : "Show token"}
              >
                {showApiToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Addresses */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Pickup Address Code *</Label>
              <button type="button" onClick={() => refetchAddresses()} className="text-xs text-blue-500 hover:underline">Refresh</button>
            </div>
            {postexAddresses.length > 0 ? (
              <select
                value={form.pickupAddressCode}
                onChange={e => {
                  const selected = postexAddresses.find((a: any) => a.addressCode === e.target.value);
                  setForm(p => ({
                    ...p,
                    pickupAddressCode: e.target.value,
                    pickupAddress: selected?.address ?? p.pickupAddress,
                  }));
                }}
                className="w-full border rounded-lg px-2 py-1.5 text-xs bg-background mt-1"
              >
                <option value="">— Select Pickup Address —</option>
                {postexAddresses.map((a: any) => (
                  <option key={a.addressCode} value={a.addressCode}>
                    [{a.addressCode}] {a.addressType} — {a.address.slice(0, 40)}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-1 mt-1">
                <Input value={form.pickupAddressCode} onChange={f("pickupAddressCode")} placeholder='e.g. 001 (short code from PostEx)' className="text-xs" />
                {!config?.apiKey && <p className="text-xs text-muted-foreground">Save your API Token first to load addresses from PostEx.</p>}
              </div>
            )}
          </div>
          <div><Label className="text-xs">Pickup Address (text)</Label>
            <Input value={form.pickupAddress} onChange={f("pickupAddress")} placeholder="Auto-filled when address selected above" className="text-xs mt-1" /></div>
          <div><Label className="text-xs">Return Address</Label>
            <Input value={form.returnAddress} onChange={f("returnAddress")} placeholder="Same as Pickup Address" className="text-xs mt-1" /></div>

          {/* Defaults */}
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Default Weight (KG)</Label>
              <Input value={form.defaultWeight} onChange={f("defaultWeight")} type="number" step="0.01" className="text-xs mt-1" /></div>
            <div><Label className="text-xs">API Endpoint</Label>
              <Input value={form.apiEndpoint} onChange={f("apiEndpoint")} className="text-xs mt-1" /></div>
          </div>

          {/* Shipper Remarks */}
          <div><Label className="text-xs">Shipper Remarks</Label>
            <Input value={form.shipperRemarks} onChange={f("shipperRemarks")} placeholder="e.g. call before delivery" className="text-xs mt-1" /></div>

          {/* Dropdowns */}
          <div className="grid grid-cols-1 gap-2">
            <div>
              <Label className="text-xs">Shipper Type</Label>
              <select value={form.shipperType} onChange={f("shipperType")} className="w-full border rounded-lg px-2 py-1.5 text-xs bg-background mt-1">
                <option value="Normal">Normal</option>
                <option value="Express">Express</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Shipper Handling</Label>
              <select value={form.shipperHandling} onChange={f("shipperHandling")} className="w-full border rounded-lg px-2 py-1.5 text-xs bg-background mt-1">
                <option value="Normal">Normal</option>
                <option value="Fragile">Fragile</option>
                <option value="Dangerous Goods">Dangerous Goods</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Label Print Option</Label>
              <select value={form.labelPrintOption} onChange={f("labelPrintOption")} className="w-full border rounded-lg px-2 py-1.5 text-xs bg-background mt-1">
                <option value="Print Product Name">Print Product Name</option>
                <option value="Print Order ID">Print Order ID</option>
                <option value="Print Both">Print Both</option>
              </select>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2.5 pt-1">
            {([
              ["autoOrderFulfillment", "Auto Order Fulfillment"],
              ["autoCalculateWeight", "Auto Calculate Weight"],
              ["autoSaveTracking", "Auto Save Tracking Details"],
              ["autoCalculatePieces", "Auto Calculate Pieces"],
              ["markPaidAsZero", "Mark Paid Order as Zero"],
              ["addOrderRemarks", "Add Order Remarks"],
            ] as [keyof PostExFormState, string][]).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <Label className="text-xs">{label}</Label>
                <Switch checked={form[key] as boolean} onCheckedChange={tog(key)} />
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !form.apiToken} className="flex-1">
              {save.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "Save PostEx Settings"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CourierCard({ preset }: { preset: typeof COURIER_PRESETS[0] }) {
  if (preset.slug === "tcs") return <TcsCourierCard preset={preset} />;
  if (preset.slug === "postex") return <PostExCourierCard preset={preset} />;
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: couriers = [] } = useQuery({ queryKey: ["/api/admin/couriers"], queryFn: () => apiFetch("/api/admin/couriers") });
  const config = (couriers as any[]).find((c: any) => c.slug === preset.slug);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ apiKey: "", apiSecret: "", apiEndpoint: preset.apiEndpoint });

  const save = useMutation({
    mutationFn: () => {
      const body = { name: preset.name, slug: preset.slug, ...form, isActive: true };
      return apiFetch("/api/admin/couriers", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/couriers"] }); setEditing(false); toast({ title: `${preset.name} saved` }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const toggleActive = useMutation({
    mutationFn: () => {
      if (!config) return Promise.reject(new Error("Not configured yet"));
      return apiFetch(`/api/admin/couriers/${config.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !config.isActive }) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/couriers"] }),
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const loadForm = () => {
    if (config) setForm({ apiKey: config.apiKey ?? "", apiSecret: config.apiSecret ?? "", apiEndpoint: config.apiEndpoint ?? preset.apiEndpoint });
    setEditing(true);
  };

  const isActive = config?.isActive ?? false;
  return (
    <div className={`border-2 rounded-xl overflow-hidden ${preset.color}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{preset.icon}</span>
            <div>
              <p className="font-semibold text-sm">{preset.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {config ? (isActive
                  ? <><Wifi className="w-3 h-3 text-green-500" /><span className="text-xs text-green-600 font-medium">Active</span></>
                  : <><WifiOff className="w-3 h-3 text-gray-400" /><span className="text-xs text-gray-400">Disabled</span></>)
                  : <span className="text-xs text-muted-foreground">Not configured</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            {config && <Switch checked={isActive} onCheckedChange={() => toggleActive.mutate()} />}
            <Button variant="ghost" size="sm" onClick={loadForm}><Settings className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
        {config && <p className="text-xs text-muted-foreground">Key: {config.apiKey ? `${config.apiKey.slice(0, 8)}…` : "—"}</p>}
      </div>
      {editing && (
        <div className="border-t bg-white/60 p-4 space-y-3">
          <div><Label className="text-xs">API Key</Label><Input value={form.apiKey} onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))} className="text-xs mt-1" /></div>
          <div><Label className="text-xs">API Secret</Label><Input value={form.apiSecret} onChange={e => setForm(p => ({ ...p, apiSecret: e.target.value }))} className="text-xs mt-1" /></div>
          <div><Label className="text-xs">API Endpoint</Label><Input value={form.apiEndpoint} onChange={e => setForm(p => ({ ...p, apiEndpoint: e.target.value }))} className="text-xs mt-1" /></div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="flex-1">
              {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ShipmentCard({ shipment }: { shipment: any }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const refresh = useMutation({
    mutationFn: () => apiFetch(`/api/admin/shipments/${shipment.id}/refresh`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/shipments-v2"] }); qc.invalidateQueries({ queryKey: ["/api/admin/courier-analytics"] }); toast({ title: "Tracking refreshed" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  return (
    <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
      <div className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 bg-muted rounded-lg flex items-center justify-center text-lg shrink-0">
          {COURIER_ICONS[shipment.courierSlug] ?? "📦"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm capitalize">{shipment.courierSlug ?? "Unknown"}</span>
            <StatusBadge status={shipment.status} />
            {shipment.trackingId && <span className="text-xs font-mono text-blue-600">{shipment.trackingId}</span>}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
            {shipment.orderId && <span>Order #{shipment.orderId}</span>}
            {shipment.customerName && <span>{shipment.customerName}</span>}
            {shipment.customerPhone && <span>{shipment.customerPhone}</span>}
            <span>{new Date(shipment.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => printShipmentLabel(shipment.id)} title="Print Label">
            <Printer className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending} title="Refresh Tracking">
            <RefreshCw className={`w-3.5 h-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
          </Button>
          <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground p-1">
            <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border p-4 bg-muted/20 space-y-2">
          {(shipment.statusHistory ?? []).length > 0 ? (
            [...(shipment.statusHistory ?? [])].reverse().map((h: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <div>
                  <span className="font-semibold capitalize">{h.status.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground ml-2">{new Date(h.timestamp).toLocaleString()}</span>
                  {h.note && <span className="text-muted-foreground ml-2">— {h.note}</span>}
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">
              No tracking history.
              {shipment.rawResponse?.note && <span className="ml-1 text-orange-600"> ({shipment.rawResponse.note})</span>}
              {shipment.rawResponse?.error && <span className="ml-1 text-red-500"> {shipment.rawResponse.error}</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
export default function CouriersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("dashboard");

  /* Filters */
  const [filterCourier, setFilterCourier] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [shipSearch, setShipSearch] = useState("");
  const [shipStatus, setShipStatus] = useState("all");
  const [reportPeriod, setReportPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [syncCourier, setSyncCourier] = useState("tcs");
  const [syncIncludeFinalized, setSyncIncludeFinalized] = useState(false);

  /* Manual booking form */
  const [booking, setBooking] = useState({
    courierSlug: "tcs",
    customerName: "", phone: "", address: "", city: "", email: "",
    codAmount: "", weight: "0.5",
    serviceCode: "O", pieces: "1", fragile: false,
    remarks: "", contentDesc: "KDF Nuts Products",
    declaredValue: "", insuredValue: "",
    /* per-courier extra fields */
    specialInstructions: "",
    postexOrderType: "Normal",
    invoiceAmount: "",
  });

  const courierConf = COURIER_CONFIGS[booking.courierSlug] ?? COURIER_CONFIGS.tcs;
  const [bookingResult, setBookingResult] = useState<{ trackingId: string; shipmentId: number } | null>(null);

  /* Queries */
  const qs = (() => {
    const p = new URLSearchParams();
    if (filterCourier !== "all") p.set("courier", filterCourier);
    if (dateFrom) p.set("from", dateFrom);
    if (dateTo)   p.set("to",   dateTo);
    return p.toString();
  })();

  const { data: analytics, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery({
    queryKey: ["/api/admin/courier-analytics", qs],
    queryFn: () => apiFetch(`/api/admin/courier-analytics?${qs}`),
    refetchInterval: 60_000,
  });

  const { data: financial, isLoading: financialLoading } = useQuery({
    queryKey: ["/api/admin/courier-financial", filterCourier, dateFrom, dateTo],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filterCourier !== "all") p.set("courier", filterCourier);
      if (dateFrom) p.set("from", dateFrom);
      if (dateTo)   p.set("to",   dateTo);
      return apiFetch(`/api/admin/courier-financial?${p}`);
    },
    enabled: tab === "dashboard",
  });

  const { data: shipmentsData, isLoading: shipmentsLoading, refetch: refetchShipments } = useQuery({
    queryKey: ["/api/admin/shipments-v2", qs, shipStatus],
    queryFn: () => {
      const p = new URLSearchParams(qs);
      if (shipStatus !== "all") p.set("status", shipStatus);
      return apiFetch(`/api/admin/shipments-v2?${p}`);
    },
    enabled: tab === "shipments",
  });

  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ["/api/admin/courier-reports", reportPeriod],
    queryFn: () => apiFetch(`/api/admin/courier-reports?period=${reportPeriod}`),
    enabled: tab === "analytics",
  });

  const { data: courierSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/admin/settings/courier"],
    queryFn: () => apiFetch("/api/admin/settings/courier"),
    enabled: tab === "settings",
  });

  const { data: couriersRaw = [] } = useQuery({
    queryKey: ["/api/admin/couriers"],
    queryFn: () => apiFetch("/api/admin/couriers"),
  });

  const couriers: any[] = couriersRaw as any[];
  const activeCouriers = couriers.filter((c: any) => c.isActive);

  /* Settings state */
  const [settingsForm, setSettingsForm] = useState({
    defaultCourierSlug: "tcs", defaultServiceCode: "O", defaultWeight: "0.5",
    autoBooking: false, codDefault: true, defaultRemarks: "KDF NUTS Order",
    deliveryChargeRule: "flat", flatCharge: "200", freeAbove: "0",
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  if (courierSettings && !settingsLoaded) {
    setSettingsLoaded(true);
    setSettingsForm({
      defaultCourierSlug:  courierSettings.defaultCourierSlug ?? "tcs",
      defaultServiceCode:  courierSettings.defaultServiceCode ?? "O",
      defaultWeight:       String(courierSettings.defaultWeight ?? "0.5"),
      autoBooking:         courierSettings.autoBooking ?? false,
      codDefault:          courierSettings.codDefault ?? true,
      defaultRemarks:      courierSettings.defaultRemarks ?? "KDF NUTS Order",
      deliveryChargeRule:  courierSettings.deliveryChargeRule ?? "flat",
      flatCharge:          String(courierSettings.flatCharge ?? "200"),
      freeAbove:           String(courierSettings.freeAbove ?? "0"),
    });
  }

  /* Mutations */
  const bulkRefresh = useMutation({
    mutationFn: () => apiFetch("/api/admin/courier-analytics/bulk-refresh", { method: "POST" }),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/shipments-v2"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/courier-analytics"] });
      toast({ title: `Synced ${d.refreshed ?? 0} active shipments` });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const syncAll = useMutation({
    mutationFn: () => apiFetch("/api/admin/couriers/sync-all", {
      method: "POST",
      body: JSON.stringify({ courierSlug: syncCourier, includeFinalized: syncIncludeFinalized }),
    }),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/shipments-v2"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/courier-analytics"] });
      toast({ title: `Synced ${d.synced}/${d.total} shipments, ${d.changed} status changes` });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const saveSettings = useMutation({
    mutationFn: () => apiFetch("/api/admin/settings/courier", { method: "PUT", body: JSON.stringify({ ...settingsForm, defaultWeight: parseFloat(settingsForm.defaultWeight), flatCharge: parseFloat(settingsForm.flatCharge), freeAbove: parseFloat(settingsForm.freeAbove) }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/settings/courier"] }); toast({ title: "Courier settings saved" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const submitBooking = useMutation({
    mutationFn: () => apiFetch("/api/admin/couriers/manual-book", {
      method: "POST",
      body: JSON.stringify({
        courierSlug: booking.courierSlug,
        customerName: booking.customerName,
        phone: booking.phone,
        address: booking.address,
        city: booking.city,
        email: booking.email,
        codAmount: parseFloat(booking.codAmount) || 0,
        weight: parseFloat(booking.weight) || 0.5,
        serviceCode: booking.serviceCode,
        pieces: parseInt(booking.pieces) || 1,
        fragile: booking.fragile,
        remarks: booking.remarks,
        contentDesc: booking.contentDesc,
        declaredValue: booking.declaredValue ? parseFloat(booking.declaredValue) : null,
        insuredValue: booking.insuredValue ? parseFloat(booking.insuredValue) : null,
        /* per-courier extras */
        specialInstructions: booking.specialInstructions,
        postexOrderType: booking.postexOrderType,
        invoiceAmount: booking.invoiceAmount ? parseFloat(booking.invoiceAmount) : null,
      }),
    }),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/shipments-v2"] });
      setBookingResult({ trackingId: d.trackingId, shipmentId: d.shipment?.id });
      toast({ title: `Booked! ${courierConf.trackingLabel}: ${d.trackingId}` });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const bk = (k: keyof typeof booking) => (e: any) => setBooking(p => ({ ...p, [k]: e.target.value }));

  const a = analytics ?? {};
  const f = financial ?? {};
  const total = Number(a.total ?? 0);
  const shipments: any[] = shipmentsData?.shipments ?? [];

  const filtered = shipments.filter(s => {
    if (!shipSearch.trim()) return true;
    const q = shipSearch.toLowerCase();
    return s.trackingId?.toLowerCase().includes(q) || String(s.orderId).includes(q) ||
      s.customerPhone?.toLowerCase().includes(q) || s.customerName?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Courier Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Unified courier tracking, manual booking, label generation & analytics</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { refetchAnalytics(); refetchShipments(); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
          </Button>
          <Button size="sm" onClick={() => bulkRefresh.mutate()} disabled={bulkRefresh.isPending}>
            {bulkRefresh.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
            Sync Active
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* Shared Date + Courier Filters */}
      {["dashboard", "shipments"].includes(tab) && (
        <div className="flex flex-wrap gap-3 items-center">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select value={filterCourier} onChange={e => setFilterCourier(e.target.value)} className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background">
            <option value="all">All Couriers</option>
            {activeCouriers.map((c: any) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background" />
          <span className="text-muted-foreground text-sm">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background" />
          {(filterCourier !== "all" || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterCourier("all"); setDateFrom(""); setDateTo(""); }}>Clear</Button>
          )}
        </div>
      )}

      {/* ── DASHBOARD TAB ── */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          {analyticsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Package}       label="Total Shipments"    value={total}                                             color="bg-slate-500" />
              <StatCard icon={CheckCircle2}  label="Delivered"          value={a.delivered ?? 0}                                  color="bg-green-500" sub={total > 0 ? `${Math.round(((a.delivered??0)/total)*100)}% rate` : undefined} />
              <StatCard icon={Truck}         label="In Transit"         value={(a.in_transit??0)+(a.shipped??0)+(a.out_for_delivery??0)} color="bg-indigo-500" />
              <StatCard icon={Clock}         label="Pending"            value={(a.pending??0)+(a.processing??0)}                   color="bg-blue-500" />
              <StatCard icon={XCircle}       label="Failed"             value={a.failed ?? 0}                                     color="bg-red-500" />
              <StatCard icon={RotateCcw}     label="Returned"           value={a.returned ?? 0}                                   color="bg-rose-500" />
              <StatCard icon={AlertTriangle} label="Out for Delivery"   value={a.out_for_delivery ?? 0}                           color="bg-orange-500" />
              <StatCard icon={Bell}          label="Notifications Sent" value={a.notificationsSent ?? 0}                          color="bg-purple-500" sub="Auto WA/Email" />
            </div>
          )}

          {financialLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard icon={DollarSign}  label="Total Revenue"    value={fmt(f.totalRevenue ?? 0)}      color="bg-slate-500" />
                <StatCard icon={CheckCircle2}label="Delivered Revenue" value={fmt(f.deliveredRevenue ?? 0)} color="bg-green-500" trend="up" />
                <StatCard icon={Clock}       label="Pending Amount"   value={fmt(f.pendingRevenue ?? 0)}    color="bg-orange-500" />
                <StatCard icon={Wallet}      label="Amount Received"  value={fmt(f.receivedRevenue ?? 0)}   color="bg-emerald-500" />
                <StatCard icon={Truck}       label="Delivery Cost"    value={fmt(f.totalDeliveryCost ?? 0)} color="bg-blue-500" />
                <StatCard icon={TrendingUp}  label="Net Profit"       value={fmt(f.netProfit ?? 0)}         color={(f.netProfit ?? 0) >= 0 ? "bg-green-600" : "bg-red-600"} trend={(f.netProfit ?? 0) >= 0 ? "up" : "down"} />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <p className="font-semibold mb-2">Check & Balance</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Received",     value: fmt(f.receivedRevenue ?? 0),   color: "text-green-700" },
                    { label: "Pending",      value: fmt(f.pendingRevenue ?? 0),    color: "text-orange-600" },
                    { label: "Courier Cost", value: fmt(f.totalDeliveryCost ?? 0), color: "text-blue-700" },
                    { label: "Net Profit",   value: fmt(f.netProfit ?? 0), color: (f.netProfit ?? 0) >= 0 ? "text-green-700" : "text-red-600" },
                  ].map(item => (
                    <div key={item.label} className="bg-white rounded-lg p-3 border border-amber-100">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className={`font-bold ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><BarChart2 className="w-4 h-4 text-primary" />Delivery Performance</h3>
              {analyticsLoading ? <Skeleton className="h-32" /> : (
                <div className="space-y-3">
                  <RateBar label="Delivery Rate" value={a.delivered ?? 0} total={total} color="bg-green-500" />
                  <RateBar label="In Transit"    value={(a.in_transit??0)+(a.shipped??0)+(a.out_for_delivery??0)} total={total} color="bg-indigo-500" />
                  <RateBar label="Return Rate"   value={a.returned ?? 0} total={total} color="bg-rose-500" />
                  <RateBar label="Failure Rate"  value={a.failed ?? 0}   total={total} color="bg-red-500" />
                </div>
              )}
            </div>
            <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><Truck className="w-4 h-4 text-primary" />Courier Performance</h3>
              {analyticsLoading ? <Skeleton className="h-32" /> : (
                <div className="space-y-3">
                  {(a.byCourier ?? []).length === 0
                    ? <p className="text-sm text-muted-foreground">No shipment data yet.</p>
                    : (a.byCourier ?? []).map((c: any) => (
                      <div key={c.slug} className="flex items-center gap-3">
                        <div className="w-7 text-lg">{COURIER_ICONS[c.slug] ?? "📦"}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium">{c.name ?? c.slug}</span>
                            <span className="text-muted-foreground">{c.total} · {c.deliveryRate}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${c.deliveryRate}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Sync-All */}
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><RefreshCw className="w-4 h-4 text-primary" />Full Data Sync — Fix Missing TCS Data</h3>
            <p className="text-sm text-muted-foreground">Pull ALL shipments from the courier API regardless of status. Syncs old/historical data that was never fetched.</p>
            <div className="flex flex-wrap gap-3 items-center">
              <select value={syncCourier} onChange={e => setSyncCourier(e.target.value)} className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background">
                {COURIER_PRESETS.map(p => <option key={p.slug} value={p.slug}>{p.icon} {p.name}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={syncIncludeFinalized} onChange={e => setSyncIncludeFinalized(e.target.checked)} className="rounded" />
                Include delivered/returned
              </label>
              <Button size="sm" onClick={() => syncAll.mutate()} disabled={syncAll.isPending}>
                {syncAll.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Syncing…</> : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Sync All Shipments</>}
              </Button>
            </div>
          </div>

          {/* 7-day trend */}
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />Last 7 Days</h3>
            {analyticsLoading ? <Skeleton className="h-24" /> : (
              <div className="flex items-end gap-2 h-24">
                {(a.dailyTrend ?? []).length === 0
                  ? <p className="text-sm text-muted-foreground">No daily data available.</p>
                  : (a.dailyTrend ?? []).map((d: any) => {
                      const maxV = Math.max(...(a.dailyTrend ?? []).map((x: any) => x.total), 1);
                      const h = Math.max(8, Math.round((d.total / maxV) * 100));
                      return (
                        <div key={d.date} className="flex flex-col items-center gap-1 flex-1">
                          <span className="text-xs font-medium text-muted-foreground">{d.total}</span>
                          <div className="w-full rounded-t-sm bg-primary/80" style={{ height: `${h}%` }} />
                          <span className="text-[10px] text-muted-foreground">{d.label}</span>
                        </div>
                      );
                    })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── INTEGRATIONS TAB ── */}
      {tab === "integrations" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-blue-500" />
            TCS requires your bearer token or username+password to sync tracking. Once configured, use "Sync All Shipments" on the Dashboard to pull historical data.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {COURIER_PRESETS.map(preset => <CourierCard key={preset.slug} preset={preset} />)}
          </div>
        </div>
      )}

      {/* ── SHIPMENTS TAB ── */}
      {tab === "shipments" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={shipSearch} onChange={e => setShipSearch(e.target.value)} placeholder="Search tracking ID, order, customer…" className="pl-9" />
            </div>
            <select value={shipStatus} onChange={e => setShipStatus(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{filtered.length} shipments</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setTab("manual")}>
                <BookOpen className="w-3.5 h-3.5 mr-1.5" />New Booking
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetchShipments()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
              </Button>
            </div>
          </div>
          {shipmentsLoading
            ? <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
            : filtered.length === 0
              ? <div className="border rounded-xl bg-card p-12 text-center text-muted-foreground">
                  <Package className="w-10 h-10 opacity-20 mx-auto mb-3" />
                  <p className="font-semibold">No shipments found</p>
                  <p className="text-sm mt-2">
                    <button onClick={() => setTab("manual")} className="text-primary underline">Create a manual booking</button> to get started.
                  </p>
                </div>
              : <div className="space-y-3">{filtered.map(s => <ShipmentCard key={s.id} shipment={s} />)}</div>
          }
        </div>
      )}

      {/* ── MANUAL BOOKING TAB ── */}
      {tab === "manual" && (
        <div className="space-y-6 max-w-2xl">
          {bookingResult ? (
            /* Success state */
            <div className="border-2 border-green-300 bg-green-50 rounded-2xl p-8 text-center space-y-5">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-green-800">Booking Confirmed!</h2>
                <p className="text-green-700 mt-1">Your shipment has been booked successfully.</p>
              </div>
              <div className="bg-white border border-green-200 rounded-xl px-6 py-4 inline-block">
                <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">{courierConf.trackingLabel}</p>
                <p className="text-3xl font-black font-mono text-green-700 tracking-wider">{bookingResult.trackingId}</p>
                <p className="text-xs text-muted-foreground mt-1">{courierConf.name}</p>
              </div>
              <div className="flex gap-3 justify-center flex-wrap">
                <Button onClick={() => printShipmentLabel(bookingResult.shipmentId)} className="bg-green-600 hover:bg-green-700">
                  <Printer className="w-4 h-4 mr-2" />Print Label
                </Button>
                <Button variant="outline" onClick={() => { setBookingResult(null); setBooking(p => ({ ...p, customerName: "", phone: "", address: "", city: "", codAmount: "", remarks: "" })); }}>
                  Book Another
                </Button>
                <Button variant="outline" onClick={() => setTab("shipments")}>
                  View All Shipments
                </Button>
              </div>
            </div>
          ) : (
            /* Booking form */
            <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-primary/5 to-primary/10">
                <h2 className="text-lg font-bold flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" />Manual Shipment Booking</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Book a shipment via {courierConf.name} — get a real {courierConf.trackingLabel.toLowerCase()}.</p>
              </div>
              <div className="p-6 space-y-5">
                {/* Courier selector */}
                <div>
                  <Label className="text-sm font-semibold">Select Courier</Label>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {COURIER_PRESETS.map(p => (
                      <button key={p.slug}
                        onClick={() => setBooking(pr => ({
                          ...pr,
                          courierSlug: p.slug,
                          serviceCode: (COURIER_CONFIGS[p.slug]?.serviceTypes[0]?.code) ?? "O",
                        }))}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-sm font-medium transition-all ${booking.courierSlug === p.slug ? `border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20` : "border-border hover:border-primary/40"}`}>
                        <span className="text-2xl">{p.icon}</span>
                        <span className="text-[11px] font-semibold">{p.name.split(" ")[0]}</span>
                        {booking.courierSlug === p.slug && <span className="text-[9px] text-primary font-bold uppercase tracking-wider">{COURIER_CONFIGS[p.slug]?.trackingLabel}</span>}
                      </button>
                    ))}
                  </div>
                  {courierConf.note && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 mt-2 border">{courierConf.icon} {courierConf.note}</p>
                  )}
                </div>

                {/* Customer info */}
                <div>
                  <p className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Customer Info (Consignee)</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><Label className="text-xs">Customer Name *</Label>
                      <Input data-testid="booking-name" value={booking.customerName} onChange={bk("customerName")} placeholder="Full name" className="mt-1" /></div>
                    <div><Label className="text-xs">Phone Number *</Label>
                      <Input data-testid="booking-phone" value={booking.phone} onChange={bk("phone")} placeholder="03xx-xxxxxxx" className="mt-1" /></div>
                    <div className="md:col-span-2"><Label className="text-xs">Delivery Address *</Label>
                      <Input data-testid="booking-address" value={booking.address} onChange={bk("address")} placeholder="Street address" className="mt-1" /></div>
                    <div><Label className="text-xs">City *</Label>
                      <Input data-testid="booking-city" value={booking.city} onChange={bk("city")} placeholder="e.g. Karachi" className="mt-1" /></div>
                    <div><Label className="text-xs">Email (optional)</Label>
                      <Input value={booking.email} onChange={bk("email")} placeholder="customer@email.com" className="mt-1" /></div>
                  </div>
                </div>

                {/* Per-courier shipment details */}
                <div>
                  <p className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Shipment Details</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">

                    {/* COD / Invoice amount — always shown, label changes per courier */}
                    <div>
                      <Label className="text-xs">{courierConf.codLabel}</Label>
                      <Input value={booking.codAmount} onChange={bk("codAmount")} placeholder="0 if prepaid" type="number" className="mt-1" />
                    </div>

                    {/* PostEx: separate Invoice Amount field */}
                    {courierConf.fields.invoiceAmount && (
                      <div>
                        <Label className="text-xs">Invoice Amount (₨) <span className="text-muted-foreground">(if ≠ COD)</span></Label>
                        <Input value={booking.invoiceAmount} onChange={bk("invoiceAmount")} placeholder="Same as COD if empty" type="number" className="mt-1" />
                      </div>
                    )}

                    {/* Service type — per-courier options */}
                    <div>
                      <Label className="text-xs">Service Type</Label>
                      <select value={booking.serviceCode} onChange={bk("serviceCode")}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background mt-1">
                        {courierConf.serviceTypes.map(s => (
                          <option key={s.code} value={s.code}>{s.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Weight — shown per config */}
                    {courierConf.fields.weight && (
                      <div>
                        <Label className="text-xs">Weight (KG)</Label>
                        <Input value={booking.weight} onChange={bk("weight")} type="number" step="0.1" className="mt-1" />
                      </div>
                    )}

                    {/* Pieces — shown per config */}
                    {courierConf.fields.pieces && (
                      <div>
                        <Label className="text-xs">No. of Pieces</Label>
                        <Input value={booking.pieces} onChange={bk("pieces")} type="number" min="1" className="mt-1" />
                      </div>
                    )}

                    {/* TCS: declared + insured value */}
                    {courierConf.fields.declaredValue && (
                      <>
                        <div>
                          <Label className="text-xs">Declared Value</Label>
                          <Input value={booking.declaredValue} onChange={bk("declaredValue")} placeholder="Optional" type="number" className="mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Insured Value</Label>
                          <Input value={booking.insuredValue} onChange={bk("insuredValue")} placeholder="Optional" type="number" className="mt-1" />
                        </div>
                      </>
                    )}

                    {/* PostEx: order type */}
                    {courierConf.fields.postexOrderType && (
                      <div>
                        <Label className="text-xs">Order Type</Label>
                        <select value={booking.postexOrderType} onChange={bk("postexOrderType")}
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background mt-1">
                          {courierConf.serviceTypes.map(s => (
                            <option key={s.code} value={s.code}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Content description — TCS / PostEx */}
                  {courierConf.fields.contentDesc && (
                    <div className="mt-3">
                      <Label className="text-xs">Content Description</Label>
                      <Input value={booking.contentDesc} onChange={bk("contentDesc")} className="mt-1" />
                    </div>
                  )}

                  {/* Leopards: special instructions field */}
                  {courierConf.fields.specialInstructions ? (
                    <div className="mt-3">
                      <Label className="text-xs">Special Instructions</Label>
                      <Input value={booking.specialInstructions} onChange={bk("specialInstructions")} placeholder="Handle with care, fragile items, etc." className="mt-1" />
                    </div>
                  ) : (
                    <div className="mt-3">
                      <Label className="text-xs">Remarks</Label>
                      <Input value={booking.remarks} onChange={bk("remarks")} placeholder="Optional notes" className="mt-1" />
                    </div>
                  )}

                  {/* Fragile — TCS only */}
                  {courierConf.fields.fragile && (
                    <div className="flex items-center gap-2 mt-3">
                      <Switch checked={booking.fragile} onCheckedChange={v => setBooking(p => ({ ...p, fragile: v }))} />
                      <Label className="text-sm">Fragile Shipment</Label>
                    </div>
                  )}
                </div>

                {/* Submit */}
                <div className="flex gap-3 pt-2 border-t">
                  <Button
                    onClick={() => submitBooking.mutate()}
                    disabled={submitBooking.isPending || !booking.customerName || !booking.phone || !booking.address || !booking.city}
                    className="flex-1 h-11 text-base"
                  >
                    {submitBooking.isPending
                      ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Booking…</>
                      : <><BookOpen className="w-5 h-5 mr-2" />Book Shipment via {booking.courierSlug.toUpperCase()}</>}
                  </Button>
                </div>
                {!activeCouriers.find((c: any) => c.slug === booking.courierSlug) && (
                  <p className="text-xs text-amber-600 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {booking.courierSlug.toUpperCase()} is not configured. A local tracking number will be generated. Go to Integrations to add credentials.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ANALYTICS TAB ── */}
      {tab === "analytics" && (
        <div className="space-y-5">
          <div className="flex gap-2">
            {(["daily", "weekly", "monthly"] as const).map(p => (
              <button key={p} onClick={() => setReportPeriod(p)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${reportPeriod === p ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                {p}
              </button>
            ))}
          </div>
          {reportLoading ? <Skeleton className="h-64 rounded-xl" /> : (
            <div className="space-y-6">
              <div className="bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold mb-4 capitalize">{reportPeriod} Shipment Report</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b">
                      {["Period", "Total", "Delivered", "Returned", "Failed", "Success %"].map(h => (
                        <th key={h} className={`py-2 px-3 text-muted-foreground font-medium ${h === "Period" ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {(reportData?.periods ?? []).length === 0
                        ? <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No data for this period</td></tr>
                        : (reportData?.periods ?? []).map((p: any) => (
                          <tr key={p.period} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-3 font-mono text-xs">{p.period}</td>
                            <td className="py-2 px-3 text-right font-semibold">{p.total}</td>
                            <td className="py-2 px-3 text-right text-green-600">{p.delivered}</td>
                            <td className="py-2 px-3 text-right text-rose-500">{p.returned}</td>
                            <td className="py-2 px-3 text-right text-red-500">{p.failed}</td>
                            <td className="py-2 px-3 text-right">
                              <span className={`font-semibold ${p.total > 0 && Math.round((p.delivered/p.total)*100) >= 80 ? "text-green-600" : "text-orange-500"}`}>
                                {p.total > 0 ? Math.round((p.delivered / p.total) * 100) : 0}%
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold mb-4">Courier Comparison</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b">
                      {["Courier", "Total", "Delivered", "Returned", "Failed", "Delivery %", "Return %"].map(h => (
                        <th key={h} className={`py-2 px-3 text-muted-foreground font-medium ${h === "Courier" ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {(reportData?.courierPerf ?? []).length === 0
                        ? <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">No data</td></tr>
                        : (reportData?.courierPerf ?? []).map((c: any) => (
                          <tr key={c.slug} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <span>{COURIER_ICONS[c.slug] ?? "📦"}</span>
                                <span className="font-medium">{c.name ?? c.slug}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-semibold">{c.total}</td>
                            <td className="py-2 px-3 text-right text-green-600">{c.delivered}</td>
                            <td className="py-2 px-3 text-right text-rose-500">{c.returned}</td>
                            <td className="py-2 px-3 text-right text-red-500">{c.failed}</td>
                            <td className="py-2 px-3 text-right"><span className="font-semibold text-green-600">{c.deliveryRate}%</span></td>
                            <td className="py-2 px-3 text-right"><span className="text-rose-500">{c.returnRate}%</span></td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold mb-4">Financial by Courier</h3>
                <div className="space-y-3">
                  {(f.byCourier ?? []).length === 0
                    ? <p className="text-sm text-muted-foreground">No financial data.</p>
                    : (f.byCourier ?? []).map((c: any) => (
                      <div key={c.slug} className="border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span>{COURIER_ICONS[c.slug] ?? "📦"}</span>
                          <span className="font-medium capitalize">{c.slug}</span>
                          <Badge variant="outline" className="text-[10px] ml-auto">{c.total} shipments</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div><p className="text-muted-foreground">Revenue</p><p className="font-semibold">{fmt(c.revenue ?? 0)}</p></div>
                          <div><p className="text-muted-foreground">Delivery Cost</p><p className="font-semibold">{fmt(c.deliveryCost ?? 0)}</p></div>
                          <div><p className="text-muted-foreground">Delivered</p><p className="font-semibold text-green-600">{c.delivered}</p></div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {tab === "settings" && (
        <div className="space-y-6 max-w-2xl">
          {settingsLoading ? <Skeleton className="h-64 rounded-xl" /> : (
            <>
              {/* Default Courier */}
              <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" />Default Courier</h3>
                <p className="text-sm text-muted-foreground">The default courier used for new shipments and auto-booking.</p>
                <div className="grid grid-cols-2 gap-3">
                  {couriers.map((c: any) => (
                    <button key={c.slug} onClick={() => setSettingsForm(p => ({ ...p, defaultCourierSlug: c.slug }))}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 text-sm font-medium transition-all ${settingsForm.defaultCourierSlug === c.slug ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                      <span className="text-xl">{COURIER_ICONS[c.slug] ?? "📦"}</span>
                      <div className="text-left">
                        <p>{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.isActive ? "Active" : "Inactive"}</p>
                      </div>
                      {settingsForm.defaultCourierSlug === c.slug && <Star className="w-4 h-4 text-amber-500 ml-auto" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Service & Booking Defaults */}
              <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><Settings className="w-4 h-4 text-primary" />Booking Defaults</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-sm">Default Service Type</Label>
                    <select value={settingsForm.defaultServiceCode} onChange={e => setSettingsForm(p => ({ ...p, defaultServiceCode: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background mt-1">
                      {TCS_SERVICE_CODES.map(s => <option key={s.code} value={s.code}>{s.label} ({s.code})</option>)}
                    </select>
                  </div>
                  <div><Label className="text-sm">Default Weight (KG)</Label>
                    <Input value={settingsForm.defaultWeight} onChange={e => setSettingsForm(p => ({ ...p, defaultWeight: e.target.value }))} type="number" step="0.1" className="mt-1" /></div>
                </div>
                <div><Label className="text-sm">Default Remarks</Label>
                  <Input value={settingsForm.defaultRemarks} onChange={e => setSettingsForm(p => ({ ...p, defaultRemarks: e.target.value }))} className="mt-1" /></div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Auto-Booking</p>
                    <p className="text-xs text-muted-foreground">Automatically create a shipment when an order is confirmed</p>
                  </div>
                  <Switch checked={settingsForm.autoBooking} onCheckedChange={v => setSettingsForm(p => ({ ...p, autoBooking: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">COD as Default</p>
                    <p className="text-xs text-muted-foreground">Default payment method for manual bookings</p>
                  </div>
                  <Switch checked={settingsForm.codDefault} onCheckedChange={v => setSettingsForm(p => ({ ...p, codDefault: v }))} />
                </div>
              </div>

              {/* Delivery Charges */}
              <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><Truck className="w-4 h-4 text-primary" />Delivery Charge Rules</h3>
                <div>
                  <Label className="text-sm">Charge Rule</Label>
                  <select value={settingsForm.deliveryChargeRule} onChange={e => setSettingsForm(p => ({ ...p, deliveryChargeRule: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background mt-1">
                    <option value="flat">Flat Rate</option>
                    <option value="free">Always Free</option>
                    <option value="conditional">Free Above Amount</option>
                  </select>
                </div>
                {settingsForm.deliveryChargeRule === "flat" && (
                  <div><Label className="text-sm">Flat Charge (₨)</Label>
                    <Input value={settingsForm.flatCharge} onChange={e => setSettingsForm(p => ({ ...p, flatCharge: e.target.value }))} type="number" className="mt-1" /></div>
                )}
                {settingsForm.deliveryChargeRule === "conditional" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-sm">Flat Charge (₨)</Label>
                      <Input value={settingsForm.flatCharge} onChange={e => setSettingsForm(p => ({ ...p, flatCharge: e.target.value }))} type="number" className="mt-1" /></div>
                    <div><Label className="text-sm">Free Above (₨)</Label>
                      <Input value={settingsForm.freeAbove} onChange={e => setSettingsForm(p => ({ ...p, freeAbove: e.target.value }))} type="number" className="mt-1" /></div>
                  </div>
                )}
              </div>

              <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending} className="w-full h-11">
                {saveSettings.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : <><Settings className="w-4 h-4 mr-2" />Save Courier Settings</>}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
