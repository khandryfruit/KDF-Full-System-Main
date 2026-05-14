import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Package, Plus, Search, Edit2, Trash2, X, Save, Loader2,
  AlertTriangle, CheckCircle, TrendingDown, ChevronDown,
  SlidersHorizontal, Download, RefreshCw, Store, ExternalLink,
} from "lucide-react";
import { apiPublicUrl } from "@/lib/apiBase";

interface Product {
  id: number;
  branchId: number | null;
  itemCode: string;
  name: string;
  unit: string;
  category: string | null;
  purchasePrice: string | null;
  salePrice: string | null;
  stockQty: string;
  lowStockThreshold: string | null;
  isActive: boolean;
  barcode: string | null;
  description: string | null;
  createdAt: string;
  source?: "branch" | "shopify";
  shopifyProductId?: string;
}

const UNITS = ["KG", "Gram", "Pcs", "Box", "Packet", "Dozen", "Litre", "ML"];

const EMPTY: Partial<Product> & Record<string, any> = {
  itemCode: "", name: "", unit: "KG", category: "",
  purchasePrice: "", salePrice: "", stockQty: "0",
  lowStockThreshold: "1", barcode: "", description: "", branchId: null, isActive: true,
};

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem("kdf_admin_token")}` };
}

function stockColor(qty: number, threshold: number) {
  if (qty <= 0)         return "text-red-600 bg-red-50";
  if (qty <= threshold) return "text-amber-600 bg-amber-50";
  return "text-emerald-600 bg-emerald-50";
}

export default function StockProductsPage() {
  const { toast } = useToast();
  const [products, setProducts]  = useState<Product[]>([]);
  const [total, setTotal]        = useState(0);
  const [loading, setLoading]    = useState(true);
  const [q, setQ]                = useState("");
  const [page, setPage]          = useState(1);
  const [lowStockOnly, setLow]   = useState(false);
  const [modal, setModal]        = useState<"add" | "edit" | "adjust" | "import" | null>(null);
  const [selected, setSelected]  = useState<Partial<Product> & Record<string, any>>(EMPTY);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustType, setAdjustType] = useState<"in" | "out" | "adjustment">("in");
  const [adjustNote, setAdjustNote] = useState("");
  const [saving, setSaving]      = useState(false);
  const [importing, setImporting] = useState(false);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT), q });
      if (lowStockOnly) params.set("lowStock", "1");
      const res = await fetch(apiPublicUrl(`/api/admin/stock/products?${params}`), { headers: authHeader() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed to load products", description: err.error ?? `HTTP ${res.status}`, variant: "destructive" });
        setProducts([]); setTotal(0);
        return;
      }
      const data = await res.json();
      setProducts(data.products ?? []);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [page, q, lowStockOnly]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, lowStockOnly]);

  async function saveProduct() {
    setSaving(true);
    try {
      const isEdit = modal === "edit" && selected.id;
      const url  = isEdit ? apiPublicUrl(`/api/admin/stock/products/${selected.id}`) : apiPublicUrl("/api/admin/stock/products");
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(selected),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: isEdit ? "Product updated" : "Product added", description: selected.name });
      setModal(null);
      load();
    } catch {
      toast({ title: "Error", description: "Could not save product", variant: "destructive" });
    }
    setSaving(false);
  }

  async function deleteProduct(id: number) {
    if (!confirm("Mark this product as inactive?")) return;
    await fetch(apiPublicUrl(`/api/admin/stock/products/${id}`), { method: "DELETE", headers: authHeader() });
    load();
  }

  async function saveAdjust() {
    if (!adjustQty || !selected.id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/stock/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ productId: selected.id, type: adjustType, qty: parseFloat(adjustQty), notes: adjustNote }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      toast({ title: "Stock adjusted", description: `New balance: ${data.balanceAfter} ${selected.unit}` });
      setModal(null);
      setAdjustQty(""); setAdjustNote("");
      load();
    } catch {
      toast({ title: "Error", description: "Could not adjust stock", variant: "destructive" });
    }
    setSaving(false);
  }

  function openAdd()  { setSelected({ ...EMPTY }); setModal("add"); }
  function openEdit(p: Product) { setSelected({ ...p }); setModal("edit"); }
  function openAdj(p: Product)  { setSelected(p); setAdjustType("in"); setAdjustQty(""); setAdjustNote(""); setModal("adjust"); }

  async function importFromShopify() {
    setImporting(true);
    try {
      const res = await fetch("/api/admin/stock/import-shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      toast({ title: "Import Successful!", description: data.message });
      setModal(null);
      load();
    } catch (e: any) {
      toast({ title: "Import Failed", description: e.message, variant: "destructive" });
    }
    setImporting(false);
  }

  const totalPages = Math.ceil(total / LIMIT);
  const branchOnly = products.filter(p => p.source !== "shopify");
  const lowStock = branchOnly.filter(p => parseFloat(p.stockQty) <= parseFloat(p.lowStockThreshold ?? "1"));

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="w-6 h-6" /> Products & Stock</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your product catalogue and inventory levels</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg hover:bg-muted"><Loader2 className={`w-4 h-4 ${loading ? "animate-spin" : ""} text-muted-foreground`} /></button>
          <button onClick={() => setModal("import")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors">
            <Store className="w-4 h-4" /> Import from Shopify
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Products", value: total, icon: Package, color: "text-blue-600 bg-blue-50" },
            { label: "Branch Stock",   value: branchOnly.length, icon: CheckCircle, color: "text-indigo-600 bg-indigo-50" },
            { label: "From Shopify",   value: products.filter(p => p.source === "shopify").length, icon: Store, color: "text-emerald-600 bg-emerald-50" },
            { label: "Low Stock",      value: lowStock.length, icon: TrendingDown, color: "text-amber-600 bg-amber-50" },
            { label: "Out of Stock",   value: branchOnly.filter(p => parseFloat(p.stockQty) <= 0).length, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-3.5 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.color}`}>
                <s.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="font-bold text-lg leading-none">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search by name, item code, barcode…"
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
        </div>
        <button
          onClick={() => setLow(l => !l)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${lowStockOnly ? "bg-amber-50 border-amber-300 text-amber-700" : "border-border hover:bg-muted"}`}
        >
          <TrendingDown className="w-3.5 h-3.5" /> Low Stock Only
        </button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {["Item Code", "Product Name", "Category", "Unit", "Purchase Price", "Sale Price", "Stock Qty", "Status", "Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-16 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading products…
                </td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={9} className="py-16 text-center text-muted-foreground">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No products found</p>
                  <p className="text-xs mt-1">Click "Add Product" to create your first product</p>
                </td></tr>
              ) : products.map(p => {
                const qty = parseFloat(p.stockQty);
                const thresh = parseFloat(p.lowStockThreshold ?? "1");
                const isShopify = p.source === "shopify";
                return (
                  <tr key={p.id} className={`border-b border-border hover:bg-muted/30 transition-colors ${isShopify ? "bg-emerald-50/30" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">
                      {p.itemCode}
                      {isShopify && <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700"><Store className="w-2.5 h-2.5" />Shopify</span>}
                    </td>
                    <td className="px-4 py-3 font-medium">{p.name}
                      {p.barcode && !isShopify && <span className="ml-1.5 text-xs text-muted-foreground">#{p.barcode}</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.category ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.unit}</td>
                    <td className="px-4 py-3">
                      {p.purchasePrice ? <span className="font-mono">Rs {parseFloat(p.purchasePrice).toLocaleString()}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {p.salePrice ? <span className="font-mono font-semibold">Rs {parseFloat(p.salePrice).toLocaleString()}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${isShopify ? "text-emerald-600 bg-emerald-50" : stockColor(qty, thresh)}`}>
                        {isShopify ? `${qty} pcs` : `${qty} ${p.unit}`}
                        {!isShopify && qty <= 0 && " ⚠"}
                        {!isShopify && qty > 0 && qty <= thresh && " ↓"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${isShopify ? "bg-emerald-100 text-emerald-700" : p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        {isShopify ? "Shopify" : p.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {!isShopify && (
                          <>
                            <button title="Adjust stock" onClick={() => openAdj(p)}
                              className="p-1.5 rounded-lg hover:bg-amber-50 hover:text-amber-600 transition-colors">
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                            </button>
                            <button title="Edit" onClick={() => openEdit(p)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button title="Delete" onClick={() => deleteProduct(p.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {isShopify && (
                          <span className="text-[10px] text-emerald-600 font-medium">Auto-synced</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground">Showing {((page-1)*LIMIT)+1}–{Math.min(page*LIMIT, total)} of {total}</p>
            <div className="flex items-center gap-1">
              {[...Array(totalPages)].map((_, i) => (
                <button key={i} onClick={() => setPage(i+1)}
                  className={`w-7 h-7 text-xs rounded-lg ${page === i+1 ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {i+1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Import from Shopify Modal ── */}
      {modal === "import" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <Store className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h2 className="font-bold">Import from Shopify</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">313 Shopify products found</p>
                </div>
              </div>
              <button onClick={() => setModal(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-sm font-medium text-emerald-800 mb-1">What will happen:</p>
                <ul className="text-sm text-emerald-700 space-y-1 list-disc list-inside">
                  <li>All active Shopify products will be imported</li>
                  <li>Existing products (same name) will be skipped</li>
                  <li>Products will appear in Branch POS search</li>
                  <li>Stock can be adjusted after import</li>
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">
                After import, Shopify products will be permanently in your branch stock catalogue and searchable in the POS system.
              </p>
            </div>
            <div className="flex items-center gap-3 p-5 border-t border-border">
              <button onClick={importFromShopify} disabled={importing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                {importing ? "Importing…" : "Import All Products"}
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      {(modal === "add" || modal === "edit") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card">
              <h2 className="font-bold text-lg">{modal === "add" ? "Add New Product" : "Edit Product"}</h2>
              <button onClick={() => setModal(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              {[
                { label: "Item Code *",    key: "itemCode",    type: "text",   placeholder: "e.g. KDF-001"   },
                { label: "Product Name *", key: "name",        type: "text",   placeholder: "e.g. Almonds"   },
                { label: "Barcode",        key: "barcode",     type: "text",   placeholder: "Scan or type"   },
                { label: "Category",       key: "category",    type: "text",   placeholder: "e.g. Nuts, Dry Fruits" },
                { label: "Purchase Price (Rs)", key: "purchasePrice", type: "number", placeholder: "0" },
                { label: "Sale Price (Rs)",     key: "salePrice",     type: "number", placeholder: "0" },
                { label: "Opening Stock",  key: "stockQty",    type: "number", placeholder: "0"              },
                { label: "Low Stock Alert (qty)", key: "lowStockThreshold", type: "number", placeholder: "1" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">{f.label}</label>
                  <input
                    type={f.type} placeholder={f.placeholder}
                    value={selected[f.key] ?? ""}
                    onChange={e => setSelected(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Unit</label>
                <select value={selected.unit ?? "KG"} onChange={e => setSelected(p => ({ ...p, unit: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Description</label>
                <textarea rows={2} placeholder="Optional product description"
                  value={selected.description ?? ""}
                  onChange={e => setSelected(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 p-5 border-t border-border">
              <button onClick={saveProduct} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {modal === "add" ? "Add Product" : "Save Changes"}
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stock Adjustment Modal ── */}
      {modal === "adjust" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="font-bold">Adjust Stock</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{selected.name} — Current: {selected.stockQty} {selected.unit}</p>
              </div>
              <button onClick={() => setModal(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Adjustment Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["in", "out", "adjustment"] as const).map(t => (
                    <button key={t} onClick={() => setAdjustType(t)}
                      className={`py-2 rounded-xl text-sm font-medium border transition-colors ${adjustType === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                      {t === "in" ? "📦 Stock In" : t === "out" ? "📤 Stock Out" : "✏️ Set Exact"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                  {adjustType === "adjustment" ? "New Exact Quantity" : "Quantity"} ({selected.unit})
                </label>
                <input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)}
                  placeholder="0"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Notes (optional)</label>
                <input type="text" value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
                  placeholder="Reason for adjustment"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 p-5 border-t border-border">
              <button onClick={saveAdjust} disabled={saving || !adjustQty}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <SlidersHorizontal className="w-4 h-4" />}
                Apply Adjustment
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
