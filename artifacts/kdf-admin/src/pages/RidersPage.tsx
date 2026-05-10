import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users, Phone, MessageCircle, MapPin, Plus, Pencil, Trash2,
  CheckCircle, XCircle, Package, TrendingUp, X, RefreshCw,
  DollarSign, CreditCard, Printer, BarChart2, Clock, AlertCircle,
  RotateCcw, Bike, KeyRound, Eye, EyeOff, Zap, ShieldCheck, Activity,
  AlertTriangle, Banknote, FileText, Send, Trophy, Filter,
  ChevronDown, CalendarDays, Star,
} from "lucide-react";

const API = "/api";
const token = () => localStorage.getItem("kdf_admin_token") ?? "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

async function apiFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, { ...opts, headers: hdr() });
  return r.json();
}

const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-600",
  busy: "bg-orange-100 text-orange-700",
};

/* ── RIDER FORM MODAL ──────────────────────────────────── */
function RiderModal({ rider, onClose, onSaved }: { rider?: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: rider?.name ?? "",
    phone: rider?.phone ?? "",
    whatsapp_number: rider?.whatsapp_number ?? "",
    delivery_area: rider?.delivery_area ?? "",
    status: rider?.status ?? "active",
    vehicle_type: rider?.vehicle_type ?? "bike",
    cnic: rider?.cnic ?? "",
    delivery_charge_per_order: rider?.delivery_charge_per_order ?? "500",
    notes: rider?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async (): Promise<void> => {
    if (!form.name || !form.phone) { toast({ title: "Name & phone required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = rider ? `/admin/riders/${rider.id}` : "/admin/riders";
      const method = rider ? "PUT" : "POST";
      const res = await apiFetch(url, { method, body: JSON.stringify(form) });
      if (res.rider) { toast({ title: rider ? "Rider updated!" : "Rider added!" }); onSaved(); }
      else toast({ title: "Error", description: res.error ?? "Failed", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <h3 className="font-bold text-lg">{rider ? "Edit Rider" : "Add New Rider"}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Full Name *</label>
              <Input placeholder="Rider name" value={form.name} onChange={set("name")} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Phone *</label>
              <Input placeholder="03xx-xxxxxxx" value={form.phone} onChange={set("phone")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">WhatsApp Number</label>
              <Input placeholder="Same as phone or different" value={form.whatsapp_number} onChange={set("whatsapp_number")} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">CNIC</label>
              <Input placeholder="xxxxx-xxxxxxx-x" value={form.cnic} onChange={set("cnic")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Delivery Area</label>
              <Input placeholder="e.g. DHA, Gulberg, Township" value={form.delivery_area} onChange={set("delivery_area")} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Vehicle Type</label>
              <select className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background" value={form.vehicle_type} onChange={set("vehicle_type")}>
                <option value="bike">Bike / Motorcycle</option>
                <option value="rickshaw">Rickshaw</option>
                <option value="car">Car</option>
                <option value="van">Van</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Delivery Charge / Order (PKR)</label>
              <Input type="number" placeholder="500" value={form.delivery_charge_per_order} onChange={set("delivery_charge_per_order")} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Status</label>
              <select className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background" value={form.status} onChange={set("status")}>
                <option value="active">Active</option>
                <option value="busy">Busy</option>
                <option value="inactive">Inactive / Off-duty</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Notes</label>
            <textarea className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none" rows={2} placeholder="Any special instructions or notes..." value={form.notes} onChange={set("notes")} />
          </div>
        </div>
        <div className="p-4 border-t flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
            {saving ? "Saving..." : rider ? "Save Changes" : "Add Rider"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── SET PASSWORD MODAL ──────────────────────────────── */
function SetPasswordModal({ rider, onClose }: { rider: any; onClose: () => void }) {
  const { toast } = useToast();
  const [pw, setPw]         = useState("");
  const [pw2, setPw2]       = useState("");
  const [show, setShow]     = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (pw.length < 6) { toast({ title: "Password too short", description: "Minimum 6 characters required", variant: "destructive" }); return; }
    if (pw !== pw2)    { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/admin/riders/${rider.id}/set-password`, {
        method: "POST",
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        toast({ title: "Password set!", description: `${rider.name} can now login to the rider app` });
        onClose();
      } else {
        toast({ title: "Failed", description: res.error ?? "Could not set password", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <KeyRound size={18} className="text-blue-700" />
            </div>
            <div>
              <h2 className="font-bold text-base">Set App Password</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{rider.name} — {rider.phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
            <strong>Login Info for Rider App:</strong><br />
            Phone: <span className="font-mono font-bold">{rider.phone}</span><br />
            Password: جو آپ ابھی set کریں گے
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">New Password</label>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                placeholder="Min 6 characters"
                value={pw}
                onChange={e => setPw(e.target.value)}
                className="pr-10"
              />
              <button onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Confirm Password</label>
            <Input
              type={show ? "text" : "password"}
              placeholder="Re-enter password"
              value={pw2}
              onChange={e => setPw2(e.target.value)}
              onKeyDown={e => e.key === "Enter" && save()}
            />
            {pw2 && pw !== pw2 && (
              <p className="text-xs text-red-500 mt-1">Passwords don't match</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 p-5 border-t border-border">
          <Button onClick={save} disabled={saving || !pw || !pw2} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2">
            {saving ? "Saving…" : <><KeyRound size={14} /> Set Password</>}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

/* ── RIDER CARD ──────────────────────────────────────── */
function RiderCard({ rider, onEdit, onDelete, onRefresh, codPending = 0 }: {
  rider: any; onEdit: () => void; onDelete: () => void; onRefresh: () => void; codPending?: number;
}) {
  const { toast } = useToast();
  const [loadingDel, setLoadingDel] = useState(false);
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);

  const { data: delData } = useQuery({
    queryKey: ["rider-deliveries", rider.id],
    queryFn: () => apiFetch(`/admin/riders/${rider.id}/deliveries`),
    enabled: showDeliveries,
  });

  const deleteRider = async () => {
    if (!confirm(`Delete rider ${rider.name}? This cannot be undone.`)) return;
    setLoadingDel(true);
    try {
      await apiFetch(`/admin/riders/${rider.id}`, { method: "DELETE" });
      toast({ title: "Rider deleted" });
      onDelete();
    } finally { setLoadingDel(false); }
  };

  const printSheet = () => {
    window.open(`/api/admin/riders/${rider.id}/sheet?token=${token()}`, "_blank");
  };

  const activeCount = Number(rider.active_deliveries ?? 0);
  const deliveredCount = Number(rider.total_delivered ?? 0);
  const totalCount = Number(rider.total_assignments ?? 0);
  const chargePerOrder = Number(rider.delivery_charge_per_order ?? 500);

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="p-4 border-b border-border/60">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              {rider.name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div>
              <h3 className="font-bold text-base leading-none">{rider.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{rider.delivery_area || "All Areas"}</p>
              <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[rider.status] ?? STATUS_COLOR.inactive}`}>
                {rider.status?.charAt(0).toUpperCase() + rider.status?.slice(1)}
              </span>
              {codPending > 0 && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-300 animate-pulse">
                  <AlertTriangle size={9} />COD Rs.{codPending.toLocaleString()} due
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={printSheet} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Print delivery sheet">
              <Printer size={13} />
            </button>
            <button onClick={() => setShowPwModal(true)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-blue-50 hover:text-blue-600 transition-colors" title="Set app password">
              <KeyRound size={13} />
            </button>
            <button onClick={onEdit} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Edit rider">
              <Pencil size={13} />
            </button>
            <button onClick={deleteRider} disabled={loadingDel} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete rider">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone size={11} />
            <a href={`tel:${rider.phone}`} className="hover:text-foreground transition-colors">{rider.phone}</a>
          </div>
          {rider.vehicle_type && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bike size={11} />
              <span className="capitalize">{rider.vehicle_type}</span>
              <span className="ml-auto text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                PKR {chargePerOrder}/delivery
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border">
        {[
          { label: "Active", value: activeCount, color: "text-blue-600" },
          { label: "Delivered", value: deliveredCount, color: "text-green-600" },
          { label: "Total", value: totalCount, color: "text-gray-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="py-3 text-center">
            <p className={`text-lg font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {deliveredCount > 0 && (
        <div className="px-4 py-2.5 border-t border-border/60 bg-purple-50/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-purple-700 font-semibold flex items-center gap-1.5">
              <DollarSign size={12} />
              Estimated Earnings
            </span>
            <span className="font-bold text-purple-800">PKR {(deliveredCount * chargePerOrder).toLocaleString()}</span>
          </div>
        </div>
      )}

      <div className="px-3 pb-3 pt-2 border-t border-border/60">
        <button
          onClick={() => setShowDeliveries(v => !v)}
          className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-1"
        >
          <Package size={12} />
          {showDeliveries ? "Hide" : "Show"} recent deliveries
        </button>

        {showDeliveries && (
          <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
            {(delData?.deliveries ?? []).length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-3">No deliveries yet</p>
            ) : (
              (delData?.deliveries ?? []).slice(0, 10).map((d: any) => (
                <div key={d.id} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50">
                  <span className="font-medium">{d.shopify_order_number}</span>
                  <span className="text-muted-foreground truncate max-w-[100px] mx-2">{d.customer_name}</span>
                  <span className={`px-1.5 py-0.5 rounded-full font-semibold ${
                    d.status === "delivered" ? "bg-green-100 text-green-700" :
                    d.status === "failed" ? "bg-red-100 text-red-700" :
                    "bg-blue-100 text-blue-700"
                  }`}>{d.status?.replace(/_/g, " ")}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showPwModal && (
        <SetPasswordModal rider={rider} onClose={() => setShowPwModal(false)} />
      )}
    </div>
  );
}

/* ── ACCOUNTING PANEL ────────────────────────────────── */
function AccountingPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [settling, setSettling] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["riders-accounting"],
    queryFn: () => apiFetch("/admin/riders/accounting"),
    refetchInterval: 60000,
  });

  const riders = data?.riders ?? [];
  const totals = data?.totals ?? {};

  const settle = async (riderId: number, riderName: string) => {
    if (!confirm(`Mark all pending deliveries for ${riderName} as PAID?`)) return;
    setSettling(riderId);
    try {
      const res = await apiFetch(`/admin/riders/${riderId}/settle`, { method: "POST" });
      if (res.ok) {
        toast({ title: `Settled ${res.settled} deliveries for ${riderName}` });
        refetch();
        qc.invalidateQueries({ queryKey: ["riders-full"] });
      } else toast({ title: "Error", description: res.error, variant: "destructive" });
    } finally { setSettling(null); }
  };

  const printSheet = (riderId: number) => {
    window.open(`/api/admin/riders/${riderId}/sheet?token=${token()}`, "_blank");
  };

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Delivered",     value: Number(totals.total_delivered ?? 0), color: "text-green-600", bg: "bg-green-50", icon: CheckCircle, fmt: (v: number) => v.toString() },
          { label: "Total Earnings",      value: Number(totals.total_earnings ?? 0), color: "text-purple-600", bg: "bg-purple-50", icon: DollarSign, fmt: (v: number) => `PKR ${v.toLocaleString()}` },
          { label: "Pending Settlement",  value: Number(totals.pending_settlement ?? 0), color: "text-amber-600", bg: "bg-amber-50", icon: Clock, fmt: (v: number) => `PKR ${v.toLocaleString()}` },
          { label: "COD Collected",       value: Number(totals.total_cod_collected ?? 0), color: "text-blue-600", bg: "bg-blue-50", icon: CreditCard, fmt: (v: number) => `PKR ${v.toLocaleString()}` },
        ].map(({ label, value, color, bg, icon: Icon, fmt }) => (
          <div key={label} className="bg-white rounded-xl border border-border p-4 flex items-center gap-3 shadow-sm">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon size={18} className={color} />
            </div>
            <div>
              <p className={`text-lg font-bold leading-none ${color}`}>{fmt(value)}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Per-rider table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : riders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-white rounded-xl border border-border">
          <DollarSign size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No rider data yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  {["Rider", "Status", "Delivered", "Failed", "Charge/Order", "Total Earnings", "Paid Out", "Pending", "COD Collected", "Actions"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {riders.map((r: any) => {
                  const pending = Number(r.pending_settlement ?? 0);
                  const isPendingHigh = pending > 0;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                            {r.name?.charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold text-sm leading-none">{r.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{r.delivery_area || "All Areas"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[r.status] ?? STATUS_COLOR.inactive}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-green-700">{Number(r.delivered_count ?? 0)}</td>
                      <td className="px-3 py-3 text-center font-bold text-red-600">{Number(r.failed_count ?? 0)}</td>
                      <td className="px-3 py-3 text-center text-purple-700 font-semibold">PKR {Number(r.delivery_charge_per_order ?? 500).toLocaleString()}</td>
                      <td className="px-3 py-3 font-bold text-purple-700">PKR {Number(r.total_earnings ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 font-semibold text-green-700">PKR {Number(r.paid_settlement ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3">
                        <span className={`font-bold ${isPendingHigh ? "text-amber-700" : "text-gray-400"}`}>
                          {isPendingHigh ? `PKR ${pending.toLocaleString()}` : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-blue-700 font-semibold">PKR {Number(r.cod_collected ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1.5">
                          {isPendingHigh && (
                            <Button
                              size="sm"
                              className="text-xs h-7 px-2.5 bg-amber-500 hover:bg-amber-600 text-white"
                              onClick={() => settle(r.id, r.name)}
                              disabled={settling === r.id}
                            >
                              <CreditCard size={11} className="mr-1" />
                              {settling === r.id ? "..." : "Settle"}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="text-xs h-7 px-2 border-slate-200" onClick={() => printSheet(r.id)}>
                            <Printer size={11} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   COD SETTLEMENT PANEL
══════════════════════════════════════════════════════════ */
function CodSettlementPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [settling, setSettling] = useState<number | null>(null);
  const [historyRider, setHistoryRider] = useState<any | null>(null);
  const [settleModal, setSettleModal] = useState<{ rider: any; maxAmount: number } | null>(null);
  const [settleForm, setSettleForm] = useState({ amount: "", type: "full", notes: "", settled_by: "Admin" });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["riders-cod-pending"],
    queryFn: () => apiFetch("/admin/riders/cod-pending"),
    refetchInterval: 30_000,
  });

  const { data: historyData } = useQuery({
    queryKey: ["rider-cod-history", historyRider?.id],
    queryFn: () => apiFetch(`/admin/riders/${historyRider?.id}/cod-history`),
    enabled: !!historyRider,
  });

  const riders = data?.riders ?? [];
  const totals = data?.totals ?? {};
  const totalPending  = Number(totals.total_pending  ?? 0);
  const totalSettled  = Number(totals.total_settled  ?? 0);
  const totalCollected = Number(totals.total_cod_collected ?? 0);
  const pendingRiders = riders.filter((r: any) => Number(r.pending_cod) > 0);

  const openSettle = (rider: any) => {
    setSettleModal({ rider, maxAmount: Number(rider.pending_cod) });
    setSettleForm({ amount: String(Number(rider.pending_cod).toFixed(0)), type: "full", notes: "", settled_by: "Admin" });
  };

  const submitSettle = async () => {
    if (!settleModal) return;
    setSettling(settleModal.rider.id);
    try {
      const res = await apiFetch(`/admin/riders/${settleModal.rider.id}/cod-settle`, {
        method: "POST",
        body: JSON.stringify(settleForm),
      });
      if (res.ok) {
        toast({ title: `✅ Rs. ${Number(settleForm.amount).toLocaleString()} settled for ${settleModal.rider.name}` });
        setSettleModal(null);
        refetch();
        qc.invalidateQueries({ queryKey: ["riders-cod-pending"] });
      } else {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      }
    } finally { setSettling(null); }
  };

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total COD Collected", value: totalCollected, color: "text-blue-600",  bg: "bg-blue-50",  icon: DollarSign,     fmt: (v: number) => `PKR ${v.toLocaleString()}` },
          { label: "Total Settled",       value: totalSettled,   color: "text-green-600", bg: "bg-green-50", icon: CheckCircle,    fmt: (v: number) => `PKR ${v.toLocaleString()}` },
          { label: "Pending Cash",        value: totalPending,   color: totalPending > 0 ? "text-red-600" : "text-gray-400", bg: totalPending > 0 ? "bg-red-50" : "bg-gray-50", icon: AlertTriangle, fmt: (v: number) => `PKR ${v.toLocaleString()}` },
          { label: "Unsettled Riders",    value: pendingRiders.length, color: pendingRiders.length > 0 ? "text-amber-600" : "text-gray-400", bg: pendingRiders.length > 0 ? "bg-amber-50" : "bg-gray-50", icon: Users, fmt: (v: number) => String(v) },
        ].map(({ label, value, color, bg, icon: Icon, fmt }) => (
          <div key={label} className="bg-white rounded-xl border border-border p-4 flex items-center gap-3 shadow-sm">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon size={18} className={color} />
            </div>
            <div>
              <p className={`text-xl font-bold leading-none ${color}`}>{fmt(value)}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pending alert banner */}
      {totalPending > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-red-800">🔴 PKR {totalPending.toLocaleString()} unsettled COD cash</p>
            <p className="text-sm text-red-700 mt-0.5">{pendingRiders.length} rider{pendingRiders.length !== 1 ? "s have" : " has"} pending cash — collect before end of day</p>
          </div>
          <Button size="sm" onClick={() => refetch()} variant="outline" className="border-red-300 text-red-700 hover:bg-red-100 gap-1">
            <RefreshCw size={12} />Refresh
          </Button>
        </div>
      )}

      {totalPending === 0 && !isLoading && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle size={20} className="text-green-600 shrink-0" />
          <p className="font-semibold text-green-800">✅ All riders are fully settled — no pending COD cash</p>
        </div>
      )}

      {/* Per-rider table */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-slate-50 flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Banknote size={15} className="text-green-600" />COD Settlement Ledger
            </h3>
            <span className="text-xs text-muted-foreground">{riders.length} riders</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  {["Rider", "Status", "Total Collected", "Settled", "Pending COD", "Today's COD", "Actions"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {riders.map((r: any) => {
                  const pending  = Number(r.pending_cod ?? 0);
                  const hasPending = pending > 0;
                  return (
                    <tr key={r.id} className={`hover:bg-slate-50/50 ${hasPending ? "bg-red-50/40" : ""}`}>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${hasPending ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                            {r.name?.charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold text-sm leading-none">{r.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{r.delivery_area || "All Areas"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[r.status] ?? STATUS_COLOR.inactive}`}>{r.status}</span>
                      </td>
                      <td className="px-3 py-3 font-bold text-blue-700">PKR {Number(r.total_cod_collected ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 font-semibold text-green-700">PKR {Number(r.total_settled ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3">
                        {hasPending ? (
                          <span className="inline-flex items-center gap-1 font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                            <AlertCircle size={10} />PKR {pending.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-green-600 font-semibold text-xs">✅ Fully Settled</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-amber-700 font-semibold">
                        {Number(r.today_cod ?? 0) > 0 ? `PKR ${Number(r.today_cod).toLocaleString()}` : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1.5">
                          {hasPending && (
                            <Button size="sm" className="text-xs h-7 px-2.5 bg-green-600 hover:bg-green-700 text-white gap-1" onClick={() => openSettle(r)}>
                              <CheckCircle size={11} />Settle
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="text-xs h-7 px-2 border-slate-200 gap-1" onClick={() => setHistoryRider(historyRider?.id === r.id ? null : r)}>
                            <RotateCcw size={11} />{historyRider?.id === r.id ? "Hide" : "History"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settlement history inline */}
      {historyRider && (
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-slate-50 flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <RotateCcw size={14} className="text-blue-600" />Settlement History — {historyRider.name}
            </h3>
            <button onClick={() => setHistoryRider(null)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
          </div>
          <div className="p-4">
            {!historyData ? (
              <div className="text-center py-6 text-muted-foreground text-sm">Loading...</div>
            ) : (historyData.settlements ?? []).length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">No settlements recorded yet for {historyRider.name}</div>
            ) : (
              <div className="space-y-2">
                {(historyData.settlements ?? []).map((s: any) => (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                    <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center shrink-0">
                      <CheckCircle size={14} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-green-800">
                        PKR {Number(s.amount).toLocaleString()}
                        <span className="ml-2 text-xs font-normal text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">{s.type}</span>
                      </p>
                      {s.notes && <p className="text-xs text-green-700 mt-0.5">{s.notes}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">by {s.settled_by} · {new Date(s.created_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settlement modal */}
      {settleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <CheckCircle size={20} className="text-green-600" />Record COD Settlement
              </h2>
              <button onClick={() => setSettleModal(null)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-amber-600 flex items-center justify-center text-white font-bold text-sm">
                  {settleModal.rider.name?.charAt(0)}
                </div>
                <p className="font-bold text-amber-900">{settleModal.rider.name}</p>
              </div>
              <p className="text-sm text-amber-700">Pending COD: <strong className="text-amber-900">PKR {settleModal.maxAmount.toLocaleString()}</strong></p>
              <p className="text-xs text-amber-600 mt-0.5">Total collected: PKR {Number(settleModal.rider.total_cod_collected ?? 0).toLocaleString()}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Amount Received (PKR) *</label>
                <input type="number" value={settleForm.amount}
                  onChange={e => setSettleForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Enter amount" min="1" max={settleModal.maxAmount}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Settlement Type</label>
                <select value={settleForm.type} onChange={e => setSettleForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="full">Full Settlement</option>
                  <option value="partial">Partial Settlement</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Confirmed By</label>
                <input type="text" value={settleForm.settled_by}
                  onChange={e => setSettleForm(f => ({ ...f, settled_by: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Admin name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Notes (optional)</label>
                <textarea value={settleForm.notes} onChange={e => setSettleForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Cash received, bank transfer, receipt note…"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setSettleModal(null)}>Cancel</Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1.5"
                onClick={submitSettle}
                disabled={settling === settleModal.rider.id || !settleForm.amount || Number(settleForm.amount) <= 0}
              >
                <CheckCircle size={15} />
                {settling === settleModal.rider.id ? "Saving…" : "Confirm Settlement"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SHOPIFY SYNC MONITOR PANEL
══════════════════════════════════════════════════════════ */
const ACTION_LABELS: Record<string, string> = {
  assigned:         "📦 Assigned",
  local_delivery:   "🏍️ Local Delivery",
  picked:           "📦 Picked Up",
  out_for_delivery: "🚚 Out for Delivery",
  delivered:        "✅ Delivered",
  failed:           "❌ Failed",
  returned:         "↩️ Returned",
  cancelled:        "🚫 Cancelled",
  delayed:          "⏳ Delayed",
  rescheduled:      "📅 Rescheduled",
  reassigned:       "🔄 Reassigned",
};

function ShopifySyncMonitor() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["shopify-sync-stats"],
    queryFn: () => apiFetch("/admin/riders/shopify-sync/stats"),
    refetchInterval: 30_000,
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ["shopify-sync-logs", statusFilter],
    queryFn: () => apiFetch(`/admin/riders/shopify-sync/logs?limit=100${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`),
    refetchInterval: 15_000,
  });

  const retryMut = useMutation({
    mutationFn: (ids?: number[]) =>
      fetch("/api/admin/riders/shopify-sync/retry", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ ids }),
      }).then(r => r.json()),
    onSuccess: (d) => {
      toast({ title: `✅ Queued ${d.queued} retries` });
      qc.invalidateQueries({ queryKey: ["shopify-sync-logs"] });
      qc.invalidateQueries({ queryKey: ["shopify-sync-stats"] });
    },
    onError: () => toast({ title: "Retry failed", variant: "destructive" }),
  });

  const stats = statsData?.last24h ?? [];
  const success = stats.find((s: any) => s.status === "success")?.count ?? 0;
  const failed  = stats.find((s: any) => s.status === "failed")?.count ?? 0;
  const pending = stats.find((s: any) => s.status === "pending")?.count ?? 0;
  const logs: any[] = logsData?.logs ?? [];
  const failedIds = logs.filter(l => l.status === "failed").map(l => l.id);

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Successful (24h)",  value: success, icon: CheckCircle,  color: "text-green-600",  bg: "bg-green-50" },
          { label: "Failed (24h)",      value: failed,  icon: XCircle,       color: "text-red-600",    bg: "bg-red-50" },
          { label: "Pending Retries",   value: pending, icon: Clock,         color: "text-amber-600",  bg: "bg-amber-50" },
          { label: "Total All-Time",    value: statsData?.total ?? 0, icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border p-4 flex items-center gap-3 shadow-sm">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon size={18} className={color} />
            </div>
            <div>
              <p className="text-xl font-bold">{statsLoading ? "…" : value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {["all","success","failed","pending"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${
                statusFilter === s ? "bg-white shadow text-blue-700" : "text-muted-foreground hover:text-foreground"
              }`}
            >{s}</button>
          ))}
        </div>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={() => { qc.invalidateQueries({ queryKey: ["shopify-sync-logs"] }); qc.invalidateQueries({ queryKey: ["shopify-sync-stats"] }); }}
        ><RefreshCw size={12} />Refresh</Button>
        {failedIds.length > 0 && (
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white"
            onClick={() => retryMut.mutate(failedIds)}
            disabled={retryMut.isPending}
          ><RotateCcw size={12} />Retry All Failed ({failedIds.length})</Button>
        )}
      </div>

      {/* Logs table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Zap size={14} className="text-blue-600" />
            Shopify Sync Log
          </h3>
          <span className="text-xs text-muted-foreground">{logs.length} records</span>
        </div>
        <div className="overflow-x-auto">
          {logsLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="p-10 text-center">
              <ShieldCheck size={36} className="mx-auto mb-2 text-green-500 opacity-60" />
              <p className="text-sm font-medium text-muted-foreground">No sync logs yet</p>
              <p className="text-xs text-muted-foreground mt-1">Logs appear when rider/admin actions trigger Shopify updates</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Time</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Order</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Action</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Status</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Attempt</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Error</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Retry</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any) => (
                  <tr key={log.id} className="border-b hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("en-PK", {
                        month: "short", day: "2-digit",
                        hour: "2-digit", minute: "2-digit", hour12: true,
                      })}
                    </td>
                    <td className="px-3 py-2 font-mono font-bold">
                      {log.shopify_order_number ? `#${log.shopify_order_number}` : log.shopify_order_id}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                        log.status === "success" ? "bg-green-100 text-green-700" :
                        log.status === "failed"  ? "bg-red-100 text-red-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {log.status === "success" ? "✓" : log.status === "failed" ? "✗" : "⟳"} {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">{log.attempt}</td>
                    <td className="px-3 py-2 text-red-600 max-w-[200px] truncate" title={log.error ?? ""}>
                      {log.error ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {log.status === "failed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-2 gap-1"
                          onClick={() => retryMut.mutate([log.id])}
                          disabled={retryMut.isPending}
                        ><RotateCcw size={10} />Retry</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   DAILY REPORTS PANEL
══════════════════════════════════════════════════════════ */
function DailyReportsPanel() {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate]             = useState(today);
  const [filterRider, setFilterRider] = useState("");
  const [filterArea, setFilterArea]   = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [showLogs, setShowLogs]       = useState(false);

  const params = new URLSearchParams({ date });
  if (filterArea)    params.set("area", filterArea);
  if (filterPayment) params.set("payment", filterPayment);

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/admin/riders/daily-report", date, filterArea, filterPayment],
    queryFn: () => apiFetch(`/admin/riders/daily-report?${params.toString()}`),
    refetchInterval: 60000,
  });

  const { data: ridersData } = useQuery<any>({
    queryKey: ["/api/admin/riders"],
    queryFn: () => apiFetch("/admin/riders"),
  });

  const { data: logsData, refetch: refetchLogs } = useQuery<any>({
    queryKey: ["/api/admin/riders/daily-report/logs"],
    queryFn: () => apiFetch("/admin/riders/daily-report/logs"),
    enabled: showLogs,
  });

  const sendMutation = useMutation({
    mutationFn: () => apiFetch("/admin/riders/daily-report/send", {
      method: "POST",
      body: JSON.stringify({ date }),
    }),
    onSuccess: (d) => {
      if (d.ok) {
        toast({ title: `✅ Report sent! WA: ${d.waOk ? "✓" : "✗"} Email: ${d.emailOk ? "✓" : "✗"}` });
        refetchLogs();
      } else {
        toast({ title: "Send failed", variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Failed to send report", variant: "destructive" }),
  });

  const report = data;
  const totals = report?.totals ?? {};
  const riders: any[] = (report?.riders ?? []).filter((r: any) =>
    filterRider ? r.name.toLowerCase().includes(filterRider.toLowerCase()) : true
  );
  const topRider = report?.topRider;

  const STAT_CARDS = [
    { label: "Total Delivered",    value: totals.delivered ?? 0,                                               color: "emerald",  icon: CheckCircle },
    { label: "Total COD Collected", value: `Rs. ${(totals.cod_collected ?? 0).toLocaleString()}`,              color: "blue",     icon: DollarSign },
    { label: "Pending Settlement",  value: `Rs. ${(totals.settlement_pending ?? 0).toLocaleString()}`,         color: totals.settlement_pending > 0 ? "red" : "emerald", icon: AlertTriangle },
    { label: "Failed / Returned",   value: `${totals.failed ?? 0} / ${totals.returned ?? 0}`,                  color: "rose",     icon: XCircle },
    { label: "Paid Orders",         value: totals.paid_orders ?? 0,                                             color: "green",    icon: CreditCard },
    { label: "Zero Amount Orders",  value: totals.zero_amount_orders ?? 0,                                      color: "slate",    icon: Package },
  ];

  const COL_COLORS: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    blue:    "bg-blue-50 border-blue-200 text-blue-700",
    red:     "bg-red-50 border-red-200 text-red-700",
    rose:    "bg-rose-50 border-rose-200 text-rose-700",
    green:   "bg-green-50 border-green-200 text-green-700",
    slate:   "bg-slate-50 border-slate-200 text-slate-600",
  };

  return (
    <div className="space-y-5">

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText size={18} className="text-indigo-600" />
            Rider Daily Collection Report
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Auto-sent 8 PM PKT · WhatsApp 03040424252 · kdfmarts@gmail.com
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 gap-1.5 text-xs">
            <RefreshCw size={13} /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending}
            className="h-8 gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Send size={13} className={sendMutation.isPending ? "animate-pulse" : ""} />
            {sendMutation.isPending ? "Sending…" : "Send Report Now"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-border rounded-xl p-4">
        <div className="flex items-center gap-1.5 mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Filter size={12} /> Filters
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full h-8 px-2 text-xs border border-input rounded-md bg-background"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 block">Rider Name</label>
            <Input value={filterRider} onChange={e => setFilterRider(e.target.value)}
              placeholder="Search rider..." className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 block">Area / Zone</label>
            <Input value={filterArea} onChange={e => setFilterArea(e.target.value)}
              placeholder="e.g. Lahore" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 block">Payment Type</label>
            <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)}
              className="w-full h-8 px-2 text-xs border border-input rounded-md bg-background">
              <option value="">All</option>
              <option value="cod">COD Only</option>
              <option value="paid">Paid Only</option>
              <option value="zero">Zero Amount</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {STAT_CARDS.map(({ label, value, color, icon: Icon }) => (
          <div key={label} className={`border rounded-xl p-3 ${COL_COLORS[color]}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={13} />
              <span className="text-[10px] font-semibold uppercase tracking-wide truncate">{label}</span>
            </div>
            <p className="text-xl font-black">{value}</p>
          </div>
        ))}
      </div>

      {/* Top Rider Banner */}
      {topRider && topRider.delivered > 0 && (
        <div className="flex items-center gap-3 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl px-4 py-3">
          <Trophy size={20} className="text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900">🏆 Top Rider — {topRider.name}</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {topRider.delivered} delivered · Rs. {topRider.cod_collected.toLocaleString()} COD
              {topRider.delivery_area ? ` · ${topRider.delivery_area}` : ""}
            </p>
          </div>
          {topRider.settlement_pending > 0 && (
            <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-semibold">
              ⚠️ Rs. {topRider.settlement_pending.toLocaleString()} pending
            </span>
          )}
        </div>
      )}

      {/* Rider Table */}
      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-border bg-slate-50/60 flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Users size={14} className="text-indigo-500" />
            Per-Rider Breakdown
            <span className="text-xs font-normal text-muted-foreground ml-1">
              ({riders.filter((r: any) => r.total_assignments > 0).length} active · {riders.length} total)
            </span>
          </h3>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <CalendarDays size={11} /> {date}
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
            Loading report…
          </div>
        ) : riders.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Package size={32} className="mx-auto mb-2 opacity-30" />
            <p>No rider data for {date}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Rider", "Area", "Delivered", "Pending", "Failed", "Returned", "Paid", "Zero Amt", "COD Collected", "Settled", "Pending Settlement", "Status"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {riders.map((r: any, i: number) => {
                  const isActive = r.total_assignments > 0;
                  return (
                    <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/60 ${!isActive ? "opacity-50" : ""}`}>
                      <td className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {i === 0 && isActive && <Star size={10} className="text-amber-400 shrink-0" />}
                          {r.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-normal">{r.phone}</div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.delivery_area || "—"}</td>
                      <td className="px-3 py-2.5 text-center font-bold text-emerald-700">{r.delivered}</td>
                      <td className="px-3 py-2.5 text-center text-amber-600">{r.pending}</td>
                      <td className="px-3 py-2.5 text-center text-red-600">{r.failed}</td>
                      <td className="px-3 py-2.5 text-center text-purple-600">{r.returned}</td>
                      <td className="px-3 py-2.5 text-center text-blue-600 font-semibold">{r.paid_orders}</td>
                      <td className="px-3 py-2.5 text-center text-slate-500">{r.zero_amount_orders}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-blue-700">
                        {r.cod_collected > 0 ? `Rs. ${r.cod_collected.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-600">
                        {r.total_settled > 0 ? `Rs. ${r.total_settled.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold">
                        {r.settlement_pending > 0 ? (
                          <span className="text-red-600">Rs. {r.settlement_pending.toLocaleString()}</span>
                        ) : r.cod_collected > 0 ? (
                          <span className="text-emerald-600">✅ Settled</span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          r.settlement_pending > 0 ? "bg-red-50 text-red-700 border-red-200" :
                          isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          "bg-slate-50 text-slate-500 border-slate-200"
                        }`}>
                          {r.settlement_pending > 0 ? "⚠️ Unsettled" : isActive ? "✅ OK" : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-200 font-bold">
                  <td colSpan={2} className="px-3 py-2.5 text-xs font-black">TOTAL ({riders.length} riders)</td>
                  <td className="px-3 py-2.5 text-center text-emerald-700">{totals.delivered ?? 0}</td>
                  <td className="px-3 py-2.5 text-center text-amber-600">{totals.pending ?? 0}</td>
                  <td className="px-3 py-2.5 text-center text-red-600">{totals.failed ?? 0}</td>
                  <td className="px-3 py-2.5 text-center text-purple-600">{totals.returned ?? 0}</td>
                  <td className="px-3 py-2.5 text-center text-blue-600">{totals.paid_orders ?? 0}</td>
                  <td className="px-3 py-2.5 text-center text-slate-500">{totals.zero_amount_orders ?? 0}</td>
                  <td className="px-3 py-2.5 text-right text-blue-700">Rs. {(totals.cod_collected ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-600">Rs. {(totals.total_settled ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-red-600">Rs. {(totals.settlement_pending ?? 0).toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* WhatsApp Preview */}
      {riders.filter((r: any) => r.total_assignments > 0).length > 0 && (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setShowLogs(v => !v)}
            className="w-full px-4 py-3 border-b border-border bg-slate-50/60 flex items-center justify-between hover:bg-slate-100 transition-colors"
          >
            <h3 className="text-sm font-bold flex items-center gap-2">
              <MessageCircle size={14} className="text-green-600" />
              WhatsApp Report Preview
            </h3>
            <ChevronDown size={14} className={`transition-transform ${showLogs ? "rotate-180" : ""}`} />
          </button>
          {showLogs && (
            <div className="p-4 bg-[#075e54] rounded-b-xl">
              <div className="bg-[#dcf8c6] rounded-xl p-3 max-w-sm mx-auto text-xs text-[#303030] whitespace-pre-wrap font-mono shadow-md">
                {buildWaPreview(riders.filter((r: any) => r.total_assignments > 0), totals, date)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Send History */}
      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <button
          onClick={() => setShowLogs(v => !v)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Clock size={14} className="text-muted-foreground" />
            Report Send History
          </h3>
          <ChevronDown size={14} className={`transition-transform ${showLogs ? "rotate-180" : ""}`} />
        </button>
        {showLogs && (
          <div className="border-t border-border">
            {!logsData?.logs?.length ? (
              <p className="text-xs text-center text-muted-foreground py-6">No reports sent yet</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b">
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-muted-foreground uppercase">Date</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-muted-foreground uppercase">Sent At</th>
                    <th className="px-3 py-2 text-center text-[10px] font-bold text-muted-foreground uppercase">WhatsApp</th>
                    <th className="px-3 py-2 text-center text-[10px] font-bold text-muted-foreground uppercase">Email</th>
                    <th className="px-3 py-2 text-center text-[10px] font-bold text-muted-foreground uppercase">Riders</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-muted-foreground uppercase">COD</th>
                  </tr>
                </thead>
                <tbody>
                  {logsData.logs.map((log: any) => (
                    <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-3 py-2 font-mono font-semibold">{String(log.report_date).slice(0, 10)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{new Date(log.sent_at).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${log.wa_status === "sent" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {log.wa_status === "sent" ? "✓ Sent" : "✗ Failed"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${log.email_status === "sent" ? "bg-blue-100 text-blue-700" : log.email_status === "not_configured" ? "bg-slate-100 text-slate-500" : "bg-red-100 text-red-700"}`}>
                          {log.email_status === "sent" ? "✓ Sent" : log.email_status === "not_configured" ? "Not configured" : "✗ Failed"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">{log.rider_count ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700">
                        {log.totals?.cod_collected ? `Rs. ${Number(log.totals.cod_collected).toLocaleString()}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function buildWaPreview(riders: any[], totals: any, date: string): string {
  const d = new Date(date + "T00:00:00+05:00").toLocaleDateString("en-PK", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  let msg = `📦 *KDF NUTS — Rider Daily Report*\n📅 *${d}*\n━━━━━━━━━━━━━━━━━━\n\n`;
  for (const r of riders.slice(0, 3)) {
    msg += `👤 *${r.name}*${r.delivery_area ? `\n📍 ${r.delivery_area}` : ""}\n`;
    msg += `✅ Delivered: ${r.delivered}`;
    if (r.pending) msg += `  ⏳ Pending: ${r.pending}`;
    msg += `\n`;
    if (r.cod_collected > 0) msg += `💰 COD: Rs. ${r.cod_collected.toLocaleString()}\n`;
    if (r.paid_orders) msg += `🟢 Paid: ${r.paid_orders}\n`;
    if (r.zero_amount_orders) msg += `⚪ Zero Amt: ${r.zero_amount_orders}\n`;
    if (r.settlement_pending > 0) msg += `⚠️ Pending: Rs. ${r.settlement_pending.toLocaleString()}\n`;
    if (r.failed) msg += `❌ Failed: ${r.failed}\n`;
    if (r.returned) msg += `↩️ Returns: ${r.returned}\n`;
    msg += `━━━━━━━━━━━━━━━━━━\n`;
  }
  if (riders.length > 3) msg += `... +${riders.length - 3} more riders\n━━━━━━━━━━━━━━━━━━\n`;
  msg += `\n📊 *SUMMARY*\n✅ Total Delivered: ${totals.delivered ?? 0}\n💰 Total COD: Rs. ${(totals.cod_collected ?? 0).toLocaleString()}`;
  if (totals.settlement_pending > 0) msg += `\n⚠️ *Unsettled: Rs. ${totals.settlement_pending.toLocaleString()}*`;
  return msg;
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */
export default function RidersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editRider, setEditRider] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"riders" | "accounting" | "cod-settlement" | "shopify-sync" | "daily-reports">("riders");

  const { data, isLoading } = useQuery({
    queryKey: ["riders-full"],
    queryFn: () => apiFetch("/admin/riders"),
    refetchInterval: 60000,
  });

  const { data: statsData } = useQuery({
    queryKey: ["rider-stats-page"],
    queryFn: () => apiFetch("/admin/riders/stats"),
    refetchInterval: 30000,
  });

  const { data: codData } = useQuery({
    queryKey: ["riders-cod-pending"],
    queryFn: () => apiFetch("/admin/riders/cod-pending"),
    refetchInterval: 60000,
  });

  const codPendingMap: Record<number, number> = {};
  (codData?.riders ?? []).forEach((r: any) => {
    codPendingMap[r.id] = Number(r.pending_cod ?? 0);
  });
  const totalCodPending = Number(codData?.totals?.total_pending ?? 0);
  const codPendingRidersCount = (codData?.riders ?? []).filter((r: any) => Number(r.pending_cod) > 0).length;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["riders-full"] });
    qc.invalidateQueries({ queryKey: ["rider-stats-page"] });
    qc.invalidateQueries({ queryKey: ["riders-accounting"] });
    qc.invalidateQueries({ queryKey: ["riders-cod-pending"] });
  };

  const riders: any[] = (data?.riders ?? []).filter((r: any) =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase()) || r.phone?.includes(search) || r.delivery_area?.toLowerCase().includes(search.toLowerCase())
  );

  const s = statsData?.stats ?? {};
  const leaderboard = statsData?.riderLeaderboard ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-screen-2xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="text-blue-600" size={24} />
            Rider Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage local delivery riders, earnings, and settlements for Lahore orders</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
            <RefreshCw size={14} />Refresh
          </Button>
          <Button size="sm" onClick={() => { setEditRider(null); setShowModal(true); }} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
            <Plus size={14} />Add Rider
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active Riders",    value: s.active_riders ?? 0,   icon: CheckCircle, color: "text-green-600",  bg: "bg-green-50", fmt: (v: any) => v },
          { label: "Total Deliveries", value: s.total_assigned ?? 0,   icon: Package,    color: "text-blue-600",   bg: "bg-blue-50", fmt: (v: any) => v },
          { label: "Delivered",        value: s.delivered ?? 0,        icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50", fmt: (v: any) => v },
          { label: "COD Collected",    value: s.cod_collected ?? 0,    icon: DollarSign, color: "text-amber-600", bg: "bg-amber-50", fmt: (v: any) => `PKR ${Number(v).toLocaleString()}` },
        ].map(({ label, value, icon: Icon, color, bg, fmt }) => (
          <div key={label} className="bg-white rounded-xl border border-border p-4 flex items-center gap-3 shadow-sm">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon size={18} className={color} />
            </div>
            <div>
              <p className="text-xl font-bold leading-none">{fmt(value)}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* COD Pending warning banner */}
      {totalCodPending > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0 animate-pulse">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-red-800">
              🔴 PKR {totalCodPending.toLocaleString()} unsettled COD cash
            </p>
            <p className="text-sm text-red-700 mt-0.5">
              {codPendingRidersCount} rider{codPendingRidersCount !== 1 ? "s have" : " has"} pending cash collection — settle before end of day
            </p>
          </div>
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white gap-1.5 shrink-0"
            onClick={() => setActiveTab("cod-settlement")}
          >
            <Banknote size={14} />Settle Now
          </Button>
        </div>
      )}

      {/* Tab toggle */}
      <div className="flex flex-wrap gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          ["riders",         "Riders",          Users,       null],
          ["accounting",     "Accounting",       DollarSign,  null],
          ["cod-settlement", "COD Settlement",   Banknote,    codPendingRidersCount > 0 ? codPendingRidersCount : null],
          ["daily-reports",  "Daily Reports",    FileText,    null],
          ["shopify-sync",   "Shopify Sync",     Zap,         null],
        ] as const).map(([key, label, Icon, badge]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === key ? "bg-white shadow-sm text-blue-700" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={15} />{label}
            {badge ? (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === "accounting" ? (
        <AccountingPanel />
      ) : activeTab === "cod-settlement" ? (
        <CodSettlementPanel />
      ) : activeTab === "daily-reports" ? (
        <DailyReportsPanel />
      ) : activeTab === "shopify-sync" ? (
        <ShopifySyncMonitor />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Riders Grid */}
          <div className="xl:col-span-3 space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search riders by name, phone, or area..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9"
              />
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-60 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : riders.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground bg-white rounded-xl border border-border">
                <Users size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">No riders found</p>
                <p className="text-sm mt-1">Add your first rider to get started</p>
                <Button className="mt-4 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowModal(true)}>
                  <Plus size={14} className="mr-1.5" />Add First Rider
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {riders.map((rider: any) => (
                  <RiderCard
                    key={rider.id}
                    rider={rider}
                    codPending={codPendingMap[rider.id] ?? 0}
                    onEdit={() => { setEditRider(rider); setShowModal(true); }}
                    onDelete={refresh}
                    onRefresh={refresh}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Leaderboard */}
          <div className="xl:col-span-1">
            <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden sticky top-6">
              <div className="px-4 py-3 border-b border-border bg-slate-50/50">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <TrendingUp size={15} className="text-amber-500" />
                  Leaderboard
                </h3>
              </div>
              <div className="p-3 space-y-2">
                {leaderboard.length === 0 ? (
                  <p className="text-xs text-center text-muted-foreground py-6">No data yet</p>
                ) : (
                  leaderboard.map((r: any, i: number) => (
                    <div key={r.id} className={`flex items-center gap-3 p-2.5 rounded-lg ${i === 0 ? "bg-amber-50 border border-amber-200" : i === 1 ? "bg-gray-50" : ""}`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        i === 0 ? "bg-amber-500 text-white" : i === 1 ? "bg-gray-400 text-white" : i === 2 ? "bg-orange-400 text-white" : "bg-slate-200 text-slate-600"
                      }`}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{r.name}</p>
                        <p className="text-[10px] text-muted-foreground">{r.delivery_area || "All areas"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600">{r.delivered}</p>
                        <p className="text-[10px] text-muted-foreground">done</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <RiderModal
          rider={editRider}
          onClose={() => { setShowModal(false); setEditRider(null); }}
          onSaved={() => { setShowModal(false); setEditRider(null); refresh(); }}
        />
      )}
    </div>
  );
}
