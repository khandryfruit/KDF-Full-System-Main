import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";

interface TenantSettings {
  openaiApiKey: string;
  whatsappToken: string;
  whatsappPhoneId: string;
  whatsappBusinessId: string;
  metaPixelId: string;
  metaAccessToken: string;
  googleMapsKey: string;
  googleAnalyticsId: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  timezone: string;
  currency: string;
  language: string;
  country: string;
}

const DEFAULTS: TenantSettings = {
  openaiApiKey: "",
  whatsappToken: "",
  whatsappPhoneId: "",
  whatsappBusinessId: "",
  metaPixelId: "",
  metaAccessToken: "",
  googleMapsKey: "",
  googleAnalyticsId: "",
  smtpHost: "",
  smtpPort: "587",
  smtpUser: "",
  smtpPass: "",
  timezone: "Asia/Karachi",
  currency: "PKR",
  language: "en",
  country: "PK",
};

const inp = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 transition-colors";
const secret = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 transition-colors font-mono tracking-wider";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-300 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
        <span>{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

export default function TenantSettingsPage() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState<TenantSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"integrations" | "email" | "regional">("integrations");
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.tenant.getSettings()
      .then((d: any) => { if (d && Object.keys(d).length) setForm(prev => ({ ...prev, ...d })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof TenantSettings>(k: K, v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  const toggleShow = (k: string) => setShowSecrets(p => ({ ...p, [k]: !p[k] }));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.tenant.updateSettings(form);
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
      <div className="min-h-screen bg-[#080d1a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const TABS = [
    { id: "integrations" as const, label: "Integrations", icon: "🔌" },
    { id: "email" as const, label: "Email / SMTP", icon: "📧" },
    { id: "regional" as const, label: "Regional", icon: "🌍" },
  ];

  function SecretField({ k, label, hint }: { k: keyof TenantSettings; label: string; hint?: string }) {
    const show = showSecrets[k];
    return (
      <Field label={label} hint={hint}>
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={form[k]}
            onChange={e => set(k, e.target.value)}
            className={secret}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => toggleShow(k)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </Field>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Store Settings</h1>
          <p className="text-slate-400 text-sm mt-0.5">Configure integrations and regional settings</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/portal/dashboard")}
            className="text-sm px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white transition-colors">
            ← Back
          </button>
          <button form="settings-form" type="submit" disabled={saving}
            className={`text-sm font-medium px-5 py-2 rounded-lg transition-all ${saved ? "bg-emerald-500 text-white" : "bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"}`}>
            {saved ? "✓ Saved!" : saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800 w-fit">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-all flex items-center gap-1.5 ${tab === t.id ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <form id="settings-form" onSubmit={handleSave} className="space-y-5">
        {tab === "integrations" && (
          <>
            <Section title="AI / OpenAI" icon="🤖">
              <SecretField k="openaiApiKey" label="OpenAI API Key" hint="Required for AI chatbot and content generation" />
            </Section>

            <Section title="WhatsApp / Meta" icon="💬">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SecretField k="whatsappToken" label="WhatsApp Access Token" />
                <Field label="Phone Number ID">
                  <input value={form.whatsappPhoneId} onChange={e => set("whatsappPhoneId", e.target.value)} className={inp} placeholder="1234567890" />
                </Field>
                <Field label="Business Account ID">
                  <input value={form.whatsappBusinessId} onChange={e => set("whatsappBusinessId", e.target.value)} className={inp} placeholder="9876543210" />
                </Field>
                <Field label="Meta Pixel ID">
                  <input value={form.metaPixelId} onChange={e => set("metaPixelId", e.target.value)} className={inp} placeholder="123456789" />
                </Field>
              </div>
              <SecretField k="metaAccessToken" label="Meta Access Token" />
            </Section>

            <Section title="Google" icon="🗺️">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SecretField k="googleMapsKey" label="Google Maps API Key" hint="For location / address auto-detection" />
                <Field label="Google Analytics ID" hint="e.g. G-XXXXXXXXXX or UA-XXXXXXXX-X">
                  <input value={form.googleAnalyticsId} onChange={e => set("googleAnalyticsId", e.target.value)} className={inp} placeholder="G-XXXXXXXXXX" />
                </Field>
              </div>
            </Section>
          </>
        )}

        {tab === "email" && (
          <Section title="SMTP Email Configuration" icon="📧">
            <p className="text-xs text-slate-500 mb-1">Configure outgoing email for order confirmations and notifications.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="SMTP Host" hint="e.g. smtp.gmail.com">
                <input value={form.smtpHost} onChange={e => set("smtpHost", e.target.value)} className={inp} placeholder="smtp.gmail.com" />
              </Field>
              <Field label="SMTP Port">
                <input value={form.smtpPort} onChange={e => set("smtpPort", e.target.value)} className={inp} placeholder="587" type="number" />
              </Field>
              <Field label="SMTP Username / Email">
                <input value={form.smtpUser} onChange={e => set("smtpUser", e.target.value)} className={inp} placeholder="you@gmail.com" />
              </Field>
              <SecretField k="smtpPass" label="SMTP Password / App Password" />
            </div>
          </Section>
        )}

        {tab === "regional" && (
          <Section title="Regional Settings" icon="🌍">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Timezone">
                <select value={form.timezone} onChange={e => set("timezone", e.target.value)}
                  className={inp + " cursor-pointer"}>
                  {["Asia/Karachi", "Asia/Kolkata", "Asia/Dubai", "Asia/Riyadh", "Europe/London", "America/New_York", "UTC"].map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </Field>
              <Field label="Currency">
                <select value={form.currency} onChange={e => set("currency", e.target.value)}
                  className={inp + " cursor-pointer"}>
                  {["PKR", "USD", "EUR", "GBP", "AED", "SAR", "INR", "BDT"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Language">
                <select value={form.language} onChange={e => set("language", e.target.value)}
                  className={inp + " cursor-pointer"}>
                  {[["en", "English"], ["ur", "Urdu"], ["ar", "Arabic"], ["hi", "Hindi"]].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Country">
                <select value={form.country} onChange={e => set("country", e.target.value)}
                  className={inp + " cursor-pointer"}>
                  {[["PK", "Pakistan"], ["IN", "India"], ["AE", "UAE"], ["SA", "Saudi Arabia"], ["GB", "United Kingdom"], ["US", "United States"]].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>
        )}
      </form>
    </div>
  );
}
