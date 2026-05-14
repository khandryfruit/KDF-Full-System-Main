import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare, CheckCircle, XCircle, Clock, Truck, RefreshCw,
  Send, AlertTriangle, BarChart3, Phone, Package, Zap, Eye,
  ChevronLeft, ChevronRight, Filter, Play, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { adminApiUrl } from "@/lib/apiBase";

function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(adminApiUrl(path), {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:   { label: "Pending",   color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: <Clock className="w-3 h-3" /> },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-800 border-blue-200",       icon: <CheckCircle className="w-3 h-3" /> },
  booked:    { label: "Booked",    color: "bg-green-100 text-green-800 border-green-200",     icon: <Truck className="w-3 h-3" /> },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800 border-red-200",           icon: <XCircle className="w-3 h-3" /> },
  failed:    { label: "Failed",    color: "bg-red-100 text-red-800 border-red-200",           icon: <AlertTriangle className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-gray-100 text-gray-700 border-gray-200", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function WaOrderConfirmationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"list" | "bulk">("list");
  const [bulkLimit, setBulkLimit] = useState("20");
  const [bookingLimit, setBulkBookLimit] = useState("20");

  /* ── Fetch stats ── */
  const { data: statsData } = useQuery({
    queryKey: ["wa-conf-stats"],
    queryFn: () => api("/admin/logistics/confirmations/stats").then(r => r.json()),
    refetchInterval: 30000,
  });
  const stats = statsData?.confirmations ?? {};

  /* ── Fetch confirmations ── */
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["wa-confirmations", page, statusFilter],
    queryFn: () =>
      api(`/admin/logistics/confirmations?page=${page}&limit=25${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`).then(r => r.json()),
    refetchInterval: 20000,
  });
  const confirmations: any[] = data?.confirmations ?? [];
  const pagination = data?.pagination ?? { page: 1, pages: 1, total: 0 };

  /* ── Fetch couriers ── */
  const { data: couriers = [] } = useQuery({
    queryKey: ["couriers-list"],
    queryFn: () => api("/admin/couriers").then(r => r.json()),
  });
  const activeCouriers: any[] = Array.isArray(couriers) ? couriers.filter((c: any) => c.isActive) : [];

  /* ── Mutations ── */
  const resendMut = useMutation({
    mutationFn: (id: number) => api(`/admin/logistics/confirmations/${id}/resend`, { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => {
      toast({ title: d.success ? "Confirmation Resent!" : "Failed", description: d.message ?? d.error, variant: d.success ? "default" : "destructive" });
      qc.invalidateQueries({ queryKey: ["wa-confirmations"] });
    },
  });

  const forceBookMut = useMutation({
    mutationFn: ({ id, courierSlug }: { id: number; courierSlug?: string }) =>
      api(`/admin/logistics/confirmations/${id}/force-book`, { method: "POST", body: JSON.stringify({ courierSlug }) }).then(r => r.json()),
    onSuccess: (d) => {
      toast({
        title: d.ok ? "Booked!" : "Booking Failed",
        description: d.ok
          ? `Tracking: ${d.trackingId} via ${d.courierName}${d.isRealApi ? " ✓ Real API" : " (local ID)"}`
          : d.error,
        variant: d.ok ? "default" : "destructive",
      });
      qc.invalidateQueries({ queryKey: ["wa-confirmations"] });
      qc.invalidateQueries({ queryKey: ["wa-conf-stats"] });
    },
  });

  const bulkSendMut = useMutation({
    mutationFn: (limit: number) => api("/admin/logistics/confirmations/bulk-send", { method: "POST", body: JSON.stringify({ limit }) }).then(r => r.json()),
    onSuccess: (d) => {
      toast({ title: `Sent ${d.sent} / ${d.total}`, description: `${d.failed} failed`, variant: d.sent > 0 ? "default" : "destructive" });
      qc.invalidateQueries({ queryKey: ["wa-confirmations"] });
      qc.invalidateQueries({ queryKey: ["wa-conf-stats"] });
    },
  });

  const bulkBookMut = useMutation({
    mutationFn: (limit: number) => api("/admin/logistics/auto-book-bulk", { method: "POST", body: JSON.stringify({ limit }) }).then(r => r.json()),
    onSuccess: (d) => {
      toast({ title: `Booked ${d.booked} / ${d.total}`, description: "Bulk booking complete", variant: d.booked > 0 ? "default" : "destructive" });
      qc.invalidateQueries({ queryKey: ["wa-confirmations"] });
    },
  });

  function fmt(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  const avgReply = stats.avg_reply_seconds
    ? stats.avg_reply_seconds < 60
      ? `${Math.round(stats.avg_reply_seconds)}s`
      : `${Math.round(stats.avg_reply_seconds / 60)}m`
    : "—";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-green-600" />
            WA Order Confirmations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            WhatsApp confirmation flow → Real courier auto-booking pipeline
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["wa-conf-stats"] }); }}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={<Clock className="w-5 h-5 text-yellow-600" />}    label="Pending"   value={stats.pending ?? 0}   color="bg-yellow-50" />
        <StatCard icon={<CheckCircle className="w-5 h-5 text-blue-600" />} label="Confirmed" value={stats.confirmed ?? 0} color="bg-blue-50" />
        <StatCard icon={<Truck className="w-5 h-5 text-green-600" />}      label="Booked"    value={stats.booked ?? 0}    color="bg-green-50" />
        <StatCard icon={<XCircle className="w-5 h-5 text-red-600" />}      label="Cancelled" value={stats.cancelled ?? 0} color="bg-red-50" />
        <StatCard icon={<BarChart3 className="w-5 h-5 text-purple-600" />} label="Total (30d)" value={stats.total ?? 0}  color="bg-purple-50" />
        <StatCard icon={<Zap className="w-5 h-5 text-orange-600" />}       label="Avg Reply" value={avgReply}             color="bg-orange-50" />
      </div>

      {/* Flow explanation */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className="flex items-center gap-1 bg-white border rounded-lg px-3 py-1.5 shadow-sm"><Package className="w-4 h-4 text-blue-500" /> Shopify Order</span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="flex items-center gap-1 bg-white border rounded-lg px-3 py-1.5 shadow-sm"><MessageSquare className="w-4 h-4 text-green-500" /> WA Confirmation</span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="flex items-center gap-1 bg-white border rounded-lg px-3 py-1.5 shadow-sm"><CheckCircle className="w-4 h-4 text-yellow-500" /> Customer Replies</span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="flex items-center gap-1 bg-white border rounded-lg px-3 py-1.5 shadow-sm"><Truck className="w-4 h-4 text-purple-500" /> Real Courier API</span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="flex items-center gap-1 bg-white border rounded-lg px-3 py-1.5 shadow-sm text-green-700 font-semibold">🚀 Tracking → WA</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Confirm keywords detected automatically: <code className="bg-white/70 px-1 rounded">confirm, yes, ok, han, haan, ji han, theek hai, bilkul</code>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(["list", "bulk"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t === "list" ? "Confirmation Records" : "Bulk Actions"}
          </button>
        ))}
      </div>

      {/* LIST TAB */}
      {activeTab === "list" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="w-4 h-4 text-muted-foreground" />
            {["all", "pending", "confirmed", "booked", "cancelled", "failed"].map(s => (
              <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-card border rounded-xl overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading confirmations…</div>
            ) : confirmations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No confirmation records yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Use Bulk Actions to send WhatsApp confirmations to pending orders.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Order</th>
                      <th className="px-4 py-3 text-left">Customer</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Courier / Tracking</th>
                      <th className="px-4 py-3 text-left">Sent</th>
                      <th className="px-4 py-3 text-left">Replied</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {confirmations.map((conf: any) => (
                      <tr key={conf.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{conf.shopify_order_number ?? conf.order_number ?? `#${conf.shopify_order_id}`}</div>
                          <div className="text-xs text-muted-foreground">PKR {Number(conf.total_price ?? 0).toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{conf.customer_name}</div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            {conf.customer_phone}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={conf.status} />
                          {conf.confirmation_reply && (
                            <div className="text-xs text-muted-foreground mt-1 italic">"{conf.confirmation_reply}"</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {conf.courier_slug ? (
                            <div>
                              <div className="font-medium capitalize">{conf.courier_slug}</div>
                              {conf.tracking_id && <div className="text-xs text-muted-foreground font-mono">{conf.tracking_id}</div>}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(conf.last_sent_at)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {conf.confirmation_received_at ? fmt(conf.confirmation_received_at) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end flex-wrap">
                            {/* Resend if not booked */}
                            {conf.status !== "booked" && (
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => resendMut.mutate(conf.id)}
                                disabled={resendMut.isPending}>
                                <Send className="w-3 h-3 mr-1" /> Resend
                              </Button>
                            )}
                            {/* Force-book if confirmed or pending */}
                            {(conf.status === "confirmed" || conf.status === "pending") && conf.shopify_order_db_id && (
                              <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
                                onClick={() => forceBookMut.mutate({ id: conf.id })}
                                disabled={forceBookMut.isPending}>
                                <Truck className="w-3 h-3 mr-1" /> Book
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{pagination.total} total</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="flex items-center px-3 text-sm">{page} / {pagination.pages}</span>
                <Button variant="outline" size="sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BULK TAB */}
      {activeTab === "bulk" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Bulk Send Confirmations */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold">Bulk Send WA Confirmations</h3>
                <p className="text-xs text-muted-foreground">Send WhatsApp confirmation to unfulfilled orders without a pending confirmation</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Max Orders to Process</label>
              <Input type="number" value={bulkLimit} onChange={e => setBulkLimit(e.target.value)}
                min={1} max={100} className="w-full" />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              Only sends to orders with a customer phone number that haven't received a confirmation yet.
              300ms delay between messages to avoid Meta rate limits.
            </div>

            <Button className="w-full" onClick={() => bulkSendMut.mutate(parseInt(bulkLimit))} disabled={bulkSendMut.isPending}>
              {bulkSendMut.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : <><Send className="w-4 h-4 mr-2" /> Send Confirmations</>}
            </Button>

            {bulkSendMut.data && (
              <div className={`rounded-lg p-3 text-sm ${bulkSendMut.data.sent > 0 ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
                ✓ Sent: {bulkSendMut.data.sent} &nbsp;|&nbsp; Failed: {bulkSendMut.data.failed} &nbsp;|&nbsp; Total: {bulkSendMut.data.total}
              </div>
            )}
          </div>

          {/* Bulk Auto-Book */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
                <Truck className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold">Bulk Auto-Book Shipments</h3>
                <p className="text-xs text-muted-foreground">Auto-book courier shipments for unfulfilled orders using the OnDrive Engine (real courier API if configured)</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Max Orders to Book</label>
              <Input type="number" value={bookingLimit} onChange={e => setBulkBookLimit(e.target.value)}
                min={1} max={50} className="w-full" />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
              <Zap className="w-3 h-3 inline mr-1" />
              Uses the OnDrive courier selection engine. Real API is called if courier credentials are configured.
              WhatsApp tracking notification sent automatically.
            </div>

            <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => bulkBookMut.mutate(parseInt(bookingLimit))} disabled={bulkBookMut.isPending}>
              {bulkBookMut.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Booking…</> : <><Play className="w-4 h-4 mr-2" /> Run Auto-Book</>}
            </Button>

            {bulkBookMut.data && (
              <div className={`rounded-lg p-3 text-sm ${bulkBookMut.data.booked > 0 ? "bg-green-50 border border-green-200 text-green-800" : "bg-orange-50 border border-orange-200 text-orange-800"}`}>
                ✓ Booked: {bulkBookMut.data.booked} / {bulkBookMut.data.total}
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="md:col-span-2 bg-card border rounded-xl p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Eye className="w-4 h-4" /> How the Automation Works</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                { step: "1", title: "Order Arrives", desc: "New Shopify order synced. Admin sends WhatsApp confirmation with order details + Confirm/Cancel buttons.", icon: <Package className="w-4 h-4 text-blue-500" /> },
                { step: "2", title: "Customer Replies", desc: "Customer replies 'confirm', 'yes', 'han', 'ji han', 'ok', or taps the ✅ button. Any of 25+ keywords detected.", icon: <MessageSquare className="w-4 h-4 text-green-500" /> },
                { step: "3", title: "Auto Booking", desc: "OnDrive Engine selects best courier based on city, weight & COD rules. Real courier API called (PostEx/TCS/Leopards/Trax).", icon: <Zap className="w-4 h-4 text-purple-500" /> },
                { step: "4", title: "Tracking Sent", desc: "Tracking ID sent via WhatsApp to customer. Shopify fulfillment updated. Admin COD dashboard updated.", icon: <Truck className="w-4 h-4 text-orange-500" /> },
              ].map(item => (
                <div key={item.step} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {item.step}
                  </div>
                  <div>
                    <div className="flex items-center gap-1 font-medium mb-1">{item.icon} {item.title}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
