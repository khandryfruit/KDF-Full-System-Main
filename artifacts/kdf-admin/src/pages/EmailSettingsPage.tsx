import { useState, useEffect } from "react";
import {
  Mail, Save, TestTube2, CheckCircle, AlertCircle, Eye, EyeOff,
  Loader2, ChevronDown, Send, Inbox, Trash2, RefreshCw,
  ShoppingCart, CreditCard, XCircle, Truck, User, Package,
  MapPin, RotateCcw, FileText, Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}`,
  "Content-Type": "application/json",
});
const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });

/* ─────────────────────────────────────────────────
   Types
───────────────────────────────────────────────── */
interface EmailSettings {
  id?: number;
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  smtpPassSet: boolean;
  /* automations */
  orderConfirmEnabled: boolean;    orderConfirmSubject: string;
  orderPaidEnabled: boolean;       orderPaidSubject: string;
  orderCancelledEnabled: boolean;  orderCancelledSubject: string;
  courierBookedEnabled: boolean;   courierBookedSubject: string;
  riderAssignedEnabled: boolean;   riderAssignedSubject: string;
  outForDeliveryEnabled: boolean;  outForDeliverySubject: string;
  deliveredEnabled: boolean;       deliveredSubject: string;
  refundEnabled: boolean;          refundSubject: string;
  invoiceEnabled: boolean;         invoiceSubject: string;
}

interface EmailLog {
  id: number;
  type: string;
  to: string;
  subject: string;
  status: "sent" | "failed";
  errorMessage?: string;
  orderNumber?: string;
  createdAt: string;
}

const DEFAULT: EmailSettings = {
  emailEnabled: false,
  smtpHost: "", smtpPort: 465, smtpUser: "", smtpFrom: "", smtpPassSet: false,
  orderConfirmEnabled: true,    orderConfirmSubject: "Your KDF Nuts Order Confirmation",
  orderPaidEnabled: true,       orderPaidSubject: "Payment Confirmed — KDF Nuts Order #{{orderNumber}}",
  orderCancelledEnabled: true,  orderCancelledSubject: "Your KDF Nuts Order Has Been Cancelled",
  courierBookedEnabled: true,   courierBookedSubject: "Your Order Is Dispatched — Tracking #{{trackingId}}",
  riderAssignedEnabled: true,   riderAssignedSubject: "Rider Assigned — Your KDF Nuts Order Is Coming",
  outForDeliveryEnabled: true,  outForDeliverySubject: "Your Order Is Out For Delivery Today!",
  deliveredEnabled: true,       deliveredSubject: "Order Delivered — Thank You! 🎉",
  refundEnabled: true,          refundSubject: "Refund Processed — KDF Nuts Order #{{orderNumber}}",
  invoiceEnabled: false,        invoiceSubject: "Invoice for Order #{{orderNumber}}",
};

const SMTP_PRESETS = [
  { label: "Hostinger",         host: "smtp.hostinger.com",       port: 465 },
  { label: "Titan Email",       host: "smtp.titan.email",         port: 465 },
  { label: "Gmail",             host: "smtp.gmail.com",           port: 587 },
  { label: "Outlook / Office",  host: "smtp-mail.outlook.com",    port: 587 },
  { label: "Zoho Mail",         host: "smtp.zoho.com",            port: 465 },
  { label: "SendGrid",          host: "smtp.sendgrid.net",        port: 587 },
  { label: "Mailgun",           host: "smtp.mailgun.org",         port: 587 },
  { label: "Amazon SES",        host: "email-smtp.us-east-1.amazonaws.com", port: 587 },
  { label: "Custom…",           host: "",                         port: 587 },
];

const AUTOMATION_LIST = [
  { key: "orderConfirm",    label: "Order Confirmation",   icon: ShoppingCart, desc: "Sent when a new order is placed",                     trigger: "Order placed" },
  { key: "orderPaid",       label: "Payment Confirmed",    icon: CreditCard,   desc: "Sent when payment is marked as paid",                  trigger: "Payment → paid" },
  { key: "orderCancelled",  label: "Order Cancelled",      icon: XCircle,      desc: "Sent when an order is cancelled",                      trigger: "Status → cancelled" },
  { key: "courierBooked",   label: "Courier Booked",       icon: Truck,        desc: "Sent when a shipment is booked with tracking details", trigger: "Shipment created" },
  { key: "riderAssigned",   label: "Rider Assigned",       icon: User,         desc: "Sent when a local rider is assigned to Lahore order",  trigger: "Rider assigned" },
  { key: "outForDelivery",  label: "Out For Delivery",     icon: MapPin,       desc: "Sent when order status is set to out_for_delivery",    trigger: "Status → out_for_delivery" },
  { key: "delivered",       label: "Order Delivered",      icon: Package,      desc: "Sent when order is marked delivered",                  trigger: "Status → delivered" },
  { key: "refund",          label: "Refund Processed",     icon: RotateCcw,    desc: "Sent when order status is set to refunded",            trigger: "Status → refunded" },
  { key: "invoice",         label: "Invoice Email",        icon: FileText,     desc: "Invoice attachment (coming soon)",                     trigger: "Manual trigger" },
] as const;

const LOG_TYPE_LABELS: Record<string, string> = {
  order_confirm: "Order Confirm", order_paid: "Payment", order_cancelled: "Cancelled",
  courier_booked: "Courier Booked", rider_assigned: "Rider Assigned",
  out_for_delivery: "Out for Delivery", delivered: "Delivered",
  refund: "Refund", invoice: "Invoice", test: "Test Email",
};

type Tab = "smtp" | "automations" | "logs";

/* ─────────────────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────────────────── */
export default function EmailSettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("smtp");
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT);
  const [smtpPass, setSmtpPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testStatus, setTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/email-settings")
      .then(r => r.json())
      .then(d => setSettings({ ...DEFAULT, ...d }))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === "logs") loadLogs();
  }, [activeTab]);

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const r = await apiFetch("/api/admin/email-logs");
      const data = await r.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch { setLogs([]); }
    finally { setLogsLoading(false); }
  };

  const set = <K extends keyof EmailSettings>(k: K, v: EmailSettings[K]) =>
    setSettings(s => ({ ...s, [k]: v }));

  const applyPreset = (preset: typeof SMTP_PRESETS[0]) => {
    if (preset.host) setSettings(s => ({ ...s, smtpHost: preset.host, smtpPort: preset.port }));
    setShowPresets(false);
  };

  const save = async () => {
    setIsSaving(true);
    setTestStatus(null);
    try {
      const body: any = { ...settings };
      if (smtpPass) body.smtpPass = smtpPass;
      delete body.smtpPassSet;
      const r = await apiFetch("/api/admin/email-settings", { method: "PATCH", body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json())?.error ?? "Save failed");
      const d = await r.json();
      setSettings({ ...DEFAULT, ...d });
      setSmtpPass("");
      toast({ title: "Settings saved", description: "Email configuration has been saved successfully." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    setIsTesting(true);
    setTestStatus(null);
    try {
      const r = await apiFetch("/api/admin/email-settings/test", { method: "POST" });
      const d = await r.json();
      setTestStatus({ ok: r.ok, msg: r.ok ? (d.message ?? "SMTP OK") : (d.error ?? "Failed") });
    } catch {
      setTestStatus({ ok: false, msg: "Request failed — check network" });
    } finally {
      setIsTesting(false);
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail) return;
    setIsSendingTest(true);
    try {
      const r = await apiFetch("/api/admin/email-settings/send-test", {
        method: "POST",
        body: JSON.stringify({ to: testEmail }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      toast({ title: "Test email sent!", description: `Delivered to ${testEmail}` });
      setTestEmail("");
      if (activeTab === "logs") loadLogs();
    } catch (e: any) {
      toast({ title: "Test email failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSendingTest(false);
    }
  };

  const clearLogs = async () => {
    setIsClearingLogs(true);
    try {
      await apiFetch("/api/admin/email-logs", { method: "DELETE" });
      setLogs([]);
      toast({ title: "Logs cleared" });
    } catch {
      toast({ title: "Failed to clear logs", variant: "destructive" });
    } finally {
      setIsClearingLogs(false);
    }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "smtp",        label: "SMTP Config",     icon: Mail },
    { id: "automations", label: "Automations",     icon: Bell },
    { id: "logs",        label: "Email Logs",      icon: Inbox },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Mail className="w-6 h-6" /> Email Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure SMTP and manage all email automations across the platform.
        </p>
      </div>

      {/* Master toggle */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Email System</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {settings.emailEnabled
                  ? "All configured automations are active"
                  : "All emails are disabled — enable to start sending"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium ${settings.emailEnabled ? "text-green-600" : "text-muted-foreground"}`}>
                {settings.emailEnabled ? "Enabled" : "Disabled"}
              </span>
              <Switch checked={settings.emailEnabled} onCheckedChange={v => set("emailEnabled", v)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: SMTP Config ── */}
      {activeTab === "smtp" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">SMTP Configuration</CardTitle>
              <CardDescription>Your outgoing mail server credentials. Save settings before testing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Provider preset */}
              <div className="relative">
                <Label className="mb-1.5 block text-sm">Email Provider — Quick Setup</Label>
                <button
                  type="button"
                  onClick={() => setShowPresets(v => !v)}
                  className="flex items-center justify-between w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-muted/50 transition-colors"
                >
                  <span className="text-muted-foreground">
                    {SMTP_PRESETS.find(p => p.host === settings.smtpHost)?.label ?? (settings.smtpHost || "Choose provider…")}
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
                {showPresets && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
                    {SMTP_PRESETS.map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
                      >
                        <span className="font-medium">{p.label}</span>
                        {p.host && <span className="text-muted-foreground text-xs">{p.host}:{p.port}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="smtpHost">SMTP Host</Label>
                  <Input id="smtpHost" value={settings.smtpHost} onChange={e => set("smtpHost", e.target.value)} placeholder="smtp.hostinger.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtpPort">Port</Label>
                  <div className="flex gap-2">
                    <Input id="smtpPort" type="number" value={settings.smtpPort} onChange={e => set("smtpPort", Number(e.target.value))} className="flex-1" />
                    <div className="flex gap-1">
                      {[465, 587].map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => set("smtpPort", p)}
                          className={`px-2 py-1 rounded text-xs border transition-colors ${settings.smtpPort === p ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-muted"}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">465 = SSL · 587 = TLS</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtpUser">SMTP Username / Email</Label>
                <Input id="smtpUser" value={settings.smtpUser} onChange={e => set("smtpUser", e.target.value)} placeholder="orders@yourdomain.com" />
              </div>

              <div className="space-y-1.5">
                <Label>SMTP Password / App Password</Label>
                <input type="text" style={{ display: "none" }} aria-hidden="true" readOnly tabIndex={-1} />
                <input type="password" style={{ display: "none" }} aria-hidden="true" readOnly tabIndex={-1} />
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={smtpPass}
                    onChange={e => setSmtpPass(e.target.value)}
                    placeholder={settings.smtpPassSet ? "Password saved — type new one to update" : "Enter your email account password"}
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    spellCheck={false}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors pr-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {settings.smtpPassSet && (
                  <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Password is saved securely — leave blank to keep existing, or type a new one to update
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Use your email account password. For Gmail, create an App Password in your Google account.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtpFrom">From Address (optional)</Label>
                <Input id="smtpFrom" value={settings.smtpFrom} onChange={e => set("smtpFrom", e.target.value)} placeholder='KDF NUTS <orders@kdfnuts.com>' />
                <p className="text-xs text-muted-foreground">Shown as sender name in emails. Defaults to SMTP username if blank.</p>
              </div>

              <div className="flex items-center gap-3 flex-wrap pt-1">
                <Button onClick={save} disabled={isSaving} className="gap-2">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Settings
                </Button>
                <Button onClick={testConnection} disabled={isTesting || !settings.smtpHost} variant="outline" className="gap-2">
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4" />}
                  Test Connection
                </Button>
              </div>

              {testStatus && (
                <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2.5 ${testStatus.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {testStatus.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  <span>{testStatus.msg}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Send test email */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Send Test Email</CardTitle>
              <CardDescription>Verify delivery by sending a real email to any address. Save settings first.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  placeholder="Recipient email address"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendTestEmail()}
                  type="email"
                  className="flex-1"
                />
                <Button onClick={sendTestEmail} disabled={isSendingTest || !testEmail || !settings.smtpHost} className="gap-2 shrink-0">
                  {isSendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                The test email includes your SMTP configuration details for verification.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tab: Automations ── */}
      {activeTab === "automations" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Order Email Automations</CardTitle>
              <CardDescription>
                Each automation fires automatically when its trigger event occurs.
                The customer must have an email address in their order for emails to be sent.
                Use <code className="text-xs bg-muted px-1 rounded">{"{{orderNumber}}"}</code> and{" "}
                <code className="text-xs bg-muted px-1 rounded">{"{{trackingId}}"}</code> in subjects as dynamic variables.
              </CardDescription>
            </CardHeader>
          </Card>

          {AUTOMATION_LIST.map(item => {
            const enabledKey = `${item.key}Enabled` as keyof EmailSettings;
            const subjectKey = `${item.key}Subject` as keyof EmailSettings;
            const isEnabled = settings[enabledKey] as boolean;
            const subject = settings[subjectKey] as string;
            const Icon = item.icon;

            return (
              <Card key={item.key} className={`transition-opacity ${!settings.emailEnabled ? "opacity-60" : ""}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div>
                          <p className="font-semibold text-sm">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.desc}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{item.trigger}</span>
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={v => set(enabledKey, v)}
                            disabled={!settings.emailEnabled}
                          />
                        </div>
                      </div>
                      {isEnabled && (
                        <div className="mt-2.5">
                          <Label className="text-xs text-muted-foreground mb-1 block">Email Subject</Label>
                          <Input
                            value={subject}
                            onChange={e => set(subjectKey, e.target.value)}
                            placeholder="Email subject line"
                            className="text-sm h-8"
                            disabled={!settings.emailEnabled}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <div className="pt-2">
            <Button onClick={save} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save All Automations
            </Button>
          </div>
        </div>
      )}

      {/* ── Tab: Email Logs ── */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Email Delivery Log</h3>
              <p className="text-xs text-muted-foreground mt-0.5">All transactional and test emails. Most recent first.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadLogs} disabled={logsLoading} className="gap-2">
                <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {logs.length > 0 && (
                <Button variant="outline" size="sm" onClick={clearLogs} disabled={isClearingLogs} className="gap-2 text-red-600 hover:text-red-700">
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium text-muted-foreground">No email logs yet</p>
                <p className="text-xs text-muted-foreground mt-1">Emails will appear here once your SMTP is configured and automations start firing.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recipient</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Subject</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sent At</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          log.status === "sent"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {log.status === "sent" ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          {log.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-medium text-foreground">
                          {LOG_TYPE_LABELS[log.type] ?? log.type}
                        </span>
                        {log.orderNumber && (
                          <span className="block text-xs text-muted-foreground">#{log.orderNumber}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-mono text-foreground">{log.to}</span>
                        {log.status === "failed" && log.errorMessage && (
                          <span className="block text-xs text-red-600 truncate max-w-[160px]" title={log.errorMessage}>
                            {log.errorMessage}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <span className="text-xs text-muted-foreground truncate block max-w-[220px]" title={log.subject}>
                          {log.subject}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString("en-PK", {
                            timeZone: "Asia/Karachi",
                            month: "short", day: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
