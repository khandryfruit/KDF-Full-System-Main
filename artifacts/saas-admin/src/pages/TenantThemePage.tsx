import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";

const TEMPLATES = [
  { id: "grocery",     label: "Grocery",     icon: "🛒", desc: "Fresh & organic store", primary: "#16a34a", accent: "#15803d" },
  { id: "fashion",     label: "Fashion",     icon: "👗", desc: "Clothing & apparel",    primary: "#7c3aed", accent: "#6d28d9" },
  { id: "electronics", label: "Electronics", icon: "💻", desc: "Tech & gadgets",         primary: "#2563eb", accent: "#1d4ed8" },
  { id: "pharmacy",    label: "Pharmacy",    icon: "💊", desc: "Health & wellness",      primary: "#dc2626", accent: "#b91c1c" },
  { id: "default",     label: "Default",     icon: "✨", desc: "Clean & minimal",        primary: "#0ea5e9", accent: "#0284c7" },
];

const FONTS = ["Inter", "Poppins", "Nunito", "Raleway", "Roboto", "Montserrat", "Lato"];
const RADII = [
  { id: "none", label: "Sharp" },
  { id: "sm",   label: "Slight" },
  { id: "md",   label: "Rounded" },
  { id: "lg",   label: "Soft" },
  { id: "full", label: "Pill" },
];

interface Theme {
  templateId: string;
  primaryColor: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
  fontFamily: string;
  borderRadius: string;
  headerStyle: string;
  heroStyle: string;
  showReviews: boolean;
  showWishlist: boolean;
  showChat: boolean;
  showBanner: boolean;
  customCss: string;
}

const DEFAULTS: Theme = {
  templateId: "default",
  primaryColor: "#16a34a",
  accentColor: "#15803d",
  bgColor: "#ffffff",
  textColor: "#111827",
  fontFamily: "Inter",
  borderRadius: "md",
  headerStyle: "default",
  heroStyle: "banner",
  showReviews: true,
  showWishlist: true,
  showChat: true,
  showBanner: true,
  customCss: "",
};

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          className="w-10 h-9 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer p-1 flex-shrink-0" />
        <input value={value} onChange={e => onChange(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-emerald-500 transition-colors" />
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-800 last:border-0">
      <span className="text-sm text-slate-300">{label}</span>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-emerald-600" : "bg-slate-700"}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

export default function TenantThemePage() {
  const [, navigate] = useLocation();
  const [theme, setTheme] = useState<Theme>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"template" | "colors" | "typography" | "widgets" | "css">("template");

  useEffect(() => {
    api.tenant.getTheme()
      .then(d => { if (d) setTheme({ ...DEFAULTS, ...d }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof Theme>(k: K, v: Theme[K]) => setTheme(p => ({ ...p, [k]: v }));

  async function applyTemplate(tpl: typeof TEMPLATES[0]) {
    setTheme(p => ({ ...p, templateId: tpl.id, primaryColor: tpl.primary, accentColor: tpl.accent }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.tenant.updateTheme(theme);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      alert(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080d1a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const TABS = [
    { id: "template",   label: "Template",   icon: "🎨" },
    { id: "colors",     label: "Colors",     icon: "🌈" },
    { id: "typography", label: "Typography", icon: "Aa" },
    { id: "widgets",    label: "Widgets",    icon: "🧩" },
    { id: "css",        label: "Custom CSS", icon: "⚙️" },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Storefront Theme</h1>
          <p className="text-slate-400 text-sm mt-0.5">Customize how your store looks to customers</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/portal/dashboard")}
            className="text-sm px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
            ← Back
          </button>
          <button onClick={handleSave} disabled={saving}
            className={`text-sm font-medium px-5 py-2 rounded-lg transition-all ${saved ? "bg-emerald-500 text-white" : "bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"}`}>
            {saved ? "✓ Saved!" : saving ? "Saving…" : "Save Theme"}
          </button>
        </div>
      </div>

      {/* Live preview strip */}
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="bg-slate-900/50 px-4 py-2 flex items-center gap-2 border-b border-slate-800">
          <div className="w-3 h-3 rounded-full bg-red-500/60" />
          <div className="w-3 h-3 rounded-full bg-amber-500/60" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
          <span className="text-xs text-slate-500 ml-2">Theme Preview</span>
        </div>
        <div className="p-6" style={{ backgroundColor: theme.bgColor, fontFamily: theme.fontFamily }}>
          <div className="flex items-center justify-between mb-4"
            style={{ borderBottom: `2px solid ${theme.primaryColor}`, paddingBottom: "12px" }}>
            <span className="font-bold text-lg" style={{ color: theme.primaryColor }}>My Store</span>
            <div className="flex gap-2">
              {["Home", "Products", "About"].map(l => (
                <span key={l} className="text-xs px-3 py-1 cursor-pointer"
                  style={{ color: theme.textColor, opacity: 0.7 }}>{l}</span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {["Product A", "Product B", "Product C"].map(p => (
              <div key={p} className="border p-3" style={{
                borderColor: `${theme.primaryColor}30`,
                borderRadius: theme.borderRadius === "full" ? "999px" : theme.borderRadius === "lg" ? "16px" : theme.borderRadius === "md" ? "10px" : theme.borderRadius === "sm" ? "4px" : "0px",
              }}>
                <div className="w-full h-16 rounded mb-2 flex items-center justify-center text-2xl"
                  style={{ backgroundColor: `${theme.primaryColor}20` }}>🛒</div>
                <p className="text-xs font-medium" style={{ color: theme.textColor }}>{p}</p>
                <button className="mt-2 w-full text-xs py-1 font-medium text-white rounded"
                  style={{ backgroundColor: theme.primaryColor,
                    borderRadius: theme.borderRadius === "full" ? "999px" : theme.borderRadius === "lg" ? "12px" : "6px" }}>
                  Add to Cart
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800 w-fit overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${tab === t.id ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "template" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {TEMPLATES.map(tpl => (
            <button key={tpl.id} onClick={() => applyTemplate(tpl)}
              className={`p-4 rounded-xl border text-left transition-all ${theme.templateId === tpl.id
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-slate-700 bg-slate-900 hover:border-slate-600"}`}>
              <div className="text-2xl mb-2">{tpl.icon}</div>
              <p className="text-sm font-semibold text-white">{tpl.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{tpl.desc}</p>
              <div className="flex gap-1.5 mt-3">
                <div className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: tpl.primary }} />
                <div className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: tpl.accent }} />
              </div>
              {theme.templateId === tpl.id && (
                <span className="inline-block mt-2 text-xs text-emerald-400 font-medium">✓ Active</span>
              )}
            </button>
          ))}
        </div>
      )}

      {tab === "colors" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Brand Colors</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ColorInput label="Primary Color" value={theme.primaryColor} onChange={v => set("primaryColor", v)} />
            <ColorInput label="Accent Color" value={theme.accentColor} onChange={v => set("accentColor", v)} />
            <ColorInput label="Background Color" value={theme.bgColor} onChange={v => set("bgColor", v)} />
            <ColorInput label="Text Color" value={theme.textColor} onChange={v => set("textColor", v)} />
          </div>
        </div>
      )}

      {tab === "typography" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-white mb-3">Font Family</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {FONTS.map(f => (
                <button key={f} onClick={() => set("fontFamily", f)}
                  className={`py-3 px-3 rounded-lg border text-sm text-center transition-all ${theme.fontFamily === f
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : "border-slate-700 text-slate-300 hover:border-slate-600"}`}
                  style={{ fontFamily: f }}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white mb-3">Border Radius</h2>
            <div className="flex gap-2 flex-wrap">
              {RADII.map(r => (
                <button key={r.id} onClick={() => set("borderRadius", r.id)}
                  className={`px-4 py-2 border text-sm transition-all ${theme.borderRadius === r.id
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : "border-slate-700 text-slate-300 hover:border-slate-600"}`}
                  style={{ borderRadius: r.id === "full" ? "999px" : r.id === "lg" ? "12px" : r.id === "md" ? "8px" : r.id === "sm" ? "4px" : "0" }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "widgets" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Storefront Widgets</h2>
          <p className="text-xs text-slate-500 mb-4">Toggle which features appear on your storefront</p>
          <Toggle label="Customer Reviews" checked={theme.showReviews} onChange={v => set("showReviews", v)} />
          <Toggle label="Wishlist Button" checked={theme.showWishlist} onChange={v => set("showWishlist", v)} />
          <Toggle label="Live Chat Widget" checked={theme.showChat} onChange={v => set("showChat", v)} />
          <Toggle label="Announcement Banner" checked={theme.showBanner} onChange={v => set("showBanner", v)} />
        </div>
      )}

      {tab === "css" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Custom CSS</h2>
          <p className="text-xs text-slate-500 mb-3">Advanced: inject custom CSS into your storefront</p>
          <textarea
            value={theme.customCss}
            onChange={e => set("customCss", e.target.value)}
            rows={14}
            placeholder="/* Custom styles */&#10;.product-card { box-shadow: 0 4px 12px rgba(0,0,0,.1); }"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm text-emerald-300 font-mono outline-none focus:border-emerald-500 transition-colors resize-none"
          />
        </div>
      )}
    </div>
  );
}
