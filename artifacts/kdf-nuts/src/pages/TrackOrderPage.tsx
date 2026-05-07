import { useState, useRef } from 'react';
import { ChevronLeft, Search, Package, CheckCircle2, Truck, MapPin, Home, Clock, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { useLocation } from 'wouter';

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const STEPS = [
  { key: 'pending',          label: 'Order Placed',      icon: CheckCircle2, color: '#5FA800' },
  { key: 'processing',       label: 'Processing',         icon: Package,      color: '#3B82F6' },
  { key: 'shipped',          label: 'Shipped',            icon: Truck,        color: '#8B5CF6' },
  { key: 'out_for_delivery', label: 'Out for Delivery',   icon: MapPin,       color: '#F58300' },
  { key: 'delivered',        label: 'Delivered',          icon: Home,         color: '#5FA800' },
] as const;

const STATUS_INDEX: Record<string, number> = {
  pending: 0, processing: 1, shipped: 2, out_for_delivery: 3, delivered: 4, cancelled: -1,
};

const COURIER_NAMES: Record<string, string> = {
  tcs: 'TCS Couriers', leopards: 'Leopards', postex: 'PostEx', rider: 'Rider', trax: 'Trax',
};

const PAYMENT_LABELS: Record<string, string> = {
  cod: 'Cash on Delivery', bank_transfer: 'Bank Transfer', jazzcash: 'JazzCash',
  easypaisa: 'EasyPaisa', online: 'Online Payment', free: 'No Payment Required',
};

function fmt(ts?: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

const STEP_TIMES: Record<string, string> = {
  pending: 'createdAt', processing: 'packedAt', shipped: 'shippedAt',
  out_for_delivery: 'outForDeliveryAt', delivered: 'deliveredAt',
};

export function TrackOrderPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) { inputRef.current?.focus(); return; }
    setLoading(true);
    setError('');
    setOrder(null);
    try {
      const res = await fetch(`${BASE}/api/track?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Not found');
      setOrder(data);
    } catch (err: any) {
      setError(err.message ?? 'Order not found. Please check your order number or tracking ID.');
    } finally {
      setLoading(false);
    }
  }

  const stepIdx = order ? (STATUS_INDEX[order.status] ?? 0) : -1;
  const isCancelled = order?.status === 'cancelled';

  return (
    <div className="min-h-screen bg-[#f5f7f5] pb-10">

      {/* Header */}
      <div className="bg-[#5FA800] text-white pt-12 pb-8 px-5 relative">
        <button
          onClick={() => setLocation('/home')}
          className="absolute top-12 left-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/20 rounded-2xl mb-3">
            <Package className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Track Your Order</h1>
          <p className="text-white/80 text-sm mt-1">Enter your order ID or tracking number</p>
        </div>
      </div>

      {/* Search Card */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-2xl shadow-lg p-4">
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="e.g. KDF-123456789 or TCS-87654321"
                className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#5FA800]/40 focus:border-[#5FA800] transition-all placeholder:text-gray-400 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#5FA800] hover:bg-[#4d8f00] text-white font-bold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-70"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {loading ? 'Searching…' : 'Track Order'}
            </button>
          </form>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">Not Found</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {order && (
        <div className="px-4 mt-4 space-y-3">

          {/* Order Header Card */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium mb-0.5">Order Number</p>
                <p className="font-mono font-bold text-base text-gray-900">{order.orderNumber}</p>
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {fmt(order.createdAt)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {isCancelled ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200">Cancelled</span>
                ) : (
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold border"
                    style={{
                      backgroundColor: `${STEPS[Math.max(0, stepIdx)]?.color}15`,
                      color: STEPS[Math.max(0, stepIdx)]?.color,
                      borderColor: `${STEPS[Math.max(0, stepIdx)]?.color}40`,
                    }}
                  >
                    {order.status?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </span>
                )}
                {order.trackingId && (
                  <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                    {order.trackingId}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status Timeline */}
          {!isCancelled && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Order Progress</p>
              <div className="relative">
                {/* Progress bar */}
                <div className="absolute top-5 left-5 right-5 h-0.5 bg-gray-100">
                  <div
                    className="h-full bg-[#5FA800] transition-all duration-500"
                    style={{ width: stepIdx >= 0 ? `${(stepIdx / (STEPS.length - 1)) * 100}%` : '0%' }}
                  />
                </div>
                <div className="flex justify-between relative">
                  {STEPS.map((step, i) => {
                    const done = i <= stepIdx;
                    const active = i === stepIdx;
                    const Icon = step.icon;
                    return (
                      <div key={step.key} className="flex flex-col items-center gap-2 flex-1">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all z-10 ${
                            done
                              ? 'bg-[#5FA800] border-[#5FA800]'
                              : 'bg-white border-gray-200'
                          } ${active ? 'shadow-lg shadow-[#5FA800]/20 scale-110' : ''}`}
                        >
                          <Icon className={`w-4 h-4 ${done ? 'text-white' : 'text-gray-300'}`} />
                        </div>
                        <div className="text-center">
                          <p className={`text-[9px] font-bold leading-tight ${done ? 'text-[#5FA800]' : 'text-gray-300'}`}>
                            {step.label}
                          </p>
                          {done && order[STEP_TIMES[step.key] ?? ''] && (
                            <p className="text-[8px] text-gray-400 mt-0.5 leading-tight">
                              {fmt(order[STEP_TIMES[step.key]])}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Delivery Info */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Delivery Details</p>
            <div className="space-y-2.5">
              {[
                { label: 'Delivery To', value: order.city ? `${order.city}${order.country ? ', ' + order.country : ''}` : null },
                { label: 'Recipient', value: order.recipientName },
                { label: 'Courier', value: order.courier ? (COURIER_NAMES[order.courier] ?? order.courier) : (order.deliveryType === 'self' ? 'Self Pickup' : null) },
                { label: 'Tracking ID', value: order.trackingId, mono: true, clickable: true },
                { label: 'Payment', value: PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod?.replace(/_/g, ' ') },
              ].filter(r => r.value).map(({ label, value, mono, clickable }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className={`text-xs font-semibold text-gray-900 ${mono ? 'font-mono text-blue-600' : ''}`}>
                    {clickable && value ? (
                      <a
                        href={`https://www.tcscouriers.com.pk/tracking?tracking=${value}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                      >
                        {value} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Order Items */}
          {order.items?.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Items ({order.items.length})
              </p>
              <div className="space-y-3">
                {order.items.map((item: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br flex-shrink-0 shadow-sm ${item.gradient ?? 'from-green-400 to-emerald-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                      {item.variant && <p className="text-xs text-gray-400">{item.variant}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-400">×{item.qty}</p>
                      <p className="text-sm font-bold text-gray-900">Rs. {(Number(item.price) * item.qty).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5">
                {[
                  { label: 'Subtotal', value: `Rs. ${Number(order.subtotal).toLocaleString()}` },
                  ...(Number(order.discount) > 0 ? [{ label: 'Discount', value: `-Rs. ${Number(order.discount).toLocaleString()}`, green: true }] : []),
                  { label: 'Delivery', value: `Rs. ${Number(order.deliveryFee ?? 0).toLocaleString()}` },
                ].map(({ label, value, green }) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-gray-500">{label}</span>
                    <span className={green ? 'text-green-600 font-semibold' : 'text-gray-700'}>{value}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-1.5 border-t border-gray-100">
                  <span className="text-sm font-bold text-gray-900">Total</span>
                  <span className="text-base font-black text-[#5FA800]">Rs. {Number(order.total).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Help */}
          <div className="bg-[#f0f9e8] border border-[#5FA800]/20 rounded-2xl p-4 text-center">
            <p className="text-xs text-[#5FA800] font-semibold">Need help with your order?</p>
            <p className="text-xs text-gray-500 mt-1">Contact us via WhatsApp or visit our store</p>
            <button
              onClick={() => setLocation('/help')}
              className="mt-2 text-xs text-[#5FA800] font-bold underline underline-offset-2"
            >
              Go to Help & Support →
            </button>
          </div>

        </div>
      )}

      {/* Empty state hint */}
      {!order && !error && !loading && (
        <div className="mx-4 mt-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-sm mb-3">
            <Package className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-400">Enter your order ID above to track</p>
          <p className="text-xs text-gray-300 mt-1">Your order ID starts with KDF-</p>
        </div>
      )}
    </div>
  );
}
