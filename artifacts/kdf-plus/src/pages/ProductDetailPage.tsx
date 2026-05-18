import { lazy, Suspense, useState, useRef, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import {
  ShoppingCart, Plus, Minus, Star, Package, Truck, Shield,
  Heart, Share2, Zap, RotateCcw, ChevronLeft, ChevronRight,
  Send, Loader2, ChevronDown, MapPin, Clock, RefreshCw,
  Bell, X, Gavel, Timer, TrendingUp, Camera, ImagePlus,
  Banknote, BadgeCheck,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCart } from "@/context/CartContext";
import { getProductImageSrc } from "@/lib/imageUrl";
import { apiUrl } from "@/lib/fetchJsonApi";
import {
  buildVariantGroups,
  ensureStringArray,
  ensureVariantArray,
  normalizeProductDetail,
} from "@/lib/normalizeProductDetail";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductRecommendations } from "@/components/ProductRecommendations";
const ProductDetailRecommendations = lazy(() =>
  import("@/components/product-detail/ProductDetailRecommendations").then((m) => ({
    default: m.ProductDetailRecommendations,
  })),
);
import { MobilePurchaseSheet, type PurchaseIntent } from "@/components/purchase/MobilePurchaseSheet";
import { useToast } from "@/hooks/use-toast";
import {
  ProductConversionRail,
  StickyPurchaseConfidenceLg,
  useCtaInView,
} from "@/components/product-detail/ProductConversionRail";
import { ProductDetailErrorBoundary } from "@/components/ProductDetailErrorBoundary";

const BASE_URL = import.meta.env.BASE_URL ?? "/";

type TabKey = "description" | "reviews" | "shipping";

/* ── Star picker ── */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => onChange(n)} className="transition-transform hover:scale-110">
          <Star className={`w-6 h-6 transition-colors ${n <= (hover || value) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
        </button>
      ))}
    </div>
  );
}

/* ── Reviews tab content ── */
function ReviewsTab({ productId, productName }: { productId: number; productName: string }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", rating: 0, comment: "" });
  const [submitted, setSubmitted] = useState(false);
  const [reviewImages, setReviewImages] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: reviews = [], refetch } = useQuery<any[]>({
    queryKey: ["reviews", productId],
    queryFn: async () => {
      const r = await fetch(`/api/products/${productId}/reviews`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setReviewImages(prev => [...prev, ...files].slice(0, 3));
    e.target.value = "";
  };

  const removeImage = (i: number) => setReviewImages(prev => prev.filter((_, idx) => idx !== i));

  const submitMut = useMutation({
    mutationFn: async () => {
      setUploading(true);
      const imagePaths: string[] = [];
      for (const file of reviewImages) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch("/api/uploads/review-image", { method: "POST", body: fd });
        if (r.ok) { const d = await r.json(); imagePaths.push(d.objectPath); }
      }
      setUploading(false);
      const r = await fetch(`/api/products/${productId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, rating: form.rating, comment: form.comment, images: imagePaths }),
      });
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Review submitted!", description: "Your review will appear after approval." });
      setForm({ name: "", email: "", rating: 0, comment: "" });
      setReviewImages([]);
      setSubmitted(true);
      refetch();
    },
    onError: (e: Error) => { setUploading(false); toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const ratingDist = [5, 4, 3, 2, 1].map(n => ({ n, count: reviews.filter(r => r.rating === n).length, pct: reviews.length > 0 ? (reviews.filter(r => r.rating === n).length / reviews.length) * 100 : 0 }));

  return (
    <div className="space-y-8">
      {/* Lightbox */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightboxSrc(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10" onClick={() => setLightboxSrc(null)}>
            <X className="w-8 h-8" />
          </button>
          <img src={lightboxSrc} alt="Review photo" className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Rating summary */}
      {reviews.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-6 p-5 bg-accent/30 rounded-2xl">
          <div className="flex flex-col items-center justify-center text-center min-w-[100px]">
            <span className="text-5xl font-black">{avgRating.toFixed(1)}</span>
            <div className="flex gap-0.5 my-1">
              {Array.from({ length: 5 }).map((_, i) => (<Star key={i} className={`w-4 h-4 ${i < Math.round(avgRating) ? "fill-yellow-400 text-yellow-400" : "text-muted"}`} />))}
            </div>
            <span className="text-xs text-muted-foreground">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex-1 space-y-1.5">
            {ratingDist.map(({ n, count, pct }) => (
              <div key={n} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-right text-muted-foreground">{n}</span>
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} /></div>
                <span className="w-6 text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reviews list */}
      {reviews.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-10 bg-accent/20 rounded-xl">No reviews yet. Be the first to review this product!</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((r: any) => (
            <div key={r.id} className="border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">{r.name[0].toUpperCase()}</div>
                  <span className="font-semibold text-sm">{r.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">{Array.from({ length: 5 }).map((_, i) => (<Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? "fill-yellow-400 text-yellow-400" : "text-muted"}`} />))}</div>
                  <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })}</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{r.comment}</p>
              {r.images && r.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {r.images.map((img: string, i: number) => (
                    <button key={i} onClick={() => setLightboxSrc(`/api${img}`)}
                      className="w-16 h-16 rounded-lg overflow-hidden border border-border hover:opacity-80 transition-opacity flex-shrink-0 cursor-zoom-in">
                      <img src={`/api${img}`} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Write review form */}
      <div className="bg-accent/20 border border-border rounded-2xl p-5">
        <h3 className="font-bold text-base mb-4">Write a Review</h3>
        {submitted ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">🎉</div>
            <p className="font-semibold">Thank you for your review!</p>
            <p className="text-sm text-muted-foreground mt-1">It will appear after our team approves it.</p>
            <button onClick={() => setSubmitted(false)} className="mt-3 text-primary text-xs font-medium hover:underline">Write another review</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Your Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Doe" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Email (optional)</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 block">Your Rating *</label>
              <StarPicker value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Your Review *</label>
              <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} placeholder={`Share your experience with ${productName}…`} rows={4} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background resize-none" />
            </div>
            {/* Image upload */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 block">
                <Camera className="w-3.5 h-3.5" /> Add Photos (optional, up to 3)
              </label>
              <div className="flex flex-wrap gap-2">
                {reviewImages.map((f, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border flex-shrink-0">
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
                {reviewImages.length < 3 && (
                  <button onClick={() => fileRef.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                    <ImagePlus className="w-5 h-5" />
                    <span className="text-[9px] font-medium">Add</span>
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImagePick} className="hidden" />
            </div>
            <Button onClick={() => submitMut.mutate()} disabled={submitMut.isPending || uploading || !form.name || !form.comment || form.rating === 0} style={{ backgroundColor: "#5FA800" }} className="text-white gap-2">
              {(submitMut.isPending || uploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {uploading ? "Uploading photos…" : "Submit Review"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Shipping tab content ── */
function ShippingTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { icon: Truck, title: "Standard Delivery", body: "3–5 business days across Pakistan. Free on orders above Rs. 1,500. Delivery fee Rs. 150 on smaller orders.", color: "text-blue-600 bg-blue-50" },
          { icon: Clock, title: "Same-Day Delivery", body: "Available in Karachi and Lahore for orders placed before 12 PM. Extra charges may apply.", color: "text-[#5FA800] bg-[#5FA800]/10" },
          { icon: RefreshCw, title: "Easy Returns", body: "7-day hassle-free returns on damaged or incorrect items. Contact our support team to initiate a return.", color: "text-orange-600 bg-orange-50" },
          { icon: Shield, title: "Secure Payments", body: "Cash on Delivery (COD) and bank transfer accepted. All transactions are fully secure.", color: "text-purple-600 bg-purple-50" },
          { icon: MapPin, title: "Delivery Coverage", body: "We deliver across all major cities in Pakistan including Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad, and more.", color: "text-red-600 bg-red-50" },
          { icon: Package, title: "Packaging", body: "All products are packed in food-safe, airtight packaging to ensure freshness and maximum shelf life.", color: "text-amber-600 bg-amber-50" },
        ].map(({ icon: Icon, title, body, color }) => (
          <div key={title} className="border border-border rounded-2xl p-4 flex gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-1">{title}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-[#5FA800]/5 border border-[#5FA800]/20 rounded-2xl p-4">
        <p className="text-sm font-semibold text-[#5FA800] mb-1">Need help?</p>
        <p className="text-xs text-muted-foreground">Contact our support team on WhatsApp or call us during business hours (Mon–Sat, 9 AM – 7 PM).</p>
      </div>
    </div>
  );
}

/* ── Main Page ── */
function ProductDetailPageView() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const param = (params as any).slug ?? "";
  const { toast } = useToast();
  const { addItem } = useCart();

  const [selectedImage, setSelectedImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>();
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [imgZoomed, setImgZoomed] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [openSection, setOpenSection] = useState<TabKey | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyForm, setNotifyForm] = useState({ name: "", email: "", phone: "" });
  const [notifyDone, setNotifyDone] = useState(false);
  const [showBidForm, setShowBidForm] = useState(false);
  const [bidForm, setBidForm] = useState({ bidderName: "", bidderPhone: "", amount: "" });
  const [purchaseSheetOpen, setPurchaseSheetOpen] = useState(false);
  const [purchaseIntent, setPurchaseIntent] = useState<PurchaseIntent>("cart");

  const {
    data: product,
    isLoading,
    isError,
    error: productError,
    refetch: refetchProduct,
  } = useQuery({
    queryKey: ["kdf-plus-product", param],
    queryFn: async () => {
      const url = apiUrl(`/api/products/${encodeURIComponent(param)}`);
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Product not found");
      const canonicalSlug = res.headers.get("X-Canonical-Slug");
      const raw = (await res.json()) as Record<string, unknown>;
      if (raw?.error && raw.id == null) throw new Error("Product not found");
      const data = normalizeProductDetail(raw);
      if (data.id == null) throw new Error("Product not found");
      return { ...data, _canonicalSlug: canonicalSlug };
    },
    enabled: !!param,
    staleTime: 60_000,
    retry: 1,
  });

  const productId: number = (product as any)?.id ?? 0;

  const { data: sheetRecommendations } = useProductRecommendations({
    context: "product",
    productId,
    limit: 4,
    enabled: purchaseSheetOpen && productId > 0,
  });

  const mobileSheetRecommendations = useMemo(() => {
    const fbt = sheetRecommendations?.frequentlyBoughtTogether ?? [];
    const related = sheetRecommendations?.relatedProducts ?? [];
    const seen = new Set<number>();
    const out: typeof fbt = [];
    for (const p of [...fbt, ...related]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
      if (out.length >= 4) break;
    }
    return out;
  }, [sheetRecommendations]);

  const { ref: desktopCtaRef, inView: desktopCtaInView } = useCtaInView<HTMLDivElement>();

  /* ── SEO: silently update address bar to canonical slug (no reload) ── */
  useEffect(() => {
    if (!product) return;
    const canonicalSlug = (product as any)._canonicalSlug as string | null;
    if (!canonicalSlug) return;
    const base = (BASE_URL || "/").replace(/\/$/, "");
    window.history.replaceState(null, "", `${base}/products/${canonicalSlug}`);
  }, [product]);

  const { data: bidData, refetch: refetchBid } = useQuery({
    queryKey: ["bids", productId],
    queryFn: () => fetch(`/api/bids/${productId}`).then(r => r.json()),
    enabled: !!productId,
    refetchInterval: 30000,
  });

  const notifyMutation = useMutation({
    mutationFn: (data: any) => fetch("/api/restock/notify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); return d; }),
    onSuccess: () => setNotifyDone(true),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bidMutation = useMutation({
    mutationFn: (data: any) => fetch(`/api/bids/${productId}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); return d; }),
    onSuccess: () => {
      toast({ title: "Bid placed!", description: "You are now the highest bidder!" });
      setShowBidForm(false); setBidForm({ bidderName: "", bidderPhone: "", amount: "" }); refetchBid();
    },
    onError: (e: any) => toast({ title: "Bid failed", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [param]);

  useEffect(() => {
    if (!product) return;
    const variants = ensureVariantArray((product as any).variants);
    if (variants.length > 0) {
      const first = variants.find((v) => v.stock !== 0) ?? variants[0];
      setSelectedVariant(String(first.id));
    } else {
      setSelectedVariant(undefined);
    }
  }, [(product as any)?.id]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setZoomPos({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
  };

  if (isLoading) {
    return (
      <main className="kdf-page-shell py-8 sm:py-10">
        <div className="kdf-pdp-hero">
          <Skeleton className="mx-auto aspect-square w-full max-w-[min(100%,24rem)] rounded-2xl lg:mx-0 lg:max-w-full" />
          <div className="min-w-0 space-y-4"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-6 w-1/4" /><Skeleton className="h-24 w-full" /><Skeleton className="h-12 w-full" /></div>
        </div>
      </main>
    );
  }

  if (isError || !product) {
    return (
      <main className="kdf-page-shell px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-4xl mb-4">{isError ? "⚠️" : "🔍"}</p>
        <h2 className="text-xl font-semibold mb-2">
          {isError ? "Could not load this product" : "Product not found"}
        </h2>
        <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
          {isError
            ? (productError instanceof Error ? productError.message : "Please check your connection and try again.")
            : "This item may have been removed or the link is incorrect."}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {isError && (
            <Button variant="outline" onClick={() => refetchProduct()} data-testid="button-retry-product">
              Try again
            </Button>
          )}
          <Button onClick={() => setLocation("/products")} data-testid="button-back-products">
            Browse Products
          </Button>
        </div>
      </main>
    );
  }

  const productVariants = ensureVariantArray((product as any).variants);
  const productTags = ensureStringArray((product as any).tags);
  const images: string[] =
    product.images && product.images.length > 0 ? (product.images as string[]) : [""];
  const activeVariant = productVariants.find((v) => String(v.id) === String(selectedVariant ?? ""));
  const price = activeVariant?.price
    ? parseFloat(activeVariant.price)
    : parseFloat(String(product.price ?? "0")) || 0;
  const originalPrice = product.originalPrice ? parseFloat(String(product.originalPrice)) : null;
  const discount = originalPrice && originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : null;
  const availableStock = activeVariant?.stock != null ? Number(activeVariant.stock) : Number(product.stock);
  const safeQty = Math.max(1, Math.min(qty, Math.max(availableStock, 1)));
  const selectedVariantLabel = activeVariant?.value ?? ((product as any).weight ? `${(product as any).weight} ${(product as any).unit || ""}`.trim() : "Standard");
  const variantGroups = productVariants.length > 0 ? buildVariantGroups(productVariants) : [];
  const descriptionText =
    typeof product.description === "string" ? product.description : "";

  const stockStatus = availableStock === 0
    ? { label: "Out of Stock", cls: "text-red-700 bg-red-50" }
    : availableStock < 10
    ? { label: `Low Stock — only ${availableStock} left`, cls: "text-orange-700 bg-orange-50" }
    : { label: "In Stock", cls: "text-green-800 bg-green-50" };

  const openPurchaseSheet = (intent: PurchaseIntent) => {
    setPurchaseIntent(intent);
    setPurchaseSheetOpen(true);
  };
  const handleVariantChange = (variantId: string) => {
    const next = productVariants.find((v: any) => String(v.id) === String(variantId));
    const nextStock = next?.stock != null ? Number(next.stock) : Number(product.stock);
    setSelectedVariant(variantId);
    setQty((current) => Math.max(1, Math.min(current, Math.max(nextStock, 1))));
  };
  const handleAddToCart = () => { addItem(product, safeQty, selectedVariant, activeVariant?.value); toast({ title: "Added to cart!", description: `${safeQty}× ${product.name}` }); };
  const handleBuyNow = () => { addItem(product, safeQty, selectedVariant, activeVariant?.value); setLocation("/cart"); };
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: product.name, url });
    else { await navigator.clipboard.writeText(url); toast({ title: "Link copied!" }); }
  };

  const structuredData = {
    "@context": "https://schema.org", "@type": "Product",
    "name": product.name, "description": product.description,
    "image": images.map((img) => getProductImageSrc(img)),
    "sku": product.slug,
    "brand": { "@type": "Brand", "name": "KDF NUTS" },
    "offers": { "@type": "Offer", "priceCurrency": "PKR", "price": price.toString(), "availability": product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", "seller": { "@type": "Organization", "name": "KDF NUTS" } },
    ...(product.rating && Number(product.rating) > 0 ? { "aggregateRating": { "@type": "AggregateRating", "ratingValue": product.rating, "reviewCount": product.reviewCount || 1, "bestRating": "5", "worstRating": "1" } } : {}),
  };

  const accordionSections: Array<{ key: TabKey; emoji: string; label: string; count?: number }> = [
    { key: "description", emoji: "📄", label: "Description" },
    { key: "reviews",     emoji: "⭐", label: "Reviews", count: product.reviewCount > 0 ? product.reviewCount : undefined },
    { key: "shipping",    emoji: "🚚", label: "Shipping & Returns" },
  ];

  return (
    <>
      <Helmet>
        <title>{product.metaTitle || product.name} — KDF Plus</title>
        <meta name="description" content={product.metaDescription || descriptionText.replace(/<[^>]+>/g, " ").slice(0, 160) || `Buy ${product.name} online.`} />
        <meta property="og:title" content={product.name} />
        <meta property="og:description" content={descriptionText.replace(/<[^>]+>/g, " ").slice(0, 200) || ""} />
        <meta property="og:image" content={getProductImageSrc(images[0])} />
        <meta property="og:type" content="product" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href={`https://kdfplus.pk/products/${(product as any).slug || product.id}`} />
        <meta property="og:url" content={`https://kdfplus.pk/products/${(product as any).slug || product.id}`} />
        <meta property="og:site_name" content="KDF Plus" />
        <meta name="twitter:title" content={product.metaTitle || product.name} />
        <meta name="twitter:description" content={product.metaDescription || descriptionText.replace(/<[^>]+>/g, " ").slice(0, 160) || `Buy ${product.name} online.`} />
        {getProductImageSrc(images[0]) && <meta name="twitter:image" content={getProductImageSrc(images[0])} />}
        <meta property="product:price:amount" content={String(price)} />
        <meta property="product:price:currency" content="PKR" />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <main className="kdf-page-shell kdf-pdp-shell kdf-pdp-main py-3 sm:py-10">
        {/* Breadcrumb */}
        <nav className="mb-8 hidden flex-wrap items-center gap-1.5 text-sm text-muted-foreground sm:mb-9 lg:flex">
          <button onClick={() => setLocation("/")} className="hover:text-primary transition-colors" data-testid="breadcrumb-home">Home</button>
          <span>/</span>
          <button onClick={() => setLocation("/products")} className="hover:text-primary transition-colors" data-testid="breadcrumb-products">Products</button>
          {(product as any).category && (<><span>/</span><button onClick={() => setLocation(`/products?categoryId=${(product as any).category?.id}`)} className="hover:text-primary transition-colors">{(product as any).category.name}</button></>)}
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-[200px]">{product.name}</span>
        </nav>

        <div className="kdf-pdp-hero">
          <div className="kdf-pdp-hero__gallery">
            <div className="mx-auto w-full max-w-[min(100%,24rem)] space-y-3 sm:max-w-[min(100%,26rem)] lg:mx-0 lg:max-w-full">
            <div
              ref={imgRef}
              className="kdf-pdp-hero__image cursor-zoom-in rounded-2xl border border-gray-100/90 shadow-md ring-1 ring-black/[0.04] lg:border-0 lg:shadow-none lg:ring-0"
              onMouseEnter={() => setImgZoomed(true)}
              onMouseLeave={() => setImgZoomed(false)}
              onMouseMove={handleMouseMove}
            >
              <img
                src={getProductImageSrc(images[selectedImage])}
                alt={(product as any).altText || product.name}
                className="h-full w-full max-h-full object-contain object-center transition-transform duration-200 ease-out will-change-transform"
                style={
                  imgZoomed
                    ? { transform: "scale(1.18)", transformOrigin: `${zoomPos.x}% ${zoomPos.y}%` }
                    : { transform: "scale(1)", transformOrigin: "center center" }
                }
                data-testid="img-product-main"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              {discount && <div className="absolute top-3 left-3 bg-[#F58300] text-white text-xs font-bold px-2.5 py-1 rounded-full shadow">{discount}% OFF</div>}
              {product.featured && <div className="absolute top-3 right-3"><Badge className="bg-secondary text-secondary-foreground text-xs">Featured</Badge></div>}
              {images.length > 1 && (<>
                <button onClick={() => setSelectedImage(i => (i - 1 + images.length) % images.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow hover:bg-white transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setSelectedImage(i => (i + 1) % images.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow hover:bg-white transition-colors"><ChevronRight className="w-4 h-4" /></button>
              </>)}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 md:gap-2.5 lg:gap-3">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 ring-1 ring-black/[0.03] transition-[transform,box-shadow,border-color] duration-300 sm:h-16 sm:w-16 md:h-[4.25rem] md:w-[4.25rem] md:rounded-2xl md:hover:-translate-y-0.5 md:hover:shadow-md motion-reduce:transition-none ${
                      i === selectedImage ? "border-primary shadow-md ring-[#5FA800]/20" : "border-border hover:border-[#5FA800]/40"
                    }`}
                    data-testid={`button-image-thumb-${i}`}
                  >
                    <img src={getProductImageSrc(img)} alt={`${product.name} view ${i + 1}`} className="h-full w-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>

          <div className="kdf-pdp-hero__buy">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {productTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="border-0 bg-gray-100/90 text-[10px] font-semibold text-gray-600">
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => setIsWishlisted(w => !w)} className={`rounded-full p-2 transition-colors ${isWishlisted ? "bg-red-50 text-red-500" : "text-muted-foreground hover:bg-gray-100"}`} title="Add to wishlist">
                  <Heart className="h-5 w-5" fill={isWishlisted ? "currentColor" : "none"} />
                </button>
                <button onClick={handleShare} className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-gray-100" title="Share">
                  <Share2 className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <h1
                className="text-[1.35rem] font-bold leading-tight tracking-tight text-foreground [text-wrap:balance] sm:text-2xl lg:text-[1.75rem] xl:text-[2rem]"
                data-testid="text-product-name"
              >
                {product.name}
              </h1>
              {(product as any).weight && (
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {(product as any).weight} {(product as any).unit || ""}
                </p>
              )}
            </div>

            {product.rating && Number(product.rating) > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">{Array.from({ length: 5 }).map((_, i) => (<Star key={i} className={`w-4 h-4 ${i < Math.round(parseFloat(product.rating!)) ? "fill-yellow-400 text-yellow-400" : "text-muted"}`} />))}</div>
                <span className="text-sm font-semibold">{Number(product.rating).toFixed(1)}</span>
                {product.reviewCount > 0 && (<button onClick={() => { setOpenSection("reviews"); setReviewsLoaded(true); }} className="text-sm text-muted-foreground hover:text-primary transition-colors">({product.reviewCount} reviews)</button>)}
              </div>
            )}

            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="text-2xl font-bold tracking-tight text-foreground lg:text-[1.75rem] xl:text-3xl" data-testid="text-price">
                Rs. {price.toLocaleString()}
              </span>
              {originalPrice && originalPrice > price && (
                <span className="text-sm text-muted-foreground line-through sm:text-base">Rs. {originalPrice.toLocaleString()}</span>
              )}
              {discount && (
                <Badge className="border-0 bg-[#5FA800]/12 px-2 py-0.5 text-[11px] font-bold text-[#5FA800]">{discount}% OFF</Badge>
              )}
            </div>

            <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stockStatus.cls}`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: availableStock === 0 ? "#ef4444" : availableStock < 10 ? "#f97316" : "#16a34a" }} />
              {stockStatus.label}
            </div>

            {/* Variants */}
            {variantGroups.length > 0 && (
              <div className="space-y-4 rounded-2xl border border-gray-100/80 bg-gray-50/50 p-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
                {variantGroups.map(({ type, items }) => (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-sm font-semibold text-foreground">{(type ?? "Option").toLowerCase().includes("weight") ? "Select Weight" : type}</p>
                      {activeVariant && items.some(v => v.id === activeVariant.id) && activeVariant.price && (<span className="text-sm font-bold text-[#5FA800]">Rs. {parseFloat(activeVariant.price).toLocaleString()}</span>)}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {items.map((v) => {
                        const isSelected = String(selectedVariant) === String(v.id); const outOfStock = v.stock === 0;
                        return (
                          <button key={v.id} onClick={() => !outOfStock && handleVariantChange(v.id)} disabled={outOfStock}
                            className={`relative px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all hover:scale-[1.02] active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:scale-100 ${isSelected ? "text-white border-transparent shadow-md" : outOfStock ? "text-gray-300 border-gray-200 cursor-not-allowed" : "text-gray-700 border-gray-200 hover:border-[#5FA800]/60 hover:text-[#5FA800]"}`}
                            style={isSelected ? { backgroundColor: "#5FA800", borderColor: "#5FA800" } : {}} data-testid={`button-variant-${v.id}`}>
                            {type === "Color" && v.hex && <span className="inline-block w-3.5 h-3.5 rounded-full mr-1.5 border border-gray-300 align-middle" style={{ backgroundColor: v.hex }} />}
                            {v.value}{outOfStock && <span className="ml-1.5 text-[10px] font-normal opacity-60">Out</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quantity */}
            <div className="flex items-center gap-4 rounded-2xl border border-gray-100/80 bg-gray-50/50 p-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
              <span className="text-sm font-semibold">Quantity</span>
              <div className="flex items-center gap-2 border border-border rounded-xl px-2 py-1">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={safeQty <= 1} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center disabled:opacity-40 hover:bg-muted/80" data-testid="button-qty-decrement"><Minus className="w-3.5 h-3.5" /></button>
                <span className="w-8 text-center font-bold text-sm" data-testid="text-qty">{safeQty}</span>
                <button onClick={() => setQty((q) => Math.min(availableStock, q + 1))} disabled={availableStock === 0 || safeQty >= availableStock} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center disabled:opacity-40 hover:bg-muted/80" data-testid="button-qty-increment"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <span className="text-sm font-bold text-[#5FA800]">Rs. {(price * safeQty).toLocaleString()}</span>
            </div>

            <div className="grid grid-cols-4 gap-2 lg:hidden">
              {[
                { icon: Banknote, label: "COD" },
                { icon: Truck, label: "Same-day" },
                { icon: BadgeCheck, label: "Authentic" },
                { icon: Package, label: "Fast ship" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="rounded-2xl border border-gray-100 bg-white p-2 text-center shadow-sm">
                  <Icon className="mx-auto mb-1 h-4 w-4 text-[#5FA800]" />
                  <p className="text-[10px] font-bold leading-tight text-gray-700">{label}</p>
                </div>
              ))}
            </div>

            {/* Active Auction Panel */}
            {bidData?.hasBidding && bidData?.isLive && (
              <div className="border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-yellow-50 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-orange-600" />
                  <span className="font-bold text-orange-700">Live Auction</span>
                  <span className="ml-auto text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Timer className="w-3 h-3" />
                    {bidData.config?.endTime ? (() => {
                      const diff = new Date(bidData.config.endTime).getTime() - Date.now();
                      if (diff <= 0) return "Ended";
                      const h = Math.floor(diff / 3600000); const m = Math.floor((diff % 3600000) / 60000);
                      const s = Math.floor((diff % 60000) / 1000);
                      return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
                    })() : "Active"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-xs text-muted-foreground">Starting</p><p className="font-bold text-sm">Rs. {parseFloat(bidData.config.startingPrice ?? "0").toLocaleString()}</p></div>
                  <div><p className="text-xs text-muted-foreground">Current Bid</p><p className="font-bold text-lg text-green-700">Rs. {parseFloat(bidData.config.currentBid ?? "0").toLocaleString()}</p></div>
                  <div><p className="text-xs text-muted-foreground">Total Bids</p><p className="font-bold text-sm flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" />{bidData.config.totalBids ?? 0}</p></div>
                </div>
                {bidData.config.buyNowPrice && (
                  <p className="text-xs text-center text-blue-600">Buy Now available at Rs. {parseFloat(bidData.config.buyNowPrice).toLocaleString()}</p>
                )}
                {!showBidForm ? (
                  <Button onClick={() => setShowBidForm(true)} className="w-full font-semibold" style={{ backgroundColor: "#f97316" }}>
                    <Gavel className="w-4 h-4 mr-2" /> Place a Bid
                  </Button>
                ) : (
                  <div className="space-y-3 bg-white rounded-xl p-4 border border-orange-200">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold">Place Your Bid</p>
                      <button onClick={() => setShowBidForm(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
                    </div>
                    <p className="text-xs text-muted-foreground">Minimum bid: Rs. {(parseFloat(bidData.config.currentBid ?? "0") + parseFloat(bidData.config.minIncrement ?? "50")).toLocaleString()}</p>
                    <input value={bidForm.bidderName} onChange={e => setBidForm(f => ({ ...f, bidderName: e.target.value }))} placeholder="Your name *" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-background" />
                    <input value={bidForm.bidderPhone} onChange={e => setBidForm(f => ({ ...f, bidderPhone: e.target.value }))} placeholder="Phone number *" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-background" />
                    <input type="number" value={bidForm.amount} onChange={e => setBidForm(f => ({ ...f, amount: e.target.value }))} placeholder="Your bid amount (Rs.) *" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-background" />
                    <Button onClick={() => bidMutation.mutate({ ...bidForm, productId })} disabled={bidMutation.isPending} className="w-full" style={{ backgroundColor: "#f97316" }}>
                      {bidMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Placing…</> : "Confirm Bid"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* CTA — in-flow on mobile; anchor for desktop sticky repurchase bar */}
            <div ref={desktopCtaRef} className="kdf-pdp-cta-row">
              <Button size="lg" variant="outline" className="kdf-pdp-cta kdf-pdp-cta--outline w-full transition-[transform,box-shadow] hover:scale-[1.01] active:scale-[0.99]" onClick={() => openPurchaseSheet("cart")} disabled={availableStock === 0} data-testid="button-add-to-cart">
                <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
              </Button>
              <Button size="lg" className="kdf-pdp-cta kdf-pdp-cta--primary w-full transition-[transform,box-shadow] hover:scale-[1.01] active:scale-[0.99]" onClick={() => openPurchaseSheet("buy")} disabled={availableStock === 0} style={{ background: "linear-gradient(135deg, #5FA800 0%, #3d7000 100%)" }} data-testid="button-buy-now">
                <Zap className="mr-2 h-4 w-4" /> Buy Now
              </Button>
            </div>

            {/* Notify Me When Available */}
            {product.stock === 0 && !bidData?.isLive && (
              <div>
                {!notifyOpen ? (
                  <Button variant="outline" size="lg" className="w-full font-semibold rounded-xl border-2 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => setNotifyOpen(true)} data-testid="button-notify-me">
                    <Bell className="w-4 h-4 mr-2" /> Notify Me When Available
                  </Button>
                ) : notifyDone ? (
                  <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center text-sm text-green-700">
                    ✅ You're on the list! We'll notify you when this product is back.
                    <button className="block mx-auto mt-1 text-xs text-green-600 hover:underline" onClick={() => { setNotifyOpen(false); setNotifyDone(false); }}>Close</button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-orange-700 flex items-center gap-2"><Bell className="w-4 h-4" /> Get Notified</p>
                      <button onClick={() => setNotifyOpen(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
                    </div>
                    <input value={notifyForm.name} onChange={e => setNotifyForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name (optional)" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-background" />
                    <input value={notifyForm.email} onChange={e => setNotifyForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address *" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-background" />
                    <input value={notifyForm.phone} onChange={e => setNotifyForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone (WhatsApp)" className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-background" />
                    <Button onClick={() => notifyMutation.mutate({ ...notifyForm, productId })} disabled={notifyMutation.isPending || !notifyForm.email} className="w-full" style={{ backgroundColor: "#5FA800" }}>
                      {notifyMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Notify Me"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            <ProductConversionRail productId={productId} stock={product.stock} />
          </div>
        </div>

        <Suspense fallback={null}>
          <ProductDetailRecommendations productId={productId} />
        </Suspense>

        {/* ── Accordion: Description / Reviews / Shipping ── */}
        <div className="mt-10 space-y-3">
          {accordionSections.map(({ key, emoji, label, count }) => {
            const isOpen = openSection === key;
            return (
              <div key={key} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04] md:rounded-2xl md:shadow-md">
                {/* Header row */}
                <button
                  onClick={() => {
                    setOpenSection(o => o === key ? null : key);
                    if (key === "reviews") setReviewsLoaded(true);
                  }}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-accent/40 transition-colors"
                >
                  <span className="text-xl leading-none flex-shrink-0">{emoji}</span>
                  <span className="flex-1 text-sm font-bold text-foreground">{label}</span>
                  {count != null && count > 0 && (
                    <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full flex-shrink-0">{count}</span>
                  )}
                  <ChevronDown
                    className="w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-300"
                    style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>

                {/* Animated body — CSS grid row trick (no JS height measurement) */}
                <div style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows 0.28s ease" }}>
                  <div style={{ overflow: "hidden" }}>
                    <div className="px-5 pb-6 pt-3">

                      {key === "description" && (
                        descriptionText ? (
                          <>
                            <div
                              className="prose prose-sm max-w-3xl text-foreground leading-relaxed [&_p]:mb-3 [&_ul]:pl-5 [&_ul]:space-y-1 [&_li]:list-disc [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_strong]:font-semibold overflow-hidden"
                              style={!descExpanded ? { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}}
                              dangerouslySetInnerHTML={{ __html: descriptionText }}
                            />
                            <button
                              onClick={e => { e.stopPropagation(); setDescExpanded(v => !v); }}
                              className="mt-3 text-xs font-bold flex items-center gap-1 hover:underline"
                              style={{ color: "#5FA800" }}
                            >
                              {descExpanded ? <>Show Less <ChevronDown className="w-3 h-3 rotate-180" /></> : <>Read More <ChevronDown className="w-3 h-3" /></>}
                            </button>
                          </>
                        ) : (
                          <p className="text-muted-foreground text-sm">No description available for this product.</p>
                        )
                      )}

                      {key === "reviews" && reviewsLoaded && (
                        <ReviewsTab productId={productId} productName={product.name} />
                      )}
                      {key === "reviews" && !reviewsLoaded && (
                        <p className="text-sm text-muted-foreground py-4 text-center">Open this section to load reviews.</p>
                      )}

                      {key === "shipping" && <ShippingTab />}

                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </main>

      <StickyPurchaseConfidenceLg
        visible={!!product && availableStock > 0 && !bidData?.isLive && !desktopCtaInView}
        price={price}
        qty={safeQty}
        name={product.name}
        onAdd={() => openPurchaseSheet("cart")}
        onBuy={() => openPurchaseSheet("buy")}
        disabled={availableStock === 0}
      />

      <MobilePurchaseSheet
        open={purchaseSheetOpen}
        onOpenChange={setPurchaseSheetOpen}
        intent={purchaseIntent}
        product={product}
        image={getProductImageSrc(images[selectedImage])}
        variantGroups={variantGroups}
        selectedVariant={selectedVariant}
        activeVariant={activeVariant}
        onVariantChange={handleVariantChange}
        price={price}
        qty={safeQty}
        onQtyChange={setQty}
        stockStatus={stockStatus}
        availableStock={availableStock}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
        recommendations={mobileSheetRecommendations}
      />

      {/* Notify Me mobile modal */}
      {notifyOpen && product.stock === 0 && !bidData?.isLive && (
        <div className="fixed inset-0 z-50 lg:hidden bg-black/50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-6 space-y-4">
            {!notifyDone ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg flex items-center gap-2"><Bell className="w-5 h-5 text-orange-500" /> Get Notified</h3>
                  <button onClick={() => setNotifyOpen(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
                </div>
                <p className="text-sm text-muted-foreground">We'll let you know the moment this product is back in stock.</p>
                <input value={notifyForm.name} onChange={e => setNotifyForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name (optional)" className="w-full text-sm border border-input rounded-xl px-4 py-3 bg-background" />
                <input value={notifyForm.email} onChange={e => setNotifyForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address *" className="w-full text-sm border border-input rounded-xl px-4 py-3 bg-background" />
                <input value={notifyForm.phone} onChange={e => setNotifyForm(f => ({ ...f, phone: e.target.value }))} placeholder="WhatsApp number" className="w-full text-sm border border-input rounded-xl px-4 py-3 bg-background" />
                <Button onClick={() => notifyMutation.mutate({ ...notifyForm, productId })} disabled={notifyMutation.isPending || !notifyForm.email} className="w-full h-12 text-base font-semibold rounded-xl" style={{ backgroundColor: "#5FA800" }}>
                  {notifyMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Notify Me"}
                </Button>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">✅</div>
                <h3 className="font-bold text-lg">You're on the list!</h3>
                <p className="text-sm text-muted-foreground mt-2 mb-6">We'll notify you as soon as this product is back in stock.</p>
                <Button onClick={() => { setNotifyOpen(false); setNotifyDone(false); }} className="w-full rounded-xl" style={{ backgroundColor: "#5FA800" }}>Close</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function ProductDetailPage() {
  return (
    <ProductDetailErrorBoundary>
      <ProductDetailPageView />
    </ProductDetailErrorBoundary>
  );
}
