import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutTemplate, Loader2, Plus, Trash2, Edit2, ChevronDown, ChevronUp,
  Save, Globe, Phone, Mail, MapPin, Link2, Eye, EyeOff,
  Facebook, Instagram, Youtube, Twitter, Smartphone, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });
async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

type Tab = "general" | "menus" | "policies" | "applinks" | "social";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "general",  label: "General",      icon: LayoutTemplate },
  { id: "menus",    label: "Menus & Links", icon: Link2 },
  { id: "policies", label: "Policies",      icon: Globe },
  { id: "applinks", label: "App Downloads", icon: Smartphone },
  { id: "social",   label: "Social Links",  icon: Globe },
];

const SOCIAL_PLATFORMS = ["Facebook", "Instagram", "TikTok", "YouTube", "Twitter / X", "WhatsApp", "LinkedIn", "Pinterest", "Snapchat"];
const SOCIAL_ICONS: Record<string, React.ElementType> = {
  Facebook: Facebook, Instagram: Instagram, YouTube: Youtube,
  "Twitter / X": Twitter, WhatsApp: Phone, LinkedIn: Globe, TikTok: Globe,
};

/* ─────────────────────── Default menu seeds ─────────────────────── */
const DEFAULT_MENUS = [
  { title: "Shop", items: [
    { label: "All Products", linkValue: "/products" }, { label: "Categories", linkValue: "/categories" },
    { label: "New Arrivals", linkValue: "/products?sortBy=newest" }, { label: "Best Sellers", linkValue: "/products?sortBy=popular" },
  ]},
  { title: "Account", items: [
    { label: "Login", linkValue: "/login" }, { label: "Register", linkValue: "/register" },
    { label: "My Orders", linkValue: "/account" }, { label: "Wishlist", linkValue: "/account?tab=wishlist" },
  ]},
  { title: "Support", items: [
    { label: "Contact Us", linkValue: "/contact" }, { label: "FAQ", linkValue: "/faq" },
    { label: "About Us", linkValue: "/about" },
  ]},
];

const DEFAULT_POLICIES = [
  { title: "Privacy Policy",     slug: "privacy-policy",     content: "<h1>Privacy Policy</h1>\n<p>We value your privacy...</p>" },
  { title: "Terms & Conditions", slug: "terms-and-conditions", content: "<h1>Terms & Conditions</h1>\n<p>By using our services...</p>" },
  { title: "Shipping Policy",    slug: "shipping-policy",    content: "<h1>Shipping Policy</h1>\n<p>We ship across Pakistan...</p>" },
  { title: "Return Policy",      slug: "return-policy",      content: "<h1>Return Policy</h1>\n<p>Returns accepted within 7 days...</p>" },
];

export default function FooterPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("general");

  /* ─── General Settings ─── */
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/admin/footer/settings"],
    queryFn: () => apiFetch("/api/admin/footer/settings").catch(() => null),
  });
  const [generalForm, setGeneralForm] = useState({
    description: "", address: "", phone: "", email: "", copyrightText: "", isActive: true,
  });
  useEffect(() => {
    if (settings) setGeneralForm({
      description:   settings.description   ?? "",
      address:       settings.address       ?? "",
      phone:         settings.phone         ?? "",
      email:         settings.email         ?? "",
      copyrightText: settings.copyrightText ?? "",
      isActive:      settings.isActive      ?? true,
    });
  }, [settings]);
  const saveGeneral = useMutation({
    mutationFn: () => apiFetch("/api/admin/footer/settings", { method: "PUT", body: JSON.stringify(generalForm) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/footer/settings"] }); toast({ title: "Footer settings saved" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  /* ─── Menus ─── */
  const { data: menus = [], isLoading: menusLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/footer/menus"],
    queryFn: () => apiFetch("/api/admin/footer/menus"),
  });
  const [expandedMenu, setExpandedMenu] = useState<number | null>(null);
  const [newMenuTitle, setNewMenuTitle] = useState("");
  const [addingItemTo, setAddingItemTo] = useState<number | null>(null);
  const [newItem, setNewItem] = useState({ label: "", linkValue: "", linkType: "custom", openInNewTab: false });
  const [editingItem, setEditingItem] = useState<any | null>(null);

  const addMenu = useMutation({
    mutationFn: () => apiFetch("/api/admin/footer/menus", { method: "POST", body: JSON.stringify({ title: newMenuTitle, sortOrder: menus.length }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/footer/menus"] }); setNewMenuTitle(""); toast({ title: "Menu added" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });
  const deleteMenu = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/footer/menus/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/footer/menus"] }); toast({ title: "Menu deleted" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });
  const addItem = useMutation({
    mutationFn: () => apiFetch("/api/admin/footer/menu-items", { method: "POST", body: JSON.stringify({ ...newItem, menuId: addingItemTo, sortOrder: 999 }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/footer/menus"] }); setNewItem({ label: "", linkValue: "", linkType: "custom", openInNewTab: false }); setAddingItemTo(null); toast({ title: "Link added" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });
  const updateItem = useMutation({
    mutationFn: () => apiFetch(`/api/admin/footer/menu-items/${editingItem.id}`, { method: "PUT", body: JSON.stringify(editingItem) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/footer/menus"] }); setEditingItem(null); toast({ title: "Link updated" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });
  const deleteItem = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/footer/menu-items/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/footer/menus"] }); toast({ title: "Link deleted" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });
  const seedMenus = useMutation({
    mutationFn: async () => {
      for (const m of DEFAULT_MENUS) {
        const created = await apiFetch("/api/admin/footer/menus", { method: "POST", body: JSON.stringify({ title: m.title, sortOrder: DEFAULT_MENUS.indexOf(m) }) });
        for (const item of m.items) {
          await apiFetch("/api/admin/footer/menu-items", { method: "POST", body: JSON.stringify({ menuId: created.id, ...item, linkType: "custom", sortOrder: m.items.indexOf(item), openInNewTab: false }) }).catch(() => {});
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/footer/menus"] }); toast({ title: "Default menus seeded" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  /* ─── Policies ─── */
  const { data: policies = [], isLoading: policiesLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/policies"],
    queryFn: () => apiFetch("/api/admin/policies"),
    enabled: tab === "policies",
  });
  const [editingPolicy, setEditingPolicy] = useState<any | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [policyForm, setPolicyForm] = useState({ title: "", slug: "", content: "", metaTitle: "", metaDescription: "", isActive: true });

  const openNewPolicy = () => { setPolicyForm({ title: "", slug: "", content: "", metaTitle: "", metaDescription: "", isActive: true }); setEditingPolicy(null); setShowEditor(true); };
  const openEditPolicy = async (p: any) => {
    const full = await apiFetch(`/api/admin/policies/${p.id}`);
    setPolicyForm({ title: full.title, slug: full.slug, content: full.content ?? "", metaTitle: full.metaTitle ?? "", metaDescription: full.metaDescription ?? "", isActive: full.isActive });
    setEditingPolicy(full);
    setShowEditor(true);
  };
  const savePolicy = useMutation({
    mutationFn: () => editingPolicy
      ? apiFetch(`/api/admin/policies/${editingPolicy.id}`, { method: "PUT", body: JSON.stringify(policyForm) })
      : apiFetch("/api/admin/policies", { method: "POST", body: JSON.stringify(policyForm) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/policies"] }); setShowEditor(false); toast({ title: editingPolicy ? "Policy updated" : "Policy created" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });
  const deletePolicy = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/policies/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/policies"] }); toast({ title: "Policy deleted" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });
  const seedPolicies = useMutation({
    mutationFn: async () => { for (const p of DEFAULT_POLICIES) await apiFetch("/api/admin/policies", { method: "POST", body: JSON.stringify({ ...p, isActive: true }) }).catch(() => {}); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/policies"] }); toast({ title: "Default policies created" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  /* ─── App Links ─── */
  const { data: appLinks } = useQuery({
    queryKey: ["/api/admin/footer/app-links"],
    queryFn: () => apiFetch("/api/admin/footer/app-links").catch(() => null),
    enabled: tab === "applinks",
  });
  const [appForm, setAppForm] = useState({ androidLink: "", iosLink: "", isActive: true });
  useEffect(() => {
    if (appLinks) setAppForm({ androidLink: appLinks.androidLink ?? "", iosLink: appLinks.iosLink ?? "", isActive: appLinks.isActive ?? true });
  }, [appLinks]);
  const saveAppLinks = useMutation({
    mutationFn: () => apiFetch("/api/admin/footer/app-links", { method: "PUT", body: JSON.stringify(appForm) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/footer/app-links"] }); toast({ title: "App links saved" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  /* ─── Social Links ─── */
  const { data: socialLinks = [], isLoading: socialLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/footer/social-links"],
    queryFn: () => apiFetch("/api/admin/footer/social-links"),
    enabled: tab === "social",
  });
  const [newSocial, setNewSocial] = useState({ platform: "Facebook", url: "", icon: "facebook", sortOrder: 0, isActive: true });
  const [editingSocial, setEditingSocial] = useState<any | null>(null);
  const addSocial = useMutation({
    mutationFn: () => apiFetch("/api/admin/footer/social-links", { method: "POST", body: JSON.stringify({ ...newSocial, icon: newSocial.platform.toLowerCase().replace(/[^a-z]/g, "") }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/footer/social-links"] }); setNewSocial({ platform: "Facebook", url: "", icon: "facebook", sortOrder: 0, isActive: true }); toast({ title: "Social link added" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });
  const updateSocial = useMutation({
    mutationFn: () => apiFetch(`/api/admin/footer/social-links/${editingSocial.id}`, { method: "PUT", body: JSON.stringify({ ...editingSocial, icon: editingSocial.platform.toLowerCase().replace(/[^a-z]/g, "") }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/footer/social-links"] }); setEditingSocial(null); toast({ title: "Updated" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });
  const deleteSocial = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/footer/social-links/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/footer/social-links"] }); toast({ title: "Deleted" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <LayoutTemplate className="w-6 h-6 text-primary" />
          Footer Management
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Control every part of the website footer — links, policies, social icons, and more.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-muted/50 p-1 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === id ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ── GENERAL ── */}
      {tab === "general" && (
        <div className="space-y-5">
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-base">General Footer Settings</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Company info shown in the footer brand section</p>
              </div>
              <Switch checked={generalForm.isActive} onCheckedChange={v => setGeneralForm(f => ({ ...f, isActive: v }))} />
            </div>
            {settingsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground px-5 py-6"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
            ) : (
              <div className="px-5 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Company Description</Label>
                  <Textarea value={generalForm.description} onChange={e => setGeneralForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Premium dry fruits delivered fresh to your doorstep across Pakistan." rows={2} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-muted-foreground" />Address</Label>
                    <Input value={generalForm.address} onChange={e => setGeneralForm(f => ({ ...f, address: e.target.value }))} placeholder="Karachi, Pakistan" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-muted-foreground" />Phone</Label>
                    <Input value={generalForm.phone} onChange={e => setGeneralForm(f => ({ ...f, phone: e.target.value }))} placeholder="+92 300 123 4567" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-muted-foreground" />Email</Label>
                    <Input value={generalForm.email} onChange={e => setGeneralForm(f => ({ ...f, email: e.target.value }))} placeholder="hello@kdfnuts.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Copyright Text</Label>
                  <Input value={generalForm.copyrightText} onChange={e => setGeneralForm(f => ({ ...f, copyrightText: e.target.value }))} placeholder="© 2024 KDF NUTS. All rights reserved." />
                  <p className="text-xs text-muted-foreground">Leave blank to auto-generate from site name.</p>
                </div>
              </div>
            )}
          </div>
          <Button onClick={() => saveGeneral.mutate()} disabled={saveGeneral.isPending} style={{ backgroundColor: "#5FA800" }} className="text-white gap-1.5">
            {saveGeneral.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </Button>
        </div>
      )}

      {/* ── MENUS ── */}
      {tab === "menus" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Create footer menu groups and add links to each. These appear as columns in the footer.</p>
            <div className="flex gap-2">
              {menus.length === 0 && (
                <Button variant="outline" size="sm" onClick={() => seedMenus.mutate()} disabled={seedMenus.isPending}>
                  {seedMenus.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add Defaults"}
                </Button>
              )}
            </div>
          </div>

          {/* Add new menu */}
          <div className="flex gap-2">
            <Input value={newMenuTitle} onChange={e => setNewMenuTitle(e.target.value)} placeholder="Menu title (e.g. Support)" className="max-w-xs" />
            <Button onClick={() => addMenu.mutate()} disabled={addMenu.isPending || !newMenuTitle.trim()} style={{ backgroundColor: "#5FA800" }} className="text-white gap-1.5">
              <Plus className="w-4 h-4" />Add Menu
            </Button>
          </div>

          {menusLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : menus.length === 0 ? (
            <div className="text-center py-12 border border-dashed rounded-xl text-muted-foreground">
              <LayoutTemplate className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No footer menus yet.</p>
              <p className="text-xs mt-1">Add a menu above or click "Add Defaults" to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(menus as any[]).map((menu: any) => (
                <div key={menu.id} className="border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                    <button className="flex items-center gap-2 flex-1 text-left" onClick={() => setExpandedMenu(expandedMenu === menu.id ? null : menu.id)}>
                      <span className="font-semibold text-sm">{menu.title}</span>
                      <Badge variant="secondary" className="text-xs">{menu.items?.length ?? 0} links</Badge>
                      {expandedMenu === menu.id ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-auto" /> : <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />}
                    </button>
                    <div className="flex items-center gap-2 ml-3">
                      <button onClick={() => deleteMenu.mutate(menu.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {expandedMenu === menu.id && (
                    <div className="px-4 pb-4 pt-2 space-y-2">
                      {(menu.items ?? []).map((item: any) => (
                        <div key={item.id}>
                          {editingItem?.id === item.id ? (
                            <div className="flex gap-2 items-center bg-muted/30 p-2 rounded-lg">
                              <Input value={editingItem.label} onChange={e => setEditingItem((i: any) => ({ ...i, label: e.target.value }))} className="h-8 text-xs flex-1" placeholder="Label" />
                              <Input value={editingItem.linkValue} onChange={e => setEditingItem((i: any) => ({ ...i, linkValue: e.target.value }))} className="h-8 text-xs flex-1" placeholder="URL" />
                              <Button size="sm" onClick={() => updateItem.mutate()} disabled={updateItem.isPending} className="h-8 text-xs" style={{ backgroundColor: "#5FA800" }}>Save</Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingItem(null)} className="h-8 text-xs">Cancel</Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-muted/30 group">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{item.label}</span>
                                <span className="text-xs text-muted-foreground font-mono">{item.linkValue}</span>
                                {item.openInNewTab && <ExternalLink className="w-3 h-3 text-muted-foreground" />}
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditingItem(item)} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"><Edit2 className="w-3 h-3" /></button>
                                <button onClick={() => deleteItem.mutate(item.id)} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3 h-3" /></button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {addingItemTo === menu.id ? (
                        <div className="flex gap-2 items-center border border-dashed border-border rounded-lg p-2 mt-2">
                          <Input value={newItem.label} onChange={e => setNewItem(i => ({ ...i, label: e.target.value }))} className="h-8 text-xs" placeholder="Label (e.g. FAQ)" />
                          <Input value={newItem.linkValue} onChange={e => setNewItem(i => ({ ...i, linkValue: e.target.value }))} className="h-8 text-xs" placeholder="URL (e.g. /faq)" />
                          <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                            <input type="checkbox" checked={newItem.openInNewTab} onChange={e => setNewItem(i => ({ ...i, openInNewTab: e.target.checked }))} />
                            New tab
                          </label>
                          <Button size="sm" onClick={() => addItem.mutate()} disabled={addItem.isPending || !newItem.label || !newItem.linkValue} className="h-8 text-xs" style={{ backgroundColor: "#5FA800" }}>Add</Button>
                          <Button size="sm" variant="outline" onClick={() => setAddingItemTo(null)} className="h-8 text-xs">Cancel</Button>
                        </div>
                      ) : (
                        <button onClick={() => setAddingItemTo(menu.id)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors">
                          <Plus className="w-3.5 h-3.5" />Add link
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── POLICIES ── */}
      {tab === "policies" && (
        <div className="space-y-4">
          {showEditor ? (
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h2 className="font-semibold text-base">{editingPolicy ? "Edit Policy" : "New Policy"}</h2>
                <Button variant="outline" size="sm" onClick={() => setShowEditor(false)}>Cancel</Button>
              </div>
              <div className="px-5 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Policy Title</Label>
                    <Input value={policyForm.title} onChange={e => setPolicyForm(f => ({ ...f, title: e.target.value, slug: f.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-") }))} placeholder="Privacy Policy" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">URL Slug</Label>
                    <Input value={policyForm.slug} onChange={e => setPolicyForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder="privacy-policy" className="font-mono text-xs" />
                    <p className="text-xs text-muted-foreground">Page: <code>/policies/{policyForm.slug || "your-slug"}</code></p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Content (HTML supported)</Label>
                  <Textarea value={policyForm.content} onChange={e => setPolicyForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="<h1>Policy Title</h1>&#10;<p>Your policy content here...</p>" rows={14}
                    className="font-mono text-xs resize-y" />
                  <p className="text-xs text-muted-foreground">You can use HTML tags for formatting: &lt;h1&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;strong&gt;, etc.</p>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Meta Title (SEO)</Label>
                    <Input value={policyForm.metaTitle} onChange={e => setPolicyForm(f => ({ ...f, metaTitle: e.target.value }))} placeholder={policyForm.title || "Policy title for search engines"} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Meta Description (SEO)</Label>
                    <Input value={policyForm.metaDescription} onChange={e => setPolicyForm(f => ({ ...f, metaDescription: e.target.value }))} placeholder="Brief description for search engines (160 chars)" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={policyForm.isActive} onCheckedChange={v => setPolicyForm(f => ({ ...f, isActive: v }))} />
                  <Label className="text-sm">Published (visible on website)</Label>
                </div>
              </div>
              <div className="px-5 pb-5 flex gap-3">
                <Button onClick={() => savePolicy.mutate()} disabled={savePolicy.isPending || !policyForm.title || !policyForm.slug} style={{ backgroundColor: "#5FA800" }} className="text-white gap-1.5">
                  {savePolicy.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingPolicy ? "Update Policy" : "Create Policy"}
                </Button>
                <Button variant="outline" onClick={() => setShowEditor(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Manage your legal and informational policy pages. They appear in the footer and have their own URLs.</p>
                <div className="flex gap-2">
                  {policies.length === 0 && (
                    <Button variant="outline" size="sm" onClick={() => seedPolicies.mutate()} disabled={seedPolicies.isPending}>
                      {seedPolicies.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add Defaults"}
                    </Button>
                  )}
                  <Button size="sm" onClick={openNewPolicy} style={{ backgroundColor: "#5FA800" }} className="text-white gap-1.5">
                    <Plus className="w-3.5 h-3.5" />New Policy
                  </Button>
                </div>
              </div>
              {policiesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
              ) : policies.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-xl text-muted-foreground">
                  <Globe className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No policies yet.</p>
                  <p className="text-xs mt-1">Click "Add Defaults" to create the standard policy pages.</p>
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider font-medium text-muted-foreground">Title</th>
                        <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider font-medium text-muted-foreground">URL</th>
                        <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(policies as any[]).map((p: any) => (
                        <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium">{p.title}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">/policies/{p.slug}</td>
                          <td className="px-4 py-3">
                            {p.isActive ? <Badge className="bg-green-100 text-green-800 text-xs">Published</Badge> : <Badge variant="secondary" className="text-xs">Draft</Badge>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => openEditPolicy(p)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deletePolicy.mutate(p.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── APP LINKS ── */}
      {tab === "applinks" && (
        <div className="space-y-5">
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2"><Smartphone className="w-4 h-4" />App Download Links</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Control the Google Play and App Store links shown in the footer</p>
              </div>
              <Switch checked={appForm.isActive} onCheckedChange={v => setAppForm(f => ({ ...f, isActive: v }))} />
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Google Play Store URL</Label>
                <Input value={appForm.androidLink} onChange={e => setAppForm(f => ({ ...f, androidLink: e.target.value }))} placeholder="https://play.google.com/store/apps/details?id=com.kdfnuts" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Apple App Store URL</Label>
                <Input value={appForm.iosLink} onChange={e => setAppForm(f => ({ ...f, iosLink: e.target.value }))} placeholder="https://apps.apple.com/app/kdf-nuts/id..." />
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700">
                When active, "Get the App" section shows in the footer with download buttons. Toggle off to hide it.
              </div>
            </div>
          </div>
          <Button onClick={() => saveAppLinks.mutate()} disabled={saveAppLinks.isPending} style={{ backgroundColor: "#5FA800" }} className="text-white gap-1.5">
            {saveAppLinks.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save App Links
          </Button>
        </div>
      )}

      {/* ── SOCIAL LINKS ── */}
      {tab === "social" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Add your social media profiles. They appear as icons in the footer brand section.</p>

          {/* Add new */}
          <div className="bg-card border rounded-xl p-4">
            <p className="text-sm font-medium mb-3">Add Social Link</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs">Platform</Label>
                <select value={newSocial.platform} onChange={e => setNewSocial(s => ({ ...s, platform: e.target.value }))}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background">
                  {SOCIAL_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Profile URL</Label>
                <Input value={newSocial.url} onChange={e => setNewSocial(s => ({ ...s, url: e.target.value }))} placeholder="https://facebook.com/yourpage" />
              </div>
              <Button onClick={() => addSocial.mutate()} disabled={addSocial.isPending || !newSocial.url} style={{ backgroundColor: "#5FA800" }} className="text-white gap-1.5 h-10">
                <Plus className="w-4 h-4" />Add
              </Button>
            </div>
          </div>

          {socialLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : socialLinks.length === 0 ? (
            <div className="text-center py-12 border border-dashed rounded-xl text-muted-foreground">
              <Globe className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No social links yet. Add your first one above.</p>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider font-medium text-muted-foreground">Platform</th>
                    <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider font-medium text-muted-foreground">URL</th>
                    <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(socialLinks as any[]).map((s: any) => (
                    <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                      {editingSocial?.id === s.id ? (
                        <>
                          <td className="px-4 py-2">
                            <select value={editingSocial.platform} onChange={e => setEditingSocial((i: any) => ({ ...i, platform: e.target.value }))}
                              className="border border-input rounded px-2 py-1 text-xs bg-background">
                              {SOCIAL_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2"><Input value={editingSocial.url} onChange={e => setEditingSocial((i: any) => ({ ...i, url: e.target.value }))} className="h-7 text-xs" /></td>
                          <td className="px-4 py-2"><Switch checked={editingSocial.isActive} onCheckedChange={v => setEditingSocial((i: any) => ({ ...i, isActive: v }))} /></td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" onClick={() => updateSocial.mutate()} disabled={updateSocial.isPending} className="h-7 text-xs" style={{ backgroundColor: "#5FA800" }}>Save</Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingSocial(null)} className="h-7 text-xs">Cancel</Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-medium">{s.platform}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                            <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">{s.url}</a>
                          </td>
                          <td className="px-4 py-3">
                            {s.isActive ? <Badge className="bg-green-100 text-green-800 text-xs">Active</Badge> : <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => setEditingSocial(s)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteSocial.mutate(s.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
