import { Construction, Receipt } from "lucide-react";

export default function ExpensesPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Expense Tracking</h1>
        <p className="text-muted-foreground text-sm mt-1">Track business expenses, salaries, utilities and overheads</p>
      </div>
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
          <Receipt className="w-8 h-8 text-red-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Expense Management — Phase 2</h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-md">Categorized expense tracking, recurring expenses, and P&amp;L impact analysis.</p>
        </div>
      </div>
    </div>
  );
}
