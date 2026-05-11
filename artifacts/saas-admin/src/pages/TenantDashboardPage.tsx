import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api, clearTenantToken } from "@/lib/api";
import { formatDate, statusColor, tierColor, industryIcon } from "@/lib/utils";

interface TenantMe {
  id: number;
  name: string;
  email: string;
  storeName: string;
  slug: string;
  industry: string;
  status: string;
  plan: {
    name: string;
    tier: string;
    features: Record<string, any>;
  };
  trialEndsAt: string | null;
  createdAt: string;
  ordersThisMonth: number;
  productsCount: number;
}

const FEATURE_LABELS: Record<string, string> = {
  aiChatbot: "AI Chatbot",
  whatsappAutomation: "WhatsApp Automation",
  aiTools: "AI Content Tools",
  customDomain: "Custom Domain",
  courierIntegration: "Courier APIs",
  analytics: "Analytics",
  prioritySupport: "Priority Support",
};

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

export default function TenantDashboardPage() {
  const [, navigate] = useLocation();
  const [me, setMe] = useState<TenantMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.tenant.me()
      .then(d => setMe(d.tenant ?? d))
      .catch(err => {
        if (err.message?.includes("401") || err.message?.toLowerCase().includes("unauthorized")) {
          clearTenantToken();
          navigate("/portal/login");
        } else {
          setError(err.message || "Failed to load");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    clearTenantToken();
    navigate("/portal/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080d1a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="min-h-screen bg-[#080d1a] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || "Failed to load your account"}</p>
          <button onClick={handleLogout} className="text-sm text-emerald-400 hover:text-emerald-300">Sign in again →</button>
        </div>
      </div>
    );
  }

  const daysLeftTrial = me.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(me.trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;

  const activeFeatures = Object.entries(me.plan?.features ?? {})
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  return (
    <div className="min-h-screen bg-[#080d1a] flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0d1424] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-sm">⚡</div>
          <div>
            <div className="text-white font-bold text-sm">{me.storeName}</div>
            <div className="text-slate-500 text-xs">Tenant Dashboard</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full ${statusColor(me.status)}`}>{me.status}</span>
            <span className={`text-xs px-2.5 py-1 rounded-full ${tierColor(me.plan?.tier ?? "starter")}`}>
              {me.plan?.name ?? "Free"}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-500/10"
          >
            🚪 Sign Out
          </button>
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-8 space-y-8">
        {/* Trial banner */}
        {daysLeftTrial !== null && daysLeftTrial <= 14 && (
          <div className={`rounded-xl border px-5 py-4 flex items-center justify-between ${
            daysLeftTrial <= 3
              ? "bg-red-500/10 border-red-500/30 text-red-300"
              : "bg-amber-500/10 border-amber-500/30 text-amber-300"
          }`}>
            <div>
              <p className="font-semibold text-sm">
                {daysLeftTrial === 0 ? "Your trial has ended" : `${daysLeftTrial} days left in your free trial`}
              </p>
              <p className="text-xs opacity-70 mt-0.5">
                Upgrade your plan to keep using all features without interruption.
              </p>
            </div>
            <button className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors ml-4 shrink-0">
              Upgrade Plan
            </button>
          </div>
        )}

        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-white mb-0.5">
            {industryIcon(me.industry)} {me.storeName}
          </h1>
          <p className="text-slate-400 text-sm">Welcome back, {me.name} · Member since {formatDate(me.createdAt)}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon="📦" label="Orders this month" value={me.ordersThisMonth ?? 0} />
          <StatCard icon="🛍️" label="Products" value={me.productsCount ?? 0} />
          <StatCard
            icon="📅"
            label="Trial ends"
            value={me.trialEndsAt ? `${daysLeftTrial}d left` : "—"}
            sub={me.trialEndsAt ? formatDate(me.trialEndsAt) : "No trial"}
          />
          <StatCard icon="📋" label="Plan" value={me.plan?.name ?? "Free"} sub={me.plan?.tier} />
        </div>

        {/* Store info + Plan features */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Store info */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-white mb-4">Store Details</h2>
            <div className="space-y-3">
              {[
                { label: "Store name", value: me.storeName },
                { label: "Slug / URL", value: `/${me.slug}` },
                { label: "Industry", value: `${industryIcon(me.industry)} ${me.industry}` },
                { label: "Account email", value: me.email },
                { label: "Status", value: <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(me.status)}`}>{me.status}</span> },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <span className="text-xs text-slate-400">{row.label}</span>
                  <span className="text-xs text-white font-medium">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Features */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Your Plan Features</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${tierColor(me.plan?.tier ?? "starter")}`}>
                {me.plan?.name}
              </span>
            </div>
            <div className="space-y-2">
              {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                const enabled = me.plan?.features?.[key];
                return (
                  <div key={key} className="flex items-center gap-2.5 py-1">
                    <span className={`text-sm ${enabled ? "text-emerald-400" : "text-slate-700"}`}>
                      {enabled ? "✓" : "✕"}
                    </span>
                    <span className={`text-sm ${enabled ? "text-slate-300" : "text-slate-600"}`}>{label}</span>
                  </div>
                );
              })}
              {me.plan?.features?.products && (
                <div className="pt-2 mt-2 border-t border-slate-800">
                  <span className="text-xs text-slate-400">
                    Products:{" "}
                    <span className="text-white">
                      {me.plan.features.products === -1 ? "Unlimited" : me.plan.features.products}
                    </span>
                  </span>
                </div>
              )}
            </div>
            <button className="mt-5 w-full bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/30 text-emerald-400 text-xs font-medium py-2.5 rounded-lg transition-colors">
              Upgrade Plan →
            </button>
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: "🛍️", label: "Manage Products" },
              { icon: "📦", label: "View Orders" },
              { icon: "🎨", label: "Customize Theme" },
              { icon: "📊", label: "Analytics" },
            ].map(action => (
              <button
                key={action.label}
                className="flex flex-col items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl p-4 transition-all text-center group"
              >
                <span className="text-2xl">{action.icon}</span>
                <span className="text-xs text-slate-300 group-hover:text-white transition-colors font-medium leading-tight">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Getting started checklist */}
        <div className="bg-gradient-to-br from-emerald-900/20 to-slate-900 border border-emerald-500/20 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-white mb-1">Getting Started</h2>
          <p className="text-xs text-slate-400 mb-4">Complete these steps to launch your store</p>
          <div className="space-y-3">
            {[
              { label: "Create your account", done: true },
              { label: "Add your first product", done: me.productsCount > 0 },
              { label: "Customize your storefront theme", done: false },
              { label: "Configure WhatsApp notifications", done: false },
              { label: "Connect a courier API", done: false },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs shrink-0 ${
                  step.done ? "border-emerald-500 bg-emerald-500" : "border-slate-600"
                }`}>
                  {step.done && <span className="text-white text-xs">✓</span>}
                </div>
                <span className={`text-sm ${step.done ? "line-through text-slate-500" : "text-slate-300"}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
