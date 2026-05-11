import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api, setTenantToken } from "@/lib/api";
import { industryIcon } from "@/lib/utils";

const INDUSTRIES = [
  { id: "grocery", label: "Grocery & Supermarket", icon: "🛒", desc: "Fresh produce, daily essentials" },
  { id: "fashion", label: "Fashion & Apparel", icon: "👗", desc: "Clothing, shoes & accessories" },
  { id: "electronics", label: "Electronics & Gadgets", icon: "📱", desc: "Tech products & devices" },
  { id: "pharmacy", label: "Health & Pharmacy", icon: "💊", desc: "Medicine & wellness products" },
  { id: "food", label: "Food & Restaurant", icon: "🍔", desc: "Ready meals & catering" },
  { id: "beauty", label: "Beauty & Cosmetics", icon: "💄", desc: "Skincare, makeup & personal care" },
  { id: "sports", label: "Sports & Fitness", icon: "⚽", desc: "Sports equipment & activewear" },
  { id: "furniture", label: "Furniture & Home", icon: "🛋️", desc: "Furniture & home decor" },
  { id: "books", label: "Books & Stationery", icon: "📚", desc: "Books, office & educational" },
  { id: "other", label: "Other / General", icon: "🏪", desc: "Multi-purpose retail" },
];

interface Plan {
  id: number;
  name: string;
  tier: string;
  priceMonthly: string;
  description: string;
  features: Record<string, any>;
  color: string;
  badgeLabel?: string;
}

export default function TenantRegisterPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    storeName: "",
    ownerPhone: "",
    industry: "",
    planId: "",
  });

  useEffect(() => {
    api.tenant.publicPlans().then(setPlans).catch(() => setPlans([]));
  }, []);

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }));
    setError("");
  }

  function canProceedStep1() {
    return form.name && form.email && form.password && form.password === form.confirmPassword && form.password.length >= 6;
  }

  function canProceedStep2() {
    return form.storeName && form.industry;
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      const data = await api.tenant.register({
        name: form.name,
        email: form.email,
        password: form.password,
        storeName: form.storeName,
        ownerPhone: form.ownerPhone,
        industry: form.industry,
        planId: form.planId ? Number(form.planId) : undefined,
      });
      setTenantToken(data.token);
      navigate("/portal/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  const inp = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-emerald-500 transition-colors";

  return (
    <div className="min-h-screen bg-[#080d1a] flex flex-col">
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-sm">⚡</div>
          <span className="text-white font-bold text-sm">SaaS Platform</span>
        </div>
        <button
          onClick={() => navigate("/portal/login")}
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          Already have an account? Sign in →
        </button>
      </nav>

      <div className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white">Launch your store</h1>
            <p className="text-slate-400 mt-2">Start for free — no credit card required</p>
          </div>

          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                  s < step ? "bg-emerald-600 border-emerald-600 text-white" :
                  s === step ? "border-emerald-500 text-emerald-400 bg-emerald-500/10" :
                  "border-slate-700 text-slate-600"
                }`}>
                  {s < step ? "✓" : s}
                </div>
                <span className={`text-xs hidden sm:block ${s === step ? "text-white" : "text-slate-500"}`}>
                  {s === 1 ? "Account" : s === 2 ? "Store Info" : "Choose Plan"}
                </span>
                {s < 3 && <div className={`w-10 h-px ${s < step ? "bg-emerald-600" : "bg-slate-800"}`} />}
              </div>
            ))}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white mb-1">Create your account</h2>
                  <p className="text-slate-400 text-sm">Your login credentials to manage your store</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Full Name *</label>
                    <input value={form.name} onChange={e => set("name", e.target.value)} className={inp} placeholder="John Doe" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Email Address *</label>
                    <input type="email" value={form.email} onChange={e => set("email", e.target.value)} className={inp} placeholder="you@store.com" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Password *</label>
                    <input type="password" value={form.password} onChange={e => set("password", e.target.value)} className={inp} placeholder="Min. 6 characters" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Confirm Password *</label>
                    <input type="password" value={form.confirmPassword} onChange={e => set("confirmPassword", e.target.value)} className={inp} placeholder="Repeat password" />
                  </div>
                </div>
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <p className="text-red-400 text-xs">Passwords do not match</p>
                )}
                <button
                  onClick={() => setStep(2)}
                  disabled={!canProceedStep1()}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                >
                  Continue →
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white mb-1">Tell us about your store</h2>
                  <p className="text-slate-400 text-sm">This helps us customize your storefront experience</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs text-slate-400 mb-1.5 block">Store Name *</label>
                    <input value={form.storeName} onChange={e => set("storeName", e.target.value)} className={inp} placeholder="My Awesome Store" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Phone Number (optional)</label>
                    <input value={form.ownerPhone} onChange={e => set("ownerPhone", e.target.value)} className={inp} placeholder="03001234567" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-2 block">Industry / Category *</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {INDUSTRIES.map(ind => (
                      <button
                        key={ind.id}
                        onClick={() => set("industry", ind.id)}
                        className={`p-3 rounded-xl border text-left transition-all ${form.industry === ind.id
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-slate-800 hover:border-slate-600 bg-slate-800/40"
                        }`}
                      >
                        <div className="text-xl mb-1">{ind.icon}</div>
                        <div className="text-xs font-medium text-white leading-tight">{ind.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5 leading-tight hidden sm:block">{ind.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-sm py-2.5 rounded-lg transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!canProceedStep2()}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                  >
                    Continue →
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white mb-1">Choose your plan</h2>
                  <p className="text-slate-400 text-sm">Start with a free trial — upgrade anytime</p>
                </div>

                {plans.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {plans.map(plan => (
                      <div
                        key={plan.id}
                        onClick={() => set("planId", String(plan.id))}
                        className={`p-5 rounded-xl border cursor-pointer transition-all ${form.planId === String(plan.id)
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-slate-800 hover:border-slate-600 bg-slate-800/40"
                        }`}
                      >
                        {plan.badgeLabel && (
                          <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">{plan.badgeLabel}</span>
                        )}
                        <div className="mt-2">
                          <div className="text-white font-bold">{plan.name}</div>
                          <div className="text-emerald-400 text-2xl font-bold mt-1">
                            {plan.priceMonthly === "0" ? "Free" : `Rs. ${plan.priceMonthly}`}
                            {plan.priceMonthly !== "0" && <span className="text-sm text-slate-400 font-normal">/mo</span>}
                          </div>
                          {plan.description && <p className="text-xs text-slate-400 mt-2">{plan.description}</p>}
                        </div>
                        <div className="mt-3 space-y-1">
                          {plan.features?.products && (
                            <div className="text-xs text-slate-400">
                              <span className="text-white">{plan.features.products === -1 ? "∞" : plan.features.products}</span> products
                            </div>
                          )}
                          {plan.features?.whatsappAutomation && <div className="text-xs text-emerald-400">✓ WhatsApp Automation</div>}
                          {plan.features?.aiTools && <div className="text-xs text-emerald-400">✓ AI Tools</div>}
                          {plan.features?.aiChatbot && <div className="text-xs text-emerald-400">✓ AI Chatbot</div>}
                          {plan.features?.customDomain && <div className="text-xs text-emerald-400">✓ Custom Domain</div>}
                        </div>
                        {form.planId === String(plan.id) && (
                          <div className="mt-3 text-xs text-emerald-400 font-medium">✓ Selected</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-800/40 rounded-xl p-6 text-center text-slate-400 text-sm">
                    You'll be enrolled in the default free trial plan. You can upgrade later from your dashboard.
                  </div>
                )}

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-sm py-2.5 rounded-lg transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                  >
                    {loading ? "Creating store..." : "🚀 Launch My Store"}
                  </button>
                </div>

                <p className="text-center text-xs text-slate-500">
                  14-day free trial • No credit card required • Cancel anytime
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
