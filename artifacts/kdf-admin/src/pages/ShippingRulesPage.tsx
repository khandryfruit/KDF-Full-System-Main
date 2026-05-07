import { useState, useEffect } from "react";
import {
  Truck, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Loader2, X, Package, Tag, Weight, DollarSign, Layers,
  ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const API = "/api/admin/shipping/rules";
const CATEGORIES_API = "/api/categories";

function getAuthHeaders() {
  const token = localStorage.getItem("kdf_admin_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const RULE_TYPES = [
  { value: "flat", label: "Flat Rate", icon: <Truck className="w-4 h-4" />, desc: "A single fee for all orders" },
  { value: "amount", label: "Order Amount", icon: <DollarSign className="w-4 h-4" />, desc: "Based on cart subtotal (Rs.)" },
  { value: "weight", label: "Weight", icon: <Weight className="w-4 h-4" />, desc: "Based on total cart weight (grams)" },
  { value: "product", label: "Specific Products", icon: <Package className="w-4 h-4" />, desc: "Apply to specific product IDs" },
  { value: "category", label: "Specific Categories", icon: <Tag className="w-4 h-4" />, desc: "Apply to products in certain categories" },
] as const;

type RuleType = "flat" | "amount" | "weight" | "product" | "category";

interface ShippingRule {
  id: number;
  name: string;
  type: RuleType;
  methodName: string;
  deliveryTime: string;
  minValue: string | null;
  maxValue: string | null;
  price: string;
  productIds: number[];
  categoryIds: number[];
  cities: string[];
  priority: number;
  enabled: boolean;
}

interface Category {
  id: number;
  name: string;
}

const EMPTY_FORM = {
  name: "",
  type: "flat" as RuleType,
  methodName: "Standard Delivery",
  deliveryTime: "2–3 business days",
  minValue: "",
  maxValue: "",
  price: "150",
  productIds: "",
  categoryIds: [] as number[],
  cities: "",
  priority: "10",
  enabled: true,
};

export default function ShippingRulesPage() {
  const { toast } = useToast();
  const [rules, setRules] = useState<ShippingRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [expandedHelp, setExpandedHelp] = useState(false);

  useEffect(() => {
    loadRules();
    loadCategories();
  }, []);

  async function loadRules() {
    setLoading(true);
    try {
      const res = await fetch(API, { headers: getAuthHeaders() });
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Failed to load rules", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const res = await fetch(CATEGORIES_API);
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch { /* silently ignore */ }
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }

  function openEdit(rule: ShippingRule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      type: rule.type,
      methodName: rule.methodName,
      deliveryTime: rule.deliveryTime,
      minValue: rule.minValue ?? "",
      maxValue: rule.maxValue ?? "",
      price: rule.price,
      productIds: rule.productIds.join(", "),
      categoryIds: rule.categoryIds,
      cities: rule.cities.join(", "),
      priority: String(rule.priority),
      enabled: rule.enabled,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast({ title: "Rule name is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        type: form.type,
        methodName: form.methodName.trim() || "Standard Delivery",
        deliveryTime: form.deliveryTime.trim() || "2–3 business days",
        price: Number(form.price) || 0,
        priority: Number(form.priority) || 10,
        enabled: form.enabled,
        cities: form.cities.split(",").map(s => s.trim()).filter(Boolean),
      };

      if (form.type === "weight" || form.type === "amount") {
        payload.minValue = form.minValue !== "" ? Number(form.minValue) : null;
        payload.maxValue = form.maxValue !== "" ? Number(form.maxValue) : null;
      }
      if (form.type === "product") {
        payload.productIds = form.productIds.split(",").map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
      }
      if (form.type === "category") {
        payload.categoryIds = form.categoryIds;
      }

      const url = editingId ? `${API}/${editingId}` : API;
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Save failed");

      toast({ title: editingId ? "Rule updated" : "Rule created" });
      setShowModal(false);
      loadRules();
    } catch {
      toast({ title: "Failed to save rule", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this shipping rule?")) return;
    setDeletingId(id);
    try {
      await fetch(`${API}/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      setRules(prev => prev.filter(r => r.id !== id));
      toast({ title: "Rule deleted" });
    } catch {
      toast({ title: "Failed to delete rule", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(id: number) {
    setTogglingId(id);
    try {
      const res = await fetch(`${API}/${id}/toggle`, { method: "PATCH", headers: getAuthHeaders() });
      const updated = await res.json();
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: updated.enabled } : r));
    } catch {
      toast({ title: "Failed to toggle rule", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  }

  const typeInfo = (type: RuleType) => RULE_TYPES.find(t => t.value === type);

  const typeBadgeColor: Record<RuleType, string> = {
    flat: "bg-blue-100 text-blue-700",
    amount: "bg-green-100 text-green-700",
    weight: "bg-orange-100 text-orange-700",
    product: "bg-purple-100 text-purple-700",
    category: "bg-pink-100 text-pink-700",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 rounded-xl">
            <Truck className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Shipping Rules</h1>
            <p className="text-sm text-gray-500">Configure dynamic shipping fees for your store</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Add Rule
        </Button>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl overflow-hidden">
        <button
          onClick={() => setExpandedHelp(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-blue-800 hover:bg-blue-100/50 transition-colors"
        >
          <span className="flex items-center gap-2"><Info className="w-4 h-4" /> How shipping rules work</span>
          {expandedHelp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {expandedHelp && (
          <div className="px-4 pb-4 text-sm text-blue-800 space-y-2">
            <p>Rules are evaluated in <strong>priority order</strong> (lower number = checked first). The first matching rule wins.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {RULE_TYPES.map(t => (
                <div key={t.value} className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-blue-100">
                  <span className="mt-0.5 text-blue-600">{t.icon}</span>
                  <div>
                    <p className="font-semibold">{t.label}</p>
                    <p className="text-xs text-blue-600">{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-blue-600 mt-2">
              Set <strong>price = 0</strong> for free shipping. Cities field is optional — leave blank to apply to all cities.
            </p>
          </div>
        )}
      </div>

      {/* Rules table */}
      {rules.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-12 text-center">
          <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No shipping rules yet</p>
          <p className="text-sm text-gray-400 mt-1">Click "Add Rule" to create your first shipping rule.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Rule</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Type</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Condition</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Fee</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Priority</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((rule) => (
                <tr key={rule.id} className={`hover:bg-gray-50 transition-colors ${!rule.enabled ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-gray-900">{rule.name}</p>
                      <p className="text-xs text-gray-400">{rule.methodName} · {rule.deliveryTime}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold ${typeBadgeColor[rule.type]}`}>
                      {typeInfo(rule.type)?.icon}
                      {typeInfo(rule.type)?.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-500">
                    {(rule.type === "weight" || rule.type === "amount") && (
                      <span>
                        {rule.minValue ?? "0"} – {rule.maxValue ?? "∞"}
                        {rule.type === "weight" ? " g" : " Rs."}
                      </span>
                    )}
                    {rule.type === "product" && (
                      <span>{(rule.productIds as number[]).length} product(s)</span>
                    )}
                    {rule.type === "category" && (
                      <span>{(rule.categoryIds as number[]).length} categor{(rule.categoryIds as number[]).length === 1 ? "y" : "ies"}</span>
                    )}
                    {rule.type === "flat" && <span className="italic text-gray-400">Always applies</span>}
                    {(rule.cities as string[]).length > 0 && (
                      <span className="ml-2 text-blue-500">· {(rule.cities as string[]).join(", ")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {Number(rule.price) === 0 ? (
                      <span className="font-bold text-green-600">FREE</span>
                    ) : (
                      <span className="font-bold text-gray-900">Rs. {Number(rule.price).toLocaleString()}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded">#{rule.priority}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggle(rule.id)}
                      disabled={togglingId === rule.id}
                      className="focus:outline-none"
                    >
                      {togglingId === rule.id ? (
                        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                      ) : rule.enabled ? (
                        <ToggleRight className="w-6 h-6 text-green-500" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-gray-300" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(rule)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        disabled={deletingId === rule.id}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        {deletingId === rule.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-lg text-gray-900">
                {editingId ? "Edit Shipping Rule" : "New Shipping Rule"}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Rule Name */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Rule Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Free Delivery above 2000"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Rule Type */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-2 block">Rule Type *</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {RULE_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, type: t.value as RuleType }))}
                      className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-all ${
                        form.type === t.value ? "border-blue-500 bg-blue-50" : "border-gray-100 hover:border-gray-300"
                      }`}
                    >
                      <span className={form.type === t.value ? "text-blue-600" : "text-gray-400"}>{t.icon}</span>
                      <span className="text-xs font-semibold text-gray-800">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Condition: weight/amount range */}
              {(form.type === "weight" || form.type === "amount") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">
                      Min {form.type === "weight" ? "Weight (g)" : "Amount (Rs.)"}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.minValue}
                      onChange={e => setForm(f => ({ ...f, minValue: e.target.value }))}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">
                      Max {form.type === "weight" ? "Weight (g)" : "Amount (Rs.)"} (blank = unlimited)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.maxValue}
                      onChange={e => setForm(f => ({ ...f, maxValue: e.target.value }))}
                      placeholder="Unlimited"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              )}

              {/* Product IDs */}
              {form.type === "product" && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Product IDs (comma-separated)</label>
                  <input
                    type="text"
                    value={form.productIds}
                    onChange={e => setForm(f => ({ ...f, productIds: e.target.value }))}
                    placeholder="e.g. 12, 45, 67"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <p className="text-xs text-gray-400 mt-1">Find product IDs in the Products page.</p>
                </div>
              )}

              {/* Category IDs */}
              {form.type === "category" && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-2 block">Categories</label>
                  {categories.length === 0 ? (
                    <p className="text-sm text-gray-400">No categories found.</p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
                      {categories.map(cat => (
                        <label key={cat.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.categoryIds.includes(cat.id)}
                            onChange={e => setForm(f => ({
                              ...f,
                              categoryIds: e.target.checked
                                ? [...f.categoryIds, cat.id]
                                : f.categoryIds.filter(id => id !== cat.id),
                            }))}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-700">{cat.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Shipping Fee */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Shipping Fee (Rs.) — set 0 for free</label>
                <input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="150"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Method Name + Delivery Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Method Name</label>
                  <input
                    type="text"
                    value={form.methodName}
                    onChange={e => setForm(f => ({ ...f, methodName: e.target.value }))}
                    placeholder="Standard Delivery"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Delivery Time</label>
                  <input
                    type="text"
                    value={form.deliveryTime}
                    onChange={e => setForm(f => ({ ...f, deliveryTime: e.target.value }))}
                    placeholder="2–3 business days"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {/* Priority + Cities */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Priority (lower = checked first)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    placeholder="10"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Cities (blank = all)</label>
                  <input
                    type="text"
                    value={form.cities}
                    onChange={e => setForm(f => ({ ...f, cities: e.target.value }))}
                    placeholder="Karachi, Lahore"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {/* Enabled */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${form.enabled ? "bg-green-500" : "bg-gray-300"}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.enabled ? "translate-x-4" : "translate-x-0"}`} />
                </div>
                <span className="text-sm font-medium text-gray-700">{form.enabled ? "Enabled" : "Disabled"}</span>
              </label>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)} disabled={saving}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? "Save Changes" : "Create Rule"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
