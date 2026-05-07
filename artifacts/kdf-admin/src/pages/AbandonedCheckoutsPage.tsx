import { useState } from "react";
import {
  useListAbandonedCheckouts,
  useRecoverAbandonedCheckout,
  useDeleteAbandonedCheckout,
  useGetAbandonedCheckout,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ShoppingCart,
  User,
  Phone,
  Clock,
  Trash2,
  CheckCircle2,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getProductImageSrc } from "@/lib/imageUrl";


type StatusFilter = "all" | "active" | "recovered" | "expired";

const STEP_LABELS: Record<string, string> = {
  cart: "Added to Cart",
  checkout: "Checkout Started",
  address: "Address Filled",
  payment: "Payment Step",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  active: { label: "Active", variant: "default", className: "bg-orange-100 text-orange-700 border-orange-200" },
  recovered: { label: "Recovered", variant: "default", className: "bg-green-100 text-green-700 border-green-200" },
  expired: { label: "Expired", variant: "default", className: "bg-gray-100 text-gray-500 border-gray-200" },
};

function timeAgo(date: string | Date): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatPrice(val: string | number): string {
  return `Rs. ${parseFloat(String(val)).toLocaleString("en-PK", { minimumFractionDigits: 0 })}`;
}

export default function AbandonedCheckoutsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useListAbandonedCheckouts({
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    limit: 20,
  });

  const recoverMutation = useRecoverAbandonedCheckout();
  const deleteMutation = useDeleteAbandonedCheckout();

  const { data: detailCheckout } = useGetAbandonedCheckout(detailId ?? 0);

  const checkouts = data?.checkouts ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const handleRecover = (id: number) => {
    recoverMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Marked as Recovered", description: "This checkout has been marked as recovered." });
          queryClient.invalidateQueries({ queryKey: ["/abandoned-checkouts"] });
        },
        onError: () => toast({ title: "Failed", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Deleted", description: "Abandoned checkout removed." });
          setDeleteId(null);
          queryClient.invalidateQueries({ queryKey: ["/abandoned-checkouts"] });
        },
        onError: () => toast({ title: "Failed", variant: "destructive" }),
      }
    );
  };

  const activeCount = checkouts.filter((c) => c.status === "active").length;
  const recoveredCount = checkouts.filter((c) => c.status === "recovered").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Abandoned Checkouts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track and recover customers who started but did not complete checkout.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total" value={total} icon={<ShoppingCart className="w-5 h-5 text-muted-foreground" />} />
        <StatCard label="Active" value={data ? (data.checkouts.filter(c => c.status === "active").length) : 0} icon={<Clock className="w-5 h-5 text-orange-500" />} className="border-orange-200" />
        <StatCard label="Recovered" value={data ? (data.checkouts.filter(c => c.status === "recovered").length) : 0} icon={<CheckCircle2 className="w-5 h-5 text-green-500" />} className="border-green-200" />
        <StatCard
          label="Total Cart Value"
          value={
            data
              ? `Rs. ${data.checkouts
                  .reduce((sum, c) => sum + parseFloat(c.subtotal ?? "0"), 0)
                  .toLocaleString("en-PK", { maximumFractionDigits: 0 })}`
              : "—"
          }
          icon={<Package className="w-5 h-5 text-primary" />}
          className="border-primary/20"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v as StatusFilter); setPage(1); }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="recovered">Recovered</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {total} record{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Products</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Total</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Step</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Activity</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-muted rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : checkouts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ShoppingCart className="w-10 h-10 opacity-30" />
                      <p className="font-medium">No abandoned checkouts found</p>
                      <p className="text-xs">
                        {statusFilter !== "all"
                          ? "Try changing the filter above."
                          : "Abandoned checkouts will appear here when customers leave without completing an order."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                checkouts.map((checkout) => {
                  const items = (checkout.cartItems as any[]) ?? [];
                  const statusCfg = STATUS_CONFIG[checkout.status] ?? STATUS_CONFIG.active;
                  return (
                    <tr
                      key={checkout.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium leading-tight">
                              {checkout.customerName ?? "Guest"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              #{checkout.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          {checkout.phone && (
                            <span className="flex items-center gap-1 text-xs">
                              <Phone className="w-3 h-3 text-muted-foreground" />
                              {checkout.phone}
                            </span>
                          )}
                          {!checkout.phone && !checkout.email && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {checkout.email && (
                            <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                              {checkout.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {items.slice(0, 3).map((item: any, i: number) => (
                            <div
                              key={i}
                              className="w-8 h-8 rounded-md border border-border bg-muted overflow-hidden shrink-0"
                            >
                              {item.image ? (
                                <img
                                  src={getProductImageSrc(item.image)}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package className="w-3 h-3 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                          ))}
                          {items.length > 3 && (
                            <span className="text-xs text-muted-foreground ml-1">
                              +{items.length - 3}
                            </span>
                          )}
                          {items.length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {items.length} item{items.length !== 1 ? "s" : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-sm">
                        {formatPrice(checkout.subtotal ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-muted px-2 py-1 rounded-full font-medium">
                          {STEP_LABELS[checkout.checkoutStep] ?? checkout.checkoutStep}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {timeAgo(checkout.lastActivity)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${statusCfg.className}`}
                        >
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="View Details"
                            onClick={() => setDetailId(checkout.id)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {checkout.status === "active" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-green-600 hover:text-green-700"
                              title="Mark as Recovered"
                              onClick={() => handleRecover(checkout.id)}
                              disabled={recoverMutation.isPending}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Delete"
                            onClick={() => setDeleteId(checkout.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailId !== null} onOpenChange={(v) => !v && setDetailId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Abandoned Checkout #{detailId}</DialogTitle>
          </DialogHeader>
          {detailCheckout && <CheckoutDetail checkout={detailCheckout} onRecover={handleRecover} recoverPending={recoverMutation.isPending} />}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete abandoned checkout?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId !== null && handleDelete(deleteId)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  className = "",
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 flex items-center gap-3 ${className}`}>
      <div className="p-2 rounded-lg bg-muted">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold leading-tight">{value}</p>
      </div>
    </div>
  );
}

function CheckoutDetail({
  checkout,
  onRecover,
  recoverPending,
}: {
  checkout: any;
  onRecover: (id: number) => void;
  recoverPending: boolean;
}) {
  const items = (checkout.cartItems as any[]) ?? [];
  const statusCfg = STATUS_CONFIG[checkout.status] ?? STATUS_CONFIG.active;
  const subtotal = parseFloat(checkout.subtotal ?? "0");

  return (
    <div className="space-y-5 pt-1">
      {/* Status + Step */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${statusCfg.className}`}>
          {statusCfg.label}
        </span>
        <span className="text-xs bg-muted px-2.5 py-1 rounded-full font-medium">
          {STEP_LABELS[checkout.checkoutStep] ?? checkout.checkoutStep}
        </span>
      </div>

      {/* Customer Info */}
      <div className="rounded-lg border border-border p-4 space-y-2.5">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" /> Customer Info
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Name</p>
            <p className="font-medium">{checkout.customerName ?? "Guest"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Phone</p>
            <p className="font-medium">{checkout.phone ?? "—"}</p>
          </div>
          {checkout.email && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{checkout.email}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Session ID</p>
            <p className="font-mono text-xs text-muted-foreground truncate">{checkout.sessionId}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last Activity</p>
            <p className="font-medium">{timeAgo(checkout.lastActivity)}</p>
          </div>
        </div>
      </div>

      {/* Cart Items */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-muted-foreground" /> Cart Items ({items.length})
        </h3>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No items in cart</p>
        ) : (
          <div className="space-y-2">
            {items.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md border border-border bg-muted overflow-hidden shrink-0">
                  {item.image ? (
                    <img
                      src={getProductImageSrc(item.image)}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  {item.variantLabel && (
                    <p className="text-xs text-muted-foreground">{item.variantLabel}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">
                    Rs. {(parseFloat(item.price) * item.qty).toLocaleString("en-PK", { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.qty} × Rs. {parseFloat(item.price).toLocaleString("en-PK", { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Total */}
        <div className="border-t border-border pt-3 flex items-center justify-between">
          <span className="text-sm font-medium">Cart Total</span>
          <span className="text-base font-bold">{formatPrice(subtotal)}</span>
        </div>
      </div>

      {/* Timestamps */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Created: {new Date(checkout.createdAt).toLocaleString()}</p>
        <p>Last Activity: {new Date(checkout.lastActivity).toLocaleString()}</p>
        {checkout.recoveredAt && (
          <p>Recovered: {new Date(checkout.recoveredAt).toLocaleString()}</p>
        )}
      </div>

      {/* Actions */}
      {checkout.status === "active" && (
        <Button
          className="w-full gap-2"
          onClick={() => onRecover(checkout.id)}
          disabled={recoverPending}
        >
          <CheckCircle2 className="w-4 h-4" />
          Mark as Recovered
        </Button>
      )}
    </div>
  );
}
