import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Star, Sparkles, TrendingUp, Tag, Package, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BADGE_OPTIONS = [
  { value: "", label: "None" },
  { value: "Best Seller", label: "🔥 Best Seller" },
  { value: "Popular", label: "⭐ Popular" },
  { value: "Trending", label: "📈 Trending" },
  { value: "New Arrival", label: "✨ New Arrival" },
  { value: "Premium", label: "💎 Premium" },
  { value: "Sale", label: "🏷️ Sale" },
];

interface ShopifyProduct {
  id: number;
  title: string;
  price: string | null;
  imageUrl: string | null;
  inventoryQuantity: number | null;
  productType: string | null;
  isFeatured: boolean;
  badge: string | null;
  isRecommended: boolean;
  recommendPriority: number | null;
}

function ProductImg({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-lg">🥜</div>;
  return <img src={src} alt={alt} className="w-10 h-10 rounded object-cover" onError={() => setErr(true)} />;
}

export default function FeaturedProductsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/shopify/products/featured", search, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("page", String(page));
      const res = await fetch(`/api/admin/shopify/products/featured?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` },
      });
      if (!res.ok) throw new Error("Failed to load");
      return res.json() as Promise<{ products: ShopifyProduct[]; total: number; page: number; limit: number }>;
    },
  });

  const updateFlags = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<ShopifyProduct> }) => {
      const res = await fetch(`/api/admin/shopify/products/${id}/flags`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("adminToken")}`,
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Update failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/shopify/products/featured"] });
      toast({ title: "Updated", description: "Product flags saved." });
    },
    onError: () => toast({ title: "Error", description: "Update failed.", variant: "destructive" }),
  });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;
  const featuredCount = data?.products.filter(p => p.isFeatured).length ?? 0;
  const recommendedCount = data?.products.filter(p => p.isRecommended).length ?? 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-yellow-500" />
            Featured & Recommended Products
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Control which products appear as featured, recommended, and with special badges in the AI chat widget.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
          <Star className="w-8 h-8 text-yellow-500" />
          <div>
            <p className="text-2xl font-bold text-yellow-700">{data?.products.filter(p => p.isFeatured).length ?? "—"}</p>
            <p className="text-xs text-yellow-600 font-medium">Featured (this page)</p>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-blue-500" />
          <div>
            <p className="text-2xl font-bold text-blue-700">{data?.products.filter(p => p.isRecommended).length ?? "—"}</p>
            <p className="text-xs text-blue-600 font-medium">Recommended (this page)</p>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <Package className="w-8 h-8 text-green-500" />
          <div>
            <p className="text-2xl font-bold text-green-700">{data?.total ?? "—"}</p>
            <p className="text-xs text-green-600 font-medium">Total Active Products</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search products..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch}>Search</Button>
        {search && <Button variant="ghost" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>Clear</Button>}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Product</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Price</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">
                <Star className="w-4 h-4 inline text-yellow-500" /> Featured
              </th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">
                <TrendingUp className="w-4 h-4 inline text-blue-500" /> Recommended
              </th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">
                <Tag className="w-4 h-4 inline text-purple-500" /> Badge
              </th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">Priority</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading products...</td></tr>
            )}
            {!isLoading && data?.products.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">No products found</td></tr>
            )}
            {data?.products.map(p => (
              <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${p.isFeatured ? "bg-yellow-50/30" : ""}`}>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <ProductImg src={p.imageUrl} alt={p.title} />
                    <div>
                      <p className="font-medium text-gray-900 line-clamp-1 max-w-[280px]">{p.title}</p>
                      <p className="text-xs text-gray-400">{p.productType ?? "—"} · Stock: {p.inventoryQuantity ?? 0}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 font-semibold text-gray-800">
                  Rs. {Number(p.price ?? 0).toLocaleString()}
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={() => updateFlags.mutate({ id: p.id, updates: { isFeatured: !p.isFeatured } })}
                    className={`w-10 h-6 rounded-full transition-colors relative ${p.isFeatured ? "bg-yellow-500" : "bg-gray-200"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${p.isFeatured ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={() => updateFlags.mutate({ id: p.id, updates: { isRecommended: !p.isRecommended } })}
                    className={`w-10 h-6 rounded-full transition-colors relative ${p.isRecommended ? "bg-blue-500" : "bg-gray-200"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${p.isRecommended ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </td>
                <td className="py-3 px-4 text-center">
                  <select
                    value={p.badge ?? ""}
                    onChange={e => updateFlags.mutate({ id: p.id, updates: { badge: e.target.value || null } })}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[130px]"
                  >
                    {BADGE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {p.badge && (
                    <div className="mt-1">
                      <Badge variant="secondary" className="text-[10px]">{p.badge}</Badge>
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  <input
                    type="number"
                    min={0}
                    max={999}
                    defaultValue={p.recommendPriority ?? 0}
                    className="w-16 text-center text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onBlur={e => {
                      const val = Number(e.target.value);
                      if (val !== (p.recommendPriority ?? 0)) {
                        updateFlags.mutate({ id: p.id, updates: { recommendPriority: val } });
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Showing {((page - 1) * (data?.limit ?? 30)) + 1}–{Math.min(page * (data?.limit ?? 30), data?.total ?? 0)} of {data?.total ?? 0} products
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium px-3 py-1.5 border border-gray-200 rounded-lg">
              {page} / {totalPages}
            </span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Help text */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-semibold mb-1">How this works:</p>
        <ul className="space-y-1 text-blue-600 list-disc list-inside">
          <li><strong>Featured</strong> — product gets a highlight in the chat widget storefront</li>
          <li><strong>Recommended</strong> — included when AI suggests products to undecided customers</li>
          <li><strong>Badge</strong> — shown on product cards in chat (Best Seller, Popular, etc.)</li>
          <li><strong>Priority</strong> — higher number = shown first in recommendations (0 = default)</li>
        </ul>
      </div>
    </div>
  );
}
