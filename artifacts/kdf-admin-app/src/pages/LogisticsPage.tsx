import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";
import { Truck, RefreshCw, Search, Send, Package, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";

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

export default function LogisticsPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch]   = useState("");
  const [page, setPage]       = useState(1);
  const [filter, setFilter]   = useState<"all" | "pending" | "confirmed" | "booked" | "failed">("all");
  const [sending, setSending] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

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
  const total       = data?.pagination?.total ?? rows.length;
  const totalPages  = data?.pagination?.pages ?? 1;

  const sendWA = async (id: number) => {
    setSending(id);
    try {
      await fetch(`/api/admin/logistics/confirmations/${id}/send`, {
        method: "POST", headers: h(),
      });
      qc.invalidateQueries({ queryKey: ["logistics-confirmations"] });
    } finally { setSending(null); }
  };

  const rebook = async (id: number) => {
    setSending(id);
    try {
      await fetch(`/api/admin/logistics/confirmations/${id}/book`, {
        method: "POST", headers: h(),
      });
      qc.invalidateQueries({ queryKey: ["logistics-confirmations"] });
    } finally { setSending(null); }
  };

  return (
    <AppShell title="Logistics">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Truck className="w-5 h-5 text-orange-400" />
              Logistics
            </h2>
            <p className="text-xs text-muted-foreground">Courier confirmations & bookings</p>
          </div>
          <button onClick={() => refetch()} className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/70 transition">
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Stats row */}
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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search order # or customer…"
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground" />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "pending", "confirmed", "booked", "failed"] as const).map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition capitalize ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {f}
            </button>
          ))}
        </div>

        {/* List */}
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
              const cfg     = STATUS_CFG[row.status] ?? STATUS_CFG.pending;
              const Icon    = cfg.icon;
              const isOpen  = expanded === row.id;
              const items   = row.line_items ?? [];
              return (
                <div key={row.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  {/* Main row */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                    className="w-full p-3.5 flex items-start gap-3 text-left"
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cfg.color.split(" ").slice(0,1).join("")}`}>
                      <Icon className={`w-4 h-4 ${cfg.color.split(" ")[1]}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{row.shopify_order_number ?? row.order_number}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{row.customer_name} · {row.customer_phone}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {row.courier_slug && <p className="text-[10px] text-cyan-400 font-medium">{row.courier_slug.toUpperCase()}</p>}
                        {row.tracking_id  && <p className="text-[10px] font-mono text-muted-foreground">{row.tracking_id}</p>}
                        <p className="text-[10px] text-muted-foreground ml-auto">{timeAgo(row.created_at)}</p>
                      </div>
                    </div>
                  </button>

                  {/* Expanded */}
                  {isOpen && (
                    <div className="border-t border-border px-3.5 pb-3.5 pt-2.5 space-y-3">
                      {/* Items */}
                      {items.length > 0 && (
                        <div className="space-y-1">
                          {items.map((it: any, i: number) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="text-muted-foreground truncate flex-1">{it.title ?? it.name}</span>
                              <span className="font-semibold text-foreground shrink-0 ml-2">×{it.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {row.total_price && (
                        <p className="text-sm font-bold text-primary">Total: Rs {Number(row.total_price).toLocaleString()}</p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        {(row.status === "pending" || row.status === "failed") && (
                          <button
                            onClick={() => sendWA(row.id)}
                            disabled={sending === row.id}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 text-xs font-semibold disabled:opacity-50"
                          >
                            <Send className="w-3.5 h-3.5" />
                            {sending === row.id ? "Sending…" : "Send WA"}
                          </button>
                        )}
                        {(row.status === "confirmed") && (
                          <button
                            onClick={() => rebook(row.id)}
                            disabled={sending === row.id}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-primary/10 border border-primary/25 text-primary text-xs font-semibold disabled:opacity-50"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            {sending === row.id ? "Booking…" : "Book Courier"}
                          </button>
                        )}
                        {row.tracking_id && (
                          <div className="flex-1 flex items-center justify-center gap-1 h-9 rounded-xl bg-muted border border-border text-xs text-muted-foreground font-mono">
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="flex-1 h-10 rounded-xl bg-card border border-border text-sm text-foreground disabled:opacity-40">← Prev</button>
            <span className="flex items-center px-3 text-xs text-muted-foreground">{page}/{totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="flex-1 h-10 rounded-xl bg-card border border-border text-sm text-foreground disabled:opacity-40">Next →</button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
