import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { api, type BranchStats } from "@/lib/api";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ChevronLeft, Building2, MapPin, Phone, Mail, User,
  ShoppingCart, TrendingUp, Package, Bike, Star, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const PKR = (n: number) =>
  n >= 1_000_000 ? `₨${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `₨${(n / 1_000).toFixed(0)}K` : `₨${n.toFixed(0)}`;

function KPI({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400",
  };
  return (
    <Card><CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={cn("p-2.5 rounded-lg", colors[color])}><Icon className="h-5 w-5" /></div>
      </div>
    </CardContent></Card>
  );
}

export default function BranchDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["branch-stats", id],
    queryFn: () => api.getBranchStats(Number(id)),
    refetchInterval: 60_000,
  });

  const revenue = data?.revenue;
  const orders = data?.orders;
  const riders = data?.riders;
  const branch = data?.branch;
  const dailyRevenue = data?.dailyRevenue ?? [];
  const topProducts = data?.topProducts ?? [];

  const targetProgress = branch?.monthlyTarget && revenue
    ? Math.min(100, (revenue.thisMonth / Number(branch.monthlyTarget)) * 100)
    : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
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
          <Link href="/"><Button variant="ghost" size="sm" className="text-sidebar-foreground hover:bg-sidebar-accent text-xs h-8">Dashboard</Button></Link>
          <Link href="/branches"><Button variant="ghost" size="sm" className="text-sidebar-foreground hover:bg-sidebar-accent text-xs h-8">Branches</Button></Link>
        </div>
      </nav>

      <main className="p-6 max-w-6xl mx-auto">
        {/* Back + Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/branches">
              <Button variant="ghost" size="sm" className="h-8"><ChevronLeft className="h-4 w-4 mr-1" />Branches</Button>
            </Link>
            {isLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-foreground">{branch?.name}</h1>
                  {branch?.isHeadOffice && (
                    <Badge className="text-[10px] bg-amber-100 text-amber-700"><Star className="h-2.5 w-2.5 mr-1" />HQ</Badge>
                  )}
                  <Badge variant={branch?.isActive ? "default" : "destructive"} className="text-[10px]">
                    {branch?.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  {branch?.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{branch.city}</span>}
                  {branch?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{branch.phone}</span>}
                  {branch?.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{branch.email}</span>}
                  {branch?.managerName && <span className="flex items-center gap-1"><User className="h-3 w-3" />{branch.managerName}</span>}
                </div>
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
              ))}
            </div>
          </div>
        ) : !data ? (
          <Card className="text-center py-16"><CardContent>
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">Branch not found</p>
          </CardContent></Card>
        ) : (
          <>
            {/* Monthly Target Progress */}
            {targetProgress !== null && (
              <Card className="mb-6">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Monthly Target Progress</p>
                    <span className="text-sm font-bold text-foreground">
                      {PKR(revenue!.thisMonth)} / {PKR(Number(branch?.monthlyTarget))}
                    </span>
                  </div>
                  <Progress value={targetProgress} className="h-2.5" />
                  <p className="text-xs text-muted-foreground mt-1">{targetProgress.toFixed(1)}% achieved this month</p>
                </CardContent>
              </Card>
            )}

            {/* Revenue KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <KPI icon={TrendingUp} label="Today Revenue" value={PKR(revenue!.today)} sub={`${orders!.today} orders`} color="emerald" />
              <KPI icon={TrendingUp} label="Month Revenue" value={PKR(revenue!.thisMonth)} sub={`${orders!.thisMonth} orders`} color="blue" />
              <KPI icon={ShoppingCart} label="Today Orders" value={orders!.today} color="amber" />
              <KPI icon={ShoppingCart} label="Month Orders" value={orders!.thisMonth} color="rose" />
            </div>

            {/* Order Status KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KPI icon={Package} label="Fulfilled" value={orders!.fulfilled} color="emerald" />
              <KPI icon={Package} label="Paid Orders" value={orders!.paid} color="blue" />
              <KPI icon={Package} label="COD Orders" value={orders!.cod} color="amber" />
              <KPI icon={Package} label="Cancelled" value={orders!.cancelled} color="rose" />
            </div>

            {/* Rider KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KPI icon={Bike} label="Active Riders" value={riders!.active} sub={`of ${riders!.total} total`} color="emerald" />
              <KPI icon={Bike} label="Today Deliveries" value={riders!.todayDeliveries} color="blue" />
              <KPI icon={Bike} label="Delivered" value={riders!.delivered} color="amber" />
              <KPI icon={TrendingUp} label="COD Collected" value={PKR(riders!.codCollected)} color="rose" />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Daily Revenue */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Daily Revenue — Last 7 Days</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={dailyRevenue.map((d) => ({ day: d.day, revenue: Number(d.revenue), orders: d.orders }))}>
                      <defs>
                        <linearGradient id="branchRevGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => PKR(v)} tick={{ fontSize: 10 }} width={65} />
                      <Tooltip
                        formatter={(v: number) => [PKR(v), "Revenue"]}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#branchRevGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Top Products */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Top Products — This Month</CardTitle>
                </CardHeader>
                <CardContent>
                  {topProducts.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                      No order data for this city yet
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={topProducts} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis dataKey="product" type="category" tick={{ fontSize: 10 }} width={100}
                          tickFormatter={(v) => v.length > 14 ? v.slice(0, 13) + "…" : v} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                        />
                        <Bar dataKey="total_qty" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Qty Sold" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
