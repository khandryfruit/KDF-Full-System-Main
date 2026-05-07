import { Construction, TrendingUp } from "lucide-react";

export default function CashFlowPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cash Flow</h1>
        <p className="text-muted-foreground text-sm mt-1">Daily cash in/out, bank accounts and payment reconciliation</p>
      </div>
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
          <TrendingUp className="w-8 h-8 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Cash & Bank Module — Phase 2</h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-md">Cash register, bank account management, daily closing reports and payment reconciliation across Cash, Card, Easypaisa, JazzCash.</p>
        </div>
      </div>
    </div>
  );
}
