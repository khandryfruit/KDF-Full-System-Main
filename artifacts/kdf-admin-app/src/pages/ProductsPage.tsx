import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";
import {
  Package, Search, RefreshCw, Tag, Star, X, Wand2,
  Copy, CheckCircle, ChevronDown, Layers,
} from "lucide-react";

/* ── helpers ─────────────────────────────────────────── */
const STATUS_COLOR: Record<string, string> = {
  active:   "bg-green-500/15 text-green-400 border-green-500/25",
  draft:    "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  archived: "bg-muted text-muted-foreground border-border",
};

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/* ── AI generation result card ───────────────────────── */
function AiResultCard({ result }: { result: any }) {
  const [copied, setCopied] = useState(false);
  const text = result?.shortDescription ?? result?.description ?? "";
  const copy = () => {
    navigator.clipboard.writeText(stripHtml(text)).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
      {result?.shortDescription && (
        <p className="text-xs text-foreground font-medium leading-relaxed">{result.shortDescription}</p>
      )}
      {result?.description && (
        <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-4">
          {stripHtml(result.description)}
        </p>
      )}
      <button onClick={copy}
        className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg transition ${
          copied ? "text-green-400 bg-green-500/10" : "text-primary bg-primary/10"
        }`}>
        {copied ? <><CheckCircle className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
      </button>
    </div>
  );
}

/* ── product detail drawer ───────────────────────────── */
function ProductDrawer({ product: p, token, onClose }: { product: any; token: string | null; onClose: () => void }) {
  const [aiResult, setAiResult] = useState<any>(null);
  const [featuredLocal, setFeaturedLocal] = useState<boolean>(p.isFeatured ?? false);

  const h = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

  const aiMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/ai/generate", {
        method: "POST", headers: h(),
        body: JSON.stringify({
          type: "product-description",
          name: p.title,
          category: p.productType ?? "Dry Fruits & Nuts",
          keywords: (p.tags ?? "nuts, dry fruits, KDF NUTS").split(",").slice(0, 4).join(", "),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "AI failed");
      return d;
    },
    onSuccess: (d) => setAiResult(d),
  });

  const flagMutation = useMutation({
    mutationFn: async (featured: boolean) => {
      const r = await fetch(`/api/admin/shopify/products/${p.id}/flags`, {
        method: "PUT", headers: h(),
        body: JSON.stringify({ isFeatured: featured }),
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: (_, featured) => setFeaturedLocal(featured),
  });

  const price   = Number(p.price ?? 0);
  const compare = Number(p.compareAtPrice ?? 0);
  const discount = compare > price && compare > 0 ? Math.round(((compare - price) / compare) * 100) : 0;
  const tags = p.tags ? p.tags.split(",").filter(Boolean) : [];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
      <div className="bg-card border border-border rounded-t-3xl w-full max-h-[88vh] flex flex-col shadow-2xl">

        {/* header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center">
              <Package className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="font-bold text-sm">Product Detail</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">

          {/* image + basics */}
          <div className="flex gap-3">
            <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border">
              {p.imageUrl
                ? <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" />
                : <Package className="w-8 h-8 text-muted-foreground/40" />
              }
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm font-bold leading-snug">{p.title}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold text-primary">Rs {price.toLocaleString()}</span>
                {discount > 0 && (
                  <>
                    <span className="text-xs line-through text-muted-foreground">Rs {compare.toLocaleString()}</span>
                    <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">-{discount}%</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[p.status ?? "draft"]}`}>
                  {p.status ?? "draft"}
                </span>
                {p.vendor && <span className="text-[10px] text-muted-foreground">{p.vendor}</span>}
              </div>
            </div>
          </div>

          {/* stock + featured */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted rounded-xl p-3 text-center">
              <p className={`text-base font-bold ${(p.inventoryQuantity ?? 0) < 5 ? "text-red-400" : "text-foreground"}`}>
                {p.inventoryQuantity ?? "—"}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">In Stock</p>
            </div>
            <div className="bg-muted rounded-xl p-3 text-center">
              <p className="text-base font-bold text-foreground">{p.productType ?? "—"}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">Category</p>
            </div>
            <button
              onClick={() => flagMutation.mutate(!featuredLocal)}
              disabled={flagMutation.isPending}
              className={`rounded-xl p-3 text-center transition ${
                featuredLocal ? "bg-amber-500/15 border border-amber-500/25" : "bg-muted"
              }`}>
              <Star className={`w-5 h-5 mx-auto ${featuredLocal ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />
              <p className="text-[9px] text-muted-foreground mt-0.5">{featuredLocal ? "Featured" : "Feature"}</p>
            </button>
          </div>

          {/* tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t: string) => (
                <span key={t} className="flex items-center gap-0.5 text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  <Tag className="w-2.5 h-2.5" />{t.trim()}
                </span>
              ))}
            </div>
          )}

          {/* description */}
          {p.bodyHtml && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                {stripHtml(p.bodyHtml)}
              </p>
            </div>
          )}

          {/* AI section */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Wand2 className="w-3 h-3" /> AI Description Generator
            </p>
            {aiMutation.isError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2 text-xs text-red-400">
                {(aiMutation.error as any)?.message ?? "Generation failed. Check AI settings."}
              </div>
            )}
            {aiResult ? (
              <AiResultCard result={aiResult} />
            ) : (
              <button
                onClick={() => aiMutation.mutate()}
                disabled={aiMutation.isPending}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold disabled:opacity-50">
                {aiMutation.isPending
                  ? <><div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> Generating…</>
                  : <><Wand2 className="w-3.5 h-3.5" /> Generate with AI</>
                }
              </button>
            )}
            {aiResult && (
              <button onClick={() => { aiMutation.reset(); setAiResult(null); }}
                className="text-[10px] text-muted-foreground underline">
                Regenerate
              </button>
            )}
          </div>

          {/* variants summary */}
          {p.variants && Array.isArray(p.variants) && p.variants.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Layers className="w-3 h-3" /> Variants ({p.variants.length})
              </p>
              <div className="space-y-1">
                {p.variants.slice(0, 5).map((v: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-muted rounded-xl px-3 py-2">
                    <span className="text-muted-foreground">{v.title ?? v.option1 ?? `Variant ${i + 1}`}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Rs {Number(v.price ?? 0).toLocaleString()}</span>
                      {v.inventoryQuantity != null && (
                        <span className={`text-[10px] ${v.inventoryQuantity < 5 ? "text-red-400" : "text-muted-foreground"}`}>
                          ×{v.inventoryQuantity}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border shrink-0">
          <button onClick={onClose}
            className="w-full h-11 rounded-xl bg-muted text-foreground text-sm font-semibold">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── main page ───────────────────────────────────────── */
export default function ProductsPage() {
  const { token } = useAuth();
  const [search, setSearch]       = useState("");
  const [page, setPage]           = useState(1);
  const [filter, setFilter]       = useState<"all" | "active" | "draft">("all");
  const [detailProduct, setDetail] = useState<any | null>(null);

  const h = () => ({ Authorization: `Bearer ${token}` });

  const { data, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ["app-products", search, page, filter],
    queryFn: () =>
      fetch(
        `/api/admin/shopify/products?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ""}${filter !== "all" ? `&status=${filter}` : ""}`,
        { headers: h() }
      ).then(r => r.json()),
    placeholderData: (prev: any) => prev,
    staleTime: 30_000,
  });

  const products    = data?.products ?? [];
  const total       = data?.total    ?? 0;
  const totalPages  = total > 0 ? Math.ceil(total / 20) : 1;

  return (
    <AppShell title="Products">
      <div className="p-4 space-y-3">

        {/* header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Package className="w-5 h-5 text-cyan-400" /> Products
            </h2>
            <p className="text-xs text-muted-foreground">{total.toLocaleString()} products total</p>
          </div>
          <button onClick={() => refetch()} className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted">
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search products…"
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground" />
        </div>

        {/* filter */}
        <div className="flex gap-2">
          {(["all", "active", "draft"] as const).map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition capitalize ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
              {f}
            </button>
          ))}
        </div>

        {/* hint */}
        <p className="text-[10px] text-muted-foreground">
          Tap any product to view details, generate AI description, or toggle featured
        </p>

        {/* list */}
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
              const price    = Number(p.price ?? 0);
              const compare  = Number(p.compareAtPrice ?? 0);
              const discount = compare > price && compare > 0 ? Math.round(((compare - price) / compare) * 100) : 0;
              const stock    = p.inventoryQuantity ?? "—";
              const tags     = p.tags ? p.tags.split(",").slice(0, 2) : [];
              return (
                <button key={p.id} onClick={() => setDetail(p)}
                  className="w-full bg-card border border-border rounded-2xl p-3.5 flex gap-3 text-left active:scale-[0.98] transition-transform">
                  {/* thumbnail */}
                  <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" />
                      : <Package className="w-6 h-6 text-muted-foreground/40" />
                    }
                  </div>
                  {/* info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-snug line-clamp-2 flex-1">{p.title}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_COLOR[p.status ?? "draft"] ?? STATUS_COLOR.draft}`}>
                        {p.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-sm font-bold text-primary">Rs {price.toLocaleString()}</span>
                      {discount > 0 && (
                        <>
                          <span className="text-[10px] line-through text-muted-foreground">Rs {compare.toLocaleString()}</span>
                          <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">-{discount}%</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">
                        Stock: <strong className={`${typeof stock === "number" && stock < 5 ? "text-red-400" : "text-foreground"}`}>{stock}</strong>
                      </span>
                      {p.isFeatured && (
                        <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                          <Star className="w-2.5 h-2.5 fill-amber-400" />Featured
                        </span>
                      )}
                      {tags.map((t: string) => (
                        <span key={t} className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                          {t.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-2 -rotate-90" />
                </button>
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

      {/* detail drawer */}
      {detailProduct && (
        <ProductDrawer
          product={detailProduct}
          token={token}
          onClose={() => setDetail(null)}
        />
      )}
    </AppShell>
  );
}
