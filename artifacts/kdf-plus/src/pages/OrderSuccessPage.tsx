import { useParams, useLocation, useSearch } from "wouter";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, Package, Clock, Truck, MapPin, Star, FileText, CreditCard, RefreshCw } from "lucide-react";
import { useGetOrder, getGetOrderQueryKey, OrderStatus } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { printInvoice, type InvoiceOrder } from "@/lib/invoice";

const STATUS_STEPS: { key: OrderStatus; label: string; icon: typeof Package }[] = [
  { key: "pending", label: "Order Placed", icon: CheckCircle2 },
  { key: "processing", label: "Processing", icon: Package },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "out_for_delivery", label: "Out for Delivery", icon: Truck },
  { key: "delivered", label: "Delivered", icon: Star },
];

const STATUS_ORDER: OrderStatus[] = ["pending", "processing", "shipped", "out_for_delivery", "delivered"];

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  out_for_delivery: "bg-orange-100 text-orange-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: "Cash on Delivery",
  bank_transfer: "Bank Transfer",
  jazzcash: "JazzCash",
  easypaisa: "EasyPaisa",
  online: "Online Payment",
  card: "Card Payment",
  wallet: "KDF Wallet",
};

function WhatsAppQR() {
  return (
    <div className="border border-[#25D366]/30 bg-[#25D366]/5 rounded-2xl p-4 flex items-center gap-4" id="kdf-wa-qr">
      <div className="flex-shrink-0 p-1.5 bg-white rounded-xl shadow-sm border border-border">
        <img
          src="/api/whatsapp/qr"
          alt="Scan to chat on WhatsApp"
          className="w-16 h-16 rounded-lg object-cover"
          onError={() => { const el = document.getElementById("kdf-wa-qr"); if (el) el.style.display = "none"; }}
        />
      </div>
      <div>
        <p className="font-semibold text-sm text-gray-800">💬 Chat with us on WhatsApp</p>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">Scan the QR code to ask questions, track your order, or get help anytime.</p>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const orderId = Number(params.id);

  // URL params are the reliable fallback (always present for both guests + logged-in)
  const urlParams = new URLSearchParams(search);
  const urlOrderNumber = urlParams.get("orderNumber") ?? "";
  const urlPaymentMethod = urlParams.get("paymentMethod") ?? "cod";
  const urlReferenceNumber = urlParams.get("referenceNumber")
    ? decodeURIComponent(urlParams.get("referenceNumber")!)
    : null;
  const urlTotal = urlParams.get("total") ?? "";

  const { data: order, isLoading, isError, refetch } = useGetOrder(orderId, {
    query: {
      enabled: !!orderId,
      queryKey: getGetOrderQueryKey(orderId),
      retry: 1,
    },
  });

  // Derive display values — prefer API data, fall back to URL params
  const displayOrderNumber = order?.orderNumber ?? urlOrderNumber;
  const displayPaymentMethod = (order as any)?.paymentMethod ?? urlPaymentMethod;
  const displayReferenceNumber = (order as any)?.referenceNumber ?? urlReferenceNumber;
  const displayTotal = order ? parseFloat(order.total) : (urlTotal ? parseFloat(urlTotal) : null);
  const displayStatus: OrderStatus = order?.status ?? "pending";
  const currentStatusIdx = STATUS_ORDER.indexOf(displayStatus);
  const isBankTransfer =
    displayPaymentMethod === "bank_transfer" ||
    displayPaymentMethod === "jazzcash" ||
    displayPaymentMethod === "easypaisa";

  function handlePrintInvoice() {
    if (order) {
      printInvoice(order as unknown as InvoiceOrder);
    }
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10 pb-10 space-y-4">
        <div className="bg-white border border-border rounded-2xl p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4 animate-pulse" />
          <Skeleton className="h-6 w-48 mx-auto mb-2" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </main>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`Order${displayOrderNumber ? ` #${displayOrderNumber}` : ""} Confirmed — KDF NUTS`}</title>
      </Helmet>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-8 space-y-5">

        {/* ── Success Header ── */}
        <div className="bg-white border border-border rounded-2xl p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-black text-foreground mb-1" data-testid="text-order-success">
            Order Placed Successfully!
          </h1>
          {displayOrderNumber ? (
            <p className="text-muted-foreground text-sm">
              Your order <span className="font-semibold text-foreground">#{displayOrderNumber}</span> has been received.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">Your order has been received. Thank you!</p>
          )}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Badge className={`${STATUS_COLORS[displayStatus]} font-medium`} data-testid="badge-order-status">
              {displayStatus.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
            </Badge>
            {order && (order as any).paymentStatus && (
              <Badge
                variant="outline"
                className={
                  (order as any).paymentStatus === "paid"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : (order as any).paymentStatus === "pending"
                    ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                    : "bg-red-50 text-red-700 border-red-200"
                }
                data-testid="badge-payment-status"
              >
                {(order as any).paymentStatus === "paid" ? "✓ Paid" : (order as any).paymentStatus === "pending" ? "⏳ Payment Pending" : "✗ Unpaid"}
              </Badge>
            )}
          </div>
        </div>

        {/* ── Fetch error / guest fallback notice ── */}
        {(isError || (!isLoading && !order)) && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3 text-sm text-blue-800">
            <div className="flex-1">
              <p className="font-semibold mb-0.5">Your order is confirmed!</p>
              <p className="text-xs text-blue-700 leading-relaxed">
                Full order details are available after logging in. You can track your order from <button className="underline font-semibold" onClick={() => setLocation("/account?tab=orders")}>My Orders</button>.
              </p>
            </div>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1 text-xs font-semibold bg-blue-100 hover:bg-blue-200 text-blue-800 px-2 py-1 rounded-lg transition-colors flex-shrink-0"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {/* ── Payment Info ── */}
        <div className="bg-white border border-border rounded-2xl p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" /> Payment Information
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Method</span>
              <span className="font-medium">{PAYMENT_METHOD_LABELS[displayPaymentMethod] ?? displayPaymentMethod}</span>
            </div>
            {displayReferenceNumber && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Reference No.</span>
                <span className="font-mono text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg tracking-wide">
                  {displayReferenceNumber}
                </span>
              </div>
            )}
            {displayTotal !== null && (
              <div className="flex justify-between items-center font-bold pt-1 border-t border-border/50">
                <span>Total Paid</span>
                <span className="text-primary">Rs. {displayTotal.toLocaleString()}</span>
              </div>
            )}
          </div>
          {isBankTransfer && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 leading-relaxed">
              <strong>Verification Pending:</strong> We'll review your payment and confirm the order shortly.
            </div>
          )}
        </div>

        {/* ── Order Timeline ── */}
        {displayStatus !== "cancelled" && (
          <div className="bg-white border border-border rounded-2xl p-5">
            <h2 className="font-semibold mb-4">Order Status</h2>
            <div className="flex items-start justify-between relative">
              <div className="absolute top-4 left-0 right-0 h-0.5 bg-muted z-0 mx-8" />
              <div
                className="absolute top-4 left-0 h-0.5 bg-primary z-0 transition-all"
                style={{
                  left: "2rem",
                  width: `calc(${(Math.max(0, currentStatusIdx) / (STATUS_STEPS.length - 1)) * 100}% - 4rem)`,
                }}
              />
              {STATUS_STEPS.map((step, idx) => {
                const isCompleted = idx <= currentStatusIdx;
                const Icon = step.icon;
                return (
                  <div key={step.key} className="flex flex-col items-center gap-2 z-10 flex-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                        isCompleted ? "bg-primary border-primary text-white" : "bg-white border-border text-muted-foreground"
                      }`}
                      data-testid={`status-step-${step.key}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className={`text-xs text-center leading-tight ${isCompleted ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Delivery Address (only when API data loaded) ── */}
        {order?.shippingAddress && (
          <div className="bg-white border border-border rounded-2xl p-5">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Delivery Address
            </h2>
            <div className="text-sm text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground">{order.shippingAddress.name}</p>
              <p>{order.shippingAddress.phone}</p>
              <p>{order.shippingAddress.address}</p>
              <p>{order.shippingAddress.city}, {order.shippingAddress.country}</p>
            </div>
          </div>
        )}

        {/* ── Order Items (only when API data loaded) ── */}
        {order?.items && order.items.length > 0 && (
          <div className="bg-white border border-border rounded-2xl p-5">
            <h2 className="font-semibold mb-4">Order Items</h2>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex-shrink-0"
                      style={{ background: item.gradient || "hsl(var(--accent))" }}
                    />
                    <div>
                      <p className="font-medium" data-testid={`text-order-item-name-${item.id}`}>{item.name}</p>
                      {item.variant && <p className="text-xs text-muted-foreground">{item.variant}</p>}
                      <p className="text-xs text-muted-foreground">×{item.qty}</p>
                    </div>
                  </div>
                  <p className="font-semibold">Rs. {(parseFloat(item.price) * item.qty).toLocaleString()}</p>
                </div>
              ))}
            </div>

            <Separator className="my-4" />

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>Rs. {parseFloat(order.subtotal).toLocaleString()}</span>
              </div>
              {order.discount && parseFloat(order.discount) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>− Rs. {parseFloat(order.discount).toLocaleString()}</span>
                </div>
              )}
              {order.deliveryFee && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span>Rs. {parseFloat(order.deliveryFee).toLocaleString()}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span data-testid="text-order-total">Rs. {parseFloat(order.total).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── WhatsApp QR ── */}
        <WhatsAppQR />

        {/* ── Actions ── */}
        <div className="flex gap-3">
          <Button
            className="flex-1"
            onClick={() => setLocation("/products")}
            data-testid="button-continue-shopping"
          >
            Continue Shopping
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setLocation("/account?tab=orders")}
            data-testid="button-view-orders"
          >
            View All Orders
          </Button>
        </div>

        {order && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handlePrintInvoice}
            data-testid="button-download-invoice"
          >
            <FileText className="w-4 h-4" />
            Download Invoice
          </Button>
        )}

      </main>
    </>
  );
}
