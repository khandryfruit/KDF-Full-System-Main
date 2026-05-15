import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Target, Users, ShoppingCart, Sparkles, Send, MessageCircle,
  Crown, Star, UserMinus, UserX, AlertTriangle, TrendingUp, Clock,
  CheckCircle, X, Loader2, Zap, Gift, BarChart2,
  ArrowRight, Package, Phone, RefreshCw, Mail,
  ChevronRight, ChevronDown, Repeat2, UserPlus, Activity, TestTube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { adminApiUrl } from "@/lib/apiBase";

function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(adminApiUrl(path), {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

type Tab = "overview" | "retargeting" | "carts" | "ai" | "tracking";

const PLAYS = [
  {
    id: "one_time", title: "Win Back One-Time Buyers",
    desc: "Customers who ordered once and never returned. A targeted offer often brings them back.",
    icon: Repeat2, color: "bg-blue-50 text-blue-600 border-blue-100", badgeColor: "bg-blue-100 text-blue-700", segKey: "oneTime",
    template: `Hi {name}! 🥜\n\nWe noticed you tried KDF NUTS once — we hope you loved it!\n\nTo welcome you back, here's an exclusive 15% discount:\n🎁 Code: COMEBACK15\n\nShop fresh premium dry fruits: kdfnuts.com`,
    goal: "Encourage 2nd purchase",
  },
  {
    id: "at_risk", title: "Re-engage At-Risk Customers",
    desc: "Repeat buyers who haven't ordered in 30-90 days. Act before they go to a competitor.",
    icon: AlertTriangle, color: "bg-amber-50 text-amber-600 border-amber-100", badgeColor: "bg-amber-100 text-amber-700", segKey: "atRisk",
    template: `Hi {name}! 👋\n\nWe miss you at KDF NUTS! 🥜\n\nIt's been a while since your last order. We've stocked up on fresh dry fruits:\n\n🎁 20% OFF — Code: MISSYOU20\n\nCome back: kdfnuts.com`,
    goal: "Prevent churn",
  },
  {
    id: "inactive_60d", title: "Reactivate Inactive Customers",
    desc: "Customers who haven't ordered in 60+ days. A strong offer can reignite their interest.",
    icon: Clock, color: "bg-orange-50 text-orange-600 border-orange-100", badgeColor: "bg-orange-100 text-orange-700", segKey: "inactive60d",
    template: `Hi {name}! 🌟\n\nIt's been 2 months since your last KDF NUTS order.\n\nWe've added new dry fruits and exotic nuts you'll love!\n\n🎁 Special offer — 20% OFF:\nCode: BACK20\n\n👉 kdfnuts.com`,
    goal: "Reactivate lapsed customers",
  },
  {
    id: "lost", title: "Recover Lost Customers",
    desc: "Customers who haven't ordered in 180+ days. A bold offer is needed to win them back.",
    icon: UserX, color: "bg-red-50 text-red-600 border-red-100", badgeColor: "bg-red-100 text-red-700", segKey: "lost",
    template: `Hi {name}! 💚\n\nWe haven't seen you at KDF NUTS in a long time and we really miss you!\n\nAs a special gesture, 25% OFF on your next order:\n\n🎁 Code: RETURN25\n\nWe've improved a lot — come see what's new!\n👉 kdfnuts.com`,
    goal: "Reactivation campaign",
  },
  {
    id: "vip", title: "Reward VIP Customers",
    desc: "Top spenders (PKR 15K+). Keep them loyal with exclusive perks.",
    icon: Star, color: "bg-yellow-50 text-yellow-600 border-yellow-100", badgeColor: "bg-yellow-100 text-yellow-700", segKey: "vip",
    template: `Hi {name}! ⭐\n\nYou're one of KDF NUTS' most valued customers and we truly appreciate you.\n\nAs a VIP thank-you, here's an exclusive 20% discount:\n\n🎁 Code: VIP20\n\nShop the finest dry fruits: kdfnuts.com`,
    goal: "Upsell + retention",
  },
];

const SPREAD_OPTIONS = [
  { label: "Send Now", value: 0 },
  { label: "Over 2 hours", value: 2 },
  { label: "Over 6 hours", value: 6 },
  { label: "Over 12 hours", value: 12 },
  { label: "Over 24 hours", value: 24 },
];

export default function ShopifyMarketingPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");

  /* Campaign modal */
  const [campaignTarget, setCampaignTarget] = useState<{ segment: string; label: string; type: "wa" | "email" } | null>(null);
  const [campaignMsg, setCampaignMsg] = useState("");
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignStep, setCampaignStep] = useState<"compose" | "confirm">("compose");
  const [discountCode, setDiscountCode] = useState("");
  const [spreadHours, setSpreadHours] = useState(0);

  /* Cart remind modal */
  const [cartTarget, setCartTarget] = useState<any>(null);
  const [cartMsg, setCartMsg] = useState("");
  const [cartPage, setCartPage] = useState(1);
  const [expandedCarts, setExpandedCarts] = useState<Set<number>>(new Set());
  const [cartDiscounts, setCartDiscounts] = useState<Record<number, { type: string; percent: number; code: string }>>({});
  const [cartDiscountCustom, setCartDiscountCustom] = useState<Record<number, string>>({});

  /* AI generator */
  const [aiSegment, setAiSegment] = useState("inactive_60d");
  const [aiType, setAiType] = useState<"wa" | "email">("wa");
  const [aiMsg, setAiMsg] = useState("");
  const [aiSubject, setAiSubject] = useState("");
  const [aiDiscount, setAiDiscount] = useState("");
  const [aiSpread, setAiSpread] = useState(0);

  /* Test email */
  const [testEmailTo, setTestEmailTo] = useState("");

  /* ── Queries ── */
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["marketing-summary"],
    queryFn: () => api("/admin/shopify/marketing/summary").then(r => r.json()),
    staleTime: 15_000,
    refetchInterval: tab === "carts" ? 15_000 : 60_000,
  });

  const { data: queueStats, isLoading: queueLoading, refetch: refetchQueue } = useQuery({
    queryKey: ["marketing-queue-stats"],
    queryFn: () => api("/admin/shopify/marketing/queue/stats").then(r => r.json()),
    enabled: tab === "tracking",
    staleTime: 15_000,
    refetchInterval: tab === "tracking" ? 15_000 : false,
  });

  const { data: cartsData, isLoading: cartsLoading } = useQuery({
    queryKey: ["abandoned-carts", cartPage],
    queryFn: () => api(`/abandoned-checkouts?status=active&page=${cartPage}&limit=15`).then(r => r.json()),
    enabled: tab === "carts",
    staleTime: 10_000,
    refetchInterval: tab === "carts" ? 15_000 : false,
  });

  /* ── Mutations ── */
  const campaignMutation = useMutation({
    mutationFn: () => {
      if (campaignTarget?.type === "email") {
        return api("/admin/shopify/marketing/campaign/email", {
          method: "POST",
          body: JSON.stringify({ subject: campaignSubject, message: campaignMsg + (discountCode ? `\n\n🎁 Code: ${discountCode}` : ""), segment: campaignTarget?.segment, spreadHours }),
        }).then(r => r.json());
      }
      return api("/admin/shopify/customers/campaign/whatsapp", {
        method: "POST",
        body: JSON.stringify({ message: campaignMsg + (discountCode ? `\n\n🎁 Code: ${discountCode}` : ""), segment: campaignTarget?.segment, spreadHours }),
      }).then(r => r.json());
    },
    onSuccess: (d) => {
      setCampaignTarget(null); setCampaignMsg(""); setCampaignSubject(""); setCampaignStep("compose"); setDiscountCode(""); setSpreadHours(0);
      toast({ title: `Campaign queued for ${d.targeting} customers` });
    },
    onError: () => toast({ title: "Campaign failed", variant: "destructive" }),
  });

  const aiMsgMutation = useMutation({
    mutationFn: () => api("/admin/shopify/customers/ai-message", {
      method: "POST",
      body: JSON.stringify({ segment: campaignTarget?.segment ?? aiSegment }),
    }).then(r => r.json()),
    onSuccess: (d) => { if (d.message) setCampaignMsg(d.message); },
    onError: () => toast({ title: "AI generation failed", variant: "destructive" }),
  });

  const aiGenerateMutation = useMutation({
    mutationFn: () => api("/admin/shopify/customers/ai-message", {
      method: "POST",
      body: JSON.stringify({ segment: aiSegment }),
    }).then(r => r.json()),
    onSuccess: (d) => { if (d.message) setAiMsg(d.message); },
    onError: () => toast({ title: "AI generation failed", variant: "destructive" }),
  });

  const aiCampaignSendMutation = useMutation({
    mutationFn: () => {
      const fullMsg = aiMsg + (aiDiscount ? `\n\n🎁 Discount Code: ${aiDiscount}` : "");
      if (aiType === "email") {
        return api("/admin/shopify/marketing/campaign/email", {
          method: "POST",
          body: JSON.stringify({ subject: aiSubject || "Special offer from KDF NUTS", message: fullMsg, segment: aiSegment, spreadHours: aiSpread }),
        }).then(r => r.json());
      }
      return api("/admin/shopify/customers/campaign/whatsapp", {
        method: "POST",
        body: JSON.stringify({ message: fullMsg, segment: aiSegment, spreadHours: aiSpread }),
      }).then(r => r.json());
    },
    onSuccess: (d) => {
      setAiMsg(""); setAiDiscount(""); setAiSubject("");
      toast({ title: `Campaign queued for ${d.targeting} customers` });
    },
    onError: () => toast({ title: "Send failed", variant: "destructive" }),
  });

  const queryClient = useQueryClient();

  const shopifyAbandonedSyncMutation = useMutation({
    mutationFn: () =>
      api("/admin/shopify/sync/abandoned-checkouts", { method: "POST" }).then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        return j as {
          success?: boolean;
          upserted?: number;
          pages?: number;
          error?: string;
          hint?: string;
          source?: string;
          apiVersion?: string;
          adminHost?: string;
        };
      }),
    onSuccess: d => {
      const upserted = d.upserted ?? 0;
      const hasIssue = d.success === false || Boolean(d.error && upserted === 0);
      const desc = [
        `${d.source ? `Channel: ${d.source}` : "Sync"} · Admin API ${d.apiVersion ?? "—"} · ${d.adminHost ?? "—"}`,
        `${upserted} row(s) upserted · ${d.pages ?? 0} page(s)`,
        d.error ? `Details: ${d.error}` : "",
        d.hint ? d.hint : "",
      ]
        .filter(Boolean)
        .join("\n");
      toast({
        title: hasIssue ? "Shopify sync needs attention" : "Shopify abandoned carts synced",
        description: desc,
        variant: hasIssue ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["abandoned-carts"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-summary"] });
    },
    onError: (e: Error) => toast({ title: "Shopify sync failed", description: e.message, variant: "destructive" }),
  });

  const cartNotifyWaMutation = useMutation({
    mutationFn: ({ id, discountPercent, discountCode: dc, customMessage }: { id: number; discountPercent?: number; discountCode?: string; customMessage?: string }) =>
      api(`/abandoned-checkouts/${id}/notify/whatsapp`, { method: "POST", body: JSON.stringify({ customMessage, discountPercent, discountCode: dc }) }).then(r => r.json()),
    onSuccess: () => { setCartTarget(null); setCartMsg(""); toast({ title: "WhatsApp reminder sent!" }); queryClient.invalidateQueries({ queryKey: ["abandoned-carts"] }); },
    onError: (e: any) => toast({ title: `WA failed: ${e?.message ?? "Unknown"}`, variant: "destructive" }),
  });

  const cartNotifyEmailMutation = useMutation({
    mutationFn: ({ id, discountPercent, discountCode: dc }: { id: number; discountPercent?: number; discountCode?: string }) =>
      api(`/abandoned-checkouts/${id}/notify/email`, { method: "POST", body: JSON.stringify({ discountPercent, discountCode: dc }) }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Email reminder sent!" }); queryClient.invalidateQueries({ queryKey: ["abandoned-carts"] }); },
    onError: (e: any) => toast({ title: `Email failed: ${e?.message ?? "Unknown"}`, variant: "destructive" }),
  });

  const cartNotifyBothMutation = useMutation({
    mutationFn: ({ id, discountPercent, discountCode: dc }: { id: number; discountPercent?: number; discountCode?: string }) =>
      api(`/abandoned-checkouts/${id}/notify/both`, { method: "POST", body: JSON.stringify({ discountPercent, discountCode: dc }) }).then(r => r.json()),
    onSuccess: (d) => { toast({ title: `Both sent! WA: ${d.results?.whatsapp}, Email: ${d.results?.email}` }); queryClient.invalidateQueries({ queryKey: ["abandoned-carts"] }); },
    onError: (e: any) => toast({ title: `Send failed: ${e?.message ?? "Unknown"}`, variant: "destructive" }),
  });

  const cartAiDiscountMutation = useMutation({
    mutationFn: (id: number) => api(`/abandoned-checkouts/${id}/ai-discount`).then(r => r.json()),
    onSuccess: (d, id) => {
      setCartDiscounts(prev => ({ ...prev, [id]: { type: "ai", percent: d.percent, code: d.code } }));
      toast({ title: `AI suggests ${d.percent}% OFF — Code: ${d.code}`, description: d.reason });
    },
    onError: () => toast({ title: "AI discount failed", variant: "destructive" }),
  });

  const cartNotifyMutation = useMutation({
    mutationFn: ({ id, customMessage }: { id: number; customMessage?: string }) =>
      api(`/abandoned-checkouts/${id}/notify/whatsapp`, { method: "POST", body: JSON.stringify({ customMessage }) }).then(r => r.json()),
    onSuccess: () => { setCartTarget(null); setCartMsg(""); toast({ title: "WhatsApp reminder sent!" }); },
    onError: () => toast({ title: "Failed to send reminder", variant: "destructive" }),
  });

  const testEmailMutation = useMutation({
    mutationFn: () => api("/admin/shopify/marketing/test-email", { method: "POST", body: JSON.stringify({ to: testEmailTo }) }).then(r => r.json()),
    onSuccess: (d) => toast({ title: d.message ?? "Test email sent!" }),
    onError: (e: any) => toast({ title: `Failed: ${e?.message ?? "Unknown error"}`, variant: "destructive" }),
  });

  /* ── Helpers ── */
  const segs = summary?.segments ?? {};
  const carts = summary?.abandonedCarts ?? {};
  const campaigns = summary?.campaigns ?? {};

  const openPlay = (play: typeof PLAYS[0]) => {
    setCampaignTarget({ segment: play.id, label: play.title, type: "wa" });
    setCampaignMsg(play.template);
    setCampaignStep("compose");
    setDiscountCode("");
    setSpreadHours(0);
  };

  const openCustomSegment = (segment: string, label: string, type: "wa" | "email" = "wa") => {
    setCampaignTarget({ segment, label, type });
    setCampaignMsg("");
    setCampaignSubject("");
    setCampaignStep("compose");
    setDiscountCode("");
    setSpreadHours(0);
  };

  const segCount = (key: string) => ((segs as any)[key] ?? 0) as number;

  const OVERVIEW_CARDS = [
    { key: "total",      label: "Total Customers",       icon: Users,        color: "text-blue-600 bg-blue-50",    seg: "all" },
    { key: "vip",        label: "VIP (PKR 15K+)",        icon: Star,         color: "text-yellow-600 bg-yellow-50", seg: "vip" },
    { key: "highValue",  label: "High Value (PKR 5K+)",  icon: Crown,        color: "text-amber-600 bg-amber-50",  seg: "high_value" },
    { key: "new",        label: "New Customers (30d)",   icon: UserPlus,     color: "text-green-600 bg-green-50",  seg: "new" },
    { key: "oneTime",    label: "One-Time Buyers",       icon: Repeat2,      color: "text-blue-600 bg-blue-50",    seg: "one_time" },
    { key: "atRisk",     label: "At-Risk (30-90d)",      icon: AlertTriangle, color: "text-amber-600 bg-amber-50", seg: "at_risk" },
    { key: "inactive60d", label: "Inactive 60d+",        icon: Clock,        color: "text-orange-600 bg-orange-50", seg: "inactive_60d" },
    { key: "inactive90d", label: "Inactive 90d+",        icon: UserMinus,    color: "text-red-500 bg-red-50",      seg: "inactive_90d" },
    { key: "lost",       label: "Lost (180d+)",          icon: UserX,        color: "text-red-700 bg-red-50",      seg: "lost" },
    { key: "withPhone",  label: "With WhatsApp",         icon: Phone,        color: "text-teal-600 bg-teal-50",    seg: "with_phone" },
  ];

  const TABS: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: "overview",    label: "Overview",        icon: BarChart2 },
    { id: "retargeting", label: "Retargeting",     icon: Target },
    { id: "carts",       label: "Abandoned Carts", icon: ShoppingCart, badge: carts.active },
    { id: "ai",          label: "AI Generator",    icon: Sparkles },
    { id: "tracking",    label: "Tracking",        icon: Activity },
  ];

  /* Queue totals */
  const waStats = queueStats?.whatsapp ?? {};
  const emailStats = queueStats?.email ?? {};
  const totalPending  = (waStats.pending  ?? 0) + (emailStats.pending  ?? 0) + (waStats.sending ?? 0) + (emailStats.sending ?? 0);
  const totalSentAll  = (waStats.sent     ?? 0) + (emailStats.sent     ?? 0);
  const totalFailedAll = (waStats.failed  ?? 0) + (emailStats.failed   ?? 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" /> Marketing Hub
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Segment, retarget, and recover customers with AI-powered campaigns
          </p>
        </div>
        {totalPending > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <strong>{totalPending.toLocaleString()}</strong> messages in queue (sending gradually)
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="ml-1 text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Customers</p>
              <p className="text-3xl font-bold">{summaryLoading ? "…" : (segs.total ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{(segs.withPhone ?? 0).toLocaleString()} with WhatsApp</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Messages Sent</p>
              <p className="text-3xl font-bold">{totalSentAll.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{totalPending > 0 ? `${totalPending} pending` : `${totalFailedAll} failed`}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 border-l-2 border-l-red-400">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Abandoned Carts</p>
              <p className="text-3xl font-bold text-red-600">{(carts.active ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">PKR {((carts.activeValue ?? 0) as number).toLocaleString()} at risk</p>
            </div>
          </div>

          <div>
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" /> Customer Segments
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {OVERVIEW_CARDS.map(({ key, label, icon: Icon, color, seg }) => (
                <div key={key} className="bg-card border border-border rounded-xl p-4 hover:shadow-sm transition-shadow">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-2xl font-bold">{summaryLoading ? "…" : segCount(key).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{label}</p>
                  <div className="flex gap-1 mt-2">
                    <button onClick={() => openCustomSegment(seg, label, "wa")}
                      className="flex-1 text-[10px] text-green-700 hover:underline flex items-center gap-0.5 justify-center bg-green-50 rounded px-1 py-0.5">
                      <MessageCircle className="w-2.5 h-2.5" /> WA
                    </button>
                    <button onClick={() => openCustomSegment(seg, label, "email")}
                      className="flex-1 text-[10px] text-blue-700 hover:underline flex items-center gap-0.5 justify-center bg-blue-50 rounded px-1 py-0.5">
                      <Mail className="w-2.5 h-2.5" /> Email
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Quick Retargeting Actions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLAYS.slice(0, 4).map(play => (
                <div key={play.id} className={`border rounded-xl p-4 flex items-center gap-4 ${play.color}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${play.badgeColor}`}>
                    <play.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{play.title}</p>
                    <p className="text-xs opacity-80 mt-0.5">{segCount(play.segKey).toLocaleString()} customers</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openPlay(play)} className="gap-1.5 shrink-0">
                    <Send className="w-3.5 h-3.5" /> Target
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ RETARGETING ══ */}
      {tab === "retargeting" && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 flex items-start gap-2">
            <Target className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Each retargeting play targets a specific customer behavior. Messages are sent gradually via the queue to avoid rate limits.</span>
          </div>
          {PLAYS.map(play => (
            <div key={play.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border ${play.color}`}>
                  <play.icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{play.title}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${play.badgeColor}`}>
                      {summaryLoading ? "…" : segCount(play.segKey).toLocaleString()} customers
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{play.desc}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openPlay(play)} className="gap-1.5 shrink-0">
                  <Send className="w-3.5 h-3.5 text-[#25D366]" /> Send Campaign
                </Button>
              </div>
              <div className="px-5 py-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">WhatsApp Template Preview</p>
                <div className="bg-[#25D366]/5 border border-[#25D366]/20 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-line">
                  {play.template.replace(/\{name\}/g, "Ahmed")}
                </div>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Gift className="w-3 h-3" /> Goal: {play.goal}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ ABANDONED CARTS ══ */}
      {tab === "carts" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground max-w-xl">
              This tab auto-refreshes every 15 seconds. Use sync to pull the latest abandoned checkouts from Shopify immediately (REST backfill).
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 shrink-0"
              disabled={shopifyAbandonedSyncMutation.isPending}
              onClick={() => shopifyAbandonedSyncMutation.mutate()}
            >
              {shopifyAbandonedSyncMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sync from Shopify
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Active Carts", value: carts.active ?? 0, sub: `PKR ${((carts.activeValue ?? 0) as number).toLocaleString()} at risk`, color: "text-red-600" },
              { label: "Recovered", value: carts.recovered ?? 0, sub: "Completed checkout", color: "text-green-600" },
              { label: "Recovery Rate", value: `${(carts.active ?? 0) + (carts.recovered ?? 0) > 0 ? Math.round(((carts.recovered ?? 0) / ((carts.active ?? 0) + (carts.recovered ?? 0))) * 100) : 0}%`, sub: "Conversion rate", color: "text-blue-600" },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs font-semibold mt-1">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.sub}</p>
              </div>
            ))}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span><strong>Recovery tip:</strong> Send a WhatsApp reminder within 1 hour. Include product details and a small discount for best results.</span>
          </div>
          {cartsLoading ? <div className="p-8 text-center text-muted-foreground">Loading carts…</div>
            : (cartsData?.checkouts?.length ?? 0) === 0 ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center">
                <ShoppingCart className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">No active abandoned carts</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <h3 className="font-semibold">Active Abandoned Carts</h3>
                  <span className="text-xs text-muted-foreground">{cartsData?.total ?? 0} total</span>
                </div>
                <div className="divide-y divide-border">
                  {cartsData?.checkouts?.map((cart: any) => {
                    const disc = cartDiscounts[cart.id];
                    const discPct = disc ? disc.percent : 0;
                    const discCode = disc ? disc.code : "";
                    const isExpanded = expandedCarts.has(cart.id);
                    const items: any[] = cart.cartItems ?? [];
                    const subtotal = parseFloat(cart.subtotal ?? "0");
                    const finalTotal = discPct > 0 ? subtotal * (1 - discPct / 100) : subtotal;

                    /* Status badge */
                    const statusBadge = (() => {
                      if (cart.status === "recovered") return <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"><CheckCircle className="w-2.5 h-2.5" /> Recovered</span>;
                      if (cart.whatsappSent && cart.emailSent) return <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">WA+Email Sent</span>;
                      if (cart.whatsappSent) return <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"><MessageCircle className="w-2.5 h-2.5" /> WA Sent</span>;
                      if (cart.emailSent) return <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"><Mail className="w-2.5 h-2.5" /> Email Sent</span>;
                      return <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Pending</span>;
                    })();

                    return (
                      <div key={cart.id} className="px-5 py-4 space-y-3">
                        {/* ── Row Header ── */}
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                            <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm">{cart.customerName ?? "Unknown"}</p>
                              {statusBadge}
                              {cart.reminderCount > 0 && (
                                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{cart.reminderCount}× reminded</span>
                              )}
                              {cart.discountApplied && (
                                <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"><Gift className="w-2.5 h-2.5" />{cart.discountApplied}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              {cart.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{cart.phone}</span>}
                              {cart.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{cart.email}</span>}
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(cart.lastActivity).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-sm text-primary">PKR {subtotal.toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{cart.checkoutStep} · {items.length} item{items.length !== 1 ? "s" : ""}</p>
                          </div>
                        </div>

                        {/* ── Product List (expandable) ── */}
                        <button
                          onClick={() => setExpandedCarts(prev => { const s = new Set(prev); if (s.has(cart.id)) s.delete(cart.id); else s.add(cart.id); return s; })}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          {isExpanded ? "Hide" : "Show"} items
                        </button>
                        {isExpanded && (
                          <div className="rounded-lg border border-border overflow-hidden text-xs">
                            <table className="w-full">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Product</th>
                                  <th className="text-center px-3 py-2 text-muted-foreground font-medium">Qty</th>
                                  <th className="text-right px-3 py-2 text-muted-foreground font-medium">Price</th>
                                  <th className="text-right px-3 py-2 text-muted-foreground font-medium">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {items.map((item: any, i: number) => {
                                  const lineTotal = parseFloat(item.price ?? "0") * (item.qty ?? 1);
                                  return (
                                    <tr key={i} className="bg-card">
                                      <td className="px-3 py-2">
                                        <p className="font-medium">{item.name}</p>
                                        {item.variantLabel && <p className="text-muted-foreground">{item.variantLabel}</p>}
                                      </td>
                                      <td className="px-3 py-2 text-center text-muted-foreground">×{item.qty}</td>
                                      <td className="px-3 py-2 text-right text-muted-foreground">PKR {parseFloat(item.price ?? "0").toLocaleString()}</td>
                                      <td className="px-3 py-2 text-right font-semibold">PKR {lineTotal.toLocaleString()}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot className="bg-muted/50">
                                {discPct > 0 && (
                                  <tr>
                                    <td colSpan={3} className="px-3 py-1.5 text-right text-red-600">Discount ({discPct}%)</td>
                                    <td className="px-3 py-1.5 text-right text-red-600 font-semibold">-PKR {(subtotal * discPct / 100).toLocaleString()}</td>
                                  </tr>
                                )}
                                <tr>
                                  <td colSpan={3} className="px-3 py-2 text-right font-bold">Total</td>
                                  <td className="px-3 py-2 text-right font-bold text-primary">PKR {finalTotal.toLocaleString()}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}

                        {/* ── Discount Selector ── */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground font-medium">Discount:</span>
                          {["none", "5", "10", "15", "20"].map(opt => (
                            <button key={opt} onClick={() => {
                              if (opt === "none") { setCartDiscounts(prev => { const n = { ...prev }; delete n[cart.id]; return n; }); }
                              else { setCartDiscounts(prev => ({ ...prev, [cart.id]: { type: "manual", percent: parseInt(opt), code: `CART${opt}` } })); }
                            }} className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${disc?.percent === parseInt(opt) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                              {opt === "none" ? "None" : `${opt}%`}
                            </button>
                          ))}
                          <button
                            onClick={() => cartAiDiscountMutation.mutate(cart.id)}
                            disabled={cartAiDiscountMutation.isPending}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors flex items-center gap-1 ${disc?.type === "ai" ? "bg-purple-600 text-white border-purple-600" : "border-purple-300 text-purple-600 hover:bg-purple-50"}`}
                          >
                            {cartAiDiscountMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            AI Suggest
                          </button>
                          {disc && disc.percent > 0 && (
                            <span className="text-[11px] text-muted-foreground">→ Code: <strong>{disc.code}</strong></span>
                          )}
                        </div>

                        {/* ── Action Buttons ── */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {cart.phone && (
                            <Button size="sm" variant="outline"
                              className="gap-1.5 text-[#25D366] border-[#25D366]/30 hover:bg-green-50 text-xs h-7"
                              disabled={cartNotifyWaMutation.isPending}
                              onClick={() => cartNotifyWaMutation.mutate({ id: cart.id, discountPercent: discPct || undefined, discountCode: discCode || undefined })}>
                              {cartNotifyWaMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageCircle className="w-3 h-3" />}
                              Send WA
                            </Button>
                          )}
                          {cart.email && (
                            <Button size="sm" variant="outline"
                              className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 text-xs h-7"
                              disabled={cartNotifyEmailMutation.isPending}
                              onClick={() => cartNotifyEmailMutation.mutate({ id: cart.id, discountPercent: discPct || undefined, discountCode: discCode || undefined })}>
                              {cartNotifyEmailMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                              Send Email
                            </Button>
                          )}
                          {(cart.phone || cart.email) && (
                            <Button size="sm" variant="outline"
                              className="gap-1.5 text-purple-600 border-purple-200 hover:bg-purple-50 text-xs h-7"
                              disabled={cartNotifyBothMutation.isPending}
                              onClick={() => cartNotifyBothMutation.mutate({ id: cart.id, discountPercent: discPct || undefined, discountCode: discCode || undefined })}>
                              {cartNotifyBothMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                              Send Both
                            </Button>
                          )}
                          <Button size="sm" variant="ghost"
                            className="gap-1.5 text-muted-foreground text-xs h-7 ml-auto"
                            onClick={() => { setCartTarget(cart); setCartMsg(""); }}>
                            Custom Message
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {(cartsData?.totalPages ?? 1) > 1 && (
                  <div className="px-5 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span>Page {cartPage} of {cartsData?.totalPages}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setCartPage(p => Math.max(1, p - 1))} disabled={cartPage === 1}>← Prev</Button>
                      <Button size="sm" variant="outline" onClick={() => setCartPage(p => Math.min(cartsData?.totalPages ?? 1, p + 1))} disabled={cartPage === (cartsData?.totalPages ?? 1)}>Next →</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>
      )}

      {/* ══ AI GENERATOR ══ */}
      {tab === "ai" && (
        <div className="space-y-5">
          <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-xs text-purple-800 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-purple-600" />
            <span>AI generates a personalized message for the selected segment. Messages are sent gradually via the queue to avoid rate limits.</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left: Inputs */}
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><Target className="w-4 h-4 text-primary" />Campaign Setup</h3>

                {/* Channel */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Channel</label>
                  <div className="flex gap-2">
                    {[{ v: "wa", label: "WhatsApp", icon: MessageCircle, color: "text-[#25D366]" }, { v: "email", label: "Email", icon: Mail, color: "text-blue-600" }].map(ch => (
                      <button key={ch.v} onClick={() => setAiType(ch.v as any)}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${aiType === ch.v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"}`}>
                        <ch.icon className={`w-4 h-4 ${aiType === ch.v ? "" : ch.color}`} />
                        {ch.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Segment */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Target Segment</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { v: "one_time",     l: "One-Time Buyers",  k: "oneTime" },
                      { v: "at_risk",      l: "At-Risk",          k: "atRisk" },
                      { v: "inactive_60d", l: "Inactive 60d+",    k: "inactive60d" },
                      { v: "lost",         l: "Lost (180d+)",     k: "lost" },
                      { v: "vip",          l: "VIP Customers",    k: "vip" },
                      { v: "high_value",   l: "High Value",       k: "highValue" },
                      { v: "repeat",       l: "Repeat Buyers",    k: "repeat" },
                      { v: "new",          l: "New Customers",    k: "new" },
                    ].map(s => (
                      <button key={s.v} onClick={() => setAiSegment(s.v)}
                        className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${aiSegment === s.v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"}`}>
                        <span className="font-medium">{s.l}</span>
                        <span className={`block text-[10px] mt-0.5 ${aiSegment === s.v ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {summaryLoading ? "…" : segCount(s.k).toLocaleString()} customers
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Email subject (only for email) */}
                {aiType === "email" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Email Subject</label>
                    <Input placeholder="e.g. Special offer just for you" value={aiSubject} onChange={e => setAiSubject(e.target.value)} className="text-sm" />
                  </div>
                )}

                {/* Discount */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Discount Code (optional)</label>
                  <div className="flex gap-2">
                    <Input placeholder="e.g. KDFSPECIAL15" value={aiDiscount} onChange={e => setAiDiscount(e.target.value)} className="text-sm" />
                    <Button variant="outline" size="sm" onClick={() => setAiDiscount(`KDF${Math.floor(Math.random()*90+10)}`)}>
                      <Gift className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Spread */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Send Schedule</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SPREAD_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => setAiSpread(o.value)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${aiSpread === o.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Button className="w-full gap-2" onClick={() => aiGenerateMutation.mutate()} disabled={aiGenerateMutation.isPending}>
                  {aiGenerateMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4" />Generate AI Message</>}
                </Button>
              </div>

              {/* Quick Templates */}
              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-primary" />Quick Templates</h3>
                {[
                  { label: "We Miss You", msg: "Hi {name}! 💚\n\nIt's been a while since your last KDF NUTS order. We miss you!\n\nCome back and get 20% OFF with code: MISSYOU20\n\n👉 kdfnuts.com" },
                  { label: "Second Order Nudge", msg: "Hi {name}! 🥜\n\nLoved your first order? Ready for more?\n\nGet 15% OFF your second order with code: SECOND15\n\n👉 kdfnuts.com" },
                  { label: "Seasonal Festival", msg: "Hi {name}! 🎉\n\nEid/Festival season is here and KDF NUTS has a special deal for you!\n\n🎁 20% OFF — Code: FEST20\n\nOrder now: kdfnuts.com" },
                ].map(t => (
                  <button key={t.label} onClick={() => setAiMsg(t.msg)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors">
                    <span className="font-medium">{t.label}</span>
                    <span className="block text-muted-foreground mt-0.5 truncate">{t.msg.slice(0, 70)}…</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Preview + Send */}
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    {aiType === "email" ? <Mail className="w-4 h-4 text-blue-600" /> : <MessageCircle className="w-4 h-4 text-[#25D366]" />}
                    Message Preview
                  </h3>
                  <span className="text-xs text-muted-foreground">{aiMsg.length} chars</span>
                </div>
                <textarea
                  className="w-full border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary min-h-[200px]"
                  value={aiMsg}
                  onChange={e => setAiMsg(e.target.value)}
                  placeholder="Generate a message with AI, or pick a quick template on the left, or write your own…"
                />
                {aiDiscount && (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800 flex items-center gap-2">
                    <Gift className="w-3.5 h-3.5" /> Code <strong>{aiDiscount}</strong> will be appended
                  </div>
                )}
                {aiMsg && aiType === "wa" && (
                  <div className="bg-[#25D366]/5 border border-[#25D366]/20 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Preview (sample name: Ahmed)</p>
                    <p className="text-sm whitespace-pre-line text-gray-800">
                      {(aiMsg + (aiDiscount ? `\n\n🎁 Discount Code: ${aiDiscount}` : "")).replace(/\{name\}/gi, "Ahmed")}
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${aiType === "email" ? "bg-blue-100" : "bg-[#25D366]/10"}`}>
                    {aiType === "email" ? <Mail className="w-5 h-5 text-blue-600" /> : <Users className="w-5 h-5 text-[#25D366]" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">
                      {summaryLoading ? "…" : segCount(
                        aiSegment === "one_time" ? "oneTime" : aiSegment === "at_risk" ? "atRisk" :
                        aiSegment === "inactive_60d" ? "inactive60d" : aiSegment === "lost" ? "lost" :
                        aiSegment === "high_value" ? "highValue" : aiSegment
                      ).toLocaleString()} customers targeted
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {aiSpread > 0 ? `Sent gradually over ${aiSpread} hours` : "Sent via queue (immediate)"}
                    </p>
                  </div>
                </div>
                <Button
                  className={`w-full gap-2 ${aiType === "email" ? "bg-blue-600 hover:bg-blue-700" : "bg-[#25D366] hover:bg-[#1ea855]"} text-white`}
                  disabled={!aiMsg.trim() || aiCampaignSendMutation.isPending}
                  onClick={() => aiCampaignSendMutation.mutate()}
                >
                  {aiCampaignSendMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Queuing…</>
                    : aiType === "email"
                      ? <><Send className="w-4 h-4" />Send Email Campaign</>
                      : <><Send className="w-4 h-4" />Send WhatsApp Campaign</>}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ TRACKING ══ */}
      {tab === "tracking" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-primary" />Message Queue & Delivery Tracking</h2>
            <Button size="sm" variant="outline" onClick={() => refetchQueue()} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>

          {/* Channel stats */}
          <div className="grid grid-cols-2 gap-4">
            {/* WhatsApp */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageCircle className="w-5 h-5 text-[#25D366]" />
                <h3 className="font-semibold">WhatsApp</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Sent", value: waStats.sent ?? 0, color: "text-green-600 bg-green-50" },
                  { label: "Pending", value: (waStats.pending ?? 0) + (waStats.sending ?? 0), color: "text-amber-600 bg-amber-50" },
                  { label: "Failed", value: waStats.failed ?? 0, color: "text-red-600 bg-red-50" },
                  { label: "Total", value: Object.values(waStats).reduce((a: any, b: any) => a + b, 0) as number, color: "text-blue-600 bg-blue-50" },
                ].map(s => (
                  <div key={s.label} className={`rounded-lg p-3 text-center ${s.color.split(" ")[1]}`}>
                    <p className={`text-xl font-bold ${s.color.split(" ")[0]}`}>{queueLoading ? "…" : s.value.toLocaleString()}</p>
                    <p className="text-xs font-semibold mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Email */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Mail className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold">Email</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Sent", value: emailStats.sent ?? 0, color: "text-green-600 bg-green-50" },
                  { label: "Pending", value: (emailStats.pending ?? 0) + (emailStats.sending ?? 0), color: "text-amber-600 bg-amber-50" },
                  { label: "Failed", value: emailStats.failed ?? 0, color: "text-red-600 bg-red-50" },
                  { label: "Total", value: Object.values(emailStats).reduce((a: any, b: any) => a + b, 0) as number, color: "text-blue-600 bg-blue-50" },
                ].map(s => (
                  <div key={s.label} className={`rounded-lg p-3 text-center ${s.color.split(" ")[1]}`}>
                    <p className={`text-xl font-bold ${s.color.split(" ")[0]}`}>{queueLoading ? "…" : s.value.toLocaleString()}</p>
                    <p className="text-xs font-semibold mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Test Email */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-3"><TestTube className="w-4 h-4 text-blue-600" />Test Email Configuration</h3>
            <p className="text-xs text-muted-foreground mb-3">Send a test email to verify your SMTP settings are working before launching campaigns.</p>
            <div className="flex gap-2 max-w-md">
              <Input placeholder="your@email.com" type="email" value={testEmailTo} onChange={e => setTestEmailTo(e.target.value)} className="text-sm" />
              <Button variant="outline" onClick={() => testEmailMutation.mutate()} disabled={!testEmailTo.trim() || testEmailMutation.isPending} className="gap-1.5 shrink-0">
                {testEmailMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending…</> : <><Send className="w-3.5 h-3.5" />Send Test</>}
              </Button>
            </div>
          </div>

          {/* Recent messages */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-sm">Recent Message Activity (Last 50)</h3>
            </div>
            {queueLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading activity…</div>
            ) : (queueStats?.recent ?? []).length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No messages in queue yet. Send a campaign to see activity here.</div>
            ) : (
              <div className="divide-y divide-border">
                {(queueStats?.recent ?? []).map((msg: any) => (
                  <div key={msg.id} className="px-5 py-3 flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      msg.status === "sent" ? "bg-green-500" :
                      msg.status === "failed" ? "bg-red-500" :
                      msg.status === "sending" ? "bg-amber-400" : "bg-muted-foreground"
                    }`} />
                    <div className="flex items-center gap-1.5 shrink-0">
                      {msg.campaign_type === "email"
                        ? <Mail className="w-3.5 h-3.5 text-blue-500" />
                        : <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />}
                    </div>
                    <p className="text-sm font-medium truncate flex-1">{msg.customer_name ?? "Unknown"}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      msg.status === "sent" ? "bg-green-100 text-green-700" :
                      msg.status === "failed" ? "bg-red-100 text-red-700" :
                      msg.status === "sending" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
                    }`}>{msg.status}</span>
                    {msg.error_message && (
                      <span className="text-[10px] text-red-500 truncate max-w-[120px]">{msg.error_message}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString() : new Date(msg.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Full sync status info */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 space-y-3">
            <h3 className="font-semibold text-sm text-blue-900 flex items-center gap-2"><RefreshCw className="w-4 h-4" />Shopify Full Sync Status</h3>
            <p className="text-xs text-blue-800">
              The 2,500 record sync limit has been removed. "Sync Orders" and "Sync Customers" now run as unlimited background jobs that fetch all records page by page using Shopify cursor-based pagination — no data is missed.
              Go to <strong>Sync Jobs</strong> to monitor progress and trigger a new full sync.
            </p>
            <a href="/sync-jobs" className="inline-flex items-center gap-1 text-xs text-blue-700 underline hover:text-blue-900">
              Open Sync Jobs <ChevronRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* ══ CAMPAIGN MODAL ══ */}
      {campaignTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card">
              <div>
                <h2 className="font-bold text-lg flex items-center gap-2">
                  {campaignTarget.type === "email" ? <Mail className="w-5 h-5 text-blue-600" /> : <MessageCircle className="w-5 h-5 text-[#25D366]" />}
                  {campaignTarget.label}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {campaignTarget.type === "email" ? "Email campaign" : "WhatsApp campaign"}
                </p>
              </div>
              <button onClick={() => setCampaignTarget(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            {campaignStep === "compose" && (
              <div className="p-5 space-y-4">
                {campaignTarget.type === "email" && (
                  <div>
                    <label className="text-sm font-semibold block mb-1.5">Email Subject</label>
                    <Input placeholder="e.g. Exclusive offer for you" value={campaignSubject} onChange={e => setCampaignSubject(e.target.value)} />
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold">Message</label>
                  <Button size="sm" variant="outline" onClick={() => aiMsgMutation.mutate()}
                    disabled={aiMsgMutation.isPending} className="gap-1.5 text-xs h-7">
                    {aiMsgMutation.isPending ? <><Loader2 className="w-3 h-3 animate-spin" />Generating…</> : <><Sparkles className="w-3 h-3 text-purple-500" />AI Rewrite</>}
                  </Button>
                </div>
                <textarea className="w-full border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary min-h-[180px]"
                  value={campaignMsg} onChange={e => setCampaignMsg(e.target.value)} />
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Discount Code (optional)</label>
                  <Input placeholder="e.g. COMEBACK15" value={discountCode} onChange={e => setDiscountCode(e.target.value)} className="text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Send Schedule</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SPREAD_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => setSpreadHours(o.value)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${spreadHours === o.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button className="flex-1" onClick={() => setCampaignStep("confirm")}
                    disabled={!campaignMsg.trim() || (campaignTarget.type === "email" && !campaignSubject.trim())}>
                    Preview & Confirm →
                  </Button>
                  <Button variant="outline" onClick={() => setCampaignTarget(null)}>Cancel</Button>
                </div>
              </div>
            )}

            {campaignStep === "confirm" && (
              <div className="p-5 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    This will {campaignTarget.type === "email" ? "email" : "WhatsApp"} all matching customers.
                    {spreadHours > 0 ? ` Messages will be spread over ${spreadHours} hours.` : " Messages will be queued for immediate delivery."}
                  </span>
                </div>
                <div className={`border rounded-xl p-4 ${campaignTarget.type === "email" ? "bg-blue-50/30 border-blue-200" : "bg-[#25D366]/5 border-[#25D366]/20"}`}>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Message Preview</p>
                  {campaignTarget.type === "email" && campaignSubject && (
                    <p className="text-xs font-semibold mb-1">Subject: {campaignSubject}</p>
                  )}
                  <p className="text-sm whitespace-pre-line text-gray-800">
                    {(campaignMsg + (discountCode ? `\n\n🎁 Code: ${discountCode}` : "")).replace(/\{name\}/gi, "Ahmed")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    className={`flex-1 gap-1.5 ${campaignTarget.type === "email" ? "bg-blue-600 hover:bg-blue-700" : "bg-[#25D366] hover:bg-[#1ea855]"} text-white`}
                    onClick={() => campaignMutation.mutate()} disabled={campaignMutation.isPending}>
                    {campaignMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Queueing…</> : <><Send className="w-4 h-4" />Confirm & Send</>}
                  </Button>
                  <Button variant="outline" onClick={() => setCampaignStep("compose")}>← Edit</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ CART REMINDER MODAL ══ */}
      {cartTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-bold flex items-center gap-2"><MessageCircle className="w-4 h-4 text-[#25D366]" />Send Cart Recovery Reminder</h3>
              <button onClick={() => setCartTarget(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p><strong>{cartTarget.customerName ?? "Unknown"}</strong> · {cartTarget.phone}</p>
                <p className="text-muted-foreground text-xs">{(cartTarget.cartItems ?? []).length} items · PKR {parseFloat(cartTarget.subtotal ?? "0").toLocaleString()}</p>
              </div>
              <textarea className="w-full border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" rows={6}
                value={cartMsg} onChange={e => setCartMsg(e.target.value)}
                placeholder={`Hi ${cartTarget.customerName ?? "there"}! 👋\n\nYou left items in your cart at KDF NUTS 🛒\n\nComplete your order now!\n👉 kdfnuts.com`} />
              <div className="flex gap-2">
                <Button className="flex-1 bg-[#25D366] hover:bg-[#1ea855] text-white gap-1.5"
                  onClick={() => cartNotifyMutation.mutate({ id: cartTarget.id, customMessage: cartMsg || undefined })}
                  disabled={cartNotifyMutation.isPending}>
                  {cartNotifyMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : <><Send className="w-4 h-4" />Send WhatsApp Reminder</>}
                </Button>
                <Button variant="outline" onClick={() => setCartTarget(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
