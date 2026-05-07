import React, { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users, TrendingUp, AlertTriangle, Star, RefreshCw,
  Download, Upload, Search, ChevronLeft, ChevronRight,
  Package, Crown, Ban, Repeat2, UserPlus, BarChart2,
  ShoppingCart, Target, Zap, CheckCircle2, XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

async function apiFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

type Tab = "overview" | "customers" | "products" | "audiences" | "sync";

const SEGMENT_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string; desc: string }> = {
  HIGH_VALUE:  { label: "High Value",    icon: Crown,    color: "text-yellow-700", bg: "bg-yellow-50",  border: "border-yellow-200", desc: "High spend, multiple successful deliveries" },
  REPEAT:      { label: "Repeat Buyer",  icon: Repeat2,  color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200",   desc: "2+ delivered orders — loyal customers" },
  RISKY:       { label: "Risky",         icon: AlertTriangle, color: "text-red-700", bg: "bg-red-50", border: "border-red-200", desc: "<50% delivery rate — frequently rejects COD" },
  LOW_INTENT:  { label: "Low Intent",    icon: Ban,      color: "text-gray-700",   bg: "bg-gray-100",   border: "border-gray-300",   desc: "High cancellation rate — fake/window shoppers" },
  NEW:         { label: "New Customer",  icon: UserPlus, color: "text-green-700",  bg: "bg-green-50",   border: "border-green-200",  desc: "First-time buyer — needs onboarding" },
};

function SegmentBadge({ segment }: { segment: string }) {
  const m = SEGMENT_META[segment];
  if (!m) return <span className="text-xs text-muted-foreground">{segment}</span>;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${m.color} ${m.bg} ${m.border}`}>
      <Icon className="w-3 h-3" /> {m.label}
    </span>
  );
}

function DeliveryBar({ rate }: { rate: number }) {
  const color = rate >= 70 ? "bg-green-500" : rate >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${rate}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${rate >= 70 ? "text-green-700" : rate >= 40 ? "text-amber-600" : "text-red-600"}`}>
        {rate}%
      </span>
    </div>
  );
}

/* ─── Overview tab ─────────────────────────────────────── */
function OverviewTab({ data }: { data: any }) {
  if (!data) return <div className="text-center py-16 text-muted-foreground">No data yet. Sync Shopify orders first.</div>;

  const totalCustomers = data.totalCustomers || 1;
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Customers",    value: data.totalCustomers.toLocaleString(),   icon: Users,        color: "text-blue-600",   bg: "bg-blue-50" },
          { label: "Total Orders",       value: data.totalOrders.toLocaleString(),      icon: ShoppingCart, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Avg Delivery Rate",  value: `${data.avgDeliveryRate}%`,             icon: TrendingUp,   color: "text-green-600",  bg: "bg-green-50" },
          { label: "Total Revenue",      value: `PKR ${Number(data.totalRevenue).toLocaleString()}`, icon: BarChart2, color: "text-amber-600", bg: "bg-amber-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4.5 h-4.5 ${color}`} />
            </div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Segment distribution */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Target className="w-4 h-4 text-pink-500" /> Customer Segments</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {Object.entries(SEGMENT_META).map(([seg, meta]) => {
            const count = data.segments?.[seg] ?? 0;
            const pct = Math.round((count / totalCustomers) * 100);
            const Icon = meta.icon;
            return (
              <div key={seg} className={`rounded-xl border p-4 ${meta.bg} ${meta.border}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 ${meta.color}`} />
                  <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                </div>
                <p className={`text-2xl font-bold ${meta.color}`}>{count}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{pct}% of customers</p>
                <div className="mt-2 h-1.5 bg-white/60 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${seg === "HIGH_VALUE" ? "bg-yellow-500" : seg === "REPEAT" ? "bg-blue-500" : seg === "RISKY" ? "bg-red-500" : seg === "LOW_INTENT" ? "bg-gray-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">{meta.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top cities */}
      {data.topCities?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-blue-500" /> Top Customer Cities</h3>
          <div className="space-y-2">
            {data.topCities.map(({ city, count }: any) => {
              const max = data.topCities[0]?.count || 1;
              const pct = Math.round((count / max) * 100);
              return (
                <div key={city} className="flex items-center gap-3">
                  <span className="text-sm text-foreground w-28 truncate">{city}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Customers tab ─────────────────────────────────────── */
function CustomersTab() {
  const [segment, setSegment] = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [page,    setPage]    = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/intelligence/customers", segment, debouncedSearch, page],
    queryFn: () => apiFetch(`/api/admin/intelligence/customers?segment=${segment}&search=${encodeURIComponent(debouncedSearch)}&page=${page}&limit=50`),
    placeholderData: (prev: any) => prev,
  });

  const SEGS = ["ALL", "HIGH_VALUE", "REPEAT", "RISKY", "LOW_INTENT", "NEW"];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone or email…" className="pl-8 h-8 text-sm" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {SEGS.map(s => (
            <button key={s} onClick={() => { setSegment(s); setPage(1); }}
              className={`px-3 py-1 rounded-lg border text-xs font-medium transition-all ${segment === s ? "border-pink-400 bg-pink-50 text-pink-700" : "border-border bg-card text-muted-foreground hover:bg-accent"}`}>
              {s === "ALL" ? "All" : SEGMENT_META[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Segment</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground min-w-32">Delivery Rate</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Orders</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Delivered</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Cancelled</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Spent (PKR)</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Last Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
                ))
              ) : (data?.customers ?? []).length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">No customers found. Sync Shopify orders first.</td></tr>
              ) : (
                (data?.customers ?? []).map((c: any) => (
                  <tr key={c.customerKey} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">{c.phone ?? c.email ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3"><SegmentBadge segment={c.segment} /></td>
                    <td className="px-4 py-3 min-w-32"><DeliveryBar rate={c.deliveryRate} /></td>
                    <td className="px-4 py-3 text-right font-mono text-sm">{c.totalOrders}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-green-700 font-mono text-sm">{c.deliveredOrders}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-red-600 font-mono text-sm">{c.cancelledOrders}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold">
                      {c.totalSpent.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString("en-PK") : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{data.total} customers · Page {data.page} of {data.pages}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 w-7 p-0"><ChevronLeft className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages} className="h-7 w-7 p-0"><ChevronRight className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Products tab ─────────────────────────────────────── */
function ProductsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/intelligence/products"],
    queryFn: () => apiFetch("/api/admin/intelligence/products"),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: "High Conversion Products", filter: "HIGH_CONVERSION", color: "text-green-700", bg: "bg-green-50", border: "border-green-200", desc: "≥70% delivery rate", icon: CheckCircle2 },
          { label: "High Risk Products",       filter: "HIGH_RISK",       color: "text-red-700",   bg: "bg-red-50",   border: "border-red-200",   desc: "≥40% return rate",   icon: XCircle },
          { label: "Normal Products",          filter: "NORMAL",          color: "text-blue-700",  bg: "bg-blue-50",  border: "border-blue-200",  desc: "Average performance", icon: Package },
        ].map(({ label, filter, color, bg, border, desc, icon: Icon }) => {
          const count = (data?.products ?? []).filter((p: any) => p.risk === filter).length;
          return (
            <div key={filter} className={`${bg} ${border} border rounded-xl p-4`}>
              <Icon className={`w-4 h-4 ${color} mb-2`} />
              <p className={`text-xl font-bold ${color}`}>{count}</p>
              <p className="text-xs font-semibold text-foreground">{label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Product</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Risk Level</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground min-w-28">Delivery Rate</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Orders</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Delivered</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Returned</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Revenue (PKR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={7}><div className="h-4 bg-muted rounded animate-pulse mx-4 my-3" /></td></tr>
                ))
              ) : (data?.products ?? []).length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">No product data. Sync Shopify orders first.</td></tr>
              ) : (
                (data?.products ?? []).map((p: any) => (
                  <tr key={p.title} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm">{p.title}</p>
                      {p.sku && <p className="text-[11px] text-muted-foreground">SKU: {p.sku}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                        p.risk === "HIGH_CONVERSION" ? "bg-green-50 border-green-200 text-green-700" :
                        p.risk === "HIGH_RISK"       ? "bg-red-50 border-red-200 text-red-700" :
                                                       "bg-blue-50 border-blue-200 text-blue-700"
                      }`}>
                        {p.risk === "HIGH_CONVERSION" ? "✓ High Conversion" : p.risk === "HIGH_RISK" ? "⚠ High Risk" : "Normal"}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-28"><DeliveryBar rate={p.deliveryRate} /></td>
                    <td className="px-4 py-3 text-right font-mono text-sm">{p.totalOrders}</td>
                    <td className="px-4 py-3 text-right text-green-700 font-mono text-sm">{p.deliveredOrders}</td>
                    <td className="px-4 py-3 text-right text-red-600 font-mono text-sm">{p.returnedOrders}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold">
                      {p.revenue.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Audiences tab ─────────────────────────────────────── */
function AudiencesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/intelligence/audiences"],
    queryFn: () => apiFetch("/api/admin/intelligence/audiences"),
  });
  const { toast } = useToast();

  function exportCSV(segment: string, rows: any[]) {
    const headers = ["Name", "Phone", "Email", "Total Orders", "Delivered", "Total Spent (PKR)", "Delivery Rate %", "Last Order"];
    const csvRows = [headers.join(","), ...rows.map(r =>
      [r.name, r.phone ?? "", r.email ?? "", r.totalOrders, r.deliveredOrders, r.totalSpent, r.deliveryRate, r.lastOrderAt ? new Date(r.lastOrderAt).toLocaleDateString() : ""].join(",")
    )];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = `audience_${segment}_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${rows.length} ${segment} customers exported` });
  }

  const AUDIENCE_ORDER: string[] = ["HIGH_VALUE", "REPEAT", "NEW", "RISKY", "LOW_INTENT"];

  const AUDIENCE_USE: Record<string, string> = {
    HIGH_VALUE: "→ Use for VIP campaigns, loyalty rewards, exclusive offers",
    REPEAT:     "→ Use for re-engagement, upsell campaigns, referral programs",
    NEW:        "→ Use for onboarding sequences, welcome discounts",
    RISKY:      "→ Exclude from COD offers, require prepayment",
    LOW_INTENT: "→ Exclude from campaigns, flag for manual review",
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        <strong>Marketing-ready audience lists</strong> — export filtered customer lists for WhatsApp campaigns, Meta Ads, or email retargeting.
        Each list is automatically classified by purchase behavior and delivery history.
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {AUDIENCE_ORDER.map(seg => {
            const summary = (data?.summaries ?? []).find((s: any) => s.segment === seg);
            const rows    = data?.audiences?.[seg] ?? [];
            const m       = SEGMENT_META[seg];
            if (!m) return null;
            const Icon = m.icon;
            return (
              <div key={seg} className={`${m.bg} ${m.border} border rounded-xl p-5 space-y-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-5 h-5 ${m.color}`} />
                    <div>
                      <p className={`text-sm font-bold ${m.color}`}>{m.label}</p>
                      <p className={`text-2xl font-bold ${m.color} leading-tight`}>{summary?.count ?? 0}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs shrink-0"
                    onClick={() => exportCSV(seg, rows)} disabled={rows.length === 0}>
                    <Download className="w-3 h-3" /> CSV
                  </Button>
                </div>
                <div className="flex gap-3 text-[11px] text-muted-foreground">
                  <span>📱 {summary?.withPhone ?? 0} with phone</span>
                  <span>✉ {summary?.withEmail ?? 0} with email</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{AUDIENCE_USE[seg]}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Sync tab ─────────────────────────────────────────── */
function SyncTab() {
  const { toast } = useToast();
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  async function syncTags() {
    setSyncing(true); setSyncResult(null);
    try {
      const d = await apiFetch("/api/admin/intelligence/sync-tags", { method: "POST" });
      setSyncResult(d);
      toast({ title: "Shopify Tags Synced", description: `${d.synced} customers updated` });
    } catch (e: any) {
      setSyncResult({ error: e.message });
      toast({ title: "Sync Failed", description: e.message, variant: "destructive" });
    } finally { setSyncing(false); }
  }

  const TAG_LIST = [
    { tag: "HIGH_VALUE",       desc: "High spending customers with successful deliveries",   color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    { tag: "REPEAT_BUYER",     desc: "2+ successful deliveries — loyal repeat customers",    color: "bg-blue-100 text-blue-800 border-blue-300" },
    { tag: "NEW_CUSTOMER",     desc: "First-time buyers",                                    color: "bg-green-100 text-green-800 border-green-300" },
    { tag: "RISKY_CUSTOMER",   desc: "<50% delivery rate — high rejection probability",      color: "bg-red-100 text-red-800 border-red-300" },
    { tag: "LOW_INTENT",       desc: "High cancellation rate — avoid COD offers",           color: "bg-gray-100 text-gray-700 border-gray-300" },
  ];

  return (
    <div className="space-y-5">
      {/* Tag reference */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" /> Shopify Customer Tags</h3>
        <p className="text-xs text-muted-foreground mb-4">
          This sync writes computed segment tags directly to each customer profile in Shopify Admin. Existing segment tags are replaced; all other tags are preserved.
        </p>
        <div className="space-y-2">
          {TAG_LIST.map(({ tag, desc, color }) => (
            <div key={tag} className="flex items-center gap-3">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border font-mono ${color}`}>{tag}</span>
              <span className="text-xs text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Automation rules */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Target className="w-4 h-4 text-blue-500" /> Segmentation Rules</h3>
        <div className="space-y-3 text-sm">
          {[
            { rule: "Total Spend ≥ PKR 5,000 AND Delivered Orders ≥ 2", label: "HIGH_VALUE",     color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
            { rule: "Delivery Rate < 50% AND Total Orders ≥ 3",         label: "RISKY_CUSTOMER", color: "text-red-700 bg-red-50 border-red-200" },
            { rule: "Cancellation Rate ≥ 50% AND Delivery Rate < 30%",  label: "LOW_INTENT",     color: "text-gray-700 bg-gray-100 border-gray-300" },
            { rule: "Delivered Orders ≥ 2",                              label: "REPEAT_BUYER",   color: "text-blue-700 bg-blue-50 border-blue-200" },
            { rule: "Total Orders = 1 (catch-all for new buyers)",       label: "NEW_CUSTOMER",   color: "text-green-700 bg-green-50 border-green-200" },
          ].map(({ rule, label, color }) => (
            <div key={label} className="flex items-center gap-3 text-xs">
              <span className={`font-bold px-2 py-0.5 rounded border font-mono shrink-0 ${color}`}>{label}</span>
              <span className="text-muted-foreground">if {rule}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sync action */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-sm">Sync Tags to Shopify</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Pushes segment tags to all synced Shopify customer profiles. Respects Shopify API rate limits (200ms between requests).
          </p>
        </div>
        <Button onClick={syncTags} disabled={syncing} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
          {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {syncing ? "Syncing tags…" : "Sync Segment Tags to Shopify"}
        </Button>
        {syncResult && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${syncResult.error ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-800"}`}>
            {syncResult.error ? `❌ ${syncResult.error}` : (
              <div className="space-y-1">
                <p className="font-semibold">✓ Sync complete</p>
                <p>Updated: {syncResult.synced} · Failed: {syncResult.failed} · Total with Shopify ID: {syncResult.total}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────── */
export default function IntelligencePage() {
  const [tab, setTab] = useState<Tab>("overview");

  const { data: overview, isLoading: overviewLoading, refetch } = useQuery({
    queryKey: ["/api/admin/intelligence/overview"],
    queryFn: () => apiFetch("/api/admin/intelligence/overview"),
    refetchInterval: 60_000,
  });

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "overview",   label: "Overview",    icon: BarChart2 },
    { id: "customers",  label: "Customers",   icon: Users },
    { id: "products",   label: "Products",    icon: Package },
    { id: "audiences",  label: "Audiences",   icon: Target },
    { id: "sync",       label: "Shopify Sync",icon: Upload },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="w-6 h-6 text-amber-500" />
            Customer Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Delivery analysis, customer segmentation, and marketing audience builder — powered by Shopify order history
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap border-b border-border pb-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview"  && <OverviewTab data={overviewLoading ? null : overview} />}
      {tab === "customers" && <CustomersTab />}
      {tab === "products"  && <ProductsTab />}
      {tab === "audiences" && <AudiencesTab />}
      {tab === "sync"      && <SyncTab />}
    </div>
  );
}
