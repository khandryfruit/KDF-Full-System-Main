import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, statusColor, tierColor, industryIcon } from "@/lib/utils";

const FEATURE_LABELS: Record<string, string> = {
  website: "Website", products: "Max Products", orders: "Max Orders/Month",
  whatsappAutomation: "WhatsApp Automation", aiTools: "AI Tools", aiChatbot: "AI Chatbot",
  seoTools: "SEO Tools", metaIntegration: "Meta Integration", courierIntegrations: "Courier Integrations",
  analyticsAdvanced: "Advanced Analytics", marketingCampaigns: "Marketing Campaigns",
  multiUser: "Multi User", customDomain: "Custom Domain", storageGb: "Storage (GB)",
  staffAccounts: "Staff Accounts", branches: "Branches", prioritySupport: "Priority Support",
  mobileApp: "Mobile App", apiAccess: "API Access", realtimeAnalytics: "Realtime Analytics",
  themeCustomization: "Theme Customization", blogModule: "Blog Module", loyaltyModule: "Loyalty Module",
  stripeConnect: "Stripe Connect",
};

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [tenant, setTenant] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "features" | "activity" | "plan">("overview");
  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [features, setFeatures] = useState<Record<string, any>>({});

  async function load() {
    const [t, p, a] = await Promise.all([
      api.tenants.get(Number(id)),
      api.plans.list(),
      api.activity(Number(id)),
    ]);
    setTenant(t);
    setEditStatus(t.status);
    setEditNotes(t.notes || "");
    setFeatures(t.featureOverrides || {});
    setPlans(p);
    setActivity(a);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function saveNotes() {
    setSaving(true);
    await api.tenants.update(Number(id), { notes: editNotes, status: editStatus });
    load();
    setSaving(false);
  }

  async function saveFeatures() {
    setSaving(true);
    await api.tenants.updateFeatures(Number(id), features);
    load();
    setSaving(false);
  }

  async function changePlan(planId: number) {
    await api.tenants.changePlan(Number(id), planId);
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tenant) return <div className="text-slate-400">Tenant not found</div>;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "features", label: "Features" },
    { id: "plan", label: "Plan" },
    { id: "activity", label: "Activity" },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/tenants")} className="text-slate-400 hover:text-white transition-colors text-sm">
          ← Tenants
        </button>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">{tenant.storeName}</span>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-2xl">
              {industryIcon(tenant.industry)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{tenant.storeName}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(tenant.status)}`}>{tenant.status}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${tierColor(tenant.plan?.tier || "")}`}>{tenant.plan?.name || "No Plan"}</span>
                <span className="text-xs text-slate-500 capitalize">{tenant.industry}</span>
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>ID: #{tenant.id}</div>
            <div>Joined: {formatDate(tenant.createdAt)}</div>
            {tenant.trialEndsAt && <div>Trial ends: {formatDate(tenant.trialEndsAt)}</div>}
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-all ${tab === t.id ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white">Contact Info</h2>
            <Row label="Email" value={tenant.email} />
            <Row label="Owner" value={tenant.ownerName} />
            <Row label="Phone" value={tenant.ownerPhone} />
            <Row label="Store Slug" value={tenant.storeSlug} mono />
            <Row label="Subdomain" value={tenant.subdomain} mono />
            <Row label="Custom Domain" value={tenant.customDomain} />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white">Admin Notes & Status</h2>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Status</label>
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              >
                {["trial", "active", "suspended", "cancelled", "pending"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Notes</label>
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                rows={4}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 resize-none"
                placeholder="Internal notes about this tenant..."
              />
            </div>
            {tenant.suspendReason && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-400 text-xs">
                Suspend reason: {tenant.suspendReason}
              </div>
            )}
            <button
              onClick={saveNotes}
              disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {tab === "features" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Feature Overrides</h2>
            <button
              onClick={saveFeatures}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
            >
              {saving ? "Saving..." : "Save Overrides"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4">Override individual features for this tenant regardless of plan.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(FEATURE_LABELS).map(([key, label]) => {
              const planValue = tenant.plan?.features?.[key];
              const overrideValue = features[key];
              const isBoolean = typeof planValue === "boolean" || (planValue === undefined && typeof overrideValue === "boolean") || overrideValue === undefined;
              return (
                <div key={key} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2.5">
                  <div>
                    <div className="text-sm text-white">{label}</div>
                    <div className="text-xs text-slate-500">Plan default: {String(planValue ?? "—")}</div>
                  </div>
                  {isBoolean ? (
                    <button
                      onClick={() => setFeatures(f => ({ ...f, [key]: overrideValue === undefined ? !planValue : !overrideValue }))}
                      className={`w-10 h-5 rounded-full transition-colors ${overrideValue === true || (overrideValue === undefined && planValue === true) ? "bg-emerald-600" : "bg-slate-700"}`}
                    >
                      <div className={`w-3.5 h-3.5 bg-white rounded-full mx-auto transition-transform ${overrideValue === true || (overrideValue === undefined && planValue === true) ? "translate-x-2.5" : "-translate-x-2.5"}`} />
                    </button>
                  ) : (
                    <input
                      type="number"
                      value={overrideValue ?? planValue ?? ""}
                      onChange={e => setFeatures(f => ({ ...f, [key]: Number(e.target.value) }))}
                      className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white text-right outline-none focus:border-emerald-500"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "plan" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Change Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map(plan => (
              <div
                key={plan.id}
                className={`border rounded-xl p-4 cursor-pointer transition-all ${tenant.plan?.id === plan.id ? "border-emerald-500 bg-emerald-500/5" : "border-slate-800 hover:border-slate-600"}`}
                onClick={() => changePlan(plan.id)}
              >
                <div className={`text-xs px-2 py-0.5 rounded-full w-fit mb-2 ${tierColor(plan.tier)}`}>{plan.tier}</div>
                <div className="font-semibold text-white">{plan.name}</div>
                <div className="text-emerald-400 font-bold mt-1">Rs. {plan.priceMonthly}/mo</div>
                <div className="text-xs text-slate-400 mt-2">{plan.description}</div>
                {tenant.plan?.id === plan.id && (
                  <div className="text-xs text-emerald-400 mt-2 font-medium">✓ Current Plan</div>
                )}
              </div>
            ))}
            {plans.length === 0 && <div className="text-slate-500 text-sm col-span-3">No plans configured yet. Go to Plans to create some.</div>}
          </div>
        </div>
      )}

      {tab === "activity" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Activity Log</h2>
          <div className="space-y-3">
            {activity.map((log: any) => (
              <div key={log.id} className="flex items-start gap-3 text-sm border-b border-slate-800/50 pb-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                <div className="flex-1">
                  <span className="text-white font-medium">{log.action.replace(/_/g, " ")}</span>
                  {log.entity && <span className="text-slate-400"> · {log.entity} #{log.entityId}</span>}
                  {log.meta && Object.keys(log.meta).length > 0 && (
                    <div className="text-xs text-slate-500 mt-0.5">{JSON.stringify(log.meta)}</div>
                  )}
                  <div className="text-xs text-slate-600 mt-0.5">{formatDateTime(log.createdAt)}</div>
                </div>
              </div>
            ))}
            {activity.length === 0 && <p className="text-slate-500 text-sm">No activity recorded yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4 text-sm">
      <span className="text-slate-500 flex-shrink-0">{label}</span>
      <span className={`text-slate-300 text-right truncate max-w-xs ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</span>
    </div>
  );
}
