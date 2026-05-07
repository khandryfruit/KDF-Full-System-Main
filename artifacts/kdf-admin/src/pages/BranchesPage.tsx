import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, MapPin, Phone, Users, TrendingUp, Plus,
  Pencil, Trash2, X, RefreshCw, BarChart2, CheckCircle,
  XCircle, Mail, DollarSign, ChevronRight, ArrowLeft,
  Target, Star, Zap, Globe, User, Package, KeyRound,
  Shield, Eye, EyeOff, Loader2, Receipt, Lock,
} from "lucide-react";

/* ── helpers ─────────────────────────────────────────────── */
const API   = "/api";
const token = () => localStorage.getItem("kdf_admin_token") ?? "";
const hdr   = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
async function apiFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, { ...opts, headers: hdr() });
  return r.json();
}
const fmt = (n: number) => Number(n ?? 0).toLocaleString("en-PK");
const fmtK = (n: number) => {
  const v = Number(n ?? 0);
  return v >= 1_000_000 ? `Rs. ${(v / 1_000_000).toFixed(1)}M`
       : v >= 1_000     ? `Rs. ${(v / 1_000).toFixed(0)}K`
       : `Rs. ${fmt(v)}`;
};

/* ── Branch form modal ───────────────────────────────────── */
function BranchModal({ branch, onClose, onSaved }: { branch?: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name:            branch?.name            ?? "",
    slug:            branch?.slug            ?? "",
    city:            branch?.city            ?? "",
    address:         branch?.address         ?? "",
    phone:           branch?.phone           ?? "",
    whatsapp_number: branch?.whatsapp_number ?? "",
    manager_name:    branch?.manager_name    ?? "",
    manager_phone:   branch?.manager_phone   ?? "",
    email:           branch?.email           ?? "",
    monthly_target:  branch?.monthly_target  ?? "",
    is_active:       branch?.is_active       ?? true,
    is_head_office:  branch?.is_head_office  ?? false,
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: k === "is_active" || k === "is_head_office" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const autoSlug = () => {
    if (!form.slug && form.name) setForm(f => ({ ...f, slug: form.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") }));
  };

  const save = async () => {
    if (!form.name || !form.city) { toast({ title: "Name & city required", variant: "destructive" }); return; }
    if (!form.slug) { toast({ title: "Slug required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url    = branch ? `/admin/branches/${branch.id}` : "/admin/branches";
      const method = branch ? "PUT" : "POST";
      const res    = await apiFetch(url, { method, body: JSON.stringify({ ...form, monthly_target: Number(form.monthly_target) || null }) });
      if (res.branch) { toast({ title: branch ? "Branch updated!" : "Branch created!" }); onSaved(); onClose(); }
      else toast({ title: "Error", description: res.error ?? "Failed", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-bold text-lg">{branch ? "Edit Branch" : "Add New Branch"}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Basic Info */}
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Basic Information</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 md:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Branch Name *</label>
                <Input placeholder="e.g. Lahore Branch" value={form.name} onChange={set("name")} onBlur={autoSlug} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Slug *</label>
                <Input placeholder="e.g. lahore" value={form.slug} onChange={set("slug")} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">City *</label>
                <Input placeholder="Lahore" value={form.city} onChange={set("city")} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Monthly Target (Rs.)</label>
                <Input type="number" placeholder="500000" value={form.monthly_target} onChange={set("monthly_target")} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Address</label>
                <Input placeholder="Full branch address" value={form.address} onChange={set("address")} />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Contact Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Phone</label>
                <Input placeholder="03xx-xxxxxxx" value={form.phone} onChange={set("phone")} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">WhatsApp</label>
                <Input placeholder="+923xx-xxxxxxx" value={form.whatsapp_number} onChange={set("whatsapp_number")} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Email</label>
                <Input type="email" placeholder="branch@kdfnuts.com" value={form.email} onChange={set("email")} />
              </div>
            </div>
          </div>

          {/* Manager */}
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Branch Manager</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Manager Name</label>
                <Input placeholder="Manager full name" value={form.manager_name} onChange={set("manager_name")} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Manager Phone</label>
                <Input placeholder="03xx-xxxxxxx" value={form.manager_phone} onChange={set("manager_phone")} />
              </div>
            </div>
          </div>

          {/* Status Toggles */}
          <div className="flex gap-6 pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={set("is_active")} className="w-4 h-4 accent-indigo-600" />
              <span className="text-sm font-medium">Active Branch</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={form.is_head_office} onChange={set("is_head_office")} className="w-4 h-4 accent-amber-500" />
              <span className="text-sm font-medium">Head Office</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {saving ? "Saving..." : branch ? "Update Branch" : "Create Branch"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Branch detail panel ─────────────────────────────────── */
function BranchDetailPanel({ branchId, branch, onBack }: { branchId: number; branch: any; onBack: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["branch-stats", branchId],
    queryFn: () => apiFetch(`/admin/branches/${branchId}/stats`),
    refetchInterval: 30_000,
  });

  const stats = data?.stats ?? {};
  const topProducts: any[] = data?.topProducts ?? [];
  const chart: any[] = data?.revenueChart ?? [];

  const targetPct = branch.monthly_target
    ? Math.min(100, Math.round((Number(stats.revenue ?? 0) / Number(branch.monthly_target)) * 100))
    : null;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        <ArrowLeft size={14} /> Back to branches
      </button>

      {/* Branch header */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 text-white mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-5 h-5 opacity-80" />
              {branch.is_head_office && <span className="text-xs bg-amber-400 text-amber-900 font-bold px-2 py-0.5 rounded-full">HQ</span>}
            </div>
            <h2 className="text-xl font-bold">{branch.name}</h2>
            <p className="text-indigo-200 text-sm mt-0.5">{branch.city}{branch.address ? ` · ${branch.address}` : ""}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${branch.is_active ? "bg-emerald-400/25 text-emerald-200" : "bg-red-400/25 text-red-200"}`}>
            {branch.is_active ? "Active" : "Inactive"}
          </span>
        </div>
        {branch.manager_name && (
          <p className="text-indigo-200 text-sm mt-3 flex items-center gap-1.5">
            <User size={13} /> Manager: <span className="text-white font-medium">{branch.manager_name}</span>
            {branch.manager_phone ? ` · ${branch.manager_phone}` : ""}
          </p>
        )}
        {targetPct !== null && (
          <div className="mt-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-indigo-200">Monthly Target Progress</span>
              <span className="font-bold">{targetPct}%</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${targetPct >= 100 ? "bg-emerald-400" : targetPct >= 70 ? "bg-amber-400" : "bg-white/70"}`}
                style={{ width: `${targetPct}%` }}
              />
            </div>
            <p className="text-indigo-200 text-xs mt-1">
              {fmtK(Number(stats.revenue ?? 0))} of {fmtK(Number(branch.monthly_target))} target
            </p>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading stats...
        </div>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { icon: DollarSign, label: "Total Revenue",  value: fmtK(Number(stats.revenue ?? 0)),      color: "text-emerald-600",  bg: "bg-emerald-50" },
              { icon: Package,    label: "Total Orders",   value: fmt(Number(stats.total_orders ?? 0)),   color: "text-indigo-600",   bg: "bg-indigo-50" },
              { icon: Users,      label: "Active Riders",  value: fmt(Number(stats.active_riders ?? 0)),  color: "text-violet-600",   bg: "bg-violet-50" },
              { icon: TrendingUp, label: "Avg Order Value",value: fmtK(Number(stats.avg_order_value ?? 0)), color: "text-amber-600",  bg: "bg-amber-50" },
            ].map(({ icon: Icon, label, value, color, bg }) => (
              <div key={label} className="bg-white rounded-xl border p-3.5 shadow-sm">
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Top Products */}
          {topProducts.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm p-4 mb-4">
              <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" /> Top Products in {branch.city}
              </h4>
              <div className="space-y-2">
                {topProducts.slice(0, 5).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                      <span className="font-medium text-foreground">{p.product_title}</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{fmt(p.total_qty)} units</span>
                      <span className="font-semibold text-foreground">{fmtK(Number(p.total_revenue))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7-day revenue chart */}
          {chart.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-indigo-500" /> Last 7 Days Revenue
              </h4>
              <div className="flex items-end gap-1.5 h-20">
                {chart.slice(-7).map((d: any, i: number) => {
                  const max = Math.max(...chart.slice(-7).map((x: any) => Number(x.revenue ?? 0)), 1);
                  const pct = Math.max(4, (Number(d.revenue ?? 0) / max) * 100);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: Rs. ${fmt(Number(d.revenue ?? 0))}`}>
                      <div className="w-full rounded-t" style={{ height: `${pct}%`, backgroundColor: "#4F46E5", opacity: 0.7 + (i / 7) * 0.3 }} />
                      <span className="text-[9px] text-muted-foreground">{new Date(d.date).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Dashboard Tab ───────────────────────────────────────── */
function DashboardTab({ onSeedDone }: { onSeedDone: () => void }) {
  const { toast } = useToast();
  const [seeding, setSeeding] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["branches-dashboard"],
    queryFn: () => apiFetch("/admin/branches/dashboard"),
    refetchInterval: 60_000,
  });

  const totals  = data?.totals  ?? {};
  const branches: any[] = data?.branches ?? [];
  const cityStats: any[] = data?.cityStats ?? [];

  const seedDefaults = async () => {
    setSeeding(true);
    try {
      const res = await apiFetch("/admin/branches/seed", { method: "POST" });
      if (res.branches) { toast({ title: `${res.branches.length} default branches seeded!` }); refetch(); onSeedDone(); }
      else toast({ title: "Error", description: res.error ?? "Failed", variant: "destructive" });
    } finally { setSeeding(false); }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading dashboard...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Global KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: DollarSign, label: "Total Revenue",   value: fmtK(Number(totals.total_revenue ?? 0)),   color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
          { icon: Package,    label: "Total Orders",    value: fmt(Number(totals.total_orders ?? 0)),      color: "text-indigo-600",  bg: "bg-indigo-50",  border: "border-indigo-200" },
          { icon: Building2,  label: "Active Branches", value: String(totals.active_branches ?? 0),        color: "text-violet-600",  bg: "bg-violet-50",  border: "border-violet-200" },
          { icon: Users,      label: "Total Riders",    value: String(totals.total_riders ?? 0),           color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200" },
        ].map(({ icon: Icon, label, value, color, bg, border }) => (
          <div key={label} className={`bg-white rounded-xl border ${border} p-4 shadow-sm`}>
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Branch performance cards */}
      {branches.length === 0 ? (
        <div className="bg-white rounded-2xl border shadow-sm p-10 text-center">
          <Building2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-semibold text-foreground mb-1">No branches yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create your first branch or seed default city branches</p>
          <Button onClick={seedDefaults} disabled={seeding} variant="outline" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
            <Zap className="w-4 h-4 mr-1.5" />
            {seeding ? "Seeding..." : "Seed Default Branches (Lahore, Karachi, Islamabad, Peshawar)"}
          </Button>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-foreground">Branch Performance</h3>
            <Button onClick={() => refetch()} variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {branches.map((b: any) => {
              const rev = Number(b.revenue ?? 0);
              const ord = Number(b.orders ?? 0);
              const targetPct = b.monthly_target ? Math.min(100, Math.round((rev / Number(b.monthly_target)) * 100)) : null;
              return (
                <div key={b.id} className="bg-white rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">{b.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin size={10} /> {b.city}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {b.is_head_office && <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">HQ</span>}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {b.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center mb-3">
                    <div className="bg-emerald-50 rounded-lg p-2">
                      <p className="text-base font-bold text-emerald-700">{fmtK(rev)}</p>
                      <p className="text-[10px] text-muted-foreground">Revenue</p>
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-2">
                      <p className="text-base font-bold text-indigo-700">{fmt(ord)}</p>
                      <p className="text-[10px] text-muted-foreground">Orders</p>
                    </div>
                  </div>
                  {targetPct !== null && (
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-muted-foreground">Monthly Target</span>
                        <span className="font-bold text-foreground">{targetPct}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${targetPct >= 100 ? "bg-emerald-500" : targetPct >= 70 ? "bg-amber-400" : "bg-indigo-400"}`}
                          style={{ width: `${targetPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* City stats */}
      {cityStats.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-500" /> Revenue by City
          </h4>
          <div className="space-y-2">
            {cityStats.map((c: any) => {
              const maxRev = Math.max(...cityStats.map((x: any) => Number(x.revenue ?? 0)), 1);
              const pct = Math.round((Number(c.revenue ?? 0) / maxRev) * 100);
              return (
                <div key={c.city} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground w-24 shrink-0">{c.city}</span>
                  <div className="flex-1 h-5 bg-indigo-50 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full flex items-center pl-2" style={{ width: `${Math.max(pct, 4)}%` }}>
                      <span className="text-[9px] text-white font-bold">{pct > 20 ? fmtK(Number(c.revenue ?? 0)) : ""}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground w-20 text-right shrink-0">{fmtK(Number(c.revenue ?? 0))}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Manage Branches Tab ────────────────────────────────── */
function ManageTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch]         = useState("");
  const [modal,  setModal]          = useState<"add" | "edit" | null>(null);
  const [editing, setEditing]       = useState<any>(null);
  const [detailId, setDetailId]     = useState<number | null>(null);
  const [deleting, setDeleting]     = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["branches-list"],
    queryFn: () => apiFetch("/admin/branches"),
    refetchInterval: 30_000,
  });

  const branches: any[] = (data?.branches ?? []).filter((b: any) =>
    !search || b.name.toLowerCase().includes(search.toLowerCase()) || b.city.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd  = () => { setEditing(null); setModal("add");  };
  const openEdit = (b: any) => { setEditing(b); setModal("edit"); };
  const closeModal = () => { setModal(null); setEditing(null); };
  const onSaved = () => { qc.invalidateQueries({ queryKey: ["branches-list"] }); qc.invalidateQueries({ queryKey: ["branches-dashboard"] }); };

  const deleteBranch = async (id: number) => {
    if (!window.confirm("Delete this branch? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const res = await apiFetch(`/admin/branches/${id}`, { method: "DELETE" });
      if (res.message) { toast({ title: "Branch deleted" }); onSaved(); }
      else toast({ title: "Error", description: res.error ?? "Failed", variant: "destructive" });
    } finally { setDeleting(null); }
  };

  const detailBranch = branches.find(b => b.id === detailId);
  if (detailId && detailBranch) {
    return <BranchDetailPanel branchId={detailId} branch={detailBranch} onBack={() => setDetailId(null)} />;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-7 h-8 text-sm" placeholder="Search by name or city…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground h-8">
          <RefreshCw className="w-3 h-3" />
        </Button>
        <Button onClick={openAdd} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 h-8">
          <Plus className="w-3.5 h-3.5" /> Add Branch
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading branches...
        </div>
      ) : branches.length === 0 ? (
        <div className="bg-white rounded-2xl border shadow-sm p-10 text-center">
          <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-semibold text-foreground mb-1">{search ? "No branches found" : "No branches yet"}</p>
          <p className="text-sm text-muted-foreground">
            {search ? "Try a different search term" : "Click \"Add Branch\" to create your first branch"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {branches.map((b: any) => (
            <div key={b.id} className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4 p-4">
                {/* Left accent */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${b.is_head_office ? "bg-amber-500" : "bg-indigo-600"}`}>
                  <Building2 className="w-5 h-5 text-white" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{b.name}</span>
                    {b.is_head_office && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">HQ</Badge>}
                    <Badge className={`text-[10px] px-1.5 py-0 ${b.is_active ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {b.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><MapPin size={10} /> {b.city}</span>
                    {b.manager_name && <span className="flex items-center gap-1"><User size={10} /> {b.manager_name}</span>}
                    {b.phone        && <span className="flex items-center gap-1"><Phone size={10} /> {b.phone}</span>}
                    {b.email        && <span className="flex items-center gap-1"><Mail size={10} /> {b.email}</span>}
                    {b.monthly_target && <span className="flex items-center gap-1"><Target size={10} /> Target: {fmtK(Number(b.monthly_target))}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost" size="sm"
                    className="gap-1.5 text-xs text-indigo-600 hover:bg-indigo-50 h-8"
                    onClick={() => setDetailId(b.id)}
                  >
                    <BarChart2 size={13} /> Stats <ChevronRight size={12} />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(b)}>
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => deleteBranch(b.id)}
                    disabled={deleting === b.id}
                  >
                    {deleting === b.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={14} />}
                  </Button>
                </div>
              </div>

              {/* Address row */}
              {b.address && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-1.5">
                    <MapPin size={10} className="shrink-0" /> {b.address}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <BranchModal
          branch={modal === "edit" ? editing : undefined}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

/* ── Permission definitions ───────────────────────────────── */
const PERM_GROUPS = [
  { label: "Invoice", color: "text-blue-700", perms: [
    { key: "create_invoice",      label: "Create Invoice" },
    { key: "edit_invoice",        label: "Edit Invoice" },
    { key: "delete_invoice",      label: "Delete Invoice" },
    { key: "print_invoice",       label: "Print Invoice" },
    { key: "return_invoice",      label: "Process Returns" },
    { key: "apply_discount",      label: "Apply Discounts" },
    { key: "view_all_invoices",   label: "View All Invoices" },
  ]},
  { label: "Customer", color: "text-green-700", perms: [
    { key: "add_customer",    label: "Add Customer" },
    { key: "edit_customer",   label: "Edit Customer" },
    { key: "delete_customer", label: "Delete Customer" },
  ]},
  { label: "Payment", color: "text-amber-700", perms: [
    { key: "refund_payment",   label: "Refund Payment" },
    { key: "partial_refund",   label: "Partial Refund" },
    { key: "edit_payment",     label: "Edit Payment" },
  ]},
  { label: "Reports", color: "text-purple-700", perms: [
    { key: "view_branch_reports", label: "Branch Reports" },
    { key: "view_analytics",      label: "Sales Analytics" },
  ]},
];

const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  manager:  Object.fromEntries(PERM_GROUPS.flatMap(g => g.perms.map(p => [p.key, true]))),
  cashier:  { create_invoice: true, print_invoice: true, add_customer: true, view_all_invoices: true },
  sales:    { create_invoice: true, print_invoice: true, add_customer: true, edit_customer: true, apply_discount: true },
  operator: { create_invoice: true, print_invoice: true, view_all_invoices: true },
};

const ROLE_COLORS: Record<string, string> = {
  manager:  "bg-purple-50 text-purple-700 border-purple-200",
  cashier:  "bg-blue-50 text-blue-700 border-blue-200",
  sales:    "bg-green-50 text-green-700 border-green-200",
  operator: "bg-orange-50 text-orange-700 border-orange-200",
};

type UserForm = {
  name: string; username: string; phone: string; email: string;
  password: string; role: string; isActive: boolean;
  permissions: Record<string, boolean>;
};

const EMPTY_FORM: UserForm = {
  name: "", username: "", phone: "", email: "", password: "",
  role: "cashier", isActive: true, permissions: { ...ROLE_DEFAULTS["cashier"] },
};

/* ── Branch Users Management Tab ─────────────────────────── */
function BranchUsersTab() {
  const { toast } = useToast();
  const [branches, setBranches]       = useState<any[]>([]);
  const [branchLoading, setBranchLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [users, setUsers]             = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const [showAdd, setShowAdd]         = useState(false);
  const [editUser, setEditUser]       = useState<any>(null);
  const [form, setForm]               = useState<UserForm>(EMPTY_FORM);
  const [showPwd, setShowPwd]         = useState(false);
  const [saving, setSaving]           = useState(false);

  // Load branches with proper error handling
  useEffect(() => {
    setBranchLoading(true);
    apiFetch("/admin/branches")
      .then(d => {
        const list = d.branches ?? [];
        setBranches(list);
        if (list.length > 0) setSelectedBranch(String(list[0].id));
      })
      .catch(() => toast({ variant: "destructive", title: "Failed to load branches" }))
      .finally(() => setBranchLoading(false));
  }, []);

  const loadUsers = useCallback(async () => {
    if (!selectedBranch) return;
    setLoading(true);
    try {
      const d = await apiFetch(`/admin/branches/${selectedBranch}/users`);
      setUsers(d.users ?? []);
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message ?? "Failed to load users" });
    }
    setLoading(false);
  }, [selectedBranch]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const resetForm = () => { setForm(EMPTY_FORM); setEditUser(null); setShowAdd(false); };

  const setRoleAndDefaults = (role: string) => {
    setForm(f => ({ ...f, role, permissions: { ...(ROLE_DEFAULTS[role] ?? {}) } }));
  };

  const togglePerm = (key: string) => {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }));
  };

  const handleSave = async () => {
    if (!form.name || !form.username) { toast({ variant: "destructive", title: "Name & username required" }); return; }
    if (!editUser && !form.password)  { toast({ variant: "destructive", title: "Password required for new user" }); return; }
    if (!selectedBranch) { toast({ variant: "destructive", title: "Select a branch first" }); return; }
    setSaving(true);
    try {
      const url    = editUser ? `/admin/branches/${selectedBranch}/users/${editUser.id}` : `/admin/branches/${selectedBranch}/users`;
      const method = editUser ? "PUT" : "POST";
      const body: any = { name: form.name, phone: form.phone || null, email: form.email || null, role: form.role, isActive: form.isActive, permissions: form.permissions };
      if (!editUser) body.username = form.username.trim().toLowerCase();
      if (form.password) body.password = form.password;
      const res = await apiFetch(url, { method, body: JSON.stringify(body) });
      if (res.user || res.error === undefined) {
        toast({ title: editUser ? "User updated!" : "User created!" });
        resetForm(); loadUsers();
      } else {
        toast({ variant: "destructive", title: res.error ?? "Failed" });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message ?? "Failed" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (uid: number) => {
    if (!confirm("Delete this user? This cannot be undone.")) return;
    try {
      await apiFetch(`/admin/branches/${selectedBranch}/users/${uid}`, { method: "DELETE" });
      toast({ title: "User deleted" }); loadUsers();
    } catch (err: any) { toast({ variant: "destructive", title: err.message }); }
  };

  const handleEdit = (user: any) => {
    setForm({
      name: user.name, username: user.username, phone: user.phone ?? "", email: user.email ?? "",
      password: "", role: user.role, isActive: user.isActive,
      permissions: user.permissions ?? { ...(ROLE_DEFAULTS[user.role] ?? {}) },
    });
    setEditUser(user); setShowAdd(true);
  };

  const activeBranch = branches.find(b => String(b.id) === selectedBranch);

  return (
    <div className="space-y-5">
      {/* Branch selector bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-sm font-semibold shrink-0 text-muted-foreground">Branch:</p>
        {branchLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading branches…</div>
        ) : branches.length === 0 ? (
          <p className="text-sm text-red-500">No branches found. Create a branch first.</p>
        ) : (
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-56 h-9 text-sm">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map(b => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name} — {b.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" className="gap-1.5 h-9 bg-indigo-600 hover:bg-indigo-700" onClick={() => { resetForm(); setShowAdd(true); }} disabled={!selectedBranch}>
          <Plus className="w-3.5 h-3.5" /> Add Staff
        </Button>
        <a href="/admin/branch-login" target="_blank" className="text-xs text-indigo-600 hover:underline flex items-center gap-1 ml-auto">
          <Receipt className="w-3 h-3" /> Open Branch Portal ↗
        </a>
      </div>

      {activeBranch && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
          <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="font-medium text-indigo-700">{activeBranch.name}</span>
          <span>·</span><span>{activeBranch.city}</span>
          {activeBranch.address && <><span>·</span><span className="truncate">{activeBranch.address}</span></>}
        </div>
      )}

      {/* Add / Edit User form */}
      {showAdd && (
        <div className="bg-card border-2 border-indigo-100 rounded-2xl p-5 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-600" />
              {editUser ? `Edit Staff: ${editUser.name}` : "Add New Staff Member"}
            </h3>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground rounded-lg p-1 hover:bg-muted transition-colors"><X size={16} /></button>
          </div>

          {/* Basic Info */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Basic Information</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Full Name *</label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ali Raza" className="h-9" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Username * {editUser && <span className="text-muted-foreground/60">(cannot change)</span>}</label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="ali_cashier" className="h-9" disabled={!!editUser} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Phone</label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="03xx-xxxxxxx" type="tel" className="h-9" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Email</label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ali@branch.com" type="email" className="h-9" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">{editUser ? "New Password" : "Password *"}</label>
                <div className="relative">
                  <Input type={showPwd ? "text" : "password"} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editUser ? "Leave blank to keep current" : "Min 6 characters"} className="h-9 pr-8" />
                  <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Role</label>
                <Select value={form.role} onValueChange={setRoleAndDefaults}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager (Full Access)</SelectItem>
                    <SelectItem value="cashier">Cashier</SelectItem>
                    <SelectItem value="sales">Sales Staff</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Permissions — hidden for manager (they get all) */}
          {form.role !== "manager" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Permissions</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm(f => ({ ...f, permissions: Object.fromEntries(PERM_GROUPS.flatMap(g => g.perms.map(p => [p.key, true]))) }))}
                    className="text-[10px] text-indigo-600 hover:underline">All</button>
                  <button type="button" onClick={() => setForm(f => ({ ...f, permissions: {} }))}
                    className="text-[10px] text-muted-foreground hover:underline">None</button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {PERM_GROUPS.map(group => (
                  <div key={group.label} className="bg-muted/30 rounded-xl p-3 border border-border">
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${group.color}`}>{group.label}</p>
                    <div className="space-y-1.5">
                      {group.perms.map(p => (
                        <label key={p.key} className="flex items-center gap-2 cursor-pointer group">
                          <input type="checkbox" checked={!!form.permissions[p.key]} onChange={() => togglePerm(p.key)}
                            className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer" />
                          <span className="text-xs text-foreground group-hover:text-indigo-700 transition-colors">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {form.role === "manager" && (
            <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-600 shrink-0" />
              <p className="text-xs text-purple-700 font-medium">Managers have full access to all features — no permission restrictions apply.</p>
            </div>
          )}

          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
              <span className="font-medium">Active</span>
            </label>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={resetForm} className="h-9">Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="h-9 bg-indigo-600 hover:bg-indigo-700 gap-1.5 min-w-[120px]">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                {editUser ? "Update Staff" : "Create Staff"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Users list */}
      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !selectedBranch ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Select a branch to view staff</div>
      ) : users.length === 0 ? (
        <div className="text-center py-14 bg-card border border-dashed border-border rounded-2xl">
          <Shield className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-semibold text-muted-foreground">No staff yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Add the first staff member for this branch</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/20">
            <p className="text-sm font-semibold">{users.length} staff member{users.length !== 1 ? "s" : ""} · {activeBranch?.name}</p>
          </div>
          <div className="divide-y divide-border">
            {users.map(u => {
              const permCount = Object.values(u.permissions ?? {}).filter(Boolean).length;
              return (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${ROLE_COLORS[u.role] ?? "bg-gray-50 text-gray-700 border border-gray-200"}`}>
                    {u.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{u.name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ROLE_COLORS[u.role] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                        {u.role}
                      </span>
                      {!u.isActive && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">Inactive</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-xs text-muted-foreground font-mono">@{u.username}</p>
                      {u.phone && <p className="text-xs text-muted-foreground">{u.phone}</p>}
                      {u.role !== "manager" && <p className="text-xs text-muted-foreground">{permCount} perms</p>}
                      {u.role === "manager" && <p className="text-xs text-purple-600 font-medium">Full access</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleEdit(u)} className="p-2 rounded-lg hover:bg-indigo-50 text-muted-foreground hover:text-indigo-600 transition-colors" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(u.id)} className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Central Invoice Report Tab ───────────────────────────── */
function InvoiceReportTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const fmtK = (n: number) => {
    const v = Number(n ?? 0);
    return v >= 1_000_000 ? `Rs. ${(v / 1_000_000).toFixed(1)}M`
         : v >= 1_000     ? `Rs. ${(v / 1_000).toFixed(0)}K`
         : `Rs. ${Number(v).toLocaleString("en-PK")}`;
  };

  useEffect(() => {
    apiFetch("/admin/branch-invoices/report")
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (!data) return <div className="text-center py-16 text-muted-foreground">Failed to load report</div>;

  const g = data.global ?? {};

  return (
    <div className="space-y-5">
      {/* Global KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Revenue",   value: fmtK(g.totalRevenue),  color: "bg-emerald-50 border-emerald-200 text-emerald-800" },
          { label: "Today Revenue",   value: fmtK(g.todayRevenue),  color: "bg-blue-50 border-blue-200 text-blue-800" },
          { label: "Paid Invoices",   value: g.paidCount ?? 0,      color: "bg-green-50 border-green-200 text-green-800" },
          { label: "Unpaid Invoices", value: g.unpaidCount ?? 0,    color: "bg-red-50 border-red-200 text-red-800" },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-2xl border p-4 ${color}`}>
            <p className="text-xs font-semibold uppercase opacity-70 mb-1">{label}</p>
            <p className="text-2xl font-black tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Per-branch breakdown */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="font-bold text-sm">Per-Branch Invoice Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase">Branch</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase">Total Rev.</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase">Today</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase">Month</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase">Paid</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase">Unpaid</th>
              </tr>
            </thead>
            <tbody>
              {(data.perBranch ?? []).map((b: any) => (
                <tr key={b.branch_id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{b.branch_name}</p>
                    <p className="text-xs text-muted-foreground">{b.city}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700 tabular-nums">{fmtK(Number(b.total_revenue))}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{fmtK(Number(b.today_revenue))}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{fmtK(Number(b.month_revenue))}</td>
                  <td className="px-4 py-3 text-right text-green-600 font-semibold">{b.paid_count ?? 0}</td>
                  <td className="px-4 py-3 text-right text-red-500 font-semibold">{b.unpaid_count ?? 0}</td>
                </tr>
              ))}
              {(data.perBranch ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">No invoice data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────── */
type Tab = "dashboard" | "manage" | "users" | "invoices";

export default function BranchesPage() {
  const [tab,     setTab]     = useState<Tab>("dashboard");
  const [refresh, setRefresh] = useState(0);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Branch Management</h1>
            <p className="text-sm text-muted-foreground">Multi-branch ERP — centralized control</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit flex-wrap">
        {([
          { key: "dashboard", label: "Overview",       icon: BarChart2  },
          { key: "manage",    label: "Branches",        icon: Building2  },
          { key: "users",     label: "Staff & Users",   icon: Users      },
          { key: "invoices",  label: "Invoice Report",  icon: Receipt    },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? "bg-white text-indigo-700 shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "dashboard" && <DashboardTab key={refresh} onSeedDone={() => setRefresh(r => r + 1)} />}
      {tab === "manage"    && <ManageTab />}
      {tab === "users"     && <BranchUsersTab />}
      {tab === "invoices"  && <InvoiceReportTab />}
    </div>
  );
}
