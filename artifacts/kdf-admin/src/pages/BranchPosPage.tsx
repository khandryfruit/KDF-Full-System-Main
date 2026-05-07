import {
  useState, useEffect, useRef, useCallback, type KeyboardEvent,
} from "react";
import { useLocation } from "wouter";
import { useBranchAuth } from "@/context/BranchAuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Building2, LogOut, Search, Plus, Minus, Trash2, User, UserPlus,
  Receipt, Clock, Users, CheckCircle, XCircle, BarChart2,
  Package, ChevronRight, Loader2, X, Phone, MapPin, Save,
  Printer, MessageCircle, RefreshCw, Filter, TrendingUp, Wallet,
  AlertCircle, Home, Pencil, RotateCcw, ArrowLeftRight, History,
  FileEdit, ChevronDown, AlertTriangle,
} from "lucide-react";

/* ═══ helpers ═══ */
const fmtRs = (n: number) => `Rs ${Number(n).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function branchFetch(path: string, token: string, opts?: RequestInit) {
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  }).then(async r => {
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? `HTTP ${r.status}`); }
    return r.json();
  });
}

/* ═══ Types ═══ */
interface Customer { id: number; name: string; phone: string; email?: string; address?: string; totalOrders: number; totalSpent: string; }
interface InvoiceItem { id: string; name: string; sku: string; pricePerKg: number; sellingMode: "grams" | "kg" | "amount" | "box" | "custom"; inputValue: number; gramsPerBox: number; customPrice: number; discount: number; grams: number; lineTotal: number; }
interface Invoice { id: number; invoiceNo: string; type: string; status: string; customerName?: string; customerPhone?: string; customerAddress?: string; grandTotal: string; subtotal: string; discountAmt: string; shipping: string; taxAmt: string; paymentStatus: string; paymentMethod: string; paidAmount: string; notes?: string; createdAt: string; items: any[]; }
interface Stats { today: { invoices: number; revenue: number; paid: number; unpaid: number }; month: { invoices: number; revenue: number; uniqueCustomers: number; returns: number }; }
type Tab = "pos" | "history" | "customers" | "stats";
type SellingMode = InvoiceItem["sellingMode"];

function genId() { return Math.random().toString(36).slice(2, 9); }

function computeItem(entry: Omit<InvoiceItem, "grams" | "lineTotal">): Pick<InvoiceItem, "grams" | "lineTotal"> {
  const { pricePerKg, sellingMode, inputValue, gramsPerBox, customPrice, discount } = entry;
  let grams = 0, raw = 0;
  if (sellingMode === "amount")  { grams = pricePerKg > 0 ? (inputValue / pricePerKg) * 1000 : 0; raw = inputValue; }
  if (sellingMode === "grams")   { grams = inputValue; raw = (inputValue / 1000) * pricePerKg; }
  if (sellingMode === "kg")      { grams = inputValue * 1000; raw = inputValue * pricePerKg; }
  if (sellingMode === "box")     { grams = inputValue * gramsPerBox; raw = (grams / 1000) * pricePerKg; }
  if (sellingMode === "custom")  { raw = inputValue * customPrice; }
  return { grams, lineTotal: Math.max(0, raw * (1 - discount / 100)) };
}

function weightStr(item: InvoiceItem) {
  if (item.sellingMode === "custom") return `${item.inputValue} pcs`;
  if (item.grams >= 1000) return `${(item.grams / 1000).toFixed(2).replace(/\.?0+$/, "")} KG`;
  if (item.grams > 0) return `${Math.round(item.grams)} g`;
  return "—";
}

const STATUS_COLOR: Record<string, string> = {
  paid:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  unpaid:  "bg-red-100 text-red-700 border-red-200",
  partial: "bg-amber-100 text-amber-700 border-amber-200",
};

const INV_STATUS_COLOR: Record<string, string> = {
  completed:          "bg-emerald-100 text-emerald-700 border-emerald-200",
  edited:             "bg-blue-100 text-blue-700 border-blue-200",
  draft:              "bg-gray-100 text-gray-600 border-gray-200",
  returned:           "bg-red-100 text-red-700 border-red-200",
  partially_returned: "bg-orange-100 text-orange-700 border-orange-200",
  exchanged:          "bg-purple-100 text-purple-700 border-purple-200",
  refunded:           "bg-rose-100 text-rose-700 border-rose-200",
};

const INV_STATUS_LABEL: Record<string, string> = {
  completed:          "Completed",
  edited:             "Edited",
  draft:              "Draft",
  returned:           "Returned",
  partially_returned: "Partial Ret.",
  exchanged:          "Exchanged",
  refunded:           "Refunded",
};

/* ═══ Customer Picker Sheet ═══ */
function CustomerPickerSheet({
  open, onClose, token, onPick,
}: { open: boolean; onClose: () => void; token: string; onPick: (c: Customer | null) => void; }) {
  const { toast } = useToast();
  const [q, setQ]       = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(false);
  const [adding, setAdding]       = useState(false);
  const [form, setForm]   = useState({ name: "", phone: "", address: "" });
  const [saving, setSaving] = useState(false);

  const search = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const d = await branchFetch(`/api/branch/customers?q=${encodeURIComponent(query)}`, token);
      setCustomers(d.customers ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { if (open) search(""); }, [open, search]);
  useEffect(() => { const t = setTimeout(() => search(q), 300); return () => clearTimeout(t); }, [q, search]);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.phone.trim()) { toast({ variant: "destructive", title: "Name & phone required" }); return; }
    setSaving(true);
    try {
      const d = await branchFetch("/api/branch/customers", token, { method: "POST", body: JSON.stringify(form) });
      onPick(d.customer);
      onClose();
    } catch (err: any) { toast({ variant: "destructive", title: err.message }); }
    setSaving(false);
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl p-0 overflow-hidden flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> Select Customer</SheetTitle>
        </SheetHeader>

        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or phone…" className="pl-9 h-11 text-sm" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {/* Walk-in option */}
          <button onClick={() => { onPick(null); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-dashed border-border hover:bg-accent transition-colors text-left">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0"><User className="w-5 h-5 text-muted-foreground" /></div>
            <div><p className="font-semibold text-sm">Walk-in Customer</p><p className="text-xs text-muted-foreground">No account needed</p></div>
          </button>

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : customers.map(c => (
            <button key={c.id} onClick={() => { onPick(c); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-border hover:bg-accent transition-colors text-left">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">{c.name[0]?.toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.phone}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-primary">{fmtRs(Number(c.totalSpent))}</p>
                <p className="text-[10px] text-muted-foreground">{c.totalOrders} orders</p>
              </div>
            </button>
          ))}

          {/* Add new customer */}
          <div className="border border-border rounded-2xl p-4 space-y-3 bg-muted/20">
            <button onClick={() => setAdding(v => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-primary">
              <UserPlus className="w-4 h-4" /> {adding ? "Cancel" : "Add New Customer"}
            </button>
            {adding && (
              <div className="space-y-2">
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name *" className="h-10" />
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone *" className="h-10" type="tel" />
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Address (optional)" className="h-10" />
                <Button onClick={handleAdd} disabled={saving} className="w-full h-10 font-bold">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Add Customer"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ═══ POS Tab ═══ */
function PosTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [customer, setCustomer]   = useState<Customer | null | undefined>(undefined); // undefined=not picked, null=walk-in
  const [showPicker, setShowPicker] = useState(false);
  const [items, setItems]         = useState<InvoiceItem[]>([]);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [shipping, setShipping]   = useState(0);
  const [taxRate, setTaxRate]     = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentStatus, setPaymentStatus] = useState("paid");
  const [notes, setNotes]         = useState("");
  const [saving, setSaving]       = useState(false);

  // POS entry state
  const [prodName, setProdName]   = useState("");
  const [mode, setMode]           = useState<SellingMode>("grams");
  const [value, setValue]         = useState("");
  const [rate, setRate]           = useState("");
  const [discount, setDiscount]   = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const subtotal    = items.reduce((s, i) => s + i.lineTotal, 0);
  const discountAmt = (subtotal * invoiceDiscount) / 100;
  const taxAmt      = ((subtotal - discountAmt) * taxRate) / 100;
  const grandTotal  = subtotal - discountAmt + taxAmt + shipping;

  const addItem = () => {
    const v = parseFloat(value);
    const r = parseFloat(rate) || 0;
    const d = parseFloat(discount) || 0;
    if (!prodName.trim() || !v || v <= 0) { toast({ variant: "destructive", title: "Enter product and value" }); return; }
    if (mode !== "amount" && mode !== "custom" && !r) { toast({ variant: "destructive", title: "Enter rate/kg" }); return; }
    const base: Omit<InvoiceItem, "grams" | "lineTotal"> = {
      id: genId(), name: prodName, sku: "", sellingMode: mode,
      pricePerKg: r, inputValue: v, gramsPerBox: 500, customPrice: r, discount: d,
    };
    const computed = computeItem(base);
    setItems(prev => [...prev, { ...base, ...computed }]);
    setProdName(""); setValue(""); setRate(""); setDiscount("");
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const handleSave = async () => {
    if (items.length === 0) { toast({ variant: "destructive", title: "Add at least one item" }); return; }
    setSaving(true);
    try {
      const invoiceNo = `INV-${Date.now()}`;
      const payload = {
        invoiceNo, type: "invoice",
        customerId:      customer?.id ?? null,
        customerName:    customer?.name ?? null,
        customerPhone:   customer?.phone ?? null,
        items:           items.map(({ id: _id, ...rest }) => rest),
        subtotal, discountPct: invoiceDiscount, discountAmt, shipping, taxRate, taxAmt, grandTotal,
        paymentMethod, paymentStatus,
        paidAmount: paymentStatus === "paid" ? grandTotal : 0,
        notes: notes || null,
      };
      await branchFetch("/api/branch/invoices", token, { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "Invoice saved!", description: `${invoiceNo} — ${fmtRs(grandTotal)}` });
      // Reset
      setItems([]); setCustomer(undefined); setNotes(""); setInvoiceDiscount(0); setShipping(0); setTaxRate(0); setPaymentMethod("cash"); setPaymentStatus("paid");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to save", description: err.message });
    }
    setSaving(false);
  };

  const handlePrint = () => {
    toast({ title: "Print", description: "Print dialog coming soon" });
  };

  const handleWhatsApp = () => {
    if (!customer?.phone) { toast({ variant: "destructive", title: "No customer phone" }); return; }
    const msg = `KDF NUTS Invoice\nTotal: ${fmtRs(grandTotal)}\nItems: ${items.length}\nPayment: ${paymentMethod}`;
    window.open(`https://wa.me/${customer.phone.replace(/^0/, "92")}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="flex flex-col gap-3 pb-32">
      {/* Customer selector */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Customer</p>
        {customer === undefined ? (
          <button onClick={() => setShowPicker(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center"><User className="w-5 h-5 text-muted-foreground" /></div>
            <div><p className="font-semibold text-sm">Select Customer</p><p className="text-xs text-muted-foreground">Walk-in or saved customer</p></div>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
          </button>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-border bg-card">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
              {customer ? customer.name[0]?.toUpperCase() : <User className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{customer?.name ?? "Walk-in Customer"}</p>
              {customer?.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
            </div>
            <button onClick={() => setCustomer(undefined)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* POS Entry Bar */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Add Item</p>
        <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-2">
          {/* Row 1: Product name */}
          <Input
            ref={nameRef}
            value={prodName}
            onChange={e => setProdName(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
            placeholder="Product name…"
            className="h-11 text-sm font-medium"
          />
          {/* Row 2: Mode + Value + Rate */}
          <div className="flex gap-2">
            <Select value={mode} onValueChange={v => setMode(v as SellingMode)}>
              <SelectTrigger className="h-10 w-[90px] text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grams">Grams</SelectItem>
                <SelectItem value="kg">KG</SelectItem>
                <SelectItem value="amount">Rs Amt</SelectItem>
                <SelectItem value="box">Boxes</SelectItem>
                <SelectItem value="custom">Qty/pcs</SelectItem>
              </SelectContent>
            </Select>
            <Input type="number" value={value} onChange={e => setValue(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
              placeholder={mode === "grams" ? "Grams" : mode === "kg" ? "KG" : mode === "box" ? "Boxes" : mode === "custom" ? "Qty" : "Amount"}
              className="h-10 text-sm flex-1" />
            {mode !== "amount" && (
              <Input type="number" value={rate} onChange={e => setRate(e.target.value)}
                placeholder="Rate/kg"
                className="h-10 text-sm w-[100px] shrink-0" />
            )}
            <Input type="number" value={discount} onChange={e => setDiscount(e.target.value)}
              placeholder="Disc%"
              className="h-10 text-sm w-[70px] shrink-0" />
          </div>
          <Button onClick={addItem} className="w-full h-10 gap-2 font-bold">
            <Plus className="w-4 h-4" /> Add Item
          </Button>
        </div>
      </div>

      {/* Items list */}
      {items.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Items ({items.length})
          </p>
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-2xl">
                <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{weightStr(item)} {item.discount > 0 ? `· ${item.discount}% off` : ""}</p>
                </div>
                <p className="font-bold text-sm text-primary tabular-nums shrink-0">{fmtRs(item.lineTotal)}</p>
                <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 transition-colors p-1 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals + settings */}
      {items.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Discount / Tax / Shipping */}
          <div className="grid grid-cols-3 gap-2 p-4 border-b border-border">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Discount %</p>
              <Input type="number" value={invoiceDiscount || ""} onChange={e => setInvoiceDiscount(parseFloat(e.target.value) || 0)} placeholder="0" className="h-9 text-sm" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Tax %</p>
              <Input type="number" value={taxRate || ""} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} placeholder="0" className="h-9 text-sm" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Shipping</p>
              <Input type="number" value={shipping || ""} onChange={e => setShipping(parseFloat(e.target.value) || 0)} placeholder="0" className="h-9 text-sm" />
            </div>
          </div>

          {/* Summary */}
          <div className="p-4 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-medium tabular-nums">{fmtRs(subtotal)}</span></div>
            {invoiceDiscount > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount ({invoiceDiscount}%)</span><span className="text-red-600 font-medium tabular-nums">-{fmtRs(discountAmt)}</span></div>}
            {taxRate > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax ({taxRate}%)</span><span className="font-medium tabular-nums">+{fmtRs(taxAmt)}</span></div>}
            {shipping > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Shipping</span><span className="font-medium tabular-nums">+{fmtRs(shipping)}</span></div>}
            <div className="border-t border-border pt-2 flex justify-between items-center">
              <span className="font-bold">Total</span>
              <span className="text-xl font-black text-primary tabular-nums">{fmtRs(grandTotal)}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="px-4 pb-4 grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Payment Method</p>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="jazzcash">JazzCash</SelectItem>
                  <SelectItem value="easypaisa">Easypaisa</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Status</p>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="px-4 pb-4">
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)…" className="h-9 text-sm" />
          </div>
        </div>
      )}

      {/* Floating save bar */}
      {items.length > 0 && (
        <div className="fixed bottom-[72px] left-0 right-0 px-4 pb-2 z-40 pointer-events-none">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-3 flex items-center gap-2 pointer-events-auto">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground">Grand Total</p>
              <p className="font-black text-lg text-primary tabular-nums">{fmtRs(grandTotal)}</p>
            </div>
            <button onClick={handleWhatsApp} className="p-2.5 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
              <MessageCircle className="w-5 h-5" />
            </button>
            <button onClick={handlePrint} className="p-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
              <Printer className="w-5 h-5 text-muted-foreground" />
            </button>
            <Button onClick={handleSave} disabled={saving} className="h-11 px-5 font-bold gap-2 rounded-xl">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </Button>
          </div>
        </div>
      )}

      <CustomerPickerSheet open={showPicker} onClose={() => setShowPicker(false)} token={token} onPick={setCustomer} />
    </div>
  );
}

/* ═══ Invoice Edit Modal ═══ */
function InvoiceEditModal({
  invoice, token, onClose, onSaved,
}: { invoice: Invoice; token: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [items, setItems]               = useState<any[]>(invoice.items ?? []);
  const [customerName, setCustomerName] = useState(invoice.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(invoice.customerPhone ?? "");
  const [paymentStatus, setPaymentStatus] = useState(invoice.paymentStatus);
  const [paymentMethod, setPaymentMethod] = useState(invoice.paymentMethod);
  const [paidAmount, setPaidAmount]     = useState(String(invoice.paidAmount ?? 0));
  const [notes, setNotes]               = useState(invoice.notes ?? "");
  const [editReason, setEditReason]     = useState("");
  const [saving, setSaving]             = useState(false);

  const updateItem = (idx: number, field: string, val: any) => {
    setItems(prev => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], [field]: val };
      // Recalculate lineTotal
      const it = arr[idx];
      const qty = Number(it.quantity ?? it.inputValue ?? 1);
      const price = Number(it.customPrice ?? it.pricePerKg ?? it.price ?? 0);
      const disc = Number(it.discount ?? 0);
      arr[idx].lineTotal = Math.max(0, qty * price * (1 - disc / 100));
      return arr;
    });
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const subtotal  = items.reduce((s, it) => s + Number(it.lineTotal ?? 0), 0);
  const grandTotal = subtotal;

  const handleSave = async () => {
    if (!editReason.trim()) { toast({ variant: "destructive", title: "Please enter a reason for editing this invoice" }); return; }
    setSaving(true);
    try {
      await branchFetch(`/api/branch/invoices/${invoice.id}`, token, {
        method: "PUT",
        body: JSON.stringify({ items, customerName, customerPhone, paymentStatus, paymentMethod, paidAmount: Number(paidAmount), notes, subtotal, grandTotal, editReason }),
      });
      toast({ title: "Invoice updated successfully!" });
      onSaved(); onClose();
    } catch (err: any) { toast({ variant: "destructive", title: err.message }); }
    setSaving(false);
  };

  return (
    <Sheet open onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl p-0 overflow-hidden flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-blue-600" />
            Edit Invoice <span className="font-mono text-sm text-muted-foreground">{invoice.invoiceNo}</span>
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Customer info */}
          <div className="bg-muted/30 rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Customer</p>
            <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name" className="h-9 text-sm" />
            <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Phone" className="h-9 text-sm" />
          </div>

          {/* Items */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Items ({items.length})</p>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-semibold text-sm flex-1">{it.name ?? it.sku}</p>
                    <button onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600 shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Qty/Value</label>
                      <Input type="number" value={it.inputValue ?? it.quantity ?? 1} className="h-8 text-xs"
                        onChange={e => updateItem(idx, "inputValue", Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Price</label>
                      <Input type="number" value={it.customPrice ?? it.pricePerKg ?? 0} className="h-8 text-xs"
                        onChange={e => updateItem(idx, "customPrice", Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Disc%</label>
                      <Input type="number" value={it.discount ?? 0} className="h-8 text-xs"
                        onChange={e => updateItem(idx, "discount", Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="mt-2 text-right">
                    <span className="text-xs font-bold text-primary">{fmtRs(Number(it.lineTotal ?? 0))}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment */}
          <div className="bg-muted/30 rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Payment</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Method</label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="easypaisa">Easypaisa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Status</label>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {paymentStatus === "partial" && (
              <Input type="number" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} placeholder="Amount paid" className="h-8 text-xs" />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          {/* Edit Reason — Required */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <label className="text-[10px] font-bold text-amber-700 uppercase tracking-widest block mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />Reason for Edit (Required)
            </label>
            <Input value={editReason} onChange={e => setEditReason(e.target.value)}
              placeholder="e.g. Wrong quantity entered, customer requested item change…" className="h-9 text-sm border-amber-200" />
          </div>

          {/* Total */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="font-semibold text-sm">New Total</p>
            <p className="font-black text-xl text-primary tabular-nums">{fmtRs(grandTotal)}</p>
          </div>
        </div>

        <div className="px-4 pb-6 pt-3 border-t border-border shrink-0 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 h-12">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 h-12 font-bold gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ═══ Return / Exchange Modal ═══ */
function ReturnModal({
  invoice, token, onClose, onSaved,
}: { invoice: Invoice; token: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [returnType, setReturnType] = useState<"full_return" | "partial_return" | "exchange" | "store_credit">("full_return");
  const [selectedItems, setSelectedItems] = useState<Record<number, number>>({}); // index → return qty
  const [exchangeNote, setExchangeNote]   = useState("");
  const [reason, setReason]               = useState("");
  const [refundMethod, setRefundMethod]   = useState("cash");
  const [saving, setSaving]               = useState(false);

  const items = invoice.items ?? [];

  const toggleItem = (idx: number) => {
    setSelectedItems(prev => {
      const next = { ...prev };
      if (next[idx] !== undefined) delete next[idx];
      else next[idx] = 1;
      return next;
    });
  };

  const setItemQty = (idx: number, qty: number) => {
    setSelectedItems(prev => ({ ...prev, [idx]: Math.max(0.1, qty) }));
  };

  const returnItems = returnType === "full_return"
    ? items
    : items.filter((_, i) => selectedItems[i] !== undefined).map((it, i) => ({ ...it, returnQty: selectedItems[items.indexOf(it)] }));

  const returnAmount = returnType === "full_return"
    ? Number(invoice.grandTotal)
    : returnItems.reduce((s, it) => {
        const qty  = Number(it.inputValue ?? 1);
        const retQ = Number(it.returnQty ?? qty);
        return s + (Number(it.lineTotal ?? 0) / qty) * retQ;
      }, 0);

  const handleReturn = async () => {
    if (!reason.trim()) { toast({ variant: "destructive", title: "Please enter a reason for this return" }); return; }
    if (returnType !== "full_return" && Object.keys(selectedItems).length === 0) {
      toast({ variant: "destructive", title: "Select at least one item to return" }); return;
    }
    setSaving(true);
    try {
      await branchFetch(`/api/branch/invoices/${invoice.id}/return`, token, {
        method: "POST",
        body: JSON.stringify({
          returnType, items: returnItems, returnAmount, refundMethod,
          reason, notes: exchangeNote,
          exchangeItems: returnType === "exchange" ? [] : undefined,
        }),
      });
      toast({ title: returnType === "exchange" ? "Exchange processed!" : "Return processed!" });
      onSaved(); onClose();
    } catch (err: any) { toast({ variant: "destructive", title: err.message }); }
    setSaving(false);
  };

  return (
    <Sheet open onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl p-0 overflow-hidden flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-orange-600" />
            Return / Exchange — <span className="font-mono text-sm text-muted-foreground">{invoice.invoiceNo}</span>
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Return type */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Return Type</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "full_return",    label: "Full Return",    icon: RotateCcw,       color: "border-red-200 bg-red-50 text-red-700" },
                { value: "partial_return", label: "Partial Return", icon: ChevronDown,     color: "border-orange-200 bg-orange-50 text-orange-700" },
                { value: "exchange",       label: "Exchange",       icon: ArrowLeftRight,  color: "border-purple-200 bg-purple-50 text-purple-700" },
                { value: "store_credit",   label: "Store Credit",   icon: Wallet,          color: "border-blue-200 bg-blue-50 text-blue-700" },
              ] as const).map(rt => (
                <button key={rt.value} onClick={() => setReturnType(rt.value as any)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${returnType === rt.value ? rt.color + " ring-2 ring-offset-1 ring-current/30" : "border-border bg-muted/20 text-muted-foreground"}`}>
                  <rt.icon className="w-4 h-4 shrink-0" />
                  {rt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Items selection for partial return */}
          {(returnType === "partial_return" || returnType === "exchange") && (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                Select Items to {returnType === "exchange" ? "Exchange" : "Return"}
              </p>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className={`rounded-xl border p-3 transition-all ${selectedItems[idx] !== undefined ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={selectedItems[idx] !== undefined} onChange={() => toggleItem(idx)}
                        className="w-4 h-4 accent-primary rounded cursor-pointer" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{it.name ?? it.sku}</p>
                        <p className="text-xs text-muted-foreground">{fmtRs(Number(it.lineTotal ?? 0))}</p>
                      </div>
                    </div>
                    {selectedItems[idx] !== undefined && (
                      <div className="mt-2 flex items-center gap-2">
                        <label className="text-xs text-muted-foreground">Return qty:</label>
                        <Input type="number" value={selectedItems[idx]} min={0.1} step={0.1}
                          onChange={e => setItemQty(idx, Number(e.target.value))}
                          className="h-7 w-20 text-xs" />
                        <span className="text-xs text-muted-foreground">of {it.inputValue ?? 1}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* For full return — show summary */}
          {returnType === "full_return" && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm font-bold text-red-700 mb-1">Full return of invoice</p>
              <p className="text-xs text-red-600">All {items.length} item(s) will be returned. Full refund: {fmtRs(Number(invoice.grandTotal))}</p>
            </div>
          )}

          {/* Exchange note */}
          {returnType === "exchange" && (
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Exchange Note</label>
              <textarea value={exchangeNote} onChange={e => setExchangeNote(e.target.value)} rows={2} placeholder="Describe what is being exchanged for…"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          )}

          {/* Refund method */}
          {returnType !== "exchange" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Refund Method</label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="store_credit">Store Credit</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-primary/5 border border-primary/20 rounded-xl px-3 py-2 flex flex-col justify-center">
                <p className="text-[10px] text-muted-foreground">Refund Amount</p>
                <p className="font-black text-base text-primary tabular-nums">{fmtRs(returnAmount)}</p>
              </div>
            </div>
          )}

          {/* Reason — Required */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <label className="text-[10px] font-bold text-amber-700 uppercase tracking-widest block mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />Reason (Required)
            </label>
            <Input value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Damaged product, wrong item delivered, customer changed mind…" className="h-9 text-sm border-amber-200" />
          </div>
        </div>

        <div className="px-4 pb-6 pt-3 border-t border-border shrink-0 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 h-12">Cancel</Button>
          <Button onClick={handleReturn} disabled={saving}
            className={`flex-1 h-12 font-bold gap-2 ${returnType === "exchange" ? "bg-purple-600 hover:bg-purple-700" : "bg-orange-600 hover:bg-orange-700"}`}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            {returnType === "exchange" ? "Process Exchange" : "Process Return"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ═══ History Tab ═══ */
function HistoryTab({ token }: { token: string }) {
  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPay, setFilterPay]   = useState("all");
  const [search, setSearch]         = useState("");
  const [editInv, setEditInv]       = useState<Invoice | null>(null);
  const [returnInv, setReturnInv]   = useState<Invoice | null>(null);
  const [detailInv, setDetailInv]   = useState<Invoice | null>(null);
  const { toast } = useToast();

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      const d = await branchFetch(`/api/branch/invoices?${params}`, token);
      setInvoices(d.invoices ?? []);
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    }
    setLoading(false);
  }, [token, filterStatus, toast]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase();
    const matchQ = inv.invoiceNo.toLowerCase().includes(q) || (inv.customerName ?? "").toLowerCase().includes(q);
    const matchPay = filterPay === "all" || inv.paymentStatus === filterPay;
    return matchQ && matchPay;
  });

  const canReturn = (inv: Invoice) => !["returned", "refunded"].includes(inv.status);
  const canEdit   = (inv: Invoice) => !["returned", "refunded"].includes(inv.status);

  return (
    <div className="space-y-3 pb-24">
      {/* Edit / Return Modals */}
      {editInv   && <InvoiceEditModal invoice={editInv}   token={token} onClose={() => setEditInv(null)}   onSaved={loadInvoices} />}
      {returnInv && <ReturnModal      invoice={returnInv} token={token} onClose={() => setReturnInv(null)} onSaved={loadInvoices} />}

      {/* Invoice Detail Sheet */}
      {detailInv && (
        <Sheet open onOpenChange={v => { if (!v) setDetailInv(null); }}>
          <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl p-0 overflow-hidden flex flex-col">
            <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
              <SheetTitle className="flex items-center gap-2 text-sm">
                <Receipt className="w-4 h-4 text-primary" /> {detailInv.invoiceNo}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ml-1 ${INV_STATUS_COLOR[detailInv.status] ?? ""}`}>
                  {INV_STATUS_LABEL[detailInv.status] ?? detailInv.status}
                </span>
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {detailInv.customerName && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{detailInv.customerName}</span>
                  {detailInv.customerPhone && <span className="text-muted-foreground">{detailInv.customerPhone}</span>}
                </div>
              )}
              {/* Items */}
              <div className="space-y-1.5">
                {(detailInv.items ?? []).map((it: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{it.name ?? it.sku}</p>
                      <p className="text-xs text-muted-foreground">Qty: {it.inputValue ?? 1}{it.discount ? ` · ${it.discount}% off` : ""}</p>
                    </div>
                    <p className="font-bold text-sm tabular-nums">{fmtRs(Number(it.lineTotal ?? 0))}</p>
                  </div>
                ))}
              </div>
              {/* Totals */}
              <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground"><span>Subtotal</span><span>{fmtRs(Number(detailInv.subtotal ?? 0))}</span></div>
                {Number(detailInv.discountAmt) > 0 && <div className="flex justify-between text-xs text-green-600"><span>Discount</span><span>-{fmtRs(Number(detailInv.discountAmt))}</span></div>}
                {Number(detailInv.shipping ?? 0) > 0 && <div className="flex justify-between text-xs text-muted-foreground"><span>Shipping</span><span>{fmtRs(Number(detailInv.shipping))}</span></div>}
                <div className="flex justify-between font-black pt-1 border-t border-border/50"><span>Grand Total</span><span className="text-primary">{fmtRs(Number(detailInv.grandTotal))}</span></div>
              </div>
              <div className={`flex items-center justify-between rounded-xl px-3 py-2 border text-sm ${STATUS_COLOR[detailInv.paymentStatus] ?? ""}`}>
                <span className="font-medium capitalize">{detailInv.paymentMethod} · {detailInv.paymentStatus}</span>
                <span className="font-bold">{fmtRs(Number(detailInv.paidAmount ?? detailInv.grandTotal))}</span>
              </div>
            </div>
            {/* Action buttons */}
            <div className="px-4 pb-6 pt-3 border-t border-border shrink-0 grid grid-cols-2 gap-2">
              {canEdit(detailInv) && (
                <Button variant="outline" className="h-11 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={() => { setEditInv(detailInv); setDetailInv(null); }}>
                  <Pencil className="w-4 h-4" /> Edit Invoice
                </Button>
              )}
              {canReturn(detailInv) && (
                <Button variant="outline" className="h-11 gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                  onClick={() => { setReturnInv(detailInv); setDetailInv(null); }}>
                  <RotateCcw className="w-4 h-4" /> Return/Exchange
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Controls */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice or customer…" className="pl-9 h-10 text-sm" />
          </div>
          <button onClick={loadInvoices} className="p-2.5 rounded-xl border border-border hover:bg-muted transition-colors shrink-0">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="edited">Edited</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
              <SelectItem value="partially_returned">Partial Return</SelectItem>
              <SelectItem value="exchanged">Exchanged</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPay} onValueChange={setFilterPay}>
            <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payment</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats bar */}
      {!loading && filtered.length > 0 && (
        <div className="flex gap-2 text-xs">
          <span className="bg-muted/50 rounded-lg px-2 py-1 font-semibold">{filtered.length} invoices</span>
          <span className="bg-emerald-50 text-emerald-700 rounded-lg px-2 py-1 font-semibold">
            {fmtRs(filtered.reduce((s, i) => s + Number(i.grandTotal), 0))} total
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Receipt className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-semibold text-muted-foreground">No invoices found</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Start creating invoices in POS tab</p>
        </div>
      ) : filtered.map(inv => (
        <button key={inv.id} onClick={() => setDetailInv(inv)}
          className="w-full bg-card border border-border rounded-2xl px-4 py-3 text-left hover:border-primary/30 hover:bg-primary/[0.02] transition-all active:scale-[0.99]">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${INV_STATUS_COLOR[inv.status] ?? "bg-muted"}`}>
              <Receipt className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-sm font-mono text-primary">{inv.invoiceNo}</p>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${INV_STATUS_COLOR[inv.status] ?? ""}`}>
                  {INV_STATUS_LABEL[inv.status] ?? inv.status}
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[inv.paymentStatus] ?? ""}`}>
                  {inv.paymentStatus}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <p className="text-xs text-muted-foreground truncate">{inv.customerName ?? "Walk-in"}</p>
                <p className="text-xs text-muted-foreground shrink-0">{new Date(inv.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-black tabular-nums text-sm">{fmtRs(Number(inv.grandTotal))}</p>
              <div className="flex items-center gap-1 justify-end mt-1">
                {canEdit(inv) && (
                  <button onClick={e => { e.stopPropagation(); setEditInv(inv); }}
                    className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 hover:text-blue-700 transition-colors" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                {canReturn(inv) && (
                  <button onClick={e => { e.stopPropagation(); setReturnInv(inv); }}
                    className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-500 hover:text-orange-700 transition-colors" title="Return">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ═══ Customers Tab ═══ */
function CustomersTab({ token }: { token: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [q, setQ]                 = useState("");
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]   = useState({ name: "", phone: "", email: "", address: "" });
  const [saving, setSaving]       = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await branchFetch(`/api/branch/customers?q=${encodeURIComponent(q)}`, token);
      setCustomers(d.customers ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token, q]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const handleAdd = async () => {
    if (!form.name || !form.phone) { toast({ variant: "destructive", title: "Name & phone required" }); return; }
    setSaving(true);
    try {
      await branchFetch("/api/branch/customers", token, { method: "POST", body: JSON.stringify(form) });
      toast({ title: "Customer added!" });
      setForm({ name: "", phone: "", email: "", address: "" }); setShowAdd(false); load();
    } catch (err: any) { toast({ variant: "destructive", title: err.message }); }
    setSaving(false);
  };

  return (
    <div className="space-y-3 pb-6">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customers…" className="pl-9 h-10 text-sm" />
        </div>
        <Button onClick={() => setShowAdd(v => !v)} variant={showAdd ? "default" : "outline"} size="sm" className="h-10 px-3 shrink-0 gap-1.5">
          <UserPlus className="w-4 h-4" /><span className="hidden sm:inline">Add</span>
        </Button>
      </div>

      {showAdd && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
          <p className="text-sm font-bold mb-3">New Customer</p>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name *" className="h-10" />
          <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone *" type="tel" className="h-10" />
          <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email (optional)" className="h-10" />
          <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Address (optional)" className="h-10" />
          <div className="flex gap-2 pt-1">
            <Button onClick={handleAdd} disabled={saving} className="flex-1 h-10 font-bold">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Save
            </Button>
            <Button onClick={() => setShowAdd(false)} variant="outline" className="h-10">Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : customers.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-semibold text-muted-foreground">No customers yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Add your first customer above</p>
        </div>
      ) : customers.map(c => (
        <div key={c.id} className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold">{c.name[0]?.toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{c.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Phone className="w-3 h-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{c.phone}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-sm text-primary tabular-nums">{fmtRs(Number(c.totalSpent))}</p>
            <p className="text-[10px] text-muted-foreground">{c.totalOrders} orders</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══ Stats Tab ═══ */
function StatsTab({ token }: { token: string }) {
  const [stats, setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    branchFetch("/api/branch/stats", token)
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (!stats) return <div className="text-center py-16 text-muted-foreground">Failed to load stats</div>;

  const StatCard = ({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: any; color: string }) => (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
        <Icon className="w-4 h-4 opacity-60" />
      </div>
      <p className="text-2xl font-black tabular-nums">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-4 pb-6">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Today</p>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Revenue" value={fmtRs(stats.today.revenue)} icon={Wallet} color="bg-emerald-50 border-emerald-200 text-emerald-800" />
          <StatCard label="Invoices" value={stats.today.invoices} sub={`${stats.today.paid} paid`} icon={Receipt} color="bg-blue-50 border-blue-200 text-blue-800" />
          <StatCard label="Paid" value={stats.today.paid} icon={CheckCircle} color="bg-green-50 border-green-200 text-green-800" />
          <StatCard label="Unpaid" value={stats.today.unpaid} icon={AlertCircle} color="bg-red-50 border-red-200 text-red-800" />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">This Month</p>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Revenue" value={fmtRs(stats.month.revenue)} icon={TrendingUp} color="bg-violet-50 border-violet-200 text-violet-800" />
          <StatCard label="Invoices" value={stats.month.invoices} icon={Receipt} color="bg-indigo-50 border-indigo-200 text-indigo-800" />
          <StatCard label="Customers" value={stats.month.uniqueCustomers} icon={Users} color="bg-amber-50 border-amber-200 text-amber-800" />
          <StatCard label="Returns" value={stats.month.returns ?? 0} sub="this month" icon={RotateCcw} color="bg-orange-50 border-orange-200 text-orange-800" />
        </div>
      </div>
    </div>
  );
}

/* ═══ Main Page ═══ */
export default function BranchPosPage() {
  const { isAuthenticated, isLoading, token, user, branch, logout } = useBranchAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("pos");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/branch-login");
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !token) return null;

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "pos",       label: "POS",      icon: Receipt   },
    { id: "history",   label: "History",  icon: Clock     },
    { id: "customers", label: "Customers",icon: Users     },
    { id: "stats",     label: "Stats",    icon: BarChart2 },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-card border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm truncate">{branch?.name ?? "Branch"}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.name} · {user?.role}</p>
          </div>
          <button
            onClick={() => { logout(); navigate("/branch-login"); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-xl hover:bg-muted"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {tab === "pos"       && <PosTab       token={token} />}
        {tab === "history"   && <HistoryTab   token={token} />}
        {tab === "customers" && <CustomersTab token={token} />}
        {tab === "stats"     && <StatsTab     token={token} />}
      </div>

      {/* Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border safe-area-pb">
        <div className="max-w-lg mx-auto flex">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center py-2.5 gap-1 transition-colors ${
                tab === t.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className={`w-5 h-5 ${tab === t.id ? "scale-110" : ""} transition-transform`} />
              <span className="text-[10px] font-semibold">{t.label}</span>
              {tab === t.id && (
                <span className="w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
