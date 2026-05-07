import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, RefreshCw, Trash2, ArrowUpCircle, Loader2,
  Package, ChevronDown, ChevronUp, X, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

const REASON_COLORS: Record<string, string> = {
  payment_failed:  "bg-red-50 text-red-700 border-red-200",
  user_exit:       "bg-yellow-50 text-yellow-700 border-yellow-200",
  api_error:       "bg-orange-50 text-orange-700 border-orange-200",
  unknown:         "bg-gray-100 text-gray-600 border-gray-200",
};

const REASON_LABELS: Record<string, string> = {
  payment_failed:  "Payment Failed",
  user_exit:       "User Abandoned",
  api_error:       "API Error",
  unknown:         "Unknown",
};

function fmt(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function FailedOrdersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [viewOrder, setViewOrder] = useState<any | null>(null);
  const [recovering, setRecovering] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/failed-orders"],
    queryFn: () => apiFetch("/api/admin/failed-orders"),
  });

  const orders: any[] = Array.isArray(data) ? data : [];

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/failed-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/failed-orders"] }); toast({ title: "Failed order removed" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const handleRecover = async (id: number) => {
    setRecovering(id);
    try {
      const r = await apiFetch(`/api/admin/failed-orders/${id}/recover`, { method: "POST" });
      qc.invalidateQueries({ queryKey: ["/api/admin/failed-orders"] });
      toast({ title: `Recovered as ${r.orderNumber}` });
      setViewOrder(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Recovery failed", description: e.message });
    } finally { setRecovering(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            Failed Orders
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Orders that failed during placement — review and recover them.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />Refresh
        </Button>
      </div>

      {orders.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Total Failed</p>
            <p className="text-2xl font-bold text-red-700 mt-1">{orders.length}</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">Payment Failed</p>
            <p className="text-2xl font-bold text-orange-700 mt-1">{orders.filter(o => o.reason === "payment_failed").length}</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wider">Abandoned</p>
            <p className="text-2xl font-bold text-yellow-700 mt-1">{orders.filter(o => o.reason === "user_exit").length}</p>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))}
            {!isLoading && orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="w-10 h-10 opacity-20 text-green-500" />
                    <p className="text-sm font-medium">No failed orders</p>
                    <p className="text-xs">All orders have been placed successfully.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!isLoading && orders.map(o => {
              const d = o.orderData ?? {};
              const items: any[] = Array.isArray(d.items) ? d.items : [];
              const total = items.reduce((s: number, i: any) => s + Number(i.price ?? 0) * Number(i.qty ?? 1), 0);
              const addr = d.shippingAddress;
              return (
                <TableRow key={o.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setViewOrder(o)}>
                  <TableCell className="font-mono text-sm font-semibold">#{o.id}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{addr?.name ?? "Guest"}</div>
                    <div className="text-xs text-muted-foreground">{addr?.phone ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {items.length} item{items.length !== 1 ? "s" : ""}
                  </TableCell>
                  <TableCell className="font-bold text-sm">
                    {total > 0 ? `Rs. ${total.toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[11px] ${REASON_COLORS[o.reason] ?? REASON_COLORS.unknown}`}>
                      {REASON_LABELS[o.reason] ?? o.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmt(o.createdAt)}</TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm" variant="outline"
                        disabled={recovering === o.id}
                        onClick={() => handleRecover(o.id)}
                        className="gap-1 text-green-700 border-green-300 hover:bg-green-50 text-xs"
                      >
                        {recovering === o.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <ArrowUpCircle className="w-3 h-3" />}
                        Recover
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(o.id)}
                        className="text-red-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Detail Modal */}
      <Dialog open={!!viewOrder} onOpenChange={o => { if (!o) setViewOrder(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {viewOrder && (() => {
            const d = viewOrder.orderData ?? {};
            const items: any[] = Array.isArray(d.items) ? d.items : [];
            const addr = d.shippingAddress;
            const total = items.reduce((s: number, i: any) => s + Number(i.price ?? 0) * Number(i.qty ?? 1), 0);
            const deliveryFee = d.deliveryType === "express" ? 499 : 199;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    Failed Order #{viewOrder.id}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={REASON_COLORS[viewOrder.reason] ?? REASON_COLORS.unknown}>
                      {REASON_LABELS[viewOrder.reason] ?? viewOrder.reason}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{fmt(viewOrder.createdAt)}</span>
                  </div>

                  {viewOrder.errorMessage && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
                      <p className="font-semibold text-xs mb-1 uppercase tracking-wider">Error</p>
                      {viewOrder.errorMessage}
                    </div>
                  )}

                  {addr && (
                    <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-0.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Customer</p>
                      <p className="font-semibold">{addr.name}</p>
                      <p className="text-muted-foreground">{addr.phone}</p>
                      <p className="text-muted-foreground">{addr.address}, {addr.city}</p>
                    </div>
                  )}

                  {items.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Items</p>
                      <div className="border rounded-lg divide-y">
                        {items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                            <div>
                              <p className="font-medium">{item.name}</p>
                              {item.variant && <p className="text-xs text-muted-foreground">{item.variant}</p>}
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">×{item.qty}</p>
                              <p className="font-bold">Rs. {(Number(item.price) * item.qty).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 px-3 py-2 bg-muted/40 rounded-lg text-sm space-y-1">
                        <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>Rs. {total.toLocaleString()}</span></div>
                        <div className="flex justify-between text-muted-foreground"><span>Delivery</span><span>Rs. {deliveryFee}</span></div>
                        <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Total</span><span className="text-green-700">Rs. {(total + deliveryFee).toLocaleString()}</span></div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {d.paymentMethod && <div className="bg-muted/40 rounded-lg px-3 py-2"><p className="text-muted-foreground mb-1">Payment</p><p className="font-medium uppercase">{d.paymentMethod}</p></div>}
                    {d.deliveryType && <div className="bg-muted/40 rounded-lg px-3 py-2"><p className="text-muted-foreground mb-1">Delivery</p><p className="font-medium capitalize">{d.deliveryType}</p></div>}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => { deleteMutation.mutate(viewOrder.id); setViewOrder(null); }}
                      disabled={deleteMutation.isPending}
                      className="flex-1 text-red-600 border-red-300 hover:bg-red-50 gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />Dismiss
                    </Button>
                    <Button
                      onClick={() => handleRecover(viewOrder.id)}
                      disabled={recovering === viewOrder.id}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1.5"
                    >
                      {recovering === viewOrder.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <ArrowUpCircle className="w-4 h-4" />}
                      Recover Order
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
