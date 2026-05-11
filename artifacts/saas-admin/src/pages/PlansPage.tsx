import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { tierColor } from "@/lib/utils";

const FEATURE_LABELS: Record<string, string> = {
  website: "Website", whatsappAutomation: "WhatsApp Automation", aiTools: "AI Tools",
  aiChatbot: "AI Chatbot", seoTools: "SEO Tools", metaIntegration: "Meta Integration",
  courierIntegrations: "Courier Integrations", analyticsAdvanced: "Advanced Analytics",
  marketingCampaigns: "Marketing Campaigns", multiUser: "Multi User", customDomain: "Custom Domain",
  mobileApp: "Mobile App", apiAccess: "API Access", prioritySupport: "Priority Support",
  blogModule: "Blog Module", loyaltyModule: "Loyalty Module", stripeConnect: "Stripe Connect",
  realtimeAnalytics: "Realtime Analytics", themeCustomization: "Theme Customization",
};

const NUM_FEATURES: Record<string, string> = {
  products: "Max Products", orders: "Max Orders/Mo", storageGb: "Storage (GB)",
  staffAccounts: "Staff Accounts", branches: "Branches",
};

const DEFAULT_FEATURES = {
  website: true, products: 50, orders: 100, whatsappAutomation: false, aiTools: false,
  aiChatbot: false, seoTools: false, metaIntegration: false, courierIntegrations: false,
  analyticsAdvanced: false, marketingCampaigns: false, multiUser: false, customDomain: false,
  storageGb: 1, staffAccounts: 1, branches: 1, prioritySupport: false, mobileApp: false,
  apiAccess: false, realtimeAnalytics: false, themeCustomization: true, blogModule: false,
  loyaltyModule: false, stripeConnect: false,
};

interface PlanForm {
  name: string; tier: string; description: string; priceMonthly: string; priceYearly: string;
  color: string; badgeLabel: string; trialDays: string; displayOrder: string;
  features: Record<string, any>;
}

const emptyForm = (): PlanForm => ({
  name: "", tier: "starter", description: "", priceMonthly: "0", priceYearly: "0",
  color: "#6366f1", badgeLabel: "", trialDays: "14", displayOrder: "0",
  features: { ...DEFAULT_FEATURES },
});

export default function PlansPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  async function load() {
    const data = await api.plans.list();
    setPlans(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(plan: any) {
    setEditingId(plan.id);
    setForm({
      name: plan.name, tier: plan.tier, description: plan.description || "",
      priceMonthly: plan.priceMonthly, priceYearly: plan.priceYearly,
      color: plan.color || "#6366f1", badgeLabel: plan.badgeLabel || "",
      trialDays: String(plan.trialDays), displayOrder: String(plan.displayOrder),
      features: { ...DEFAULT_FEATURES, ...plan.features },
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, trialDays: Number(form.trialDays), displayOrder: Number(form.displayOrder) };
    if (editingId) {
      await api.plans.update(editingId, payload);
    } else {
      await api.plans.create(payload);
    }
    setShowForm(false);
    load();
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!confirm("Deactivate this plan?")) return;
    await api.plans.delete(id);
    load();
  }

  const setFeature = (key: string, value: any) => setForm(f => ({ ...f, features: { ...f.features, [key]: value } }));

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Plans</h1>
          <p className="text-slate-400 text-sm mt-1">Manage subscription plans and feature sets</p>
        </div>
        <button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + New Plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {plans.map(plan => (
          <div key={plan.id} className={`bg-slate-900 border rounded-xl p-5 ${plan.isActive ? "border-slate-800" : "border-slate-800/40 opacity-60"}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${tierColor(plan.tier)}`}>{plan.tier}</span>
                  {plan.badgeLabel && <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">{plan.badgeLabel}</span>}
                  {!plan.isActive && <span className="text-xs text-red-400">Inactive</span>}
                </div>
                <h3 className="text-white font-semibold mt-1">{plan.name}</h3>
              </div>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: plan.color }} />
            </div>

            <div className="mb-3">
              <span className="text-2xl font-bold text-white">Rs. {plan.priceMonthly}</span>
              <span className="text-slate-400 text-sm">/mo</span>
              {plan.priceYearly !== "0" && <div className="text-sm text-slate-400">Rs. {plan.priceYearly}/yr</div>}
            </div>

            {plan.description && <p className="text-xs text-slate-400 mb-3">{plan.description}</p>}

            <div className="border-t border-slate-800 pt-3 mb-4">
              <div className="grid grid-cols-2 gap-1 text-xs">
                {Object.entries(NUM_FEATURES).map(([key, label]) => (
                  <div key={key} className="text-slate-400">
                    <span className="text-white font-medium">{plan.features?.[key] === -1 ? "∞" : (plan.features?.[key] ?? "—")}</span> {label}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {Object.entries(FEATURE_LABELS).filter(([key]) => plan.features?.[key] === true).map(([key, label]) => (
                  <span key={key} className="text-xs bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">{label}</span>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => openEdit(plan)} className="flex-1 text-xs bg-slate-800 hover:bg-slate-700 text-white py-1.5 rounded-lg transition-colors">Edit</button>
              <button onClick={() => handleDelete(plan.id)} className="flex-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 py-1.5 rounded-lg transition-colors">Deactivate</button>
            </div>
          </div>
        ))}

        {plans.length === 0 && (
          <div className="col-span-3 bg-slate-900 border border-slate-800 border-dashed rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-slate-400">No plans yet. Create your first pricing plan.</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl my-8">
            <h2 className="text-lg font-semibold text-white mb-5">{editingId ? "Edit Plan" : "Create Plan"}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Plan Name *">
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp} required />
                </Field>
                <Field label="Tier">
                  <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))} className={inp}>
                    {["starter", "business", "enterprise", "custom"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Description">
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inp} />
              </Field>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Monthly Price (Rs.)">
                  <input type="number" value={form.priceMonthly} onChange={e => setForm(f => ({ ...f, priceMonthly: e.target.value }))} className={inp} />
                </Field>
                <Field label="Yearly Price (Rs.)">
                  <input type="number" value={form.priceYearly} onChange={e => setForm(f => ({ ...f, priceYearly: e.target.value }))} className={inp} />
                </Field>
                <Field label="Trial Days">
                  <input type="number" value={form.trialDays} onChange={e => setForm(f => ({ ...f, trialDays: e.target.value }))} className={inp} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Badge Label">
                  <input value={form.badgeLabel} onChange={e => setForm(f => ({ ...f, badgeLabel: e.target.value }))} className={inp} placeholder="Popular" />
                </Field>
                <Field label="Color">
                  <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-full h-9 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer" />
                </Field>
                <Field label="Display Order">
                  <input type="number" value={form.displayOrder} onChange={e => setForm(f => ({ ...f, displayOrder: e.target.value }))} className={inp} />
                </Field>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-sm font-semibold text-white mb-3">Numeric Limits</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {Object.entries(NUM_FEATURES).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <input type="number" value={form.features[key] ?? 0} onChange={e => setFeature(key, Number(e.target.value))} className={inp} />
                    </Field>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-sm font-semibold text-white mb-3">Feature Toggles</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!form.features[key]}
                        onChange={e => setFeature(key, e.target.checked)}
                        className="rounded border-slate-600 bg-slate-800 text-emerald-600"
                      />
                      <span className="text-xs text-slate-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-sm py-2 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors">
                  {saving ? "Saving..." : editingId ? "Update Plan" : "Create Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const inp = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
