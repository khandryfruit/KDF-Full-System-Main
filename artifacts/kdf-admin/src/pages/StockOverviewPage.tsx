import { useState, useEffect, useCallback } from "react";
import { Package, TrendingDown, AlertTriangle, BarChart3, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface Overview {
  total: number;
  active: number;
  lowStock: number;
  outStock: number;
  stockVal: number;
}

interface Product {
  id: number; itemCode: string; name: string; unit: string;
  stockQty: string; lowStockThreshold: string | null; salePrice: string | null;
}

export default function StockOverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [lowItems, setLowItems] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("kdf_admin_token");
      const headers = { Authorization: `Bearer ${token}` };
      const [ovRes, lowRes] = await Promise.all([
        fetch("/api/admin/stock/overview",               { headers }),
        fetch("/api/admin/stock/products?lowStock=1&limit=10", { headers }),
      ]);
      if (ovRes.ok)  setOverview(await ovRes.json());
      if (lowRes.ok) { const d = await lowRes.json(); setLowItems(d.products ?? []); }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="p-6 flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stock Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time inventory levels across all branches</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Products",  value: overview?.total    ?? 0, icon: Package,       color: "bg-blue-50 text-blue-600"    },
          { label: "Low Stock",       value: overview?.lowStock ?? 0, icon: TrendingDown,  color: "bg-amber-50 text-amber-600"  },
          { label: "Out of Stock",    value: overview?.outStock ?? 0, icon: AlertTriangle, color: "bg-red-50 text-red-600"      },
          { label: "Stock Value (Rs)",value: overview ? `${parseFloat(String(overview.stockVal)).toLocaleString()}` : "0", icon: BarChart3, color: "bg-emerald-50 text-emerald-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-bold text-lg leading-none">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Low stock items */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-amber-500" /> Low Stock Alert
          </h2>
          <Link href="/stock/products" className="text-xs text-primary hover:underline flex items-center gap-1">
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {lowItems.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">All products are well-stocked!</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                {["Item Code", "Product", "Unit", "Current Stock", "Threshold"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lowItems.map(p => {
                const qty    = parseFloat(p.stockQty);
                const thresh = parseFloat(p.lowStockThreshold ?? "1");
                const isOut  = qty <= 0;
                return (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-primary">{p.itemCode}</td>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.unit}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${isOut ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {qty} {p.unit} {isOut ? "⛔ Out" : "⚠ Low"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{thresh} {p.unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { href: "/stock/products",   label: "Manage Products",    desc: "Add, edit, delete products",    icon: Package,         color: "text-blue-600 bg-blue-50"    },
          { href: "/stock/movement",   label: "Stock Movement Log", desc: "Track all in/out transactions", icon: BarChart3,       color: "text-purple-600 bg-purple-50" },
          { href: "/stock/adjustment", label: "Stock Adjustment",   desc: "Manual stock corrections",      icon: AlertTriangle,   color: "text-amber-600 bg-amber-50"  },
        ].map(({ href, label, desc, icon: Icon, color }) => (
          <Link key={href} href={href}>
            <div className="bg-card border border-border rounded-2xl p-4 hover:shadow-md transition-shadow cursor-pointer group">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="font-semibold text-sm group-hover:text-primary transition-colors">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
