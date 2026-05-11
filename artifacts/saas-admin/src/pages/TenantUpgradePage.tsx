import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";

interface Plan {
  id: number;
  name: string;
  tier: string;
  priceMonthly: string;
  priceYearly: string;
  currency: string;
  features: Record<string, any>;
  color: string;
  badgeLabel: string | null;
  trialDays: number;
  description: string | null;
}

interface TenantInfo {
  plan: { id: number; name: string; tier: string } | null;
  status: string;
  trialEndsAt: string | null;
}

const FEATURE_LABELS: [string, string][] = [
  ["products",             "Products limit"],
  ["orders",               "Monthly orders"],
  ["website",              "Online storefront"],
  ["whatsappAutomation",   "WhatsApp automation"],
  ["aiTools",              "AI content tools"],
  ["aiChatbot",            "AI chatbot"],
  ["courierIntegrations",  "Courier APIs"],
  ["seoTools",             "SEO toolkit"],
  ["metaIntegration",      "Meta Pixel & Ads"],
  ["analyticsAdvanced",    "Advanced analytics"],
  ["marketingCampaigns",   "Marketing campaigns"],
  ["customDomain",         "Custom domain"],
  ["multiUser",            "Multi-user access"],
  ["prioritySupport",      "Priority support"],
  ["mobileApp",            "Mobile app"],
  ["apiAccess",            "API access"],
  ["blogModule",           "Blog module"],
  ["loyaltyModule",        "Loyalty program"],
];

function renderValue(key: string, val: any): string {
  if (key === "products") return val === -1 ? "Unlimited" : `${val} products`;
  if (key === "orders") return val === -1 ? "Unlimited" : `${val}/month`;
  if (typeof val === "boolean") return val ? "✓" : "✕";
  return String(val);
}

function tierBadge(tier: string) {
  const map: Record<string, string> = {
    starter:    "bg-slate-700 text-slate-300",
    business:   "bg-indigo-600/30 text-indigo-300",
    enterprise: "bg-amber-600/30 text-amber-300",
    custom:     "bg-purple-600/30 text-purple-300",
  };
  return map[tier] ?? "bg-slate-700 text-slate-300";
}

export default function TenantUpgradePage() {
  const [, navigate] = useLocation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    Promise.all([
      api.tenant.publicPlans(),
      api.tenant.me(),
    ]).then(([plansData, meData]) => {
      setPlans(plansData);
      setTenant({ plan: meData.plan, status: meData.status, trialEndsAt: meData.trialEndsAt });
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleSelect(plan: Plan) {
    setSelectedPlan(plan);
    setShowModal(true);
  }

  const price = (p: Plan) => {
    const v = cycle === "yearly" ? p.priceYearly : p.priceMonthly;
    return Math.round(Number(v)).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080d1a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Upgrade Plan</h1>
          <p className="text-slate-400 text-sm mt-0.5">Choose the plan that best fits your business</p>
        </div>
        <button onClick={() => navigate("/portal/dashboard")}
          className="text-sm px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white transition-colors">
          ← Back
        </button>
      </div>

      {tenant?.status === "trial" && tenant.trialEndsAt && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-5 py-4">
          <p className="font-semibold text-sm">You are on a free trial</p>
          <p className="text-xs opacity-70 mt-0.5">
            Trial ends {new Date(tenant.trialEndsAt).toLocaleDateString()}. Upgrade now to continue without interruption.
          </p>
        </div>
      )}

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm ${cycle === "monthly" ? "text-white" : "text-slate-500"}`}>Monthly</span>
        <button
          onClick={() => setCycle(c => c === "monthly" ? "yearly" : "monthly")}
          className={`relative w-12 h-6 rounded-full transition-colors ${cycle === "yearly" ? "bg-emerald-600" : "bg-slate-700"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cycle === "yearly" ? "translate-x-6" : ""}`} />
        </button>
        <span className={`text-sm ${cycle === "yearly" ? "text-white" : "text-slate-500"}`}>
          Yearly <span className="text-emerald-400 text-xs font-medium ml-1">Save 20%</span>
        </span>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map(plan => {
          const isCurrent = tenant?.plan?.id === plan.id;
          return (
            <div
              key={plan.id}
              className={`relative bg-slate-900 border rounded-2xl p-6 flex flex-col transition-all ${
                isCurrent
                  ? "border-emerald-500/50 ring-1 ring-emerald-500/20"
                  : plan.badgeLabel
                  ? "border-indigo-500/50"
                  : "border-slate-800 hover:border-slate-700"
              }`}
            >
              {plan.badgeLabel && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    {plan.badgeLabel}
                  </span>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4">
                  <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    Current Plan
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: plan.color ?? "#6366f1" }} />
                <span className="text-sm font-semibold text-white">{plan.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-md ${tierBadge(plan.tier)}`}>{plan.tier}</span>
              </div>

              {plan.description && (
                <p className="text-xs text-slate-500 mb-4">{plan.description}</p>
              )}

              <div className="mb-5">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">{plan.currency} {price(plan)}</span>
                  <span className="text-slate-500 text-sm">/{cycle === "yearly" ? "yr" : "mo"}</span>
                </div>
                {cycle === "yearly" && (
                  <p className="text-xs text-emerald-400 mt-0.5">
                    ~{plan.currency} {Math.round(Number(plan.priceYearly) / 12).toLocaleString()}/mo
                  </p>
                )}
              </div>

              <div className="flex-1 space-y-2 mb-6">
                {FEATURE_LABELS.map(([key, label]) => {
                  const val = plan.features?.[key];
                  if (val === undefined || val === null) return null;
                  const positive = val === true || (typeof val === "number" && val !== 0);
                  return (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className={positive ? "text-slate-300" : "text-slate-600"}>{label}</span>
                      <span className={`font-medium ${positive ? (val === true ? "text-emerald-400" : "text-white") : "text-slate-700"}`}>
                        {renderValue(key, val)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => handleSelect(plan)}
                disabled={isCurrent}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isCurrent
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                }`}
              >
                {isCurrent ? "Current Plan" : "Select Plan"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-2">Need a custom plan?</h3>
        <p className="text-xs text-slate-400 mb-3">
          Contact us for enterprise pricing, custom features, dedicated support, or multi-store setups.
        </p>
        <a
          href="mailto:support@platform.com"
          className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          📧 Contact Sales →
        </a>
      </div>

      {/* Confirmation Modal */}
      {showModal && selectedPlan && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1424] border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-2">Upgrade to {selectedPlan.name}?</h2>
            <p className="text-sm text-slate-400 mb-5">
              You'll be switching to the <strong className="text-white">{selectedPlan.name}</strong> plan at{" "}
              <strong className="text-emerald-400">
                {selectedPlan.currency} {price(selectedPlan)}/{cycle === "yearly" ? "yr" : "mo"}
              </strong>.
              Please contact support to complete the payment and plan activation.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <a
                href={`mailto:support@platform.com?subject=Upgrade to ${selectedPlan.name}&body=I'd like to upgrade my plan to ${selectedPlan.name} (${cycle}).`}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold text-center transition-colors"
                onClick={() => setShowModal(false)}
              >
                Contact Support
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
