import { Construction, SlidersHorizontal } from "lucide-react";

export default function StockAdjustmentPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock Adjustment</h1>
        <p className="text-muted-foreground text-sm mt-1">Add, remove, damage or manually correct stock levels</p>
      </div>
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center">
          <SlidersHorizontal className="w-8 h-8 text-amber-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Stock Adjustment — Phase 2</h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-md">Manual stock corrections, damage write-offs, and adjustment entries with manager approval workflow.</p>
        </div>
      </div>
    </div>
  );
}
