import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface PlatformSettings {
  platformName: string;
  platformTagline: string;
  supportEmail: string;
  supportPhone: string;
  websiteUrl: string;
  defaultTrialDays: number;
  maxTenantsPerPlan: number;
  maintenanceMode: boolean;
  allowPublicRegistration: boolean;
  welcomeMessage: string;
  footerText: string;
  primaryColor: string;
  logoUrl: string;
  currency: string;
  countryCode: string;
}

const DEFAULTS: PlatformSettings = {
  platformName: "SaaS Platform",
  platformTagline: "The AI-powered eCommerce platform",
  supportEmail: "support@platform.com",
  supportPhone: "",
  websiteUrl: "",
  defaultTrialDays: 14,
  maxTenantsPerPlan: -1,
  maintenanceMode: false,
  allowPublicRegistration: true,
  welcomeMessage: "Welcome! Your store is ready. Start by adding your first product.",
  footerText: "Powered by SaaS Platform",
  primaryColor: "#10b981",
  logoUrl: "",
  currency: "PKR",
  countryCode: "PK",
};

const inp = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 transition-colors";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-300 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-800 last:border-0">
      <div>
        <p className="text-sm text-slate-300">{label}</p>
        {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-emerald-600" : "bg-slate-700"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [form, setForm] = useState<PlatformSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "billing" | "portal" | "notifications">("general");

  useEffect(() => {
    api.settings.get()
      .then(data => {
        if (data && Object.keys(data).length > 0) {
          setForm(prev => ({ ...prev, ...data }));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof PlatformSettings>(key: K, val: PlatformSettings[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.settings.update(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      alert(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tabs = [
    { id: "general" as const, label: "General", icon: "⚙️" },
    { id: "billing" as const, label: "Billing & Plans", icon: "💳" },
    { id: "portal" as const, label: "Tenant Portal", icon: "🌐" },
    { id: "notifications" as const, label: "Notifications", icon: "🔔" },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Settings</h1>
          <p className="text-slate-400 text-sm mt-1">Configure your SaaS platform settings</p>
        </div>
        <button
          form="settings-form"
          type="submit"
          disabled={saving}
          className={`text-sm font-medium px-5 py-2 rounded-lg transition-all ${
            saved ? "bg-emerald-500 text-white" : "bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"
          }`}
        >
          {saved ? "✓ Saved!" : saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      <div className="flex gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeTab === t.id ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <form id="settings-form" onSubmit={handleSave} className="space-y-5">
        {activeTab === "general" && (
          <>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Branding</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Platform Name" hint="Displayed in the admin console header">
                  <input value={form.platformName} onChange={e => set("platformName", e.target.value)} className={inp} placeholder="SaaS Platform" />
                </Field>
                <Field label="Tagline" hint="Shown on the login page">
                  <input value={form.platformTagline} onChange={e => set("platformTagline", e.target.value)} className={inp} placeholder="The AI-powered eCommerce platform" />
                </Field>
                <Field label="Logo URL" hint="HTTPS URL to your platform logo">
                  <input type="url" value={form.logoUrl} onChange={e => set("logoUrl", e.target.value)} className={inp} placeholder="https://..." />
                </Field>
                <Field label="Primary Color">
                  <div className="flex gap-2">
                    <input type="color" value={form.primaryColor} onChange={e => set("primaryColor", e.target.value)} className="w-10 h-[38px] rounded-lg bg-slate-800 border border-slate-700 cursor-pointer p-1" />
                    <input value={form.primaryColor} onChange={e => set("primaryColor", e.target.value)} className={inp} placeholder="#10b981" />
                  </div>
                </Field>
                <Field label="Footer Text">
                  <input value={form.footerText} onChange={e => set("footerText", e.target.value)} className={inp} placeholder="Powered by SaaS Platform" />
                </Field>
                <Field label="Website URL">
                  <input type="url" value={form.websiteUrl} onChange={e => set("websiteUrl", e.target.value)} className={inp} placeholder="https://yourplatform.com" />
                </Field>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Support & Contact</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Support Email">
                  <input type="email" value={form.supportEmail} onChange={e => set("supportEmail", e.target.value)} className={inp} placeholder="support@platform.com" />
                </Field>
                <Field label="Support Phone (WhatsApp)">
                  <input value={form.supportPhone} onChange={e => set("supportPhone", e.target.value)} className={inp} placeholder="+92300..." />
                </Field>
                <Field label="Default Currency">
                  <select value={form.currency} onChange={e => set("currency", e.target.value)} className={inp}>
                    {["PKR", "USD", "EUR", "GBP", "AED", "SAR"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Country Code">
                  <select value={form.countryCode} onChange={e => set("countryCode", e.target.value)} className={inp}>
                    {[["PK", "Pakistan"], ["US", "United States"], ["AE", "UAE"], ["SA", "Saudi Arabia"], ["GB", "United Kingdom"]].map(([c, n]) => (
                      <option key={c} value={c}>{n} ({c})</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </>
        )}

        {activeTab === "billing" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Trial & Subscription Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Default Trial Days" hint="How many days new tenants get on trial">
                <input type="number" min="0" max="365" value={form.defaultTrialDays} onChange={e => set("defaultTrialDays", Number(e.target.value))} className={inp} />
              </Field>
              <Field label="Max Tenants per Plan" hint="-1 for unlimited">
                <input type="number" min="-1" value={form.maxTenantsPerPlan} onChange={e => set("maxTenantsPerPlan", Number(e.target.value))} className={inp} />
              </Field>
            </div>
            <div className="pt-2">
              <p className="text-xs text-slate-400 mb-3">Configure your subscription plans in the <a href="/plans" className="text-emerald-400 hover:text-emerald-300">Plans</a> section.</p>
              <div className="bg-slate-800/50 rounded-xl p-4 text-sm text-slate-400 space-y-2">
                <p className="font-medium text-white text-xs">Payment Gateway Setup</p>
                <p className="text-xs">JazzCash, Easypaisa, and Stripe payment gateway settings are configured per-tenant in the Storefront settings. To enable platform-level billing, integrate a billing gateway here.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "portal" && (
          <>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Tenant Portal Configuration</h2>
              <Field label="Welcome Message" hint="Shown to tenants after signup">
                <textarea
                  value={form.welcomeMessage}
                  onChange={e => set("welcomeMessage", e.target.value)}
                  rows={3}
                  className={`${inp} resize-none`}
                  placeholder="Welcome! Your store is ready..."
                />
              </Field>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-1">Registration & Access</h2>
              <p className="text-xs text-slate-500 mb-4">Control who can sign up and how</p>
              <Toggle
                label="Allow Public Registration"
                hint="Tenants can sign up from the portal landing page"
                checked={form.allowPublicRegistration}
                onChange={v => set("allowPublicRegistration", v)}
              />
              <Toggle
                label="Maintenance Mode"
                hint="Disable all tenant logins and show a maintenance page"
                checked={form.maintenanceMode}
                onChange={v => set("maintenanceMode", v)}
              />
            </div>
          </>
        )}

        {activeTab === "notifications" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-1">Notification Settings</h2>
            <p className="text-xs text-slate-500 mb-6">Configure automated alerts and notifications</p>
            <div className="space-y-0">
              {[
                { label: "New tenant registered", hint: "Notify you when a new tenant signs up" },
                { label: "Trial expiring (3 days)", hint: "Alert when a tenant's trial ends in 3 days" },
                { label: "Tenant suspended", hint: "Notify on suspension events" },
                { label: "Payment received", hint: "Confirmation on successful subscription payments" },
              ].map(item => (
                <div key={item.label} className="flex items-start justify-between gap-4 py-3 border-b border-slate-800 last:border-0">
                  <div>
                    <p className="text-sm text-slate-300">{item.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.hint}</p>
                  </div>
                  <span className="text-xs text-slate-600 mt-1">Coming soon</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800">
              <Field label="Notification Email" hint="Where to send platform alerts">
                <input type="email" value={form.supportEmail} onChange={e => set("supportEmail", e.target.value)} className={inp} />
              </Field>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
