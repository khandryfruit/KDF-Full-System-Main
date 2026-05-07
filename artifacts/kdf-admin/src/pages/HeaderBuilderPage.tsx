import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LayoutDashboard,
  Palette,
  Megaphone,
  Navigation,
  MousePointerClick,
  Smartphone,
  Eye,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  GripVertical,
  Monitor,
  Tablet,
  CheckCircle,
  Loader2,
  ShoppingCart,
  User,
  MapPin,
  MessageCircle,
  Search,
  Package,
} from "lucide-react";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";

async function fetchHeaderSettings() {
  const res = await fetch("/api/admin/header-settings", {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN()}` },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function saveHeaderSettings(data: Record<string, any>) {
  const res = await fetch("/api/admin/header-settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_TOKEN()}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save");
  return res.json();
}

async function resetHeaderSettings() {
  const res = await fetch("/api/admin/header-settings/reset", {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN_TOKEN()}` },
  });
  if (!res.ok) throw new Error("Failed to reset");
  return res.json();
}

type NavItem = { id: string; label: string; href: string; badge: string | null; enabled: boolean };
type TrustItem = { id: string; icon: string; text: string };
type TopBarSlide = { id: string; text: string; link: string };

type HeaderForm = {
  logoPosition: string;
  showSearch: boolean;
  searchWidth: number;
  menuPosition: string;
  stickyHeader: boolean;
  headerHeight: number;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  navBgColor: string;
  navTextColor: string;
  showTopBar: boolean;
  topBarText: string;
  topBarBgColor: string;
  topBarTextColor: string;
  topBarAnimation: string;
  topBarSpeed: number;
  topBarSlides: TopBarSlide[];
  navItems: NavItem[];
  showCart: boolean;
  showAccount: boolean;
  showTrackOrder: boolean;
  showLocationSelector: boolean;
  showWhatsapp: boolean;
  whatsappNumber: string;
  showTrustStrip: boolean;
  trustStripItems: TrustItem[];
  showMobileSearch: boolean;
  showStickyBottomBar: boolean;
  mobileMenuType: string;
  showMobileCategories: boolean;
  borderRadius: number;
  showShadow: boolean;
  showBorder: boolean;
};

const DEFAULT_FORM: HeaderForm = {
  logoPosition: "left",
  showSearch: true,
  searchWidth: 50,
  menuPosition: "below",
  stickyHeader: true,
  headerHeight: 64,
  primaryColor: "#16a34a",
  backgroundColor: "#ffffff",
  textColor: "#111827",
  navBgColor: "#16a34a",
  navTextColor: "#ffffff",
  showTopBar: true,
  topBarText: "🚚 Free delivery on orders above Rs. 1,500 — Order now!",
  topBarBgColor: "#c53030",
  topBarTextColor: "#ffffff",
  topBarAnimation: "marquee",
  topBarSpeed: 30,
  topBarSlides: [
    { id: "1", text: "🚚 Free delivery on orders above Rs. 1,500 — Order now!", link: "" },
    { id: "2", text: "🌟 Fresh stock: Cashews, Pistachios & Almonds — Shop now!", link: "" },
  ],
  navItems: [
    { id: "1", label: "All Products", href: "/products", badge: null, enabled: true },
    { id: "2", label: "Dry Fruits", href: "/category/dry-fruits", badge: null, enabled: true },
    { id: "3", label: "Nuts", href: "/category/nuts", badge: null, enabled: true },
    { id: "4", label: "Seeds", href: "/category/seeds", badge: null, enabled: true },
    { id: "5", label: "Organic", href: "/category/organic", badge: null, enabled: true },
    { id: "6", label: "Deals 🔥", href: "/deals", badge: "hot", enabled: true },
    { id: "7", label: "New Arrivals ✨", href: "/new-arrivals", badge: "new", enabled: true },
    { id: "8", label: "Best Sellers ⭐", href: "/best-sellers", badge: "top", enabled: true },
    { id: "9", label: "Blog", href: "/blog", badge: null, enabled: true },
    { id: "10", label: "Track Order", href: "/track-order", badge: null, enabled: true },
  ],
  showCart: true,
  showAccount: true,
  showTrackOrder: true,
  showLocationSelector: true,
  showWhatsapp: false,
  whatsappNumber: "+92-300-0000000",
  showTrustStrip: true,
  trustStripItems: [
    { id: "1", icon: "🚚", text: "Free Delivery Rs.1500+" },
    { id: "2", icon: "✅", text: "100% Fresh" },
    { id: "3", icon: "🔁", text: "Easy Returns" },
    { id: "4", icon: "📞", text: "24/7 Support" },
  ],
  showMobileSearch: true,
  showStickyBottomBar: true,
  mobileMenuType: "slide",
  showMobileCategories: true,
  borderRadius: 6,
  showShadow: true,
  showBorder: false,
};

function parseJsonField<T>(val: any, fallback: T): T {
  if (Array.isArray(val)) return val as T;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

function serverToForm(s: any): HeaderForm {
  return {
    ...DEFAULT_FORM,
    ...s,
    navItems: parseJsonField(s.navItems, DEFAULT_FORM.navItems),
    trustStripItems: parseJsonField(s.trustStripItems, DEFAULT_FORM.trustStripItems),
    topBarSlides: parseJsonField(s.topBarSlides, DEFAULT_FORM.topBarSlides),
  };
}

function formToServer(f: HeaderForm): Record<string, any> {
  return {
    ...f,
    navItems: JSON.stringify(f.navItems),
    trustStripItems: JSON.stringify(f.trustStripItems),
    topBarSlides: JSON.stringify(f.topBarSlides),
  };
}

/* ─── Live Header Preview ──────────────────────────────────────────── */
function HeaderPreview({ form, device }: { form: HeaderForm; device: "desktop" | "tablet" | "mobile" }) {
  const badgeColor: Record<string, string> = {
    hot: "bg-orange-500 text-white",
    new: "bg-blue-500 text-white",
    top: "bg-purple-500 text-white",
  };

  const scale = device === "desktop" ? 1 : device === "tablet" ? 0.75 : 0.55;
  const previewWidth = device === "desktop" ? 900 : device === "tablet" ? 700 : 390;

  return (
    <div className="overflow-hidden rounded-lg border bg-gray-100">
      <div className="flex items-center justify-center p-3 bg-gray-200 text-xs text-gray-500 gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" />
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400" />
        <span className="ml-2">Header Preview — {device}</span>
      </div>
      <div className="overflow-x-auto">
        <div
          style={{
            width: previewWidth,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            height: `${(form.showTopBar ? 36 : 0) + form.headerHeight + (form.menuPosition === "below" ? 44 : 0) + (form.showTrustStrip ? 36 : 0)}px`,
            minWidth: previewWidth,
          }}
        >
          {/* Top bar */}
          {form.showTopBar && (
            <div
              className="flex items-center justify-center px-4 text-sm font-medium overflow-hidden"
              style={{
                background: form.topBarBgColor,
                color: form.topBarTextColor,
                height: 36,
              }}
            >
              <span className="whitespace-nowrap truncate">{form.topBarSlides[0]?.text || form.topBarText}</span>
            </div>
          )}

          {/* Main header */}
          <div
            className="flex items-center px-6 gap-4"
            style={{
              background: form.backgroundColor,
              height: form.headerHeight,
              boxShadow: form.showShadow ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
              borderBottom: form.showBorder ? "1px solid #e5e7eb" : "none",
            }}
          >
            {form.logoPosition === "center" && <div className="flex-1" />}
            <div
              className="font-bold text-lg whitespace-nowrap"
              style={{ color: form.primaryColor }}
            >
              KDF NUTS
            </div>
            {form.logoPosition === "center" && <div className="flex-1" />}

            {form.showSearch && form.menuPosition === "inline" && (
              <div
                className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm text-gray-400"
                style={{
                  flex: `0 0 ${form.searchWidth}%`,
                  maxWidth: `${form.searchWidth}%`,
                  borderRadius: form.borderRadius,
                }}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search...</span>
              </div>
            )}

            {form.menuPosition === "inline" && (
              <div className="flex items-center gap-4 flex-1">
                {form.navItems.filter(n => n.enabled).slice(0, 5).map(item => (
                  <span key={item.id} className="text-xs font-medium whitespace-nowrap" style={{ color: form.textColor }}>
                    {item.label}
                    {item.badge && (
                      <span className={`ml-1 text-[9px] px-1 rounded ${badgeColor[item.badge] ?? ""}`}>
                        {item.badge.toUpperCase()}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}

            <div className="flex-1" />

            {/* Action icons */}
            <div className="flex items-center gap-2">
              {form.showLocationSelector && device !== "mobile" && (
                <div className="flex items-center gap-1 text-xs" style={{ color: form.textColor }}>
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Karachi</span>
                </div>
              )}
              {form.showCart && <ShoppingCart className="w-4 h-4" style={{ color: form.textColor }} />}
              {form.showAccount && <User className="w-4 h-4" style={{ color: form.textColor }} />}
              {form.showWhatsapp && (
                <div
                  className="text-xs px-2 py-1 rounded-full text-white font-medium"
                  style={{ background: "#25D366", borderRadius: form.borderRadius }}
                >
                  WhatsApp
                </div>
              )}
            </div>
          </div>

          {/* Search bar (below layout) */}
          {form.showSearch && form.menuPosition === "below" && (
            <div className="px-6 py-2" style={{ background: form.backgroundColor }}>
              <div
                className="flex items-center gap-2 border px-3 py-1.5 text-sm text-gray-400"
                style={{
                  width: `${form.searchWidth}%`,
                  borderRadius: form.borderRadius,
                }}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search... try: badam, kaju, almonds</span>
              </div>
            </div>
          )}

          {/* Nav bar */}
          {form.menuPosition === "below" && (
            <div
              className="flex items-center px-6 gap-5"
              style={{
                background: form.navBgColor,
                color: form.navTextColor,
                height: 44,
              }}
            >
              {form.navItems.filter(n => n.enabled).slice(0, 8).map(item => (
                <span key={item.id} className="text-xs font-medium whitespace-nowrap flex items-center gap-1">
                  {item.label}
                  {item.badge && (
                    <span className={`text-[9px] px-1 rounded ${badgeColor[item.badge] ?? ""}`}>
                      {item.badge.toUpperCase()}
                    </span>
                  )}
                </span>
              ))}
              {/* Trust strip items on right */}
              {form.showTrustStrip && (
                <div className="ml-auto flex items-center gap-3">
                  {form.trustStripItems.slice(0, 3).map(t => (
                    <span key={t.id} className="text-[10px] flex items-center gap-1 opacity-90">
                      {t.icon} {t.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Trust strip (standalone below nav) */}
          {form.showTrustStrip && form.menuPosition === "inline" && (
            <div
              className="flex items-center gap-5 px-6 text-xs"
              style={{
                background: form.navBgColor,
                color: form.navTextColor,
                height: 36,
              }}
            >
              {form.trustStripItems.map(t => (
                <span key={t.id} className="flex items-center gap-1">
                  {t.icon} {t.text}
                </span>
              ))}
            </div>
          )}

          {/* Mobile sticky bottom bar */}
          {device === "mobile" && form.showStickyBottomBar && (
            <div className="mt-4 flex items-center justify-around py-2 border-t bg-white">
              {["Home", "Categories", "Cart", "Account"].map(label => (
                <div key={label} className="flex flex-col items-center text-xs text-gray-500 gap-0.5">
                  <div className="w-5 h-5 rounded bg-gray-200" />
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div
        className="text-center text-xs text-gray-400 py-1"
        style={{ height: `${previewWidth * scale}px`, display: "none" }}
      />
    </div>
  );
}

/* ─── Section wrapper ────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <Label className="text-sm font-medium">{label}</Label>
        {help && <p className="text-xs text-muted-foreground mt-0.5">{help}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* ─── Nav Item Editor ─────────────────────────────────────────────── */
function NavItemEditor({ items, onChange }: { items: NavItem[]; onChange: (items: NavItem[]) => void }) {
  function update(id: string, key: keyof NavItem, val: any) {
    onChange(items.map(item => item.id === id ? { ...item, [key]: val } : item));
  }
  function remove(id: string) { onChange(items.filter(i => i.id !== id)); }
  function add() {
    onChange([...items, { id: Date.now().toString(), label: "New Item", href: "/", badge: null, enabled: true }]);
  }
  function move(idx: number, dir: -1 | 1) {
    const arr = [...items];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target]!, arr[idx]!];
    onChange(arr);
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-2 p-2 border rounded-lg bg-card hover:bg-muted/30 transition-colors">
          <div className="flex flex-col gap-0.5">
            <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs">▲</button>
            <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs">▼</button>
          </div>
          <Switch
            checked={item.enabled}
            onCheckedChange={v => update(item.id, "enabled", v)}
            className="shrink-0"
          />
          <Input
            value={item.label}
            onChange={e => update(item.id, "label", e.target.value)}
            className="flex-1 h-8 text-sm"
            placeholder="Label"
          />
          <Input
            value={item.href}
            onChange={e => update(item.id, "href", e.target.value)}
            className="flex-1 h-8 text-sm"
            placeholder="/url"
          />
          <Select
            value={item.badge ?? "none"}
            onValueChange={v => update(item.id, "badge", v === "none" ? null : v)}
          >
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No badge</SelectItem>
              <SelectItem value="hot">🔥 Hot</SelectItem>
              <SelectItem value="new">✨ New</SelectItem>
              <SelectItem value="top">⭐ Top</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
            onClick={() => remove(item.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-full gap-2 mt-1" onClick={add}>
        <Plus className="h-3.5 w-3.5" />
        Add Menu Item
      </Button>
    </div>
  );
}

/* ─── Trust Strip Editor ─────────────────────────────────────────── */
function TrustStripEditor({ items, onChange }: { items: TrustItem[]; onChange: (items: TrustItem[]) => void }) {
  function update(id: string, key: keyof TrustItem, val: string) {
    onChange(items.map(item => item.id === id ? { ...item, [key]: val } : item));
  }
  function remove(id: string) { onChange(items.filter(i => i.id !== id)); }
  function add() {
    onChange([...items, { id: Date.now().toString(), icon: "⭐", text: "New Feature" }]);
  }

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-2 p-2 border rounded-lg bg-card">
          <Input
            value={item.icon}
            onChange={e => update(item.id, "icon", e.target.value)}
            className="w-16 h-8 text-center text-lg"
            placeholder="🚚"
          />
          <Input
            value={item.text}
            onChange={e => update(item.id, "text", e.target.value)}
            className="flex-1 h-8 text-sm"
            placeholder="Feature text"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
            onClick={() => remove(item.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-full gap-2 mt-1" onClick={add}>
        <Plus className="h-3.5 w-3.5" />
        Add Trust Item
      </Button>
    </div>
  );
}

/* ─── Top Bar Slides Editor ──────────────────────────────────────── */
function TopBarSlidesEditor({ slides, onChange }: { slides: TopBarSlide[]; onChange: (s: TopBarSlide[]) => void }) {
  function update(id: string, key: keyof TopBarSlide, val: string) {
    onChange(slides.map(s => s.id === id ? { ...s, [key]: val } : s));
  }
  function remove(id: string) { onChange(slides.filter(s => s.id !== id)); }
  function add() {
    onChange([...slides, { id: Date.now().toString(), text: "New announcement", link: "" }]);
  }

  return (
    <div className="space-y-2">
      {slides.map(slide => (
        <div key={slide.id} className="flex items-center gap-2 p-2 border rounded-lg bg-card">
          <Input
            value={slide.text}
            onChange={e => update(slide.id, "text", e.target.value)}
            className="flex-1 h-8 text-sm"
            placeholder="Announcement text"
          />
          <Input
            value={slide.link}
            onChange={e => update(slide.id, "link", e.target.value)}
            className="w-36 h-8 text-sm"
            placeholder="/link (optional)"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
            onClick={() => remove(slide.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-full gap-2 mt-1" onClick={add}>
        <Plus className="h-3.5 w-3.5" />
        Add Slide
      </Button>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────── */
export default function HeaderBuilderPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<HeaderForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [activeTab, setActiveTab] = useState("layout");

  useEffect(() => {
    fetchHeaderSettings()
      .then(d => setForm(serverToForm(d)))
      .catch(() => toast({ title: "Could not load header settings", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof HeaderForm>(key: K, val: HeaderForm[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveHeaderSettings(formToServer(form));
      setSaved(true);
      toast({ title: "Header settings saved successfully" });
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("Reset all header settings to defaults?")) return;
    setSaving(true);
    try {
      const d = await resetHeaderSettings();
      setForm(serverToForm(d));
      toast({ title: "Settings reset to defaults" });
    } catch {
      toast({ title: "Failed to reset", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Header Builder</h1>
          <p className="text-muted-foreground mt-1">
            Customize the website header — layout, colors, navigation, and more. Changes apply to both desktop and mobile stores.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleReset} disabled={saving}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          <Button size="sm" className="gap-2 min-w-[100px]" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Recommended sizes helper */}
      <div className="flex items-center gap-4 p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Recommended sizes:</span>
        <span>Logo: 200×60px</span>
        <span>Icons: 24×24px</span>
        <span>Top Banner: 1200×80px</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-6">
        {/* Settings Panel */}
        <div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-6">
              <TabsTrigger value="layout" className="gap-1.5 text-xs">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Layout
              </TabsTrigger>
              <TabsTrigger value="colors" className="gap-1.5 text-xs">
                <Palette className="h-3.5 w-3.5" />
                Colors
              </TabsTrigger>
              <TabsTrigger value="topbar" className="gap-1.5 text-xs">
                <Megaphone className="h-3.5 w-3.5" />
                Top Bar
              </TabsTrigger>
              <TabsTrigger value="navigation" className="gap-1.5 text-xs">
                <Navigation className="h-3.5 w-3.5" />
                Navigation
              </TabsTrigger>
              <TabsTrigger value="icons" className="gap-1.5 text-xs">
                <MousePointerClick className="h-3.5 w-3.5" />
                Icons
              </TabsTrigger>
              <TabsTrigger value="mobile" className="gap-1.5 text-xs">
                <Smartphone className="h-3.5 w-3.5" />
                Mobile
              </TabsTrigger>
            </TabsList>

            {/* ── Layout ── */}
            <TabsContent value="layout" className="space-y-6 mt-5">
              <Section title="Header Structure">
                <Row label="Logo Position" help="Where the logo appears in the header">
                  <Select value={form.logoPosition} onValueChange={v => set("logoPosition", v)}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                    </SelectContent>
                  </Select>
                </Row>
                <Row label="Menu Position" help="Navigation below header or inline with logo">
                  <Select value={form.menuPosition} onValueChange={v => set("menuPosition", v)}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="below">Below header</SelectItem>
                      <SelectItem value="inline">Inline (same row)</SelectItem>
                    </SelectContent>
                  </Select>
                </Row>
                <Row label="Sticky Header" help="Header stays at top while scrolling">
                  <Switch checked={form.stickyHeader} onCheckedChange={v => set("stickyHeader", v)} />
                </Row>
              </Section>

              <Section title="Search Bar">
                <Row label="Show Search Bar">
                  <Switch checked={form.showSearch} onCheckedChange={v => set("showSearch", v)} />
                </Row>
                {form.showSearch && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Search Width — {form.searchWidth}%</Label>
                    <Slider
                      value={[form.searchWidth]}
                      min={30}
                      max={80}
                      step={5}
                      onValueChange={([v]) => set("searchWidth", v!)}
                      className="w-full"
                    />
                  </div>
                )}
              </Section>

              <Section title="Dimensions">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Header Height — {form.headerHeight}px</Label>
                  <Slider
                    value={[form.headerHeight]}
                    min={48}
                    max={96}
                    step={4}
                    onValueChange={([v]) => set("headerHeight", v!)}
                    className="w-full"
                  />
                </div>
              </Section>
            </TabsContent>

            {/* ── Colors & Style ── */}
            <TabsContent value="colors" className="space-y-6 mt-5">
              <Section title="Brand Colors">
                <Row label="Primary Color" help="Brand color for logo and accents">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.primaryColor}
                      onChange={e => set("primaryColor", e.target.value)}
                      className="w-10 h-8 rounded cursor-pointer border"
                    />
                    <Input
                      value={form.primaryColor}
                      onChange={e => set("primaryColor", e.target.value)}
                      className="w-28 h-8 text-sm font-mono"
                    />
                  </div>
                </Row>
                <Row label="Background Color" help="Header background">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.backgroundColor}
                      onChange={e => set("backgroundColor", e.target.value)}
                      className="w-10 h-8 rounded cursor-pointer border"
                    />
                    <Input
                      value={form.backgroundColor}
                      onChange={e => set("backgroundColor", e.target.value)}
                      className="w-28 h-8 text-sm font-mono"
                    />
                  </div>
                </Row>
                <Row label="Text Color" help="Main header text and icons">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.textColor}
                      onChange={e => set("textColor", e.target.value)}
                      className="w-10 h-8 rounded cursor-pointer border"
                    />
                    <Input
                      value={form.textColor}
                      onChange={e => set("textColor", e.target.value)}
                      className="w-28 h-8 text-sm font-mono"
                    />
                  </div>
                </Row>
              </Section>

              <Section title="Navigation Bar Colors">
                <Row label="Nav Background">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.navBgColor}
                      onChange={e => set("navBgColor", e.target.value)}
                      className="w-10 h-8 rounded cursor-pointer border"
                    />
                    <Input
                      value={form.navBgColor}
                      onChange={e => set("navBgColor", e.target.value)}
                      className="w-28 h-8 text-sm font-mono"
                    />
                  </div>
                </Row>
                <Row label="Nav Text Color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.navTextColor}
                      onChange={e => set("navTextColor", e.target.value)}
                      className="w-10 h-8 rounded cursor-pointer border"
                    />
                    <Input
                      value={form.navTextColor}
                      onChange={e => set("navTextColor", e.target.value)}
                      className="w-28 h-8 text-sm font-mono"
                    />
                  </div>
                </Row>
              </Section>

              <Section title="Style">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Border Radius — {form.borderRadius}px</Label>
                  <Slider
                    value={[form.borderRadius]}
                    min={0}
                    max={24}
                    step={2}
                    onValueChange={([v]) => set("borderRadius", v!)}
                    className="w-full"
                  />
                </div>
                <Row label="Drop Shadow" help="Subtle shadow under the header">
                  <Switch checked={form.showShadow} onCheckedChange={v => set("showShadow", v)} />
                </Row>
                <Row label="Bottom Border">
                  <Switch checked={form.showBorder} onCheckedChange={v => set("showBorder", v)} />
                </Row>
              </Section>
            </TabsContent>

            {/* ── Top Bar ── */}
            <TabsContent value="topbar" className="space-y-6 mt-5">
              <Section title="Announcement Bar">
                <Row label="Enable Top Bar" help="Full-width announcement bar at the very top">
                  <Switch checked={form.showTopBar} onCheckedChange={v => set("showTopBar", v)} />
                </Row>
              </Section>

              {form.showTopBar && (
                <>
                  <Section title="Animation">
                    <Row label="Animation Style">
                      <Select value={form.topBarAnimation} onValueChange={v => set("topBarAnimation", v)}>
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="marquee">Marquee (scroll)</SelectItem>
                          <SelectItem value="slide">Slide</SelectItem>
                          <SelectItem value="fade">Fade</SelectItem>
                          <SelectItem value="static">Static</SelectItem>
                        </SelectContent>
                      </Select>
                    </Row>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Speed — {form.topBarSpeed}px/s</Label>
                      <Slider
                        value={[form.topBarSpeed]}
                        min={10}
                        max={80}
                        step={5}
                        onValueChange={([v]) => set("topBarSpeed", v!)}
                        className="w-full"
                      />
                    </div>
                  </Section>

                  <Section title="Colors">
                    <Row label="Background Color">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.topBarBgColor}
                          onChange={e => set("topBarBgColor", e.target.value)}
                          className="w-10 h-8 rounded cursor-pointer border"
                        />
                        <Input
                          value={form.topBarBgColor}
                          onChange={e => set("topBarBgColor", e.target.value)}
                          className="w-28 h-8 text-sm font-mono"
                        />
                      </div>
                    </Row>
                    <Row label="Text Color">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.topBarTextColor}
                          onChange={e => set("topBarTextColor", e.target.value)}
                          className="w-10 h-8 rounded cursor-pointer border"
                        />
                        <Input
                          value={form.topBarTextColor}
                          onChange={e => set("topBarTextColor", e.target.value)}
                          className="w-28 h-8 text-sm font-mono"
                        />
                      </div>
                    </Row>
                  </Section>

                  <Section title="Announcement Slides">
                    <p className="text-xs text-muted-foreground -mt-2">
                      Add multiple announcements that rotate in the top bar.
                    </p>
                    <TopBarSlidesEditor
                      slides={form.topBarSlides}
                      onChange={v => set("topBarSlides", v)}
                    />
                  </Section>
                </>
              )}
            </TabsContent>

            {/* ── Navigation ── */}
            <TabsContent value="navigation" className="space-y-6 mt-5">
              <Section title="Navigation Menu">
                <p className="text-xs text-muted-foreground -mt-2">
                  Drag to reorder. Toggle visibility, set labels, URLs and highlight badges.
                </p>
                <NavItemEditor
                  items={form.navItems}
                  onChange={v => set("navItems", v)}
                />
              </Section>

              <Section title="Trust Strip">
                <Row label="Show Trust Strip" help="Trust indicators shown beside nav items">
                  <Switch checked={form.showTrustStrip} onCheckedChange={v => set("showTrustStrip", v)} />
                </Row>
                {form.showTrustStrip && (
                  <TrustStripEditor
                    items={form.trustStripItems}
                    onChange={v => set("trustStripItems", v)}
                  />
                )}
              </Section>
            </TabsContent>

            {/* ── Icons & Actions ── */}
            <TabsContent value="icons" className="space-y-6 mt-5">
              <Section title="Header Action Buttons">
                <Row label="Shopping Cart" help="Show cart icon with item count">
                  <Switch checked={form.showCart} onCheckedChange={v => set("showCart", v)} />
                </Row>
                <Row label="Account / Login" help="Show user account icon">
                  <Switch checked={form.showAccount} onCheckedChange={v => set("showAccount", v)} />
                </Row>
                <Row label="Location Selector" help="City selector dropdown in header">
                  <Switch checked={form.showLocationSelector} onCheckedChange={v => set("showLocationSelector", v)} />
                </Row>
              </Section>

              <Section title="Contact Buttons">
                <Row label="WhatsApp Button" help="Quick WhatsApp contact button">
                  <Switch checked={form.showWhatsapp} onCheckedChange={v => set("showWhatsapp", v)} />
                </Row>
                {form.showWhatsapp && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">WhatsApp Number</Label>
                    <Input
                      value={form.whatsappNumber ?? ""}
                      onChange={e => set("whatsappNumber", e.target.value)}
                      placeholder="+92-300-0000000"
                      className="h-9"
                    />
                  </div>
                )}
              </Section>
            </TabsContent>

            {/* ── Mobile ── */}
            <TabsContent value="mobile" className="space-y-6 mt-5">
              <Section title="Mobile Search">
                <Row label="Show Search Bar on Mobile">
                  <Switch checked={form.showMobileSearch} onCheckedChange={v => set("showMobileSearch", v)} />
                </Row>
              </Section>

              <Section title="Category Strip">
                <Row label="Show Horizontal Categories" help="Scrollable category icons below mobile header">
                  <Switch checked={form.showMobileCategories} onCheckedChange={v => set("showMobileCategories", v)} />
                </Row>
              </Section>

              <Section title="Sticky Bottom Navigation">
                <Row label="Enable Sticky Bottom Bar" help="Home | Categories | Cart | Account bar fixed at bottom">
                  <Switch checked={form.showStickyBottomBar} onCheckedChange={v => set("showStickyBottomBar", v)} />
                </Row>
              </Section>

              <Section title="Mobile Menu Style">
                <Row label="Menu Animation">
                  <Select value={form.mobileMenuType} onValueChange={v => set("mobileMenuType", v)}>
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slide">Slide (from left)</SelectItem>
                      <SelectItem value="fullscreen">Full Screen Overlay</SelectItem>
                    </SelectContent>
                  </Select>
                </Row>
              </Section>
            </TabsContent>
          </Tabs>
        </div>

        {/* Preview Panel */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Live Preview
            </h3>
            <div className="flex items-center gap-1 border rounded-lg p-0.5">
              <Button
                variant={device === "desktop" ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setDevice("desktop")}
                title="Desktop"
              >
                <Monitor className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={device === "tablet" ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setDevice("tablet")}
                title="Tablet"
              >
                <Tablet className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={device === "mobile" ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setDevice("mobile")}
                title="Mobile"
              >
                <Smartphone className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <HeaderPreview form={form} device={device} />
          <p className="text-xs text-muted-foreground text-center">
            Preview updates instantly as you change settings. Click Save Changes to publish.
          </p>
          <div className="p-3 rounded-lg border bg-muted/30 text-xs space-y-1">
            <p className="font-semibold text-foreground">Quick stats</p>
            <p className="text-muted-foreground">{form.navItems.filter(n => n.enabled).length} nav items active · {form.trustStripItems.length} trust items · {form.topBarSlides.length} announcement slides</p>
            <p className="text-muted-foreground">Top bar: <span className={form.showTopBar ? "text-green-600 font-medium" : "text-red-500"}>{form.showTopBar ? "ON" : "OFF"}</span> · Sticky: <span className={form.stickyHeader ? "text-green-600 font-medium" : "text-muted-foreground"}>{form.stickyHeader ? "ON" : "OFF"}</span> · Shadow: <span className={form.showShadow ? "text-green-600 font-medium" : "text-muted-foreground"}>{form.showShadow ? "ON" : "OFF"}</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
