import { useState, useCallback, useRef, useEffect, KeyboardEvent } from "react";
import { useLocation } from "wouter";
import {
  Search, Plus, Trash2, Printer, Download,
  MessageCircle, Mail, Eye, FileText, History,
  Phone, Calculator, Loader2, CheckCircle2,
  X, Clock, TrendingUp, ShoppingBag, CreditCard,
  Wallet, Banknote, ArrowUpRight, RotateCcw,
  Building2, QrCode, Link2, Zap, RefreshCw,
  CheckCircle, XCircle, MinusCircle, Landmark,
  Smartphone, Package, ChevronRight, ChevronLeft,
  Minus, UserPlus, Users, MapPin, StickyNote,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

/* ═══════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════ */
type SellingMode = "amount" | "grams" | "kg" | "box" | "custom";
type InvoiceStatus = "paid" | "unpaid" | "partial";
type PaymentGwStatus = "idle" | "pending" | "success" | "failed";

interface Customer {
  id: number; name: string; phone: string; email: string;
  address: string; totalOrders: number; totalSpent: number; loyaltyPoints: number;
  source?: "shopify" | "local";
}

interface Supplier {
  id: number; name: string; phone: string; city: string;
}

interface InvoiceItem {
  id: string; name: string; sku: string;
  sellingMode: SellingMode; pricePerKg: number;
  inputValue: number; gramsPerBox: number; customPrice: number;
  discount: number; grams: number; lineTotal: number;
}

interface PosEntry {
  name: string; sku: string; pricePerKg: number;
  sellingMode: SellingMode; inputValue: string;
  gramsPerBox: number; customPrice: string; discount: string;
}

interface PurchaseRow {
  id: string; name: string; sku: string;
  quantity: number; unit: string; costPrice: number; total: number;
}

/* ═══════════════════════════════════════════════
   MOCK DATA
═══════════════════════════════════════════════ */
const MOCK_CUSTOMERS: Customer[] = [
  { id: 1, name: "Ahmed Khan",       phone: "03001234567", email: "ahmed@example.com",  address: "House 12, Block B, DHA Lahore",     totalOrders: 15, totalSpent: 45000, loyaltyPoints: 450, source: "shopify" },
  { id: 2, name: "Sara Malik",       phone: "03211234567", email: "sara@example.com",   address: "Flat 3, Gulshan-e-Iqbal, Karachi", totalOrders: 8,  totalSpent: 22000, loyaltyPoints: 220, source: "shopify" },
  { id: 3, name: "Muhammad Ali",     phone: "03451234567", email: "mali@example.com",   address: "Street 5, F-10, Islamabad",        totalOrders: 23, totalSpent: 78000, loyaltyPoints: 780, source: "local"   },
  { id: 4, name: "Fatima Zahra",     phone: "03321234567", email: "fatima@example.com", address: "Johar Town, Lahore",               totalOrders: 5,  totalSpent: 12000, loyaltyPoints: 120, source: "shopify" },
  { id: 5, name: "Usman Tariq",      phone: "03121234567", email: "usman@example.com",  address: "Model Town, Lahore",               totalOrders: 31, totalSpent: 95000, loyaltyPoints: 950, source: "local"   },
  { id: 6, name: "Walking Customer", phone: "03000000000", email: "",                   address: "Walk-in",                          totalOrders: 0,  totalSpent: 0,     loyaltyPoints: 0,   source: "local"   },
];

const MOCK_PRODUCTS = [
  { id: "p1",  name: "Premium Almonds (Badam)",      sku: "ALM-001", pricePerKg: 3600, category: "Nuts"   },
  { id: "p2",  name: "Cashews Grade A (Kaju)",        sku: "CSH-001", pricePerKg: 4400, category: "Nuts"   },
  { id: "p3",  name: "Pistachios Iranian (Pista)",    sku: "PST-001", pricePerKg: 7000, category: "Nuts"   },
  { id: "p4",  name: "Walnuts Whole (Akhrot)",        sku: "WLN-001", pricePerKg: 3000, category: "Nuts"   },
  { id: "p5",  name: "Dried Apricots (Khubani)",      sku: "APR-001", pricePerKg: 1800, category: "Dried"  },
  { id: "p6",  name: "Black Raisins (Kishmish)",      sku: "RSN-001", pricePerKg: 1200, category: "Dried"  },
  { id: "p7",  name: "Pine Nuts (Chilgoza)",          sku: "PNT-001", pricePerKg: 8400, category: "Nuts"   },
  { id: "p8",  name: "Dates Medjool (Khajoor)",       sku: "DT-001",  pricePerKg: 2400, category: "Dates"  },
  { id: "p9",  name: "Mix Nuts Premium Blend",        sku: "MIX-001", pricePerKg: 5600, category: "Mix"    },
  { id: "p10", name: "Hazelnuts Roasted (Funduq)",    sku: "HZL-001", pricePerKg: 4000, category: "Nuts"   },
  { id: "p11", name: "Dried Figs (Anjeer)",           sku: "FIG-001", pricePerKg: 2200, category: "Dried"  },
  { id: "p12", name: "Coconut Desiccated (Naryal)",   sku: "CCN-001", pricePerKg: 1600, category: "Other"  },
];

const MOCK_SUPPLIERS: Supplier[] = [
  { id: 1, name: "Kabul Dry Fruits Co.", phone: "03001112222", city: "Peshawar" },
  { id: 2, name: "Quetta Traders",       phone: "03332223333", city: "Quetta"   },
  { id: 3, name: "Lahore Wholesale Nuts",phone: "04211223344", city: "Lahore"   },
];

const MOCK_HISTORY = [
  { id: "i1", invoiceNo: "INV-2026-001", customer: MOCK_CUSTOMERS[0], total: 5350,  paymentMethod: "card",          status: "paid"    as InvoiceStatus, createdAt: new Date("2026-05-05T10:30"), type: "invoice" },
  { id: "i2", invoiceNo: "INV-2026-002", customer: MOCK_CUSTOMERS[2], total: 12300, paymentMethod: "bank_transfer", status: "paid"    as InvoiceStatus, createdAt: new Date("2026-05-05T14:20"), type: "invoice" },
  { id: "i3", invoiceNo: "INV-2026-003", customer: MOCK_CUSTOMERS[1], total: 3400,  paymentMethod: "easypaisa",     status: "unpaid"  as InvoiceStatus, createdAt: new Date("2026-05-06T09:15"), type: "invoice" },
  { id: "i4", invoiceNo: "BILL-2026-001", customer: null,             total: 45000, paymentMethod: "bank_transfer", status: "paid"    as InvoiceStatus, createdAt: new Date("2026-05-06T11:00"), type: "bill"    },
  { id: "i5", invoiceNo: "INV-2026-004", customer: MOCK_CUSTOMERS[4], total: 8900,  paymentMethod: "card",          status: "partial" as InvoiceStatus, createdAt: new Date("2026-05-06T14:45"), type: "invoice" },
  { id: "i6", invoiceNo: "BILL-2026-002", customer: null,             total: 28000, paymentMethod: "cheque",        status: "unpaid"  as InvoiceStatus, createdAt: new Date("2026-05-06T16:00"), type: "bill"    },
];

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
const fmt   = (n: number) => n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtRs = (n: number) => `Rs. ${fmt(n)}`;
const genNo = (p: string) => `${p}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
const genId = () => Math.random().toString(36).slice(2);

const MODE_LABELS: Record<SellingMode, { short: string; placeholder: string; unit: string }> = {
  amount:  { short: "Rs",  placeholder: "Enter amount",   unit: "Rs"  },
  grams:   { short: "g",   placeholder: "Weight (grams)", unit: "g"   },
  kg:      { short: "KG",  placeholder: "Weight (KG)",    unit: "KG"  },
  box:     { short: "Box", placeholder: "# of boxes",     unit: "box" },
  custom:  { short: "Qty", placeholder: "Quantity",       unit: "pcs" },
};

const STATUS_BADGE: Record<string, string> = {
  paid:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  unpaid:  "bg-red-50    text-red-700    border-red-200",
  partial: "bg-amber-50  text-amber-700  border-amber-200",
};
const STATUS_LABEL: Record<string, string> = { paid: "Paid", unpaid: "Unpaid", partial: "Partial" };
const STATUS_ICON: Record<string, React.ReactNode> = {
  paid:    <CheckCircle className="w-2.5 h-2.5" />,
  unpaid:  <XCircle    className="w-2.5 h-2.5" />,
  partial: <MinusCircle className="w-2.5 h-2.5" />,
};

function newPurchaseRow(): PurchaseRow {
  return { id: genId(), name: "", sku: "", quantity: 1, unit: "kg", costPrice: 0, total: 0 };
}

function computeItem(entry: Omit<InvoiceItem, "grams" | "lineTotal">): Pick<InvoiceItem, "grams" | "lineTotal"> {
  const { pricePerKg, sellingMode, inputValue, gramsPerBox, customPrice, discount } = entry;
  let grams = 0, rawTotal = 0;
  switch (sellingMode) {
    case "amount":  grams = pricePerKg > 0 ? (inputValue / pricePerKg) * 1000 : 0; rawTotal = inputValue; break;
    case "grams":   grams = inputValue; rawTotal = (inputValue / 1000) * pricePerKg; break;
    case "kg":      grams = inputValue * 1000; rawTotal = inputValue * pricePerKg; break;
    case "box":     grams = inputValue * gramsPerBox; rawTotal = (grams / 1000) * pricePerKg; break;
    case "custom":  rawTotal = inputValue * customPrice; break;
  }
  return { grams, lineTotal: Math.max(0, rawTotal * (1 - discount / 100)) };
}

function displayWeight(item: InvoiceItem): string {
  if (item.sellingMode === "custom") return `${item.inputValue} pcs`;
  if (item.grams >= 1000) return `${(item.grams / 1000).toFixed(3).replace(/\.?0+$/, "")} KG`;
  if (item.grams > 0)     return `${Math.round(item.grams)} g`;
  return "—";
}

function livePreview(entry: PosEntry): { grams: number; total: number; weightStr: string } {
  const v = parseFloat(entry.inputValue) || 0;
  const pkgRs = entry.pricePerKg;
  const disc = parseFloat(entry.discount) || 0;
  let grams = 0, raw = 0;
  switch (entry.sellingMode) {
    case "amount":  grams = pkgRs > 0 ? (v / pkgRs) * 1000 : 0; raw = v; break;
    case "grams":   grams = v; raw = (v / 1000) * pkgRs; break;
    case "kg":      grams = v * 1000; raw = v * pkgRs; break;
    case "box":     { const gpb = entry.gramsPerBox || 500; grams = v * gpb; raw = (grams / 1000) * pkgRs; break; }
    case "custom":  raw = v * (parseFloat(entry.customPrice) || 0); break;
  }
  const total = Math.max(0, raw * (1 - disc / 100));
  const weightStr = entry.sellingMode === "custom" ? `${v} pcs`
    : grams >= 1000 ? `${(grams / 1000).toFixed(3).replace(/\.?0+$/, "")} KG`
    : grams > 0 ? `${Math.round(grams)} g` : "";
  return { grams, total, weightStr };
}

/* ═══════════════════════════════════════════════
   BREADCRUMB NAV
═══════════════════════════════════════════════ */
function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  const [, navigate] = useLocation();
  return (
    <nav className="flex items-center gap-1.5 text-sm">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
          {item.href ? (
            <button
              onClick={() => navigate(item.href!)}
              className="text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              {item.label}
            </button>
          ) : (
            <span className="text-foreground font-semibold">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/* ═══════════════════════════════════════════════
   PAYMENT LINK CARD
═══════════════════════════════════════════════ */
interface PaymentLinkCardProps {
  invoiceNo: string; amount: number; customer: Customer | null;
  onStatusChange: (s: PaymentGwStatus) => void; gwStatus: PaymentGwStatus;
}
function PaymentLinkCard({ invoiceNo, amount, customer, onStatusChange, gwStatus }: PaymentLinkCardProps) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [link, setLink] = useState("");
  const [linkExpiry, setLinkExpiry] = useState("");
  const [txnId, setTxnId] = useState("");

  const generateLink = async () => {
    if (!amount) { toast({ variant: "destructive", title: "Add items first" }); return; }
    setGenerating(true); onStatusChange("pending");
    await new Promise(r => setTimeout(r, 1800));
    const fakeLink = `https://pay.kdfmart.pk/inv/${invoiceNo.toLowerCase().replace("inv-", "")}`;
    const fakeId = `MBL${Date.now()}`;
    setLink(fakeLink); setTxnId(fakeId);
    setLinkExpiry(new Date(Date.now() + 86400000).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
    setGenerating(false); onStatusChange("idle");
    toast({ title: "Payment link generated!" });
  };

  const copyLink = () => { navigator.clipboard.writeText(link).catch(() => {}); toast({ title: "Copied!" }); };

  const sendWhatsApp = () => {
    if (!customer?.phone) { toast({ variant: "destructive", title: "No customer phone" }); return; }
    const msg = encodeURIComponent(`Hello ${customer.name}!\n\nYour invoice *${invoiceNo}* — *${fmtRs(amount)}*\n\nPay: ${link}\n\nKDF MART`);
    window.open(`https://wa.me/92${customer.phone.slice(1)}?text=${msg}`, "_blank");
  };

  const simulatePay = async () => {
    onStatusChange("pending");
    await new Promise(r => setTimeout(r, 2000));
    onStatusChange("success");
    toast({ title: "Payment received!", description: `${fmtRs(amount)} — ${txnId}` });
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border flex items-center gap-3 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-blue-950/30 dark:to-indigo-950/30">
        <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
          <Landmark className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Meezan Bank EPG</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <p className="text-xs text-muted-foreground">Connected · Sandbox</p>
          </div>
        </div>
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] shrink-0">Ready</Badge>
      </div>
      <div className="px-4 py-4 space-y-3">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl px-4 py-3.5 text-white">
          <p className="text-[11px] text-blue-200 uppercase tracking-wide font-semibold">Invoice Amount</p>
          <p className="text-xl font-black mt-0.5 tabular-nums">{fmtRs(amount || 0)}</p>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[11px] text-blue-200 font-mono">{invoiceNo}</p>
            {customer && <p className="text-[11px] text-blue-200 truncate max-w-[120px]">{customer.name}</p>}
          </div>
        </div>

        {!link ? (
          <Button className="w-full gap-2 h-10 bg-blue-600 hover:bg-blue-700 font-semibold text-sm" onClick={generateLink} disabled={generating}>
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting…</> : <><Zap className="w-4 h-4" /> Generate Payment Link</>}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-muted/30 rounded-xl p-3">
              <div className="w-16 h-16 bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center shrink-0 shadow-sm">
                <QrCode className="w-9 h-9 text-gray-800" />
                <p className="text-[7px] text-gray-400 mt-0.5 font-mono">{invoiceNo}</p>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-xs font-bold">Scan QR to Pay</p>
                <div className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-md px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-[10px] text-green-700">Exp: {linkExpiry}</span>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono truncate">{link}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs text-green-700 border-green-300 hover:bg-green-50" onClick={sendWhatsApp}>
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={copyLink}>
                <Link2 className="w-3.5 h-3.5" /> Copy Link
              </Button>
            </div>
            <div className="border-t border-border pt-3">
              {gwStatus === "success" ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-green-800">Payment Received</p>
                    <p className="text-[10px] text-green-600 font-mono">{txnId}</p>
                  </div>
                </div>
              ) : (
                <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-sm h-9" onClick={simulatePay} disabled={gwStatus === "pending"}>
                  {gwStatus === "pending" ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <><Zap className="w-4 h-4" /> Simulate Payment</>}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   POS ENTRY BAR — Enterprise single-row layout
═══════════════════════════════════════════════ */
const BLANK_ENTRY: PosEntry = {
  name: "", sku: "", pricePerKg: 0,
  sellingMode: "grams",
  inputValue: "", gramsPerBox: 500, customPrice: "", discount: "",
};

interface ApiProduct { id: string; name: string; sku: string; pricePerKg: number; category: string; }

interface PosEntryBarProps {
  onAdd: (item: InvoiceItem) => void;
}
function PosEntryBar({ onAdd }: PosEntryBarProps) {
  const { toast } = useToast();
  const [entry, setEntry] = useState<PosEntry>({ ...BLANK_ENTRY });
  const [allProducts, setAllProducts] = useState<ApiProduct[]>(MOCK_PRODUCTS);
  const [prodSuggestions, setProdSuggestions] = useState<ApiProduct[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const valueRef  = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setLoadingProducts(true);
    fetch("/api/products?limit=300&active=true")
      .then(r => r.json())
      .then(data => {
        if (data.items?.length) {
          const mapped: ApiProduct[] = data.items.map((p: any) => {
            const basePrice = parseFloat(p.price ?? "0");
            const kgVariant = p.variants?.find((v: any) => v.value?.toLowerCase().includes("1kg") || v.value?.toLowerCase().includes("1 kg"));
            const pricePerKg = kgVariant ? parseFloat(kgVariant.price ?? basePrice) : basePrice;
            return {
              id: String(p.id),
              name: p.name,
              sku: p.variants?.[0]?.id ? `SKU-${p.id}` : String(p.id),
              pricePerKg: pricePerKg,
              category: p.categoryId ? "Product" : "Other",
            };
          });
          setAllProducts(mapped);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  const preview = livePreview(entry);
  const canAdd = entry.name.trim() !== "" && parseFloat(entry.inputValue) > 0;
  const set = (patch: Partial<PosEntry>) => setEntry(e => ({ ...e, ...patch }));
  const modeLabel = MODE_LABELS[entry.sellingMode];

  const handleSearch = (val: string) => {
    set({ name: val, sku: "", pricePerKg: 0 });
    if (!val.trim()) { setProdSuggestions([]); setShowDrop(false); return; }
    const q = val.toLowerCase();
    const matches = allProducts.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    ).slice(0, 12);
    setProdSuggestions(matches);
    setShowDrop(true);
  };

  const pickProduct = (p: ApiProduct) => {
    set({ name: p.name, sku: p.sku, pricePerKg: p.pricePerKg });
    setProdSuggestions([]); setShowDrop(false);
    setTimeout(() => valueRef.current?.focus(), 50);
  };

  const doAdd = () => {
    if (!canAdd) { toast({ variant: "destructive", title: "Enter product and value" }); return; }
    const v = parseFloat(entry.inputValue);
    const disc = parseFloat(entry.discount) || 0;
    const gpb = entry.gramsPerBox || 500;
    const cp = parseFloat(entry.customPrice) || 0;
    const base: Omit<InvoiceItem, "grams" | "lineTotal"> = {
      id: genId(), name: entry.name, sku: entry.sku,
      sellingMode: entry.sellingMode, pricePerKg: entry.pricePerKg,
      inputValue: v, gramsPerBox: gpb, customPrice: cp, discount: disc,
    };
    const { grams, lineTotal } = computeItem(base);
    onAdd({ ...base, grams, lineTotal });
    setEntry({ ...BLANK_ENTRY });
    setProdSuggestions([]); setShowDrop(false);
    setTimeout(() => searchRef.current?.focus(), 30);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); doAdd(); }
    if (e.key === "Escape") setShowDrop(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* ── Single-row POS bar ── */}
      <div className="flex items-center gap-2 bg-muted/30 border border-border/60 rounded-xl p-2">

        {/* 1. Product Search — flex-1 */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchRef}
            value={entry.name}
            onChange={e => handleSearch(e.target.value)}
            onFocus={() => {
              if (entry.name.trim()) {
                const q = entry.name.toLowerCase();
                const m = allProducts.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
                setProdSuggestions(m.length > 0 ? m.slice(0, 12) : allProducts.slice(0, 8));
                setShowDrop(true);
              } else {
                setProdSuggestions(allProducts.slice(0, 8));
                setShowDrop(true);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search product or SKU…"
            className="pl-8 pr-2 h-9 text-sm bg-background border-border/60"
          />
          {entry.name && (
            <button
              onClick={() => { set({ name: "", sku: "", pricePerKg: 0 }); setProdSuggestions([]); setShowDrop(false); searchRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 2. Unit / Mode */}
        <Select value={entry.sellingMode} onValueChange={(v: SellingMode) => set({ sellingMode: v, inputValue: "" })}>
          <SelectTrigger className="h-9 w-[80px] text-xs bg-background border-border/60 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="grams">Grams</SelectItem>
            <SelectItem value="kg">KG</SelectItem>
            <SelectItem value="amount">Rs (Amt)</SelectItem>
            <SelectItem value="box">Boxes</SelectItem>
            <SelectItem value="custom">Qty (pcs)</SelectItem>
          </SelectContent>
        </Select>

        {/* 3. Value input */}
        <div className="relative shrink-0">
          <Input
            ref={valueRef}
            type="number"
            value={entry.inputValue}
            onChange={e => set({ inputValue: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder={modeLabel.placeholder}
            className="h-9 w-[110px] text-sm text-right pr-8 bg-background border-border/60"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium pointer-events-none">
            {modeLabel.unit}
          </span>
        </div>

        {/* 4. Rate (auto-filled, readonly) */}
        <div className="relative shrink-0">
          <Input
            type="number"
            value={entry.pricePerKg || ""}
            onChange={e => set({ pricePerKg: parseFloat(e.target.value) || 0 })}
            placeholder="Rate/KG"
            className="h-9 w-[100px] text-sm text-right pr-8 bg-background border-border/60"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">/kg</span>
        </div>

        {/* 5. Discount % */}
        <div className="relative shrink-0">
          <Input
            type="number"
            value={entry.discount}
            onChange={e => set({ discount: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="0"
            className="h-9 w-[72px] text-sm text-right pr-5 bg-background border-border/60"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
        </div>

        {/* 6. Live total badge */}
        {canAdd && preview.total > 0 && (
          <div className="hidden lg:flex items-center shrink-0 bg-primary/5 border border-primary/20 rounded-lg px-2.5 py-1 gap-1">
            <span className="text-[11px] text-muted-foreground">{preview.weightStr}</span>
            <span className="text-[11px] text-primary font-bold tabular-nums">{fmtRs(preview.total)}</span>
          </div>
        )}

        {/* 7. Add button */}
        <Button
          onClick={doAdd}
          disabled={!canAdd}
          className="h-9 px-4 gap-1.5 text-sm font-semibold shrink-0 bg-primary hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add</span>
        </Button>
      </div>

      {/* Product dropdown — wide, enterprise style */}
      {showDrop && (
        <div
          className="absolute top-full left-0 right-0 mt-1.5 z-[100] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          style={{ minWidth: "480px" }}
        >
          {prodSuggestions.length > 0 ? (
            <>
              <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {loadingProducts ? "Loading products…" : `${prodSuggestions.length} Product${prodSuggestions.length !== 1 ? "s" : ""} found`}
                  {!loadingProducts && allProducts.length > 12 && <span className="ml-1 text-primary font-normal">of {allProducts.length} total</span>}
                </p>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[9px] font-mono">↵</kbd>
                  <span>to add directly</span>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {prodSuggestions.map(p => (
                  <button
                    key={p.id}
                    onClick={() => pickProduct(p)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors border-b border-border/50 last:border-0 text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{p.sku}</span>
                        <span className="text-[10px] text-muted-foreground">{p.category}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-primary tabular-nums">{fmtRs(p.pricePerKg)}</p>
                      <p className="text-[10px] text-muted-foreground">per KG</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* No products found state */
            <div className="px-6 py-8 flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                <Package className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <div>
                <p className="font-semibold text-sm">No product found for "<span className="text-primary">{entry.name}</span>"</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You can type a custom name and enter the rate manually, or add it to the catalog.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs h-8"
                  onClick={() => { setShowDrop(false); }}
                >
                  Use custom name &amp; rate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs h-8 text-blue-700 border-blue-200 hover:bg-blue-50"
                  onClick={() => { window.location.href = "/products"; }}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Go to Products
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   INVOICE ITEMS TABLE
═══════════════════════════════════════════════ */
function InvoiceTable({ items, onDelete }: { items: InvoiceItem[]; onDelete: (id: string) => void }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground border border-dashed border-border rounded-xl bg-muted/10">
        <Package className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm font-medium">No items added yet</p>
        <p className="text-xs mt-0.5">Search and add products using the bar above</p>
      </div>
    );
  }
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="py-2.5 px-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wide">#</th>
              <th className="py-2.5 px-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wide">Product</th>
              <th className="py-2.5 px-3 text-right text-xs font-bold text-muted-foreground uppercase tracking-wide">Weight</th>
              <th className="py-2.5 px-3 text-right text-xs font-bold text-muted-foreground uppercase tracking-wide">Rate</th>
              <th className="py-2.5 px-3 text-right text-xs font-bold text-muted-foreground uppercase tracking-wide">Disc</th>
              <th className="py-2.5 px-3 text-right text-xs font-bold text-muted-foreground uppercase tracking-wide">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-sm truncate max-w-[180px]">{item.name}</p>
                  {item.sku && <p className="text-[10px] text-muted-foreground font-mono">{item.sku}</p>}
                </td>
                <td className="px-3 py-2.5 text-right text-sm text-muted-foreground tabular-nums">{displayWeight(item)}</td>
                <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                  {item.sellingMode === "custom" ? fmtRs(item.customPrice) : `${fmtRs(item.pricePerKg)}/KG`}
                </td>
                <td className="px-3 py-2.5 text-right text-xs">
                  {item.discount > 0 ? <span className="text-red-500">-{item.discount}%</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-primary tabular-nums">{fmtRs(item.lineTotal)}</td>
                <td className="px-2 py-2.5">
                  <button
                    onClick={() => onDelete(item.id)}
                    className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-50 hover:text-red-600 text-muted-foreground transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   INVOICE PREVIEW DIALOG
═══════════════════════════════════════════════ */
interface PreviewDialogProps {
  open: boolean; onClose: () => void;
  invoiceNo: string; isPurchase?: boolean;
  customer?: Customer | null; supplier?: Supplier | null;
  items: InvoiceItem[]; invoiceStatus: InvoiceStatus;
  paymentMethod: string; subtotal: number;
  discountAmt: number; shipping: number;
  taxAmt: number; grandTotal: number;
  invoiceDiscount: number; taxRate: number;
}
function InvoicePreviewDialog({
  open, onClose, invoiceNo, isPurchase,
  customer, supplier, items, invoiceStatus,
  paymentMethod, subtotal, discountAmt, shipping,
  taxAmt, grandTotal, invoiceDiscount, taxRate,
}: PreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span className="font-mono">{invoiceNo}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7">
                <Download className="w-3.5 h-3.5" /> PDF
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-black space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-gray-900">KDF MART</h1>
              <p className="text-sm text-gray-500">Khan Dry Fruits</p>
              <p className="text-xs text-gray-400 mt-0.5">+92-300-1234567 · info@kdfmart.com</p>
            </div>
            <div className="text-right">
              <div className={`inline-flex items-center px-4 py-1.5 rounded-xl ${isPurchase ? "bg-orange-600" : "bg-gray-900"} text-white`}>
                <span className="text-base font-black">{isPurchase ? "PURCHASE BILL" : "INVOICE"}</span>
              </div>
              <p className="text-sm font-mono font-bold mt-1.5">{invoiceNo}</p>
              <p className="text-xs text-gray-400">{new Date().toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}</p>
              <div className={`inline-flex items-center gap-1 mt-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_BADGE[invoiceStatus]}`}>
                {STATUS_LABEL[invoiceStatus]}
              </div>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-gray-900 via-gray-400 to-transparent" />

          {(customer || supplier) && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  {isPurchase ? "Supplier" : "Bill To"}
                </p>
                <p className="font-bold text-gray-900">{customer?.name ?? supplier?.name ?? "—"}</p>
                {(customer?.phone ?? supplier?.phone) && <p className="text-sm text-gray-600">{customer?.phone ?? supplier?.phone}</p>}
                {customer?.address && <p className="text-sm text-gray-600">{customer.address}</p>}
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Payment</p>
                <p className="font-bold text-gray-900 capitalize">{paymentMethod.replace("_", " ")}</p>
              </div>
            </div>
          )}

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-900 text-white">
                {["#", "Product", "Weight", "Rate", "Disc", "Total"].map((h, i) => (
                  <th key={h} className={`px-3 py-2.5 text-xs font-bold ${i <= 1 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0
                ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No items</td></tr>
                : items.map((item, i) => (
                  <tr key={item.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}>
                    <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-gray-900">{item.name}</p>
                      {item.sku && <p className="text-[10px] text-gray-400">{item.sku}</p>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">{displayWeight(item)}</td>
                    <td className="px-3 py-2 text-right text-gray-700 text-xs">
                      {item.sellingMode === "custom" ? fmtRs(item.customPrice) : `${fmtRs(item.pricePerKg)}/KG`}
                    </td>
                    <td className="px-3 py-2 text-right text-red-500">{item.discount > 0 ? `${item.discount}%` : "—"}</td>
                    <td className="px-3 py-2 text-right font-bold text-gray-900 tabular-nums">{fmtRs(item.lineTotal)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-56 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="tabular-nums">{fmtRs(subtotal)}</span></div>
              {discountAmt > 0 && <div className="flex justify-between text-red-500"><span>Discount ({invoiceDiscount}%)</span><span className="tabular-nums">– {fmtRs(discountAmt)}</span></div>}
              {shipping > 0 && <div className="flex justify-between text-gray-500"><span>Shipping</span><span className="tabular-nums">{fmtRs(shipping)}</span></div>}
              {taxAmt > 0 && <div className="flex justify-between text-gray-500"><span>Tax ({taxRate}%)</span><span className="tabular-nums">+ {fmtRs(taxAmt)}</span></div>}
              <div className="flex justify-between font-black text-base border-t-2 border-gray-900 pt-2 text-gray-900">
                <span>GRAND TOTAL</span><span className="tabular-nums">{fmtRs(grandTotal)}</span>
              </div>
            </div>
          </div>

          {!isPurchase && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-4">
              <QrCode className="w-14 h-14 text-blue-800 shrink-0" />
              <div>
                <p className="font-bold text-blue-900 text-sm">Pay Online</p>
                <p className="text-xs text-blue-700 font-mono">https://pay.kdfmart.pk/inv/{invoiceNo.toLowerCase().replace(/^inv-/, "")}</p>
                <p className="text-[10px] text-blue-400 mt-0.5">Meezan Bank EPG · SSL Secured</p>
              </div>
            </div>
          )}

          <div className="flex items-end justify-between border-t border-gray-200 pt-5">
            <div className="text-center"><div className="w-36 border-b-2 border-gray-400 mb-1.5" /><p className="text-xs text-gray-400">Authorized Signature</p></div>
            <div className="text-center">
              <div className="w-12 h-12 bg-gray-100 border border-gray-300 rounded-xl flex items-center justify-center mx-auto"><QrCode className="w-7 h-7 text-gray-500" /></div>
              <p className="text-[9px] text-gray-400 mt-1 font-mono">{invoiceNo}</p>
            </div>
          </div>
          <div className="text-center text-xs text-gray-300 border-t border-gray-100 pt-3">
            Thank you for your business — KDF MART · www.khanbabadryfruits.com
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════
   VIEW 1 — DASHBOARD
═══════════════════════════════════════════════ */
function InvoiceDashboard() {
  const [, navigate] = useLocation();

  const actions = [
    {
      href: "/invoice/new",
      label: "New Invoice",
      sub: "Create a sales invoice",
      icon: FileText,
      iconBg: "bg-blue-600",
      cardBorder: "hover:border-blue-300",
      cardBg: "hover:bg-blue-50/40 dark:hover:bg-blue-950/20",
      pillBg: "bg-blue-50 text-blue-700",
    },
    {
      href: "/invoice/purchase",
      label: "New Purchase",
      sub: "Record a supplier bill",
      icon: Building2,
      iconBg: "bg-orange-500",
      cardBorder: "hover:border-orange-300",
      cardBg: "hover:bg-orange-50/40 dark:hover:bg-orange-950/20",
      pillBg: "bg-orange-50 text-orange-700",
    },
    {
      href: "/invoice/history",
      label: "Invoice History",
      sub: "Browse all sales invoices",
      icon: History,
      iconBg: "bg-slate-600",
      cardBorder: "hover:border-slate-300",
      cardBg: "hover:bg-slate-50/40 dark:hover:bg-slate-900/20",
      pillBg: "bg-slate-100 text-slate-700",
    },
    {
      href: "/invoice/purchase/history",
      label: "Purchase History",
      sub: "Browse all purchase bills",
      icon: ShoppingBag,
      iconBg: "bg-purple-600",
      cardBorder: "hover:border-purple-300",
      cardBg: "hover:bg-purple-50/40 dark:hover:bg-purple-950/20",
      pillBg: "bg-purple-50 text-purple-700",
    },
  ];

  const kpis = [
    { label: "Today's Invoices", value: "8",          sub: "+3 vs yesterday",      icon: FileText,   iconBg: "bg-blue-500"    },
    { label: "Today's Revenue",  value: "Rs. 42,800", sub: "5 paid · 3 pending",   icon: TrendingUp, iconBg: "bg-emerald-500" },
    { label: "Pending Payments", value: "Rs. 12,200", sub: "7 unpaid invoices",     icon: Clock,      iconBg: "bg-amber-500", valueCls: "text-amber-600" },
    { label: "EPG Transactions", value: "24 txns",    sub: "Rs. 47,150 today",      icon: Landmark,   iconBg: "bg-purple-500"  },
  ];

  const recentInvoices = MOCK_HISTORY.filter(h => h.type === "invoice");
  const recentBills    = MOCK_HISTORY.filter(h => h.type === "bill");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Invoice & Billing</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Fast POS billing · Meezan Bank EPG · Supplier purchase records</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-emerald-700 font-semibold">EPG Online</span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${k.iconBg}`}>
              <k.icon className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground leading-none truncate">{k.label}</p>
              <p className={`text-base font-black mt-1 leading-none truncate ${(k as any).valueCls ?? ""}`}>{k.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 4 Action cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {actions.map(a => (
          <button
            key={a.href}
            onClick={() => navigate(a.href)}
            className={`group flex items-center gap-3 p-4 rounded-xl border-2 border-border bg-card transition-all duration-200 text-left ${a.cardBorder} ${a.cardBg}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${a.iconBg}`}>
              <a.icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight">{a.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.sub}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
          </button>
        ))}
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent invoices */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Recent Invoices</h3>
            </div>
            <button onClick={() => navigate("/invoice/history")} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-border">
            {recentInvoices.map(inv => (
              <div key={inv.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold font-mono text-primary">{inv.invoiceNo}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.customer?.name ?? "—"} · {inv.createdAt.toLocaleDateString("en-PK", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-sm tabular-nums">{fmtRs(inv.total)}</span>
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_BADGE[inv.status]}`}>
                    {STATUS_ICON[inv.status]}
                    {STATUS_LABEL[inv.status]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar: EPG card + Purchase summary */}
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
            <div className="flex items-center gap-2 mb-3">
              <Landmark className="w-5 h-5 text-blue-200" />
              <span className="text-sm font-bold">Meezan EPG</span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] text-blue-200">Online</span>
              </span>
            </div>
            <p className="text-2xl font-black">Rs. 47,150</p>
            <p className="text-xs text-blue-200 mt-1">24 transactions today</p>
            <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-center">
              <div><p className="text-[10px] text-blue-300">Success Rate</p><p className="font-bold text-sm">94.2%</p></div>
              <div><p className="text-[10px] text-blue-300">Avg Amount</p><p className="font-bold text-sm">Rs. 1,965</p></div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Recent Purchases</h3>
              </div>
              <button onClick={() => navigate("/invoice/purchase/history")} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                View all <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-border">
              {recentBills.map(bill => (
                <div key={bill.id} className="px-5 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors">
                  <div>
                    <p className="text-sm font-bold font-mono text-orange-600">{bill.invoiceNo}</p>
                    <p className="text-xs text-muted-foreground">{bill.createdAt.toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm tabular-nums">{fmtRs(bill.total)}</span>
                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_BADGE[bill.status]}`}>
                      {STATUS_LABEL[bill.status]}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   VIEW 2 — NEW INVOICE
═══════════════════════════════════════════════ */
function NewInvoiceView() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const WALK_IN = MOCK_CUSTOMERS[5];

  const [invoiceNo]       = useState(() => genNo("INV"));
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>("unpaid");
  const [customer, setCustomer]           = useState<Customer | null>(WALK_IN);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [showCustDrop, setShowCustDrop]   = useState(false);
  const [items, setItems]                 = useState<InvoiceItem[]>([]);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [shipping, setShipping]           = useState(0);
  const [taxRate, setTaxRate]             = useState(0);
  const [notes, setNotes]                 = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [gwStatus, setGwStatus]           = useState<PaymentGwStatus>("idle");
  const [saving, setSaving]               = useState(false);
  const [showPreview, setShowPreview]     = useState(false);
  const custRef = useRef<HTMLDivElement>(null);

  const [showAddCust, setShowAddCust]     = useState(false);
  const [newCust, setNewCust]             = useState({ name: "", phone: "", address: "", city: "", notes: "" });
  const [savingCust, setSavingCust]       = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (custRef.current && !custRef.current.contains(e.target as Node)) setShowCustDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const subtotal    = items.reduce((s, i) => s + i.lineTotal, 0);
  const discountAmt = subtotal * (invoiceDiscount / 100);
  const taxAmt      = (subtotal - discountAmt + shipping) * (taxRate / 100);
  const grandTotal  = subtotal - discountAmt + shipping + taxAmt;

  const handleCustQuery = (val: string) => {
    setCustomerQuery(val);
    if (!val.trim()) {
      setCustomerResults(MOCK_CUSTOMERS.filter(c => c.id !== WALK_IN.id));
      setShowCustDrop(true);
      return;
    }
    setCustomerResults(MOCK_CUSTOMERS.filter(c =>
      (c.name.toLowerCase().includes(val.toLowerCase()) || c.phone.includes(val)) && c.id !== WALK_IN.id
    ));
    setShowCustDrop(true);
  };

  const pickCustomer = (c: Customer) => { setCustomer(c); setCustomerQuery(""); setShowCustDrop(false); };
  const pickWalkIn = () => { setCustomer(WALK_IN); setCustomerQuery(""); setShowCustDrop(false); };

  const saveNewCustomer = async (andContinue: boolean) => {
    if (!newCust.name.trim()) { toast({ variant: "destructive", title: "Customer name is required" }); return; }
    setSavingCust(true);
    await new Promise(r => setTimeout(r, 800));
    const created: Customer = {
      id: Date.now(), name: newCust.name.trim(), phone: newCust.phone.trim(),
      email: "", address: `${newCust.address.trim()}${newCust.city ? `, ${newCust.city}` : ""}`,
      totalOrders: 0, totalSpent: 0, loyaltyPoints: 0, source: "local",
    };
    MOCK_CUSTOMERS.push(created);
    setSavingCust(false);
    toast({ title: "Customer saved!", description: newCust.name });
    if (andContinue) { pickCustomer(created); }
    setShowAddCust(false);
    setNewCust({ name: "", phone: "", address: "", city: "", notes: "" });
  };

  const addItem = useCallback((item: InvoiceItem) => {
    setItems(prev => [...prev, item]);
  }, []);

  const deleteItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const handleSave = async () => {
    if (!customer) { toast({ variant: "destructive", title: "Select a customer first" }); return; }
    if (items.length === 0) { toast({ variant: "destructive", title: "Add at least one product" }); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 1200));
    setSaving(false);
    toast({ title: "Invoice saved!", description: `${invoiceNo} saved successfully` });
  };

  const handleWhatsApp = () => {
    if (!customer?.phone) { toast({ variant: "destructive", title: "No customer phone number" }); return; }
    const msg = encodeURIComponent(`Hello ${customer.name}! Your invoice ${invoiceNo} — Total: ${fmtRs(grandTotal)}. KDF MART`);
    window.open(`https://wa.me/92${customer.phone.slice(1)}?text=${msg}`, "_blank");
  };

  const handleReset = () => {
    setCustomer(WALK_IN); setCustomerQuery(""); setItems([]);
    setInvoiceDiscount(0); setShipping(0); setTaxRate(0); setNotes("");
    setPaymentMethod("cash"); setGwStatus("idle");
    toast({ title: "Invoice cleared" });
  };

  const paymentMethods = [
    { value: "cash",          label: "Cash",      icon: Banknote     },
    { value: "card",          label: "Card",       icon: CreditCard   },
    { value: "easypaisa",     label: "EasyPaisa",  icon: Smartphone   },
    { value: "jazzcash",      label: "JazzCash",   icon: Wallet       },
    { value: "bank_transfer", label: "Bank",       icon: ArrowUpRight },
    { value: "qr",            label: "QR Pay",     icon: QrCode       },
  ];

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <Breadcrumb items={[
            { label: "Invoice & Billing", href: "/invoice" },
            { label: "New Invoice" },
          ]} />
          <div className="flex items-center gap-2 mt-2">
            <h1 className="text-xl font-black tracking-tight">New Sales Invoice</h1>
            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md">{invoiceNo}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={invoiceStatus} onValueChange={(v: any) => setInvoiceStatus(v)}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="paid">✓ Paid</SelectItem>
              <SelectItem value="unpaid">✗ Unpaid</SelectItem>
              <SelectItem value="partial">◑ Partial</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={handleReset}>
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-8 font-bold" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Save Invoice</>}
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">

        {/* ── LEFT: Form area ── */}
        <div className="space-y-5 min-w-0">

          {/* Customer Search */}
          <div className="bg-card border border-border rounded-2xl">
            <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-2 rounded-t-2xl">
              <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <Users className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <h3 className="font-semibold text-sm">Customer</h3>
              {customer && customer.id !== WALK_IN.id && (
                <Badge variant="outline" className="ml-1 text-[10px] bg-blue-50 text-blue-700 border-blue-200">Selected</Badge>
              )}
              {customer?.id === WALK_IN.id && (
                <Badge variant="outline" className="ml-1 text-[10px] bg-slate-50 text-slate-600 border-slate-200">Walk-in</Badge>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  variant="ghost" size="sm"
                  className="h-7 px-2.5 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={pickWalkIn}
                >
                  <Users className="w-3.5 h-3.5" /> Walk-in
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="h-7 px-2.5 gap-1.5 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                  onClick={() => setShowAddCust(true)}
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add New
                </Button>
              </div>
            </div>
            <div className="px-5 py-4" ref={custRef}>
              {customer && !showCustDrop && customerQuery === "" ? (
                /* ── Selected customer card ── */
                <div className={`flex items-center gap-4 border rounded-xl p-4 transition-colors ${
                  customer.id === WALK_IN.id
                    ? "bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800"
                    : "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-100 dark:border-blue-900/30"
                }`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 font-black ${
                    customer.id === WALK_IN.id
                      ? "bg-slate-200 text-slate-600"
                      : "bg-primary text-primary-foreground"
                  }`}>
                    {customer.id === WALK_IN.id ? <Users className="w-5 h-5" /> : customer.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold">{customer.name}</p>
                      {customer.id === WALK_IN.id && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-600">Cash Customer</span>
                      )}
                      {customer.source === "shopify" && customer.id !== WALK_IN.id && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#96BF48]/20 text-[#5C9B2D] border border-[#96BF48]/40">SHOPIFY</span>
                      )}
                      {customer.loyaltyPoints > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">★ {customer.loyaltyPoints} pts</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-0.5 flex-wrap">
                      {customer.phone && customer.id !== WALK_IN.id && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</span>
                      )}
                      {customer.id === WALK_IN.id
                        ? <span className="text-xs text-muted-foreground">No account · Cash/POS sale</span>
                        : <span className="text-xs text-muted-foreground">{customer.totalOrders} orders · {fmtRs(customer.totalSpent)}</span>
                      }
                    </div>
                  </div>
                  <button
                    onClick={() => { setCustomer(null); setCustomerQuery(""); setTimeout(() => setShowCustDrop(false), 10); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/80 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Change customer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                /* ── Search input + floating dropdown ── */
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    autoFocus
                    value={customerQuery}
                    onChange={e => handleCustQuery(e.target.value)}
                    onFocus={() => handleCustQuery(customerQuery)}
                    placeholder="Search by name or phone…"
                    className="pl-9 pr-9 h-10"
                  />
                  {customerQuery && (
                    <button
                      onClick={() => { setCustomerQuery(""); setShowCustDrop(false); setCustomer(WALK_IN); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {showCustDrop && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 z-[200] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
                      {/* Walk-in shortcut — always at top */}
                      <button
                        onClick={pickWalkIn}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent border-b border-border text-left bg-muted/20"
                      >
                        <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">Walk-in / Cash Customer</p>
                          <p className="text-xs text-muted-foreground">Quick cash sale — no account needed</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">Default</Badge>
                      </button>

                      {/* Customer results */}
                      <div className="max-h-56 overflow-y-auto">
                        {customerResults.length === 0 && customerQuery.trim() !== "" ? (
                          <div className="px-4 py-4 text-center">
                            <p className="text-sm text-muted-foreground mb-3">No customer found for <strong>"{customerQuery}"</strong></p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => { setShowCustDrop(false); setNewCust(n => ({ ...n, name: customerQuery, phone: "" })); setShowAddCust(true); }}
                            >
                              <UserPlus className="w-3.5 h-3.5" /> Add "{customerQuery}" as new customer
                            </Button>
                          </div>
                        ) : (
                          customerResults.map(c => (
                            <button key={c.id} onClick={() => pickCustomer(c)}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent border-b border-border/60 last:border-0 text-left transition-colors"
                            >
                              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm shrink-0">
                                {c.name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-sm truncate">{c.name}</p>
                                  {c.source === "shopify" && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#96BF48]/15 text-[#5C9B2D] border border-[#96BF48]/30 shrink-0">SHOPIFY</span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">{c.phone} · {c.totalOrders} orders · {fmtRs(c.totalSpent)}</p>
                              </div>
                              {c.loyaltyPoints > 0 && (
                                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 shrink-0">★ {c.loyaltyPoints}</Badge>
                              )}
                            </button>
                          ))
                        )}
                      </div>

                      {/* Footer: Add new */}
                      {!(customerResults.length === 0 && customerQuery.trim() !== "") && (
                        <div className="border-t border-border px-4 py-2.5">
                          <button
                            className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 font-semibold"
                            onClick={() => { setShowCustDrop(false); setShowAddCust(true); }}
                          >
                            <UserPlus className="w-3.5 h-3.5" /> Add New Customer
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Add New Customer Modal */}
          <Dialog open={showAddCust} onOpenChange={setShowAddCust}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                    <UserPlus className="w-4 h-4 text-blue-600" />
                  </div>
                  Add New Customer
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Customer Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    autoFocus
                    placeholder="e.g. Ahmed Khan"
                    value={newCust.name}
                    onChange={e => setNewCust(n => ({ ...n, name: e.target.value }))}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="e.g. 03001234567"
                      value={newCust.phone}
                      onChange={e => setNewCust(n => ({ ...n, phone: e.target.value }))}
                      className="pl-9 h-10"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Street / Area"
                        value={newCust.address}
                        onChange={e => setNewCust(n => ({ ...n, address: e.target.value }))}
                        className="pl-9 h-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">City</Label>
                    <Input
                      placeholder="e.g. Lahore"
                      value={newCust.city}
                      onChange={e => setNewCust(n => ({ ...n, city: e.target.value }))}
                      className="h-10"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</Label>
                  <div className="relative">
                    <StickyNote className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <Textarea
                      placeholder="Optional notes about this customer…"
                      value={newCust.notes}
                      onChange={e => setNewCust(n => ({ ...n, notes: e.target.value }))}
                      rows={2}
                      className="pl-9 text-sm resize-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="flex-1 h-10 gap-1.5 text-sm"
                    onClick={() => saveNewCustomer(false)}
                    disabled={savingCust}
                  >
                    {savingCust ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Save Customer
                  </Button>
                  <Button
                    className="flex-1 h-10 gap-1.5 text-sm font-bold bg-blue-600 hover:bg-blue-700"
                    onClick={() => saveNewCustomer(true)}
                    disabled={savingCust}
                  >
                    {savingCust ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Save & Continue Billing
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* POS Billing */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                  <Zap className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-sm">Fast POS Billing</h3>
                <span className="hidden sm:inline text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">↵ Enter to add</span>
              </div>
              <span className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="px-5 py-4 space-y-4">
              <PosEntryBar onAdd={addItem} />
              <InvoiceTable items={items} onDelete={deleteItem} />
            </div>
          </div>

          {/* Notes */}
          <div className="bg-card border border-border rounded-2xl px-5 py-4 space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes / Instructions</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Delivery notes, special instructions, reference numbers…"
              rows={2}
              className="text-sm resize-none"
            />
          </div>
        </div>

        {/* ── RIGHT: Sticky order summary ── */}
        <div className="space-y-4">
          <div className="sticky top-4 space-y-4">

            {/* Order Summary */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border bg-muted/20 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                  <Calculator className="w-3.5 h-3.5 text-green-600" />
                </div>
                <h3 className="font-semibold text-sm">Order Summary</h3>
              </div>
              <div className="px-5 py-5 space-y-4">

                {/* Item breakdown */}
                {items.length > 0 && (
                  <div className="space-y-1.5 pb-3 border-b border-border">
                    {items.map(i => (
                      <div key={i.id} className="flex items-start justify-between gap-2 text-xs">
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{i.name}</p>
                          <p className="text-muted-foreground">{displayWeight(i)}</p>
                        </div>
                        <span className="text-primary font-bold shrink-0 tabular-nums">{fmtRs(i.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Adjustments */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground w-20 shrink-0">Discount</Label>
                    <Input type="number" value={invoiceDiscount || ""} placeholder="0" onChange={e => setInvoiceDiscount(Math.min(100, +e.target.value))} className="h-8 text-sm flex-1 text-right" />
                    <span className="text-xs text-muted-foreground shrink-0">%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground w-20 shrink-0">Shipping</Label>
                    <Input type="number" value={shipping || ""} placeholder="0" onChange={e => setShipping(Math.max(0, +e.target.value))} className="h-8 text-sm flex-1 text-right" />
                    <span className="text-xs text-muted-foreground shrink-0">Rs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground w-20 shrink-0">Tax</Label>
                    <Input type="number" value={taxRate || ""} placeholder="0" onChange={e => setTaxRate(Math.min(100, +e.target.value))} className="h-8 text-sm flex-1 text-right" />
                    <span className="text-xs text-muted-foreground shrink-0">%</span>
                  </div>
                </div>

                {/* Totals */}
                <div className="border-t border-border pt-3 space-y-1.5">
                  <div className="flex justify-between text-sm text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{fmtRs(subtotal)}</span></div>
                  {discountAmt > 0 && <div className="flex justify-between text-sm text-red-500"><span>Discount ({invoiceDiscount}%)</span><span className="tabular-nums">– {fmtRs(discountAmt)}</span></div>}
                  {shipping > 0 && <div className="flex justify-between text-sm text-muted-foreground"><span>Shipping</span><span className="tabular-nums">+ {fmtRs(shipping)}</span></div>}
                  {taxAmt > 0 && <div className="flex justify-between text-sm text-muted-foreground"><span>Tax ({taxRate}%)</span><span className="tabular-nums">+ {fmtRs(taxAmt)}</span></div>}
                  <div className="flex justify-between items-center pt-2 border-t-2 border-foreground/10">
                    <span className="font-black text-base">Grand Total</span>
                    <span className="font-black text-xl text-primary tabular-nums">{fmtRs(grandTotal)}</span>
                  </div>
                </div>

                {/* Payment Methods */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Method</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {paymentMethods.map(m => (
                      <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${paymentMethod === m.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40 hover:bg-accent"}`}>
                        <m.icon className="w-3.5 h-3.5 shrink-0" /> {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Loyalty Points */}
                {customer && customer.loyaltyPoints > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-amber-800">Loyalty Points</p>
                      <p className="text-lg font-black text-amber-700">{customer.loyaltyPoints} pts</p>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs border-amber-300 text-amber-700 hover:bg-amber-100 h-8">Redeem</Button>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2 pt-1">
                  <Button className="w-full gap-2 h-11 font-bold text-sm rounded-xl" onClick={handleSave} disabled={saving}>
                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-4 h-4" /> Save Invoice</>}
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-9 rounded-xl" onClick={() => setShowPreview(true)}>
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-9 rounded-xl" onClick={() => { setShowPreview(true); setTimeout(() => window.print(), 600); }}>
                      <Printer className="w-3.5 h-3.5" /> Print
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-9 rounded-xl text-green-700 border-green-300 hover:bg-green-50" onClick={handleWhatsApp}>
                      <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-9 rounded-xl text-blue-700 border-blue-300 hover:bg-blue-50">
                      <Download className="w-3.5 h-3.5" /> PDF
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs h-9 rounded-xl" onClick={() => toast({ title: "Email sent!" })}>
                    <Mail className="w-3.5 h-3.5" /> Send Email
                  </Button>
                </div>
              </div>
            </div>

            {/* Meezan EPG Card */}
            <PaymentLinkCard invoiceNo={invoiceNo} amount={grandTotal} customer={customer} gwStatus={gwStatus} onStatusChange={setGwStatus} />

          </div>
        </div>
      </div>

      <InvoicePreviewDialog
        open={showPreview}
        onClose={() => setShowPreview(false)}
        invoiceNo={invoiceNo}
        customer={customer}
        items={items}
        invoiceStatus={invoiceStatus}
        paymentMethod={paymentMethod}
        subtotal={subtotal}
        discountAmt={discountAmt}
        shipping={shipping}
        taxAmt={taxAmt}
        grandTotal={grandTotal}
        invoiceDiscount={invoiceDiscount}
        taxRate={taxRate}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   VIEW 3 — NEW PURCHASE
═══════════════════════════════════════════════ */
function NewPurchaseView() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [billNo]                         = useState(() => genNo("BILL"));
  const [supplier, setSupplier]           = useState<Supplier | null>(null);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [showSupplierDrop, setShowSupplierDrop] = useState(false);
  const [purchaseRows, setPurchaseRows]   = useState<PurchaseRow[]>([newPurchaseRow()]);
  const [billPayment, setBillPayment]     = useState("cash");
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [savingBill, setSavingBill]       = useState(false);
  const [showPreview, setShowPreview]     = useState(false);
  const supplierRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) setShowSupplierDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const purchaseSubtotal = purchaseRows.reduce((s, r) => s + r.total, 0);

  const updatePurchaseRow = (id: string, field: keyof PurchaseRow, value: any) =>
    setPurchaseRows(rs => rs.map(r => {
      if (r.id !== id) return r;
      const u = { ...r, [field]: value };
      u.total = u.quantity * u.costPrice;
      return u;
    }));

  const handleSaveBill = async () => {
    if (!supplier) { toast({ variant: "destructive", title: "Select a supplier" }); return; }
    setSavingBill(true);
    await new Promise(r => setTimeout(r, 1200));
    setSavingBill(false);
    toast({ title: "Purchase bill saved!", description: `${billNo} saved` });
  };

  const billPaymentMethods = [
    { value: "cash",          label: "Cash",   icon: Banknote     },
    { value: "bank_transfer", label: "Bank",   icon: ArrowUpRight },
    { value: "cheque",        label: "Cheque", icon: FileText     },
    { value: "credit",        label: "Credit", icon: CreditCard   },
  ];

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <Breadcrumb items={[
            { label: "Invoice & Billing", href: "/invoice" },
            { label: "New Purchase" },
          ]} />
          <div className="flex items-center gap-2 mt-2">
            <h1 className="text-xl font-black tracking-tight">New Purchase Bill</h1>
            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md">{billNo}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Purchase Record</Badge>
          <Button
            size="sm"
            className="gap-1.5 text-xs h-8 font-bold bg-orange-600 hover:bg-orange-700"
            onClick={handleSaveBill}
            disabled={savingBill}
          >
            {savingBill ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Save Bill</>}
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 items-start">

        {/* LEFT */}
        <div className="space-y-5 min-w-0">

          {/* Supplier Search */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                <Building2 className="w-3.5 h-3.5 text-orange-600" />
              </div>
              <h3 className="font-semibold text-sm">Supplier / Vendor</h3>
              {supplier && <Badge variant="outline" className="ml-auto text-[10px] bg-orange-50 text-orange-700 border-orange-200">Selected</Badge>}
            </div>
            <div className="px-5 py-4" ref={supplierRef}>
              {!supplier ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={supplierQuery}
                    onChange={e => { setSupplierQuery(e.target.value); setShowSupplierDrop(!!e.target.value); }}
                    placeholder="Search supplier or vendor…"
                    className="pl-9 h-10"
                  />
                  {showSupplierDrop && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
                      {MOCK_SUPPLIERS.filter(s => s.name.toLowerCase().includes(supplierQuery.toLowerCase())).map(s => (
                        <button key={s.id} onClick={() => { setSupplier(s); setSupplierQuery(s.name); setShowSupplierDrop(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent border-b border-border last:border-0 text-left">
                          <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0"><Building2 className="w-4 h-4 text-orange-600" /></div>
                          <div><p className="font-semibold text-sm">{s.name}</p><p className="text-xs text-muted-foreground">{s.city} · {s.phone}</p></div>
                        </button>
                      ))}
                      <button className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-primary hover:bg-accent" onClick={() => { setSupplier({ id: 99, name: supplierQuery, phone: "", city: "Unknown" }); setShowSupplierDrop(false); }}>
                        <Plus className="w-3.5 h-3.5" /> Add "{supplierQuery}" as new supplier
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 rounded-xl p-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5 text-orange-700" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{supplier.name}</p>
                    <p className="text-xs text-muted-foreground">{supplier.city}{supplier.phone ? ` · ${supplier.phone}` : ""}</p>
                  </div>
                  <button onClick={() => { setSupplier(null); setSupplierQuery(""); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-orange-100 text-muted-foreground shrink-0"><X className="w-4 h-4" /></button>
                </div>
              )}
            </div>
          </div>

          {/* Purchase Items Table */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center shrink-0"><Package className="w-3.5 h-3.5 text-orange-600" /></div>
                <h3 className="font-semibold text-sm">Purchased Items</h3>
              </div>
              <Button variant="outline" size="sm" onClick={() => setPurchaseRows(rs => [...rs, newPurchaseRow()])} className="gap-1.5 h-8 text-xs">
                <Plus className="w-3.5 h-3.5" /> Add Row
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["Product / Item", "Unit", "Qty", "Cost Price (Rs)", "Total", ""].map((h, i) => (
                      <th key={i} className={`py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wide ${i === 0 ? "text-left" : i === 4 ? "text-right" : i === 5 ? "w-10" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {purchaseRows.map((row, idx) => (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <Input value={row.name} onChange={e => updatePurchaseRow(row.id, "name", e.target.value)} placeholder={`Item ${idx + 1}…`} className="h-8 text-sm border-0 bg-transparent focus-visible:ring-1 px-0 w-full" />
                      </td>
                      <td className="px-3 py-2.5">
                        <Select value={row.unit} onValueChange={v => updatePurchaseRow(row.id, "unit", v)}>
                          <SelectTrigger className="h-8 text-xs w-20"><SelectValue /></SelectTrigger>
                          <SelectContent>{["kg", "grams", "boxes", "pcs"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => updatePurchaseRow(row.id, "quantity", Math.max(1, row.quantity - 1))} className="w-6 h-6 rounded-lg border flex items-center justify-center hover:bg-accent transition-colors"><Minus className="w-3 h-3" /></button>
                          <Input type="number" value={row.quantity} onChange={e => updatePurchaseRow(row.id, "quantity", Math.max(1, +e.target.value))} className="w-12 h-8 text-xs text-center px-1" />
                          <button onClick={() => updatePurchaseRow(row.id, "quantity", row.quantity + 1)} className="w-6 h-6 rounded-lg border flex items-center justify-center hover:bg-accent transition-colors"><Plus className="w-3 h-3" /></button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Input type="number" value={row.costPrice || ""} onChange={e => updatePurchaseRow(row.id, "costPrice", +e.target.value)} placeholder="0" className="h-8 text-xs text-right w-32" />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-sm font-black text-orange-600 tabular-nums">{fmtRs(row.total)}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => setPurchaseRows(rs => rs.filter(r => r.id !== row.id))} disabled={purchaseRows.length === 1} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 hover:text-red-600 text-muted-foreground disabled:opacity-30 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-border bg-muted/20 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">{purchaseRows.length} item{purchaseRows.length !== 1 ? "s" : ""}</span>
              <span className="text-sm font-black text-orange-600 tabular-nums">Total: {fmtRs(purchaseSubtotal)}</span>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-card border border-border rounded-2xl px-5 py-4 space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes / Reference</Label>
            <Textarea value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)} placeholder="Notes, reference numbers, vendor invoice ID…" rows={2} className="text-sm resize-none" />
          </div>
        </div>

        {/* RIGHT: Bill Summary */}
        <div>
          <div className="sticky top-4 bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border bg-muted/20 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center shrink-0"><Calculator className="w-3.5 h-3.5 text-orange-600" /></div>
              <h3 className="font-semibold text-sm">Bill Summary</h3>
            </div>
            <div className="px-5 py-5 space-y-5">
              <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 rounded-xl p-4 text-center">
                <p className="text-xs text-orange-700 font-semibold uppercase tracking-wide">Total Payable</p>
                <p className="text-3xl font-black text-orange-600 mt-1 tabular-nums">{fmtRs(purchaseSubtotal)}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Method</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {billPaymentMethods.map(m => (
                    <button key={m.value} onClick={() => setBillPayment(m.value)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${billPayment === m.value ? "border-orange-500 bg-orange-50 text-orange-700" : "border-border hover:bg-accent"}`}>
                      <m.icon className="w-3.5 h-3.5 shrink-0" /> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Button className="w-full gap-2 h-11 bg-orange-600 hover:bg-orange-700 font-bold rounded-xl" onClick={handleSaveBill} disabled={savingBill}>
                  {savingBill ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-4 h-4" /> Save Purchase Bill</>}
                </Button>
                <Button variant="outline" className="w-full gap-1.5 text-xs h-9 rounded-xl" onClick={() => setShowPreview(true)}>
                  <Printer className="w-3.5 h-3.5" /> Print Bill
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <InvoicePreviewDialog
        open={showPreview}
        onClose={() => setShowPreview(false)}
        invoiceNo={billNo}
        isPurchase
        supplier={supplier}
        items={[]}
        invoiceStatus="unpaid"
        paymentMethod={billPayment}
        subtotal={purchaseSubtotal}
        discountAmt={0}
        shipping={0}
        taxAmt={0}
        grandTotal={purchaseSubtotal}
        invoiceDiscount={0}
        taxRate={0}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   VIEW 4 — INVOICE HISTORY
═══════════════════════════════════════════════ */
type HistoryEntry = typeof MOCK_HISTORY[0];

function InvoiceHistoryView() {
  const [, navigate] = useLocation();
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState("all");
  const [showPreview, setShowPreview] = useState(false);
  const [selectedInv, setSelectedInv] = useState<HistoryEntry | null>(null);

  const filtered = MOCK_HISTORY
    .filter(h => h.type === "invoice")
    .filter(inv =>
      inv.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
      (inv.customer?.name ?? "").toLowerCase().includes(search.toLowerCase())
    )
    .filter(inv => filter === "all" || inv.status === filter);

  const handleView = (inv: HistoryEntry) => {
    setSelectedInv(inv);
    setShowPreview(true);
  };

  const handlePrint = (inv: HistoryEntry) => {
    setSelectedInv(inv);
    setShowPreview(true);
    setTimeout(() => window.print(), 600);
  };

  const handleWhatsApp = (inv: HistoryEntry) => {
    const msg = encodeURIComponent(
      `*KDF NUTS Invoice*\nInvoice No: ${inv.invoiceNo}\nCustomer: ${inv.customer?.name ?? "Walk-in"}\nTotal: Rs. ${inv.total.toLocaleString("en-PK")}\nStatus: ${inv.status.toUpperCase()}\n\nThank you for shopping with KDF NUTS!`
    );
    const phone = inv.customer?.phone?.replace(/\D/g, "") ?? "";
    const waPhone = phone.startsWith("0") ? "92" + phone.slice(1) : phone;
    window.open(`https://wa.me/${waPhone}?text=${msg}`, "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <Breadcrumb items={[
            { label: "Invoice & Billing", href: "/invoice" },
            { label: "Invoice History" },
          ]} />
          <h1 className="text-xl font-black tracking-tight mt-2">Invoice History</h1>
        </div>
        <Button size="sm" className="gap-1.5 text-xs h-8 font-bold" onClick={() => navigate("/invoice/new")}>
          <Plus className="w-3.5 h-3.5" /> New Invoice
        </Button>
      </div>

      {/* Table card */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm font-semibold text-muted-foreground">{filtered.length} invoice{filtered.length !== 1 ? "s" : ""}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice or customer…" className="pl-9 h-9 w-52 text-sm" />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-9 w-28 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-1.5 h-9"><Download className="w-3.5 h-3.5" /> Export</Button>
          </div>
        </div>
        {/* Mobile cards — visible on sm and below */}
        <div className="sm:hidden divide-y divide-border">
          {filtered.length === 0
            ? <div className="py-14 text-center text-muted-foreground text-sm">No invoices found</div>
            : filtered.map(inv => (
              <div key={inv.id} className="px-4 py-3.5 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-bold text-primary">{inv.invoiceNo}</span>
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_BADGE[inv.status]}`}>
                    {STATUS_ICON[inv.status]}{STATUS_LABEL[inv.status]}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{inv.customer?.name ?? "Walk-in"} · {inv.createdAt.toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</span>
                  <span className="font-bold text-sm text-foreground tabular-nums">{fmtRs(inv.total)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs capitalize">{inv.paymentMethod.replace("_", " ")}</Badge>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleView(inv)}><Eye className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handlePrint(inv)}><Printer className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600" onClick={() => handleWhatsApp(inv)}><MessageCircle className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            ))
          }
        </div>
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice No</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0
                ? <TableRow><TableCell colSpan={7} className="text-center py-14 text-muted-foreground text-sm">No invoices found</TableCell></TableRow>
                : filtered.map(inv => (
                  <TableRow key={inv.id} className="hover:bg-muted/20">
                    <TableCell className="font-mono text-sm font-bold text-primary">{inv.invoiceNo}</TableCell>
                    <TableCell><p className="font-medium text-sm">{inv.customer?.name ?? "—"}</p></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{inv.createdAt.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "2-digit" })}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{inv.paymentMethod.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-right font-bold text-sm tabular-nums">{fmtRs(inv.total)}</TableCell>
                    <TableCell>
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_BADGE[inv.status]}`}>
                        {STATUS_ICON[inv.status]}
                        {STATUS_LABEL[inv.status]}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View Invoice" onClick={() => handleView(inv)}><Eye className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Print Invoice" onClick={() => handlePrint(inv)}><Printer className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600" title="Send via WhatsApp" onClick={() => handleWhatsApp(inv)}><MessageCircle className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              }
            </TableBody>
          </Table>
        </div>
      </div>

      <InvoicePreviewDialog
        open={showPreview}
        onClose={() => { setShowPreview(false); setSelectedInv(null); }}
        invoiceNo={selectedInv?.invoiceNo ?? "INV-2026-001"}
        customer={selectedInv?.customer ?? undefined}
        items={[]}
        invoiceStatus={selectedInv?.status ?? "paid"}
        paymentMethod={selectedInv?.paymentMethod ?? "card"}
        subtotal={selectedInv?.total ?? 0}
        discountAmt={0}
        shipping={0}
        taxAmt={0}
        grandTotal={selectedInv?.total ?? 0}
        invoiceDiscount={0}
        taxRate={0}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   VIEW 5 — PURCHASE HISTORY
═══════════════════════════════════════════════ */
function PurchaseHistoryView() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [selectedBill, setSelectedBill] = useState<HistoryEntry | null>(null);

  const filtered = MOCK_HISTORY
    .filter(h => h.type === "bill")
    .filter(bill =>
      bill.invoiceNo.toLowerCase().includes(search.toLowerCase())
    );

  const handleViewBill = (bill: HistoryEntry) => { setSelectedBill(bill); setShowPreview(true); };
  const handlePrintBill = (bill: HistoryEntry) => { setSelectedBill(bill); setShowPreview(true); setTimeout(() => window.print(), 600); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <Breadcrumb items={[
            { label: "Invoice & Billing", href: "/invoice" },
            { label: "Purchase History" },
          ]} />
          <h1 className="text-xl font-black tracking-tight mt-2">Purchase History</h1>
        </div>
        <Button size="sm" className="gap-1.5 text-xs h-8 font-bold bg-orange-600 hover:bg-orange-700" onClick={() => navigate("/invoice/purchase")}>
          <Plus className="w-3.5 h-3.5" /> New Purchase
        </Button>
      </div>

      {/* Table card */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm font-semibold text-muted-foreground">{filtered.length} purchase bill{filtered.length !== 1 ? "s" : ""}</p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bill number…" className="pl-9 h-9 w-52 text-sm" />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 h-9"><Download className="w-3.5 h-3.5" /> Export</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill No</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0
                ? <TableRow><TableCell colSpan={7} className="text-center py-14 text-muted-foreground text-sm">No purchase bills found</TableCell></TableRow>
                : filtered.map(bill => (
                  <TableRow key={bill.id} className="hover:bg-muted/20">
                    <TableCell className="font-mono text-sm font-bold text-orange-600">{bill.invoiceNo}</TableCell>
                    <TableCell><p className="font-medium text-sm text-muted-foreground">—</p></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{bill.createdAt.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "2-digit" })}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{bill.paymentMethod.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-right font-bold text-sm tabular-nums">{fmtRs(bill.total)}</TableCell>
                    <TableCell>
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_BADGE[bill.status]}`}>
                        {STATUS_ICON[bill.status]}
                        {STATUS_LABEL[bill.status]}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View Bill" onClick={() => handleViewBill(bill)}><Eye className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Print Bill" onClick={() => handlePrintBill(bill)}><Printer className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              }
            </TableBody>
          </Table>
        </div>
      </div>

      <InvoicePreviewDialog
        open={showPreview}
        onClose={() => { setShowPreview(false); setSelectedBill(null); }}
        invoiceNo={selectedBill?.invoiceNo ?? "BILL-2026-001"}
        isPurchase
        items={[]}
        invoiceStatus={selectedBill?.status ?? "paid"}
        paymentMethod={selectedBill?.paymentMethod ?? "bank_transfer"}
        subtotal={selectedBill?.total ?? 0}
        discountAmt={0}
        shipping={0}
        taxAmt={0}
        grandTotal={selectedBill?.total ?? 0}
        invoiceDiscount={0}
        taxRate={0}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN — INVOICE PAGE ROUTER
═══════════════════════════════════════════════ */
export default function InvoicePage() {
  const [location] = useLocation();

  if (location.startsWith("/invoice/purchase/history")) return <PurchaseHistoryView />;
  if (location.startsWith("/invoice/purchase"))         return <NewPurchaseView />;
  if (location.startsWith("/invoice/history"))          return <InvoiceHistoryView />;
  if (location.startsWith("/invoice/new"))              return <NewInvoiceView />;
  return <InvoiceDashboard />;
}
