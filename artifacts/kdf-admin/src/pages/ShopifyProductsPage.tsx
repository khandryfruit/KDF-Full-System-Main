import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search, Package, ChevronLeft, ChevronRight, Tag, BarChart2 } from "lucide-react";
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

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  draft: "bg-gray-100 text-gray-700",
  archived: "bg-red-100 text-red-700",
};

export default function ShopifyProductsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["shopify-products", page, search, status],
    queryFn: () => api(`/admin/shopify/products?page=${page}&limit=24&search=${encodeURIComponent(search)}&status=${status}`).then(r => r.json()),
  });

  const syncMutation = useMutation({
    mutationFn: () => api("/admin/shopify/sync/products", { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["shopify-products"] }); toast({ title: `${d.synced} products synced` }); },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 24);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Shopify Products</h1>
          <p className="text-muted-foreground text-sm">{total} products synced from Shopify</p>
        </div>
        <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Syncing..." : "Sync from Shopify"}
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search products..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          className="border border-border rounded-md px-3 py-2 text-sm bg-background">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">Loading products...</div>
      ) : products.length === 0 ? (
        <div className="p-12 text-center bg-card border border-border rounded-xl">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No products found</p>
          <p className="text-sm text-muted-foreground mt-1">Sync products from Shopify or adjust your filters</p>
          <Button className="mt-4" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sync Now
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p: any) => (
            <div key={p.id} className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-all group">
              <div className="aspect-square bg-muted relative overflow-hidden">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Package className="w-12 h-12 text-muted-foreground" /></div>
                )}
                <div className="absolute top-2 right-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[p.status ?? "active"] ?? "bg-gray-100 text-gray-700"}`}>{p.status}</span>
                </div>
              </div>
              <div className="p-3">
                <p className="font-semibold text-sm line-clamp-2">{p.title}</p>
                {p.vendor && <p className="text-xs text-muted-foreground mt-0.5">{p.vendor}</p>}
                <div className="flex items-center justify-between mt-2">
                  <div>
                    <p className="font-bold text-primary">PKR {parseFloat(p.price ?? "0").toLocaleString()}</p>
                    {p.compareAtPrice && parseFloat(p.compareAtPrice) > parseFloat(p.price ?? "0") && (
                      <p className="text-xs text-muted-foreground line-through">PKR {parseFloat(p.compareAtPrice).toLocaleString()}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <BarChart2 className="w-3 h-3" />
                      {p.inventoryQuantity ?? 0} in stock
                    </div>
                    {p.sku && <p className="text-xs text-muted-foreground">SKU: {p.sku}</p>}
                  </div>
                </div>
                {p.tags && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {p.tags.split(",").slice(0, 2).map((tag: string) => (
                      <span key={tag} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <Tag className="w-2.5 h-2.5" />{tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {totalPages} ({total} products)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
