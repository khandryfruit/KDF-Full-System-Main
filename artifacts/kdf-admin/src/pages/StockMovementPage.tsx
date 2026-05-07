import { Construction, ArrowRightLeft } from "lucide-react";

export default function StockMovementPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock Movement</h1>
        <p className="text-muted-foreground text-sm mt-1">Track every inventory in/out transaction</p>
      </div>
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
          <ArrowRightLeft className="w-8 h-8 text-blue-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Stock Movement Log — Phase 2</h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-md">Every stock-in, stock-out, transfer, damage and adjustment will be logged here with full audit trail.</p>
        </div>
      </div>
    </div>
  );
}
