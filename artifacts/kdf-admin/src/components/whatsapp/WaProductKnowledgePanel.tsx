import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Database, RefreshCw, Search, Package, CheckCircle2, AlertCircle,
  Loader2, Zap, Globe2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_TOKEN()}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

type CatalogProduct = {
  shopifyProductId: string;
  name: string;
  tags?: string | null;
  category?: string | null;
  inStock: boolean;
  priceFrom: number;
  variantCount: number;
  variants?: Array<{ title: string; price: number; stock: number }>;
};

function formatRs(n: number) {
  return `Rs. ${Math.round(n).toLocaleString("en-PK")}`;
}

function formatWhen(d: string | Date | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export function WaProductKnowledgePanel({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [browsePage, setBrowsePage] = useState(1);
  const [testResult, setTestResult] = useState<{
    count: number;
    totalMatches: number;
    whatsappReplyPreview?: string;
    products: CatalogProduct[];
  } | null>(null);

  const { data: knowledge, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/whatsapp/product-knowledge"],
    queryFn: () => apiFetch("/api/admin/whatsapp/product-knowledge"),
    refetchInterval: 60000,
  });

  const listUrl = searchQuery.trim()
    ? `/api/admin/whatsapp/product-knowledge/products?q=${encodeURIComponent(searchQuery)}&limit=30&page=1`
    : `/api/admin/whatsapp/product-knowledge/products?limit=25&page=${browsePage}`;

  const { data: productList, isFetching: listLoading } = useQuery({
    queryKey: [listUrl],
    queryFn: () => apiFetch(listUrl),
  });

  const rebuildMut = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/product-knowledge/rebuild", { method: "POST" }),
    onSuccess: (d: { indexed?: number; aliases?: number; stats?: { indexedProducts?: number } }) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/product-knowledge"] });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").includes("product-knowledge/products") });
      toast({
        title: "Full catalog index rebuilt",
        description: `${d.indexed ?? 0} products · ${d.aliases ?? 0} aliases · ${d.stats?.indexedProducts ?? "?"} indexed`,
      });
    },
    onError: (e: Error) => toast({ title: "Rebuild failed", description: e.message, variant: "destructive" }),
  });

  const testMut = useMutation({
    mutationFn: (query: string) =>
      apiFetch("/api/admin/whatsapp/product-knowledge/test-search", {
        method: "POST",
        body: JSON.stringify({ query, limit: 12 }),
      }),
    onSuccess: (d) => setTestResult(d),
    onError: (e: Error) => toast({ title: "Test search failed", description: e.message, variant: "destructive" }),
  });

  const stats = knowledge?.stats as {
    activeProducts?: number;
    aliasRows?: number;
    indexedProducts?: number;
    indexCoveragePct?: number;
    indexMismatch?: boolean;
    indexWarning?: string | null;
    indexHealthy?: boolean;
  } | undefined;
  const sync = knowledge?.sync as { enabled?: boolean; intervalMinutes?: number } | undefined;
  const store = knowledge?.store as { lastProductSync?: string; shopDomain?: string } | undefined;

  const totalProducts = productList?.total ?? stats?.activeProducts ?? 0;
  const showing = productList?.showing ?? productList?.products?.length ?? 0;
  const isSearchMode = Boolean(searchQuery.trim());

  return (
    <div className="bg-card border-2 border-emerald-200 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-600 text-white"><Database className="w-5 h-5" /></div>
          <div>
            <h2 className="font-semibold text-base flex items-center gap-2">Shopify Product Knowledge
              <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-800 bg-white">AI Chatbot Database</Badge>
            </h2>
            <p className="text-xs text-muted-foreground">All {stats?.activeProducts ?? 0} products searchable — WhatsApp + Website chat use this</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="border-emerald-300" disabled={rebuildMut.isPending} onClick={() => rebuildMut.mutate()}>
          {rebuildMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />} Rebuild Index
        </Button>
      </div>

      <div className="px-5 py-5 space-y-5">
        {!enabled && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 shrink-0" /> Enable AI Auto-Reply Chatbot above.
          </div>
        )}
        {stats?.indexMismatch && (
          <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-900">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <div><p className="font-semibold">Index mismatch</p><p>{stats.indexWarning}</p></div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Shopify Active", value: stats?.activeProducts ?? "—", bg: "bg-emerald-50", color: "text-emerald-700" },
            { label: "Indexed Products", value: stats?.indexedProducts ?? "—", bg: "bg-teal-50", color: "text-teal-700" },
            { label: "Search Aliases", value: stats?.aliasRows ?? "—", bg: "bg-blue-50", color: "text-blue-700" },
            { label: "Coverage", value: stats?.indexCoveragePct != null ? `${stats.indexCoveragePct}%` : "—", bg: "bg-purple-50", color: "text-purple-700" },
            { label: "Last Sync", value: formatWhen(store?.lastProductSync), bg: "bg-slate-50", color: "text-slate-700", small: true },
          ].map((s) => (
            <div key={s.label} className={`rounded-lg border p-3 ${s.bg}`}>
              <p className={`font-bold ${s.small ? "text-xs" : "text-lg"} ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-slate-50 border rounded-lg px-4 py-3 text-xs space-y-1">
          <p className="font-semibold flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Full catalog scan on every search (all products scored)</p>
          <p>Webhooks + sync every {sync?.intervalMinutes ?? 3} min · badam/بادام/cashew/kaju/akhrot aliases</p>
        </div>

        <div className="border rounded-xl p-4 space-y-3">
          <Label className="text-sm font-semibold flex items-center gap-2"><Search className="w-4 h-4" /> Search catalog (all {stats?.activeProducts ?? 0} products)</Label>
          <div className="flex gap-2">
            <Input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setBrowsePage(1); }} placeholder="badam, cashew, 1kg akhrot, بادام..." className="text-sm" />
            <Button type="button" variant="secondary" onClick={() => { setSearchQuery(""); setTestResult(null); }}>Clear</Button>
            <Button type="button" onClick={() => testMut.mutate(searchQuery.trim())} disabled={!searchQuery.trim() || testMut.isPending}>Test AI Reply</Button>
          </div>
          {isSearchMode && productList && (
            <p className="text-xs text-emerald-800 font-medium">Found {totalProducts} matching · showing {showing}</p>
          )}
          {testResult?.whatsappReplyPreview && (
            <pre className="text-xs bg-white border rounded-lg p-3 whitespace-pre-wrap font-sans">{testResult.whatsappReplyPreview}</pre>
          )}
        </div>

        <div className="border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <p className="text-sm font-semibold flex items-center gap-2"><Package className="w-4 h-4" /> {isSearchMode ? "Search results" : `Browse catalog (page ${browsePage})`}</p>
            <Button type="button" size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} /></Button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {listLoading ? <p className="p-4 text-xs">Loading…</p> : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/90 text-left">
                  <tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Var</th><th className="px-3 py-2">From</th><th className="px-3 py-2">Stock</th></tr>
                </thead>
                <tbody>
                  {((productList?.products ?? []) as CatalogProduct[]).map((p) => (
                    <tr key={p.shopifyProductId} className="border-t align-top hover:bg-muted/20">
                      <td className="px-3 py-2"><p className="font-medium">{p.name}</p>{p.category && <p className="text-[10px] text-muted-foreground">{p.category}</p>}</td>
                      <td className="px-3 py-2">{p.variantCount}</td>
                      <td className="px-3 py-2">{formatRs(p.priceFrom)}</td>
                      <td className="px-3 py-2">{p.inStock ? <span className="text-green-700">Yes</span> : <span className="text-red-600">No</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-t text-[10px] text-muted-foreground">
            <span>{store?.shopDomain && <span className="inline-flex items-center gap-1"><Globe2 className="w-3 h-3" />{store.shopDomain}</span>}</span>
            {!isSearchMode && (
              <span className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" disabled={browsePage <= 1} onClick={() => setBrowsePage((p) => p - 1)}>Prev</Button>
                <Button type="button" size="sm" variant="ghost" disabled={browsePage * 25 >= totalProducts} onClick={() => setBrowsePage((p) => p + 1)}>Next</Button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
