import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, MessageCircle, RotateCcw, ChevronDown, Loader2, ShoppingBag, AlertCircle, ShoppingCart, Eye, Tag, Gift, ClipboardList, CreditCard, Truck, ExternalLink, Zap, Mic, MicOff, MapPin, Search, Plus, Package } from "lucide-react";
import { useLocation } from "wouter";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
const SESSION_KEY = "kdfnuts_chat_session";
const CHAT_CART_KEY = "kdfnuts_chat_cart";
const LEAD_KEY = "kdfnuts_lead";
const CITIES = ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta", "Sialkot", "Gujranwala", "Hyderabad", "Abbottabad", "Bahawalpur", "Sargodha", "Other"];

function getImageUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.startsWith("http")) return key;
  return `${BASE_URL}api/storage/objects/${key}`;
}

const WA_SVG = (
  <svg viewBox="0 0 24 24" fill="white" width={26} height={26}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const WELCOME = "Hi! Welcome to KDF Nuts. I'm here to help you 24/7 — products, prices, or placing an order. How can I help?";

interface ProductVariant {
  id: string; name: string; value: string; price?: number; stock: number;
}
interface Product {
  id: number; name: string; price: number; originalPrice?: number | null; discount?: number | null;
  stock: number; variants: ProductVariant[]; image?: string | null;
  badge?: string | null; orderCount?: number;
}
interface ChatCartItem {
  productId: number; name: string; variant: string; variantId?: string; price: number; qty: number; image?: string | null;
}
interface TemplateMetadata {
  id?: number; name?: string; slug?: string; price?: number; originalPrice?: number; discount?: number; image?: string;
  code?: string; discountPercent?: number; minOrder?: number; title?: string; description?: string; color?: string;
  url?: string; amount?: number;
  orderNumber?: string; trackingNumber?: string; courierName?: string;
  products?: Product[];
  stock?: number; variants?: ProductVariant[];
}
interface AutoCartItem {
  productId: number; name: string; variant?: string | null; variantId?: string | null; price: number; qty: number; image?: string | null;
}
interface ChatMessage {
  role: "user" | "assistant" | "admin"; content: string; timestamp: Date;
  products?: Product[];
  categories?: { id: number; name: string; slug: string; image?: string | null }[];
  orderPlaced?: { id: number; orderNumber: string };
  type?: "product" | "category" | "coupon" | "offer" | "order_form" | "multi_product" | "payment_link" | "tracking_link" | "escalate_human";
  metadata?: TemplateMetadata;
  autoCartAdded?: AutoCartItem[];
}
interface OrderForm {
  product: string; qty: number; name: string; phone: string; city: string; cityCustom: string; address: string; notes: string;
}

function ProductImg({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [err, setErr] = useState(false);
  const url = getImageUrl(src);
  if (!url || err) return <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-100 to-emerald-200 text-3xl">🥜</div>;
  return <img src={url} alt={alt} className="w-full h-full object-cover" onError={() => setErr(true)} />;
}

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
    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 mb-2">
      <div className="relative h-36">
        <ProductImg src={product.image} alt={product.name} />
        {product.discount && product.discount > 0 && <span className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{product.discount}% OFF</span>}
        {product.badge && !product.discount && (
          <span className={`absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm ${product.badge === "Best Seller" ? "bg-orange-500" : product.badge === "Most Popular" || product.badge === "Popular" ? "bg-blue-500" : "bg-purple-500"}`}>
            {product.badge === "Best Seller" ? "🔥 Best Seller" : product.badge === "Most Popular" || product.badge === "Popular" ? "⭐ Popular" : "📈 Trending"}
          </span>
        )}
        {!isInStock && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="text-white text-xs font-bold bg-black/60 px-2 py-1 rounded">Out of Stock</span></div>}
      </div>
      <div className="p-3">
        <p className="font-bold text-gray-900 text-sm truncate mb-1.5">{product.name}</p>
        {hasVariants && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {product.variants.map(v => {
              const vPrice = v.price ?? product.price;
              const isSelected = selectedVariant?.id === v.id;
              return (
                <button key={v.id} onClick={() => setSelectedVariant(v)}
                  className={`flex flex-col items-center px-2.5 py-1.5 rounded-xl border-2 font-semibold transition-all active:scale-95 min-w-[54px] ${isSelected ? "text-white border-transparent shadow-sm" : "bg-white border-gray-200 text-gray-600"}`}
                  style={isSelected ? { backgroundColor: "#5FA800", borderColor: "#5FA800" } : undefined}>
                  <span className="text-[11px] font-bold">{v.value}</span>
                  {v.price != null && <span className={`text-[9px] mt-0.5 font-medium ${isSelected ? "text-green-100" : "text-gray-400"}`}>Rs.{vPrice.toLocaleString()}</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-1.5 mb-2.5">
          <span className="font-bold text-[#5FA800] text-sm">Rs. {currentPrice.toLocaleString()}</span>
          {product.originalPrice && product.originalPrice > currentPrice && <span className="text-gray-400 text-xs line-through">Rs. {product.originalPrice.toLocaleString()}</span>}
          {!isInStock && <span className="text-[10px] text-red-500 font-semibold ml-auto">Out of stock</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => onView(product.id)} className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 active:bg-gray-50">
            <Eye className="w-3 h-3" />View
          </button>
          {isInStock && (
            <button onClick={() => onAddToCart(product, selectedVariant, currentPrice)} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-white text-xs font-bold active:opacity-90" style={{ backgroundColor: "#5FA800" }}>
              <ShoppingCart className="w-3 h-3" />Add
            </button>
          )}
        </div>
        {isInStock && onBuyNow && (
          <button onClick={() => onBuyNow(product, selectedVariant, currentPrice)} className="w-full mt-2 flex items-center justify-center gap-1 py-2 rounded-xl text-white text-xs font-bold active:opacity-90" style={{ backgroundColor: "#F58300" }}>
            <Zap className="w-3 h-3" />Buy Now
          </button>
        )}
      </div>
    </div>
  );
}

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

function PaymentLinkCard({ meta }: { meta: TemplateMetadata }) {
  return (
    <div className="bg-white border border-violet-200 rounded-xl overflow-hidden shadow-sm mb-2 max-w-[90%]">
      <div className="px-3 py-2.5 text-white" style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
        <div className="flex items-center gap-1.5 mb-1"><CreditCard className="w-4 h-4" /><span className="text-xs font-bold uppercase tracking-wider">Payment Link</span></div>
        {meta.amount && <p className="text-xl font-black">Rs. {Number(meta.amount).toLocaleString()}</p>}
      </div>
      <div className="p-3">
        {meta.title && <p className="text-sm font-semibold text-gray-800 mb-2">{meta.title}</p>}
        {meta.url && (
          <a href={meta.url} target="_blank" rel="noopener noreferrer"
            className="w-full py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 active:opacity-90"
            style={{ backgroundColor: "#7c3aed" }}>
            <ExternalLink className="w-3 h-3" /> Pay Securely Now
          </a>
        )}
      </div>
    </div>
  );
}

function TrackingLinkCard({ meta }: { meta: TemplateMetadata }) {
  return (
    <div className="bg-white border border-sky-200 rounded-xl overflow-hidden shadow-sm mb-2 max-w-[90%]">
      <div className="px-3 py-2.5 text-white" style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)" }}>
        <div className="flex items-center gap-1.5 mb-1"><Truck className="w-4 h-4" /><span className="text-xs font-bold uppercase tracking-wider">Order Tracking</span></div>
        {meta.orderNumber && <p className="text-sm font-bold font-mono">{meta.orderNumber}</p>}
      </div>
      <div className="p-3 space-y-2">
        {meta.courierName && <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-gray-500">COURIER</span><span className="text-xs font-semibold">{meta.courierName}</span></div>}
        {meta.trackingNumber && (
          <div className="bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1.5">
            <p className="text-[10px] font-bold text-sky-600 mb-0.5">TRACKING NO.</p>
            <p className="font-mono font-bold text-sm text-gray-800">{meta.trackingNumber}</p>
          </div>
        )}
        {meta.url && (
          <a href={meta.url} target="_blank" rel="noopener noreferrer"
            className="w-full py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 active:opacity-90"
            style={{ backgroundColor: "#0ea5e9" }}>
            <ExternalLink className="w-3 h-3" /> Track My Order
          </a>
        )}
      </div>
    </div>
  );
}

function CouponCard({ meta }: { meta: TemplateMetadata }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(meta.code ?? "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <div className="border-2 border-dashed border-[#5FA800] rounded-xl overflow-hidden bg-green-50 mb-2">
      <div className="px-3 py-2 flex items-center justify-between" style={{ background: "linear-gradient(135deg,#5FA800,#4d8a00)" }}>
        <div className="flex items-center gap-1.5 text-white"><Tag className="w-3.5 h-3.5" /><span className="text-xs font-bold uppercase tracking-wider">Special Offer</span></div>
        {meta.discountPercent && <span className="bg-white text-[#5FA800] text-sm font-black px-2.5 py-0.5 rounded-full">{meta.discountPercent}% OFF</span>}
      </div>
      <div className="px-3 py-2.5">
        {meta.name && <p className="text-sm font-bold text-gray-800 mb-0.5">{meta.name}</p>}
        {meta.description && <p className="text-xs text-gray-600 mb-2">{meta.description}</p>}
        {meta.minOrder && <p className="text-[10px] text-gray-500 mb-2">Min. order Rs. {meta.minOrder.toLocaleString()}</p>}
        <button onClick={copy} className="w-full py-2.5 rounded-xl border-2 border-dashed border-[#5FA800] text-[#5FA800] font-mono font-bold text-sm flex items-center justify-center gap-2 active:bg-[#5FA800]/5">
          {meta.code}
          <span className="text-[10px] bg-[#5FA800] text-white px-2 py-0.5 rounded-full font-semibold">{copied ? "Copied!" : "Tap"}</span>
        </button>
      </div>
    </div>
  );
}

function CategoryCard({ meta, onView }: { meta: TemplateMetadata; onView: (slug: string) => void }) {
  const [imgErr, setImgErr] = useState(false);
  const imgUrl = getImageUrl(meta.image);
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 mb-2">
      <div className="relative h-24 bg-gradient-to-br from-teal-50 to-emerald-100">
        {imgUrl && !imgErr
          ? <img src={imgUrl} alt={meta.name ?? ""} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          : <div className="w-full h-full flex items-center justify-center text-4xl">🗂️</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <p className="absolute bottom-2 left-3 text-white font-bold text-sm drop-shadow">{meta.name}</p>
      </div>
      <div className="p-3">
        <button onClick={() => onView(meta.slug ?? "")} className="w-full py-2 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 active:opacity-90" style={{ backgroundColor: "#5FA800" }}>
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
        <div className="flex items-center gap-2 mb-1"><Gift className="w-4 h-4" /><span className="text-xs font-bold uppercase tracking-wider">{meta.title ?? "Special Offer"}</span></div>
        <p className="text-sm leading-relaxed font-medium">{content}</p>
      </div>
    </div>
  );
}

function OrderFormPromptCard({ onOpenForm }: { onOpenForm: () => void }) {
  return (
    <div className="border border-[#5FA800]/30 bg-green-50 rounded-xl p-3 mb-2">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-8 h-8 rounded-xl bg-[#5FA800] flex items-center justify-center flex-shrink-0"><ClipboardList className="w-4 h-4 text-white" /></div>
        <div><p className="font-bold text-gray-800 text-sm">Place Your Order</p><p className="text-[10px] text-gray-500">Fill in your details and we'll confirm shortly</p></div>
      </div>
      <button onClick={onOpenForm} className="w-full py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 active:opacity-90" style={{ backgroundColor: "#5FA800" }}>
        <ShoppingBag className="w-4 h-4" />Open Order Form
      </button>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 mb-3">
      <div className="w-7 h-7 rounded-full bg-[#5FA800] flex items-center justify-center flex-shrink-0 font-bold text-white text-xs">K</div>
      <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100">
        <div className="flex gap-1 items-center h-4">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

function OrderSuccessBanner({ orderNumber }: { orderNumber: string }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-2 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 text-white font-bold text-sm">✓</div>
      <div><p className="font-bold text-green-800 text-sm">Order Placed!</p><p className="text-green-700 text-xs font-mono">{orderNumber}</p></div>
    </div>
  );
}

function HumanEscalationCard({ waPhone }: { waPhone?: string }) {
  const waUrl = waPhone
    ? `https://wa.me/${waPhone.replace(/\D/g, "")}?text=${encodeURIComponent("Hello! I need help with my KDF Nuts order.")}`
    : `https://wa.me/?text=${encodeURIComponent("Hello! I need help with my KDF Nuts order.")}`;
  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 max-w-[92%] shadow-sm">
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
    <div className="rounded-2xl border border-[#5FA800]/30 bg-[#5FA800]/5 px-3 py-2.5 max-w-[92%] shadow-sm mt-1">
      <div className="flex items-center gap-1.5 mb-2">
        <ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5FA800" }} />
        <p className="text-xs font-bold" style={{ color: "#5FA800" }}>Added to cart automatically!</p>
      </div>
      <div className="space-y-1 mb-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-gray-700 font-medium">{item.name}{item.variant ? ` (${item.variant})` : ""} ×{item.qty}</span>
            <span className="font-bold" style={{ color: "#5FA800" }}>Rs.{(item.price * item.qty).toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-1.5 border-t border-[#5FA800]/15">
        <span className="text-xs font-bold text-gray-700">Total: Rs.{total.toLocaleString()}</span>
        <button onClick={onCheckout} className="text-[10px] font-bold text-white px-3 py-1.5 rounded-full active:opacity-80" style={{ backgroundColor: "#5FA800" }}>Checkout →</button>
      </div>
    </div>
  );
}

function MessageBubble({ msg, onAddToCart, onViewProduct, onOpenForm, onViewCategory, onBuyNow, waPhone }: {
  msg: ChatMessage; onAddToCart: (p: Product, variant: ProductVariant | null, price: number) => void; onViewProduct: (id: number) => void; onOpenForm: () => void; onViewCategory: (slug: string) => void;
  onBuyNow?: (p: Product, variant: ProductVariant | null, price: number) => void;
  waPhone?: string;
}) {
  if (msg.role === "user") {
    return <div className="flex justify-end mb-3"><div className="bg-[#5FA800] text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[78%] shadow-sm"><p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p></div></div>;
  }

  const isAdmin = msg.role === "admin";

  const renderTemplate = () => {
    if (!msg.type) return null;
    if (msg.type === "product" && msg.metadata) {
      const p: Product = { id: msg.metadata.id ?? 0, name: msg.metadata.name ?? "", price: msg.metadata.price ?? 0, originalPrice: msg.metadata.originalPrice, discount: msg.metadata.discount, stock: msg.metadata.stock ?? 1, variants: msg.metadata.variants ?? [], image: msg.metadata.image };
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
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-xs ${isAdmin ? "bg-blue-600" : "bg-[#5FA800]"}`}>{isAdmin ? "S" : "K"}</div>
      <div className="flex-1 min-w-0">
        {isAdmin && <p className="text-[9px] font-semibold text-blue-600 mb-0.5 ml-1 uppercase tracking-wider">Support Team</p>}
        {msg.orderPlaced && <OrderSuccessBanner orderNumber={msg.orderPlaced.orderNumber} />}
        {renderTemplate() ?? (
          <div className={`rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[92%] inline-block shadow-sm ${isAdmin ? "bg-blue-50 border border-blue-100" : "bg-white border border-gray-100"}`}>
            <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isAdmin ? "text-blue-900" : "text-gray-800"}`}>{msg.content}</p>
          </div>
        )}
        {msg.autoCartAdded && msg.autoCartAdded.length > 0 && (
          <AutoCartBanner items={msg.autoCartAdded} onCheckout={onOpenForm} />
        )}
        {msg.products && msg.products.length > 0 && (
          <div className="mt-2 max-w-[92%] grid grid-cols-2 gap-2">
            {msg.products.map(p => <ProductCard key={p.id} product={p} onAddToCart={onAddToCart} onView={onViewProduct} onBuyNow={onBuyNow} />)}
          </div>
        )}
        {msg.categories && msg.categories.length > 0 && (
          <div className="mt-2 max-w-[92%] grid grid-cols-2 gap-2">
            {msg.categories.map(c => <CategoryCard key={c.id} meta={{ id: c.id, name: c.name, slug: c.slug, image: c.image ?? undefined }} onView={onViewCategory} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Types for new order form ─── */
interface ShopifyProductForForm {
  id: number; name: string; price: number; originalPrice: number | null; discount: number | null;
  stock: number; variants: Array<{ id: string; value: string; price: number; stock: number }>;
  image: string | null;
}

/* ─── Product Search Sheet (slide-in fullscreen search) ─── */
function ProductSearchSheet({ onSelect, onClose }: { onSelect: (p: ShopifyProductForForm) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShopifyProductForForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 120); }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${BASE_URL}api/chat/products/search?q=${encodeURIComponent(query)}&limit=12`);
        if (r.ok) { const d = await r.json(); setResults(d.products ?? []); }
      } catch {} finally { setLoading(false); }
    }, 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    recRef.current = new SR(); recRef.current.lang = "ur-PK"; recRef.current.interimResults = false;
    recRef.current.onresult = (e: any) => { setQuery(e.results[0][0].transcript); setListening(false); };
    recRef.current.onerror = () => setListening(false);
    recRef.current.onend = () => setListening(false);
    recRef.current.start(); setListening(true);
  };
  const stopVoice = () => { recRef.current?.stop(); setListening(false); };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#F0F2F5]">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 bg-white border-b border-gray-100 shadow-sm flex-shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 flex-shrink-0">
          <ChevronDown className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-2xl px-3 py-2.5">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search: badam, pista, kaju, almonds…"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none" />
          {loading && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: "#5FA800" }} />}
        </div>
        <button onMouseDown={startVoice} onMouseUp={stopVoice} onTouchStart={startVoice} onTouchEnd={stopVoice}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${listening ? "bg-red-500 shadow-lg shadow-red-200 animate-pulse" : "bg-gray-100"}`}>
          {listening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-gray-500" />}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!query.trim() && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
            <Search className="w-12 h-12 text-gray-200" />
            <p className="text-gray-500 font-semibold">Search from 300+ dry fruits</p>
            <p className="text-gray-400 text-sm">Type a product name or tap the mic to speak in Urdu/English</p>
          </div>
        )}
        {query.trim() && !loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Package className="w-10 h-10 text-gray-200" />
            <p className="text-gray-400 text-sm">No products found for "{query}"</p>
          </div>
        )}
        <div className="px-3 py-3 space-y-2">
          {results.map(p => (
            <button key={p.id} onClick={() => onSelect(p)}
              className="w-full bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex gap-3 items-center active:scale-[0.98] transition-transform text-left">
              {p.image ? (
                <img src={p.image} alt={p.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center text-xl font-bold bg-[#5FA800]/10" style={{ color: "#5FA800" }}>{p.name[0]}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm leading-snug line-clamp-2">{p.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-bold text-sm" style={{ color: "#5FA800" }}>Rs. {p.price.toLocaleString()}</span>
                  {p.discount && p.discount > 0 && <span className="text-[10px] font-bold bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full">{p.discount}% OFF</span>}
                </div>
                {p.variants.length > 1 && <p className="text-[11px] text-gray-400 mt-0.5">{p.variants.length} sizes available</p>}
              </div>
              <Plus className="w-5 h-5 flex-shrink-0" style={{ color: "#5FA800" }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Variant Picker Sheet (bottom sheet) ─── */
function VariantPickerSheet({ product, onConfirm, onClose }: {
  product: ShopifyProductForForm; onConfirm: (item: ChatCartItem) => void; onClose: () => void;
}) {
  const hasVariants = product.variants.length > 1;
  const [selected, setSelected] = useState<ShopifyProductForForm["variants"][0] | null>(hasVariants ? null : product.variants[0] ?? null);
  const [qty, setQty] = useState(1);
  const price = selected?.price ?? product.price;

  return (
    <div className="absolute inset-0 z-30 flex items-end" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1" />
        <div className="flex gap-3 px-4 py-3 border-b border-gray-100">
          {product.image && <img src={product.image} alt={product.name} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 bg-gray-100" />}
          <div className="flex-1 min-w-0 py-1">
            <p className="font-bold text-gray-900 text-sm leading-snug line-clamp-2">{product.name}</p>
            <p className="font-bold text-base mt-1" style={{ color: "#5FA800" }}>Rs. {price.toLocaleString()}</p>
            {product.discount && product.discount > 0 && <span className="text-[10px] font-bold bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full">{product.discount}% OFF</span>}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 self-start mt-1"><X className="w-3.5 h-3.5 text-gray-500" /></button>
        </div>
        <div className="px-4 py-4 space-y-4 max-h-72 overflow-y-auto">
          {hasVariants && (
            <div>
              <p className="text-[11px] font-bold text-gray-400 tracking-wider mb-2">SELECT SIZE / WEIGHT</p>
              <div className="grid grid-cols-3 gap-2">
                {product.variants.map(v => (
                  <button key={v.id} onClick={() => setSelected(v)}
                    disabled={v.stock === 0}
                    className={`py-2.5 px-2 rounded-xl border-2 text-center transition-all disabled:opacity-40 ${selected?.id === v.id ? "border-[#5FA800] bg-[#f0f9e8]" : "border-gray-200 bg-white active:border-gray-300"}`}>
                    <p className="text-xs font-bold text-gray-800">{v.value}</p>
                    <p className="text-[11px] font-semibold mt-0.5" style={{ color: "#5FA800" }}>Rs. {v.price.toLocaleString()}</p>
                    {v.stock === 0 && <p className="text-[9px] text-red-400 font-semibold">Out of stock</p>}
                    {v.stock > 0 && v.stock < 10 && <p className="text-[9px] text-amber-500 font-semibold">Only {v.stock} left</p>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-gray-400 tracking-wider">QUANTITY</p>
            <div className="flex items-center gap-3">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-9 h-9 rounded-full border-2 border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 active:bg-gray-50">−</button>
              <span className="w-8 text-center font-bold text-gray-900 text-lg">{qty}</span>
              <button onClick={() => setQty(q => q + 1)} className="w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold text-white active:opacity-80" style={{ backgroundColor: "#5FA800" }}>+</button>
            </div>
          </div>
          <div className="bg-[#f0f9e8] rounded-2xl p-3 flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-700">Subtotal ({qty} item{qty > 1 ? "s" : ""})</span>
            <span className="text-lg font-bold" style={{ color: "#5FA800" }}>Rs. {(price * qty).toLocaleString()}</span>
          </div>
        </div>
        <div className="px-4 pt-1 pb-6">
          <button onClick={() => onConfirm({ name: product.name, variant: selected?.value ?? "", variantId: selected?.id ?? "", price, qty, image: product.image ?? undefined })}
            disabled={hasVariants && !selected}
            className="w-full py-4 rounded-2xl text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all shadow-[0_4px_14px_rgba(95,168,0,0.3)]"
            style={{ backgroundColor: "#5FA800" }}>
            <ShoppingCart className="w-5 h-5" />
            {hasVariants && !selected ? "Select a size to continue" : `Add to Cart — Rs. ${(price * qty).toLocaleString()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Full-Screen Order Form ── */
function OrderFormScreen({ initialCart, sessionId, onClose, onSuccess }: {
  defaultProduct: string; initialCart?: ChatCartItem[]; sessionId: string | null;
  onClose: () => void; onSuccess: (orderNumber: string, orderId: number) => void;
}) {
  const [localCart, setLocalCart] = useState<ChatCartItem[]>(initialCart ?? []);
  const [form, setForm] = useState({ name: "", phone: "", city: "", cityCustom: "", address: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [isDetectingLoc, setIsDetectingLoc] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [pickerProduct, setPickerProduct] = useState<ShopifyProductForForm | null>(null);
  const set = (k: string, v: string) => { setForm(f => ({ ...f, [k]: v })); setSubmitError(null); };

  const updateCartQty = (idx: number, qty: number) => { if (qty < 1) return; setLocalCart(c => c.map((it, i) => i === idx ? { ...it, qty } : it)); };
  const removeCartItem = (idx: number) => setLocalCart(c => c.filter((_, i) => i !== idx));
  const cartTotal = localCart.reduce((s, i) => s + i.price * i.qty, 0);
  const totalItems = localCart.reduce((s, i) => s + i.qty, 0);

  const detectLocation = () => {
    if (!navigator.geolocation) { setLocError("Location not supported on this device"); return; }
    setIsDetectingLoc(true); setLocError(null);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude: lat, longitude: lng } = pos.coords;
        const res = await fetch(`${BASE_URL}api/locations/geocode`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng }) });
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

  const v1 = () => { const e: Record<string, string> = {}; if (localCart.length === 0) e.cart = "Please add at least one product to your order"; setErrors(e); return !Object.keys(e).length; };
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
    setIsSubmitting(true); setSubmitError(null);
    try {
      const city = form.city === "Other" ? form.cityCustom : form.city;
      const items = localCart.map(i => ({ name: i.name, variant: i.variant, variantId: i.variantId, price: i.price, qty: i.qty }));
      const r = await fetch(`${BASE_URL}api/chat/direct-order`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, items, name: form.name.trim(), phone: form.phone.trim(), city, address: form.address.trim(), notes: form.notes.trim() }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Order failed. Please try again.");
      onSuccess(data.orderNumber, data.orderId);
    } catch (e: any) { setSubmitError(e.message); } finally { setIsSubmitting(false); }
  };

  const Err = ({ f }: { f: string }) => errors[f] ? <p className="text-red-500 text-[11px] mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors[f]}</p> : null;
  const inputCls = "w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#5FA800] bg-white shadow-sm";

  return (
    <div className="fixed inset-0 z-[210] flex flex-col bg-[#F0F2F5]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 flex-shrink-0" style={{ background: "linear-gradient(135deg,#5FA800,#4d8a00)", paddingTop: "max(16px,env(safe-area-inset-top,16px))", paddingBottom: "14px" }}>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center active:bg-white/30"><ChevronDown className="w-5 h-5 text-white" /></button>
        <div className="flex-1">
          <p className="font-bold text-white text-base">{step === 1 ? "Your Order" : "Delivery Details"}</p>
          <p className="text-green-100 text-xs">Step {step} of 2{step === 1 && totalItems > 0 ? ` · ${totalItems} item${totalItems > 1 ? "s" : ""}` : ""}</p>
        </div>
        <div className="flex gap-1.5">
          <div className={`h-1.5 w-10 rounded-full ${step >= 1 ? "bg-white" : "bg-white/30"}`} />
          <div className={`h-1.5 w-10 rounded-full ${step >= 2 ? "bg-white" : "bg-white/30"}`} />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 relative">
        {step === 1 ? (
          <>
            {localCart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <ShoppingCart className="w-14 h-14 text-gray-200" />
                <p className="text-gray-500 font-bold">Your cart is empty</p>
                <p className="text-gray-400 text-sm text-center">Search and add products below to place your order</p>
              </div>
            ) : (
              <div className="space-y-2">
                {localCart.map((item, idx) => (
                  <div key={idx} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex gap-3 items-start">
                    {item.image && <img src={getImageUrl(item.image) ?? ""} alt={item.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0 bg-gray-100" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 flex-1">{item.name}</p>
                        <button onClick={() => removeCartItem(idx)} className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center text-red-400 text-xs flex-shrink-0 active:bg-red-100 ml-1">✕</button>
                      </div>
                      {item.variant && <span className="inline-block text-[10px] font-bold text-white px-2 py-0.5 rounded-full mt-0.5" style={{ backgroundColor: "#5FA800" }}>{item.variant}</span>}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                          <button onClick={() => updateCartQty(idx, item.qty - 1)} className="w-8 h-8 flex items-center justify-center font-bold text-gray-600 text-lg active:bg-gray-200">−</button>
                          <span className="w-8 text-center font-bold text-gray-900 text-sm">{item.qty}</span>
                          <button onClick={() => updateCartQty(idx, item.qty + 1)} className="w-8 h-8 flex items-center justify-center font-bold text-gray-600 text-lg active:bg-gray-200">+</button>
                        </div>
                        <span className="font-bold text-sm" style={{ color: "#5FA800" }}>Rs. {(item.price * item.qty).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Err f="cart" />

            {/* Add more button */}
            <button onClick={() => setShowSearch(true)}
              className="w-full py-3.5 rounded-2xl border-2 border-dashed font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              style={{ borderColor: "#5FA800", color: "#5FA800", backgroundColor: "#f0f9e8" }}>
              <Plus className="w-4 h-4" />
              {localCart.length === 0 ? "Search & Add Products" : "Add More Items"}
            </button>

            {/* Cart total */}
            {localCart.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal ({totalItems} item{totalItems > 1 ? "s" : ""})</span>
                  <span className="font-semibold text-gray-700">Rs. {cartTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Delivery charges</span>
                  <span className="font-semibold text-green-600">Free</span>
                </div>
                <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
                  <span className="font-bold text-gray-900">Order Total</span>
                  <span className="text-xl font-bold" style={{ color: "#5FA800" }}>Rs. {cartTotal.toLocaleString()}</span>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-gray-500 mb-1.5 block">Order Notes (optional)</label>
              <textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any special requests..." rows={2} className={`${inputCls} resize-none`} />
            </div>
          </>
        ) : (
          <>
            <button type="button" onClick={detectLocation} disabled={isDetectingLoc}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed font-semibold text-sm transition-all active:scale-95 disabled:opacity-60"
              style={{ borderColor: "#5FA800", color: "#5FA800", backgroundColor: "#f0f9e8" }}>
              {isDetectingLoc ? <><Loader2 className="w-4 h-4 animate-spin" />Detecting your location…</> : <><MapPin className="w-4 h-4" />Auto-detect my address</>}
            </button>
            {locError && <p className="text-xs text-amber-600 -mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{locError}</p>}
            <div><label className="text-xs font-bold text-gray-500 mb-1.5 block">Full Name *</label><input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Your full name" className={inputCls} /><Err f="name" /></div>
            <div><label className="text-xs font-bold text-gray-500 mb-1.5 block">Phone Number *</label><input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="03XX XXXXXXX" className={inputCls} /><Err f="phone" /></div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1.5 block">City *</label>
              <div className="relative"><select value={form.city} onChange={e => set("city", e.target.value)} className={`${inputCls} appearance-none pr-8`}><option value="">Select city…</option>{CITIES.map(c => <option key={c} value={c}>{c}</option>)}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" /></div>
              <Err f="city" />
              {form.city === "Other" && <><input value={form.cityCustom} onChange={e => set("cityCustom", e.target.value)} placeholder="Enter your city" className={`mt-2 ${inputCls}`} /><Err f="cityCustom" /></>}
            </div>
            <div><label className="text-xs font-bold text-gray-500 mb-1.5 block">Complete Address *</label><textarea value={form.address} onChange={e => set("address", e.target.value)} placeholder="House/flat, street, area..." rows={3} className={`${inputCls} resize-none`} /><Err f="address" /></div>
            {/* Order summary recap */}
            <div className="bg-[#f0f9e8] rounded-2xl p-3 border border-green-100">
              <p className="text-[11px] font-bold text-gray-400 tracking-wider mb-2">ORDER SUMMARY</p>
              {localCart.map((item, i) => (
                <div key={i} className="flex justify-between text-xs text-gray-700 py-0.5">
                  <span className="truncate flex-1 pr-2">{item.name}{item.variant ? ` (${item.variant})` : ""} ×{item.qty}</span>
                  <span className="font-bold flex-shrink-0" style={{ color: "#5FA800" }}>Rs. {(item.price * item.qty).toLocaleString()}</span>
                </div>
              ))}
              <div className="border-t border-green-200 mt-2 pt-2 flex justify-between font-bold text-sm">
                <span>Total</span><span style={{ color: "#5FA800" }}>Rs. {cartTotal.toLocaleString()}</span>
              </div>
            </div>
          </>
        )}

        {/* Overlays */}
        {showSearch && <ProductSearchSheet onSelect={p => { setPickerProduct(p); setShowSearch(false); }} onClose={() => setShowSearch(false)} />}
        {pickerProduct && <VariantPickerSheet product={pickerProduct} onConfirm={item => { setLocalCart(c => [...c, item]); setPickerProduct(null); }} onClose={() => setPickerProduct(null)} />}
      </div>

      {/* Sticky footer */}
      <div className="bg-white border-t border-gray-100 px-4 flex-shrink-0" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom,0px))" }}>
        {submitError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-2xl px-3 py-2.5 mt-3 mb-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 font-medium">{submitError}</p>
          </div>
        )}
        <div className="flex gap-3 pt-3 pb-1">
          {step === 2 && <button onClick={() => { setStep(1); setSubmitError(null); }} className="px-5 py-3.5 rounded-2xl border-2 border-gray-200 text-gray-700 font-semibold text-sm">Back</button>}
          <button onClick={step === 1 ? () => { if (v1()) setStep(2); } : submit} disabled={isSubmitting}
            className="flex-1 py-3.5 rounded-2xl text-white font-bold text-[15px] flex items-center justify-center gap-2 shadow-[0_3px_12px_rgba(95,168,0,0.30)] disabled:opacity-60 active:scale-[0.98] transition-transform"
            style={{ backgroundColor: "#5FA800" }}>
            {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" />Placing…</>
              : step === 1 ? `Continue${totalItems > 0 ? ` (${totalItems} item${totalItems > 1 ? "s" : ""})` : ""} →`
              : <><ShoppingBag className="w-5 h-5" />Place Order · Rs. {cartTotal.toLocaleString()}</>}
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [defaultOrderProduct, setDefaultOrderProduct] = useState("");
  const [chatCart, setChatCart] = useState<ChatCartItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(false);
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
      setIsChatOpen(true);
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
      const newSessionId = sessionId ?? `kdfnuts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (!sessionId) setSessionId(newSessionId);
      await fetch(`${BASE_URL}api/chat/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leadName.trim(),
          phone: leadPhone.trim(),
          email: leadEmail.trim() || undefined,
          city: leadCity || undefined,
          source: "kdf_nuts",
          sessionId: newSessionId,
          visitSource: document.referrer || undefined,
          deviceInfo: { userAgent: navigator.userAgent, language: navigator.language },
        }),
      });
      localStorage.setItem(LEAD_KEY, JSON.stringify({ name: leadName.trim(), phone: leadPhone.trim(), submitted: true }));
    } catch {}
    setLeadSubmitting(false);
    setShowLeadForm(false);
    setIsChatOpen(true);
  };

  useEffect(() => {
    fetch(`${BASE_URL}api/whatsapp/chat-config`).then(r => r.json()).then(d => { if (d?.enabled && d.phone) setWaConfig({ phone: d.phone, message: d.message }); }).catch(() => {});
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
    if (isChatOpen) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [messages, isLoading, isChatOpen]);

  useEffect(() => {
    if (isChatOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
      if (messages.length === 0) setMessages([{ role: "assistant", content: WELCOME, timestamp: new Date() }]);
    }
  }, [isChatOpen]);

  /* Poll for admin messages */
  useEffect(() => {
    if (isChatOpen && sessionId) {
      msgCountRef.current = messages.length;
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`${BASE_URL}api/chat/session/${sessionId}`);
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
  }, [isChatOpen, sessionId]);

  const sendMessage = useCallback(async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || isLoading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userText, timestamp: new Date() }]);
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}api/chat/message`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, message: userText }) });
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
    fetch(`${BASE_URL}api/chat/lead/activity`, {
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

  const handleViewProduct = useCallback((id: number, slug?: string) => {
    setIsChatOpen(false);
    setLocation(`/products/${slug || id}`);
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
        fetch(`${BASE_URL}api/chat/lead/activity`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, productId: item.productId, name: item.name, variant: item.variant, price: item.price, qty: item.qty, action: "order_placed" }),
        }).catch(() => {});
      }
    });
    setShowOrderForm(false);
    setChatCart([]);
    setMessages(prev => [...prev, { role: "assistant", content: `Your order has been placed!\n\nOrder ID: ${orderNumber}\n\nOur team will confirm shortly. Thank you!`, timestamp: new Date(), orderPlaced: { id: orderId, orderNumber } }]);
  };

  const clearChat = () => {
    setSessionId(null);
    setChatCart([]);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CHAT_CART_KEY);
    setMessages([{ role: "assistant", content: WELCOME, timestamp: new Date() }]);
  };

  const QUICK_CHIPS = [
    { label: "Browse Almonds", action: () => sendMessage("Show me almonds") },
    { label: "Browse Cashews", action: () => sendMessage("Show me cashews") },
    { label: "Delivery Info", action: () => sendMessage("What are your delivery options?") },
    { label: "Place Order", action: handleOpenForm, highlight: true },
    { label: "👤 Human Support", action: () => sendMessage("I need to talk to a real person please"), highlight: false },
  ];

  const closeChat = () => setIsChatOpen(false);

  const ChatPanel = isChatOpen && !showOrderForm ? (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#F0F2F5] animate-in slide-in-from-bottom duration-300">
      <div className="flex items-center gap-3 px-4 flex-shrink-0" style={{ background: "linear-gradient(135deg,#5FA800,#4d8a00)", paddingTop: "env(safe-area-inset-top, 12px)", paddingBottom: "12px" }}>
        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-black text-[#5FA800] text-sm flex-shrink-0">K</div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-[15px] leading-tight">24/7 Live Support</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse flex-shrink-0" />
            <p className="text-green-100 text-xs truncate">KDF Nuts Support Team</p>
          </div>
        </div>
        <button onClick={clearChat} className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center active:bg-white/30 flex-shrink-0 mr-1"><RotateCcw className="w-3.5 h-3.5 text-white" /></button>
        <button onClick={closeChat} className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center active:bg-white/30 flex-shrink-0"><X className="w-4 h-4 text-white" /></button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} onAddToCart={handleAddToCart} onViewProduct={handleViewProduct} onOpenForm={handleOpenForm} onViewCategory={(slug) => { closeChat(); setLocation(`/products?category=${slug}`); }} onBuyNow={handleBuyNow} waPhone={waConfig?.phone} />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {messages.length <= 1 && !isLoading && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {QUICK_CHIPS.map(c => (
            <button key={c.label} onClick={c.action} className={`text-xs px-3.5 py-2 rounded-full font-semibold ${c.highlight ? "text-white shadow-sm" : "bg-white border border-gray-200 text-gray-700 shadow-sm"}`} style={c.highlight ? { backgroundColor: "#5FA800" } : undefined}>{c.label}</button>
          ))}
        </div>
      )}

      {chatCart.length > 0 && (
        <div className="border-t border-green-100 flex-shrink-0 bg-green-50">
          <div className="px-3 py-2 flex items-center gap-2">
            <button onClick={() => setCartExpanded(v => !v)} className="flex items-center gap-1.5 flex-1 min-w-0 active:opacity-70">
              <ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5FA800" }} />
              <span className="text-xs font-bold truncate" style={{ color: "#5FA800" }}>
                {chatCart.reduce((s, i) => s + i.qty, 0)} item{chatCart.reduce((s, i) => s + i.qty, 0) !== 1 ? "s" : ""} — Rs. {chatCart.reduce((s, i) => s + i.price * i.qty, 0).toLocaleString()}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${cartExpanded ? "rotate-180" : ""}`} style={{ color: "#5FA800" }} />
            </button>
            <button onClick={handleOpenForm} className="text-[10px] font-bold text-white px-2.5 py-1.5 rounded-full active:opacity-80 flex-shrink-0" style={{ backgroundColor: "#5FA800" }}>Checkout →</button>
          </div>
          {cartExpanded && (
            <div className="px-3 pb-2.5 border-t border-green-100 space-y-2 pt-2">
              {chatCart.map(item => {
                const key = `${item.productId}-${item.variantId ?? ""}`;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 leading-tight truncate">{item.name}{item.variant ? <span className="text-gray-500 font-normal"> · {item.variant}</span> : ""}</p>
                      <p className="text-[10px] text-gray-500">Rs. {item.price.toLocaleString()} each · Total: Rs. {(item.price * item.qty).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setChatCart(prev => { const idx = prev.findIndex(i => `${i.productId}-${i.variantId ?? ""}` === key); if (idx < 0) return prev; if (prev[idx].qty <= 1) return prev.filter((_, j) => j !== idx); return prev.map((it, j) => j === idx ? { ...it, qty: it.qty - 1 } : it); })} className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-700 font-bold text-sm active:bg-gray-100 leading-none">−</button>
                      <span className="text-xs font-bold text-gray-700 w-5 text-center">{item.qty}</span>
                      <button onClick={() => setChatCart(prev => { const idx = prev.findIndex(i => `${i.productId}-${i.variantId ?? ""}` === key); if (idx < 0) return prev; return prev.map((it, j) => j === idx ? { ...it, qty: it.qty + 1 } : it); })} className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-700 font-bold text-sm active:bg-gray-100 leading-none">+</button>
                      <button onClick={() => setChatCart(prev => prev.filter(i => `${i.productId}-${i.variantId ?? ""}` !== key))} className="w-6 h-6 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-400 text-xs font-bold active:bg-red-100 ml-0.5">✕</button>
                    </div>
                  </div>
                );
              })}
              <button onClick={() => { setChatCart([]); setCartExpanded(false); }} className="text-[10px] text-gray-400 underline">Clear all</button>
            </div>
          )}
        </div>
      )}
      {messages.length <= 1 && !isLoading && (
        <div className="px-4 py-1.5 flex items-center gap-1.5 border-t" style={{ backgroundColor: "rgba(95,168,0,0.06)", borderColor: "rgba(95,168,0,0.12)" }}>
          <Mic className="w-3 h-3 flex-shrink-0" style={{ color: "#5FA800" }} />
          <p className="text-[10px] font-medium" style={{ color: "#5FA800" }}>Tap mic to speak your order in Urdu or English</p>
        </div>
      )}
      <div className="bg-white border-t border-gray-100 px-3 flex gap-2 items-center flex-shrink-0" style={{ paddingTop: "10px", paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))" }}>
        <button onClick={handleVoiceInput} disabled={isLoading}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 flex-shrink-0 ${isListening ? "animate-pulse" : ""}`}
          style={{ backgroundColor: isListening ? "#ef4444" : "#f3f4f6" }}
          title={isListening ? "Stop recording" : "Speak your order (Urdu/English)"}>
          {isListening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-gray-500" />}
        </button>
        <input
          ref={inputRef} type="text" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={isListening ? "Listening… speak now" : "Type or speak your message…"}
          className="flex-1 bg-gray-100 rounded-full px-4 py-3 text-sm outline-none focus:bg-gray-50 focus:ring-2 focus:ring-[#5FA800]/30 transition-all"
          disabled={isLoading}
        />
        <button onClick={() => sendMessage()} disabled={isLoading || !input.trim()} className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 flex-shrink-0" style={{ backgroundColor: "#5FA800" }}>
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      {showOrderForm && (
        <OrderFormScreen defaultProduct={defaultOrderProduct} initialCart={chatCart} sessionId={sessionId} onClose={() => setShowOrderForm(false)} onSuccess={handleOrderSuccess} />
      )}
      {ChatPanel}

      {/* Pre-chat Lead Capture Form */}
      {showLeadForm && (
        <div className="fixed inset-0 z-[60] flex items-end justify-end p-4 sm:p-6 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="rounded-2xl shadow-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #0f2010 100%)", border: "1.5px solid #5FA800" }}>
              {/* Header */}
              <div className="px-5 pt-5 pb-4 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(95,168,0,0.2)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#5FA800" }}>
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-sm">Start Chat with KDF Nuts</p>
                  <p className="text-xs" style={{ color: "#7ec832" }}>Quick intro so we can help you better 🙌</p>
                </div>
                <button onClick={() => setShowLeadForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Form */}
              <form onSubmit={handleLeadSubmit} className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: "#7ec832" }}>Your Name <span className="text-red-400">*</span></label>
                  <input
                    required
                    value={leadName}
                    onChange={e => setLeadName(e.target.value)}
                    placeholder="e.g. Ali Hassan"
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white/8 border text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all"
                    style={{ borderColor: "rgba(95,168,0,0.3)", backgroundColor: "rgba(255,255,255,0.06)" }}
                    onFocus={e => e.target.style.borderColor = "#5FA800"}
                    onBlur={e => e.target.style.borderColor = "rgba(95,168,0,0.3)"}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: "#7ec832" }}>Phone Number <span className="text-red-400">*</span></label>
                  <input
                    required
                    type="tel"
                    value={leadPhone}
                    onChange={e => setLeadPhone(e.target.value)}
                    placeholder="e.g. 03001234567"
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white/8 border text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all"
                    style={{ borderColor: "rgba(95,168,0,0.3)", backgroundColor: "rgba(255,255,255,0.06)" }}
                    onFocus={e => e.target.style.borderColor = "#5FA800"}
                    onBlur={e => e.target.style.borderColor = "rgba(95,168,0,0.3)"}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "#7ec832" }}>Email <span className="text-gray-500 font-normal">(optional)</span></label>
                    <input
                      type="email"
                      value={leadEmail}
                      onChange={e => setLeadEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full rounded-xl px-3.5 py-2.5 text-sm border text-white placeholder-gray-500 focus:outline-none transition-all"
                      style={{ borderColor: "rgba(95,168,0,0.3)", backgroundColor: "rgba(255,255,255,0.06)" }}
                      onFocus={e => e.target.style.borderColor = "#5FA800"}
                      onBlur={e => e.target.style.borderColor = "rgba(95,168,0,0.3)"}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "#7ec832" }}>City <span className="text-gray-500 font-normal">(optional)</span></label>
                    <select
                      value={leadCity}
                      onChange={e => setLeadCity(e.target.value)}
                      className="w-full rounded-xl px-3 py-2.5 text-sm border text-white focus:outline-none transition-all"
                      style={{ borderColor: "rgba(95,168,0,0.3)", backgroundColor: "rgba(30,30,30,0.95)" }}
                      onFocus={e => e.target.style.borderColor = "#5FA800"}
                      onBlur={e => e.target.style.borderColor = "rgba(95,168,0,0.3)"}
                    >
                      <option value="">Select…</option>
                      {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={leadSubmitting || !leadName.trim() || !leadPhone.trim()}
                  className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all active:scale-95 disabled:opacity-50 mt-1 flex items-center justify-center gap-2"
                  style={{ background: leadSubmitting || !leadName.trim() || !leadPhone.trim() ? "rgba(95,168,0,0.4)" : "#5FA800" }}
                >
                  {leadSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                  {leadSubmitting ? "Starting Chat…" : "Start Chat"}
                </button>
                <p className="text-center text-xs text-gray-500 pb-1">Your info is safe with us. No spam ever. 🔒</p>
              </form>
            </div>
          </div>
        </div>
      )}

      {!isChatOpen && !showOrderForm && !dismissed && (
        <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2.5">
          {isExpanded && (
            <>
              <div className="flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
                <span className="bg-white text-gray-800 text-xs font-semibold px-2.5 py-1 rounded-full shadow-md whitespace-nowrap">Chat with Us</span>
                <button onClick={handleChatOpen} className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform" style={{ backgroundColor: "#5FA800" }}><MessageCircle className="w-5 h-5 text-white" /></button>
              </div>
              {waConfig && (
                <div className="flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in duration-150">
                  <span className="bg-white text-gray-800 text-xs font-semibold px-2.5 py-1 rounded-full shadow-md whitespace-nowrap">WhatsApp</span>
                  <button onClick={() => { window.open(`https://wa.me/${waConfig.phone.replace(/\D/g, "")}?text=${encodeURIComponent(waConfig.message)}`, "_blank"); setIsExpanded(false); }} className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform" style={{ backgroundColor: "#25D366" }}>{WA_SVG}</button>
                </div>
              )}
            </>
          )}
          <div className="relative">
            {!isExpanded && (
              <button
                onClick={handleDismiss}
                className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center z-10 active:bg-gray-800 transition-colors"
                title="Hide"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            )}
            <button onClick={() => setIsExpanded(v => !v)} className="w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-95" style={{ backgroundColor: isExpanded ? "#333" : "#5FA800" }}>
              {isExpanded ? <X className="w-5 h-5 text-white" /> : <MessageCircle className="w-6 h-6 text-white" />}
            </button>
          </div>
        </div>
      )}
      {isExpanded && !isChatOpen && !dismissed && <div className="fixed inset-0 z-40" onClick={() => setIsExpanded(false)} />}
    </>
  );
}
