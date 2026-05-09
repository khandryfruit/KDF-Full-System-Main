import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  RefreshCw, Search, MessageCircle, Package, ChevronLeft, ChevronRight,
  X, Truck, CheckCircle, Clock, XCircle, AlertCircle, MapPin, Phone,
  User, DollarSign, Send, RotateCcw, Printer, Eye, Filter,
  ChevronDown, ArrowRight, Ban, Bell, Copy, ExternalLink, Boxes,
  Zap, Weight, Star, Info, ShieldCheck, UserCheck, Bike, FileText,
  Navigation, CalendarCheck, TriangleAlert, CircleCheck, Loader2,
  Settings, AlertTriangle, Code2, CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

/* ─── API helper ───────────────────────────────────────── */
function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

/* ─── Constants ────────────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  pending:          "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed:        "bg-blue-100 text-blue-800 border-blue-200",
  processing:       "bg-indigo-100 text-indigo-800 border-indigo-200",
  shipped:          "bg-purple-100 text-purple-800 border-purple-200",
  in_transit:       "bg-sky-100 text-sky-800 border-sky-200",
  out_for_delivery: "bg-orange-100 text-orange-800 border-orange-200",
  delivered:        "bg-green-100 text-green-800 border-green-200",
  failed:           "bg-red-100 text-red-800 border-red-200",
  returned:         "bg-rose-100 text-rose-800 border-rose-200",
  fulfilled:        "bg-green-100 text-green-800 border-green-200",
  cancelled:        "bg-gray-100 text-gray-600 border-gray-200",
  unfulfilled:      "bg-yellow-100 text-yellow-800 border-yellow-200",
  partial:          "bg-orange-100 text-orange-800 border-orange-200",
  paid:             "bg-green-100 text-green-800 border-green-200",
  unpaid:           "bg-red-100 text-red-800 border-red-200",
  refunded:         "bg-gray-100 text-gray-600 border-gray-200",
};

const SHIPMENT_STATUS_ICONS: Record<string, React.ReactNode> = {
  pending:          <Clock className="w-3.5 h-3.5" />,
  processing:       <Package className="w-3.5 h-3.5" />,
  shipped:          <Truck className="w-3.5 h-3.5" />,
  in_transit:       <ArrowRight className="w-3.5 h-3.5" />,
  out_for_delivery: <MapPin className="w-3.5 h-3.5" />,
  delivered:        <CheckCircle className="w-3.5 h-3.5" />,
  failed:           <XCircle className="w-3.5 h-3.5" />,
  returned:         <RotateCcw className="w-3.5 h-3.5" />,
};

const COURIER_LOGOS: Record<string, string> = {
  tcs:      "TCS",
  postex:   "PX",
  leopards: "LP",
  trax:     "TX",
};

const STATUS_OPTIONS = ["all", "unfulfilled", "pending", "partial", "fulfilled", "cancelled"];

/* ─── Sub-components ───────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium capitalize border ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function CourierBadge({ slug, name }: { slug: string; name?: string }) {
  const abbr = COURIER_LOGOS[slug] ?? slug?.slice(0, 2).toUpperCase() ?? "??";
  const colors: Record<string, string> = {
    tcs: "bg-red-100 text-red-700",
    postex: "bg-blue-100 text-blue-700",
    leopards: "bg-green-100 text-green-700",
    trax: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold ${colors[slug] ?? "bg-gray-100 text-gray-700"}`}>
      <Truck className="w-3 h-3" /> {name ?? abbr}
    </span>
  );
}

function ShipmentTimeline({ history }: { history: Array<{ status: string; timestamp: string; note?: string }> }) {
  if (!history?.length) return <p className="text-xs text-muted-foreground">No history yet</p>;
  return (
    <div className="space-y-2">
      {[...history].reverse().map((h, i) => (
        <div key={i} className="flex gap-3 text-xs">
          <div className="flex flex-col items-center">
            <div className={`w-2 h-2 rounded-full mt-1 ${i === 0 ? "bg-primary" : "bg-muted-foreground/40"}`} />
            {i < history.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
          </div>
          <div className="pb-2">
            <div className="flex items-center gap-2">
              <span className="font-medium capitalize">{h.status.replace(/_/g, " ")}</span>
              {h.note && <span className="text-muted-foreground">· {h.note}</span>}
            </div>
            <span className="text-muted-foreground">{new Date(h.timestamp).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Courier Booking Modal (Smart Version) ─────────────── */
function BookCourierModal({
  order,
  couriers,
  onClose,
  onBooked,
}: {
  order: any;
  couriers: any[];
  onClose: () => void;
  onBooked: () => void;
}) {
  const { toast } = useToast();
  const addr = order.shippingAddress ?? {};
  const isPaidOrder = ["paid", "partially_paid"].includes(order.financialStatus ?? "");

  const [form, setForm] = useState({
    courierSlug:         couriers.find(c => c.isActive)?.slug ?? "",
    customerName:        addr.name ?? order.customerName ?? "",
    customerPhone:       addr.phone ?? order.customerPhone ?? "",
    customerAddress:     addr.address1 ?? addr.address ?? "",
    customerCity:        addr.city ?? "",
    codAmount:           isPaidOrder ? "0" : String(parseFloat(order.totalPrice ?? "0")),
    weight:              "0.5",
    pieces:              String(Math.max(1, (order.lineItems ?? []).length)),
    contentDesc:         (order.lineItems ?? []).slice(0, 3).map((li: any) => li.title ?? "Product").join(", ") || "KDF Nuts Products",
    serviceCode:         "O",
    specialInstructions: "",
    notifyWhatsapp:      true,
    postexOrderType:     "Normal",
  });
  const [weightLoading, setWeightLoading] = useState(false);
  const [weightAutoSet, setWeightAutoSet] = useState(false);

  /* ── Auto-fetch weight + recommendations on mount ── */
  const { data: recData, isLoading: recLoading } = useQuery({
    queryKey: ["courier-rec", order.id],
    queryFn: () => api(`/admin/logistics/recommend/${order.id}`).then(r => r.json()),
    staleTime: 60_000,
  });

  /* Apply auto-weight when recData arrives */
  useEffect(() => {
    if (recData?.weight && !weightAutoSet) {
      setForm(f => ({ ...f, weight: String(recData.weight) }));
      setWeightAutoSet(true);
    }
  }, [recData, weightAutoSet]);

  /* Apply top recommendation if no manual selection */
  useEffect(() => {
    if (recData?.recommendations?.length && !form.courierSlug) {
      setForm(f => ({ ...f, courierSlug: recData.recommendations[0].slug }));
    }
  }, [recData]);

  const [apiError, setApiError] = useState<{ msg: string; notConfigured?: boolean } | null>(null);

  const bookMutation = useMutation({
    mutationFn: () => api(`/admin/shopify/orders/${order.id}/book-courier`, {
      method: "POST",
      body: JSON.stringify({
        ...form,
        weight: parseFloat(form.weight),
        pieces: parseInt(form.pieces),
        codAmount: parseFloat(form.codAmount),
      }),
    }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw Object.assign(new Error(d.error ?? "Booking failed"), { notConfigured: d.notConfigured, apiError: d.apiError });
      return d;
    }),
    onSuccess: (d) => {
      setApiError(null);
      toast({
        title: `✅ Courier Booked via Real API!`,
        description: `${d.courierName} · Tracking: ${d.trackingId}${d.durationMs ? ` · ${d.durationMs}ms` : ""}`,
      });
      onBooked();
      onClose();
    },
    onError: (e: any) => {
      setApiError({ msg: e.message ?? "Booking failed", notConfigured: !!(e as any).notConfigured });
    },
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const activeCouriers = couriers.filter(c => c.isActive);
  const recommendations: any[] = recData?.recommendations ?? [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Truck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold">Book Courier</h2>
              <p className="text-xs text-muted-foreground">Order {order.orderNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* ── Smart Auto-detected info bar ── */}
          <div className={`flex items-start gap-3 rounded-xl p-3.5 border ${isPaidOrder ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
            <ShieldCheck className={`w-4 h-4 mt-0.5 shrink-0 ${isPaidOrder ? "text-green-600" : "text-amber-600"}`} />
            <div className="text-xs">
              {isPaidOrder ? (
                <><span className="font-semibold text-green-800">Prepaid Order Detected</span>
                <span className="text-green-700"> — COD automatically set to PKR 0</span></>
              ) : (
                <><span className="font-semibold text-amber-800">Cash on Delivery</span>
                <span className="text-amber-700"> — COD: PKR {parseFloat(form.codAmount).toLocaleString()}</span></>
              )}
            </div>
          </div>

          {/* ── Smart Courier Recommendations ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-primary" /> AI Courier Recommendations
              </Label>
              {recLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>

            {recLoading ? (
              <div className="grid grid-cols-2 gap-2">
                {[1,2].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : activeCouriers.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                No active couriers. Please configure couriers first.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {activeCouriers.map(c => {
                  const rec = recommendations.find(r => r.slug === c.slug);
                  const isTop = rec && recommendations[0]?.slug === c.slug;
                  return (
                    <button
                      key={c.slug}
                      onClick={() => set("courierSlug", c.slug)}
                      className={`p-3 rounded-xl border-2 text-left transition-all relative ${form.courierSlug === c.slug ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                    >
                      {isTop && (
                        <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5" /> BEST
                        </div>
                      )}
                      <CourierBadge slug={c.slug} name={c.name} />
                      {rec && (
                        <div className="mt-1.5 space-y-0.5">
                          <div className={`text-[10px] font-semibold ${isTop ? "text-primary" : "text-muted-foreground"}`}>
                            {rec.badge} · Score: {rec.score}
                          </div>
                          {rec.reasons.slice(0, 1).map((r: string, i: number) => (
                            <div key={i} className="text-[10px] text-muted-foreground">{r}</div>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Weight & COD auto-detection summary */}
            {recData && (
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                <span className="flex items-center gap-1"><Weight className="w-3 h-3" /> Auto-weight: <strong className="text-foreground">{recData.weight} kg</strong></span>
                <span>·</span>
                <span>City: <strong className="text-foreground">{recData.city || "N/A"}</strong></span>
                <span>·</span>
                <span>COD: <strong className="text-foreground">{isPaidOrder ? "PKR 0" : `PKR ${parseInt(recData.codAmount ?? 0).toLocaleString()}`}</strong></span>
              </div>
            )}
          </div>

          {/* ── Customer Info ── */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide">Customer Info</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Name</Label>
                <Input value={form.customerName} onChange={e => set("customerName", e.target.value)} className="h-9 text-sm" placeholder="Customer name" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Phone</Label>
                <Input value={form.customerPhone} onChange={e => set("customerPhone", e.target.value)} className="h-9 text-sm" placeholder="03xx-xxxxxxx" />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Address</Label>
              <Input value={form.customerAddress} onChange={e => set("customerAddress", e.target.value)} className="h-9 text-sm" placeholder="Full shipping address" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">City</Label>
              <Input value={form.customerCity} onChange={e => set("customerCity", e.target.value)} className="h-9 text-sm" placeholder="Lahore / Karachi / etc." />
            </div>
          </div>

          {/* ── Shipment Details ── */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide">Shipment Details</Label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs mb-1 block flex items-center gap-1">
                  COD Amount (PKR)
                  {isPaidOrder && <span className="text-green-600 text-[9px] font-bold">AUTO</span>}
                </Label>
                <Input type="number" value={form.codAmount} onChange={e => set("codAmount", e.target.value)}
                  className={`h-9 text-sm ${isPaidOrder ? "bg-green-50 border-green-200" : ""}`} />
              </div>
              <div>
                <Label className="text-xs mb-1 block flex items-center gap-1">
                  Weight (kg)
                  {weightAutoSet && <span className="text-blue-600 text-[9px] font-bold">AUTO</span>}
                </Label>
                <Input type="number" step="0.1" value={form.weight} onChange={e => set("weight", e.target.value)}
                  className={`h-9 text-sm ${weightAutoSet ? "bg-blue-50 border-blue-200" : ""}`} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Pieces</Label>
                <Input type="number" value={form.pieces} onChange={e => set("pieces", e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Service</Label>
                <select value={form.serviceCode} onChange={e => set("serviceCode", e.target.value)}
                  className="w-full h-9 border border-border rounded-md px-2 text-sm bg-background">
                  <option value="O">O - Overnight</option>
                  <option value="E">E - Economy</option>
                  <option value="S">S - Same Day</option>
                  <option value="Normal">Normal</option>
                  <option value="Overnight">Overnight</option>
                </select>
              </div>
              {form.courierSlug === "postex" && (
                <div>
                  <Label className="text-xs mb-1 block">Order Type</Label>
                  <select value={form.postexOrderType} onChange={e => set("postexOrderType", e.target.value)}
                    className="w-full h-9 border border-border rounded-md px-2 text-sm bg-background">
                    <option value="Normal">Normal</option>
                    <option value="Reverse">Reverse</option>
                    <option value="Exchange">Exchange</option>
                  </select>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs mb-1 block">Content Description</Label>
              <Input value={form.contentDesc} onChange={e => set("contentDesc", e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Special Instructions</Label>
              <Input value={form.specialInstructions} onChange={e => set("specialInstructions", e.target.value)} className="h-9 text-sm" placeholder="e.g. Call before delivery" />
            </div>
          </div>

          {/* ── OnDrive WhatsApp Notification ── */}
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
            <input type="checkbox" id="notifyWa" checked={form.notifyWhatsapp} onChange={e => set("notifyWhatsapp", e.target.checked)} className="w-4 h-4 accent-green-600" />
            <label htmlFor="notifyWa" className="text-sm text-green-800 cursor-pointer flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" /> Send <strong>OnDrive</strong> WhatsApp notification to customer
            </label>
          </div>

          {/* ── API Error / Not Configured Banner ── */}
          {apiError && (
            <div className={`rounded-xl border p-4 space-y-2 ${apiError.notConfigured ? "bg-amber-50 border-amber-300" : "bg-red-50 border-red-300"}`}>
              <div className="flex items-start gap-2">
                <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${apiError.notConfigured ? "text-amber-600" : "text-red-600"}`} />
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${apiError.notConfigured ? "text-amber-800" : "text-red-700"}`}>
                    {apiError.notConfigured ? "Courier API Not Configured" : "Courier API Booking Failed"}
                  </p>
                  <p className={`text-xs mt-0.5 ${apiError.notConfigured ? "text-amber-700" : "text-red-600"}`}>{apiError.msg}</p>
                </div>
              </div>
              {apiError.notConfigured && (
                <a href="/couriers" className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900">
                  <Settings className="w-3.5 h-3.5" /> Go to Courier Settings → Integrations
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex gap-3">
          <Button className="flex-1" onClick={() => { setApiError(null); bookMutation.mutate(); }} disabled={bookMutation.isPending || !form.courierSlug || !form.customerPhone}>
            {bookMutation.isPending ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Calling Courier API...</>
            ) : (
              <><Truck className="w-4 h-4 mr-2" /> Book via Courier API</>
            )}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Bulk Book Modal ───────────────────────────────────── */
function BulkBookModal({ orderIds, couriers, onClose, onDone }: { orderIds: number[]; couriers: any[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [courierSlug, setCourierSlug] = useState(couriers[0]?.slug ?? "");
  const [weight, setWeight] = useState("0.5");
  const [pieces, setPieces] = useState("1");
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);

  const mutation = useMutation({
    mutationFn: () => api("/admin/shopify/orders/bulk-book", {
      method: "POST",
      body: JSON.stringify({ orderIds, courierSlug, weight: parseFloat(weight), pieces: parseInt(pieces), notifyWhatsapp }),
    }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    }),
    onSuccess: (d) => {
      toast({ title: `Bulk booking done: ${d.booked} booked, ${d.failed} failed` });
      onDone();
      onClose();
    },
    onError: (e: any) => toast({ title: e.message ?? "Bulk booking failed", variant: "destructive" }),
  });

  const activeCouriers = couriers.filter(c => c.isActive);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-bold">Bulk Book Courier</h2>
            <p className="text-sm text-muted-foreground">{orderIds.length} orders selected</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide mb-2 block">Courier</Label>
            <div className="grid grid-cols-2 gap-2">
              {activeCouriers.map(c => (
                <button key={c.slug} onClick={() => setCourierSlug(c.slug)}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${courierSlug === c.slug ? "border-primary bg-primary/5" : "border-border"}`}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Default Weight (kg)</Label>
              <Input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Default Pieces</Label>
              <Input type="number" value={pieces} onChange={e => setPieces(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
            <input type="checkbox" id="bulkWa" checked={notifyWhatsapp} onChange={e => setNotifyWhatsapp(e.target.checked)} className="w-4 h-4 accent-green-600" />
            <label htmlFor="bulkWa" className="text-sm text-green-800 cursor-pointer">
              <MessageCircle className="w-3.5 h-3.5 inline mr-1" /> WhatsApp notification per order
            </label>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
            Note: Bulk booking generates local tracking IDs. For API bookings, use individual order booking.
          </div>
        </div>
        <div className="p-5 border-t border-border flex gap-3">
          <Button className="flex-1" onClick={() => mutation.mutate()} disabled={mutation.isPending || !courierSlug}>
            {mutation.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Booking...</> : <><Boxes className="w-4 h-4 mr-2" />Book {orderIds.length} Orders</>}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Shipment Card ─────────────────────────────────────── */
function ShipmentCard({ shipment, orderId, onRefresh }: { shipment: any; orderId: number; onRefresh: () => void }) {
  const { toast } = useToast();
  const [showTimeline, setShowTimeline] = useState(false);

  const cancelMutation = useMutation({
    mutationFn: () => api(`/admin/shopify/orders/${orderId}/shipments/${shipment.id}/cancel`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Shipment cancelled" }); onRefresh(); },
    onError: () => toast({ title: "Cancel failed", variant: "destructive" }),
  });

  const refreshMutation = useMutation({
    mutationFn: () => api(`/admin/shopify/orders/${orderId}/shipments/${shipment.id}/refresh`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Status refreshed" }); onRefresh(); },
    onError: () => toast({ title: "Refresh failed", variant: "destructive" }),
  });

  const notifyMutation = useMutation({
    mutationFn: () => api(`/admin/shopify/orders/${orderId}/shipments/${shipment.id}/notify`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => toast({ title: "WhatsApp notification sent" }),
    onError: () => toast({ title: "Notification failed", variant: "destructive" }),
  });

  const codMutation = useMutation({
    mutationFn: (codStatus: string) => api(`/admin/shopify/orders/${orderId}/shipments/${shipment.id}/cod`, {
      method: "PATCH",
      body: JSON.stringify({ codStatus }),
    }).then(r => r.json()),
    onSuccess: () => { toast({ title: "COD status updated" }); onRefresh(); },
  });

  const isCancelled = shipment.isCancelled;

  return (
    <div className={`border rounded-xl p-4 space-y-3 transition-all ${isCancelled ? "border-red-200 bg-red-50/30 opacity-70" : "border-border bg-card hover:border-primary/30"}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <CourierBadge slug={shipment.courierSlug} name={shipment.courierName} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-sm">{shipment.trackingId}</span>
              <button onClick={() => { navigator.clipboard.writeText(shipment.trackingId); toast({ title: "Copied!" }); }}
                className="text-muted-foreground hover:text-foreground">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Booked {new Date(shipment.createdAt).toLocaleDateString()}
              {shipment.bookingSource === "shopify_bulk" && " · Bulk"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={shipment.status} />
          {isCancelled && <StatusBadge status="cancelled" />}
        </div>
      </div>

      {/* COD Info */}
      {shipment.isCod && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <DollarSign className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1">
            <span className="text-xs font-medium text-amber-800">COD: PKR {parseFloat(shipment.codAmount ?? "0").toLocaleString()}</span>
          </div>
          {!isCancelled && (
            <select
              value={shipment.codStatus ?? "pending"}
              onChange={e => codMutation.mutate(e.target.value)}
              className="text-xs border border-amber-300 rounded px-2 py-1 bg-white text-amber-800"
            >
              <option value="pending">Pending</option>
              <option value="received">Received</option>
              <option value="remitted">Remitted</option>
            </select>
          )}
        </div>
      )}

      {/* Real API badge */}
      {(shipment.rawResponse as any)?.realApiBooking && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="font-semibold">Real API Booking</span>
          {(shipment.rawResponse as any)?.apiCallDurationMs && (
            <span className="text-emerald-600 ml-auto">{(shipment.rawResponse as any).apiCallDurationMs}ms</span>
          )}
        </div>
      )}
      {(shipment.rawResponse as any)?.localTracking && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="font-semibold">Local Tracking ID</span>
          <span className="text-amber-600 ml-2">{(shipment.rawResponse as any)?.note}</span>
        </div>
      )}

      {/* Track Shipment button */}
      {(shipment.rawResponse as any)?.trackingUrl && (
        <a
          href={(shipment.rawResponse as any).trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-100 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          Track Shipment — {shipment.courierName ?? shipment.courierSlug?.toUpperCase()}
          <span className="ml-auto font-mono font-normal text-blue-500">{shipment.trackingId}</span>
        </a>
      )}

      {/* Timeline toggle */}
      <button onClick={() => setShowTimeline(v => !v)}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTimeline ? "rotate-180" : ""}`} />
        {showTimeline ? "Hide" : "Show"} Timeline ({(shipment.statusHistory ?? []).length} events)
      </button>
      {showTimeline && (
        <div className="bg-muted/30 rounded-lg p-3">
          <ShipmentTimeline history={shipment.statusHistory ?? []} />
        </div>
      )}

      {/* API Response Logs */}
      <ApiResponseLog rawResponse={shipment.rawResponse} />

      {/* Actions */}
      {!isCancelled && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
            <RefreshCw className={`w-3 h-3 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-700 hover:text-green-800 hover:bg-green-50" onClick={() => notifyMutation.mutate()} disabled={notifyMutation.isPending}>
            <Bell className="w-3 h-3" /> Notify
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => {
            if (confirm("Cancel this shipment?")) cancelMutation.mutate();
          }} disabled={cancelMutation.isPending}>
            <Ban className="w-3 h-3" /> Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─── Courier API Response Log ──────────────────────────── */
function ApiResponseLog({ rawResponse }: { rawResponse: any }) {
  const [open, setOpen] = useState(false);
  if (!rawResponse || Object.keys(rawResponse).length === 0) return null;

  const isReal = rawResponse.realApiBooking === true;
  const isLocal = rawResponse.localTracking === true;
  const note = rawResponse.note as string | undefined;
  const duration = rawResponse.apiCallDurationMs as number | undefined;
  const bookedAt = rawResponse.bookedAt as string | undefined;

  const customerName  = rawResponse.customerName  as string | undefined;
  const customerPhone = rawResponse.customerPhone as string | undefined;
  const customerCity  = rawResponse.customerCity  as string | undefined;
  const trackingUrl   = rawResponse.trackingUrl   as string | undefined;

  const displayData = { ...rawResponse };
  delete displayData.realApiBooking;
  delete displayData.localTracking;
  delete displayData.note;
  delete displayData.apiCallDurationMs;
  delete displayData.bookedAt;
  delete displayData.courier;
  delete displayData.triggeredBy;
  delete displayData.trackingUrl;
  delete displayData.customerName;
  delete displayData.customerPhone;
  delete displayData.customerCity;

  return (
    <div className="text-xs">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground font-medium py-0.5"
      >
        <Code2 className="w-3 h-3" />
        {open ? "Hide" : "Show"} API Response Logs
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 bg-muted/40 border border-border rounded-lg p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {isReal && <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">✅ Real API</span>}
            {isLocal && <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">⚠ Local ID</span>}
            {duration != null && <span className="bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">{duration}ms</span>}
            {bookedAt && <span className="text-muted-foreground">{new Date(bookedAt).toLocaleString()}</span>}
          </div>
          {/* Customer details sent to courier */}
          {(customerName || customerPhone || customerCity) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 space-y-0.5">
              <p className="font-semibold text-blue-800 mb-1">📦 Courier Booking Payload</p>
              {customerName  && <p className="text-blue-700"><span className="font-medium">Receiver Name:</span> {customerName}</p>}
              {customerPhone && <p className="text-blue-700"><span className="font-medium">Phone:</span> {customerPhone}</p>}
              {customerCity  && <p className="text-blue-700"><span className="font-medium">City:</span> {customerCity}</p>}
            </div>
          )}
          {/* Tracking URL */}
          {trackingUrl && (
            <a href={trackingUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-blue-700 hover:underline font-medium">
              <ExternalLink className="w-3 h-3" /> {trackingUrl}
            </a>
          )}
          {note && <p className="text-muted-foreground italic">{note}</p>}
          {Object.keys(displayData).length > 0 && (
            <pre className="text-[10px] font-mono bg-black/5 rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-all leading-relaxed">
              {JSON.stringify(displayData, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── WA Delivery Status Badge ───────────────────────────── */
function WaDeliveryBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">No status</span>;
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    sent:      { label: "Sent",      cls: "bg-blue-100 text-blue-700 border-blue-200",   icon: <Send className="w-3 h-3" /> },
    delivered: { label: "Delivered", cls: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle className="w-3 h-3" /> },
    read:      { label: "Read ✓✓",   cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CircleCheck className="w-3 h-3" /> },
    failed:    { label: "Failed",    cls: "bg-red-100 text-red-700 border-red-200",      icon: <XCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border", icon: <Clock className="w-3 h-3" /> };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
}

/* ─── Automation Timeline Step ───────────────────────────── */
function TimelineStep({ done, active, label, ts, sub, last }: { done: boolean; active?: boolean; label: string; ts?: string | null; sub?: string; last?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 border-2 transition-colors ${done ? "bg-green-500 border-green-500 text-white" : active ? "bg-orange-400 border-orange-400 text-white animate-pulse" : "bg-muted border-border text-muted-foreground"}`}>
          {done ? <CheckCircle className="w-3.5 h-3.5" /> : active ? <Clock className="w-3.5 h-3.5" /> : <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />}
        </div>
        {!last && <div className={`w-0.5 h-full min-h-[20px] mt-1 ${done ? "bg-green-300" : "bg-border"}`} />}
      </div>
      <div className="pb-4 min-w-0">
        <p className={`text-sm font-medium leading-tight ${done ? "text-foreground" : "text-muted-foreground"}`}>{label}</p>
        {ts && <p className="text-xs text-muted-foreground mt-0.5">{new Date(ts).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
        {sub && <p className="text-xs text-muted-foreground mt-0.5 italic">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── WA Confirmation Tab ───────────────────────────────── */
const WA_EVENT_LABELS: Record<string, { emoji: string; label: string; color: string }> = {
  order_confirmation:     { emoji: "✅", label: "Order Confirmation",   color: "text-blue-700" },
  order_processing:       { emoji: "⚙️", label: "Order Processing",     color: "text-indigo-700" },
  order_shipped:          { emoji: "📦", label: "Order Shipped",        color: "text-purple-700" },
  order_out_for_delivery: { emoji: "🚚", label: "Out for Delivery",     color: "text-orange-700" },
  order_delivered:        { emoji: "🎉", label: "Order Delivered",      color: "text-green-700" },
  order_cancelled:        { emoji: "❌", label: "Order Cancelled",      color: "text-red-700" },
  abandoned_cart_recovery:{ emoji: "🛒", label: "Cart Recovery",        color: "text-amber-700" },
};

function WaStatusProgress({ status, sentAt }: { status?: string | null; sentAt?: string | null }) {
  const steps: { key: string; label: string; Icon: React.ElementType }[] = [
    { key: "queued",    label: "Queued",    Icon: Clock },
    { key: "sent",      label: "Sent ✓",   Icon: CheckCircle },
    { key: "delivered", label: "Delivered", Icon: CheckCheck },
    { key: "read",      label: "Read ✓✓",  Icon: CheckCheck },
  ];
  const ORDER = ["queued", "sent", "delivered", "read"];

  if (status === "failed") {
    return (
      <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
        <XCircle className="w-4 h-4 shrink-0" />
        <span>Message delivery failed — Meta error 131047. Use an approved template below to re-engage.</span>
      </div>
    );
  }

  const currentIdx = status ? Math.max(ORDER.indexOf(status), sentAt ? 1 : 0) : (sentAt ? 1 : 0);
  const fillPct = steps.length > 1 ? (currentIdx / (steps.length - 1)) * 100 : 0;

  return (
    <div className="relative flex items-start justify-between py-2 px-1">
      {/* Base connector line */}
      <div className="absolute top-[22px] left-[18px] right-[18px] h-0.5 bg-border" />
      {/* Animated fill */}
      <div
        className="absolute top-[22px] left-[18px] h-0.5 bg-green-400 transition-all duration-700"
        style={{ width: `calc(${fillPct}% * (1 - 36px / 100%))` }}
      />
      {steps.map((step, i) => {
        const done   = i < currentIdx;
        const active = i === currentIdx;
        const { Icon } = step;
        return (
          <div key={step.key} className="relative flex flex-col items-center gap-1.5 z-10 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all
              ${done   ? "bg-green-500 border-green-500 text-white"
              : active ? "bg-blue-500  border-blue-500  text-white"
              :          "bg-white     border-border     text-muted-foreground"}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <span className={`text-[10px] font-medium text-center leading-tight
              ${done || active ? "text-foreground" : "text-muted-foreground"}`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WaConfirmTab({ order }: { order: any }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const addr = order.shippingAddress ?? {};
  const city = (addr.city ?? "").toLowerCase();
  const isLahore = city.includes("lahore");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [showRecentLogs, setShowRecentLogs] = useState(false);

  /* ── Full WA status + timeline data (auto-refreshes every 15s) ── */
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["order-wa-status", order.id],
    queryFn: () => api(`/admin/shopify/orders/${order.id}/wa-delivery-status`).then(r => r.json()),
    refetchInterval: 15_000,
    retry: false,
  });

  const conf          = data?.confirmation ?? null;
  const waStatus      = data?.waDelivery ?? null;
  const rider         = data?.rider ?? null;
  const templates: any[] = data?.templates ?? [];
  const shipments: any[] = data?.shipments ?? [];
  const recentWaLogs: any[] = data?.recentWaLogs ?? [];

  const approvedTemplates = templates.filter((t: any) => t.approval_status === "approved");

  /* Group approved templates by trigger_event */
  const templatesByEvent = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const t of approvedTemplates) {
      const ev = t.trigger_event ?? "other";
      if (!groups[ev]) groups[ev] = [];
      groups[ev].push(t);
    }
    return groups;
  }, [approvedTemplates]);

  const eventOrder = ["order_confirmation","order_shipped","order_out_for_delivery","order_delivered","order_processing","order_cancelled","abandoned_cart_recovery","other"];

  /* Recommended template based on order state */
  const isConfirmed = conf?.status === "confirmed" || conf?.status === "booked";
  const isBooked    = conf?.status === "booked" || !!order.trackingNumber || shipments.some((s: any) => !s.isCancelled);
  const isDelivered = rider?.status === "delivered";

  const recommendedEvent = isDelivered ? "order_delivered"
    : isBooked ? "order_shipped"
    : isConfirmed ? "order_shipped"
    : "order_confirmation";

  /* ── Send initial WA confirmation ── */
  const sendMutation = useMutation({
    mutationFn: () => api(`/admin/shopify/orders/${order.id}/send-confirmation`, { method: "POST" }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Send failed");
      return d;
    }),
    onSuccess: (d) => {
      toast({ title: d.success ? "✅ WA confirmation sent!" : (d.message ?? "Send failed"), variant: d.success ? "default" : "destructive" });
      refetch();
    },
    onError: (e: any) => toast({ title: e.message ?? "Send failed", variant: "destructive" }),
  });

  /* ── Resend WA confirmation ── */
  const resendMutation = useMutation({
    mutationFn: () => api(`/admin/logistics/confirmations/${conf?.id}/resend`, { method: "POST" }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Resend failed");
      if (!d.success) throw new Error(d.message ?? "WhatsApp send failed");
      return d;
    }),
    onSuccess: () => { toast({ title: "✅ WA confirmation resent!" }); refetch(); },
    onError: (e: any) => toast({ title: e.message ?? "Resend failed", variant: "destructive" }),
  });

  /* ── Force book courier ── */
  const forceBookMutation = useMutation({
    mutationFn: () => api(`/admin/logistics/confirmations/${conf?.id}/force-book`, { method: "POST" }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Force book failed");
      return d;
    }),
    onSuccess: (d) => toast({ title: d.ok ? `✅ Booked! Tracking: ${d.trackingId}` : (d.error ?? "Booking failed"), variant: d.ok ? "default" : "destructive" }),
    onError: (e: any) => toast({ title: e.message ?? "Force book failed", variant: "destructive" }),
  });

  /* ── Send specific template ── */
  const templateSendMutation = useMutation({
    mutationFn: async () => {
      const tpl = approvedTemplates.find((t: any) => String(t.id) === selectedTemplate);
      if (!tpl) throw new Error("Select a template first");
      const phone = (addr.phone ?? order.customerPhone ?? "").replace(/\D/g, "");
      if (!phone) throw new Error("No phone number for this order");
      const normPhone = phone.startsWith("92") ? "+" + phone : "+92" + phone.slice(phone.startsWith("0") ? 1 : 0);
      const r = await api(`/admin/whatsapp/conversations/${normPhone}/send-template`, {
        method: "POST",
        body: JSON.stringify({
          templateId: tpl.id,
          variables: [order.orderNumber ?? String(order.id), order.totalPrice ?? "0", addr.name ?? order.customerName ?? "Customer"],
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Send failed");
      return d;
    },
    onSuccess: () => { toast({ title: "✅ Template sent to customer!" }); refetch(); },
    onError: (e: any) => toast({ title: e.message ?? "Template send failed", variant: "destructive" }),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  /* Active shipment */
  const activeShipment = shipments.find((s: any) => !s.isCancelled);

  return (
    <div className="space-y-4">

      {/* ── Lahore notice ── */}
      {isLahore && (
        <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-800">
          <Navigation className="w-4 h-4 shrink-0" />
          <span><strong>Lahore order</strong> — delivery handled by local rider (Rider tab)</span>
        </div>
      )}

      {/* ── No confirmation sent yet ── */}
      {!conf?.id && (
        <div className="text-center py-6 space-y-3 border border-dashed border-border rounded-xl">
          <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium">No WA confirmation sent yet</p>
            <p className="text-sm text-muted-foreground mt-1">Send a confirmation to start the delivery workflow.</p>
          </div>
          <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
            <MessageCircle className="w-4 h-4" />
            {sendMutation.isPending ? "Sending..." : "Send WA Confirmation"}
          </Button>
        </div>
      )}

      {/* ── WA Delivery Status Panel ── */}
      {conf?.id && (
        <div className="border border-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
            <span className="text-sm font-semibold flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-green-600" />
              WA Message Status
            </span>
            <div className="flex items-center gap-2">
              <WaDeliveryBadge status={waStatus?.status ?? (conf?.last_sent_at ? "sent" : undefined)} />
              <span className="text-xs text-muted-foreground">{conf.retry_count > 0 ? `Sent ${conf.retry_count + 1}×` : "Sent once"}</span>
            </div>
          </div>

          {/* WA Progress Bar */}
          <div className="px-4 pt-3 pb-2">
            <WaStatusProgress status={waStatus?.status} sentAt={conf?.last_sent_at} />
          </div>

          {/* Details */}
          <div className="px-4 pb-3 space-y-1.5 text-xs text-muted-foreground border-t border-border/50 pt-2">
            <div className="flex justify-between">
              <span>Customer</span>
              <strong className="text-foreground">{conf.customer_phone}</strong>
            </div>
            {conf.last_sent_at && (
              <div className="flex justify-between">
                <span>Last Sent</span>
                <span>{new Date(conf.last_sent_at).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            )}
            {waStatus?.updatedAt && (
              <div className="flex justify-between">
                <span>Meta Updated</span>
                <span>{new Date(waStatus.updatedAt).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            )}
            {conf.confirmation_received_at && (
              <div className="flex justify-between">
                <span>Customer Confirmed</span>
                <strong className="text-green-600">{new Date(conf.confirmation_received_at).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</strong>
              </div>
            )}
            {conf.confirmation_reply && (
              <div className="flex justify-between">
                <span>Reply</span>
                <span className="font-medium text-foreground italic">"{conf.confirmation_reply}"</span>
              </div>
            )}
            {waStatus?.status === "failed" && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700">
                ⚠ Meta error 131047 — Customer hasn't replied in 24h. Use an approved template below.
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {conf.status !== "cancelled" && (
              <Button size="sm" variant="outline" className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => resendMutation.mutate()} disabled={resendMutation.isPending}>
                <Send className="w-3.5 h-3.5" />
                {resendMutation.isPending ? "Sending..." : "Resend WA"}
              </Button>
            )}
            {!isLahore && !isBooked && (
              <Button size="sm" variant="outline" className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50"
                onClick={() => forceBookMutation.mutate()} disabled={forceBookMutation.isPending}>
                <Truck className="w-3.5 h-3.5" />
                {forceBookMutation.isPending ? "Booking..." : "Force Book Courier"}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground ml-auto"
              onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
          </div>
        </div>
      )}

      {/* ── Full Automation Timeline ── */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
          <span className="text-sm font-semibold">Automation Timeline</span>
        </div>
        <div className="px-4 pt-4">
          <TimelineStep done label="Order Created" ts={order.createdAt} />
          <TimelineStep
            done={!!conf?.last_sent_at} active={!conf?.last_sent_at}
            label="WA Confirmation Sent"
            ts={conf?.last_sent_at}
            sub={conf ? `Meta status: ${waStatus?.status ?? "sent"} · Sent ${(conf.retry_count ?? 0) + 1}×` : undefined}
          />
          <TimelineStep
            done={isConfirmed} active={!!conf?.last_sent_at && !isConfirmed}
            label="Customer Confirmed"
            ts={conf?.confirmation_received_at}
            sub={conf?.confirmation_reply ? `Reply: "${conf.confirmation_reply}"` : undefined}
          />
          <TimelineStep
            done={isLahore ? !!rider?.assignedAt : isBooked}
            active={isConfirmed && !isBooked && !rider?.assignedAt}
            label={isLahore ? "Rider Assigned" : "Courier Booked"}
            ts={rider?.assignedAt ?? activeShipment?.createdAt ?? (order.trackingNumber ? order.updatedAt : null)}
            sub={
              rider?.riderName ? `Rider: ${rider.riderName}`
              : activeShipment ? `${activeShipment.courierSlug?.toUpperCase()} · ${activeShipment.trackingId}`
              : order.trackingNumber ? `Tracking: ${order.trackingNumber}`
              : undefined
            }
          />
          {isLahore && (
            <TimelineStep
              done={!!rider?.pickedAt} active={!!rider?.assignedAt && !rider?.pickedAt}
              label="Picked Up"
              ts={rider?.pickedAt}
              sub={rider?.waToRiderAt ? `WA sent to rider at ${new Date(rider.waToRiderAt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}` : undefined}
            />
          )}
          {isLahore && (
            <TimelineStep
              done={!!rider?.outForDeliveryAt} active={!!rider?.pickedAt && !rider?.outForDeliveryAt}
              label="Out for Delivery"
              ts={rider?.outForDeliveryAt}
              sub={rider?.waToCustomerAt ? "Customer notified via WA" : undefined}
            />
          )}
          <TimelineStep
            done={isDelivered} active={isLahore ? !!rider?.outForDeliveryAt && !isDelivered : isBooked && !isDelivered}
            label="Delivered"
            ts={rider?.deliveredAt}
            last
          />
        </div>
      </div>

      {/* ── Template Sender Panel ── */}
      <div className="border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowTemplatePanel(p => !p)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 text-sm font-semibold hover:bg-muted/50 transition-colors">
          <span className="flex items-center gap-2">
            <Send className="w-4 h-4 text-green-600" />
            Send WA Template
            {approvedTemplates.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">({approvedTemplates.length} approved)</span>
            )}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showTemplatePanel ? "rotate-180" : ""}`} />
        </button>

        {showTemplatePanel && (
          <div className="p-4 space-y-3">
            {approvedTemplates.length === 0 ? (
              <div className="text-center py-3 space-y-2">
                <p className="text-sm text-muted-foreground">No approved WA templates found.</p>
                <Button size="sm" variant="outline" className="gap-1.5 text-green-700 border-green-300"
                  onClick={() => navigate("/whatsapp?tab=templates")}>
                  <FileText className="w-3.5 h-3.5" /> Manage Templates
                </Button>
              </div>
            ) : (
              <>
                {/* Recommended badge */}
                {recommendedEvent && templatesByEvent[recommendedEvent] && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
                    <Zap className="w-3.5 h-3.5 text-green-600 shrink-0" />
                    <span>Recommended for this order: <strong>{WA_EVENT_LABELS[recommendedEvent]?.emoji} {WA_EVENT_LABELS[recommendedEvent]?.label ?? recommendedEvent}</strong></span>
                  </div>
                )}

                {/* Event-grouped template selector */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Select Template</label>
                    <button
                      onClick={() => navigate("/whatsapp?tab=templates")}
                      className="text-xs text-green-700 hover:underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> Manage Templates
                    </button>
                  </div>
                  <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                    <option value="">Choose template...</option>
                    {eventOrder.map(ev => {
                      const group = templatesByEvent[ev];
                      if (!group?.length) return null;
                      const evMeta = WA_EVENT_LABELS[ev] ?? { emoji: "📄", label: ev.replace(/_/g, " ") };
                      return (
                        <optgroup key={ev} label={`${evMeta.emoji} ${evMeta.label}`}>
                          {group.map((t: any) => (
                            <option key={t.id} value={String(t.id)}>
                              {t.name} · {t.param_count ?? 0} vars{recommendedEvent === ev ? " ★" : ""}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>

                {/* Template preview */}
                {selectedTemplate && (() => {
                  const tpl = approvedTemplates.find((t: any) => String(t.id) === selectedTemplate);
                  if (!tpl) return null;
                  const preview = (tpl.message_body ?? "")
                    .replace("{{1}}", order.orderNumber ?? "#—")
                    .replace("{{2}}", order.totalPrice ?? "0")
                    .replace("{{3}}", addr.name ?? order.customerName ?? "Customer")
                    .replace("{{4}}", activeShipment?.trackingId ?? order.trackingNumber ?? "N/A")
                    .replace("{{5}}", order.financialStatus === "paid" ? "Paid Online" : "COD");
                  const evKey = tpl.trigger_event;
                  const evMeta = evKey ? WA_EVENT_LABELS[evKey] : null;
                  return (
                    <div className="space-y-1.5">
                      {evMeta && (
                        <div className={`text-xs font-medium flex items-center gap-1.5 ${evMeta.color}`}>
                          <span>{evMeta.emoji}</span><span>{evMeta.label}</span>
                        </div>
                      )}
                      <div className="bg-[#dcf8c6] rounded-xl p-3 text-gray-800 border border-green-200 font-mono text-xs whitespace-pre-wrap max-h-36 overflow-y-auto">
                        {preview}
                      </div>
                    </div>
                  );
                })()}

                <Button size="sm" className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => templateSendMutation.mutate()} disabled={!selectedTemplate || templateSendMutation.isPending}>
                  <Send className="w-3.5 h-3.5" />
                  {templateSendMutation.isPending ? "Sending..." : "Send Template"}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Recent WA Logs ── */}
      {recentWaLogs.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowRecentLogs(p => !p)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 text-sm font-semibold hover:bg-muted/50 transition-colors">
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Recent WA Messages ({recentWaLogs.length})
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showRecentLogs ? "rotate-180" : ""}`} />
          </button>
          {showRecentLogs && (
            <div className="divide-y divide-border">
              {recentWaLogs.map((log: any, i: number) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground shrink-0">{new Date(log.created_at).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="truncate font-mono text-muted-foreground">{log.template_name ?? log.message_id?.slice(-8) ?? "—"}</span>
                  </div>
                  <WaDeliveryBadge status={log.delivery_status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Rider Tab ─────────────────────────────────────────── */
function RiderTab({ order }: { order: any }) {
  const { toast } = useToast();
  const addr = order.shippingAddress ?? {};
  const rawCity = (addr.city ?? order.customerCity ?? "").toLowerCase();
  const autoLahore = rawCity.includes("lahore");
  const [manualLahore, setManualLahore] = useState(false);
  const isLahore = autoLahore || manualLahore;

  const { data: deliveryData, isLoading, refetch } = useQuery({
    queryKey: ["order-rider-delivery", order.id],
    queryFn: () => api(`/admin/riders/lahore-orders?limit=200`).then(r => r.json()).then((d: any) => {
      const list: any[] = d.orders ?? [];
      return list.find((x: any) => x.id === order.id) ?? null;
    }),
    enabled: isLahore,
  });

  const { data: ridersRaw } = useQuery({
    queryKey: ["riders-active"],
    queryFn: () => api("/admin/riders").then(r => r.json()).then((d: any) => Array.isArray(d) ? d : (d.riders ?? [])),
  });
  const riders: any[] = (ridersRaw ?? []).filter((r: any) => r.status === "active");

  const [selectedRider, setSelectedRider] = useState("");

  const assignMutation = useMutation({
    mutationFn: () => api("/admin/riders/assign", {
      method: "POST",
      body: JSON.stringify({ shopify_order_db_id: order.id, rider_id: parseInt(selectedRider) }),
    }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Assignment failed");
      return d;
    }),
    onSuccess: () => { toast({ title: "✅ Rider assigned!" }); refetch(); },
    onError: (e: any) => toast({ title: e.message ?? "Assignment failed", variant: "destructive" }),
  });

  const waMutation = useMutation({
    mutationFn: (deliveryId: number) => api(`/admin/riders/deliveries/${deliveryId}/send-wa`, { method: "POST" }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "WA send failed");
      if (!d.ok) throw new Error(d.message ?? "WhatsApp send failed — check WA settings");
      return d;
    }),
    onSuccess: (d) => toast({ title: `✅ ${d.message ?? "WA sent to rider!"}` }),
    onError: (e: any) => toast({ title: e.message ?? "WA send failed", variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ deliveryId, status }: { deliveryId: number; status: string }) =>
      api(`/admin/riders/deliveries/${deliveryId}/status`, { method: "PUT", body: JSON.stringify({ status }) }).then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Update failed");
        return d;
      }),
    onSuccess: () => { toast({ title: "✅ Status updated!" }); refetch(); },
    onError: (e: any) => toast({ title: e.message ?? "Update failed", variant: "destructive" }),
  });

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    assigned: "bg-blue-100 text-blue-800",
    picked_up: "bg-purple-100 text-purple-800",
    in_transit: "bg-orange-100 text-orange-800",
    delivered: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    returned: "bg-rose-100 text-rose-800",
  };

  /* ── Not Lahore & not manually enabled ── */
  if (!isLahore) return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <Navigation className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">City: {addr.city || "Unknown"}</p>
          <p className="text-xs mt-0.5">Auto-detected as non-Lahore. Use Courier tab for this order.<br/>If this is actually a Lahore order, enable manually below.</p>
        </div>
      </div>
      <button
        onClick={() => setManualLahore(true)}
        className="w-full border-2 border-dashed border-orange-300 rounded-xl p-4 text-orange-700 hover:bg-orange-50 transition-colors text-sm font-medium flex items-center justify-center gap-2">
        <Bike className="w-4 h-4" /> Force Enable Lahore Rider Mode
      </button>
    </div>
  );

  if (isLoading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-4">
      {deliveryData ? (
        <>
          {/* Delivery Card */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bike className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{deliveryData.rider_name ?? "Unassigned"}</p>
                  <p className="text-xs text-muted-foreground">{deliveryData.rider_phone ?? "—"}</p>
                </div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusColors[deliveryData.delivery_status] ?? "bg-muted text-muted-foreground"}`}>
                {(deliveryData.delivery_status ?? "unassigned").replace(/_/g, " ")}
              </span>
            </div>

            <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 rounded-lg p-3">
              <div className="flex gap-2"><MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{(deliveryData.shipping_address as any)?.address1 ?? "—"}, {(deliveryData.shipping_address as any)?.city ?? ""}</span></div>
              <div className="flex gap-2"><Phone className="w-3.5 h-3.5 shrink-0" /><span>{deliveryData.customer_phone ?? "—"}</span></div>
              {deliveryData.cod_amount > 0 && (
                <div className="flex gap-2"><DollarSign className="w-3.5 h-3.5 shrink-0" /><span>COD: <strong className="text-foreground">PKR {parseInt(deliveryData.cod_amount).toLocaleString()}</strong></span></div>
              )}
              {deliveryData.wa_sent_at && (
                <div className="flex gap-2"><MessageCircle className="w-3.5 h-3.5 shrink-0" /><span>WA sent: {new Date(deliveryData.wa_sent_at).toLocaleString()}</span></div>
              )}
            </div>

            {/* Status update */}
            {deliveryData.delivery_id && (
              <div>
                <p className="text-xs font-semibold mb-2">Update Delivery Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {["assigned","picked_up","in_transit","delivered","failed","returned"].map(s => (
                    <button key={s} onClick={() => statusMutation.mutate({ deliveryId: deliveryData.delivery_id, status: s })}
                      disabled={statusMutation.isPending || deliveryData.delivery_status === s}
                      className={`text-xs px-2.5 py-1 rounded-full capitalize border transition-all ${deliveryData.delivery_status === s ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary hover:text-primary"}`}>
                      {s.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1 border-t border-border">
              {deliveryData.delivery_id && (
                <Button size="sm" variant="outline" className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
                  onClick={() => waMutation.mutate(deliveryData.delivery_id)} disabled={waMutation.isPending}>
                  <MessageCircle className="w-3.5 h-3.5" /> {waMutation.isPending ? "Sending..." : "WA to Rider"}
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5"
                onClick={() => window.open(`/api/admin/riders/orders/${order.id}/invoice`, "_blank")}>
                <FileText className="w-3.5 h-3.5" /> Print Invoice
              </Button>
            </div>
          </div>

          {/* Reassign */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold">Reassign Rider</p>
            <div className="flex gap-2">
              <select value={selectedRider} onChange={e => setSelectedRider(e.target.value)}
                className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-background">
                <option value="">Select rider...</option>
                {riders.map((r: any) => <option key={r.id} value={r.id}>{r.name} ({r.phone})</option>)}
              </select>
              <Button size="sm" onClick={() => assignMutation.mutate()} disabled={!selectedRider || assignMutation.isPending}>
                {assignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assign"}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="text-center py-6 space-y-2">
            <Bike className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="font-medium">No rider assigned yet</p>
            <p className="text-sm text-muted-foreground">This is a Lahore order. Assign a rider to handle local delivery.</p>
          </div>
          <div className="border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold">Assign Rider</p>
            <div className="flex gap-2">
              <select value={selectedRider} onChange={e => setSelectedRider(e.target.value)}
                className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-background">
                <option value="">Select rider...</option>
                {riders.map((r: any) => <option key={r.id} value={r.id}>{r.name} ({r.phone})</option>)}
              </select>
              <Button size="sm" onClick={() => assignMutation.mutate()} disabled={!selectedRider || assignMutation.isPending}>
                {assignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assign"}
              </Button>
            </div>
            <Button variant="outline" size="sm" className="w-full gap-1.5"
              onClick={() => {
                api("/admin/riders/auto-assign", { method: "POST" }).then(r => r.json()).then(() => { toast({ title: "Auto-assigned!" }); refetch(); }).catch(() => toast({ title: "Auto-assign failed", variant: "destructive" }));
              }}>
              <Zap className="w-3.5 h-3.5" /> Auto-Assign (round-robin)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Order Detail Panel ─────────────────────────────────── */
function OrderDetailPanel({
  order,
  couriers,
  onClose,
}: {
  order: any;
  couriers: any[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"details" | "workflow" | "courier" | "rider" | "items">("details");
  const [showBookModal, setShowBookModal] = useState(false);
  const [newStatus, setNewStatus] = useState(order.status ?? "");
  const [waMessage, setWaMessage] = useState(
    `Hi ${order.customerName ?? "there"}! Your KDF NUTS order *${order.orderNumber}* is *${order.status ?? "processing"}*. Thank you for shopping with us! 🌿`
  );

  const addr = order.shippingAddress ?? {};
  const isLahore = (addr.city ?? "").toLowerCase().includes("lahore");

  const { data: shipments = [], refetch: refetchShipments } = useQuery({
    queryKey: ["shopify-order-shipments", order.id],
    queryFn: () => api(`/admin/shopify/orders/${order.id}/shipments`).then(r => r.json()),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: any) => api(`/admin/shopify/orders/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shopify-orders"] }); toast({ title: "Status updated" }); },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const waMutation = useMutation({
    mutationFn: ({ id, message }: any) => api(`/admin/shopify/orders/${id}/whatsapp`, { method: "POST", body: JSON.stringify({ message }) }).then(r => r.json()),
    onSuccess: () => { toast({ title: "WhatsApp message sent" }); },
    onError: () => toast({ title: "Failed to send", variant: "destructive" }),
  });

  const tabs: Array<{ id: string; label: string; icon: React.ReactNode }> = [
    { id: "details",  label: "Details",       icon: <User className="w-3.5 h-3.5" /> },
    { id: "workflow", label: "WA & Confirm",   icon: <MessageCircle className="w-3.5 h-3.5" /> },
    { id: "courier",  label: `Courier (${shipments.length})`, icon: <Truck className="w-3.5 h-3.5" /> },
    { id: "rider",    label: isLahore ? "🛵 Rider" : "Rider", icon: <Bike className="w-3.5 h-3.5" /> },
    { id: "items",    label: `Items (${order.lineItems?.length ?? 0})`, icon: <Package className="w-3.5 h-3.5" /> },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 flex items-start justify-center p-4 overflow-y-auto" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-xl my-8">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="font-bold text-lg">{order.orderNumber}</h2>
                <StatusBadge status={order.status} />
                {order.financialStatus && <StatusBadge status={order.financialStatus} />}
                {isLahore && (
                  <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                    <Navigation className="w-3 h-3" /> Lahore Local
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {order.customerName} · {order.customerPhone || order.customerEmail || "—"} · {addr.city || "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="gap-1.5" onClick={() => { setActiveTab("courier"); setShowBookModal(true); }}>
                <Truck className="w-3.5 h-3.5" /> Book Courier
              </Button>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border px-5 overflow-x-auto">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id as any)}
                className={`py-3 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-5 max-h-[60vh] overflow-y-auto">
            {/* Details Tab */}
            {activeTab === "details" && (
              <div className="space-y-5">
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/30 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Total</p>
                    <p className="font-bold text-base">PKR {parseFloat(order.totalPrice ?? "0").toLocaleString()}</p>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Shipments</p>
                    <p className="font-bold text-base">{shipments.length}</p>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Items</p>
                    <p className="font-bold text-base">{order.lineItems?.length ?? 0}</p>
                  </div>
                </div>

                {/* Shipping Address */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Shipping Address</p>
                  <div className="bg-muted/30 rounded-xl p-4 text-sm space-y-1">
                    <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-muted-foreground" /><span className="font-medium">{addr.name ?? order.customerName ?? "—"}</span></div>
                    <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /><span>{addr.address1 ?? addr.address ?? "—"}{addr.address2 ? `, ${addr.address2}` : ""}</span></div>
                    <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-transparent" /><span className="text-muted-foreground">{[addr.city, addr.province, addr.country].filter(Boolean).join(", ")}</span></div>
                    {(addr.phone || order.customerPhone) && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-muted-foreground" /><span>{addr.phone ?? order.customerPhone}</span></div>}
                  </div>
                </div>

                {/* Tracking */}
                {order.trackingNumber && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Active Tracking</p>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
                      <Truck className="w-5 h-5 text-blue-600 shrink-0" />
                      <div>
                        <p className="font-mono font-semibold text-sm text-blue-900">{order.trackingNumber}</p>
                        <p className="text-xs text-blue-600">Latest tracking number</p>
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(order.trackingNumber); toast({ title: "Copied!" }); }}
                        className="ml-auto text-blue-500 hover:text-blue-700">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Totals */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Order Summary</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>PKR {parseFloat(order.subtotalPrice ?? "0").toLocaleString()}</span></div>
                    {parseFloat(order.totalDiscounts ?? "0") > 0 && (
                      <div className="flex justify-between text-red-600"><span>Discounts</span><span>-PKR {parseFloat(order.totalDiscounts).toLocaleString()}</span></div>
                    )}
                    <div className="flex justify-between font-bold text-base border-t border-border pt-2 mt-2">
                      <span>Total</span><span>PKR {parseFloat(order.totalPrice ?? "0").toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Invoice + Update Status */}
                <div className="border-t border-border pt-4 flex gap-3 flex-wrap">
                  <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={() => {
                      const tok = localStorage.getItem("kdf_admin_token") ?? "";
                      window.open(`/api/admin/riders/orders/${order.id}/invoice?token=${encodeURIComponent(tok)}`, "_blank");
                    }}>
                    <FileText className="w-3.5 h-3.5" /> Print Invoice
                  </Button>
                  <div className="flex gap-2 items-center flex-wrap">
                    {["pending", "fulfilled", "cancelled"].map(s => (
                      <Button key={s} size="sm" variant={newStatus === s ? "default" : "outline"} className="capitalize h-8 text-xs" onClick={() => setNewStatus(s)}>{s}</Button>
                    ))}
                    <Button size="sm" onClick={() => statusMutation.mutate({ id: order.id, status: newStatus })} disabled={statusMutation.isPending || newStatus === order.status}>
                      {statusMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>

                {/* WhatsApp */}
                <div className="border-t border-border pt-4">
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><MessageCircle className="w-4 h-4 text-green-600" />Quick WhatsApp</p>
                  <textarea className="w-full border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    rows={3} value={waMessage} onChange={e => setWaMessage(e.target.value)} />
                  <Button size="sm" className="mt-2 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => waMutation.mutate({ id: order.id, message: waMessage })} disabled={waMutation.isPending || !waMessage.trim()}>
                    <Send className="w-3.5 h-3.5" /> {waMutation.isPending ? "Sending..." : "Send WhatsApp"}
                  </Button>
                </div>
              </div>
            )}

            {/* WA Confirmation Tab */}
            {activeTab === "workflow" && <WaConfirmTab order={order} />}

            {/* Courier/Shipments Tab */}
            {activeTab === "courier" && (
              <div className="space-y-3">
                {shipments.length === 0 ? (
                  <div className="text-center py-10">
                    <Truck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-medium">No shipments yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Book a courier to create a shipment</p>
                    <Button size="sm" onClick={() => setShowBookModal(true)}>
                      <Truck className="w-3.5 h-3.5 mr-1.5" /> Book Courier
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button size="sm" variant="outline" className="gap-1.5 mb-2" onClick={() => setShowBookModal(true)}>
                      <Truck className="w-3.5 h-3.5" /> Book Another Courier
                    </Button>
                    {shipments.map((s: any) => (
                      <ShipmentCard key={s.id} shipment={s} orderId={order.id} onRefresh={refetchShipments} />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Rider Tab (Lahore only) */}
            {activeTab === "rider" && <RiderTab order={order} />}

            {/* Items Tab */}
            {activeTab === "items" && (
              <div className="space-y-2">
                {(order.lineItems ?? []).length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No items</p>
                ) : (
                  (order.lineItems ?? []).map((li: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 bg-muted/20 rounded-xl p-3">
                      {li.image && <img src={li.image} alt={li.title} className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{li.title}</p>
                        {li.variantTitle && <p className="text-xs text-muted-foreground">{li.variantTitle}</p>}
                        <p className="text-xs text-muted-foreground">Qty: {li.quantity}</p>
                      </div>
                      <p className="font-semibold text-sm shrink-0">PKR {parseFloat(li.price ?? "0").toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showBookModal && (
        <BookCourierModal
          order={order}
          couriers={couriers}
          onClose={() => setShowBookModal(false)}
          onBooked={() => { refetchShipments(); qc.invalidateQueries({ queryKey: ["shopify-orders"] }); }}
        />
      )}
    </>
  );
}

/* ─── Main Page ─────────────────────────────────────────── */
export default function ShopifyOrdersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [financialFilter, setFinancialFilter] = useState("all");

  const setDeliveryFilterAndReset = (f: string) => { setDeliveryFilter(f); setPage(1); setSelectedIds([]); };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["shopify-orders", page, search, status, dateFrom, dateTo, financialFilter, deliveryFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "25", search, status });
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo)   params.set("to", dateTo);
      if (financialFilter !== "all") params.set("financial_status", financialFilter);
      if (deliveryFilter !== "all")  params.set("delivery_type", deliveryFilter);
      return api(`/admin/shopify/orders?${params}`).then(r => r.json());
    },
  });

  const { data: tabCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["shopify-orders-counts"],
    queryFn: () => api("/admin/shopify/orders/counts").then(r => r.json()),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: couriersData } = useQuery({
    queryKey: ["couriers-list"],
    queryFn: () => api("/admin/couriers").then(r => r.json()),
  });

  const syncMutation = useMutation({
    mutationFn: () => api("/admin/shopify/sync/orders", { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["shopify-orders"] }); toast({ title: `${d.synced ?? 0} orders synced from Shopify` }); },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const orders: any[] = data?.orders ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);
  const couriers: any[] = couriersData ?? [];

  const allSelected = orders.length > 0 && orders.every(o => selectedIds.includes(o.id));
  const toggleAll = () => setSelectedIds(allSelected ? [] : orders.map((o: any) => o.id));
  const toggleOne = (id: number) => setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

  const unbookedSelected = orders.filter(o => selectedIds.includes(o.id) && !o.trackingNumber);

  /* Stats bar */
  const totalRevenue = orders.reduce((s: number, o: any) => s + parseFloat(o.totalPrice ?? "0"), 0);
  const fulfilledCount = orders.filter((o: any) => o.status === "fulfilled").length;
  const unfulfilledCount = orders.filter((o: any) => ["unfulfilled", "pending"].includes(o.status)).length;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Shopify Orders</h1>
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} orders · PKR {totalRevenue.toLocaleString()} revenue on this page</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button variant="outline" className="gap-1.5 border-primary text-primary" onClick={() => setShowBulkModal(true)}>
              <Boxes className="w-4 h-4" /> Book {selectedIds.length} Orders
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowFilters(v => !v)} className="gap-1.5">
            <Filter className="w-4 h-4" /> Filters
            {(dateFrom || dateTo || financialFilter !== "all") && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
          </Button>
          <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="gap-1.5">
            <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing..." : "Sync Shopify"}
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fulfilled</p>
            <p className="text-xl font-bold">{fulfilledCount}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Unfulfilled</p>
            <p className="text-xl font-bold">{unfulfilledCount}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Page Revenue</p>
            <p className="text-xl font-bold">PKR {Math.round(totalRevenue / 1000)}K</p>
          </div>
        </div>
      </div>

      {/* Smart Delivery Filter Tabs */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <div className="flex divide-x divide-border min-w-max">
            {[
              { id: "all",             label: "All Orders",      icon: <Package className="w-3.5 h-3.5" />,     color: "text-foreground",    countKey: "all" },
              { id: "lahore",          label: "Lahore",          icon: <Navigation className="w-3.5 h-3.5" />,  color: "text-orange-600",    countKey: "lahore" },
              { id: "courier_booked",  label: "Courier Booked",  icon: <Truck className="w-3.5 h-3.5" />,      color: "text-blue-600",      countKey: "courier_booked" },
              { id: "rider_assigned",  label: "Rider Assigned",  icon: <Bike className="w-3.5 h-3.5" />,       color: "text-purple-600",    countKey: "rider_assigned" },
              { id: "out_for_delivery",label: "Out for Delivery",icon: <MapPin className="w-3.5 h-3.5" />,     color: "text-amber-600",     countKey: "out_for_delivery" },
              { id: "delivered",       label: "Delivered",       icon: <CheckCircle className="w-3.5 h-3.5" />,color: "text-green-600",     countKey: "delivered" },
              { id: "cod_pending",     label: "COD Pending",     icon: <DollarSign className="w-3.5 h-3.5" />, color: "text-red-600",       countKey: "cod_pending" },
              { id: "paid",            label: "Paid",            icon: <CircleCheck className="w-3.5 h-3.5" />,color: "text-emerald-600",   countKey: "paid" },
            ].map(tab => {
              const cnt = (tabCounts as any)[tab.countKey];
              const isActive = deliveryFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setDeliveryFilterAndReset(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : `text-muted-foreground hover:bg-muted/50 ${tab.color}`
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {cnt !== undefined && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-0.5 ${
                      isActive
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {Number(cnt).toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Search + Status */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search order #, customer name or phone..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
            className="border border-border rounded-md px-3 py-2 text-sm bg-background min-w-[160px]">
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === "all" ? "All Status" : s.replace(/_/g, " ")}</option>)}
          </select>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Date From</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Date To</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Payment</Label>
              <select value={financialFilter} onChange={e => setFinancialFilter(e.target.value)}
                className="h-8 text-xs border border-border rounded-md px-2 bg-background">
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setDateFrom(""); setDateTo(""); setFinancialFilter("all"); }}>
              <X className="w-3 h-3 mr-1" /> Clear
            </Button>
          </div>
        )}
      </div>

      {/* Bulk selection hint */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 text-sm">
          <span className="font-medium text-primary">{selectedIds.length} orders selected</span>
          {unbookedSelected.length > 0 && <span className="text-muted-foreground">· {unbookedSelected.length} without tracking</span>}
          <div className="ml-auto flex gap-2">
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setShowBulkModal(true)}>
              <Truck className="w-3 h-3" /> Book Courier
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds([])}>
              <X className="w-3 h-3" /> Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-muted-foreground">Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No orders found</p>
            <p className="text-sm text-muted-foreground mt-1">Sync orders from Shopify or adjust your filters</p>
            <Button variant="outline" className="mt-4" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw className="w-4 h-4 mr-2" /> Sync from Shopify
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 accent-primary rounded" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Order</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">City</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tracking</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o: any) => {
                  const addr = o.shippingAddress ?? {};
                  const rowLahore = (addr.city ?? "").toLowerCase().includes("lahore");
                  const isSelected = selectedIds.includes(o.id);
                  return (
                    <tr key={o.id} className={`hover:bg-muted/20 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleOne(o.id)} className="w-4 h-4 accent-primary rounded" />
                      </td>
                      <td className="px-4 py-3">
                        <button className="font-semibold text-primary hover:underline" onClick={() => setSelectedOrder(o)}>
                          {o.orderNumber}
                        </button>
                        <div className="text-xs text-muted-foreground">
                          {o.shopifyCreatedAt ? new Date(o.shopifyCreatedAt).toLocaleDateString("en-PK", { day: "2-digit", month: "short" }) : "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{o.customerName || <span className="text-muted-foreground">Guest</span>}</div>
                        <div className="text-xs text-muted-foreground">{o.customerPhone || o.customerEmail || "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {rowLahore
                            ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full"><Navigation className="w-3 h-3" />{addr.city}</span>
                            : <span className="text-sm text-muted-foreground">{addr.city || "—"}</span>
                          }
                        </div>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-3"><StatusBadge status={o.financialStatus ?? "—"} /></td>
                      <td className="px-4 py-3 font-semibold">
                        PKR {parseFloat(o.totalPrice ?? "0").toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {o.riderName ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                              <Bike className="w-3 h-3" /> {o.riderName}
                            </span>
                            {o.riderStatus && <div><StatusBadge status={o.riderStatus} /></div>}
                          </div>
                        ) : o.shipmentCourierSlug ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <CourierBadge slug={o.shipmentCourierSlug} />
                              {(o.shipmentTrackingId ?? o.trackingNumber) && (
                                <button onClick={() => { navigator.clipboard.writeText(o.shipmentTrackingId ?? o.trackingNumber); toast({ title: "Copied!" }); }}
                                  className="font-mono text-xs text-primary hover:underline flex items-center gap-0.5">
                                  {(o.shipmentTrackingId ?? o.trackingNumber).slice(0, 12)}{((o.shipmentTrackingId ?? o.trackingNumber).length > 12 ? "…" : "")}
                                  <Copy className="w-2.5 h-2.5 ml-0.5" />
                                </button>
                              )}
                            </div>
                            {o.shipmentStatus && <div><StatusBadge status={o.shipmentStatus} /></div>}
                          </div>
                        ) : o.trackingNumber ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{o.trackingNumber.slice(0, 12)}{o.trackingNumber.length > 12 ? "…" : ""}</span>
                            <button onClick={() => { navigator.clipboard.writeText(o.trackingNumber); toast({ title: "Copied!" }); }}
                              className="text-muted-foreground hover:text-foreground">
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button className="text-xs text-primary hover:underline flex items-center gap-1" onClick={() => setSelectedOrder(o)}>
                            <Truck className="w-3 h-3" /> Book
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary" onClick={() => setSelectedOrder(o)} title="View Details">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" title="Book Courier"
                            onClick={() => { setSelectedOrder(o); }}>
                            <Truck className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} total orders</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={page === 1}>«</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-3 py-1 bg-primary text-primary-foreground rounded-md text-xs font-semibold">{page}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</Button>
          </div>
        </div>
      )}

      {/* Order Detail Panel */}
      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          couriers={couriers}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {/* Bulk Book Modal */}
      {showBulkModal && (
        <BulkBookModal
          orderIds={selectedIds}
          couriers={couriers}
          onClose={() => setShowBulkModal(false)}
          onDone={() => { setSelectedIds([]); qc.invalidateQueries({ queryKey: ["shopify-orders"] }); }}
        />
      )}
    </div>
  );
}
