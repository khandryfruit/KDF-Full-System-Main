import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Database, RefreshCw, Search, Package, CheckCircle2, AlertCircle,
  Loader2, Zap, Globe2,
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

type KnowledgeStats = { activeProducts: number; aliasRows: number };
type ProductRow = {
  shopifyProductId: string;
  name: string;
  tags?: string | null;
  inStock: boolean;
  priceFrom: number;
  variantCount: number;
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
  const [testQuery, setTestQuery] = useState("1kg badam");
  const [listQuery, setListQuery] = useState("");
  const [testResult, setTestResult] = useState<{
    count: number;
    products: Array<{
      name: string;
      shopifyProductId: string;
      priceFrom: number;
      inStock: boolean;
      variants: Array<{ title: string; price: number; stock: number }>;
    }>;
  } | null>(null);

  const { data: knowledge, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/whatsapp/product-knowledge"],
    queryFn: () => apiFetch("/api/admin/whatsapp/product-knowledge"),
    refetchInterval: 60000,
  });

  const { data: productList, isFetching: listLoading } = useQuery({
    queryKey: ["/api/admin/whatsapp/product-knowledge/products", listQuery],
    queryFn: () =>
      apiFetch(
        `/api/admin/whatsapp/product-knowledge/products?q=${encodeURIComponent(listQuery)}&limit=15&page=1`,
      ),
  });

  const rebuildMut = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/product-knowledge/rebuild", { method: "POST" }),
    onSuccess: (d: { indexed?: number; aliases?: number }) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/product-knowledge"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/product-knowledge/products"] });
      toast({
        title: "Product Knowledge index rebuilt",
        description: `${d.indexed ?? 0} products · ${d.aliases ?? 0} search aliases`,
      });
    },
    onError: (e: Error) => toast({ title: "Rebuild failed", description: e.message, variant: "destructive" }),
  });

  const testMut = useMutation({
    mutationFn: (query: string) =>
      apiFetch("/api/admin/whatsapp/product-knowledge/test-search", {
        method: "POST",
        body: JSON.stringify({ query, limit: 4 }),
      }),
    onSuccess: (d) => setTestResult(d),
    onError: (e: Error) => toast({ title: "Test search failed", description: e.message, variant: "destructive" }),
  });

  const stats = (knowledge?.stats ?? {}) as KnowledgeStats;
  const sync = knowledge?.sync as { enabled?: boolean; status?: string; intervalMinutes?: number } | undefined;
  const store = knowledge?.store as { lastProductSync?: string; shopDomain?: string } | undefined;
  const aliasSample = (knowledge?.aliasSample ?? []) as Array<{ alias: string }>;

  return (
    <div className="bg-card border-2 border-emerald-200 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50">        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-600 text-white">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-base flex items-center gap-2">
              Shopify Product Knowledge
              <Badge variant="outline" className="text-[10px] font-normal border-emerald-300 text-emerald-800 bg-white">AI Chatbot Database</Badge>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Synced catalog — badam / بادام / almond / 1kg</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="border-emerald-300" disabled={rebuildMut.isPending} onClick={() => rebuildMut.mutate()}>
          {rebuildMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Rebuild Index
        </Button>
      </div>
      <div className="px-5 py-5 space-y-5">
        {!enabled && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>Enable <strong>AI Auto-Reply Chatbot</strong> above.</p>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Active Products", value: stats.activeProducts ?? "—", color: "text-emerald-700", bg: "bg-emerald-50", small: false },
            { label: "Search Aliases", value: stats.aliasRows ?? "—", color: "text-teal-700", bg: "bg-teal-50", small: false },
            { label: "Last Shopify Sync", value: formatWhen(store?.lastProductSync), color: "text-blue-700", bg: "bg-blue-50", small: true },
            { label: "Auto-Sync", value: sync?.enabled ? "On" : "Off", color: sync?.enabled ? "text-green-700" : "text-muted-foreground", bg: sync?.enabled ? "bg-green-50" : "bg-muted", small: false },
          ].map((s) => (
            <div key={s.label} className={`rounded-lg border border-border p-3 ${s.bg}`}>
              <p className={`font-bold ${s.small ? "text-sm" : "text-xl"} ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="bg-slate-50 border rounded-lg px-4 py-3 text-xs space-y-1">
          <p className="font-semibold flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Auto-sync: webhooks + every {sync?.intervalMinutes ?? 15} min</p>
          <p>Names, Urdu/Roman/English aliases, variants, prices, stock, SKU, tags (no images)</p>
        </div>
        <div className="border rounded-xl p-4 space-y-3">
          <Label className="text-sm font-semibold flex items-center gap-2"><Search className="w-4 h-4" /> Test search</Label>
          <div className="flex gap-2">
            <Input value={testQuery} onChange={(e) => setTestQuery(e.target.value)} className="text-sm" />
            <Button type="button" onClick={() => testMut.mutate(testQuery.trim())} disabled={testMut.isPending}>Test</Button>
          </div>
          {testResult?.products?.map((p, i) => (
            <div key={i} className="rounded-lg border p-3 text-xs">
              <p className="font-semibold">{p.name}</p>
              <p>From {formatRs(p.priceFrom)}</p>
              {p.variants?.map((v, vi) => <p key={vi}>{vi + 1}. {v.title} — {formatRs(v.price)}</p>)}
            </div>
          ))}
        </div>
        <div className="border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
          {listLoading ? <p className="p-4 text-xs">Loading…</p> : (
            <table className="w-full text-xs">
              <thead className="bg-muted/80"><tr><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2">Var</th><th className="px-3 py-2">From</th></tr></thead>
              <tbody>
                {((productList?.products ?? []) as ProductRow[]).map((p) => (
                  <tr key={p.shopifyProductId} className="border-t"><td className="px-3 py-2">{p.name}</td><td className="px-3 py-2">{p.variantCount}</td><td className="px-3 py-2">{formatRs(p.priceFrom)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
