import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Download, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { adminApiUrl } from "@/lib/apiBase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const token = () => localStorage.getItem("kdf_admin_token") ?? "";

function authHeaders(json = true): HeadersInit {
  const h: Record<string, string> = { Authorization: `Bearer ${token()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

type VerificationRow = {
  id: number;
  delivery_id: number;
  rider_id: number;
  rider_name?: string;
  shopify_order_number?: string;
  customer_name?: string;
  created_at?: string;
  image_url?: string | null;
  thumbnail_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy_m?: number | null;
  payment_status_snapshot?: string | null;
  cod_collected_snapshot?: string | number | null;
  delivery_status?: string;
  admin_review_status?: string | null;
  admin_review_notes?: string | null;
};

export default function DeliveryProofsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [order, setOrder] = useState("");
  const [riderId, setRiderId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<VerificationRow | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewStatus, setReviewStatus] = useState("verified");

  const queryKey = useMemo(
    () => ["admin-delivery-proofs", order, riderId, from, to],
    [order, riderId, from, to],
  );

  const listQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const u = new URL(adminApiUrl("/admin/riders/verifications"));
      const od = order.replace(/[^0-9]/g, "").slice(0, 20);
      if (od) u.searchParams.set("order", od);
      const rid = riderId.trim();
      if (rid && /^\d+$/.test(rid)) u.searchParams.set("rider_id", rid);
      if (from) u.searchParams.set("from", from);
      if (to) u.searchParams.set("to", to);
      u.searchParams.set("limit", "200");
      const r = await fetch(u.toString(), { headers: authHeaders(false) });
      if (!r.ok) throw new Error("Failed to load proofs");
      return r.json() as Promise<{ verifications: VerificationRow[] }>;
    },
  });

  const reviewMut = useMutation({
    mutationFn: async (deliveryId: number) => {
      const r = await fetch(adminApiUrl(`/admin/riders/deliveries/${deliveryId}/verification`), {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          admin_review_status: reviewStatus,
          admin_review_notes: reviewNotes || null,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as any).error ?? "Update failed");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Review saved" });
      qc.invalidateQueries({ queryKey: ["admin-delivery-proofs"] });
      setPreview(null);
      setReviewNotes("");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const rows = listQuery.data?.verifications ?? [];

  const exportCsv = async () => {
    const u = new URL(adminApiUrl("/admin/riders/verifications/export.csv"));
    const od = order.replace(/[^0-9]/g, "").slice(0, 20);
    if (od) u.searchParams.set("order", od);
    const rid = riderId.trim();
    if (rid && /^\d+$/.test(rid)) u.searchParams.set("rider_id", rid);
    if (from) u.searchParams.set("from", from);
    if (to) u.searchParams.set("to", to);
    const r = await fetch(u.toString(), { headers: authHeaders(false) });
    if (!r.ok) {
      toast({ title: "Export failed", variant: "destructive" });
      return;
    }
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "delivery-proofs.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Camera className="h-7 w-7 text-emerald-600" />
            Delivery proofs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Verify rider photos, GPS, and COD context. Export supports dispute workflows.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => listQuery.refetch()} disabled={listQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${listQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportCsv()}>
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end bg-muted/40 p-4 rounded-lg border">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Order #</label>
          <Input
            placeholder="e.g. 1042"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="w-[140px]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Rider ID</label>
          <Input
            placeholder="Rider id"
            value={riderId}
            onChange={(e) => setRiderId(e.target.value)}
            className="w-[100px]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[200px]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="w-[200px]" />
        </div>
        <Button size="sm" onClick={() => qc.invalidateQueries({ queryKey })}>
          <Search className="h-4 w-4 mr-1" />
          Apply
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left">
              <th className="p-3 font-semibold">When</th>
              <th className="p-3 font-semibold">Order</th>
              <th className="p-3 font-semibold">Rider</th>
              <th className="p-3 font-semibold">Customer</th>
              <th className="p-3 font-semibold">GPS</th>
              <th className="p-3 font-semibold">Payment</th>
              <th className="p-3 font-semibold">Review</th>
              <th className="p-3 font-semibold">Proof</th>
            </tr>
          </thead>
          <tbody>
            {listQuery.isLoading ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  No proofs match filters.
                </td>
              </tr>
            ) : (
              rows.map((v) => (
                <tr key={v.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                    {v.created_at ? new Date(v.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-3 font-mono text-xs">{v.shopify_order_number ?? v.delivery_id}</td>
                  <td className="p-3">
                    <div className="font-medium">{v.rider_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">#{v.rider_id}</div>
                  </td>
                  <td className="p-3 max-w-[180px] truncate">{v.customer_name ?? "—"}</td>
                  <td className="p-3 text-xs font-mono">
                    {v.latitude != null && v.longitude != null ? (
                      <>
                        {Number(v.latitude).toFixed(5)}, {Number(v.longitude).toFixed(5)}
                        {v.location_accuracy_m != null ? (
                          <div className="text-muted-foreground">±{Math.round(Number(v.location_accuracy_m))}m</div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-amber-700">Legacy (no GPS)</span>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    <Badge variant="secondary">{v.payment_status_snapshot ?? "—"}</Badge>
                    {v.cod_collected_snapshot != null ? (
                      <div className="text-muted-foreground mt-1">COD {String(v.cod_collected_snapshot)}</div>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline">{v.admin_review_status ?? "pending"}</Badge>
                  </td>
                  <td className="p-3">
                    {(v.thumbnail_url || v.image_url) ? (
                      <button
                        type="button"
                        className="block rounded border overflow-hidden hover:ring-2 ring-emerald-500/40"
                        onClick={() => {
                          setPreview(v);
                          setReviewStatus((v.admin_review_status as string) || "verified");
                          setReviewNotes(v.admin_review_notes ?? "");
                        }}
                      >
                        <img
                          src={v.thumbnail_url || v.image_url || ""}
                          alt=""
                          className="h-14 w-14 object-cover"
                        />
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">No URL</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Proof — order {preview?.shopify_order_number ?? preview?.delivery_id}
            </DialogTitle>
          </DialogHeader>
          {preview?.image_url ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-black/5 p-2 flex justify-center overflow-auto max-h-[60vh]">
                <img
                  src={preview.image_url}
                  alt="Delivery proof"
                  className="max-w-full max-h-[55vh] object-contain cursor-zoom-in"
                  style={{ imageRendering: "auto" }}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Rider</div>
                  <div>{preview.rider_name} (#{preview.rider_id})</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Customer</div>
                  <div>{preview.customer_name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Coordinates</div>
                  <div className="font-mono text-xs">
                    {preview.latitude ?? "—"}, {preview.longitude ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Delivery status</div>
                  <div>{preview.delivery_status ?? "—"}</div>
                </div>
              </div>
              <div className="border-t pt-4 space-y-3">
                <div className="text-sm font-medium">Admin review</div>
                <Select value={reviewStatus} onValueChange={setReviewStatus}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="disputed">Disputed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Notes (visible for disputes / audits)"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                />
                <Button
                  disabled={!preview?.delivery_id || reviewMut.isPending}
                  onClick={() => preview && reviewMut.mutate(preview.delivery_id)}
                >
                  Save review
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No image URL on file for this proof (legacy base64-only).</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
