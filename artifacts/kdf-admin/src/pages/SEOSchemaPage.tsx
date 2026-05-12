import { useState, useEffect } from "react";
import { Database, Building2, MapPin, Phone, Mail, Globe, Image, Save, Eye, Copy, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const H = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { ...H(), ...(opts?.headers ?? {}) } });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${r.status}`); }
  return r.json();
}

interface OrgSettings {
  orgName: string;
  orgPhone: string;
  orgAddress: string;
  orgEmail: string;
  orgLogo: string;
  canonicalDomain: string;
  breadcrumbEnabled: boolean;
  faqSchemaEnabled: boolean;
  reviewSchemaEnabled: boolean;
  localBusiness: {
    type: string;
    latitude: string;
    longitude: string;
    openingHours: string;
    priceRange: string;
  };
}

const DEFAULTS: OrgSettings = {
  orgName: "KDF NUTS",
  orgPhone: "",
  orgAddress: "",
  orgEmail: "",
  orgLogo: "",
  canonicalDomain: "",
  breadcrumbEnabled: true,
  faqSchemaEnabled: true,
  reviewSchemaEnabled: true,
  localBusiness: {
    type: "LocalBusiness",
    latitude: "",
    longitude: "",
    openingHours: "Mo-Sa 09:00-18:00",
    priceRange: "$$",
  },
};

const BUSINESS_TYPES = [
  "LocalBusiness", "Store", "FoodEstablishment", "GroceryStore",
  "ShoppingCenter", "OnlineStore", "Organization",
];

const inp = "w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <button onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

export default function SEOSchemaPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<OrgSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"org" | "local" | "toggles" | "preview">("org");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch("/api/seo-settings")
      .then((d: any) => {
        setForm(prev => ({
          ...prev,
          orgName: d.org_name ?? d.orgName ?? prev.orgName,
          orgPhone: d.org_phone ?? d.orgPhone ?? "",
          orgAddress: d.org_address ?? d.orgAddress ?? "",
          orgEmail: d.org_email ?? d.orgEmail ?? "",
          orgLogo: d.org_logo ?? d.orgLogo ?? "",
          canonicalDomain: d.canonicalDomain ?? d.canonical_domain ?? "",
          breadcrumbEnabled: d.breadcrumb_enabled ?? d.breadcrumbEnabled ?? true,
          faqSchemaEnabled: d.faq_schema_enabled ?? d.faqSchemaEnabled ?? true,
          reviewSchemaEnabled: d.review_schema_enabled ?? d.reviewSchemaEnabled ?? true,
          localBusiness: {
            ...prev.localBusiness,
            ...(d.local_business_json ?? d.localBusinessJson ?? {}),
          },
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function setLb(key: keyof OrgSettings["localBusiness"], value: string) {
    setForm(f => ({ ...f, localBusiness: { ...f.localBusiness, [key]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/api/seo-settings", {
        method: "PUT",
        body: JSON.stringify({
          orgName: form.orgName,
          orgPhone: form.orgPhone,
          orgAddress: form.orgAddress,
          orgEmail: form.orgEmail,
          orgLogo: form.orgLogo,
          canonicalDomain: form.canonicalDomain,
          breadcrumbEnabled: form.breadcrumbEnabled,
          faqSchemaEnabled: form.faqSchemaEnabled,
          reviewSchemaEnabled: form.reviewSchemaEnabled,
          localBusinessJson: form.localBusiness,
        }),
      });
      toast({ title: "Schema settings saved successfully" });
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const orgSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": form.orgName || "KDF NUTS",
    "url": form.canonicalDomain || "https://khanbabadryfruits.com",
    "logo": form.orgLogo || `${form.canonicalDomain || "https://khanbabadryfruits.com"}/logo.png`,
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": form.orgPhone,
      "contactType": "customer service",
    },
    "sameAs": [
      "https://www.facebook.com/kdfnuts",
      "https://www.instagram.com/kdfnuts",
    ],
  }, null, 2);

  const localSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": form.localBusiness.type || "LocalBusiness",
    "name": form.orgName,
    "image": form.orgLogo,
    "telephone": form.orgPhone,
    "address": {
      "@type": "PostalAddress",
      "streetAddress": form.orgAddress,
      "addressCountry": "PK",
    },
    "geo": form.localBusiness.latitude ? {
      "@type": "GeoCoordinates",
      "latitude": form.localBusiness.latitude,
      "longitude": form.localBusiness.longitude,
    } : undefined,
    "openingHours": form.localBusiness.openingHours,
    "priceRange": form.localBusiness.priceRange,
    "url": form.canonicalDomain,
  }, null, 2);

  function copySchema(schema: string) {
    navigator.clipboard.writeText(`<script type="application/ld+json">\n${schema}\n</script>`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const TABS = [
    { id: "org" as const, label: "Organization", icon: Building2 },
    { id: "local" as const, label: "Local Business", icon: MapPin },
    { id: "toggles" as const, label: "Schema Toggles", icon: Database },
    { id: "preview" as const, label: "Preview JSON-LD", icon: Eye },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6 text-green-600" />
            Schema.org Settings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure structured data for rich snippets — stars, FAQ dropdowns, business info in Google
          </p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
        <strong>What this does:</strong> These settings inject structured data (JSON-LD) into your website so Google understands your business, shows star ratings, FAQ dropdowns, and enhanced business info in search results.
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md font-medium transition-colors whitespace-nowrap ${tab === t.id ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Organization Tab */}
      {tab === "org" && (
        <div className="bg-white border rounded-xl p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold mb-1">Organization Details</h2>
            <p className="text-xs text-muted-foreground">Used in Organization schema injected site-wide — helps Google understand your brand</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block">Organization Name *</label>
              <input className={inp} value={form.orgName} onChange={e => setForm(f => ({ ...f, orgName: e.target.value }))} placeholder="KDF NUTS" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Website URL</label>
              <input className={inp} value={form.canonicalDomain} onChange={e => setForm(f => ({ ...f, canonicalDomain: e.target.value }))} placeholder="https://khanbabadryfruits.com" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input className={inp + " pl-8"} value={form.orgPhone} onChange={e => setForm(f => ({ ...f, orgPhone: e.target.value }))} placeholder="+92 300 1234567" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input className={inp + " pl-8"} value={form.orgEmail} onChange={e => setForm(f => ({ ...f, orgEmail: e.target.value }))} placeholder="info@kdfnuts.com" />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium mb-1 block">Logo URL</label>
              <div className="relative">
                <Image className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input className={inp + " pl-8"} value={form.orgLogo} onChange={e => setForm(f => ({ ...f, orgLogo: e.target.value }))} placeholder="https://yourdomain.com/logo.png (min 112x112px)" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Google recommends at least 112×112px PNG/JPG logo</p>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium mb-1 block">Address</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground" />
                <input className={inp + " pl-8"} value={form.orgAddress} onChange={e => setForm(f => ({ ...f, orgAddress: e.target.value }))} placeholder="123 Main Street, Lahore, Pakistan" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Local Business Tab */}
      {tab === "local" && (
        <div className="bg-white border rounded-xl p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold mb-1">Local Business Schema</h2>
            <p className="text-xs text-muted-foreground">Helps appear in Google Maps, local search, and Knowledge Panel</p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block">Business Type</label>
              <select className={inp} value={form.localBusiness.type} onChange={e => setLb("type", e.target.value)}>
                {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Price Range</label>
              <select className={inp} value={form.localBusiness.priceRange} onChange={e => setLb("priceRange", e.target.value)}>
                <option value="$">$ (Budget)</option>
                <option value="$$">$$ (Moderate)</option>
                <option value="$$$">$$$ (Premium)</option>
                <option value="$$$$">$$$$ (Luxury)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Latitude</label>
              <input className={inp} value={form.localBusiness.latitude} onChange={e => setLb("latitude", e.target.value)} placeholder="31.5204" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Longitude</label>
              <input className={inp} value={form.localBusiness.longitude} onChange={e => setLb("longitude", e.target.value)} placeholder="74.3587" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium mb-1 block">Opening Hours</label>
              <input className={inp} value={form.localBusiness.openingHours} onChange={e => setLb("openingHours", e.target.value)} placeholder="Mo-Sa 09:00-18:00" />
              <p className="text-xs text-muted-foreground mt-1">Format: Mo-Sa 09:00-18:00 (ISO 8601)</p>
            </div>
          </div>
        </div>
      )}

      {/* Schema Toggles */}
      {tab === "toggles" && (
        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-1">Schema Type Toggles</h2>
          <p className="text-xs text-muted-foreground mb-4">Enable or disable specific schema types injected on your storefront</p>
          <Toggle
            label="Breadcrumb Schema"
            desc="Shows navigation path in Google search results (Home › Products › Product Name)"
            checked={form.breadcrumbEnabled}
            onChange={v => setForm(f => ({ ...f, breadcrumbEnabled: v }))}
          />
          <Toggle
            label="FAQ Schema"
            desc="Shows FAQ dropdowns in search results for products and blog posts with FAQ data"
            checked={form.faqSchemaEnabled}
            onChange={v => setForm(f => ({ ...f, faqSchemaEnabled: v }))}
          />
          <Toggle
            label="Review Schema"
            desc="Shows star ratings in search results using customer review data"
            checked={form.reviewSchemaEnabled}
            onChange={v => setForm(f => ({ ...f, reviewSchemaEnabled: v }))}
          />
          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
            <strong>Always active:</strong> Product schema (on product pages), Organization schema (site-wide), and Local Business schema (on homepage) are always injected.
          </div>
        </div>
      )}

      {/* Preview Tab */}
      {tab === "preview" && (
        <div className="space-y-4">
          <div className="bg-white border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Organization Schema JSON-LD</h3>
              <button onClick={() => copySchema(orgSchema)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted transition-colors">
                {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="text-xs bg-slate-950 text-green-300 p-4 rounded-lg overflow-x-auto font-mono leading-relaxed">
              {orgSchema}
            </pre>
          </div>
          <div className="bg-white border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Local Business Schema JSON-LD</h3>
              <button onClick={() => copySchema(localSchema)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted transition-colors">
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
            <pre className="text-xs bg-slate-950 text-green-300 p-4 rounded-lg overflow-x-auto font-mono leading-relaxed">
              {localSchema}
            </pre>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            These schemas are automatically injected into your storefront's <code>&lt;head&gt;</code>. No manual copy-paste needed — just save your settings above.
          </div>
        </div>
      )}
    </div>
  );
}
