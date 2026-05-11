import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle, Search, Send, Bot, User, RefreshCw, CheckCheck, Check,
  Clock, Globe, X, Sparkles, Loader2, Circle,
  Inbox, Bell, Activity,
  MessageSquareDashed, Zap, ArrowRight,
  MoreVertical, ExternalLink, Wifi, WifiOff,
  TrendingUp, Archive, Eye,
  Star, Package, Phone, MapPin, DollarSign, Truck,
  ShoppingBag, FileText, UserCheck, XCircle, CheckCircle2,
  StickyNote, ChevronDown, ChevronRight, Navigation,
  AlertCircle, Tag, ToggleLeft, ToggleRight, Bike,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const token = () => localStorage.getItem("kdf_admin_token") ?? "";
function api(path: string, opts?: RequestInit) {
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(opts?.headers ?? {}) },
  });
}

function timeAgo(date: string | null | undefined) {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmtTime(date: string | null | undefined) {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: true });
}

type Channel = "all" | "whatsapp" | "website" | "ai" | "unread" | "active";

interface WaConv {
  id: number;
  contactPhone: string;
  contactName?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
  botMode?: string | null;
  status?: string | null;
  isStarred?: boolean;
  agentName?: string | null;
}

interface ChatSession {
  id: number;
  sessionId: string;
  messages: any[];
  updatedAt: string;
  leadName?: string | null;
  leadPhone?: string | null;
  createdAt?: string;
}

interface UnifiedConv {
  id: string;
  channel: "whatsapp" | "website";
  name: string;
  phone?: string;
  lastMsg: string;
  lastAt: string;
  unread: number;
  botMode?: string | null;
  isStarred?: boolean;
  raw: WaConv | ChatSession;
}

const QUICK_REPLIES = [
  { label: "Order received", text: "آپ کا آرڈر موصول ہوگیا ہے۔ ہم جلد پروسیس کریں گے۔" },
  { label: "Confirm order", text: "براہ کرم اپنا آرڈر confirm کریں۔ ✅ Confirm یا ❌ Cancel بھیجیں۔" },
  { label: "Dispatch today", text: "آپ کا آرڈر آج dispatch ہوجائے گا۔" },
  { label: "Tracking info", text: "آپ کا tracking number: {tracking}. TCS سے track کریں۔" },
  { label: "Payment confirm", text: "آپ کی payment confirm ہوگئی ہے۔ شکریہ!" },
  { label: "Out of stock", text: "معذرت، یہ آئٹم ابھی available نہیں ہے۔" },
  { label: "Thank you", text: "آپ کا شکریہ! کوئی سوال ہو تو بتائیں۔" },
];

/* ── Status color helper ── */
function orderStatusColor(status: string) {
  const map: Record<string, string> = {
    pending:     "bg-amber-100 text-amber-700 border-amber-200",
    confirmed:   "bg-sky-100 text-sky-700 border-sky-200",
    fulfilled:   "bg-purple-100 text-purple-700 border-purple-200",
    shipped:     "bg-purple-100 text-purple-700 border-purple-200",
    delivered:   "bg-green-100 text-green-700 border-green-200",
    cancelled:   "bg-red-100 text-red-700 border-red-200",
    unfulfilled: "bg-orange-100 text-orange-700 border-orange-200",
  };
  return map[status?.toLowerCase()] ?? "bg-gray-100 text-gray-700 border-gray-200";
}

/* ── Stats bar ── */
function StatsBar() {
  const { data: waData } = useQuery({
    queryKey: ["wa-analytics-unified"],
    queryFn: () => api("/admin/wa/analytics").then(r => r.json()),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const { data: sessions = [] } = useQuery<ChatSession[]>({
    queryKey: ["chat-sessions-unified"],
    queryFn: () => api("/admin/chat/sessions").then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const s = waData?.stats ?? {};
  const activeSessions = sessions.filter(sess => sess?.updatedAt && Date.now() - new Date(sess.updatedAt).getTime() < 5 * 60 * 1000).length;

  const stats = [
    { label: "WA Open",    value: s.open_conversations ?? 0, icon: MessageCircle,      color: "text-[#25D366]",    bg: "bg-[#25D366]/10" },
    { label: "Unread WA",  value: s.total_unread ?? 0,       icon: MessageSquareDashed, color: "text-red-500",      bg: "bg-red-50" },
    { label: "Active Web", value: activeSessions,             icon: Wifi,                color: "text-blue-500",     bg: "bg-blue-50" },
    { label: "Bot Today",  value: s.bot_replies_today ?? 0,  icon: Bot,                 color: "text-violet-500",   bg: "bg-violet-50" },
    { label: "Inbound",    value: s.inbound_today ?? 0,      icon: TrendingUp,          color: "text-emerald-600",  bg: "bg-emerald-50" },
    { label: "AI Handles", value: s.bot_replies_today ?? 0,  icon: Sparkles,            color: "text-amber-600",    bg: "bg-amber-50" },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3 shrink-0">
      {stats.map(st => (
        <div key={st.label} className="bg-white border border-gray-100 rounded-xl p-2.5 flex items-center gap-2.5 shadow-sm">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${st.bg}`}>
            <st.icon className={`w-3.5 h-3.5 ${st.color}`} />
          </div>
          <div>
            <p className="text-base font-bold leading-none">{st.value}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{st.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChannelBadge({ channel }: { channel: "whatsapp" | "website" }) {
  if (channel === "whatsapp") return (
    <span className="inline-flex items-center gap-0.5 text-[9px] bg-[#25D366]/15 text-[#128C7E] px-1.5 py-0.5 rounded-full font-semibold">
      <MessageCircle className="w-2 h-2" /> WA
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">
      <Globe className="w-2 h-2" /> Web
    </span>
  );
}

function BotBadge({ mode }: { mode?: string | null }) {
  if (mode === "auto" || !mode) return (
    <span className="inline-flex items-center gap-0.5 text-[8px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded-full font-semibold">
      <Bot className="w-2 h-2" /> Auto
    </span>
  );
  if (mode === "human") return (
    <span className="inline-flex items-center gap-0.5 text-[8px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full font-semibold">
      <User className="w-2 h-2" /> Human
    </span>
  );
  if (mode === "off") return (
    <span className="inline-flex items-center gap-0.5 text-[8px] bg-gray-100 text-gray-600 px-1 py-0.5 rounded-full font-semibold">
      <WifiOff className="w-2 h-2" /> Off
    </span>
  );
  return null;
}

function StatusIcon({ status }: { status?: string }) {
  if (status === "read")      return <CheckCheck className="w-3 h-3 text-[#53bdeb]" />;
  if (status === "delivered") return <CheckCheck className="w-3 h-3 text-gray-400" />;
  if (status === "sent")      return <Check className="w-3 h-3 text-gray-400" />;
  return null;
}

/* ── Order mini-card in customer sidebar ── */
function OrderMiniCard({ order, phone, onRefetch }: { order: any; phone: string; onRefetch: () => void }) {
  const { toast } = useToast();
  const [, nav] = useLocation();
  const [expanded, setExpanded] = useState(false);

  const addr = order.shippingAddress ?? order.shipping_address ?? {};
  const city  = typeof addr === "string" ? JSON.parse(addr || "{}").city : addr?.city;
  const total = parseFloat(order.totalPrice ?? order.total_price ?? "0");
  const effectiveStatus = order.status ?? order.fulfillmentStatus ?? "pending";

  const confirmMutation = useMutation({
    mutationFn: () => api(`/admin/shopify/orders/${order.id}/status`, {
      method: "PUT", body: JSON.stringify({ status: "confirmed" }),
    }).then(r => r.json()),
    onSuccess: () => { toast({ title: "✅ Order confirmed!" }); onRefetch(); },
    onError: () => toast({ title: "Confirm failed", variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api(`/admin/shopify/orders/${order.id}/status`, {
      method: "PUT", body: JSON.stringify({ status: "cancelled" }),
    }).then(r => r.json()),
    onSuccess: () => { toast({ title: "❌ Order cancelled" }); onRefetch(); },
    onError: () => toast({ title: "Cancel failed", variant: "destructive" }),
  });

  const sendTrackingMutation = useMutation({
    mutationFn: () => api(`/admin/shopify/orders/${order.id}/whatsapp`, {
      method: "POST", body: JSON.stringify({ message: `آپ کا آرڈر ${order.orderNumber} dispatch ہوگیا!\nTracking: ${order.trackingNumber}\nTCS سے track کریں۔` }),
    }).then(r => r.json()),
    onSuccess: () => toast({ title: "✅ Tracking sent on WhatsApp!" }),
    onError: () => toast({ title: "Send failed", variant: "destructive" }),
  });

  const sendConfirmMutation = useMutation({
    mutationFn: () => api(`/admin/shopify/orders/${order.id}/send-confirmation`, { method: "POST" }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    }),
    onSuccess: () => toast({ title: "✅ Confirmation WA sent!" }),
    onError: (e: any) => toast({ title: e.message ?? "Failed", variant: "destructive" }),
  });

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden bg-white mb-2 shadow-sm">
      {/* Header row */}
      <div className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(v => !v)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-gray-800">{order.orderNumber}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${orderStatusColor(effectiveStatus)}`}>
              {effectiveStatus}
            </span>
            {order.financialStatus === "paid" && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 font-semibold">Paid</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-gray-500 font-medium">PKR {total.toLocaleString()}</span>
            {city && <span className="text-[10px] text-gray-400">• {city}</span>}
            <span className="text-[10px] text-gray-400">{timeAgo(order.createdAt)}</span>
          </div>
        </div>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
      </div>

      {/* Expanded: COD, tracking, actions */}
      {expanded && (
        <div className="border-t border-gray-100 p-2.5 space-y-2.5 bg-gray-50">
          {/* COD info */}
          {order.financialStatus !== "paid" && total > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
              <DollarSign className="w-3.5 h-3.5 shrink-0" />
              <span>COD: <strong>PKR {total.toLocaleString()}</strong></span>
            </div>
          )}

          {/* Tracking number */}
          {order.trackingNumber && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">
              <Truck className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono text-[10px]">{order.trackingNumber}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(order.trackingNumber); toast({ title: "CN Copied!" }); }}
                className="ml-auto text-[9px] bg-indigo-100 px-1.5 py-0.5 rounded hover:bg-indigo-200"
              >Copy</button>
            </div>
          )}

          {/* Items summary */}
          {Array.isArray(order.lineItems) && order.lineItems.length > 0 && (
            <div className="text-[10px] text-gray-500 leading-relaxed">
              {order.lineItems.slice(0, 3).map((li: any, i: number) => (
                <div key={i}>{li.title} × {li.quantity}</div>
              ))}
              {order.lineItems.length > 3 && <div className="text-gray-400">+{order.lineItems.length - 3} more…</div>}
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-1.5">
            {effectiveStatus === "pending" && (
              <button
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending}
                className="flex items-center justify-center gap-1 text-[10px] font-semibold bg-sky-500 text-white px-2 py-1.5 rounded-lg hover:bg-sky-600 disabled:opacity-50"
              >
                {confirmMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                Confirm
              </button>
            )}
            {effectiveStatus === "pending" && (
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex items-center justify-center gap-1 text-[10px] font-semibold bg-red-500 text-white px-2 py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {cancelMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                Cancel
              </button>
            )}
            <button
              onClick={() => sendConfirmMutation.mutate()}
              disabled={sendConfirmMutation.isPending}
              className="flex items-center justify-center gap-1 text-[10px] font-semibold bg-[#25D366]/10 text-[#128C7E] border border-[#25D366]/20 px-2 py-1.5 rounded-lg hover:bg-[#25D366]/20 disabled:opacity-50"
            >
              {sendConfirmMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageCircle className="w-3 h-3" />}
              Send WA
            </button>
            {order.trackingNumber && (
              <button
                onClick={() => sendTrackingMutation.mutate()}
                disabled={sendTrackingMutation.isPending}
                className="flex items-center justify-center gap-1 text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-1.5 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
              >
                {sendTrackingMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
                Tracking WA
              </button>
            )}
            <button
              onClick={() => nav(`/shopify/orders`)}
              className="flex items-center justify-center gap-1 text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-200 col-span-2"
            >
              <ExternalLink className="w-3 h-3" /> Open Order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Customer Orders Section ── */
function CustomerOrdersSection({ phone }: { phone: string }) {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const altPhone   = cleanPhone.startsWith("92") ? "0" + cleanPhone.slice(2) : "92" + cleanPhone.slice(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["customer-orders-chat", phone],
    queryFn: () =>
      api(`/admin/shopify/orders?search=${encodeURIComponent(phone)}&limit=5`)
        .then(r => r.json())
        .then(d => d.orders ?? []),
    enabled: !!phone,
    staleTime: 30_000,
  });

  const orders: any[] = data ?? [];

  if (isLoading) return (
    <div className="flex items-center justify-center py-4">
      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
    </div>
  );

  if (orders.length === 0) return (
    <div className="text-center py-3 text-[11px] text-gray-400">
      <ShoppingBag className="w-6 h-6 mx-auto mb-1 opacity-30" />
      No orders found for this number
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Orders ({orders.length})
        </p>
        <button onClick={() => refetch()} className="text-[9px] text-gray-400 hover:text-gray-600">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      {orders.map((order: any) => (
        <OrderMiniCard key={order.id} order={order} phone={phone} onRefetch={refetch} />
      ))}
    </div>
  );
}

/* ── Left Panel: Conversation List ── */
function ConvList({
  selected, onSelect, channel, onChannelChange,
}: {
  selected: UnifiedConv | null;
  onSelect: (c: UnifiedConv) => void;
  channel: Channel;
  onChannelChange: (c: Channel) => void;
}) {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const { data: waData, isLoading: waLoading, refetch: refetchWa } = useQuery({
    queryKey: ["wa-convs-unified", search],
    queryFn: () =>
      api(`/admin/wa/conversations?limit=60${search ? `&search=${encodeURIComponent(search)}` : ""}`)
        .then(r => r.json())
        .then(d => (Array.isArray(d?.conversations) ? d.conversations : Array.isArray(d) ? d : []) as WaConv[]),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  const waConvs: WaConv[] = waData ?? [];

  const { data: chatSessions = [], isLoading: sessLoading, refetch: refetchSess } = useQuery<ChatSession[]>({
    queryKey: ["chat-sessions-unified"],
    queryFn: () =>
      api("/admin/chat/sessions")
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const unified: UnifiedConv[] = [
    ...waConvs.map((c): UnifiedConv => ({
      id: `wa-${c.id}`,
      channel: "whatsapp",
      name: c.contactName || c.contactPhone,
      phone: c.contactPhone,
      lastMsg: c.lastMessage ?? "",
      lastAt: c.lastMessageAt ?? "",
      unread: c.unreadCount ?? 0,
      botMode: c.botMode,
      isStarred: c.isStarred,
      raw: c,
    })),
    ...chatSessions.map((s): UnifiedConv => {
      const msgs: any[] = Array.isArray(s.messages) ? s.messages : [];
      const last = msgs[msgs.length - 1];
      const lastContent = last?.content ?? last?.message ?? last?.text ?? "";
      return {
        id: `web-${s.id}`,
        channel: "website",
        name: s.leadName || `Visitor ${s.id}`,
        phone: s.leadPhone ?? undefined,
        lastMsg: lastContent.slice(0, 80),
        lastAt: s.updatedAt,
        unread: 0,
        raw: s,
      };
    }),
  ].sort((a, b) => {
    if (!a.lastAt) return 1;
    if (!b.lastAt) return -1;
    return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
  });

  const isActive = (c: UnifiedConv) => {
    if (!c.lastAt) return false;
    return Date.now() - new Date(c.lastAt).getTime() < 5 * 60 * 1000;
  };

  const filtered = unified.filter(c => {
    if (channel === "whatsapp" && c.channel !== "whatsapp") return false;
    if (channel === "website" && c.channel !== "website") return false;
    if (channel === "ai" && c.botMode !== "auto") return false;
    if (channel === "unread" && c.unread === 0) return false;
    if (channel === "active" && !isActive(c)) return false;
    return true;
  });

  const tabs: { key: Channel; label: string; icon: any; count?: number }[] = [
    { key: "all",       label: "All",    icon: Inbox },
    { key: "whatsapp",  label: "WA",     icon: MessageCircle, count: waConvs.reduce((s, c) => s + (c.unreadCount ?? 0), 0) },
    { key: "website",   label: "Web",    icon: Globe,         count: chatSessions.length },
    { key: "ai",        label: "AI Bot", icon: Bot },
    { key: "unread",    label: "Unread", icon: Bell },
    { key: "active",    label: "Active", icon: Activity },
  ];

  const isLoading = waLoading || sessLoading;

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-100">
      {/* Search */}
      <div className="p-3 border-b border-gray-100 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#25D366] bg-gray-50"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 overflow-x-auto shrink-0" style={{ scrollbarWidth: "none" }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onChannelChange(tab.key)}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg whitespace-nowrap transition-colors relative ${
              channel === tab.key
                ? "bg-[#25D366]/10 text-[#128C7E]"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
            {(tab.count ?? 0) > 0 && (
              <span className="bg-red-500 text-white text-[8px] rounded-full px-1 py-px min-w-[14px] text-center leading-none">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conv list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-xs">No conversations</p>
          </div>
        ) : (
          filtered.map(c => {
            const isSelected = selected?.id === c.id;
            const hasUnread = c.unread > 0;
            const active = isActive(c);
            return (
              <div
                key={c.id}
                onClick={() => onSelect(c)}
                className={`flex items-start gap-2.5 px-3 py-2.5 cursor-pointer border-b border-gray-50 transition-colors ${
                  isSelected ? "bg-[#25D366]/5 border-l-2 border-l-[#25D366]" : "hover:bg-gray-50"
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                    c.channel === "whatsapp" ? "bg-[#25D366]" : "bg-blue-500"
                  }`}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  {active && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white" />}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <p className={`text-xs truncate ${hasUnread ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                        {c.name}
                      </p>
                      {c.isStarred && <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400 shrink-0" />}
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(c.lastAt)}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <ChannelBadge channel={c.channel} />
                    {c.channel === "whatsapp" && <BotBadge mode={c.botMode} />}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className={`text-[11px] truncate flex-1 ${hasUnread ? "text-gray-600" : "text-gray-400"}`}>
                      {c.lastMsg || "No messages"}
                    </p>
                    {c.unread > 0 && (
                      <span className="bg-[#25D366] text-white text-[9px] rounded-full px-1.5 py-0.5 min-w-[16px] text-center shrink-0 ml-1">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: refresh */}
      <div className="px-3 py-2 border-t border-gray-100 shrink-0 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">{filtered.length} conversations</span>
        <button onClick={() => { refetchWa(); refetchSess(); }} className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
    </div>
  );
}

/* ── Center Panel: Conversation Thread ── */
function ConvThread({ conv }: { conv: UnifiedConv | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);

  const isWa = conv?.channel === "whatsapp";
  const waConvId = isWa ? (conv?.raw as WaConv)?.id : null;
  const phone    = conv?.phone ?? null;

  const { data: waMsgData, isLoading: waLoading, refetch: refetchMsgs } = useQuery({
    queryKey: ["wa-msgs-unified", waConvId],
    queryFn: () =>
      api(`/admin/wa/conversations/${waConvId}/messages?limit=100`)
        .then(r => r.json())
        .then(d => Array.isArray(d?.messages) ? d.messages : Array.isArray(d) ? d : []),
    enabled: !!waConvId,
    staleTime: 8_000,
    refetchInterval: 10_000,
  });

  /* Templates */
  const { data: templatesData } = useQuery({
    queryKey: ["wa-templates-approved"],
    queryFn: () => api("/admin/whatsapp/templates/approved").then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    staleTime: 120_000,
    enabled: showTemplates,
  });
  const approvedTemplates: any[] = templatesData ?? [];

  const webSession = (!isWa && conv) ? (conv.raw as ChatSession) : null;
  const webMessages: any[] = webSession ? (Array.isArray(webSession.messages) ? webSession.messages : []) : [];
  const messages: any[] = isWa ? (waMsgData ?? []) : webMessages;
  const isLoading = isWa ? waLoading : false;

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [messages.length]);

  const sendWa = useCallback(async (text: string) => {
    if (!waConvId || !text.trim()) return;
    setSending(true);
    try {
      const res = await api(`/admin/wa/conversations/${waConvId}/reply`, {
        method: "POST",
        body: JSON.stringify({ message: text.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed");
      }
      qc.invalidateQueries({ queryKey: ["wa-msgs-unified", waConvId] });
      qc.invalidateQueries({ queryKey: ["wa-convs-unified"] });
      setMsg("");
      toast({ title: "Sent ✓" });
    } catch (e: any) {
      toast({ title: e.message ?? "Failed to send", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [waConvId, qc, toast]);

  const aiSuggestMutation = useMutation({
    mutationFn: () => api(`/admin/wa/conversations/${waConvId}/ai-suggest`, { method: "POST" }).then(r => r.json()),
    onSuccess: (d: any) => { if (d.suggestion) setMsg(d.suggestion); },
    onError: () => toast({ title: "AI suggestion failed", variant: "destructive" }),
  });

  const botModeMutation = useMutation({
    mutationFn: (mode: string) =>
      api(`/admin/whatsapp/conversations/${phone}/bot-mode`, {
        method: "PATCH", body: JSON.stringify({ botMode: mode }),
      }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Bot mode updated" }); qc.invalidateQueries({ queryKey: ["wa-convs-unified"] }); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const starMutation = useMutation({
    mutationFn: () =>
      api(`/admin/whatsapp/conversations/${phone}/star`, { method: "PATCH" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-convs-unified"] }); },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  const noteMutation = useMutation({
    mutationFn: (note: string) =>
      api(`/admin/whatsapp/conversations/${phone}/note`, {
        method: "POST", body: JSON.stringify({ note }),
      }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Note saved ✓" }); setNoteText(""); setShowNoteInput(false); },
    onError: () => toast({ title: "Note failed", variant: "destructive" }),
  });

  const sendTemplateMutation = useMutation({
    mutationFn: (templateId: number) =>
      api(`/admin/whatsapp/conversations/${phone}/send-template`, {
        method: "POST", body: JSON.stringify({ templateId }),
      }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Template sent ✓" }); setShowTemplates(false); refetchMsgs(); },
    onError: () => toast({ title: "Template send failed", variant: "destructive" }),
  });

  const waConvRaw = isWa ? (conv?.raw as WaConv) : null;
  const currentBotMode = waConvRaw?.botMode ?? "auto";

  if (!conv) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 text-gray-400">
        <MessageCircle className="w-14 h-14 mb-4 opacity-20" />
        <p className="text-base font-medium">Select a conversation</p>
        <p className="text-sm mt-1 text-gray-400">Click any chat from the left to open it</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white border-b border-gray-100 shrink-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${
          isWa ? "bg-[#25D366]" : "bg-blue-500"
        }`}>
          {conv.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-gray-900 truncate">{conv.name}</p>
            <ChannelBadge channel={conv.channel} />
            {isWa && <BotBadge mode={conv.botMode} />}
          </div>
          {conv.phone && <p className="text-[11px] text-gray-500">{conv.phone}</p>}
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Bot mode toggle (WA only) */}
          {isWa && phone && (
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              {["auto","human","off"].map(mode => (
                <button
                  key={mode}
                  onClick={() => botModeMutation.mutate(mode)}
                  disabled={botModeMutation.isPending}
                  title={`Set bot to ${mode}`}
                  className={`px-2 py-1 text-[9px] font-semibold transition-colors ${
                    currentBotMode === mode
                      ? mode === "auto" ? "bg-emerald-500 text-white" : mode === "human" ? "bg-blue-500 text-white" : "bg-gray-500 text-white"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {mode === "auto" ? "🤖" : mode === "human" ? "👤" : "⛔"}
                </button>
              ))}
            </div>
          )}

          {/* AI suggest */}
          {isWa && waConvId && (
            <button
              onClick={() => aiSuggestMutation.mutate()}
              disabled={aiSuggestMutation.isPending}
              className="p-1.5 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors"
              title="AI reply suggestion"
            >
              {aiSuggestMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Star */}
          {isWa && phone && (
            <button onClick={() => starMutation.mutate()} className="p-1.5 rounded-lg hover:bg-gray-100" title="Star conversation">
              <Star className={`w-3.5 h-3.5 ${conv.isStarred ? "text-amber-400 fill-amber-400" : "text-gray-400"}`} />
            </button>
          )}

          {/* Note */}
          {isWa && (
            <button onClick={() => setShowNoteInput(v => !v)} className={`p-1.5 rounded-lg hover:bg-gray-100 ${showNoteInput ? "bg-amber-50 text-amber-500" : "text-gray-400"}`} title="Add note">
              <StickyNote className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Open WA */}
          {isWa && conv.phone && (
            <a
              href={`https://wa.me/${conv.phone.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-[#25D366]"
              title="Open in WhatsApp"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Note input */}
      {showNoteInput && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 shrink-0 flex gap-2">
          <input
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note about this customer…"
            className="flex-1 text-xs border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-amber-400"
            onKeyDown={e => { if (e.key === "Enter" && noteText.trim()) noteMutation.mutate(noteText); }}
          />
          <button
            onClick={() => noteMutation.mutate(noteText)}
            disabled={!noteText.trim() || noteMutation.isPending}
            className="text-xs bg-amber-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-amber-600 disabled:opacity-50"
          >
            {noteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#efeae2]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">No messages yet</div>
        ) : (
          messages.map((m: any, i: number) => {
            const isMe  = m.direction === "out" || m.direction === "outbound" || m.role === "assistant" || m.role === "admin";
            const isBot = m.isBot || m.role === "assistant" || m.botReply;
            const text  = m.content ?? m.message ?? m.body ?? m.text ?? "";
            const ts    = m.createdAt ?? m.created_at ?? m.timestamp ?? m.updatedAt ?? "";

            return (
              <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                {!isMe && (
                  <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center mr-2 mt-1 shrink-0">
                    <User className="w-3 h-3 text-gray-600" />
                  </div>
                )}
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                  isMe
                    ? isBot ? "bg-violet-600 text-white rounded-tr-sm" : "bg-[#dcf8c6] text-gray-800 rounded-tr-sm"
                    : "bg-white text-gray-800 rounded-tl-sm"
                }`}>
                  {isBot && (
                    <p className="text-[9px] font-semibold text-violet-300 mb-1 flex items-center gap-1">
                      <Bot className="w-2.5 h-2.5" /> AI Bot
                    </p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] opacity-60">{fmtTime(ts)}</span>
                    {isMe && !isBot && <StatusIcon status={m.status} />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Templates panel */}
      {showTemplates && (
        <div className="border-t border-gray-100 bg-white px-3 py-2 shrink-0 max-h-[140px] overflow-y-auto">
          <p className="text-[10px] font-semibold text-gray-500 mb-1.5">Send Template</p>
          {approvedTemplates.length === 0 ? (
            <p className="text-[11px] text-gray-400 py-2">No approved templates</p>
          ) : (
            <div className="space-y-1">
              {approvedTemplates.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => sendTemplateMutation.mutate(t.id)}
                  disabled={sendTemplateMutation.isPending}
                  className="w-full text-left text-[11px] px-2.5 py-1.5 bg-gray-50 hover:bg-[#25D366]/10 rounded-lg transition-colors flex items-center justify-between gap-2"
                >
                  <span className="truncate font-medium text-gray-700">{t.name}</span>
                  <span className="text-[9px] text-gray-400 shrink-0">{t.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick replies */}
      {showQuick && isWa && (
        <div className="border-t border-gray-100 bg-white px-3 py-2 shrink-0">
          <p className="text-[10px] font-semibold text-gray-500 mb-1.5">Quick Replies</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REPLIES.map(q => (
              <button
                key={q.label}
                onClick={() => { setMsg(q.text); setShowQuick(false); }}
                className="text-xs px-2.5 py-1 bg-[#25D366]/10 text-[#128C7E] rounded-full hover:bg-[#25D366]/20 transition-colors font-medium"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      {isWa ? (
        <div className="flex items-end gap-2 px-3 py-3 bg-white border-t border-gray-100 shrink-0">
          <button
            onClick={() => { setShowQuick(s => !s); setShowTemplates(false); }}
            className={`p-2 rounded-lg transition-colors shrink-0 ${showQuick ? "bg-[#25D366]/10 text-[#25D366]" : "hover:bg-gray-100 text-gray-400"}`}
            title="Quick replies"
          >
            <Zap className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setShowTemplates(s => !s); setShowQuick(false); }}
            className={`p-2 rounded-lg transition-colors shrink-0 ${showTemplates ? "bg-blue-50 text-blue-500" : "hover:bg-gray-100 text-gray-400"}`}
            title="Send template"
          >
            <FileText className="w-4 h-4" />
          </button>
          <div className="flex-1 relative">
            <textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendWa(msg); } }}
              placeholder="Type a message… (Enter to send)"
              rows={1}
              className="w-full resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#25D366] bg-gray-50 max-h-[120px]"
            />
          </div>
          <button
            onClick={() => sendWa(msg)}
            disabled={sending || !msg.trim()}
            className="w-9 h-9 flex items-center justify-center bg-[#25D366] hover:bg-[#128C7E] disabled:opacity-40 text-white rounded-xl transition-colors shrink-0"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-3 bg-blue-50 border-t border-blue-100 shrink-0">
          <Globe className="w-4 h-4 text-blue-400 shrink-0" />
          <p className="text-xs text-blue-600 font-medium flex-1">Website chat — read only. Reply via WhatsApp or escalate.</p>
          {conv.phone && (
            <a
              href={`https://wa.me/${conv.phone.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs bg-[#25D366] text-white px-2.5 py-1.5 rounded-lg hover:bg-[#128C7E] transition-colors font-medium flex items-center gap-1 shrink-0"
            >
              <MessageCircle className="w-3 h-3" /> Reply on WA
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Right Panel: Customer Info + Orders ── */
function CustomerPanel({ conv }: { conv: UnifiedConv | null }) {
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"info" | "orders">("orders");

  if (!conv) {
    return (
      <div className="flex items-center justify-center h-full text-gray-300 text-xs flex-col gap-2">
        <User className="w-8 h-8 opacity-20" />
        <span>No conversation selected</span>
      </div>
    );
  }

  const isWa     = conv.channel === "whatsapp";
  const waConv   = isWa ? (conv.raw as WaConv) : null;
  const webSession = !isWa ? (conv.raw as ChatSession) : null;

  return (
    <div className="flex flex-col h-full bg-gray-50 border-l border-gray-100 overflow-hidden">
      {/* Customer header */}
      <div className="p-3.5 bg-white border-b border-gray-100 shrink-0">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold mx-auto mb-2 ${
          isWa ? "bg-[#25D366]" : "bg-blue-500"
        }`}>
          {conv.name.charAt(0).toUpperCase()}
        </div>
        <p className="text-center font-bold text-gray-800 text-sm">{conv.name}</p>
        {conv.phone && (
          <p className="text-center text-xs text-gray-500 mt-0.5 font-mono">{conv.phone}</p>
        )}
        <div className="flex justify-center gap-1.5 mt-1.5">
          <ChannelBadge channel={conv.channel} />
          {isWa && <BotBadge mode={conv.botMode} />}
          {isWa && waConv?.isStarred && <span className="text-[8px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5"><Star className="w-2 h-2" />Starred</span>}
        </div>

        {/* Call + WA buttons */}
        {conv.phone && (
          <div className="flex gap-1.5 mt-2.5">
            <a
              href={`tel:${conv.phone}`}
              className="flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100 py-1.5 rounded-lg hover:bg-green-100"
            >
              <Phone className="w-3 h-3" /> Call
            </a>
            <a
              href={`https://wa.me/${conv.phone.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold bg-[#25D366]/10 text-[#128C7E] border border-[#25D366]/20 py-1.5 rounded-lg hover:bg-[#25D366]/20"
            >
              <MessageCircle className="w-3 h-3" /> WA
            </a>
          </div>
        )}
      </div>

      {/* Tabs: Orders / Info */}
      <div className="flex border-b border-gray-100 shrink-0 bg-white">
        {([["orders", "Orders", ShoppingBag], ["info", "Info", User]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-semibold transition-colors ${
              activeTab === key ? "text-[#128C7E] border-b-2 border-[#25D366]" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="w-3 h-3" /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "orders" ? (
          conv.phone ? (
            <CustomerOrdersSection phone={conv.phone} />
          ) : (
            <div className="text-center py-6 text-[11px] text-gray-400">
              <AlertCircle className="w-6 h-6 mx-auto mb-1 opacity-30" />
              No phone number — can't look up orders
            </div>
          )
        ) : (
          /* Info tab */
          <div className="space-y-3">
            {/* Quick actions */}
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Quick Actions</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => nav("/chat-leads")} className="flex items-center gap-1.5 text-[10px] font-semibold bg-blue-50 text-blue-600 px-2 py-2 rounded-lg hover:bg-blue-100">
                  <UserCheck className="w-3 h-3" /> CRM
                </button>
                <button onClick={() => nav("/shopify/orders")} className="flex items-center gap-1.5 text-[10px] font-semibold bg-amber-50 text-amber-600 px-2 py-2 rounded-lg hover:bg-amber-100">
                  <Archive className="w-3 h-3" /> Orders
                </button>
                <button onClick={() => nav("/logistics/riders")} className="flex items-center gap-1.5 text-[10px] font-semibold bg-indigo-50 text-indigo-600 px-2 py-2 rounded-lg hover:bg-indigo-100">
                  <Bike className="w-3 h-3" /> Riders
                </button>
                <button onClick={() => nav("/logistics/confirmations")} className="flex items-center gap-1.5 text-[10px] font-semibold bg-sky-50 text-sky-600 px-2 py-2 rounded-lg hover:bg-sky-100">
                  <CheckCircle2 className="w-3 h-3" /> Confirm
                </button>
              </div>
            </div>

            {/* Conversation info */}
            {isWa && waConv && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Conversation</p>
                <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Channel</span>
                    <ChannelBadge channel="whatsapp" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Bot mode</span>
                    <BotBadge mode={waConv.botMode} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Status</span>
                    <span className="text-gray-700 font-medium capitalize">{waConv.status ?? "open"}</span>
                  </div>
                  {waConv.agentName && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Agent</span>
                      <span className="text-gray-700 font-medium">{waConv.agentName}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Last active</span>
                    <span className="text-gray-700 font-medium">{timeAgo(conv.lastAt)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Web session info */}
            {!isWa && webSession && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Session</p>
                <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Messages</span>
                    <span className="text-gray-700 font-medium">{(webSession.messages ?? []).length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Last active</span>
                    <span className="text-gray-700 font-medium">{timeAgo(conv.lastAt)}</span>
                  </div>
                  {webSession.sessionId && (
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="text-gray-500 shrink-0">Session ID</span>
                      <span className="text-gray-600 font-mono text-[9px] truncate">{webSession.sessionId}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => nav("/chat-conversations")}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs bg-blue-50 text-blue-600 px-2.5 py-2 rounded-lg hover:bg-blue-100 font-medium"
                >
                  <ArrowRight className="w-3 h-3" /> Full Chat Page
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════
   MAIN PAGE
══════════════════════════════════ */
export default function WaChatPage() {
  const [channel, setChannel]   = useState<Channel>("all");
  const [selected, setSelected] = useState<UnifiedConv | null>(null);
  const [showRight, setShowRight] = useState(true);

  return (
    <div className="flex flex-col h-full bg-gray-50 p-4 overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-[#25D366]" />
            WA Chat
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Unified inbox — WhatsApp + Website + AI · Orders · Quick Actions</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRight(s => !s)}
            className={`p-2 rounded-lg border transition-colors ${showRight ? "border-[#25D366] bg-[#25D366]/5 text-[#25D366]" : "border-gray-200 hover:bg-gray-50 text-gray-500"}`}
            title={showRight ? "Hide customer panel" : "Show customer panel"}
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <StatsBar />

      {/* 3-panel layout */}
      <div className="flex-1 flex rounded-2xl overflow-hidden border border-gray-200 shadow-sm min-h-0">
        {/* Left: conv list */}
        <div className="w-[270px] shrink-0 flex flex-col overflow-hidden">
          <ConvList
            selected={selected}
            onSelect={setSelected}
            channel={channel}
            onChannelChange={setChannel}
          />
        </div>

        {/* Center: thread */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ConvThread conv={selected} />
        </div>

        {/* Right: customer info + orders */}
        {showRight && (
          <div className="w-[280px] shrink-0 overflow-hidden">
            <CustomerPanel conv={selected} />
          </div>
        )}
      </div>
    </div>
  );
}
