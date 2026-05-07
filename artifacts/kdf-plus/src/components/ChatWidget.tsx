import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, MessageCircle, RotateCcw, Loader2, ShoppingBag, AlertCircle, ChevronDown, ShoppingCart, Eye, Tag, Gift, ClipboardList, CreditCard, Truck, ExternalLink, Zap, Mic, MicOff, MapPin } from "lucide-react";
import { useLocation } from "wouter";

const SESSION_KEY = "kdfplus_chat_session";
const CHAT_CART_KEY = "kdfplus_chat_cart";
const LEAD_KEY = "kdfplus_lead";
const CITIES = ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta", "Sialkot", "Gujranwala", "Hyderabad", "Abbottabad", "Bahawalpur", "Sargodha", "Other"];

function getImageUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.startsWith("http")) return key;
  return `/api/storage/objects/${key}`;
}

const WA_SVG = (
  <svg viewBox="0 0 24 24" fill="white" width={24} height={24}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const WELCOME = "Hi! Welcome to KDF Nuts. I'm here to help you 24/7. Whether you're looking for a product, want to place an order, or have any question — just ask!";

interface ProductVariant {
  id: string; name: string; value: string; price?: number; stock: number;
}
interface Product {
  id: number;
  name: string;
  price: number;
  originalPrice?: number | null;
  discount?: number | null;
  stock: number;
  variants: ProductVariant[];
  image?: string | null;
}
interface ChatCartItem {
  productId: number; name: string; variant: string; variantId?: string; price: number; qty: number; image?: string | null;
}

interface TemplateMetadata {
  id?: number;
  name?: string;
  slug?: string;
  price?: number;
  originalPrice?: number;
  discount?: number;
  image?: string;
  code?: string;
  discountPercent?: number;
  minOrder?: number;
  title?: string;
  description?: string;
  color?: string;
  /* payment_link */
  url?: string;
  amount?: number;
  /* tracking_link */
  orderNumber?: string;
  trackingNumber?: string;
  courierName?: string;
  /* multi_product */
  products?: Product[];
  /* product card stock */
  stock?: number;
  variants?: ProductVariant[];
}

interface AutoCartItem {
  productId: number; name: string; variant?: string | null; variantId?: string | null; price: number; qty: number; image?: string | null;
}
interface ChatMessage {
  role: "user" | "assistant" | "admin";
  content: string;
  timestamp: Date;
  products?: Product[];
  categories?: { id: number; name: string; slug: string; image?: string | null }[];
  orderPlaced?: { id: number; orderNumber: string };
  type?: "product" | "category" | "coupon" | "offer" | "order_form" | "multi_product" | "payment_link" | "tracking_link" | "escalate_human";
  metadata?: TemplateMetadata;
  autoCartAdded?: AutoCartItem[];
}

interface OrderFormData {
  product: string; qty: number; name: string; phone: string;
  city: string; cityCustom: string; address: string; notes: string;
}

/* ── Image with fallback ── */
function ProductImg({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [err, setErr] = useState(false);
  const url = getImageUrl(src);
  if (!url || err) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-100 to-emerald-200 text-2xl">🥜</div>
    );
  }
  return <img src={url} alt={alt} className="w-full h-full object-cover" onError={() => setErr(true)} />;
}

/* ── Rich Product Card ── */
function ProductCard({ product, onAddToCart, onView, onBuyNow }: {
  product: Product;
  onAddToCart: (p: Product, variant: ProductVariant | null, price: number) => void;
  onView: (id: number) => void;
  onBuyNow?: (p: Product, variant: ProductVariant | null, price: number) => void;
}) {
  const hasVariants = product.variants.length > 0;
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(hasVariants ? product.variants[0] : null);
  const currentPrice = selectedVariant?.price ?? product.price;
  const isInStock = selectedVariant ? selectedVariant.stock > 0 : product.stock > 0;
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm mb-2">
      <div className="relative h-24 bg-gradient-to-br from-green-50 to-emerald-100">
        <ProductImg src={product.image} alt={product.name} />
        {product.discount && product.discount > 0 && (
          <span className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{product.discount}% OFF</span>
        )}
        {!isInStock && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-xs font-bold bg-black/60 px-2 py-1 rounded">Out of Stock</span>
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="font-semibold text-foreground text-sm leading-tight mb-1 truncate">{product.name}</p>
        {hasVariants && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {product.variants.map(v => {
              const vPrice = v.price ?? product.price;
              const isSelected = selectedVariant?.id === v.id;
              return (
                <button key={v.id} onClick={() => setSelectedVariant(v)}
                  className={`flex flex-col items-center px-2.5 py-1.5 rounded-xl border-2 font-semibold transition-all active:scale-95 min-w-[52px] ${isSelected ? "text-white border-transparent shadow-sm" : "bg-background border-border text-muted-foreground"}`}
                  style={isSelected ? { backgroundColor: "#5FA800", borderColor: "#5FA800" } : undefined}>
                  <span className="text-[11px] font-bold">{v.value}</span>
                  {v.price != null && <span className={`text-[9px] mt-0.5 font-medium ${isSelected ? "text-green-100" : "text-muted-foreground"}`}>Rs.{vPrice.toLocaleString()}</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-1.5 mb-2">
          <span className="font-bold text-[#5FA800] text-sm">Rs. {currentPrice.toLocaleString()}</span>
          {product.originalPrice && product.originalPrice > currentPrice && (
            <span className="text-muted-foreground text-xs line-through">Rs. {product.originalPrice.toLocaleString()}</span>
          )}
          {!isInStock && <span className="text-[10px] text-red-500 font-semibold ml-auto">Out of stock</span>}
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => onView(product.id)} className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors">
            <Eye className="w-3 h-3" /> View
          </button>
          {isInStock && (
            <button onClick={() => onAddToCart(product, selectedVariant, currentPrice)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors" style={{ backgroundColor: "#5FA800" }}>
              <ShoppingCart className="w-3 h-3" /> Add
            </button>
          )}
        </div>
        {isInStock && onBuyNow && (
          <button onClick={() => onBuyNow(product, selectedVariant, currentPrice)} className="w-full mt-1.5 flex items-center justify-center gap-1 py-1.5 rounded-lg text-white text-xs font-bold transition-colors hover:opacity-90" style={{ backgroundColor: "#F58300" }}>
            <Zap className="w-3 h-3" /> Buy Now
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Multi-Product Carousel ── */
function MultiProductCarousel({ products, onAddToCart, onView, onBuyNow }: {
  products: Product[];
  onAddToCart: (p: Product, variant: ProductVariant | null, price: number) => void;
  onView: (id: number) => void;
  onBuyNow?: (p: Product, variant: ProductVariant | null, price: number) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 max-w-[92%]" style={{ scrollbarWidth: "none" }}>
      {products.map(p => (
        <div key={p.id} className="flex-shrink-0 w-44">
          <ProductCard product={p} onAddToCart={onAddToCart} onView={onView} onBuyNow={onBuyNow} />
        </div>
      ))}
    </div>
  );
}

/* ── Payment Link Card ── */
function PaymentLinkCard({ meta }: { meta: TemplateMetadata }) {
  return (
    <div className="bg-white border border-violet-200 rounded-xl overflow-hidden shadow-sm mb-2 max-w-[90%]">
      <div className="px-3 py-2.5 text-white" style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
        <div className="flex items-center gap-1.5 mb-1">
          <CreditCard className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Payment Link</span>
        </div>
        {meta.amount && <p className="text-xl font-black">Rs. {Number(meta.amount).toLocaleString()}</p>}
      </div>
      <div className="p-3">
        {meta.title && <p className="text-sm font-semibold text-gray-800 mb-2">{meta.title}</p>}
        {meta.url && (
          <a href={meta.url} target="_blank" rel="noopener noreferrer"
            className="w-full py-2 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#7c3aed" }}>
            <ExternalLink className="w-3 h-3" /> Pay Securely Now
          </a>
        )}
      </div>
    </div>
  );
}

/* ── Tracking Link Card ── */
function TrackingLinkCard({ meta }: { meta: TemplateMetadata }) {
  return (
    <div className="bg-white border border-sky-200 rounded-xl overflow-hidden shadow-sm mb-2 max-w-[90%]">
      <div className="px-3 py-2.5 text-white" style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)" }}>
        <div className="flex items-center gap-1.5 mb-1">
          <Truck className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Order Tracking</span>
        </div>
        {meta.orderNumber && <p className="text-sm font-bold font-mono">{meta.orderNumber}</p>}
      </div>
      <div className="p-3 space-y-2">
        {meta.courierName && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-muted-foreground">COURIER</span>
            <span className="text-xs font-semibold">{meta.courierName}</span>
          </div>
        )}
        {meta.trackingNumber && (
          <div className="bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1.5">
            <p className="text-[10px] font-bold text-sky-600 mb-0.5">TRACKING NO.</p>
            <p className="font-mono font-bold text-sm text-gray-800">{meta.trackingNumber}</p>
          </div>
        )}
        {meta.url && (
          <a href={meta.url} target="_blank" rel="noopener noreferrer"
            className="w-full py-2 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#0ea5e9" }}>
            <ExternalLink className="w-3 h-3" /> Track My Order
          </a>
        )}
      </div>
    </div>
  );
}

/* ── Coupon Card ── */
function CouponCard({ meta }: { meta: TemplateMetadata }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(meta.code ?? "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <div className="border-2 border-dashed border-[#5FA800] rounded-xl overflow-hidden bg-green-50 mb-2">
      <div className="px-3 py-2 flex items-center justify-between" style={{ background: "linear-gradient(135deg,#5FA800,#4d8a00)" }}>
        <div className="flex items-center gap-1.5 text-white">
          <Tag className="w-3.5 h-3.5" />
          <span className="text-xs font-bold uppercase tracking-wider">Special Offer</span>
        </div>
        {meta.discountPercent && <span className="bg-white text-[#5FA800] text-sm font-black px-2.5 py-0.5 rounded-full">{meta.discountPercent}% OFF</span>}
      </div>
      <div className="px-3 py-2.5">
        {meta.name && <p className="text-sm font-bold text-gray-800 mb-0.5">{meta.name}</p>}
        {meta.description && <p className="text-xs text-gray-600 mb-2">{meta.description}</p>}
        {meta.minOrder && <p className="text-[10px] text-gray-500 mb-2">Min. order Rs. {meta.minOrder.toLocaleString()}</p>}
        <button onClick={copy} className="w-full py-2 rounded-lg border-2 border-dashed border-[#5FA800] text-[#5FA800] font-mono font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#5FA800]/5 transition-colors">
          {meta.code}
          <span className="text-[10px] bg-[#5FA800] text-white px-2 py-0.5 rounded-full font-semibold">{copied ? "Copied!" : "Tap to Copy"}</span>
        </button>
      </div>
    </div>
  );
}

/* ── Offer Card ── */
function CategoryCard({ meta, onView }: { meta: TemplateMetadata; onView: (slug: string) => void }) {
  const [imgErr, setImgErr] = useState(false);
  const imgUrl = getImageUrl(meta.image);
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm mb-2">
      <div className="relative h-20 bg-gradient-to-br from-teal-50 to-emerald-100">
        {imgUrl && !imgErr
          ? <img src={imgUrl} alt={meta.name ?? ""} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          : <div className="w-full h-full flex items-center justify-center text-3xl">🗂️</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <p className="absolute bottom-2 left-2.5 text-white font-bold text-sm drop-shadow">{meta.name}</p>
      </div>
      <div className="p-2.5">
        <button onClick={() => onView(meta.slug ?? "")} className="w-full py-1.5 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-1.5" style={{ backgroundColor: "#5FA800" }}>
          View Products →
        </button>
      </div>
    </div>
  );
}

function OfferCard({ meta, content }: { meta: TemplateMetadata; content: string }) {
  const bg = meta.color ?? "#5FA800";
  return (
    <div className="rounded-xl overflow-hidden shadow-sm mb-2">
      <div className="px-4 py-3 text-white" style={{ background: `linear-gradient(135deg,${bg},${bg}cc)` }}>
        <div className="flex items-center gap-2 mb-1">
          <Gift className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">{meta.title ?? "Special Offer"}</span>
        </div>
        <p className="text-sm leading-relaxed font-medium">{content}</p>
      </div>
    </div>
  );
}

/* ── Order Form Prompt Card ── */
function OrderFormPromptCard({ onOpenForm }: { onOpenForm: () => void }) {
  return (
    <div className="border border-[#5FA800]/30 bg-green-50 rounded-xl p-3 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-[#5FA800] flex items-center justify-center flex-shrink-0">
          <ClipboardList className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="font-bold text-gray-800 text-sm">Place Your Order</p>
          <p className="text-[10px] text-gray-500">Fill in your details and we'll confirm shortly</p>
        </div>
      </div>
      <button onClick={onOpenForm} className="w-full py-2 rounded-lg text-white text-sm font-bold flex items-center justify-center gap-1.5" style={{ backgroundColor: "#5FA800" }}>
        <ShoppingBag className="w-3.5 h-3.5" /> Open Order Form
      </button>
    </div>
  );
}

/* ── Typing Indicator ── */
function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 mb-3">
      <div className="w-6 h-6 rounded-full bg-[#5FA800] flex items-center justify-center flex-shrink-0 font-black text-white text-[10px]">K</div>
      <div className="bg-white rounded-2xl rounded-bl-sm px-3 py-2.5 shadow-sm border border-border">
        <div className="flex gap-1 items-center h-4">
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

/* ── Order Success Banner ── */
function OrderBanner({ orderNumber }: { orderNumber: string }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 mb-1.5 flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">✓</div>
      <div>
        <p className="font-bold text-green-800 text-xs">Order Placed!</p>
        <p className="text-green-700 text-xs font-mono">{orderNumber}</p>
      </div>
    </div>
  );
}

/* ── Message Bubble ── */
function HumanEscalationCard({ waPhone }: { waPhone?: string }) {
  const waUrl = waPhone
    ? `https://wa.me/${waPhone.replace(/\D/g, "")}?text=${encodeURIComponent("Hello! I need help with my KDF Plus order.")}`
    : `https://wa.me/?text=${encodeURIComponent("Hello! I need help with my KDF Plus order.")}`;
  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 max-w-[90%] shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 text-sm">👋</div>
        <div>
          <p className="text-sm font-bold text-orange-800 leading-tight">Connect with our team</p>
          <p className="text-[10px] text-orange-500">Live support available daily 9am–9pm PKT</p>
        </div>
      </div>
      <a href={waUrl} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 text-xs font-bold text-white py-2.5 px-4 rounded-xl w-full active:opacity-80 transition-opacity"
        style={{ backgroundColor: "#25D366" }}>
        <svg viewBox="0 0 24 24" fill="white" width={14} height={14}>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Chat on WhatsApp
      </a>
    </div>
  );
}

function AutoCartBanner({ items, onCheckout }: { items: AutoCartItem[]; onCheckout: () => void }) {
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  return (
    <div className="rounded-2xl border border-[#5FA800]/30 bg-[#5FA800]/5 px-3 py-2.5 max-w-[90%] shadow-sm mt-1">
      <div className="flex items-center gap-1.5 mb-2">
        <ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5FA800" }} />
        <p className="text-xs font-bold" style={{ color: "#5FA800" }}>Added to cart automatically!</p>
      </div>
      <div className="space-y-1 mb-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-foreground font-medium">{item.name}{item.variant ? ` (${item.variant})` : ""} ×{item.qty}</span>
            <span className="font-bold" style={{ color: "#5FA800" }}>Rs.{(item.price * item.qty).toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-1.5 border-t border-[#5FA800]/15">
        <span className="text-xs font-bold text-foreground">Total: Rs.{total.toLocaleString()}</span>
        <button onClick={onCheckout} className="text-[10px] font-bold text-white px-3 py-1.5 rounded-full active:opacity-80" style={{ backgroundColor: "#5FA800" }}>Checkout →</button>
      </div>
    </div>
  );
}

function MessageBubble({ msg, onAddToCart, onViewProduct, onOpenForm, onViewCategory, onBuyNow, waPhone }: {
  msg: ChatMessage;
  onAddToCart: (p: Product, variant: ProductVariant | null, price: number) => void;
  onViewProduct: (id: number) => void;
  onOpenForm: () => void;
  onViewCategory: (slug: string) => void;
  onBuyNow?: (p: Product, variant: ProductVariant | null, price: number) => void;
  waPhone?: string;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end mb-3">
        <div className="bg-[#5FA800] text-white rounded-2xl rounded-br-sm px-3 py-2 max-w-[82%] shadow-sm">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    );
  }

  const isAdmin = msg.role === "admin";
  const bubbleBg = isAdmin ? "bg-blue-600 text-white rounded-bl-sm" : "bg-white border border-border text-foreground rounded-bl-sm";
  const avatarBg = isAdmin ? "bg-blue-600" : "bg-[#5FA800]";
  const avatarLetter = isAdmin ? "S" : "K";

  /* Template rendering */
  const renderTemplate = () => {
    if (!msg.type) return null;
    if (msg.type === "product" && msg.metadata) {
      const p: Product = {
        id: msg.metadata.id ?? 0, name: msg.metadata.name ?? "", price: msg.metadata.price ?? 0,
        originalPrice: msg.metadata.originalPrice, discount: msg.metadata.discount,
        stock: msg.metadata.stock ?? 1, variants: msg.metadata.variants ?? [], image: msg.metadata.image,
      };
      return <ProductCard product={p} onAddToCart={onAddToCart} onView={onViewProduct} onBuyNow={onBuyNow} />;
    }
    if (msg.type === "multi_product" && msg.metadata?.products) {
      const products: Product[] = msg.metadata.products.map((p: any) => ({
        id: p.id, name: p.name, price: p.price, originalPrice: p.originalPrice,
        discount: p.discount, stock: p.stock ?? 1, variants: p.variants ?? [], image: p.image,
      }));
      return <MultiProductCarousel products={products} onAddToCart={onAddToCart} onView={onViewProduct} onBuyNow={onBuyNow} />;
    }
    if (msg.type === "category" && msg.metadata) return <CategoryCard meta={msg.metadata} onView={onViewCategory} />;
    if (msg.type === "coupon" && msg.metadata) return <CouponCard meta={msg.metadata} />;
    if (msg.type === "offer" && msg.metadata) return <OfferCard meta={msg.metadata} content={msg.content} />;
    if (msg.type === "payment_link" && msg.metadata) return <PaymentLinkCard meta={msg.metadata} />;
    if (msg.type === "tracking_link" && msg.metadata) return <TrackingLinkCard meta={msg.metadata} />;
    if (msg.type === "order_form") return <OrderFormPromptCard onOpenForm={onOpenForm} />;
    if (msg.type === "escalate_human") return <HumanEscalationCard waPhone={waPhone} />;
    return null;
  };

  return (
    <div className="flex items-end gap-2 mb-3">
      <div className={`w-6 h-6 rounded-full ${avatarBg} flex items-center justify-center flex-shrink-0 font-black text-white text-[10px]`}>{avatarLetter}</div>
      <div className="flex-1 min-w-0">
        {isAdmin && <p className="text-[9px] font-semibold text-blue-600 mb-0.5 ml-1 uppercase tracking-wider">Support Team</p>}
        {msg.orderPlaced && <OrderBanner orderNumber={msg.orderPlaced.orderNumber} />}
        {renderTemplate() ?? (
          <div className={`${bubbleBg} rounded-2xl px-3 py-2 shadow-sm inline-block max-w-[90%]`}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
          </div>
        )}
        {msg.autoCartAdded && msg.autoCartAdded.length > 0 && (
          <AutoCartBanner items={msg.autoCartAdded} onCheckout={onOpenForm} />
        )}
        {msg.products && msg.products.length > 0 && (
          <div className="mt-2 max-w-[90%] grid grid-cols-2 gap-1.5">
            {msg.products.map(p => <ProductCard key={p.id} product={p} onAddToCart={onAddToCart} onView={onViewProduct} />)}
          </div>
        )}
        {msg.categories && msg.categories.length > 0 && (
          <div className="mt-2 max-w-[90%] grid grid-cols-2 gap-1.5">
            {msg.categories.map(c => <CategoryCard key={c.id} meta={{ id: c.id, name: c.name, slug: c.slug, image: c.image ?? undefined }} onView={onViewCategory} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Product Search Combobox for Order Form ── */
function ProductCombobox({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query || query.length < 1) { setResults([]); setShow(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=products&limit=6`);
        if (r.ok) { const d = await r.json(); setResults(d.products ?? []); if (d.products?.length > 0) setShow(true); }
      } catch {} finally { setLoading(false); }
    }, 280);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  return (
    <div className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setShow(true); }}
          onBlur={() => setTimeout(() => setShow(false), 180)}
          placeholder="Search product... (e.g. almonds, kaju)"
          className={className}
        />
        {loading && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs animate-pulse" style={{ color: "#5FA800" }}>●</span>}
      </div>
      {show && results.length > 0 && (
        <div className="absolute z-[300] top-full left-0 right-0 mt-1 bg-background border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {results.map(p => (
            <button key={p.id} type="button"
              onMouseDown={() => { onChange(p.name); setQuery(p.name); setShow(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left border-b border-border/50 last:border-0 transition-colors">
              {p.image ? (
                <img src={getImageUrl(p.image) ?? ""} alt={p.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold bg-[#5FA800]/10" style={{ color: "#5FA800" }}>{p.name[0]}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{p.name}</p>
                <p className="text-[10px] font-semibold" style={{ color: "#5FA800" }}>Rs. {p.price.toLocaleString()}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {show && results.length === 0 && query.length > 1 && !loading && (
        <div className="absolute z-[300] top-full left-0 right-0 mt-1 bg-background border border-border rounded-xl shadow px-3 py-2 text-xs text-muted-foreground text-center">
          No match — just type a custom product name above.
        </div>
      )}
    </div>
  );
}

/* ── Order Form Panel (inline overlay for desktop, full-screen on mobile) ── */
function OrderFormPanel({ defaultProduct, initialCart, sessionId, onClose, onSuccess }: {
  defaultProduct: string; initialCart?: ChatCartItem[]; sessionId: string | null;
  onClose: () => void; onSuccess: (orderNumber: string, orderId: number) => void;
}) {
  const hasCart = (initialCart?.length ?? 0) > 0;
  const [localCart, setLocalCart] = useState<ChatCartItem[]>(initialCart ?? []);
  const [form, setForm] = useState<OrderFormData>({ product: defaultProduct, qty: 1, name: "", phone: "", city: "", cityCustom: "", address: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [isDetectingLoc, setIsDetectingLoc] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const set = (k: keyof OrderFormData, v: string | number) => { setForm(f => ({ ...f, [k]: v })); setSubmitError(null); };

  const detectLocation = () => {
    if (!navigator.geolocation) { setLocError("Location not supported on this device"); return; }
    setIsDetectingLoc(true); setLocError(null);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude: lat, longitude: lng } = pos.coords;
        const res = await fetch("/api/locations/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng }) });
        const d = await res.json();
        if (d.fullAddress) set("address", d.fullAddress);
        if (d.city) {
          const matched = CITIES.find(c => c.toLowerCase() === d.city.toLowerCase());
          if (matched) set("city", matched);
          else { set("city", "Other"); set("cityCustom", d.city); }
        }
      } catch { setLocError("Could not fetch address. Please enter manually."); }
      finally { setIsDetectingLoc(false); }
    }, () => { setIsDetectingLoc(false); setLocError("Location access denied. Please type your address."); }, { timeout: 10000 });
  };

  const updateCartQty = (idx: number, qty: number) => { if (qty < 1) return; setLocalCart(c => c.map((it, i) => i === idx ? { ...it, qty } : it)); };
  const removeCartItem = (idx: number) => setLocalCart(c => c.filter((_, i) => i !== idx));
  const cartTotal = localCart.reduce((s, i) => s + i.price * i.qty, 0);

  const v1 = () => {
    const e: Record<string, string> = {};
    if (hasCart) { if (localCart.length === 0) e.cart = "Add at least one item"; }
    else { if (!form.product.trim()) e.product = "Required"; if (form.qty < 1) e.qty = "Min 1"; }
    setErrors(e); return !Object.keys(e).length;
  };
  const v2 = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Required";
    if (!form.phone.trim()) e.phone = "Required";
    else if (!/^\+?[\d\s\-()]{7,20}$/.test(form.phone.trim())) e.phone = "Invalid phone number";
    if (!form.city) e.city = "Required";
    if (form.city === "Other" && !form.cityCustom.trim()) e.cityCustom = "Required";
    if (!form.address.trim()) e.address = "Required";
    setErrors(e); setSubmitError(null); return !Object.keys(e).length;
  };

  const submit = async () => {
    if (!v2()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const city = form.city === "Other" ? form.cityCustom : form.city;
      const items = hasCart
        ? localCart.map(i => ({ name: i.name, variant: i.variant, variantId: i.variantId, price: i.price, qty: i.qty }))
        : [{ name: form.product.trim(), variant: "", price: 0, qty: form.qty }];
      const r = await fetch("/api/chat/direct-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, items, name: form.name.trim(), phone: form.phone.trim(), city, address: form.address.trim(), notes: form.notes.trim() }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Order failed. Please try again.");
      onSuccess(data.orderNumber, data.orderId);
    } catch (e: any) { setSubmitError(e.message); } finally { setIsSubmitting(false); }
  };

  const Err = ({ f }: { f: string }) => errors[f] ? <p className="text-red-500 text-[10px] mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors[f]}</p> : null;
  const inputCls = "w-full border border-border rounded-lg px-3 py-2 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-[#5FA800]/50";

  return (
    <div className="absolute inset-0 z-10 flex flex-col rounded-2xl overflow-hidden bg-muted">
      <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0" style={{ background: "linear-gradient(135deg,#5FA800,#4d8a00)" }}>
        <button onClick={onClose} className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center"><X className="w-3.5 h-3.5 text-white" /></button>
        <p className="font-bold text-white text-xs flex-1">{hasCart ? "Review & Order" : "Place Order"} — Step {step}/2</p>
        <div className="flex gap-1">
          <div className={`h-1 w-8 rounded-full ${step >= 1 ? "bg-white" : "bg-white/30"}`} />
          <div className={`h-1 w-8 rounded-full ${step >= 2 ? "bg-white" : "bg-white/30"}`} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {step === 1 ? (
          <>
            {hasCart ? (
              <>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Your items</p>
                {localCart.map((item, idx) => (
                  <div key={idx} className="bg-background rounded-lg border border-border p-2.5 flex gap-2 items-start">
                    {item.image && <img src={`/api/storage/objects/${item.image}`} alt={item.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground text-xs truncate">{item.name}</p>
                      {item.variant && <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#5FA800" }}>{item.variant}</span>}
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center border border-border rounded-lg overflow-hidden bg-muted">
                          <button onClick={() => updateCartQty(idx, item.qty - 1)} className="w-6 h-6 flex items-center justify-center text-xs font-bold text-foreground">−</button>
                          <span className="w-6 text-center text-xs font-bold">{item.qty}</span>
                          <button onClick={() => updateCartQty(idx, item.qty + 1)} className="w-6 h-6 flex items-center justify-center text-xs font-bold text-foreground">+</button>
                        </div>
                        <span className="text-xs font-bold" style={{ color: "#5FA800" }}>Rs. {(item.price * item.qty).toLocaleString()}</span>
                        <button onClick={() => removeCartItem(idx)} className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center text-red-400 text-[10px]">✕</button>
                      </div>
                    </div>
                  </div>
                ))}
                {localCart.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Cart is empty</p>}
                <Err f="cart" />
                <div className="bg-green-50 border border-green-200/50 rounded-lg p-2.5 flex justify-between items-center">
                  <span className="text-xs font-semibold text-gray-700">Total</span>
                  <span className="font-bold text-sm" style={{ color: "#5FA800" }}>Rs. {cartTotal.toLocaleString()}</span>
                </div>
              </>
            ) : (
              <>
                <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Product *</label><ProductCombobox value={form.product} onChange={v => set("product", v)} className={inputCls} /><Err f="product" /></div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground mb-1 block">Quantity *</label>
                  <div className="flex items-center border border-border rounded-lg overflow-hidden w-fit bg-background">
                    <button onClick={() => set("qty", Math.max(1, form.qty - 1))} className="w-8 h-8 flex items-center justify-center text-sm font-bold hover:bg-muted border-r border-border">−</button>
                    <span className="w-8 text-center text-xs font-bold">{form.qty}</span>
                    <button onClick={() => set("qty", form.qty + 1)} className="w-8 h-8 flex items-center justify-center text-sm font-bold hover:bg-muted border-l border-border">+</button>
                  </div>
                </div>
              </>
            )}
            <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Notes (optional)</label><textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any special requests..." rows={2} className={`${inputCls} resize-none`} /></div>
          </>
        ) : (
          <>
            <button type="button" onClick={detectLocation} disabled={isDetectingLoc}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed font-semibold text-xs transition-all active:scale-95 disabled:opacity-60"
              style={{ borderColor: "#5FA800", color: "#5FA800", backgroundColor: "#f0f9e8" }}>
              {isDetectingLoc ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Detecting location…</> : <><MapPin className="w-3.5 h-3.5" />Auto-detect my address</>}
            </button>
            {locError && <p className="text-[10px] text-amber-600 -mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{locError}</p>}
            <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Full Name *</label><input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Your full name" className={inputCls} /><Err f="name" /></div>
            <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Phone *</label><input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="03XX XXXXXXX" className={inputCls} /><Err f="phone" /></div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground mb-1 block">City *</label>
              <div className="relative"><select value={form.city} onChange={e => set("city", e.target.value)} className={`${inputCls} appearance-none pr-7`}><option value="">Select city…</option>{CITIES.map(c => <option key={c} value={c}>{c}</option>)}</select><ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" /></div>
              <Err f="city" />
              {form.city === "Other" && <><input value={form.cityCustom} onChange={e => set("cityCustom", e.target.value)} placeholder="Your city" className={`mt-1.5 ${inputCls}`} /><Err f="cityCustom" /></>}
            </div>
            <div><label className="text-[10px] font-bold text-muted-foreground mb-1 block">Address *</label><textarea value={form.address} onChange={e => set("address", e.target.value)} placeholder="House/flat, street, area..." rows={3} className={`${inputCls} resize-none`} /><Err f="address" /></div>
          </>
        )}
      </div>
      <div className="bg-background border-t border-border px-3 pt-2 pb-2.5 flex-shrink-0">
        {submitError && (
          <div className="flex items-start gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 mb-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-600 font-medium leading-snug">{submitError}</p>
          </div>
        )}
        <div className="flex gap-2">
          {step === 2 && <button onClick={() => { setStep(1); setSubmitError(null); }} className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground">Back</button>}
          <button onClick={step === 1 ? () => { if (v1()) setStep(2); } : submit} disabled={isSubmitting} className="flex-1 py-2 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ backgroundColor: "#5FA800" }}>
            {isSubmitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Placing…</> : step === 1 ? "Continue →" : <><ShoppingBag className="w-3.5 h-3.5" />Place Order</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   Main ChatWidget
════════════════════════════════════════════ */
export function ChatWidget() {
  const [, setLocation] = useLocation();
  const [waConfig, setWaConfig] = useState<{ phone: string; message: string } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [defaultOrderProduct, setDefaultOrderProduct] = useState("");
  const [chatCart, setChatCart] = useState<ChatCartItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgCountRef = useRef(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<any>(null);

  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadCity, setLeadCity] = useState("");
  const [leadSubmitting, setLeadSubmitting] = useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    setIsExpanded(false);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => setDismissed(false), 3 * 60 * 1000);
  };

  const handleChatOpen = () => {
    const saved = localStorage.getItem(LEAD_KEY);
    if (saved) {
      setIsExpanded(false);
      setIsOpen(true);
    } else {
      setIsExpanded(false);
      setShowLeadForm(true);
    }
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim() || !leadPhone.trim()) return;
    setLeadSubmitting(true);
    try {
      const newSessionId = sessionId ?? `kdfplus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (!sessionId) setSessionId(newSessionId);
      await fetch("/api/chat/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leadName.trim(),
          phone: leadPhone.trim(),
          email: leadEmail.trim() || undefined,
          city: leadCity || undefined,
          source: "kdf_plus",
          sessionId: newSessionId,
          visitSource: document.referrer || undefined,
          deviceInfo: { userAgent: navigator.userAgent, language: navigator.language },
        }),
      });
      localStorage.setItem(LEAD_KEY, JSON.stringify({ name: leadName.trim(), phone: leadPhone.trim(), submitted: true }));
    } catch {}
    setLeadSubmitting(false);
    setShowLeadForm(false);
    setIsOpen(true);
  };

  useEffect(() => {
    fetch("/api/whatsapp/chat-config").then(r => r.json()).then(d => { if (d?.enabled && d.phone) setWaConfig({ phone: d.phone, message: d.message }); }).catch(() => {});
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) { try { const { sessionId: sid, messages: msgs } = JSON.parse(saved); if (sid) setSessionId(sid); if (msgs?.length) setMessages(msgs.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))); } catch {} }
  }, []);

  useEffect(() => {
    if (sessionId || messages.length > 0) localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId, messages }));
  }, [sessionId, messages]);

  useEffect(() => {
    try { const s = localStorage.getItem(CHAT_CART_KEY); if (s) setChatCart(JSON.parse(s)); } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(CHAT_CART_KEY, JSON.stringify(chatCart));
  }, [chatCart]);

  useEffect(() => {
    if (isOpen) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [messages, isLoading, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
      if (messages.length === 0) setMessages([{ role: "assistant", content: WELCOME, timestamp: new Date() }]);
    }
  }, [isOpen]);

  /* Poll for admin messages */
  useEffect(() => {
    if (isOpen && sessionId) {
      msgCountRef.current = messages.length;
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/chat/session/${sessionId}`);
          if (!r.ok) return;
          const data = await r.json();
          const serverMsgs: any[] = data.messages ?? [];
          if (serverMsgs.length > msgCountRef.current) {
            const newMsgs = serverMsgs.slice(msgCountRef.current).filter((m: any) => m.role === "admin");
            if (newMsgs.length > 0) {
              setMessages(prev => [...prev, ...newMsgs.map((m: any) => ({
                role: "admin" as const, content: m.content, timestamp: new Date(m.timestamp),
                type: m.type as ChatMessage["type"], metadata: m.metadata,
              }))]);
              msgCountRef.current = serverMsgs.length;
            }
          }
        } catch {}
      }, 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isOpen, sessionId]);

  const sendMessage = useCallback(async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || isLoading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userText, timestamp: new Date() }]);
    setIsLoading(true);
    try {
      const res = await fetch("/api/chat/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, message: userText }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `Error ${res.status}`); }
      const data = await res.json();
      if (data.sessionId && !sessionId) setSessionId(data.sessionId);
      msgCountRef.current = (messages.length + 1) + 1;
      if (data.autoCart?.length > 0) {
        data.autoCart.forEach((item: AutoCartItem) => {
          setChatCart(prev => {
            const key = `${item.productId}-${item.variantId ?? ""}`;
            const idx = prev.findIndex(i => `${i.productId}-${i.variantId ?? ""}` === key);
            if (idx >= 0) return prev.map((it, j) => j === idx ? { ...it, qty: it.qty + item.qty } : it);
            return [...prev, { productId: item.productId, name: item.name, variant: item.variant ?? "", variantId: item.variantId ?? undefined, price: item.price, qty: item.qty, image: item.image }];
          });
        });
      }
      setMessages(prev => [...prev, {
        role: "assistant", content: data.message, timestamp: new Date(),
        products: data.products, categories: data.categories, orderPlaced: data.orderPlaced,
        type: data.escalateToHuman ? "escalate_human" : (data.showOrderForm ? "order_form" : undefined),
        autoCartAdded: data.autoCart?.length > 0 ? data.autoCart : undefined,
      }]);
      if (data.showOrderForm && !data.escalateToHuman) { setDefaultOrderProduct(""); setShowOrderForm(true); }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry about that! Please try again in a moment.", timestamp: new Date() }]);
    } finally { setIsLoading(false); }
  }, [input, isLoading, sessionId, messages.length]);

  const trackActivity = useCallback((product: Product, variant: ProductVariant | null, price: number, action: "cart_add" | "buy_now" | "order_placed", qty = 1) => {
    const sid = sessionId;
    if (!sid) return;
    fetch("/api/chat/lead/activity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid, productId: product.id, name: product.name, variant: variant?.value, price, qty, action }),
    }).catch(() => {});
  }, [sessionId]);

  const handleAddToCart = useCallback((product: Product, variant: ProductVariant | null, price: number) => {
    setChatCart(prev => {
      const key = `${product.id}-${variant?.id ?? ""}`;
      const idx = prev.findIndex(i => `${i.productId}-${i.variantId ?? ""}` === key);
      if (idx >= 0) return prev.map((it, i) => i === idx ? { ...it, qty: it.qty + 1 } : it);
      return [...prev, { productId: product.id, name: product.name, variant: variant?.value ?? "", variantId: variant?.id, price, qty: 1, image: product.image }];
    });
    trackActivity(product, variant, price, "cart_add");
  }, [trackActivity]);

  const handleViewProduct = useCallback((id: number) => {
    setIsOpen(false);
    setLocation(`/products/${id}`);
  }, [setLocation]);

  const handleOpenForm = () => setShowOrderForm(true);

  const handleVoiceInput = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice input is not supported on this browser. Please use Chrome or Safari."); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.lang = "ur-PK";
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setTimeout(() => sendMessage(transcript), 200);
    };
    recognition.onerror = (e: any) => {
      setIsListening(false);
      if (e.error === "language-not-supported" || e.error === "no-speech") {
        recognition.lang = "en-US";
        try { recognition.start(); } catch {}
      }
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { setIsListening(false); }
  }, [isListening, sendMessage]);

  const handleBuyNow = useCallback((product: Product, variant: ProductVariant | null, price: number) => {
    handleAddToCart(product, variant, price);
    trackActivity(product, variant, price, "buy_now");
    setDefaultOrderProduct(product.name);
    setShowOrderForm(true);
  }, [handleAddToCart, trackActivity]);

  const handleOrderSuccess = (orderNumber: string, orderId: number) => {
    chatCart.forEach(item => {
      if (sessionId) {
        fetch("/api/chat/lead/activity", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, productId: item.productId, name: item.name, variant: item.variant, price: item.price, qty: item.qty, action: "order_placed" }),
        }).catch(() => {});
      }
    });
    setShowOrderForm(false);
    setChatCart([]);
    setMessages(prev => [...prev, { role: "assistant", content: `Your order has been placed!\n\nOrder ID: ${orderNumber}\n\nOur team will confirm shortly. Thank you for choosing KDF Nuts!`, timestamp: new Date(), orderPlaced: { id: orderId, orderNumber } }]);
  };

  const clearChat = () => {
    setMessages([{ role: "assistant", content: WELCOME, timestamp: new Date() }]);
    setSessionId(null);
    setChatCart([]);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CHAT_CART_KEY);
    setShowOrderForm(false);
  };

  const QUICK_CHIPS = [
    { label: "Browse Almonds", action: () => sendMessage("Show me almonds") },
    { label: "Browse Cashews", action: () => sendMessage("Show me cashews") },
    { label: "Delivery Info", action: () => sendMessage("What are your delivery options?") },
    { label: "Place Order", action: handleOpenForm, highlight: true },
    { label: "👤 Human Support", action: () => sendMessage("I need to talk to a real person please"), highlight: false },
  ];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex flex-col overflow-hidden bg-muted animate-in slide-in-from-bottom duration-300 lg:inset-auto lg:bottom-24 lg:right-6 lg:w-[380px] lg:h-[540px] lg:rounded-2xl lg:shadow-2xl lg:border lg:border-border lg:slide-in-from-bottom-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 flex-shrink-0" style={{ background: "linear-gradient(135deg,#5FA800,#4d8a00)", paddingTop: "max(14px, env(safe-area-inset-top, 14px))", paddingBottom: "14px" }}>
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-black text-[#5FA800] text-sm flex-shrink-0">K</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-[15px] leading-tight">24/7 Live Support</p>
              <div className="flex items-center gap-1.5 mt-0.5"><span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse flex-shrink-0" /><p className="text-green-100 text-xs truncate">KDF Nuts Support Team</p></div>
            </div>
            <button onClick={clearChat} className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 active:bg-white/30 mr-1 flex-shrink-0" title="Clear chat"><RotateCcw className="w-3.5 h-3.5 text-white" /></button>
            <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 active:bg-white/30 flex-shrink-0"><X className="w-4 h-4 text-white" /></button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} onAddToCart={handleAddToCart} onViewProduct={handleViewProduct} onOpenForm={handleOpenForm} onViewCategory={(slug) => { setIsOpen(false); setLocation(`/products?category=${slug}`); }} onBuyNow={handleBuyNow} waPhone={waConfig?.phone} />)}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick chips — shown on first message */}
          {messages.length <= 1 && !isLoading && !showOrderForm && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              {QUICK_CHIPS.map(c => (
                <button key={c.label} onClick={c.action}
                  className={`text-xs px-3.5 py-2 rounded-full font-semibold transition-colors ${c.highlight ? "text-white shadow-sm" : "bg-background border border-border text-foreground hover:bg-accent shadow-sm"}`}
                  style={c.highlight ? { backgroundColor: "#5FA800" } : undefined}>
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {/* Cart strip */}
          {chatCart.length > 0 && !showOrderForm && (
            <div className="px-3 py-2 border-t border-green-200/60 flex items-center justify-between gap-2 flex-shrink-0 bg-green-50/80">
              <div className="flex items-center gap-1.5 min-w-0">
                <ShoppingCart className="w-3 h-3 flex-shrink-0" style={{ color: "#5FA800" }} />
                <span className="text-[10px] font-bold truncate" style={{ color: "#5FA800" }}>
                  {chatCart.reduce((s, i) => s + i.qty, 0)} item{chatCart.reduce((s, i) => s + i.qty, 0) !== 1 ? "s" : ""} — Rs. {chatCart.reduce((s, i) => s + i.price * i.qty, 0).toLocaleString()}
                </span>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setChatCart([])} className="text-[9px] text-muted-foreground underline">Clear</button>
                <button onClick={handleOpenForm} className="text-[9px] font-bold text-white px-2 py-1 rounded-full" style={{ backgroundColor: "#5FA800" }}>Checkout →</button>
              </div>
            </div>
          )}
          {/* Input */}
          {messages.length <= 1 && !isLoading && (
            <div className="px-4 py-1.5 flex items-center gap-1.5 border-t" style={{ backgroundColor: "rgba(95,168,0,0.06)", borderColor: "rgba(95,168,0,0.12)" }}>
              <Mic className="w-3 h-3 flex-shrink-0" style={{ color: "#5FA800" }} />
              <p className="text-[10px] font-medium" style={{ color: "#5FA800" }}>Tap mic to speak your order in Urdu or English</p>
            </div>
          )}
          <div className="bg-background border-t border-border px-3 flex gap-2 items-center flex-shrink-0" style={{ paddingTop: "10px", paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))" }}>
            <button onClick={handleVoiceInput} disabled={isLoading}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 flex-shrink-0 ${isListening ? "animate-pulse" : ""}`}
              style={{ backgroundColor: isListening ? "#ef4444" : "#f3f4f6" }}
              title={isListening ? "Stop recording" : "Speak your order (Urdu/English)"}>
              {isListening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-gray-500" />}
            </button>
            <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={isListening ? "Listening… speak now" : "Type or speak your order…"}
              className="flex-1 bg-muted rounded-full px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#5FA800]/30 transition-all text-foreground placeholder:text-muted-foreground"
              disabled={isLoading} />
            <button onClick={() => sendMessage()} disabled={isLoading || !input.trim()} className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 flex-shrink-0" style={{ backgroundColor: "#5FA800" }}>
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Order form overlay */}
          {showOrderForm && <OrderFormPanel defaultProduct={defaultOrderProduct} initialCart={chatCart} sessionId={sessionId} onClose={() => setShowOrderForm(false)} onSuccess={handleOrderSuccess} />}
        </div>
      )}

      {/* Pre-chat Lead Capture Form */}
      {showLeadForm && (
        <div className="fixed inset-0 z-[60] flex items-end justify-end p-4 sm:p-6 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="rounded-2xl shadow-2xl overflow-hidden bg-card border border-border">
              {/* Header */}
              <div className="px-5 pt-5 pb-4 flex items-center gap-3 border-b border-border" style={{ background: "linear-gradient(135deg,#5FA800,#3d7000)" }}>
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-sm">Chat with KDF Plus</p>
                  <p className="text-xs text-white/75">Quick intro so we can help you better</p>
                </div>
                <button onClick={() => setShowLeadForm(false)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Form */}
              <form onSubmit={handleLeadSubmit} className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Your Name <span className="text-red-500">*</span></label>
                  <input
                    required
                    value={leadName}
                    onChange={e => setLeadName(e.target.value)}
                    placeholder="e.g. Ali Hassan"
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-background border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#5FA800]/30 focus:border-[#5FA800] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Phone Number <span className="text-red-500">*</span></label>
                  <input
                    required
                    type="tel"
                    value={leadPhone}
                    onChange={e => setLeadPhone(e.target.value)}
                    placeholder="e.g. 03001234567"
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-background border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#5FA800]/30 focus:border-[#5FA800] transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">Email <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <input
                      type="email"
                      value={leadEmail}
                      onChange={e => setLeadEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-background border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#5FA800]/30 focus:border-[#5FA800] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">City <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <select
                      value={leadCity}
                      onChange={e => setLeadCity(e.target.value)}
                      className="w-full rounded-xl px-3 py-2.5 text-sm bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-[#5FA800]/30 focus:border-[#5FA800] transition-all"
                    >
                      <option value="">Select…</option>
                      {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={leadSubmitting || !leadName.trim() || !leadPhone.trim()}
                  className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-1 flex items-center justify-center gap-2"
                  style={{ backgroundColor: "#5FA800" }}
                >
                  {leadSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                  {leadSubmitting ? "Starting…" : "Start Chat"}
                </button>
                <p className="text-center text-xs text-muted-foreground pb-1">Your info is safe with us. No spam. 🔒</p>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* FAB — hidden on mobile when chat is open, hidden when dismissed */}
      {!dismissed && (
        <div className={`fixed bottom-24 right-4 sm:bottom-6 sm:right-6 z-[500] flex flex-col items-end gap-2 ${isOpen ? 'hidden lg:flex' : ''}`}>
          {isExpanded && !isOpen && (
            <>
              <div className="flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
                <span className="bg-background text-foreground text-xs font-semibold px-2.5 py-1 rounded-full shadow-lg border border-border whitespace-nowrap">Chat with Us</span>
                <button onClick={handleChatOpen} className="w-11 h-11 rounded-full shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" style={{ backgroundColor: "#5FA800" }}>
                  <MessageCircle className="w-5 h-5 text-white" />
                </button>
              </div>
              {waConfig && (
                <div className="flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in duration-150">
                  <span className="bg-background text-foreground text-xs font-semibold px-2.5 py-1 rounded-full shadow-lg border border-border whitespace-nowrap">WhatsApp</span>
                  <button onClick={() => { window.open(`https://wa.me/${waConfig.phone.replace(/\D/g, "")}?text=${encodeURIComponent(waConfig.message)}`, "_blank"); setIsExpanded(false); }} className="w-11 h-11 rounded-full shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" style={{ backgroundColor: "#25D366" }}>
                    {WA_SVG}
                  </button>
                </div>
              )}
            </>
          )}
          <div className="relative">
            {!isOpen && !isExpanded && (
              <button
                onClick={handleDismiss}
                className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center z-10 hover:bg-gray-800 transition-colors"
                title="Hide"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            )}
            <button onClick={() => { if (isOpen) { setIsOpen(false); } else { setIsExpanded(v => !v); } }} className="w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95" style={{ backgroundColor: isOpen || isExpanded ? "#333" : "#5FA800" }}>
              {isOpen || isExpanded ? <X className="w-5 h-5 text-white" /> : <MessageCircle className="w-6 h-6 text-white" />}
            </button>
          </div>
        </div>
      )}

      {isExpanded && !isOpen && !dismissed && <div className="fixed inset-0 z-40" onClick={() => setIsExpanded(false)} />}
    </>
  );
}
