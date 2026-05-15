import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Camera,
  HelpCircle,
  Mic,
  Moon,
  Printer,
  Scale,
  Search,
  ShoppingCart,
  Sun,
  Trash2,
  User,
} from "lucide-react";
import { apiPublicUrl } from "@/lib/apiBase";
import { toast } from "@/hooks/use-toast";
import { WALKING_CUSTOMER, isWalkingCustomer } from "@/features/pos/constants";
import { readRecentCustomers, touchRecentCustomer } from "@/features/pos/recentCustomers";
import type { CartRow, Customer, PosDraftV1, PosHoldV1, Product } from "@/features/pos/types";
import { isWeightLikeUnit } from "@/features/pos/weightMoney";
import { adminFetch } from "@/features/pos/adminFetch";
import { calcRow, fmtRs, uid } from "@/features/pos/calc";
import type { ReceiptContext } from "@/features/pos/invoiceActions";
import { recordFrequentProduct, pickFrequentProducts } from "@/features/pos/frequentProducts";
import { getCachedProductSearch, setCachedProductSearch } from "@/features/pos/productSearchCache";
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
  PostSaleActionsModal,
  SaveBillModal,
  SellByRsModal,
  UnitModal,
} from "@/features/pos/PosModals";

type PosModal = null | "qty" | "itemDisc" | "billDisc" | "charges" | "remarks" | "unit" | "save" | "holds" | "sellRs";

type SellRsCtx = { kind: "cart"; rowId: string } | { kind: "product"; product: Product };

function buildDraft(
  cart: CartRow[],
  selectedRow: string | null,
  billDisc: number,
  billDiscFixedRs: number,
  packingCharge: number,
  shippingCharge: number,
  remarks: string,
  internalNotes: string,
  customer: Customer | null,
  billNo: string,
): PosDraftV1 {
  return {
    v: 1,
    cart,
    selectedRow,
    billDisc,
    billDiscFixedRs,
    packingCharge,
    shippingCharge,
    extraCharges: packingCharge + shippingCharge,
    remarks,
    internalNotes,
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
  const [billDiscFixedRs, setBillDiscFixedRs] = useState(0);
  const [packingCharge, setPackingCharge] = useState(0);
  const [shippingCharge, setShippingCharge] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [billNo, setBillNo] = useState(() => `POS-${Date.now()}`);

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIdx, setSearchIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

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
  const [sellRsCtx, setSellRsCtx] = useState<SellRsCtx | null>(null);
  const [recentCust, setRecentCust] = useState<Customer[]>(() => readRecentCustomers());
  const [posNight, setPosNight] = useState(false);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [branchLabel, setBranchLabel] = useState("");
  const [postSale, setPostSale] = useState<ReceiptContext | null>(null);
  const [catalogSeed, setCatalogSeed] = useState<Product[]>([]);

  const draftRestored = useRef(false);

  useEffect(() => {
    if (!token) return;
    adminFetch("/api/admin/branches")
      .then((d) => {
        const branches = (d as { branches?: { id: number; name: string; isHeadOffice?: boolean }[] }).branches ?? [];
        const stored = parseInt(localStorage.getItem("kdf_pos_branch_id") ?? "", 10);
        const pick =
          branches.find((b) => b.id === stored) ??
          branches.find((b) => b.isHeadOffice) ??
          branches[0];
        if (pick) {
          setBranchId(pick.id);
          setBranchLabel(pick.name);
          localStorage.setItem("kdf_pos_branch_id", String(pick.id));
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch(apiPublicUrl("/api/products?limit=80"))
      .then((r) => r.json())
      .then((d: { items?: Product[] }) => setCatalogSeed(d.items ?? []))
      .catch(() => {});
  }, [token]);

  /* Restore draft once when logged in */
  useEffect(() => {
    if (!token || draftRestored.current) return;
    const d = readDraft();
    draftRestored.current = true;
    if (!d) return;
    setCart(d.cart);
    setSelected(d.selectedRow);
    setBillDisc(d.billDisc);
    setBillDiscFixedRs(typeof d.billDiscFixedRs === "number" ? d.billDiscFixedRs : 0);
    setPackingCharge(typeof d.packingCharge === "number" ? d.packingCharge : 0);
    setShippingCharge(typeof d.shippingCharge === "number" ? d.shippingCharge : 0);
    setRemarks(d.remarks);
    setInternalNotes(typeof d.internalNotes === "string" ? d.internalNotes : "");
    setCustomer(d.customer);
    setBillNo(d.billNo);
  }, [token]);

  /* Persist draft (debounced) */
  useEffect(() => {
    if (!token) return;
    const t = window.setTimeout(() => {
      writeDraft(
        buildDraft(
          cart,
          selectedRow,
          billDisc,
          billDiscFixedRs,
          packingCharge,
          shippingCharge,
          remarks,
          internalNotes,
          customer,
          billNo,
        ),
      );
    }, 200);
    return () => clearTimeout(t);
  }, [token, cart, selectedRow, billDisc, billDiscFixedRs, packingCharge, shippingCharge, remarks, internalNotes, customer, billNo]);

  /* Product search — 50ms debounce, limit 40, memory cache fallback */
  useEffect(() => {
    if (!query.trim()) {
      setProducts([]);
      setSearchOpen(false);
      return;
    }
    setSearching(true);
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      const q = query.trim();
      try {
        const url = apiPublicUrl(`/api/products?search=${encodeURIComponent(q)}&limit=40`);
        const r = await fetch(url, { signal: ac.signal });
        const d = (await r.json()) as { items?: Product[] };
        if (!ac.signal.aborted) {
          const items = d.items ?? [];
          setProducts(items);
          setCachedProductSearch(q, items);
          setSearchOpen(true);
          setSearchIdx(0);
        }
      } catch {
        if (!ac.signal.aborted) {
          const cached = getCachedProductSearch(q);
          setProducts(cached ?? []);
          setSearchOpen(Boolean(cached?.length));
          setSearchIdx(0);
        }
      } finally {
        if (!ac.signal.aborted) setSearching(false);
      }
    }, 50);
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
  const extraCharges = packingCharge + shippingCharge;
  const discAmt =
    billDiscFixedRs > 0 ? Math.min(subtotal, billDiscFixedRs) : (subtotal * billDisc) / 100;
  const grandTotal = subtotal - discAmt + extraCharges;
  const billDiscountLabel =
    billDiscFixedRs > 0 ? `Fixed ${fmtRs(billDiscFixedRs)}` : billDisc > 0 ? `${billDisc}%` : "";
  const selectedCartRow = cart.find((r) => r.rowId === selectedRow) ?? null;

  const startVoiceSearch = useCallback(() => {
    type WithSpeech = Window & { webkitSpeechRecognition?: new () => { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; onresult: ((e: Event) => void) | null; onerror: (() => void) | null }; SpeechRecognition?: new () => { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; onresult: ((e: Event) => void) | null; onerror: (() => void) | null } };
    const w = window as WithSpeech;
    const SR = w.webkitSpeechRecognition ?? w.SpeechRecognition;
    if (!SR) {
      toast({
        title: "Voice search unavailable",
        description: "Try Chrome/Edge over HTTPS.",
        variant: "destructive",
      });
      return;
    }
    const rec = new SR();
    rec.lang = "en-PK";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: Event) => {
      const ev = e as unknown as { results: { 0: { 0: { transcript: string } } } };
      const t = ev.results[0]?.[0]?.transcript?.trim();
      if (t) setQuery(t);
    };
    rec.onerror = () => toast({ title: "Voice error", variant: "destructive" });
    rec.start();
  }, []);

  const decodeBarcodeFromFile = useCallback(async (file: File) => {
    type BDType = new (opts: { formats: string[] }) => { detect: (src: ImageBitmapSource) => Promise<{ rawValue?: string }[]> };
    const BD = (window as unknown as { BarcodeDetector?: BDType }).BarcodeDetector;
    if (!BD) {
      toast({
        title: "Camera scan unavailable",
        description: "Use a supported browser or type SKU / barcode.",
        variant: "destructive",
      });
      return;
    }
    try {
      const bmp = await createImageBitmap(file);
      const det = new BD({ formats: ["code_128", "ean_13", "ean_8", "qr_code", "upc_a", "upc_e", "itf"] });
      const codes = await det.detect(bmp);
      bmp.close?.();
      const raw = codes[0]?.rawValue?.trim();
      if (raw) {
        setQuery(raw);
        setSearchOpen(true);
        searchRef.current?.focus();
        toast({ title: "Code captured", description: raw });
      } else toast({ title: "No barcode found", variant: "destructive" });
    } catch {
      toast({ title: "Scan failed", variant: "destructive" });
    }
  }, []);

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

  const goSellRsCart = useCallback((explicitRowId?: string | null) => {
    const rid = explicitRowId ?? selectedRow;
    const row = cart.find((r) => r.rowId === rid) ?? null;
    if (!row || !isWeightLikeUnit(row.unit)) {
      toast({
        title: "Sell by Rs (weight)",
        description: "Select a cart line in kg / g / litre, or use Rs on a product in search.",
        variant: "destructive",
      });
      return;
    }
    if (explicitRowId) setSelected(explicitRowId);
    setSellRsCtx({ kind: "cart", rowId: row.rowId });
    setModal("sellRs");
  }, [cart, selectedRow]);

  const openSellRsProduct = useCallback((p: Product) => {
    const u = p.unit ?? "kg";
    if (!isWeightLikeUnit(u)) {
      toast({ title: "Not weight-priced", description: "Set product unit to kg, g, or litre for Rs-based weight sell.", variant: "destructive" });
      return;
    }
    setSellRsCtx({ kind: "product", product: p });
    setModal("sellRs");
  }, []);

  const newBillNumber = () => `POS-${Date.now()}`;

  const resetSaleState = useCallback(() => {
    setCart([]);
    setSelected(null);
    setBillDisc(0);
    setBillDiscFixedRs(0);
    setPackingCharge(0);
    setShippingCharge(0);
    setRemarks("");
    setInternalNotes("");
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
      billDiscFixedRs,
      packingCharge,
      shippingCharge,
      extraCharges: packingCharge + shippingCharge,
      remarks,
      internalNotes,
      customer,
    };
    pushHold(hold);
    refreshHolds();
    resetSaleState();
    toast({ title: "Sale held", description: "Cart cleared. Open Holds to resume." });
    searchRef.current?.focus();
  }, [billNo, billDisc, billDiscFixedRs, packingCharge, shippingCharge, cart, customer, refreshHolds, remarks, internalNotes, resetSaleState, selectedRow]);

  const resumeHold = useCallback((id: string) => {
    const h = listHolds().find((x) => x.id === id);
    if (!h) return;
    removeHoldById(id);
    refreshHolds();
    setCart(h.cart.map((r) => ({ ...r })));
    setSelected(h.selectedRow && h.cart.some((r) => r.rowId === h.selectedRow) ? h.selectedRow : (h.cart[0]?.rowId ?? null));
    setBillDisc(h.billDisc);
    setBillDiscFixedRs(typeof h.billDiscFixedRs === "number" ? h.billDiscFixedRs : 0);
    setPackingCharge(typeof h.packingCharge === "number" ? h.packingCharge : 0);
    setShippingCharge(typeof h.shippingCharge === "number" ? h.shippingCharge : 0);
    setRemarks(h.remarks);
    setInternalNotes(typeof h.internalNotes === "string" ? h.internalNotes : "");
    setCustomer(h.customer);
    setBillNo(h.billNo);
    setModal(null);
    setMobileSheet(null);
    toast({ title: "Hold resumed", description: h.billNo });
  }, [refreshHolds]);

  const persistDraftNow = useCallback(() => {
    writeDraft(
      buildDraft(
        cart,
        selectedRow,
        billDisc,
        billDiscFixedRs,
        packingCharge,
        shippingCharge,
        remarks,
        internalNotes,
        customer,
        billNo,
      ),
    );
  }, [billDisc, billDiscFixedRs, billNo, cart, customer, internalNotes, packingCharge, remarks, selectedRow, shippingCharge]);

  const finishPostSale = useCallback(() => {
    setPostSale(null);
    clearDraft();
    resetSaleState();
    searchRef.current?.focus();
  }, [resetSaleState]);

  const saveBill = async (payMethod: string, received: number, splitNote?: string | null) => {
    if (cart.length === 0) return;
    if (!branchId) {
      toast({
        title: "No branch selected",
        description: "Add a branch in Admin → Branches, then reload POS.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const items = cart.map((r) => ({
        name: r.name,
        sku: r.sku,
        qty: Number.isFinite(r.qty) ? r.qty : 0,
        unit: r.unit,
        pricePerUnit: Number.isFinite(r.pricePerUnit) ? r.pricePerUnit : 0,
        discount: Number.isFinite(r.discount) ? r.discount : 0,
        lineTotal: Number.isFinite(r.total) ? r.total : 0,
      }));
      const noteParts = [remarks?.trim(), splitNote?.trim()].filter(Boolean);
      if (packingCharge > 0) noteParts.unshift(`Packing: Rs ${packingCharge.toFixed(0)}`);
      if (internalNotes?.trim()) noteParts.push(`[Internal] ${internalNotes.trim()}`);
      const fullNotes = noteParts.length ? noteParts.join("\n---\n") : remarks;
      if (customer && !isWalkingCustomer(customer)) touchRecentCustomer(customer);
      cart.forEach((r) => {
        if (r.productId) recordFrequentProduct(r.productId);
      });
      const discountPctReport = subtotal > 0 ? Math.round((discAmt / subtotal) * 10000) / 100 : 0;
      const safeSub = Number.isFinite(subtotal) ? subtotal : 0;
      const safeGrand = Number.isFinite(grandTotal) ? grandTotal : 0;
      const safeReceived = Number.isFinite(received) ? received : safeGrand;

      await adminFetch("/api/admin/branch-invoices", {
        method: "POST",
        body: JSON.stringify({
          invoiceNo: billNo,
          type: "invoice",
          status: "completed",
          customerName: customer?.name ?? undefined,
          customerPhone: isWalkingCustomer(customer) ? undefined : customer?.phone,
          items,
          subtotal: safeSub,
          discountPct: discountPctReport,
          discountAmt: discAmt,
          shipping: shippingCharge,
          grandTotal: safeGrand,
          paymentMethod: payMethod.toLowerCase().replace(/ /g, "_"),
          paymentStatus: safeReceived >= safeGrand ? "paid" : "partial",
          paidAmount: safeReceived,
          notes: fullNotes || undefined,
          branchId,
        }),
      });

      setRecentCust(readRecentCustomers());
      setModal(null);
      setPostSale({
        rows: cart.map((r) => ({ ...r })),
        subtotal: safeSub,
        grand: safeGrand,
        customer,
        payMethod,
        amtReceived: safeReceived,
        billNo,
        orderRemarks: fullNotes ?? remarks,
        meta: {
          billDiscPct: billDisc,
          billDiscFixedRs,
          discAmt,
          packingRs: packingCharge,
          shippingRs: shippingCharge,
          internalNotes,
        },
      });
      toast({ title: "Bill saved", description: billNo });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save bill";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
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
  const goSellRsCartRef = useRef(goSellRsCart);
  goSellRsCartRef.current = goSellRsCart;

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
          setSellRsCtx(null);
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

      if (modalRef.current) return;

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
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        goSellRsCartRef.current();
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
  }, [clearAll, persistDraftNow, saveCurrentHold, goSellRsCart]);

  const openSaveIfCart = () => {
    if (cart.length > 0) setModal("save");
  };

  const topBar = (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 bg-gradient-to-r from-indigo-950/90 via-indigo-900/85 to-slate-900/90 px-3 text-white shadow-md backdrop-blur-md sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <ShoppingCart className="hidden h-5 w-5 shrink-0 text-amber-200/90 sm:block" />
        <span className="truncate text-sm font-extrabold tracking-wide sm:text-[15px]">KDF NUTS — POS</span>
        <span className="hidden truncate text-[11px] text-white/60 sm:inline">
          {billNo}
          {branchLabel ? ` · ${branchLabel}` : ""}
        </span>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        className="rounded-lg border border-white/20 bg-white/10 p-2 text-white/90 backdrop-blur-sm transition hover:bg-white/20"
        title={posNight ? "Day mode" : "Night mode"}
        onClick={() => setPosNight((n) => !n)}
        aria-label="Toggle POS night mode"
      >
        {posNight ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
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
    <div
      className={`relative flex shrink-0 items-center gap-2 border-b-2 border-indigo-800 px-3 py-2.5 sm:px-4 ${posNight ? "border-slate-600 bg-slate-900" : "bg-white"}`}
    >
      <input
        ref={barcodeInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await decodeBarcodeFromFile(f);
          e.target.value = "";
        }}
      />
      <Search className="h-5 w-5 shrink-0 text-indigo-700" />
      <input
        ref={searchRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, SKU, barcode… [F1]"
        className={`min-h-[48px] flex-1 rounded-xl border px-3 text-base outline-none ring-indigo-900/15 focus:border-indigo-800 focus:ring-2 sm:min-h-0 sm:py-2 sm:text-sm ${posNight ? "border-slate-600 bg-slate-800 text-slate-100 placeholder:text-slate-500" : "border-neutral-300"}`}
        autoFocus
        onFocus={() => {
          if (products.length > 0) setSearchOpen(true);
        }}
        onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
      />
      {searching && <span className="text-[11px] text-neutral-500">…</span>}
      <button
        type="button"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800 active:scale-95 sm:h-9 sm:w-9"
        title="Voice search"
        aria-label="Voice search"
        onMouseDown={(e) => e.preventDefault()}
        onClick={startVoiceSearch}
      >
        <Mic className="h-5 w-5" />
      </button>
      <button
        type="button"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 active:scale-95 sm:h-9 sm:w-9"
        title="Scan barcode (camera)"
        aria-label="Scan barcode"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => barcodeInputRef.current?.click()}
      >
        <Camera className="h-5 w-5" />
      </button>
      <span className="hidden text-[10px] text-neutral-500 xl:inline">F5 Pay · F7 Hold · ? Help</span>

      {searchOpen && products.length > 0 && (
        <div
          className={`absolute left-0 right-0 top-full z-30 max-h-72 overflow-y-auto rounded-b-lg border border-t-0 shadow-lg ${posNight ? "border-slate-600 bg-slate-900" : "border-neutral-300 bg-white"}`}
        >
          {products.map((p, i) => {
            const img = p.images?.[0];
            const canRs = p.unit != null && String(p.unit).trim() !== "" && isWeightLikeUnit(p.unit);
            return (
              <div
                key={p.id}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 ${i === searchIdx ? (posNight ? "bg-indigo-950/80" : "bg-indigo-50") : posNight ? "hover:bg-slate-800" : "hover:bg-indigo-50/60"}`}
                onMouseDown={() => addProduct(p)}
              >
                {img ? (
                  <img src={img} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-lg">🌰</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className={`truncate font-semibold ${posNight ? "text-slate-100" : "text-indigo-950"}`}>{p.name}</div>
                  <div className={`truncate text-[11px] ${posNight ? "text-slate-400" : "text-neutral-600"}`}>
                    {p.sku ? `SKU ${p.sku}` : `ID ${p.id}`} · {p.stock} {p.unit ?? "pc"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canRs && (
                    <button
                      type="button"
                      className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase ${posNight ? "border-amber-500/40 bg-amber-950/50 text-amber-200" : "border-amber-300 bg-amber-50 text-amber-900"}`}
                      title="Sell by Rs amount (weight)"
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        openSellRsProduct(p);
                      }}
                    >
                      <Scale className="mx-auto h-3 w-3" /> Rs
                    </button>
                  )}
                  <div className={`shrink-0 font-bold ${posNight ? "text-amber-200" : "text-indigo-900"}`}>{fmtRs(parseFloat(p.price))}</div>
                </div>
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
    <section
      className={`space-y-2 border-b p-3 sm:p-4 ${posNight ? "border-slate-600 bg-slate-900/80" : "border-neutral-200 bg-neutral-50/80"}`}
    >
      <div className={`text-[10px] font-extrabold uppercase tracking-wider ${posNight ? "text-slate-400" : "text-neutral-500"}`}>
        Customer [F3]
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${isWalkingCustomer(customer) ? "border-amber-500 bg-amber-500/15 text-amber-900" : posNight ? "border-slate-600 bg-slate-800 text-slate-200" : "border-neutral-300 bg-white text-neutral-800"}`}
          onClick={() => {
            setCustomer(WALKING_CUSTOMER);
            setCustQuery("");
            setCustResults([]);
          }}
        >
          Walking
        </button>
        <button
          type="button"
          className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${posNight ? "border-slate-600 bg-slate-800 text-slate-200" : "border-neutral-300 bg-white text-neutral-800"}`}
          onClick={() => {
            if (isWalkingCustomer(customer)) setCustomer(null);
            setTimeout(() => custRef.current?.focus(), 0);
          }}
        >
          Saved customer…
        </button>
      </div>
      {recentCust.length > 0 && !customer && (
        <div className="flex flex-wrap gap-1.5">
          <span className={`w-full text-[10px] font-bold uppercase ${posNight ? "text-slate-500" : "text-neutral-400"}`}>Recent</span>
          {recentCust.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`max-w-[140px] truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold ${posNight ? "border-slate-600 bg-slate-800 text-slate-200" : "border-indigo-200 bg-indigo-50 text-indigo-900"}`}
              onClick={() => {
                setCustomer(c);
                touchRecentCustomer(c);
                setRecentCust(readRecentCustomers());
              }}
              title={c.phone ?? c.name}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {customer ? (
        <div
          className={`flex items-center justify-between rounded-lg border px-3 py-2 ${posNight ? "border-slate-600 bg-slate-800" : "border-neutral-200 bg-white"}`}
        >
          <div>
            <div className={`font-bold ${posNight ? "text-slate-100" : "text-indigo-950"}`}>
              {customer.name}
              {isWalkingCustomer(customer) && (
                <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Walk-in</span>
              )}
            </div>
            {!isWalkingCustomer(customer) && customer.phone && (
              <div className={`text-xs ${posNight ? "text-slate-400" : "text-neutral-600"}`}>{customer.phone}</div>
            )}
            {isWalkingCustomer(customer) && (
              <button
                type="button"
                className="mt-2 text-left text-xs font-semibold text-indigo-600 hover:underline"
                onClick={() => {
                  setCustomer(null);
                  setTimeout(() => custRef.current?.focus(), 0);
                }}
              >
                Use saved customer instead →
              </button>
            )}
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
        <div className={`relative rounded-lg border px-3 py-2 ${posNight ? "border-slate-600 bg-slate-800" : "border-neutral-200 bg-white"}`}>
          <input
            ref={custRef}
            value={custQuery}
            onChange={(e) => setCustQuery(e.target.value)}
            placeholder="Name / phone…"
            className={`w-full border-0 bg-transparent text-sm outline-none ${posNight ? "text-slate-100 placeholder:text-slate-500" : ""}`}
          />
          {custResults.length > 0 && (
            <div
              className={`absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border shadow-md ${posNight ? "border-slate-600 bg-slate-900" : "border-neutral-200 bg-white"}`}
            >
              {custResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`block w-full border-b px-3 py-2 text-left text-sm last:border-0 ${posNight ? "border-slate-700 hover:bg-slate-800" : "border-neutral-100 hover:bg-indigo-50"}`}
                  onMouseDown={() => {
                    setCustomer(c);
                    setCustQuery("");
                    setCustResults([]);
                    touchRecentCustomer(c);
                    setRecentCust(readRecentCustomers());
                  }}
                >
                  <strong>{c.name}</strong>
                  {c.phone && <span className="ml-2 text-neutral-500">{c.phone}</span>}
                </button>
              ))}
            </div>
          )}
          {custSearching && (
            <div className={`mt-1 text-[10px] ${posNight ? "text-slate-500" : "text-neutral-500"}`}>Searching…</div>
          )}
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
      {billDiscFixedRs > 0 ? (
        <div className="flex justify-between text-sm text-orange-700">
          <span>Bill disc (fixed)</span>
          <span>− {fmtRs(Math.min(subtotal, billDiscFixedRs))}</span>
        </div>
      ) : (
        billDisc > 0 && (
          <div className="flex justify-between text-sm text-orange-700">
            <span>Bill disc ({billDisc}%)</span>
            <span>− {fmtRs((subtotal * billDisc) / 100)}</span>
          </div>
        )
      )}
      {packingCharge > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-neutral-600">Packing</span>
          <span className="font-semibold">+ {fmtRs(packingCharge)}</span>
        </div>
      )}
      {shippingCharge > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-neutral-600">Delivery</span>
          <span className="font-semibold">+ {fmtRs(shippingCharge)}</span>
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
          Bill disc [F9]
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
                  {row.discount > 0 && (
                    <div className="text-[10px] text-orange-700">
                      −{row.discountMode === "fixed" ? `${fmtRs(row.discount)}` : `${row.discount}%`}
                    </div>
                  )}
                  {isWeightLikeUnit(row.unit) && (
                    <button
                      type="button"
                      className="mt-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        goSellRsCart(row.rowId);
                      }}
                    >
                      Rs → weight
                    </button>
                  )}
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
                <td className="px-2 py-2 text-right text-xs">
                  {row.discount > 0
                    ? row.discountMode === "fixed"
                      ? fmtRs(row.discount)
                      : `${row.discount}%`
                    : "—"}
                </td>
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

  const frequentHits = pickFrequentProducts(
    [...catalogSeed, ...products].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i),
    8,
  );

  const mobileQuickStrip = (
    <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/10 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-2 py-1.5">
      {(
        [
          { label: "Customer", on: () => setMobileSheet("customer"), dis: false },
          { label: "Discount", on: () => setModal("billDisc"), dis: false },
          { label: "Packing", on: () => setModal("charges"), dis: false },
          { label: "Notes", on: () => setModal("remarks"), dis: false },
          { label: "Hold", on: saveCurrentHold, dis: cart.length === 0 },
          { label: "Holds", on: () => { setHolds(listHolds()); setModal("holds"); }, dis: false },
          { label: "Line disc", on: () => selectedCartRow && setModal("itemDisc"), dis: !selectedCartRow },
          { label: "Qty", on: () => selectedCartRow && setModal("qty"), dis: !selectedCartRow },
        ] as const
      ).map((x) => (
        <button
          key={x.label}
          type="button"
          disabled={x.dis}
          onClick={x.on}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold shadow-sm transition active:scale-[0.97] ${
            x.dis ? "cursor-not-allowed opacity-40" : "bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
          }`}
        >
          {x.label}
        </button>
      ))}
    </div>
  );

  const mobileFrequentStrip =
    frequentHits.length > 0 && !query.trim() ? (
      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/10 bg-slate-900/80 px-2 py-1.5">
        <span className="shrink-0 self-center text-[10px] font-bold uppercase text-white/50">Fast</span>
        {frequentHits.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => addProduct(p)}
            className="max-w-[120px] shrink-0 truncate rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white ring-1 ring-white/10 active:scale-[0.98]"
          >
            {p.name}
          </button>
        ))}
      </div>
    ) : null;

  const mobileCartCards = (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-32 pt-2 sm:pb-28">
      {cart.length === 0 ? (
        <div
          className={`mx-auto mt-6 flex max-w-sm flex-col items-center rounded-3xl border px-6 py-14 text-center shadow-inner ${
            posNight ? "border-slate-700 bg-slate-800/50 text-slate-400" : "border-neutral-200/80 bg-white/80 text-neutral-500"
          }`}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
            <ShoppingCart className="h-8 w-8" />
          </div>
          <p className={`mt-4 text-lg font-bold ${posNight ? "text-slate-100" : "text-indigo-950"}`}>Start a sale</p>
          <p className="mt-1 text-sm">Search products, scan a barcode, or use voice.</p>
        </div>
      ) : (
        cart.map((row, i) => (
          <div
            key={row.rowId}
            role="button"
            tabIndex={0}
            onClick={() => setSelected(row.rowId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelected(row.rowId);
              }
            }}
            className={`relative overflow-hidden rounded-xl border text-left shadow-sm transition-all active:scale-[0.99] ${
              row.rowId === selectedRow
                ? "border-indigo-500 bg-gradient-to-br from-indigo-50 to-white ring-2 ring-indigo-400/40"
                : posNight
                  ? "border-slate-600 bg-slate-800/90"
                  : "border-neutral-200/90 bg-white"
            }`}
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500 opacity-90" />
            <div className="p-3 pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Line {i + 1}</span>
                  <div className={`truncate text-base font-bold ${posNight ? "text-slate-50" : "text-indigo-950"}`}>{row.name}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{row.sku}</div>
                  {row.discount > 0 && (
                    <span className="mt-2 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">
                      Disc{" "}
                      {row.discountMode === "fixed" ? fmtRs(row.discount) : `${row.discount}%`}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase text-emerald-700">Line total</div>
                  <div className="text-lg font-black text-emerald-800">{fmtRs(row.total)}</div>
                  <div className="text-[11px] text-neutral-500">{fmtRs(row.pricePerUnit)} / {row.unit}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-stretch gap-1.5">
                <div
                  className={`flex min-h-[40px] flex-1 items-center gap-2 rounded-lg border px-2 ${
                    posNight ? "border-slate-600 bg-slate-900/60" : "border-neutral-200 bg-neutral-50/80"
                  }`}
                >
                  <span className="text-xs font-bold text-neutral-500">Qty</span>
                  <input
                    type="number"
                    className="min-w-0 flex-1 bg-transparent text-center text-lg font-black outline-none"
                    value={row.qty}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateRow(row.rowId, { qty: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="text-xs font-bold text-neutral-600">{row.unit}</span>
                </div>
                {isWeightLikeUnit(row.unit) && (
                  <button
                    type="button"
                    className="flex min-h-[40px] items-center justify-center rounded-lg bg-amber-500 px-3 text-[10px] font-black uppercase tracking-wide text-white shadow active:scale-95"
                    onClick={(e) => {
                      e.stopPropagation();
                      goSellRsCart(row.rowId);
                    }}
                  >
                    Rs → kg
                  </button>
                )}
                <button
                  type="button"
                  className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 active:scale-95"
                  title="Remove line"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRow(row.rowId);
                  }}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const fKeyBar = (
    <div className="flex shrink-0 flex-wrap gap-1 border-t border-slate-700 bg-slate-800 p-1.5">
      {[
        { k: "F1", l: "Search", fn: () => searchRef.current?.focus() },
        { k: "F2", l: "Qty", fn: () => selectedCartRow && setModal("qty"), dis: !selectedCartRow },
        { k: "⌃⇧R", l: "Rs→kg", fn: () => goSellRsCart(), dis: !selectedCartRow || !isWeightLikeUnit(selectedCartRow.unit) },
        { k: "F3", l: "Customer", fn: () => custRef.current?.focus() },
        { k: "⇧F3", l: "Line %", fn: () => selectedCartRow && setModal("itemDisc"), dis: !selectedCartRow },
        { k: "F4", l: "Remove", fn: () => selectedRow && removeRow(selectedRow), dis: !selectedRow },
        { k: "F5", l: "Pay", fn: openSaveIfCart, dis: cart.length === 0 },
        { k: "F6", l: "Unit", fn: () => selectedCartRow && setModal("unit"), dis: !selectedCartRow },
        { k: "F7", l: "Hold", fn: saveCurrentHold, dis: cart.length === 0 },
        { k: "F8", l: "Charges", fn: () => setModal("charges") },
        { k: "F9", l: "Bill disc", fn: () => setModal("billDisc") },
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
    <div
      className={`pos-root flex h-[100dvh] flex-col overflow-hidden font-sans ${posNight ? "bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100" : "bg-gradient-to-b from-neutral-100 to-neutral-200"}`}
      data-pos-night={posNight ? "true" : "false"}
    >
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
          <div className={`flex min-w-0 flex-1 flex-col overflow-hidden border-r border-neutral-200 ${posNight ? "border-slate-700 bg-slate-900" : "bg-white"}`}>
            <div className={`flex items-center justify-between gap-2 border-b px-3 py-2 ${posNight ? "border-slate-700 bg-slate-900" : "border-neutral-100 bg-white"}`}>
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
          <aside className={`flex w-[300px] shrink-0 flex-col overflow-hidden border-l border-neutral-200 lg:w-[320px] ${posNight ? "border-slate-700 bg-slate-900" : "bg-neutral-50"}`}>
            <div className={`border-b px-3 py-2 text-xs ${posNight ? "border-slate-700 text-slate-400" : "border-neutral-200 text-neutral-600"}`}>
              {new Date().toLocaleDateString("en-PK", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </div>
            {customerBlock}
            {billSummary}
            <div className={`border-t-2 border-indigo-900 p-3 ${posNight ? "border-indigo-500 bg-slate-800" : "bg-white"}`}>
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
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden ${posNight ? "bg-gradient-to-b from-slate-950 to-slate-900" : "bg-gradient-to-b from-slate-50 via-white to-slate-100"}`}
        >
          {mobileQuickStrip}
          {mobileFrequentStrip}
          {searchBar}
          {mobileCartCards}
          <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex justify-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
            <div className="pointer-events-auto flex w-full max-w-lg items-stretch gap-1.5 rounded-xl border border-white/20 bg-slate-900/95 p-2 shadow-[0_-6px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl ring-1 ring-white/10">
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/15 transition active:scale-95"
                onClick={() => setMobileSheet("customer")}
              >
                <User className="h-5 w-5" />
                <span className="mt-0.5 text-[8px] font-bold uppercase text-white/70">Cust</span>
              </button>
              <div className="min-w-0 flex-1 rounded-lg bg-gradient-to-br from-indigo-600/90 to-violet-700/90 px-2.5 py-1.5 text-white shadow-inner">
                <div className="text-[9px] font-bold uppercase tracking-wide text-white/70">Total</div>
                <div className="truncate text-xl font-black leading-tight tracking-tight">{fmtRs(grandTotal)}</div>
                {cart.length > 0 && (
                  <div className="truncate text-[10px] font-semibold text-white/60">
                    {cart.length} lines · sub {fmtRs(subtotal)}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => setModal("save")}
                className="flex min-w-[92px] shrink-0 flex-col items-center justify-center rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black uppercase tracking-wide text-white shadow-md shadow-emerald-600/30 transition enabled:active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:shadow-none"
              >
                <Printer className="mb-0.5 h-4 w-4" />
                Pay
              </button>
            </div>
          </div>
        </div>
      )}

      {!isMobile && fKeyBar}
      {isMobile && (
        <div className="flex shrink-0 gap-2 border-t border-slate-800 bg-slate-950 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="flex-1 rounded-xl bg-slate-800 py-3 text-xs font-bold text-white ring-1 ring-white/10 active:scale-[0.98]"
            onClick={() => setShowHelp(true)}
          >
            Shortcuts
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl bg-amber-600 py-3 text-xs font-black text-white shadow-md shadow-amber-900/20 disabled:opacity-40"
            disabled={cart.length === 0}
            onClick={saveCurrentHold}
          >
            Hold sale
          </button>
        </div>
      )}

      {/* Mobile slide-up customer / summary */}
      {isMobile && mobileSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && setMobileSheet(null)}>
          <div className="max-h-[85vh] overflow-hidden rounded-t-3xl bg-white shadow-2xl ring-1 ring-black/5" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-neutral-200" />
            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <span className="text-base font-black text-indigo-950">Customer &amp; bill</span>
              <button type="button" className="rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-bold text-indigo-800" onClick={() => setMobileSheet(null)}>
                Done
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
        <ItemDiscModal
          row={selectedCartRow}
          onClose={() => setModal(null)}
          onSave={(v, mode) => {
            updateRow(selectedCartRow.rowId, { discount: v, discountMode: mode });
            setModal(null);
          }}
        />
      )}
      {modal === "billDisc" && (
        <BillDiscModal
          billDiscPct={billDisc}
          billDiscFixedRs={billDiscFixedRs}
          subtotal={subtotal}
          onClose={() => setModal(null)}
          onSave={(pct, fixed) => {
            setBillDisc(pct);
            setBillDiscFixedRs(fixed);
            setModal(null);
          }}
        />
      )}
      {modal === "charges" && (
        <ChargesModal
          packingCharge={packingCharge}
          shippingCharge={shippingCharge}
          onClose={() => setModal(null)}
          onSave={(p, s) => {
            setPackingCharge(p);
            setShippingCharge(s);
            setModal(null);
          }}
        />
      )}
      {modal === "remarks" && (
        <RemarksModal
          orderRemarks={remarks}
          internalNotes={internalNotes}
          onClose={() => setModal(null)}
          onSave={(order, internal) => {
            setRemarks(order);
            setInternalNotes(internal);
            setModal(null);
          }}
        />
      )}
      {modal === "unit" && selectedCartRow && (
        <UnitModal row={selectedCartRow} onClose={() => setModal(null)} onSave={(u) => { updateRow(selectedCartRow.rowId, { unit: u }); setModal(null); }} />
      )}
      {modal === "save" && (
        <SaveBillModal
          subtotal={subtotal}
          billDiscountAmt={discAmt}
          billDiscountLabel={billDiscountLabel}
          packingCharge={packingCharge}
          shippingCharge={shippingCharge}
          grandTotal={grandTotal}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={(method, received, splitNote) => saveBill(method, received, splitNote)}
        />
      )}
      {modal === "sellRs" && sellRsCtx && (() => {
        const row = sellRsCtx.kind === "cart" ? cart.find((r) => r.rowId === sellRsCtx.rowId) ?? null : null;
        const title = sellRsCtx.kind === "cart" ? row?.name ?? "" : sellRsCtx.product.name;
        const price = sellRsCtx.kind === "cart" ? row?.pricePerUnit ?? 0 : parseFloat(sellRsCtx.product.price ?? "0");
        const unit = sellRsCtx.kind === "cart" ? row?.unit ?? "kg" : sellRsCtx.product.unit ?? "kg";
        if (!title) return null;
        return (
          <SellByRsModal
            title={title}
            pricePerUnit={price}
            unit={unit}
            onClose={() => {
              setModal(null);
              setSellRsCtx(null);
            }}
            onApply={(rs, qtyKg) => {
              if (sellRsCtx.kind === "cart") {
                updateRow(sellRsCtx.rowId, { qty: qtyKg, unit: "kg" });
              } else if (sellRsCtx.kind === "product") {
                const p = sellRsCtx.product;
                const nu = calcRow({
                  rowId: uid(),
                  productId: p.id,
                  sku: p.sku ?? `P${p.id}`,
                  name: p.name,
                  qty: qtyKg,
                  unit: "kg",
                  pricePerUnit: parseFloat(p.price ?? "0"),
                  discount: 0,
                  total: 0,
                });
                setCart((prev) => [...prev, nu]);
                setSelected(nu.rowId);
              }
              setQuery("");
              setProducts([]);
              setSearchOpen(false);
              setModal(null);
              setSellRsCtx(null);
              searchRef.current?.focus();
            }}
          />
        );
      })()}
      {modal === "holds" && <HoldsModal holds={holds} onClose={() => setModal(null)} onResume={resumeHold} />}
      {postSale && <PostSaleActionsModal receipt={postSale} onDone={finishPostSale} />}

      <PosShortcutsOverlay open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
