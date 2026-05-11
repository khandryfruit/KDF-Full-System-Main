import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/App";
import { ArrowLeft, MapPin, Phone, Package, Truck, User, ClipboardList, RefreshCw } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-yellow-500/15 text-yellow-400",
  confirmed:  "bg-blue-500/15   text-blue-400",
  processing: "bg-indigo-500/15 text-indigo-400",
  shipped:    "bg-cyan-500/15   text-cyan-400",
  delivered:  "bg-green-500/15  text-green-400",
  cancelled:  "bg-red-500/15    text-red-400",
  refunded:   "bg-orange-500/15 text-orange-400",
  paid:       "bg-green-500/15  text-green-400",
  unpaid:     "bg-red-500/15    text-red-400",
};

function Section({ title, icon: Icon, children }: { title: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs text-foreground text-right ${mono ? "font-mono" : "font-medium"}`}>
        {String(value)}
      </span>
    </div>
  );
}

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  const orderId = params.id;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: () =>
      fetch(`/api/admin/shopify/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
  });

  const o = data?.order ?? data ?? {};

  const addr       = o.shippingAddress ?? o.shipping_address ?? {};
  const lineItems: any[] = o.lineItems ?? o.line_items ?? [];
  const custName   = o.customerName  ?? o.customer_name  ?? addr.name ?? "Unknown";
  const custPhone  = o.customerPhone ?? o.customer_phone ?? addr.phone ?? "—";
  const custEmail  = o.customerEmail ?? o.customer_email ?? "—";
  const totalPrice = Number(o.totalPrice ?? o.total_price ?? 0);
  const subTotal   = Number(o.subtotalPrice ?? o.subtotal_price ?? 0);
  const totalTax   = Number(o.totalTax ?? o.total_tax ?? 0);
  const discounts  = Number(o.totalDiscounts ?? o.total_discounts ?? 0);
  const finStatus  = o.financialStatus ?? o.financial_status ?? o.status ?? "—";
  const fulStatus  = o.fulfillmentStatus ?? o.fulfillment_status ?? "unfulfilled";
  const orderNum   = o.orderNumber ?? o.order_number ?? orderId;
  const tracking   = o.trackingNumber ?? o.shipmentTrackingId ?? "—";
  const courier    = o.shipmentCourierSlug ?? "—";
  const rider      = o.riderName ?? "—";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 bg-card border-b border-border flex items-center gap-3 px-4 sticky top-0 z-20">
        <button
          onClick={() => navigate("/orders")}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="font-semibold text-sm text-foreground flex-1">Order #{orderNum}</span>
        <button onClick={() => refetch()} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted transition">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading order…</p>
          </div>
        ) : (
          <>
            {/* Status banner */}
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Order #{orderNum}</p>
                <p className="text-lg font-bold text-primary mt-0.5">Rs {totalPrice.toLocaleString()}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[finStatus?.toLowerCase()] ?? "bg-muted text-muted-foreground"}`}>
                  {finStatus}
                </span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[fulStatus?.toLowerCase()] ?? "bg-muted text-muted-foreground"}`}>
                  {fulStatus ?? "unfulfilled"}
                </span>
              </div>
            </div>

            {/* Customer */}
            <Section title="Customer" icon={User}>
              <Row label="Name"  value={custName}  />
              <Row label="Phone" value={custPhone} />
              <Row label="Email" value={custEmail} />
            </Section>

            {/* Shipping Address */}
            {addr.city && (
              <Section title="Delivery Address" icon={MapPin}>
                <Row label="Name"    value={addr.name}    />
                <Row label="Phone"   value={addr.phone}   />
                <Row label="Address" value={[addr.address1, addr.address2].filter(Boolean).join(", ")} />
                <Row label="City"    value={addr.city}    />
                <Row label="Country" value={addr.country} />
              </Section>
            )}

            {/* Line Items */}
            {lineItems.length > 0 && (
              <Section title="Items" icon={Package}>
                <div className="space-y-2">
                  {lineItems.map((item: any, i: number) => (
                    <div key={item.id ?? i} className="flex items-start justify-between gap-2 pb-2 border-b border-border last:border-0 last:pb-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground leading-snug">{item.title ?? item.name}</p>
                        {item.variant_title && (
                          <p className="text-[10px] text-muted-foreground">{item.variant_title}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">Qty: {item.quantity ?? item.qty ?? 1}</p>
                      </div>
                      <p className="text-xs font-bold text-primary shrink-0">
                        Rs {Number(item.price ?? 0).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Payment */}
            <Section title="Payment" icon={ClipboardList}>
              {subTotal > 0 && <Row label="Subtotal"  value={`Rs ${subTotal.toLocaleString()}`}  />}
              {discounts > 0 && <Row label="Discount" value={`-Rs ${discounts.toLocaleString()}`} />}
              {totalTax > 0 && <Row label="Tax"       value={`Rs ${totalTax.toLocaleString()}`}  />}
              <div className="flex items-center justify-between pt-1 border-t border-border mt-1">
                <span className="text-sm font-semibold text-foreground">Total</span>
                <span className="text-sm font-bold text-primary">Rs {totalPrice.toLocaleString()}</span>
              </div>
            </Section>

            {/* Delivery */}
            <Section title="Delivery" icon={Truck}>
              <Row label="Rider"    value={rider}   />
              <Row label="Courier"  value={courier} />
              <Row label="Tracking" value={tracking} mono />
              {o.trackingUrl && (
                <a
                  href={o.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline"
                >
                  Track Shipment →
                </a>
              )}
            </Section>

            {/* Call customer */}
            {custPhone !== "—" && (
              <a
                href={`tel:${custPhone}`}
                className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-semibold"
              >
                <Phone className="w-4 h-4" />
                Call {custName.split(" ")[0]}
              </a>
            )}
          </>
        )}
      </main>
    </div>
  );
}
