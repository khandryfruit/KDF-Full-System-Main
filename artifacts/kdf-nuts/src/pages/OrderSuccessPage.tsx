import React, { useState, useEffect, useCallback } from "react";
import {
  Check, ArrowRight, Home, FileText, CreditCard,
  MapPin, Package, Truck, CheckCircle2, Clock, ChevronRight, Building2
} from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { useApp } from "../context/AppContext";
import { printOrderInvoice } from "../lib/orderInvoice";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function NutsWhatsAppQR() {
  return (
    <div className="border border-[#25D366]/30 bg-[#25D366]/5 rounded-2xl p-4 flex items-center gap-3.5" id="nuts-wa-qr">
      <div className="flex-shrink-0 p-1.5 bg-white rounded-xl shadow-sm border border-gray-100">
        <img
          src={`${BASE}/api/whatsapp/qr`}
          alt="Scan to chat on WhatsApp"
          className="w-14 h-14 rounded-lg object-cover"
          onError={() => { const el = document.getElementById("nuts-wa-qr"); if (el) el.style.display = "none"; }}
        />
      </div>
      <div>
        <p className="font-semibold text-sm text-gray-800">💬 Chat with us on WhatsApp</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Scan the QR code to ask questions or track your order.</p>
      </div>
    </div>
  );
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: "Cash on Delivery",
  bank_transfer: "Bank Transfer",
  jazzcash: "JazzCash",
  easypaisa: "EasyPaisa",
  online: "Online Payment",
  card: "Card Payment",
  wallet: "KDF Wallet",
  free: "No Payment Required",
};

const STATUS_STEPS = [
  { key: "pending",    label: "Order Placed",  icon: Clock },
  { key: "processing", label: "Processing",    icon: Package },
  { key: "shipped",    label: "Shipped",       icon: Truck },
  { key: "delivered",  label: "Delivered",     icon: CheckCircle2 },
];

function getStepIndex(status: string) {
  const idx = STATUS_STEPS.findIndex(s => s.key === status);
  return idx >= 0 ? idx : 0;
}

export function OrderSuccessPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user, token } = useApp();

  const params = new URLSearchParams(search);
  const orderNumber = params.get("orderNumber") ?? "";
  const orderId = params.get("orderId");
  const paymentMethod = params.get("paymentMethod") ?? "cod";
  const referenceNumber = params.get("referenceNumber")
    ? decodeURIComponent(params.get("referenceNumber")!)
    : null;
  const urlTotal = params.get("total") ? Number(params.get("total")) : null;

  const [order, setOrder] = useState<any>(null);
  const [loadState, setLoadState] = useState<"loading" | "done" | "error">("loading");
  const [bankDetails, setBankDetails] = useState<any[]>([]);

  const fetchOrder = useCallback(async () => {
    if (!orderId) { setLoadState("done"); return; }
    setLoadState("loading");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BASE}/api/orders/${orderId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setOrder(data);
        setLoadState("done");
      } else {
        setLoadState("done");
      }
    } catch {
      setLoadState("done");
    }
  }, [orderId, token]);

  useEffect(() => {
    const timer = setTimeout(fetchOrder, 400);
    return () => clearTimeout(timer);
  }, [fetchOrder]);

  useEffect(() => {
    if (paymentMethod === "bank_transfer") {
      fetch(`${BASE}/api/payment-gateways/active`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.manualPayments) setBankDetails(d.manualPayments.filter((b: any) => b.isActive)); })
        .catch(() => {});
    }
  }, [paymentMethod]);

  const displayOrderNumber = order?.orderNumber ?? orderNumber ?? "—";
  const displayPayment = order?.paymentMethod ?? paymentMethod;
  const displayRef = order?.referenceNumber ?? referenceNumber;
  const displayStatus = order?.status ?? "pending";
  const stepIdx = getStepIndex(displayStatus);

  const isFreeOrder = displayPayment === "free";
  const isBankTransfer = displayPayment === "bank_transfer" || displayPayment === "jazzcash" || displayPayment === "easypaisa";

  function handleInvoice() {
    if (order) {
      printOrderInvoice({
        orderNumber: order.orderNumber,
        orderId: order.id,
        createdAt: order.createdAt,
        paymentMethod: order.paymentMethod,
        referenceNumber: order.referenceNumber ?? null,
        paymentStatus: order.paymentStatus,
        deliveryType: order.deliveryType,
        subtotal: order.subtotal,
        discount: order.discount,
        deliveryFee: order.deliveryFee,
        total: order.total,
        shippingAddress: order.shippingAddress,
        items: order.items ?? [],
      });
    } else {
      // Guest fallback — generate invoice from URL params
      printOrderInvoice({
        orderNumber: displayOrderNumber,
        orderId: orderId ?? "",
        createdAt: new Date().toISOString(),
        paymentMethod: displayPayment,
        referenceNumber: displayRef,
        paymentStatus: "pending",
        deliveryType: "standard",
        subtotal: urlTotal ?? 0,
        discount: 0,
        deliveryFee: 0,
        total: urlTotal ?? 0,
        shippingAddress: undefined,
        items: [],
      });
    }
  }

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] flex flex-col font-sans pb-6">

      {/* ── Success Banner ── */}
      <div className="bg-gradient-to-b from-[#eef7e6] to-[#F8F9FB] px-5 pt-10 pb-6 flex flex-col items-center">
        <div className="w-20 h-20 rounded-full bg-[#5FA800] flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(95,168,0,0.3)]">
          <Check className="w-10 h-10 text-white" strokeWidth={3} />
        </div>
        <h1 className="text-[22px] font-black text-gray-900 mb-1">Order Placed!</h1>
        <p className="text-gray-500 text-sm text-center">
          {isFreeOrder
            ? "Your order has been placed successfully (No payment required)"
            : `Thank you${user?.name ? `, ${user.name}` : ""}! Your order is confirmed.`}
        </p>
        {displayOrderNumber && (
          <div className="mt-3 px-4 py-1.5 bg-white rounded-full border border-gray-200 shadow-sm">
            <span className="text-xs text-gray-500">Order </span>
            <span className="text-xs font-black text-gray-900 font-mono">#{displayOrderNumber.replace(/^#/, "")}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 px-4">

        {/* ── Loading indicator ── */}
        {loadState === "loading" && (
          <div className="bg-white rounded-2xl px-5 py-4 flex items-center gap-3 shadow-sm border border-gray-100">
            <div className="w-5 h-5 border-2 border-[#5FA800] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500">Loading your order details…</span>
          </div>
        )}

        {/* ── Order Summary Card ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Order Summary</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Order #</span>
                <span className="font-black text-gray-900 font-mono text-sm">#{displayOrderNumber.replace(/^#/, "")}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Status</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  displayStatus === "delivered" ? "bg-[#eef7e6] text-[#5FA800]" :
                  displayStatus === "shipped" ? "bg-indigo-50 text-indigo-700" :
                  displayStatus === "processing" ? "bg-blue-50 text-blue-700" :
                  "bg-yellow-50 text-yellow-700"
                }`}>
                  {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Payment</span>
                <span className="text-sm font-semibold text-gray-900">{PAYMENT_METHOD_LABELS[displayPayment] ?? displayPayment}</span>
              </div>
              {displayRef && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Reference No.</span>
                  <span className="font-mono text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg">{displayRef}</span>
                </div>
              )}
              {order?.deliveryType && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Delivery</span>
                  <span className="text-sm font-medium text-gray-800 capitalize">{order.deliveryType}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Est. Delivery</span>
                <span className="text-sm font-medium text-gray-800">3–5 business days</span>
              </div>
            </div>
          </div>

          {/* Totals */}
          {order && (
            <div className="px-5 py-3 space-y-1.5 border-b border-gray-50">
              {Number(order.subtotal) > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span><span>₨{Number(order.subtotal).toLocaleString()}</span>
                </div>
              )}
              {Number(order.discount) > 0 && (
                <div className="flex justify-between text-sm text-[#5FA800]">
                  <span>Discount</span><span>−₨{Number(order.discount).toLocaleString()}</span>
                </div>
              )}
              {Number(order.deliveryFee) > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Delivery Fee</span><span>₨{Number(order.deliveryFee).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-gray-900 pt-1 border-t border-gray-100">
                <span>Total</span>
                <span className="text-[#5FA800]">₨{Number(order.total).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Fallback total from URL if no order loaded */}
          {!order && loadState === "done" && (
            <div className="px-5 py-3">
              <p className="text-xs text-gray-400 text-center">
                Your order is placed successfully. Check <button onClick={() => setLocation("/orders")} className="text-[#5FA800] font-semibold underline">My Orders</button> for full details.
              </p>
            </div>
          )}
        </div>

        {/* ── Order Items ── */}
        {order?.items?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Items Ordered</p>
            </div>
            <div className="divide-y divide-gray-50">
              {order.items.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-100 to-emerald-200 flex items-center justify-center flex-shrink-0 text-lg">
                    🥜
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                    {item.variant && <p className="text-xs text-gray-400">{item.variant}</p>}
                    <p className="text-xs text-gray-400">Qty: {item.qty}</p>
                  </div>
                  <span className="text-sm font-bold text-gray-800 flex-shrink-0">
                    ₨{(Number(item.price) * item.qty).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Delivery Address ── */}
        {order?.shippingAddress && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-[#5FA800]" />
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Delivery Address</p>
            </div>
            <p className="text-sm font-semibold text-gray-900">{order.shippingAddress.name}</p>
            <p className="text-sm text-gray-500">{order.shippingAddress.phone}</p>
            <p className="text-sm text-gray-500">{order.shippingAddress.address}</p>
            <p className="text-sm text-gray-500">{order.shippingAddress.city}{order.shippingAddress.postalCode ? `, ${order.shippingAddress.postalCode}` : ""}, {order.shippingAddress.country}</p>
          </div>
        )}

        {/* ── Order Tracking Timeline ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4">Order Tracking</p>
          <div className="relative">
            {/* Connector line */}
            <div className="absolute left-[17px] top-4 bottom-4 w-0.5 bg-gray-100" />
            <div
              className="absolute left-[17px] top-4 w-0.5 bg-[#5FA800] transition-all duration-700"
              style={{ height: `${(stepIdx / (STATUS_STEPS.length - 1)) * 100}%` }}
            />
            <div className="space-y-5">
              {STATUS_STEPS.map((step, idx) => {
                const done = idx <= stepIdx;
                const active = idx === stepIdx;
                const Icon = step.icon;
                return (
                  <div key={step.key} className="flex items-center gap-3 relative">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 transition-all ${
                      done
                        ? "bg-[#5FA800] border-[#5FA800]"
                        : "bg-white border-gray-200"
                    } ${active ? "shadow-[0_0_12px_rgba(95,168,0,0.35)]" : ""}`}>
                      <Icon className={`w-4 h-4 ${done ? "text-white" : "text-gray-300"}`} strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${done ? "text-gray-900" : "text-gray-400"}`}>{step.label}</p>
                      {active && <p className="text-xs text-[#5FA800] font-medium">Current status</p>}
                    </div>
                    {done && idx < stepIdx && (
                      <Check className="ml-auto w-4 h-4 text-[#5FA800]" strokeWidth={3} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Free Order Notice ── */}
        {isFreeOrder && (
          <div className="bg-[#eef7e6] border border-[#5FA800]/30 rounded-2xl p-4">
            <div className="flex items-center gap-2 font-semibold text-[#0D2B00] text-sm mb-1">
              <Check className="w-4 h-4 text-[#5FA800]" /> No Payment Required
            </div>
            <p className="text-xs text-[#5FA800] leading-relaxed">
              Your order total is ₨0. No payment was needed — your order is confirmed and will be processed immediately.
            </p>
          </div>
        )}

        {/* ── Bank Transfer Notice ── */}
        {isBankTransfer && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-amber-800 text-sm">
              <Building2 className="w-4 h-4" /> Payment Confirmation Pending
            </div>
            {bankDetails.length > 0 && (
              <div className="space-y-2">
                {bankDetails.map((bank: any) => (
                  <div key={bank.id} className="bg-white rounded-xl p-3 border border-amber-100 space-y-1.5">
                    {[
                      { label: 'Bank', value: bank.bankName },
                      { label: 'Account Title', value: bank.accountTitle },
                      { label: 'Account #', value: bank.accountNumber, mono: true },
                      ...(bank.iban ? [{ label: 'IBAN', value: bank.iban, mono: true }] : []),
                    ].filter(r => r.value).map(({ label, value, mono }) => (
                      <div key={label} className="flex justify-between items-center text-xs">
                        <span className="text-gray-500">{label}</span>
                        <span className={`font-semibold text-gray-900 ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
                      </div>
                    ))}
                    {bank.instructions && (
                      <p className="text-[11px] text-amber-700 border-t border-amber-100 pt-2">{bank.instructions}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <span className="text-base leading-none mt-0.5">📸</span>
              <p className="text-[11px] text-blue-700 font-medium">
                Send your payment screenshot via WhatsApp or chat. Your order will be confirmed once payment is verified.
              </p>
            </div>
          </div>
        )}

        {/* ── Action Buttons ── */}
        <div className="space-y-2.5 pt-1">
          {orderId && (
            <button
              onClick={() => setLocation(`/order/${orderId}/tracking`)}
              className="w-full flex items-center justify-between px-5 bg-[#5FA800] text-white font-bold py-4 rounded-2xl shadow-md active:bg-[#4d8a00] transition-colors"
            >
              <span className="flex items-center gap-2"><Truck className="w-5 h-5" /> Track Your Order</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {/* WhatsApp QR */}
          <NutsWhatsAppQR />

          {displayOrderNumber && (
            <button
              onClick={handleInvoice}
              className="w-full flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-700 font-semibold py-3.5 rounded-2xl active:bg-gray-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Download Invoice
            </button>
          )}

          <button
            onClick={() => setLocation("/home")}
            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold transition-colors active:scale-[0.98] ${
              orderId ? "border-2 border-[#5FA800] text-[#5FA800] active:bg-[#f2f8ec]" : "bg-[#5FA800] text-white shadow-md active:bg-[#4d8a00]"
            }`}
          >
            <Home className="w-4 h-4" /> Continue Shopping
          </button>

          <button
            onClick={() => setLocation("/orders")}
            className="w-full flex items-center justify-center gap-2 text-gray-500 font-medium py-2 text-sm active:text-gray-700 transition-colors"
          >
            View All Orders <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
