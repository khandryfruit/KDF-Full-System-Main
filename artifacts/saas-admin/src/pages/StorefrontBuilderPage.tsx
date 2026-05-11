import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { industryIcon } from "@/lib/utils";

const TEMPLATES = [
  { id: "grocery", name: "Grocery", icon: "🛒", desc: "Fresh produce & daily essentials", primary: "#16a34a", accent: "#15803d" },
  { id: "fashion", name: "Fashion", icon: "👗", desc: "Apparel & accessories boutique", primary: "#9333ea", accent: "#7c3aed" },
  { id: "electronics", name: "Electronics", icon: "📱", desc: "Tech gadgets & devices", primary: "#2563eb", accent: "#1d4ed8" },
  { id: "pharmacy", name: "Pharmacy", icon: "💊", desc: "Health, medicine & wellness", primary: "#dc2626", accent: "#b91c1c" },
  { id: "default", name: "Default", icon: "🏪", desc: "Generic multi-purpose store", primary: "#6366f1", accent: "#4f46e5" },
];

const FONTS = ["Inter", "Poppins", "Roboto", "Open Sans", "Lato", "Montserrat", "Nunito", "Raleway"];
const RADII = [{ id: "none", label: "Sharp" }, { id: "sm", label: "Small" }, { id: "md", label: "Medium" }, { id: "lg", label: "Large" }, { id: "xl", label: "Extra Large" }];
const HEADER_STYLES = ["default", "transparent", "dark", "colored"];
const HERO_STYLES = ["banner", "video", "carousel", "minimal", "split"];
const PRODUCT_CARD_STYLES = ["default", "compact", "minimal", "elevated"];

interface Theme {
  templateId: string; primaryColor: string; accentColor: string; bgColor: string; textColor: string;
  fontFamily: string; borderRadius: string; headerStyle: string; heroStyle: string; productCardStyle: string;
  showReviews: boolean; showWishlist: boolean; showChat: boolean; showBanner: boolean;
  customCss: string;
}

const DEFAULT_THEME: Theme = {
  templateId: "default", primaryColor: "#16a34a", accentColor: "#15803d", bgColor: "#ffffff",
  textColor: "#111827", fontFamily: "Inter", borderRadius: "md", headerStyle: "default",
  heroStyle: "banner", productCardStyle: "default", showReviews: true, showWishlist: true,
  showChat: true, showBanner: true, customCss: "",
};

export default function StorefrontBuilderPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [theme, setTheme] = useState<Theme>({ ...DEFAULT_THEME });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.tenants.list().then(setTenants);
  }, []);

  async function selectTenant(t: any) {
    setSelectedTenant(t);
    setLoading(true);
    const data = await api.tenants.getTheme(t.id);
    if (data) {
      setTheme({ ...DEFAULT_THEME, ...data });
    } else {
      const tpl = TEMPLATES.find(tp => tp.id === t.industry) || TEMPLATES[4];
      setTheme({ ...DEFAULT_THEME, templateId: tpl.id, primaryColor: tpl.primary, accentColor: tpl.accent });
    }
    setLoading(false);
  }

  function applyTemplate(tpl: typeof TEMPLATES[0]) {
    setTheme(prev => ({
      ...prev, templateId: tpl.id, primaryColor: tpl.primary, accentColor: tpl.accent,
    }));
  }

  async function handleSave() {
    if (!selectedTenant) return;
    setSaving(true);
    await api.tenants.updateTheme(selectedTenant.id, theme);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Storefront Builder</h1>
        <p className="text-slate-400 text-sm mt-1">Customize the look & feel of each tenant's store</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Select Tenant</h2>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {tenants.map(t => (
              <button
                key={t.id}
                onClick={() => selectTenant(t)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2 ${selectedTenant?.id === t.id ? "bg-emerald-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
              >
                <span>{industryIcon(t.industry)}</span>
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.storeName}</div>
                  <div className={`text-xs truncate ${selectedTenant?.id === t.id ? "text-emerald-200" : "text-slate-500"}`}>{t.industry}</div>
                </div>
              </button>
            ))}
            {tenants.length === 0 && <p className="text-slate-500 text-xs px-2">No tenants yet</p>}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-5">
          {!selectedTenant ? (
            <div className="bg-slate-900 border border-slate-800 border-dashed rounded-xl p-16 text-center">
              <div className="text-4xl mb-3">🎨</div>
              <p className="text-slate-400">Select a tenant from the left to customize their storefront</p>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      {industryIcon(selectedTenant.industry)} {selectedTenant.storeName}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">Storefront theme settings</p>
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`text-sm font-medium px-4 py-2 rounded-lg transition-all ${saved ? "bg-emerald-500 text-white" : "bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"}`}
                  >
                    {saved ? "✓ Saved!" : saving ? "Saving..." : "Save Theme"}
                  </button>
                </div>

                <div className="mb-5">
                  <label className="text-xs text-slate-400 uppercase tracking-wider mb-3 block">Template</label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {TEMPLATES.map(tpl => (
                      <button
                        key={tpl.id}
                        onClick={() => applyTemplate(tpl)}
                        className={`p-3 rounded-xl border text-left transition-all ${theme.templateId === tpl.id ? "border-emerald-500 bg-emerald-500/10" : "border-slate-800 hover:border-slate-600 bg-slate-800/50"}`}
                      >
                        <div className="text-xl mb-1">{tpl.icon}</div>
                        <div className="text-xs font-medium text-white">{tpl.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5 leading-tight">{tpl.desc}</div>
                        <div className="flex gap-1 mt-2">
                          <div className="w-4 h-2 rounded-sm" style={{ backgroundColor: tpl.primary }} />
                          <div className="w-4 h-2 rounded-sm" style={{ backgroundColor: tpl.accent }} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Section title="Colors">
                    <ColorField label="Primary Color" value={theme.primaryColor} onChange={v => setTheme(t => ({ ...t, primaryColor: v }))} />
                    <ColorField label="Accent Color" value={theme.accentColor} onChange={v => setTheme(t => ({ ...t, accentColor: v }))} />
                    <ColorField label="Background" value={theme.bgColor} onChange={v => setTheme(t => ({ ...t, bgColor: v }))} />
                    <ColorField label="Text Color" value={theme.textColor} onChange={v => setTheme(t => ({ ...t, textColor: v }))} />
                  </Section>

                  <Section title="Typography & Shape">
                    <SelectField label="Font" value={theme.fontFamily} onChange={v => setTheme(t => ({ ...t, fontFamily: v }))} options={FONTS} />
                    <SelectField label="Border Radius" value={theme.borderRadius} onChange={v => setTheme(t => ({ ...t, borderRadius: v }))} options={RADII.map(r => r.id)} labels={RADII.map(r => r.label)} />
                  </Section>

                  <Section title="Layout Style">
                    <SelectField label="Header Style" value={theme.headerStyle} onChange={v => setTheme(t => ({ ...t, headerStyle: v }))} options={HEADER_STYLES} />
                    <SelectField label="Hero Style" value={theme.heroStyle} onChange={v => setTheme(t => ({ ...t, heroStyle: v }))} options={HERO_STYLES} />
                    <SelectField label="Product Card" value={theme.productCardStyle} onChange={v => setTheme(t => ({ ...t, productCardStyle: v }))} options={PRODUCT_CARD_STYLES} />
                  </Section>

                  <Section title="Sections">
                    {([
                      ["showReviews", "Show Reviews"],
                      ["showWishlist", "Show Wishlist"],
                      ["showChat", "Show Chat Widget"],
                      ["showBanner", "Show Banner"],
                    ] as [keyof Theme, string][]).map(([key, label]) => (
                      <label key={key} className="flex items-center justify-between cursor-pointer py-1">
                        <span className="text-sm text-slate-300">{label}</span>
                        <div
                          onClick={() => setTheme(prev => ({ ...prev, [key]: !prev[key] }))}
                          className={`w-10 h-5 rounded-full cursor-pointer transition-colors ${theme[key] ? "bg-emerald-600" : "bg-slate-700"}`}
                        >
                          <div className={`w-3.5 h-3.5 bg-white rounded-full mt-0.5 transition-transform ${theme[key] ? "translate-x-5" : "translate-x-0.5"}`} />
                        </div>
                      </label>
                    ))}
                  </Section>
                </div>

                <div className="mt-5">
                  <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Custom CSS</label>
                  <textarea
                    value={theme.customCss}
                    onChange={e => setTheme(t => ({ ...t, customCss: e.target.value }))}
                    rows={5}
                    placeholder=".hero { background: linear-gradient(...); }"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-emerald-500 resize-none"
                  />
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-3">Live Preview</h2>
                <div
                  className="rounded-xl overflow-hidden border border-slate-800"
                  style={{ fontFamily: theme.fontFamily }}
                >
                  <div
                    className="px-6 py-3 flex items-center justify-between"
                    style={{
                      backgroundColor: theme.headerStyle === "transparent" ? "transparent" :
                        theme.headerStyle === "dark" ? "#111" :
                          theme.headerStyle === "colored" ? theme.primaryColor : "#fff",
                      color: theme.headerStyle === "dark" || theme.headerStyle === "colored" ? "#fff" : theme.textColor,
                    }}
                  >
                    <div className="font-bold text-lg">{selectedTenant.storeName}</div>
                    <div className="flex gap-4 text-sm opacity-70">
                      <span>Home</span><span>Products</span><span>About</span>
                    </div>
                    <div
                      className="text-sm font-medium px-3 py-1 rounded-full text-white"
                      style={{ backgroundColor: theme.primaryColor }}
                    >
                      Cart (0)
                    </div>
                  </div>

                  <div
                    className="h-32 flex items-center justify-center"
                    style={{ backgroundColor: theme.primaryColor + "22" }}
                  >
                    <div className="text-center">
                      <div className="text-xl font-bold" style={{ color: theme.primaryColor }}>Welcome to {selectedTenant.storeName}</div>
                      <div className="text-sm opacity-60 mt-1" style={{ color: theme.textColor }}>Discover amazing products</div>
                    </div>
                  </div>

                  <div className="p-4 grid grid-cols-3 gap-3" style={{ backgroundColor: theme.bgColor }}>
                    {["Product A", "Product B", "Product C"].map((name, i) => (
                      <div
                        key={name}
                        className="overflow-hidden"
                        style={{
                          backgroundColor: "#f8f8f8",
                          borderRadius: theme.borderRadius === "none" ? "0" : theme.borderRadius === "sm" ? "4px" : theme.borderRadius === "md" ? "8px" : theme.borderRadius === "lg" ? "12px" : "16px",
                          boxShadow: theme.productCardStyle === "elevated" ? "0 4px 12px rgba(0,0,0,0.1)" : "none",
                        }}
                      >
                        <div className="h-16" style={{ backgroundColor: theme.primaryColor + "30" }} />
                        <div className="p-2">
                          <div className="text-xs font-medium" style={{ color: theme.textColor }}>{name}</div>
                          <div className="text-xs font-bold mt-0.5" style={{ color: theme.primaryColor }}>Rs. {(i + 1) * 999}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-slate-300">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
        <span className="text-xs text-slate-500 font-mono">{value}</span>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options, labels }: { label: string; value: string; onChange: (v: string) => void; options: string[]; labels?: string[] }) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 capitalize">
        {options.map((o, i) => <option key={o} value={o}>{labels ? labels[i] : o}</option>)}
      </select>
    </div>
  );
}
