import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle, Search, Send, Bot, User, RefreshCw, CheckCheck, Check,
  Globe, Sparkles, Loader2, Inbox, Bell, Activity,
  MessageSquareDashed, Zap, ArrowRight, ExternalLink, Wifi, WifiOff,
  TrendingUp, Archive, Eye, Star, Package, Phone, DollarSign, Truck,
  ShoppingBag, FileText, UserCheck, XCircle, CheckCircle2, StickyNote,
  ChevronDown, ChevronRight, Navigation, AlertCircle, ToggleLeft, ToggleRight,
  Bike, Image, Paperclip, MoreVertical, Hash,
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

function fmtDate(date: string | null | undefined) {
  if (!date) return "";
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
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

/* ── Categorized quick-reply templates ── */
const TEMPLATE_CATEGORIES = [
  {
    key: "greeting",
    label: "👋 Greeting",
    color: "text-blue-600 bg-blue-50 border-blue-100",
    templates: [
      { label: "Welcome",     text: "السلام علیکم! KDF NUTS میں خوش آمدید۔ 🥜\nآپ کی کیا مدد کر سکتے ہیں؟" },
      { label: "Follow-up",  text: "آپ سے دوبارہ رابطہ ہوا۔ کیا ہم مزید مدد کر سکتے ہیں؟" },
      { label: "Good morning", text: "صبح بخیر! 🌅 KDF NUTS میں خوش آمدید۔ آج ہم آپ کی کیا مدد کر سکتے ہیں؟" },
    ],
  },
  {
    key: "cod",
    label: "💰 COD",
    color: "text-amber-600 bg-amber-50 border-amber-100",
    templates: [
      { label: "COD ready",   text: "آپ کا COD آرڈر تیار ہے۔\n🚴 Rider جلد آئے گا۔\n💰 ادائیگی تیار رکھیں۔\n\nشکریہ! KDF NUTS" },
      { label: "COD confirm", text: "آپ کا آرڈر confirm ہوگیا ہے۔ ✅\n📦 COD پر deliver ہوگا۔\nرقم تیار رکھیں۔" },
      { label: "COD amount",  text: "آپ کے آرڈر کی COD رقم PKR {amount} ہے۔ Delivery پر ادا کریں۔" },
    ],
  },
  {
    key: "order",
    label: "📦 Order",
    color: "text-purple-600 bg-purple-50 border-purple-100",
    templates: [
      { label: "Received",    text: "آپ کا آرڈر موصول ہوگیا ہے۔ 📦\nہم جلد پروسیس کریں گے۔\nشکریہ!" },
      { label: "Processing",  text: "آپ کا آرڈر ابھی process ہورہا ہے۔ ⚙️\nجلد dispatch ہوگا۔" },
      { label: "Dispatched",  text: "خوشخبری! 🎉 آپ کا آرڈر آج dispatch ہوگیا ہے۔" },
      { label: "Confirm?",    text: "براہ کرم اپنا آرڈر confirm کریں۔\n✅ Confirm کریں یا ❌ Cancel — جواب بھیجیں۔" },
    ],
  },
  {
    key: "tracking",
    label: "🚚 Tracking",
    color: "text-indigo-600 bg-indigo-50 border-indigo-100",
    templates: [
      { label: "TCS CN",      text: "آپ کا TCS tracking number: *{tracking}*\n\nTrack کریں:\nhttps://www.tcsexpress.com/track/{tracking}\n\nکل delivery متوقع ہے۔" },
      { label: "Dispatched",  text: "آپ کا آرڈر dispatch ہوگیا! 🚚\nTracking: {tracking}\n\nکسی سوال کے لیے رابطہ کریں۔" },
      { label: "Out for Del", text: "آپ کا آرڈر آج deliver ہونے والا ہے۔ 🏍️\nRider آپ سے رابطہ کرے گا۔" },
      { label: "Rider OTW",   text: "آپ کا rider راستے میں ہے! 🏍️\nتقریباً {eta} منٹ میں پہنچے گا۔\nتیار رہیں!" },
    ],
  },
  {
    key: "payment",
    label: "💳 Payment",
    color: "text-green-600 bg-green-50 border-green-100",
    templates: [
      { label: "Confirmed",   text: "آپ کی payment PKR {amount} confirm ہوگئی! ✅\nشکریہ! آرڈر جلد dispatch ہوگا۔" },
      { label: "Pending",     text: "آپ کی payment ابھی تک موصول نہیں ہوئی۔\nبراہ کرم payment کریں تاکہ آرڈر process ہو۔" },
      { label: "Bank details", text: "Meezan Bank\nAcc: XXXX-XXXX\nName: KDF NUTS\n\nPayment کے بعد screenshot بھیجیں۔" },
    ],
  },
  {
    key: "other",
    label: "✨ Other",
    color: "text-gray-600 bg-gray-50 border-gray-100",
    templates: [
      { label: "Out of stock", text: "معذرت، یہ آئٹم ابھی available نہیں۔ 😔\nجلد دوبارہ available ہوگا۔\nNotify کریں؟" },
      { label: "Thank you",   text: "آپ کا شکریہ! 🙏\nKDF NUTS کا انتخاب کرنے کا شکریہ۔\nدوبارہ تشریف لائیں! 🥜" },
      { label: "Contact",     text: "کسی بھی سوال کے لیے:\n📞 0300-XXXXXXX\n🌐 kdfnuts.com\n\nہم آپ کی مدد کو تیار ہیں!" },
    ],
  },
];

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
    { label: "WA Open",    value: s.open_conversations ?? 0, icon: MessageCircle,      color: "text-[#25D366]",   bg: "bg-[#25D366]/10" },
    { label: "Unread",     value: s.total_unread ?? 0,       icon: MessageSquareDashed, color: "text-red-500",     bg: "bg-red-50" },
    { label: "Active Web", value: activeSessions,             icon: Wifi,                color: "text-blue-500",    bg: "bg-blue-50" },
    { label: "Bot Today",  value: s.bot_replies_today ?? 0,  icon: Bot,                 color: "text-violet-500",  bg: "bg-violet-50" },
    { label: "Inbound",    value: s.inbound_today ?? 0,      icon: TrendingUp,          color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "AI Handles", value: s.bot_replies_today ?? 0,  icon: Sparkles,            color: "text-amber-600",   bg: "bg-amber-50" },
  ];
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3 shrink-0">
      {stats.map(st => (
        <div key={st.label} className="bg-white border border-gray-100 rounded-xl p-2.5 flex items-center gap-2 shadow-sm">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${st.bg}`}>
            <st.icon className={`w-3.5 h-3.5 ${st.color}`} />
          </div>
          <div>
            <p className="text-sm font-bold leading-none">{st.value}</p>
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
    <span className="inline-flex items-center gap-0.5 text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">
      <Bot className="w-2 h-2" /> Auto
    </span>
  );
  if (mode === "human") return (
    <span className="inline-flex items-center gap-0.5 text-[8px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
      <User className="w-2 h-2" /> Human
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-[8px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-semibold">
      <WifiOff className="w-2 h-2" /> Off
    </span>
  );
}

function StatusIcon({ status }: { status?: string }) {
  if (status === "read")      return <CheckCheck className="w-3 h-3 text-[#53bdeb]" />;
  if (status === "delivered") return <CheckCheck className="w-3 h-3 text-gray-400" />;
  if (status === "sent")      return <Check className="w-3 h-3 text-gray-400" />;
  return null;
}

/* ── Order mini card ── */
function OrderMiniCard({ order, onRefetch }: { order: any; onRefetch: () => void }) {
  const { toast } = useToast();
  const [, nav] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const addr  = order.shippingAddress ?? order.shipping_address ?? {};
  const city  = typeof addr === "string" ? (() => { try { return JSON.parse(addr).city; } catch { return ""; } })() : addr?.city;
  const total = parseFloat(order.totalPrice ?? order.total_price ?? "0");
  const effectiveStatus = order.status ?? order.fulfillmentStatus ?? "pending";

  const confirmMutation = useMutation({
    mutationFn: () => api(`/admin/shopify/orders/${order.id}/status`, { method: "PUT", body: JSON.stringify({ status: "confirmed" }) }).then(r => r.json()),
    onSuccess: () => { toast({ title: "✅ Order confirmed!" }); onRefetch(); },
    onError: () => toast({ title: "Confirm failed", variant: "destructive" }),
  });
  const cancelMutation = useMutation({
    mutationFn: () => api(`/admin/shopify/orders/${order.id}/status`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }).then(r => r.json()),
    onSuccess: () => { toast({ title: "❌ Order cancelled" }); onRefetch(); },
    onError: () => toast({ title: "Cancel failed", variant: "destructive" }),
  });
  const sendWaMutation = useMutation({
    mutationFn: () => api(`/admin/shopify/orders/${order.id}/send-confirmation`, { method: "POST" }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Failed"); return d; }),
    onSuccess: () => toast({ title: "✅ WA confirmation sent!" }),
    onError: (e: any) => toast({ title: e.message ?? "Failed", variant: "destructive" }),
  });
  const sendTrackingMutation = useMutation({
    mutationFn: () => api(`/admin/shopify/orders/${order.id}/whatsapp`, { method: "POST", body: JSON.stringify({ message: `آپ کا آرڈر ${order.orderNumber} dispatch ہوگیا!\nTracking: ${order.trackingNumber}\n\nTCS: https://www.tcsexpress.com/track/${order.trackingNumber}` }) }).then(r => r.json()),
    onSuccess: () => toast({ title: "✅ Tracking sent on WhatsApp!" }),
    onError: () => toast({ title: "Send failed", variant: "destructive" }),
  });

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white mb-2 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2.5 p-3 cursor-pointer hover:bg-gray-50/60" onClick={() => setExpanded(v => !v)}>
        <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
          <Package className="w-4 h-4 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-gray-800">{order.orderNumber}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${orderStatusColor(effectiveStatus)}`}>
              {effectiveStatus}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400">
            <span className="font-semibold text-gray-600">PKR {total.toLocaleString()}</span>
            {city && <><span>·</span><span>{city}</span></>}
            <span>·</span><span>{timeAgo(order.createdAt)}</span>
          </div>
        </div>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-3 bg-gray-50/50 space-y-2">
          {order.financialStatus !== "paid" && total > 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              <DollarSign className="w-3.5 h-3.5 shrink-0" />
              <span>COD: <strong>PKR {total.toLocaleString()}</strong></span>
            </div>
          )}
          {order.trackingNumber && (
            <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
              <Truck className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono text-[11px] flex-1">{order.trackingNumber}</span>
              <button onClick={() => { navigator.clipboard.writeText(order.trackingNumber); toast({ title: "CN Copied!" }); }} className="text-[9px] bg-indigo-100 px-2 py-0.5 rounded-lg hover:bg-indigo-200">Copy</button>
            </div>
          )}
          {Array.isArray(order.lineItems) && order.lineItems.length > 0 && (
            <div className="text-[10px] text-gray-500 space-y-0.5 px-1">
              {order.lineItems.slice(0, 3).map((li: any, i: number) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                  {li.title} × {li.quantity}
                </div>
              ))}
              {order.lineItems.length > 3 && <div className="text-gray-400 pl-2">+{order.lineItems.length - 3} more</div>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {effectiveStatus === "pending" && (
              <button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending} className="flex items-center justify-center gap-1 text-[10px] font-bold bg-sky-500 text-white px-2 py-2 rounded-xl hover:bg-sky-600 disabled:opacity-50 shadow-sm">
                {confirmMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Confirm
              </button>
            )}
            {effectiveStatus === "pending" && (
              <button onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} className="flex items-center justify-center gap-1 text-[10px] font-bold bg-red-500 text-white px-2 py-2 rounded-xl hover:bg-red-600 disabled:opacity-50 shadow-sm">
                {cancelMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />} Cancel
              </button>
            )}
            <button onClick={() => sendWaMutation.mutate()} disabled={sendWaMutation.isPending} className="flex items-center justify-center gap-1 text-[10px] font-bold bg-[#25D366]/10 text-[#128C7E] border border-[#25D366]/20 px-2 py-2 rounded-xl hover:bg-[#25D366]/20 disabled:opacity-50">
              {sendWaMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageCircle className="w-3 h-3" />} Send WA
            </button>
            {order.trackingNumber && (
              <button onClick={() => sendTrackingMutation.mutate()} disabled={sendTrackingMutation.isPending} className="flex items-center justify-center gap-1 text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-2 rounded-xl hover:bg-indigo-100 disabled:opacity-50">
                {sendTrackingMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />} Tracking
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerOrdersSection({ phone }: { phone: string }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["customer-orders-chat", phone],
    queryFn: () => api(`/admin/shopify/orders?search=${encodeURIComponent(phone)}&limit=5`).then(r => r.json()).then(d => d.orders ?? []),
    enabled: !!phone,
    staleTime: 30_000,
  });
  const orders: any[] = data ?? [];
  if (isLoading) return <div className="flex items-center justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>;
  if (orders.length === 0) return (
    <div className="text-center py-6 text-[11px] text-gray-400">
      <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-25" />
      No orders found for this number
    </div>
  );
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Orders ({orders.length})</p>
        <button onClick={() => refetch()} className="text-gray-400 hover:text-gray-600"><RefreshCw className="w-3 h-3" /></button>
      </div>
      {orders.map((o: any) => <OrderMiniCard key={o.id} order={o} onRefetch={refetch} />)}
    </div>
  );
}

/* ── Conversation List ── */
function ConvList({ selected, onSelect, channel, onChannelChange }: {
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
    queryFn: () => api("/admin/chat/sessions").then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const unified: UnifiedConv[] = [
    ...waConvs.map((c): UnifiedConv => ({
      id: `wa-${c.id}`, channel: "whatsapp",
      name: c.contactName || c.contactPhone,
      phone: c.contactPhone,
      lastMsg: c.lastMessage ?? "", lastAt: c.lastMessageAt ?? "",
      unread: c.unreadCount ?? 0, botMode: c.botMode, isStarred: c.isStarred, raw: c,
    })),
    ...chatSessions.map((s): UnifiedConv => {
      const msgs: any[] = Array.isArray(s.messages) ? s.messages : [];
      const last = msgs[msgs.length - 1];
      return {
        id: `web-${s.id}`, channel: "website",
        name: s.leadName || `Visitor ${s.id}`,
        phone: s.leadPhone ?? undefined,
        lastMsg: (last?.content ?? last?.message ?? last?.text ?? "").slice(0, 80),
        lastAt: s.updatedAt, unread: 0, raw: s,
      };
    }),
  ].sort((a, b) => {
    if (!a.lastAt) return 1;
    if (!b.lastAt) return -1;
    return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
  });

  const isActive = (c: UnifiedConv) => c.lastAt ? Date.now() - new Date(c.lastAt).getTime() < 5 * 60 * 1000 : false;

  const filtered = unified.filter(c => {
    if (channel === "whatsapp" && c.channel !== "whatsapp") return false;
    if (channel === "website" && c.channel !== "website") return false;
    if (channel === "ai" && c.botMode !== "auto") return false;
    if (channel === "unread" && c.unread === 0) return false;
    if (channel === "active" && !isActive(c)) return false;
    return true;
  });

  const tabs = [
    { key: "all" as Channel,       label: "All",    icon: Inbox },
    { key: "whatsapp" as Channel,  label: "WA",     icon: MessageCircle, count: waConvs.reduce((s, c) => s + (c.unreadCount ?? 0), 0) },
    { key: "website" as Channel,   label: "Web",    icon: Globe,         count: chatSessions.length },
    { key: "ai" as Channel,        label: "Bot",    icon: Bot },
    { key: "unread" as Channel,    label: "Unread", icon: Bell },
    { key: "active" as Channel,    label: "Active", icon: Activity },
  ];

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-100">
      <div className="p-3 border-b border-gray-100 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#25D366] bg-gray-50" />
        </div>
      </div>

      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 overflow-x-auto shrink-0" style={{ scrollbarWidth: "none" }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => onChannelChange(tab.key)}
            className={`flex items-center gap-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg whitespace-nowrap transition-colors relative ${
              channel === tab.key ? "bg-[#25D366]/10 text-[#128C7E]" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}>
            <tab.icon className="w-3 h-3" />
            {tab.label}
            {(tab.count ?? 0) > 0 && (
              <span className="bg-red-500 text-white text-[8px] rounded-full px-1 py-px min-w-[14px] text-center leading-none">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {(waLoading || sessLoading) && filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-xs">No conversations</p>
          </div>
        ) : (
          filtered.map(c => {
            const isSelected = selected?.id === c.id;
            const active = isActive(c);
            return (
              <div key={c.id} onClick={() => onSelect(c)}
                className={`flex items-start gap-2.5 px-3 py-3 cursor-pointer border-b border-gray-50 transition-colors ${
                  isSelected ? "bg-[#25D366]/5 border-l-[3px] border-l-[#25D366]" : "hover:bg-gray-50"
                }`}>
                <div className="relative shrink-0 mt-0.5">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${c.channel === "whatsapp" ? "bg-[#25D366]" : "bg-blue-500"}`}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  {active && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <p className={`text-xs truncate ${c.unread > 0 ? "font-bold text-gray-900" : "font-semibold text-gray-700"}`}>{c.name}</p>
                      {c.isStarred && <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400 shrink-0" />}
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(c.lastAt)}</span>
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    <ChannelBadge channel={c.channel} />
                    {c.channel === "whatsapp" && <BotBadge mode={c.botMode} />}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className={`text-[11px] truncate flex-1 ${c.unread > 0 ? "text-gray-600 font-medium" : "text-gray-400"}`}>{c.lastMsg || "No messages"}</p>
                    {c.unread > 0 && (
                      <span className="bg-[#25D366] text-white text-[9px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center shrink-0 ml-1 font-bold">{c.unread}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-3 py-2 border-t border-gray-100 shrink-0 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">{filtered.length} chats</span>
        <button onClick={() => { refetchWa(); refetchSess(); }} className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Sync
        </button>
      </div>
    </div>
  );
}

/* ── Conversation Thread ── */
function ConvThread({ conv }: { conv: UnifiedConv | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [activeCategory, setActiveCategory] = useState(TEMPLATE_CATEGORIES[0].key);
  const [noteText, setNoteText] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);

  const isWa      = conv?.channel === "whatsapp";
  const waConvId  = isWa ? (conv?.raw as WaConv)?.id : null;
  const phone     = conv?.phone ?? null;
  const waConvRaw = isWa ? (conv?.raw as WaConv) : null;
  const currentBotMode = waConvRaw?.botMode ?? "auto";

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

  const { data: templatesData } = useQuery({
    queryKey: ["wa-templates-approved"],
    queryFn: () => api("/admin/whatsapp/templates/approved").then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    staleTime: 120_000,
    enabled: showTemplatePanel,
  });

  const webSession  = (!isWa && conv) ? (conv.raw as ChatSession) : null;
  const webMessages = webSession ? (Array.isArray(webSession.messages) ? webSession.messages : []) : [];
  const messages: any[] = isWa ? (waMsgData ?? []) : webMessages;

  /* Group messages by date */
  const groupedMessages = messages.reduce((acc: { date: string; msgs: any[] }[], m: any) => {
    const ts = m.createdAt ?? m.created_at ?? m.timestamp ?? m.updatedAt ?? "";
    const dateLabel = fmtDate(ts);
    const last = acc[acc.length - 1];
    if (last && last.date === dateLabel) { last.msgs.push(m); }
    else { acc.push({ date: dateLabel, msgs: [m] }); }
    return acc;
  }, []);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [messages.length]);

  const sendWa = useCallback(async (text: string) => {
    if (!waConvId || !text.trim()) return;
    setSending(true);
    try {
      const res = await api(`/admin/wa/conversations/${waConvId}/reply`, {
        method: "POST", body: JSON.stringify({ message: text.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      qc.invalidateQueries({ queryKey: ["wa-msgs-unified", waConvId] });
      qc.invalidateQueries({ queryKey: ["wa-convs-unified"] });
      setMsg("");
      toast({ title: "Sent ✓" });
    } catch (e: any) {
      toast({ title: e.message ?? "Failed", variant: "destructive" });
    } finally { setSending(false); }
  }, [waConvId, qc, toast]);

  const aiSuggestMutation = useMutation({
    mutationFn: () => api(`/admin/wa/conversations/${waConvId}/ai-suggest`, { method: "POST" }).then(r => r.json()),
    onSuccess: (d: any) => { if (d.suggestion) setMsg(d.suggestion); },
    onError: () => toast({ title: "AI suggestion failed", variant: "destructive" }),
  });

  const botModeMutation = useMutation({
    mutationFn: (mode: string) => api(`/admin/whatsapp/conversations/${phone}/bot-mode`, { method: "PATCH", body: JSON.stringify({ botMode: mode }) }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Bot mode updated" }); qc.invalidateQueries({ queryKey: ["wa-convs-unified"] }); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const starMutation = useMutation({
    mutationFn: () => api(`/admin/whatsapp/conversations/${phone}/star`, { method: "PATCH" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-convs-unified"] }); },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  const noteMutation = useMutation({
    mutationFn: (note: string) => api(`/admin/whatsapp/conversations/${phone}/note`, { method: "POST", body: JSON.stringify({ note }) }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Note saved ✓" }); setNoteText(""); setShowNoteInput(false); },
    onError: () => toast({ title: "Note failed", variant: "destructive" }),
  });

  const sendTemplateMutation = useMutation({
    mutationFn: (templateId: number) => api(`/admin/whatsapp/conversations/${phone}/send-template`, { method: "POST", body: JSON.stringify({ templateId }) }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Template sent ✓" }); setShowTemplatePanel(false); refetchMsgs(); },
    onError: () => toast({ title: "Template send failed", variant: "destructive" }),
  });

  if (!conv) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#f0f2f5] text-gray-400">
        <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center mb-4">
          <MessageCircle className="w-9 h-9 opacity-40" />
        </div>
        <p className="text-base font-semibold text-gray-500">Select a conversation</p>
        <p className="text-sm mt-1 text-gray-400">Click any chat from the left panel</p>
      </div>
    );
  }

  const approvedTemplates: any[] = templatesData ?? [];
  const activeCategoryTemplates = TEMPLATE_CATEGORIES.find(c => c.key === activeCategory);

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 shrink-0 shadow-sm">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${isWa ? "bg-[#25D366]" : "bg-blue-500"}`}>
          {conv.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-gray-900">{conv.name}</p>
            <ChannelBadge channel={conv.channel} />
            {isWa && <BotBadge mode={conv.botMode} />}
          </div>
          {conv.phone && <p className="text-[11px] text-gray-400 font-mono">{conv.phone}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Bot mode toggle */}
          {isWa && phone && (
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              {(["auto","human","off"] as const).map(mode => (
                <button key={mode} onClick={() => botModeMutation.mutate(mode)} disabled={botModeMutation.isPending} title={`Bot: ${mode}`}
                  className={`px-2 py-1.5 text-[9px] font-bold transition-colors ${
                    currentBotMode === mode
                      ? mode === "auto" ? "bg-emerald-500 text-white" : mode === "human" ? "bg-blue-500 text-white" : "bg-gray-500 text-white"
                      : "text-gray-400 hover:bg-gray-50"
                  }`}>
                  {mode === "auto" ? "🤖" : mode === "human" ? "👤" : "⛔"}
                </button>
              ))}
            </div>
          )}
          {isWa && waConvId && (
            <button onClick={() => aiSuggestMutation.mutate()} disabled={aiSuggestMutation.isPending} className="p-1.5 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100" title="AI suggest">
              {aiSuggestMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            </button>
          )}
          {isWa && phone && (
            <button onClick={() => starMutation.mutate()} className="p-1.5 rounded-lg hover:bg-gray-100" title="Star">
              <Star className={`w-3.5 h-3.5 ${conv.isStarred ? "text-amber-400 fill-amber-400" : "text-gray-400"}`} />
            </button>
          )}
          {isWa && (
            <button onClick={() => setShowNoteInput(v => !v)} className={`p-1.5 rounded-lg hover:bg-gray-100 ${showNoteInput ? "bg-amber-50 text-amber-500" : "text-gray-400"}`} title="Note">
              <StickyNote className="w-3.5 h-3.5" />
            </button>
          )}
          {isWa && conv.phone && (
            <a href={`https://wa.me/${conv.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-gray-100 text-[#25D366]" title="Open WA">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* ── Inline note bar ── */}
      {showNoteInput && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 shrink-0 flex gap-2">
          <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note about this customer…"
            className="flex-1 text-xs border border-amber-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-amber-400"
            onKeyDown={e => { if (e.key === "Enter" && noteText.trim()) noteMutation.mutate(noteText); }} />
          <button onClick={() => noteMutation.mutate(noteText)} disabled={!noteText.trim() || noteMutation.isPending}
            className="text-xs bg-amber-500 text-white px-3 py-2 rounded-xl hover:bg-amber-600 disabled:opacity-50 font-semibold">
            {noteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
          </button>
        </div>
      )}

      {/* ── Messages area ── */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#f0f2f5]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d1d5db' fill-opacity='0.2'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>
        {waLoading ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <MessageCircle className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-sm">No messages yet</p>
          </div>
        ) : (
          groupedMessages.map(({ date, msgs }) => (
            <div key={date}>
              {/* Date divider */}
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-[10px] bg-white text-gray-400 px-2.5 py-1 rounded-full shadow-sm font-semibold border border-gray-100">{date}</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              {msgs.map((m: any, i: number) => {
                const isMe  = m.direction === "out" || m.direction === "outbound" || m.role === "assistant" || m.role === "admin";
                const isBot = m.isBot || m.role === "assistant" || m.botReply;
                const text  = m.content ?? m.message ?? m.body ?? m.text ?? "";
                const ts    = m.createdAt ?? m.created_at ?? m.timestamp ?? m.updatedAt ?? "";
                return (
                  <div key={i} className={`flex mb-1.5 ${isMe ? "justify-end" : "justify-start"}`}>
                    {!isMe && (
                      <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center mr-2 mt-1 shrink-0 shadow-sm">
                        <User className="w-3.5 h-3.5 text-gray-600" />
                      </div>
                    )}
                    <div className="flex flex-col max-w-[72%]">
                      <div className={`relative px-3.5 py-2.5 shadow-sm ${
                        isMe
                          ? isBot
                            ? "bg-violet-600 text-white rounded-[18px] rounded-tr-[4px]"
                            : "bg-[#dcf8c6] text-gray-800 rounded-[18px] rounded-tr-[4px]"
                          : "bg-white text-gray-800 rounded-[18px] rounded-tl-[4px]"
                      }`}>
                        {isBot && (
                          <p className="text-[9px] font-bold text-violet-300 mb-1.5 flex items-center gap-1">
                            <Bot className="w-2.5 h-2.5" /> AI Bot
                          </p>
                        )}
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{text}</p>
                        <div className={`flex items-center gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
                          <span className={`text-[10px] ${isMe ? (isBot ? "text-violet-300" : "text-gray-500") : "text-gray-400"}`}>{fmtTime(ts)}</span>
                          {isMe && !isBot && <StatusIcon status={m.status} />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Template panel ── */}
      {showTemplatePanel && (
        <div className="border-t border-gray-100 bg-white shrink-0 max-h-[220px] flex flex-col">
          {/* Category tabs */}
          <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-gray-50" style={{ scrollbarWidth: "none" }}>
            {TEMPLATE_CATEGORIES.map(cat => (
              <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                className={`text-[10px] font-semibold px-2.5 py-1.5 rounded-full whitespace-nowrap transition-colors border ${
                  activeCategory === cat.key ? cat.color : "text-gray-500 bg-gray-50 border-gray-100 hover:bg-gray-100"
                }`}>
                {cat.label}
              </button>
            ))}
          </div>
          {/* Templates */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
            {activeCategoryTemplates?.templates.map((t, i) => (
              <button key={i} onClick={() => { setMsg(t.text); setShowTemplatePanel(false); }}
                className="w-full text-left text-[11px] px-3 py-2 bg-gray-50 hover:bg-[#25D366]/8 rounded-xl transition-colors border border-gray-100 flex items-center justify-between gap-2 group">
                <div>
                  <span className="font-semibold text-gray-700 group-hover:text-[#128C7E]">{t.label}</span>
                  <p className="text-gray-400 text-[10px] mt-0.5 truncate">{t.text.slice(0, 60)}…</p>
                </div>
                <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-[#25D366] shrink-0" />
              </button>
            ))}
            {/* Approved templates from API */}
            {activeCategory === "other" && approvedTemplates.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 pt-1">Meta Approved</p>
                {approvedTemplates.map((t: any) => (
                  <button key={t.id} onClick={() => sendTemplateMutation.mutate(t.id)} disabled={sendTemplateMutation.isPending}
                    className="w-full text-left text-[11px] px-3 py-2 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors border border-indigo-100 flex items-center justify-between gap-2 disabled:opacity-50">
                    <span className="font-semibold text-indigo-700">{t.name}</span>
                    <span className="text-[9px] text-indigo-400 shrink-0">{t.category}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Input composer ── */}
      {isWa ? (
        <div className="bg-white border-t border-gray-100 shrink-0">
          <div className="flex items-end gap-2 px-3 py-3">
            {/* Template button */}
            <button onClick={() => setShowTemplatePanel(s => !s)}
              className={`p-2.5 rounded-xl transition-colors shrink-0 ${showTemplatePanel ? "bg-[#25D366]/10 text-[#25D366]" : "text-gray-400 hover:bg-gray-100"}`} title="Templates">
              <Zap className="w-4 h-4" />
            </button>

            {/* Text area */}
            <div className="flex-1 relative">
              <textarea value={msg} onChange={e => setMsg(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendWa(msg); } }}
                placeholder="Type a message… (Enter ↵ to send)"
                rows={1}
                className="w-full resize-none border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#25D366] bg-gray-50 max-h-[120px] leading-relaxed"
                style={{ minHeight: "44px" }}
              />
            </div>

            {/* AI Suggest */}
            {waConvId && (
              <button onClick={() => aiSuggestMutation.mutate()} disabled={aiSuggestMutation.isPending}
                className="p-2.5 rounded-xl bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors shrink-0" title="AI reply">
                {aiSuggestMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              </button>
            )}

            {/* Send */}
            <button onClick={() => sendWa(msg)} disabled={sending || !msg.trim()}
              className="w-10 h-10 flex items-center justify-center bg-[#25D366] hover:bg-[#128C7E] disabled:opacity-40 text-white rounded-xl transition-all shadow-md shrink-0 active:scale-95">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          {/* Character hint */}
          {msg.length > 0 && (
            <div className="px-4 pb-2 flex items-center justify-between text-[10px] text-gray-400">
              <span>{msg.length} chars</span>
              <span>Shift+Enter for newline</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-t border-blue-100 shrink-0">
          <Globe className="w-4 h-4 text-blue-400 shrink-0" />
          <p className="text-xs text-blue-600 font-medium flex-1">Website chat — read only. Reply via WhatsApp.</p>
          {conv.phone && (
            <a href={`https://wa.me/${conv.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer"
              className="text-xs bg-[#25D366] text-white px-3 py-1.5 rounded-xl hover:bg-[#128C7E] font-semibold flex items-center gap-1 shrink-0">
              <MessageCircle className="w-3 h-3" /> Reply on WA
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Right Panel: Customer + Orders ── */
function CustomerPanel({ conv }: { conv: UnifiedConv | null }) {
  const [, nav] = useLocation();
  const [activeTab, setActiveTab] = useState<"orders" | "info">("orders");

  if (!conv) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-300">
        <User className="w-10 h-10 opacity-20 mb-2" />
        <span className="text-xs">No conversation</span>
      </div>
    );
  }

  const isWa    = conv.channel === "whatsapp";
  const waConv  = isWa ? (conv.raw as WaConv) : null;
  const webSession = !isWa ? (conv.raw as ChatSession) : null;

  return (
    <div className="flex flex-col h-full bg-gray-50 border-l border-gray-100 overflow-hidden">
      {/* Customer header */}
      <div className="p-4 bg-white border-b border-gray-100 shrink-0">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto mb-3 shadow-md ${isWa ? "bg-[#25D366]" : "bg-blue-500"}`}>
          {conv.name.charAt(0).toUpperCase()}
        </div>
        <p className="text-center font-bold text-gray-800 text-sm">{conv.name}</p>
        {conv.phone && <p className="text-center text-xs text-gray-400 mt-0.5 font-mono">{conv.phone}</p>}
        <div className="flex justify-center gap-1.5 mt-2">
          <ChannelBadge channel={conv.channel} />
          {isWa && <BotBadge mode={conv.botMode} />}
          {waConv?.isStarred && <span className="text-[8px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5"><Star className="w-2 h-2" />Starred</span>}
        </div>
        {conv.phone && (
          <div className="flex gap-2 mt-3">
            <a href={`tel:${conv.phone}`} className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold bg-green-50 text-green-700 border border-green-200 py-2 rounded-xl hover:bg-green-100 transition-colors">
              <Phone className="w-3.5 h-3.5" /> Call
            </a>
            <a href={`https://wa.me/${conv.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold bg-[#25D366]/10 text-[#128C7E] border border-[#25D366]/20 py-2 rounded-xl hover:bg-[#25D366]/20 transition-colors">
              <MessageCircle className="w-3.5 h-3.5" /> WA
            </a>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 bg-white shrink-0">
        {([["orders", "Orders", ShoppingBag], ["info", "Info", User]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold transition-colors ${
              activeTab === key ? "text-[#128C7E] border-b-2 border-[#25D366]" : "text-gray-400 hover:text-gray-600"
            }`}>
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
            <div className="text-center py-8 text-[11px] text-gray-400">
              <AlertCircle className="w-7 h-7 mx-auto mb-2 opacity-30" />
              No phone number to look up orders
            </div>
          )
        ) : (
          <div className="space-y-3">
            {/* Quick actions */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Quick Nav</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: "CRM", icon: UserCheck, bg: "bg-blue-50 text-blue-600 border-blue-100", onClick: () => nav("/chat-leads") },
                  { label: "Orders", icon: Archive, bg: "bg-amber-50 text-amber-600 border-amber-100", onClick: () => nav("/shopify/orders") },
                  { label: "Riders", icon: Bike, bg: "bg-indigo-50 text-indigo-600 border-indigo-100", onClick: () => nav("/logistics/riders") },
                  { label: "Confirm", icon: CheckCircle2, bg: "bg-sky-50 text-sky-600 border-sky-100", onClick: () => nav("/logistics/confirmations") },
                ].map(btn => (
                  <button key={btn.label} onClick={btn.onClick} className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-2 rounded-xl border ${btn.bg} hover:opacity-80 transition-opacity`}>
                    <btn.icon className="w-3.5 h-3.5" /> {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation info */}
            {isWa && waConv && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Conversation</p>
                <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2.5">
                  {[
                    { label: "Channel",    value: <ChannelBadge channel="whatsapp" /> },
                    { label: "Bot mode",   value: <BotBadge mode={waConv.botMode} /> },
                    { label: "Status",     value: <span className="text-xs text-gray-700 font-semibold capitalize">{waConv.status ?? "open"}</span> },
                    ...(waConv.agentName ? [{ label: "Agent", value: <span className="text-xs text-gray-700 font-semibold">{waConv.agentName}</span> }] : []),
                    { label: "Last active", value: <span className="text-xs text-gray-700 font-semibold">{timeAgo(conv.lastAt)}</span> },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-400">{row.label}</span>
                      {row.value}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isWa && webSession && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Session</p>
                <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">Messages</span>
                    <span className="text-xs font-semibold text-gray-700">{(webSession.messages ?? []).length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">Last active</span>
                    <span className="text-xs font-semibold text-gray-700">{timeAgo(conv.lastAt)}</span>
                  </div>
                </div>
                <button onClick={() => nav("/chat-conversations")} className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs bg-blue-50 text-blue-600 px-3 py-2 rounded-xl hover:bg-blue-100 font-semibold">
                  <ArrowRight className="w-3 h-3" /> Full Chat History
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
  const [channel,    setChannel]    = useState<Channel>("all");
  const [selected,   setSelected]   = useState<UnifiedConv | null>(null);
  const [showRight,  setShowRight]  = useState(true);

  return (
    <div className="flex flex-col h-full bg-gray-50 p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-[#25D366]" />
            WA Chat
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Unified inbox · WhatsApp + Website · Orders · Templates</p>
        </div>
        <button onClick={() => setShowRight(s => !s)}
          className={`p-2 rounded-xl border transition-colors ${showRight ? "border-[#25D366] bg-[#25D366]/5 text-[#25D366]" : "border-gray-200 hover:bg-gray-50 text-gray-500"}`}
          title="Toggle customer panel">
          <Eye className="w-4 h-4" />
        </button>
      </div>

      <StatsBar />

      <div className="flex-1 flex rounded-2xl overflow-hidden border border-gray-200 shadow-sm min-h-0">
        <div className="w-[270px] shrink-0 flex flex-col overflow-hidden">
          <ConvList selected={selected} onSelect={setSelected} channel={channel} onChannelChange={setChannel} />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <ConvThread conv={selected} />
        </div>
        {showRight && (
          <div className="w-[280px] shrink-0 overflow-hidden">
            <CustomerPanel conv={selected} />
          </div>
        )}
      </div>
    </div>
  );
}
