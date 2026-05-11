import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";
import { Package, Search, RefreshCw, Tag, Star } from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  active:   "bg-green-500/15 text-green-400 border-green-500/25",
  draft:    "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  archived: "bg-muted text-muted-foreground border-border",
};

export default function ProductsPage() {
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);
  const [filter, setFilter] = useState<"all" | "active" | "draft">("all");

  const { data, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ["app-products", search, page, filter],
    queryFn: () =>
      fetch(
        `/api/admin/shopify/products?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ""}${filter !== "all" ? `&status=${filter}` : ""}`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then(r => r.json()),
    placeholderData: (prev: any) => prev,
    staleTime: 30_000,
  });

  const products   = data?.products ?? [];
  const total      = data?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / 20) : 1;

  return (
    <AppShell title="Products">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Package className="w-5 h-5 text-cyan-400" />
              Products
            </h2>
            <p className="text-xs text-muted-foreground">{total.toLocaleString()} products</p>
          </div>
          <button onClick={() => refetch()} className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/70 transition">
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search products…"
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
          />
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {(["all", "active", "draft"] as const).map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition capitalize ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
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
        ) : products.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No products found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map((p: any) => {
              const price      = Number(p.price ?? 0);
              const compare    = Number(p.compareAtPrice ?? 0);
              const discount   = compare > price && compare > 0
                ? Math.round(((compare - price) / compare) * 100) : 0;
              const statusStr  = p.status ?? "active";
              const stock      = p.inventoryQuantity ?? "—";
              const tags       = p.tags ? p.tags.split(",").slice(0, 2) : [];
              return (
                <div key={p.id} className="bg-card border border-border rounded-2xl p-3.5 flex gap-3">
                  {/* Thumbnail */}
                  <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" />
                      : <Package className="w-6 h-6 text-muted-foreground/40" />
                    }
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 flex-1">{p.title}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_COLOR[statusStr] ?? STATUS_COLOR.draft}`}>
                        {statusStr}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-sm font-bold text-primary">Rs {price.toLocaleString()}</span>
                      {discount > 0 && (
                        <span className="text-[10px] line-through text-muted-foreground">Rs {compare.toLocaleString()}</span>
                      )}
                      {discount > 0 && (
                        <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">-{discount}%</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">Stock: <strong className={`${typeof stock === "number" && stock < 5 ? "text-red-400" : "text-foreground"}`}>{stock}</strong></span>
                      {p.vendor && <span className="text-[10px] text-muted-foreground">· {p.vendor}</span>}
                      {p.isFeatured && <span className="flex items-center gap-0.5 text-[10px] text-amber-400"><Star className="w-2.5 h-2.5" />Featured</span>}
                      {tags.map((t: string) => (
                        <span key={t} className="flex items-center gap-0.5 text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                          <Tag className="w-2 h-2" />{t.trim()}
                        </span>
                      ))}
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
