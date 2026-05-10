import { useEffect, useMemo, useState, useCallback } from "react";
import { COURIER_CONFIGS, buildLabelHtml } from "@/lib/courierLabel";
import {
  Search, Package, Truck, MapPin, Edit2, X, Loader2,
  RefreshCw, Plus, Minus, Trash2, FileText, CreditCard, CheckCircle2, Printer,
  Home, Clock, ExternalLink, User, Phone, MessageCircle, Send, Download,
  Satellite, Copy, Navigation,
} from "lucide-react";
import {
  useListOrders,
  useUpdateOrderStatus,
  useUpdateOrderItems,
  useListProducts,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { printInvoice, type InvoiceOrder } from "@/lib/invoice";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/* ── helpers ──────────────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  confirmed: "bg-teal-50 text-teal-700 border-teal-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  shipped: "bg-purple-50 text-purple-700 border-purple-200",
  out_for_delivery: "bg-orange-50 text-orange-700 border-orange-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "⏳ Pending",
  confirmed: "✔ Confirmed",
  processing: "⚙ Processing",
  shipped: "🚚 Shipped",
  out_for_delivery: "🛵 Out for Delivery",
  delivered: "📦 Delivered",
  cancelled: "❌ Cancelled",
};

const COURIERS: Record<string, string> = {
  tcs: "TCS Couriers", leopards: "Leopards", postex: "PostEx", rider: "Rider", trax: "Trax",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-50 text-green-700 border-green-200",
  unpaid: "bg-red-50 text-red-700 border-red-200",
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
};

function PaymentStatusBadge({ status }: { status?: string }) {
  const s = status ?? "unpaid";
  return (
    <Badge variant="outline" className={PAYMENT_STATUS_COLORS[s] ?? ""}>
      {s === "paid" ? "✓ Paid" : s === "pending" ? "⏳ Pending" : "✗ Unpaid"}
    </Badge>
  );
}

const COURIER_SERVICE_MAP: Record<string, Array<{ value: string; label: string }>> = {
  postex: [
    { value: "Normal", label: "Overnight" },
    { value: "Reversed", label: "Overland" },
    { value: "Replacement", label: "Express" },
  ],
  tcs: [
    { value: "O", label: "Overnight (Express)" },
    { value: "OL", label: "Overland" },
    { value: "E", label: "Economy" },
  ],
  leopards: [
    { value: "overnight", label: "Overnight" },
    { value: "overland", label: "Overland" },
    { value: "express", label: "Express" },
  ],
  trax: [
    { value: "same_day", label: "Same Day" },
    { value: "overnight", label: "Overnight" },
    { value: "overland", label: "Overland" },
  ],
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={STATUS_COLORS[status] ?? ""}>
      {STATUS_LABELS[status] ?? status.replace(/_/g, " ")}
    </Badge>
  );
}

function fmt(ts?: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-PK", { month: "short", day: "numeric", year: "numeric" });
}

/* ── types ────────────────────────────────────────────── */
interface EditableItem {
  productId?: number | null;
  name: string;
  variant?: string | null;
  price: string;
  qty: number;
  gradient?: string | null;
}

/* ── Product Picker ──────────────────────────────────── */
function ProductPicker({ onAdd }: { onAdd: (item: EditableItem) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useListProducts({ limit: 100 });
  const products: any[] = data?.items ?? [];

  const filtered = q.trim()
    ? products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()))
    : products;

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search product to add…"
          className="pl-8 h-8 text-xs"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && filtered.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border rounded-lg shadow-xl max-h-48 overflow-y-auto">
            {filtered.slice(0, 12).map((p: any) => (
              <button
                key={p.id}
                onMouseDown={() => {
                  onAdd({ productId: p.id, name: p.name, price: String(p.price), qty: 1, gradient: p.gradient ?? null });
                  setQ("");
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
              >
                <div className={`w-7 h-7 rounded-md bg-gradient-to-br flex-shrink-0 ${p.gradient ?? "from-green-400 to-emerald-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">Rs. {Number(p.price).toLocaleString()}</p>
                </div>
                <Plus className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────── */
export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [viewOrder, setViewOrder] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"details" | "edit-status" | "edit-items">("details");

  /* ── WhatsApp Bulk Actions ── */
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [showBulkWA, setShowBulkWA] = useState(false);
  const [bulkWAMessage, setBulkWAMessage] = useState("Hi {customer_name}! Your order {order_number} has been dispatched. Thank you for shopping with KDF NUTS! 🥜");
  const toggleOrder = (id: number) => setSelectedOrders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = (ids: number[]) => setSelectedOrders(prev => prev.size === ids.length ? new Set() : new Set(ids));
  const sendOrderWA = useMutation({
    mutationFn: (orderId: number) => apiFetch(`/api/admin/whatsapp/send-order/${orderId}`, { method: "POST" }),
    onSuccess: (d: any) => toast({ title: d.success ? "WhatsApp sent!" : "Send failed", description: d.message, variant: d.success ? "default" : "destructive" }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const bulkSendWA = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/bulk-send", { method: "POST", body: JSON.stringify({ orderIds: Array.from(selectedOrders), message: bulkWAMessage }) }),
    onSuccess: (d: any) => { setShowBulkWA(false); setSelectedOrders(new Set()); toast({ title: "Bulk WhatsApp started!", description: d.message }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Book Courier ─── */
  const [showBookCourier, setShowBookCourier] = useState(false);
  const [courierBookingForm, setCourierBookingForm] = useState({
    courierSlug: "tcs", serviceCode: "O", weight: "0.5",
    codAmount: "", remarks: "", contentDesc: "KDF Nuts Products",
    specialInstructions: "", postexOrderType: "Normal",
  });
  const [courierBookingResult, setCourierBookingResult] = useState<{ trackingId: string; shipmentId: number } | null>(null);
  const activeCourierConf = COURIER_CONFIGS[courierBookingForm.courierSlug] ?? COURIER_CONFIGS.tcs;

  /* ── TCS Live Tracking ─── */
  const [orderTrack, setOrderTrack] = useState<{
    status: string;
    events: Array<{ dateTime: string; status: string; location: string; description: string }>;
    deliveryDate?: string;
    bookingDate?: string;
    consigneeName?: string;
    origin?: string;
    destination?: string;
    syncedAt: string;
  } | null>(null);
  const trackOrderMutation = useMutation({
    mutationFn: (cn: string) =>
      apiFetch(`/api/admin/couriers/tcs/track/${encodeURIComponent(cn)}`),
    onSuccess: (d: any) => {
      if (d.ok) {
        setOrderTrack({
          status:        d.status,
          events:        d.events ?? [],
          deliveryDate:  d.deliveryDate ?? undefined,
          bookingDate:   d.bookingDate  ?? undefined,
          consigneeName: d.consigneeName ?? undefined,
          origin:        d.origin       ?? undefined,
          destination:   d.destination  ?? undefined,
          syncedAt:      d.syncedAt,
        });
        toast({ title: "✅ Live tracking synced", description: `Status: ${d.status.replace(/_/g, " ")}` });
      } else {
        toast({ title: "Tracking returned no data", variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Tracking failed", description: e.message, variant: "destructive" }),
  });
  /* Reset track when switching orders */
  useEffect(() => { setOrderTrack(null); }, [viewOrder?.id]);
  const bookCourier = useMutation({
    mutationFn: (order: any) => apiFetch("/api/admin/couriers/manual-book", {
      method: "POST",
      body: JSON.stringify({
        orderId: order.id,
        courierSlug: courierBookingForm.courierSlug,
        customerName: order.shippingAddress?.name ?? "",
        phone: order.shippingAddress?.phone ?? "",
        address: order.shippingAddress?.address ?? "",
        city: order.shippingAddress?.city ?? "",
        codAmount: parseFloat(courierBookingForm.codAmount) || (order.paymentMethod === "cod" ? Number(order.total) : 0),
        weight: parseFloat(courierBookingForm.weight) || 0.5,
        serviceCode: courierBookingForm.serviceCode,
        remarks: courierBookingForm.remarks || order.notes || "",
        contentDesc: courierBookingForm.contentDesc,
        specialInstructions: courierBookingForm.specialInstructions,
        postexOrderType: courierBookingForm.postexOrderType,
      }),
    }),
    onSuccess: (d: any) => {
      setCourierBookingResult({ trackingId: d.trackingId, shipmentId: d.shipment?.id });
      setViewOrder((prev: any) => prev ? { ...prev, trackingId: d.trackingId, courier: courierBookingForm.courierSlug } : prev);
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      toast({ title: `Booked! ${activeCourierConf.trackingLabel}: ${d.trackingId}` });
    },
    onError: (e: any) => toast({ title: "Booking failed", description: e.message, variant: "destructive" }),
  });

  /* edit-status state */
  const [editStatus, setEditStatus] = useState("");
  const [editDeliveryType, setEditDeliveryType] = useState("courier");
  const [editCourier, setEditCourier] = useState("tcs");
  const [editCourierService, setEditCourierService] = useState("overnight");
  const [editTrackingId, setEditTrackingId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isBookingShipment, setIsBookingShipment] = useState(false);
  const [shipmentError, setShipmentError] = useState("");

  /* payment status state */
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  /* edit-items state */
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [editDiscount, setEditDiscount] = useState("0");
  const [isSavingItems, setIsSavingItems] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateStatusMutation = useUpdateOrderStatus();
  const updateItemsMutation = useUpdateOrderItems();

  /* PostEx live order types */
  const [postexOrderTypes, setPostexOrderTypes] = useState<Array<{ value: string; label: string }>>([]);
  const fetchPostexTypes = useCallback(() => {
    apiFetch("/api/admin/couriers/postex/order-types").then((types: string[]) => {
      const labelMap: Record<string, string> = { Normal: "Normal (Overnight)", Reversed: "Reversed (Return)", Replacement: "Replacement" };
      setPostexOrderTypes(types.map(t => ({ value: t, label: labelMap[t] ?? t })));
    }).catch(() => {
      setPostexOrderTypes([
        { value: "Normal", label: "Normal (Overnight)" },
        { value: "Reversed", label: "Reversed (Return)" },
        { value: "Replacement", label: "Replacement" },
      ]);
    });
  }, []);
  useEffect(() => { fetchPostexTypes(); }, [fetchPostexTypes]);

  /* ── Print Label ─────────────────────────────────── */
  const [isPrintingLabel, setIsPrintingLabel] = useState(false);
  const handlePrintLabel = useCallback(async (opts: {
    courierSlug?: string;
    trackingId?: string;
    shipmentId?: number;
    orderId?: number;
  }) => {
    const { courierSlug, trackingId, shipmentId, orderId } = opts;
    setIsPrintingLabel(true);
    try {
      /* PostEx → official airway-bill PDF straight from PostEx API */
      if (courierSlug === "postex" && trackingId) {
        const res = await fetch(
          `/api/admin/couriers/postex/airway-bill?trackingNumbers=${encodeURIComponent(trackingId)}`,
          { headers: { Authorization: `Bearer ${ADMIN_TOKEN()}` } },
        );
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          toast({ variant: "destructive", title: "Label error", description: (e as any).error ?? `HTTP ${res.status}` });
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank");
        if (!w) toast({ variant: "destructive", title: "Popup blocked", description: "Allow popups for this site to open the PDF." });
        return;
      }
      /* For orders with a known order ID → use order-level label route */
      if (orderId) {
        const res = await fetch(`/api/admin/orders/${orderId}/label`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN()}` } });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          toast({ variant: "destructive", title: "Label error", description: (e as any).error ?? `HTTP ${res.status}` });
          return;
        }
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("pdf")) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const w = window.open(url, "_blank");
          if (!w) toast({ variant: "destructive", title: "Popup blocked", description: "Allow popups for this site to open the PDF." });
          return;
        }
        const d = await res.json() as Record<string, unknown>;
        const html = buildLabelHtml(d);
        const w = window.open("", "_blank", "width=900,height=650");
        if (w) { w.document.write(html); w.document.close(); }
        return;
      }
      /* Fallback → shipment ID */
      if (shipmentId) {
        const res = await fetch(`/api/admin/shipments/${shipmentId}/label`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN()}` } });
        if (!res.ok) { toast({ variant: "destructive", title: "Could not load label" }); return; }
        const d = await res.json() as Record<string, unknown>;
        const html = buildLabelHtml(d);
        const w = window.open("", "_blank", "width=900,height=650");
        if (w) { w.document.write(html); w.document.close(); }
        return;
      }
      toast({ variant: "destructive", title: "No label available", description: "Book a courier first to generate a label." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Label error", description: e.message });
    } finally {
      setIsPrintingLabel(false);
    }
  }, [toast]);

  const courierServices = useMemo(() => {
    if (editCourier === "postex" && postexOrderTypes.length > 0) return postexOrderTypes;
    return COURIER_SERVICE_MAP[editCourier] ?? [];
  }, [editCourier, postexOrderTypes]);

  const queryParams: any = { page, limit: 20, ...(statusFilter !== "all" ? { status: statusFilter } : {}) };
  const { data: response, isLoading, refetch } = useListOrders(queryParams);

  const orders: any[] = response?.items ?? [];
  const total: number = response?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const filtered = search.trim()
    ? orders.filter(o =>
        o.orderNumber?.toLowerCase().includes(search.toLowerCase()) ||
        o.shippingAddress?.name?.toLowerCase().includes(search.toLowerCase()) ||
        o.shippingAddress?.phone?.includes(search)
      )
    : orders;

  /* live-calculated totals for edit-items tab */
  const compSubtotal = editItems.reduce((s, i) => s + parseFloat(i.price || "0") * i.qty, 0);
  const compDiscount = parseFloat(editDiscount || "0");
  const deliveryFee = Number(viewOrder?.deliveryFee ?? 0);
  const loyaltyD = Number(viewOrder?.loyaltyDiscount ?? 0);
  const walletD = Number(viewOrder?.walletDiscount ?? 0);
  const compTotal = Math.max(0, compSubtotal - compDiscount - loyaltyD - walletD + deliveryFee);

  function openView(order: any) {
    setViewOrder(order);
    setActiveTab("details");
    setShowBookCourier(false);
    setCourierBookingResult(null);
    setCourierBookingForm(p => ({
      ...p,
      codAmount: order.paymentMethod === "cod" ? String(order.total ?? "") : "",
      remarks: order.notes ?? "",
    }));
    setEditStatus(order.status);
    setEditDeliveryType(order.deliveryType ?? "courier");
    const courier = order.courier ?? "tcs";
    setEditCourier(courier);
    setEditCourierService(order.courierService ?? (courier === "postex" ? "Normal" : courier === "tcs" ? "O" : "overnight"));
    setEditTrackingId(order.trackingId ?? "");
    setEditNotes(order.notes ?? "");
    setEditItems((order.items ?? []).map((i: any) => ({
      productId: i.productId ?? null,
      name: i.name,
      variant: i.variant ?? null,
      price: String(i.price),
      qty: i.qty,
      gradient: i.gradient ?? null,
    })));
    setEditDiscount(String(order.discount ?? 0));
  }

  function closeDialog() { setViewOrder(null); }

  /* ── Save status update ─── */
  function handleSaveStatus() {
    if (!viewOrder) return;
    setIsSavingStatus(true);
    updateStatusMutation.mutate(
      { id: viewOrder.id, data: { status: editStatus as any, trackingId: editTrackingId || undefined, courier: editCourier || undefined, courierService: editCourierService || undefined, deliveryType: editDeliveryType || undefined } as any },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          toast({ title: "Order status updated" });
          setViewOrder((prev: any) => ({ ...prev, ...(updated as any), items: prev.items }));
          setActiveTab("details");
          setIsSavingStatus(false);
        },
        onError: () => { toast({ variant: "destructive", title: "Failed to update status" }); setIsSavingStatus(false); },
      }
    );
  }

  function handleBookShipment() {
    if (!viewOrder) return;
    setIsBookingShipment(true);
    setShipmentError("");
    apiFetch("/api/admin/shipments", {
      method: "POST",
      body: JSON.stringify({
        orderId: viewOrder.id,
        courierSlug: editCourier,
        service: editCourierService,
      }),
    }).then((shipment) => {
      setEditTrackingId(shipment.trackingId ?? "");
      setEditStatus("shipped");
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      toast({ title: "Shipment booked" });
      setViewOrder((prev: any) => ({ ...prev, trackingId: shipment.trackingId, courier: editCourier, status: "shipped" }));
    }).catch((e: any) => {
      const message = e instanceof Error ? e.message : String(e);
      setShipmentError(message);
      toast({ variant: "destructive", title: message });
    }).finally(() => setIsBookingShipment(false));
  }

  /* ── Update payment status ─── */
  async function handlePaymentStatus(paymentStatus: string) {
    if (!viewOrder) return;
    setIsUpdatingPayment(true);
    try {
      const updated = await apiFetch(`/api/orders/${viewOrder.id}/payment-status`, {
        method: "PATCH",
        body: JSON.stringify({ paymentStatus }),
      });
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      toast({ title: `Payment marked as ${paymentStatus}` });
      setViewOrder((prev: any) => ({ ...prev, paymentStatus: updated.paymentStatus }));
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message });
    } finally {
      setIsUpdatingPayment(false);
    }
  }

  /* ── Save items update ─── */
  function handleSaveItems() {
    if (!viewOrder || editItems.length === 0) return;
    setIsSavingItems(true);
    updateItemsMutation.mutate(
      {
        id: viewOrder.id,
        data: {
          items: editItems.map(i => ({
            productId: i.productId ?? undefined,
            name: i.name,
            variant: i.variant ?? undefined,
            price: i.price,
            qty: i.qty,
            gradient: i.gradient ?? undefined,
          })),
          discount: compDiscount,
          notes: editNotes || undefined,
        },
      },
      {
        onSuccess: (updated: any) => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          toast({ title: "Items updated & totals recalculated" });
          setViewOrder(updated);
          setEditItems((updated.items ?? []).map((i: any) => ({
            productId: i.productId, name: i.name, variant: i.variant,
            price: String(i.price), qty: i.qty, gradient: i.gradient,
          })));
          setEditDiscount(String(updated.discount ?? 0));
          setActiveTab("details");
          setIsSavingItems(false);
        },
        onError: () => { toast({ variant: "destructive", title: "Failed to update items" }); setIsSavingItems(false); },
      }
    );
  }

  /* ── Item helpers ─── */
  const addItem = (item: EditableItem) => {
    setEditItems(prev => {
      const idx = prev.findIndex(i => i.name === item.name);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, item];
    });
  };

  const removeItem = (idx: number) => setEditItems(prev => prev.filter((_, i) => i !== idx));

  const updateQty = (idx: number, qty: number) => {
    if (qty < 1) { removeItem(idx); return; }
    setEditItems(prev => prev.map((item, i) => i === idx ? { ...item, qty } : item));
  };

  const updatePrice = (idx: number, price: string) =>
    setEditItems(prev => prev.map((item, i) => i === idx ? { ...item, price } : item));

  const TAB = (t: string) =>
    `px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
      activeTab === t ? "border-green-600 text-green-700" : "border-transparent text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground text-sm mt-1">{total} total order{total !== 1 ? "s" : ""}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by order #, name, phone…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="pending">⏳ Pending</SelectItem>
            <SelectItem value="confirmed">✔ Confirmed</SelectItem>
            <SelectItem value="processing">⚙ Processing</SelectItem>
            <SelectItem value="shipped">🚚 Shipped</SelectItem>
            <SelectItem value="out_for_delivery">🛵 Out for Delivery</SelectItem>
            <SelectItem value="delivered">📦 Delivered</SelectItem>
            <SelectItem value="cancelled">❌ Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk WhatsApp Action Bar */}
      {selectedOrders.size > 0 && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <MessageCircle className="w-4 h-4 text-green-700 flex-shrink-0" />
          <span className="text-sm font-medium text-green-800">{selectedOrders.size} order{selectedOrders.size !== 1 ? "s" : ""} selected</span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => setSelectedOrders(new Set())} className="text-muted-foreground">Clear</Button>
          <Button size="sm" onClick={() => setShowBulkWA(true)} style={{ backgroundColor: "#25D366" }} className="text-white gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" /> Send Bulk WhatsApp
          </Button>
        </div>
      )}

      {/* Bulk WhatsApp Modal */}
      {showBulkWA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowBulkWA(false)}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2"><MessageCircle className="w-5 h-5 text-green-600" /> Bulk WhatsApp</h3>
              <button onClick={() => setShowBulkWA(false)} className="p-1.5 rounded-full hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <p className="text-sm text-muted-foreground">Sending to <strong>{selectedOrders.size} order{selectedOrders.size !== 1 ? "s" : ""}</strong> with rate limiting from your WhatsApp settings.</p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Message</label>
              <textarea value={bulkWAMessage} onChange={e => setBulkWAMessage(e.target.value)} rows={5} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none" />
              <p className="text-xs text-muted-foreground">Variables: <code className="bg-muted px-1 rounded">{`{customer_name}`}</code> <code className="bg-muted px-1 rounded">{`{order_number}`}</code></p>
            </div>
            <div className="flex gap-3 pt-1">
              <Button onClick={() => bulkSendWA.mutate()} disabled={bulkSendWA.isPending || !bulkWAMessage} style={{ backgroundColor: "#25D366" }} className="text-white flex-1">
                {bulkSendWA.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</> : <><Send className="w-4 h-4 mr-2" />Send to {selectedOrders.size} Orders</>}
              </Button>
              <Button variant="outline" onClick={() => setShowBulkWA(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input type="checkbox" className="rounded" checked={filtered.length > 0 && selectedOrders.size === filtered.map(o => o.id).length} onChange={() => toggleAll(filtered.map(o => o.id))} />
              </TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? [...Array(6)].map((_, i) => (
                  <TableRow key={i}>
                    {[32, 140, 120, 60, 80, 90, 90, 100].map((w, j) => (
                      <TableCell key={j}><Skeleton className={`h-5 w-[${w}px]`} /></TableCell>
                    ))}
                  </TableRow>
                ))
              : filtered.length > 0
              ? filtered.map(order => (
                  <TableRow key={order.id} className={`cursor-pointer hover:bg-muted/40 ${selectedOrders.has(order.id) ? "bg-green-50/60" : ""}`} onClick={() => openView(order)}>
                    <TableCell onClick={e => { e.stopPropagation(); toggleOrder(order.id); }} className="w-10">
                      <input type="checkbox" className="rounded" checked={selectedOrders.has(order.id)} onChange={() => toggleOrder(order.id)} />
                    </TableCell>
                    <TableCell>
                      <div className="font-mono font-semibold text-sm">{order.orderNumber}</div>
                      <div className="text-xs text-muted-foreground">{fmt(order.createdAt)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{order.shippingAddress?.name ?? "Guest"}</div>
                      <div className="text-xs text-muted-foreground">{order.shippingAddress?.phone ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {order.items?.length ?? 0} item{(order.items?.length ?? 0) !== 1 ? "s" : ""}
                    </TableCell>
                    <TableCell className="font-bold text-sm">Rs. {Number(order.total).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground capitalize">
                        {order.deliveryType === "self" ? "🏪 Self" : `🚚 ${COURIERS[order.courier ?? "tcs"] ?? order.courier}`}
                      </div>
                      {order.trackingId && <div className="text-xs font-mono text-blue-600 mt-0.5">{order.trackingId}</div>}
                    </TableCell>
                    <TableCell><StatusBadge status={order.status} /></TableCell>
                    <TableCell><PaymentStatusBadge status={order.paymentStatus} /></TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5 justify-end">
                        <Button
                          variant="ghost" size="sm"
                          title="Print Invoice"
                          onClick={() => printInvoice(order as InvoiceOrder)}
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => openView(order)}>
                          <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Manage
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              : (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Package className="w-8 h-8 opacity-30" />
                      <span className="text-sm">{search ? "No orders match your search." : "No orders found."}</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* ─────────────── ORDER DIALOG ─────────────────────── */}
      <Dialog open={!!viewOrder} onOpenChange={o => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0">
          {viewOrder && (
            <>
              {/* Sticky header with tabs */}
              <div className="sticky top-0 bg-background z-10 border-b">
                <div className="flex items-center justify-between px-6 pt-5 pb-3">
                  <div className="flex items-center gap-3">
                    <DialogTitle className="font-mono text-base">{viewOrder.orderNumber}</DialogTitle>
                    <StatusBadge status={viewOrder.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => sendOrderWA.mutate(viewOrder.id)} disabled={sendOrderWA.isPending} title="Send WhatsApp confirmation" className="border-green-200 text-green-700 hover:bg-green-50">
                      {sendOrderWA.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => printInvoice(viewOrder as InvoiceOrder)}>
                      <FileText className="w-3.5 h-3.5 mr-1.5" /> Invoice PDF
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => { setShowBookCourier(v => !v); setCourierBookingResult(null); }}
                      className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    >
                      <Truck className="w-3.5 h-3.5 mr-1.5" /> Book Courier
                    </Button>
                    <button onClick={closeDialog} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
                <div className="flex gap-0 px-6 overflow-x-auto">
                  <button className={TAB("details")} onClick={() => setActiveTab("details")}>Order Details</button>
                  <button className={TAB("edit-items")} onClick={() => setActiveTab("edit-items")}>✏️ Edit Items</button>
                  <button className={TAB("edit-status")} onClick={() => setActiveTab("edit-status")}>🚚 Update Status</button>
                </div>
              </div>

              {/* ── Book Courier Panel ─────────────────────── */}
              {showBookCourier && (
                <div className="border-b border-indigo-200 bg-indigo-50 px-6 py-4">
                  {courierBookingResult ? (
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-green-500 rounded-full flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-green-800 text-sm">Booking Confirmed!</p>
                          <p className="font-mono text-base font-black text-green-700">{courierBookingResult.trackingId}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline" className="border-green-300 text-green-700"
                          disabled={isPrintingLabel}
                          onClick={() => handlePrintLabel({
                            courierSlug: courierBookingForm.courierSlug,
                            trackingId: courierBookingResult.trackingId,
                            shipmentId: courierBookingResult.shipmentId,
                          })}
                        >
                          {isPrintingLabel
                            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            : <Printer className="w-3.5 h-3.5 mr-1.5" />}
                          {courierBookingForm.courierSlug === "postex" ? "Print Official Label (PDF)" : "Print Label"}
                        </Button>
                        {courierBookingResult.trackingId && (
                          <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={async () => {
                              const { downloadTcsLabel: dl } = await import("@/lib/courierLabel");
                              const result = await dl(courierBookingResult.trackingId, courierBookingResult.shipmentId);
                              if (result.success && !result.fallback) toast({ title: "✅ PDF downloaded" });
                              else if (result.success) toast({ title: "Label saved", description: "Open → Print → Save as PDF" });
                              else toast({ title: "Download failed", variant: "destructive" });
                            }}
                          >
                            <Download className="w-3.5 h-3.5 mr-1.5" />Download PDF
                          </Button>
                        )}
                        {courierBookingResult.shipmentId && (
                          <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50"
                            onClick={async () => {
                              const { openThermalLabel: ot } = await import("@/lib/courierLabel");
                              await ot(courierBookingResult.shipmentId);
                            }}
                          >
                            <Printer className="w-3.5 h-3.5 mr-1.5 text-purple-600" />Thermal
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setShowBookCourier(false)}>Done</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-indigo-800 flex items-center gap-2"><Truck className="w-4 h-4" />Book Courier for this Order</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-xs">Courier</Label>
                          <select value={courierBookingForm.courierSlug}
                            onChange={e => setCourierBookingForm(p => ({
                              ...p,
                              courierSlug: e.target.value,
                              serviceCode: COURIER_CONFIGS[e.target.value]?.serviceTypes[0]?.code ?? "O",
                            }))}
                            className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-background mt-1">
                            {Object.entries(COURIER_CONFIGS).map(([slug, cfg]) => (
                              <option key={slug} value={slug}>{cfg.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Service Type</Label>
                          <select value={courierBookingForm.serviceCode}
                            onChange={e => setCourierBookingForm(p => ({ ...p, serviceCode: e.target.value }))}
                            className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-background mt-1">
                            {activeCourierConf.serviceTypes.map((s: { code: string; label: string }) => (
                              <option key={s.code} value={s.code}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Weight (KG)</Label>
                          <Input value={courierBookingForm.weight} onChange={e => setCourierBookingForm(p => ({ ...p, weight: e.target.value }))} type="number" step="0.1" className="text-xs mt-1 h-8" />
                        </div>
                        <div>
                          <Label className="text-xs">COD Amount (₨)</Label>
                          <Input value={courierBookingForm.codAmount} onChange={e => setCourierBookingForm(p => ({ ...p, codAmount: e.target.value }))} placeholder={viewOrder.paymentMethod === "cod" ? String(viewOrder.total) : "0"} type="number" className="text-xs mt-1 h-8" />
                        </div>
                      </div>
                      {/* Leopards: special instructions */}
                      {courierBookingForm.courierSlug === "leopards" && (
                        <div>
                          <Label className="text-xs">Special Instructions</Label>
                          <Input value={courierBookingForm.specialInstructions} onChange={e => setCourierBookingForm(p => ({ ...p, specialInstructions: e.target.value }))} placeholder="Handle with care, fragile, etc." className="text-xs mt-1 h-8" />
                        </div>
                      )}
                      {/* PostEx: order type */}
                      {courierBookingForm.courierSlug === "postex" && (
                        <div>
                          <Label className="text-xs">PostEx Order Type</Label>
                          <select value={courierBookingForm.postexOrderType} onChange={e => setCourierBookingForm(p => ({ ...p, postexOrderType: e.target.value }))} className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-background mt-1">
                            <option value="Normal">Normal (Overnight)</option>
                            <option value="Reversed">Reversed (Return)</option>
                            <option value="Replacement">Replacement</option>
                          </select>
                        </div>
                      )}
                      <div>
                        <Label className="text-xs">Remarks</Label>
                        <Input value={courierBookingForm.remarks} onChange={e => setCourierBookingForm(p => ({ ...p, remarks: e.target.value }))} placeholder="Optional notes" className="text-xs mt-1 h-8" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => bookCourier.mutate(viewOrder)} disabled={bookCourier.isPending} className="bg-indigo-600 hover:bg-indigo-700">
                          {bookCourier.isPending
                            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Booking…</>
                            : <><Truck className="w-3.5 h-3.5 mr-1.5" />Book via {activeCourierConf.name}</>}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowBookCourier(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="px-6 py-5">

                {/* ── TAB: DETAILS ─────────────────────────── */}
                {activeTab === "details" && (() => {
                  const ORDER_STEPS = [
                    { key: "pending",          label: "Placed",          icon: Clock },
                    { key: "confirmed",        label: "Confirmed",        icon: CheckCircle2 },
                    { key: "processing",       label: "Processing",       icon: Package },
                    { key: "shipped",          label: "Shipped",          icon: Truck },
                    { key: "out_for_delivery", label: "Out for Delivery", icon: MapPin },
                    { key: "delivered",        label: "Delivered",        icon: Home },
                  ];
                  const STEP_TIME_FIELDS: Record<string, string> = {
                    pending: "createdAt", confirmed: "confirmedAt", processing: "packedAt",
                    shipped: "shippedAt", out_for_delivery: "outForDeliveryAt", delivered: "deliveredAt",
                  };
                  const STATUS_IDX: Record<string, number> = {
                    pending: 0, confirmed: 1, processing: 2, shipped: 3, out_for_delivery: 4, delivered: 5, cancelled: -1,
                  };
                  const stepIdx = STATUS_IDX[viewOrder.status] ?? 0;
                  const isCancelled = viewOrder.status === "cancelled";

                  /* Quick action: advance to next natural status */
                  const NEXT_STATUS: Record<string, string> = {
                    pending: "confirmed", confirmed: "processing", processing: "shipped",
                    shipped: "out_for_delivery", out_for_delivery: "delivered",
                  };
                  const NEXT_LABEL: Record<string, string> = {
                    pending: "✔ Confirm Order", confirmed: "⚙ Start Processing", processing: "🚚 Mark Shipped",
                    shipped: "🛵 Out for Delivery", out_for_delivery: "📦 Mark Delivered",
                  };
                  const nextStatus = NEXT_STATUS[viewOrder.status];
                  const nextLabel = NEXT_LABEL[viewOrder.status];

                  async function quickAdvance(status: string) {
                    setIsSavingStatus(true);
                    try {
                      const updated = await apiFetch(`/api/orders/${viewOrder.id}/status`, {
                        method: "PATCH",
                        body: JSON.stringify({ status }),
                      });
                      setViewOrder((prev: any) => ({ ...prev, ...updated }));
                      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
                    } catch (e: any) { toast({ variant: "destructive", title: e.message }); }
                    finally { setIsSavingStatus(false); }
                  }

                  return (
                    <div className="space-y-5">

                      {/* ── Quick Action Bar ── */}
                      {!isCancelled && nextStatus && (
                        <div className={`rounded-xl p-4 border flex items-center justify-between gap-4 ${
                          viewOrder.status === "pending" ? "bg-amber-50 border-amber-200" : "bg-teal-50 border-teal-200"
                        }`}>
                          <div>
                            <p className={`text-sm font-bold ${viewOrder.status === "pending" ? "text-amber-900" : "text-teal-900"}`}>
                              Current: {STATUS_LABELS[viewOrder.status]}
                            </p>
                            <p className={`text-xs mt-0.5 ${viewOrder.status === "pending" ? "text-amber-700" : "text-teal-700"}`}>
                              {viewOrder.status === "pending" && viewOrder.paymentMethod === "cod"
                                ? "COD order — click to confirm after verifying customer"
                                : viewOrder.status === "pending"
                                ? "Online payment received — click to confirm"
                                : "Click to advance to next stage"}
                            </p>
                          </div>
                          <button
                            onClick={() => quickAdvance(nextStatus)}
                            disabled={isSavingStatus}
                            className={`px-4 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center gap-2 whitespace-nowrap ${
                              viewOrder.status === "pending" ? "bg-amber-500 hover:bg-amber-600" : "bg-teal-600 hover:bg-teal-700"
                            }`}
                          >
                            {isSavingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {nextLabel}
                          </button>
                        </div>
                      )}

                      {/* ── Status Timeline ── */}
                      <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-100 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Order Progress</p>
                          {isCancelled && (
                            <span className="px-2.5 py-1 text-xs font-bold bg-red-50 text-red-600 border border-red-200 rounded-full">Cancelled</span>
                          )}
                        </div>
                        {!isCancelled ? (
                          <div className="relative">
                            <div className="absolute top-5 left-5 right-5 h-0.5 bg-slate-100">
                              <div
                                className="h-full bg-green-500 transition-all duration-500"
                                style={{ width: stepIdx >= 0 ? `${(stepIdx / (ORDER_STEPS.length - 1)) * 100}%` : "0%" }}
                              />
                            </div>
                            <div className="flex justify-between relative">
                              {ORDER_STEPS.map((step, i) => {
                                const done = i <= stepIdx;
                                const active = i === stepIdx;
                                const StepIcon = step.icon;
                                const ts = viewOrder[STEP_TIME_FIELDS[step.key] ?? ""];
                                return (
                                  <div key={step.key} className="flex flex-col items-center gap-1.5 flex-1">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 transition-all ${
                                      done ? "bg-green-500 border-green-500 shadow-md shadow-green-200" : "bg-white border-slate-200"
                                    } ${active ? "scale-110" : ""}`}>
                                      <StepIcon className={`w-4 h-4 ${done ? "text-white" : "text-slate-300"}`} />
                                    </div>
                                    <p className={`text-[10px] font-bold text-center leading-tight ${done ? "text-green-600" : "text-slate-300"}`}>{step.label}</p>
                                    {ts && (
                                      <p className="text-[9px] text-slate-400 text-center leading-tight">
                                        {new Date(ts).toLocaleString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 bg-red-50 rounded-lg p-3 border border-red-100">
                            <X className="w-5 h-5 text-red-500 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-semibold text-red-700">Order Cancelled</p>
                              <p className="text-xs text-red-500">{fmt(viewOrder.createdAt)}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ── Main grid ── */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                        {/* Left: Customer + Delivery */}
                        <div className="space-y-4">

                          {/* Customer card */}
                          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5" /> Customer
                            </h4>
                            <div className="space-y-2.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                  <span className="text-green-700 text-sm font-bold">
                                    {(viewOrder.shippingAddress?.name ?? "G")[0].toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{viewOrder.shippingAddress?.name ?? "Guest"}</p>
                                  <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <Phone className="w-3 h-3" />{viewOrder.shippingAddress?.phone ?? "—"}
                                  </p>
                                </div>
                              </div>
                              <div className="bg-slate-50 rounded-lg p-2.5 text-xs text-slate-600 space-y-0.5">
                                <p className="flex items-start gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                                  <span>{viewOrder.shippingAddress?.address}</span>
                                </p>
                                <p className="pl-5 text-slate-400">
                                  {viewOrder.shippingAddress?.city}{viewOrder.shippingAddress?.country ? `, ${viewOrder.shippingAddress.country}` : ""}
                                  {viewOrder.shippingAddress?.postalCode ? ` ${viewOrder.shippingAddress.postalCode}` : ""}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Delivery card */}
                          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                              <Truck className="w-3.5 h-3.5" /> Delivery & Payment
                            </h4>
                            <div className="space-y-2 text-sm">
                              {[
                                { label: "Type",    value: viewOrder.deliveryType === "self" ? "🏪 Self Delivery" : "🚚 Courier" },
                                { label: "Courier", value: COURIERS[viewOrder.courier] ?? viewOrder.courier ?? "—" },
                                { label: "Payment", value: viewOrder.paymentMethod?.replace(/_/g, " ")?.replace(/\b\w/g, (c: string) => c.toUpperCase()) },
                              ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between items-center">
                                  <span className="text-slate-500 text-xs">{label}</span>
                                  <span className="font-medium text-slate-800 text-xs">{value}</span>
                                </div>
                              ))}

                              {viewOrder.trackingId && (
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 text-xs">Tracking ID</span>
                                  <a
                                    href={
                                      viewOrder.courier === "postex"
                                        ? `https://postex.pk/tracking?trackingNumber=${viewOrder.trackingId}`
                                        : viewOrder.courier === "leopards"
                                          ? `https://leopardscourier.com/track-a-parcel/?track_number=${viewOrder.trackingId}`
                                          : `https://www.tcscouriers.com.pk/tracking?tracking=${viewOrder.trackingId}`
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-xs text-blue-600 font-bold flex items-center gap-1 hover:text-blue-700"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {viewOrder.trackingId} <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              )}
                              {viewOrder.trackingId && (
                                <div className="pt-1 flex flex-col gap-1.5">
                                  <button
                                    disabled={isPrintingLabel}
                                    onClick={() => handlePrintLabel({
                                      courierSlug: viewOrder.courier,
                                      trackingId: viewOrder.trackingId,
                                      orderId: viewOrder.id,
                                    })}
                                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold rounded-lg border-2 border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-400 transition-all disabled:opacity-50"
                                  >
                                    {isPrintingLabel
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <Printer className="w-3 h-3" />}
                                    {viewOrder.courier === "postex" ? "Print Official Label (PDF)" : "Print Label"}
                                  </button>
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={async () => {
                                        const { downloadTcsLabel: dl } = await import("@/lib/courierLabel");
                                        const result = await dl(viewOrder.trackingId ?? "", viewOrder.shipmentId);
                                        if (result.success && !result.fallback) toast({ title: "✅ PDF downloaded" });
                                        else if (result.success) toast({ title: "Label saved", description: "Open → Print → Save as PDF" });
                                        else toast({ title: "Download failed", variant: "destructive" });
                                      }}
                                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold rounded-lg border-2 border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all"
                                    >
                                      <Download className="w-3 h-3" /> Download PDF
                                    </button>
                                    <button
                                      onClick={async () => {
                                        const { openThermalLabel: ot } = await import("@/lib/courierLabel");
                                        if (viewOrder.shipmentId) await ot(viewOrder.shipmentId);
                                      }}
                                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold rounded-lg border-2 border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-all"
                                    >
                                      <Printer className="w-3 h-3 text-purple-600" /> Thermal
                                    </button>
                                  </div>

                                  {/* TCS Track Shipment buttons */}
                                  {(viewOrder.courier === "tcs" || !viewOrder.courier) && (
                                    <div className="flex gap-1.5">
                                      <button
                                        disabled={trackOrderMutation.isPending}
                                        onClick={() => trackOrderMutation.mutate(viewOrder.trackingId)}
                                        className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold rounded-lg border-2 border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 transition-all disabled:opacity-50"
                                      >
                                        <Satellite className={`w-3 h-3 ${trackOrderMutation.isPending ? "animate-pulse" : ""}`} />
                                        {trackOrderMutation.isPending ? "Tracking…" : orderTrack ? "Refresh Track" : "Track Shipment"}
                                      </button>
                                      <button
                                        onClick={() => { navigator.clipboard.writeText(viewOrder.trackingId); toast({ title: "CN Copied!" }); }}
                                        className="flex items-center justify-center gap-1 px-3 py-1.5 text-[10px] font-bold rounded-lg border-2 border-slate-200 text-slate-600 bg-slate-50 hover:bg-slate-100 transition-all"
                                        title="Copy CN"
                                      >
                                        <Copy className="w-3 h-3" />
                                      </button>
                                      <a
                                        href={`https://ociconnect.tcscourier.com/tracking/index.html?cg=${encodeURIComponent(viewOrder.trackingId)}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-1 px-3 py-1.5 text-[10px] font-bold rounded-lg border-2 border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-all"
                                        title="Open TCS Tracking"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Live Tracking Panel */}
                              {orderTrack && (
                                <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2.5 text-xs mt-1">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 font-semibold text-violet-800">
                                      <Satellite className="w-3.5 h-3.5" /> TCS Live Tracking
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-violet-400 font-mono text-[10px]">{new Date(orderTrack.syncedAt).toLocaleTimeString()}</span>
                                      <button onClick={() => trackOrderMutation.mutate(viewOrder.trackingId)} disabled={trackOrderMutation.isPending} className="text-violet-400 hover:text-violet-700 disabled:opacity-40">
                                        <RefreshCw className={`w-3 h-3 ${trackOrderMutation.isPending ? "animate-spin" : ""}`} />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                      orderTrack.status === "delivered" ? "bg-green-100 text-green-700 border-green-200" :
                                      orderTrack.status.includes("transit") ? "bg-blue-100 text-blue-700 border-blue-200" :
                                      orderTrack.status.includes("delivery") ? "bg-orange-100 text-orange-700 border-orange-200" :
                                      orderTrack.status === "returned" ? "bg-rose-100 text-rose-700 border-rose-200" :
                                      "bg-slate-100 text-slate-600 border-slate-200"
                                    }`}>
                                      {orderTrack.status.replace(/_/g, " ").toUpperCase()}
                                    </span>
                                  </div>

                                  {(orderTrack.origin || orderTrack.destination || orderTrack.deliveryDate) && (
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-violet-700 bg-white/70 rounded-lg p-2 border border-violet-100">
                                      {orderTrack.origin       && (<><span className="font-semibold text-violet-500">From:</span><span>{orderTrack.origin}</span></>)}
                                      {orderTrack.destination  && (<><span className="font-semibold text-violet-500">To:</span><span>{orderTrack.destination}</span></>)}
                                      {orderTrack.bookingDate  && (<><span className="font-semibold text-violet-500">Booked:</span><span>{orderTrack.bookingDate}</span></>)}
                                      {orderTrack.deliveryDate && (<><span className="font-semibold text-green-600">Delivered:</span><span className="text-green-700 font-bold">{orderTrack.deliveryDate}</span></>)}
                                    </div>
                                  )}

                                  {orderTrack.events.length > 0 && (
                                    <div className="space-y-1">
                                      <p className="font-semibold text-violet-700 flex items-center gap-1">
                                        <Navigation className="w-3 h-3" /> Timeline ({orderTrack.events.length})
                                      </p>
                                      <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
                                        {orderTrack.events.map((ev, i) => (
                                          <div key={i} className="flex items-start gap-1.5">
                                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${i === 0 ? "bg-violet-500" : "bg-violet-200"}`} />
                                            <div className="flex-1">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-semibold text-violet-800 capitalize">{ev.status || ev.description}</span>
                                                {ev.location && <span className="text-violet-400">— {ev.location}</span>}
                                              </div>
                                              {ev.dateTime && <span className="text-violet-400 text-[10px] font-mono">{ev.dateTime}</span>}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {orderTrack.events.length === 0 && (
                                    <p className="text-violet-400 italic">No timeline events — shipment may be newly booked.</p>
                                  )}
                                </div>
                              )}

                              {viewOrder.referenceNumber && (
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 text-xs">Reference No.</span>
                                  <span className="font-mono text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-bold">{viewOrder.referenceNumber}</span>
                                </div>
                              )}

                              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                <span className="text-slate-500 text-xs">Payment Status</span>
                                <PaymentStatusBadge status={viewOrder.paymentStatus} />
                              </div>
                            </div>

                            {/* Payment quick-update */}
                            <div className="flex gap-1.5 mt-3 pt-3 border-t border-slate-100">
                              {["unpaid", "pending", "paid"].map(s => (
                                <button
                                  key={s}
                                  disabled={isUpdatingPayment || viewOrder.paymentStatus === s}
                                  onClick={() => handlePaymentStatus(s)}
                                  className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg border-2 transition-all disabled:opacity-50 ${
                                    viewOrder.paymentStatus === s
                                      ? s === "paid" ? "border-green-500 bg-green-50 text-green-700"
                                        : s === "pending" ? "border-yellow-400 bg-yellow-50 text-yellow-700"
                                        : "border-red-400 bg-red-50 text-red-700"
                                      : "border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700"
                                  }`}
                                >
                                  {isUpdatingPayment && viewOrder.paymentStatus !== s
                                    ? <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                                    : s === "paid" ? "✓ Paid" : s === "pending" ? "⏳ Pending" : "✗ Unpaid"}
                                </button>
                              ))}
                            </div>
                          </div>

                          {viewOrder.couponCode && (
                            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-sm flex items-center gap-2">
                              🎟️ <span className="text-slate-600">Coupon:</span> <span className="font-mono font-bold text-green-700">{viewOrder.couponCode}</span>
                            </div>
                          )}
                          {viewOrder.notes && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-sm flex items-start gap-2">
                              📝 <span className="text-amber-800">{viewOrder.notes}</span>
                            </div>
                          )}
                        </div>

                        {/* Right: Items + Order Summary */}
                        <div className="space-y-4">
                          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                              <Package className="w-4 h-4 text-slate-500" />
                              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                Order Items ({viewOrder.items?.length ?? 0})
                              </h4>
                            </div>
                            <div className="divide-y divide-slate-50 max-h-[260px] overflow-y-auto">
                              {(viewOrder.items?.length ?? 0) > 0
                                ? viewOrder.items.map((item: any, i: number) => (
                                    <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br flex-shrink-0 shadow-sm ${item.gradient ?? "from-green-300 to-emerald-500"}`} />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                                        {item.variant && <p className="text-xs text-slate-400">{item.variant}</p>}
                                      </div>
                                      <div className="text-right flex-shrink-0">
                                        <p className="text-xs text-slate-400">×{item.qty}</p>
                                        <p className="text-sm font-bold text-slate-900">Rs. {(Number(item.price) * item.qty).toLocaleString()}</p>
                                      </div>
                                    </div>
                                  ))
                                : <p className="text-sm text-slate-400 text-center py-10">No items</p>
                              }
                            </div>
                            {/* Order totals */}
                            <div className="bg-slate-50 px-4 py-3 border-t border-slate-100 space-y-1.5">
                              {[
                                { label: "Subtotal",      value: `Rs. ${Number(viewOrder.subtotal).toLocaleString()}`,             show: true },
                                { label: "Discount",      value: `-Rs. ${Number(viewOrder.discount).toLocaleString()}`,            show: Number(viewOrder.discount) > 0, green: true },
                                { label: "Delivery",      value: `Rs. ${Number(viewOrder.deliveryFee ?? 0).toLocaleString()}`,    show: true },
                                { label: "Loyalty",       value: `-Rs. ${Number(viewOrder.loyaltyDiscount).toLocaleString()}`,    show: Number(viewOrder.loyaltyDiscount) > 0, purple: true },
                                { label: "Wallet",        value: `-Rs. ${Number(viewOrder.walletDiscount).toLocaleString()}`,     show: Number(viewOrder.walletDiscount) > 0, blue: true },
                              ].filter(r => r.show).map(({ label, value, green, purple, blue }) => (
                                <div key={label} className="flex justify-between text-xs">
                                  <span className="text-slate-500">{label}</span>
                                  <span className={green ? "text-green-600 font-semibold" : purple ? "text-purple-600 font-semibold" : blue ? "text-blue-600 font-semibold" : "text-slate-700"}>{value}</span>
                                </div>
                              ))}
                              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                                <span className="text-sm font-bold text-slate-800">Total</span>
                                <span className="text-base font-black text-green-700">Rs. {Number(viewOrder.total).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          {/* Timestamps */}
                          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" /> Event Log
                            </h4>
                            <div className="space-y-2">
                              {[
                                { label: "Ordered",          value: viewOrder.createdAt },
                                { label: "Confirmed",        value: viewOrder.confirmedAt },
                                { label: "Packed",           value: viewOrder.packedAt },
                                { label: "Shipped",          value: viewOrder.shippedAt },
                                { label: "Out for Delivery", value: viewOrder.outForDeliveryAt },
                                { label: "Delivered",        value: viewOrder.deliveredAt },
                              ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between items-center">
                                  <span className="text-xs text-slate-500">{label}</span>
                                  <span className={`text-xs font-medium ${value ? "text-green-700" : "text-slate-300"}`}>
                                    {value ? new Date(value).toLocaleString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "—"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── TAB: EDIT ITEMS ──────────────────────── */}
                {activeTab === "edit-items" && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="font-semibold">Edit Order Items</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Add, remove or update quantities — totals will be recalculated automatically.</p>
                    </div>

                    {/* Product search / add */}
                    <div>
                      <Label className="text-xs mb-1.5 block">Add Product from Catalog</Label>
                      <ProductPicker onAdd={addItem} />
                    </div>

                    {/* Items table */}
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/60">
                          <tr className="text-xs">
                            <th className="text-left px-3 py-2.5 font-semibold">Product</th>
                            <th className="text-center px-3 py-2.5 font-semibold w-28">Qty</th>
                            <th className="text-right px-3 py-2.5 font-semibold w-36">Unit Price</th>
                            <th className="text-right px-3 py-2.5 font-semibold w-28">Subtotal</th>
                            <th className="w-10 px-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {editItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-muted/20 transition-colors">
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2.5">
                                  <div className={`w-8 h-8 rounded-md flex-shrink-0 bg-gradient-to-br ${item.gradient ?? "from-green-300 to-emerald-500"}`} />
                                  <div>
                                    <p className="font-medium truncate max-w-[160px] text-sm">{item.name}</p>
                                    {item.variant && <p className="text-xs text-muted-foreground">{item.variant}</p>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => updateQty(idx, item.qty - 1)} className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted active:scale-95 transition-all">
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-8 text-center font-bold text-sm">{item.qty}</span>
                                  <button onClick={() => updateQty(idx, item.qty + 1)} className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted active:scale-95 transition-all">
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-xs text-muted-foreground">Rs.</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={item.price}
                                    onChange={e => updatePrice(idx, e.target.value)}
                                    className="w-24 h-7 text-right text-xs"
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold text-sm">
                                Rs. {(parseFloat(item.price || "0") * item.qty).toLocaleString()}
                              </td>
                              <td className="px-2 py-2.5">
                                <button onClick={() => removeItem(idx)} className="w-7 h-7 rounded-md flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {editItems.length === 0 && (
                            <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No items — search above to add products</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Discount override */}
                    <div className="flex items-center gap-3 max-w-xs">
                      <Label className="text-xs whitespace-nowrap">Discount (Rs.)</Label>
                      <Input type="number" min="0" value={editDiscount} onChange={e => setEditDiscount(e.target.value)} className="h-8 text-sm" />
                    </div>

                    {/* Live totals */}
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2 text-sm">
                      <p className="text-xs font-bold text-green-800 uppercase tracking-wide mb-3">Recalculated Totals Preview</p>
                      <div className="flex justify-between"><span className="text-green-700">Subtotal</span><span className="font-semibold">Rs. {compSubtotal.toLocaleString()}</span></div>
                      {compDiscount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>- Rs. {compDiscount.toLocaleString()}</span></div>}
                      <div className="flex justify-between text-green-700"><span>Delivery</span><span>Rs. {deliveryFee.toLocaleString()}</span></div>
                      {loyaltyD > 0 && <div className="flex justify-between text-purple-600"><span>Loyalty</span><span>- Rs. {loyaltyD.toLocaleString()}</span></div>}
                      {walletD > 0 && <div className="flex justify-between text-blue-600"><span>Wallet</span><span>- Rs. {walletD.toLocaleString()}</span></div>}
                      <div className="flex justify-between font-bold text-base text-green-900 pt-2 border-t border-green-200">
                        <span>New Total</span>
                        <span>Rs. {compTotal.toLocaleString()}</span>
                      </div>
                    </div>

                    <Button
                      onClick={handleSaveItems}
                      disabled={isSavingItems || editItems.length === 0}
                      className="w-full bg-green-600 hover:bg-green-700 h-11"
                    >
                      {isSavingItems && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      Save Items & Recalculate Totals
                    </Button>
                  </div>
                )}

                {/* ── TAB: UPDATE STATUS ───────────────────── */}
                {activeTab === "edit-status" && (
                  <div className="space-y-4 max-w-md">
                    <div>
                      <Label className="text-xs mb-1.5 block">Delivery Type</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {[{ id: "courier", label: "🚚 Courier Delivery" }, { id: "self", label: "🏪 Self Delivery" }].map(opt => (
                          <button key={opt.id} onClick={() => setEditDeliveryType(opt.id)} className={`py-2 text-xs font-semibold rounded-lg border-2 transition-all ${editDeliveryType === opt.id ? "border-green-600 bg-green-50 text-green-700" : "border-muted text-muted-foreground hover:border-green-300"}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {editDeliveryType === "courier" && (
                      <>
                        <div>
                          <Label className="text-xs mb-1.5 block">Courier Company</Label>
                          <div className="grid grid-cols-3 gap-1.5">
                            {Object.entries(COURIERS).map(([id, label]) => (
                              <button key={id} onClick={() => setEditCourier(id)} className={`py-1.5 text-xs font-semibold rounded-lg border-2 transition-all ${editCourier === id ? "border-green-600 bg-green-50 text-green-700" : "border-muted text-muted-foreground hover:border-green-300"}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs mb-1.5 block">Courier Service</Label>
                          <Select value={editCourierService} onValueChange={setEditCourierService}>
                            <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                            <SelectContent>
                              {courierServices.length > 0 ? courierServices.map(service => (
                                <SelectItem key={service.value} value={service.value}>{service.label}</SelectItem>
                              )) : (
                                <SelectItem value="overnight">Overnight</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs mb-1.5 block">Tracking ID</Label>
                          <Input value={editTrackingId} onChange={e => setEditTrackingId(e.target.value)} placeholder="e.g. TCS-12345678" className="font-mono text-sm" />
                          <p className="text-[10px] text-muted-foreground mt-1">Visible to the customer in their tracking page.</p>
                        </div>
                        <Button type="button" variant="outline" onClick={handleBookShipment} disabled={isBookingShipment} className="w-full">
                          {isBookingShipment && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Book Shipment
                        </Button>
                        {shipmentError && <p className="text-xs text-red-600">{shipmentError} You can still enter tracking manually.</p>}
                      </>
                    )}

                    <div>
                      <Label className="text-xs mb-1.5 block">Order Status</Label>
                      <Select value={editStatus} onValueChange={setEditStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">⏳ Pending</SelectItem>
                          <SelectItem value="confirmed">✔ Confirmed</SelectItem>
                          <SelectItem value="processing">⚙ Processing</SelectItem>
                          <SelectItem value="shipped">🚚 Shipped</SelectItem>
                          <SelectItem value="out_for_delivery">🛵 Out for Delivery</SelectItem>
                          <SelectItem value="delivered">📦 Delivered</SelectItem>
                          <SelectItem value="cancelled">❌ Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs mb-1.5 block">Internal Notes</Label>
                      <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Add internal notes…" />
                    </div>

                    <Button onClick={handleSaveStatus} disabled={isSavingStatus} className="w-full bg-green-600 hover:bg-green-700 h-11">
                      {isSavingStatus && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      Save Status Update
                    </Button>
                  </div>
                )}

              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
