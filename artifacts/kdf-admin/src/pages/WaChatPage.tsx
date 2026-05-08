import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle, Search, Send, Bot, User, RefreshCw, CheckCheck, Check,
  Clock, Phone, ShoppingCart, X, Sparkles, Loader2, Package, Circle,
  Inbox, ChevronDown, Filter, Tag, Star, StickyNote, CreditCard,
  BarChart2, Users, MessageSquareDashed, Zap, Globe, ArrowRight,
  MoreVertical, Hash, PhoneCall, ShoppingBag, Truck, Plus, Settings,
  AlertTriangle, TrendingUp, MessageSquare, Archive, Bell, Eye,
  ChevronRight, ExternalLink, Wifi, WifiOff, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function fmtTime(date: string) {
  return new Date(date).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: true });
}

type Channel = "all" | "whatsapp" | "website" | "ai" | "unread" | "active";

interface WaConv {
  id: number;
  customer_phone: string;
  customer_name?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
  bot_mode?: string;
  status?: string;
}

interface ChatSession {
  id: number;
  sessionId: string;
  messages: any[];
  updatedAt: string;
  leadName?: string;
  leadPhone?: string;
}

interface UnifiedConv {
  id: string;
  channel: "whatsapp" | "website";
  name: string;
  phone?: string;
  lastMsg: string;
  lastAt: string;
  unread: number;
  botMode?: string;
  raw: WaConv | ChatSession;
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
  });

  const s = waData?.stats ?? {};
  const activeSessions = sessions.filter(sess => Date.now() - new Date(sess.updatedAt).getTime() < 5 * 60 * 1000).length;

  const stats = [
    { label: "WA Open", value: s.open_conversations ?? 0, icon: MessageCircle, color: "text-[#25D366]", bg: "bg-[#25D366]/10" },
    { label: "Unread WA", value: s.total_unread ?? 0, icon: MessageSquareDashed, color: "text-red-500", bg: "bg-red-50" },
    { label: "Active Web", value: activeSessions, icon: Wifi, color: "text-blue-500", bg: "bg-blue-50" },
    { label: "Bot Today", value: s.bot_replies_today ?? 0, icon: Bot, color: "text-violet-500", bg: "bg-violet-50" },
    { label: "Inbound", value: s.inbound_today ?? 0, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "AI Handles", value: s.bot_replies_today ?? 0, icon: Sparkles, color: "text-amber-600", bg: "bg-amber-50" },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
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

/* ── Channel badge ── */
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

/* ── Bot badge ── */
function BotBadge({ mode }: { mode?: string }) {
  if (mode === "auto") return (
    <span className="inline-flex items-center gap-0.5 text-[8px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded-full font-semibold">
      <Bot className="w-2 h-2" /> Auto
    </span>
  );
  if (mode === "human") return (
    <span className="inline-flex items-center gap-0.5 text-[8px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full font-semibold">
      <User className="w-2 h-2" /> Human
    </span>
  );
  return null;
}

/* ── WA Message status ── */
function StatusIcon({ status }: { status?: string }) {
  if (status === "read") return <CheckCheck className="w-3 h-3 text-[#53bdeb]" />;
  if (status === "delivered") return <CheckCheck className="w-3 h-3 text-gray-400" />;
  if (status === "sent") return <Check className="w-3 h-3 text-gray-400" />;
  return null;
}

/* ── Left Panel: Conversation List ── */
function ConvList({
  selected,
  onSelect,
  channel,
  onChannelChange,
}: {
  selected: UnifiedConv | null;
  onSelect: (c: UnifiedConv) => void;
  channel: Channel;
  onChannelChange: (c: Channel) => void;
}) {
  const [search, setSearch] = useState("");

  const { data: waConvs = [], isLoading: waLoading, refetch: refetchWa } = useQuery<WaConv[]>({
    queryKey: ["wa-convs-unified"],
    queryFn: () => api("/admin/wa/conversations").then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const { data: chatSessions = [], isLoading: sessLoading, refetch: refetchSess } = useQuery<ChatSession[]>({
    queryKey: ["chat-sessions-unified"],
    queryFn: () => api("/admin/chat/sessions").then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const unified: UnifiedConv[] = [
    ...waConvs.map((c): UnifiedConv => ({
      id: `wa-${c.id}`,
      channel: "whatsapp",
      name: c.customer_name || c.customer_phone,
      phone: c.customer_phone,
      lastMsg: c.last_message ?? "",
      lastAt: c.last_message_at ?? "",
      unread: c.unread_count ?? 0,
      botMode: c.bot_mode,
      raw: c,
    })),
    ...chatSessions.map((s): UnifiedConv => {
      const msgs = s.messages ?? [];
      const last = msgs[msgs.length - 1];
      return {
        id: `web-${s.id}`,
        channel: "website",
        name: s.leadName || `Visitor ${s.id}`,
        phone: s.leadPhone,
        lastMsg: last?.content?.slice(0, 80) ?? "",
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
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !(c.phone ?? "").includes(search)) return false;
    return true;
  });

  const tabs: { key: Channel; label: string; icon: any; count?: number }[] = [
    { key: "all", label: "All", icon: Inbox },
    { key: "whatsapp", label: "WA", icon: MessageCircle, count: waConvs.reduce((s, c) => s + (c.unread_count ?? 0), 0) },
    { key: "website", label: "Web", icon: Globe, count: chatSessions.filter(s => isActive({ id: "", channel: "website", name: "", lastMsg: "", lastAt: s.updatedAt, unread: 0, raw: s })).length },
    { key: "ai", label: "AI Bot", icon: Bot },
    { key: "unread", label: "Unread", icon: Bell },
    { key: "active", label: "Active", icon: Activity },
  ];

  const isLoading = waLoading || sessLoading;

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-100">
      {/* Search */}
      <div className="p-3 border-b border-gray-100">
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
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 overflow-x-auto scrollbar-none">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onChannelChange(tab.key)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              channel === tab.key
                ? "bg-[#25D366] text-white"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
            {(tab.count ?? 0) > 0 && (
              <span className={`text-[9px] px-1 py-0.5 rounded-full font-bold ${
                channel === tab.key ? "bg-white/30 text-white" : "bg-red-500 text-white"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => { refetchWa(); refetchSess(); }}
          className="ml-auto p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Count */}
      <div className="px-3 py-1.5 text-[10px] text-gray-400 font-medium border-b border-gray-50">
        {isLoading ? "Loading…" : `${filtered.length} conversation${filtered.length !== 1 ? "s" : ""}`}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-300">
            <MessageSquareDashed className="w-8 h-8 mb-2" />
            <p className="text-xs">No conversations</p>
          </div>
        ) : (
          filtered.map(conv => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv)}
              className={`w-full flex items-start gap-3 px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors text-left ${
                selected?.id === conv.id ? "bg-[#f0fdf4] border-l-2 border-l-[#25D366]" : ""
              }`}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                  conv.channel === "whatsapp" ? "bg-[#25D366]" : "bg-blue-500"
                }`}>
                  {conv.name.charAt(0).toUpperCase()}
                </div>
                {conv.channel === "whatsapp" && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#25D366] rounded-full border border-white flex items-center justify-center">
                    <MessageCircle className="w-2 h-2 text-white" />
                  </div>
                )}
                {conv.channel === "website" && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full border border-white flex items-center justify-center">
                    <Globe className="w-2 h-2 text-white" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-semibold text-gray-800 truncate max-w-[130px]">{conv.name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0 ml-1">{timeAgo(conv.lastAt)}</span>
                </div>
                <div className="flex items-center gap-1 mb-1">
                  <ChannelBadge channel={conv.channel} />
                  <BotBadge mode={conv.botMode} />
                </div>
                <p className="text-xs text-gray-500 truncate">{conv.lastMsg || "No messages yet"}</p>
              </div>

              {/* Unread badge */}
              {conv.unread > 0 && (
                <span className="shrink-0 min-w-[18px] h-[18px] bg-[#25D366] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                  {conv.unread > 99 ? "99+" : conv.unread}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Center Panel: Conversation Thread ── */
function ConvThread({ conv }: { conv: UnifiedConv | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const QUICK_REPLIES = [
    { label: "Greeting", text: "Assalam o Alaikum! 🌟 KDF NUTS mein khush amdeed! Kya help chahiye?" },
    { label: "Order Status", text: "Aap ka order process ho raha hai. Jaldi deliver hoga InshaAllah! 📦" },
    { label: "COD Info", text: "Hum Cash on Delivery (COD) accept karte hain. Payment delivery par karein. 💰" },
    { label: "Delivery", text: "Delivery 2-4 working days mein hoti hai. Lahore mein same/next day available! 🚚" },
    { label: "Thank You", text: "Shukriya! Hum jald connect karenge. KDF NUTS 🙏" },
  ];

  const isWa = conv?.channel === "whatsapp";
  const waId = (isWa && conv) ? parseInt(conv.id.split("-")[1]) : null;
  const webId = (!isWa && conv) ? parseInt(conv.id.split("-")[1]) : null;

  const { data: waMsgs = [], isLoading: waLoading } = useQuery({
    queryKey: ["wa-msgs-unified", waId],
    queryFn: () => api(`/admin/wa/conversations/${waId}/messages`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    enabled: !!waId,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const { data: webSession, isLoading: webLoading } = useQuery({
    queryKey: ["chat-session-unified", webId],
    queryFn: () => api(`/admin/chat/sessions/${webId}`).then(r => r.json()),
    enabled: !!webId,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const messages = isWa ? waMsgs : (webSession?.messages ?? []);
  const isLoading = isWa ? waLoading : webLoading;

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [messages.length]);

  const sendWa = useCallback(async (text: string) => {
    if (!waId || !text.trim()) return;
    setSending(true);
    try {
      const phone = (conv?.raw as WaConv).customer_phone;
      const res = await api("/admin/wa/send", {
        method: "POST",
        body: JSON.stringify({ to: phone, message: text }),
      });
      if (!res.ok) throw new Error("Failed");
      qc.invalidateQueries({ queryKey: ["wa-msgs-unified", waId] });
      qc.invalidateQueries({ queryKey: ["wa-convs-unified"] });
      setMsg("");
      toast({ title: "Sent ✓" });
    } catch {
      toast({ title: "Failed to send", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [waId, conv, qc, toast]);

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
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 shrink-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${
          isWa ? "bg-[#25D366]" : "bg-blue-500"
        }`}>
          {conv.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-gray-900 truncate">{conv.name}</p>
            <ChannelBadge channel={conv.channel} />
            <BotBadge mode={conv.botMode} />
          </div>
          {conv.phone && <p className="text-[11px] text-gray-500">{conv.phone}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {isWa && conv.phone && (
            <a
              href={`https://wa.me/${conv.phone.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-[#25D366] transition-colors"
              title="Open in WhatsApp"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#efeae2]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">No messages</div>
        ) : (
          messages.map((m: any, i: number) => {
            const isMe = m.direction === "outbound" || m.role === "assistant" || m.role === "admin";
            const isBot = m.role === "assistant";
            const text = m.content ?? m.message ?? m.body ?? "";
            const ts = m.created_at ?? m.timestamp ?? m.createdAt ?? "";

            return (
              <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                {!isMe && (
                  <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center mr-2 mt-1 shrink-0">
                    <User className="w-3 h-3 text-gray-600" />
                  </div>
                )}
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                  isMe
                    ? isBot
                      ? "bg-violet-600 text-white rounded-tr-sm"
                      : "bg-[#dcf8c6] text-gray-800 rounded-tr-sm"
                    : "bg-white text-gray-800 rounded-tl-sm"
                }`}>
                  {isBot && (
                    <p className="text-[9px] font-semibold text-violet-300 mb-1 flex items-center gap-1">
                      <Bot className="w-2.5 h-2.5" /> AI Bot
                    </p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] opacity-60">{ts ? fmtTime(ts) : ""}</span>
                    {isMe && !isBot && <StatusIcon status={m.status} />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick replies */}
      {showQuick && isWa && (
        <div className="border-t border-gray-100 bg-white px-3 py-2">
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
            onClick={() => setShowQuick(s => !s)}
            className={`p-2 rounded-lg transition-colors shrink-0 ${showQuick ? "bg-[#25D366]/10 text-[#25D366]" : "hover:bg-gray-100 text-gray-400"}`}
            title="Quick replies"
          >
            <Zap className="w-4 h-4" />
          </button>
          <div className="flex-1 relative">
            <textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendWa(msg); } }}
              placeholder="Type a message…"
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
          <Globe className="w-4 h-4 text-blue-400" />
          <p className="text-xs text-blue-600 font-medium">Website chat — read only. Reply via WhatsApp or escalate.</p>
          {conv.phone && (
            <a
              href={`https://wa.me/${conv.phone.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-xs bg-[#25D366] text-white px-2.5 py-1.5 rounded-lg hover:bg-[#128C7E] transition-colors font-medium flex items-center gap-1"
            >
              <MessageCircle className="w-3 h-3" /> Reply on WA
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Right Panel: Customer Info ── */
function CustomerPanel({ conv }: { conv: UnifiedConv | null }) {
  const [, nav] = useLocation();

  const waId = conv?.channel === "whatsapp" ? parseInt(conv.id.split("-")[1]) : null;

  const { data: lead } = useQuery({
    queryKey: ["chat-lead-by-phone", conv?.phone],
    queryFn: () => api(`/admin/chat/leads?phone=${encodeURIComponent(conv!.phone!)}`).then(r => r.json()).then((d: any) => Array.isArray(d?.leads) ? d.leads[0] : null),
    enabled: !!conv?.phone,
    staleTime: 30_000,
  });

  if (!conv) {
    return (
      <div className="flex items-center justify-center h-full text-gray-300 text-xs">
        No conversation selected
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-50 border-l border-gray-100">
      {/* Customer header */}
      <div className="p-4 bg-white border-b border-gray-100">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto mb-3 ${
          conv.channel === "whatsapp" ? "bg-[#25D366]" : "bg-blue-500"
        }`}>
          {conv.name.charAt(0).toUpperCase()}
        </div>
        <p className="text-center font-bold text-gray-800 text-sm">{conv.name}</p>
        {conv.phone && (
          <p className="text-center text-xs text-gray-500 mt-0.5">{conv.phone}</p>
        )}
        <div className="flex justify-center gap-1.5 mt-2">
          <ChannelBadge channel={conv.channel} />
          <BotBadge mode={conv.botMode} />
        </div>
      </div>

      {/* Quick actions */}
      <div className="p-3 border-b border-gray-100 bg-white">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Quick Actions</p>
        <div className="grid grid-cols-2 gap-1.5">
          {conv.phone && (
            <a
              href={`https://wa.me/${conv.phone.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs bg-[#25D366]/10 text-[#128C7E] px-2.5 py-2 rounded-lg hover:bg-[#25D366]/20 transition-colors font-medium"
            >
              <MessageCircle className="w-3 h-3" /> WA Chat
            </a>
          )}
          <button
            onClick={() => nav("/chat-leads")}
            className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-600 px-2.5 py-2 rounded-lg hover:bg-blue-100 transition-colors font-medium"
          >
            <Users className="w-3 h-3" /> CRM
          </button>
          <button
            onClick={() => nav("/orders")}
            className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-600 px-2.5 py-2 rounded-lg hover:bg-amber-100 transition-colors font-medium"
          >
            <ShoppingCart className="w-3 h-3" /> Orders
          </button>
          <button
            onClick={() => nav("/coupons")}
            className="flex items-center gap-1.5 text-xs bg-violet-50 text-violet-600 px-2.5 py-2 rounded-lg hover:bg-violet-100 transition-colors font-medium"
          >
            <Tag className="w-3 h-3" /> Coupon
          </button>
        </div>
      </div>

      {/* Lead info */}
      {lead && (
        <div className="p-3 border-b border-gray-100 bg-white mt-2">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Lead Info</p>
          <div className="space-y-1.5">
            {lead.name && (
              <div className="flex items-center gap-2">
                <User className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-700">{lead.name}</span>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2">
                <Hash className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-700 truncate">{lead.email}</span>
              </div>
            )}
            {lead.city && (
              <div className="flex items-center gap-2">
                <Truck className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-700">{lead.city}</span>
              </div>
            )}
            {lead.status && (
              <div className="flex items-center gap-2">
                <Circle className="w-3 h-3 text-gray-400" />
                <Badge className="text-[9px] h-4">{lead.status}</Badge>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Channel info */}
      <div className="p-3 mt-2">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Session Info</p>
        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Channel</span>
            <ChannelBadge channel={conv.channel} />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Last active</span>
            <span className="text-gray-700 font-medium">{timeAgo(conv.lastAt)}</span>
          </div>
          {conv.botMode && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Bot mode</span>
              <BotBadge mode={conv.botMode} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════
   MAIN PAGE
══════════════════════════════════ */
export default function WaChatPage() {
  const [channel, setChannel] = useState<Channel>("all");
  const [selected, setSelected] = useState<UnifiedConv | null>(null);
  const [showRight, setShowRight] = useState(true);

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
        {/* Page header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[#25D366]" />
              WA Chat
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Unified inbox — WhatsApp + Website + AI</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRight(s => !s)}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors"
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
          <div className="w-[280px] shrink-0 flex flex-col overflow-hidden">
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

          {/* Right: customer info */}
          {showRight && (
            <div className="w-[240px] shrink-0 overflow-hidden">
              <CustomerPanel conv={selected} />
            </div>
          )}
        </div>
    </div>
  );
}
