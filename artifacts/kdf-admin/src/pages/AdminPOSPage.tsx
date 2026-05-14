import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, HelpCircle, Printer, Search, ShoppingCart, Trash2, User } from "lucide-react";
import { apiPublicUrl } from "@/lib/apiBase";
import { toast } from "@/hooks/use-toast";
import type { CartRow, Customer, PosDraftV1, PosHoldV1, Product } from "@/features/pos/types";
import { adminFetch } from "@/features/pos/adminFetch";
import { calcRow, fmtRs, uid } from "@/features/pos/calc";
import { printBill } from "@/features/pos/printBill";
import { clearDraft, readDraft, writeDraft } from "@/features/pos/draftStorage";
import { listHolds, pushHold, removeHoldById } from "@/features/pos/holdsStorage";
import { PosShortcutsOverlay } from "@/features/pos/PosShortcutsOverlay";
import { usePosMobile } from "@/features/pos/usePosMobile";
import {
  BillDiscModal,
  ChargesModal,
  HoldsModal,
  ItemDiscModal,
  QtyModal,
  RemarksModal,
  SaveBillModal,
  UnitModal,
} from "@/features/pos/PosModals";

type PosModal = null | "qty" | "itemDisc" | "billDisc" | "charges" | "remarks" | "unit" | "save" | "holds";

function buildDraft(
  cart: CartRow[],
  selectedRow: string | null,
  billDisc: number,
  extraCharges: number,
  remarks: string,
  customer: Customer | null,
  billNo: string,
): PosDraftV1 {
  return {
    v: 1,
    cart,
    selectedRow,
    billDisc,
    extraCharges,
    remarks,
    customer,
    billNo,
  };
}

export default function AdminPOSPage() {
  const [, setLocation] = useLocation();
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  const isMobile = usePosMobile();

  useEffect(() => {
    if (!token) setLocation("/login");
  }, [token, setLocation]);

  const [cart, setCart] = useState<CartRow[]>([]);
  const [selectedRow, setSelected] = useState<string | null>(null);
  const [billDisc, setBillDisc] = useState(0);
  const [extraCharges, setExtra] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [billNo, setBillNo] = useState(() => `POS-${Date.now()}`);

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIdx, setSearchIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custQuery, setCustQuery] = useState("");
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [custSearching, setCustSearching] = useState(false);
  const custRef = useRef<HTMLInputElement>(null);

  const [modal, setModal] = useState<PosModal>(null);
  const [saving, setSaving] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [holds, setHolds] = useState<PosHoldV1[]>(() => listHolds());
  const [mobileSheet, setMobileSheet] = useState<null | "customer">(null);

  const draftRestored = useRef(false);

  /* Restore draft once when logged in */
  useEffect(() => {
    if (!token || draftRestored.current) return;
    const d = readDraft();
    draftRestored.current = true;
    if (!d) return;
    setCart(d.cart);
    setSelected(d.selectedRow);
    setBillDisc(d.billDisc);
    setExtra(d.extraCharges);
    setRemarks(d.remarks);
    setCustomer(d.customer);
    setBillNo(d.billNo);
  }, [token]);

  /* Persist draft (debounced) */
  useEffect(() => {
    if (!token) return;
    const t = window.setTimeout(() => {
      writeDraft(buildDraft(cart, selectedRow, billDisc, extraCharges, remarks, customer, billNo));
    }, 200);
    return () => clearTimeout(t);
  }, [token, cart, selectedRow, billDisc, extraCharges, remarks, customer, billNo]);

  /* Product search — 100ms debounce, limit 40 */
  useEffect(() => {
    if (!query.trim()) {
      setProducts([]);
      setSearchOpen(false);
      return;
    }
    setSearching(true);
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const url = apiPublicUrl(`/api/products?search=${encodeURIComponent(query)}&limit=40`);
        const r = await fetch(url, { signal: ac.signal });
        const d = (await r.json()) as { items?: Product[] };
        if (!ac.signal.aborted) {
          setProducts(d.items ?? []);
          setSearchOpen(true);
          setSearchIdx(0);
        }
      } catch {
        if (!ac.signal.aborted) setProducts([]);
      } finally {
        if (!ac.signal.aborted) setSearching(false);
      }
    }, 100);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [query]);

  /* Customer search — 200ms debounce */
  useEffect(() => {
    if (!custQuery.trim()) {
      setCustResults([]);
      return;
    }
    setCustSearching(true);
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const tok = localStorage.getItem("kdf_admin_token") ?? "";
        const url = apiPublicUrl(`/api/admin/customers?search=${encodeURIComponent(custQuery)}&limit=12`);
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${tok}` },
          signal: ac.signal,
        });
        const d = (await r.json()) as { customers?: Customer[]; items?: Customer[] };
        if (!ac.signal.aborted) setCustResults(d.customers ?? d.items ?? []);
      } catch {
        if (!ac.signal.aborted) setCustResults([]);
      } finally {
        if (!ac.signal.aborted) setCustSearching(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [custQuery]);

  const subtotal = cart.reduce((s, r) => s + r.total, 0);
  const discAmt = (subtotal * billDisc) / 100;
  const grandTotal = subtotal - discAmt + extraCharges;
  const selectedCartRow = cart.find((r) => r.rowId === selectedRow) ?? null;

  const refreshHolds = useCallback(() => setHolds(listHolds()), []);

  const addProduct = useCallback((p: Product) => {
    let newSel: string | null = null;
    setCart((prev) => {
      const existing = prev.find((r) => r.productId === p.id);
      if (existing) {
        newSel = existing.rowId;
        return prev.map((r) => (r.rowId === existing.rowId ? calcRow({ ...r, qty: r.qty + 1 }) : r));
      }
      const row: CartRow = calcRow({
        rowId: uid(),
        productId: p.id,
        sku: p.sku ?? `P${p.id}`,
        name: p.name,
        qty: 1,
        unit: p.unit ?? "pc",
        pricePerUnit: parseFloat(p.price ?? "0"),
        discount: 0,
        total: 0,
      });
      newSel = row.rowId;
      return [...prev, row];
    });
    if (newSel !== null) setSelected(newSel);
    setQuery("");
    setProducts([]);
    setSearchOpen(false);
    searchRef.current?.focus();
  }, []);

  const updateRow = useCallback((rowId: string, patch: Partial<CartRow>) => {
    setCart((prev) => prev.map((r) => (r.rowId === rowId ? calcRow({ ...r, ...patch }) : r)));
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setCart((prev) => {
      const next = prev.filter((r) => r.rowId !== rowId);
      setSelected((sel) => (sel === rowId ? next[next.length - 1]?.rowId ?? null : sel));
      return next;
    });
  }, []);

  const newBillNumber = () => `POS-${Date.now()}`;

  const resetSaleState = useCallback(() => {
    setCart([]);
    setSelected(null);
    setBillDisc(0);
    setExtra(0);
    setRemarks("");
    setCustomer(null);
    setCustQuery("");
    setCustResults([]);
    setBillNo(newBillNumber());
    setModal(null);
  }, []);

  const clearAll = useCallback(() => {
    resetSaleState();
    clearDraft();
    searchRef.current?.focus();
  }, [resetSaleState]);

  const saveCurrentHold = useCallback(() => {
    if (cart.length === 0) return;
    const hold: PosHoldV1 = {
      id: uid(),
      savedAt: Date.now(),
      billNo,
      cart: cart.map((r) => ({ ...r })),
      selectedRow,
      billDisc,
      extraCharges,
      remarks,
      customer,
    };
    pushHold(hold);
    refreshHolds();
    resetSaleState();
    toast({ title: "Sale held", description: "Cart cleared. Open Holds to resume." });
    searchRef.current?.focus();
  }, [billNo, billDisc, cart, customer, extraCharges, refreshHolds, remarks, resetSaleState, selectedRow]);

  const resumeHold = useCallback((id: string) => {
    const h = listHolds().find((x) => x.id === id);
    if (!h) return;
    removeHoldById(id);
    refreshHolds();
    setCart(h.cart.map((r) => ({ ...r })));
    setSelected(h.selectedRow && h.cart.some((r) => r.rowId === h.selectedRow) ? h.selectedRow : (h.cart[0]?.rowId ?? null));
    setBillDisc(h.billDisc);
    setExtra(h.extraCharges);
    setRemarks(h.remarks);
    setCustomer(h.customer);
    setBillNo(h.billNo);
    setModal(null);
    setMobileSheet(null);
    toast({ title: "Hold resumed", description: h.billNo });
  }, [refreshHolds]);

  const persistDraftNow = useCallback(() => {
    writeDraft(buildDraft(cart, selectedRow, billDisc, extraCharges, remarks, customer, billNo));
  }, [billDisc, billNo, cart, customer, extraCharges, remarks, selectedRow]);

  const saveBill = async (payMethod: string, received: number) => {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const items = cart.map((r) => ({
        name: r.name,
        sku: r.sku,
        qty: r.qty,
        unit: r.unit,
        pricePerUnit: r.pricePerUnit,
        discount: r.discount,
        lineTotal: r.total,
      }));
      await adminFetch("/api/admin/branch-invoices", {
        method: "POST",
        body: JSON.stringify({
          invoiceNo: billNo,
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
      printBill(cart, subtotal, billDisc, grandTotal, customer, payMethod, received, billNo, remarks);
      clearDraft();
      resetSaleState();
      searchRef.current?.focus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save bill";
      alert(msg);
    }
    setSaving(false);
  };

  /* Refs for keyboard — avoid stale closures */
  const modalRef = useRef(modal);
  modalRef.current = modal;
  const showHelpRef = useRef(showHelp);
  showHelpRef.current = showHelp;
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const productsRef = useRef(products);
  productsRef.current = products;
  const searchIdxRef = useRef(searchIdx);
  searchIdxRef.current = searchIdx;
  const searchOpenRef = useRef(searchOpen);
  searchOpenRef.current = searchOpen;
  const selectedRowRef = useRef(selectedRow);
  selectedRowRef.current = selectedRow;
  const selectedCartRowRef = useRef(selectedCartRow);
  selectedCartRowRef.current = selectedCartRow;
  const addProductRef = useRef(addProduct);
  addProductRef.current = addProduct;
  const removeRowRef = useRef(removeRow);
  removeRowRef.current = removeRow;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      const inTextarea = tag === "TEXTAREA";
      const inInput = tag === "INPUT" || inTextarea;

      /* Esc — help first, then modals, then search */
      if (e.key === "Escape") {
        if (showHelpRef.current) {
          e.preventDefault();
          setShowHelp(false);
          return;
        }
        if (modalRef.current) {
          e.preventDefault();
          setModal(null);
          return;
        }
        if (searchOpenRef.current) {
          e.preventDefault();
          setQuery("");
          setProducts([]);
          setSearchOpen(false);
          searchRef.current?.focus();
          return;
        }
        setMobileSheet(null);
        return;
      }

      if (modalRef.current) return;

      const isHelpChord =
        e.key === "?" ||
        (e.shiftKey && e.key === "/") ||
        (e.metaKey && (e.key === "?" || e.key === "/"));

      if (isHelpChord) {
        const allowFromField = e.metaKey && (e.key === "?" || e.key === "/");
        if (!inTextarea && (!inInput || allowFromField)) {
          e.preventDefault();
          setShowHelp((h) => !h);
          return;
        }
      }

      if (e.key === "F1") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        if (selectedCartRowRef.current) setModal("qty");
        return;
      }
      if (e.key === "F3" && !e.shiftKey) {
        e.preventDefault();
        custRef.current?.focus();
        custRef.current?.select();
        return;
      }
      if (e.key === "F3" && e.shiftKey) {
        e.preventDefault();
        if (selectedCartRowRef.current) setModal("itemDisc");
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        const sr = selectedRowRef.current;
        if (sr) removeRowRef.current(sr);
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        if (cartRef.current.length > 0) setModal("save");
        return;
      }
      if (e.key === "F6") {
        e.preventDefault();
        if (selectedCartRowRef.current) setModal("unit");
        return;
      }
      if (e.key === "F7" || e.key === "F10") {
        e.preventDefault();
        saveCurrentHold();
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        setModal("charges");
        return;
      }
      if (e.key === "F9") {
        e.preventDefault();
        setModal("billDisc");
        return;
      }
      if (e.key === "F11") {
        e.preventDefault();
        if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
        else void document.exitFullscreen?.().catch(() => {});
        return;
      }
      if (e.key === "F12") {
        e.preventDefault();
        setModal("remarks");
        return;
      }

      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        if (cartRef.current.length > 0) setModal("save");
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        persistDraftNow();
        toast({ title: "Draft saved", description: "Cart stored in this browser." });
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        if (cartRef.current.length > 0) setModal("save");
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        clearAll();
        return;
      }

      if (searchOpenRef.current && !modalRef.current) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const pl = productsRef.current.length;
          if (pl) setSearchIdx((i) => Math.min(i + 1, pl - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSearchIdx((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter" && productsRef.current.length > 0) {
          e.preventDefault();
          addProductRef.current(productsRef.current[searchIdxRef.current]!);
          return;
        }
      }

      if (!inInput && !searchOpenRef.current && !modalRef.current && cartRef.current.length > 0) {
        const c = cartRef.current;
        const idx = c.findIndex((r) => r.rowId === selectedRowRef.current);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelected(c[Math.min(idx + 1, c.length - 1)]!.rowId);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelected(c[Math.max(idx - 1, 0)]!.rowId);
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          const sr = selectedRowRef.current;
          if (sr) {
            e.preventDefault();
            removeRowRef.current(sr);
          }
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clearAll, persistDraftNow, saveCurrentHold]);

  const openSaveIfCart = () => {
    if (cart.length > 0) setModal("save");
  };

  const topBar = (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 bg-gradient-to-r from-indigo-950/90 via-indigo-900/85 to-slate-900/90 px-3 text-white shadow-md backdrop-blur-md sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <ShoppingCart className="hidden h-5 w-5 shrink-0 text-amber-200/90 sm:block" />
        <span className="truncate text-sm font-extrabold tracking-wide sm:text-[15px]">KDF NUTS — POS</span>
        <span className="hidden truncate text-[11px] text-white/60 sm:inline">{billNo}</span>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        className="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-[11px] font-semibold backdrop-blur-sm transition hover:bg-white/20 sm:px-3"
        onClick={() => setShowHelp(true)}
      >
        <HelpCircle className="mx-auto h-4 w-4 sm:mr-1 sm:inline" />
        <span className="hidden sm:inline">?</span>
      </button>
      <button
        type="button"
        className="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-[11px] font-semibold backdrop-blur-sm transition hover:bg-white/20 sm:px-3"
        onClick={() => {
          setHolds(listHolds());
          setModal("holds");
        }}
      >
        Holds ({holds.length})
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-[11px] font-semibold backdrop-blur-sm transition hover:bg-white/20 sm:px-3"
        onClick={() => setLocation("/dashboard")}
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Back</span>
      </button>
    </header>
  );

  const searchBar = (
    <div className="relative flex shrink-0 items-center gap-2 border-b-2 border-indigo-800 bg-white px-3 py-2 sm:px-4">
      <Search className="h-5 w-5 shrink-0 text-indigo-700" />
      <input
        ref={searchRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, SKU, barcode… [F1]"
        className="min-h-[44px] flex-1 rounded-lg border border-neutral-300 px-3 text-base outline-none ring-indigo-900/15 focus:border-indigo-800 focus:ring-2 sm:min-h-0 sm:py-2 sm:text-sm"
        autoFocus
        onFocus={() => {
          if (products.length > 0) setSearchOpen(true);
        }}
        onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
      />
      {searching && <span className="text-[11px] text-neutral-500">…</span>}
      <span className="hidden text-[10px] text-neutral-500 xl:inline">F5 Pay · F7 Hold · ? Help</span>

      {searchOpen && products.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 max-h-72 overflow-y-auto rounded-b-lg border border-neutral-300 border-t-0 bg-white shadow-lg">
          {products.map((p, i) => {
            const img = p.images?.[0];
            return (
              <div
                key={p.id}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 ${i === searchIdx ? "bg-indigo-50" : "hover:bg-indigo-50/60"}`}
                onMouseDown={() => addProduct(p)}
              >
                {img ? (
                  <img src={img} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-lg">🌰</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-indigo-950">{p.name}</div>
                  <div className="truncate text-[11px] text-neutral-600">
                    {p.sku ? `SKU ${p.sku}` : `ID ${p.id}`} · {p.stock} {p.unit ?? "pc"}
                  </div>
                </div>
                <div className="shrink-0 font-bold text-indigo-900">{fmtRs(parseFloat(p.price))}</div>
              </div>
            );
          })}
        </div>
      )}
      {searchOpen && products.length === 0 && !searching && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-30 rounded-b-lg border bg-white p-4 text-center text-sm text-neutral-500 shadow-lg">
          No products for &quot;{query}&quot;
        </div>
      )}
    </div>
  );

  const customerBlock = (
    <section className="space-y-2 border-b border-neutral-200 bg-neutral-50/80 p-3 sm:p-4">
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500">Customer [F3]</div>
      {customer ? (
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2">
          <div>
            <div className="font-bold text-indigo-950">{customer.name}</div>
            {customer.phone && <div className="text-xs text-neutral-600">{customer.phone}</div>}
          </div>
          <button
            type="button"
            className="rounded p-1 text-red-500 hover:bg-red-50"
            onClick={() => {
              setCustomer(null);
              setCustQuery("");
            }}
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="relative rounded-lg border border-neutral-200 bg-white px-3 py-2">
          <input
            ref={custRef}
            value={custQuery}
            onChange={(e) => setCustQuery(e.target.value)}
            placeholder="Name / phone…"
            className="w-full border-0 bg-transparent text-sm outline-none"
          />
          {custResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-md">
              {custResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="block w-full border-b border-neutral-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-indigo-50"
                  onMouseDown={() => {
                    setCustomer(c);
                    setCustQuery("");
                    setCustResults([]);
                  }}
                >
                  <strong>{c.name}</strong>
                  {c.phone && <span className="ml-2 text-neutral-500">{c.phone}</span>}
                </button>
              ))}
            </div>
          )}
          {custSearching && <div className="mt-1 text-[10px] text-neutral-500">Searching…</div>}
        </div>
      )}
    </section>
  );

  const billSummary = (
    <section className="flex-1 space-y-1 overflow-y-auto p-3 sm:p-4">
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500">Bill summary</div>
      <div className="flex justify-between text-sm">
        <span className="text-neutral-600">Items</span>
        <span className="font-semibold">
          {cart.length} ({cart.reduce((s, r) => s + r.qty, 0)} units)
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-neutral-600">Subtotal</span>
        <span className="font-semibold">{fmtRs(subtotal)}</span>
      </div>
      {billDisc > 0 && (
        <div className="flex justify-between text-sm text-orange-700">
          <span>Bill disc ({billDisc}%)</span>
          <span>− {fmtRs(subtotal * (billDisc / 100))}</span>
        </div>
      )}
      {extraCharges > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-neutral-600">Charges</span>
          <span className="font-semibold">+ {fmtRs(extraCharges)}</span>
        </div>
      )}
      {remarks && <div className="border-t border-dashed border-neutral-200 pt-2 text-xs text-neutral-600">📝 {remarks}</div>}
      <div className="flex justify-between border-t-2 border-indigo-900 pt-3 text-lg font-black text-indigo-950">
        <span>TOTAL</span>
        <span>{fmtRs(grandTotal)}</span>
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-orange-800"
          onClick={() => setModal("billDisc")}
        >
          % Disc [F9]
        </button>
        <button
          type="button"
          className="rounded-md border border-green-300 bg-green-50 px-2 py-1.5 text-[11px] font-semibold text-green-800"
          onClick={() => setModal("charges")}
        >
          + Charges [F8]
        </button>
        <button
          type="button"
          className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1.5 text-[11px] font-semibold text-blue-800"
          onClick={() => setModal("remarks")}
        >
          Notes [F12]
        </button>
      </div>
    </section>
  );

  const cartTable = (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {cart.length > 0 ? (
        <table className="pos-table w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 z-[1] bg-indigo-900 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-white">#</th>
              <th className="sticky top-0 z-[1] bg-indigo-900 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-white">Code</th>
              <th className="sticky top-0 z-[1] bg-indigo-900 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-white">Item</th>
              <th className="sticky top-0 z-[1] bg-indigo-900 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-white">Qty</th>
              <th className="sticky top-0 z-[1] bg-indigo-900 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-white">U</th>
              <th className="sticky top-0 z-[1] bg-indigo-900 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-white">Rate</th>
              <th className="sticky top-0 z-[1] bg-indigo-900 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-white">Disc</th>
              <th className="sticky top-0 z-[1] bg-indigo-900 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-white">Total</th>
              <th className="sticky top-0 z-[1] bg-indigo-900 px-2 py-2 text-white" />
            </tr>
          </thead>
          <tbody>
            {cart.map((row, i) => (
              <tr
                key={row.rowId}
                className={`cursor-pointer border-b border-neutral-100 ${row.rowId === selectedRow ? "bg-indigo-50" : "hover:bg-neutral-50"}`}
                onClick={() => setSelected(row.rowId)}
              >
                <td className="px-2 py-2 text-center text-xs text-neutral-500">{i + 1}</td>
                <td className="px-2 py-2 text-xs text-neutral-500">{row.sku}</td>
                <td className="px-2 py-2">
                  <div className="font-semibold text-indigo-950">{row.name}</div>
                  {row.discount > 0 && <div className="text-[10px] text-orange-700">-{row.discount}%</div>}
                </td>
                <td className="px-1 py-1 text-center" onClick={(ev) => ev.stopPropagation()}>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    value={row.qty}
                    className="w-14 rounded border border-neutral-300 px-1 py-1 text-center text-sm font-bold"
                    onChange={(e) => updateRow(row.rowId, { qty: parseFloat(e.target.value) || 0 })}
                    onFocus={() => setSelected(row.rowId)}
                  />
                </td>
                <td className="px-2 py-2 text-center text-xs text-neutral-600">{row.unit}</td>
                <td className="px-2 py-2 text-right text-xs">{fmtRs(row.pricePerUnit)}</td>
                <td className="px-2 py-2 text-right text-xs">{row.discount > 0 ? `${row.discount}%` : "—"}</td>
                <td className="px-2 py-2 text-right text-sm font-bold text-green-800">{fmtRs(row.total)}</td>
                <td className="px-1 py-1 text-center" onClick={(ev) => ev.stopPropagation()}>
                  <button type="button" className="text-red-500 hover:bg-red-50 rounded px-1" onClick={() => removeRow(row.rowId)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-neutral-400">
          <ShoppingCart className="h-14 w-14 opacity-40" />
          <p className="font-semibold text-neutral-500">Cart is empty</p>
          <p className="text-center text-sm">Search above or press F1</p>
        </div>
      )}
    </div>
  );

  const mobileCartCards = (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-24 pt-2">
      {cart.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-neutral-400">
          <ShoppingCart className="h-12 w-12 opacity-40" />
          <p className="mt-2 font-medium">No lines yet</p>
        </div>
      ) : (
        cart.map((row, i) => (
          <button
            key={row.rowId}
            type="button"
            className={`flex w-full flex-col gap-2 rounded-xl border-2 p-4 text-left transition ${row.rowId === selectedRow ? "border-indigo-600 bg-indigo-50/80" : "border-neutral-200 bg-white active:scale-[0.99]"}`}
            onClick={() => setSelected(row.rowId)}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs text-neutral-500">#{i + 1}</span>
                <div className="text-base font-bold text-indigo-950">{row.name}</div>
                <div className="text-xs text-neutral-500">{row.sku}</div>
              </div>
              <div className="text-right text-lg font-black text-green-800">{fmtRs(row.total)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                Qty
                <input
                  type="number"
                  className="w-20 rounded-lg border px-2 py-2 text-center text-lg font-bold"
                  value={row.qty}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateRow(row.rowId, { qty: parseFloat(e.target.value) || 0 })}
                />
              </label>
              <span className="text-sm text-neutral-600">{row.unit}</span>
              <button
                type="button"
                className="ml-auto rounded-lg bg-red-50 px-4 py-2 text-sm font-bold text-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  removeRow(row.rowId);
                }}
              >
                Remove
              </button>
            </div>
          </button>
        ))
      )}
    </div>
  );

  const fKeyBar = (
    <div className="flex shrink-0 flex-wrap gap-1 border-t border-slate-700 bg-slate-800 p-1.5">
      {[
        { k: "F1", l: "Search", fn: () => searchRef.current?.focus() },
        { k: "F2", l: "Qty", fn: () => selectedCartRow && setModal("qty"), dis: !selectedCartRow },
        { k: "F3", l: "Customer", fn: () => custRef.current?.focus() },
        { k: "⇧F3", l: "Line %", fn: () => selectedCartRow && setModal("itemDisc"), dis: !selectedCartRow },
        { k: "F4", l: "Remove", fn: () => selectedRow && removeRow(selectedRow), dis: !selectedRow },
        { k: "F5", l: "Pay", fn: openSaveIfCart, dis: cart.length === 0 },
        { k: "F6", l: "Unit", fn: () => selectedCartRow && setModal("unit"), dis: !selectedCartRow },
        { k: "F7", l: "Hold", fn: saveCurrentHold, dis: cart.length === 0 },
        { k: "F8", l: "Charges", fn: () => setModal("charges") },
        { k: "F9", l: "Bill %", fn: () => setModal("billDisc") },
        { k: "F10", l: "Hold", fn: saveCurrentHold, dis: cart.length === 0 },
        { k: "F12", l: "Notes", fn: () => setModal("remarks") },
      ].map((b) => (
        <button
          key={b.k + b.l}
          type="button"
          disabled={Boolean(b.dis)}
          className={`pos-fkey flex min-w-[72px] flex-1 flex-col items-center rounded-md border px-1 py-1.5 text-[10px] ${
            b.dis ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-slate-600/80"
          } ${b.k === "F5" ? "save-btn !min-w-[100px]" : ""}`}
          onClick={b.fn}
        >
          <span className="fk-key">{b.k}</span>
          <span className="fk-label">{b.l}</span>
        </button>
      ))}
      <button
        type="button"
        className="pos-fkey save-btn flex min-w-[100px] flex-1 flex-col items-center rounded-md border px-1 py-1.5"
        onClick={openSaveIfCart}
        disabled={cart.length === 0}
      >
        <span className="fk-key">⌘P</span>
        <span className="fk-label flex items-center gap-1">
          <Printer className="h-3 w-3" /> Save
        </span>
      </button>
    </div>
  );

  return (
    <div className="pos-root flex h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-neutral-100 to-neutral-200 font-sans">
      <style>{`
        .pos-root .pos-modal { background: white; border-radius: 16px; box-shadow: 0 24px 48px rgba(0,0,0,0.2); width: 420px; max-width: 92vw; overflow: hidden; }
        .pos-modal-title { background: #1a237e; color: white; padding: 14px 20px; font-weight: 800; font-size: 15px; }
        .pos-modal-body { padding: 20px; }
        .pos-modal-footer { display: flex; gap: 10px; padding: 16px 20px; border-top: 1px solid #e0e0e0; background: #fafafa; }
        .pos-label { font-size: 11px; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 6px; }
        .pos-input { border: 2px solid #d0d0d0; border-radius: 8px; padding: 10px 12px; font-size: 15px; width: 100%; outline: none; transition: border-color 0.15s; }
        .pos-input:focus { border-color: #1a237e; }
        .pos-btn-primary { flex: 1; background: #1a237e; color: white; border: none; border-radius: 8px; padding: 10px; font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.15s; }
        .pos-btn-primary:hover:not(:disabled) { background: #283593; }
        .pos-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .pos-btn-ghost { flex: 1; background: none; border: 2px solid #d0d0d0; border-radius: 8px; padding: 10px; font-size: 13px; font-weight: 700; cursor: pointer; color: #555; transition: background 0.15s; }
        .pos-btn-ghost:hover:not(:disabled) { background: #f5f5f5; }
        .text-muted { color: #888; }
        .pos-fkey { background: #37474f; border: 1px solid #546e7a; color: #cfd8dc; }
        .pos-fkey .fk-key { font-size: 9px; color: #90a4ae; font-weight: 700; }
        .pos-fkey .fk-label { font-size: 11px; font-weight: 600; }
        .pos-fkey.save-btn { background: #1565c0; border-color: #1976d2; color: white; }
        .pos-table tbody tr { transition: background 0.1s; }
      `}</style>

      {topBar}

      {!isMobile ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-neutral-200 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-neutral-100 bg-white px-3 py-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                onClick={clearAll}
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear
              </button>
              <span className="truncate text-xs text-neutral-500">#{billNo.slice(-8)}</span>
            </div>
            {searchBar}
            {cartTable}
          </div>
          <aside className="flex w-[300px] shrink-0 flex-col overflow-hidden border-l border-neutral-200 bg-neutral-50 lg:w-[320px]">
            <div className="border-b border-neutral-200 px-3 py-2 text-xs text-neutral-600">
              {new Date().toLocaleDateString("en-PK", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </div>
            {customerBlock}
            {billSummary}
            <div className="border-t-2 border-indigo-900 bg-white p-3">
              <button
                type="button"
                disabled={cart.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-900 py-3 text-sm font-black text-white shadow disabled:cursor-not-allowed disabled:bg-neutral-300"
                onClick={() => setModal("save")}
              >
                <Printer className="h-4 w-4" /> Save &amp; print [F5]
              </button>
            </div>
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {searchBar}
          {mobileCartCards}
          <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-3 border-t border-neutral-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur-md">
            <button
              type="button"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-900"
              onClick={() => setMobileSheet("customer")}
            >
              <User className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase text-neutral-500">Total</div>
              <div className="truncate text-xl font-black text-indigo-950">{fmtRs(grandTotal)}</div>
            </div>
            <button
              type="button"
              disabled={cart.length === 0}
              className="shrink-0 rounded-xl bg-indigo-900 px-5 py-3 text-sm font-black text-white shadow disabled:bg-neutral-300"
              onClick={() => setModal("save")}
            >
              Checkout
            </button>
          </div>
        </div>
      )}

      {!isMobile && fKeyBar}
      {isMobile && (
        <div className="flex shrink-0 gap-1 border-t border-slate-700 bg-slate-800 p-2">
          <button type="button" className="flex-1 rounded-md bg-slate-600 py-2 text-xs font-bold text-white" onClick={() => setShowHelp(true)}>
            Shortcuts
          </button>
          <button
            type="button"
            className="flex-1 rounded-md bg-amber-700 py-2 text-xs font-bold text-white disabled:opacity-40"
            disabled={cart.length === 0}
            onClick={saveCurrentHold}
          >
            Hold
          </button>
        </div>
      )}

      {/* Mobile slide-up customer / summary */}
      {isMobile && mobileSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && setMobileSheet(null)}>
          <div className="max-h-[85vh] overflow-hidden rounded-t-2xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="font-bold text-indigo-950">Customer &amp; bill</span>
              <button type="button" className="text-sm font-semibold text-indigo-700" onClick={() => setMobileSheet(null)}>
                Close
              </button>
            </div>
            <div className="max-h-[calc(85vh-52px)] overflow-y-auto">
              {customerBlock}
              {billSummary}
              <div className="p-4 pb-8">
                <button
                  type="button"
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-bold text-red-700"
                  onClick={clearAll}
                >
                  <Trash2 className="h-4 w-4" /> Clear sale
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal === "qty" && selectedCartRow && (
        <QtyModal row={selectedCartRow} onClose={() => setModal(null)} onSave={(v) => { updateRow(selectedCartRow.rowId, { qty: v }); setModal(null); }} />
      )}
      {modal === "itemDisc" && selectedCartRow && (
        <ItemDiscModal row={selectedCartRow} onClose={() => setModal(null)} onSave={(v) => { updateRow(selectedCartRow.rowId, { discount: v }); setModal(null); }} />
      )}
      {modal === "billDisc" && <BillDiscModal value={billDisc} subtotal={subtotal} onClose={() => setModal(null)} onSave={(v) => { setBillDisc(v); setModal(null); }} />}
      {modal === "charges" && <ChargesModal value={extraCharges} onClose={() => setModal(null)} onSave={(v) => { setExtra(v); setModal(null); }} />}
      {modal === "remarks" && <RemarksModal value={remarks} onClose={() => setModal(null)} onSave={(v) => { setRemarks(v); setModal(null); }} />}
      {modal === "unit" && selectedCartRow && (
        <UnitModal row={selectedCartRow} onClose={() => setModal(null)} onSave={(u) => { updateRow(selectedCartRow.rowId, { unit: u }); setModal(null); }} />
      )}
      {modal === "save" && (
        <SaveBillModal
          subtotal={subtotal}
          billDisc={billDisc}
          extraCharges={extraCharges}
          grandTotal={grandTotal}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={saveBill}
        />
      )}
      {modal === "holds" && <HoldsModal holds={holds} onClose={() => setModal(null)} onResume={resumeHold} />}

      <PosShortcutsOverlay open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
