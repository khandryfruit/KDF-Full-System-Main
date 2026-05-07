import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type DashboardData } from "@/lib/api";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  ShoppingCart, TrendingUp, Users, Bike, Package,
  MapPin, ArrowRight, RefreshCw, Building2, Wifi, WifiOff,
  Star, Clock, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PKR = (n: number) =>
  n >= 1_000_000
    ? `₨${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `₨${(n / 1_000).toFixed(0)}K`
    : `₨${n.toFixed(0)}`;

const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "emerald",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
  };
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={cn("p-2.5 rounded-lg", colors[color] ?? colors.emerald)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BranchRow({ b }: { b: DashboardData["branches"][0] }) {
  return (
    <Link href={`/branches/${b.id}`}>
      <div className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors group">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-2 h-2 rounded-full flex-shrink-0",
            b.isActive ? "bg-emerald-500" : "bg-rose-400",
          )} />
          <div>
            <p className="text-sm font-medium text-foreground">{b.name}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" />{b.city}
              {b.isHeadOffice && (
                <Badge className="ml-1 text-[10px] h-4 px-1.5" variant="secondary">HQ</Badge>
              )}
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

function WebhookRow({ w }: { w: DashboardData["recentWebhooks"][0] }) {
  const topic = w.topic.replace("orders/", "").replace("customers/", "cust/").replace("products/", "prod/");
  return (
    <div className="flex items-center gap-2 py-1.5">
      {w.processed ? (
        <Wifi className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
      ) : (
        <WifiOff className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
      )}
      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{topic}</span>
      <span className="text-[10px] text-muted-foreground ml-auto">
        {new Date(w.received_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

export default function CentralDashboard() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["central-dashboard"],
    queryFn: api.getDashboard,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!data) return null;

  const { global: g, dailyRevenue, branchOrders, topCities, recentWebhooks, branches } = data;

  const revenueChartData = dailyRevenue.map((d) => ({
    day: d.day,
    revenue: Number(d.revenue),
    orders: d.orders,
  }));

  const cityPieData = topCities.slice(0, 6).map((c, i) => ({
    name: c.city || "Unknown",
    value: c.orders,
    color: CHART_COLORS[i],
  }));

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Central Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Khan Dry Fruits — All Branches Overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Link href="/branches">
            <Button size="sm" className="bg-primary text-primary-foreground">
              <Building2 className="h-4 w-4 mr-2" />
              Manage Branches
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Row 1 — Revenue */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard icon={TrendingUp} label="Today's Revenue" value={PKR(g.todayRevenue)} sub={`${g.todayOrders} orders`} color="emerald" />
        <StatCard icon={TrendingUp} label="Month Revenue" value={PKR(g.monthRevenue)} sub={`${g.monthOrders} orders`} color="blue" />
        <StatCard icon={ShoppingCart} label="Today's Orders" value={g.todayOrders} sub="all branches" color="amber" />
        <StatCard icon={ShoppingCart} label="Month Orders" value={g.monthOrders} sub="all branches" color="purple" />
      </div>

      {/* KPI Row 2 — Logistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Bike} label="Active Riders" value={g.activeRiders} color="emerald" />
        <StatCard icon={Package} label="Today Deliveries" value={g.todayDeliveries} color="blue" />
        <StatCard icon={Package} label="Total Deliveries" value={g.totalDeliveries} color="amber" />
        <StatCard icon={TrendingUp} label="COD Collected" value={PKR(g.codCollected)} color="rose" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Revenue Area Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Revenue — Last 14 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={revenueChartData}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => PKR(v)} tick={{ fontSize: 11 }} width={70} />
                <Tooltip
                  formatter={(v: number) => [PKR(v), "Revenue"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* City Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Orders by City (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={cityPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                  {cityPieData.map((e, i) => (
                    <Cell key={i} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 mt-2">
              {cityPieData.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                    <span className="text-muted-foreground">{c.name}</span>
                  </div>
                  <span className="font-medium">{c.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Branch Orders Bar */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Orders by City — This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={branchOrders.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="city" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Bar dataKey="orders" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Right Panel — Branches + Webhooks */}
        <div className="space-y-4">
          {/* Branches List */}
          <Card>
            <CardHeader className="pb-1 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Branches</CardTitle>
              <Link href="/branches">
                <span className="text-xs text-primary hover:underline cursor-pointer">Manage →</span>
              </Link>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              {branches.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No branches yet
                </div>
              ) : (
                branches.slice(0, 5).map((b) => <BranchRow key={b.id} b={b} />)
              )}
            </CardContent>
          </Card>

          {/* Webhook Activity */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Recent Webhooks
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {recentWebhooks.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No webhook activity</p>
              ) : (
                recentWebhooks.map((w, i) => <WebhookRow key={i} w={w} />)
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Top Nav */}
      <nav className="bg-sidebar border-b border-sidebar-border px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <Star className="h-4 w-4 text-sidebar" />
          </div>
          <div>
            <p className="text-sm font-bold text-sidebar-foreground">KDF Central</p>
            <p className="text-[10px] text-sidebar-foreground/60">Enterprise Retail Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-sidebar-foreground hover:bg-sidebar-accent text-xs h-8">
              Dashboard
            </Button>
          </Link>
          <Link href="/branches">
            <Button variant="ghost" size="sm" className="text-sidebar-foreground hover:bg-sidebar-accent text-xs h-8">
              Branches
            </Button>
          </Link>
        </div>
      </nav>
      <main className="p-6 max-w-7xl mx-auto">{children}</main>
    </div>
  );
}
