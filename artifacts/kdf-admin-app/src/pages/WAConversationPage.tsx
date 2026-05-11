import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/App";
import {
  ArrowLeft, Send, RefreshCw, Bot, User, Zap,
  Package, Phone, MapPin, Clock, X,
} from "lucide-react";

/* ── helpers ─────────────────────────────────────────── */
function timeStr(d: string) {
  try { return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}
function dateSep(d: string) {
  try {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return new Date(d).toLocaleDateString([], { day: "numeric", month: "short" });
  } catch { return ""; }
}
function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ── quick-reply template bank ───────────────────────── */
const QR_CATEGORIES: Record<string, string[]> = {
  Greeting: [
    "السلام علیکم! KDF NUTS میں خوش آمدید 🥜 آپ کی کیا مدد کر سکتے ہیں؟",
    "Hello! Welcome to KDF NUTS. How can we help you today? 😊",
    "Salam! KDF NUTS customer care mein aapka swagat hai. Batayein kya chahiye? 🌟",
  ],
  Order: [
    "✅ آپ کا آرڈر confirm ہوگیا! جلد dispatch کریں گے 🚚 شکریہ!",
    "Order confirmed ✅ We'll dispatch your order shortly. Thank you!",
    "آپ کا آرڈر موصول ہوگیا۔ پیکنگ شروع ہوگئی ہے 📦 جلد update دیں گے۔",
    "Sorry, we couldn't process your order. Please contact us. 🙏",
  ],
  Tracking: [
    "📦 آپ کا آرڈر dispatch ہوگیا۔ Tracking: [TRACKING_ID]",
    "Your order has been dispatched! Tracking: [TRACKING_ID] 🚚",
    "آرڈر روانہ ہوگیا۔ Rider کچھ دیر میں آپ سے contact کرے گا 📞",
    "Track your order: https://kdfnuts.com/track 🔍",
  ],
  COD: [
    "💰 Delivery پر exact cash تیار رکھیں: Rs. [AMOUNT]",
    "COD — please keep Rs. [AMOUNT] ready at delivery 💵",
    "آرڈر کی رقم Rs. [AMOUNT] — delivery کے وقت ادا کریں",
    "Payment: JazzCash/Easypaisa 03XX-XXXXXXX | Rs. [AMOUNT]",
  ],
  Payment: [
    "✅ آپ کی payment موصول ہوگئی! آرڈر dispatch ہوگا 🙏",
    "Payment received! ✅ Order will be dispatched within 24 hours.",
    "Payment confirmed. Processing your order now ⚡ Thank you!",
    "Payment pending. Please send screenshot: 03XX-XXXXXXX 📲",
  ],
  Delivery: [
    "🚚 آپ کا آرڈر آج deliver ہوگا۔ Rider contact کرے گا",
    "Your order is out for delivery today! Rider will call shortly 📞",
    "Delivery attempt failed. Call 03XX-XXXXXXX to reschedule 🙏",
    "✅ آرڈر deliver ہوگیا! شکریہ KDF NUTS کا انتخاب کرنے کے لیے 🌟",
  ],
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  pending:   "text-yellow-400 bg-yellow-500/10",
  confirmed: "text-blue-400   bg-blue-500/10",
  shipped:   "text-cyan-400   bg-cyan-500/10",
  delivered: "text-green-400  bg-green-500/10",
  cancelled: "text-red-400    bg-red-500/10",
  paid:      "text-green-400  bg-green-500/10",
};

/* ── Customer order panel overlay ────────────────────── */
function OrderPanel({ phone, token, onClose }: { phone: string; token: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["wa-cust-orders", phone],
    queryFn: () =>
      fetch(`/api/admin/shopify/orders?search=${encodeURIComponent(phone)}&limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
    staleTime: 30_000,
  });

  const orders: any[] = data?.orders ?? [];

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-background">
      <div className="h-14 bg-card border-b border-border flex items-center justify-between px-4 shrink-0">
        <span className="font-semibold text-sm flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" /> Customer Orders
        </span>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="py-10 text-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No orders found for this number</p>
          </div>
        ) : (
          orders.map((o: any) => {
            const num    = o.orderNumber ?? o.order_number ?? `#${o.id}`;
            const status = (o.financialStatus ?? o.financial_status ?? o.status ?? "pending").toLowerCase();
            const total  = Number(o.totalPrice ?? o.total_price ?? 0);
            const city   = o.shippingAddress?.city ?? o.shipping_address?.city ?? "—";
            const col    = ORDER_STATUS_COLOR[status] ?? "text-muted-foreground bg-muted";
            return (
              <div key={o.id} className="bg-card border border-border rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{num}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${col}`}>
                    {status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{city}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(o.createdAt ?? o.created_at ?? "")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-primary text-sm">Rs. {total.toLocaleString()}</span>
                  {o.trackingNumber && (
                    <span className="text-[10px] font-mono text-cyan-400">{o.trackingNumber}</span>
                  )}
                </div>
                {o.customerPhone && (
                  <a href={`tel:${o.customerPhone}`}
                    className="flex items-center justify-center gap-1.5 w-full h-8 rounded-lg bg-muted text-xs text-muted-foreground">
                    <Phone className="w-3 h-3" /> Call Customer
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────── */
export default function WAConversationPage({ params }: { params: { phone: string } }) {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const phone = decodeURIComponent(params.phone);

  const [reply, setReply]           = useState("");
  const [showQR, setShowQR]         = useState(false);
  const [qrCat, setQrCat]           = useState("Greeting");
  const [showOrders, setShowOrders] = useState(false);
  const [botMode, setBotMode]       = useState(false);
  const bottomRef                   = useRef<HTMLDivElement>(null);
  const textareaRef                 = useRef<HTMLTextAreaElement>(null);

  const { data: msgs = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["wa-msgs", phone],
    queryFn: () =>
      fetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(phone)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).then(d => Array.isArray(d) ? d : (d?.messages ?? d?.data ?? [])),
    refetchInterval: 8_000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const r = await fetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(phone)}/reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-msgs", phone] });
      setReply("");
      setShowQR(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    },
  });

  const handleSend = useCallback(() => {
    const text = reply.trim();
    if (!text || sendMutation.isPending) return;
    sendMutation.mutate(text);
  }, [reply, sendMutation]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReply(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const custName = msgs.find((m: any) => m.direction === "in")?.from_name ?? phone;
  let lastDate = "";

  /* bottom padding: extra when QR drawer open */
  const mainPb = showQR ? "pb-72" : "pb-20";

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">

      {/* ── Header ── */}
      <header className="h-14 bg-card border-b border-border flex items-center gap-2 px-3 shrink-0 shadow-sm">
        <button onClick={() => navigate("/wa")}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* tap to open orders panel */}
        <button onClick={() => setShowOrders(true)}
          className="flex-1 flex items-center gap-2.5 min-w-0 text-left py-1">
          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-sm shrink-0">
            {custName[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{custName}</p>
            <p className="text-[10px] text-green-400/70">{phone} · tap for orders</p>
          </div>
        </button>

        {/* bot toggle */}
        <button onClick={() => setBotMode(b => !b)}
          className={`w-8 h-8 flex items-center justify-center rounded-xl transition ${
            botMode ? "bg-primary/15 text-primary" : "hover:bg-muted text-muted-foreground"
          }`}
          title={botMode ? "Bot mode ON" : "Bot mode OFF"}>
          <Bot className="w-4 h-4" />
        </button>

        <button onClick={() => refetch()}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </header>

      {/* ── Messages ── */}
      <main className={`flex-1 overflow-y-auto px-3 py-3 ${mainPb}`}>
        {isLoading ? (
          <div className="py-24 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading messages…</p>
          </div>
        ) : msgs.length === 0 ? (
          <div className="py-24 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">💬</span>
            </div>
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Use quick replies below to start</p>
          </div>
        ) : (
          msgs.map((m: any, i: number) => {
            const isOut   = m.direction === "out";
            const body    = m.content ?? m.body ?? m.message ?? "";
            const msgDate = dateSep(m.created_at ?? "");
            const showSep = msgDate !== lastDate;
            if (showSep) lastDate = msgDate;

            return (
              <div key={m.id ?? i}>
                {showSep && (
                  <div className="flex items-center gap-2 my-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[10px] text-muted-foreground font-medium bg-background px-2.5 py-0.5 rounded-full border border-border/50">
                      {msgDate}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}

                <div className={`flex mb-1.5 ${isOut ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] flex flex-col ${isOut ? "items-end" : "items-start"}`}>
                    {/* bot/agent label */}
                    {isOut && (m.is_bot || m.agent_name) && (
                      <div className={`flex items-center gap-1 mb-0.5 ${isOut ? "flex-row-reverse" : ""}`}>
                        {m.is_bot
                          ? <><Bot className="w-2.5 h-2.5 text-primary" /><span className="text-[9px] text-primary font-semibold">AI Bot</span></>
                          : <><User className="w-2.5 h-2.5 text-muted-foreground" /><span className="text-[9px] text-muted-foreground">{m.agent_name}</span></>
                        }
                      </div>
                    )}

                    {/* bubble */}
                    <div className={`px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap shadow-sm ${
                      isOut
                        ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-none"
                        : "bg-card border border-border/70 text-foreground rounded-2xl rounded-tl-none"
                    }`}>
                      {body || <em className="text-xs opacity-40">[media]</em>}
                    </div>

                    <span className="text-[9px] text-muted-foreground mt-1 px-0.5">
                      {timeStr(m.created_at ?? "")}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </main>

      {/* ── Quick Reply Drawer (slides up above reply bar) ── */}
      {showQR && (
        <div className="absolute bottom-[60px] left-0 right-0 bg-card border-t border-border shadow-2xl z-10 max-h-[260px] flex flex-col">
          {/* categories */}
          <div className="flex overflow-x-auto gap-1.5 px-3 py-2 border-b border-border/50 shrink-0 scrollbar-hide">
            {Object.keys(QR_CATEGORIES).map(cat => (
              <button key={cat} onClick={() => setQrCat(cat)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition ${
                  qrCat === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                {cat}
              </button>
            ))}
          </div>
          {/* templates */}
          <div className="overflow-y-auto flex-1 px-2.5 py-2 space-y-1">
            {(QR_CATEGORIES[qrCat] ?? []).map((tpl, i) => (
              <button key={i}
                onClick={() => {
                  setReply(tpl);
                  setShowQR(false);
                  setTimeout(() => {
                    textareaRef.current?.focus();
                    if (textareaRef.current) {
                      textareaRef.current.style.height = "auto";
                      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
                    }
                  }, 50);
                }}
                className="w-full text-left px-3 py-2.5 rounded-xl text-xs text-foreground bg-muted/60 hover:bg-muted active:scale-[0.99] transition leading-relaxed">
                {tpl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Reply Bar ── */}
      <div className="shrink-0 bg-card border-t border-border px-3 py-2 flex items-end gap-2 z-20">
        <button onClick={() => setShowQR(q => !q)}
          className={`w-9 h-9 flex items-center justify-center rounded-xl border transition shrink-0 ${
            showQR ? "bg-primary/15 border-primary/40 text-primary" : "border-border bg-muted text-muted-foreground"
          }`}
          title="Quick replies">
          <Zap className="w-4 h-4" />
        </button>

        <textarea
          ref={textareaRef}
          value={reply}
          onChange={handleTextChange}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Type a reply… (Enter to send)"
          rows={1}
          className="flex-1 resize-none rounded-xl bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          style={{ minHeight: "36px", maxHeight: "120px" }}
        />

        <button onClick={handleSend}
          disabled={!reply.trim() || sendMutation.isPending}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 active:scale-90 transition shrink-0">
          {sendMutation.isPending
            ? <div className="w-4 h-4 border-2 border-primary-foreground/70 border-t-transparent rounded-full animate-spin" />
            : <Send className="w-4 h-4" />
          }
        </button>
      </div>

      {/* ── Customer order panel overlay ── */}
      {showOrders && (
        <OrderPanel phone={phone} token={token} onClose={() => setShowOrders(false)} />
      )}
    </div>
  );
}
