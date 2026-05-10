import { useState, useEffect } from "react";
import { Mail, Save, TestTube2, CheckCircle, AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
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
  smtpPort: 587,
  smtpUser: "",
  smtpFrom: "",
  smtpPassSet: false,
  orderConfirmEnabled: true,
  orderConfirmSubject: "Your KDF Nuts Order Confirmation",
};

export default function EmailSettingsPage() {
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT);
  const [smtpPass, setSmtpPass] = useState("");
  const [showPass, setShowPass] = useState(false);
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

  const save = async () => {
    setIsSaving(true);
    setSaveStatus("idle");
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
      setTestStatus({ ok: r.ok, msg: r.ok ? "SMTP connection successful!" : d.error });
    } catch {
      setTestStatus({ ok: false, msg: "Request failed" });
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="smtpHost">SMTP Host</Label>
              <Input id="smtpHost" value={settings.smtpHost} onChange={e => set("smtpHost", e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtpPort">SMTP Port</Label>
              <Input id="smtpPort" type="number" value={settings.smtpPort} onChange={e => set("smtpPort", Number(e.target.value))} placeholder="587" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtpUser">SMTP Username / Email</Label>
            <Input id="smtpUser" value={settings.smtpUser} onChange={e => set("smtpUser", e.target.value)} placeholder="you@gmail.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtpPass">SMTP Password / App Password</Label>
            <div className="relative">
              <Input id="smtpPass" type={showPass ? "text" : "password"} value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder={settings.smtpPassSet ? "Enter new password to update" : "Enter password"} className="pr-10" autoComplete="new-password" />
              <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">For Gmail, use an App Password (not your account password). Leave blank to keep existing.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtpFrom">From Address (optional)</Label>
            <Input id="smtpFrom" value={settings.smtpFrom} onChange={e => set("smtpFrom", e.target.value)} placeholder="KDF Nuts <orders@kdfnuts.com>" />
            <p className="text-xs text-muted-foreground">Defaults to SMTP username if left blank.</p>
          </div>
          <Button onClick={testConnection} disabled={isTesting || !settings.smtpHost} variant="outline" className="gap-2">
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4" />}
            Test Connection
          </Button>
          {testStatus && (
            <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${testStatus.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {testStatus.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {testStatus.msg}
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

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={isSaving} className="gap-2">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </Button>
        {saveStatus === "ok" && <span className="flex items-center gap-1 text-sm text-green-600"><CheckCircle className="w-4 h-4" />Saved</span>}
        {saveStatus === "err" && <span className="flex items-center gap-1 text-sm text-red-600"><AlertCircle className="w-4 h-4" />Save failed</span>}
      </div>
    </div>
  );
}
