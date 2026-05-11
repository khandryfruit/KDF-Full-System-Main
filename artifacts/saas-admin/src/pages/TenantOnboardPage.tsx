import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Building2, Loader2, CheckCircle2, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const INDUSTRIES = [
  { id: "grocery", label: "Grocery", icon: "🛒" },
  { id: "fashion", label: "Fashion", icon: "👗" },
  { id: "electronics", label: "Electronics", icon: "💻" },
  { id: "pharmacy", label: "Pharmacy", icon: "💊" },
  { id: "food", label: "Food & Restaurant", icon: "🍕" },
  { id: "beauty", label: "Beauty & Cosmetics", icon: "💄" },
  { id: "sports", label: "Sports", icon: "⚽" },
  { id: "furniture", label: "Furniture", icon: "🪑" },
  { id: "books", label: "Books & Stationery", icon: "📚" },
  { id: "other", label: "Other", icon: "🏪" },
];

const STEPS = ["Store Info", "Plan & Settings", "Confirm"];

export default function TenantOnboardPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    storeName: "", name: "", email: "", password: "", ownerPhone: "",
    industry: "other", planId: "", subdomain: "", notes: "",
  });

  const { data: plans = [] } = useQuery({ queryKey: ["saas-plans-admin"], queryFn: () => apiFetch("/saas/admin/plans") });

  const create = useMutation({
    mutationFn: () => apiFetch("/saas/admin/tenants", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        planId: form.planId ? Number(form.planId) : undefined,
      }),
    }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["saas-tenants"] });
      qc.invalidateQueries({ queryKey: ["saas-dashboard"] });
      toast({ title: `Tenant "${form.storeName}" created!` });
      setLocation(`/tenants/${data.id}`);
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const canNext0 = form.storeName && form.email && form.password && form.name;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => setLocation("/tenants")} className="p-2 rounded-lg hover:bg-accent text-muted-foreground">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Onboard New Tenant</h1>
          <p className="text-muted-foreground text-sm">Create a new tenant account on the platform</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background" : "bg-muted text-muted-foreground"
            }`}>
              {i < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-sm ${i === step ? "font-medium text-foreground" : "text-muted-foreground"}`}>{s}</span>
            {i < STEPS.length - 1 && <div className={`h-px flex-1 w-8 ${i < step ? "bg-primary" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      {/* Step 0 */}
      {step === 0 && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h3 className="font-bold">Store Information</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Store Name *</label>
              <input value={form.storeName} onChange={e => { setForm({ ...form, storeName: e.target.value, subdomain: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") }); }}
                placeholder="KDF NUTS, Fashion Hub, etc."
                className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Owner Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Muhammad Ahmed"
                  className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Phone</label>
                <input value={form.ownerPhone} onChange={e => setForm({ ...form, ownerPhone: e.target.value })} placeholder="03xx-xxxxxxx"
                  className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="owner@store.com"
                className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Password *</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="min 8 chars"
                className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Industry</label>
              <div className="grid grid-cols-5 gap-2">
                {INDUSTRIES.map(({ id, label, icon }) => (
                  <button key={id} type="button" onClick={() => setForm({ ...form, industry: id })}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all ${form.industry === id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-accent"}`}>
                    <span className="text-xl">{icon}</span>
                    <span className="text-[10px] text-center leading-tight text-muted-foreground">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={() => setStep(1)} disabled={!canNext0}
            className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-medium hover:opacity-90 disabled:opacity-50 transition-all">
            Next: Plan & Settings
          </button>
        </div>
      )}

      {/* Step 1 */}
      {step === 1 && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h3 className="font-bold">Plan & Settings</h3>
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Select Plan</label>
            <div className="space-y-2">
              {(plans as any[]).filter((p: any) => p.isActive).map((p: any) => (
                <label key={p.id} className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${Number(form.planId) === p.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                  <input type="radio" name="plan" value={p.id} checked={Number(form.planId) === p.id} onChange={() => setForm({ ...form, planId: String(p.id) })} className="accent-green-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{p.name}</span>
                      {p.badgeLabel && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary">{p.badgeLabel}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">Rs. {Number(p.priceMonthly).toLocaleString()}/mo</p>
                    <p className="text-[10px] text-muted-foreground">{p.trialDays} day trial</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Subdomain</label>
            <div className="flex items-center mt-1 bg-input border border-border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ring">
              <input value={form.subdomain} onChange={e => setForm({ ...form, subdomain: e.target.value })}
                className="flex-1 px-3 py-2.5 text-sm bg-transparent text-foreground focus:outline-none placeholder:text-muted-foreground" placeholder="store-name" />
              <span className="px-3 text-xs text-muted-foreground bg-muted/50 py-2.5 border-l border-border">.platform.com</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Internal Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
              className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none placeholder:text-muted-foreground" placeholder="Notes about this tenant..." />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(0)} className="flex-1 py-3 border border-border rounded-xl text-sm hover:bg-accent">Back</button>
            <button onClick={() => setStep(2)} className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-medium hover:opacity-90">Review & Create</button>
          </div>
        </div>
      )}

      {/* Step 2 - Confirm */}
      {step === 2 && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
          <h3 className="font-bold">Confirm & Create Tenant</h3>
          <div className="bg-muted/30 rounded-xl p-4 space-y-3">
            {[
              { label: "Store Name", value: form.storeName },
              { label: "Owner", value: `${form.name} (${form.email})` },
              { label: "Phone", value: form.ownerPhone || "—" },
              { label: "Industry", value: INDUSTRIES.find(i => i.id === form.industry)?.label ?? form.industry },
              { label: "Subdomain", value: `${form.subdomain}.platform.com` },
              { label: "Plan", value: (plans as any[]).find((p: any) => String(p.id) === form.planId)?.name ?? "No plan" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-foreground">{value}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 py-3 border border-border rounded-xl text-sm hover:bg-accent">Back</button>
            <button onClick={() => create.mutate()} disabled={create.isPending}
              className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-medium hover:opacity-90 flex items-center justify-center gap-2">
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Create Tenant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
