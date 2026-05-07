import { FileBarChart, Download, TrendingUp, Package, Building2, Receipt, Factory, DollarSign } from "lucide-react";

const REPORT_CARDS = [
  { title: "Sales Report",      desc: "Daily, weekly, monthly sales breakdown with trends",             icon: TrendingUp,   color: "bg-blue-50 text-blue-600",    href: "/reports/sales"      },
  { title: "Profit Report",     desc: "Gross profit, net profit, margin analysis per product/branch",  icon: DollarSign,   color: "bg-emerald-50 text-emerald-600", href: "/reports/profit"   },
  { title: "Inventory Report",  desc: "Stock levels, movement history, valuation summary",             icon: Package,      color: "bg-amber-50 text-amber-600",  href: "/reports/inventory"  },
  { title: "Branch Report",     desc: "Per-branch performance: revenue, orders, riders",               icon: Building2,    color: "bg-purple-50 text-purple-600", href: "/reports/branches"  },
  { title: "Invoice Report",    desc: "All invoices, returns, refunds and outstanding dues",           icon: Receipt,      color: "bg-orange-50 text-orange-600", href: "/reports/invoices"  },
  { title: "Expense Report",    desc: "Category-wise expense breakdown and P&L summary",              icon: FileBarChart, color: "bg-red-50 text-red-600",      href: "/reports/expenses"   },
  { title: "Supplier Report",   desc: "Purchase history, payments due, supplier performance",          icon: Factory,      color: "bg-teal-50 text-teal-600",    href: "/reports/suppliers"  },
];

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Enterprise-grade reports — export to PDF, Excel or CSV</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-accent transition-colors">
          <Download className="w-4 h-4" />
          Export All
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORT_CARDS.map(({ title, desc, icon: Icon, color }) => (
          <div
            key={title}
            className="bg-card border border-border rounded-2xl p-5 flex gap-4 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all group"
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
              <div className="flex gap-2 mt-3">
                {["PDF", "Excel", "CSV"].map(f => (
                  <span key={f} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">{f}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-muted/30 border border-border rounded-2xl p-6 text-center">
        <FileBarChart className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-semibold text-muted-foreground">Full Report Generation — Phase 2</p>
        <p className="text-sm text-muted-foreground/70 mt-1">Click any report card above to generate and download. Data engine connects in Phase 2.</p>
      </div>
    </div>
  );
}
