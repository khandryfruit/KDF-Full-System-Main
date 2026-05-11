import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLocation } from "wouter";
import { ArrowLeft, Save, Loader2, Eye, Palette, Layout, Type, ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TEMPLATES = [
  { id: "grocery",     label: "Grocery",     icon: "🛒", desc: "Fast shopping, category sliders, flash sales",      preview: "bg-green-500" },
  { id: "fashion",     label: "Fashion",     icon: "👗", desc: "Luxury UI, lookbook, Instagram-style layouts",      preview: "bg-pink-500" },
  { id: "electronics", label: "Electronics", icon: "💻", desc: "Premium modern, product comparison, specs",          preview: "bg-blue-500" },
  { id: "pharmacy",    label: "Pharmacy",    icon: "💊", desc: "Clean professional, medicine categories, fast checkout", preview: "bg-emerald-500" },
  { id: "default",     label: "Default",     icon: "🏪", desc: "Versatile all-purpose storefront",                  preview: "bg-gray-500" },
];

const FONT_OPTIONS = ["Inter", "Roboto", "Poppins", "Playfair Display", "Lato", "Montserrat", "Nunito"];
const RADIUS_OPTIONS = [{ id: "none", label: "None" }, { id: "sm", label: "Small" }, { id: "md", label: "Medium" }, { id: "lg", label: "Large" }, { id: "full", label: "Pill" }];
const HERO_STYLES = ["banner", "carousel", "video", "split", "minimal"];
const HEADER_STYLES = ["default", "sticky", "transparent", "centered", "minimal"];

export default function StorefrontBuilderPage({ tenantId }: { tenantId: number }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"template" | "colors" | "typography" | "layout">("template");

  const { data: tenant } = useQuery({ queryKey: ["saas-tenant", tenantId], queryFn: () => apiFetch(`/saas/admin/tenants/${tenantId}`) });

  const [theme, setTheme] = useState<Record<string, any>>({
    templateId: "default", primaryColor: "#16a34a", accentColor: "#15803d",
    bgColor: "#ffffff", textColor: "#111827", fontFamily: "Inter",
    borderRadius: "md", headerStyle: "default", heroStyle: "banner",
    productCardStyle: "default", showReviews: true, showWishlist: true,
    showChat: true, showBanner: true,
  });

  const { isLoading } = useQuery({
    queryKey: ["saas-theme", tenantId],
    queryFn: () => apiFetch(`/saas/admin/tenants/${tenantId}/theme`),
    onSuccess: (d: any) => d && setTheme({ ...theme, ...d }),
  });

  const save = useMutation({
    mutationFn: () => apiFetch(`/saas/admin/tenants/${tenantId}/theme`, { method: "PUT", body: JSON.stringify(theme) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saas-theme", tenantId] }); toast({ title: "Theme saved!" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const TABS = [
    { id: "template", label: "Template", icon: Layout },
    { id: "colors", label: "Colors", icon: Palette },
    { id: "typography", label: "Typography", icon: Type },
    { id: "layout", label: "Layout", icon: ShoppingBag },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={() => setLocation(`/tenants/${tenantId}`)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Storefront Builder</h1>
          <p className="text-muted-foreground text-sm">{tenant?.storeName ?? "..."}</p>
        </div>
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Theme
        </button>
      </div>

      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${tab === id ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Template Selection */}
      {tab === "template" && (
        <div className="space-y-4">
          <h3 className="font-semibold">Choose Industry Template</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEMPLATES.map(({ id, label, icon, desc, preview }) => (
              <div key={id} onClick={() => setTheme({ ...theme, templateId: id })}
                className={`border-2 rounded-2xl overflow-hidden cursor-pointer transition-all ${theme.templateId === id ? "border-primary shadow-lg shadow-primary/20" : "border-border hover:border-primary/50"}`}>
                <div className={`h-24 ${preview} flex items-center justify-center`}>
                  <span className="text-5xl">{icon}</span>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm text-foreground">{label}</span>
                    {theme.templateId === id && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">Active</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Template features preview */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h4 className="font-semibold text-sm mb-3">Template Features: {TEMPLATES.find(t => t.id === theme.templateId)?.label}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Mobile First", ok: true },
                { label: "SEO Optimized", ok: true },
                { label: "Fast Loading", ok: true },
                { label: "AI Chatbot", ok: true },
                { label: "WhatsApp Button", ok: true },
                { label: "Cart & Checkout", ok: true },
                { label: "Product Search", ok: true },
                { label: "Reviews", ok: true },
              ].map(({ label, ok }) => (
                <div key={label} className={`flex items-center gap-2 p-2.5 rounded-lg border ${ok ? "border-green-500/30 bg-green-500/10" : "border-border bg-muted/30"}`}>
                  <span className={`text-xs font-medium ${ok ? "text-green-400" : "text-muted-foreground"}`}>{ok ? "✓" : "—"} {label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Colors */}
      {tab === "colors" && (
        <div className="space-y-6">
          <h3 className="font-semibold">Brand Colors</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { key: "primaryColor", label: "Primary Color", hint: "Main brand color" },
              { key: "accentColor", label: "Accent Color", hint: "Secondary / hover color" },
              { key: "bgColor", label: "Background", hint: "Page background" },
              { key: "textColor", label: "Text Color", hint: "Body text" },
            ].map(({ key, label, hint }) => (
              <div key={key} className="space-y-2">
                <div>
                  <label className="text-sm font-medium text-foreground">{label}</label>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
                <div className="flex items-center gap-3">
                  <input type="color" value={theme[key]} onChange={e => setTheme({ ...theme, [key]: e.target.value })}
                    className="w-12 h-12 rounded-xl border border-border cursor-pointer bg-transparent" />
                  <input type="text" value={theme[key]} onChange={e => setTheme({ ...theme, [key]: e.target.value })}
                    className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
            ))}
          </div>

          {/* Live preview */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h4 className="font-semibold text-sm mb-4">Color Preview</h4>
            <div className="rounded-xl overflow-hidden border border-border" style={{ background: theme.bgColor }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ background: theme.primaryColor }}>
                <span className="text-white font-bold text-sm">{tenant?.storeName ?? "Store Name"}</span>
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-white/20" />
                  <div className="w-6 h-6 rounded-full bg-white/20" />
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="rounded-xl overflow-hidden shadow-sm border border-gray-200/50">
                      <div className="h-16" style={{ background: `${theme.primaryColor}22` }} />
                      <div className="p-2">
                        <div className="h-2 rounded" style={{ background: theme.textColor, opacity: 0.7 }} />
                        <div className="h-2 rounded mt-1 w-2/3" style={{ background: theme.textColor, opacity: 0.4 }} />
                        <div className="mt-2 rounded-lg py-1 text-center text-[10px] text-white font-medium" style={{ background: theme.primaryColor }}>Add to Cart</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Typography */}
      {tab === "typography" && (
        <div className="space-y-4">
          <h3 className="font-semibold">Typography & Style</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Font Family</label>
              <div className="space-y-2">
                {FONT_OPTIONS.map(font => (
                  <label key={font} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${theme.fontFamily === font ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                    <input type="radio" checked={theme.fontFamily === font} onChange={() => setTheme({ ...theme, fontFamily: font })} className="accent-green-500" />
                    <span style={{ fontFamily: font }} className="text-sm">{font} — The quick brown fox</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Border Radius</label>
              <div className="space-y-2">
                {RADIUS_OPTIONS.map(({ id, label }) => (
                  <label key={id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${theme.borderRadius === id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                    <input type="radio" checked={theme.borderRadius === id} onChange={() => setTheme({ ...theme, borderRadius: id })} className="accent-green-500" />
                    <div className={`w-12 h-8 border-2 border-foreground/30 flex-shrink-0 ${id === "none" ? "rounded-none" : id === "sm" ? "rounded" : id === "md" ? "rounded-lg" : id === "lg" ? "rounded-2xl" : "rounded-full"}`} />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Layout */}
      {tab === "layout" && (
        <div className="space-y-6">
          <h3 className="font-semibold">Layout & Sections</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium mb-2 block">Header Style</label>
              <div className="space-y-2">
                {HEADER_STYLES.map(s => (
                  <label key={s} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${theme.headerStyle === s ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                    <input type="radio" checked={theme.headerStyle === s} onChange={() => setTheme({ ...theme, headerStyle: s })} className="accent-green-500" />
                    <span className="text-sm capitalize">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Hero Section Style</label>
              <div className="space-y-2">
                {HERO_STYLES.map(s => (
                  <label key={s} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${theme.heroStyle === s ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                    <input type="radio" checked={theme.heroStyle === s} onChange={() => setTheme({ ...theme, heroStyle: s })} className="accent-green-500" />
                    <span className="text-sm capitalize">{s}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-3 block">Section Visibility</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "showReviews", label: "Product Reviews" },
                { key: "showWishlist", label: "Wishlist Feature" },
                { key: "showChat", label: "AI Chat Widget" },
                { key: "showBanner", label: "Announcement Banner" },
              ].map(({ key, label }) => (
                <label key={key} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${theme[key] ? "border-green-500/50 bg-green-500/10" : "border-border hover:bg-accent"}`}>
                  <input type="checkbox" checked={!!theme[key]} onChange={e => setTheme({ ...theme, [key]: e.target.checked })} className="accent-green-500 w-4 h-4" />
                  <span className="text-sm text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Custom CSS</label>
            <textarea value={theme.customCss ?? ""} onChange={e => setTheme({ ...theme, customCss: e.target.value })} rows={5}
              placeholder="/* Add custom CSS for this tenant's storefront */"
              className="w-full bg-input border border-border rounded-xl px-4 py-3 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none placeholder:text-muted-foreground" />
          </div>
        </div>
      )}
    </div>
  );
}
