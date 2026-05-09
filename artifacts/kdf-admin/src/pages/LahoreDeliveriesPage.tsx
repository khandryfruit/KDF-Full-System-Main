import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  MapPin, Package, MessageCircle, Printer, RefreshCw,
  Users, CheckCircle, Clock, Truck, AlertCircle, Search,
  ChevronLeft, ChevronRight, Zap, UserPlus,
  LayoutGrid, List, Send, X, Database, Wifi,
  Bell, BellOff, Settings2, Activity, Timer,
  Navigation, PhoneCall, DollarSign, TrendingUp, Eye,
  Volume2, VolumeX, BarChart3, Shield,
} from "lucide-react";

const API = "/api";
const token = () => localStorage.getItem("kdf_admin_token") ?? "";
const h = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
async function apiFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, { ...opts, headers: { ...h(), ...(opts.headers ?? {}) } });
  return r.json();
}

/* ── Sound Alerts (Web Audio API) ── */
function playAlert(type: "assign" | "delivered" | "failed" | "near") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const freqs: Record<string, number[]> = {
      assign:    [440, 550, 660],
      delivered: [660, 880, 1100],
      failed:    [330, 220],
      near:      [880, 880, 1100, 880],
    };
    const notes = freqs[type] ?? [440];
    let t = ctx.currentTime;
    notes.forEach(freq => {
      osc.frequency.setValueAtTime(freq, t);
      t += 0.12;
    });
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.7);
  } catch {}
}

/* ── Status config ── */
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.FC<any>; emoji: string }> = {
  pending:          { label: "Pending",          color: "text-gray-600",   bg: "bg-gray-100",   icon: Clock,      emoji: "⏳" },
  unassigned:       { label: "Unassigned",        color: "text-gray-500",   bg: "bg-gray-50",    icon: Clock,      emoji: "📋" },
  assigned:         { label: "Assigned",          color: "text-blue-700",   bg: "bg-blue-100",   icon: UserPlus,   emoji: "🛵" },
  picked:           { label: "Picked",            color: "text-purple-700", bg: "bg-purple-100", icon: Package,    emoji: "📦" },
  out_for_delivery: { label: "Out for Delivery",  color: "text-orange-700", bg: "bg-orange-100", icon: Truck,      emoji: "🚚" },
  near_customer:    { label: "Near Customer",     color: "text-rose-700",   bg: "bg-rose-100",   icon: Navigation, emoji: "📍" },
  delivered:        { label: "Delivered",         color: "text-green-700",  bg: "bg-green-100",  icon: CheckCircle,emoji: "✅" },
  failed:           { label: "Failed",            color: "text-red-700",    bg: "bg-red-100",    icon: AlertCircle,emoji: "❌" },
  returned:         { label: "Returned",          color: "text-yellow-700", bg: "bg-yellow-100", icon: Package,    emoji: "↩️" },
  delayed:          { label: "Delayed",           color: "text-amber-700",  bg: "bg-amber-100",  icon: Clock,      emoji: "⏰" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

const ETA_PRESETS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "Same Day", value: 480 },
];

/* ══════════════════════════════════════════════════════════
   ASSIGN MODAL — with ETA + customer WA option
══════════════════════════════════════════════════════════ */
function AssignModal({ order, riders, onClose, onDone, defaultEta }: {
  order: any; riders: any[]; onClose: () => void; onDone: () => void; defaultEta: number;
}) {
  const { toast } = useToast();
  const [riderId,     setRiderId]     = useState<string>(order.rider_id?.toString() ?? "");
  const [notes,       setNotes]       = useState(order.delivery_notes ?? "");
  const [sendWa,      setSendWa]      = useState(true);
  const [sendCustWa,  setSendCustWa]  = useState(true);
  const [etaMinutes,  setEtaMinutes]  = useState(defaultEta);
  const [sending,     setSending]     = useState(false);

  const assign = async () => {
    setSending(true);
    try {
      const res = await apiFetch("/admin/riders/assign", {
        method: "POST",
        body: JSON.stringify({
          shopify_order_db_id: order.id,
          rider_id: riderId || null,
          notes,
          eta_minutes: etaMinutes,
          send_customer_wa: sendCustWa,
        }),
      });
      if (res.ok || res.delivery) {
        if (sendWa && riderId) {
          await apiFetch(`/admin/riders/orders/${order.id}/send-wa`, { method: "POST" }).catch(() => {});
        }
        toast({ title: "✅ Assigned!", description: `Order ${order.order_number} assigned${sendCustWa ? " — Customer notified via WA" : ""}` });
        onDone();
      } else {
        toast({ title: "Error", description: res.error ?? "Failed", variant: "destructive" });
      }
    } finally { setSending(false); }
  };

  const selectedRider = riders.find(r => r.id?.toString() === riderId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">Assign Rider</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{order.order_number} — {order.customer_name}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Rider select */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Select Rider</label>
            <select className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background"
              value={riderId} onChange={e => setRiderId(e.target.value)}>
              <option value="">-- Unassigned --</option>
              {riders.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.delivery_area || "All Areas"}) — {r.active_deliveries ?? 0} active
                </option>
              ))}
            </select>
            {selectedRider && (
              <p className="text-xs text-muted-foreground mt-1">
                📞 {selectedRider.phone} · {selectedRider.active_deliveries ?? 0} active orders
              </p>
            )}
          </div>

          {/* ETA */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
              <Timer size={12} className="inline mr-1" />Estimated Delivery Time
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {ETA_PRESETS.map(p => (
                <button key={p.value} onClick={() => setEtaMinutes(p.value)}
                  className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors ${etaMinutes === p.value ? "bg-green-600 text-white border-green-600" : "border-border hover:bg-muted"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input type="number" value={etaMinutes} onChange={e => setEtaMinutes(parseInt(e.target.value) || 30)}
                className="h-8 text-sm w-24" min={5} max={1440} />
              <span className="text-xs text-muted-foreground">minutes custom</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Notes</label>
            <textarea className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none"
              rows={2} placeholder="Delivery instructions..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {/* WA toggles */}
          <div className="space-y-2 bg-green-50 rounded-xl p-3 border border-green-100">
            <p className="text-xs font-semibold text-green-800 mb-2">WhatsApp Notifications</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={sendWa} onChange={e => setSendWa(e.target.checked)} className="rounded" />
              <MessageCircle size={14} className="text-green-600" />
              Notify Rider via WhatsApp
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={sendCustWa} onChange={e => setSendCustWa(e.target.checked)} className="rounded" />
              <Send size={14} className="text-purple-600" />
              Notify Customer (rider assigned + ETA)
            </label>
          </div>
        </div>
        <div className="p-4 border-t flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={assign} disabled={sending} className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
            {sending ? "Saving..." : <><Zap size={14} />Assign & Dispatch</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   STATUS UPDATE ROW — quick actions with WA
══════════════════════════════════════════════════════════ */
const STATUS_FLOW = [
  { value: "assigned",         label: "Assigned",   emoji: "🛵" },
  { value: "picked",           label: "Picked",     emoji: "📦" },
  { value: "out_for_delivery", label: "On Route",   emoji: "🚚" },
  { value: "near_customer",    label: "Near",       emoji: "📍" },
  { value: "delivered",        label: "Delivered",  emoji: "✅" },
  { value: "failed",           label: "Failed",     emoji: "❌" },
  { value: "returned",         label: "Returned",   emoji: "↩️" },
  { value: "delayed",          label: "Delayed",    emoji: "⏰" },
];

function QuickStatusBar({ deliveryId, currentStatus, onDone, soundEnabled }: {
  deliveryId: number; currentStatus: string; onDone: () => void; soundEnabled: boolean;
}) {
  const { toast } = useToast();
  const [updating, setUpdating] = useState(false);

  const update = async (status: string) => {
    if (status === currentStatus) return;
    setUpdating(true);
    try {
      await apiFetch(`/admin/riders/deliveries/${deliveryId}/status`, { method: "PUT", body: JSON.stringify({ status }) });
      if (soundEnabled) {
        if (status === "delivered") playAlert("delivered");
        else if (status === "failed") playAlert("failed");
        else if (status === "near_customer") playAlert("near");
        else playAlert("assign");
      }
      toast({ title: `${STATUS_CONFIG[status]?.emoji ?? ""} Status updated`, description: status.replace(/_/g, " ") });
      onDone();
    } finally { setUpdating(false); }
  };

  return (
    <div className="flex flex-wrap gap-1">
      {STATUS_FLOW.map(s => (
        <button key={s.value} onClick={() => update(s.value)} disabled={updating || s.value === currentStatus}
          className={`px-2 py-0.5 text-[10px] rounded-full border font-semibold transition-all whitespace-nowrap
            ${s.value === currentStatus
              ? "bg-green-600 text-white border-green-600 cursor-default"
              : "border-border text-muted-foreground hover:border-green-400 hover:text-green-700 hover:bg-green-50"}`}>
          {s.emoji} {s.label}
        </button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ORDER CARD (Card View)
══════════════════════════════════════════════════════════ */
function OrderCard({ order, riders, onRefresh, soundEnabled, defaultEta }: {
  order: any; riders: any[]; onRefresh: () => void; soundEnabled: boolean; defaultEta: number;
}) {
  const { toast } = useToast();
  const [showAssign,    setShowAssign]    = useState(false);
  const [sending,       setSending]       = useState<string | null>(null);

  const deliveryStatus = order.delivery_status ?? (order.delivery_id ? "assigned" : "unassigned");
  const isPaid = order.financial_status === "paid";
  const cod = Number(order.cod_amount ?? order.total_price ?? 0);

  const addr = (() => {
    try {
      const a = typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address;
      return [a?.address1, a?.city].filter(Boolean).join(", ");
    } catch { return "Lahore"; }
  })();

  const sendWa = async (type: "rider" | "customer" | "cod") => {
    setSending(type);
    try {
      let path = "";
      if (type === "rider")    path = `/admin/riders/orders/${order.id}/send-wa`;
      if (type === "customer") path = `/admin/riders/orders/${order.id}/customer-invoice-wa`;
      if (type === "cod")      path = `/admin/riders/deliveries/${order.delivery_id}/cod-reminder`;
      const res = await apiFetch(path, { method: "POST" });
      if (res.ok) toast({ title: type === "rider" ? "📱 WA sent to rider!" : type === "cod" ? "💰 COD reminder sent!" : "📨 Invoice sent to customer!" });
      else toast({ title: "Error", description: res.error ?? res.message, variant: "destructive" });
      onRefresh();
    } finally { setSending(null); }
  };

  const openInvoice = () => window.open(`/api/admin/riders/orders/${order.id}/invoice?token=${token()}`, "_blank");
  const cfg = STATUS_CONFIG[deliveryStatus] ?? STATUS_CONFIG.pending;

  return (
    <>
      <div className="bg-white rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow overflow-hidden">
        {/* Header */}
        <div className={`flex items-center justify-between px-3 py-2.5 border-b ${cfg.bg}/30`}>
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center`}>
              <cfg.icon size={13} className={cfg.color} />
            </div>
            <div>
              <span className="font-bold text-sm">{order.order_number}</span>
              <p className="text-[10px] text-muted-foreground">{new Date(order.order_date).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge status={deliveryStatus} />
            {!isPaid && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">COD {cod.toLocaleString()}</Badge>}
            {isPaid  && <Badge variant="outline" className="text-[10px] text-green-700 border-green-300 bg-green-50">PAID</Badge>}
          </div>
        </div>

        {/* Body */}
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Users size={13} className="text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-semibold leading-none">{order.customer_name}</p>
              <p className="text-xs text-muted-foreground">{order.customer_phone}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin size={13} className="text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">{addr}</p>
          </div>
          {order.rider_name && (
            <div className="flex items-center gap-2 py-1.5 px-2.5 bg-blue-50 rounded-lg">
              <Truck size={12} className="text-blue-600" />
              <span className="text-xs font-semibold text-blue-700">{order.rider_name}</span>
              {order.eta_minutes && <span className="text-[10px] text-blue-500 ml-auto">ETA {order.eta_minutes}min</span>}
              {order.wa_sent_at && <MessageCircle size={10} className="text-green-600" />}
              {order.customer_wa_assigned_at && <Send size={10} className="text-purple-600" />}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-3 pb-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="text-xs h-7 px-2 gap-1" onClick={() => setShowAssign(true)}>
              <UserPlus size={11} />{order.rider_name ? "Reassign" : "Assign"}
            </Button>
            {order.rider_id && (
              <Button size="sm" variant="outline" className="text-xs h-7 px-2 gap-1 border-green-200 text-green-700 hover:bg-green-50"
                onClick={() => sendWa("rider")} disabled={sending === "rider"}>
                <MessageCircle size={11} />{sending === "rider" ? "..." : "Rider WA"}
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-xs h-7 px-2 gap-1 border-purple-200 text-purple-700 hover:bg-purple-50"
              onClick={() => sendWa("customer")} disabled={sending === "customer"}>
              <Send size={11} />{sending === "customer" ? "..." : "Cust WA"}
            </Button>
            {!isPaid && order.delivery_id && (
              <Button size="sm" variant="outline" className="text-xs h-7 px-2 gap-1 border-amber-200 text-amber-700 hover:bg-amber-50"
                onClick={() => sendWa("cod")} disabled={sending === "cod"}>
                <DollarSign size={11} />{sending === "cod" ? "..." : "COD Remind"}
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-xs h-7 px-2 gap-1" onClick={openInvoice}>
              <Printer size={11} />Invoice
            </Button>
          </div>
          {order.delivery_id && deliveryStatus !== "delivered" && (
            <QuickStatusBar deliveryId={order.delivery_id} currentStatus={deliveryStatus} onDone={onRefresh} soundEnabled={soundEnabled} />
          )}
        </div>
      </div>

      {showAssign && (
        <AssignModal order={order} riders={riders} defaultEta={defaultEta}
          onClose={() => setShowAssign(false)} onDone={() => { setShowAssign(false); onRefresh(); }} />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════
   TABLE ROW
══════════════════════════════════════════════════════════ */
function OrderTableRow({ order, riders, onRefresh, onAssign, soundEnabled }: {
  order: any; riders: any[]; onRefresh: () => void; onAssign: () => void; soundEnabled: boolean;
}) {
  const { toast } = useToast();
  const [sending, setSending] = useState<string | null>(null);
  const deliveryStatus = order.delivery_status ?? (order.delivery_id ? "assigned" : "unassigned");
  const isPaid = order.financial_status === "paid";
  const cod = Number(order.cod_amount ?? order.total_price ?? 0);

  const addr = (() => {
    try {
      const a = typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address;
      return [a?.address1, a?.address2].filter(Boolean).join(", ") || (a?.city ?? "Lahore");
    } catch { return "Lahore"; }
  })();

  const sendWa = async (type: "rider" | "customer" | "cod") => {
    setSending(type);
    try {
      let path = "";
      if (type === "rider")    path = `/admin/riders/orders/${order.id}/send-wa`;
      if (type === "customer") path = `/admin/riders/orders/${order.id}/customer-invoice-wa`;
      if (type === "cod")      path = `/admin/riders/deliveries/${order.delivery_id}/cod-reminder`;
      const res = await apiFetch(path, { method: "POST" });
      if (res.ok) toast({ title: type === "cod" ? "💰 COD reminder sent!" : type === "rider" ? "📱 WA sent to rider!" : "📨 Invoice sent!" });
      else toast({ title: "Error", description: res.error ?? res.message, variant: "destructive" });
      onRefresh();
    } finally { setSending(null); }
  };

  const openInvoice = () => window.open(`/api/admin/riders/orders/${order.id}/invoice?token=${token()}`, "_blank");

  return (
    <tr className="border-b border-border/40 hover:bg-slate-50/60 transition-colors group">
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="font-bold text-sm text-blue-700">{order.order_number}</span>
        <p className="text-[10px] text-muted-foreground">{new Date(order.order_date).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "2-digit" })}</p>
      </td>
      <td className="px-3 py-2">
        <p className="font-semibold text-sm leading-none">{order.customer_name ?? "—"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{order.customer_phone ?? "—"}</p>
      </td>
      <td className="px-3 py-2 max-w-[120px]">
        <p className="text-xs text-muted-foreground truncate">{addr}</p>
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-right">
        {isPaid
          ? <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">PAID</span>
          : <span className="text-xs font-bold text-amber-700">PKR {cod.toLocaleString()}</span>
        }
      </td>
      <td className="px-3 py-2">
        {order.rider_name ? (
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
              {order.rider_name.charAt(0)}
            </div>
            <span className="text-xs font-semibold text-blue-700 truncate max-w-[70px]">{order.rider_name}</span>
            {order.eta_minutes && <span className="text-[9px] text-muted-foreground">⏱{order.eta_minutes}m</span>}
          </div>
        ) : <span className="text-xs text-muted-foreground italic">—</span>}
      </td>
      <td className="px-3 py-2"><StatusBadge status={deliveryStatus} /></td>
      <td className="px-3 py-2">
        {order.delivery_id && deliveryStatus !== "delivered" && (
          <QuickStatusBar deliveryId={order.delivery_id} currentStatus={deliveryStatus} onDone={onRefresh} soundEnabled={soundEnabled} />
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onAssign} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-blue-100 hover:text-blue-700 transition-colors" title="Assign rider">
            <UserPlus size={12} />
          </button>
          {order.rider_id && (
            <button onClick={() => sendWa("rider")} disabled={sending === "rider"}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-green-100 hover:text-green-700 transition-colors" title="WA to rider">
              <MessageCircle size={12} />
            </button>
          )}
          <button onClick={() => sendWa("customer")} disabled={sending === "customer"}
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-purple-100 hover:text-purple-700 transition-colors" title="Invoice to customer">
            <Send size={12} />
          </button>
          {!isPaid && order.delivery_id && (
            <button onClick={() => sendWa("cod")} disabled={sending === "cod"}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-amber-100 hover:text-amber-700 transition-colors" title="COD reminder">
              <DollarSign size={12} />
            </button>
          )}
          <button onClick={openInvoice}
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-slate-100 hover:text-foreground transition-colors" title="Invoice">
            <Printer size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ══════════════════════════════════════════════════════════
   LIVE DASHBOARD TAB
══════════════════════════════════════════════════════════ */
function LiveDashboard({ soundEnabled, onSoundToggle }: { soundEnabled: boolean; onSoundToggle: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["live-dashboard"],
    queryFn: () => apiFetch("/admin/riders/live-dashboard"),
    refetchInterval: 10000,
  });

  const { data: deliverySettings, refetch: refetchSettings } = useQuery({
    queryKey: ["delivery-settings"],
    queryFn: () => apiFetch("/admin/riders/delivery-settings"),
  });

  const { toast } = useToast();
  const ds = (deliverySettings as any) ?? {};

  const saveSetting = async (key: string, value: boolean | number) => {
    try {
      await apiFetch("/admin/riders/delivery-settings", { method: "PUT", body: JSON.stringify({ [key]: value }) });
      refetchSettings();
      toast({ title: "Setting saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const d = (data as any) ?? {};
  const stats = d.stats ?? {};
  const activeRiders = d.activeRiders ?? [];
  const recentActivity = d.recentActivity ?? [];

  const STAT_TILES = [
    { label: "Active Riders",    value: stats.active_riders ?? 0,    icon: Users,       color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200" },
    { label: "Unassigned",       value: stats.unassigned ?? 0,        icon: Clock,       color: "text-gray-600",   bg: "bg-gray-50",   border: "border-gray-200" },
    { label: "Assigned",         value: stats.assigned ?? 0,          icon: UserPlus,    color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200" },
    { label: "Picked",           value: stats.picked ?? 0,            icon: Package,     color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
    { label: "On Route",         value: stats.out_for_delivery ?? 0,  icon: Truck,       color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
    { label: "Near Customer",    value: stats.near_customer ?? 0,     icon: Navigation,  color: "text-rose-600",   bg: "bg-rose-50",   border: "border-rose-200" },
    { label: "Delivered Today",  value: stats.delivered_today ?? 0,   icon: CheckCircle, color: "text-green-600",  bg: "bg-green-50",  border: "border-green-200" },
    { label: "Failed Today",     value: stats.failed_today ?? 0,      icon: AlertCircle, color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200" },
    { label: "COD Collected",    value: `PKR ${Number(stats.cod_collected_today ?? 0).toLocaleString()}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  ];

  return (
    <div className="space-y-5">
      {/* Stat tiles */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2.5">
        {STAT_TILES.map(tile => (
          <div key={tile.label} className={`bg-white rounded-xl border ${tile.border} p-3 text-center shadow-sm`}>
            <div className={`w-7 h-7 rounded-lg ${tile.bg} flex items-center justify-center mx-auto mb-1.5`}>
              <tile.icon size={14} className={tile.color} />
            </div>
            <p className="text-lg font-bold leading-none">{isLoading ? "—" : tile.value}</p>
            <p className="text-[9px] text-muted-foreground mt-1 leading-tight">{tile.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Active Riders */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50/50 flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Users size={15} className="text-blue-600" />Active Riders</h3>
            <span className="text-xs text-muted-foreground">{activeRiders.length} riders online</span>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : activeRiders.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No active riders</div>
          ) : (
            <div className="divide-y divide-border/50">
              {activeRiders.map((rider: any) => (
                <div key={rider.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50">
                  <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                    {rider.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-none">{rider.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{rider.delivery_area || "All Lahore"} · {rider.phone}</p>
                  </div>
                  <div className="flex gap-2 text-center shrink-0">
                    <div className="text-center">
                      <p className="text-sm font-bold text-orange-600">{rider.active_orders ?? 0}</p>
                      <p className="text-[9px] text-muted-foreground">Active</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-green-600">{rider.delivered_today ?? 0}</p>
                      <p className="text-[9px] text-muted-foreground">Today</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] text-green-600 font-medium">Online</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column — Recent Activity + Settings */}
        <div className="space-y-4">
          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50/50 flex items-center gap-2">
              <Activity size={15} className="text-purple-600" />
              <h3 className="font-semibold text-sm">Live Activity</h3>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-border/40">
              {isLoading ? (
                <div className="p-3 space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
              ) : recentActivity.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">No recent activity</div>
              ) : recentActivity.map((act: any) => {
                const cfg = STATUS_CONFIG[act.status] ?? STATUS_CONFIG.pending;
                return (
                  <div key={act.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-sm">{cfg.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{act.shopify_order_number} — {act.customer_name}</p>
                      <p className="text-[10px] text-muted-foreground">{act.rider_name ?? "Unassigned"} · {cfg.label}</p>
                    </div>
                    <p className="text-[9px] text-muted-foreground whitespace-nowrap shrink-0">
                      {new Date(act.updated_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Auto Mode Settings */}
          <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50/50 flex items-center gap-2">
              <Settings2 size={15} className="text-slate-600" />
              <h3 className="font-semibold text-sm">Automation Settings</h3>
            </div>
            <div className="p-4 space-y-3">
              {[
                { key: "auto_wa_on_assign", label: "Auto WA on Assign", desc: "Customer notified when rider assigned", icon: "🛵" },
                { key: "auto_wa_on_status", label: "Auto WA on Status", desc: "Customer notified on every status change", icon: "📲" },
              ].map(setting => (
                <div key={setting.key} className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium">{setting.icon} {setting.label}</p>
                    <p className="text-[10px] text-muted-foreground">{setting.desc}</p>
                  </div>
                  <Switch
                    checked={!!ds[setting.key]}
                    onCheckedChange={v => saveSetting(setting.key, v)}
                    className="data-[state=checked]:bg-green-600 shrink-0"
                  />
                </div>
              ))}
              <div>
                <p className="text-xs font-medium mb-1.5">⏱️ Default ETA (minutes)</p>
                <div className="flex flex-wrap gap-1">
                  {[15, 30, 45, 60, 120].map(mins => (
                    <button key={mins} onClick={() => saveSetting("default_eta_minutes", mins)}
                      className={`px-2 py-0.5 text-[11px] rounded-lg border font-medium transition-colors ${ds.default_eta_minutes === mins ? "bg-green-600 text-white border-green-600" : "border-border hover:bg-muted"}`}>
                      {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                <div>
                  <p className="text-xs font-medium">{soundEnabled ? "🔊" : "🔇"} Sound Alerts</p>
                  <p className="text-[10px] text-muted-foreground">Beep on status changes</p>
                </div>
                <Switch checked={soundEnabled} onCheckedChange={onSoundToggle} className="data-[state=checked]:bg-blue-600 shrink-0" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */
export default function LahoreDeliveriesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab,     setActiveTab]     = useState<"dashboard" | "orders">("dashboard");
  const [page,          setPage]          = useState(1);
  const [search,        setSearch]        = useState("");
  const [searchInput,   setSearchInput]   = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [viewMode,      setViewMode]      = useState<"cards" | "table">("table");
  const [assignOrder,   setAssignOrder]   = useState<any>(null);
  const [soundEnabled,  setSoundEnabled]  = useState(() => localStorage.getItem("kdf_sound_alerts") !== "off");
  const prevDeliveredRef = useRef<number>(0);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("kdf_sound_alerts", next ? "on" : "off");
    toast({ title: next ? "🔊 Sound alerts ON" : "🔇 Sound alerts OFF" });
  };

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["lahore-orders"] });
    qc.invalidateQueries({ queryKey: ["rider-stats"] });
    qc.invalidateQueries({ queryKey: ["live-dashboard"] });
  }, [qc]);

  const { data: ridersData } = useQuery({ queryKey: ["riders-list"], queryFn: () => apiFetch("/admin/riders") });
  const { data: deliverySettings } = useQuery({ queryKey: ["delivery-settings"], queryFn: () => apiFetch("/admin/riders/delivery-settings") });

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["lahore-orders", page, search, statusFilter, viewMode],
    queryFn: () => apiFetch(`/admin/riders/lahore-orders?page=${page}&limit=${viewMode === "table" ? 50 : 24}&search=${encodeURIComponent(search)}&status=${statusFilter}`),
    refetchInterval: 15000,
  });

  const { data: stats } = useQuery({
    queryKey: ["rider-stats"],
    queryFn: () => apiFetch("/admin/riders/stats"),
    refetchInterval: 15000,
  });

  /* ── Sound on new delivered ── */
  useEffect(() => {
    const d = (data as any);
    const deliveredCount = d?.stats?.delivered ?? 0;
    if (prevDeliveredRef.current > 0 && deliveredCount > prevDeliveredRef.current && soundEnabled) {
      playAlert("delivered");
      toast({ title: "✅ New delivery completed!" });
    }
    prevDeliveredRef.current = deliveredCount;
  }, [data]);

  const ds = (deliverySettings as any) ?? {};
  const d = data as any;
  const riders = (ridersData as any)?.riders ?? [];
  const orders = d?.orders ?? [];
  const pagination = d?.pagination ?? { total: 0, pages: 1 };
  const s = (stats as any)?.stats ?? {};
  const defaultEta = ds.default_eta_minutes ?? 30;

  const [autoAssignMode, setAutoAssignMode] = useState(false);

  const autoAssign = async () => {
    setAutoAssigning(true);
    try {
      const res = await apiFetch("/admin/riders/auto-assign", { method: "POST", body: JSON.stringify({ limit: 50 }) });
      if (soundEnabled) playAlert("assign");
      toast({ title: `⚡ Auto-assigned ${res.assigned ?? 0} orders`, description: res.message ?? "" });
      refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setAutoAssigning(false); }
  };

  const [syncingShopify, setSyncingShopify] = useState(false);
  const { data: syncStatus } = useQuery({
    queryKey: ["shopify-sync-status"],
    queryFn: () => apiFetch("/admin/shopify/auto-sync/status"),
    refetchInterval: 60000,
  });
  const ss = (syncStatus as any) ?? {};
  const lastOrderSync: string | null = ss.store?.lastOrderSync ?? null;
  const isAutoSyncRunning: boolean = ss.autoSync?.isRunning ?? false;

  const triggerShopifySync = async () => {
    setSyncingShopify(true);
    try {
      const r = await apiFetch("/admin/shopify/auto-sync/trigger", { method: "POST" });
      toast({ title: "Shopify Sync Triggered", description: r.message ?? "Incremental sync running in background" });
      setTimeout(() => { qc.invalidateQueries({ queryKey: ["shopify-sync-status"] }); refresh(); }, 3000);
    } finally { setSyncingShopify(false); }
  };

  const STATUS_TABS = [
    { key: "all",              label: "All" },
    { key: "unassigned",       label: "Unassigned" },
    { key: "assigned",         label: "Assigned" },
    { key: "picked",           label: "Picked" },
    { key: "out_for_delivery", label: "On Route" },
    { key: "near_customer",    label: "Near" },
    { key: "delivered",        label: "Delivered" },
    { key: "failed",           label: "Failed" },
    { key: "returned",         label: "Returned" },
    { key: "delayed",          label: "Delayed" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-2xl mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="text-green-600" size={24} />
            Lahore Delivery Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live dispatch, rider tracking, WhatsApp automation & COD management
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={toggleSound} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${soundEnabled ? "border-blue-200 bg-blue-50 text-blue-700" : "border-border text-muted-foreground"}`}>
            {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            {soundEnabled ? "Sound ON" : "Sound OFF"}
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700">
            <span className={`w-2 h-2 rounded-full ${isFetching ? "bg-amber-400 animate-pulse" : "bg-green-500 animate-pulse"}`} />
            {isFetching ? "Syncing..." : dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}` : "Live"}
          </div>
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />Refresh
          </Button>
          <Button size="sm" onClick={autoAssign} disabled={autoAssigning} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
            <Zap size={14} />{autoAssigning ? "Assigning..." : "Auto-Assign"}
          </Button>
        </div>
      </div>

      {/* ── Shopify Sync Bar ── */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-white shadow-sm">
        <div className="flex items-center gap-2">
          {isAutoSyncRunning ? <Wifi size={15} className="text-amber-500 animate-pulse" /> : <Database size={15} className="text-blue-600" />}
          <span className="text-sm font-semibold">Shopify</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${isAutoSyncRunning ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
            {isAutoSyncRunning ? "Syncing..." : "Auto-sync 15min"}
          </span>
        </div>
        {lastOrderSync && (
          <span className="text-xs text-muted-foreground">
            Last sync: <strong>{new Date(lastOrderSync).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</strong>
          </span>
        )}
        <div className="flex gap-2 ml-auto">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={triggerShopifySync} disabled={syncingShopify || isAutoSyncRunning}>
            <RefreshCw size={11} className={syncingShopify ? "animate-spin" : ""} />Force Sync
          </Button>
        </div>
      </div>

      {/* ── Top-level Tabs ── */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: "dashboard", label: "Live Dashboard", icon: BarChart3 },
          { id: "orders",    label: "Orders",         icon: Package },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id ? "border-green-600 text-green-700" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <tab.icon size={14} />{tab.label}
          </button>
        ))}
      </div>

      {/* ── Dashboard Tab ── */}
      {activeTab === "dashboard" && (
        <LiveDashboard soundEnabled={soundEnabled} onSoundToggle={toggleSound} />
      )}

      {/* ── Orders Tab ── */}
      {activeTab === "orders" && (
        <>
          {/* Quick stats bar */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {[
              { label: "Total",        value: s.total_lahore ?? 0,           color: "text-blue-600",   bg: "bg-blue-50" },
              { label: "Unassigned",   value: Math.max(0, (s.total_lahore ?? 0) - (s.total_assigned ?? 0)), color: "text-gray-600", bg: "bg-gray-50" },
              { label: "Assigned",     value: s.assigned ?? 0,               color: "text-blue-700",   bg: "bg-blue-50" },
              { label: "Picked",       value: s.picked ?? 0,                 color: "text-purple-700", bg: "bg-purple-50" },
              { label: "On Route",     value: s.out_for_delivery ?? 0,       color: "text-orange-700", bg: "bg-orange-50" },
              { label: "Delivered",    value: s.delivered ?? 0,              color: "text-green-700",  bg: "bg-green-50" },
              { label: "Failed",       value: s.failed ?? 0,                 color: "text-red-700",    bg: "bg-red-50" },
              { label: "Riders",       value: s.active_riders ?? 0,          color: "text-indigo-700", bg: "bg-indigo-50" },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`${bg} rounded-xl border border-border/50 p-2.5 text-center shadow-sm`}>
                <p className={`text-lg font-bold ${color}`}>{Number(value).toLocaleString()}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex gap-1 overflow-x-auto pb-1 flex-1">
              {STATUS_TABS.map(t => (
                <button key={t.key} onClick={() => { setStatusFilter(t.key); setPage(1); }}
                  className={`whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                    statusFilter === t.key ? "bg-green-600 text-white shadow-sm" : "bg-white border border-border text-muted-foreground hover:bg-accent"
                  }`}>{t.label}</button>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <div className="flex gap-0 border border-border rounded-lg overflow-hidden">
                <button onClick={() => setViewMode("table")} className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1 transition-colors ${viewMode === "table" ? "bg-green-600 text-white" : "text-muted-foreground hover:bg-accent"}`}>
                  <List size={12} />Table
                </button>
                <button onClick={() => setViewMode("cards")} className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1 transition-colors ${viewMode === "cards" ? "bg-green-600 text-white" : "text-muted-foreground hover:bg-accent"}`}>
                  <LayoutGrid size={12} />Cards
                </button>
              </div>
              <Input placeholder="Search..." value={searchInput} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
                className="h-8 text-sm w-48" />
              <Button size="sm" variant="outline" className="h-8 px-2.5" onClick={() => { setSearch(searchInput); setPage(1); }}>
                <Search size={13} />
              </Button>
            </div>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-48 rounded-xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <MapPin size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No orders found</p>
              <p className="text-sm mt-1">Try changing filters or status tab</p>
            </div>
          ) : viewMode === "table" ? (
            <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 py-2 border-b text-xs text-muted-foreground flex gap-4 bg-slate-50/50">
                <span className="font-semibold text-foreground">{pagination.total.toLocaleString()} orders</span>
                <span className="flex items-center gap-1"><MessageCircle size={10} className="text-green-600" />= WA Rider</span>
                <span className="flex items-center gap-1"><Send size={10} className="text-purple-600" />= WA Customer</span>
                <span className="flex items-center gap-1"><DollarSign size={10} className="text-amber-600" />= COD Reminder</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-border">
                      {["Order #", "Customer", "Area", "Amount", "Rider", "Status", "Quick Status", "Actions"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order: any) => (
                      <OrderTableRow key={order.id} order={order} riders={riders} onRefresh={refresh}
                        onAssign={() => setAssignOrder(order)} soundEnabled={soundEnabled} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {orders.map((order: any) => (
                <OrderCard key={order.id} order={order} riders={riders} onRefresh={refresh}
                  soundEnabled={soundEnabled} defaultEta={defaultEta} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">{pagination.total.toLocaleString()} total · Page {page} of {pagination.pages}</p>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 px-2.5">
                  <ChevronLeft size={14} />
                </Button>
                {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                  const p = Math.max(1, Math.min(pagination.pages - 4, page - 2)) + i;
                  return (
                    <Button key={p} size="sm" variant={p === page ? "default" : "outline"} onClick={() => setPage(p)} className="h-8 w-8 p-0 text-xs">{p}</Button>
                  );
                })}
                <Button size="sm" variant="outline" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)} className="h-8 px-2.5">
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Page-level assign modal */}
      {assignOrder && (
        <AssignModal order={assignOrder} riders={riders} defaultEta={defaultEta}
          onClose={() => setAssignOrder(null)} onDone={() => { setAssignOrder(null); refresh(); }} />
      )}
    </div>
  );
}
