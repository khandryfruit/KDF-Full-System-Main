import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Search, MessageCircle, Users, ChevronLeft, ChevronRight, X,
  TrendingUp, ShoppingBag, Mail, Phone, Upload, FileText, AlertCircle,
  CheckCircle, Download, Crown, Repeat2, UserMinus, UserPlus, Smartphone,
  MapPin, Zap, Sparkles, Send, Loader2, Star,
  Brain, CheckCircle2, XCircle, AlertTriangle, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

const SEGMENTS = [
  { value: "all",        label: "All Customers" },
  { value: "vip",        label: "VIP (PKR 15K+)" },
  { value: "high_value", label: "High Value (5K+)" },
  { value: "repeat",     label: "Repeat Buyers" },
  { value: "new",        label: "New Customers" },
  { value: "inactive",   label: "Inactive (90d+)" },
  { value: "with_phone", label: "Has WhatsApp" },
  { value: "with_email", label: "Has Email" },
  { value: "marketing",  label: "Marketing Opt-in" },
  { value: "csv",        label: "CSV Imported" },
];

const PAKISTAN_CITIES = ["Lahore","Karachi","Islamabad","Rawalpindi","Multan","Faisalabad","Peshawar","Quetta","Sialkot","Gujranwala"];

const CSV_FIELD_MAP: Record<string, string[]> = {
  firstName: ["first_name","firstname","first name","fname"],
  lastName:  ["last_name","lastname","last name","lname"],
  email:     ["email","email address","e-mail"],
  phone:     ["phone","phone number","mobile","contact","whatsapp"],
  city:      ["city","town"],
  country:   ["country"],
  totalOrders: ["total_orders","orders","order_count"],
  totalSpent:  ["total_spent","spent","amount_spent","ltv"],
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  });
}

function mapRow(row: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(CSV_FIELD_MAP)) {
    for (const alias of aliases) {
      if (row[alias] !== undefined && row[alias] !== "") { mapped[field] = row[alias]; break; }
    }
  }
  return mapped;
}

/* ════════════════════════════════════════════════════════════
   DELIVERY INTELLIGENCE VIEW
   Uses existing intelligence endpoint — no new data source.
   Classifies per customer:
     FAKE_CUSTOMER  → returnedOrders ≥ 2
     RETURNED       → returnedOrders ≥ 1
     DELIVERED      → no returns
   ════════════════════════════════════════════════════════════ */
type DeliveryStatus = "DELIVERED" | "RETURNED" | "FAKE_CUSTOMER";

function getDeliveryStatus(c: { returnedOrders: number; cancelledOrders: number }): DeliveryStatus {
  if (c.returnedOrders >= 2) return "FAKE_CUSTOMER";
  if (c.returnedOrders >= 1) return "RETURNED";
  return "DELIVERED";
}

const STATUS_META: Record<DeliveryStatus, { label: string; icon: React.ElementType; color: string; bg: string; border: string; desc: string }> = {
  DELIVERED:     { label: "Delivered",     icon: CheckCircle2, color: "text-green-700", bg: "bg-green-50",  border: "border-green-200", desc: "Orders successfully delivered" },
  RETURNED:      { label: "Returned",      icon: AlertTriangle,color: "text-amber-700", bg: "bg-amber-50",  border: "border-amber-200", desc: "At least one returned order" },
  FAKE_CUSTOMER: { label: "Fake Customer", icon: ShieldAlert,  color: "text-red-700",  bg: "bg-red-50",    border: "border-red-200",   desc: "2+ returns — does not accept delivery" },
};

function StatusBadge({ status }: { status: DeliveryStatus }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${m.color} ${m.bg} ${m.border}`}>
      <Icon className="w-3 h-3" /> {m.label}
    </span>
  );
}

function DeliveryBar({ rate }: { rate: number }) {
  const color = rate >= 70 ? "bg-green-500" : rate >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-24">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-8 ${rate >= 70 ? "text-green-700" : rate >= 40 ? "text-amber-600" : "text-red-600"}`}>{rate}%</span>
    </div>
  );
}

function DeliveryIntelligenceView() {
  const [statusFilter, setStatusFilter] = useState<"ALL" | DeliveryStatus>("ALL");
  const [search, setSearch]             = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage]                 = useState(1);
  const PER_PAGE = 50;

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [statusFilter]);

  const token = localStorage.getItem("kdf_admin_token") ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["delivery-intelligence", "all"],
    queryFn: () =>
      fetch("/api/admin/intelligence/customers?limit=1000&page=1", {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      }).then(r => r.json()),
    staleTime: 60_000,
  });

  const enriched = (data?.customers ?? []).map((c: any) => ({
    ...c,
    deliveryStatus: getDeliveryStatus(c),
  }));

  const counts = {
    total:    enriched.length,
    delivered:  enriched.filter((c: any) => c.deliveryStatus === "DELIVERED").length,
    returned:   enriched.filter((c: any) => c.deliveryStatus === "RETURNED").length,
    fake:       enriched.filter((c: any) => c.deliveryStatus === "FAKE_CUSTOMER").length,
  };

  const filtered = enriched.filter((c: any) => {
    if (statusFilter !== "ALL" && c.deliveryStatus !== statusFilter) return false;
    if (debouncedSearch) {
      const hay = `${c.name} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase();
      if (!hay.includes(debouncedSearch.toLowerCase())) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Customers",    value: counts.total,     icon: Users,       bg: "bg-blue-50",   color: "text-blue-600",  filter: "ALL" },
          { label: "Delivered",          value: counts.delivered, icon: CheckCircle2,bg: "bg-green-50",  color: "text-green-700", filter: "DELIVERED" },
          { label: "Returned",           value: counts.returned,  icon: AlertTriangle,bg:"bg-amber-50",  color: "text-amber-700", filter: "RETURNED" },
          { label: "Fake Customers",     value: counts.fake,      icon: ShieldAlert, bg: "bg-red-50",    color: "text-red-700",   filter: "FAKE_CUSTOMER" },
        ].map(({ label, value, icon: Icon, bg, color, filter }) => (
          <button key={label}
            onClick={() => setStatusFilter(filter as any)}
            className={`${bg} border rounded-xl p-4 text-left hover:opacity-90 transition-opacity ${statusFilter === filter ? "ring-2 ring-primary ring-offset-1" : "border-border"}`}>
            <Icon className={`w-4 h-4 ${color} mb-2`} />
            <p className={`text-2xl font-bold ${color}`}>{isLoading ? "…" : value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">{label}</p>
          </button>
        ))}
      </div>

      {/* Description panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 space-y-1">
        <p className="font-semibold">Classification rules (based on Shopify order history):</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 mt-1">
          <span>✅ <strong>DELIVERED</strong> — 0 returned orders</span>
          <span>⚠️ <strong>RETURNED</strong> — 1 returned order</span>
          <span>🚫 <strong>FAKE CUSTOMER</strong> — 2+ returned orders</span>
        </div>
      </div>

      {/* Filter + Search bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone or email…" className="pl-8 h-9 text-sm" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["ALL", "DELIVERED", "RETURNED", "FAKE_CUSTOMER"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                statusFilter === s
                  ? s === "DELIVERED"     ? "bg-green-600 text-white border-green-600"
                  : s === "RETURNED"      ? "bg-amber-500 text-white border-amber-500"
                  : s === "FAKE_CUSTOMER" ? "bg-red-600 text-white border-red-600"
                  :                        "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}>
              {s === "ALL" ? "All Customers"
               : s === "DELIVERED" ? "✅ Delivered"
               : s === "RETURNED"  ? "⚠️ Returned"
               :                     "🚫 Fake Customers"}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length.toLocaleString()} customer{filtered.length !== 1 ? "s" : ""}
          {statusFilter !== "ALL" ? ` · ${STATUS_META[statusFilter as DeliveryStatus]?.label ?? statusFilter}` : ""}
        </p>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Orders</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Delivered</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Returned</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-28">Delivery Rate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No customers found</p>
                    <p className="text-xs mt-1">Sync Shopify orders first, then refresh this view.</p>
                  </td>
                </tr>
              ) : (
                paginated.map((c: any) => {
                  const status: DeliveryStatus = c.deliveryStatus;
                  return (
                    <tr key={c.customerKey}
                      className={`hover:bg-muted/20 transition-colors ${
                        status === "FAKE_CUSTOMER" ? "bg-red-50/40" :
                        status === "RETURNED"      ? "bg-amber-50/30" : ""
                      }`}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{c.name}</p>
                        {c.email && <p className="text-[11px] text-muted-foreground">{c.email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {c.phone
                          ? <span className="flex items-center gap-1.5 text-sm"><Phone className="w-3 h-3 text-muted-foreground" />{c.phone}</span>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold">{c.totalOrders}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-sm font-semibold text-green-700">{c.deliveredOrders}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono text-sm font-semibold ${c.returnedOrders > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                          {c.returnedOrders}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <DeliveryBar rate={c.deliveryRate} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{filtered.length} results · Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 w-7 p-0">
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-7 w-7 p-0">
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ShopifyCustomersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("all");
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [waMessage, setWaMessage] = useState("");
  const [waTarget, setWaTarget] = useState<any>(null);
  const [showImport, setShowImport] = useState(false);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvError, setCsvError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* View toggle */
  const [view, setView] = useState<"customers" | "delivery">("customers");

  /* Campaign state */
  const [showCampaign, setShowCampaign] = useState(false);
  const [campaignMsg, setCampaignMsg] = useState("");
  const [campaignStep, setCampaignStep] = useState<"compose"|"confirm">("compose");

  /* ── Queries ── */
  const { data, isLoading } = useQuery({
    queryKey: ["shopify-customers", page, search, segment, selectedCities.join(",")],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "20", search, segment });
      if (selectedCities.length > 0) params.set("cities", selectedCities.join(","));
      return api(`/admin/shopify/customers?${params}`).then(r => r.json());
    },
  });

  const { data: segments } = useQuery({
    queryKey: ["shopify-customer-segments"],
    queryFn: () => api("/admin/shopify/customers/segments").then(r => r.json()),
    staleTime: 60_000,
  });

  const { data: citiesData } = useQuery({
    queryKey: ["shopify-customer-cities"],
    queryFn: () => api("/admin/shopify/customers/cities").then(r => r.json()),
    staleTime: 300_000,
  });

  const customerDetail = useQuery({
    queryKey: ["shopify-customer-detail", selectedCustomer?.id],
    queryFn: () => api(`/admin/shopify/customers/${selectedCustomer.id}`).then(r => r.json()),
    enabled: !!selectedCustomer,
  });

  /* ── Mutations ── */
  const syncMutation = useMutation({
    mutationFn: () => api("/admin/shopify/sync/customers", { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["shopify-customers"] }); toast({ title: `${d.synced} customers synced` }); },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: (customers: any[]) => api("/admin/shopify/customers/import", { method: "POST", body: JSON.stringify({ customers }) }).then(r => r.json()),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["shopify-customers"] });
      setShowImport(false); setCsvPreview([]); setCsvFileName("");
      toast({ title: `Import complete: ${d.imported} imported, ${d.skipped} skipped` });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const waMutation = useMutation({
    mutationFn: ({ id, message }: any) => api(`/admin/shopify/customers/${id}/whatsapp`, { method: "POST", body: JSON.stringify({ message }) }).then(r => r.json()),
    onSuccess: () => { setWaTarget(null); setWaMessage(""); toast({ title: "WhatsApp message sent" }); },
    onError: (e: any) => toast({ title: e?.message ?? "Failed to send", variant: "destructive" }),
  });

  const campaignMutation = useMutation({
    mutationFn: () => api("/admin/shopify/customers/campaign/whatsapp", {
      method: "POST",
      body: JSON.stringify({ message: campaignMsg, segment, cities: selectedCities }),
    }).then(r => r.json()),
    onSuccess: (d) => {
      setShowCampaign(false); setCampaignMsg(""); setCampaignStep("compose");
      toast({ title: `Campaign sent to ${d.sent} customers` });
    },
    onError: () => toast({ title: "Campaign failed", variant: "destructive" }),
  });

  const aiMsgMutation = useMutation({
    mutationFn: () => api("/admin/shopify/customers/ai-message", {
      method: "POST",
      body: JSON.stringify({ segment, cities: selectedCities }),
    }).then(r => r.json()),
    onSuccess: (d) => { if (d.message) setCampaignMsg(d.message); },
    onError: () => toast({ title: "AI generation failed", variant: "destructive" }),
  });

  /* ── Derived ── */
  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);
  const topCities: Array<{city: string; count: number}> = citiesData?.cities ?? [];

  /* VIP threshold = PKR 15,000 */
  const isVip = (c: any) => parseFloat(c.totalSpent ?? "0") >= 15000;
  const isHighValue = (c: any) => parseFloat(c.totalSpent ?? "0") >= 5000;

  const openWa = (c: any) => {
    setWaTarget(c);
    setWaMessage(`Hi ${c.firstName ?? "there"}! Thank you for being a valued KDF NUTS customer. 🙏`);
  };

  const toggleCity = (city: string) => {
    setSelectedCities(prev =>
      prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]
    );
    setPage(1);
  };

  const openCampaign = () => {
    const seg = SEGMENTS.find(s => s.value === segment);
    const cityLabel = selectedCities.length > 0 ? ` in ${selectedCities.join(", ")}` : "";
    const segLabel = seg?.label ?? "All Customers";
    setCampaignMsg(`Hi {name}! 👋\n\nThank you for shopping with KDF NUTS! We have an exclusive offer just for you.\n\n🎁 Use code: KDFSPECIAL for 15% OFF on your next order!\n\nShop now at kdfnuts.com 🛒`);
    setCampaignStep("compose");
    setShowCampaign(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(""); setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) { setCsvError("No valid rows found in CSV file."); return; }
      const mapped = rows.map(r => mapRow(r)).filter(r => r.email || r.phone);
      if (mapped.length === 0) { setCsvError("No rows with email or phone found."); return; }
      setCsvPreview(mapped);
    };
    reader.onerror = () => setCsvError("Failed to read file.");
    reader.readAsText(file);
    e.target.value = "";
  };

  const downloadSampleCSV = () => {
    const sample = "first_name,last_name,email,phone,city,country\nAhmed,Khan,ahmed@example.com,03001234567,Karachi,Pakistan\nFatima,Ali,fatima@example.com,03211234567,Lahore,Pakistan";
    const blob = new Blob([sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "kdf_customers_sample.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Active filter description for campaign modal ── */
  const activeFilterLabel = () => {
    const parts: string[] = [];
    const seg = SEGMENTS.find(s => s.value === segment);
    if (segment !== "all") parts.push(seg?.label ?? segment);
    if (selectedCities.length > 0) parts.push(selectedCities.join(", "));
    return parts.length ? parts.join(" · ") : "All Customers";
  };

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground text-sm">{total.toLocaleString()} customers matched</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { setShowImport(true); setCsvPreview([]); setCsvFileName(""); setCsvError(""); }} className="gap-1.5">
            <Upload className="w-4 h-4" /> Import CSV
          </Button>
          <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="gap-1.5">
            <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing..." : "Sync Shopify"}
          </Button>
          <Button onClick={openCampaign} className="gap-1.5 bg-[#25D366] hover:bg-[#1ea855] text-white">
            <Send className="w-4 h-4" /> Send Campaign
          </Button>
        </div>
      </div>

      {/* ── View Tab Bar ── */}
      <div className="flex gap-1 border-b border-border -mb-1">
        <button onClick={() => setView("customers")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${view === "customers" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <Users className="w-3.5 h-3.5" /> Customer List
        </button>
        <button onClick={() => setView("delivery")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${view === "delivery" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <Brain className="w-3.5 h-3.5" /> Delivery Intelligence
        </button>
      </div>

      {/* ── Delivery Intelligence Tab ── */}
      {view === "delivery" && <DeliveryIntelligenceView />}

      {/* ── Segment Stats Bar ── */}
      {view === "customers" && segments && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { label: "Total",      value: segments.total,          icon: Users,      color: "text-blue-600 bg-blue-50",    seg: "all" },
            { label: "VIP",        value: segments.vip,            icon: Star,       color: "text-yellow-600 bg-yellow-50", seg: "vip" },
            { label: "High Value", value: segments.highValue,      icon: Crown,      color: "text-amber-600 bg-amber-50",  seg: "high_value" },
            { label: "Repeat",     value: segments.repeat,         icon: Repeat2,    color: "text-green-600 bg-green-50",  seg: "repeat" },
            { label: "New (30d)",  value: segments.newCustomers,   icon: UserPlus,   color: "text-indigo-600 bg-indigo-50", seg: "new" },
            { label: "Inactive",   value: segments.inactive,       icon: UserMinus,  color: "text-red-500 bg-red-50",      seg: "inactive" },
            { label: "With Phone", value: segments.withPhone,      icon: Smartphone, color: "text-teal-600 bg-teal-50",   seg: "with_phone" },
            { label: "Marketing",  value: segments.marketingOptIn, icon: TrendingUp, color: "text-orange-600 bg-orange-50", seg: "marketing" },
          ].map(({ label, value, icon: Icon, color, seg }) => (
            <button key={label} onClick={() => { if (seg) { setSegment(seg); setPage(1); } }}
              className={`flex flex-col items-start p-3 rounded-xl border border-border bg-card hover:shadow-sm transition-shadow text-left cursor-pointer ${segment === seg ? "ring-2 ring-primary" : ""}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-1.5 ${color}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <p className="text-lg font-bold leading-none">{((value ?? 0) as number).toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
            </button>
          ))}
        </div>
      )}

      {view === "customers" && <>
      {/* ── City Filter Bar ── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Filter by City</span>
          {selectedCities.length > 0 && (
            <button onClick={() => { setSelectedCities([]); setPage(1); }}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="w-3 h-3" />Clear cities
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setSelectedCities([]); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${selectedCities.length === 0 ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"}`}>
            🇵🇰 All Pakistan
          </button>
          {/* Cities from DB, fallback to known cities */}
          {(topCities.length > 0 ? topCities.slice(0, 20) : PAKISTAN_CITIES.map(c => ({ city: c, count: 0 }))).map(({ city, count }) => (
            <button key={city} onClick={() => toggleCity(city)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${selectedCities.includes(city) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"}`}>
              {city}
              {count > 0 && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${selectedCities.includes(city) ? "bg-white/20" : "bg-muted"}`}>{count.toLocaleString()}</span>}
            </button>
          ))}
        </div>
        {selectedCities.length > 0 && (
          <p className="text-xs text-primary font-medium">
            Showing customers in: {selectedCities.join(", ")}
          </p>
        )}
      </div>

      {/* ── Segment Filter Pills ── */}
      <div className="flex gap-2 flex-wrap">
        {SEGMENTS.map(s => (
          <button key={s.value} onClick={() => { setSegment(s.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${segment === s.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, email, phone, or city..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      {/* ── Campaign Quick Bar (when filtered) ── */}
      {(segment !== "all" || selectedCities.length > 0) && total > 0 && (
        <div className="flex items-center justify-between bg-[#25D366]/8 border border-[#25D366]/30 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Zap className="w-4 h-4 text-[#25D366]" />
            <span className="font-medium">{total.toLocaleString()} customers</span>
            <span className="text-muted-foreground">matching <strong>{activeFilterLabel()}</strong></span>
          </div>
          <Button size="sm" onClick={openCampaign} className="bg-[#25D366] hover:bg-[#1ea855] text-white gap-1.5">
            <Send className="w-3.5 h-3.5" /> WhatsApp Campaign
          </Button>
        </div>
      )}

      {/* ── Customer Table ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No customers found</p>
            <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or sync from Shopify</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                {["Customer", "Contact", "City", "Orders", "Total Spent", "Source", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {customers.map((c: any) => {
                  const vip = isVip(c);
                  const highVal = isHighValue(c);
                  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown";
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {vip && (
                            <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0" title="VIP Customer">
                              <Star className="w-3 h-3 text-yellow-600 fill-yellow-500" />
                            </div>
                          )}
                          <div>
                            <button className="font-medium text-primary hover:underline text-left flex items-center gap-1.5" onClick={() => setSelectedCustomer(c)}>
                              {name}
                              {vip && <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-bold">VIP</span>}
                              {!vip && highVal && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">HV</span>}
                            </button>
                            {c.tags && <div className="text-xs text-muted-foreground mt-0.5">{c.tags.split(",").slice(0, 2).join(", ")}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs space-y-0.5">
                          {c.email && <div className="flex items-center gap-1 text-muted-foreground"><Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate max-w-[160px]">{c.email}</span></div>}
                          {c.phone && <div className="flex items-center gap-1 text-muted-foreground"><Phone className="w-3 h-3 flex-shrink-0" />{c.phone}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {c.city ? (
                          <button onClick={() => { toggleCity(c.city); }}
                            className="flex items-center gap-1 text-sm text-foreground hover:text-primary transition-colors">
                            <MapPin className="w-3 h-3 text-muted-foreground" />{c.city}
                          </button>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1"><ShoppingBag className="w-3.5 h-3.5 text-muted-foreground" />{c.totalOrders}</span>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <span className={`flex items-center gap-1 ${vip ? "text-yellow-700" : highVal ? "text-amber-700" : ""}`}>
                          <TrendingUp className={`w-3.5 h-3.5 ${vip ? "text-yellow-500" : "text-green-500"}`} />
                          PKR {parseFloat(c.totalSpent ?? "0").toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.source === "csv" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                          {c.source === "csv" ? "CSV" : "Shopify"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {c.phone && (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-[#25D366] hover:bg-green-50" onClick={() => openWa(c)} title="Send WhatsApp">
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setSelectedCustomer(c)}>View</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {totalPages} ({total.toLocaleString()} customers)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}
      </>}

      {/* ══════════════════════════════════════════
          CAMPAIGN MODAL
      ══════════════════════════════════════════ */}
      {showCampaign && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="font-bold text-lg flex items-center gap-2"><MessageCircle className="w-5 h-5 text-[#25D366]" /> WhatsApp Campaign</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Send to: <strong>{activeFilterLabel()}</strong> · {total.toLocaleString()} customers</p>
              </div>
              <button onClick={() => setShowCampaign(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            {campaignStep === "compose" && (
              <div className="p-5 space-y-4">
                {/* Target summary */}
                <div className="bg-muted/50 rounded-lg px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#25D366]/10 flex items-center justify-center">
                    <Users className="w-4 h-4 text-[#25D366]" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{total.toLocaleString()} customers targeted</p>
                    <p className="text-xs text-muted-foreground">{activeFilterLabel()}</p>
                  </div>
                </div>

                {/* Message composer */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold">Message</label>
                    <Button size="sm" variant="outline" onClick={() => aiMsgMutation.mutate()}
                      disabled={aiMsgMutation.isPending} className="gap-1.5 text-xs h-7">
                      {aiMsgMutation.isPending ? <><Loader2 className="w-3 h-3 animate-spin" />Generating…</> : <><Sparkles className="w-3 h-3 text-purple-500" />AI Generate</>}
                    </Button>
                  </div>
                  <textarea
                    className="w-full border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary min-h-[160px]"
                    rows={7}
                    value={campaignMsg}
                    onChange={e => setCampaignMsg(e.target.value)}
                    placeholder="Write your WhatsApp message here...&#10;&#10;Use {name} to personalize with customer name."
                  />
                  <p className="text-xs text-muted-foreground mt-1">Tip: Use <code className="bg-muted px-1 rounded">{"{name}"}</code> for the customer's first name.</p>
                </div>

                {/* Template hints */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Templates</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {[
                      { label: "Festival Sale", msg: "Hi {name}! 🎉 Eid Mubarak from KDF NUTS!\n\nEnjoy 20% OFF on all dry fruits this Eid!\n🎁 Use code: EID20\n\nShop now: kdfnuts.com" },
                      { label: "VIP Offer", msg: "Hi {name}! ⭐ You're our VIP customer!\n\nAs a token of appreciation, here's an exclusive 25% discount just for you.\n🎁 Code: VIP25\n\nOrder now: kdfnuts.com" },
                      { label: "Restock Alert", msg: "Hi {name}! 🥜 Great news!\n\nYour favorite premium dry fruits are back in stock!\n\nOrder now before they run out: kdfnuts.com" },
                    ].map(t => (
                      <button key={t.label} onClick={() => setCampaignMsg(t.msg)}
                        className="text-left text-xs px-3 py-2 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors">
                        <span className="font-medium">{t.label}</span> — <span className="text-muted-foreground">{t.msg.slice(0, 60)}…</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button className="flex-1" onClick={() => setCampaignStep("confirm")} disabled={!campaignMsg.trim()}>
                    Preview & Confirm →
                  </Button>
                  <Button variant="outline" onClick={() => setShowCampaign(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {campaignStep === "confirm" && (
              <div className="p-5 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>You are about to send this message to <strong>{total.toLocaleString()} customers</strong> who have a phone number. This action cannot be undone.</span>
                </div>

                {/* Message preview */}
                <div className="bg-[#25D366]/5 border border-[#25D366]/20 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5"><MessageCircle className="w-3 h-3 text-[#25D366]" />Message Preview</p>
                  <p className="text-sm whitespace-pre-line text-gray-800">
                    {campaignMsg.replace(/\{name\}/gi, "Ahmed")}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1 bg-[#25D366] hover:bg-[#1ea855] text-white gap-1.5"
                    onClick={() => campaignMutation.mutate()} disabled={campaignMutation.isPending}>
                    {campaignMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : <><Send className="w-4 h-4" />Send to {total.toLocaleString()} Customers</>}
                  </Button>
                  <Button variant="outline" onClick={() => setCampaignStep("compose")}>← Edit</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          CUSTOMER DETAIL DRAWER
      ══════════════════════════════════════════ */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-end">
          <div className="bg-card border-l border-border w-full max-w-md h-full overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
              <div>
                <div className="flex items-center gap-2">
                  {isVip(selectedCustomer) && <Star className="w-4 h-4 text-yellow-500 fill-yellow-400" />}
                  <h2 className="font-bold">{[selectedCustomer.firstName, selectedCustomer.lastName].filter(Boolean).join(" ") || "Customer"}</h2>
                  {isVip(selectedCustomer) && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold">VIP</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${selectedCustomer.source === "csv" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                  {selectedCustomer.source === "csv" ? "CSV Import" : "Shopify"}
                </span>
              </div>
              <button onClick={() => setSelectedCustomer(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{selectedCustomer.totalOrders}</p>
                  <p className="text-xs text-blue-600">Orders</p>
                </div>
                <div className={`border rounded-lg p-3 text-center ${isVip(selectedCustomer) ? "bg-yellow-50 border-yellow-100" : "bg-green-50 border-green-100"}`}>
                  <p className={`text-lg font-bold ${isVip(selectedCustomer) ? "text-yellow-700" : "text-green-700"}`}>PKR {parseFloat(selectedCustomer.totalSpent ?? "0").toLocaleString()}</p>
                  <p className={`text-xs ${isVip(selectedCustomer) ? "text-yellow-600" : "text-green-600"}`}>Total Spent {isVip(selectedCustomer) ? "⭐" : ""}</p>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                {selectedCustomer.email && <div className="flex gap-2"><Mail className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" /><span>{selectedCustomer.email}</span></div>}
                {selectedCustomer.phone && <div className="flex gap-2"><Phone className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" /><span>{selectedCustomer.phone}</span></div>}
                {selectedCustomer.city && (
                  <div className="flex gap-2 items-center">
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{selectedCustomer.city}{selectedCustomer.country ? `, ${selectedCustomer.country}` : ""}</span>
                    <button onClick={() => { toggleCity(selectedCustomer.city); setSelectedCustomer(null); }}
                      className="text-xs text-primary hover:underline">Filter by city</button>
                  </div>
                )}
                {selectedCustomer.tags && <div><span className="text-muted-foreground">Tags: </span>{selectedCustomer.tags}</div>}
              </div>
              {selectedCustomer.phone && (
                <Button className="w-full gap-2 bg-[#25D366] hover:bg-[#1ea855] text-white" onClick={() => openWa(selectedCustomer)}>
                  <MessageCircle className="w-4 h-4" /> Send WhatsApp
                </Button>
              )}
              {customerDetail.data?.orders?.length > 0 && (
                <div>
                  <p className="font-semibold mb-3 text-sm">Order History</p>
                  <div className="space-y-2">
                    {customerDetail.data.orders.map((o: any) => (
                      <div key={o.id} className="border border-border rounded-lg p-3 text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">{o.orderNumber}</span>
                          <span className="font-medium">PKR {parseFloat(o.totalPrice ?? "0").toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span className="capitalize">{o.status}</span>
                          <span>{o.shopifyCreatedAt ? new Date(o.shopifyCreatedAt).toLocaleDateString() : "—"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          WHATSAPP MODAL (per-customer)
      ══════════════════════════════════════════ */}
      {waTarget && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2"><MessageCircle className="w-4 h-4 text-[#25D366]" />Send WhatsApp</h3>
              <button onClick={() => setWaTarget(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              To: <strong>{[waTarget.firstName, waTarget.lastName].filter(Boolean).join(" ")}</strong> · {waTarget.phone}
              {waTarget.city && <span> · {waTarget.city}</span>}
            </p>
            <textarea className="w-full border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              rows={5} value={waMessage} onChange={e => setWaMessage(e.target.value)} />
            <div className="flex gap-2 mt-4">
              <Button className="flex-1 bg-[#25D366] hover:bg-[#1ea855] text-white"
                onClick={() => waMutation.mutate({ id: waTarget.id, message: waMessage })}
                disabled={waMutation.isPending || !waMessage.trim()}>
                {waMutation.isPending ? "Sending..." : "Send Message"}
              </Button>
              <Button variant="outline" onClick={() => setWaTarget(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          CSV IMPORT MODAL
      ══════════════════════════════════════════ */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-bold text-lg flex items-center gap-2"><Upload className="w-5 h-5" />Import Customers from CSV</h2>
              <button onClick={() => setShowImport(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                <p className="font-semibold text-blue-800 mb-2 flex items-center gap-1.5"><FileText className="w-4 h-4" />CSV Format</p>
                <p className="text-blue-700 mb-2">Your CSV should include headers. Supported columns:</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-blue-700">
                  {[["first_name / firstname","First name"],["last_name / lastname","Last name"],["email","Email address"],["phone / mobile","Phone / WhatsApp"],["city","City"],["country","Country"]].map(([col, desc]) => (
                    <div key={col}><code className="bg-blue-100 px-1 rounded">{col}</code> — {desc}</div>
                  ))}
                </div>
                <button onClick={downloadSampleCSV} className="mt-3 flex items-center gap-1.5 text-blue-700 hover:text-blue-900 text-xs font-medium">
                  <Download className="w-3.5 h-3.5" />Download sample CSV
                </button>
              </div>
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors">
                <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                {csvFileName ? <p className="font-medium text-foreground">{csvFileName}</p> : <p className="text-muted-foreground">Click to select a CSV file</p>}
                <p className="text-xs text-muted-foreground mt-1">Supports .csv and .txt files</p>
              </div>
              {csvError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{csvError}
                </div>
              )}
              {csvPreview.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <p className="text-sm font-medium">{csvPreview.length} customers ready to import</p>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/50 border-b border-border">
                        {["Name","Email","Phone","City"].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {csvPreview.slice(0, 50).map((r, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="px-3 py-1.5">{[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.email || "—"}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.phone || "—"}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.city || "—"}</td>
                          </tr>
                        ))}
                        {csvPreview.length > 50 && <tr><td colSpan={4} className="px-3 py-2 text-muted-foreground text-center">...and {csvPreview.length - 50} more</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 p-5 border-t border-border">
              <Button className="flex-1" onClick={() => importMutation.mutate(csvPreview)} disabled={csvPreview.length === 0 || importMutation.isPending}>
                {importMutation.isPending ? "Importing..." : `Import ${csvPreview.length} Customers`}
              </Button>
              <Button variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
