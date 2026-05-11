import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";
import { Users, Search, Phone, ShoppingBag, RefreshCw, Mail } from "lucide-react";

function apiFetch(path: string, token: string | null) {
  return fetch(`/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json());
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${color}`}>
      {label}
    </span>
  );
}

export default function CustomersPage() {
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["app-customers", search, page],
    queryFn:  () => apiFetch(
      `/admin/shopify/customers?limit=30&page=${page}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      token
    ),
    staleTime: 30_000,
  });

  const customers  = data?.customers ?? data?.data ?? [];
  const total      = data?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / 30) : 1;

  return (
    <AppShell title="Customers">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              Customers
            </h2>
            <p className="text-xs text-muted-foreground">{total.toLocaleString()} total customers</p>
          </div>
          <button
            onClick={() => refetch()}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/70 transition"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, phone or email…"
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading customers…</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No customers found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {customers.map((c: any) => {
              const name    = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.first_name || c.name || "Unknown";
              const orders  = c.totalOrders ?? c.orders_count ?? 0;
              const spent   = Number(c.totalSpent ?? c.total_spent ?? 0);
              const contact = c.phone ?? c.email ?? "";
              const isEmail = !c.phone && !!c.email;
              return (
                <div key={c.id}
                  className="bg-card border border-border rounded-2xl p-3.5 flex items-start gap-3 active:scale-[0.99] transition-transform">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center font-bold text-blue-400 text-sm shrink-0">
                    {name[0].toUpperCase()}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-sm text-foreground truncate">{name}</span>
                      {spent > 0 && (
                        <span className="text-xs font-bold text-primary shrink-0">
                          Rs {Math.round(spent).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {contact && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isEmail
                          ? <Mail  className="w-3 h-3 text-muted-foreground shrink-0" />
                          : <Phone className="w-3 h-3 text-muted-foreground shrink-0" />}
                        <span className="text-xs text-muted-foreground truncate">{contact}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ShoppingBag className="w-3 h-3" />
                        {orders} order{orders !== 1 ? "s" : ""}
                      </div>
                      {c.city && (
                        <Badge label={c.city} color="bg-muted text-muted-foreground" />
                      )}
                      {c.tags && (
                        <Badge label={c.tags.split(",")[0].trim()} color="bg-primary/10 text-primary" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
            <span className="flex items-center px-3 text-xs text-muted-foreground">
              {page}/{totalPages}
            </span>
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
