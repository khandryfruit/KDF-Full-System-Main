import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";
import {
  ShoppingCart, Search, Plus, Minus, X, Trash2, User,
  CreditCard, Banknote, Smartphone, CheckCircle, Printer,
  Share2, RefreshCw, Receipt, Package, Copy,
} from "lucide-react";

/* ── types ───────────────────────────────────────────── */
interface CartItem {
  id: number;
  title: string;
  price: number;
  qty: number;
  imageUrl?: string | null;
}

/* ── print invoice ───────────────────────────────────── */
function printInvoice(invoice: any) {
  const items: any[] = invoice.items ?? [];
  const date = new Date(invoice.createdAt ?? Date.now()).toLocaleDateString("en-PK", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const rows = items.map(it => `
    <tr>
      <td style="padding:6px 4px;border-bottom:1px solid #eee">${it.name ?? it.title ?? "—"}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:center">×${it.qty}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right">Rs ${Number(it.price ?? 0).toLocaleString()}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right">Rs ${Number(it.subtotal ?? (it.price * it.qty)).toLocaleString()}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Invoice ${invoice.invoiceNo}</title>
<style>
  * { margin:0;padding:0;box-sizing:border-box; }
  body { font-family:Arial,sans-serif;color:#000;background:#fff;font-size:12pt; }
  @media print { body{margin:0} }
  .wrap { width:80mm;margin:0 auto;padding:6mm; }
  .header { text-align:center;border-bottom:2px solid #000;padding-bottom:4mm;margin-bottom:4mm }
  .brand { font-size:20pt;font-weight:900 }
  .brand span { color:#16a34a }
  .inv-no { font-size:10pt;color:#555 }
  table { width:100%;border-collapse:collapse }
  th { font-size:9pt;text-align:left;padding:4px;border-bottom:2px solid #000;background:#f8f8f8 }
  .totals td { padding:4px 4px }
  .grand { font-weight:900;font-size:14pt;color:#000;border-top:2px solid #000 }
  .payment-badge { display:inline-block;background:#16a34a;color:#fff;font-size:9pt;font-weight:bold;padding:2px 8px;border-radius:12px;margin-top:4mm }
  .footer { text-align:center;font-size:8pt;color:#888;margin-top:4mm;border-top:1px solid #eee;padding-top:3mm }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="brand">KDF <span>NUTS</span></div>
    <div class="inv-no">Invoice: ${invoice.invoiceNo}</div>
    <div style="font-size:9pt;color:#555;margin-top:2mm">${date}</div>
  </div>

  <div style="margin-bottom:3mm;font-size:10pt">
    <strong>${invoice.customerName ?? "Walk-in Customer"}</strong>
    ${invoice.customerPhone ? `<div style="color:#555;font-size:9pt">${invoice.customerPhone}</div>` : ""}
  </div>

  <table>
    <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals" style="margin-top:3mm">
    ${Number(invoice.discountAmt ?? 0) > 0 ? `
    <tr><td>Subtotal</td><td style="text-align:right">Rs ${Number(invoice.subtotal ?? 0).toLocaleString()}</td></tr>
    <tr><td>Discount</td><td style="text-align:right;color:#e11d48">-Rs ${Number(invoice.discountAmt ?? 0).toLocaleString()}</td></tr>` : ""}
    <tr class="grand"><td><strong>Total</strong></td><td style="text-align:right"><strong>Rs ${Number(invoice.grandTotal ?? 0).toLocaleString()}</strong></td></tr>
  </table>

  <div class="payment-badge">${(invoice.paymentMethod ?? "cash").toUpperCase()} · PAID</div>
  <div class="footer">Thank you for shopping at KDF NUTS 🥜<br>kdfnuts.com</div>
</div>
<script>window.onload=function(){ setTimeout(()=>window.print(),300); }</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=380,height=600");
  if (w) { w.document.write(html); w.document.close(); }
}

/* ── invoice success modal ───────────────────────────── */
function InvoiceSuccessModal({ invoice, onClose, onNew }: {
  invoice: any; onClose: () => void; onNew: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(invoice.invoiceNo).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };
  const shareWA = () => {
    const phone = invoice.customerPhone?.replace(/\D/g, "");
    const items: any[] = invoice.items ?? [];
    const itemLines = items.map((i: any) => `  • ${i.name ?? i.title} ×${i.qty} — Rs ${Number(i.subtotal ?? (i.price * i.qty)).toLocaleString()}`).join("\n");
    const text = encodeURIComponent(
      `🧾 *KDF NUTS Invoice*\n\n` +
      `Invoice: ${invoice.invoiceNo}\n` +
      `Customer: ${invoice.customerName ?? "Walk-in"}\n\n` +
      `*Items:*\n${itemLines}\n\n` +
      `*Total: Rs ${Number(invoice.grandTotal).toLocaleString()}*\n` +
      `Payment: ${(invoice.paymentMethod ?? "cash").toUpperCase()} · PAID\n\n` +
      `Thank you for shopping at KDF NUTS! 🥜`
    );
    window.open(phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-end justify-center">
      <div className="bg-card border border-border rounded-t-3xl w-full shadow-2xl">
        <div className="relative p-6 pb-4 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/15 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-lg font-bold">Invoice Created!</h2>
          <p className="text-xs text-muted-foreground mt-1">{invoice.customerName ?? "Walk-in Customer"}</p>
          <button onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mx-4 mb-4 bg-muted/60 border border-border rounded-2xl p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Invoice Number</p>
          <p className="text-2xl font-black font-mono text-primary">{invoice.invoiceNo}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Total: <b className="text-foreground">Rs {Number(invoice.grandTotal).toLocaleString()}</b>
            <span className="ml-2 text-green-400 font-semibold">· PAID</span>
          </p>
        </div>

        <div className="px-4 pb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={copy}
              className={`flex items-center justify-center gap-2 h-11 rounded-xl border text-sm font-semibold ${
                copied ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-muted border-border text-foreground"
              }`}>
              <Copy className="w-4 h-4" />{copied ? "Copied!" : "Copy No."}
            </button>
            <button onClick={shareWA}
              className="flex items-center justify-center gap-2 h-11 rounded-xl bg-green-600 text-white text-sm font-semibold">
              <Share2 className="w-4 h-4" /> Send WA
            </button>
          </div>
          <button onClick={() => printInvoice(invoice)}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-muted border border-border text-sm font-semibold text-foreground">
            <Printer className="w-4 h-4" /> Print Invoice
          </button>
          <button onClick={onNew}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
            + New Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── POS tab ─────────────────────────────────────────── */
function POSTab({ token }: { token: string | null }) {
  const qc = useQueryClient();
  const [searchQ, setSearchQ]       = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [cart, setCart]             = useState<CartItem[]>([]);
  const [customerName, setCustName] = useState("");
  const [customerPhone, setCustPhone] = useState("");
  const [discountPct, setDiscount]  = useState(0);
  const [payMethod, setPayMethod]   = useState<"cash" | "card" | "online">("cash");
  const [successInv, setSuccessInv] = useState<any | null>(null);

  /* debounce search */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ), 400);
    return () => clearTimeout(t);
  }, [searchQ]);

  const h = useCallback(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token]
  );

  const { data: searchData, isFetching: searching } = useQuery<any>({
    queryKey: ["pos-search", debouncedQ],
    queryFn: () =>
      fetch(
        `/api/admin/shopify/products?limit=6&status=active${debouncedQ ? `&search=${encodeURIComponent(debouncedQ)}` : ""}`,
        { headers: h() }
      ).then(r => r.json()),
    enabled: true,
    staleTime: 10_000,
  });

  const results: any[] = (searchData?.products ?? []).slice(0, 6);

  /* cart operations */
  const addToCart = (p: any) => {
    const price = Number(p.price ?? 0);
    setCart(c => {
      const ex = c.find(i => i.id === p.id);
      if (ex) return c.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...c, { id: p.id, title: p.title, price, qty: 1, imageUrl: p.imageUrl }];
    });
  };

  const changeQty = (id: number, delta: number) => {
    setCart(c => c.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
  };

  const removeFromCart = (id: number) => setCart(c => c.filter(i => i.id !== id));

  /* totals */
  const subtotal    = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmt = Math.round(subtotal * discountPct / 100);
  const grandTotal  = subtotal - discountAmt;

  /* create invoice */
  const invoiceMutation = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Cart is empty");
      const r = await fetch("/api/admin/branch-invoices", {
        method: "POST", headers: h(),
        body: JSON.stringify({
          customerName:  customerName  || "Walk-in Customer",
          customerPhone: customerPhone || null,
          items: cart.map(i => ({ name: i.title, qty: i.qty, price: i.price, subtotal: i.price * i.qty })),
          subtotal, discountPct, discountAmt,
          grandTotal, paymentMethod: payMethod, paymentStatus: "paid", paidAmount: grandTotal,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to create invoice");
      return d.invoice;
    },
    onSuccess: (inv) => {
      setSuccessInv(inv);
      qc.invalidateQueries({ queryKey: ["pos-history"] });
    },
  });

  const resetPOS = () => {
    setCart([]); setCustName(""); setCustPhone("");
    setDiscount(0); setPayMethod("cash"); setSuccessInv(null);
    invoiceMutation.reset();
  };

  const PAY_OPTS = [
    { id: "cash",   label: "Cash",   Icon: Banknote   },
    { id: "card",   label: "Card",   Icon: CreditCard },
    { id: "online", label: "Online", Icon: Smartphone },
  ] as const;

  return (
    <div className="p-4 space-y-4 pb-6">
      {/* product search */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Search Products</p>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />}
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Search by name…"
            className="w-full pl-9 pr-9 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground" />
        </div>

        {results.length > 0 && (
          <div className="space-y-1.5">
            {results.map((p: any) => (
              <button key={p.id} onClick={() => addToCart(p)}
                className="w-full flex items-center gap-3 px-3 py-2 bg-card border border-border rounded-xl text-left active:scale-[0.98] transition hover:border-primary/30">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-muted-foreground/40" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{p.title}</p>
                  <p className="text-[10px] text-primary font-bold">Rs {Number(p.price ?? 0).toLocaleString()}</p>
                </div>
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Plus className="w-3.5 h-3.5 text-primary" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* cart */}
      {cart.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <ShoppingCart className="w-3 h-3" /> Cart ({cart.length} item{cart.length !== 1 ? "s" : ""})
          </p>
          <div className="space-y-1.5">
            {cart.map(item => (
              <div key={item.id} className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{item.title}</p>
                  <p className="text-[10px] text-primary">Rs {(item.price * item.qty).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => changeQty(item.id, -1)}
                    className="w-6 h-6 rounded-lg bg-card border border-border flex items-center justify-center">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center text-xs font-bold">{item.qty}</span>
                  <button onClick={() => changeQty(item.id, 1)}
                    className="w-6 h-6 rounded-lg bg-card border border-border flex items-center justify-center">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeFromCart(item.id)}
                    className="w-6 h-6 rounded-lg bg-red-500/10 flex items-center justify-center ml-1">
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* customer */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <User className="w-3 h-3" /> Customer
        </p>
        <input value={customerName} onChange={e => setCustName(e.target.value)}
          placeholder="Name (or Walk-in Customer)"
          className="w-full h-10 rounded-xl bg-card border border-border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground" />
        <input value={customerPhone} onChange={e => setCustPhone(e.target.value)}
          placeholder="Phone (optional)"
          type="tel"
          className="w-full h-10 rounded-xl bg-card border border-border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground" />
      </div>

      {/* discount */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Discount</p>
        <div className="flex gap-2">
          {[0, 5, 10, 15, 20].map(d => (
            <button key={d} onClick={() => setDiscount(d)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${
                discountPct === d ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"
              }`}>
              {d === 0 ? "None" : `${d}%`}
            </button>
          ))}
        </div>
      </div>

      {/* payment method */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Payment Method</p>
        <div className="grid grid-cols-3 gap-2">
          {PAY_OPTS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setPayMethod(id)}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition ${
                payMethod === id ? "border-primary bg-primary/5" : "border-border bg-muted"
              }`}>
              <Icon className={`w-5 h-5 ${payMethod === id ? "text-primary" : "text-muted-foreground"}`} />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* total summary */}
      {cart.length > 0 && (
        <div className="bg-muted rounded-2xl p-4 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Subtotal</span>
            <span>Rs {subtotal.toLocaleString()}</span>
          </div>
          {discountAmt > 0 && (
            <div className="flex justify-between text-xs text-red-400">
              <span>Discount ({discountPct}%)</span>
              <span>-Rs {discountAmt.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold border-t border-border pt-2 mt-2">
            <span>Total</span>
            <span className="text-primary">Rs {grandTotal.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* error */}
      {invoiceMutation.isError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
          {(invoiceMutation.error as any)?.message ?? "Failed to create invoice"}
        </div>
      )}

      {/* create button */}
      <button
        onClick={() => invoiceMutation.mutate()}
        disabled={invoiceMutation.isPending || cart.length === 0}
        className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
        {invoiceMutation.isPending
          ? <><div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Creating Invoice…</>
          : <><Receipt className="w-5 h-5" /> Create Invoice · Rs {grandTotal.toLocaleString()}</>
        }
      </button>

      {/* success modal */}
      {successInv && (
        <InvoiceSuccessModal
          invoice={successInv}
          onClose={() => setSuccessInv(null)}
          onNew={resetPOS}
        />
      )}
    </div>
  );
}

/* ── history tab ─────────────────────────────────────── */
function HistoryTab({ token }: { token: string | null }) {
  const h = () => ({ Authorization: `Bearer ${token}` });
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ["pos-history", page],
    queryFn: () =>
      fetch(`/api/admin/branch-invoices?page=${page}&limit=15`, { headers: h() })
        .then(r => r.json()),
    staleTime: 15_000,
  });

  const invoices: any[] = data?.invoices ?? [];
  const total = data?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / 15) : 1;

  const PAY_COLOR: Record<string, string> = {
    paid:    "text-green-400 bg-green-500/10",
    unpaid:  "text-red-400 bg-red-500/10",
    partial: "text-amber-400 bg-amber-500/10",
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{total} invoices total</p>
        <button onClick={() => refetch()} className="w-7 h-7 flex items-center justify-center rounded-lg bg-muted">
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="py-16 text-center">
          <Receipt className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No invoices yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv: any) => (
            <div key={inv.id} className="bg-card border border-border rounded-2xl p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold font-mono">{inv.invoiceNo}</p>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${PAY_COLOR[inv.paymentStatus] ?? PAY_COLOR.unpaid}`}>
                      {inv.paymentStatus?.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {inv.customerName ?? "Walk-in"} {inv.customerPhone ? `· ${inv.customerPhone}` : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(inv.createdAt).toLocaleDateString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {inv.branchName ? ` · ${inv.branchName}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold text-primary">Rs {Number(inv.grandTotal ?? 0).toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{inv.paymentMethod}</p>
                </div>
              </div>
              {/* items preview */}
              {Array.isArray(inv.items) && inv.items.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1">
                  {(inv.items as any[]).slice(0, 3).map((it: any, i: number) => (
                    <span key={i} className="text-[9px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      {it.name ?? it.title} ×{it.qty}
                    </span>
                  ))}
                  {inv.items.length > 3 && (
                    <span className="text-[9px] text-muted-foreground">+{inv.items.length - 3} more</span>
                  )}
                </div>
              )}
              <button onClick={() => printInvoice(inv)}
                className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition">
                <Printer className="w-3 h-3" /> Print
              </button>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="flex-1 h-10 rounded-xl bg-card border border-border text-sm disabled:opacity-40">← Prev</button>
          <span className="flex items-center px-3 text-xs text-muted-foreground">{page}/{totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="flex-1 h-10 rounded-xl bg-card border border-border text-sm disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}

/* ── main page ───────────────────────────────────────── */
export default function InvoicePOSPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<"pos" | "history">("pos");

  return (
    <AppShell title="POS / Invoice">
      {/* tab pills */}
      <div className="sticky top-14 z-10 bg-background border-b border-border px-4 py-2 flex gap-2">
        <button onClick={() => setTab("pos")}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${tab === "pos" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          🧾 POS Billing
        </button>
        <button onClick={() => setTab("history")}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${tab === "history" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          📋 History
        </button>
      </div>

      {tab === "pos"
        ? <POSTab token={token} />
        : <HistoryTab token={token} />
      }
    </AppShell>
  );
}
