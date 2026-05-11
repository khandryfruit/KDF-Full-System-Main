import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLocation } from "wouter";
import { useState } from "react";
import {
  ArrowLeft, Building2, Globe, CreditCard, Settings, Activity,
  Edit3, Save, X, Loader2, CheckCircle2, PauseCircle, Play,
  Eye, EyeOff, Palette, Zap, Phone, Mail, MapPin,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const INDUSTRY_ICONS: Record<string, string> = {
  grocery: "🛒", fashion: "👗", electronics: "💻", pharmacy: "💊",
  food: "🍕", beauty: "💄", sports: "⚽", furniture: "🪑", books: "📚", other: "🏪",
};
const INDUSTRIES = ["grocery", "fashion", "electronics", "pharmacy", "food", "beauty", "sports", "furniture", "books", "other"];

const FEATURE_LABELS: Record<string, string> = {
  website: "Website Builder", whatsappAutomation: "WhatsApp Automation", aiTools: "AI Content Tools",
  aiChatbot: "AI Chatbot", seoTools: "SEO Tools", metaIntegration: "Meta/Facebook Integration",
  courierIntegrations: "Courier Integrations", analyticsAdvanced: "Advanced Analytics",
  marketingCampaigns: "Marketing Campaigns", multiUser: "Multi-User Access",
  customDomain: "Custom Domain", mobileApp: "Mobile Admin App", apiAccess: "API Access",
  realtimeAnalytics: "Real-time Analytics", blogModule: "Blog Module",
  loyaltyModule: "Loyalty Module", prioritySupport: "Priority Support",
};

export default function TenantDetailPage({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"overview" | "settings" | "features" | "theme" | "plan">("overview");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [showSecrets, setShowSecrets] = useState(false);
  const [featureEdits, setFeatureEdits] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["saas-tenant", id],
    queryFn: () => apiFetch(`/saas/admin/tenants/${id}`),
    onSuccess: (d: any) => setForm({
      name: d.name, email: d.email, storeName: d.storeName,
      industry: d.industry, ownerName: d.ownerName ?? "", ownerPhone: d.ownerPhone ?? "",
      notes: d.notes ?? "", customDomain: d.customDomain ?? "", subdomain: d.subdomain ?? "",
    }),
  });

  const { data: plans = [] } = useQuery({ queryKey: ["saas-plans-admin"], queryFn: () => apiFetch("/saas/admin/plans") });

  const update = useMutation({
    mutationFn: (body: any) => apiFetch(`/saas/admin/tenants/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saas-tenant", id] }); setEditing(false); toast({ title: "Saved!" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const updateFeatures = useMutation({
    mutationFn: (overrides: any) => apiFetch(`/saas/admin/tenants/${id}/features`, { method: "PUT", body: JSON.stringify(overrides) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saas-tenant", id] }); toast({ title: "Features updated!" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const changePlan = useMutation({
    mutationFn: (planId: number) => apiFetch(`/saas/admin/tenants/${id}/plan`, { method: "PUT", body: JSON.stringify({ planId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saas-tenant", id] }); toast({ title: "Plan changed!" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const suspend = useMutation({
    mutationFn: () => apiFetch(`/saas/admin/tenants/${id}/suspend`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saas-tenant", id] }); toast({ title: "Suspended" }); },
  });
  const activate = useMutation({
    mutationFn: () => apiFetch(`/saas/admin/tenants/${id}/activate`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saas-tenant", id] }); toast({ title: "Activated" }); },
  });

  const updateSettings = useMutation({
    mutationFn: (settings: any) => apiFetch(`/saas/admin/tenants/${id}`, { method: "PUT", body: JSON.stringify({ settings }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saas-tenant", id] }); toast({ title: "Settings saved!" }); },
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center text-muted-foreground py-16">Tenant not found</div>;

  const tenant = data;
  const planFeatures = tenant.plan?.features ?? {};
  const featureOverrides = tenant.featureOverrides ?? {};
  const effectiveFeatures = { ...planFeatures, ...featureOverrides, ...featureEdits };

  const TABS = [
    { id: "overview", label: "Overview", icon: Building2 },
    { id: "settings", label: "API Settings", icon: Settings },
    { id: "features", label: "Features", icon: Zap },
    { id: "plan", label: "Plan", icon: CreditCard },
    { id: "theme", label: "Storefront", icon: Palette },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => setLocation("/tenants")} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-2xl">
              {INDUSTRY_ICONS[tenant.industry] ?? "🏪"}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{tenant.storeName}</h1>
              <p className="text-sm text-muted-foreground">{tenant.email}</p>
            </div>
            <span className={`ml-auto text-xs font-medium px-3 py-1 rounded-full border ${
              tenant.status === "active" ? "bg-green-500/20 text-green-400 border-green-500/30"
              : tenant.status === "trial" ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
              : "bg-red-500/20 text-red-400 border-red-500/30"
            }`}>{tenant.status}</span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setLocation(`/tenants/${id}/storefront`)} className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-sm hover:bg-accent transition-colors">
          <Globe className="w-3.5 h-3.5 text-primary" /> Storefront Builder
        </button>
        {tenant.status !== "active" && (
          <button onClick={() => activate.mutate()} disabled={activate.isPending} className="flex items-center gap-2 px-3 py-2 bg-green-500/20 border border-green-500/30 rounded-lg text-sm text-green-400 hover:bg-green-500/30 transition-colors">
            {activate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Activate
          </button>
        )}
        {tenant.status !== "suspended" && (
          <button onClick={() => suspend.mutate()} disabled={suspend.isPending} className="flex items-center gap-2 px-3 py-2 bg-amber-500/20 border border-amber-500/30 rounded-lg text-sm text-amber-400 hover:bg-amber-500/30 transition-colors">
            {suspend.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PauseCircle className="w-3.5 h-3.5" />} Suspend
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl w-fit">
        {TABS.map(({ id: tid, label, icon: Icon }) => (
          <button key={tid} onClick={() => setTab(tid as any)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${tab === tid ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Store Info</h3>
              <button onClick={() => setEditing(!editing)} className="text-primary text-xs hover:underline flex items-center gap-1">
                {editing ? <><X className="w-3 h-3" /> Cancel</> : <><Edit3 className="w-3 h-3" /> Edit</>}
              </button>
            </div>
            {editing ? (
              <div className="space-y-3">
                {[
                  { k: "storeName", label: "Store Name" }, { k: "name", label: "Owner Name" },
                  { k: "email", label: "Email" }, { k: "ownerPhone", label: "Phone" },
                  { k: "customDomain", label: "Custom Domain" }, { k: "subdomain", label: "Subdomain" },
                ].map(({ k, label }) => (
                  <div key={k}>
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <input value={form[k] ?? ""} onChange={e => setForm({ ...form, [k]: e.target.value })}
                      className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-muted-foreground">Industry</label>
                  <select value={form.industry ?? ""} onChange={e => setForm({ ...form, industry: e.target.value })}
                    className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                    {INDUSTRIES.map(i => <option key={i} value={i}>{INDUSTRY_ICONS[i]} {i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <textarea value={form.notes ?? ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                    className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                </div>
                <button onClick={() => update.mutate(form)} disabled={update.isPending}
                  className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90">
                  {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: "Store Name", value: tenant.storeName },
                  { label: "Industry", value: `${INDUSTRY_ICONS[tenant.industry] ?? ""} ${tenant.industry}` },
                  { label: "Owner", value: tenant.ownerName },
                  { label: "Phone", value: tenant.ownerPhone },
                  { label: "Custom Domain", value: tenant.customDomain ?? "—" },
                  { label: "Subdomain", value: tenant.subdomain ?? "—" },
                  { label: "Trial Ends", value: tenant.trialEndsAt ? new Date(tenant.trialEndsAt).toLocaleDateString() : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-foreground capitalize">{value ?? "—"}</span>
                  </div>
                ))}
                {tenant.notes && <p className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">{tenant.notes}</p>}
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-sm mb-3">Current Plan</h3>
              {tenant.plan ? (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded-full" style={{ background: tenant.plan.color ?? "#6366f1" }} />
                    <span className="font-bold text-foreground">{tenant.plan.name}</span>
                  </div>
                  <p className="text-2xl font-bold text-primary">Rs. {Number(tenant.plan.priceMonthly).toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                </div>
              ) : <p className="text-muted-foreground text-sm">No plan assigned</p>}
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-sm mb-3">Account Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Registered</span><span>{new Date(tenant.createdAt).toLocaleDateString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Last Updated</span><span>{new Date(tenant.updatedAt).toLocaleDateString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Store Slug</span><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{tenant.storeSlug}</code></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Settings */}
      {tab === "settings" && (
        <ApiSettingsTab tenant={tenant} updateSettings={updateSettings} showSecrets={showSecrets} setShowSecrets={setShowSecrets} />
      )}

      {/* Features */}
      {tab === "features" && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Feature Overrides</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Override individual features for this tenant</p>
            </div>
            <button onClick={() => updateFeatures.mutate(featureEdits)} disabled={updateFeatures.isPending}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
              {updateFeatures.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(FEATURE_LABELS).map(([key, label]) => {
              const val = featureEdits.hasOwnProperty(key) ? featureEdits[key] : (featureOverrides[key] ?? planFeatures[key] ?? false);
              const fromPlan = !featureOverrides.hasOwnProperty(key) && !featureEdits.hasOwnProperty(key);
              return (
                <label key={key} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-accent cursor-pointer transition-colors">
                  <input type="checkbox" checked={!!val} onChange={e => setFeatureEdits({ ...featureEdits, [key]: e.target.checked })}
                    className="w-4 h-4 accent-green-500" />
                  <div className="flex-1">
                    <span className="text-sm text-foreground">{label}</span>
                    {fromPlan && <span className="block text-[10px] text-muted-foreground">From plan</span>}
                  </div>
                  {val ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> : <X className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Plan */}
      {tab === "plan" && (
        <div className="space-y-4">
          <h3 className="font-semibold">Change Plan</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(plans as any[]).map((p: any) => (
              <div key={p.id} onClick={() => changePlan.mutate(p.id)}
                className={`border-2 rounded-xl p-5 cursor-pointer transition-all ${tenant.planId === p.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-accent"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: p.color ?? "#6366f1" }} />
                  <span className="font-bold text-sm">{p.name}</span>
                  {tenant.planId === p.id && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                </div>
                <p className="text-xl font-bold">Rs. {Number(p.priceMonthly).toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Storefront link */}
      {tab === "theme" && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Palette className="w-12 h-12 text-primary mx-auto mb-4" />
          <h3 className="text-lg font-bold mb-2">Storefront Builder</h3>
          <p className="text-muted-foreground text-sm mb-6">Customize the tenant's storefront template, colors, fonts, and sections</p>
          <button onClick={() => setLocation(`/tenants/${id}/storefront`)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-medium hover:opacity-90 transition-all">
            <Globe className="w-4 h-4" /> Open Storefront Builder
          </button>
        </div>
      )}
    </div>
  );
}

function ApiSettingsTab({ tenant, updateSettings, showSecrets, setShowSecrets }: any) {
  const [form, setForm] = useState({ ...(tenant.settings ?? {}) });
  const { toast } = useToast();
  const fields = [
    { key: "openaiApiKey", label: "OpenAI API Key", placeholder: "sk-...", secret: true },
    { key: "whatsappToken", label: "WhatsApp Access Token", placeholder: "EAAxxxx...", secret: true },
    { key: "whatsappPhoneId", label: "WhatsApp Phone Number ID", placeholder: "100123456789", secret: false },
    { key: "whatsappBusinessId", label: "WhatsApp Business Account ID", placeholder: "100123456789", secret: false },
    { key: "metaAppId", label: "Meta App ID", placeholder: "123456789", secret: false },
    { key: "metaAppSecret", label: "Meta App Secret", placeholder: "abc123...", secret: true },
    { key: "metaPixelId", label: "Meta Pixel ID", placeholder: "123456789", secret: false },
    { key: "metaAccessToken", label: "Meta Access Token", placeholder: "EAAxxxx...", secret: true },
    { key: "googleMapsKey", label: "Google Maps API Key", placeholder: "AIza...", secret: true },
    { key: "googleAnalyticsId", label: "Google Analytics ID", placeholder: "G-XXXX", secret: false },
  ];
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Tenant API Settings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Per-tenant API keys (stored encrypted, tenant-isolated)</p>
        </div>
        <button onClick={() => setShowSecrets(!showSecrets)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          {showSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showSecrets ? "Hide" : "Show"} secrets
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map(({ key, label, placeholder, secret }) => (
          <div key={key}>
            <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
            <input
              type={secret && !showSecrets ? "password" : "text"}
              value={form[key] ?? ""}
              onChange={e => setForm({ ...form, [key]: e.target.value })}
              placeholder={placeholder}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => updateSettings.mutate(form)}
        disabled={updateSettings.isPending}
        className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
      >
        {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save API Settings
      </button>
    </div>
  );
}
