import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ShoppingCart, Users, Package, TrendingUp, TrendingDown,
  MessageCircle, Mail, AlertTriangle, CheckCircle, Clock,
  Truck, BarChart2, Zap, RefreshCw, Settings, Eye, EyeOff,
  ArrowRight, ShoppingBag, Star, DollarSign, Target, Send,
  Activity, Loader2, ChevronRight, MapPin, Bike, BadgeCheck,
  PackageX, RotateCcw, Banknote, Navigation,
} from "lucide-react";

function api(path: string) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
}

function fmt(n: number | undefined | null, decimals = 0): string {
  const v = parseFloat(String(n ?? "0"));
  if (isNaN(v)) return "0";
  return v.toLocaleString("en-PK", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function pct(part: number, total: number): string {
  if (!total) return "0%";
  return ((part / total) * 100).toFixed(1) + "%";
}

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

type DashStats = {
  totalOrders: number; totalRevenue: number; avgOrderValue: number;
  totalUsers: number; newCustomers30d: number; totalProducts: number;
  pendingOrders: number; processingOrders: number; shippedOrders: number;
  deliveredOrders: number; cancelledOrders: number; confirmedOrders: number;
  outForDelivery: number; paidOrders: number; unpaidOrders: number;
  todayOrders: number; todayRevenue: number; monthOrders: number; monthRevenue: number;
  abandonedCheckouts: number; recoveredCheckouts: number; abandonedValue: number; recoveryRate: number;
  whatsapp: { total: number; sent: number; received: number; failed: number; delivered: number; read: number };
  campaigns: { total: number; sent: number; delivered: number; read: number; failed: number; recipients: number };
  emailCampaigns: { total: number; sent: number; draft: number };
  conversionRate: number;
  recentOrders: any[];
};

const WIDGET_DEFAULTS = {
  overview: true, revenue: true, pipeline: true, marketing: true,
  abandoned: true, recentOrders: true, quickActions: true,
  logistics: true, activityFeed: true,
};

type WidgetKey = keyof typeof WIDGET_DEFAULTS;

/* ── Rider / Logistics Stats type ── */
type RiderStats = {
  stats: {
    total_lahore: number; total_assigned: number;
    delivered: number; out_for_delivery: number;
    assigned: number; picked: number;
    failed: number; returned: number;
    active_riders: number; cod_collected: number;
  };
  riderLeaderboard: { id: number; name: string; status: string; delivered: number; active: number }[];
};

/* ── Logistics Widget ── */
function LogisticsWidget() {
  const [, nav] = useLocation();
  const { data, isLoading } = useQuery<RiderStats>({
    queryKey: ["rider-stats-dash"],
    queryFn: () => api("/admin/riders/stats"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const s = data?.stats;

  const tiles = [
    { label: "Active Riders",   value: s?.active_riders   ?? 0, icon: Bike,        color: "text-emerald-600 bg-emerald-50" },
    { label: "Out for Delivery",value: s?.out_for_delivery ?? 0, icon: Navigation,  color: "text-orange-600  bg-orange-50"  },
    { label: "Delivered Today", value: s?.delivered        ?? 0, icon: BadgeCheck,  color: "text-green-600   bg-green-50"   },
    { label: "Failed",          value: s?.failed           ?? 0, icon: PackageX,    color: "text-red-600     bg-red-50"     },
    { label: "Returned",        value: s?.returned         ?? 0, icon: RotateCcw,   color: "text-violet-600  bg-violet-50"  },
    { label: "COD to Collect",  value: `PKR ${(s?.cod_collected ?? 0).toLocaleString()}`, icon: Banknote, color: "text-blue-600 bg-blue-50" },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center">
            <Truck className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold leading-none">Logistics</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Lahore Rider Operations</p>
          </div>
        </div>
        <button onClick={() => nav("/logistics/lahore")} className="text-xs text-primary flex items-center gap-1 hover:underline">
          Manage <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
            {tiles.map(t => (
              <div key={t.label} className={`rounded-lg p-2.5 text-center ${t.color.split(" ")[1]}`}>
                <t.icon className={`w-4 h-4 mx-auto mb-1 ${t.color.split(" ")[0]}`} />
                <p className={`text-lg font-bold leading-none ${t.color.split(" ")[0]}`}>{t.value}</p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{t.label}</p>
              </div>
            ))}
          </div>

          {(data?.riderLeaderboard ?? []).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Rider Leaderboard</p>
              <div className="space-y-1">
                {data!.riderLeaderboard.slice(0, 3).map((r, i) => (
                  <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
                    <span className={`text-xs font-bold w-4 text-center ${i === 0 ? "text-amber-500" : i === 1 ? "text-gray-400" : "text-orange-400"}`}>
                      {i + 1}
                    </span>
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <Bike className="w-3 h-3 text-emerald-600" />
                    </div>
                    <span className="flex-1 text-xs font-medium truncate">{r.name}</span>
                    <span className="text-xs text-emerald-600 font-semibold">{r.delivered} delivered</span>
                    {r.active > 0 && <span className="text-[10px] text-orange-500 bg-orange-50 rounded px-1">{r.active} active</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button onClick={() => nav("/logistics/riders")}
              className="flex-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg py-1.5 font-medium hover:bg-emerald-100 transition-colors">
              Riders
            </button>
            <button onClick={() => nav("/logistics/confirmations")}
              className="flex-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg py-1.5 font-medium hover:bg-blue-100 transition-colors">
              Confirmations
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Activity Feed ── */
function ActivityFeed({ orders }: { orders: any[] }) {
  const [, nav] = useLocation();
  const { data: waData } = useQuery<{ logs: any[] }>({
    queryKey: ["wa-activity-feed"],
    queryFn: () => api("/admin/wa/logs?limit=5"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  type FeedItem = { id: string; type: "order" | "wa" | "system"; label: string; sub: string; time: Date; color: string; icon: React.FC<any> };
  const items: FeedItem[] = [
    ...orders.slice(0, 4).map((o: any) => ({
      id: `o-${o.id}`,
      type: "order" as const,
      label: `Order ${o.orderNumber}`,
      sub: `${(o.shippingAddress as any)?.name ?? "—"} · PKR ${parseFloat(o.total ?? "0").toLocaleString()}`,
      time: new Date(o.createdAt),
      color: "bg-blue-100 text-blue-600",
      icon: ShoppingCart,
    })),
    ...(waData?.logs ?? []).slice(0, 3).map((log: any) => ({
      id: `wa-${log.id}`,
      type: "wa" as const,
      label: `WA ${log.status === "received" ? "Received" : "Sent"}`,
      sub: `${log.phone ?? "—"} · ${String(log.body ?? "").slice(0, 40)}`,
      time: new Date(log.createdAt ?? Date.now()),
      color: "bg-[#25D366]/15 text-[#128C7E]",
      icon: MessageCircle,
    })),
  ].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 8);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center">
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <h3 className="font-semibold">Live Activity</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[10px] text-muted-foreground">Live</span>
        </div>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
        ) : items.map(item => (
          <div key={item.id}
            onClick={() => item.type === "order" ? nav("/orders") : nav("/wa-chat")}
            className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${item.color}`}>
              <item.icon className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{item.label}</p>
              <p className="text-[11px] text-muted-foreground truncate">{item.sub}</p>
            </div>
            <p className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
              {item.time.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  pending: "text-amber-600 bg-amber-50 border-amber-200",
  confirmed: "text-sky-600 bg-sky-50 border-sky-200",
  processing: "text-blue-600 bg-blue-50 border-blue-200",
  shipped: "text-purple-600 bg-purple-50 border-purple-200",
  out_for_delivery: "text-orange-600 bg-orange-50 border-orange-200",
  delivered: "text-green-600 bg-green-50 border-green-200",
  cancelled: "text-red-600 bg-red-50 border-red-200",
};

function StatCard({ label, value, sub, icon: Icon, color, href, trend }: {
  label: string; value: string | number; sub?: string;
  icon: React.FC<any>; color: string; href?: string; trend?: "up" | "down" | null;
}) {
  const [, nav] = useLocation();
  return (
    <div
      onClick={() => href && nav(href)}
      className={`bg-card border border-border rounded-xl p-5 flex items-start gap-4 transition-all ${href ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : ""}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold mt-0.5 truncate">{value}</p>
        {sub && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            {trend === "up" && <TrendingUp className="w-3 h-3 text-green-500" />}
            {trend === "down" && <TrendingDown className="w-3 h-3 text-red-500" />}
            {sub}
          </p>
        )}
      </div>
      {href && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
    </div>
  );
}

function PipelineBar({ stats }: { stats: DashStats }) {
  const [, nav] = useLocation();
  const stages = [
    { label: "Pending",   count: stats.pendingOrders,    color: "bg-amber-400",  text: "text-amber-700",  filter: "pending" },
    { label: "Confirmed", count: stats.confirmedOrders,   color: "bg-sky-400",    text: "text-sky-700",    filter: "confirmed" },
    { label: "Processing",count: stats.processingOrders,  color: "bg-blue-500",   text: "text-blue-700",   filter: "processing" },
    { label: "Shipped",   count: stats.shippedOrders,     color: "bg-purple-500", text: "text-purple-700", filter: "shipped" },
    { label: "Delivery",  count: stats.outForDelivery,    color: "bg-orange-400", text: "text-orange-700", filter: "out_for_delivery" },
    { label: "Delivered", count: stats.deliveredOrders,   color: "bg-emerald-500",text: "text-emerald-700",filter: "delivered" },
    { label: "Cancelled", count: stats.cancelledOrders,   color: "bg-red-400",    text: "text-red-700",    filter: "cancelled" },
  ];
  const total = stages.reduce((s, x) => s + x.count, 0) || 1;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Order Pipeline</h3>
        <button onClick={() => nav("/orders")} className="text-xs text-primary flex items-center gap-1 hover:underline">
          View All <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      {/* Progress bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-5 gap-0.5">
        {stages.map(s => s.count > 0 && (
          <div key={s.label} className={`${s.color} transition-all`} style={{ width: `${(s.count / total) * 100}%` }} title={`${s.label}: ${s.count}`} />
        ))}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {stages.map(s => (
          <button key={s.label} onClick={() => nav("/orders")}
            className="flex flex-col items-center p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer">
            <span className={`text-xl font-bold ${s.text}`}>{s.count}</span>
            <span className="text-[10px] text-muted-foreground mt-0.5 text-center leading-tight">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [, nav] = useLocation();
  const [editMode, setEditMode] = useState(false);
  const [widgets, setWidgets] = useState<typeof WIDGET_DEFAULTS>(() => {
    try { return { ...WIDGET_DEFAULTS, ...JSON.parse(localStorage.getItem("dash_widgets") ?? "{}") }; }
    catch { return WIDGET_DEFAULTS; }
  });

  const { data: stats, isLoading, refetch } = useQuery<DashStats>({
    queryKey: ["dashboard-v2"],
    queryFn: () => api("/admin/dashboard"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    localStorage.setItem("dash_widgets", JSON.stringify(widgets));
  }, [widgets]);

  const toggleWidget = (k: WidgetKey) => setWidgets(prev => ({ ...prev, [k]: !prev[k] }));

  if (isLoading || !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading dashboard…</p>
      </div>
    );
  }

  const deliveredPct = stats.totalOrders > 0
    ? ((stats.deliveredOrders / stats.totalOrders) * 100).toFixed(1) : "0";
  const waDlvPct = stats.campaigns.sent > 0
    ? ((stats.campaigns.delivered / stats.campaigns.sent) * 100).toFixed(1) : "0";
  const waReadPct = stats.campaigns.delivered > 0
    ? ((stats.campaigns.read / stats.campaigns.delivered) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-5 pb-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{timeGreeting()}, Admin 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={() => setEditMode(e => !e)}
            className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition-colors ${editMode ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            <Settings className="w-3.5 h-3.5" /> {editMode ? "Done" : "Customize"}
          </button>
        </div>
      </div>

      {/* ── Widget toggles (edit mode) ── */}
      {editMode && (
        <div className="bg-muted/50 border border-border rounded-xl p-4">
          <p className="text-sm font-medium mb-3">Show / hide dashboard sections:</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(widgets) as WidgetKey[]).map(k => (
              <button key={k} onClick={() => toggleWidget(k)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors capitalize ${widgets[k] ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                {widgets[k] ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {k.replace(/([A-Z])/g, " $1")}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Today's Snapshot ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-xl p-4">
          <p className="text-xs font-medium opacity-80">Today's Revenue</p>
          <p className="text-2xl font-bold mt-1">PKR {fmt(stats.todayRevenue)}</p>
          <p className="text-xs opacity-70 mt-1">{stats.todayOrders} orders today</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-4">
          <p className="text-xs font-medium opacity-80">This Month</p>
          <p className="text-2xl font-bold mt-1">PKR {fmt(stats.monthRevenue)}</p>
          <p className="text-xs opacity-70 mt-1">{stats.monthOrders} orders</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-xl p-4 cursor-pointer hover:from-emerald-600" onClick={() => nav("/orders")}>
          <p className="text-xs font-medium opacity-80">Pending Action</p>
          <p className="text-2xl font-bold mt-1">{stats.pendingOrders + stats.confirmedOrders + stats.processingOrders}</p>
          <p className="text-xs opacity-70 mt-1">orders need attention</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-4 cursor-pointer hover:from-purple-600" onClick={() => nav("/wa-chat")}>
          <p className="text-xs font-medium opacity-80">WA Messages</p>
          <p className="text-2xl font-bold mt-1">{stats.whatsapp.received}</p>
          <p className="text-xs opacity-70 mt-1">tap → Unified Inbox</p>
        </div>
      </div>

      {/* ── WA Chat Quick Panel ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "WA Sent", value: stats.whatsapp.sent, color: "text-[#25D366]", bg: "bg-[#25D366]/10", href: "/wa-chat" },
          { label: "WA Received", value: stats.whatsapp.received, color: "text-blue-600", bg: "bg-blue-50", href: "/wa-chat" },
          { label: "WA Read", value: stats.whatsapp.read, color: "text-violet-600", bg: "bg-violet-50", href: "/wa-chat" },
          { label: "WA Failed", value: stats.whatsapp.failed, color: "text-red-500", bg: "bg-red-50", href: "/wa-chat" },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => nav(s.href)}
            className={`${s.bg} border border-transparent hover:border-gray-200 rounded-xl p-3 text-left transition-all group`}
          >
            <p className={`text-xl font-bold ${s.color}`}>{s.value ?? 0}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* ── Key Metrics ── */}
      {widgets.overview && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Revenue" value={`PKR ${fmt(stats.totalRevenue)}`}
            sub={`Avg PKR ${fmt(stats.avgOrderValue)} / order`}
            icon={DollarSign} color="bg-green-100 text-green-700" href="/analytics" />
          <StatCard label="Total Orders" value={fmt(stats.totalOrders)}
            sub={`${deliveredPct}% delivered`}
            icon={ShoppingCart} color="bg-blue-100 text-blue-700" href="/orders" />
          <StatCard label="Customers" value={fmt(stats.totalUsers)}
            sub={`+${fmt(stats.newCustomers30d)} new (30d)`} trend="up"
            icon={Users} color="bg-violet-100 text-violet-700" href="/customers" />
          <StatCard label="Products" value={fmt(stats.totalProducts)}
            sub="active listings"
            icon={Package} color="bg-orange-100 text-orange-700" href="/products" />
          <StatCard label="WA Campaigns" value={fmt(stats.campaigns.total)}
            sub={`${fmt(stats.campaigns.sent)} messages sent`}
            icon={MessageCircle} color="bg-teal-100 text-teal-700" href="/shopify/campaigns" />
          <StatCard label="Email Campaigns" value={fmt(stats.emailCampaigns.total)}
            sub={`${fmt(stats.emailCampaigns.sent)} sent`}
            icon={Mail} color="bg-pink-100 text-pink-700" href="/shopify/email-campaigns" />
        </div>
      )}

      {/* ── Order Pipeline ── */}
      {widgets.pipeline && <PipelineBar stats={stats} />}

      {/* ── Revenue + Recent Orders ── */}
      {(widgets.revenue || widgets.recentOrders) && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {widgets.revenue && (
            <div className="lg:col-span-2 space-y-3">
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="font-semibold mb-4">Revenue Breakdown</h3>
                <div className="space-y-3">
                  {[
                    { label: "All-time Revenue", value: stats.totalRevenue, color: "bg-primary" },
                    { label: "This Month", value: stats.monthRevenue, color: "bg-blue-500" },
                    { label: "Today", value: stats.todayRevenue, color: "bg-emerald-500" },
                  ].map(row => (
                    <div key={row.label}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="font-semibold">PKR {fmt(row.value)}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${row.color} rounded-full`}
                          style={{ width: `${stats.totalRevenue > 0 ? Math.min(100, (row.value / stats.totalRevenue) * 100) : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="font-semibold mb-3">Payment Status</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-sm text-muted-foreground">Paid Orders</span>
                    </div>
                    <span className="font-semibold text-sm">{fmt(stats.paidOrders)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-sm text-muted-foreground">Unpaid Orders</span>
                    </div>
                    <span className="font-semibold text-sm">{fmt(stats.unpaidOrders)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-sm text-muted-foreground">Conversion Rate</span>
                    </div>
                    <span className="font-semibold text-sm">{stats.conversionRate}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-purple-500" />
                      <span className="text-sm text-muted-foreground">Avg Order Value</span>
                    </div>
                    <span className="font-semibold text-sm">PKR {fmt(stats.avgOrderValue)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {widgets.recentOrders && (
            <div className={`${widgets.revenue ? "lg:col-span-3" : "lg:col-span-5"} bg-card border border-border rounded-xl p-5`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Recent Orders</h3>
                <button onClick={() => nav("/orders")} className="text-xs text-primary flex items-center gap-1 hover:underline">
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-2">
                {(stats.recentOrders ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No orders yet</p>
                ) : stats.recentOrders.slice(0, 5).map((order: any) => (
                  <div key={order.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => nav("/orders")}>
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                      <ShoppingCart className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {(order.shippingAddress as any)?.name ?? "—"} · {new Date(order.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">PKR {fmt(parseFloat(order.total))}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${STATUS_COLOR[order.status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                        {order.status?.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Marketing & WA Stats ── */}
      {widgets.marketing && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* WhatsApp Stats */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#25D366]/10 rounded-lg flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-[#25D366]" />
                </div>
                <h3 className="font-semibold">WhatsApp</h3>
              </div>
              <button onClick={() => nav("/whatsapp")} className="text-xs text-primary hover:underline flex items-center gap-1">
                Settings <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Received", value: stats.whatsapp.received, color: "text-blue-600" },
                { label: "Sent", value: stats.whatsapp.sent, color: "text-[#25D366]" },
                { label: "Failed", value: stats.whatsapp.failed, color: "text-red-500" },
              ].map(s => (
                <div key={s.label} className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className={`text-xl font-bold ${s.color}`}>{fmt(s.value)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs text-muted-foreground font-medium mb-2">Campaign Performance</p>
              <div className="space-y-1.5">
                {[
                  { label: "Campaign Messages Sent", value: stats.campaigns.sent },
                  { label: `Delivered (${waDlvPct}%)`, value: stats.campaigns.delivered },
                  { label: `Read (${waReadPct}%)`, value: stats.campaigns.read },
                  { label: "Failed", value: stats.campaigns.failed },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-semibold">{fmt(row.value)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => nav("/shopify/wa-inbox")}
                className="flex-1 text-xs bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 rounded-lg py-1.5 font-medium hover:bg-[#25D366]/20 transition-colors">
                Open WA Inbox
              </button>
              <button onClick={() => nav("/shopify/campaigns")}
                className="flex-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-lg py-1.5 font-medium hover:bg-primary/20 transition-colors">
                Campaigns
              </button>
            </div>
          </div>

          {/* Email Campaigns */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-pink-100 rounded-lg flex items-center justify-center">
                  <Mail className="w-4 h-4 text-pink-600" />
                </div>
                <h3 className="font-semibold">Email Campaigns</h3>
              </div>
              <button onClick={() => nav("/shopify/email-campaigns")} className="text-xs text-primary hover:underline flex items-center gap-1">
                Manage <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Total", value: stats.emailCampaigns.total, color: "text-pink-600" },
                { label: "Sent", value: stats.emailCampaigns.sent, color: "text-emerald-600" },
                { label: "Draft", value: stats.emailCampaigns.draft, color: "text-amber-600" },
              ].map(s => (
                <div key={s.label} className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className={`text-xl font-bold ${s.color}`}>{fmt(s.value)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <button onClick={() => nav("/shopify/marketing")}
              className="w-full text-xs bg-pink-50 text-pink-700 border border-pink-200 rounded-lg py-2 font-medium hover:bg-pink-100 transition-colors flex items-center justify-center gap-1.5 mt-2">
              <Zap className="w-3.5 h-3.5" /> Open Marketing Hub
            </button>

            {/* Abandoned carts summary inside email card */}
            {widgets.abandoned && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium flex items-center gap-1 text-amber-700">
                    <ShoppingBag className="w-3 h-3" /> Abandoned Carts
                  </p>
                  <button onClick={() => nav("/abandoned-checkouts")} className="text-xs text-primary hover:underline">View</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Active", value: stats.abandonedCheckouts, color: "text-amber-600" },
                    { label: "Recovered", value: stats.recoveredCheckouts, color: "text-emerald-600" },
                    { label: "Recovery %", value: `${stats.recoveryRate}%`, color: "text-blue-600" },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
                {stats.abandonedValue > 0 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    PKR {fmt(stats.abandonedValue)} at risk · Recoverable revenue
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Logistics + Activity Feed ── */}
      {(widgets.logistics || widgets.activityFeed) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {widgets.logistics && <LogisticsWidget />}
          {widgets.activityFeed && <ActivityFeed orders={stats.recentOrders ?? []} />}
        </div>
      )}

      {/* ── Quick Actions ── */}
      {widgets.quickActions && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {[
              { label: "Orders",     href: "/orders",              icon: ShoppingCart, color: "bg-blue-100   text-blue-700"          },
              { label: "Products",   href: "/products",            icon: Package,      color: "bg-orange-100 text-orange-700"         },
              { label: "Customers",  href: "/customers",           icon: Users,        color: "bg-violet-100 text-violet-700"         },
              { label: "WA Chat",    href: "/wa-chat",             icon: MessageCircle,color: "bg-[#25D366]/10 text-[#25D366]"       },
              { label: "Logistics",  href: "/logistics/lahore",    icon: Truck,        color: "bg-emerald-100 text-emerald-700"       },
              { label: "Campaigns",  href: "/shopify/campaigns",   icon: Send,         color: "bg-teal-100   text-teal-700"           },
              { label: "Analytics",  href: "/analytics",           icon: BarChart2,    color: "bg-indigo-100  text-indigo-700"        },
              { label: "Abandoned",  href: "/abandoned-checkouts", icon: ShoppingBag,  color: "bg-amber-100   text-amber-700"         },
            ].map(a => (
              <button key={a.href} onClick={() => nav(a.href)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted transition-colors group">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${a.color}`}>
                  <a.icon className="w-4 h-4" />
                </div>
                <span className="text-[11px] text-muted-foreground group-hover:text-foreground text-center leading-tight">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
