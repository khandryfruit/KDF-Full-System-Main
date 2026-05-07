import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { Helmet } from "react-helmet-async";
import { Package, Search, Truck, CheckCircle2, Clock, MapPin, AlertCircle, ChevronRight, ExternalLink, RotateCcw } from "lucide-react";

interface TrackResult {
  orderNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  trackingId?: string | null;
  courierName?: string | null;
  courierTrackingUrl?: string | null;
  estimatedDelivery?: string | null;
  shippingAddress?: string | null;
  city?: string | null;
  items: { name: string; quantity: number; price: string; image?: string }[];
}

const STATUS_STEPS = [
  { key: "pending", label: "Order Placed", icon: Clock },
  { key: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { key: "processing", label: "Processing", icon: Package },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "out_for_delivery", label: "Out for Delivery", icon: MapPin },
  { key: "delivered", label: "Delivered", icon: CheckCircle2 },
];

const STATUS_ORDER = ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"];

function getStepIndex(status: string) {
  const idx = STATUS_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: "Pending", color: "#92400e", bg: "#fef3c7" },
    confirmed: { label: "Confirmed", color: "#065f46", bg: "#d1fae5" },
    processing: { label: "Processing", color: "#1e40af", bg: "#dbeafe" },
    shipped: { label: "Shipped", color: "#6b21a8", bg: "#f3e8ff" },
    out_for_delivery: { label: "Out for Delivery", color: "#9a3412", bg: "#ffedd5" },
    delivered: { label: "Delivered", color: "#14532d", bg: "#dcfce7" },
    cancelled: { label: "Cancelled", color: "#7f1d1d", bg: "#fee2e2" },
  };
  const s = map[status] ?? { label: status, color: "#374151", bg: "#f3f4f6" };
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  );
}

export default function TrackOrderPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const qParam = params.get("q") ?? "";

  const [query, setQuery] = useState(qParam);
  const [input, setInput] = useState(qParam);
  const [result, setResult] = useState<TrackResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const doTrack = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSearched(true);
    try {
      const res = await fetch(`/api/track?q=${encodeURIComponent(q.trim())}`);
      if (res.status === 404) { setError("No order found with that number or tracking ID."); return; }
      if (!res.ok) throw new Error("Something went wrong. Please try again.");
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to fetch tracking info.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (qParam) { setInput(qParam); setQuery(qParam); doTrack(qParam); }
  }, [qParam]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(input);
    doTrack(input);
  };

  const activeStep = result ? getStepIndex(result.status) : -1;
  const isCancelled = result?.status === "cancelled";

  function imgSrc(key?: string) {
    if (!key) return null;
    if (key.startsWith("http")) return key;
    return `/api/storage/objects/${key}`;
  }

  return (
    <>
      <Helmet>
        <title>Track Your Order — KDF Plus</title>
      </Helmet>

      <main className="min-h-screen bg-gray-50">
        {/* Hero banner */}
        <div className="bg-gradient-to-br from-[#0D2B00] to-[#1a4a00] text-white py-12 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black mb-2">Track Your Order</h1>
            <p className="text-white/70 text-sm sm:text-base mb-8">
              Enter your order number or tracking ID to see live status
            </p>

            {/* Search box */}
            <form onSubmit={handleSubmit} className="relative max-w-lg mx-auto">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="e.g. KDF-2024-001 or TCS tracking ID"
                    className="w-full h-12 pl-11 pr-4 rounded-xl text-sm text-gray-900 bg-white border-2 border-transparent focus:border-[#5FA800] outline-none transition-all shadow-lg placeholder:text-gray-400"
                    data-testid="input-track-query"
                    autoFocus={!qParam}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="h-12 px-6 rounded-xl font-semibold text-sm transition-all shadow-lg disabled:opacity-50"
                  style={{ backgroundColor: "#5FA800", color: "white" }}
                  data-testid="button-track-submit"
                >
                  {loading ? (
                    <RotateCcw className="w-4 h-4 animate-spin" />
                  ) : (
                    "Track"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Results area */}
        <div className="max-w-2xl mx-auto px-4 py-8">

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-32 bg-white rounded-2xl" />
              <div className="h-24 bg-white rounded-2xl" />
              <div className="h-40 bg-white rounded-2xl" />
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="bg-white border border-red-100 rounded-2xl p-6 text-center shadow-sm">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">Order Not Found</h3>
              <p className="text-sm text-gray-500 mb-4">{error}</p>
              <p className="text-xs text-gray-400">Double-check your order number or tracking ID and try again.</p>
            </div>
          )}

          {/* Empty state — not searched yet */}
          {!loading && !error && !result && !searched && (
            <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center shadow-sm">
              <div className="grid grid-cols-3 gap-4 max-w-xs mx-auto mb-6">
                {[
                  { icon: Search, label: "Enter ID" },
                  { icon: ChevronRight, label: "" },
                  { icon: Package, label: "See Status" },
                ].map(({ icon: Icon, label }, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 rounded-xl bg-[#5FA800]/10 flex items-center justify-center">
                      <Icon className="w-5 h-5" style={{ color: "#5FA800" }} />
                    </div>
                    {label && <p className="text-xs text-gray-500">{label}</p>}
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500">Your order details will appear here after you search.</p>
            </div>
          )}

          {/* Results */}
          {!loading && result && (
            <div className="space-y-4">

              {/* Order summary card */}
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Order Number</p>
                    <p className="font-black text-lg text-gray-900">#{result.orderNumber}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Placed {new Date(result.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <StatusBadge status={result.status} />
                </div>

                {result.shippingAddress && (
                  <div className="flex items-start gap-2 text-sm text-gray-600 pt-3 border-t border-gray-50">
                    <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#5FA800" }} />
                    <span>{result.shippingAddress}{result.city ? `, ${result.city}` : ""}</span>
                  </div>
                )}
              </div>

              {/* Status progress */}
              {!isCancelled && (
                <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                  <h2 className="font-semibold text-sm text-gray-700 mb-5">Delivery Progress</h2>
                  <div className="relative">
                    {/* Progress line */}
                    <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-100" />
                    <div
                      className="absolute left-4 top-4 w-0.5 bg-[#5FA800] transition-all duration-700"
                      style={{ height: activeStep > 0 ? `${(activeStep / (STATUS_STEPS.length - 1)) * 100}%` : "0%" }}
                    />

                    <div className="space-y-5">
                      {STATUS_STEPS.map((step, i) => {
                        const Icon = step.icon;
                        const done = i <= activeStep;
                        const active = i === activeStep;
                        return (
                          <div key={step.key} className="flex items-center gap-4 relative">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition-all ${
                                done ? "shadow-md" : "border-2 border-gray-200 bg-white"
                              } ${active ? "ring-4 ring-[#5FA800]/20" : ""}`}
                              style={done ? { backgroundColor: "#5FA800" } : {}}
                            >
                              <Icon className="w-4 h-4" style={{ color: done ? "white" : "#d1d5db" }} />
                            </div>
                            <div className="flex-1">
                              <p className={`text-sm font-semibold ${done ? "text-gray-900" : "text-gray-400"}`}>
                                {step.label}
                              </p>
                              {active && result.updatedAt && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {new Date(result.updatedAt).toLocaleString("en-PK", {
                                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                                  })}
                                </p>
                              )}
                            </div>
                            {done && !active && <CheckCircle2 className="w-4 h-4 text-[#5FA800] flex-shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {isCancelled && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-center">
                  <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
                  <p className="font-semibold text-red-700">This order was cancelled</p>
                  <p className="text-xs text-red-500 mt-1">If you have questions, please contact support.</p>
                </div>
              )}

              {/* Courier / Tracking info */}
              {(result.trackingId || result.courierName) && (
                <div
                  className="rounded-2xl p-5 shadow-sm"
                  style={{ background: "linear-gradient(135deg, #0D2B00 0%, #1a4a00 100%)" }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                      <Truck className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white/60 text-xs">Courier</p>
                      <p className="text-white font-semibold">{result.courierName ?? "Courier"}</p>
                    </div>
                  </div>
                  {result.trackingId && (
                    <div className="bg-white/10 rounded-xl px-4 py-3 flex items-center justify-between gap-3 mt-3">
                      <div>
                        <p className="text-white/60 text-xs mb-0.5">Tracking ID</p>
                        <p className="text-white font-mono font-bold text-base tracking-wider">{result.trackingId}</p>
                      </div>
                      {result.courierTrackingUrl && (
                        <a
                          href={result.courierTrackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                          style={{ backgroundColor: "#5FA800", color: "white" }}
                        >
                          Track Live <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                  {result.estimatedDelivery && (
                    <p className="text-white/60 text-xs mt-3">
                      Estimated delivery: <span className="text-white font-medium">{result.estimatedDelivery}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Items */}
              {result.items.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                  <h2 className="font-semibold text-sm text-gray-700 mb-3">Items in this order</h2>
                  <div className="space-y-3">
                    {result.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        {imgSrc(item.image) ? (
                          <img src={imgSrc(item.image)!} alt={item.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-gray-100" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-[#5FA800]/10 flex items-center justify-center flex-shrink-0">
                            <Package className="w-5 h-5" style={{ color: "#5FA800" }} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                          <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                        </div>
                        <p className="text-sm font-bold flex-shrink-0" style={{ color: "#5FA800" }}>
                          Rs. {parseFloat(item.price).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Track again */}
              <div className="text-center pt-2">
                <button
                  onClick={() => { setInput(""); setResult(null); setSearched(false); setError(null); }}
                  className="text-sm font-medium hover:underline"
                  style={{ color: "#5FA800" }}
                >
                  Track another order →
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
