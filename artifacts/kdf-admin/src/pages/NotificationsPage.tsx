import { useState } from "react";
import { Bell, Send, RefreshCw, Users, CheckCircle2, XCircle, Clock, Megaphone, Package, Tag, AlertCircle } from "lucide-react";
import { useListNotifications, useSendNotification } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const TYPE_LABELS: Record<string, string> = {
  order_update: "Order Update",
  promotion: "Promotion",
  general: "General",
};

const TYPE_ICON: Record<string, React.ReactElement> = {
  order_update: <Package className="w-4 h-4" />,
  promotion: <Tag className="w-4 h-4" />,
  general: <Megaphone className="w-4 h-4" />,
};

const TYPE_COLOR: Record<string, string> = {
  order_update: "bg-blue-100 text-blue-700",
  promotion: "bg-orange-100 text-orange-700",
  general: "bg-gray-100 text-gray-700",
};

const STATUS_COLOR: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

const STATUS_ICON: Record<string, React.ReactElement> = {
  sent: <CheckCircle2 className="w-3.5 h-3.5" />,
  pending: <Clock className="w-3.5 h-3.5" />,
  failed: <XCircle className="w-3.5 h-3.5" />,
};

export default function NotificationsPage() {
  const { toast } = useToast();

  /* ── State ── */
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    message: "",
    type: "general",
    isBroadcast: true,
    userIds: "",
  });

  /* ── Data ── */
  const { data, isLoading, refetch } = useListNotifications(
    {
      page,
      limit: 20,
      ...(typeFilter !== "all" ? { type: typeFilter as any } : {}),
      ...(statusFilter !== "all" ? { status: statusFilter as any } : {}),
    },
    { query: { queryKey: ["notifications", page, typeFilter, statusFilter] } }
  );

  const sendMutation = useSendNotification({
    mutation: {
      onSuccess: () => {
        toast({ title: "Notification sent!", description: "Your push notification has been dispatched." });
        setDialogOpen(false);
        setForm({ title: "", message: "", type: "general", isBroadcast: true, userIds: "" });
        refetch();
      },
      onError: () => {
        toast({ title: "Send failed", description: "Could not send notification.", variant: "destructive" });
      },
    },
  });

  const handleSend = () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast({ title: "Missing fields", description: "Title and message are required.", variant: "destructive" });
      return;
    }
    const payload: any = {
      title: form.title.trim(),
      message: form.message.trim(),
      type: form.type as any,
      isBroadcast: form.isBroadcast,
    };
    if (!form.isBroadcast && form.userIds.trim()) {
      payload.userIds = form.userIds.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    }
    sendMutation.mutate({ data: payload });
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  /* ── Summary stats from current page ── */
  const sentCount = items.filter(n => n.status === "sent").length;
  const failedCount = items.filter(n => n.status === "failed").length;
  const broadcastCount = items.filter(n => n.isBroadcast).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Push Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Send and manage push notifications to your customers
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Send className="w-4 h-4 mr-2" />
            New Notification
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Sent</p>
          <p className="text-2xl font-bold text-foreground">{total}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Success (this page)</p>
          <p className="text-2xl font-bold text-green-600">{sentCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Failed (this page)</p>
          <p className="text-2xl font-bold text-red-500">{failedCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Broadcast (this page)</p>
          <p className="text-2xl font-bold text-primary">{broadcastCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="order_update">Order Update</SelectItem>
            <SelectItem value="promotion">Promotion</SelectItem>
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Notifications Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Loading notifications…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-semibold text-muted-foreground">No notifications found</p>
            <p className="text-sm text-muted-foreground mt-1">Send your first notification using the button above</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title / Message</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Delivery</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sent At</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map(n => (
                    <tr key={n.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 max-w-xs">
                        <p className="font-semibold text-foreground truncate">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.message}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_COLOR[n.type] ?? "bg-gray-100 text-gray-700"}`}>
                          {TYPE_ICON[n.type]}
                          {TYPE_LABELS[n.type] ?? n.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {n.isBroadcast ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <Users className="w-3.5 h-3.5" /> All Users
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">User #{n.userId}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {n.recipientCount != null ? (
                          <span>
                            <span className="text-green-600 font-medium">{n.successCount ?? 0} ✓</span>
                            {(n.failureCount ?? 0) > 0 && (
                              <span className="text-red-500 font-medium ml-1">{n.failureCount} ✗</span>
                            )}
                            <span className="ml-1 text-muted-foreground">/ {n.recipientCount}</span>
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[n.status] ?? ""}`}>
                          {STATUS_ICON[n.status]}
                          {n.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {n.sentAt ? format(new Date(n.sentAt), "MMM d, HH:mm") : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-xs text-muted-foreground">{total} total notifications</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* FCM key not configured warning */}
      {!isLoading && items.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3 text-sm">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">Firebase setup required for live push notifications</p>
            <p className="text-amber-700 mt-0.5">
              Set the <code className="bg-amber-100 px-1 rounded">FCM_SERVER_KEY</code> environment variable with your Firebase Cloud Messaging server key.
              Notifications are stored in the database even without FCM configured.
            </p>
          </div>
        </div>
      )}

      {/* Send Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Send Push Notification
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                placeholder="e.g. 🎉 Flash Sale Today!"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground text-right">{form.title.length}/100</p>
            </div>

            <div className="space-y-1.5">
              <Label>Message *</Label>
              <Textarea
                placeholder="Notification body text shown to users…"
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                rows={3}
                maxLength={250}
              />
              <p className="text-xs text-muted-foreground text-right">{form.message.length}/250</p>
            </div>

            <div className="space-y-1.5">
              <Label>Notification Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="promotion">Promotion</SelectItem>
                  <SelectItem value="order_update">Order Update</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
              <div>
                <p className="text-sm font-medium">Broadcast to all users</p>
                <p className="text-xs text-muted-foreground">Send to every registered device</p>
              </div>
              <Switch
                checked={form.isBroadcast}
                onCheckedChange={v => setForm(f => ({ ...f, isBroadcast: v }))}
              />
            </div>

            {!form.isBroadcast && (
              <div className="space-y-1.5">
                <Label>User IDs (comma-separated)</Label>
                <Input
                  placeholder="e.g. 1, 5, 12, 34"
                  value={form.userIds}
                  onChange={e => setForm(f => ({ ...f, userIds: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Enter specific user IDs to target</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={sendMutation.isPending}>
              {sendMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> Send Notification</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
