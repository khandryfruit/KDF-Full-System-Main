import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";

const STATUS_COLORS: Record<string, string> = {
  pending:      "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  confirmed:    "bg-blue-500/15   text-blue-400   border-blue-500/25",
  processing:   "bg-indigo-500/15 text-indigo-400 border-indigo-500/25",
  shipped:      "bg-cyan-500/15   text-cyan-400   border-cyan-500/25",
  delivered:    "bg-green-500/15  text-green-400  border-green-500/25",
  cancelled:    "bg-red-500/15    text-red-400    border-red-500/25",
  refunded:     "bg-orange-500/15 text-orange-400 border-orange-500/25",
};

function statusColor(s: string) {
  return STATUS_COLORS[s?.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
}

export default function OrdersPage() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["admin-orders-app", page, search],
    queryFn: () =>
      fetch(`/api/admin/shopify/orders?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
    placeholderData: (prev: any) => prev,
    refetchInterval: 30_000,
  });

  const orders     = data?.orders ?? [];
  const total      = data?.pagination?.total ?? 0;
  const totalPages = data?.pagination?.pages ?? 1;

  return (
    <AppShell title="Orders">
      <div className="p-4 space-y-3">
        {/* Search */}
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by order # or customer..."
          className="w-full h-11 rounded-xl bg-card border border-border px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
        />

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total} total orders</span>
          <span>Page {page} / {totalPages}</span>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <span className="text-4xl mb-3">📦</span>
            <p className="text-sm">No orders found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((o: any) => (
              <div key={o.id ?? o.shopify_id} className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      #{o.order_number ?? o.shopify_order_number ?? o.id}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {o.customer_name ?? o.shipping_address?.name ?? "Unknown customer"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {o.shipping_address?.city ?? "—"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColor(o.fulfillment_status ?? o.financial_status)}`}>
                      {o.fulfillment_status ?? o.financial_status ?? "pending"}
                    </span>
                    <p className="text-sm font-bold text-primary">
                      Rs {Number(o.total_price ?? 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="flex-1 h-10 rounded-xl bg-card border border-border text-sm text-foreground disabled:opacity-40 transition hover:bg-accent"
            >
              ← Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="flex-1 h-10 rounded-xl bg-card border border-border text-sm text-foreground disabled:opacity-40 transition hover:bg-accent"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
