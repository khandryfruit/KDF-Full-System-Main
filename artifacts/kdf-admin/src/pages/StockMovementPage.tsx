import { useState, useEffect, useCallback } from "react";
import { ArrowRightLeft, ArrowDownCircle, ArrowUpCircle, SlidersHorizontal, Loader2, RefreshCw } from "lucide-react";

interface Movement {
  id: number;
  productId: number;
  type: string;
  qty: string;
  balanceBefore: string | null;
  balanceAfter: string | null;
  reference: string | null;
  referenceType: string | null;
  notes: string | null;
  createdAt: string;
}

interface Product {
  id: number; name: string; itemCode: string; unit: string;
}

const TYPE_STYLE: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  in:         { color: "text-emerald-600 bg-emerald-50", icon: ArrowDownCircle, label: "Stock In"    },
  out:        { color: "text-red-600 bg-red-50",         icon: ArrowUpCircle,   label: "Stock Out"   },
  adjustment: { color: "text-blue-600 bg-blue-50",       icon: SlidersHorizontal, label: "Adjustment" },
  return:     { color: "text-amber-600 bg-amber-50",     icon: ArrowDownCircle, label: "Return"      },
  transfer:   { color: "text-purple-600 bg-purple-50",   icon: ArrowRightLeft,  label: "Transfer"    },
};

export default function StockMovementPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [products,  setProducts]  = useState<Product[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("kdf_admin_token");
      const headers = { Authorization: `Bearer ${token}` };
      const [mvRes, prRes] = await Promise.all([
        fetch("/api/admin/stock/movements?limit=100", { headers }),
        fetch("/api/admin/stock/products?limit=200",  { headers }),
      ]);
      if (mvRes.ok) setMovements(await mvRes.json());
      if (prRes.ok) { const d = await prRes.json(); setProducts(d.products ?? []); }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  const filtered = filter ? movements.filter(m => m.type === filter) : movements;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6" /> Stock Movement Log
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Every inventory in/out/adjustment with full audit trail</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-muted">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Type filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setFilter("")}
          className={`px-3 py-1.5 rounded-xl text-sm border transition-colors ${!filter ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
          All
        </button>
        {Object.entries(TYPE_STYLE).map(([type, s]) => (
          <button key={type} onClick={() => setFilter(type)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition-colors ${filter === type ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
            <s.icon className="w-3.5 h-3.5" /> {s.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {["Date", "Product", "Type", "Qty", "Before", "After", "Reference", "Notes"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-16 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading movements…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-muted-foreground">
                  <ArrowRightLeft className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No movements recorded yet</p>
                  <p className="text-xs mt-1">Stock movements appear here as invoices are created and adjustments are made</p>
                </td></tr>
              ) : filtered.map(m => {
                const prod = productMap[m.productId];
                const style = TYPE_STYLE[m.type] ?? TYPE_STYLE.adjustment;
                const Icon = style.icon;
                const date = new Date(m.createdAt);
                return (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {date.toLocaleDateString("en-PK")}<br />
                      <span className="text-[10px]">{date.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}</span>
                    </td>
                    <td className="px-4 py-3">
                      {prod ? (
                        <>
                          <p className="font-medium">{prod.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{prod.itemCode}</p>
                        </>
                      ) : <span className="text-muted-foreground">#{m.productId}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold w-fit ${style.color}`}>
                        <Icon className="w-3 h-3" /> {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold font-mono">
                      {m.type === "out" ? "-" : "+"}{parseFloat(m.qty)} {prod?.unit ?? ""}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{m.balanceBefore ?? "—"}</td>
                    <td className="px-4 py-3 font-mono font-semibold">{m.balanceAfter ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {m.reference ? <span className="font-mono text-primary">{m.reference}</span> : <span className="text-muted-foreground">—</span>}
                      {m.referenceType && <span className="ml-1 text-muted-foreground">({m.referenceType})</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate">{m.notes ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
