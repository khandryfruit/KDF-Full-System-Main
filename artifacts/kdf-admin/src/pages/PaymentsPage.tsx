import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Banknote, Plus, Settings, Trash2, CheckCircle2, Eye, EyeOff, Loader2, AlertCircle, Copy, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

const GATEWAY_PRESETS = [
  { type: "cod",           displayName: "Cash on Delivery",    description: "Pay when order arrives",                  icon: "💵", color: "bg-green-50 border-green-200",   requiresApiKey: false },
  { type: "jazzcash",      displayName: "JazzCash",            description: "Mobile wallet — hosted checkout",          icon: "📱", color: "bg-red-50 border-red-200",      requiresApiKey: true  },
  { type: "easypaisa",     displayName: "EasyPaisa",           description: "Mobile wallet — hosted checkout",          icon: "💚", color: "bg-emerald-50 border-emerald-200", requiresApiKey: true },
  { type: "card",          displayName: "Credit / Debit Card", description: "Visa, Mastercard via payment gateway",     icon: "💳", color: "bg-blue-50 border-blue-200",    requiresApiKey: true  },
  { type: "wallet",        displayName: "KDF Wallet",          description: "Pay using KDF store wallet balance",       icon: "👛", color: "bg-purple-50 border-purple-200", requiresApiKey: false },
  { type: "bank_transfer", displayName: "Bank Transfer",       description: "Manual bank transfer (show bank details)", icon: "🏦", color: "bg-amber-50 border-amber-200",  requiresApiKey: false },
];

const GATEWAY_FIELDS: Record<string, { apiKeyLabel: string; apiKeyPlaceholder: string; secretKeyLabel: string; secretKeyPlaceholder: string; webhookSecretLabel?: string; webhookSecretPlaceholder?: string; callbackPath?: string; callbackNote?: string }> = {
  jazzcash: {
    apiKeyLabel: "Merchant ID",
    apiKeyPlaceholder: "e.g. MC12345",
    secretKeyLabel: "Password",
    secretKeyPlaceholder: "JazzCash merchant password",
    webhookSecretLabel: "Integration Salt",
    webhookSecretPlaceholder: "JazzCash integration salt / hash key",
    callbackPath: "/api/payments/jazzcash/callback",
    callbackNote: "Register this URL in JazzCash merchant portal under Return URL & IPN URL",
  },
  easypaisa: {
    apiKeyLabel: "Store ID",
    apiKeyPlaceholder: "e.g. 12345",
    secretKeyLabel: "Hash Key",
    secretKeyPlaceholder: "EasyPaisa hash key",
    callbackPath: "/api/payments/easypaisa/callback",
    callbackNote: "Register this URL in EasyPaisa merchant portal as your callback URL",
  },
  card: {
    apiKeyLabel: "API Key / Client ID",
    apiKeyPlaceholder: "Gateway API key",
    secretKeyLabel: "Secret Key",
    secretKeyPlaceholder: "Gateway secret key",
    webhookSecretLabel: "Webhook Secret (optional)",
    webhookSecretPlaceholder: "Webhook signature secret",
  },
};

function CallbackUrlRow({ path, note }: { path: string; note: string }) {
  const { toast } = useToast();
  const domain = window.location.origin;
  const url = `${domain}${path}`;
  return (
    <div className="mt-3 rounded-lg bg-muted/50 border border-border p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Info size={12} /> Callback URL
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 font-mono truncate">{url}</code>
        <button
          type="button"
          className="flex-shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => { navigator.clipboard.writeText(url); toast({ title: "Copied!" }); }}
        >
          <Copy size={13} />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

function GatewayCard({ preset }: { preset: typeof GATEWAY_PRESETS[0] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: gateways = [] } = useQuery({ queryKey: ["/api/admin/payment-gateways"], queryFn: () => apiFetch("/api/admin/payment-gateways") });
  const config = (gateways as any[]).find((g: any) => g.type === preset.type);

  const [editing, setEditing] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [form, setForm] = useState({ apiKey: "", secretKey: "", webhookSecret: "", sandbox: true });

  const fields = GATEWAY_FIELDS[preset.type];

  const save = useMutation({
    mutationFn: () => apiFetch("/api/admin/payment-gateways", {
      method: "POST",
      body: JSON.stringify({
        type: preset.type,
        displayName: preset.displayName,
        description: preset.description,
        apiKey: form.apiKey || undefined,
        secretKey: form.secretKey || undefined,
        webhookSecret: form.webhookSecret || undefined,
        config: { sandbox: form.sandbox },
        isActive: true,
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/payment-gateways"] }); setEditing(false); toast({ title: `${preset.displayName} configured` }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const toggle = useMutation({
    mutationFn: (active: boolean) => apiFetch(`/api/admin/payment-gateways/${config?.id}`, { method: "PATCH", body: JSON.stringify({ isActive: active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/payment-gateways"] }),
  });

  const openEdit = () => {
    setForm({
      apiKey: config?.apiKey ?? "",
      secretKey: config?.secretKey ?? "",
      webhookSecret: config?.webhookSecret ?? "",
      sandbox: config?.config?.sandbox !== false,
    });
    setEditing(true);
  };

  const isSandbox = config?.config?.sandbox !== false;

  return (
    <div className={`border-2 rounded-xl bg-card shadow-sm overflow-hidden ${config?.isActive ? preset.color : "border-border"}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center text-2xl shadow-sm border border-border">{preset.icon}</div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">{preset.displayName}</h3>
                {config?.isDefault && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200">Default</Badge>}
                {config?.isActive && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {config && fields && (
                  <Badge variant="outline" className={`text-[10px] ${isSandbox ? "bg-yellow-50 text-yellow-700 border-yellow-300" : "bg-green-50 text-green-700 border-green-300"}`}>
                    {isSandbox ? "Sandbox" : "Live"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
            </div>
          </div>
          {config && (
            <Switch checked={config.isActive} onCheckedChange={(v) => toggle.mutate(v)} />
          )}
        </div>

        {editing && preset.requiresApiKey && fields && (
          <div className="space-y-3 mt-4 pt-4 border-t border-border">
            <div className="space-y-1.5">
              <Label>{fields.apiKeyLabel}</Label>
              <div className="relative">
                <Input type={showKey ? "text" : "password"} value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} placeholder={fields.apiKeyPlaceholder} />
                <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{fields.secretKeyLabel}</Label>
              <Input type="password" value={form.secretKey} onChange={e => setForm({ ...form, secretKey: e.target.value })} placeholder={fields.secretKeyPlaceholder} />
            </div>
            {fields.webhookSecretLabel && (
              <div className="space-y-1.5">
                <Label>{fields.webhookSecretLabel}</Label>
                <Input type="password" value={form.webhookSecret} onChange={e => setForm({ ...form, webhookSecret: e.target.value })} placeholder={fields.webhookSecretPlaceholder} />
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Sandbox / Test Mode</p>
                <p className="text-xs text-muted-foreground">Use test credentials — no real money charged</p>
              </div>
              <Switch checked={form.sandbox} onCheckedChange={(v) => setForm({ ...form, sandbox: v })} />
            </div>
            {fields.callbackPath && (
              <CallbackUrlRow path={fields.callbackPath} note={fields.callbackNote!} />
            )}
            <div className="flex gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending || !form.apiKey || !form.secretKey} className="flex-1">
                {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {!editing && config && fields?.callbackPath && (
          <CallbackUrlRow path={fields.callbackPath} note={fields.callbackNote!} />
        )}

        <div className="flex gap-2 mt-4">
          {!config ? (
            <Button size="sm" onClick={() => preset.requiresApiKey ? openEdit() : save.mutate()} disabled={save.isPending} className="flex-1">
              {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
              Enable
            </Button>
          ) : (
            preset.requiresApiKey && (
              <Button variant="outline" size="sm" onClick={openEdit} className="flex-1">
                <Settings className="w-3.5 h-3.5 mr-1.5" />Reconfigure
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function ManualPaymentForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ bankName: "", accountTitle: "", accountNumber: "", iban: "", instructions: "" });

  const save = useMutation({
    mutationFn: () => apiFetch("/api/admin/manual-payments", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/manual-payments"] }); toast({ title: "Bank account added" }); onDone(); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  return (
    <div className="border rounded-xl bg-card shadow-sm p-5 space-y-3">
      <h4 className="font-semibold">Add Bank Account</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { key: "bankName", label: "Bank Name *", placeholder: "HBL / Meezan / UBL" },
          { key: "accountTitle", label: "Account Title *", placeholder: "Company Name" },
          { key: "accountNumber", label: "Account Number *", placeholder: "0123456789" },
          { key: "iban", label: "IBAN", placeholder: "PK36SCBL0000001123456702" },
        ].map(f => (
          <div key={f.key} className="space-y-1.5">
            <Label>{f.label}</Label>
            <Input value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} />
          </div>
        ))}
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Instructions (optional)</Label>
          <Input value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} placeholder="e.g. Please send payment proof to whatsapp 0300-..." />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending || !form.bankName || !form.accountTitle || !form.accountNumber} className="flex-1">
          {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Add Bank Account
        </Button>
        <Button variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAddBank, setShowAddBank] = useState(false);

  const { data: manualPayments = [], isLoading: banksLoading } = useQuery({
    queryKey: ["/api/admin/manual-payments"],
    queryFn: () => apiFetch("/api/admin/manual-payments"),
  });

  const deleteBank = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/manual-payments/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/manual-payments"] }); toast({ title: "Bank account removed" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const toggleBank = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => apiFetch(`/api/admin/manual-payments/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/manual-payments"] }),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payment Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure payment gateways and manual bank transfer options</p>
      </div>

      {/* Payment Gateways */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Payment Gateways</h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-500" />
          Enabled gateways will appear as payment options at checkout on all storefronts.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GATEWAY_PRESETS.map(preset => <GatewayCard key={preset.type} preset={preset} />)}
        </div>
      </section>

      {/* Manual Bank Accounts */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Manual Bank Accounts</h2>
          </div>
          <Button size="sm" onClick={() => setShowAddBank(v => !v)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />Add Bank Account
          </Button>
        </div>

        {showAddBank && <ManualPaymentForm onDone={() => setShowAddBank(false)} />}

        <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
          {banksLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : (manualPayments as any[]).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Banknote className="w-8 h-8 opacity-20 mx-auto mb-2" />
              <p className="text-sm">No bank accounts added. Add one to offer manual bank transfer payment.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(manualPayments as any[]).map((bank: any) => (
                <div key={bank.id} className="p-4 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl flex-shrink-0">🏦</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{bank.bankName}</span>
                      {!bank.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{bank.accountTitle}</p>
                    <p className="text-xs font-mono text-foreground mt-0.5">{bank.accountNumber}</p>
                    {bank.iban && <p className="text-xs text-muted-foreground font-mono">{bank.iban}</p>}
                    {bank.instructions && <p className="text-xs text-muted-foreground mt-1">{bank.instructions}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch checked={bank.isActive} onCheckedChange={(v) => toggleBank.mutate({ id: bank.id, active: v })} />
                    <Button variant="ghost" size="sm" onClick={() => deleteBank.mutate(bank.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {(manualPayments as any[]).length > 0 && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            When a customer selects "Bank Transfer" at checkout, these account details will be shown.
          </div>
        )}
      </section>
    </div>
  );
}
