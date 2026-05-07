import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, Package, Users, Trash2, Send, RefreshCw,
  Mail, Phone, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });
async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

function ProductGroup({ summary, requests, onNotify, onDelete }: {
  summary: any; requests: any[]; onNotify: () => void; onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pending = requests.filter(r => !r.request.notifiedAt);
  const notified = requests.filter(r => r.request.notifiedAt);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
          <Package className="w-5 h-5 text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{summary.productName ?? `Product #${summary.productId}`}</h3>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> {summary.count} subscribers
            </span>
            <Badge className="text-[10px] bg-orange-100 text-orange-700">{summary.pendingCount} pending</Badge>
          </div>
        </div>
        <Button
          size="sm"
          onClick={onNotify}
          disabled={summary.pendingCount === 0}
          className="gap-1 text-xs h-8 bg-green-600 hover:bg-green-700 text-white flex-shrink-0"
        >
          <Send className="w-3 h-3" /> Notify All
        </Button>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border">
          {requests.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">No requests</p>
          ) : (
            <div className="divide-y divide-border">
              {requests.map((r: any) => (
                <div key={r.request.id} className="flex items-center gap-3 px-5 py-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.request.notifiedAt ? "bg-green-400" : "bg-orange-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{r.request.name || "Anonymous"}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {r.request.email && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Mail className="w-3 h-3" /> {r.request.email}
                        </span>
                      )}
                      {r.request.phone && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Phone className="w-3 h-3" /> {r.request.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  {r.request.notifiedAt ? (
                    <span className="text-[10px] text-green-600 flex items-center gap-1 flex-shrink-0">
                      <CheckCircle2 className="w-3 h-3" /> Notified
                    </span>
                  ) : (
                    <span className="text-[10px] text-orange-500 flex items-center gap-1 flex-shrink-0">
                      <AlertTriangle className="w-3 h-3" /> Pending
                    </span>
                  )}
                  <button
                    onClick={() => onDelete(r.request.id)}
                    className="text-muted-foreground hover:text-red-500 flex-shrink-0 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RestockPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-restock"],
    queryFn: () => apiFetch("/api/admin/restock"),
    refetchInterval: 60000,
  });

  const notifyMutation = useMutation({
    mutationFn: (productId: number) => apiFetch(`/api/admin/restock/${productId}/notify`, { method: "POST" }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["admin-restock"] });
      toast({ title: "Notifications sent!", description: `${d.notified} customers notified via WhatsApp` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/restock/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-restock"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const summary: any[] = data?.summary ?? [];
  const requests: any[] = data?.requests ?? [];

  const filteredSummary = summary.filter((s: any) =>
    !search || s.productName?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPending = summary.reduce((acc: number, s: any) => acc + (s.pendingCount ?? 0), 0);
  const totalSubscribers = summary.reduce((acc: number, s: any) => acc + (s.count ?? 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="w-6 h-6 text-primary" /> Restock Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage out-of-stock waitlists and customer alerts</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Users, label: "Total Subscribers", value: totalSubscribers, color: "text-primary" },
          { icon: AlertTriangle, label: "Pending Alerts", value: totalPending, color: "text-orange-500" },
          { icon: Package, label: "Products Tracked", value: summary.length, color: "text-blue-600" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
            <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <Input
        placeholder="Search by product name..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm h-9 text-sm"
      />

      {/* Product Groups */}
      {isLoading ? (
        <div className="text-center py-12"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : filteredSummary.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-2xl">
          <Bell className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-semibold text-muted-foreground">No restock requests yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Customers can request alerts from out-of-stock product pages</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSummary.map((s: any) => (
            <ProductGroup
              key={s.productId}
              summary={s}
              requests={requests.filter((r: any) => r.request.productId === s.productId)}
              onNotify={() => notifyMutation.mutate(s.productId)}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
