import { Construction, Package, TrendingDown, AlertTriangle, BarChart3 } from "lucide-react";

export default function StockOverviewPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">Real-time inventory levels across all branches</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Products", value: "—", icon: Package, color: "bg-blue-50 text-blue-600" },
          { label: "Low Stock", value: "—", icon: TrendingDown, color: "bg-amber-50 text-amber-600" },
          { label: "Out of Stock", value: "—", icon: AlertTriangle, color: "bg-red-50 text-red-600" },
          { label: "Stock Value", value: "—", icon: BarChart3, color: "bg-emerald-50 text-emerald-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-bold text-lg">{value}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <Construction className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Full Stock Module — Phase 2</h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-md">Complete inventory management with stock movement, adjustments, and multi-warehouse support coming in Phase 2.</p>
        </div>
      </div>
    </div>
  );
}
