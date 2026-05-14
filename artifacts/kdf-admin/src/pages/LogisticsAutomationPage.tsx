import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Settings, BarChart3, Weight, Truck, Plus, Trash2, Save,
  RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, Play,
  ChevronDown, ChevronRight, Bell, Shield, ArrowRight, Info,
  ToggleLeft, ToggleRight, Boxes, FileText, Edit2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { adminApiUrl } from "@/lib/apiBase";

function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(adminApiUrl(path), {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

const RULE_CONDITIONS = [
  { value: "weight_gt",  label: "Weight greater than (kg)" },
  { value: "weight_lt",  label: "Weight less than (kg)" },
  { value: "cod_gt",     label: "COD amount greater than (PKR)" },
  { value: "city_is",    label: "City contains" },
  { value: "is_paid",    label: "Order is prepaid (online)" },
  { value: "is_cod",     label: "Order is COD" },
];

const STATUS_COLORS: Record<string, string> = {
  success:  "bg-green-100 text-green-800",
  skipped:  "bg-yellow-100 text-yellow-800",
  failed:   "bg-red-100 text-red-800",
  error:    "bg-red-100 text-red-800",
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export default function LogisticsAutomationPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"settings" | "rules" | "weights" | "logs" | "bulk">("settings");

  /* ── Fetch data ── */
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["logistics-automation"],
    queryFn: () => api("/admin/logistics/automation/settings").then(r => r.json()),
  });
  const { data: logsData = [], refetch: refetchLogs } = useQuery({
    queryKey: ["automation-logs"],
    queryFn: () => api("/admin/logistics/automation/logs?limit=100").then(r => r.json()),
    enabled: activeTab === "logs",
  });
  const { data: couriersData = [] } = useQuery({
    queryKey: ["couriers-list"],
    queryFn: () => api("/admin/couriers").then(r => r.json()),
  });

  const settings = data?.settings ?? {};
  const weightRules: any[] = data?.weightRules ?? [];

  /* ── Settings form state ── */
  const [form, setForm] = useState<Record<string, any>>({});
  const [rules, setRules] = useState<any[]>([]);
  const [initialized, setInitialized] = useState(false);
  if (data && !initialized) {
    setForm({
      enabled: settings.enabled ?? false,
      autoBookOnSync: settings.auto_book_on_sync ?? false,
      defaultCourierSlug: settings.default_courier_slug ?? "",
      notifyWhatsapp: settings.notify_whatsapp ?? true,
      notifyBranding: settings.notify_branding ?? "OnDrive Logistics",
      highRiskCities: (settings.high_risk_cities ?? []).join(", "),
    });
    setRules(Array.isArray(settings.rules) ? settings.rules : []);
    setInitialized(true);
  }

  /* ── Weight rules local state ── */
  const [weightForm, setWeightForm] = useState({ productType: "", skuPattern: "", weightPerUnit: "0.5", notes: "" });
  const [editingWeight, setEditingWeight] = useState<any>(null);

  /* ── Bulk auto-book state ── */
  const [bulkLimit, setBulkLimit] = useState("20");
  const [bulkResults, setBulkResults] = useState<any>(null);

  /* ── Mutations ── */
  const saveMutation = useMutation({
    mutationFn: () => api("/admin/logistics/automation/settings", {
      method: "PUT",
      body: JSON.stringify({
        ...form,
        highRiskCities: form.highRiskCities.split(",").map((s: string) => s.trim()).filter(Boolean),
        rules,
      }),
    }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["logistics-automation"] }); toast({ title: "Automation settings saved" }); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const weightSaveMutation = useMutation({
    mutationFn: (payload: any) => api("/admin/logistics/weight-rules", { method: "POST", body: JSON.stringify(payload) }).then(r => r.json()),
    onSuccess: () => { refetch(); setWeightForm({ productType: "", skuPattern: "", weightPerUnit: "0.5", notes: "" }); setEditingWeight(null); toast({ title: "Weight rule saved" }); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const weightDeleteMutation = useMutation({
    mutationFn: (id: number) => api(`/admin/logistics/weight-rules/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { refetch(); toast({ title: "Weight rule deleted" }); },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const bulkMutation = useMutation({
    mutationFn: () => api("/admin/logistics/auto-book-bulk", { method: "POST", body: JSON.stringify({ limit: parseInt(bulkLimit) }) }).then(r => r.json()),
    onSuccess: (d) => { setBulkResults(d); toast({ title: `Bulk booking: ${d.booked} booked out of ${d.total}` }); },
    onError: () => toast({ title: "Bulk booking failed", variant: "destructive" }),
  });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const addRule = () => setRules(r => [...r, { id: Date.now(), name: "New Rule", condition: "weight_gt", value: "1", courierSlug: "", enabled: true }]);
  const updateRule = (id: number, k: string, v: any) => setRules(r => r.map(x => x.id === id ? { ...x, [k]: v } : x));
  const removeRule = (id: number) => setRules(r => r.filter(x => x.id !== id));

  const activeCouriers = (couriersData as any[]).filter(c => c.isActive);

  const tabs = [
    { id: "settings", label: "⚡ Settings", icon: Settings },
    { id: "rules",    label: "📋 Rules Engine", icon: Zap },
    { id: "weights",  label: "⚖️ Weight Config", icon: Weight },
    { id: "logs",     label: "📊 Automation Logs", icon: FileText },
    { id: "bulk",     label: "🚀 Bulk Actions", icon: Boxes },
  ] as const;

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            OnDrive Logistics Automation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Smart courier selection, auto-booking, and fulfillment automation</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${form.enabled ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
            <div className={`w-2 h-2 rounded-full ${form.enabled ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            {form.enabled ? "Automation ON" : "Automation OFF"}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-xl overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)}
            className={`flex-1 min-w-fit px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === t.id ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Settings Tab ── */}
      {activeTab === "settings" && (
        <div className="space-y-5">
          {/* Master switch */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Enable Automation Engine</p>
                <p className="text-sm text-muted-foreground">Activates the OnDrive courier automation system</p>
              </div>
              <Toggle checked={form.enabled ?? false} onChange={v => set("enabled", v)} />
            </div>
          </div>

          {/* Auto booking */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /> Auto Booking</h3>
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">Auto-book on Shopify sync</p>
                <p className="text-xs text-muted-foreground">Automatically create shipments when new orders sync</p>
              </div>
              <Toggle checked={form.autoBookOnSync ?? false} onChange={v => set("autoBookOnSync", v)} />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide mb-2 block">Default Courier (Fallback)</Label>
              <select value={form.defaultCourierSlug ?? ""} onChange={e => set("defaultCourierSlug", e.target.value)}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background">
                <option value="">— Use AI Recommendation —</option>
                {activeCouriers.map((c: any) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Branding */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> OnDrive Notification Branding</h3>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide mb-2 block">Brand Name (shown in WhatsApp/SMS)</Label>
              <Input value={form.notifyBranding ?? ""} onChange={e => set("notifyBranding", e.target.value)} placeholder="OnDrive Logistics" className="max-w-sm" />
              <p className="text-xs text-muted-foreground mt-1">This name appears in all shipment notifications sent to customers</p>
            </div>
            <div className="flex items-center justify-between py-3 border-t border-border">
              <div>
                <p className="text-sm font-medium">WhatsApp Notifications</p>
                <p className="text-xs text-muted-foreground">Send tracking via WhatsApp when shipment is created</p>
              </div>
              <Toggle checked={form.notifyWhatsapp ?? true} onChange={v => set("notifyWhatsapp", v)} />
            </div>
            {/* Preview */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-green-800 mb-2">WhatsApp Message Preview:</p>
              <div className="bg-white rounded-lg p-3 text-sm text-gray-800 font-mono whitespace-pre-line border border-green-100">
{`Hi Ahmed! 📦 Your order *#1234* has been shipped.

🚚 *${form.notifyBranding || "OnDrive Logistics"}*
🔍 Tracking ID: *PX123456789*
Courier: *PostEx*

Track your parcel using the above ID. Thank you for shopping with KDF NUTS! 🌿`}
              </div>
            </div>
          </div>

          {/* High risk cities */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /> High-Risk Cities (Manual Review)</h3>
            <p className="text-xs text-muted-foreground">Orders from these cities will be skipped in auto-booking and flagged for manual review</p>
            <Input value={form.highRiskCities ?? ""} onChange={e => set("highRiskCities", e.target.value)}
              placeholder="e.g. Quetta, Peshawar, Gwadar (comma-separated)" />
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
            {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      )}

      {/* ── Rules Engine Tab ── */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Automation Rules</p>
              <p className="text-sm text-muted-foreground">Rules are evaluated in order — first match wins</p>
            </div>
            <Button size="sm" onClick={addRule} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Rule
            </Button>
          </div>

          {rules.length === 0 && (
            <div className="bg-card border border-dashed border-border rounded-xl p-10 text-center">
              <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No rules configured</p>
              <p className="text-sm text-muted-foreground">Add rules to automate courier selection based on order properties</p>
              <Button size="sm" className="mt-4" onClick={addRule}><Plus className="w-4 h-4 mr-1.5" /> Add First Rule</Button>
            </div>
          )}

          <div className="space-y-3">
            {rules.map((rule, idx) => (
              <div key={rule.id} className={`bg-card border rounded-xl p-4 space-y-3 ${rule.enabled ? "border-border" : "border-border opacity-60"}`}>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">{idx + 1}</div>
                  <Input value={rule.name} onChange={e => updateRule(rule.id, "name", e.target.value)}
                    className="h-8 text-sm font-medium" placeholder="Rule name" />
                  <Toggle checked={rule.enabled} onChange={v => updateRule(rule.id, "enabled", v)} />
                  <button onClick={() => removeRule(rule.id)} className="text-red-400 hover:text-red-600 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs mb-1 block">Condition</Label>
                    <select value={rule.condition} onChange={e => updateRule(rule.id, "condition", e.target.value)}
                      className="w-full h-8 border border-border rounded-md px-2 text-xs bg-background">
                      {RULE_CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  {!["is_paid", "is_cod"].includes(rule.condition) && (
                    <div>
                      <Label className="text-xs mb-1 block">Value</Label>
                      <Input value={rule.value} onChange={e => updateRule(rule.id, "value", e.target.value)}
                        className="h-8 text-xs" placeholder="e.g. 2" />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs mb-1 block">Use Courier</Label>
                    <select value={rule.courierSlug} onChange={e => updateRule(rule.id, "courierSlug", e.target.value)}
                      className="w-full h-8 border border-border rounded-md px-2 text-xs bg-background">
                      <option value="">— AI Recommend —</option>
                      {activeCouriers.map((c: any) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {rules.length > 0 && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
              {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Rules
            </Button>
          )}

          {/* Built-in logic info */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-1.5"><Info className="w-4 h-4" /> Built-in Smart Logic</p>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• <strong>Paid orders</strong> → COD automatically set to PKR 0</li>
              <li>• <strong>Weight &gt; 2kg</strong> → TCS preferred for heavy parcels</li>
              <li>• <strong>Karachi orders</strong> → Leopards recommended</li>
              <li>• <strong>High-risk cities</strong> → flagged for manual review</li>
              <li>• <strong>No match</strong> → AI recommendation engine picks best courier</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Weight Config Tab ── */}
      {activeTab === "weights" && (
        <div className="space-y-4">
          <div>
            <p className="font-semibold">Product Weight Rules</p>
            <p className="text-sm text-muted-foreground">Define per-product weights for automatic shipment weight calculation</p>
          </div>

          {/* Add/Edit form */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold">{editingWeight ? "Edit Weight Rule" : "Add Weight Rule"}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Product Type / Keyword</Label>
                <Input value={weightForm.productType} onChange={e => setWeightForm(f => ({ ...f, productType: e.target.value }))}
                  placeholder="e.g. almonds, cashews" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">SKU Prefix (optional)</Label>
                <Input value={weightForm.skuPattern} onChange={e => setWeightForm(f => ({ ...f, skuPattern: e.target.value }))}
                  placeholder="e.g. ALM%" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Weight per Unit (kg)</Label>
                <Input type="number" step="0.1" value={weightForm.weightPerUnit} onChange={e => setWeightForm(f => ({ ...f, weightPerUnit: e.target.value }))}
                  className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Notes</Label>
                <Input value={weightForm.notes} onChange={e => setWeightForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. 500g bag" className="h-8 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => weightSaveMutation.mutate({ ...weightForm, weightPerUnit: parseFloat(weightForm.weightPerUnit), id: editingWeight?.id })}
                disabled={weightSaveMutation.isPending} className="gap-1.5">
                <Save className="w-3.5 h-3.5" /> {editingWeight ? "Update Rule" : "Add Rule"}
              </Button>
              {editingWeight && <Button size="sm" variant="outline" onClick={() => { setEditingWeight(null); setWeightForm({ productType: "", skuPattern: "", weightPerUnit: "0.5", notes: "" }); }}>Cancel</Button>}
            </div>
          </div>

          {/* Rules list */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Product Type", "SKU Pattern", "Weight (kg)", "Notes", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {weightRules.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{r.product_type || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.sku_pattern || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 font-semibold">{r.weight_per_unit} kg</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.notes || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingWeight(r); setWeightForm({ productType: r.product_type ?? "", skuPattern: r.sku_pattern ?? "", weightPerUnit: String(r.weight_per_unit), notes: r.notes ?? "" }); }}
                          className="text-muted-foreground hover:text-foreground p-1">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => weightDeleteMutation.mutate(r.id)} className="text-red-400 hover:text-red-600 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {weightRules.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No weight rules configured</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-800 mb-1">Weight Calculation Logic:</p>
            <p className="text-xs text-amber-700">1. Check if Shopify variant has gram weight → use it directly<br />2. Match SKU prefix against rules (e.g. ALM% → 0.5kg)<br />3. Match product title keyword (e.g. "almonds" → 0.5kg)<br />4. Fallback: 0.5kg per item</p>
          </div>
        </div>
      )}

      {/* ── Logs Tab ── */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Automation Logs</p>
            <Button size="sm" variant="outline" onClick={() => refetchLogs()} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Order", "Action", "Courier", "Tracking ID", "Weight", "COD", "Rule", "Status", "Time"].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(logsData as any[]).map((log: any) => (
                  <tr key={log.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{log.shopify_order_number || "—"}</div>
                      <div className="text-xs text-muted-foreground">{log.shopify_order_id?.slice(-8) || ""}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs capitalize">{log.action?.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2.5 text-xs">{log.courier_slug?.toUpperCase() || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{log.tracking_id || "—"}</td>
                    <td className="px-3 py-2.5 text-xs">{log.calculated_weight ? `${log.calculated_weight}kg` : "—"}</td>
                    <td className="px-3 py-2.5 text-xs">{log.cod_amount > 0 ? `PKR ${parseInt(log.cod_amount).toLocaleString()}` : "Prepaid"}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{log.rule_matched || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[log.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
                {(logsData as any[]).length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No automation logs yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Bulk Actions Tab ── */}
      {activeTab === "bulk" && (
        <div className="space-y-5">
          <div>
            <p className="font-semibold">Bulk Auto-Booking</p>
            <p className="text-sm text-muted-foreground">Automatically book couriers for all unbooked unfulfilled orders</p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-xs text-yellow-700 font-semibold uppercase">Process Up To</p>
                <div className="flex items-center gap-2 mt-2">
                  <Input type="number" value={bulkLimit} onChange={e => setBulkLimit(e.target.value)} className="h-9 w-24 text-lg font-bold" min="1" max="100" />
                  <span className="text-sm text-yellow-800">orders at once</span>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-xs text-blue-700 font-semibold uppercase">How It Works</p>
                <ul className="text-xs text-blue-800 mt-2 space-y-1">
                  <li>• Finds unfulfilled orders without tracking</li>
                  <li>• Calculates weight automatically</li>
                  <li>• Applies rules engine for courier selection</li>
                  <li>• Sends WhatsApp with OnDrive branding</li>
                </ul>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs text-amber-800"><AlertTriangle className="w-3.5 h-3.5 inline mr-1" /> Bulk booking generates local tracking IDs. Enable auto-sync for API-based bookings.</p>
            </div>

            <Button onClick={() => bulkMutation.mutate()} disabled={bulkMutation.isPending} className="gap-2 w-full">
              {bulkMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {bulkMutation.isPending ? "Processing..." : `Auto-Book Up To ${bulkLimit} Orders`}
            </Button>
          </div>

          {/* Bulk results */}
          {bulkResults && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">Bulk Booking Results</h3>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  {bulkResults.booked}/{bulkResults.total} booked
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{bulkResults.booked}</p>
                  <p className="text-xs text-green-600">Successfully Booked</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{bulkResults.results?.filter((r: any) => r.reason === "high_risk_city").length ?? 0}</p>
                  <p className="text-xs text-yellow-600">Flagged (High Risk)</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{bulkResults.total - bulkResults.booked}</p>
                  <p className="text-xs text-red-600">Skipped / Failed</p>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1.5">
                {(bulkResults.results ?? []).map((r: any, i: number) => (
                  <div key={i} className={`flex items-center gap-3 text-xs px-3 py-2 rounded-lg ${r.ok ? "bg-green-50" : "bg-red-50"}`}>
                    {r.ok ? <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                    <span className="font-medium">{r.orderNumber}</span>
                    {r.ok && <><ArrowRight className="w-3 h-3 text-muted-foreground" /><span>{r.courierSlug?.toUpperCase()}</span><span className="font-mono text-muted-foreground">{r.trackingId}</span></>}
                    {!r.ok && <span className="text-red-600">{r.reason ?? r.error ?? "Failed"}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
