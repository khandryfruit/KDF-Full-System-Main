import { useState, useEffect, useCallback } from "react";
import { SlidersHorizontal, Search, Loader2, CheckCircle, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Product {
  id: number; itemCode: string; name: string; unit: string;
  stockQty: string; lowStockThreshold: string | null;
}

export default function StockAdjustmentPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [q,        setQ]        = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [type,     setType]     = useState<"in" | "out" | "adjustment">("in");
  const [qty,      setQty]      = useState("");
  const [notes,    setNotes]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [done,     setDone]     = useState(false);

  const search = useCallback(async () => {
    if (!q.trim()) { setProducts([]); return; }
    setLoading(true);
    try {
      const token = localStorage.getItem("kdf_admin_token");
      const res = await fetch(`/api/admin/stock/products?q=${encodeURIComponent(q)}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { const d = await res.json(); setProducts(d.products ?? []); }
    } catch {}
    setLoading(false);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(search, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function apply() {
    if (!selected || !qty) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("kdf_admin_token");
      const res = await fetch("/api/admin/stock/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId: selected.id, type, qty: parseFloat(qty), notes }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setDone(true);
      toast({ title: "Adjustment applied", description: `${selected.name}: new balance ${data.balanceAfter} ${selected.unit}` });
      setTimeout(() => {
        setSelected(null); setQ(""); setQty(""); setNotes(""); setProducts([]); setDone(false);
      }, 2000);
    } catch {
      toast({ title: "Error", description: "Could not apply adjustment", variant: "destructive" });
    }
    setSaving(false);
  }

  const currentQty = selected ? parseFloat(selected.stockQty) : 0;
  const newQty = qty
    ? type === "in"         ? currentQty + parseFloat(qty)
    : type === "out"        ? currentQty - parseFloat(qty)
    : parseFloat(qty)
    : null;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SlidersHorizontal className="w-6 h-6" /> Stock Adjustment
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Add, remove, or set exact stock levels for any product</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
        {/* Step 1: Search product */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
            1. Search Product
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" value={q} onChange={e => { setQ(e.target.value); setSelected(null); }}
              placeholder="Type product name, item code, or barcode…"
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {loading && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Searching…</p>}
          {products.length > 0 && !selected && (
            <div className="mt-1.5 border border-border rounded-xl overflow-hidden bg-background shadow-lg">
              {products.map(p => (
                <button key={p.id} onClick={() => { setSelected(p); setProducts([]); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted transition-colors border-b border-border last:border-0">
                  <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Code: {p.itemCode} · Stock: {p.stockQty} {p.unit}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div className="mt-2 flex items-center justify-between px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
              <div>
                <p className="text-sm font-semibold">{selected.name}</p>
                <p className="text-xs text-muted-foreground">
                  Code: {selected.itemCode} · Current Stock: <strong>{selected.stockQty} {selected.unit}</strong>
                </p>
              </div>
              <button onClick={() => { setSelected(null); setQ(""); }}
                className="text-xs text-muted-foreground hover:text-foreground">Change</button>
            </div>
          )}
        </div>

        {selected && (
          <>
            {/* Step 2: Type */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                2. Adjustment Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "in",         label: "📦 Stock In",   desc: "Add to current stock"   },
                  { value: "out",        label: "📤 Stock Out",  desc: "Remove from stock"       },
                  { value: "adjustment", label: "✏️ Set Exact",  desc: "Set a fixed quantity"    },
                ] as const).map(t => (
                  <button key={t.value} onClick={() => setType(t.value)}
                    className={`py-2.5 px-3 rounded-xl text-sm border transition-colors text-left ${type === t.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                    <p className="font-medium">{t.label}</p>
                    <p className={`text-[10px] mt-0.5 ${type === t.value ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Qty */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                3. Quantity ({selected.unit})
                {newQty !== null && (
                  <span className="ml-2 font-normal normal-case text-emerald-600">→ New balance: {newQty.toFixed(3)} {selected.unit}</span>
                )}
              </label>
              <input type="number" value={qty} onChange={e => setQty(e.target.value)}
                placeholder="Enter quantity"
                min="0"
                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                Notes / Reason (optional)
              </label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Monthly count correction, damage write-off…"
                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Apply */}
            <div className="pt-2 border-t border-border">
              <button onClick={apply} disabled={saving || !qty || done}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
                {done
                  ? <><CheckCircle className="w-4 h-4" /> Applied!</>
                  : saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Applying…</>
                  : <><SlidersHorizontal className="w-4 h-4" /> Apply Adjustment</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
