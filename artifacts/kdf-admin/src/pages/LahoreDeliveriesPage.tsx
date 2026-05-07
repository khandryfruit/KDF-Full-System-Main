import { useState, useCallback } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MapPin, Package, MessageCircle, Printer, RefreshCw,
  Users, CheckCircle, Clock, Truck, AlertCircle, Search,
  ChevronLeft, ChevronRight, Zap, UserPlus,
  LayoutGrid, List, Send, X, Database, WifiOff, Wifi,
} from "lucide-react";

const API = "/api";
const token = () => localStorage.getItem("kdf_admin_token") ?? "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

async function apiFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, { ...opts, headers: headers() });
  return r.json();
}

/* ── STATUS CONFIG ──────────────────────────────────────── */
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:          { label: "Pending",          color: "text-gray-600",   bg: "bg-gray-100"   },
  assigned:         { label: "Assigned",          color: "text-blue-700",   bg: "bg-blue-100"   },
  picked:           { label: "Picked",            color: "text-purple-700", bg: "bg-purple-100" },
  out_for_delivery: { label: "Out for Delivery",  color: "text-orange-700", bg: "bg-orange-100" },
  delivered:        { label: "Delivered",         color: "text-green-700",  bg: "bg-green-100"  },
  failed:           { label: "Failed",            color: "text-red-700",    bg: "bg-red-100"    },
  returned:         { label: "Returned",          color: "text-yellow-700", bg: "bg-yellow-100" },
  unassigned:       { label: "Unassigned",        color: "text-gray-500",   bg: "bg-gray-50"    },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

/* ── ASSIGN MODAL ──────────────────────────────────────── */
function AssignModal({ order, riders, onClose, onDone }: { order: any; riders: any[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [riderId, setRiderId] = useState<string>(order.rider_id?.toString() ?? "");
  const [notes, setNotes] = useState(order.delivery_notes ?? "");
  const [sending, setSending] = useState(false);
  const [sendWa, setSendWa] = useState(true);

  const assign = async () => {
    setSending(true);
    try {
      const res = await apiFetch("/admin/riders/assign", {
        method: "POST",
        body: JSON.stringify({ shopify_order_db_id: order.id, rider_id: riderId || null, notes }),
      });
      if (res.ok || res.delivery) {
        if (sendWa && riderId) {
          await apiFetch(`/admin/riders/orders/${order.id}/send-wa`, { method: "POST" });
        }
        toast({ title: "Assigned!", description: `Order ${order.order_number} assigned${sendWa ? " & WA sent" : ""}` });
        onDone();
      } else {
        toast({ title: "Error", description: res.error ?? "Failed", variant: "destructive" });
      }
    } finally { setSending(false); }
  };

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
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Select Rider</label>
            <select
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background"
              value={riderId}
              onChange={e => setRiderId(e.target.value)}
            >
              <option value="">-- Unassigned --</option>
              {riders.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.delivery_area || "All Areas"}) — {r.active_deliveries ?? 0} active
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Notes</label>
            <textarea
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none"
              rows={2}
              placeholder="Delivery instructions..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={sendWa} onChange={e => setSendWa(e.target.checked)} className="rounded" />
            <MessageCircle size={14} className="text-green-600" />
            Auto-send WhatsApp to rider after assigning
          </label>
        </div>
        <div className="p-4 border-t flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={assign} disabled={sending} className="bg-blue-600 hover:bg-blue-700 text-white">
            {sending ? "Saving..." : "Assign & Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── ORDER CARD (Card View) ──────────────────────────────── */
function OrderCard({ order, riders, onRefresh }: { order: any; riders: any[]; onRefresh: () => void }) {
  const { toast } = useToast();
  const [showAssign, setShowAssign] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingCustWa, setSendingCustWa] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const addr = (() => {
    try {
      const a = typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address;
      return [a?.address1, a?.city].filter(Boolean).join(", ");
    } catch { return "Lahore"; }
  })();

  const sendRiderWa = async () => {
    setSending(true);
    try {
      const res = await apiFetch(`/admin/riders/orders/${order.id}/send-wa`, { method: "POST" });
      if (res.ok) toast({ title: "WhatsApp Sent!", description: `Sent to rider for ${order.order_number}` });
      else toast({ title: "Error", description: res.error ?? res.message, variant: "destructive" });
    } finally { setSending(false); onRefresh(); }
  };

  const sendCustomerWa = async () => {
    setSendingCustWa(true);
    try {
      const res = await apiFetch(`/admin/riders/orders/${order.id}/customer-invoice-wa`, { method: "POST" });
      if (res.ok) toast({ title: "Invoice Sent to Customer!", description: `WhatsApp invoice sent for ${order.order_number}` });
      else toast({ title: "Error", description: res.error ?? res.message, variant: "destructive" });
    } finally { setSendingCustWa(false); onRefresh(); }
  };

  const updateStatus = async (status: string): Promise<void> => {
    if (!order.delivery_id) {
      toast({ title: "No delivery", description: "Assign a rider first", variant: "destructive" });
      return;
    }
    setUpdatingStatus(true);
    try {
      await apiFetch(`/admin/riders/deliveries/${order.delivery_id}/status`, { method: "PUT", body: JSON.stringify({ status }) });
      toast({ title: "Status updated", description: status.replace(/_/g, " ") });
      onRefresh();
    } finally { setUpdatingStatus(false); }
  };

  const openInvoice = () => window.open(`/api/admin/riders/orders/${order.id}/invoice?token=${token()}`, "_blank");
  const deliveryStatus = order.delivery_status ?? (order.delivery_id ? "assigned" : "unassigned");
  const isPaid = order.financial_status === "paid";

  return (
    <>
      <div className="bg-white rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <Package size={15} className="text-green-700" />
            </div>
            <div>
              <span className="font-bold text-sm">{order.order_number}</span>
              <p className="text-xs text-muted-foreground">{new Date(order.order_date).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={deliveryStatus} />
            {isPaid ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">PAID</span>
            ) : (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                COD PKR {Number(order.total_price ?? 0).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 space-y-2.5">
          <div className="flex items-start gap-2">
            <Users size={14} className="text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold leading-none">{order.customer_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{order.customer_phone}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin size={14} className="text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">{addr}</p>
          </div>
          {order.rider_name && (
            <div className="flex items-center gap-2 py-1.5 px-3 bg-blue-50 rounded-lg">
              <Truck size={13} className="text-blue-600" />
              <span className="text-xs font-semibold text-blue-700">{order.rider_name}</span>
              {order.wa_sent_at && <MessageCircle size={11} className="text-green-600 ml-auto" />}
              {order.customer_wa_sent_at && <Send size={11} className="text-purple-600" />}
            </div>
          )}
        </div>

        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="text-xs h-7 px-2.5" onClick={() => setShowAssign(true)}>
            <UserPlus size={12} className="mr-1" />{order.rider_name ? "Reassign" : "Assign"}
          </Button>
          {order.rider_id && (
            <Button size="sm" variant="outline" className="text-xs h-7 px-2.5 border-green-200 text-green-700 hover:bg-green-50" onClick={sendRiderWa} disabled={sending}>
              <MessageCircle size={12} className="mr-1" />{sending ? "..." : "→ Rider"}
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs h-7 px-2.5 border-purple-200 text-purple-700 hover:bg-purple-50" onClick={sendCustomerWa} disabled={sendingCustWa}>
            <Send size={12} className="mr-1" />{sendingCustWa ? "..." : "→ Customer"}
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7 px-2.5" onClick={openInvoice}>
            <Printer size={12} className="mr-1" />Invoice
          </Button>
          {order.delivery_id && deliveryStatus !== "delivered" && (
            <select
              className="text-xs h-7 px-2 border border-border rounded-md bg-background text-foreground cursor-pointer"
              value={deliveryStatus}
              onChange={e => updateStatus(e.target.value)}
              disabled={updatingStatus}
            >
              <option value="assigned">Assigned</option>
              <option value="picked">Picked</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
              <option value="returned">Returned</option>
            </select>
          )}
        </div>
      </div>

      {showAssign && (
        <AssignModal
          order={order}
          riders={riders}
          onClose={() => setShowAssign(false)}
          onDone={() => { setShowAssign(false); onRefresh(); }}
        />
      )}
    </>
  );
}

/* ── TABLE ROW (Table View) ──────────────────────────────── */
function OrderTableRow({ order, riders, onRefresh, onAssign }: { order: any; riders: any[]; onRefresh: () => void; onAssign: () => void }) {
  const { toast } = useToast();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [sending, setSending] = useState<"rider" | "customer" | null>(null);

  const deliveryStatus = order.delivery_status ?? (order.delivery_id ? "assigned" : "unassigned");
  const isPaid = order.financial_status === "paid";

  const addr = (() => {
    try {
      const a = typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address;
      return [a?.address1, a?.address2].filter(Boolean).join(", ") || (a?.city ?? "Lahore");
    } catch { return "Lahore"; }
  })();

  const updateStatus = async (status: string): Promise<void> => {
    if (!order.delivery_id) {
      toast({ title: "Assign a rider first", variant: "destructive" });
      return;
    }
    setUpdatingStatus(true);
    try {
      await apiFetch(`/admin/riders/deliveries/${order.delivery_id}/status`, { method: "PUT", body: JSON.stringify({ status }) });
      onRefresh();
    } finally { setUpdatingStatus(false); }
  };

  const sendWa = async (type: "rider" | "customer") => {
    setSending(type);
    try {
      const path = type === "rider"
        ? `/admin/riders/orders/${order.id}/send-wa`
        : `/admin/riders/orders/${order.id}/customer-invoice-wa`;
      const res = await apiFetch(path, { method: "POST" });
      if (res.ok) toast({ title: type === "rider" ? "WA sent to rider!" : "Invoice sent to customer!" });
      else toast({ title: "Error", description: res.error ?? res.message, variant: "destructive" });
      onRefresh();
    } finally { setSending(null); }
  };

  const openInvoice = () => window.open(`/api/admin/riders/orders/${order.id}/invoice?token=${token()}`, "_blank");
  const chargePerOrder = Number(order.rider_delivery_charge ?? 500);

  const statusBg: Record<string, string> = {
    delivered: "bg-green-50", failed: "bg-red-50", returned: "bg-yellow-50",
    out_for_delivery: "bg-orange-50", picked: "bg-purple-50", assigned: "bg-blue-50",
  };

  return (
    <>
      <tr className={`border-b border-border/50 hover:bg-slate-50/80 transition-colors ${statusBg[deliveryStatus] ?? ""}`}>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <span className="font-bold text-sm text-blue-700">{order.order_number}</span>
          <p className="text-[10px] text-muted-foreground">{new Date(order.order_date).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "2-digit" })}</p>
        </td>
        <td className="px-3 py-2.5">
          <p className="font-semibold text-sm leading-none">{order.customer_name ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{order.customer_phone ?? "—"}</p>
        </td>
        <td className="px-3 py-2.5 max-w-[140px]">
          <p className="text-xs text-muted-foreground truncate">{addr}</p>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-right">
          <span className="font-bold text-sm">PKR {Number(order.total_price ?? 0).toLocaleString()}</span>
        </td>
        <td className="px-3 py-2.5 text-center">
          {isPaid ? (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">PAID</span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">COD</span>
          )}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-right">
          {!isPaid
            ? <span className="text-sm font-semibold text-amber-700">PKR {Number(order.cod_amount ?? order.total_price ?? 0).toLocaleString()}</span>
            : <span className="text-muted-foreground text-xs">—</span>
          }
        </td>
        <td className="px-3 py-2.5">
          {order.rider_name ? (
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {order.rider_name.charAt(0)}
              </div>
              <span className="text-xs font-semibold text-blue-700 truncate max-w-[80px]">{order.rider_name}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">Unassigned</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={deliveryStatus} />
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-right">
          <span className="text-xs font-semibold text-purple-700">PKR {chargePerOrder.toLocaleString()}</span>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-right">
          {deliveryStatus === "delivered"
            ? <span className="text-xs font-bold text-green-700">PKR {chargePerOrder.toLocaleString()}</span>
            : <span className="text-xs text-muted-foreground">—</span>
          }
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
          {order.delivered_at ? new Date(order.delivered_at).toLocaleDateString("en-PK", { day: "numeric", month: "short" }) : "—"}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            <button
              onClick={onAssign}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-blue-100 hover:text-blue-700 transition-colors"
            >
              <UserPlus size={12} />
            </button>
            {order.rider_id && (
              <button
                onClick={() => sendWa("rider")}
                disabled={sending === "rider"}
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-green-100 hover:text-green-700 transition-colors"
              >
                <MessageCircle size={12} />
              </button>
            )}
            <button
              onClick={() => sendWa("customer")}
              disabled={sending === "customer"}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-purple-100 hover:text-purple-700 transition-colors"
            >
              <Send size={12} />
            </button>
            <button
              onClick={openInvoice}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-slate-100 hover:text-foreground transition-colors"
            >
              <Printer size={12} />
            </button>
            {order.delivery_id && deliveryStatus !== "delivered" && (
              <select
                className="text-[11px] h-6 px-1 border border-border rounded bg-background text-foreground cursor-pointer"
                value={deliveryStatus}
                onChange={e => updateStatus(e.target.value)}
                disabled={updatingStatus}
                style={{ maxWidth: 90 }}
              >
                <option value="assigned">Assigned</option>
                <option value="picked">Picked</option>
                <option value="out_for_delivery">On Route</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
                <option value="returned">Returned</option>
              </select>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */
export default function LahoreDeliveriesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [assignOrder, setAssignOrder] = useState<any>(null);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["lahore-orders"] });
    qc.invalidateQueries({ queryKey: ["rider-stats"] });
  }, [qc]);

  const { data: stats } = useQuery({
    queryKey: ["rider-stats"],
    queryFn: () => apiFetch("/admin/riders/stats"),
    refetchInterval: 30000,
  });

  const { data: ridersData } = useQuery({
    queryKey: ["riders-list"],
    queryFn: () => apiFetch("/admin/riders"),
  });

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["lahore-orders", page, search, statusFilter, viewMode],
    queryFn: () => apiFetch(`/admin/riders/lahore-orders?page=${page}&limit=${viewMode === "table" ? 50 : 24}&search=${encodeURIComponent(search)}&status=${statusFilter}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });

  const d = data as any;
  const riders = (ridersData as any)?.riders ?? [];
  const orders = d?.orders ?? [];
  const pagination = d?.pagination ?? { total: 0, pages: 1 };
  const s = (stats as any)?.stats ?? {};

  const [syncingShopify, setSyncingShopify] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

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
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["shopify-sync-status"] });
        refresh();
      }, 3000);
    } catch (e: any) {
      toast({ title: "Sync Error", description: e.message, variant: "destructive" });
    } finally { setSyncingShopify(false); }
  };

  const runBackfill = async () => {
    setBackfilling(true);
    try {
      const r = await apiFetch("/admin/riders/backfill-shopify-data", { method: "POST" });
      toast({ title: "Backfill Complete", description: r.message ?? "Data refreshed" });
      refresh();
    } catch (e: any) {
      toast({ title: "Backfill Error", description: e.message, variant: "destructive" });
    } finally { setBackfilling(false); }
  };

  const autoAssign = async () => {
    setAutoAssigning(true);
    try {
      const res = await apiFetch("/admin/riders/auto-assign", { method: "POST", body: JSON.stringify({ limit: 50 }) });
      toast({ title: `Auto-assigned ${res.assigned ?? 0} orders`, description: res.message ?? "" });
      refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setAutoAssigning(false); }
  };

  const TABS = [
    { key: "all",              label: "All Lahore" },
    { key: "unassigned",       label: "Unassigned" },
    { key: "assigned",         label: "Assigned" },
    { key: "picked",           label: "Picked" },
    { key: "out_for_delivery", label: "On Route" },
    { key: "delivered",        label: "Delivered" },
    { key: "failed",           label: "Failed" },
    { key: "returned",         label: "Returned" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-2xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="text-green-600" size={24} />
            Lahore Local Delivery
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Rider assignments, WhatsApp dispatch, COD tracking, and delivery accounting for Lahore orders
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Live sync indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700">
            <span className={`w-2 h-2 rounded-full ${isFetching ? "bg-amber-400 animate-pulse" : "bg-green-500"}`} />
            {isFetching ? "Syncing..." : dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}` : "Live"}
          </div>
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />Refresh
          </Button>
          <div className="flex gap-0 border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors ${viewMode === "table" ? "bg-green-600 text-white" : "text-muted-foreground hover:bg-accent"}`}
            >
              <List size={13} />Table
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors ${viewMode === "cards" ? "bg-green-600 text-white" : "text-muted-foreground hover:bg-accent"}`}
            >
              <LayoutGrid size={13} />Cards
            </button>
          </div>
          <Button size="sm" onClick={autoAssign} disabled={autoAssigning} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
            <Zap size={14} />{autoAssigning ? "Assigning..." : "Auto-Assign"}
          </Button>
        </div>
      </div>

      {/* Shopify Sync Status Bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-border bg-white shadow-sm">
        <div className="flex items-center gap-2">
          {isAutoSyncRunning ? (
            <Wifi size={16} className="text-amber-500 animate-pulse" />
          ) : (
            <Database size={16} className="text-blue-600" />
          )}
          <span className="text-sm font-semibold text-foreground">Shopify Sync</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`w-2 h-2 rounded-full ${isAutoSyncRunning ? "bg-amber-400 animate-pulse" : "bg-green-500"}`} />
          {isAutoSyncRunning ? "Sync running..." : "Auto-sync every 15 min"}
        </div>
        {lastOrderSync && (
          <div className="text-xs text-muted-foreground">
            Last orders sync: <span className="font-semibold text-foreground">
              {new Date(lastOrderSync).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
        <div className="flex gap-2 ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={triggerShopifySync}
            disabled={syncingShopify || isAutoSyncRunning}
          >
            <RefreshCw size={12} className={syncingShopify ? "animate-spin" : ""} />
            {syncingShopify ? "Triggering..." : "Force Sync"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
            onClick={runBackfill}
            disabled={backfilling}
          >
            <Database size={12} className={backfilling ? "animate-pulse" : ""} />
            {backfilling ? "Backfilling..." : "Fix Missing Data"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: "Total Lahore",     value: s.total_lahore ?? 0,         icon: MapPin,       color: "text-blue-600",   bg: "bg-blue-50" },
          { label: "Unassigned",       value: Math.max(0, (s.total_lahore ?? 0) - (s.total_assigned ?? 0)), icon: Clock, color: "text-gray-600", bg: "bg-gray-50" },
          { label: "Assigned",         value: s.assigned ?? 0,             icon: UserPlus,     color: "text-blue-600",   bg: "bg-blue-50" },
          { label: "Picked Up",        value: s.picked ?? 0,               icon: Package,      color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Out for Delivery", value: s.out_for_delivery ?? 0,     icon: Truck,        color: "text-orange-600", bg: "bg-orange-50" },
          { label: "Delivered",        value: s.delivered ?? 0,            icon: CheckCircle,  color: "text-green-600",  bg: "bg-green-50" },
          { label: "Failed",           value: s.failed ?? 0,               icon: AlertCircle,  color: "text-red-600",    bg: "bg-red-50" },
          { label: "Active Riders",    value: s.active_riders ?? 0,        icon: Users,        color: "text-indigo-600", bg: "bg-indigo-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-border p-3 text-center shadow-sm">
            <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center mx-auto mb-1.5`}>
              <Icon size={14} className={color} />
            </div>
            <p className="text-xl font-bold leading-none">{Number(value).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 overflow-x-auto pb-1 flex-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setStatusFilter(t.key); setPage(1); }}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                statusFilter === t.key
                  ? "bg-green-600 text-white shadow-sm"
                  : "bg-white border border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 min-w-[240px]">
          <Input
            placeholder="Search order, customer, phone..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
            className="h-8 text-sm"
          />
          <Button size="sm" variant="outline" className="h-8 px-2.5" onClick={() => { setSearch(searchInput); setPage(1); }}>
            <Search size={13} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        viewMode === "table" ? (
          <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-48 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        )
      ) : orders.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <MapPin size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No orders found</p>
          <p className="text-sm mt-1">Try changing filters or search term</p>
        </div>
      ) : viewMode === "table" ? (
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-slate-50/50 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span className="font-semibold text-foreground">{pagination.total.toLocaleString()} orders</span>
            <span className="flex items-center gap-1"><MessageCircle size={11} className="text-green-600" /> = WA to Rider</span>
            <span className="flex items-center gap-1"><Send size={11} className="text-purple-600" /> = Invoice to Customer</span>
            <span className="flex items-center gap-1"><Printer size={11} /> = Print Invoice</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  {["Order #", "Customer", "Area", "Amount", "Payment", "COD Amount", "Rider", "Status", "Del. Charge", "Rider Earning", "Delivered", "Actions"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order: any) => (
                  <OrderTableRow key={order.id} order={order} riders={riders} onRefresh={refresh} onAssign={() => setAssignOrder(order)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {orders.map((order: any) => (
            <OrderCard key={order.id} order={order} riders={riders} onRefresh={refresh} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            {pagination.total.toLocaleString()} total · Page {page} of {pagination.pages}
          </p>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 px-2.5">
              <ChevronLeft size={14} />
            </Button>
            {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
              const p = Math.max(1, Math.min(pagination.pages - 4, page - 2)) + i;
              return (
                <Button key={p} size="sm" variant={p === page ? "default" : "outline"} onClick={() => setPage(p)} className="h-8 w-8 p-0 text-xs">
                  {p}
                </Button>
              );
            })}
            <Button size="sm" variant="outline" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)} className="h-8 px-2.5">
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Page-level assign modal — rendered outside table to avoid invalid DOM nesting */}
      {assignOrder && (
        <AssignModal
          order={assignOrder}
          riders={riders}
          onClose={() => setAssignOrder(null)}
          onDone={() => { setAssignOrder(null); refresh(); }}
        />
      )}
    </div>
  );
}
