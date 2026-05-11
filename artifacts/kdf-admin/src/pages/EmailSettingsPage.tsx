import { useState, useEffect } from "react";
import { Mail, Save, TestTube2, CheckCircle, AlertCircle, Eye, EyeOff, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}`, "Content-Type": "application/json" });
const apiFetch = (url: string, opts?: RequestInit) => fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });

interface EmailSettings {
  id?: number;
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  smtpPassSet: boolean;
  orderConfirmEnabled: boolean;
  orderConfirmSubject: string;
}

const DEFAULT: EmailSettings = {
  emailEnabled: false,
  smtpHost: "",
  smtpPort: 465,
  smtpUser: "",
  smtpFrom: "",
  smtpPassSet: false,
  orderConfirmEnabled: true,
  orderConfirmSubject: "Your KDF Nuts Order Confirmation",
};

const SMTP_PRESETS = [
  { label: "Hostinger",        host: "smtp.hostinger.com",  port: 465 },
  { label: "Titan Email",      host: "smtp.titan.email",    port: 465 },
  { label: "Gmail",            host: "smtp.gmail.com",      port: 587 },
  { label: "Outlook / Office", host: "smtp-mail.outlook.com", port: 587 },
  { label: "Custom...",        host: "", port: 465 },
];

export default function EmailSettingsPage() {
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT);
  const [smtpPass, setSmtpPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "err">("idle");
  const [testStatus, setTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    apiFetch("/api/admin/email-settings")
      .then(r => r.json())
      .then(d => setSettings({ ...DEFAULT, ...d }))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const set = <K extends keyof EmailSettings>(k: K, v: EmailSettings[K]) =>
    setSettings(s => ({ ...s, [k]: v }));

  const applyPreset = (preset: typeof SMTP_PRESETS[0]) => {
    if (preset.host) {
      setSettings(s => ({ ...s, smtpHost: preset.host, smtpPort: preset.port }));
    }
    setShowPresets(false);
  };

  const save = async () => {
    setIsSaving(true);
    setSaveStatus("idle");
    setTestStatus(null);
    try {
      const body: any = { ...settings };
      if (smtpPass) body.smtpPass = smtpPass;
      delete body.smtpPassSet;
      const r = await apiFetch("/api/admin/email-settings", { method: "PATCH", body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setSettings({ ...DEFAULT, ...d });
      setSmtpPass("");
      setSaveStatus("ok");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("err");
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
      setTestStatus({ ok: r.ok, msg: r.ok ? (d.message ?? "SMTP connection successful!") : (d.error ?? "Connection failed") });
    } catch {
      setTestStatus({ ok: false, msg: "Request failed — check network" });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Mail className="w-6 h-6" />Email Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure SMTP to send order confirmation emails to customers.</p>
      </div>

      {/* Master toggle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Email Notifications</CardTitle>
          <CardDescription>Enable or disable all email sending.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch checked={settings.emailEnabled} onCheckedChange={v => set("emailEnabled", v)} />
            <span className="text-sm font-medium">{settings.emailEnabled ? "Enabled" : "Disabled"}</span>
          </div>
        </CardContent>
      </Card>

      {/* SMTP Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">SMTP Configuration</CardTitle>
          <CardDescription>Your outgoing mail server settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Quick presets */}
          <div className="relative">
            <Label className="mb-1.5 block">Quick Setup — Select your email provider</Label>
            <button
              type="button"
              onClick={() => setShowPresets(v => !v)}
              className="flex items-center justify-between w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-muted/50 transition-colors"
            >
              <span className="text-muted-foreground">
                {SMTP_PRESETS.find(p => p.host === settings.smtpHost)?.label ?? (settings.smtpHost || "Choose provider...")}
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
                    {p.host && <span className="text-muted-foreground text-xs">{p.host} : {p.port}</span>}
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
              <Label htmlFor="smtpPort">SMTP Port</Label>
              <div className="flex gap-2">
                <Input id="smtpPort" type="number" value={settings.smtpPort} onChange={e => set("smtpPort", Number(e.target.value))} placeholder="465" className="flex-1" />
                <div className="flex gap-1">
                  <button type="button" onClick={() => set("smtpPort", 465)} className={`px-2 py-1 rounded text-xs border transition-colors ${settings.smtpPort === 465 ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-muted"}`}>465</button>
                  <button type="button" onClick={() => set("smtpPort", 587)} className={`px-2 py-1 rounded text-xs border transition-colors ${settings.smtpPort === 587 ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-muted"}`}>587</button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">465 = SSL (recommended) · 587 = TLS</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="smtpUser">SMTP Username / Email</Label>
            <Input id="smtpUser" value={settings.smtpUser} onChange={e => set("smtpUser", e.target.value)} placeholder="support@khandryfruit.com" />
          </div>

          <div className="space-y-1.5">
            <Label>SMTP Password / App Password</Label>
            <input type="text"     style={{ display: "none" }} aria-hidden="true" readOnly tabIndex={-1} />
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
                data-form-type="other"
                name={`smtp_cred_${Math.random().toString(36).slice(2, 7)}`}
                spellCheck={false}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors pr-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {settings.smtpPassSet && (
              <p className="text-xs text-amber-600 font-medium">⚠️ Password already saved — type new one below and click Save Settings to update</p>
            )}
            <p className="text-xs text-muted-foreground">Use your email account password (not cPanel password). Leave blank to keep existing.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="smtpFrom">From Address (optional)</Label>
            <Input id="smtpFrom" value={settings.smtpFrom} onChange={e => set("smtpFrom", e.target.value)} placeholder="KDF Nuts <orders@kdfnuts.com>" />
            <p className="text-xs text-muted-foreground">Defaults to SMTP username if left blank.</p>
          </div>

          {/* Save first, then test */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={save} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Settings
            </Button>
            <Button onClick={testConnection} disabled={isTesting || !settings.smtpHost} variant="outline" className="gap-2">
              {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4" />}
              Test Connection
            </Button>
            {saveStatus === "ok" && <span className="flex items-center gap-1 text-sm text-green-600"><CheckCircle className="w-4 h-4" />Saved</span>}
            {saveStatus === "err" && <span className="flex items-center gap-1 text-sm text-red-600"><AlertCircle className="w-4 h-4" />Save failed</span>}
          </div>

          {testStatus && (
            <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2.5 ${testStatus.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {testStatus.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              <span>{testStatus.msg}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order confirmation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Order Confirmation Email</CardTitle>
          <CardDescription>Sent to customers when an order is placed via chat.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={settings.orderConfirmEnabled} onCheckedChange={v => set("orderConfirmEnabled", v)} />
            <span className="text-sm font-medium">Send order confirmation emails</span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject">Email Subject</Label>
            <Input id="subject" value={settings.orderConfirmSubject} onChange={e => set("orderConfirmSubject", e.target.value)} placeholder="Your KDF Nuts Order Confirmation" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
