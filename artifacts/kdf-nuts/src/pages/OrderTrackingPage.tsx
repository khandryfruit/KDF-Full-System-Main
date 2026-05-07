import { ChevronLeft, Package, CheckCircle2, Truck, MapPin, Home, Clock, FileText, RefreshCw } from 'lucide-react';
import { useLocation, useParams } from 'wouter';
import { useGetOrder } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../context/AppContext';
import { printInvoice, type InvoiceOrder } from '../lib/invoice';

/* ─── Status helpers ──────────────────────────────────── */
const STEPS = [
  { key: 'pending',           label: 'Order Placed',       icon: Clock,        description: 'Your order has been received' },
  { key: 'confirmed',         label: 'Confirmed',          icon: CheckCircle2, description: 'Your order is confirmed and payment verified' },
  { key: 'processing',        label: 'Packed',             icon: Package,      description: 'Your items are packed and ready for dispatch' },
  { key: 'shipped',           label: 'Shipped',            icon: Truck,        description: 'Your order is on the way' },
  { key: 'out_for_delivery',  label: 'Out for Delivery',   icon: MapPin,       description: 'Courier is on the way to your door' },
  { key: 'delivered',         label: 'Delivered',          icon: Home,         description: 'Your order has been delivered' },
] as const;

type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled';

function getStepIndex(status: OrderStatus): number {
  const map: Record<OrderStatus, number> = {
    pending: 0, confirmed: 1, processing: 2, shipped: 3, out_for_delivery: 4, delivered: 5, cancelled: -1,
  };
  return map[status] ?? 0;
}

function getStepTime(order: any, stepKey: string): string | null {
  const fieldMap: Record<string, string> = {
    pending: 'createdAt', confirmed: 'confirmedAt', processing: 'packedAt', shipped: 'shippedAt',
    out_for_delivery: 'outForDeliveryAt', delivered: 'deliveredAt',
  };
  const field = fieldMap[stepKey];
  const ts = field && order[field];
  if (!ts) return null;
  return new Date(ts).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

const COURIER_NAMES: Record<string, string> = {
  tcs: 'TCS Couriers', leopards: 'Leopards', postex: 'PostEx', rider: 'Rider', trax: 'Trax',
};

const SHIPMENT_STATUS_STEPS = [
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
];

const SHIPMENT_STATUS_ORDER = ['pending', 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered'];

export function OrderTrackingPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { token } = useApp();
  const orderId = parseInt(params.id ?? '0');

  const { data: order, isLoading, isError } = useGetOrder(orderId, {
    query: {
      enabled: !!orderId && !!token,
      queryKey: ['order', orderId],
      refetchInterval: (query: any) => {
        const s = query.state.data?.status;
        return s === 'delivered' || s === 'cancelled' ? false : 30000;
      },
    } as any,
    request: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: shipment, refetch: refetchTracking, isFetching: trackingFetching } = useQuery<any | null>({
    queryKey: ['tracking', orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/tracking`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!orderId && !!token,
    refetchInterval: (query) => {
      const data = query.state.data as any;
      return data?.status === 'delivered' ? false : 30000;
    },
  });

  const isLiveStatus = order && order.status !== 'delivered' && order.status !== 'cancelled';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FB] flex flex-col">
        <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => navigate('/account/orders')} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
          <h1 className="text-lg font-bold text-[#0D2B00]">Order Tracking</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto animate-pulse"><Package className="w-6 h-6 text-green-600" /></div>
        </div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="min-h-screen bg-[#F8F9FB] flex flex-col">
        <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => navigate('/account/orders')} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
          <h1 className="text-lg font-bold text-[#0D2B00]">Order Tracking</h1>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto"><Package className="w-7 h-7 text-red-400" /></div>
            <p className="font-semibold text-gray-700">Order not found</p>
            <button onClick={() => navigate('/account/orders')} className="mt-2 px-5 py-2 bg-[#5FA800] text-white text-sm font-semibold rounded-xl">Back to Orders</button>
          </div>
        </div>
      </div>
    );
  }

  const status = order.status as OrderStatus;
  const currentStep = getStepIndex(status);
  const isCancelled = status === 'cancelled';

  const shipmentStatusIdx = shipment ? SHIPMENT_STATUS_ORDER.indexOf(shipment.status) : -1;

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex flex-col pb-8">

      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center justify-between border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/account/orders')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
          <div>
            <h1 className="text-base font-bold text-[#0D2B00] font-mono">{(order as any).orderNumber}</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-gray-500">{new Date((order as any).createdAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              {isLiveStatus && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-[#5FA800]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5FA800] animate-pulse" />
                  Live
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={() => printInvoice(order as unknown as InvoiceOrder)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 text-xs font-semibold rounded-lg transition-colors">
          <FileText className="w-3.5 h-3.5" />Invoice
        </button>
      </div>

      <div className="px-4 space-y-4 mt-4">

        {isCancelled && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
            <p className="text-red-700 font-bold text-base">Order Cancelled</p>
            <p className="text-red-500 text-sm mt-1">This order has been cancelled.</p>
          </div>
        )}

        {/* Order Progress Stepper */}
        {!isCancelled && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h2 className="text-sm font-bold text-[#0D2B00] mb-5">Order Progress</h2>
            <div className="space-y-0">
              {STEPS.map((step, idx) => {
                const isCompleted = idx <= currentStep;
                const isCurrent = idx === currentStep;
                const Icon = step.icon;
                const time = getStepTime(order, step.key);
                const isLast = idx === STEPS.length - 1;
                return (
                  <div key={step.key} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isCompleted ? isCurrent ? 'bg-[#5FA800] shadow-lg shadow-green-200 scale-110' : 'bg-[#5FA800]/20' : 'bg-gray-100'}`}>
                        <Icon className={`w-4 h-4 ${isCompleted ? isCurrent ? 'text-white' : 'text-[#5FA800]' : 'text-gray-300'}`} />
                      </div>
                      {!isLast && <div className={`w-0.5 h-8 mt-1 ${idx < currentStep ? 'bg-[#5FA800]' : 'bg-gray-200'}`} />}
                    </div>
                    <div className={`pb-6 ${isLast ? 'pb-0' : ''}`}>
                      <p className={`text-sm font-semibold ${isCompleted ? 'text-[#0D2B00]' : 'text-gray-400'}`}>{step.label}</p>
                      <p className={`text-xs mt-0.5 ${isCompleted ? 'text-gray-500' : 'text-gray-300'}`}>{step.description}</p>
                      {time && <p className="text-xs text-[#5FA800] font-medium mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{time}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Real-time Courier Tracking */}
        {shipment && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#0D2B00]">Courier Tracking</h3>
              <button onClick={() => refetchTracking()} disabled={trackingFetching}
                className="flex items-center gap-1 text-xs text-[#5FA800] font-semibold disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${trackingFetching ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {/* Courier info */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Courier</p>
                <p className="text-sm font-bold text-[#0D2B00]">{shipment.courierName ?? COURIER_NAMES[shipment.courierSlug] ?? shipment.courierSlug}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Tracking ID</p>
                <p className="text-xs font-mono font-bold text-blue-600 break-all">{shipment.trackingId}</p>
              </div>
            </div>

            {/* PostEx rich event timeline */}
            {(() => {
              const postexHistory: any[] = shipment.rawResponse?.dist?.transactionStatusHistory ?? [];
              if (shipment.courierSlug === 'postex' && postexHistory.length > 0) {
                const currentTx = shipment.rawResponse?.dist?.transactionStatus ?? '';
                const city = shipment.rawResponse?.dist?.cityName ?? '';
                return (
                  <div className="space-y-3">
                    {/* Current status pill */}
                    <div className="flex items-center gap-2 bg-[#5FA800]/10 rounded-xl px-3 py-2.5">
                      <div className="w-2 h-2 rounded-full bg-[#5FA800] animate-pulse" />
                      <div>
                        <p className="text-xs font-bold text-[#5FA800]">{currentTx || shipment.status?.replace(/_/g, ' ')}</p>
                        {city && <p className="text-[10px] text-gray-500">{city}</p>}
                      </div>
                    </div>
                    {/* Event timeline */}
                    <div className="space-y-0">
                      {[...postexHistory].reverse().map((event: any, i: number) => {
                        const isFirst = i === 0;
                        const isLast = i === postexHistory.length - 1;
                        return (
                          <div key={i} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isFirst ? 'bg-[#5FA800]' : 'bg-gray-100'}`}>
                                {isFirst
                                  ? <div className="w-2 h-2 rounded-full bg-white" />
                                  : <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />}
                              </div>
                              {!isLast && <div className="w-0.5 h-6 bg-gray-200 my-0.5" />}
                            </div>
                            <div className={`pb-3 ${isLast ? 'pb-0' : ''}`}>
                              <p className={`text-sm font-semibold leading-tight ${isFirst ? 'text-[#0D2B00]' : 'text-gray-500'}`}>
                                {event.transactionStatusMessage}
                              </p>
                              <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {new Date(event.updatedAt).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              /* Generic stepper for non-PostEx */
              return (
                <>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-2">
                      {SHIPMENT_STATUS_STEPS.map((step, idx) => {
                        const isComplete = idx <= shipmentStatusIdx;
                        const isCurr = idx === shipmentStatusIdx;
                        return (
                          <div key={step.key} className="flex flex-col items-center flex-1">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold z-10 ${isComplete ? isCurr ? 'bg-[#5FA800] text-white shadow-sm' : 'bg-[#5FA800]/20 text-[#5FA800]' : 'bg-gray-100 text-gray-400'}`}>
                              {isComplete ? '✓' : idx + 1}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="relative h-0.5 bg-gray-200 mx-3 -mt-1 mb-1">
                      <div className="absolute inset-y-0 left-0 bg-[#5FA800] transition-all" style={{ width: shipmentStatusIdx >= 0 ? `${(shipmentStatusIdx / (SHIPMENT_STATUS_STEPS.length - 1)) * 100}%` : '0%' }} />
                    </div>
                    <div className="flex items-start justify-between">
                      {SHIPMENT_STATUS_STEPS.map((step, idx) => (
                        <div key={step.key} className="flex-1 text-center">
                          <p className={`text-[9px] leading-tight ${idx <= shipmentStatusIdx ? 'text-[#5FA800] font-semibold' : 'text-gray-400'}`}>{step.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {(shipment.statusHistory ?? []).length > 1 && (
                    <div className="mt-4 space-y-1.5">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">History</p>
                      {[...(shipment.statusHistory ?? [])].reverse().slice(0, 5).map((h: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#5FA800] mt-1.5 flex-shrink-0" />
                          <div>
                            <span className="font-semibold capitalize text-gray-700">{h.status.replace(/_/g, ' ')}</span>
                            <span className="text-gray-400 ml-1.5">{new Date(h.timestamp).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Last update */}
            {shipment.lastTrackedAt && (
              <p className="text-[10px] text-gray-400 text-center mt-3 flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" />Last updated: {new Date(shipment.lastTrackedAt).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
            )}
          </div>
        )}

        {/* Fallback: order-level tracking ID if no shipment record */}
        {!shipment && (order as any).trackingId && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Shipment Info</h3>
            <div className="space-y-2">
              {(order as any).courier && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Courier</span>
                  <span className="text-sm font-semibold text-[#0D2B00]">{COURIER_NAMES[(order as any).courier] ?? (order as any).courier}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Tracking ID</span>
                <span className="text-sm font-mono font-bold text-blue-600">{(order as any).trackingId}</span>
              </div>
            </div>
          </div>
        )}

        {/* Delivery Address */}
        {(order as any).shippingAddress && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />Delivery Address</h3>
            <div className="space-y-0.5 text-sm">
              <p className="font-semibold text-[#0D2B00]">{(order as any).shippingAddress.name}</p>
              <p className="text-gray-500">{(order as any).shippingAddress.phone}</p>
              <p className="text-gray-500">{(order as any).shippingAddress.address}</p>
              <p className="text-gray-500">{(order as any).shippingAddress.city}, {(order as any).shippingAddress.country}</p>
            </div>
          </div>
        )}

        {/* Order Items */}
        {(order as any).items?.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Package className="w-3.5 h-3.5" />Items ({(order as any).items.length})</h3>
            <div className="space-y-3">
              {(order as any).items.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.gradient ?? 'from-green-300 to-emerald-500'} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0D2B00] truncate">{item.name}</p>
                    {item.variant && <p className="text-xs text-gray-400">{item.variant}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">×{item.qty}</p>
                    <p className="text-sm font-bold text-[#0D2B00]">Rs. {(Number(item.price) * item.qty).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Price Breakdown */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Price Breakdown</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>Rs. {Number((order as any).subtotal).toLocaleString()}</span></div>
            {Number((order as any).discount) > 0 && (
              <div className="flex justify-between text-[#5FA800]">
                <span>Discount{(order as any).couponCode ? ` (${(order as any).couponCode})` : ''}</span>
                <span>-Rs. {Number((order as any).discount).toLocaleString()}</span>
              </div>
            )}
            {Number((order as any).loyaltyDiscount ?? 0) > 0 && (
              <div className="flex justify-between text-purple-600"><span>Loyalty Points</span><span>-Rs. {Number((order as any).loyaltyDiscount).toLocaleString()}</span></div>
            )}
            {Number((order as any).walletDiscount ?? 0) > 0 && (
              <div className="flex justify-between text-blue-600"><span>Wallet Credit</span><span>-Rs. {Number((order as any).walletDiscount).toLocaleString()}</span></div>
            )}
            <div className="flex justify-between text-gray-500"><span>Delivery</span><span>Rs. {Number((order as any).deliveryFee ?? 0).toLocaleString()}</span></div>
            <div className="flex justify-between font-bold text-base text-[#0D2B00] pt-2 border-t border-gray-100">
              <span>Total</span><span className="text-[#5FA800]">Rs. {Number((order as any).total).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <button onClick={() => printInvoice(order as unknown as InvoiceOrder)}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm font-semibold text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm">
          <FileText className="w-4 h-4" />Download Invoice PDF
        </button>

      </div>
    </div>
  );
}
