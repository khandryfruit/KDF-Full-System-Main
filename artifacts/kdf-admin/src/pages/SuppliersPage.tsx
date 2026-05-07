import { Construction, Factory } from "lucide-react";

export default function SuppliersPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Suppliers</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage supplier ledgers, due payments and purchase analytics</p>
      </div>
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center">
          <Factory className="w-8 h-8 text-teal-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Supplier Management — Phase 2</h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-md">Supplier ledgers, purchase history, due payment tracking and supplier analytics.</p>
        </div>
      </div>
    </div>
  );
}
