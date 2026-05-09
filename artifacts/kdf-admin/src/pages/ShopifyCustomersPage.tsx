import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Search, MessageCircle, Users, ChevronLeft, ChevronRight, X,
  TrendingUp, ShoppingBag, Mail, Phone, Upload, FileText, AlertCircle,
  CheckCircle, Download, Crown, Repeat2, UserMinus, UserPlus, Smartphone,
  MapPin, Zap, Sparkles, Send, Loader2, Star, Tag, Clock,
  Brain, CheckCircle2, XCircle, AlertTriangle, ShieldAlert, Target,
  Flame, Gift, RotateCcw, Bell, Calendar, BarChart3, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

/* ── Segment definitions ── */
const SEGMENTS = [
  { value: "all",        label: "All Customers",     icon: Users,     color: "text-blue-600",   bg: "bg-blue-50",    hint: "everyone" },
  { value: "vip",        label: "VIP (PKR 15K+)",    icon: Crown,     color: "text-yellow-600", bg: "bg-yellow-50",  hint: "highest spenders" },
  { value: "high_value", label: "High Value (5K+)",  icon: Star,      color: "text-amber-600",  bg: "bg-amber-50",   hint: "big buyers" },
  { value: "repeat",     label: "Repeat Buyers",     icon: Repeat2,   color: "text-green-600",  bg: "bg-green-50",   hint: "2+ orders" },
  { value: "new",        label: "New Customers",     icon: UserPlus,  color: "text-indigo-600", bg: "bg-indigo-50",  hint: "last 30 days" },
  { value: "inactive",   label: "Inactive (90d+)",   icon: UserMinus, color: "text-red-500",    bg: "bg-red-50",     hint: "need re-engagement" },
  { value: "with_phone", label: "Has WhatsApp",      icon: Smartphone,color: "text-teal-600",   bg: "bg-teal-50",    hint: "can send WA" },
  { value: "with_email", label: "Has Email",         icon: Mail,      color: "text-violet-600", bg: "bg-violet-50",  hint: "can send email" },
  { value: "marketing",  label: "Marketing Opt-in",  icon: TrendingUp,color: "text-orange-600", bg: "bg-orange-50",  hint: "opted in" },
  { value: "csv",        label: "CSV Imported",      icon: FileText,  color: "text-gray-600",   bg: "bg-gray-50",    hint: "manual import" },
];

/* Segment-specific WA templates */
const SEGMENT_TEMPLATES: Record<string, Array<{ label: string; emoji: string; msg: string }>> = {
  inactive: [
    { label: "Comeback Offer", emoji: "🎁", msg: "Hi {name}! 👋 We miss you at KDF NUTS!\n\nIt's been a while since your last order. Here's a special comeback offer just for you:\n\n🎁 15% OFF your next order!\n💎 Code: COMEBACK15\n\nFresh dry fruits await you: kdfnuts.com 🥜" },
    { label: "New Arrivals", emoji: "✨", msg: "Hi {name}! ✨ Exciting news!\n\nWe've got brand new premium dry fruits just arrived!\n\n🥜 Premium Almonds\n🌰 Kashmir Walnuts\n🍇 Seedless Raisins\n\nOrder now: kdfnuts.com" },
    { label: "Flash Sale", emoji: "⚡", msg: "Hi {name}! ⚡ FLASH SALE - 24 hours only!\n\nUp to 30% OFF all KDF NUTS products!\n\n🏃 Hurry, limited stock!\n🛒 Shop: kdfnuts.com\n\nOffer ends tonight! 🕛" },
    { label: "Personal Check-in", emoji: "💚", msg: "Hi {name}! 💚 Just checking in from KDF NUTS family!\n\nWe noticed you haven't ordered in a while. Is there anything we can help you with?\n\nReply to this message — we're here for you! 🙏" },
  ],
  vip: [
    { label: "VIP Exclusive", emoji: "⭐", msg: "Hi {name}! ⭐ VIP EXCLUSIVE OFFER\n\nAs one of our most valued customers, we have a special gift for you:\n\n👑 25% OFF on premium products\n🎁 Free gift on orders above PKR 3,000\n💎 Code: VIP25\n\nShop now: kdfnuts.com" },
    { label: "Early Access", emoji: "🚀", msg: "Hi {name}! 🚀 VIP Early Access!\n\nBefore we announce publicly — you get FIRST access to our new premium collection!\n\n🥜 Kashmir Premium Walnuts\n🍇 Afghan Raisins\n🌰 Turkish Almonds\n\nOrder now: kdfnuts.com" },
    { label: "Loyalty Reward", emoji: "🏆", msg: "Hi {name}! 🏆 Congratulations!\n\nYou've earned a VIP Loyalty Reward!\n\n🎁 Special discount + free delivery\n💎 Just for being our valued customer\n\nClaim your reward: kdfnuts.com" },
  ],
  repeat: [
    { label: "Loyalty Discount", emoji: "🤝", msg: "Hi {name}! 🤝 Thank you for being a loyal customer!\n\nYour loyalty means everything to us. Here's your exclusive reward:\n\n🎁 20% OFF your next order\n💎 Code: LOYAL20\n\nKeep enjoying premium quality: kdfnuts.com" },
    { label: "Cross-sell", emoji: "🥜", msg: "Hi {name}! 🥜 Since you love our products, you'll love these too!\n\n🌟 New arrivals just for you:\n• Premium Mixed Nuts\n• Organic Dates\n• Iranian Pistachios\n\nExplore: kdfnuts.com" },
    { label: "Refer & Earn", emoji: "🎉", msg: "Hi {name}! 🎉 Share the love!\n\nRefer a friend and BOTH of you get a reward:\n\n👥 Friend gets 10% OFF first order\n🎁 You get PKR 200 credit\n\nShare your referral link: kdfnuts.com/refer" },
  ],
  new: [
    { label: "Welcome Gift", emoji: "🎉", msg: "Hi {name}! 🎉 Welcome to the KDF NUTS family!\n\nThank you for your first order! As a welcome gift:\n\n🎁 10% OFF your next order\n💎 Code: WELCOME10\n\nWe hope you loved the quality!\n\nOrder again: kdfnuts.com" },
    { label: "Product Guide", emoji: "📖", msg: "Hi {name}! 📖 Your KDF NUTS Guide!\n\nWelcome aboard! Here's what makes us special:\n\n✅ 100% Natural, no preservatives\n✅ Direct farm sourcing\n✅ Same-day delivery in Lahore\n\nExplore our full range: kdfnuts.com" },
  ],
  high_value: [
    { label: "Premium Offer", emoji: "💎", msg: "Hi {name}! 💎 Premium Customer Exclusive!\n\nThank you for your generous support. Here's something special:\n\n👑 20% OFF premium range\n🚚 Free express delivery\n💎 Code: PREMIUM20\n\nShop the finest: kdfnuts.com" },
  ],
  with_phone: [
    { label: "Festival Campaign", emoji: "🎊", msg: "Hi {name}! 🎊 Festival Special from KDF NUTS!\n\nCelebrate with premium dry fruits!\n\n🥜 Gift boxes starting from PKR 999\n🎁 Custom packaging available\n🚚 Free delivery on orders above PKR 2,000\n\nOrder now: kdfnuts.com" },
    { label: "Restock Alert", emoji: "🔔", msg: "Hi {name}! 🔔 Back in Stock!\n\nYour favorite products are back:\n\n✅ Premium Almonds\n✅ Cashews\n✅ Mixed Dry Fruit Pack\n\nLimited stock — order before it runs out: kdfnuts.com" },
  ],
  all: [
    { label: "General Offer", emoji: "🎁", msg: "Hi {name}! 🎁 Special offer from KDF NUTS!\n\nEnjoy 15% OFF on all products this week!\n\n💎 Code: KDF15\n🛒 Shop now: kdfnuts.com\n\nFresh, premium quality dry fruits delivered to your door! 🥜" },
    { label: "Festival Sale", emoji: "🎊", msg: "Hi {name}! 🎉 Eid Mubarak from KDF NUTS!\n\nEnjoy 20% OFF on all dry fruits this Eid!\n🎁 Use code: EID20\n\nShop now: kdfnuts.com" },
  ],
};

/* Automation flows per segment */
const AUTOMATION_FLOWS: Record<string, Array<{ title: string; desc: string; icon: React.ElementType; color: string }>> = {
  inactive: [
    { title: "Day 1: Comeback Offer", desc: "Send 15% OFF coupon", icon: Gift, color: "text-green-600" },
    { title: "Day 3: New Arrivals", desc: "Show fresh products", icon: Sparkles, color: "text-purple-600" },
    { title: "Day 7: Flash Sale Alert", desc: "Limited time 30% OFF", icon: Flame, color: "text-orange-600" },
    { title: "Day 14: Personal Check-in", desc: "Human-like personal msg", icon: MessageCircle, color: "text-blue-600" },
  ],
  vip: [
    { title: "VIP Exclusive Discount", desc: "25% OFF + free gift", icon: Crown, color: "text-yellow-600" },
    { title: "Early Access Launch", desc: "First to see new products", icon: Zap, color: "text-blue-600" },
    { title: "Birthday Reward", desc: "Special birthday discount", icon: Gift, color: "text-pink-600" },
  ],
  repeat: [
    { title: "Loyalty Reward", desc: "20% OFF for loyalty", icon: Star, color: "text-amber-600" },
    { title: "Cross-sell Campaign", desc: "Recommend related items", icon: ShoppingBag, color: "text-teal-600" },
    { title: "Referral Program", desc: "Refer a friend bonus", icon: Users, color: "text-indigo-600" },
  ],
  new: [
    { title: "Welcome Sequence", desc: "Welcome + 10% OFF", icon: UserPlus, color: "text-green-600" },
    { title: "Product Discovery", desc: "Highlight top products", icon: Sparkles, color: "text-purple-600" },
    { title: "First Review Request", desc: "Ask for feedback", icon: Star, color: "text-amber-600" },
  ],
};

const PAKISTAN_CITIES = ["Lahore","Karachi","Islamabad","Rawalpindi","Multan","Faisalabad","Peshawar","Quetta","Sialkot","Gujranwala"];

const CSV_FIELD_MAP: Record<string, string[]> = {
  firstName: ["first_name","firstname","first name","fname"],
  lastName:  ["last_name","lastname","last name","lname"],
  email:     ["email","email address","e-mail"],
  phone:     ["phone","phone number","mobile","contact","whatsapp"],
  city:      ["city","town"],
  country:   ["country"],
  totalOrders: ["total_orders","orders","order_count"],
  totalSpent:  ["total_spent","spent","amount_spent","ltv"],
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  });
}

function mapRow(row: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(CSV_FIELD_MAP)) {
    for (const alias of aliases) {
      if (row[alias] !== undefined && row[alias] !== "") { mapped[field] = row[alias]; break; }
    }
  }
  return mapped;
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}yr ago`;
}

/* ════════════════════════════════════════════════════════════
   DELIVERY INTELLIGENCE VIEW
   ════════════════════════════════════════════════════════════ */
type DeliveryStatus = "DELIVERED" | "RETURNED" | "FAKE_CUSTOMER";

function getDeliveryStatus(c: { returnedOrders: number; cancelledOrders: number }): DeliveryStatus {
  if (c.returnedOrders >= 2) return "FAKE_CUSTOMER";
  if (c.returnedOrders >= 1) return "RETURNED";
  return "DELIVERED";
}

const STATUS_META: Record<DeliveryStatus, { label: string; icon: React.ElementType; color: string; bg: string; border: string; desc: string }> = {
  DELIVERED:     { label: "Delivered",     icon: CheckCircle2, color: "text-green-700", bg: "bg-green-50",  border: "border-green-200", desc: "Orders successfully delivered" },
  RETURNED:      { label: "Returned",      icon: AlertTriangle,color: "text-amber-700", bg: "bg-amber-50",  border: "border-amber-200", desc: "At least one returned order" },
  FAKE_CUSTOMER: { label: "Fake Customer", icon: ShieldAlert,  color: "text-red-700",  bg: "bg-red-50",    border: "border-red-200",   desc: "2+ returns — does not accept delivery" },
};

function StatusBadge({ status }: { status: DeliveryStatus }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${m.color} ${m.bg} ${m.border}`}>
      <Icon className="w-3 h-3" /> {m.label}
    </span>
  );
}

function DeliveryBar({ rate }: { rate: number }) {
  const color = rate >= 70 ? "bg-green-500" : rate >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-24">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-8 ${rate >= 70 ? "text-green-700" : rate >= 40 ? "text-amber-600" : "text-red-600"}`}>{rate}%</span>
    </div>
  );
}

function DeliveryIntelligenceView() {
  const [statusFilter, setStatusFilter] = useState<"ALL" | DeliveryStatus>("ALL");
  const [search, setSearch]             = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage]                 = useState(1);
  const PER_PAGE = 50;

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [statusFilter]);

  const token = localStorage.getItem("kdf_admin_token") ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["delivery-intelligence", "all"],
    queryFn: () =>
      fetch("/api/admin/intelligence/customers?limit=1000&page=1", {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      }).then(r => r.json()),
    staleTime: 60_000,
  });

  const enriched = (data?.customers ?? []).map((c: any) => ({
    ...c,
    deliveryStatus: getDeliveryStatus(c),
  }));

  const counts = {
    total:    enriched.length,
    delivered:  enriched.filter((c: any) => c.deliveryStatus === "DELIVERED").length,
    returned:   enriched.filter((c: any) => c.deliveryStatus === "RETURNED").length,
    fake:       enriched.filter((c: any) => c.deliveryStatus === "FAKE_CUSTOMER").length,
  };

  const filtered = enriched.filter((c: any) => {
    if (statusFilter !== "ALL" && c.deliveryStatus !== statusFilter) return false;
    if (debouncedSearch) {
      const hay = `${c.name} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase();
      if (!hay.includes(debouncedSearch.toLowerCase())) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Customers",    value: counts.total,     icon: Users,       bg: "bg-blue-50",   color: "text-blue-600",  filter: "ALL" },
          { label: "Delivered",          value: counts.delivered, icon: CheckCircle2,bg: "bg-green-50",  color: "text-green-700", filter: "DELIVERED" },
          { label: "Returned",           value: counts.returned,  icon: AlertTriangle,bg:"bg-amber-50",  color: "text-amber-700", filter: "RETURNED" },
          { label: "Fake Customers",     value: counts.fake,      icon: ShieldAlert, bg: "bg-red-50",    color: "text-red-700",   filter: "FAKE_CUSTOMER" },
        ].map(({ label, value, icon: Icon, bg, color, filter }) => (
          <button key={label}
            onClick={() => setStatusFilter(filter as any)}
            className={`${bg} border rounded-xl p-4 text-left hover:opacity-90 transition-all ${statusFilter === filter ? "ring-2 ring-primary ring-offset-1 shadow-md" : "border-border hover:shadow-sm"}`}>
            <Icon className={`w-4 h-4 ${color} mb-2`} />
            <p className={`text-2xl font-bold ${color}`}>{isLoading ? "…" : value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">{label}</p>
          </button>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 space-y-1">
        <p className="font-semibold">Classification rules (based on Shopify order history):</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 mt-1">
          <span>✅ <strong>DELIVERED</strong> — 0 returned orders</span>
          <span>⚠️ <strong>RETURNED</strong> — 1 returned order</span>
          <span>🚫 <strong>FAKE CUSTOMER</strong> — 2+ returned orders</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone or email…" className="pl-8 h-9 text-sm" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["ALL", "DELIVERED", "RETURNED", "FAKE_CUSTOMER"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                statusFilter === s
                  ? s === "DELIVERED"     ? "bg-green-600 text-white border-green-600"
                  : s === "RETURNED"      ? "bg-amber-500 text-white border-amber-500"
                  : s === "FAKE_CUSTOMER" ? "bg-red-600 text-white border-red-600"
                  :                        "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}>
              {s === "ALL" ? "All Customers"
               : s === "DELIVERED" ? "✅ Delivered"
               : s === "RETURNED"  ? "⚠️ Returned"
               :                     "🚫 Fake Customers"}
            </button>
          ))}
        </div>
      </div>

      {!isLoading && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length.toLocaleString()} customer{filtered.length !== 1 ? "s" : ""}
          {statusFilter !== "ALL" ? ` · ${STATUS_META[statusFilter as DeliveryStatus]?.label ?? statusFilter}` : ""}
        </p>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span>Loading delivery intelligence…</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                {["Customer","Phone","City","Orders","Delivery Rate","Status","Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No customers found</td></tr>
                ) : paginated.map((c: any) => (
                  <tr key={c.id} className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${STATUS_META[c.deliveryStatus as DeliveryStatus]?.bg ?? ""}`}>
                    <td className="px-4 py-3 font-medium">{c.name || "Unknown"}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.city ?? "—"}</td>
                    <td className="px-4 py-3">{c.totalOrders}</td>
                    <td className="px-4 py-3"><DeliveryBar rate={c.deliveryRate} /></td>
                    <td className="px-4 py-3"><StatusBadge status={c.deliveryStatus} /></td>
                    <td className="px-4 py-3">
                      {c.phone && (
                        <a href={`https://wa.me/${c.phone.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[#25D366] hover:underline font-medium">
                          <MessageCircle className="w-3 h-3" /> WA
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   RETARGETING PANEL
   ════════════════════════════════════════════════════════════ */
function RetargetingPanel({
  segment, total, onStartCampaign,
}: { segment: string; total: number; onStartCampaign: () => void }) {
  const seg = SEGMENTS.find(s => s.value === segment);
  if (!seg || segment === "all") return null;

  const templates = SEGMENT_TEMPLATES[segment] ?? SEGMENT_TEMPLATES.all;
  const flows = AUTOMATION_FLOWS[segment] ?? [];

  return (
    <div className="rounded-2xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-blue-50 p-5 space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${seg.bg}`}>
            <seg.icon className={`w-5 h-5 ${seg.color}`} />
          </div>
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Retarget: {seg.label}
            </h3>
            <p className="text-sm text-muted-foreground">
              <strong className="text-primary">{total.toLocaleString()}</strong> customers — {seg.hint}
            </p>
          </div>
        </div>
        <Button onClick={onStartCampaign} className="gap-2 bg-[#25D366] hover:bg-[#1ea855] text-white shrink-0">
          <Send className="w-4 h-4" /> WhatsApp Campaign
        </Button>
      </div>

      {/* Quick templates */}
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" /> Recommended Templates
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {templates.slice(0, 4).map(t => (
            <button key={t.label}
              className="text-left bg-card border border-border rounded-xl px-4 py-3 hover:border-primary hover:shadow-sm transition-all group"
              onClick={onStartCampaign}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{t.emoji}</span>
                <span className="font-semibold text-sm group-hover:text-primary transition-colors">{t.label}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{t.msg.slice(0, 80)}…</p>
            </button>
          ))}
        </div>
      </div>

      {/* Automation flows */}
      {flows.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" /> Automation Flow (Manual Triggers)
          </p>
          <div className="flex flex-wrap gap-2">
            {flows.map((f, i) => (
              <div key={i} className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                <f.icon className={`w-4 h-4 ${f.color} shrink-0`} />
                <div>
                  <p className="text-xs font-semibold leading-none">{f.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════ */
export default function ShopifyCustomersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [segment, setSegment] = useState("all");
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [waMessage, setWaMessage] = useState("");
  const [waTarget, setWaTarget] = useState<any>(null);
  const [showImport, setShowImport] = useState(false);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvError, setCsvError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"customers" | "delivery">("customers");
  const [showCampaign, setShowCampaign] = useState(false);
  const [campaignMsg, setCampaignMsg] = useState("");
  const [campaignStep, setCampaignStep] = useState<"compose"|"confirm">("compose");
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);

  /* Debounce search */
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  /* Reset page on segment/city change */
  useEffect(() => { setPage(1); }, [segment, selectedCities]);

  /* ── Queries ── */
  const { data, isLoading } = useQuery({
    queryKey: ["shopify-customers", page, debouncedSearch, segment, selectedCities.join(",")],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "20", search: debouncedSearch, segment });
      if (selectedCities.length > 0) params.set("cities", selectedCities.join(","));
      return api(`/admin/shopify/customers?${params}`).then(r => r.json());
    },
    placeholderData: prev => prev,
  });

  const { data: segments } = useQuery({
    queryKey: ["shopify-customer-segments"],
    queryFn: () => api("/admin/shopify/customers/segments").then(r => r.json()),
    staleTime: 60_000,
  });

  const { data: citiesData } = useQuery({
    queryKey: ["shopify-customer-cities"],
    queryFn: () => api("/admin/shopify/customers/cities").then(r => r.json()),
    staleTime: 300_000,
  });

  const customerDetail = useQuery({
    queryKey: ["shopify-customer-detail", selectedCustomer?.id],
    queryFn: () => api(`/admin/shopify/customers/${selectedCustomer.id}`).then(r => r.json()),
    enabled: !!selectedCustomer,
  });

  /* ── Mutations ── */
  const syncMutation = useMutation({
    mutationFn: () => api("/admin/shopify/sync/customers", { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["shopify-customers"] }); qc.invalidateQueries({ queryKey: ["shopify-customer-segments"] }); toast({ title: `${d.synced} customers synced` }); },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: (customers: any[]) => api("/admin/shopify/customers/import", { method: "POST", body: JSON.stringify({ customers }) }).then(r => r.json()),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["shopify-customers"] });
      setShowImport(false); setCsvPreview([]); setCsvFileName("");
      toast({ title: `Import complete: ${d.imported} imported, ${d.skipped} skipped` });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const waMutation = useMutation({
    mutationFn: ({ id, message }: any) => api(`/admin/shopify/customers/${id}/whatsapp`, { method: "POST", body: JSON.stringify({ message }) }).then(r => r.json()),
    onSuccess: () => { setWaTarget(null); setWaMessage(""); toast({ title: "WhatsApp message sent" }); },
    onError: (e: any) => toast({ title: e?.message ?? "Failed to send", variant: "destructive" }),
  });

  const campaignMutation = useMutation({
    mutationFn: () => api("/admin/shopify/customers/campaign/whatsapp", {
      method: "POST",
      body: JSON.stringify({ message: campaignMsg, segment, cities: selectedCities }),
    }).then(r => r.json()),
    onSuccess: (d) => {
      setShowCampaign(false); setCampaignMsg(""); setCampaignStep("compose");
      toast({ title: `Campaign queued for ${d.sent} customers` });
    },
    onError: () => toast({ title: "Campaign failed", variant: "destructive" }),
  });

  const aiMsgMutation = useMutation({
    mutationFn: () => api("/admin/shopify/customers/ai-message", {
      method: "POST",
      body: JSON.stringify({ segment, cities: selectedCities }),
    }).then(r => r.json()),
    onSuccess: (d) => { if (d.message) { setCampaignMsg(d.message); setSelectedTemplate(null); } },
    onError: () => toast({ title: "AI generation failed", variant: "destructive" }),
  });

  /* ── Derived ── */
  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);
  const topCities: Array<{city: string; count: number}> = citiesData?.cities ?? [];

  const isVip = (c: any) => parseFloat(c.totalSpent ?? "0") >= 15000;
  const isHighValue = (c: any) => parseFloat(c.totalSpent ?? "0") >= 5000;

  /* Segment label for display */
  const activeSeg = SEGMENTS.find(s => s.value === segment);
  const activeFilterLabel = () => {
    const parts: string[] = [];
    if (segment !== "all") parts.push(activeSeg?.label ?? segment);
    if (selectedCities.length > 0) parts.push(selectedCities.join(", "));
    return parts.length ? parts.join(" · ") : "All Customers";
  };

  const openWa = (c: any) => {
    setWaTarget(c);
    setWaMessage(`Hi ${c.firstName ?? "there"}! Thank you for being a valued KDF NUTS customer. 🙏`);
  };

  const toggleCity = (city: string) => {
    setSelectedCities(prev => prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]);
  };

  const openCampaign = () => {
    const templates = SEGMENT_TEMPLATES[segment] ?? SEGMENT_TEMPLATES.all;
    if (templates.length > 0) { setCampaignMsg(templates[0].msg); setSelectedTemplate(0); }
    else setCampaignMsg(`Hi {name}! 👋\n\nThank you for shopping with KDF NUTS! We have an exclusive offer just for you.\n\n🎁 Use code: KDFSPECIAL for 15% OFF!\n\nShop now: kdfnuts.com 🛒`);
    setCampaignStep("compose");
    setShowCampaign(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(""); setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) { setCsvError("No valid rows found in CSV file."); return; }
      const mapped = rows.map(r => mapRow(r)).filter(r => r.email || r.phone);
      if (mapped.length === 0) { setCsvError("No rows with email or phone found."); return; }
      setCsvPreview(mapped);
    };
    reader.onerror = () => setCsvError("Failed to read file.");
    reader.readAsText(file);
    e.target.value = "";
  };

  const downloadSampleCSV = () => {
    const sample = "first_name,last_name,email,phone,city,country\nAhmed,Khan,ahmed@example.com,03001234567,Karachi,Pakistan\nFatima,Ali,fatima@example.com,03211234567,Lahore,Pakistan";
    const blob = new Blob([sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sample_customers.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  /* Segment-specific templates for campaign modal */
  const currentTemplates = SEGMENT_TEMPLATES[segment] ?? SEGMENT_TEMPLATES.all;

  /* ── SEGMENT STAT CARDS DATA ── */
  const segmentCards = [
    { label: "Total",       value: segments?.total,          seg: "all",        icon: Users,      color: "text-blue-600",    bg: "bg-blue-50"    },
    { label: "VIP",         value: segments?.vip,            seg: "vip",        icon: Crown,      color: "text-yellow-600",  bg: "bg-yellow-50"  },
    { label: "High Value",  value: segments?.highValue,      seg: "high_value", icon: Star,       color: "text-amber-600",   bg: "bg-amber-50"   },
    { label: "Repeat",      value: segments?.repeat,         seg: "repeat",     icon: Repeat2,    color: "text-green-600",   bg: "bg-green-50"   },
    { label: "New (30d)",   value: segments?.newCustomers,   seg: "new",        icon: UserPlus,   color: "text-indigo-600",  bg: "bg-indigo-50"  },
    { label: "Inactive",    value: segments?.inactive,       seg: "inactive",   icon: UserMinus,  color: "text-red-500",     bg: "bg-red-50"     },
    { label: "With Phone",  value: segments?.withPhone,      seg: "with_phone", icon: Smartphone, color: "text-teal-600",    bg: "bg-teal-50"    },
    { label: "Marketing",   value: segments?.marketingOptIn, seg: "marketing",  icon: TrendingUp, color: "text-orange-600",  bg: "bg-orange-50"  },
  ];

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {isLoading ? "Loading…" : <><strong className="text-foreground">{total.toLocaleString()}</strong> customers matched</>}
            {segment !== "all" && <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">{activeSeg?.label}</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { setShowImport(true); setCsvPreview([]); setCsvFileName(""); setCsvError(""); }} className="gap-1.5">
            <Upload className="w-4 h-4" /> Import CSV
          </Button>
          <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="gap-1.5">
            <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing..." : "Sync Shopify"}
          </Button>
          <Button onClick={openCampaign} className="gap-1.5 bg-[#25D366] hover:bg-[#1ea855] text-white">
            <Send className="w-4 h-4" /> Send Campaign
          </Button>
        </div>
      </div>

      {/* ── View Tab Bar ── */}
      <div className="flex gap-1 border-b border-border -mb-1">
        <button onClick={() => setView("customers")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${view === "customers" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <Users className="w-3.5 h-3.5" /> Customer List
        </button>
        <button onClick={() => setView("delivery")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${view === "delivery" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <Brain className="w-3.5 h-3.5" /> Delivery Intelligence
        </button>
      </div>

      {/* ── Delivery Intelligence Tab ── */}
      {view === "delivery" && <DeliveryIntelligenceView />}

      {/* ════════════════════════════════════ CUSTOMER LIST ════════════════════════════════════ */}
      {view === "customers" && (
        <>
          {/* ── Segment Stat Cards ── */}
          {segments && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {segmentCards.map(({ label, value, seg, icon: Icon, color, bg }) => (
                <button key={seg}
                  onClick={() => setSegment(seg)}
                  className={`flex flex-col items-start p-3 rounded-xl border transition-all text-left cursor-pointer hover:shadow-md ${
                    segment === seg
                      ? "ring-2 ring-primary border-primary shadow-md bg-primary/5"
                      : "border-border bg-card hover:border-primary/40"
                  }`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-1.5 ${bg} ${segment === seg ? "ring-1 ring-primary/30" : ""}`}>
                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                  </div>
                  <p className={`text-lg font-bold leading-none ${segment === seg ? "text-primary" : ""}`}>
                    {((value ?? 0) as number).toLocaleString()}
                  </p>
                  <p className={`text-[11px] mt-0.5 ${segment === seg ? "text-primary/80 font-semibold" : "text-muted-foreground"}`}>{label}</p>
                </button>
              ))}
            </div>
          )}

          {/* ── City Filter Bar ── */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Filter by City</span>
              {selectedCities.length > 0 && (
                <button onClick={() => setSelectedCities([])}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <X className="w-3 h-3" />Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedCities([])}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${selectedCities.length === 0 ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border hover:bg-muted/50"}`}>
                🇵🇰 All Pakistan
              </button>
              {(topCities.length > 0 ? topCities.slice(0, 24) : PAKISTAN_CITIES.map(c => ({ city: c, count: 0 }))).map(({ city, count }) => (
                <button key={city} onClick={() => toggleCity(city)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all flex items-center gap-1.5 ${selectedCities.includes(city) ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border hover:bg-muted/50"}`}>
                  {city}
                  {count > 0 && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${selectedCities.includes(city) ? "bg-white/25" : "bg-muted"}`}>{count.toLocaleString()}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* ── Segment Filter Pills ── */}
          <div className="flex gap-2 flex-wrap items-center">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            {SEGMENTS.map(s => {
              const Icon = s.icon;
              const isActive = segment === s.value;
              return (
                <button key={s.value}
                  onClick={() => setSegment(s.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all flex items-center gap-1.5 ${
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "border-border hover:bg-muted/50 hover:border-primary/40"
                  }`}>
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-primary-foreground" : s.color}`} />
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* ── Search ── */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9 h-10 text-sm bg-card" placeholder="Search by name, email, phone, or city..." value={search}
              onChange={e => setSearch(e.target.value)} />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          {/* ── Retargeting Panel ── */}
          {segment !== "all" && total > 0 && (
            <RetargetingPanel segment={segment} total={total} onStartCampaign={openCampaign} />
          )}

          {/* ── Quick Campaign Bar (when city filter active) ── */}
          {segment === "all" && selectedCities.length > 0 && total > 0 && (
            <div className="flex items-center justify-between bg-[#25D366]/8 border border-[#25D366]/30 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <Zap className="w-4 h-4 text-[#25D366]" />
                <span className="font-medium">{total.toLocaleString()} customers</span>
                <span className="text-muted-foreground">in <strong>{selectedCities.join(", ")}</strong></span>
              </div>
              <Button size="sm" onClick={openCampaign} className="bg-[#25D366] hover:bg-[#1ea855] text-white gap-1.5">
                <Send className="w-3.5 h-3.5" /> Campaign
              </Button>
            </div>
          )}

          {/* ── Customer Table ── */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p>Loading customers…</p>
              </div>
            ) : customers.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium text-lg">No customers found</p>
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or sync from Shopify</p>
                {segment !== "all" && (
                  <button onClick={() => setSegment("all")} className="mt-3 text-sm text-primary hover:underline">
                    Clear segment filter
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {["Customer", "Contact", "City", "Orders", "Total Spent", "Last Order", "Segment", "Actions"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c: any) => {
                      const vip = isVip(c);
                      const highVal = isHighValue(c);
                      const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown";
                      const spent = parseFloat(c.totalSpent ?? "0");
                      const lastOrder = timeAgo(c.lastOrderAt);
                      const isInactive = c.lastOrderAt && new Date(c.lastOrderAt) < new Date(Date.now() - 90 * 86400000);
                      return (
                        <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                          {/* Customer */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${vip ? "bg-yellow-100 text-yellow-700" : "bg-primary/10 text-primary"}`}>
                                {name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <button className="font-semibold text-primary hover:underline text-left leading-tight" onClick={() => setSelectedCustomer(c)}>
                                  {name}
                                </button>
                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                  {vip && <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-bold border border-yellow-200">⭐ VIP</span>}
                                  {!vip && highVal && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold border border-amber-200">💎 High Value</span>}
                                  {c.source === "csv" && <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold border border-orange-200">CSV</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          {/* Contact */}
                          <td className="px-4 py-3">
                            <div className="space-y-0.5">
                              {c.email && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" /><span className="truncate max-w-32">{c.email}</span></div>}
                              {c.phone && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" /><span>{c.phone}</span></div>}
                              {!c.email && !c.phone && <span className="text-xs text-muted-foreground">—</span>}
                            </div>
                          </td>
                          {/* City */}
                          <td className="px-4 py-3">
                            {c.city ? (
                              <button onClick={() => toggleCity(c.city)}
                                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
                                <MapPin className="w-3 h-3" />{c.city}
                              </button>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          {/* Orders */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold">{c.totalOrders ?? 0}</span>
                              {(c.totalOrders ?? 0) >= 2 && <span className="text-[9px] bg-green-100 text-green-700 px-1 rounded font-bold">Repeat</span>}
                            </div>
                          </td>
                          {/* Spent */}
                          <td className="px-4 py-3">
                            <span className={`font-semibold ${vip ? "text-yellow-600" : highVal ? "text-amber-600" : "text-foreground"}`}>
                              PKR {spent.toLocaleString()}
                            </span>
                          </td>
                          {/* Last Order */}
                          <td className="px-4 py-3">
                            <div className={`flex items-center gap-1 text-xs ${isInactive ? "text-red-500" : "text-muted-foreground"}`}>
                              <Clock className="w-3 h-3" />
                              <span className="font-medium">{lastOrder}</span>
                            </div>
                          </td>
                          {/* Segment Badge */}
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {vip ? (
                                <span className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full font-bold">VIP</span>
                              ) : highVal ? (
                                <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">High Value</span>
                              ) : (c.totalOrders ?? 0) >= 2 ? (
                                <span className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-bold">Repeat</span>
                              ) : (c.totalOrders ?? 0) === 1 ? (
                                <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold">One-time</span>
                              ) : (
                                <span className="text-[10px] bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full font-bold">New</span>
                              )}
                              {isInactive && <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-bold">Inactive</span>}
                            </div>
                          </td>
                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {c.phone && (
                                <button onClick={() => openWa(c)}
                                  className="w-7 h-7 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 flex items-center justify-center transition-colors"
                                  title="Send WhatsApp">
                                  <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                                </button>
                              )}
                              <button onClick={() => setSelectedCustomer(c)}
                                className="w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors"
                                title="View details">
                                <Users className="w-3.5 h-3.5 text-primary" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Page {page} of {totalPages} · <strong>{total.toLocaleString()}</strong> customers
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════
          CAMPAIGN MODAL
      ══════════════════════════════════════════ */}
      {showCampaign && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowCampaign(false); }}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
              <div>
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-[#25D366]" /> WhatsApp Campaign
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Target: <strong>{activeFilterLabel()}</strong> · {total.toLocaleString()} customers
                </p>
              </div>
              <button onClick={() => setShowCampaign(false)} className="hover:bg-muted rounded-lg p-1.5 transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {campaignStep === "compose" && (
              <div className="p-5 space-y-5">
                {/* Target summary */}
                <div className="bg-[#25D366]/8 border border-[#25D366]/20 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#25D366]/15 flex items-center justify-center">
                    {activeSeg ? <activeSeg.icon className={`w-4 h-4 ${activeSeg.color}`} /> : <Users className="w-4 h-4 text-[#25D366]" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{total.toLocaleString()} customers targeted</p>
                    <p className="text-xs text-muted-foreground">{activeFilterLabel()}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => aiMsgMutation.mutate()}
                    disabled={aiMsgMutation.isPending} className="gap-1.5 text-xs h-8 ml-auto shrink-0">
                    {aiMsgMutation.isPending
                      ? <><Loader2 className="w-3 h-3 animate-spin" />Generating…</>
                      : <><Sparkles className="w-3 h-3 text-purple-500" />AI Generate</>}
                  </Button>
                </div>

                {/* Segment-specific templates */}
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Quick Templates for {activeSeg?.label ?? "All Customers"}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {currentTemplates.map((t, i) => (
                      <button key={i}
                        onClick={() => { setCampaignMsg(t.msg); setSelectedTemplate(i); }}
                        className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                          selectedTemplate === i
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/40 hover:bg-muted/30"
                        }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base">{t.emoji}</span>
                          <span className={`font-semibold text-xs ${selectedTemplate === i ? "text-primary" : ""}`}>{t.label}</span>
                          {selectedTemplate === i && <CheckCircle className="w-3.5 h-3.5 text-primary ml-auto" />}
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{t.msg.slice(0, 75)}…</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message composer */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold">Message</label>
                    <span className="text-xs text-muted-foreground">{campaignMsg.length} chars</span>
                  </div>
                  <textarea
                    className="w-full border border-border rounded-xl p-3.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary min-h-[160px] bg-background"
                    rows={7}
                    value={campaignMsg}
                    onChange={e => { setCampaignMsg(e.target.value); setSelectedTemplate(null); }}
                    placeholder="Write your WhatsApp message here...&#10;&#10;Use {name} to personalize with customer name."
                  />
                  <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Use <code className="bg-muted px-1 rounded">{"{name}"}</code> for the customer's first name.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => setCampaignStep("confirm")} disabled={!campaignMsg.trim()}>
                    Preview & Confirm →
                  </Button>
                  <Button variant="outline" onClick={() => setShowCampaign(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {campaignStep === "confirm" && (
              <div className="p-5 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>You are about to send this message to <strong>{total.toLocaleString()} customers</strong> with a phone number. This action cannot be undone.</span>
                </div>

                <div className="bg-[#ECF8EE] border border-[#25D366]/30 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center">
                      <span className="text-white text-xs font-bold">KDF</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-800">KDF NUTS</p>
                      <p className="text-[10px] text-gray-500">WhatsApp Business</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl rounded-tl-none p-3 shadow-sm">
                    <p className="text-sm text-gray-800 whitespace-pre-line">
                      {campaignMsg.replace(/\{name\}/gi, "Ahmed")}
                    </p>
                    <p className="text-[10px] text-gray-400 text-right mt-1">12:00 PM ✓✓</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1 bg-[#25D366] hover:bg-[#1ea855] text-white gap-2"
                    onClick={() => campaignMutation.mutate()} disabled={campaignMutation.isPending}>
                    {campaignMutation.isPending
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</>
                      : <><Send className="w-4 h-4" />Send to {total.toLocaleString()} Customers</>}
                  </Button>
                  <Button variant="outline" onClick={() => setCampaignStep("compose")}>← Edit</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          CUSTOMER DETAIL DRAWER
      ══════════════════════════════════════════ */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-end" onClick={e => { if (e.target === e.currentTarget) setSelectedCustomer(null); }}>
          <div className="bg-card border-l border-border w-full max-w-md h-full overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
              <div>
                <div className="flex items-center gap-2">
                  {isVip(selectedCustomer) && <Crown className="w-4 h-4 text-yellow-500" />}
                  <h2 className="font-bold text-base">{[selectedCustomer.firstName, selectedCustomer.lastName].filter(Boolean).join(" ") || "Customer"}</h2>
                  {isVip(selectedCustomer) && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold border border-yellow-200">⭐ VIP</span>}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selectedCustomer.source === "csv" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                    {selectedCustomer.source === "csv" ? "📋 CSV Import" : "🛒 Shopify"}
                  </span>
                  {selectedCustomer.lastOrderAt && (
                    <span className="text-xs text-muted-foreground">Last order: {timeAgo(selectedCustomer.lastOrderAt)}</span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="hover:bg-muted rounded-lg p-1.5 transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">{selectedCustomer.totalOrders ?? 0}</p>
                  <p className="text-xs text-blue-600 mt-0.5">Total Orders</p>
                </div>
                <div className={`border rounded-xl p-4 text-center ${isVip(selectedCustomer) ? "bg-yellow-50 border-yellow-100" : "bg-green-50 border-green-100"}`}>
                  <p className={`text-base font-bold leading-tight ${isVip(selectedCustomer) ? "text-yellow-700" : "text-green-700"}`}>
                    PKR {parseFloat(selectedCustomer.totalSpent ?? "0").toLocaleString()}
                  </p>
                  <p className={`text-xs mt-0.5 ${isVip(selectedCustomer) ? "text-yellow-600" : "text-green-600"}`}>Total Spent {isVip(selectedCustomer) ? "⭐" : ""}</p>
                </div>
              </div>
              {/* Contact info */}
              <div className="space-y-3 text-sm">
                {selectedCustomer.email && (
                  <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="break-all">{selectedCustomer.email}</span>
                  </div>
                )}
                {selectedCustomer.phone && (
                  <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{selectedCustomer.phone}</span>
                  </div>
                )}
                {selectedCustomer.city && (
                  <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{selectedCustomer.city}{selectedCustomer.country ? `, ${selectedCustomer.country}` : ""}</span>
                    <button onClick={() => { toggleCity(selectedCustomer.city); setSelectedCustomer(null); }}
                      className="text-xs text-primary hover:underline ml-auto">Filter</button>
                  </div>
                )}
                {selectedCustomer.tags && (
                  <div className="flex items-center gap-2 p-2 rounded-lg">
                    <Tag className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground text-xs">{selectedCustomer.tags}</span>
                  </div>
                )}
              </div>
              {/* WA button */}
              {selectedCustomer.phone && (
                <Button className="w-full gap-2 bg-[#25D366] hover:bg-[#1ea855] text-white" onClick={() => openWa(selectedCustomer)}>
                  <MessageCircle className="w-4 h-4" /> Send WhatsApp Message
                </Button>
              )}
              {/* Order history */}
              {customerDetail.data?.orders?.length > 0 && (
                <div>
                  <p className="font-semibold mb-3 text-sm flex items-center gap-1.5">
                    <ShoppingBag className="w-4 h-4" /> Order History
                  </p>
                  <div className="space-y-2">
                    {customerDetail.data.orders.map((o: any) => (
                      <div key={o.id} className="border border-border rounded-xl p-3 text-sm hover:bg-muted/20 transition-colors">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-semibold">{o.orderNumber}</span>
                            <span className="ml-2 capitalize text-xs text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">{o.status}</span>
                          </div>
                          <span className="font-bold text-green-700">PKR {parseFloat(o.totalPrice ?? "0").toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {o.shopifyCreatedAt ? new Date(o.shopifyCreatedAt).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" }) : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {customerDetail.isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading order history…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          WHATSAPP MODAL (per-customer)
      ══════════════════════════════════════════ */}
      {waTarget && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[#25D366]" /> Send WhatsApp
              </h3>
              <button onClick={() => setWaTarget(null)} className="hover:bg-muted rounded-lg p-1 transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 mb-3 text-sm">
              <p className="font-medium">{[waTarget.firstName, waTarget.lastName].filter(Boolean).join(" ")}</p>
              <p className="text-muted-foreground text-xs mt-0.5">{waTarget.phone}{waTarget.city ? ` · ${waTarget.city}` : ""}</p>
            </div>
            <textarea className="w-full border border-border rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-background"
              rows={5} value={waMessage} onChange={e => setWaMessage(e.target.value)} />
            <div className="flex gap-2 mt-4">
              <Button className="flex-1 bg-[#25D366] hover:bg-[#1ea855] text-white gap-2"
                onClick={() => waMutation.mutate({ id: waTarget.id, message: waMessage })}
                disabled={waMutation.isPending || !waMessage.trim()}>
                {waMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : <><Send className="w-4 h-4" />Send Message</>}
              </Button>
              <Button variant="outline" onClick={() => setWaTarget(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          CSV IMPORT MODAL
      ══════════════════════════════════════════ */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Upload className="w-5 h-5" /> Import Customers from CSV
              </h2>
              <button onClick={() => setShowImport(false)} className="hover:bg-muted rounded-lg p-1.5 transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
                <p className="font-semibold text-blue-800 mb-2 flex items-center gap-1.5"><FileText className="w-4 h-4" />CSV Format</p>
                <p className="text-blue-700 mb-2 text-xs">Supported columns:</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-blue-700">
                  {[["first_name / firstname","First name"],["last_name / lastname","Last name"],["email","Email address"],["phone / mobile","Phone / WhatsApp"],["city","City"],["country","Country"]].map(([col, desc]) => (
                    <div key={col}><code className="bg-blue-100 px-1 rounded">{col}</code> — {desc}</div>
                  ))}
                </div>
                <button onClick={downloadSampleCSV} className="mt-3 flex items-center gap-1.5 text-blue-700 hover:text-blue-900 text-xs font-medium">
                  <Download className="w-3.5 h-3.5" />Download sample CSV
                </button>
              </div>
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors">
                <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                {csvFileName ? <p className="font-medium text-foreground">{csvFileName}</p> : <p className="text-muted-foreground">Click to select a CSV file</p>}
                <p className="text-xs text-muted-foreground mt-1">Supports .csv and .txt files</p>
              </div>
              {csvError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{csvError}
                </div>
              )}
              {csvPreview.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <p className="text-sm font-medium">{csvPreview.length} customers ready to import</p>
                  </div>
                  <div className="border border-border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/50 border-b border-border">
                        {["Name","Email","Phone","City"].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {csvPreview.slice(0, 50).map((r, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="px-3 py-1.5">{[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.email || "—"}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.phone || "—"}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.city || "—"}</td>
                          </tr>
                        ))}
                        {csvPreview.length > 50 && <tr><td colSpan={4} className="px-3 py-2 text-muted-foreground text-center">…and {csvPreview.length - 50} more</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 p-5 border-t border-border">
              <Button className="flex-1" onClick={() => importMutation.mutate(csvPreview)} disabled={csvPreview.length === 0 || importMutation.isPending}>
                {importMutation.isPending ? "Importing..." : `Import ${csvPreview.length} Customers`}
              </Button>
              <Button variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
