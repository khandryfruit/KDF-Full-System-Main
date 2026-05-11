import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useState } from "react";
import {
  Plus, Edit3, Save, X, Loader2, CheckCircle2, Trash2,
  Zap, Star, Crown, Package,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TIER_ICONS: Record<string, React.ElementType> = { starter: Package, business: Zap, enterprise: Crown, custom: Star };
const TIER_COLORS: Record<string, string> = {
  starter: "text-blue-400 bg-blue-500/20",
  business: "text-purple-400 bg-purple-500/20",
  enterprise: "text-amber-400 bg-amber-500/20",
  custom: "text-green-400 bg-green-500/20",
};

const FEATURE_LABELS: Record<string, string> = {
  website: "Website", whatsappAutomation: "WhatsApp", aiTools: "AI Tools", aiChatbot: "AI Chatbot",
  seoTools: "SEO Tools", metaIntegration: "Meta/FB", courierIntegrations: "Couriers",
  analyticsAdvanced: "Advanced Analytics", marketingCampaigns: "Marketing", multiUser: "Multi-User",
  customDomain: "Custom Domain", mobileApp: "Mobile App", apiAccess: "API Access",
  realtimeAnalytics: "Real-time Analytics", blogModule: "Blog", loyaltyModule: "Loyalty",
  prioritySupport: "Priority Support",
};

const BLANK_PLAN = {
  name: "", tier: "starter", description: "", priceMonthly: 0, priceYearly: 0,
  trialDays: 14, badgeLabel: "", color: "#6366f1", displayOrder: 0,
  features: {} as Record<string, any>,
};

export default function PlansPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...BLANK_PLAN });

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["saas-plans-admin"],
    queryFn: () => apiFetch("/saas/admin/plans"),
  });

  const create = useMutation({
    mutationFn: () => apiFetch("/saas/admin/plans", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saas-plans-admin"] }); setShowForm(false); setForm({ ...BLANK_PLAN }); toast({ title: "Plan created!" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const update = useMutation({
    mutationFn: () => apiFetch(`/saas/admin/plans/${editId}`, { method: "PUT", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saas-plans-admin"] }); setEditId(null); toast({ title: "Plan updated!" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const archive = useMutation({
    mutationFn: (id: number) => apiFetch(`/saas/admin/plans/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saas-plans-admin"] }); toast({ title: "Plan archived" }); },
  });

  const openEdit = (p: any) => {
    setForm({ ...BLANK_PLAN, ...p, features: p.features ?? {} });
    setEditId(p.id);
    setShowForm(true);
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Subscription Plans</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage pricing tiers and feature sets</p>
        </div>
        <button onClick={() => { setForm({ ...BLANK_PLAN }); setEditId(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
          <Plus className="w-4 h-4" /> New Plan
        </button>
      </div>

      {/* Plan form */}
      {showForm && (
        <div className="bg-card border border-primary/30 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">{editId ? "Edit Plan" : "Create New Plan"}</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Plan Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Business Pro"
                className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tier</label>
              <select value={form.tier} onChange={e => setForm({ ...form, tier: e.target.value })}
                className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground">
                <option value="starter">Starter</option>
                <option value="business">Business</option>
                <option value="enterprise">Enterprise</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Badge Label</label>
              <input value={form.badgeLabel} onChange={e => setForm({ ...form, badgeLabel: e.target.value })} placeholder="Popular"
                className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Description</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Plan description..."
              className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Monthly Price (PKR)</label>
              <input type="number" value={form.priceMonthly} onChange={e => setForm({ ...form, priceMonthly: Number(e.target.value) })}
                className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Yearly Price (PKR)</label>
              <input type="number" value={form.priceYearly} onChange={e => setForm({ ...form, priceYearly: Number(e.target.value) })}
                className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Trial Days</label>
              <input type="number" value={form.trialDays} onChange={e => setForm({ ...form, trialDays: Number(e.target.value) })}
                className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-2">Features (check to enable)</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-accent border border-border/50">
                  <input type="checkbox" checked={!!form.features[key]} onChange={e => setForm({ ...form, features: { ...form.features, [key]: e.target.checked } })} className="accent-green-500 w-3.5 h-3.5" />
                  <span className="text-xs text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Max Products (-1 = unlimited)</label>
              <input type="number" value={form.features.products ?? 50} onChange={e => setForm({ ...form, features: { ...form.features, products: Number(e.target.value) } })}
                className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Max Orders/month (-1 = unlimited)</label>
              <input type="number" value={form.features.orders ?? 100} onChange={e => setForm({ ...form, features: { ...form.features, orders: Number(e.target.value) } })}
                className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Staff Accounts</label>
              <input type="number" value={form.features.staffAccounts ?? 1} onChange={e => setForm({ ...form, features: { ...form.features, staffAccounts: Number(e.target.value) } })}
                className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => editId ? update.mutate() : create.mutate()} disabled={create.isPending || update.isPending || !form.name}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {(create.isPending || update.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editId ? "Update Plan" : "Create Plan"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-border rounded-lg text-sm hover:bg-accent">Cancel</button>
          </div>
        </div>
      )}

      {/* Plans grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {(plans as any[]).map((p: any) => {
            const TierIcon = TIER_ICONS[p.tier] ?? Package;
            const tierColor = TIER_COLORS[p.tier] ?? TIER_COLORS.starter;
            return (
              <div key={p.id} className={`bg-card border rounded-2xl overflow-hidden ${p.isActive ? "border-border" : "border-border/30 opacity-60"}`}>
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tierColor}`}>
                      <TierIcon className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-1">
                      {p.badgeLabel && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">{p.badgeLabel}</span>}
                      {!p.isActive && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Archived</span>}
                    </div>
                  </div>
                  <h3 className="font-bold text-lg text-foreground">{p.name}</h3>
                  <p className="text-3xl font-bold text-foreground mt-1">Rs. {Number(p.priceMonthly).toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                  {p.priceYearly > 0 && <p className="text-xs text-muted-foreground">Rs. {Number(p.priceYearly).toLocaleString()}/year</p>}
                  <p className="text-xs text-muted-foreground mt-2">{p.description}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {Object.entries(FEATURE_LABELS).filter(([k]) => p.features?.[k]).slice(0, 6).map(([k, label]) => (
                      <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{label}</span>
                    ))}
                    {Object.entries(FEATURE_LABELS).filter(([k]) => p.features?.[k]).length > 6 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">+{Object.entries(FEATURE_LABELS).filter(([k]) => p.features?.[k]).length - 6} more</span>
                    )}
                  </div>
                </div>
                <div className="px-5 pb-4 flex gap-2">
                  <button onClick={() => openEdit(p)} className="flex-1 flex items-center justify-center gap-2 py-2 border border-border rounded-lg text-xs hover:bg-accent transition-colors">
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                  {p.isActive && (
                    <button onClick={() => archive.mutate(p.id)} className="py-2 px-3 border border-border rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
