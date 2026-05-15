import { useEffect, useState } from "react";
import { BarChart3, Package, TrendingUp, Wallet, Loader2 } from "lucide-react";
import { erpFetch } from "@/lib/adminErpApi";
import { Link } from "wouter";

export default function ErpReportsPage() {
  const [data, setData] = useState<any>(null);
  const [valuation, setValuation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      erpFetch("/reports/overview"),
      erpFetch("/reports/stock-valuation"),
    ]).then(([o, v]) => {
      setData(o);
      setValuation(v);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <BarChart3 className="w-7 h-7" /> ERP Reports
      </h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Stock valuation", value: data?.stockValuation, icon: Package, fmt: true },
          { label: "Purchases (month)", value: data?.purchasesThisMonth, icon: TrendingUp, fmt: true },
          { label: "Supplier outstanding", value: data?.supplierOutstanding, icon: Wallet, fmt: true },
          { label: "Active SKUs", value: data?.activeSkus, icon: Package, fmt: false },
        ].map(card => (
          <div key={card.label} className="border rounded-xl p-4 bg-card">
            <card.icon className="w-5 h-5 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-xl font-bold mt-1">
              {card.fmt ? `Rs.${Number(card.value ?? 0).toLocaleString("en-PK")}` : card.value}
            </p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="font-semibold mb-2">Low stock alerts</h2>
        <ul className="text-sm space-y-1">
          {(data?.lowStock ?? []).map((p: any) => (
            <li key={p.id} className="flex justify-between border-b py-2">
              <span>{p.name}</span>
              <span className="text-red-600">{p.stockQty} left</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="font-semibold mb-2">Stock valuation (top items)</h2>
        <div className="border rounded-xl overflow-hidden text-sm max-h-80 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2">Product</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Avg cost</th>
                <th className="text-right p-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {(valuation?.rows ?? []).slice(0, 50).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-right">{r.stockQty}</td>
                  <td className="p-2 text-right">{r.avgCost ?? r.purchasePrice}</td>
                  <td className="p-2 text-right">{Number(r.value).toLocaleString("en-PK")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground mt-2">Total: Rs.{Number(valuation?.total ?? 0).toLocaleString("en-PK")}</p>
      </div>

      <p className="text-xs text-muted-foreground">
        Full P&L and GL — Phase 2. Use <Link href="/erp/suppliers" className="text-primary underline">Suppliers</Link> for ledgers.
      </p>
    </div>
  );
}
