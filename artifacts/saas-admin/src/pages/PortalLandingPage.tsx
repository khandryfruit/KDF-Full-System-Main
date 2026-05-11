import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";

interface Plan {
  id: number;
  name: string;
  tier: string;
  priceMonthly: string;
  priceYearly: string;
  description: string;
  features: Record<string, any>;
  isPopular?: boolean;
}

const FEATURES_LIST = [
  { icon: "🛒", title: "Full E-commerce Store", desc: "Product catalog, cart, checkout — ready in minutes" },
  { icon: "🤖", title: "AI Chatbot & Support", desc: "GPT-powered assistant handles customer queries 24/7" },
  { icon: "📲", title: "WhatsApp Automation", desc: "Order confirmations, marketing, and support via WhatsApp" },
  { icon: "📦", title: "Courier Integration", desc: "Auto-book TCS, PostEx, Leopards, Trax & more" },
  { icon: "📊", title: "Analytics Dashboard", desc: "Revenue, orders, and customer insights in real time" },
  { icon: "🎨", title: "Storefront Builder", desc: "Pick a template, customize colors, fonts & branding" },
];

const TIER_STYLES: Record<string, string> = {
  starter:    "border-slate-700 bg-slate-900/60",
  business:   "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/30",
  enterprise: "border-slate-700 bg-slate-900/60",
  custom:     "border-purple-500/40 bg-slate-900/60",
};

export default function PortalLandingPage() {
  const [, navigate] = useLocation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [yearly, setYearly] = useState(false);

  useEffect(() => {
    api.tenant.publicPlans().then(d => setPlans(d.plans ?? d)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#080d1a] text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-slate-800/80 backdrop-blur-md bg-[#080d1a]/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-sm">⚡</div>
          <span className="text-white font-bold">SaaS Platform</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/portal/login")}
            className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2"
          >
            Sign In
          </button>
          <button
            onClick={() => navigate("/portal/register")}
            className="text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Start Free Trial
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 py-24 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Launch your online store in minutes
        </div>
        <h1 className="text-5xl md:text-6xl font-black leading-tight tracking-tight mb-6">
          The complete<br />
          <span className="text-emerald-400">e-commerce platform</span><br />
          for Pakistani businesses
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
          AI chatbot, WhatsApp automation, courier integration, and a beautiful storefront — everything you need to sell online, in one platform.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => navigate("/portal/register")}
            className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all text-sm shadow-lg shadow-emerald-900/40"
          >
            🚀 Start Free — No Credit Card
          </button>
          <button
            onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
            className="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl transition-all text-sm"
          >
            See Pricing →
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mt-16 max-w-xl mx-auto">
          {[
            { value: "14-day", label: "Free trial" },
            { value: "8+", label: "Courier APIs" },
            { value: "24/7", label: "AI support" },
          ].map(stat => (
            <div key={stat.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-2xl font-black text-emerald-400">{stat.value}</div>
              <div className="text-xs text-slate-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-3">Everything you need to sell online</h2>
          <p className="text-slate-400">Built for Pakistani e-commerce from day one</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES_LIST.map(feat => (
            <div key={feat.title} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-colors">
              <div className="text-3xl mb-3">{feat.icon}</div>
              <h3 className="text-white font-semibold mb-1.5">{feat.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white mb-3">Simple, transparent pricing</h2>
          <p className="text-slate-400 mb-6">Start free. Scale as you grow.</p>
          <div className="inline-flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => setYearly(false)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${!yearly ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${yearly ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              Yearly
              <span className="ml-1.5 text-xs bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">-20%</span>
            </button>
          </div>
        </div>

        {plans.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map(plan => {
              const price = yearly && plan.priceYearly
                ? (Number(plan.priceYearly) / 12).toFixed(0)
                : plan.priceMonthly;
              const isPopular = plan.tier === "business";

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl border p-7 flex flex-col ${TIER_STYLES[plan.tier] ?? "border-slate-700 bg-slate-900/60"}`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full shadow-lg">
                      MOST POPULAR
                    </div>
                  )}
                  <div className="mb-5">
                    <div className="text-white font-bold text-lg">{plan.name}</div>
                    <div className="mt-3 flex items-end gap-1">
                      {price === "0" ? (
                        <span className="text-4xl font-black text-white">Free</span>
                      ) : (
                        <>
                          <span className="text-slate-400 text-sm mb-1">Rs.</span>
                          <span className="text-4xl font-black text-white">{Number(price).toLocaleString()}</span>
                          <span className="text-slate-400 text-sm mb-1">/mo</span>
                        </>
                      )}
                    </div>
                    {yearly && plan.priceYearly && price !== "0" && (
                      <p className="text-xs text-emerald-400 mt-1">Billed Rs. {Number(plan.priceYearly).toLocaleString()} yearly</p>
                    )}
                    {plan.description && <p className="text-slate-400 text-sm mt-3 leading-relaxed">{plan.description}</p>}
                  </div>

                  <div className="flex-1 space-y-2.5 mb-6">
                    {plan.features?.products && (
                      <div className="flex items-center gap-2.5 text-sm">
                        <span className="text-emerald-400">✓</span>
                        <span className="text-slate-300">
                          {plan.features.products === -1 ? "Unlimited" : plan.features.products} products
                        </span>
                      </div>
                    )}
                    {plan.features?.orders && (
                      <div className="flex items-center gap-2.5 text-sm">
                        <span className="text-emerald-400">✓</span>
                        <span className="text-slate-300">
                          {plan.features.orders === -1 ? "Unlimited" : `${plan.features.orders}/mo`} orders
                        </span>
                      </div>
                    )}
                    {[
                      { key: "aiChatbot", label: "AI Chatbot" },
                      { key: "whatsappAutomation", label: "WhatsApp Automation" },
                      { key: "aiTools", label: "AI Content Tools" },
                      { key: "customDomain", label: "Custom Domain" },
                      { key: "courierIntegration", label: "Courier Integration" },
                      { key: "analytics", label: "Advanced Analytics" },
                      { key: "prioritySupport", label: "Priority Support" },
                    ].map(({ key, label }) => (
                      plan.features?.[key] ? (
                        <div key={key} className="flex items-center gap-2.5 text-sm">
                          <span className="text-emerald-400">✓</span>
                          <span className="text-slate-300">{label}</span>
                        </div>
                      ) : (
                        <div key={key} className="flex items-center gap-2.5 text-sm">
                          <span className="text-slate-700">✕</span>
                          <span className="text-slate-600">{label}</span>
                        </div>
                      )
                    ))}
                  </div>

                  <button
                    onClick={() => navigate("/portal/register")}
                    className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                      isPopular
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40"
                        : "bg-slate-800 hover:bg-slate-700 text-white"
                    }`}
                  >
                    {price === "0" ? "Start Free" : "Get Started"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {["Starter", "Business", "Enterprise"].map((name, i) => (
              <div key={name} className={`rounded-2xl border p-7 animate-pulse ${i === 1 ? "border-emerald-500/30" : "border-slate-800"} bg-slate-900/40`}>
                <div className="h-5 w-24 bg-slate-800 rounded mb-4" />
                <div className="h-10 w-32 bg-slate-800 rounded mb-6" />
                {[1,2,3,4].map(j => <div key={j} className="h-3 w-full bg-slate-800 rounded mb-2.5" />)}
                <div className="h-10 w-full bg-slate-800 rounded mt-6" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="px-6 py-20">
        <div className="max-w-3xl mx-auto bg-gradient-to-br from-emerald-900/40 to-slate-900 border border-emerald-500/30 rounded-3xl p-12 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to launch your store?</h2>
          <p className="text-slate-400 mb-8">Join businesses already selling smarter with AI-powered e-commerce.</p>
          <button
            onClick={() => navigate("/portal/register")}
            className="px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all text-sm shadow-xl shadow-emerald-900/50"
          >
            🚀 Create Your Store — Free for 14 Days
          </button>
          <p className="text-xs text-slate-500 mt-4">No credit card required · Cancel anytime · Setup in minutes</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-8 text-center text-xs text-slate-600">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-6 h-6 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xs">⚡</div>
          <span className="text-slate-400 font-medium">SaaS Platform</span>
        </div>
        <p>© {new Date().getFullYear()} SaaS Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}
