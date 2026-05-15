import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity, RefreshCw, Play, RotateCcw, Truck, MessageCircle,
  AlertTriangle, CheckCircle2, Loader2, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApiUrl } from "@/lib/apiBase";

function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(adminApiUrl(path), {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data;
  });
}

function fmt(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function OrderAutomationDashboardPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [hours, setHours] = useState(48);
  const [manualOrderId, setManualOrderId] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["order-automation-dashboard", hours],
    queryFn: () => api(`/admin/order-automation/dashboard?hours=${hours}`),
    refetchInterval: 60_000,
  });

  const { data: funnelData } = useQuery({
    queryKey: ["wa-template-funnel", hours],
    queryFn: () => api(`/admin/whatsapp/template-funnel?hours=${hours}`),
    refetchInterval: 60_000,
  });

  const { data: failedLogs = [] } = useQuery({
    queryKey: ["wa-message-logs-failed"],
    queryFn: () => api("/admin/whatsapp/message-logs?status=failed&limit=30"),
    refetchInterval: 60_000,
  });

  const retryWaLog = useMutation({
    mutationFn: (logId: number) => api(`/admin/whatsapp/message-logs/${logId}/retry`, { method: "POST" }),
    onSuccess: () => toast({ title: "WhatsApp retry sent" }),
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const retryAll = useMutation({
    mutationFn: () => api("/admin/order-automation/retry-all", { method: "POST" }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["order-automation-dashboard"] });
      toast({ title: "Retries processed", description: `Automation: ${r.automation}, Lahore: ${r.lahore}` });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const retryOne = useMutation({
    mutationFn: (logId: number) => api(`/admin/order-automation/retry/${logId}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-automation-dashboard"] });
      toast({ title: "Retry completed" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const runManual = useMutation({
    mutationFn: (orderId: number) => api(`/admin/order-automation/run/${orderId}`, { method: "POST" }),
    onSuccess: (r) => toast({ title: "Automation run", description: r.message }),
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const assignLahore = useMutation({
    mutationFn: (orderId: number) => api(`/admin/order-automation/assign-lahore/${orderId}`, { method: "POST" }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["order-automation-dashboard"] });
      toast({ title: r.assigned ? "Rider assigned" : "Assign result", description: r.message });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const stats = (data?.stats ?? {}) as Record<string, number>;
  const settings = data?.settings ?? {};
  const failures: any[] = data?.recentFailures ?? [];
  const pending: any[] = data?.pendingLahoreOrders ?? [];
  const waFails: any[] = data?.failedWhatsApp ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Order Automation
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Shopify → rider assign → customer WhatsApp — live health & retries
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            className="w-20 h-9"
            value={hours}
            onChange={(e) => setHours(Math.min(168, Math.max(1, parseInt(e.target.value, 10) || 48)))}
            title="Hours window"
          />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={retryAll.isPending}
            onClick={() => retryAll.mutate()}
          >
            {retryAll.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Retry all
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Success" value={stats.success_count ?? 0} tone="green" icon={CheckCircle2} />
          <StatCard label="Failed" value={stats.failed_count ?? 0} tone="red" icon={AlertTriangle} />
          <StatCard label="Rider assigns" value={stats.assigns_ok ?? 0} tone="blue" icon={Truck} />
          <StatCard label="Confirm WA" value={stats.confirms_ok ?? 0} tone="purple" icon={MessageCircle} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <div className="bg-card border rounded-xl p-4 space-y-2">
          <p className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Riders online</p>
          <p className="text-2xl font-bold">{data?.onlineRiders ?? 0}</p>
          <p className="text-muted-foreground text-xs">
            Auto delivery: {settings.auto_delivery_mode !== false ? "on" : "off"} ·
            WA on assign: {settings.auto_wa_on_assign !== false ? "on" : "off"} ·
            WA on status: {settings.auto_wa_on_status !== false ? "on" : "off"}
          </p>
        </div>
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <p className="font-semibold flex items-center gap-2"><Play className="w-4 h-4" /> Manual actions</p>
          <div className="flex gap-2">
            <Input
              placeholder="Shopify order DB id"
              value={manualOrderId}
              onChange={(e) => setManualOrderId(e.target.value)}
              className="h-9"
            />
            <Button
              size="sm"
              disabled={!manualOrderId || runManual.isPending}
              onClick={() => runManual.mutate(parseInt(manualOrderId, 10))}
            >
              Run
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!manualOrderId || assignLahore.isPending}
              onClick={() => assignLahore.mutate(parseInt(manualOrderId, 10))}
            >
              Assign Lahore
            </Button>
          </div>
        </div>
      </div>

      <Section title="WhatsApp template funnel" count={(funnelData?.funnel ?? []).length}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Delivered</TableHead>
              <TableHead>Read</TableHead>
              <TableHead>Failed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(funnelData?.funnel ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No template sends in window</TableCell></TableRow>
            ) : (funnelData.funnel as any[]).map((row: any) => (
              <TableRow key={row.template}>
                <TableCell className="font-mono text-xs">{row.template}</TableCell>
                <TableCell>{row.sent}</TableCell>
                <TableCell>{row.delivered}</TableCell>
                <TableCell>{row.read_count}</TableCell>
                <TableCell className={row.failed > 0 ? "text-red-600 font-medium" : ""}>{row.failed}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Failed WhatsApp sends (retry)" count={Array.isArray(failedLogs) ? failedLogs.length : 0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phone</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Error</TableHead>
              <TableHead>When</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!Array.isArray(failedLogs) || failedLogs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No failures</TableCell></TableRow>
            ) : failedLogs.map((row: any) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.phone}</TableCell>
                <TableCell>{row.trigger_event ?? row.templateName ?? "—"}</TableCell>
                <TableCell className="text-xs text-red-600 max-w-[200px] truncate">{row.failure_reason ?? row.response?.slice?.(0, 80) ?? "—"}</TableCell>
                <TableCell className="text-xs">{fmt(row.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" disabled={retryWaLog.isPending} onClick={() => retryWaLog.mutate(row.id)}>
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Recent automation failures" count={failures.length}>
        <FailuresTable
          rows={failures}
          onRetry={(id) => retryOne.mutate(id)}
          retrying={retryOne.isPending}
        />
      </Section>

      <Section title="Pending Lahore (no rider)" count={pending.length}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">None pending</TableCell></TableRow>
            ) : pending.map((row: any) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.order_number}</TableCell>
                <TableCell>{row.customer_name ?? "—"}</TableCell>
                <TableCell>{row.delivery_id ? `#${row.delivery_id}` : "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => assignLahore.mutate(Number(row.id))}>
                    Assign
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Failed customer WhatsApp" count={waFails.length}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Delivery</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Error</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {waFails.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No failures</TableCell></TableRow>
            ) : waFails.map((row: any) => (
              <TableRow key={row.id}>
                <TableCell>#{row.delivery_id}</TableCell>
                <TableCell><Badge variant="outline">{row.event_type}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{row.phone ?? "—"}</TableCell>
                <TableCell className="text-xs text-red-600 max-w-[200px] truncate">{row.error_message ?? "—"}</TableCell>
                <TableCell className="text-xs">{fmt(row.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}

function StatCard({ label, value, tone, icon: Icon }: { label: string; value: number; tone: string; icon: React.ComponentType<{ className?: string }> }) {
  const colors: Record<string, string> = {
    green: "bg-green-50 border-green-200 text-green-700",
    red: "bg-red-50 border-red-200 text-red-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
  };
  return (
    <div className={`border rounded-xl px-4 py-3 ${colors[tone] ?? colors.blue}`}>
      <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
        <Icon className="w-3.5 h-3.5" />{label}
      </p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function FailuresTable({ rows, onRetry, retrying }: { rows: any[]; onRetry: (id: number) => void; retrying: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>Message</TableHead>
          <TableHead>Retries</TableHead>
          <TableHead>When</TableHead>
          <TableHead className="text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No failures in window</TableCell></TableRow>
        ) : rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-mono text-xs">{row.order_number ?? "—"}</TableCell>
            <TableCell><Badge variant="outline">{row.event_type}</Badge></TableCell>
            <TableCell className="text-xs max-w-[240px]">
              <p>{row.message}</p>
              {row.error_message && <p className="text-red-600 mt-0.5">{row.error_message}</p>}
            </TableCell>
            <TableCell>{row.retry_count ?? 0}</TableCell>
            <TableCell className="text-xs">{fmt(row.created_at)}</TableCell>
            <TableCell className="text-right">
              <Button size="sm" variant="ghost" disabled={retrying} onClick={() => onRetry(row.id)}>
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
