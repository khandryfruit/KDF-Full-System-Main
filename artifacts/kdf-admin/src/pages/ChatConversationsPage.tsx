import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle, Send, Loader2, RefreshCw, Trash2, User, Bot, Shield,
  Circle, Package, Tag, Gift, ClipboardList, Search, X, ChevronRight,
  Grid3x3, CreditCard, Truck, CheckSquare, Square, ShoppingBag,
  ExternalLink, Store, Globe,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const API = (path: string) => `/api${path}`;
const getToken = () => localStorage.getItem("kdf_admin_token") ?? "";
function authFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, { ...opts, headers: { ...(opts.headers ?? {}), Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" } });
}

interface ChatMsg { role: "user" | "assistant" | "admin"; content: string; timestamp: string; type?: string; metadata?: any; }
interface SessionLead { name: string; phone: string; source?: string | null; }
interface Session { id: number; sessionId: string; messages: ChatMsg[]; updatedAt: string; lead?: SessionLead | null; }
interface ProductOption { id: number; name: string; price: number; originalPrice?: number | null; images?: string[]; image?: string | null; source?: "website" | "shopify"; stock?: number; variants?: any[]; }
interface CategoryOption { id: number; name: string; slug: string; image?: string | null; }

type TemplateType = "product" | "category" | "coupon" | "offer" | "order_form" | "multi_product" | "payment_link" | "tracking_link";

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString("en-PK", { month: "short", day: "numeric" });
}
function isActive(ts: string) { return Date.now() - new Date(ts).getTime() < 5 * 60 * 1000; }
function getImageUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.startsWith("http")) return key;
  return `/api/storage/objects/${key}`;
}

/* ─────────────────────────────────────
   Enhanced Template Panel
───────────────────────────────────── */
function TemplatePanel({ sessionId, onSent, initialMode, onClose }: { sessionId: string; onSent: (session: Session) => void; initialMode?: TemplateType | null; onClose?: () => void }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<TemplateType | null>(initialMode ?? null);
  const [sending, setSending] = useState(false);

  /* ── Unified product search state ── */
  const [productSearch, setProductSearch] = useState("");
  const [productSource, setProductSource] = useState<"all" | "website" | "shopify">("all");
  const [productSort, setProductSort] = useState("newest");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<ProductOption[]>([]);

  const { data: categories = [] } = useQuery<CategoryOption[]>({
    queryKey: ["categories-for-chat"],
    queryFn: () => fetch("/api/categories").then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    staleTime: 60000,
  });

  const { data: chatProducts = [], isFetching: loadingProducts } = useQuery<ProductOption[]>({
    queryKey: ["admin-chat-products", productSearch, productSource, productSort, categoryFilter],
    queryFn: () => {
      const params = new URLSearchParams({ source: productSource, sort: productSort, limit: "16" });
      if (productSearch) params.set("q", productSearch);
      if (categoryFilter) params.set("categoryId", categoryFilter);
      return authFetch(`/api/admin/chat/products?${params}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []);
    },
    staleTime: 30000,
  });

  /* ── Single product state ── */
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption | null>(null);

  /* ── Coupon ── */
  const [couponCode, setCouponCode] = useState("");
  const [couponName, setCouponName] = useState("");
  const [couponDiscount, setCouponDiscount] = useState("");
  const [couponMin, setCouponMin] = useState("");
  const [couponDesc, setCouponDesc] = useState("");

  /* ── Offer ── */
  const [offerTitle, setOfferTitle] = useState("");
  const [offerText, setOfferText] = useState("");
  const [offerColor, setOfferColor] = useState("#5FA800");

  /* ── Payment Link ── */
  const [payTitle, setPayTitle] = useState("");
  const [payUrl, setPayUrl] = useState("");
  const [payAmount, setPayAmount] = useState("");

  /* ── Tracking Link ── */
  const [trackOrderNum, setTrackOrderNum] = useState("");
  const [trackUrl, setTrackUrl] = useState("");
  const [trackCourier, setTrackCourier] = useState("");
  const [trackNumber, setTrackNumber] = useState("");

  const COLORS = ["#5FA800", "#F58300", "#e11d48", "#7c3aed", "#0ea5e9", "#0f766e"];

  const send = async (payload: { message: string; type?: string; metadata?: any }) => {
    setSending(true);
    try {
      const r = await authFetch(API("/admin/chat/reply"), { method: "POST", body: JSON.stringify({ sessionId, ...payload }) });
      if (!r.ok) throw new Error("Failed to send");
      const data = await r.json();
      onSent(data.session);
      setMode(null);
      setSelectedProducts([]);
      toast({ title: "Sent!" });
    } catch { toast({ title: "Failed to send", variant: "destructive" }); } finally { setSending(false); }
  };

  const toggleProduct = (p: ProductOption) => {
    setSelectedProducts(prev => {
      const has = prev.some(x => x.id === p.id);
      if (has) return prev.filter(x => x.id !== p.id);
      if (prev.length >= 3) { toast({ title: "Max 3 products", description: "Deselect one first" }); return prev; }
      return [...prev, p];
    });
  };

  const sendProducts = () => {
    if (selectedProducts.length === 0) return;
    if (selectedProducts.length === 1) {
      const p = selectedProducts[0];
      const price = Number(p.price);
      const originalPrice = p.originalPrice ? Number(p.originalPrice) : undefined;
      const discount = originalPrice && originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : undefined;
      const image = getImageUrl(p.image ?? p.images?.[0]) ?? undefined;
      send({
        message: `Check out ${p.name}! Starting from Rs. ${price.toLocaleString()}.${discount ? ` Save ${discount}% today!` : ""}`,
        type: "product",
        metadata: { id: p.id, name: p.name, price, originalPrice, discount, image, stock: p.stock ?? 1, variants: p.variants ?? [] },
      });
    } else {
      const names = selectedProducts.map(p => p.name).join(", ");
      const productsData = selectedProducts.map(p => ({
        id: p.id, name: p.name, price: Number(p.price),
        originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
        discount: p.originalPrice && Number(p.originalPrice) > Number(p.price)
          ? Math.round(((Number(p.originalPrice) - Number(p.price)) / Number(p.originalPrice)) * 100) : null,
        stock: p.stock ?? 1, variants: p.variants ?? [],
        image: p.image ?? p.images?.[0] ?? null,
      }));
      send({
        message: `Here are some great products for you: ${names}`,
        type: "multi_product",
        metadata: { products: productsData },
      });
    }
  };

  const sendCoupon = () => {
    if (!couponCode.trim() || !couponDiscount.trim()) return;
    send({
      message: `Here's a special discount code for you: ${couponCode}`,
      type: "coupon",
      metadata: { code: couponCode.trim().toUpperCase(), name: couponName || "Discount Offer", description: couponDesc || undefined, discountPercent: Number(couponDiscount), minOrder: couponMin ? Number(couponMin) : undefined },
    });
  };

  const sendOffer = () => {
    if (!offerText.trim()) return;
    send({ message: offerText.trim(), type: "offer", metadata: { title: offerTitle || "Special Offer", color: offerColor } });
  };

  const sendCategory = () => {
    if (!selectedCategory) return;
    const image = getImageUrl(selectedCategory.image) ?? undefined;
    send({
      message: `Browse our ${selectedCategory.name} collection — great variety, freshly stocked!`,
      type: "category",
      metadata: { id: selectedCategory.id, name: selectedCategory.name, slug: selectedCategory.slug, image },
    });
  };

  const sendOrderForm = () => {
    send({ message: "We've made it easy for you to place an order directly from the chat!", type: "order_form" });
  };

  const sendPaymentLink = () => {
    if (!payUrl.trim()) return;
    send({
      message: payTitle || "Here's your payment link. Click to complete your purchase.",
      type: "payment_link",
      metadata: { url: payUrl.trim(), title: payTitle || "Complete Payment", amount: payAmount ? Number(payAmount) : undefined },
    });
  };

  const sendTrackingLink = () => {
    if (!trackOrderNum.trim() && !trackNumber.trim()) return;
    send({
      message: `Your order ${trackOrderNum || trackNumber} is on the way! Track it here.`,
      type: "tracking_link",
      metadata: { orderNumber: trackOrderNum, trackingNumber: trackNumber, courierName: trackCourier, url: trackUrl || undefined },
    });
  };

  const TEMPLATE_TYPES: { type: TemplateType; label: string; icon: any; color: string; desc: string }[] = [
    { type: "product", label: "Product Card", icon: Package, color: "text-green-600 bg-green-50 border-green-200", desc: "Share 1–3 products with image & price" },
    { type: "category", label: "Category", icon: Grid3x3, color: "text-teal-600 bg-teal-50 border-teal-200", desc: "Show a product category" },
    { type: "coupon", label: "Coupon Code", icon: Tag, color: "text-orange-600 bg-orange-50 border-orange-200", desc: "Send a discount code" },
    { type: "offer", label: "Offer Banner", icon: Gift, color: "text-purple-600 bg-purple-50 border-purple-200", desc: "Send a promotional banner" },
    { type: "payment_link", label: "Payment Link", icon: CreditCard, color: "text-violet-600 bg-violet-50 border-violet-200", desc: "Send a checkout/payment URL" },
    { type: "tracking_link", label: "Tracking Info", icon: Truck, color: "text-sky-600 bg-sky-50 border-sky-200", desc: "Share order tracking details" },
    { type: "order_form", label: "Order Form", icon: ClipboardList, color: "text-blue-600 bg-blue-50 border-blue-200", desc: "Prompt customer to place order" },
  ];

  const inputCls = "w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5FA800]/20 bg-background";

  /* ── Product picker (shared for "product" + "multi_product") ── */
  const ProductPicker = () => (
    <>
      {/* Search + filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search products…" className={`${inputCls} pl-8`} />
        </div>
        <div className="flex gap-2">
          {/* Source tabs */}
          <div className="flex rounded-lg border border-border overflow-hidden flex-shrink-0">
            {(["all", "website", "shopify"] as const).map(s => (
              <button key={s} onClick={() => setProductSource(s)}
                className={`px-2.5 py-1 text-[10px] font-semibold transition-colors flex items-center gap-1 ${productSource === s ? "bg-[#5FA800] text-white" : "text-muted-foreground hover:bg-muted"}`}>
                {s === "website" ? <Globe className="w-2.5 h-2.5" /> : s === "shopify" ? <Store className="w-2.5 h-2.5" /> : null}
                {s === "all" ? "All" : s === "website" ? "Web" : "Shopify"}
              </button>
            ))}
          </div>
          {/* Category filter */}
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="flex-1 border border-border rounded-lg px-2 py-1 text-[10px] bg-background focus:outline-none focus:ring-1 focus:ring-[#5FA800]/30">
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
          {/* Sort */}
          <select value={productSort} onChange={e => setProductSort(e.target.value)}
            className="border border-border rounded-lg px-2 py-1 text-[10px] bg-background focus:outline-none">
            <option value="newest">Newest</option>
            <option value="price_asc">Price ↑</option>
            <option value="price_desc">Price ↓</option>
          </select>
        </div>
      </div>

      {/* Selected count */}
      {selectedProducts.length > 0 && (
        <div className="flex items-center gap-2 px-2.5 py-2 bg-[#5FA800]/5 border border-[#5FA800]/20 rounded-lg">
          <CheckSquare className="w-3.5 h-3.5 text-[#5FA800]" />
          <span className="text-xs font-semibold text-[#5FA800]">{selectedProducts.length} product{selectedProducts.length > 1 ? "s" : ""} selected</span>
          <span className="text-[10px] text-muted-foreground">(max 3)</span>
          <button onClick={() => setSelectedProducts([])} className="ml-auto text-[10px] text-muted-foreground underline">Clear</button>
        </div>
      )}

      {/* Product grid */}
      <div className="space-y-1 max-h-52 overflow-y-auto">
        {loadingProducts ? (
          <div className="flex items-center gap-2 justify-center py-6 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">Loading…</span></div>
        ) : chatProducts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No products found</p>
        ) : chatProducts.map(p => {
          const img = getImageUrl(p.image ?? p.images?.[0]);
          const isSelected = selectedProducts.some(x => x.id === p.id);
          return (
            <button key={`${p.source}-${p.id}`} onClick={() => toggleProduct(p)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors border ${isSelected ? "bg-[#5FA800]/10 border-[#5FA800]/30" : "border-transparent hover:bg-muted"}`}>
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-100 to-emerald-200 flex-shrink-0 overflow-hidden flex items-center justify-center text-sm">
                {img ? <img src={img} alt={p.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : "🥜"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{p.name}</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] text-[#5FA800] font-bold">Rs. {Number(p.price).toLocaleString()}</p>
                  {p.source === "shopify" && <span className="text-[9px] bg-orange-100 text-orange-700 px-1 rounded font-bold">Shopify</span>}
                  {(p.stock ?? 0) === 0 && <span className="text-[9px] text-red-500">Out of stock</span>}
                </div>
              </div>
              {isSelected
                ? <div className="w-5 h-5 rounded-full bg-[#5FA800] flex items-center justify-center text-white flex-shrink-0"><span className="text-[10px] font-black">✓</span></div>
                : <Square className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              }
            </button>
          );
        })}
      </div>

      <Button onClick={sendProducts} disabled={selectedProducts.length === 0 || sending} size="sm" className="w-full bg-[#5FA800] hover:bg-[#4d8a00] text-white">
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ShoppingBag className="w-3.5 h-3.5 mr-1" />}
        {selectedProducts.length > 1 ? `Send ${selectedProducts.length} Products` : "Send Product Card"}
      </Button>
    </>
  );

  return (
    <div className="border-t border-border bg-card max-h-[420px] overflow-y-auto">
      {!mode ? (
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Quick Templates</p>
            {onClose && <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATE_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.type} onClick={() => { setMode(t.type); setSelectedProducts([]); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left hover:opacity-80 transition-opacity ${t.color}`}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{t.label}</p>
                    <p className="text-[10px] opacity-70 truncate">{t.desc}</p>
                  </div>
                  <ChevronRight className="w-3 h-3 flex-shrink-0 ml-auto opacity-50" />
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => { setMode(null); setSelectedProducts([]); if (initialMode) onClose?.(); }} className="p-1 rounded-lg hover:bg-muted transition-colors"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
            <p className="text-xs font-bold">{TEMPLATE_TYPES.find(t => t.type === mode)?.label}</p>
          </div>

          {(mode === "product" || mode === "multi_product") && <ProductPicker />}

          {mode === "category" && (
            <>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {categories.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No categories found</p>
                ) : categories.map(c => {
                  const img = getImageUrl(c.image);
                  return (
                    <button key={c.id} onClick={() => setSelectedCategory(c)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${selectedCategory?.id === c.id ? "bg-teal-50 border border-teal-200" : "hover:bg-muted"}`}>
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-100 to-emerald-200 flex-shrink-0 overflow-hidden flex items-center justify-center text-sm">
                        {img ? <img src={img} alt={c.name} className="w-full h-full object-cover" /> : "🗂️"}
                      </div>
                      <p className="flex-1 text-xs font-semibold truncate">{c.name}</p>
                      {selectedCategory?.id === c.id && <div className="w-4 h-4 rounded-full bg-teal-600 flex items-center justify-center text-white text-[10px]">✓</div>}
                    </button>
                  );
                })}
              </div>
              <Button onClick={sendCategory} disabled={!selectedCategory || sending} size="sm" className="w-full bg-teal-600 hover:bg-teal-700 text-white">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Grid3x3 className="w-3.5 h-3.5 mr-1" />} Send Category
              </Button>
            </>
          )}

          {mode === "coupon" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Coupon Code *</label><input value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="e.g. KDF20" className={inputCls} /></div>
                <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Discount % *</label><input type="number" value={couponDiscount} onChange={e => setCouponDiscount(e.target.value)} placeholder="e.g. 20" className={inputCls} /></div>
              </div>
              <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Offer Name</label><input value={couponName} onChange={e => setCouponName(e.target.value)} placeholder="e.g. Ramadan Special" className={inputCls} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Min. Order (Rs.)</label><input type="number" value={couponMin} onChange={e => setCouponMin(e.target.value)} placeholder="e.g. 1500" className={inputCls} /></div>
                <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Description</label><input value={couponDesc} onChange={e => setCouponDesc(e.target.value)} placeholder="Optional" className={inputCls} /></div>
              </div>
              <Button onClick={sendCoupon} disabled={!couponCode || !couponDiscount || sending} size="sm" className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Tag className="w-3.5 h-3.5 mr-1" />} Send Coupon
              </Button>
            </>
          )}

          {mode === "offer" && (
            <>
              <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Offer Title</label><input value={offerTitle} onChange={e => setOfferTitle(e.target.value)} placeholder="e.g. Flash Sale!" className={inputCls} /></div>
              <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Offer Message *</label><textarea value={offerText} onChange={e => setOfferText(e.target.value)} placeholder="e.g. Get 20% off on all nuts this weekend only!" rows={2} className={`${inputCls} resize-none`} /></div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block">Banner Color</label>
                <div className="flex gap-2">{COLORS.map(c => (<button key={c} onClick={() => setOfferColor(c)} className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${offerColor === c ? "border-foreground scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />))}</div>
              </div>
              <Button onClick={sendOffer} disabled={!offerText || sending} size="sm" className="w-full text-white" style={{ backgroundColor: offerColor }}>
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Gift className="w-3.5 h-3.5 mr-1" />} Send Offer
              </Button>
            </>
          )}

          {mode === "payment_link" && (
            <>
              <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Title</label><input value={payTitle} onChange={e => setPayTitle(e.target.value)} placeholder="e.g. Order #1234 Payment" className={inputCls} /></div>
              <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Payment URL *</label><input value={payUrl} onChange={e => setPayUrl(e.target.value)} placeholder="https://..." className={inputCls} /></div>
              <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Amount (Rs.)</label><input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="e.g. 2500" className={inputCls} /></div>
              <Button onClick={sendPaymentLink} disabled={!payUrl.trim() || sending} size="sm" className="w-full bg-violet-600 hover:bg-violet-700 text-white">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CreditCard className="w-3.5 h-3.5 mr-1" />} Send Payment Link
              </Button>
            </>
          )}

          {mode === "tracking_link" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Order Number</label><input value={trackOrderNum} onChange={e => setTrackOrderNum(e.target.value)} placeholder="e.g. KDF-12345678" className={inputCls} /></div>
                <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Courier</label><input value={trackCourier} onChange={e => setTrackCourier(e.target.value)} placeholder="e.g. TCS, PostEx" className={inputCls} /></div>
              </div>
              <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Tracking Number</label><input value={trackNumber} onChange={e => setTrackNumber(e.target.value)} placeholder="Tracking / CN number" className={inputCls} /></div>
              <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Tracking URL (optional)</label><input value={trackUrl} onChange={e => setTrackUrl(e.target.value)} placeholder="https://..." className={inputCls} /></div>
              <Button onClick={sendTrackingLink} disabled={(!trackOrderNum && !trackNumber) || sending} size="sm" className="w-full bg-sky-600 hover:bg-sky-700 text-white">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Truck className="w-3.5 h-3.5 mr-1" />} Send Tracking Info
              </Button>
            </>
          )}

          {mode === "order_form" && (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-2"><ClipboardList className="w-6 h-6 text-blue-600" /></div>
              <p className="text-sm font-semibold mb-1">Send Order Form Prompt</p>
              <p className="text-xs text-muted-foreground mb-3">Customer will see a button to open the interactive order form.</p>
              <Button onClick={sendOrderForm} disabled={sending} size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ClipboardList className="w-3.5 h-3.5 mr-1" />} Send Order Form
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Main Page
═══════════════════════════════════════ */
export default function ChatConversationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [replyText, setReplyText] = useState("");
  const [filter, setFilter] = useState<"all" | "active">("all");
  const [activeTemplate, setActiveTemplate] = useState<TemplateType | "panel" | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: sessions = [], isLoading, refetch } = useQuery<Session[]>({
    queryKey: ["admin-chat-sessions"],
    queryFn: async () => { const r = await authFetch(API("/admin/chat/sessions")); if (!r.ok) throw new Error("Failed"); return r.json(); },
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!selectedSession) return;
    const updated = sessions.find(s => s.id === selectedSession.id);
    if (updated && JSON.stringify(updated.messages) !== JSON.stringify(selectedSession.messages)) setSelectedSession(updated);
  }, [sessions]);

  useEffect(() => { setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50); }, [selectedSession?.messages?.length]);

  const replyMut = useMutation({
    mutationFn: async ({ sessionId, message }: { sessionId: string; message: string }) => {
      const r = await authFetch(API("/admin/chat/reply"), { method: "POST", body: JSON.stringify({ sessionId, message }) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (data) => { setReplyText(""); qc.invalidateQueries({ queryKey: ["admin-chat-sessions"] }); if (selectedSession) setSelectedSession(data.session); },
    onError: () => toast({ title: "Error", description: "Failed to send reply", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => authFetch(API(`/admin/chat/session/${id}`), { method: "DELETE" }),
    onSuccess: () => { setSelectedSession(null); qc.invalidateQueries({ queryKey: ["admin-chat-sessions"] }); toast({ title: "Session deleted" }); },
  });

  const filtered = filter === "active" ? sessions.filter(s => isActive(s.updatedAt)) : sessions;
  const activeCount = sessions.filter(s => isActive(s.updatedAt)).length;
  const handleReply = () => { if (!replyText.trim() || !selectedSession) return; replyMut.mutate({ sessionId: selectedSession.sessionId, message: replyText.trim() }); };

  /* ── Admin-side card previews ── */
  const renderTemplateCard = (msg: ChatMsg) => {
    const m = msg.metadata;
    if (msg.type === "product" && m) {
      const img = getImageUrl(m.image);
      return (
        <div className="w-52 bg-white rounded-xl overflow-hidden shadow border border-border">
          <div className="h-24 bg-gradient-to-br from-green-100 to-emerald-200 relative">
            {img ? <img src={img} alt={m.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl">🥜</div>}
            {m.discount && <span className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{m.discount}% OFF</span>}
          </div>
          <div className="p-2">
            <p className="font-bold text-xs truncate">{m.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[#5FA800] font-bold text-xs">Rs. {Number(m.price).toLocaleString()}</span>
              {m.originalPrice && <span className="text-muted-foreground text-[10px] line-through">Rs. {Number(m.originalPrice).toLocaleString()}</span>}
            </div>
          </div>
        </div>
      );
    }
    if (msg.type === "multi_product" && m?.products) {
      return (
        <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-sm">
          {(m.products as any[]).map((p: any) => {
            const img = getImageUrl(p.image);
            return (
              <div key={p.id} className="flex-shrink-0 w-36 bg-white rounded-xl overflow-hidden shadow border border-border">
                <div className="h-20 bg-gradient-to-br from-green-100 to-emerald-200 relative">
                  {img ? <img src={img} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">🥜</div>}
                  {p.discount && <span className="absolute top-1 right-1 bg-red-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-full">{p.discount}% OFF</span>}
                </div>
                <div className="p-1.5">
                  <p className="font-bold text-[10px] truncate">{p.name}</p>
                  <p className="text-[#5FA800] font-bold text-[10px]">Rs. {Number(p.price).toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    if (msg.type === "category" && m) {
      const img = getImageUrl(m.image);
      return (
        <div className="w-52 bg-white rounded-xl overflow-hidden shadow border border-border">
          <div className="h-20 bg-gradient-to-br from-teal-50 to-emerald-100 relative">
            {img ? <img src={img} alt={m.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">🗂️</div>}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <p className="absolute bottom-2 left-2.5 text-white font-bold text-xs drop-shadow">{m.name}</p>
          </div>
          <div className="p-2">
            <button className="w-full py-1 rounded-lg bg-teal-600 text-white text-[10px] font-bold">View Products →</button>
          </div>
        </div>
      );
    }
    if (msg.type === "coupon" && m) {
      return (
        <div className="w-52 bg-white rounded-xl border-2 border-dashed border-orange-300 overflow-hidden shadow">
          <div className="bg-orange-500 px-3 py-1.5 flex items-center gap-1.5">
            <Tag className="w-3 h-3 text-white" />
            <span className="text-white text-[10px] font-bold uppercase">{m.name ?? "Discount Offer"}</span>
            {m.discountPercent && <span className="ml-auto bg-white text-orange-600 text-[10px] font-black px-1.5 py-0.5 rounded-full">{m.discountPercent}% OFF</span>}
          </div>
          <div className="px-3 py-2">
            <p className="font-mono font-black text-orange-600 text-center text-base tracking-widest mb-1">{m.code}</p>
            {m.minOrder && <p className="text-[9px] text-center text-gray-500">Min. Rs. {Number(m.minOrder).toLocaleString()}</p>}
          </div>
        </div>
      );
    }
    if (msg.type === "offer") {
      const bg = m?.color ?? "#5FA800";
      return (
        <div className="w-52 rounded-xl overflow-hidden shadow" style={{ background: `linear-gradient(135deg,${bg},${bg}cc)` }}>
          <div className="px-3 py-2.5 text-white">
            <div className="flex items-center gap-1.5 mb-1"><Gift className="w-3 h-3" /><span className="text-[9px] font-bold uppercase tracking-wider">{m?.title ?? "Special Offer"}</span></div>
            <p className="text-xs leading-relaxed font-medium">{msg.content}</p>
          </div>
        </div>
      );
    }
    if (msg.type === "payment_link" && m) {
      return (
        <div className="w-52 bg-white rounded-xl overflow-hidden shadow border border-violet-200">
          <div className="px-3 py-2 text-white" style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
            <div className="flex items-center gap-1.5 mb-0.5"><CreditCard className="w-3 h-3" /><span className="text-[9px] font-bold uppercase">Payment Link</span></div>
            {m.amount && <p className="text-base font-black">Rs. {Number(m.amount).toLocaleString()}</p>}
          </div>
          <div className="p-2">
            <p className="text-[10px] font-semibold text-gray-700 truncate">{m.title ?? "Complete Payment"}</p>
            <a href={m.url} target="_blank" rel="noopener noreferrer" className="mt-1.5 w-full py-1 rounded-lg bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center gap-1">
              <ExternalLink className="w-2.5 h-2.5" /> Pay Now
            </a>
          </div>
        </div>
      );
    }
    if (msg.type === "tracking_link" && m) {
      return (
        <div className="w-52 bg-white rounded-xl overflow-hidden shadow border border-sky-200">
          <div className="px-3 py-2 text-white" style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)" }}>
            <div className="flex items-center gap-1.5 mb-0.5"><Truck className="w-3 h-3" /><span className="text-[9px] font-bold uppercase">Order Tracking</span></div>
            {m.orderNumber && <p className="text-xs font-bold font-mono">{m.orderNumber}</p>}
          </div>
          <div className="p-2 space-y-1">
            {m.courierName && <p className="text-[10px] text-gray-600">Courier: <span className="font-semibold">{m.courierName}</span></p>}
            {m.trackingNumber && <p className="text-[10px] text-gray-600 font-mono bg-gray-50 px-2 py-1 rounded">CN: {m.trackingNumber}</p>}
            {m.url && (
              <a href={m.url} target="_blank" rel="noopener noreferrer" className="w-full py-1 rounded-lg bg-sky-600 text-white text-[10px] font-bold flex items-center justify-center gap-1 mt-1">
                <ExternalLink className="w-2.5 h-2.5" /> Track Order
              </a>
            )}
          </div>
        </div>
      );
    }
    if (msg.type === "order_form") {
      return (
        <div className="w-52 bg-blue-50 border border-blue-200 rounded-xl p-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center mx-auto mb-1.5"><ClipboardList className="w-4 h-4 text-white" /></div>
          <p className="text-xs font-bold text-center text-blue-800 mb-1">Order Form</p>
          <p className="text-[9px] text-center text-blue-600">{msg.content}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-8rem)] -mx-4 md:-mx-8 -mt-4 md:-mt-8">
        <div className="px-4 md:px-8 py-4 border-b border-border bg-card flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold">Chat Conversations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Monitor sessions · Send product cards, coupons, payment & tracking links</p>
          </div>
          <div className="flex items-center gap-2">
            {activeCount > 0 && <Badge className="bg-green-100 text-green-700 border-green-200">{activeCount} Active</Badge>}
            <button onClick={() => refetch()} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"><RefreshCw className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Session list */}
          <div className="w-72 flex-shrink-0 border-r border-border flex flex-col">
            <div className="flex gap-0 border-b border-border px-2 pt-2">
              {([["all", "All"], ["active", "Active"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => setFilter(val)} className={`flex-1 py-2 text-xs font-semibold rounded-t-lg transition-colors ${filter === val ? "bg-background border border-b-0 border-border text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {label} {val === "active" && activeCount > 0 && <span className="ml-1 bg-green-100 text-green-700 text-[10px] px-1.5 rounded-full">{activeCount}</span>}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 px-4 text-muted-foreground"><MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No {filter === "active" ? "active " : ""}chats yet.</p></div>
              ) : (
                filtered.map(s => {
                  const msgs = s.messages ?? [];
                  const last = msgs[msgs.length - 1];
                  const active = isActive(s.updatedAt);
                  const lead = s.lead;
                  const sourceLabel = lead?.source === "shopify_widget" ? "Shopify" : lead?.source === "kdfplus_widget" ? "KDF Plus" : lead?.source ? "Website" : null;
                  return (
                    <button key={s.id} onClick={() => { setSelectedSession(s); setActiveTemplate(null); }}
                      className={`w-full text-left px-4 py-3.5 border-b border-border/50 hover:bg-muted/40 transition-colors ${selectedSession?.id === s.id ? "bg-[#5FA800]/5 border-l-2 border-l-[#5FA800]" : ""}`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <Circle className={`w-2 h-2 flex-shrink-0 ${active ? "fill-green-500 text-green-500" : "fill-gray-300 text-gray-300"}`} />
                        <span className="text-xs font-semibold text-foreground truncate flex-1">
                          {lead?.name ?? <span className="font-mono text-muted-foreground">{s.sessionId.slice(0, 14)}…</span>}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">{timeAgo(s.updatedAt)}</span>
                      </div>
                      {lead?.phone && <p className="text-[11px] text-muted-foreground mb-0.5">{lead.phone}{sourceLabel ? <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded bg-blue-50 text-blue-600">{sourceLabel}</span> : null}</p>}
                      {last && <p className={`text-xs truncate ${last.role === "user" ? "font-medium text-foreground" : "text-muted-foreground"}`}>{last.role === "admin" ? "You: " : last.role === "user" ? "" : "Bot: "}{last.type ? `[${last.type.replace(/_/g, " ")}]` : last.content.slice(0, 50)}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{msgs.length} messages</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Conversation view */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedSession ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <MessageCircle className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">Select a conversation</p>
                <p className="text-xs text-center max-w-xs">Send product cards (website + Shopify), coupons, payment links, tracking info, and more</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Circle className={`w-2.5 h-2.5 flex-shrink-0 ${isActive(selectedSession.updatedAt) ? "fill-green-500 text-green-500" : "fill-gray-300 text-gray-300"}`} />
                    <div>
                      {selectedSession.lead ? (
                        <>
                          <p className="text-sm font-semibold text-foreground">{selectedSession.lead.name} · <span className="font-mono text-xs text-muted-foreground">{selectedSession.lead.phone}</span></p>
                          <p className="text-xs text-muted-foreground">{isActive(selectedSession.updatedAt) ? "Active now" : `Last active ${timeAgo(selectedSession.updatedAt)}`} · {(selectedSession.messages ?? []).length} msgs{selectedSession.lead.source ? ` · ${selectedSession.lead.source === "shopify_widget" ? "Shopify" : selectedSession.lead.source === "kdfplus_widget" ? "KDF Plus" : "Website"}` : ""}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-mono text-sm font-medium">{selectedSession.sessionId.slice(0, 24)}…</p>
                          <p className="text-xs text-muted-foreground">{isActive(selectedSession.updatedAt) ? "Active now" : `Last active ${timeAgo(selectedSession.updatedAt)}`} · {(selectedSession.messages ?? []).length} messages</p>
                        </>
                      )}
                    </div>
                  </div>
                  <button onClick={() => { if (confirm("Delete this session?")) deleteMut.mutate(selectedSession.id); }} className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-muted/20">
                  {(selectedSession.messages ?? []).map((msg, i) => {
                    const isUser = msg.role === "user";
                    const isAdmin = msg.role === "admin";
                    const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }) : "";
                    const card = renderTemplateCard(msg);

                    if (card) return (
                      <div key={i} className="flex gap-2 justify-start">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isAdmin ? "bg-blue-600" : "bg-[#5FA800]"} text-white`}>
                          {isAdmin ? <Shield className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          {isAdmin && <p className="text-[9px] font-bold text-blue-600 mb-0.5 uppercase tracking-wider">Support Team</p>}
                          {card}
                          <p className="text-[9px] text-muted-foreground mt-1">{msg.content.slice(0, 60)}{msg.content.length > 60 ? "…" : ""}</p>
                          <p className="text-[10px] text-muted-foreground">{ts}</p>
                        </div>
                      </div>
                    );

                    return (
                      <div key={i} className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                        {!isUser && (
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isAdmin ? "bg-blue-600" : "bg-[#5FA800]"} text-white`}>
                            {isAdmin ? <Shield className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                          </div>
                        )}
                        <div className={`max-w-[72%] rounded-2xl px-3.5 py-2.5 ${isUser ? "bg-[#5FA800] text-white rounded-br-sm" : isAdmin ? "bg-blue-600 text-white rounded-bl-sm" : "bg-white border border-border text-foreground rounded-bl-sm"}`}>
                          {isAdmin && <p className="text-[9px] font-bold text-blue-200 mb-0.5 uppercase tracking-wider">Support Team</p>}
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          <p className={`text-[10px] mt-1 ${isUser ? "text-white/70" : isAdmin ? "text-blue-200" : "text-muted-foreground"}`}>{ts}</p>
                        </div>
                        {isUser && <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0 mt-0.5"><User className="w-3.5 h-3.5 text-gray-600" /></div>}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {activeTemplate && (
                  <TemplatePanel
                    sessionId={selectedSession.sessionId}
                    initialMode={activeTemplate === "panel" ? null : activeTemplate as TemplateType}
                    onClose={() => setActiveTemplate(null)}
                    onSent={(session) => { setSelectedSession(session); qc.invalidateQueries({ queryKey: ["admin-chat-sessions"] }); setActiveTemplate(null); }}
                  />
                )}

                {/* Quick-action toolbar */}
                <div className="border-t border-border bg-card flex-shrink-0">
                  {/* Template icon row */}
                  <div className="px-3 pt-2.5 pb-1 flex items-center gap-1 overflow-x-auto">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex-shrink-0 mr-1">Send:</span>
                    {[
                      { type: "product" as TemplateType, icon: Package, label: "Product", color: "text-green-700 bg-green-50 border-green-200 hover:bg-green-100" },
                      { type: "coupon" as TemplateType, icon: Tag, label: "Coupon", color: "text-orange-600 bg-orange-50 border-orange-200 hover:bg-orange-100" },
                      { type: "category" as TemplateType, icon: Grid3x3, label: "Category", color: "text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100" },
                      { type: "offer" as TemplateType, icon: Gift, label: "Offer", color: "text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100" },
                      { type: "payment_link" as TemplateType, icon: CreditCard, label: "Pay Link", color: "text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100" },
                      { type: "tracking_link" as TemplateType, icon: Truck, label: "Tracking", color: "text-sky-700 bg-sky-50 border-sky-200 hover:bg-sky-100" },
                      { type: "order_form" as TemplateType, icon: ClipboardList, label: "Order Form", color: "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100" },
                    ].map(({ type, icon: Icon, label, color }) => (
                      <button
                        key={type}
                        onClick={() => setActiveTemplate(prev => prev === type ? null : type)}
                        title={label}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold flex-shrink-0 transition-all ${
                          activeTemplate === type
                            ? color.replace("bg-", "bg-").replace("hover:bg-", "") + " ring-1 ring-offset-0 opacity-100 scale-95"
                            : color + " opacity-80 hover:opacity-100"
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                    ))}
                  </div>
                  {/* Text input row */}
                  <div className="px-3 pb-3 flex gap-2 items-end">
                    <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                      placeholder="Type reply… (Enter to send)"
                      rows={2}
                      className="flex-1 border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-background" />
                    <Button onClick={handleReply} disabled={replyMut.isPending || !replyText.trim()} className="h-10 px-4 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0">
                      {replyMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
