import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Gavel, Plus, Trash2, Clock, TrendingUp, Users, Trophy,
  ChevronDown, ChevronUp, Play, Square, Edit2, RefreshCw,
  AlertTriangle, CheckCircle2, XCircle, Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });
async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

function useCountdown(endTime?: string | null) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!endTime) return null;
  const diff = new Date(endTime).getTime() - now;
  if (diff <= 0) return "Ended";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  ended: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
};

function AuctionCard({ item, onEdit, onEnd, onDelete, onRefresh }: {
  item: any; onEdit: () => void; onEnd: () => void; onDelete: () => void; onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const countdown = useCountdown(item.config?.endTime);
  const cfg = item.config;

  const { data: detail } = useQuery({
    queryKey: ["admin-bids-detail", cfg?.productId],
    queryFn: () => apiFetch(`/api/admin/bids/${cfg?.productId}`),
    enabled: expanded,
  });

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="p-5 flex items-start gap-4">
        {item.productImage?.[0] && (
          <img src={item.productImage[0]} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-border" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm truncate">{item.productName ?? "Unknown Product"}</h3>
            <Badge className={`text-[10px] ${STATUS_COLOR[cfg?.status ?? "draft"]}`}>{cfg?.status ?? "draft"}</Badge>
            {cfg?.status === "active" && countdown && (
              <span className="flex items-center gap-1 text-[10px] text-orange-600 font-semibold bg-orange-50 px-2 py-0.5 rounded-full">
                <Timer className="w-3 h-3" /> {countdown}
              </span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Starting</p>
              <p className="text-sm font-bold">Rs. {parseFloat(cfg?.startingPrice ?? "0").toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Current Bid</p>
              <p className="text-sm font-bold text-green-600">Rs. {parseFloat(cfg?.currentBid ?? "0").toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Total Bids</p>
              <p className="text-sm font-bold">{cfg?.totalBids ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          <Button size="sm" variant="outline" onClick={onEdit} className="h-7 px-2 text-xs gap-1">
            <Edit2 className="w-3 h-3" /> Edit
          </Button>
          {cfg?.status === "active" && (
            <Button size="sm" variant="outline" onClick={onEnd} className="h-7 px-2 text-xs gap-1 text-orange-600 border-orange-200 hover:bg-orange-50">
              <Square className="w-3 h-3" /> End
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete} className="h-7 px-2 text-xs text-red-500 hover:bg-red-50">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-center gap-1 py-2 border-t border-border text-xs text-muted-foreground hover:bg-accent/30 transition-colors"
      >
        {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Hide Bids</> : <><ChevronDown className="w-3.5 h-3.5" /> Show Bid History</>}
      </button>

      {expanded && (
        <div className="border-t border-border p-4">
          {!detail ? (
            <div className="text-center py-4"><RefreshCw className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>
          ) : detail.bids?.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-3">No bids yet</p>
          ) : (
            <div className="space-y-2">
              {detail.bids.map((bid: any, i: number) => (
                <div key={bid.id} className={`flex items-center gap-3 p-2 rounded-lg ${bid.status === "won" ? "bg-yellow-50 border border-yellow-200" : bid.status === "active" ? "bg-green-50 border border-green-200" : "bg-muted/40"}`}>
                  {i === 0 && bid.status === "won" && <Trophy className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{bid.bidderName}</p>
                    <p className="text-[10px] text-muted-foreground">{bid.bidderPhone}</p>
                  </div>
                  <p className="text-sm font-bold text-green-700">Rs. {parseFloat(bid.amount).toLocaleString()}</p>
                  <Badge className={`text-[10px] ${bid.status === "won" ? "bg-yellow-100 text-yellow-700" : bid.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{bid.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AuctionForm({ products, initial, onSave, onCancel }: {
  products: any[]; initial?: any; onSave: (data: any) => void; onCancel: () => void;
}) {
  const toLocalDT = (ts?: string | null) => ts ? new Date(new Date(ts).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

  const [form, setForm] = useState({
    productId: initial?.config?.productId?.toString() ?? "",
    isActive: initial?.config?.isActive ?? false,
    status: initial?.config?.status ?? "draft",
    startingPrice: initial?.config?.startingPrice ?? "500",
    minIncrement: initial?.config?.minIncrement ?? "50",
    reservePrice: initial?.config?.reservePrice ?? "",
    buyNowPrice: initial?.config?.buyNowPrice ?? "",
    startTime: toLocalDT(initial?.config?.startTime),
    endTime: toLocalDT(initial?.config?.endTime),
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <h3 className="font-semibold text-base">{initial ? "Edit Auction" : "Create New Auction"}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Product *</Label>
          <select
            value={form.productId}
            onChange={e => set("productId", e.target.value)}
            className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background"
          >
            <option value="">Select product...</option>
            {products.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <select
            value={form.status}
            onChange={e => set("status", e.target.value)}
            className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Starting Price (Rs.)</Label>
          <Input type="number" value={form.startingPrice} onChange={e => set("startingPrice", e.target.value)} className="h-9 text-sm" placeholder="500" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Min Bid Increment (Rs.)</Label>
          <Input type="number" value={form.minIncrement} onChange={e => set("minIncrement", e.target.value)} className="h-9 text-sm" placeholder="50" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Reserve Price (Rs.) — Optional</Label>
          <Input type="number" value={form.reservePrice} onChange={e => set("reservePrice", e.target.value)} className="h-9 text-sm" placeholder="Leave blank if none" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Buy Now Price (Rs.) — Optional</Label>
          <Input type="number" value={form.buyNowPrice} onChange={e => set("buyNowPrice", e.target.value)} className="h-9 text-sm" placeholder="Leave blank if none" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Start Time</Label>
          <Input type="datetime-local" value={form.startTime} onChange={e => set("startTime", e.target.value)} className="h-9 text-sm" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">End Time</Label>
          <Input type="datetime-local" value={form.endTime} onChange={e => set("endTime", e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} id="bid-active" />
        <Label htmlFor="bid-active" className="text-sm">Auction is active (show on storefront)</Label>
      </div>

      <div className="flex gap-3 pt-2">
        <Button onClick={() => onSave(form)} className="flex-1">Save Auction</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}

export default function BiddingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data: auctions = [], isLoading } = useQuery({
    queryKey: ["admin-bids"],
    queryFn: () => apiFetch("/api/admin/bids"),
    refetchInterval: 30000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["admin-products-simple"],
    queryFn: () => apiFetch("/api/products?limit=200"),
    select: (d: any) => d.items ?? d.products ?? (Array.isArray(d) ? d : []),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiFetch("/api/admin/bids", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-bids"] });
      setShowForm(false);
      setEditItem(null);
      toast({ title: "Auction saved!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const endMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/bids/${id}/end`, { method: "POST" }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["admin-bids"] });
      if (d.winner) {
        toast({ title: "Auction ended!", description: `Winner: ${d.winner.bidderName} — Rs. ${parseFloat(d.winner.amount).toLocaleString()}` });
      } else {
        toast({ title: "Auction ended", description: "No bids were placed." });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/bids/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-bids"] }); toast({ title: "Deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalActive = auctions.filter((a: any) => a.config?.status === "active").length;
  const totalBids = auctions.reduce((s: number, a: any) => s + (a.config?.totalBids ?? 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Gavel className="w-6 h-6 text-primary" /> Bidding &amp; Auctions</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage product auctions and live bidding</p>
        </div>
        <Button onClick={() => { setEditItem(null); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Auction
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Play, label: "Active Auctions", value: totalActive, color: "text-green-600" },
          { icon: Gavel, label: "Total Auctions", value: auctions.length, color: "text-primary" },
          { icon: TrendingUp, label: "Total Bids", value: totalBids, color: "text-blue-600" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
            <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Form */}
      {(showForm || editItem) && (
        <AuctionForm
          products={Array.isArray(products) ? products : []}
          initial={editItem}
          onSave={(data) => saveMutation.mutate(data)}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {/* Auctions List */}
      {isLoading ? (
        <div className="text-center py-12"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : auctions.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-2xl">
          <Gavel className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-semibold text-muted-foreground">No auctions yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Create your first auction to start bidding</p>
        </div>
      ) : (
        <div className="space-y-4">
          {auctions.map((item: any) => (
            <AuctionCard
              key={item.config?.id}
              item={item}
              onEdit={() => { setEditItem(item); setShowForm(false); }}
              onEnd={() => endMutation.mutate(item.config?.id)}
              onDelete={() => deleteMutation.mutate(item.config?.id)}
              onRefresh={() => qc.invalidateQueries({ queryKey: ["admin-bids"] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
