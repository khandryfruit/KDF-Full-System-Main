import { useState, useEffect, useRef, useCallback } from "react";
import { useNotifications } from "@/context/NotificationContext";
import { apiPublicUrl, adminApiUrl } from "@/lib/apiBase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle, Search, Send, Bot, User, RefreshCw, CheckCheck, Check,
  Clock, Phone, ShoppingCart, X, Sparkles, Loader2, Package, Circle,
  Archive, MessageSquare, ArrowLeft, Tag, ShoppingBag, Zap, ChevronRight,
  Star, StickyNote, CreditCard, BarChart2, TrendingUp, TrendingDown,
  AlertTriangle, Shield, Users, MessageSquareDashed, Inbox,
  ChevronDown, Filter, Hash,
} from "lucide-react";

function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(adminApiUrl(path), {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

function timeAgo(date: string | null | undefined): string {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(date).toLocaleDateString("en-PK", { day: "numeric", month: "short" });
}

function formatTime(date: string): string {
  return new Date(date).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function StatusIcon({ status }: { status: string }) {
  if (status === "read") return <CheckCheck className="w-3 h-3 text-[#53bdeb]" />;
  if (status === "delivered") return <CheckCheck className="w-3 h-3 text-gray-400" />;
  if (status === "sent") return <Check className="w-3 h-3 text-gray-400" />;
  if (status === "failed") return <X className="w-3 h-3 text-red-400" />;
  return <Clock className="w-3 h-3 text-gray-300" />;
}

function BotBadge({ mode }: { mode: string }) {
  if (mode === "auto") return (
    <span className="inline-flex items-center gap-0.5 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">
      <Bot className="w-2 h-2" /> Auto
    </span>
  );
  if (mode === "human") return (
    <span className="inline-flex items-center gap-0.5 text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
      <User className="w-2 h-2" /> Human
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-semibold">
      <Circle className="w-2 h-2" /> Off
    </span>
  );
}

const QUICK_REPLIES = [
  { label: "Greeting", text: "Assalam o Alaikum! 🌟 KDF NUTS mein khush amdeed! Aap k liye kya kar sakte hain?" },
  { label: "Order Status", text: "Aap ka order process ho raha hai. Jaldi deliver hoga InshaAllah! 📦" },
  { label: "Delivery Time", text: "Delivery 2-4 working days mein hoti hai. Lahore mein same/next day delivery available hai! 🚚" },
  { label: "Payment", text: "Hum Cash on Delivery (COD) accept karte hain. Payment delivery par karein. 💰" },
  { label: "Thank You", text: "Shukriya! Aap ka order place ho gaya. Hum jald connect karenge. KDF NUTS 🙏" },
  { label: "Track Order", text: "Apna order number share karein, main abhi track karta hoon. 🔍" },
  { label: "Urdu Greeting", text: "السلام علیکم! KDF NUTS میں خوش آمدید۔ ہم آپ کی کیا مدد کر سکتے ہیں؟ 🌟" },
  { label: "COD Info", text: "Ji bilkul! Hum Cash on Delivery (COD) offer karte hain. Delivery par payment karein. Koi advance nahi chahiye. 💚" },
];

/* ══ ANALYTICS PANEL ══ */
function AnalyticsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["wa-analytics"],
    queryFn: () => api("/admin/wa/analytics").then(r => r.json()),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const s = data?.stats ?? {};
  const volume: any[] = data?.volume ?? [];
  const intents: any[] = data?.intents ?? [];

  const StatCard = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: any; color: string }) => (
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3 shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-lg font-bold leading-none">{isLoading ? "—" : (value ?? 0)}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );

  const maxVol = Math.max(...volume.map((v: any) => parseInt(v.inbound ?? 0) + parseInt(v.outbound ?? 0)), 1);

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      <div>
        <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-[#25D366]" /> WhatsApp Analytics
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <StatCard icon={MessageSquare} label="Total Conversations" value={s.total_conversations} color="bg-[#25D366]/10 text-[#25D366]" />
          <StatCard icon={Inbox} label="Open Now" value={s.open_conversations} color="bg-blue-50 text-blue-600" />
          <StatCard icon={TrendingUp} label="Active Today" value={s.active_today} color="bg-orange-50 text-orange-600" />
          <StatCard icon={MessageSquareDashed} label="Unread" value={s.total_unread} color="bg-red-50 text-red-600" />
          <StatCard icon={TrendingUp} label="Inbound Today" value={s.inbound_today} color="bg-emerald-50 text-emerald-600" />
          <StatCard icon={TrendingDown} label="Outbound Today" value={s.outbound_today} color="bg-purple-50 text-purple-600" />
          <StatCard icon={Bot} label="Bot Replies Today" value={s.bot_replies_today} color="bg-indigo-50 text-indigo-600" />
          <StatCard icon={Users} label="New This Week" value={s.new_this_week} color="bg-pink-50 text-pink-600" />
        </div>
      </div>

      {/* 7-day chart */}
      {volume.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">7-Day Message Volume</p>
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex items-end gap-1.5 h-20">
              {volume.map((v: any, i: number) => {
                const total = parseInt(v.inbound ?? 0) + parseInt(v.outbound ?? 0);
                const inH = Math.round((parseInt(v.inbound ?? 0) / maxVol) * 72);
                const outH = Math.round((parseInt(v.outbound ?? 0) / maxVol) * 72);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="flex items-end gap-0.5 w-full justify-center">
                      <div className="w-2 bg-[#25D366] rounded-t" style={{ height: inH || 2 }} title={`In: ${v.inbound}`} />
                      <div className="w-2 bg-blue-400 rounded-t" style={{ height: outH || 2 }} title={`Out: ${v.outbound}`} />
                    </div>
                    <span className="text-[8px] text-gray-400">
                      {new Date(v.day).toLocaleDateString("en-PK", { weekday: "narrow" })}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-[9px] text-gray-500"><span className="w-2 h-2 bg-[#25D366] rounded-sm inline-block" /> Inbound</span>
              <span className="flex items-center gap-1 text-[9px] text-gray-500"><span className="w-2 h-2 bg-blue-400 rounded-sm inline-block" /> Outbound</span>
            </div>
          </div>
        </div>
      )}

      {/* Top intents */}
      {intents.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">Top Customer Intents</p>
          <div className="space-y-1.5">
            {intents.map((intent: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-3 py-2">
                <span className="text-xs capitalize text-gray-700">{intent.intent?.replace(/_/g, " ")}</span>
                <span className="text-xs font-bold text-[#25D366]">{intent.cnt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meta compliance */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
          <Shield className="w-3 h-3 text-green-600" /> Meta Compliance
        </p>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-green-800">
            <Check className="w-3 h-3" /> 24-hour session window monitored
          </div>
          <div className="flex items-center gap-2 text-xs text-green-800">
            <Check className="w-3 h-3" /> HMAC webhook verification active
          </div>
          <div className="flex items-center gap-2 text-xs text-green-800">
            <Check className="w-3 h-3" /> Human handoff available
          </div>
          <div className="flex items-center gap-2 text-xs text-green-800">
            <Check className="w-3 h-3" /> Rate limiting enabled
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══ PRODUCT PICKER ══ */
function ProductPickerModal({ onClose, onSend }: { onClose: () => void; onSend: (p: any, variant?: any) => void }) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["wa-products", debouncedQ],
    queryFn: () => api(`/admin/wa/products/search?q=${encodeURIComponent(debouncedQ)}&limit=8`).then(r => r.json()),
    staleTime: 30_000,
  });
  const products: any[] = data?.products ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#25D366]/10 rounded-xl flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-[#25D366]" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Share Product Card</h3>
              <p className="text-[10px] text-gray-400">Customer gets image + Order Now button</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search badam, kaju, pista, akhrot…"
              className="w-full pl-8 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#25D366]/40 focus:border-[#25D366]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#25D366]" /></div>
          ) : products.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No products found</div>
          ) : products.map((p: any) => (
            <div key={p.id} className="border border-gray-100 rounded-xl overflow-hidden hover:border-[#25D366]/30 hover:shadow-sm transition-all">
              <div className="flex items-start gap-3 p-3">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Package className="w-6 h-6 text-gray-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                  <p className="text-sm font-bold text-[#25D366] mt-0.5">Rs. {(p.price ?? 0).toLocaleString("en-PK")}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${p.inStock ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {p.inStock ? "✓ In Stock" : "Out of Stock"}
                    </span>
                    <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{p.source}</span>
                  </div>
                </div>
                <button
                  onClick={() => onSend(p)}
                  className="flex-shrink-0 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors"
                >
                  Share
                </button>
              </div>
              {p.variants?.length > 0 && (
                <div className="px-3 pb-2 flex flex-wrap gap-1">
                  {p.variants.map((v: any, vi: number) => (
                    <button
                      key={vi}
                      onClick={() => onSend(p, v)}
                      className="text-[10px] px-2 py-1 border border-gray-200 rounded-lg hover:border-[#25D366] hover:text-[#25D366] hover:bg-[#25D366]/5 transition-all font-medium"
                    >
                      {v.title} — Rs.{(v.price ?? 0).toLocaleString("en-PK")}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══ ORDER SEARCH PANEL ══ */
function OrderSearchPanel({ onSendStatus }: { onSendStatus: (orderId: number) => void }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 400);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["wa-orders-search", dq],
    queryFn: () => api(`/admin/wa/orders/search?q=${encodeURIComponent(dq)}`).then(r => r.json()),
    enabled: dq.length >= 2,
    staleTime: 20_000,
  });
  const orders: any[] = data?.orders ?? [];

  const STATUS: Record<string, { emoji: string; color: string }> = {
    pending: { emoji: "⏳", color: "text-yellow-600 bg-yellow-50" },
    processing: { emoji: "🔧", color: "text-blue-600 bg-blue-50" },
    shipped: { emoji: "🚚", color: "text-indigo-600 bg-indigo-50" },
    delivered: { emoji: "✅", color: "text-green-600 bg-green-50" },
    cancelled: { emoji: "❌", color: "text-red-600 bg-red-50" },
    out_for_delivery: { emoji: "🛵", color: "text-orange-600 bg-orange-50" },
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Order # or customer name…"
          className="w-full pl-7 pr-2 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366]"
        />
      </div>
      {isLoading && <div className="flex justify-center py-2"><Loader2 className="w-3 h-3 animate-spin text-[#25D366]" /></div>}
      {orders.map((o: any) => {
        const st = STATUS[o.status ?? ""] ?? { emoji: "📦", color: "text-gray-600 bg-gray-50" };
        return (
          <div key={o.id} className="bg-gray-50 rounded-xl p-2.5 text-xs border border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold">{o.orderNumber}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${st.color}`}>{st.emoji} {o.status}</span>
            </div>
            <div className="text-gray-500 flex items-center justify-between mb-2">
              <span>{o.customerName}</span>
              <span className="font-semibold text-gray-700">Rs. {parseFloat(o.total ?? "0").toLocaleString("en-PK")}</span>
            </div>
            <button
              onClick={() => onSendStatus(o.id)}
              className="w-full py-1.5 text-[10px] font-semibold bg-[#25D366] text-white rounded-lg hover:bg-[#1ebe5d] transition-colors"
            >
              📤 Send Status Update
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ══ PAYMENT MODAL ══ */
function PaymentModal({ onClose, onSend }: { onClose: () => void; onSend: (amount?: number, ref?: string) => void }) {
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Send Payment Details</h3>
              <p className="text-[10px] text-gray-400">Bank + JazzCash + Easypaisa info</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Amount (optional)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">Rs.</span>
              <input
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 2500"
                type="number"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-300 focus:border-green-400"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Order Reference (optional)</label>
            <input
              value={ref}
              onChange={e => setRef(e.target.value)}
              placeholder="e.g. #1234"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-300 focus:border-green-400"
            />
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-[10px] text-gray-500 space-y-0.5">
            <p className="font-semibold text-gray-600 text-xs mb-1">Will be sent:</p>
            <p>🏦 Meezan Bank — IBAN: PK02MEZN000296...</p>
            <p>📱 JazzCash — 0314-7009134</p>
            <p>📱 Easypaisa — 0314-7009134</p>
            <p className="mt-1 text-green-600 font-medium">+ "I Have Paid" button</p>
          </div>
          <button
            onClick={() => onSend(amount ? parseFloat(amount) : undefined, ref || undefined)}
            className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            💳 Send Payment Details
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══ SESSION WARNING BADGE ══ */
function SessionBadge({ convId }: { convId: number }) {
  const { data } = useQuery({
    queryKey: ["wa-session", convId],
    queryFn: () => api(`/admin/wa/conversations/${convId}/session`).then(r => r.json()),
    staleTime: 300_000,
    refetchInterval: 600_000,
  });

  if (!data) return null;

  if (data.within24h) {
    return (
      <div className="flex items-center gap-1 text-[9px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
        <Shield className="w-2.5 h-2.5" />
        24h window: {data.hoursRemaining}h left
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
      <AlertTriangle className="w-2.5 h-2.5" />
      Session expired — use template only
    </div>
  );
}

/* ══ MAIN COMPONENT ══ */
export default function WaInboxPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | "closed" | "all">("all");
  const [showMobile, setShowMobile] = useState<"list" | "chat" | "analytics">("list");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [rightTab, setRightTab] = useState<"info" | "products" | "orders" | "quick" | "notes">("info");
  const [sendingProduct, setSendingProduct] = useState(false);
  const [sendingOrder, setSendingOrder] = useState(false);
  const [sendingPayment, setSendingPayment] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const syncInboxMutation = useMutation({
    mutationFn: () => api("/admin/wa/inbox/sync", { method: "POST" }).then(async (r) => {
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? `Sync failed (${r.status})`);
      }
      return r.json();
    }),
    onSuccess: (d) => {
      showToast(`Synced ${d.conversationsUpserted ?? 0} chats`);
      queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const { data: convData, isLoading: convLoading, refetch: refetchConvs, isError: convError } = useQuery({
    queryKey: ["wa-conversations", search, statusFilter],
    queryFn: async () => {
      const r = await api(`/admin/wa/conversations?search=${encodeURIComponent(search)}&status=${statusFilter}&limit=60&sync=1`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? `Failed to load (${r.status})`);
      }
      return r.json();
    },
    staleTime: 3_000,
    refetchInterval: 6_000,
  });

  const { data: convDetail } = useQuery({
    queryKey: ["wa-conversation-detail", selectedId],
    queryFn: () => api(`/admin/wa/conversations/${selectedId}`).then(r => r.json()),
    enabled: !!selectedId,
    staleTime: 30_000,
  });

  const { data: msgData, isLoading: msgLoading, refetch: refetchMsgs } = useQuery({
    queryKey: ["wa-messages", selectedId],
    queryFn: () => api(`/admin/wa/conversations/${selectedId}/messages?limit=100`).then(r => r.json()),
    enabled: !!selectedId,
    staleTime: 1_000,
    refetchInterval: selectedId ? 4_000 : false,
  });

  const replyMutation = useMutation({
    mutationFn: (msg: string) =>
      api(`/admin/wa/conversations/${selectedId}/reply`, { method: "POST", body: JSON.stringify({ message: msg }) }).then(r => r.json()),
    onSuccess: () => { setMessage(""); refetchMsgs(); refetchConvs(); },
    onError: () => showToast("Send failed", "error"),
  });

  const botModeMutation = useMutation({
    mutationFn: (mode: string) =>
      api(`/admin/wa/conversations/${selectedId}/bot-mode`, { method: "PUT", body: JSON.stringify({ mode }) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-conversation-detail", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      api(`/admin/wa/conversations/${selectedId}/status`, { method: "PUT", body: JSON.stringify({ status }) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["wa-conversation-detail", selectedId] });
    },
  });

  const starMutation = useMutation({
    mutationFn: () => api(`/admin/wa/conversations/${selectedId}/star`, { method: "PUT" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-conversation-detail", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
    },
  });

  const noteMutation = useMutation({
    mutationFn: (note: string) =>
      api(`/admin/wa/conversations/${selectedId}/note`, { method: "POST", body: JSON.stringify({ note }) }).then(r => r.json()),
    onSuccess: () => { showToast("Note saved!"); queryClient.invalidateQueries({ queryKey: ["wa-conversation-detail", selectedId] }); },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => api(`/admin/wa/conversations/${id}/read`, { method: "PUT" }).then(r => r.json()),
  });

  const aiSuggestMutation = useMutation({
    mutationFn: () => api(`/admin/wa/conversations/${selectedId}/ai-suggest`, { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => { if (d.suggestion) { setMessage(d.suggestion); textareaRef.current?.focus(); } },
    onError: () => showToast("AI suggestion failed", "error"),
  });

  /* ── NotificationContext: sync waUnread when conv opened ── */
  const { setWaUnread } = useNotifications();

  /* SSE real-time — piggyback on global SSE via query invalidation */
  useEffect(() => {
    const token = localStorage.getItem("kdf_admin_token") ?? "";
    const es = new EventSource(apiPublicUrl(`/api/admin/sse?token=${encodeURIComponent(token)}`));

    es.addEventListener("wa_message", (e) => {
      const data = JSON.parse(e.data) as any;
      /* Always refresh conversation list so order + unread badge updates */
      queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
      /* Refresh messages only if this conversation is open */
      if (data.conversationId === selectedId) {
        queryClient.invalidateQueries({ queryKey: ["wa-messages", selectedId] });
      }
    });

    es.addEventListener("wa_unread_count", (e) => {
      const data = JSON.parse(e.data) as any;
      setWaUnread(data.total ?? 0);
    });

    return () => es.close();
  }, [selectedId, setWaUnread, queryClient]);

  /* Auto-scroll */
  useEffect(() => {
    if (msgData?.messages?.length) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [msgData]);

  /* Search debounce */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  /* Sync note text when conv changes */
  useEffect(() => {
    if (convDetail?.conversation?.internalNote) {
      setNoteText(convDetail.conversation.internalNote);
    } else {
      setNoteText("");
    }
  }, [convDetail?.conversation?.id]);

  const selectConversation = useCallback((id: number) => {
    setSelectedId(id);
    setShowMobile("chat");
    markReadMutation.mutate(id);
    queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
    /* Sync global WA unread after marking read — fetch fresh count */
    api("/admin/wa/unread-count")
      .then((r) => r.json())
      .then((d) => setWaUnread(d.total ?? 0))
      .catch(() => {});
  }, [setWaUnread]);

  const handleSend = () => {
    if (!message.trim() || replyMutation.isPending) return;
    replyMutation.mutate(message.trim());
  };

  const handleSendProduct = async (p: any, variant?: any) => {
    if (!selectedId) return;
    setShowProductPicker(false);
    setSendingProduct(true);
    try {
      const variantStr = variant ? variant.title : (p.variants?.length > 0 ? p.variants.map((v: any) => `${v.title}: Rs.${(v.price ?? 0).toLocaleString("en-PK")}`).join(", ") : "");
      const price = variant ? variant.price : p.price;
      const res = await api(`/admin/wa/conversations/${selectedId}/send-product`, {
        method: "POST",
        body: JSON.stringify({ productName: variant ? `${p.name} — ${variant.title}` : p.name, price, imageUrl: p.imageUrl, productUrl: p.url, variants: variantStr }),
      });
      const d = await res.json();
      if (d.success) { showToast("Product card sent! ✅"); refetchMsgs(); }
      else showToast("Failed to send product", "error");
    } catch { showToast("Error sending product", "error"); }
    setSendingProduct(false);
  };

  const handleSendPayment = async (amount?: number, ref?: string) => {
    if (!selectedId) return;
    setShowPaymentModal(false);
    setSendingPayment(true);
    try {
      const res = await api(`/admin/wa/conversations/${selectedId}/send-payment`, {
        method: "POST",
        body: JSON.stringify({ amount, orderRef: ref }),
      });
      const d = await res.json();
      if (d.success) { showToast("Payment details sent! 💳"); refetchMsgs(); }
      else showToast("Failed to send payment details", "error");
    } catch { showToast("Error", "error"); }
    setSendingPayment(false);
  };

  const handleSendOrderStatus = async (orderId: number) => {
    if (!selectedId) return;
    setSendingOrder(true);
    try {
      const res = await api(`/admin/wa/conversations/${selectedId}/send-order-status`, {
        method: "POST", body: JSON.stringify({ orderId }),
      });
      const d = await res.json();
      if (d.success) { showToast("Order status sent! 📦"); refetchMsgs(); }
      else showToast("Failed to send order status", "error");
    } catch { showToast("Error", "error"); }
    setSendingOrder(false);
  };

  const conversations: any[] = convData?.conversations ?? [];
  const messages: any[] = msgData?.messages ?? [];
  const conv = convDetail?.conversation;
  const customer = convDetail?.customer;
  const customerOrders: any[] = convDetail?.orders ?? [];
  const totalUnread = conversations.reduce((s: number, c: any) => s + (c.unreadCount ?? 0), 0);

  /* ══ LEFT PANEL — Conversation List ══ */
  const ConvList = (
    <div className={`flex flex-col bg-white border-r border-gray-200 ${showMobile === "list" ? "flex" : "hidden md:flex"} w-full md:w-[320px] shrink-0`}
      style={{ height: "100%" }}>
      {/* Header — sticky, never scrolls */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#25D366]/10 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-[#25D366]" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-gray-900">WhatsApp Inbox</h2>
              {totalUnread > 0 && (
                <p className="text-[9px] text-[#25D366] font-semibold">{totalUnread} unread messages</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowAnalytics(!showAnalytics); setShowMobile("analytics" as any); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              title="Analytics"
            >
              <BarChart2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => refetchConvs()} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search — sticky */}
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search conversations…"
            className="w-full pl-8 pr-3 py-2 text-xs bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366] transition-all"
          />
        </div>

        {/* Status filter */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5">
          {(["open", "closed", "all"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`flex-1 text-[10px] py-1.5 rounded-lg font-semibold transition-all capitalize ${statusFilter === s ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* List — only this scrolls, header/search stay fixed */}
      <div className="flex-1 overflow-y-auto">
        {convLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-5 h-5 animate-spin text-[#25D366]" />
          </div>
        ) : convError ? (
          <div className="p-6 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
            <p className="text-sm text-red-600 font-medium">Could not load inbox</p>
            <button type="button" onClick={() => refetchConvs()} className="text-xs text-[#25D366] font-semibold underline">Retry</button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400 font-medium">No conversations</p>
            <button
              type="button"
              onClick={() => syncInboxMutation.mutate()}
              disabled={syncInboxMutation.isPending}
              className="text-xs font-semibold text-white bg-[#25D366] px-3 py-1.5 rounded-lg hover:bg-[#1da851] disabled:opacity-60"
            >
              {syncInboxMutation.isPending ? "Syncing…" : "Sync from WhatsApp logs"}
            </button>
          </div>
        ) : conversations.map((c: any) => (
          <button key={c.id} onClick={() => selectConversation(c.id)}
            className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-all duration-150 flex gap-3 items-start
              ${selectedId === c.id
                ? "bg-[#25D366]/8 border-l-[3px] border-l-[#25D366] shadow-sm"
                : "hover:bg-gray-50 border-l-[3px] border-l-transparent"
              }`}>

            {/* Avatar */}
            <div className="relative shrink-0">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ${selectedId === c.id ? "bg-[#25D366] text-white" : "bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600"}`}>
                {(c.contactName ?? c.contactPhone)?.[0]?.toUpperCase() ?? "?"}
              </div>
              {c.isStarred && (
                <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center shadow-sm">
                  <Star className="w-2 h-2 text-white fill-white" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className={`text-sm font-semibold truncate ${selectedId === c.id ? "text-[#075e54]" : "text-gray-900"}`}>
                  {c.contactName ?? c.contactPhone}
                </span>
                <span className="text-[10px] text-gray-400 shrink-0 font-medium">{timeAgo(c.lastMessageAt)}</span>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5 leading-relaxed">{c.lastMessage ?? "No messages yet"}</p>
              <div className="flex items-center justify-between mt-1.5">
                <BotBadge mode={c.botMode ?? "auto"} />
                {c.unreadCount > 0 && (
                  <span className="text-[9px] bg-[#25D366] text-white px-1.5 py-0.5 rounded-full font-bold min-w-[20px] text-center shadow-sm">{c.unreadCount}</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  /* ══ MIDDLE PANEL — Chat ══ */
  const ChatPanel = (
    <div
      className={`flex flex-col flex-1 min-w-0 overflow-hidden ${showMobile === "chat" ? "flex" : "hidden md:flex"}`}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23000000' fill-opacity='0.02' fill-rule='evenodd'/%3E%3C/svg%3E"), linear-gradient(135deg, #e5ddd5 0%, #d9d0c7 100%)`,
      }}
    >
      {!selectedId ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-8">
            <div className="w-20 h-20 bg-white/50 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
              <MessageCircle className="w-10 h-10 text-[#25D366]/40" />
            </div>
            <h3 className="font-bold text-gray-600 text-lg">WhatsApp Commerce Hub</h3>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              Select a conversation to start chatting.<br />
              Share products, collect payments, track orders.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Chat header — sticky, never moves */}
          <div className="bg-[#075e54] px-3 py-2.5 flex items-center gap-2.5 shrink-0 shadow-md z-10">
            <button className="md:hidden text-white/80 hover:text-white mr-1" onClick={() => setShowMobile("list")}>
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-white text-sm shrink-0">
              {(conv?.contactName ?? conv?.contactPhone)?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate leading-tight">{conv?.contactName ?? conv?.contactPhone ?? "…"}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[#a8e6cf] text-[10px]">{conv?.contactPhone}</p>
                {selectedId && <SessionBadge convId={selectedId} />}
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {[{ v: "auto", label: "Bot", icon: Bot }, { v: "human", label: "Human", icon: User }, { v: "off", label: "Off", icon: X }].map(opt => (
                <button key={opt.v} onClick={() => botModeMutation.mutate(opt.v)}
                  className={`text-[9px] px-1.5 py-1 rounded-lg transition-colors font-semibold flex items-center gap-0.5 ${conv?.botMode === opt.v ? "bg-white text-[#075e54]" : "text-white/70 hover:text-white hover:bg-white/10"}`}>
                  <opt.icon className="w-2.5 h-2.5" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              ))}
              <button onClick={() => starMutation.mutate()} className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors ml-0.5 ${conv?.isStarred ? "text-yellow-300" : "text-white/60"}`} title="Star">
                <Star className={`w-3.5 h-3.5 ${conv?.isStarred ? "fill-yellow-300" : ""}`} />
              </button>
              <button onClick={() => statusMutation.mutate(conv?.status === "open" ? "closed" : "open")}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors" title="Archive">
                <Archive className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Messages — ONLY this area scrolls */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 scroll-smooth">
            {msgLoading ? (
              <div className="flex justify-center pt-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : messages.length === 0 ? (
              <div className="flex justify-center pt-8 text-sm text-gray-400">No messages yet</div>
            ) : messages.map((msg: any) => {
              const isIn = msg.direction === "in";
              const isProduct = msg.content?.startsWith("[Product shared:");
              const isPayment = msg.content?.startsWith("[Payment details");
              const isOrder = msg.content?.startsWith("[Order status");
              const isSystem = isProduct || isPayment || isOrder;
              return (
                <div key={msg.id} className={`flex ${isIn ? "justify-start" : "justify-end"} mb-1`}>
                  <div className={`max-w-[78%] relative ${isIn
                    ? "bg-white rounded-lg rounded-tl-none shadow-sm"
                    : isSystem
                      ? "bg-[#e1f7da] rounded-lg rounded-tr-none border border-[#25D366]/20 shadow-sm"
                      : "bg-[#dcf8c6] rounded-lg rounded-tr-none shadow-sm"
                    } px-3 py-2`}>
                    {msg.isBot && !isIn && (
                      <div className="flex items-center gap-1 mb-0.5">
                        <Bot className="w-2.5 h-2.5 text-[#25D366]" />
                        <span className="text-[9px] text-[#25D366] font-semibold">AI Bot</span>
                      </div>
                    )}
                    {isSystem && (
                      <div className="flex items-center gap-1 mb-0.5">
                        {isProduct && <ShoppingBag className="w-2.5 h-2.5 text-[#25D366]" />}
                        {isPayment && <CreditCard className="w-2.5 h-2.5 text-green-600" />}
                        {isOrder && <Package className="w-2.5 h-2.5 text-blue-600" />}
                        <span className="text-[9px] text-gray-500 font-medium">System</span>
                      </div>
                    )}
                    <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                    <div className={`flex items-center gap-1 mt-0.5 ${isIn ? "justify-start" : "justify-end"}`}>
                      <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                      {!isIn && <StatusIcon status={msg.status} />}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick reply chips — sticky above input */}
          <div className="bg-[#f0f0f0]/80 backdrop-blur-sm px-3 pt-2 flex gap-1.5 overflow-x-auto pb-1 shrink-0" style={{ scrollbarWidth: "none" }}>
            {QUICK_REPLIES.slice(0, 5).map((qr, i) => (
              <button key={i} onClick={() => setMessage(qr.text)}
                className="flex-shrink-0 text-[10px] px-2.5 py-1 bg-white border border-gray-200 rounded-full text-gray-600 hover:border-[#25D366] hover:text-[#25D366] hover:bg-[#25D366]/5 transition-all font-medium shadow-sm">
                {qr.label}
              </button>
            ))}
          </div>

          {/* Reply box — fixed at bottom, never moves */}
          <div className="bg-[#f0f0f0]/90 backdrop-blur-sm px-3 py-2.5 flex items-end gap-2 shrink-0 border-t border-gray-200/60 shadow-[0_-1px_4px_rgba(0,0,0,0.06)]">
            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setShowProductPicker(true)}
                disabled={sendingProduct}
                title="Share product"
                className="w-9 h-9 rounded-full bg-white hover:bg-orange-50 border border-gray-200 flex items-center justify-center text-orange-500 transition-all shadow-sm"
              >
                {sendingProduct ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingBag className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setShowPaymentModal(true)}
                disabled={sendingPayment}
                title="Send payment details"
                className="w-9 h-9 rounded-full bg-white hover:bg-green-50 border border-gray-200 flex items-center justify-center text-green-600 transition-all shadow-sm"
              >
                {sendingPayment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Text input */}
            <div className="flex-1 bg-white rounded-2xl border border-gray-200 px-3 py-2 shadow-sm min-h-[44px] flex items-center">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message… (Enter to send)"
                rows={1}
                className="w-full text-sm resize-none outline-none bg-transparent max-h-28 overflow-y-auto leading-relaxed"
              />
            </div>

            {/* AI + Send */}
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => aiSuggestMutation.mutate()} disabled={aiSuggestMutation.isPending}
                title="AI reply suggestion"
                className="w-9 h-9 rounded-full bg-white hover:bg-purple-50 border border-gray-200 flex items-center justify-center text-purple-600 transition-all shadow-sm">
                {aiSuggestMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              </button>
              <button onClick={handleSend} disabled={!message.trim() || replyMutation.isPending}
                className="w-10 h-10 rounded-full bg-[#25D366] hover:bg-[#1ebe5d] disabled:opacity-40 flex items-center justify-center text-white transition-all shadow-md">
                {replyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  /* ══ RIGHT PANEL — Customer Info ══ */
  const InfoPanel = selectedId && conv ? (
    <div className="hidden lg:flex flex-col w-[340px] shrink-0 bg-white border-l border-gray-200 shadow-[-1px_0_4px_rgba(0,0,0,0.04)]">
      {/* Customer header */}
      <div className="bg-gradient-to-b from-[#075e54] to-[#128C7E] p-4 text-center shrink-0">
        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center font-bold text-white text-2xl mx-auto mb-2 shadow-lg">
          {(customer?.name ?? conv.contactPhone)?.[0]?.toUpperCase() ?? "?"}
        </div>
        <h3 className="text-white font-bold text-sm">{customer?.name ?? conv.contactName ?? "Unknown"}</h3>
        <p className="text-[#a8e6cf] text-xs mt-0.5">{conv.contactPhone}</p>
        {customer?.city && <p className="text-[#a8e6cf] text-[10px] mt-0.5">📍 {customer.city}</p>}
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="text-center">
            <p className="text-white font-bold text-base">{customer?.totalOrders ?? 0}</p>
            <p className="text-[#a8e6cf] text-[9px]">Orders</p>
          </div>
          <div className="w-px h-6 bg-white/20" />
          <div className="text-center">
            <p className="text-white font-bold text-base">Rs.{(((customer?.totalSpend ?? 0) / 1000)).toFixed(1)}k</p>
            <p className="text-[#a8e6cf] text-[9px]">Spent</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 shrink-0 bg-white">
        {([
          { id: "info", label: "Info", icon: User },
          { id: "products", label: "Catalog", icon: Tag },
          { id: "orders", label: "Orders", icon: Package },
          { id: "quick", label: "Quick", icon: Zap },
          { id: "notes", label: "Notes", icon: StickyNote },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setRightTab(tab.id)}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[9px] font-semibold transition-all border-b-2 ${rightTab === tab.id ? "border-[#25D366] text-[#25D366]" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
            <tab.icon className="w-3 h-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Right panel content — only this scrolls */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* INFO TAB */}
        {rightTab === "info" && (
          <>
            <div className="space-y-1.5">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Bot Control</p>
              <div className="grid grid-cols-3 gap-1">
                {[{ v: "auto", label: "Auto Bot", icon: Bot, color: "green" }, { v: "human", label: "Human", icon: User, color: "blue" }, { v: "off", label: "Off", icon: X, color: "gray" }].map(opt => (
                  <button key={opt.v} onClick={() => botModeMutation.mutate(opt.v)}
                    className={`flex flex-col items-center gap-0.5 py-2 rounded-xl text-[9px] font-semibold border-2 transition-all ${conv.botMode === opt.v
                      ? opt.color === "green" ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : opt.color === "blue" ? "border-blue-400 bg-blue-50 text-blue-700"
                          : "border-gray-400 bg-gray-50 text-gray-700"
                      : "border-gray-100 text-gray-400 hover:border-gray-200"}`}>
                    <opt.icon className="w-3.5 h-3.5" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Quick Actions</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setShowProductPicker(true)}
                  className="flex items-center gap-1.5 py-2 px-2.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-xl text-[10px] font-semibold text-orange-700 transition-colors"
                >
                  <ShoppingBag className="w-3 h-3" /> Share Product
                </button>
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="flex items-center gap-1.5 py-2 px-2.5 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl text-[10px] font-semibold text-green-700 transition-colors"
                >
                  <CreditCard className="w-3 h-3" /> Send Payment
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <ShoppingCart className="w-3 h-3" /> Recent Orders
              </p>
              {customerOrders.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-2">No orders for this number</p>
              ) : customerOrders.map((order: any) => {
                const STATUS: Record<string, string> = { pending: "⏳", processing: "🔧", shipped: "🚚", delivered: "✅", cancelled: "❌", out_for_delivery: "🛵" };
                return (
                  <div key={order.id} className="bg-gray-50 rounded-xl p-2.5 text-xs border border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-800">{order.orderNumber}</span>
                      <span className="text-[9px] text-gray-500">{STATUS[order.status] ?? "📦"} {order.status}</span>
                    </div>
                    <div className="text-gray-500 mt-0.5 flex items-center justify-between">
                      <span className="font-semibold text-gray-700">Rs. {parseFloat(order.total ?? "0").toLocaleString("en-PK")}</span>
                      <span>{new Date(order.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</span>
                    </div>
                    {order.trackingId && <p className="text-[10px] text-blue-600 mt-0.5">📍 {order.trackingId}</p>}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-gray-100 pt-2">
              <button onClick={() => statusMutation.mutate(conv.status === "open" ? "closed" : "open")}
                className={`w-full py-2 rounded-xl text-xs font-semibold border transition-colors ${conv.status === "open" ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}>
                {conv.status === "open" ? "✗ Close Conversation" : "✓ Reopen Conversation"}
              </button>
            </div>
          </>
        )}

        {/* CATALOG TAB */}
        {rightTab === "products" && (
          <>
            <button
              onClick={() => setShowProductPicker(true)}
              className="w-full flex items-center justify-between py-3 px-4 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-xl text-sm font-bold transition-colors shadow-md"
            >
              <span className="flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Browse & Share Product</span>
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="bg-[#25D366]/5 border border-[#25D366]/20 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-700">What customer receives:</p>
              <div className="space-y-1 text-[10px] text-gray-600">
                <p>📸 Product image (if available)</p>
                <p>💰 Name + price prominently</p>
                <p>📦 Variant options listed</p>
                <p>🛒 "Order Now" interactive button</p>
                <p>🏠 "Main Menu" button</p>
                <p>🔗 Link to product page</p>
              </div>
            </div>
            <button
              onClick={() => setShowPaymentModal(true)}
              className="w-full flex items-center justify-between py-2.5 px-4 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-bold transition-colors"
            >
              <span className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Send Payment Details</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* ORDERS TAB */}
        {rightTab === "orders" && (
          <>
            <p className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Find & Send Order Status</p>
            <OrderSearchPanel onSendStatus={handleSendOrderStatus} />
            {sendingOrder && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Sending…
              </div>
            )}
          </>
        )}

        {/* QUICK REPLIES TAB */}
        {rightTab === "quick" && (
          <>
            <p className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Quick Reply Templates</p>
            <div className="space-y-2">
              {QUICK_REPLIES.map((qr, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-2.5 hover:bg-gray-50 transition-colors">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">{qr.label}</p>
                  <p className="text-xs text-gray-700 mb-2 leading-relaxed line-clamp-2">{qr.text}</p>
                  <div className="flex gap-1">
                    <button onClick={() => setMessage(qr.text)}
                      className="flex-1 py-1.5 text-[9px] font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                      Edit & Send
                    </button>
                    <button onClick={() => replyMutation.mutate(qr.text)} disabled={replyMutation.isPending}
                      className="flex-1 py-1.5 text-[9px] font-semibold bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-lg transition-colors disabled:opacity-40">
                      Send Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* NOTES TAB */}
        {rightTab === "notes" && (
          <>
            <p className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Internal Note</p>
            <p className="text-[10px] text-gray-400">Only visible to agents — not sent to customer</p>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add internal note about this customer…"
              rows={5}
              className="w-full text-xs p-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366] bg-gray-50"
            />
            <button
              onClick={() => noteMutation.mutate(noteText)}
              disabled={!noteText.trim() || noteMutation.isPending}
              className="w-full py-2.5 bg-[#075e54] hover:bg-[#054d45] text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
            >
              {noteMutation.isPending ? "Saving…" : "💾 Save Note"}
            </button>
            {conv.internalNote && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                <p className="text-[9px] text-yellow-600 font-bold uppercase mb-1">Current Note</p>
                <p className="text-xs text-gray-700">{conv.internalNote}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Toast */}
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-2.5 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-2 transition-all ${toastMsg.type === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"}`}>
          {toastMsg.type === "success" ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
          {toastMsg.text}
        </div>
      )}

      {/* Modals */}
      {showProductPicker && <ProductPickerModal onClose={() => setShowProductPicker(false)} onSend={handleSendProduct} />}
      {showPaymentModal && <PaymentModal onClose={() => setShowPaymentModal(false)} onSend={handleSendPayment} />}

      {/* Page header — sticky, never moves */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-gray-200 bg-white shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#25D366]/10 rounded-xl flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-[#25D366]" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-gray-900">WhatsApp Inbox</h1>
            <p className="text-[9px] text-gray-400 hidden sm:block">AI-powered commerce automation</p>
          </div>
        </div>

        {totalUnread > 0 && (
          <span className="text-xs bg-[#25D366] text-white px-2.5 py-0.5 rounded-full font-bold shadow-sm">{totalUnread} unread</span>
        )}

        {/* Mobile tabs */}
        <div className="ml-auto flex items-center gap-1 md:hidden">
          <button onClick={() => setShowMobile("list")}
            className={`text-[10px] px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${showMobile === "list" ? "bg-[#25D366] text-white" : "text-gray-500 hover:bg-gray-100"}`}>
            Chats
          </button>
          <button onClick={() => { setShowAnalytics(true); setShowMobile("analytics" as any); }}
            className={`text-[10px] px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${showMobile === "analytics" ? "bg-[#25D366] text-white" : "text-gray-500 hover:bg-gray-100"}`}>
            Stats
          </button>
        </div>

        {/* Desktop analytics toggle */}
        <button
          onClick={() => setShowAnalytics(!showAnalytics)}
          className={`hidden md:flex ml-auto items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${showAnalytics ? "bg-[#25D366] text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Analytics
        </button>

        <div className="hidden md:flex items-center gap-1 text-[10px] text-gray-500">
          <div className="w-1.5 h-1.5 bg-[#25D366] rounded-full animate-pulse" />
          AI Active
        </div>
      </div>

      {/* Three-panel area — fills all remaining height, nothing scrolls here */}
      <div className="flex flex-1 overflow-hidden">
        {/* Analytics panel — replaces chat on mobile, sidebar on desktop */}
        {showMobile === "analytics" && (
          <div className="flex flex-col w-full md:hidden bg-gray-50 overflow-y-auto">
            <button onClick={() => setShowMobile("list")} className="flex items-center gap-2 px-4 py-3 text-sm text-gray-600 border-b border-gray-100 bg-white">
              <ArrowLeft className="w-4 h-4" /> Back to Chats
            </button>
            <AnalyticsPanel />
          </div>
        )}

        {showMobile !== "analytics" && ConvList}
        {showMobile !== "analytics" && ChatPanel}
        {showMobile !== "analytics" && InfoPanel}

        {/* Desktop analytics sidebar */}
        {showAnalytics && (
          <div className="hidden md:flex flex-col w-[340px] shrink-0 bg-gray-50 border-l border-gray-200 shadow-[-1px_0_4px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
              <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-[#25D366]" /> Analytics
              </span>
              <button onClick={() => setShowAnalytics(false)} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <AnalyticsPanel />
          </div>
        )}
      </div>
    </div>
  );
}
