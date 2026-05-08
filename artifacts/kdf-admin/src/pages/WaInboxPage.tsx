import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle, Search, Send, Bot, User, RefreshCw, CheckCheck, Check,
  Clock, Phone, ShoppingCart, X, Sparkles, Loader2,
  Package, Circle, Archive,
  MessageSquare, ArrowLeft, Tag, ShoppingBag, Zap, ChevronRight,
} from "lucide-react";

function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

function timeAgo(date: string | null | undefined): string {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(date).toLocaleDateString("en-PK", { day: "numeric", month: "short" });
}

function formatTime(date: string): string {
  return new Date(date).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function StatusIcon({ status }: { status: string }) {
  if (status === "read") return <CheckCheck className="w-3 h-3 text-blue-500" />;
  if (status === "delivered") return <CheckCheck className="w-3 h-3 text-gray-400" />;
  if (status === "sent") return <Check className="w-3 h-3 text-gray-400" />;
  if (status === "failed") return <X className="w-3 h-3 text-red-400" />;
  return <Clock className="w-3 h-3 text-gray-300" />;
}

function BotModeBadge({ mode }: { mode: string }) {
  if (mode === "auto") return (
    <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
      <Bot className="w-2.5 h-2.5" /> Auto
    </span>
  );
  if (mode === "human") return (
    <span className="flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
      <User className="w-2.5 h-2.5" /> Human
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">
      <Circle className="w-2.5 h-2.5" /> Bot Off
    </span>
  );
}

/* ── Quick reply templates ── */
const QUICK_REPLIES = [
  { label: "Greeting", text: "Assalam o Alaikum! 🌟 KDF NUTS mein khush amdeed! Aap k liye kya kar sakte hain?" },
  { label: "Order Status", text: "Aap ka order process ho raha hai. Jaldi deliver hoga InshaAllah! 📦" },
  { label: "Delivery Time", text: "Delivery 2-4 working days mein hoti hai. Lahore mein same/next day delivery available hai! 🚚" },
  { label: "Payment", text: "Hum Cash on Delivery (COD) accept karte hain. Payment delivery par karein. 💰" },
  { label: "Thank You", text: "Shukriya! Aap ka order place ho gaya. Hum jald connect karenge. KDF NUTS 🙏" },
  { label: "Track Order", text: "Apna order number share karein, main abhi track karta hoon. 🔍" },
];

/* ── Product Picker Modal ── */
function ProductPickerModal({
  onClose,
  onSend,
}: {
  onClose: () => void;
  onSend: (p: any, variant?: any) => void;
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["wa-products", debouncedQ],
    queryFn: () => api(`/admin/wa/products/search?q=${encodeURIComponent(debouncedQ)}&limit=6`).then(r => r.json()),
    staleTime: 30_000,
  });
  const products: any[] = data?.products ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-[#25D366]" />
            <h3 className="font-semibold text-sm">Share Product</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search badam, kaju, pista…"
              className="w-full pl-7 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            />
          </div>
        </div>
        {/* Product list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : products.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No products found</div>
          ) : products.map((p: any) => (
            <div key={p.id} className="border border-gray-100 dark:border-gray-800 rounded-xl p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div className="flex items-start gap-3">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-[#25D366] font-semibold">Rs. {(p.price ?? 0).toLocaleString("en-PK")}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${p.inStock ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {p.inStock ? "In Stock" : "Out of Stock"}
                    </span>
                    <span className="text-[10px] text-gray-400">{p.source}</span>
                  </div>
                </div>
                <button
                  onClick={() => onSend(p)}
                  className="flex-shrink-0 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  Send
                </button>
              </div>
              {/* Variants */}
              {p.variants?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 pl-15">
                  {p.variants.map((v: any, vi: number) => (
                    <button
                      key={vi}
                      onClick={() => onSend(p, v)}
                      className="text-[10px] px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-[#25D366] hover:text-[#25D366] transition-colors"
                    >
                      {v.title} — Rs.{v.price?.toLocaleString("en-PK")}
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

/* ── Order Search Panel ── */
function OrderSearchPanel({
  onSendStatus,
}: {
  onSendStatus: (orderId: number) => void;
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 400);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["wa-orders-search", debouncedQ],
    queryFn: () => api(`/admin/wa/orders/search?q=${encodeURIComponent(debouncedQ)}`).then(r => r.json()),
    enabled: debouncedQ.length >= 2,
    staleTime: 20_000,
  });
  const orders: any[] = data?.orders ?? [];

  const STATUS: Record<string, string> = {
    pending: "⏳", processing: "🔧", shipped: "🚚",
    delivered: "✅", cancelled: "❌", out_for_delivery: "🛵",
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Order # or customer name…"
          className="w-full pl-6 pr-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#25D366]"
        />
      </div>
      {isLoading && <div className="flex justify-center py-2"><Loader2 className="w-3 h-3 animate-spin text-gray-400" /></div>}
      {orders.map((o: any) => (
        <div key={o.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">{o.orderNumber}</span>
            <span>{STATUS[o.status] ?? "📦"} {o.status}</span>
          </div>
          <div className="text-gray-500 mt-0.5 flex items-center justify-between">
            <span>{o.customerName}</span>
            <span>Rs. {parseFloat(o.total ?? "0").toLocaleString("en-PK")}</span>
          </div>
          <button
            onClick={() => onSendStatus(o.id)}
            className="mt-1.5 w-full py-1 text-[10px] font-medium bg-[#25D366] text-white rounded-md hover:bg-[#1ebe5d] transition-colors"
          >
            Send Status to Customer
          </button>
        </div>
      ))}
    </div>
  );
}

export default function WaInboxPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | "closed" | "all">("open");
  const [showMobile, setShowMobile] = useState<"list" | "chat">("list");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [rightTab, setRightTab] = useState<"info" | "products" | "orders" | "quick">("info");
  const [sendingProduct, setSendingProduct] = useState(false);
  const [sendingOrder, setSendingOrder] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  /* ── Queries ── */
  const { data: convData, isLoading: convLoading, refetch: refetchConvs } = useQuery({
    queryKey: ["wa-conversations", search, statusFilter],
    queryFn: () => api(`/admin/wa/conversations?search=${encodeURIComponent(search)}&status=${statusFilter}&limit=50`).then(r => r.json()),
    staleTime: 10_000,
    refetchInterval: 30_000,
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
    staleTime: 5_000,
    refetchInterval: selectedId ? 15_000 : false,
  });

  /* ── Mutations ── */
  const replyMutation = useMutation({
    mutationFn: (msg: string) =>
      api(`/admin/wa/conversations/${selectedId}/reply`, { method: "POST", body: JSON.stringify({ message: msg }) }).then(r => r.json()),
    onSuccess: () => { setMessage(""); refetchMsgs(); refetchConvs(); },
    onError: () => showToast("Send failed"),
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

  const markReadMutation = useMutation({
    mutationFn: (id: number) => api(`/admin/wa/conversations/${id}/read`, { method: "PUT" }).then(r => r.json()),
  });

  const aiSuggestMutation = useMutation({
    mutationFn: () => api(`/admin/wa/conversations/${selectedId}/ai-suggest`, { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => { if (d.suggestion) { setMessage(d.suggestion); textareaRef.current?.focus(); } },
    onError: () => showToast("AI suggestion failed"),
  });

  /* ── SSE real-time ── */
  useEffect(() => {
    const token = localStorage.getItem("kdf_admin_token") ?? "";
    const es = new EventSource(`/api/admin/sse?token=${encodeURIComponent(token)}`);
    es.addEventListener("wa_message", (e) => {
      const data = JSON.parse(e.data) as any;
      refetchConvs();
      if (data.conversationId === selectedId) refetchMsgs();
    });
    return () => es.close();
  }, [selectedId]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (msgData?.messages?.length) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [msgData]);

  /* ── Search debounce ── */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const selectConversation = useCallback((id: number) => {
    setSelectedId(id);
    setShowMobile("chat");
    markReadMutation.mutate(id);
    queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
  }, []);

  const handleSend = () => {
    if (!message.trim() || replyMutation.isPending) return;
    replyMutation.mutate(message.trim());
  };

  /* ── Product send ── */
  const handleSendProduct = async (p: any, variant?: any) => {
    if (!selectedId) return;
    setShowProductPicker(false);
    setSendingProduct(true);
    try {
      const variantStr = variant ? `${variant.title}` : (p.variants?.length > 0 ? p.variants.map((v: any) => `${v.title}: Rs.${v.price?.toLocaleString("en-PK")}`).join(", ") : "");
      const price = variant ? variant.price : p.price;
      const res = await api(`/admin/wa/conversations/${selectedId}/send-product`, {
        method: "POST",
        body: JSON.stringify({
          productName: variant ? `${p.name} — ${variant.title}` : p.name,
          price, imageUrl: p.imageUrl, productUrl: p.url, variants: variantStr,
        }),
      });
      const d = await res.json();
      if (d.success) { showToast("Product shared!"); refetchMsgs(); }
      else showToast("Failed to send product");
    } catch { showToast("Error sending product"); }
    setSendingProduct(false);
  };

  /* ── Order status send ── */
  const handleSendOrderStatus = async (orderId: number) => {
    if (!selectedId) return;
    setSendingOrder(true);
    try {
      const res = await api(`/admin/wa/conversations/${selectedId}/send-order-status`, {
        method: "POST",
        body: JSON.stringify({ orderId }),
      });
      const d = await res.json();
      if (d.success) { showToast("Order status sent!"); refetchMsgs(); }
      else showToast("Failed to send order status");
    } catch { showToast("Error"); }
    setSendingOrder(false);
  };

  const conversations: any[] = convData?.conversations ?? [];
  const messages: any[] = msgData?.messages ?? [];
  const conv = convDetail?.conversation;
  const customer = convDetail?.customer;
  const customerOrders: any[] = convDetail?.orders ?? [];
  const totalUnread = conversations.reduce((s: number, c: any) => s + (c.unreadCount ?? 0), 0);

  /* ══ LEFT PANEL ══ */
  const ConvList = (
    <div className={`flex flex-col h-full bg-card border-r border-border ${showMobile === "list" ? "flex" : "hidden md:flex"} w-full md:w-[300px] shrink-0`}>
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-[#25D366]" />
            <h2 className="font-semibold text-sm">WA Inbox</h2>
            {totalUnread > 0 && (
              <span className="text-[10px] bg-[#25D366] text-white px-1.5 py-0.5 rounded-full font-bold">{totalUnread}</span>
            )}
          </div>
          <button onClick={() => refetchConvs()} className="text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search…"
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-muted/50 rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="flex gap-1">
          {(["open", "closed", "all"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`flex-1 text-[10px] py-1 rounded-md font-medium transition-colors capitalize ${statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {convLoading ? (
          <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No conversations yet</p>
          </div>
        ) : conversations.map((c: any) => (
          <button key={c.id} onClick={() => selectConversation(c.id)}
            className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors flex gap-3 items-start ${selectedId === c.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}>
            <div className="w-9 h-9 rounded-full bg-[#25D366]/20 flex items-center justify-center flex-shrink-0 text-[#25D366] font-bold text-sm">
              {(c.contactName ?? c.contactPhone)?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-medium truncate">{c.contactName ?? c.contactPhone}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(c.lastMessageAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-1 mt-0.5">
                <p className="text-xs text-muted-foreground truncate">{c.lastMessage ?? "No messages yet"}</p>
                {c.unreadCount > 0 && (
                  <span className="text-[10px] bg-[#25D366] text-white px-1.5 py-0.5 rounded-full font-bold shrink-0 min-w-[18px] text-center">{c.unreadCount}</span>
                )}
              </div>
              <div className="mt-1"><BotModeBadge mode={c.botMode ?? "auto"} /></div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  /* ══ MIDDLE PANEL ══ */
  const ChatPanel = (
    <div className={`flex flex-col flex-1 h-full min-w-0 ${showMobile === "chat" ? "flex" : "hidden md:flex"}`}
      style={{ background: "#e5ddd5 url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>

      {!selectedId ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MessageCircle className="w-16 h-16 text-[#25D366]/30 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-500">Select a conversation</h3>
            <p className="text-sm text-gray-400 mt-1">Choose from the list to start chatting</p>
          </div>
        </div>
      ) : (
        <>
          {/* Chat header */}
          <div className="bg-[#075e54] px-4 py-2.5 flex items-center gap-3 shrink-0">
            <button className="md:hidden text-white mr-1" onClick={() => setShowMobile("list")}>
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-full bg-[#25D366]/30 flex items-center justify-center font-bold text-white">
              {(conv?.contactName ?? conv?.contactPhone)?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm truncate">{conv?.contactName ?? conv?.contactPhone ?? "…"}</p>
              <div className="flex items-center gap-2">
                <p className="text-[#a8e6cf] text-xs truncate">{conv?.contactPhone}</p>
                <BotModeBadge mode={conv?.botMode ?? "auto"} />
              </div>
            </div>
            <div className="flex items-center gap-1">
              {[{ v: "auto", label: "Bot" }, { v: "human", label: "Human" }, { v: "off", label: "Off" }].map(opt => (
                <button key={opt.v} onClick={() => botModeMutation.mutate(opt.v)}
                  className={`text-[10px] px-2 py-1 rounded transition-colors font-medium ${conv?.botMode === opt.v ? "bg-white text-[#075e54]" : "text-white/70 hover:text-white hover:bg-white/10"}`}>
                  {opt.label}
                </button>
              ))}
              <button onClick={() => statusMutation.mutate(conv?.status === "open" ? "closed" : "open")}
                className="ml-1 text-white/70 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
                title={conv?.status === "open" ? "Close" : "Reopen"}>
                <Archive className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {msgLoading ? (
              <div className="flex justify-center pt-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : messages.length === 0 ? (
              <div className="flex justify-center pt-8 text-sm text-gray-400">No messages yet</div>
            ) : messages.map((msg: any) => {
              const isIn = msg.direction === "in";
              return (
                <div key={msg.id} className={`flex ${isIn ? "justify-start" : "justify-end"} mb-1`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${isIn ? "bg-white rounded-tl-none" : "bg-[#dcf8c6] rounded-tr-none"}`}>
                    {msg.isBot && !isIn && (
                      <div className="flex items-center gap-1 mb-0.5">
                        <Bot className="w-2.5 h-2.5 text-[#25D366]" />
                        <span className="text-[9px] text-[#25D366] font-medium">Bot</span>
                      </div>
                    )}
                    <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{msg.content}</p>
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

          {/* Quick reply chips */}
          <div className="bg-[#f0f0f0] px-3 pt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
            {QUICK_REPLIES.slice(0, 4).map((qr, i) => (
              <button key={i} onClick={() => setMessage(qr.text)}
                className="flex-shrink-0 text-[10px] px-2 py-1 bg-white border border-gray-200 rounded-full text-gray-600 hover:border-[#25D366] hover:text-[#25D366] transition-colors font-medium">
                {qr.label}
              </button>
            ))}
          </div>

          {/* Reply box */}
          <div className="bg-[#f0f0f0] px-3 py-2 flex items-end gap-2 shrink-0">
            {/* Product share button */}
            <button
              onClick={() => setShowProductPicker(true)}
              disabled={sendingProduct}
              className="w-9 h-9 rounded-full bg-orange-100 hover:bg-orange-200 flex items-center justify-center text-orange-600 transition-colors shrink-0"
              title="Share product catalog"
            >
              {sendingProduct ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />}
            </button>
            <div className="flex-1 bg-white rounded-xl border border-gray-200 px-3 py-2 min-h-[44px]">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message… (Enter to send)"
                rows={1}
                className="w-full text-sm resize-none outline-none bg-transparent max-h-32 overflow-y-auto"
                style={{ lineHeight: "1.4" }}
              />
            </div>
            <button onClick={() => aiSuggestMutation.mutate()} disabled={aiSuggestMutation.isPending}
              className="w-9 h-9 rounded-full bg-purple-100 hover:bg-purple-200 flex items-center justify-center text-purple-600 transition-colors shrink-0"
              title="AI reply suggestion">
              {aiSuggestMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            </button>
            <button onClick={handleSend} disabled={!message.trim() || replyMutation.isPending}
              className="w-9 h-9 rounded-full bg-[#25D366] hover:bg-[#1ebe5d] disabled:opacity-40 flex items-center justify-center text-white transition-colors shrink-0">
              {replyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </>
      )}
    </div>
  );

  /* ══ RIGHT PANEL ══ */
  const InfoPanel = selectedId && conv ? (
    <div className="hidden lg:flex flex-col w-72 shrink-0 bg-card border-l border-border h-full">
      {/* Customer header */}
      <div className="bg-[#075e54] p-4 text-center shrink-0">
        <div className="w-14 h-14 rounded-full bg-[#25D366]/30 flex items-center justify-center font-bold text-white text-xl mx-auto mb-2">
          {(customer?.name ?? conv.contactPhone)?.[0]?.toUpperCase() ?? "?"}
        </div>
        <h3 className="text-white font-semibold text-sm">{customer?.name ?? conv.contactName ?? "Unknown"}</h3>
        <p className="text-[#a8e6cf] text-xs mt-0.5">{conv.contactPhone}</p>
        {customer?.city && <p className="text-[#a8e6cf] text-xs">📍 {customer.city}</p>}
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-border shrink-0">
        {([
          { id: "info", label: "Info", icon: User },
          { id: "products", label: "Products", icon: Tag },
          { id: "orders", label: "Orders", icon: Package },
          { id: "quick", label: "Quick", icon: Zap },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setRightTab(tab.id)}
            className={`flex-1 py-2 flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors border-b-2 ${rightTab === tab.id ? "border-[#25D366] text-[#25D366]" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <tab.icon className="w-3 h-3" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* ── INFO TAB ── */}
        {rightTab === "info" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                <p className="text-base font-bold">{customer?.totalOrders ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Orders</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                <p className="text-base font-bold">Rs.{((customer?.totalSpend ?? 0) / 1000).toFixed(1)}k</p>
                <p className="text-[10px] text-muted-foreground">Spent</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Bot Mode</p>
              <div className="flex gap-1">
                {[{ v: "auto", label: "Auto", icon: Bot }, { v: "human", label: "Human", icon: User }, { v: "off", label: "Off", icon: X }].map(opt => (
                  <button key={opt.v} onClick={() => botModeMutation.mutate(opt.v)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${conv.botMode === opt.v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                    <opt.icon className="w-3 h-3" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <ShoppingCart className="w-3 h-3" /> Recent Orders
              </p>
              {customerOrders.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No orders for this number</p>
              ) : customerOrders.map((order: any) => {
                const STATUS: Record<string, string> = { pending: "⏳", processing: "🔧", shipped: "🚚", delivered: "✅", cancelled: "❌", out_for_delivery: "🛵" };
                return (
                  <div key={order.id} className="bg-muted/40 rounded-lg p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{order.orderNumber}</span>
                      <span>{STATUS[order.status] ?? "📦"} {order.status}</span>
                    </div>
                    <div className="text-muted-foreground mt-0.5 flex items-center justify-between">
                      <span>Rs. {parseFloat(order.total ?? "0").toLocaleString("en-PK")}</span>
                      <span>{new Date(order.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</span>
                    </div>
                    {order.trackingId && <p className="text-muted-foreground mt-0.5">📍 {order.trackingId}</p>}
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-border">
              <button onClick={() => statusMutation.mutate(conv.status === "open" ? "closed" : "open")}
                className={`w-full py-2 rounded-lg text-xs font-medium border transition-colors ${conv.status === "open" ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}>
                {conv.status === "open" ? "Close Conversation" : "Reopen Conversation"}
              </button>
            </div>
          </>
        )}

        {/* ── PRODUCTS TAB ── */}
        {rightTab === "products" && (
          <>
            <button
              onClick={() => setShowProductPicker(true)}
              className="w-full flex items-center justify-between py-2.5 px-3 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-xl text-sm font-medium transition-colors"
            >
              <span className="flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Browse & Share Product</span>
              <ChevronRight className="w-4 h-4" />
            </button>
            <p className="text-xs text-muted-foreground text-center">
              Search your product catalog and share a product card directly in the chat with an Order Now button.
            </p>
            <div className="bg-muted/30 rounded-xl p-3 text-xs space-y-1 text-muted-foreground">
              <p className="font-medium text-foreground text-[11px]">How it works:</p>
              <p>1. Click "Browse & Share Product"</p>
              <p>2. Search by name (badam, kaju…)</p>
              <p>3. Select variant if needed</p>
              <p>4. Customer gets card + Order Now button</p>
            </div>
          </>
        )}

        {/* ── ORDERS TAB ── */}
        {rightTab === "orders" && (
          <>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Find & Send Order Status</p>
            <OrderSearchPanel onSendStatus={handleSendOrderStatus} />
            {sendingOrder && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Sending…
              </div>
            )}
          </>
        )}

        {/* ── QUICK REPLIES TAB ── */}
        {rightTab === "quick" && (
          <>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Quick Reply Templates</p>
            <div className="space-y-2">
              {QUICK_REPLIES.map((qr, i) => (
                <div key={i} className="border border-border rounded-xl p-2.5 hover:bg-muted/30 transition-colors">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{qr.label}</p>
                  <p className="text-xs text-foreground mb-2 leading-relaxed">{qr.text}</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setMessage(qr.text)}
                      className="flex-1 py-1 text-[10px] font-medium bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                    >
                      Edit & Send
                    </button>
                    <button
                      onClick={() => replyMutation.mutate(qr.text)}
                      disabled={replyMutation.isPending}
                      className="flex-1 py-1 text-[10px] font-medium bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-lg transition-colors disabled:opacity-40"
                    >
                      Send Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-full -m-4 md:-m-8">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-[100] bg-gray-900 text-white text-sm px-4 py-2 rounded-xl shadow-xl animate-in fade-in slide-in-from-top-2">
          {toastMsg}
        </div>
      )}

      {/* Product picker modal */}
      {showProductPicker && (
        <ProductPickerModal
          onClose={() => setShowProductPicker(false)}
          onSend={handleSendProduct}
        />
      )}

      {/* Page header */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-border bg-card shrink-0">
        <MessageCircle className="w-5 h-5 text-[#25D366]" />
        <h1 className="font-bold text-base">WhatsApp Inbox</h1>
        <span className="text-xs text-muted-foreground hidden sm:block">AI-powered commerce hub</span>
        {totalUnread > 0 && (
          <span className="ml-auto text-xs bg-[#25D366] text-white px-2 py-0.5 rounded-full font-semibold">{totalUnread} unread</span>
        )}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto sm:ml-0">
          <Phone className="w-3 h-3 text-[#25D366]" />
          <span>AI Auto-Reply On</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {ConvList}
        {ChatPanel}
        {InfoPanel}
      </div>
    </div>
  );
}
