import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

/* ─── Types ──────────────────────────────────────────────── */
interface Product {
  id: number; name: string; sku?: string; price: string; originalPrice?: string;
  stock: number; images?: string[]; unit?: string; weight?: number; variants?: any[];
}
interface CartRow {
  rowId: string; productId: number; sku: string; name: string;
  qty: number; unit: string; pricePerUnit: number; discount: number; total: number;
}
interface Customer { id: number; name: string; phone?: string; email?: string; }

/* ─── Helpers ─────────────────────────────────────────────── */
const fmtRs = (n: number) => `Rs ${n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const uid   = () => Math.random().toString(36).slice(2, 8);

function calcRow(row: CartRow): CartRow {
  const raw   = row.qty * row.pricePerUnit;
  const total = Math.max(0, raw - (raw * row.discount / 100));
  return { ...row, total };
}

function adminFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  }).then(r => {
    if (!r.ok) return r.json().then(e => { throw new Error(e.error ?? r.statusText); });
    return r.json();
  });
}

/* ─── Thermal Print ───────────────────────────────────────── */
function printBill(rows: CartRow[], subtotal: number, discount: number, grand: number, customer: Customer | null, payMethod: string, amtReceived: number, billNo: string, remarks: string) {
  const change = Math.max(0, amtReceived - grand);
  const w = window.open("", "_blank", "width=340,height=700");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Courier New',monospace;font-size:12px;width:302px;}
    .c{text-align:center;}.r{text-align:right;}.b{font-weight:bold;}
    .sep{border-top:1px dashed #000;margin:4px 0;}
    table{width:100%;border-collapse:collapse;}td{vertical-align:top;padding:1px 2px;}
    .nb{border:none;}
  </style></head><body>
  <div class="c b" style="font-size:16px">KDF NUTS</div>
  <div class="c" style="font-size:10px">Khan Baba Dry Fruits</div>
  <div class="sep"></div>
  <div>Bill#: <b>${billNo}</b></div>
  <div>Date: ${new Date().toLocaleString("en-PK")}</div>
  ${customer ? `<div>Customer: ${customer.name}${customer.phone ? " / " + customer.phone : ""}</div>` : ""}
  <div>Payment: ${payMethod}</div>
  <div class="sep"></div>
  <table>
    <tr class="b"><td>#</td><td>Item</td><td class="r">Qty</td><td class="r">Rate</td><td class="r">Total</td></tr>
    <tr><td colspan="5" class="sep"></td></tr>
    ${rows.map((r, i) => `<tr>
      <td>${i + 1}</td><td>${r.name}${r.discount > 0 ? `<br><small>-${r.discount}% disc</small>` : ""}</td>
      <td class="r">${r.qty}${r.unit}</td>
      <td class="r">${fmtRs(r.pricePerUnit)}</td>
      <td class="r">${fmtRs(r.total)}</td>
    </tr>`).join("")}
  </table>
  <div class="sep"></div>
  <div class="r">Subtotal: ${fmtRs(subtotal)}</div>
  ${discount > 0 ? `<div class="r">Bill Disc: -${discount}%</div>` : ""}
  <div class="r b" style="font-size:14px">TOTAL: ${fmtRs(grand)}</div>
  <div class="sep"></div>
  <div>Received: ${fmtRs(amtReceived)}</div>
  <div class="b">Change: ${fmtRs(change)}</div>
  ${remarks ? `<div class="sep"></div><div>Remarks: ${remarks}</div>` : ""}
  <div class="sep"></div>
  <div class="c" style="font-size:10px">Thank you! Visit Again</div>
  <div class="c" style="font-size:10px">khanbabadryfruits.com</div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 300);
}

/* ─── Modal: Change Qty ───────────────────────────────────── */
function QtyModal({ row, onSave, onClose }: { row: CartRow; onSave: (qty: number) => void; onClose: () => void }) {
  const [qty, setQty] = useState(String(row.qty));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Change Quantity — {row.name}</h3>
        <div className="pos-modal-body">
          <label className="pos-label">Quantity ({row.unit})</label>
          <input ref={ref} type="number" min="0.001" step="any" value={qty} onChange={e => setQty(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onSave(parseFloat(qty) || row.qty); if (e.key === "Escape") onClose(); }}
            className="pos-input w-full text-2xl font-bold text-center" />
        </div>
        <div className="pos-modal-footer">
          <button className="pos-btn-ghost" onClick={onClose}>Cancel [Esc]</button>
          <button className="pos-btn-primary" onClick={() => onSave(parseFloat(qty) || row.qty)}>Save [Enter]</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Modal: Item Discount ─────────────────────────────────── */
function ItemDiscModal({ row, onSave, onClose }: { row: CartRow; onSave: (disc: number) => void; onClose: () => void }) {
  const [disc, setDisc] = useState(String(row.discount));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Item Discount — {row.name}</h3>
        <div className="pos-modal-body">
          <label className="pos-label">Discount %</label>
          <input ref={ref} type="number" min="0" max="100" value={disc} onChange={e => setDisc(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onSave(parseFloat(disc) || 0); if (e.key === "Escape") onClose(); }}
            className="pos-input w-full text-2xl font-bold text-center" />
          {row.pricePerUnit > 0 && parseFloat(disc) > 0 && (
            <p className="text-center text-sm text-green-600 mt-2 font-semibold">
              Discounted price: {fmtRs(row.pricePerUnit * (1 - parseFloat(disc) / 100))}
            </p>
          )}
        </div>
        <div className="pos-modal-footer">
          <button className="pos-btn-ghost" onClick={onClose}>Cancel [Esc]</button>
          <button className="pos-btn-primary" onClick={() => onSave(parseFloat(disc) || 0)}>Apply [Enter]</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Modal: Bill Discount ─────────────────────────────────── */
function BillDiscModal({ value, subtotal, onSave, onClose }: { value: number; subtotal: number; onSave: (d: number) => void; onClose: () => void }) {
  const [disc, setDisc] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  const discAmt = subtotal * (parseFloat(disc) || 0) / 100;
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Bill Discount</h3>
        <div className="pos-modal-body space-y-3">
          <div>
            <label className="pos-label">Discount %</label>
            <input ref={ref} type="number" min="0" max="100" value={disc} onChange={e => setDisc(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") onSave(parseFloat(disc) || 0); if (e.key === "Escape") onClose(); }}
              className="pos-input w-full text-2xl font-bold text-center" />
          </div>
          {discAmt > 0 && <p className="text-center text-green-600 font-semibold">Saving: {fmtRs(discAmt)}</p>}
          <p className="text-center text-sm text-muted">After discount: {fmtRs(subtotal - discAmt)}</p>
        </div>
        <div className="pos-modal-footer">
          <button className="pos-btn-ghost" onClick={onClose}>Cancel [Esc]</button>
          <button className="pos-btn-primary" onClick={() => onSave(parseFloat(disc) || 0)}>Apply [Enter]</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Modal: Additional Charges ───────────────────────────── */
function ChargesModal({ value, onSave, onClose }: { value: number; onSave: (v: number) => void; onClose: () => void }) {
  const [amt, setAmt] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Additional Charges</h3>
        <div className="pos-modal-body">
          <label className="pos-label">Amount (Rs.)</label>
          <input ref={ref} type="number" min="0" value={amt} onChange={e => setAmt(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onSave(parseFloat(amt) || 0); if (e.key === "Escape") onClose(); }}
            className="pos-input w-full text-2xl font-bold text-center" placeholder="e.g. 50" />
          <p className="text-xs text-center text-muted mt-2">e.g. delivery charges, packing, etc.</p>
        </div>
        <div className="pos-modal-footer">
          <button className="pos-btn-ghost" onClick={onClose}>Cancel [Esc]</button>
          <button className="pos-btn-primary" onClick={() => onSave(parseFloat(amt) || 0)}>Apply [Enter]</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Modal: Remarks ──────────────────────────────────────── */
function RemarksModal({ value, onSave, onClose }: { value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [txt, setTxt] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Remarks / Notes</h3>
        <div className="pos-modal-body">
          <textarea ref={ref} value={txt} onChange={e => setTxt(e.target.value)} rows={4}
            onKeyDown={e => { if (e.key === "Escape") onClose(); }}
            className="pos-input w-full resize-none" placeholder="Add remarks for this bill..." />
        </div>
        <div className="pos-modal-footer">
          <button className="pos-btn-ghost" onClick={onClose}>Cancel [Esc]</button>
          <button className="pos-btn-primary" onClick={() => onSave(txt)}>Save [Enter]</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Modal: Change Unit ──────────────────────────────────── */
const UNITS = ["pc", "kg", "g", "box", "pkt", "dz", "litre", "ml"];
function UnitModal({ row, onSave, onClose }: { row: CartRow; onSave: (u: string) => void; onClose: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Change Unit — {row.name}</h3>
        <div className="pos-modal-body">
          <div className="grid grid-cols-4 gap-2">
            {UNITS.map(u => (
              <button key={u} onClick={() => onSave(u)}
                className={`py-3 rounded-lg border text-sm font-bold uppercase transition-colors ${row.unit === u ? "bg-blue-600 text-white border-blue-600" : "border-border hover:bg-accent"}`}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="pos-modal-footer">
          <button className="pos-btn-ghost" onClick={onClose}>Cancel [Esc]</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Modal: Save Bill ────────────────────────────────────── */
function SaveBillModal({
  subtotal, billDisc, extraCharges, grandTotal, onClose, onSave, saving,
}: {
  subtotal: number; billDisc: number; extraCharges: number; grandTotal: number;
  onClose: () => void; saving: boolean; onSave: (method: string, received: number) => void;
}) {
  const [method, setMethod]     = useState("Cash");
  const [received, setReceived] = useState(String(Math.ceil(grandTotal)));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  const change = Math.max(0, parseFloat(received) - grandTotal);
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal" style={{ maxWidth: 440 }}>
        <h3 className="pos-modal-title">💳 Save & Print Bill</h3>
        <div className="pos-modal-body space-y-3">
          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{fmtRs(subtotal)}</span></div>
            {billDisc > 0 && <div className="flex justify-between text-green-600"><span>Bill Discount ({billDisc}%)</span><span>− {fmtRs(subtotal * billDisc / 100)}</span></div>}
            {extraCharges > 0 && <div className="flex justify-between"><span>Additional Charges</span><span>+ {fmtRs(extraCharges)}</span></div>}
            <div className="flex justify-between font-black text-base border-t border-dashed pt-1 mt-1">
              <span>TOTAL</span><span className="text-blue-700">{fmtRs(grandTotal)}</span>
            </div>
          </div>
          {/* Payment method */}
          <div>
            <label className="pos-label">Payment Mode</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {["Cash","Card","Transfer","EasyPaisa","JazzCash","Credit"].map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`py-2.5 rounded-lg border text-sm font-semibold transition-colors ${method === m ? "bg-blue-600 text-white border-blue-600" : "border-border hover:bg-accent"}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          {/* Amount received */}
          <div>
            <label className="pos-label">Amount Received (Rs.)</label>
            <input ref={ref} type="number" min="0" value={received} onChange={e => setReceived(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") onSave(method, parseFloat(received) || grandTotal); if (e.key === "Escape") onClose(); }}
              className="pos-input w-full text-2xl font-bold text-center" />
          </div>
          {/* Change */}
          <div className={`rounded-xl p-3 text-center font-black text-lg ${change > 0 ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"}`}>
            Change to Return: {fmtRs(change)}
          </div>
        </div>
        <div className="pos-modal-footer">
          <button className="pos-btn-ghost" onClick={onClose} disabled={saving}>Cancel [Esc]</button>
          <button className="pos-btn-primary" disabled={saving}
            onClick={() => onSave(method, parseFloat(received) || grandTotal)}>
            {saving ? "Saving…" : "🖨 Save & Print [Enter]"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Overlay ─────────────────────────────────────────────── */
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      {children}
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────── */
export default function AdminPOSPage() {
  const [, setLocation] = useLocation();

  /* ── Auth guard ── */
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  useEffect(() => { if (!token) setLocation("/login"); }, [token]);

  /* ── Cart ── */
  const [cart, setCart]           = useState<CartRow[]>([]);
  const [selectedRow, setSelected] = useState<string | null>(null);
  const [billDisc, setBillDisc]   = useState(0);
  const [extraCharges, setExtra]  = useState(0);
  const [remarks, setRemarks]     = useState("");

  /* ── Product search ── */
  const [query, setQuery]         = useState("");
  const [products, setProducts]   = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIdx, setSearchIdx]  = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<any>(null);

  /* ── Customer ── */
  const [customer, setCustomer]   = useState<Customer | null>(null);
  const [custQuery, setCustQuery] = useState("");
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [custSearching, setCustSearching] = useState(false);
  const custRef = useRef<HTMLInputElement>(null);
  const custTimer = useRef<any>(null);

  /* ── Modals ── */
  const [modal, setModal] = useState<
    null | "qty" | "itemDisc" | "billDisc" | "charges" | "remarks" | "unit" | "save"
  >(null);
  const [saving, setSaving] = useState(false);

  /* ── Bill number ── */
  const billNo = useRef(`POS-${Date.now()}`);

  /* ── Computed ── */
  const subtotal   = cart.reduce((s, r) => s + r.total, 0);
  const discAmt    = subtotal * billDisc / 100;
  const grandTotal = subtotal - discAmt + extraCharges;
  const selectedCartRow = cart.find(r => r.rowId === selectedRow) ?? null;

  /* ── Product search ── */
  const searchProducts = useCallback((q: string) => {
    clearTimeout(searchTimer.current);
    if (!q.trim()) { setProducts([]); setSearchOpen(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const d = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=20`).then(r => r.json());
        setProducts(d.items ?? []);
        setSearchOpen(true);
        setSearchIdx(0);
      } catch { setProducts([]); }
      setSearching(false);
    }, 220);
  }, []);

  useEffect(() => { searchProducts(query); }, [query]);

  /* ── Customer search ── */
  const searchCustomers = useCallback((q: string) => {
    clearTimeout(custTimer.current);
    if (!q.trim()) { setCustResults([]); return; }
    setCustSearching(true);
    custTimer.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem("kdf_admin_token") ?? "";
        const d = await fetch(`/api/admin/customers?search=${encodeURIComponent(q)}&limit=8`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json());
        setCustResults(d.customers ?? d.items ?? []);
      } catch { setCustResults([]); }
      setCustSearching(false);
    }, 280);
  }, []);

  useEffect(() => { searchCustomers(custQuery); }, [custQuery]);

  /* ── Add product to cart ── */
  const addProduct = (p: Product) => {
    const existing = cart.find(r => r.productId === p.id);
    if (existing) {
      setCart(prev => prev.map(r => r.rowId === existing.rowId ? calcRow({ ...r, qty: r.qty + 1 }) : r));
      setSelected(existing.rowId);
    } else {
      const row: CartRow = calcRow({
        rowId: uid(), productId: p.id,
        sku: p.sku ?? `P${p.id}`,
        name: p.name,
        qty: 1,
        unit: p.unit ?? "pc",
        pricePerUnit: parseFloat(p.price ?? "0"),
        discount: 0,
        total: 0,
      });
      setCart(prev => [...prev, row]);
      setSelected(row.rowId);
    }
    setQuery(""); setProducts([]); setSearchOpen(false);
    searchRef.current?.focus();
  };

  /* ── Cart row update helpers ── */
  const updateRow = (rowId: string, patch: Partial<CartRow>) => {
    setCart(prev => prev.map(r => r.rowId === rowId ? calcRow({ ...r, ...patch }) : r));
  };
  const removeRow = (rowId: string) => {
    setCart(prev => {
      const next = prev.filter(r => r.rowId !== rowId);
      if (selectedRow === rowId) setSelected(next[next.length - 1]?.rowId ?? null);
      return next;
    });
  };

  /* ── Save bill ── */
  const saveBill = async (payMethod: string, received: number) => {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const items = cart.map(r => ({
        name: r.name, sku: r.sku, qty: r.qty, unit: r.unit,
        pricePerUnit: r.pricePerUnit, discount: r.discount,
        lineTotal: r.total,
      }));
      await adminFetch("/api/admin/branch-invoices", {
        method: "POST",
        body: JSON.stringify({
          invoiceNo: billNo.current,
          type: "pos",
          status: "completed",
          customerName: customer?.name,
          customerPhone: customer?.phone,
          items,
          subtotal,
          discountAmt: discAmt,
          grandTotal,
          paymentMethod: payMethod.toLowerCase().replace(/ /g, "_"),
          paymentStatus: received >= grandTotal ? "paid" : "partial",
          paidAmount: received,
          notes: remarks,
          branchId: 1,
        }),
      });
      printBill(cart, subtotal, billDisc, grandTotal, customer, payMethod, received, billNo.current, remarks);
      /* reset */
      setCart([]); setSelected(null); setBillDisc(0); setExtra(0); setRemarks("");
      setCustomer(null); setCustQuery(""); setModal(null);
      billNo.current = `POS-${Date.now()}`;
      searchRef.current?.focus();
    } catch (err: any) { alert(err.message ?? "Failed to save bill"); }
    setSaving(false);
  };

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA";

      /* F1 = Focus search */
      if (e.key === "F1") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
      /* F2 = Change qty */
      if (e.key === "F2") { e.preventDefault(); if (selectedCartRow) setModal("qty"); return; }
      /* F3 = Item discount */
      if (e.key === "F3") { e.preventDefault(); if (selectedCartRow) setModal("itemDisc"); return; }
      /* F4 = Remove item */
      if (e.key === "F4") { e.preventDefault(); if (selectedRow) removeRow(selectedRow); return; }
      /* F6 = Change unit */
      if (e.key === "F6") { e.preventDefault(); if (selectedCartRow) setModal("unit"); return; }
      /* F8 = Additional charges */
      if (e.key === "F8") { e.preventDefault(); setModal("charges"); return; }
      /* F9 = Bill discount */
      if (e.key === "F9") { e.preventDefault(); setModal("billDisc"); return; }
      /* F12 = Remarks */
      if (e.key === "F12") { e.preventDefault(); setModal("remarks"); return; }
      /* Ctrl+S / Ctrl+P = Save/Print */
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "p")) {
        e.preventDefault(); if (cart.length > 0) setModal("save"); return;
      }
      /* Escape = close modal / clear search */
      if (e.key === "Escape") {
        if (modal) { setModal(null); return; }
        if (searchOpen) { setQuery(""); setProducts([]); setSearchOpen(false); searchRef.current?.focus(); return; }
        return;
      }

      /* Search box: Arrow Up/Down navigate results */
      if (searchOpen && !modal) {
        if (e.key === "ArrowDown") { e.preventDefault(); setSearchIdx(i => Math.min(i + 1, products.length - 1)); return; }
        if (e.key === "ArrowUp")   { e.preventDefault(); setSearchIdx(i => Math.max(i - 1, 0)); return; }
        if (e.key === "Enter" && products.length > 0) { e.preventDefault(); addProduct(products[searchIdx]); return; }
      }

      /* Cart row navigation: Up/Down when NOT in search */
      if (!inInput && !searchOpen && !modal && cart.length > 0) {
        const idx = cart.findIndex(r => r.rowId === selectedRow);
        if (e.key === "ArrowDown") { e.preventDefault(); setSelected(cart[Math.min(idx + 1, cart.length - 1)].rowId); return; }
        if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(cart[Math.max(idx - 1, 0)].rowId); return; }
        if (e.key === "Delete" || e.key === "Backspace") {
          if (!inInput && selectedRow) { e.preventDefault(); removeRow(selectedRow); return; }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal, selectedRow, selectedCartRow, searchOpen, searchIdx, products, cart]);

  /* ── UI ── */
  return (
    <div className="pos-root" style={{ fontFamily: "system-ui, sans-serif" }}>
      <style>{`
        .pos-root { display:flex; flex-direction:column; height:100vh; background:#f0f2f5; overflow:hidden; }
        .pos-topbar { display:flex; align-items:center; gap:8px; background:#1a237e; color:white; padding:0 16px; height:44px; flex-shrink:0; }
        .pos-topbar-title { font-weight:800; font-size:15px; letter-spacing:0.5px; }
        .pos-topbar-bill { font-size:11px; opacity:0.7; margin-left:4px; }
        .pos-topbar-spacer { flex:1; }
        .pos-topbar-btn { background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.25); color:white; border-radius:6px; padding:4px 10px; font-size:11px; cursor:pointer; transition:background 0.15s; }
        .pos-topbar-btn:hover { background:rgba(255,255,255,0.25); }
        .pos-topbar-btn.accent { background:#1976D2; border-color:#1976D2; }
        .pos-topbar-btn.green { background:#2e7d32; border-color:#2e7d32; }

        .pos-body { display:flex; flex:1; overflow:hidden; gap:0; }

        /* LEFT */
        .pos-left { display:flex; flex-direction:column; flex:1; min-width:0; background:white; border-right:1px solid #e0e0e0; overflow:hidden; }
        .pos-searchbar { display:flex; align-items:center; gap:8px; padding:8px 12px; background:#fff; border-bottom:2px solid #1a237e; flex-shrink:0; }
        .pos-searchbar input { flex:1; border:1px solid #d0d0d0; border-radius:6px; padding:7px 12px; font-size:14px; outline:none; }
        .pos-searchbar input:focus { border-color:#1a237e; box-shadow:0 0 0 2px rgba(26,35,126,0.1); }
        .pos-search-hint { font-size:10px; color:#888; white-space:nowrap; }

        .pos-search-dropdown { position:absolute; top:100%; left:0; right:0; z-index:30; background:white; border:1px solid #d0d0d0; border-top:none; border-radius:0 0 8px 8px; box-shadow:0 8px 24px rgba(0,0,0,0.12); max-height:280px; overflow-y:auto; }
        .pos-search-item { display:flex; align-items:center; gap:10px; padding:9px 14px; cursor:pointer; transition:background 0.1s; }
        .pos-search-item:hover,.pos-search-item.active { background:#e8eaf6; }
        .pos-search-item-img { width:38px; height:38px; border-radius:6px; object-fit:cover; background:#f5f5f5; flex-shrink:0; }
        .pos-search-item-placeholder { width:38px; height:38px; border-radius:6px; background:#e8eaf6; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
        .pos-search-item-name { font-weight:600; font-size:13px; }
        .pos-search-item-sub { font-size:11px; color:#666; }
        .pos-search-item-price { margin-left:auto; font-weight:700; color:#1a237e; font-size:13px; white-space:nowrap; }

        /* TABLE */
        .pos-table-wrap { flex:1; overflow-y:auto; }
        .pos-table { width:100%; border-collapse:collapse; font-size:13px; }
        .pos-table thead th { background:#1a237e; color:white; padding:8px 10px; text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; position:sticky; top:0; z-index:2; }
        .pos-table thead th.r { text-align:right; }
        .pos-table tbody tr { cursor:pointer; border-bottom:1px solid #f0f0f0; transition:background 0.1s; }
        .pos-table tbody tr:hover { background:#f5f7ff; }
        .pos-table tbody tr.selected { background:#e8eaf6; }
        .pos-table td { padding:8px 10px; vertical-align:middle; }
        .pos-table td.r { text-align:right; }
        .pos-table td.c { text-align:center; }
        .pos-table .row-num { font-size:11px; color:#888; font-weight:600; }
        .pos-table .row-name { font-weight:600; color:#1a237e; }
        .pos-table .row-sub { font-size:10px; color:#888; }
        .pos-table .qty-input { border:1px solid #d0d0d0; border-radius:4px; padding:3px 6px; width:60px; text-align:center; font-size:13px; font-weight:700; background:white; }
        .pos-table .qty-input:focus { border-color:#1a237e; outline:none; }
        .pos-table .row-total { font-weight:700; color:#1b5e20; }
        .pos-table .del-btn { background:none; border:none; cursor:pointer; color:#ef5350; padding:2px 6px; border-radius:4px; font-size:15px; transition:background 0.1s; }
        .pos-table .del-btn:hover { background:#ffebee; }
        .pos-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; color:#9e9e9e; padding:60px 20px; text-align:center; }
        .pos-empty-icon { font-size:48px; margin-bottom:12px; opacity:0.4; }

        /* RIGHT */
        .pos-right { width:320px; flex-shrink:0; display:flex; flex-direction:column; background:#fafafa; overflow:hidden; }
        .pos-right-section { padding:10px 14px; border-bottom:1px solid #e0e0e0; }
        .pos-right-section-title { font-size:10px; font-weight:800; text-transform:uppercase; color:#888; letter-spacing:0.8px; margin-bottom:6px; }
        .pos-customer-box { border:1px solid #d0d0d0; border-radius:8px; background:white; padding:8px 10px; font-size:12px; position:relative; }
        .pos-customer-input { border:none; outline:none; width:100%; font-size:12px; background:transparent; }
        .pos-customer-dropdown { position:absolute; top:100%; left:-1px; right:-1px; z-index:20; background:white; border:1px solid #d0d0d0; border-radius:0 0 8px 8px; box-shadow:0 4px 12px rgba(0,0,0,0.1); }
        .pos-customer-item { padding:8px 12px; cursor:pointer; font-size:12px; border-bottom:1px solid #f0f0f0; }
        .pos-customer-item:hover { background:#f5f7ff; }

        .pos-summary { padding:10px 14px; flex:1; overflow-y:auto; }
        .pos-sum-row { display:flex; justify-content:space-between; align-items:center; padding:4px 0; font-size:13px; }
        .pos-sum-row.grand { padding:8px 0 4px; border-top:2px solid #1a237e; margin-top:4px; font-size:17px; font-weight:900; color:#1a237e; }
        .pos-sum-label { color:#555; }
        .pos-sum-value { font-weight:700; }

        /* BOTTOM */
        .pos-bottom { background:#263238; padding:6px 10px; flex-shrink:0; display:flex; flex-wrap:wrap; gap:4px; }
        .pos-fkey { background:#37474f; border:1px solid #546e7a; color:#cfd8dc; border-radius:5px; padding:5px 8px; font-size:10px; cursor:pointer; transition:background 0.15s; display:flex; flex-direction:column; align-items:center; min-width:80px; flex:1; }
        .pos-fkey:hover { background:#455a64; }
        .pos-fkey.disabled { opacity:0.4; cursor:not-allowed; }
        .pos-fkey .fk-key { font-size:9px; color:#90a4ae; font-weight:700; }
        .pos-fkey .fk-label { font-size:11px; font-weight:600; }
        .pos-fkey.save-btn { background:#1565c0; border-color:#1976d2; color:white; min-width:140px; }
        .pos-fkey.save-btn:hover { background:#1976d2; }

        /* Modals */
        .pos-modal { background:white; border-radius:16px; box-shadow:0 24px 48px rgba(0,0,0,0.2); width:420px; max-width:92vw; overflow:hidden; }
        .pos-modal-title { background:#1a237e; color:white; padding:14px 20px; font-weight:800; font-size:15px; }
        .pos-modal-body { padding:20px; }
        .pos-modal-footer { display:flex; gap:10px; padding:16px 20px; border-top:1px solid #e0e0e0; background:#fafafa; }
        .pos-label { font-size:11px; font-weight:700; color:#555; text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:6px; }
        .pos-input { border:2px solid #d0d0d0; border-radius:8px; padding:10px 12px; font-size:15px; width:100%; outline:none; transition:border-color 0.15s; }
        .pos-input:focus { border-color:#1a237e; }
        .pos-btn-primary { flex:1; background:#1a237e; color:white; border:none; border-radius:8px; padding:10px; font-size:13px; font-weight:700; cursor:pointer; transition:background 0.15s; }
        .pos-btn-primary:hover:not(:disabled) { background:#283593; }
        .pos-btn-primary:disabled { opacity:0.6; cursor:not-allowed; }
        .pos-btn-ghost { flex:1; background:none; border:2px solid #d0d0d0; border-radius:8px; padding:10px; font-size:13px; font-weight:700; cursor:pointer; color:#555; transition:background 0.15s; }
        .pos-btn-ghost:hover:not(:disabled) { background:#f5f5f5; }
        .text-muted { color:#888; }
        .space-y-3 > * + * { margin-top:12px; }
      `}</style>

      {/* ── Top bar ── */}
      <div className="pos-topbar">
        <div className="pos-topbar-title">🏪 KDF NUTS — POS</div>
        <div className="pos-topbar-bill">{billNo.current}</div>
        <div className="pos-topbar-spacer" />
        <button className="pos-topbar-btn" onClick={() => setLocation("/dashboard")}>← Back</button>
        <button className="pos-topbar-btn"
          onClick={() => { setCart([]); setSelected(null); setBillDisc(0); setExtra(0); setRemarks(""); setCustomer(null); setCustQuery(""); billNo.current = `POS-${Date.now()}`; }}>
          🗑 Clear [Ctrl+N]
        </button>
        <button className="pos-topbar-btn green" onClick={() => { if (cart.length > 0) setModal("save"); }}>
          🖨 Save & Print [Ctrl+P]
        </button>
      </div>

      {/* ── Body ── */}
      <div className="pos-body">

        {/* ── LEFT: Product area ── */}
        <div className="pos-left">
          {/* Search bar */}
          <div className="pos-searchbar" style={{ position: "relative" }}>
            <span style={{ fontSize: 18 }}>🔍</span>
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by item name, barcode, SKU… [F1]"
              style={{ flex: 1 }}
              autoFocus
              onFocus={() => { if (products.length > 0) setSearchOpen(true); }}
              onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
            />
            {searching && <span style={{ fontSize: 11, color: "#888" }}>Searching…</span>}
            <span className="pos-search-hint">F1: Search · F2: Qty · F3: Disc · F4: Remove · Ctrl+P: Save</span>

            {/* Dropdown */}
            {searchOpen && products.length > 0 && (
              <div className="pos-search-dropdown">
                {products.map((p, i) => {
                  const img = p.images?.[0];
                  return (
                    <div key={p.id} className={`pos-search-item ${i === searchIdx ? "active" : ""}`}
                      onMouseDown={() => addProduct(p)}>
                      {img
                        ? <img src={img} alt={p.name} className="pos-search-item-img" />
                        : <div className="pos-search-item-placeholder">🌰</div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="pos-search-item-name">{p.name}</div>
                        <div className="pos-search-item-sub">
                          {p.sku ? `SKU: ${p.sku}` : `ID: ${p.id}`} · Stock: {p.stock} {p.unit ?? "pc"}
                        </div>
                      </div>
                      <div className="pos-search-item-price">{fmtRs(parseFloat(p.price))}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {searchOpen && products.length === 0 && !searching && query.trim() && (
              <div className="pos-search-dropdown">
                <div style={{ padding: "14px", textAlign: "center", color: "#888", fontSize: 13 }}>
                  No products found for "{query}"
                </div>
              </div>
            )}
          </div>

          {/* Cart table */}
          {cart.length > 0 ? (
            <div className="pos-table-wrap">
              <table className="pos-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th style={{ width: 72 }}>Code</th>
                    <th>Item Name</th>
                    <th style={{ width: 80 }} className="c">QTY</th>
                    <th style={{ width: 52 }} className="c">Unit</th>
                    <th style={{ width: 90 }} className="r">Price/Unit</th>
                    <th style={{ width: 64 }} className="r">Disc%</th>
                    <th style={{ width: 96 }} className="r">Total (Rs)</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((row, i) => (
                    <tr key={row.rowId}
                      className={row.rowId === selectedRow ? "selected" : ""}
                      onClick={() => setSelected(row.rowId)}>
                      <td className="row-num c">{i + 1}</td>
                      <td style={{ fontSize: 11, color: "#888" }}>{row.sku}</td>
                      <td>
                        <div className="row-name">{row.name}</div>
                        {row.discount > 0 && <div className="row-sub">-{row.discount}% disc</div>}
                      </td>
                      <td className="c" onClick={e => e.stopPropagation()}>
                        <input
                          type="number" min="0.001" step="any"
                          value={row.qty}
                          className="qty-input"
                          onChange={e => updateRow(row.rowId, { qty: parseFloat(e.target.value) || 0 })}
                          onFocus={() => setSelected(row.rowId)}
                        />
                      </td>
                      <td className="c" style={{ fontSize: 12, color: "#555" }}>{row.unit}</td>
                      <td className="r" style={{ fontSize: 12 }}>{fmtRs(row.pricePerUnit)}</td>
                      <td className="r" style={{ fontSize: 12, color: row.discount > 0 ? "#e65100" : "#ccc" }}>
                        {row.discount > 0 ? `${row.discount}%` : "—"}
                      </td>
                      <td className="r row-total">{fmtRs(row.total)}</td>
                      <td className="c" onClick={e => e.stopPropagation()}>
                        <button className="del-btn" onClick={() => removeRow(row.rowId)} title="Remove [F4]">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="pos-empty">
              <div className="pos-empty-icon">🛒</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Cart is Empty</div>
              <div style={{ fontSize: 12 }}>Search for a product above or scan a barcode to start billing</div>
              <div style={{ fontSize: 11, marginTop: 12, color: "#bbb" }}>Press F1 to focus search</div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Panel ── */}
        <div className="pos-right">

          {/* Date & Bill */}
          <div className="pos-right-section">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "#666" }}>{new Date().toLocaleDateString("en-PK", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</span>
              <span style={{ fontWeight: 700, color: "#1a237e", fontSize: 11 }}>#{billNo.current.slice(-6)}</span>
            </div>
          </div>

          {/* Customer */}
          <div className="pos-right-section">
            <div className="pos-right-section-title">Customer [F3]</div>
            {customer ? (
              <div className="pos-customer-box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{customer.name}</div>
                  {customer.phone && <div style={{ fontSize: 11, color: "#666" }}>{customer.phone}</div>}
                </div>
                <button onClick={() => { setCustomer(null); setCustQuery(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef5350", fontSize: 16 }}>✕</button>
              </div>
            ) : (
              <div className="pos-customer-box" style={{ position: "relative" }}>
                <input
                  ref={custRef} value={custQuery}
                  onChange={e => setCustQuery(e.target.value)}
                  placeholder="Search customer name/phone…"
                  className="pos-customer-input"
                />
                {custResults.length > 0 && (
                  <div className="pos-customer-dropdown">
                    {custResults.map(c => (
                      <div key={c.id} className="pos-customer-item"
                        onMouseDown={() => { setCustomer(c); setCustQuery(""); setCustResults([]); }}>
                        <strong>{c.name}</strong>
                        {c.phone && <span style={{ color: "#888", marginLeft: 8 }}>{c.phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {custSearching && <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Searching…</div>}
              </div>
            )}
          </div>

          {/* Bill Summary */}
          <div className="pos-summary">
            <div className="pos-right-section-title">Bill Summary</div>
            <div className="pos-sum-row">
              <span className="pos-sum-label">Items</span>
              <span className="pos-sum-value">{cart.length} ({cart.reduce((s, r) => s + r.qty, 0)} units)</span>
            </div>
            <div className="pos-sum-row">
              <span className="pos-sum-label">Subtotal</span>
              <span className="pos-sum-value">{fmtRs(subtotal)}</span>
            </div>
            {billDisc > 0 && (
              <div className="pos-sum-row" style={{ color: "#e65100" }}>
                <span>Bill Discount ({billDisc}%)</span>
                <span>− {fmtRs(subtotal * billDisc / 100)}</span>
              </div>
            )}
            {extraCharges > 0 && (
              <div className="pos-sum-row">
                <span className="pos-sum-label">Charges</span>
                <span className="pos-sum-value">+ {fmtRs(extraCharges)}</span>
              </div>
            )}
            {remarks && (
              <div style={{ fontSize: 11, color: "#666", marginTop: 4, padding: "4px 0", borderTop: "1px dashed #e0e0e0" }}>
                📝 {remarks}
              </div>
            )}
            <div className="pos-sum-row grand">
              <span>TOTAL</span>
              <span>{fmtRs(grandTotal)}</span>
            </div>

            {/* Quick action links */}
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button onClick={() => setModal("billDisc")} style={{ fontSize: 11, background: "#fff3e0", border: "1px solid #ffcc02", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "#e65100", fontWeight: 600 }}>
                % Discount [F9]
              </button>
              <button onClick={() => setModal("charges")} style={{ fontSize: 11, background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "#2e7d32", fontWeight: 600 }}>
                + Charges [F8]
              </button>
              <button onClick={() => setModal("remarks")} style={{ fontSize: 11, background: "#e3f2fd", border: "1px solid #90caf9", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "#1565c0", fontWeight: 600 }}>
                📝 Remarks [F12]
              </button>
            </div>
          </div>

          {/* Save button */}
          <div style={{ padding: "12px 14px", background: "#fff", borderTop: "2px solid #1a237e", flexShrink: 0 }}>
            <button
              disabled={cart.length === 0}
              onClick={() => setModal("save")}
              style={{ width: "100%", background: cart.length > 0 ? "#1a237e" : "#ccc", color: "white", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 800, cursor: cart.length > 0 ? "pointer" : "not-allowed", transition: "background 0.15s" }}>
              🖨 Save & Print Bill [Ctrl+P]
            </button>
          </div>
        </div>
      </div>

      {/* ── Bottom shortcuts bar ── */}
      <div className="pos-bottom">
        <button className="pos-fkey" onClick={() => { searchRef.current?.focus(); searchRef.current?.select(); }}>
          <span className="fk-key">F1</span><span className="fk-label">🔍 New Item</span>
        </button>
        <button className={`pos-fkey ${!selectedCartRow ? "disabled" : ""}`} onClick={() => { if (selectedCartRow) setModal("qty"); }}>
          <span className="fk-key">F2</span><span className="fk-label">Change Qty</span>
        </button>
        <button className={`pos-fkey ${!selectedCartRow ? "disabled" : ""}`} onClick={() => { if (selectedCartRow) setModal("itemDisc"); }}>
          <span className="fk-key">F3</span><span className="fk-label">Item Discount</span>
        </button>
        <button className={`pos-fkey ${!selectedCartRow ? "disabled" : ""}`} onClick={() => { if (selectedRow) removeRow(selectedRow); }}>
          <span className="fk-key">F4</span><span className="fk-label">Remove Item</span>
        </button>
        <button className={`pos-fkey ${!selectedCartRow ? "disabled" : ""}`} onClick={() => { if (selectedCartRow) setModal("unit"); }}>
          <span className="fk-key">F6</span><span className="fk-label">Change Unit</span>
        </button>
        <button className="pos-fkey" onClick={() => setModal("charges")}>
          <span className="fk-key">F8</span><span className="fk-label">Add Charges</span>
        </button>
        <button className="pos-fkey" onClick={() => setModal("billDisc")}>
          <span className="fk-key">F9</span><span className="fk-label">Bill Discount</span>
        </button>
        <button className="pos-fkey" onClick={() => setModal("remarks")}>
          <span className="fk-key">F12</span><span className="fk-label">Remarks</span>
        </button>
        <button className="pos-fkey save-btn" onClick={() => { if (cart.length > 0) setModal("save"); }}>
          <span className="fk-key">Ctrl+P</span><span className="fk-label">🖨 Save & Print</span>
        </button>
      </div>

      {/* ── Modals ── */}
      {modal === "qty"      && selectedCartRow && <QtyModal    row={selectedCartRow} onClose={() => setModal(null)} onSave={v => { updateRow(selectedCartRow.rowId, { qty: v }); setModal(null); }} />}
      {modal === "itemDisc" && selectedCartRow && <ItemDiscModal row={selectedCartRow} onClose={() => setModal(null)} onSave={v => { updateRow(selectedCartRow.rowId, { discount: v }); setModal(null); }} />}
      {modal === "billDisc" && <BillDiscModal  value={billDisc} subtotal={subtotal} onClose={() => setModal(null)} onSave={v => { setBillDisc(v); setModal(null); }} />}
      {modal === "charges"  && <ChargesModal   value={extraCharges} onClose={() => setModal(null)} onSave={v => { setExtra(v); setModal(null); }} />}
      {modal === "remarks"  && <RemarksModal   value={remarks} onClose={() => setModal(null)} onSave={v => { setRemarks(v); setModal(null); }} />}
      {modal === "unit"     && selectedCartRow && <UnitModal  row={selectedCartRow} onClose={() => setModal(null)} onSave={u => { updateRow(selectedCartRow.rowId, { unit: u }); setModal(null); }} />}
      {modal === "save"     && <SaveBillModal  subtotal={subtotal} billDisc={billDisc} extraCharges={extraCharges} grandTotal={grandTotal} saving={saving} onClose={() => setModal(null)} onSave={saveBill} />}
    </div>
  );
}
