import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";
import {
  Truck, RefreshCw, Search, Send, Package, CheckCircle,
  XCircle, Clock, AlertCircle, X, ChevronDown, Zap,
  Copy, Share2, Printer, CheckSquare, Square, SquareStack,
} from "lucide-react";

/* ── status config ───────────────────────────────────── */
const STATUS_CFG: Record<string, { color: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  pending:   { color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",  icon: Clock,        label: "Pending"   },
  confirmed: { color: "bg-blue-500/15   text-blue-400   border-blue-500/25",    icon: CheckCircle,  label: "Confirmed" },
  booked:    { color: "bg-green-500/15  text-green-400  border-green-500/25",   icon: Package,      label: "Booked"    },
  cancelled: { color: "bg-red-500/15    text-red-400    border-red-500/25",     icon: XCircle,      label: "Cancelled" },
  failed:    { color: "bg-orange-500/15 text-orange-400 border-orange-500/25",  icon: AlertCircle,  label: "Failed"    },
};

const COURIER_NAMES: Record<string, string> = {
  tcs: "TCS Courier", postex: "PostEx", leopards: "Leopards", trax: "Trax",
};

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ── print shipping label ────────────────────────────── */
function printShippingLabel(trackingId: string, courierSlug: string, row: any) {
  const orderNum = row.shopify_order_number ?? row.order_number ?? "—";
  const custName = row.customer_name ?? "—";
  const phone    = row.customer_phone ?? "—";
  const addr     = row.shipping_address?.address1 ?? row.customer_address ?? "—";
  const city     = row.shipping_address?.city ?? row.customer_city ?? "—";
  const cod      = Number(row.total_price ?? 0);
  const isPaid   = (row.financial_status ?? "").toLowerCase() === "paid";
  const courier  = COURIER_NAMES[courierSlug] ?? courierSlug?.toUpperCase() ?? "—";
  const date     = new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Shipping Label — ${trackingId}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; background:#fff; color:#000; }
  @media print { body { margin:0; } }
  .page { width:100mm; min-height:150mm; border:2px solid #000; padding:6mm; margin:4mm auto; display:flex; flex-direction:column; gap:3mm; }
  .header { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #000; padding-bottom:3mm; }
  .brand { font-size:16pt; font-weight:900; letter-spacing:-0.5px; }
  .brand span { color:#16a34a; }
  .date { font-size:7pt; color:#555; text-align:right; }
  .tracking-box { border:2px solid #000; border-radius:4px; padding:4mm; text-align:center; background:#f0f9ff; }
  .tracking-label { font-size:7pt; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:#555; }
  .tracking-id { font-size:18pt; font-weight:900; letter-spacing:1px; margin:1mm 0; font-family:monospace; }
  .courier-badge { display:inline-block; background:#000; color:#fff; font-size:8pt; font-weight:bold; padding:1mm 3mm; border-radius:3px; }
  .section { border:1px solid #ddd; border-radius:4px; padding:3mm; }
  .section-label { font-size:7pt; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:#888; margin-bottom:2mm; }
  .section-value { font-size:10pt; font-weight:bold; line-height:1.4; }
  .section-sub { font-size:8pt; color:#444; line-height:1.3; margin-top:1mm; }
  .cod-box { background:${isPaid ? "#f0fdf4" : "#fffbeb"}; border:2px solid ${isPaid ? "#16a34a" : "#d97706"}; border-radius:4px; padding:3mm; text-align:center; }
  .cod-label { font-size:7pt; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${isPaid ? "#16a34a" : "#d97706"}; }
  .cod-amount { font-size:20pt; font-weight:900; color:${isPaid ? "#16a34a" : "#d97706"}; }
  .barcode { font-family:monospace; font-size:22pt; letter-spacing:4px; text-align:center; line-height:1; margin:1mm 0; }
  .footer { text-align:center; font-size:7pt; color:#888; border-top:1px solid #eee; padding-top:2mm; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">KDF <span>NUTS</span></div>
    <div class="date"><div>${courier}</div><div>${date}</div></div>
  </div>

  <div class="tracking-box">
    <div class="tracking-label">Tracking Number</div>
    <div class="tracking-id">${trackingId}</div>
    <div class="barcode">${"|".repeat(Math.min(trackingId.length, 16))}</div>
    <span class="courier-badge">${courierSlug?.toUpperCase()}</span>
  </div>

  <div class="section">
    <div class="section-label">Order</div>
    <div class="section-value">${orderNum}</div>
  </div>

  <div class="section">
    <div class="section-label">Deliver To</div>
    <div class="section-value">${custName}</div>
    <div class="section-sub">${phone}<br>${addr}, ${city}</div>
  </div>

  <div class="cod-box">
    <div class="cod-label">${isPaid ? "PREPAID ✓" : "Cash on Delivery"}</div>
    <div class="cod-amount">Rs. ${cod.toLocaleString()}</div>
  </div>

  <div class="footer">KDF NUTS · kdfnuts.com · Handle with care 📦</div>
</div>
<script>window.onload = function() { setTimeout(() => { window.print(); }, 300); }</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=420,height=650");
  if (w) { w.document.write(html); w.document.close(); }
}

/* ── booking success modal ───────────────────────────── */
interface BookResult {
  trackingId: string;
  courierSlug: string;
  orderNumber: string;
  codAmount: number;
  row: any;
}

function BookingSuccessModal({ result, onClose }: { result: BookResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(result.trackingId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareWA = () => {
    const text = encodeURIComponent(
      `✅ آپ کا آرڈر ${result.orderNumber} book ہوگیا!\n\n` +
      `🚚 Courier: ${COURIER_NAMES[result.courierSlug] ?? result.courierSlug?.toUpperCase()}\n` +
      `📦 Tracking: ${result.trackingId}\n\n` +
      `جلد deliver ہوگا۔ شکریہ! 🥜 — KDF NUTS`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card border border-border rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl">
        {/* success header */}
        <div className="relative p-6 pb-4 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/15 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Booked Successfully!</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {COURIER_NAMES[result.courierSlug] ?? result.courierSlug?.toUpperCase()} · {result.orderNumber}
          </p>
          <button onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* tracking ID box */}
        <div className="mx-4 mb-4 bg-muted/60 border border-border rounded-2xl p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Tracking Number
          </p>
          <p className="text-2xl font-black font-mono text-primary tracking-wider">{result.trackingId}</p>
          <p className="text-xs text-muted-foreground mt-1">
            COD: <b className="text-foreground">Rs. {result.codAmount.toLocaleString()}</b>
            {result.codAmount === 0 && <span className="ml-1 text-green-400">· Prepaid</span>}
          </p>
        </div>

        {/* action buttons */}
        <div className="px-4 pb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={copy}
              className={`flex items-center justify-center gap-2 h-11 rounded-xl border text-sm font-semibold transition ${
                copied ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-muted border-border text-foreground"
              }`}>
              <Copy className="w-4 h-4" />
              {copied ? "Copied!" : "Copy ID"}
            </button>
            <button onClick={shareWA}
              className="flex items-center justify-center gap-2 h-11 rounded-xl bg-green-600 text-white text-sm font-semibold">
              <Share2 className="w-4 h-4" />
              Share WA
            </button>
          </div>

          <button
            onClick={() => printShippingLabel(result.trackingId, result.courierSlug, result.row)}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-muted border border-border text-sm font-semibold text-foreground">
            <Printer className="w-4 h-4" />
            Print Shipping Label
          </button>

          <button onClick={onClose}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
            Done ✓
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── book courier modal ──────────────────────────────── */
interface BookModalProps {
  row: any;
  token: string | null;
  onClose: () => void;
  onBookSuccess: (result: BookResult) => void;
}

function BookModal({ row, token, onClose, onBookSuccess }: BookModalProps) {
  const isPaid  = (row.financial_status ?? "").toLowerCase() === "paid";
  const [form, setForm] = useState({
    courierSlug:   "",
    weight:        "0.5",
    pieces:        "1",
    codAmount:     isPaid ? "0" : String(Number(row.total_price ?? 0)),
    customerPhone: row.customer_phone ?? "",
    serviceCode:   "O",
  });
  const [apiError, setApiError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const h = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

  const { data: couriersData, isLoading: couriersLoading } = useQuery<any>({
    queryKey: ["couriers-list"],
    queryFn: () => fetch("/api/admin/couriers", { headers: h() }).then(r => r.json()),
    staleTime: 60_000,
  });
  const activeCouriers: any[] = (couriersData?.couriers ?? couriersData ?? []).filter(
    (c: any) => c.isActive ?? c.is_active
  );

  const bookMutation = useMutation({
    mutationFn: async () => {
      const dbId = row.shopify_order_db_id;
      if (!dbId) throw new Error("Order DB id not found");
      const r = await fetch(`/api/admin/shopify/orders/${dbId}/book-courier`, {
        method: "POST",
        headers: h(),
        body: JSON.stringify({
          courierSlug:    form.courierSlug,
          weight:         parseFloat(form.weight) || 0.5,
          pieces:         parseInt(form.pieces) || 1,
          codAmount:      parseFloat(form.codAmount) || 0,
          customerPhone:  form.customerPhone,
          serviceCode:    form.serviceCode,
          notifyWhatsapp: true,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Booking failed");
      return d;
    },
    onSuccess: (d) => {
      setApiError(null);
      onBookSuccess({
        trackingId:  d.trackingId ?? d.tracking_id ?? "—",
        courierSlug: form.courierSlug,
        orderNumber: row.shopify_order_number ?? row.order_number ?? "—",
        codAmount:   parseFloat(form.codAmount) || 0,
        row,
      });
      onClose();
    },
    onError: (e: any) => setApiError(e.message ?? "Booking failed"),
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-card border border-border rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Truck className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-bold text-sm">Book Courier</p>
              <p className="text-[10px] text-muted-foreground">{row.shopify_order_number ?? row.order_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* prepaid / COD banner */}
          <div className={`flex items-center gap-2 p-3 rounded-xl text-xs ${
            isPaid ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
          }`}>
            {isPaid
              ? <><CheckCircle className="w-3.5 h-3.5 shrink-0" /><span><b>Prepaid</b> — COD set to Rs. 0</span></>
              : <><Zap className="w-3.5 h-3.5 shrink-0" /><span><b>COD</b> — Rs. {Number(row.total_price ?? 0).toLocaleString()}</span></>
            }
          </div>

          {/* courier selection */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-2">Select Courier</label>
            {couriersLoading ? <div className="h-10 bg-muted rounded-xl animate-pulse" /> :
              activeCouriers.length === 0 ? (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-400">
                  No active couriers configured
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {activeCouriers.map((c: any) => (
                    <button key={c.slug} onClick={() => set("courierSlug", c.slug)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        form.courierSlug === c.slug ? "border-primary bg-primary/5" : "border-border"
                      }`}>
                      <span className="text-xs font-bold">{c.name}</span>
                    </button>
                  ))}
                </div>
              )
            }
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Weight (kg)</label>
              <input type="number" step="0.1" min="0.1" value={form.weight} onChange={e => set("weight", e.target.value)}
                className="w-full h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Pieces</label>
              <input type="number" step="1" min="1" value={form.pieces} onChange={e => set("pieces", e.target.value)}
                className="w-full h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">COD Amount (Rs.)</label>
            <input type="number" min="0" value={form.codAmount} onChange={e => set("codAmount", e.target.value)}
              disabled={isPaid}
              className="w-full h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50" />
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Customer Phone</label>
            <input type="tel" value={form.customerPhone} onChange={e => set("customerPhone", e.target.value)}
              className="w-full h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Service Type</label>
            <div className="flex gap-2">
              {[["O", "Overnight"], ["E", "Economy"], ["S", "Same-day"]].map(([code, label]) => (
                <button key={code} onClick={() => set("serviceCode", code)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${
                    form.serviceCode === code ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {apiError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">{apiError}</div>
          )}
        </div>

        <div className="p-4 border-t border-border shrink-0">
          <button onClick={() => bookMutation.mutate()}
            disabled={bookMutation.isPending || !form.courierSlug || !form.customerPhone}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {bookMutation.isPending
              ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Booking…</>
              : <><Truck className="w-4 h-4" /> Book Courier</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── bulk book modal ─────────────────────────────────── */
interface BulkBookModalProps {
  count: number;
  token: string | null;
  onClose: () => void;
  onSuccess: (results: any[]) => void;
}

function BulkBookModal({ count, token, onClose, onSuccess }: BulkBookModalProps) {
  const [form, setForm] = useState({ courierSlug: "", weight: "0.5", pieces: "1", serviceCode: "O" });
  const [apiError, setApiError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const h = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

  const { data: couriersData, isLoading } = useQuery<any>({
    queryKey: ["couriers-list"],
    queryFn: () => fetch("/api/admin/couriers", { headers: h() }).then(r => r.json()),
    staleTime: 60_000,
  });
  const couriers: any[] = (couriersData?.couriers ?? couriersData ?? []).filter((c: any) => c.isActive ?? c.is_active);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
      <div className="bg-card border border-border rounded-t-3xl w-full shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div>
            <p className="font-bold text-sm flex items-center gap-2">
              <SquareStack className="w-4 h-4 text-primary" /> Bulk Book Couriers
            </p>
            <p className="text-[10px] text-muted-foreground">{count} confirmed orders selected</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-2">Select Courier</label>
            {isLoading ? <div className="h-10 bg-muted rounded-xl animate-pulse" /> :
              <div className="grid grid-cols-2 gap-2">
                {couriers.map((c: any) => (
                  <button key={c.slug} onClick={() => set("courierSlug", c.slug)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      form.courierSlug === c.slug ? "border-primary bg-primary/5" : "border-border"
                    }`}>
                    <span className="text-xs font-bold">{c.name}</span>
                  </button>
                ))}
              </div>
            }
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Weight/Order (kg)</label>
              <input type="number" step="0.1" min="0.1" value={form.weight} onChange={e => set("weight", e.target.value)}
                className="w-full h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Pieces/Order</label>
              <input type="number" step="1" min="1" value={form.pieces} onChange={e => set("pieces", e.target.value)}
                className="w-full h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Service Type</label>
            <div className="flex gap-2">
              {[["O", "Overnight"], ["E", "Economy"], ["S", "Same-day"]].map(([code, label]) => (
                <button key={code} onClick={() => set("serviceCode", code)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${
                    form.serviceCode === code ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {apiError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">{apiError}</div>
          )}
        </div>

        <div className="p-4 border-t border-border shrink-0">
          <p className="text-[10px] text-muted-foreground text-center mb-2">
            COD amounts will be auto-detected per order. WA notifications will be sent.
          </p>
          <button
            onClick={() => onSuccess([form])}
            disabled={!form.courierSlug}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            <SquareStack className="w-4 h-4" /> Book {count} Orders
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── bulk results modal ──────────────────────────────── */
function BulkResultsModal({ results, onClose }: { results: any[]; onClose: () => void }) {
  const ok   = results.filter(r => r.trackingId);
  const fail = results.filter(r => r.error);
  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-end justify-center">
      <div className="bg-card border border-border rounded-t-3xl w-full shadow-2xl max-h-[75vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div>
            <p className="font-bold text-sm">Bulk Booking Results</p>
            <p className="text-[10px] text-muted-foreground">{ok.length} booked · {fail.length} failed</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {results.map((r, i) => (
            <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs ${
              r.trackingId ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"
            }`}>
              <span className="font-semibold">{r.orderNumber}</span>
              <span className={`font-mono ${r.trackingId ? "text-green-400" : "text-red-400"}`}>
                {r.trackingId ?? r.error ?? "Failed"}
              </span>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-border shrink-0">
          <button onClick={onClose} className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
            Done ✓
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── main page ───────────────────────────────────────── */
export default function LogisticsPage() {
  const { token } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch]         = useState("");
  const [page, setPage]             = useState(1);
  const [filter, setFilter]         = useState<"all" | "pending" | "confirmed" | "booked" | "failed">("all");
  const [sending, setSending]       = useState<number | null>(null);
  const [expanded, setExpanded]     = useState<number | null>(null);
  const [bookRow, setBookRow]       = useState<any | null>(null);
  const [bookResult, setBookResult] = useState<BookResult | null>(null);
  const [bulkMode, setBulkMode]     = useState(false);
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkBooking, setBulkBooking]     = useState(false);
  const [bulkResults, setBulkResults]     = useState<any[] | null>(null);

  const h = useCallback(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token]
  );

  const { data: statsRaw } = useQuery({
    queryKey: ["logistics-stats"],
    queryFn: () => fetch("/api/admin/logistics/confirmations/stats", { headers: h() }).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ["logistics-confirmations", page, filter, search],
    queryFn: () =>
      fetch(
        `/api/admin/logistics/confirmations?page=${page}&limit=15${filter !== "all" ? `&status=${filter}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
        { headers: h() }
      ).then(r => r.json()),
    placeholderData: (prev: any) => prev,
    refetchInterval: 20_000,
  });

  const stats      = statsRaw?.confirmations ?? {};
  const rows: any[] = data?.confirmations ?? data?.data ?? [];
  const totalPages  = data?.pagination?.pages ?? 1;

  const toggleSelect = (dbId: number) => {
    setSelected(s => {
      const n = new Set(s);
      n.has(dbId) ? n.delete(dbId) : n.add(dbId);
      return n;
    });
  };

  const toggleSelectAll = () => {
    const confirmedWithId = rows.filter(r => r.status === "confirmed" && r.shopify_order_db_id);
    if (selected.size === confirmedWithId.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(confirmedWithId.map(r => r.shopify_order_db_id)));
    }
  };

  const sendWA = async (id: number) => {
    setSending(id);
    try {
      await fetch(`/api/admin/logistics/confirmations/${id}/resend`, { method: "POST", headers: h() });
      qc.invalidateQueries({ queryKey: ["logistics-confirmations"] });
    } finally { setSending(null); }
  };

  const forceBook = async (id: number) => {
    setSending(id);
    try {
      await fetch(`/api/admin/logistics/confirmations/${id}/force-book`, { method: "POST", headers: h() });
      qc.invalidateQueries({ queryKey: ["logistics-confirmations"] });
    } finally { setSending(null); }
  };

  const doBulkBook = async (formData: any) => {
    setShowBulkModal(false);
    setBulkBooking(true);
    try {
      const r = await fetch("/api/admin/shopify/orders/bulk-book", {
        method: "POST",
        headers: h(),
        body: JSON.stringify({
          orderIds:       Array.from(selected),
          courierSlug:    formData.courierSlug,
          weight:         parseFloat(formData.weight) || 0.5,
          pieces:         parseInt(formData.pieces) || 1,
          serviceCode:    formData.serviceCode,
          notifyWhatsapp: true,
        }),
      });
      const d = await r.json();
      setBulkResults(d.results ?? []);
      setSelected(new Set());
      setBulkMode(false);
      qc.invalidateQueries({ queryKey: ["logistics-confirmations"] });
    } catch {
      setBulkResults([{ orderNumber: "Error", error: "Network error" }]);
    } finally { setBulkBooking(false); }
  };

  const confirmedWithId = rows.filter(r => r.status === "confirmed" && r.shopify_order_db_id);

  return (
    <AppShell title="Logistics">
      <div className="p-4 space-y-3">

        {/* header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Truck className="w-5 h-5 text-orange-400" /> Logistics
            </h2>
            <p className="text-xs text-muted-foreground">Courier confirmations & bookings</p>
          </div>
          <div className="flex items-center gap-2">
            {/* bulk mode toggle */}
            <button
              onClick={() => { setBulkMode(b => !b); setSelected(new Set()); }}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-xl border text-xs font-semibold transition ${
                bulkMode ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border text-muted-foreground"
              }`}>
              <SquareStack className="w-3.5 h-3.5" />
              {bulkMode ? "Cancel" : "Bulk"}
            </button>
            <button onClick={() => refetch()} className="w-8 h-8 flex items-center justify-center rounded-xl bg-muted">
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* stats */}
        {Object.keys(stats).length > 0 && (
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { label: "Total",     value: stats.total     ?? 0, color: "text-foreground" },
              { label: "Pending",   value: stats.pending   ?? 0, color: "text-yellow-400" },
              { label: "Confirmed", value: stats.confirmed ?? 0, color: "text-blue-400"   },
              { label: "Booked",    value: stats.booked    ?? 0, color: "text-green-400"  },
              { label: "Failed",    value: stats.failed    ?? 0, color: "text-red-400"    },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-2 text-center">
                <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* bulk select all bar */}
        {bulkMode && confirmedWithId.length > 0 && (
          <button onClick={toggleSelectAll}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/20 text-xs font-semibold text-primary">
            {selected.size === confirmedWithId.length
              ? <><CheckSquare className="w-4 h-4" /> Deselect all ({confirmedWithId.length})</>
              : <><Square className="w-4 h-4" /> Select all confirmed ({confirmedWithId.length})</>
            }
          </button>
        )}

        {/* search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search order # or customer…"
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground" />
        </div>

        {/* filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "pending", "confirmed", "booked", "failed"] as const).map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize transition ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
              {f}
            </button>
          ))}
        </div>

        {/* list */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <Truck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No confirmations found</p>
          </div>
        ) : (
          <div className="space-y-2" style={{ paddingBottom: bulkMode && selected.size > 0 ? "80px" : "0" }}>
            {rows.map((row: any) => {
              const cfg    = STATUS_CFG[row.status] ?? STATUS_CFG.pending;
              const Icon   = cfg.icon;
              const isOpen = expanded === row.id;
              const items  = row.line_items ?? [];
              const canBulk = bulkMode && row.status === "confirmed" && row.shopify_order_db_id;
              const isSelected = selected.has(row.shopify_order_db_id);

              return (
                <div key={row.id} className={`bg-card border rounded-2xl overflow-hidden transition ${
                  isSelected ? "border-primary" : "border-border"
                }`}>
                  <div className="flex items-start">
                    {/* bulk checkbox */}
                    {canBulk && (
                      <button onClick={() => toggleSelect(row.shopify_order_db_id)}
                        className="pl-3 pt-4 shrink-0">
                        {isSelected
                          ? <CheckSquare className="w-5 h-5 text-primary" />
                          : <Square className="w-5 h-5 text-muted-foreground/40" />
                        }
                      </button>
                    )}

                    <button onClick={() => setExpanded(isOpen ? null : row.id)}
                      className="flex-1 p-3.5 flex items-start gap-3 text-left min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cfg.color.split(" ")[0]}`}>
                        <Icon className={`w-4 h-4 ${cfg.color.split(" ")[1]}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{row.shopify_order_number ?? row.order_number}</p>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{row.customer_name} · {row.customer_phone}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {row.courier_slug && <p className="text-[10px] text-cyan-400 font-medium">{row.courier_slug.toUpperCase()}</p>}
                          {row.tracking_id  && <p className="text-[10px] font-mono text-muted-foreground">{row.tracking_id}</p>}
                          <p className="text-[10px] text-muted-foreground ml-auto">{timeAgo(row.created_at)}</p>
                        </div>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground/50 shrink-0 mt-1 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                  </div>

                  {/* expanded */}
                  {isOpen && (
                    <div className="border-t border-border px-3.5 pb-3.5 pt-3 space-y-3">
                      {items.length > 0 && (
                        <div className="space-y-1">
                          {items.map((it: any, i: number) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="text-muted-foreground truncate flex-1">{it.title ?? it.name}</span>
                              <span className="font-semibold shrink-0 ml-2">×{it.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {row.total_price && (
                        <p className="text-sm font-bold text-primary">
                          Total: Rs {Number(row.total_price).toLocaleString()}
                          {(row.financial_status ?? "").toLowerCase() === "paid" && (
                            <span className="ml-2 text-[10px] font-semibold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">PAID</span>
                          )}
                        </p>
                      )}

                      <div className="flex gap-2 flex-wrap">
                        {(row.status === "pending" || row.status === "failed") && (
                          <button onClick={() => sendWA(row.id)} disabled={sending === row.id}
                            className="flex-1 min-w-[100px] flex items-center justify-center gap-1.5 h-9 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 text-xs font-semibold disabled:opacity-50">
                            <Send className="w-3.5 h-3.5" />
                            {sending === row.id ? "Sending…" : "Send WA"}
                          </button>
                        )}

                        {row.status === "confirmed" && !row.shopify_order_db_id && (
                          <button onClick={() => forceBook(row.id)} disabled={sending === row.id}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-primary/10 border border-primary/25 text-primary text-xs font-semibold disabled:opacity-50">
                            <Truck className="w-3.5 h-3.5" />
                            {sending === row.id ? "Booking…" : "Auto-Book"}
                          </button>
                        )}

                        {row.status === "confirmed" && row.shopify_order_db_id && (
                          <button onClick={() => setBookRow(row)}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
                            <Truck className="w-3.5 h-3.5" /> Book Courier
                          </button>
                        )}

                        {row.tracking_id && (
                          <button
                            onClick={() => { navigator.clipboard.writeText(row.tracking_id); }}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-muted border border-border text-xs text-cyan-400 font-mono">
                            <Copy className="w-3 h-3" /> {row.tracking_id}
                          </button>
                        )}

                        {row.tracking_id && (
                          <button onClick={() => printShippingLabel(row.tracking_id, row.courier_slug, row)}
                            className="w-9 h-9 flex items-center justify-center rounded-xl bg-muted border border-border text-muted-foreground">
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
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

      {/* ── bulk booking floating bar ── */}
      {bulkMode && selected.size > 0 && (
        <div className="fixed bottom-16 left-0 right-0 px-4 z-30">
          <button onClick={() => setShowBulkModal(true)} disabled={bulkBooking}
            className="w-full h-13 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-2xl flex items-center justify-center gap-2 py-3.5">
            {bulkBooking
              ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Booking {selected.size} orders…</>
              : <><SquareStack className="w-4 h-4" /> Book {selected.size} Selected Orders</>
            }
          </button>
        </div>
      )}

      {/* ── single book modal ── */}
      {bookRow && (
        <BookModal
          row={bookRow}
          token={token}
          onClose={() => setBookRow(null)}
          onBookSuccess={(result) => {
            setBookRow(null);
            setBookResult(result);
            qc.invalidateQueries({ queryKey: ["logistics-confirmations"] });
          }}
        />
      )}

      {/* ── booking success modal ── */}
      {bookResult && (
        <BookingSuccessModal
          result={bookResult}
          onClose={() => setBookResult(null)}
        />
      )}

      {/* ── bulk book settings modal ── */}
      {showBulkModal && (
        <BulkBookModal
          count={selected.size}
          token={token}
          onClose={() => setShowBulkModal(false)}
          onSuccess={doBulkBook}
        />
      )}

      {/* ── bulk results modal ── */}
      {bulkResults && (
        <BulkResultsModal
          results={bulkResults}
          onClose={() => setBulkResults(null)}
        />
      )}
    </AppShell>
  );
}
