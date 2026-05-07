import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart2, TrendingUp, ShoppingCart, MessageCircle,
  DollarSign, Users, Package, AlertTriangle, CheckCircle2,
  RefreshCw, Loader2, XCircle, RotateCcw, Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ Authorization: `Bearer ${ADMIN_TOKEN()}` });
async function apiFetch(url: string) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmt(n: number | string) {
  return parseFloat(String(n)).toLocaleString("en-PK");
}

function StatCard({
  title, value, sub, icon: Icon, color, badge, badgeColor,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <Card className={`border-l-4 ${color}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        {badge && (
          <Badge variant="outline" className={`mt-1.5 text-xs ${badgeColor}`}>{badge}</Badge>
        )}
      </CardContent>
    </Card>
  );
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground truncate max-w-[60%]">{label}</span>
        <span className="font-medium">{value.toLocaleString()}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["/api/admin/analytics"],
    queryFn: () => apiFetch("/api/admin/analytics"),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <p>Failed to load analytics</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }

  const { orders, abandoned, whatsapp, paymentMethods, conversionRate, dailyRevenue, topProducts } = data as any;

  const maxProductQty = Math.max(...(topProducts ?? []).map((p: any) => Number(p.totalQty ?? 0)), 1);
  const maxDailyRevenue = Math.max(...(dailyRevenue ?? []).map((d: any) => parseFloat(d.revenue ?? "0")), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" />
            Analytics Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time overview of orders, payments, and customer engagement</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </Button>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Revenue"
          value={`Rs. ${fmt(orders.revenue)}`}
          sub={`${orders.total} total orders`}
          icon={DollarSign}
          color="border-l-primary"
        />
        <StatCard
          title="Paid Revenue"
          value={`Rs. ${fmt(orders.paidRevenue)}`}
          sub={`${orders.paid} paid orders`}
          icon={CheckCircle2}
          color="border-l-green-500"
          badge="Collected"
          badgeColor="bg-green-50 text-green-700 border-green-200"
        />
        <StatCard
          title="Pending Revenue"
          value={`Rs. ${fmt(orders.pendingRevenue)}`}
          sub={`${orders.unpaid + orders.pendingPayment} unpaid orders`}
          icon={AlertTriangle}
          color="border-l-yellow-500"
          badge="To collect"
          badgeColor="bg-yellow-50 text-yellow-700 border-yellow-200"
        />
        <StatCard
          title="Avg. Order Value"
          value={`Rs. ${fmt(parseFloat(orders.avgOrderValue).toFixed(0))}`}
          sub={`${orders.delivered} orders delivered`}
          icon={TrendingUp}
          color="border-l-blue-500"
        />
      </div>

      {/* Second row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Conversion Rate"
          value={`${conversionRate}%`}
          sub="Orders / (Orders + Abandoned)"
          icon={Percent}
          color="border-l-indigo-500"
        />
        <StatCard
          title="Abandoned Carts"
          value={abandoned.active}
          sub={`Rs. ${fmt(abandoned.activeValue)} potential revenue`}
          icon={ShoppingCart}
          color="border-l-orange-500"
          badge={`${abandoned.recoveryRate}% recovered`}
          badgeColor="bg-orange-50 text-orange-700 border-orange-200"
        />
        <StatCard
          title="Recovered Checkouts"
          value={abandoned.recovered}
          sub={`${abandoned.total} total abandoned ever`}
          icon={RotateCcw}
          color="border-l-teal-500"
        />
        <StatCard
          title="WhatsApp Sent"
          value={whatsapp.sent}
          sub={`${whatsapp.failed} failed, ${whatsapp.total} total`}
          icon={MessageCircle}
          color="border-l-[#25D366]"
        />
      </div>

      {/* Payment Status Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              Payment Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-green-50 border border-green-100 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{orders.paid}</p>
                <p className="text-xs text-green-600 font-medium mt-0.5">Paid</p>
              </div>
              <div className="rounded-xl bg-yellow-50 border border-yellow-100 p-3 text-center">
                <p className="text-2xl font-bold text-yellow-700">{orders.pendingPayment}</p>
                <p className="text-xs text-yellow-600 font-medium mt-0.5">Pending</p>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{orders.unpaid}</p>
                <p className="text-xs text-red-600 font-medium mt-0.5">Unpaid</p>
              </div>
            </div>
            <div className="space-y-2 pt-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium text-green-700">Rs. {fmt(orders.paidRevenue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Unpaid / Pending</span>
                <span className="font-medium text-yellow-700">Rs. {fmt(orders.pendingRevenue)}</span>
              </div>
            </div>

            {/* Payment methods */}
            {paymentMethods?.length > 0 && (
              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Payment Methods</p>
                {paymentMethods.map((pm: any) => (
                  <div key={pm.method} className="flex justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{pm.method ?? "unknown"}</span>
                    <span className="font-medium">{pm.count} orders · Rs. {fmt(parseFloat(pm.revenue ?? "0").toFixed(0))}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-orange-500" />
              Abandoned Cart Funnel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 text-center">
                <p className="text-2xl font-bold text-orange-700">{abandoned.active}</p>
                <p className="text-xs text-orange-600 font-medium mt-0.5">Active Carts</p>
              </div>
              <div className="rounded-xl bg-teal-50 border border-teal-100 p-3 text-center">
                <p className="text-2xl font-bold text-teal-700">{abandoned.recovered}</p>
                <p className="text-xs text-teal-600 font-medium mt-0.5">Recovered</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Potential Revenue at Risk</span>
                <span className="font-semibold text-orange-700">Rs. {fmt(abandoned.activeValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Abandoned (all time)</span>
                <span className="font-medium">{abandoned.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recovery Rate</span>
                <span className="font-semibold text-teal-700">{abandoned.recoveryRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expired (48h+)</span>
                <span className="text-muted-foreground">{abandoned.expired}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-border space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">WhatsApp Recovery</p>
              <div className="flex items-center gap-2 text-sm">
                <MessageCircle className="w-4 h-4 text-[#25D366]" />
                <span className="text-muted-foreground">Messages sent</span>
                <span className="ml-auto font-semibold">{whatsapp.sent}</span>
              </div>
              {whatsapp.failed > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-muted-foreground">Failed</span>
                  <span className="ml-auto text-red-600 font-medium">{whatsapp.failed}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Products + Daily Revenue */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Top Products by Sales
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!(topProducts as any[])?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No product data yet</p>
            ) : (
              (topProducts as any[]).slice(0, 8).map((p: any) => (
                <MiniBar
                  key={p.name}
                  label={p.name}
                  value={Number(p.totalQty)}
                  max={maxProductQty}
                  color="bg-primary"
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              Daily Revenue (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!(dailyRevenue as any[])?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No revenue data yet</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {[...(dailyRevenue as any[])].reverse().slice(0, 20).map((d: any) => (
                  <div key={d.date} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{new Date(d.date).toLocaleDateString("en-PK", { month: "short", day: "numeric" })}</span>
                      <span className="font-medium">Rs. {fmt(parseFloat(d.revenue).toFixed(0))} · {d.orders} orders</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${Math.max(2, (parseFloat(d.revenue) / maxDailyRevenue) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order Status Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            Order Status Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[
              { label: "Pending", value: (data as any).orders?.total - (data as any).orders?.delivered - (data as any).orders?.cancelled, color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
              { label: "Delivered", value: orders.delivered, color: "bg-green-100 text-green-800 border-green-200" },
              { label: "Cancelled", value: orders.cancelled, color: "bg-red-100 text-red-800 border-red-200" },
              { label: "Paid", value: orders.paid, color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
              { label: "Unpaid", value: orders.unpaid, color: "bg-orange-100 text-orange-800 border-orange-200" },
              { label: "Total", value: orders.total, color: "bg-blue-100 text-blue-800 border-blue-200" },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-xl border px-3 py-3 text-center ${color}`}>
                <p className="text-xl font-bold">{value}</p>
                <p className="text-xs font-medium mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
