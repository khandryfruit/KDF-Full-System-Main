import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";
import {
  Truck, RefreshCw, Search, Send, Package, CheckCircle,
  XCircle, Clock, AlertCircle, X, ChevronDown, Zap,
} from "lucide-react";

const STATUS_CFG: Record<string, { color: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  pending:   { color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",  icon: Clock,        label: "Pending"   },
  confirmed: { color: "bg-blue-500/15   text-blue-400   border-blue-500/25",    icon: CheckCircle,  label: "Confirmed" },
  booked:    { color: "bg-green-500/15  text-green-400  border-green-500/25",   icon: Package,      label: "Booked"    },
  cancelled: { color: "bg-red-500/15    text-red-400    border-red-500/25",     icon: XCircle,      label: "Cancelled" },
  failed:    { color: "bg-orange-500/15 text-orange-400 border-orange-500/25",  icon: AlertCircle,  label: "Failed"    },
};

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const COURIER_ICONS: Record<string, string> = {
  tcs: "TCS", postex: "PEX", leopards: "LEO", trax: "TRX",
};

/* ── Full booking modal ──────────────────────────────── */
interface BookModalProps {
  row: any;
  token: string | null;
  onClose: () => void;
  onBooked: () => void;
}

function BookModal({ row, token, onClose, onBooked }: BookModalProps) {
  const isPaid  = (row.financial_status ?? "").toLowerCase() === "paid";
  const [form, setForm] = useState({
    courierSlug:  "",
    weight:       "0.5",
    pieces:       "1",
    codAmount:    isPaid ? "0" : String(Number(row.total_price ?? 0)),
    customerPhone: row.customer_phone ?? "",
    serviceCode:  "O",
    contentDesc:  "KDF Nuts Products",
  });
  const [apiError, setApiError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const h = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

  const { data: couriersData, isLoading: couriersLoading } = useQuery<any>({
    queryKey: ["couriers-list"],
    queryFn: () => fetch("/api/admin/couriers", { headers: h() }).then(r => r.json()),
    staleTime: 60_000,
  });
  const activeCouriers: any[] = (couriersData?.couriers ?? couriersData ?? []).filter((c: any) => c.isActive ?? c.is_active);

  const bookMutation = useMutation({
    mutationFn: async () => {
      const dbId = row.shopify_order_db_id;
      if (!dbId) throw new Error("Order DB id not found — cannot book");
      const r = await fetch(`/api/admin/shopify/orders/${dbId}/book-courier`, {
        method: "POST",
        headers: h(),
        body: JSON.stringify({
          courierSlug:    form.courierSlug,
          weight:         parseFloat(form.weight) || 0.5,
          pieces:         parseInt(form.pieces) || 1,
          codAmount:      parseFloat(form.codAmount) || 0,
          customerPhone:  form.customerPhone,
          serviceCode:    form.serviceCode,
          contentDesc:    form.contentDesc,
          notifyWhatsapp: true,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Object.assign(new Error(d.error ?? "Booking failed"), { notConfigured: d.notConfigured });
      return d;
    },
    onSuccess: (d) => {
      setApiError(null);
      onBooked();
      onClose();
      alert(`✅ Booked! Tracking: ${d.trackingId ?? d.tracking_id ?? "—"}`);
    },
    onError: (e: any) => setApiError(e.message ?? "Booking failed"),
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card border border-border rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Truck className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-bold text-sm">Book Courier</p>
              <p className="text-[10px] text-muted-foreground">{row.shopify_order_number ?? row.order_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* payment status banner */}
          <div className={`flex items-center gap-2 p-3 rounded-xl text-xs ${
            isPaid ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
          }`}>
            {isPaid
              ? <><CheckCircle className="w-3.5 h-3.5 shrink-0" /><span><b>Prepaid</b> — COD set to Rs. 0</span></>
              : <><Zap className="w-3.5 h-3.5 shrink-0" /><span><b>Cash on Delivery</b> — Rs. {Number(row.total_price ?? 0).toLocaleString()}</span></>
            }
          </div>

          {/* courier selection */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-2">
              Select Courier
            </label>
            {couriersLoading ? (
              <div className="h-10 bg-muted rounded-xl animate-pulse" />
            ) : activeCouriers.length === 0 ? (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-400">
                No active couriers configured. Set up couriers in Settings first.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {activeCouriers.map((c: any) => (
                  <button key={c.slug}
                    onClick={() => set("courierSlug", c.slug)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      form.courierSlug === c.slug
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}>
                    <span className="text-xs font-bold text-foreground">{c.name}</span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">
                      {COURIER_ICONS[c.slug] ?? c.slug?.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* weight + pieces */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                Weight (kg)
              </label>
              <input type="number" step="0.1" min="0.1"
                value={form.weight}
                onChange={e => set("weight", e.target.value)}
                className="w-full h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                Pieces
              </label>
              <input type="number" step="1" min="1"
                value={form.pieces}
                onChange={e => set("pieces", e.target.value)}
                className="w-full h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          {/* COD */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
              COD Amount (Rs.)
            </label>
            <input type="number" min="0"
              value={form.codAmount}
              onChange={e => set("codAmount", e.target.value)}
              disabled={isPaid}
              className="w-full h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50" />
          </div>

          {/* customer phone */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
              Customer Phone
            </label>
            <input type="tel"
              value={form.customerPhone}
              onChange={e => set("customerPhone", e.target.value)}
              className="w-full h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          {/* service type */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
              Service Type
            </label>
            <div className="flex gap-2">
              {[["O", "Overnight"], ["E", "Economy"], ["S", "Same-day"]].map(([code, label]) => (
                <button key={code}
                  onClick={() => set("serviceCode", code)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${
                    form.serviceCode === code
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-border"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* error */}
          {apiError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
              {apiError}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="p-4 border-t border-border shrink-0">
          <button
            onClick={() => bookMutation.mutate()}
            disabled={bookMutation.isPending || !form.courierSlug || !form.customerPhone}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {bookMutation.isPending
              ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Booking…</>
              : <><Truck className="w-4 h-4" /> Book Courier</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────── */
export default function LogisticsPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(1);
  const [filter, setFilter]     = useState<"all" | "pending" | "confirmed" | "booked" | "failed">("all");
  const [sending, setSending]   = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [bookRow, setBookRow]   = useState<any | null>(null);

  const h = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

  const { data: statsRaw } = useQuery({
    queryKey: ["logistics-stats"],
    queryFn: () => fetch("/api/admin/logistics/confirmations/stats", { headers: h() }).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ["logistics-confirmations", page, filter, search],
    queryFn: () =>
      fetch(
        `/api/admin/logistics/confirmations?page=${page}&limit=15${filter !== "all" ? `&status=${filter}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
        { headers: h() }
      ).then(r => r.json()),
    placeholderData: (prev: any) => prev,
    refetchInterval: 20_000,
  });

  const stats       = statsRaw?.confirmations ?? {};
  const rows: any[] = data?.confirmations ?? data?.data ?? [];
  const totalPages  = data?.pagination?.pages ?? 1;

  const sendWA = async (id: number) => {
    setSending(id);
    try {
      await fetch(`/api/admin/logistics/confirmations/${id}/resend`, {
        method: "POST", headers: h(),
      });
      qc.invalidateQueries({ queryKey: ["logistics-confirmations"] });
    } finally { setSending(null); }
  };

  const forceBook = async (id: number) => {
    setSending(id);
    try {
      await fetch(`/api/admin/logistics/confirmations/${id}/force-book`, {
        method: "POST", headers: h(),
      });
      qc.invalidateQueries({ queryKey: ["logistics-confirmations"] });
    } finally { setSending(null); }
  };

  return (
    <AppShell title="Logistics">
      <div className="p-4 space-y-3">

        {/* header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Truck className="w-5 h-5 text-orange-400" /> Logistics
            </h2>
            <p className="text-xs text-muted-foreground">Courier confirmations & bookings</p>
          </div>
          <button onClick={() => refetch()}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted">
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* stats */}
        {Object.keys(stats).length > 0 && (
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { label: "Total",     value: stats.total     ?? 0, color: "text-foreground"  },
              { label: "Pending",   value: stats.pending   ?? 0, color: "text-yellow-400"  },
              { label: "Confirmed", value: stats.confirmed ?? 0, color: "text-blue-400"    },
              { label: "Booked",    value: stats.booked    ?? 0, color: "text-green-400"   },
              { label: "Failed",    value: stats.failed    ?? 0, color: "text-red-400"     },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-2 text-center">
                <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search order # or customer…"
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground" />
        </div>

        {/* filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "pending", "confirmed", "booked", "failed"] as const).map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize transition ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
              {f}
            </button>
          ))}
        </div>

        {/* list */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <Truck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No confirmations found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row: any) => {
              const cfg    = STATUS_CFG[row.status] ?? STATUS_CFG.pending;
              const Icon   = cfg.icon;
              const isOpen = expanded === row.id;
              const items  = row.line_items ?? [];

              return (
                <div key={row.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  {/* tap to expand */}
                  <button onClick={() => setExpanded(isOpen ? null : row.id)}
                    className="w-full p-3.5 flex items-start gap-3 text-left">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cfg.color.split(" ")[0]}`}>
                      <Icon className={`w-4 h-4 ${cfg.color.split(" ")[1]}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{row.shopify_order_number ?? row.order_number}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{row.customer_name} · {row.customer_phone}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {row.courier_slug && <p className="text-[10px] text-cyan-400 font-medium">{row.courier_slug.toUpperCase()}</p>}
                        {row.tracking_id  && <p className="text-[10px] font-mono text-muted-foreground">{row.tracking_id}</p>}
                        <p className="text-[10px] text-muted-foreground ml-auto">{timeAgo(row.created_at)}</p>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground/50 shrink-0 mt-1 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  {/* expanded detail */}
                  {isOpen && (
                    <div className="border-t border-border px-3.5 pb-3.5 pt-3 space-y-3">
                      {items.length > 0 && (
                        <div className="space-y-1">
                          {items.map((it: any, i: number) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="text-muted-foreground truncate flex-1">{it.title ?? it.name}</span>
                              <span className="font-semibold shrink-0 ml-2">×{it.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {row.total_price && (
                        <p className="text-sm font-bold text-primary">
                          Total: Rs {Number(row.total_price).toLocaleString()}
                          {(row.financial_status ?? "").toLowerCase() === "paid" && (
                            <span className="ml-2 text-[10px] font-semibold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">PAID</span>
                          )}
                        </p>
                      )}

                      {/* action buttons */}
                      <div className="flex gap-2 flex-wrap">
                        {/* send WA (pending/failed) */}
                        {(row.status === "pending" || row.status === "failed") && (
                          <button onClick={() => sendWA(row.id)} disabled={sending === row.id}
                            className="flex-1 min-w-[100px] flex items-center justify-center gap-1.5 h-9 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 text-xs font-semibold disabled:opacity-50">
                            <Send className="w-3.5 h-3.5" />
                            {sending === row.id ? "Sending…" : "Send WA"}
                          </button>
                        )}

                        {/* auto-book (confirmed, no DB id) */}
                        {row.status === "confirmed" && !row.shopify_order_db_id && (
                          <button onClick={() => forceBook(row.id)} disabled={sending === row.id}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-primary/10 border border-primary/25 text-primary text-xs font-semibold disabled:opacity-50">
                            <Truck className="w-3.5 h-3.5" />
                            {sending === row.id ? "Booking…" : "Auto-Book"}
                          </button>
                        )}

                        {/* full booking modal (confirmed + DB id) */}
                        {row.status === "confirmed" && row.shopify_order_db_id && (
                          <button onClick={() => setBookRow(row)}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
                            <Truck className="w-3.5 h-3.5" /> Book Courier
                          </button>
                        )}

                        {/* tracking badge */}
                        {row.tracking_id && (
                          <div className="flex-1 flex items-center justify-center gap-1 h-9 rounded-xl bg-muted border border-border text-xs text-cyan-400 font-mono">
                            {row.tracking_id}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* pagination */}
        {totalPages > 1 && (
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="flex-1 h-10 rounded-xl bg-card border border-border text-sm disabled:opacity-40">← Prev</button>
            <span className="flex items-center px-3 text-xs text-muted-foreground">{page}/{totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="flex-1 h-10 rounded-xl bg-card border border-border text-sm disabled:opacity-40">Next →</button>
          </div>
        )}
      </div>

      {/* full booking modal */}
      {bookRow && (
        <BookModal
          row={bookRow}
          token={token}
          onClose={() => setBookRow(null)}
          onBooked={() => {
            qc.invalidateQueries({ queryKey: ["logistics-confirmations"] });
            setBookRow(null);
          }}
        />
      )}
    </AppShell>
  );
}
