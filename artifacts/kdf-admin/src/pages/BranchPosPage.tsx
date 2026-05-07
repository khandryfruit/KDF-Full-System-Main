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
  const { user } = useBranchAuth();
  const perm = (p: string) => user?.role === "manager" || !!(user?.permissions?.[p]);

  const [customer, setCustomer]   = useState<Customer | null | undefined>(undefined);
  const [showPicker, setShowPicker] = useState(false);
  const [items, setItems]         = useState<InvoiceItem[]>([]);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [shipping, setShipping]   = useState(0);
  const [taxRate, setTaxRate]     = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentStatus, setPaymentStatus] = useState("paid");
  const [amountReceived, setAmountReceived] = useState("");
  const [notes, setNotes]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);

  // POS entry state
  const [prodName, setProdName]   = useState("");
  const [mode, setMode]           = useState<SellingMode>("grams");
  const [value, setValue]         = useState("");
  const [rate, setRate]           = useState("");
  const [discount, setDiscount]   = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const rateRef  = useRef<HTMLInputElement>(null);

  const subtotal    = items.reduce((s, i) => s + i.lineTotal, 0);
  const discountAmt = (subtotal * invoiceDiscount) / 100;
  const taxAmt      = ((subtotal - discountAmt) * taxRate) / 100;
  const grandTotal  = subtotal - discountAmt + taxAmt + shipping;
  const balance     = grandTotal - (parseFloat(amountReceived) || 0);

  const clearForm = useCallback(() => {
    setItems([]); setCustomer(undefined); setNotes(""); setInvoiceDiscount(0);
    setShipping(0); setTaxRate(0); setPaymentMethod("cash"); setPaymentStatus("paid");
    setAmountReceived(""); setSelectedRow(null);
    setTimeout(() => nameRef.current?.focus(), 50);
  }, []);

  const addItem = useCallback(() => {
    const v = parseFloat(value);
    const r = parseFloat(rate) || 0;
    const d = parseFloat(discount) || 0;
    if (!prodName.trim() || !v || v <= 0) { toast({ variant: "destructive", title: "Enter product name and quantity" }); return; }
    if (mode !== "amount" && mode !== "custom" && !r) { toast({ variant: "destructive", title: "Enter rate/kg" }); return; }
    const base: Omit<InvoiceItem, "grams" | "lineTotal"> = {
      id: genId(), name: prodName, sku: "", sellingMode: mode,
      pricePerKg: r, inputValue: v, gramsPerBox: 500, customPrice: r, discount: d,
    };
    const computed = computeItem(base);
    setItems(prev => [...prev, { ...base, ...computed }]);
    setProdName(""); setValue(""); setRate(""); setDiscount("");
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [prodName, mode, value, rate, discount, toast]);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    if (selectedRow === id) setSelectedRow(null);
  }, [selectedRow]);

  const deleteSelected = useCallback(() => {
    if (selectedRow) removeItem(selectedRow);
  }, [selectedRow, removeItem]);

  // F-key keyboard shortcuts
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "F2")  { e.preventDefault(); nameRef.current?.focus(); }
      if (e.key === "F3")  { e.preventDefault(); deleteSelected(); }
      if (e.key === "F5")  { e.preventDefault(); setShowPicker(true); }
      if (e.key === "F9")  { e.preventDefault(); handlePrint(); }
      if (e.key === "F10") { e.preventDefault(); handleSave(); }
      if (e.key === "Escape") { e.preventDefault(); clearForm(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteSelected, clearForm, items]);

  const handleSave = async () => {
    if (items.length === 0) { toast({ variant: "destructive", title: "Add at least one item" }); return; }
    setSaving(true);
    try {
      const invoiceNo = `INV-${Date.now()}`;
      const paid = parseFloat(amountReceived) || (paymentStatus === "paid" ? grandTotal : 0);
      const payload = {
        invoiceNo, type: "invoice",
        customerId:    customer?.id ?? null,
        customerName:  customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        items:         items.map(({ id: _id, ...rest }) => rest),
        subtotal, discountPct: invoiceDiscount, discountAmt, shipping, taxRate, taxAmt, grandTotal,
        paymentMethod, paymentStatus,
        paidAmount: paid,
        notes: notes || null,
      };
      await branchFetch("/api/branch/invoices", token, { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "✓ Invoice Saved", description: `${invoiceNo} — ${fmtRs(grandTotal)}` });
      clearForm();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to save", description: err.message });
    }
    setSaving(false);
  };

  const handlePrint = () => {
    if (items.length === 0) { toast({ variant: "destructive", title: "Add items first" }); return; }
    printInvoice({
      invoiceNo: `DRAFT-${Date.now()}`, status: "draft",
      customerName: customer?.name ?? null, customerPhone: customer?.phone ?? null,
      items, subtotal, discountAmt, shipping, taxAmt, grandTotal,
      paymentMethod, paymentStatus, createdAt: new Date().toISOString(), notes,
    });
  };

  const handleWhatsApp = () => {
    if (!customer?.phone) { toast({ variant: "destructive", title: "No customer phone selected" }); return; }
    const msg = `*KDF NUTS Invoice*\nTotal: ${fmtRs(grandTotal)}\nItems: ${items.length}\nPayment: ${paymentMethod}`;
    window.open(`https://wa.me/${customer.phone.replace(/^0/, "92")}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  /* ── Marg ERP–style desktop POS ── */
  const ERPDesktop = () => (
    <div className="flex flex-col h-[calc(100vh-57px)] bg-gray-100 font-mono select-none">

      {/* ── TOP BAR ── */}
      <div className="bg-[#1a3a5c] text-white flex items-center justify-between px-3 py-1.5 shrink-0 text-xs">
        <div className="flex items-center gap-3">
          <span className="bg-[#e8a020] text-white font-bold px-2 py-0.5 rounded text-[11px]">KDF</span>
          <span className="font-bold text-sm tracking-wide">BRANCH POS — SALE INVOICE</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-blue-200">
          <span>User: <b className="text-white">{user?.username ?? "—"}</b></span>
          <span>Date: <b className="text-white">{new Date().toLocaleDateString("en-PK")}</b></span>
          <span>Items: <b className="text-yellow-300">{items.length}</b></span>
        </div>
      </div>

      {/* ── MAIN CONTENT: left table + right panel ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ══ LEFT: Item entry + table ══ */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-gray-300">

          {/* Item entry bar */}
          <div className="bg-[#dde8f4] border-b border-gray-300 px-2 py-1.5 flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-bold text-[#1a3a5c] whitespace-nowrap bg-[#b8d0e8] px-2 py-1 rounded border border-[#8aaecc]">
              ITEM NAME
            </span>
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={nameRef}
                value={prodName}
                onChange={e => setProdName(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") { e.preventDefault(); valueRef.current?.focus(); }
                  if (e.key === "Tab")   { e.preventDefault(); valueRef.current?.focus(); }
                }}
                placeholder="Type item name or code… (F2)"
                className="w-full pl-7 pr-2 py-1 text-sm border border-[#8aaecc] rounded bg-white focus:outline-none focus:border-[#1a3a5c] focus:ring-1 focus:ring-[#1a3a5c]"
                autoFocus
              />
            </div>

            {/* Mode selector */}
            <select
              value={mode}
              onChange={e => setMode(e.target.value as SellingMode)}
              className="text-xs border border-[#8aaecc] rounded bg-white px-1.5 py-1 focus:outline-none focus:border-[#1a3a5c] text-[#1a3a5c] font-semibold"
            >
              <option value="grams">g</option>
              <option value="kg">KG</option>
              <option value="amount">Rs</option>
              <option value="box">Box</option>
              <option value="custom">Pcs</option>
            </select>

            {/* QTY */}
            <span className="text-[11px] font-bold text-[#1a3a5c] whitespace-nowrap">QTY</span>
            <input
              ref={valueRef}
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") { e.preventDefault(); if (mode !== "amount" && mode !== "custom") rateRef.current?.focus(); else addItem(); }
                if (e.key === "Tab")   { e.preventDefault(); if (mode !== "amount" && mode !== "custom") rateRef.current?.focus(); else addItem(); }
              }}
              placeholder={mode === "grams" ? "Grams" : mode === "kg" ? "KG" : mode === "box" ? "Boxes" : mode === "custom" ? "Qty" : "Amount"}
              className="w-20 text-sm border border-[#8aaecc] rounded bg-white px-2 py-1 text-center focus:outline-none focus:border-[#1a3a5c] focus:ring-1 focus:ring-[#1a3a5c]"
            />

            {/* Rate */}
            {mode !== "amount" && (
              <>
                <span className="text-[11px] font-bold text-[#1a3a5c] whitespace-nowrap">RATE/KG</span>
                <input
                  ref={rateRef}
                  type="number"
                  value={rate}
                  onChange={e => setRate(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") { e.preventDefault(); addItem(); }
                    if (e.key === "Tab")   { e.preventDefault(); addItem(); }
                  }}
                  placeholder="Rate"
                  className="w-20 text-sm border border-[#8aaecc] rounded bg-white px-2 py-1 text-center focus:outline-none focus:border-[#1a3a5c] focus:ring-1 focus:ring-[#1a3a5c]"
                />
              </>
            )}

            {/* Disc */}
            {perm("apply_discount") && (
              <>
                <span className="text-[11px] font-bold text-[#1a3a5c] whitespace-nowrap">DISC%</span>
                <input
                  type="number"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
                  placeholder="0"
                  className="w-14 text-sm border border-[#8aaecc] rounded bg-white px-2 py-1 text-center focus:outline-none focus:border-[#1a3a5c]"
                />
              </>
            )}

            <button
              onClick={addItem}
              className="flex items-center gap-1 bg-[#1a7a3a] hover:bg-[#145f2c] text-white text-xs font-bold px-3 py-1.5 rounded whitespace-nowrap transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> ADD
            </button>
          </div>

          {/* ── Items Table ── */}
          <div className="flex-1 overflow-auto bg-white">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#1a3a5c] text-white">
                  <th className="border border-[#2a5a8c] px-2 py-1.5 text-left w-8 font-semibold">#</th>
                  <th className="border border-[#2a5a8c] px-2 py-1.5 text-left font-semibold">ITEM NAME</th>
                  <th className="border border-[#2a5a8c] px-2 py-1.5 text-center w-20 font-semibold">QTY</th>
                  <th className="border border-[#2a5a8c] px-2 py-1.5 text-center w-14 font-semibold">UNIT</th>
                  <th className="border border-[#2a5a8c] px-2 py-1.5 text-right w-24 font-semibold">RATE/KG</th>
                  <th className="border border-[#2a5a8c] px-2 py-1.5 text-center w-16 font-semibold">DISC%</th>
                  <th className="border border-[#2a5a8c] px-2 py-1.5 text-center w-20 font-semibold">WEIGHT</th>
                  <th className="border border-[#2a5a8c] px-2 py-1.5 text-right w-24 font-semibold">TOTAL</th>
                  <th className="border border-[#2a5a8c] w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-gray-400 text-sm">
                      <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No items added — type item name above and press Enter
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedRow(item.id)}
                      className={`cursor-pointer border-b border-gray-200 transition-colors ${selectedRow === item.id ? "bg-[#cce4ff] font-semibold" : idx % 2 === 0 ? "bg-white hover:bg-[#f0f7ff]" : "bg-[#f8fbff] hover:bg-[#f0f7ff]"}`}
                    >
                      <td className="border-r border-gray-200 px-2 py-1 text-center text-gray-500">{idx + 1}</td>
                      <td className="border-r border-gray-200 px-2 py-1 font-medium text-gray-800">{item.name}</td>
                      <td className="border-r border-gray-200 px-2 py-1 text-center tabular-nums">{item.inputValue}</td>
                      <td className="border-r border-gray-200 px-2 py-1 text-center text-gray-600">
                        {item.sellingMode === "grams" ? "g" : item.sellingMode === "kg" ? "KG" : item.sellingMode === "box" ? "Box" : item.sellingMode === "custom" ? "Pcs" : "Rs"}
                      </td>
                      <td className="border-r border-gray-200 px-2 py-1 text-right tabular-nums text-gray-700">
                        {item.sellingMode !== "amount" && item.sellingMode !== "custom" ? Number(item.pricePerKg).toLocaleString() : "—"}
                      </td>
                      <td className="border-r border-gray-200 px-2 py-1 text-center">
                        {item.discount > 0 ? <span className="text-green-700 font-bold">{item.discount}%</span> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="border-r border-gray-200 px-2 py-1 text-center text-blue-700 font-semibold tabular-nums">{weightStr(item)}</td>
                      <td className="border-r border-gray-200 px-2 py-1 text-right font-bold tabular-nums text-[#1a5a2c]">
                        {Number(item.lineTotal).toLocaleString("en-PK", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-1 text-center">
                        <button onClick={e => { e.stopPropagation(); removeItem(item.id); }} className="text-red-400 hover:text-red-600 transition-colors p-0.5 rounded">
                          <X className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
                {/* Empty filler rows for desktop feel */}
                {items.length > 0 && items.length < 8 && Array.from({ length: Math.max(0, 5 - items.length) }).map((_, i) => (
                  <tr key={`filler-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-[#f8fbff]"}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="border-r border-gray-100 px-2 py-1">&nbsp;</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Status bar ── */}
          <div className="bg-[#dde8f4] border-t border-gray-300 px-3 py-1 flex items-center justify-between text-[11px] text-[#1a3a5c] shrink-0">
            <span>Total Items: <b>{items.length}</b></span>
            <span>Total Weight: <b>{items.reduce((s, i) => s + (i.grams ?? 0), 0) >= 1000
              ? `${(items.reduce((s, i) => s + (i.grams ?? 0), 0) / 1000).toFixed(2)} KG`
              : `${Math.round(items.reduce((s, i) => s + (i.grams ?? 0), 0))} g`}</b></span>
            <span>Subtotal: <b className="text-[#1a5a2c]">{fmtRs(subtotal)}</b></span>
            {selectedRow && <span className="text-orange-600 font-bold">● ROW SELECTED — F3 to Delete</span>}
          </div>
        </div>

        {/* ══ RIGHT: Billing Panel ══ */}
        <div className="w-[280px] shrink-0 flex flex-col bg-[#f0f4f8] border-l border-gray-300 overflow-y-auto">

          {/* Customer */}
          <div className="bg-[#1a3a5c] text-white px-3 py-1.5 text-[11px] font-bold tracking-wide">CUSTOMER</div>
          <div className="px-2 py-2 border-b border-gray-300">
            {customer === undefined ? (
              <button onClick={() => setShowPicker(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 border border-dashed border-[#8aaecc] rounded bg-white hover:bg-[#f0f7ff] text-xs text-gray-500 transition-colors">
                <User className="w-3.5 h-3.5" />
                <span>Select Customer… (F5)</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-2 py-1.5 border border-[#8aaecc] rounded bg-[#e8f4fd]">
                <div className="w-6 h-6 rounded bg-[#1a3a5c] flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {customer?.name?.[0]?.toUpperCase() ?? "W"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs text-[#1a3a5c] truncate">{customer?.name ?? "Walk-in"}</p>
                  {customer?.phone && <p className="text-[10px] text-gray-500">{customer.phone}</p>}
                </div>
                <button onClick={() => setCustomer(undefined)} className="text-gray-400 hover:text-red-500 p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Adjustments */}
          <div className="bg-[#1a3a5c] text-white px-3 py-1.5 text-[11px] font-bold tracking-wide">ADJUSTMENTS</div>
          <div className="px-2 py-2 border-b border-gray-300 space-y-1.5">
            {perm("apply_discount") && (
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-[#1a3a5c] font-semibold w-20 shrink-0">Disc %</label>
                <input type="number" value={invoiceDiscount || ""} onChange={e => setInvoiceDiscount(parseFloat(e.target.value) || 0)}
                  placeholder="0" className="flex-1 text-xs border border-[#8aaecc] rounded bg-white px-2 py-1 text-right focus:outline-none focus:border-[#1a3a5c]" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[#1a3a5c] font-semibold w-20 shrink-0">Tax %</label>
              <input type="number" value={taxRate || ""} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                placeholder="0" className="flex-1 text-xs border border-[#8aaecc] rounded bg-white px-2 py-1 text-right focus:outline-none focus:border-[#1a3a5c]" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[#1a3a5c] font-semibold w-20 shrink-0">Shipping</label>
              <input type="number" value={shipping || ""} onChange={e => setShipping(parseFloat(e.target.value) || 0)}
                placeholder="0" className="flex-1 text-xs border border-[#8aaecc] rounded bg-white px-2 py-1 text-right focus:outline-none focus:border-[#1a3a5c]" />
            </div>
          </div>

          {/* Totals */}
          <div className="bg-[#1a3a5c] text-white px-3 py-1.5 text-[11px] font-bold tracking-wide">TOTALS</div>
          <div className="px-3 py-2 border-b border-gray-300 space-y-1">
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-600">Sub-Total</span>
              <span className="tabular-nums font-semibold">{fmtRs(subtotal)}</span>
            </div>
            {invoiceDiscount > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-gray-600">Discount ({invoiceDiscount}%)</span>
                <span className="tabular-nums text-red-600">−{fmtRs(discountAmt)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-gray-600">Tax ({taxRate}%)</span>
                <span className="tabular-nums">+{fmtRs(taxAmt)}</span>
              </div>
            )}
            {shipping > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-gray-600">Shipping</span>
                <span className="tabular-nums">+{fmtRs(shipping)}</span>
              </div>
            )}
            <div className="border-t-2 border-[#1a3a5c] mt-1 pt-1.5 flex justify-between items-center">
              <span className="font-black text-[13px] text-[#1a3a5c]">GRAND TOTAL</span>
              <span className="text-[18px] font-black text-[#1a5a2c] tabular-nums">{fmtRs(grandTotal)}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="bg-[#1a3a5c] text-white px-3 py-1.5 text-[11px] font-bold tracking-wide">PAYMENT</div>
          <div className="px-2 py-2 border-b border-gray-300 space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[#1a3a5c] font-semibold w-20 shrink-0">Mode</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                className="flex-1 text-xs border border-[#8aaecc] rounded bg-white px-2 py-1 focus:outline-none focus:border-[#1a3a5c]">
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="card">Card</option>
                <option value="jazzcash">JazzCash</option>
                <option value="easypaisa">Easypaisa</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[#1a3a5c] font-semibold w-20 shrink-0">Status</label>
              <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
                className="flex-1 text-xs border border-[#8aaecc] rounded bg-white px-2 py-1 focus:outline-none focus:border-[#1a3a5c]">
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[#1a3a5c] font-semibold w-20 shrink-0">Amt Rcvd</label>
              <input type="number" value={amountReceived} onChange={e => setAmountReceived(e.target.value)}
                placeholder={fmtRs(grandTotal)} className="flex-1 text-xs border border-[#8aaecc] rounded bg-white px-2 py-1 text-right focus:outline-none focus:border-[#1a3a5c] font-bold" />
            </div>
            <div className="flex justify-between text-[12px] px-1 pt-0.5 border-t border-gray-300">
              <span className="text-gray-600 font-semibold">Balance</span>
              <span className={`tabular-nums font-black ${balance < 0 ? "text-green-700" : balance > 0 ? "text-red-600" : "text-gray-500"}`}>
                {balance === 0 ? "—" : balance < 0 ? `+${fmtRs(Math.abs(balance))}` : `−${fmtRs(balance)}`}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="px-2 py-2 border-b border-gray-300">
            <label className="text-[11px] text-[#1a3a5c] font-semibold block mb-1">NOTES</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional note…"
              className="w-full text-xs border border-[#8aaecc] rounded bg-white px-2 py-1 focus:outline-none focus:border-[#1a3a5c]" />
          </div>

          {/* WhatsApp */}
          {customer?.phone && (
            <div className="px-2 py-1.5 border-b border-gray-300">
              <button onClick={handleWhatsApp}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#25d366] hover:bg-[#1fb857] text-white text-xs font-bold transition-colors">
                <MessageCircle className="w-3.5 h-3.5" /> Send WhatsApp
              </button>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />
        </div>
      </div>

      {/* ── BOTTOM FUNCTION KEY BAR ── */}
      <div className="bg-[#1a3a5c] border-t-2 border-[#0d2440] px-2 py-1.5 flex items-center gap-1.5 shrink-0 flex-wrap">
        {[
          { key: "F2", label: "New Item",   action: () => nameRef.current?.focus(), color: "bg-[#2a6496]" },
          { key: "F3", label: "Delete Row", action: deleteSelected,                 color: "bg-[#8b2020]" },
          { key: "F5", label: "Customer",   action: () => setShowPicker(true),      color: "bg-[#2a6496]" },
          { key: "F7", label: "Discount",   action: () => setInvoiceDiscount(prev => prev > 0 ? 0 : 5), color: "bg-[#5a4a20]" },
          { key: "F8", label: "WhatsApp",   action: handleWhatsApp,                 color: "bg-[#1a5a30]" },
          { key: "F9", label: "Print",      action: handlePrint,                    color: "bg-[#2a6496]" },
          { key: "F10", label: "Save & Bill", action: handleSave,                   color: "bg-[#1a6a20]" },
          { key: "ESC", label: "Clear All", action: clearForm,                      color: "bg-[#7a2020]" },
        ].map(btn => (
          <button key={btn.key} onClick={btn.action}
            className={`flex items-center gap-1 ${btn.color} hover:brightness-110 text-white text-[11px] font-bold px-2.5 py-1 rounded border border-white/20 transition-all active:scale-95`}>
            <span className="bg-white/20 px-1 py-0.5 rounded text-[10px] font-mono">{btn.key}</span>
            <span>{btn.label}</span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 text-white animate-spin" />}
          <button onClick={handleSave} disabled={saving || items.length === 0}
            className="flex items-center gap-2 bg-[#1a7a20] hover:bg-[#145f18] disabled:opacity-40 text-white text-sm font-black px-4 py-1.5 rounded border border-white/20 transition-all active:scale-95">
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "SAVE & BILL"}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── MOBILE fallback (card layout) ── */
  const MobileView = () => (
    <div className="flex flex-col gap-3 pb-32 px-4 pt-4">
      {/* Customer */}
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
            {customer?.name?.[0]?.toUpperCase() ?? <User className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{customer?.name ?? "Walk-in Customer"}</p>
            {customer?.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
          </div>
          <button onClick={() => setCustomer(undefined)} className="text-muted-foreground hover:text-foreground p-1"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Add Item */}
      <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Add Item</p>
        <Input ref={nameRef} value={prodName} onChange={e => setProdName(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") addItem(); }}
          placeholder="Product name… (Enter to add)" className="h-11 text-sm font-medium" />
        <div className="flex gap-2 flex-wrap">
          <Select value={mode} onValueChange={v => setMode(v as SellingMode)}>
            <SelectTrigger className="h-10 w-[90px] text-xs shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="grams">Grams</SelectItem>
              <SelectItem value="kg">KG</SelectItem>
              <SelectItem value="amount">Rs Amt</SelectItem>
              <SelectItem value="box">Boxes</SelectItem>
              <SelectItem value="custom">Qty/pcs</SelectItem>
            </SelectContent>
          </Select>
          <Input type="number" value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") addItem(); }}
            placeholder={mode === "grams" ? "Grams" : mode === "kg" ? "KG" : mode === "box" ? "Boxes" : mode === "custom" ? "Qty" : "Amount (Rs)"}
            className="h-10 text-sm flex-1 min-w-[80px]" />
          {mode !== "amount" && (
            <Input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="Rate/kg" className="h-10 text-sm w-[90px] shrink-0" />
          )}
          {perm("apply_discount") && (
            <Input type="number" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="Disc%" className="h-10 text-sm w-[65px] shrink-0" />
          )}
        </div>
        <Button onClick={addItem} className="w-full h-10 gap-2 font-bold"><Plus className="w-4 h-4" /> Add Item</Button>
      </div>

      {/* Mobile items list */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-2xl">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">{weightStr(item)}{item.discount > 0 ? ` · ${item.discount}% off` : ""}</p>
              </div>
              <p className="font-bold text-sm text-primary tabular-nums shrink-0">{fmtRs(item.lineTotal)}</p>
              <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Mobile totals */}
      {items.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-4 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmtRs(subtotal)}</span></div>
            {invoiceDiscount > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount</span><span className="text-red-600 tabular-nums">−{fmtRs(discountAmt)}</span></div>}
            <div className="border-t border-border pt-2 flex justify-between items-center">
              <span className="font-bold">Grand Total</span>
              <span className="text-xl font-black text-primary tabular-nums">{fmtRs(grandTotal)}</span>
            </div>
          </div>
          <div className="px-4 pb-4 grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 block">Payment</label>
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
              <label className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 block">Status</label>
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
    </div>
  );

  return (
    <>
      {/* Desktop: Marg ERP style */}
      <div className="hidden md:block"><ERPDesktop /></div>
      {/* Mobile: card layout */}
      <div className="md:hidden"><MobileView /></div>

      {/* Mobile floating save bar */}
      <div className="md:hidden">
        {items.length > 0 && (
          <div className="fixed bottom-[64px] left-0 right-0 px-4 pb-2 z-40 pointer-events-none">
            <div className="bg-card border border-border rounded-2xl shadow-2xl p-3 flex items-center gap-2 pointer-events-auto">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground">{items.length} items · Grand Total</p>
                <p className="font-black text-lg text-primary tabular-nums">{fmtRs(grandTotal)}</p>
              </div>
              {customer?.phone && (
                <button onClick={handleWhatsApp} className="p-2.5 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                  <MessageCircle className="w-5 h-5" />
                </button>
              )}
              {perm("print_invoice") && (
                <button onClick={handlePrint} className="p-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
                  <Printer className="w-5 h-5 text-muted-foreground" />
                </button>
              )}
              <Button onClick={handleSave} disabled={saving} className="h-11 px-5 font-bold gap-2 rounded-xl">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
              </Button>
            </div>
          </div>
        )}
      </div>

      <CustomerPickerSheet open={showPicker} onClose={() => setShowPicker(false)} token={token} onPick={setCustomer} />
    </>
  );
}

/* ═══ Print Invoice ═══ */
function printInvoice(inv: any, branchName = "KDF NUTS") {
  const items: any[] = inv.items ?? [];
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${inv.invoiceNo ?? ""}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;max-width:80mm;margin:0 auto;padding:8px}.center{text-align:center}.bold{font-weight:bold}.line{border-top:1px dashed #000;margin:5px 0}.row{display:flex;justify-content:space-between;padding:2px 0}.title{font-size:15px;font-weight:bold;margin-bottom:2px}.item-name{flex:1;word-break:break-word}.amount{text-align:right;white-space:nowrap;margin-left:8px}.total-row{font-size:13px;font-weight:bold;border-top:2px solid #000;margin-top:4px;padding-top:4px}.badge{display:inline-block;padding:1px 6px;border:1px solid #000;border-radius:3px;font-size:10px;margin-top:3px}.sub{color:#555;font-size:10px;padding-left:4px;margin-bottom:2px}@media print{body{padding:0}}</style>
</head><body>
<div class="center"><div class="title">${branchName}</div><div style="font-size:10px">Invoice Receipt</div><div class="badge">${(inv.status ?? "draft").toUpperCase()}</div></div>
<div class="line"></div>
<div class="row"><span>Invoice #:</span><span class="bold">${inv.invoiceNo ?? "DRAFT"}</span></div>
<div class="row"><span>Date:</span><span>${new Date(inv.createdAt ?? Date.now()).toLocaleString("en-PK")}</span></div>
${inv.customerName ? `<div class="row"><span>Customer:</span><span>${inv.customerName}</span></div>` : ""}
${inv.customerPhone ? `<div class="row"><span>Phone:</span><span>${inv.customerPhone}</span></div>` : ""}
<div class="line"></div>
<div class="bold" style="margin-bottom:4px">Items</div>
${items.map(it => `<div class="row"><span class="item-name">${it.name ?? it.sku ?? "Item"}</span><span class="amount">Rs ${Number(it.lineTotal ?? 0).toLocaleString()}</span></div><div class="sub">Qty: ${it.inputValue ?? 1}${it.discount ? ` | Disc: ${it.discount}%` : ""}</div>`).join("")}
<div class="line"></div>
<div class="row"><span>Subtotal</span><span>Rs ${Number(inv.subtotal ?? 0).toLocaleString()}</span></div>
${Number(inv.discountAmt ?? 0) > 0 ? `<div class="row"><span>Discount</span><span>-Rs ${Number(inv.discountAmt).toLocaleString()}</span></div>` : ""}
${Number(inv.shipping ?? 0) > 0 ? `<div class="row"><span>Shipping</span><span>Rs ${Number(inv.shipping).toLocaleString()}</span></div>` : ""}
${Number(inv.taxAmt ?? 0) > 0 ? `<div class="row"><span>Tax</span><span>Rs ${Number(inv.taxAmt).toLocaleString()}</span></div>` : ""}
<div class="row total-row"><span>GRAND TOTAL</span><span>Rs ${Number(inv.grandTotal ?? 0).toLocaleString()}</span></div>
<div class="line"></div>
<div class="row"><span>Payment:</span><span class="bold">${inv.paymentMethod ?? "cash"} — ${inv.paymentStatus ?? "unpaid"}</span></div>
${inv.notes ? `<div class="sub" style="margin-top:4px">Note: ${inv.notes}</div>` : ""}
<div class="line"></div>
<div class="center" style="margin-top:6px;font-size:10px">Thank you for your purchase!</div>
</body></html>`;
  const w = window.open("", "_blank", "width=420,height=700,scrollbars=yes");
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 400); }
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
      const it = arr[idx];
      const qty   = Number(it.inputValue ?? it.qty ?? it.quantity ?? 1);
      const price = Number(it.customPrice ?? it.pricePerKg ?? it.price ?? 0);
      const disc  = Number(it.discount ?? 0);
      const raw   = qty * price;
      arr[idx].lineTotal = Math.max(0, raw - (raw * disc / 100));
      if (it.total !== undefined) arr[idx].total = arr[idx].lineTotal;
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
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
              Items ({items.length})
            </p>
            {items.length === 0 ? (
              <div className="border-2 border-dashed border-border rounded-xl py-6 text-center text-xs text-muted-foreground">
                No items stored in this invoice
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((it: any, idx: number) => {
                  const qty      = it.inputValue ?? it.qty ?? it.quantity ?? 1;
                  const rate     = it.customPrice ?? it.pricePerKg ?? it.price ?? 0;
                  const disc     = it.discount ?? 0;
                  const total    = it.lineTotal ?? it.total ?? 0;
                  const qtyField = it.inputValue !== undefined ? "inputValue" : it.qty !== undefined ? "qty" : "quantity";
                  const priceField = it.customPrice !== undefined ? "customPrice" : it.pricePerKg !== undefined ? "pricePerKg" : "price";

                  return (
                    <div key={idx} className="bg-card border border-border rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-semibold text-sm">{it.name ?? it.sku ?? "Item"}</p>
                          {it.sellingMode && <p className="text-[10px] text-muted-foreground capitalize">{it.sellingMode}</p>}
                        </div>
                        <button onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600 shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground">Qty/Value</label>
                          <Input type="number" value={qty} className="h-8 text-xs"
                            onChange={e => updateItem(idx, qtyField, Number(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Rate/Price</label>
                          <Input type="number" value={rate} className="h-8 text-xs"
                            onChange={e => updateItem(idx, priceField, Number(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Disc%</label>
                          <Input type="number" value={disc} className="h-8 text-xs"
                            onChange={e => updateItem(idx, "discount", Number(e.target.value))} />
                        </div>
                      </div>
                      <div className="mt-2 flex justify-between items-center">
                        <span className="text-[10px] text-muted-foreground">{qty} × {fmtRs(rate)}{disc > 0 ? ` − ${disc}%` : ""}</span>
                        <span className="text-xs font-bold text-primary">{fmtRs(Number(total))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
  const { user, branch } = useBranchAuth();
  const perm = (p: string) => user?.role === "manager" || !!(user?.permissions?.[p]);

  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPay, setFilterPay]   = useState("all");
  const [search, setSearch]         = useState("");
  const [editInv, setEditInv]       = useState<Invoice | null>(null);
  const [returnInv, setReturnInv]   = useState<Invoice | null>(null);
  const [detailInv, setDetailInv]   = useState<Invoice | null>(null);
  const [deleteInv, setDeleteInv]   = useState<Invoice | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { toast } = useToast();

  const loadInvoices = useCallback(async (pg = 1, append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: "20" });
      if (filterStatus !== "all") params.set("status", filterStatus);
      const d = await branchFetch(`/api/branch/invoices?${params}`, token);
      if (append) setInvoices(prev => [...prev, ...(d.invoices ?? [])]);
      else { setInvoices(d.invoices ?? []); setPage(1); }
      if (!append) setPage(1); else setPage(pg);
      setTotal(d.total ?? 0);
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    }
    if (!append) setLoading(false);
    else setLoadingMore(false);
  }, [token, filterStatus, toast]);

  useEffect(() => { loadInvoices(1, false); }, [token, filterStatus]);

  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase();
    const matchQ = inv.invoiceNo.toLowerCase().includes(q) || (inv.customerName ?? "").toLowerCase().includes(q);
    const matchPay = filterPay === "all" || inv.paymentStatus === filterPay;
    return matchQ && matchPay;
  });

  const canReturn = (inv: Invoice) => perm("return_invoice") && !["returned", "refunded"].includes(inv.status);
  const canEdit   = (inv: Invoice) => perm("edit_invoice") && !["returned", "refunded"].includes(inv.status);
  const canDelete = () => perm("delete_invoice");

  const handleDelete = async () => {
    if (!deleteInv) return;
    setDeleteLoading(true);
    try {
      await branchFetch(`/api/branch/invoices/${deleteInv.id}`, token, { method: "DELETE" });
      toast({ title: "Invoice deleted", description: deleteInv.invoiceNo });
      setDeleteInv(null);
      loadInvoices(1, false);
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    }
    setDeleteLoading(false);
  };

  return (
    <div className="space-y-3 pb-24">
      {/* Edit / Return Modals */}
      {editInv   && <InvoiceEditModal invoice={editInv}   token={token} onClose={() => setEditInv(null)}   onSaved={() => loadInvoices(1, false)} />}
      {returnInv && <ReturnModal      invoice={returnInv} token={token} onClose={() => setReturnInv(null)} onSaved={() => loadInvoices(1, false)} />}

      {/* Delete Confirmation Sheet */}
      {deleteInv && (
        <Sheet open onOpenChange={v => { if (!v) setDeleteInv(null); }}>
          <SheetContent side="bottom" className="h-auto rounded-t-3xl p-0">
            <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
              <SheetTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5" /> Delete Invoice
              </SheetTitle>
            </SheetHeader>
            <div className="px-5 py-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1.5">
                <p className="text-sm font-bold text-red-700">{deleteInv.invoiceNo}</p>
                <p className="text-xs text-red-600">{deleteInv.customerName ?? "Walk-in"} · {fmtRs(Number(deleteInv.grandTotal))}</p>
                <p className="text-xs text-red-500 mt-2 leading-relaxed">This action cannot be undone. The invoice will be permanently deleted and recorded in the audit log.</p>
              </div>
            </div>
            <div className="px-4 pb-6 pt-1 flex gap-3">
              <Button variant="outline" onClick={() => setDeleteInv(null)} className="flex-1 h-12">Cancel</Button>
              <Button onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 h-12 font-bold bg-red-600 hover:bg-red-700 text-white gap-2">
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}

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
              <Button variant="outline" className="h-11 gap-2 text-muted-foreground"
                onClick={() => printInvoice(detailInv, branch?.name)}>
                <Printer className="w-4 h-4" /> Print
              </Button>
              {canEdit(detailInv) && (
                <Button variant="outline" className="h-11 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={() => { setEditInv(detailInv); setDetailInv(null); }}>
                  <Pencil className="w-4 h-4" /> Edit
                </Button>
              )}
              {canReturn(detailInv) && (
                <Button variant="outline" className="h-11 gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                  onClick={() => { setReturnInv(detailInv); setDetailInv(null); }}>
                  <RotateCcw className="w-4 h-4" /> Return
                </Button>
              )}
              {canDelete() && (
                <Button variant="outline" className="h-11 gap-2 text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => { setDeleteInv(detailInv); setDetailInv(null); }}>
                  <Trash2 className="w-4 h-4" /> Delete
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
          <button onClick={() => loadInvoices(1, false)} className="p-2.5 rounded-xl border border-border hover:bg-muted transition-colors shrink-0">
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
              <div className="flex items-center gap-0.5 justify-end mt-1">
                <button onClick={e => { e.stopPropagation(); printInvoice(inv, branch?.name); }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Print">
                  <Printer className="w-3.5 h-3.5" />
                </button>
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
                {canDelete() && (
                  <button onClick={e => { e.stopPropagation(); setDeleteInv(inv); }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </button>
      ))}

      {/* Load More */}
      {!loading && invoices.length < total && (
        <button
          onClick={() => loadInvoices(page + 1, true)}
          disabled={loadingMore}
          className="w-full py-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loadingMore ? "Loading…" : `Load More (${total - invoices.length} remaining)`}
        </button>
      )}

      {/* Total loaded indicator */}
      {!loading && total > 0 && invoices.length >= total && invoices.length > 0 && (
        <p className="text-center text-xs text-muted-foreground py-2">
          All {total} invoice{total !== 1 ? "s" : ""} loaded
        </p>
      )}
    </div>
  );
}

/* ═══ Customers Tab ═══ */
function CustomersTab({ token }: { token: string }) {
  const { user } = useBranchAuth();
  const canAddCustomer = user?.role === "manager" || !!(user?.permissions?.add_customer);

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
        {canAddCustomer && (
          <Button onClick={() => setShowAdd(v => !v)} variant={showAdd ? "default" : "outline"} size="sm" className="h-10 px-3 shrink-0 gap-1.5">
            <UserPlus className="w-4 h-4" /><span className="hidden sm:inline">Add</span>
          </Button>
        )}
      </div>

      {showAdd && canAddCustomer && (
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
  const { isAuthenticated, isLoading, token, user, branch, logout, refresh } = useBranchAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("pos");

  const isManager = user?.role === "manager";
  const hasPerm = (p: string) => isManager || !!(user?.permissions?.[p]);

  const allTabs: { id: Tab; label: string; icon: any; perm?: string }[] = [
    { id: "pos",       label: "POS",      icon: Receipt,  perm: "create_invoice"    },
    { id: "history",   label: "History",  icon: Clock,    perm: "view_all_invoices" },
    { id: "customers", label: "Customers",icon: Users                               },
    { id: "stats",     label: "Stats",    icon: BarChart2,perm: "view_analytics"    },
  ];
  const tabs = allTabs.filter(t => !t.perm || hasPerm(t.perm));

  /* ALL hooks must be called before any early return */
  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/branch-login");
  }, [isAuthenticated, isLoading, navigate]);

  /* Auto-refresh permissions when page becomes visible again */
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  useEffect(() => {
    if (tabs.length > 0 && !tabs.find(t => t.id === tab)) {
      setTab(tabs[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.map(t => t.id).join(",")]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !token) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-card border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-black text-sm truncate">{branch?.name ?? "Branch"}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.name} · {user?.role}</p>
          </div>

          {/* Desktop tab bar inside header */}
          <div className="hidden md:flex items-center gap-1 ml-6 flex-1">
            {tabs.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    tab === t.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => refresh()}
              title="Refresh permissions"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 rounded-xl hover:bg-muted"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Refresh</span>
            </button>
            <button
              onClick={() => { logout(); navigate("/branch-login"); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-xl hover:bg-muted"
            >
              <LogOut className="w-3.5 h-3.5" /> <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 md:overflow-hidden">
        {tab === "pos"       && <PosTab       token={token} />}
        {tab === "history"   && <div className="px-4 pt-4 pb-4"><HistoryTab   token={token} /></div>}
        {tab === "customers" && <div className="px-4 pt-4 pb-4"><CustomersTab token={token} /></div>}
        {tab === "stats"     && <div className="px-4 pt-4 pb-4"><StatsTab     token={token} /></div>}
      </div>

      {/* Bottom Tab Bar — mobile only */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border safe-area-pb md:hidden">
        <div className="flex">
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
