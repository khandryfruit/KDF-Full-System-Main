import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import {
  ShoppingCart, Plus, Minus, Star, Package, Truck, Shield,
  Heart, Share2, Zap, RotateCcw, ChevronLeft, ChevronRight,
  Send, Loader2, ChevronDown, MapPin, Clock, RefreshCw,
  Bell, X, Gavel, Timer, TrendingUp, Camera, ImagePlus,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useListProducts, useListCategories } from "@workspace/api-client-react";
import { useCart } from "@/context/CartContext";
import { getProductImageSrc } from "@/lib/imageUrl";
import { normalizeProductsListResponse } from "@/lib/normalizeProductsList";
import { asArrayFromApi } from "@/lib/asArrayFromApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  ProductConversionRail,
  StickyPurchaseConfidenceLg,
  useCtaInView,
  type PairProduct,
} from "@/components/product-detail/ProductConversionRail";
import {
  ProductGalleryEngagementZone,
  type GalleryEngagementProduct,
  type GalleryCategory,
} from "@/components/product-detail/ProductGalleryEngagementZone";

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

/* ── Related Products ── */
function RelatedProducts({ currentId }: { currentId: number }) {
  const [, setLocation] = useLocation();
  const { data } = useListProducts(
    { limit: 7 },
    { query: { queryKey: ["products", "related-pool"], staleTime: 60_000 } },
  );
  const products = useMemo(
    () =>
      normalizeProductsListResponse(data)
        .items.filter((p: any) => p.id !== currentId)
        .slice(0, 6),
    [data, currentId],
  );
  if (products.length === 0) return null;

  return (
    <div className="mt-10 md:mt-14">
      <Separator className="mb-8" />
      <h2 className="mb-5 text-xl font-black tracking-tight md:text-2xl">You May Also Like</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
        {products.map((p: any) => {
          const rPrice = Number(p.price);
          const rOld = p.originalPrice ? Number(p.originalPrice) : null;
          const rDisc = rOld && rOld > rPrice ? Math.round(((rOld - rPrice) / rOld) * 100) : null;
          const img = p.images?.[0];
          return (
            <div key={p.id} onClick={() => setLocation(`/products/${(p as any).slug || p.id}`)} className="group cursor-pointer overflow-hidden rounded-3xl border border-gray-100/90 bg-white shadow-sm ring-1 ring-black/[0.03] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-[#5FA800]/30 hover:shadow-2xl hover:shadow-[#5FA800]/12 active:scale-[0.99] md:rounded-[1.75rem] md:hover:-translate-y-1.5">
              <div className="aspect-square bg-muted/20 overflow-hidden relative">
                {img ? <img src={getProductImageSrc(img)} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" decoding="async"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-muted" /></div>}
                {rDisc && <span className="absolute top-2 left-2 bg-[#F58300] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{rDisc}% OFF</span>}
              </div>
              <div className="p-3">
                <p className="text-xs font-semibold text-foreground truncate mb-1">{p.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-black text-primary">Rs. {rPrice.toLocaleString()}</span>
                  {rOld && <span className="text-xs text-muted-foreground line-through">Rs. {rOld.toLocaleString()}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function ProductDetailPage() {
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

  const { data: product, isLoading } = useQuery({
    queryKey: ["kdf-plus-product", param],
    queryFn: async () => {
      const r = await fetch(`/api/products/${encodeURIComponent(param)}`);
      if (!r.ok) throw new Error("Product not found");
      const canonicalSlug = r.headers.get("X-Canonical-Slug");
      const data = await r.json();
      return { ...data, _canonicalSlug: canonicalSlug };
    },
    enabled: !!param,
    staleTime: 60_000,
    retry: 1,
  });

  const productId: number = (product as any)?.id ?? 0;

  const { data: relatedPool } = useListProducts(
    { limit: 7 },
    { query: { queryKey: ["products", "related-pool"], staleTime: 60_000 } },
  );
  const pairItems: PairProduct[] = useMemo(() => {
    if (!productId || !relatedPool) return [];
    return normalizeProductsListResponse(relatedPool)
      .items.filter((p: any) => p.id !== productId)
      .slice(0, 4)
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: Number(p.price),
        originalPrice: p.originalPrice,
        images: p.images,
        gradient: p.gradient,
      }));
  }, [relatedPool, productId]);

  const { data: categoriesRaw } = useListCategories({
    query: { staleTime: 120_000, refetchOnWindowFocus: false },
  });
  const galleryCategories: GalleryCategory[] = useMemo(
    () => asArrayFromApi<GalleryCategory>(categoriesRaw).slice(0, 12),
    [categoriesRaw],
  );

  const { data: engagementPool } = useListProducts(
    { limit: 24, sortBy: "newest" as const },
    { query: { queryKey: ["products", "pdp-gallery-engagement"], staleTime: 60_000, refetchOnWindowFocus: false } },
  );
  const galleryEngagementProducts: GalleryEngagementProduct[] = useMemo(() => {
    if (!productId || !engagementPool) return [];
    return normalizeProductsListResponse(engagementPool)
      .items.filter((p: any) => p.id !== productId)
      .slice(0, 20)
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: Number(p.price),
        images: p.images,
        gradient: p.gradient,
        variants: p.variants,
      }));
  }, [engagementPool, productId]);

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
    if ((product as any).variants && (product as any).variants.length > 0) {
      const first = (product as any).variants.find((v: any) => v.stock !== 0) ?? (product as any).variants[0];
      setSelectedVariant(first.id);
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
      <main className="mx-auto w-full max-w-[min(100%,80rem)] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-x-10 lg:gap-y-8 xl:gap-x-12">
          <Skeleton className="mx-auto aspect-square w-full max-w-[min(100%,28rem)] rounded-2xl lg:mx-0" />
          <div className="min-w-0 space-y-4"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-6 w-1/4" /><Skeleton className="h-24 w-full" /><Skeleton className="h-12 w-full" /></div>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-4xl mb-4">🔍</p>
        <h2 className="text-xl font-semibold mb-2">Product not found</h2>
        <Button onClick={() => setLocation("/products")} data-testid="button-back-products">Browse Products</Button>
      </main>
    );
  }

  const images = product.images && product.images.length > 0 ? product.images : [""];
  const activeVariant = product.variants?.find(v => v.id === selectedVariant);
  const price = activeVariant?.price ? parseFloat(activeVariant.price) : parseFloat(product.price);
  const originalPrice = product.originalPrice ? parseFloat(product.originalPrice) : null;
  const discount = originalPrice && originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : null;

  const stockStatus = product.stock === 0
    ? { label: "Out of Stock", cls: "text-red-600 bg-red-50 border-red-200" }
    : product.stock < 10
    ? { label: `Low Stock — only ${product.stock} left`, cls: "text-orange-600 bg-orange-50 border-orange-200" }
    : { label: "In Stock", cls: "text-green-700 bg-green-50 border-green-200" };

  const handleAddToCart = () => { addItem(product, qty, selectedVariant, activeVariant?.value); toast({ title: "Added to cart!", description: `${qty}× ${product.name}` }); };
  const handleBuyNow = () => { addItem(product, qty, selectedVariant, activeVariant?.value); setLocation("/cart"); };
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: product.name, url });
    else { await navigator.clipboard.writeText(url); toast({ title: "Link copied!" }); }
  };

  const handleQuickAddGallery = (p: GalleryEngagementProduct) => {
    const vars = p.variants as any[] | undefined;
    const v = vars?.find((x: any) => x.stock !== 0) ?? vars?.[0];
    addItem(p as any, 1, v?.id, v?.value ?? "Standard");
    toast({ title: "Added to cart", description: p.name });
  };

  const structuredData = {
    "@context": "https://schema.org", "@type": "Product",
    "name": product.name, "description": product.description,
    "image": images.map(getProductImageSrc),
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
        <meta name="description" content={product.metaDescription || product.description?.replace(/<[^>]+>/g, " ").slice(0, 160) || `Buy ${product.name} online.`} />
        <meta property="og:title" content={product.name} />
        <meta property="og:description" content={product.description?.replace(/<[^>]+>/g, " ").slice(0, 200) || ""} />
        <meta property="og:image" content={getProductImageSrc(images[0])} />
        <meta property="og:type" content="product" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href={`https://kdfplus.pk/products/${(product as any).slug || product.id}`} />
        <meta property="og:url" content={`https://kdfplus.pk/products/${(product as any).slug || product.id}`} />
        <meta property="og:site_name" content="KDF Plus" />
        <meta name="twitter:title" content={product.metaTitle || product.name} />
        <meta name="twitter:description" content={product.metaDescription || product.description?.replace(/<[^>]+>/g, " ").slice(0, 160) || `Buy ${product.name} online.`} />
        {getProductImageSrc(images[0]) && <meta name="twitter:image" content={getProductImageSrc(images[0])} />}
        <meta property="product:price:amount" content={String(price)} />
        <meta property="product:price:currency" content="PKR" />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <main className="mx-auto w-full max-w-[min(100%,80rem)] px-4 py-8 pb-36 sm:px-6 sm:py-10 sm:pb-28 lg:px-8 lg:pb-12">
        {/* Breadcrumb */}
        <nav className="mb-8 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground sm:mb-9">
          <button onClick={() => setLocation("/")} className="hover:text-primary transition-colors" data-testid="breadcrumb-home">Home</button>
          <span>/</span>
          <button onClick={() => setLocation("/products")} className="hover:text-primary transition-colors" data-testid="breadcrumb-products">Products</button>
          {(product as any).category && (<><span>/</span><button onClick={() => setLocation(`/products?categoryId=${(product as any).category?.id}`)} className="hover:text-primary transition-colors">{(product as any).category.name}</button></>)}
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-[200px]">{product.name}</span>
        </nav>

        {/* 2-column grid — min-w-0 prevents flex/grid overflow at high zoom; gallery width capped for stable aspect-square */}
        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start lg:gap-x-10 lg:gap-y-8 xl:gap-x-12 2xl:gap-x-14">
          {/* Left: Images */}
          <div className="min-w-0">
            <div className="mx-auto w-full max-w-[min(100%,26rem)] space-y-3 sm:max-w-[min(100%,28rem)] lg:mx-0 lg:max-w-[min(100%,32rem)] xl:max-w-[min(100%,36rem)]">
            <div
              ref={imgRef}
              className="relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-2xl border border-gray-100/90 bg-muted/20 shadow-md ring-1 ring-black/[0.04] lg:rounded-[1.75rem] lg:shadow-xl"
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
            <ProductGalleryEngagementZone
              productId={productId}
              productName={product.name}
              discountPercent={discount}
              stock={product.stock}
              marqueeProducts={galleryEngagementProducts}
              apiCategories={galleryCategories}
              getImageSrc={getProductImageSrc}
              onProductNavigate={(p) => setLocation(`/products/${p.slug || p.id}`)}
              onQuickAdd={handleQuickAddGallery}
              onPathNavigate={(path) => setLocation(path)}
            />
          </div>

          {/* Right: Info — sticky glass buy column (no vh max-height: avoids zoom / OS scaling layout jumps) */}
          <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:z-10 lg:self-start lg:gap-5 lg:rounded-[1.75rem] lg:border lg:border-gray-100/90 lg:bg-white/90 lg:p-6 lg:shadow-xl lg:shadow-slate-900/[0.06] lg:ring-1 lg:ring-black/[0.04] lg:backdrop-blur-xl xl:p-7">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {product.tags?.map((tag) => (<Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>))}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => setIsWishlisted(w => !w)} className={`p-2 rounded-full transition-all ${isWishlisted ? "text-red-500 bg-red-50" : "text-muted-foreground hover:bg-muted"}`} title="Add to wishlist">
                  <Heart className="w-5 h-5" fill={isWishlisted ? "currentColor" : "none"} />
                </button>
                <button onClick={handleShare} className="p-2 rounded-full text-muted-foreground hover:bg-muted transition-colors" title="Share"><Share2 className="w-5 h-5" /></button>
              </div>
            </div>

            <h1
              className="font-black leading-[1.15] tracking-tight text-foreground [text-wrap:balance] sm:leading-tight"
              style={{ fontSize: "clamp(1.375rem, 0.35rem + 2.8vw, 2.25rem)" }}
              data-testid="text-product-name"
            >
              {product.name}
            </h1>

            {product.rating && Number(product.rating) > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">{Array.from({ length: 5 }).map((_, i) => (<Star key={i} className={`w-4 h-4 ${i < Math.round(parseFloat(product.rating!)) ? "fill-yellow-400 text-yellow-400" : "text-muted"}`} />))}</div>
                <span className="text-sm font-semibold">{Number(product.rating).toFixed(1)}</span>
                {product.reviewCount > 0 && (<button onClick={() => { setOpenSection("reviews"); setReviewsLoaded(true); }} className="text-sm text-muted-foreground hover:text-primary transition-colors">({product.reviewCount} reviews)</button>)}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <span
                className="font-black tracking-tight text-foreground"
                style={{ fontSize: "clamp(1.5rem, 0.9rem + 2vw, 2.25rem)" }}
                data-testid="text-price"
              >
                Rs. {price.toLocaleString()}
              </span>
              {originalPrice && originalPrice > price && <span className="text-base text-muted-foreground line-through sm:text-lg">Rs. {originalPrice.toLocaleString()}</span>}
              {discount && <Badge className="bg-[#5FA800]/10 text-[#5FA800] border border-[#5FA800]/30 font-bold">{discount}% OFF</Badge>}
            </div>

            <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border w-fit ${stockStatus.cls}`}>
              <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: product.stock === 0 ? "#ef4444" : product.stock < 10 ? "#f97316" : "#16a34a" }} />
              {stockStatus.label}
            </div>

            {(product as any).weight && <p className="text-sm text-muted-foreground">Weight: <span className="font-medium">{(product as any).weight} {(product as any).unit || ""}</span></p>}

            <Separator />

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (() => {
              const order: string[] = []; const map = new Map<string, typeof product.variants>();
              for (const v of product.variants) { if (!map.has(v.name)) { map.set(v.name, []); order.push(v.name); } map.get(v.name)!.push(v); }
              const groups = order.map(t => ({ type: t, items: map.get(t)! }));
              return (
                <div className="space-y-4">
                  {groups.map(({ type, items }) => (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-2.5">
                        <p className="text-sm font-semibold text-foreground">{type}</p>
                        {activeVariant && items.some(v => v.id === activeVariant.id) && activeVariant.price && (<span className="text-sm font-bold text-[#5FA800]">Rs. {parseFloat(activeVariant.price).toLocaleString()}</span>)}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {items.map((v) => {
                          const isSelected = selectedVariant === v.id; const outOfStock = v.stock === 0;
                          return (
                            <button key={v.id} onClick={() => !outOfStock && setSelectedVariant(v.id)} disabled={outOfStock}
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
              );
            })()}

            {/* Quantity */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold">Quantity</span>
              <div className="flex items-center gap-2 border border-border rounded-xl px-2 py-1">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center disabled:opacity-40 hover:bg-muted/80" data-testid="button-qty-decrement"><Minus className="w-3.5 h-3.5" /></button>
                <span className="w-8 text-center font-bold text-sm" data-testid="text-qty">{qty}</span>
                <button onClick={() => setQty((q) => Math.min(product.stock, q + 1))} disabled={qty >= product.stock} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center disabled:opacity-40 hover:bg-muted/80" data-testid="button-qty-increment"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <span className="text-sm font-bold text-[#5FA800]">Rs. {(price * qty).toLocaleString()}</span>
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

            {/* CTA — desktop (intersection anchor for sticky repurchase bar) */}
            <div ref={desktopCtaRef} className="hidden gap-3 lg:flex">
              <Button size="lg" variant="outline" className="flex-1 rounded-xl border-2 font-semibold shadow-sm transition-[transform,box-shadow] duration-300 hover:scale-[1.02] hover:border-[#5FA800]/35 hover:shadow-md active:scale-[0.98]" onClick={handleAddToCart} disabled={product.stock === 0} data-testid="button-add-to-cart">
                <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
              </Button>
              <Button size="lg" className="flex-1 rounded-xl font-semibold shadow-lg shadow-[#5FA800]/25 transition-[transform,box-shadow] duration-300 hover:scale-[1.02] active:scale-[0.98]" onClick={handleBuyNow} disabled={product.stock === 0} style={{ background: "linear-gradient(135deg, #5FA800 0%, #3d7000 100%)" }} data-testid="button-buy-now">
                <Zap className="mr-2 h-4 w-4" /> Buy Now
              </Button>
            </div>

            {/* Notify Me When Available — desktop */}
            {product.stock === 0 && !bidData?.isLive && (
              <div className="hidden lg:block">
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

            <ProductConversionRail
              productId={productId}
              stock={product.stock}
              pairs={pairItems}
              getImageSrc={getProductImageSrc}
              onPairClick={(p) => setLocation(`/products/${p.slug || p.id}`)}
            />
          </div>
        </div>

        {/* ── Accordion: Description / Reviews / Shipping ── */}
        <div className="mt-10 space-y-3">
          {accordionSections.map(({ key, emoji, label, count }) => {
            const isOpen = openSection === key;
            return (
              <div key={key} className="overflow-hidden rounded-2xl border border-gray-100/90 bg-card shadow-md ring-1 ring-black/[0.03] md:rounded-[1.75rem] md:shadow-lg md:ring-black/[0.04]">
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
                    <div className="px-5 pb-6 pt-2 border-t border-border/40">

                      {key === "description" && (
                        product.description ? (
                          <>
                            <div
                              className="prose prose-sm max-w-3xl text-foreground leading-relaxed [&_p]:mb-3 [&_ul]:pl-5 [&_ul]:space-y-1 [&_li]:list-disc [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_strong]:font-semibold overflow-hidden"
                              style={!descExpanded ? { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}}
                              dangerouslySetInnerHTML={{ __html: product.description }}
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

        {/* Related Products */}
        <RelatedProducts currentId={productId} />
      </main>

      <StickyPurchaseConfidenceLg
        visible={!!product && product.stock > 0 && !bidData?.isLive && !desktopCtaInView}
        price={price}
        qty={qty}
        name={product.name}
        onAdd={handleAddToCart}
        onBuy={handleBuyNow}
        disabled={product.stock === 0}
      />

      {/* Sticky mobile CTA — compact premium */}
      <div className="kdf-suppress-for-fullscreen-sheet fixed left-0 right-0 z-[500] lg:hidden bg-white/96 backdrop-blur-md border-t border-gray-100 px-3 py-2 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] sm:bottom-0"
        style={{ bottom: "calc(var(--mobile-nav-h) + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* Price + name strip */}
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <p className="text-[11px] text-gray-400 truncate max-w-[55%]">{product.name}</p>
          <p className="text-sm font-extrabold" style={{ color: "#5FA800" }}>Rs. {price.toLocaleString()}</p>
        </div>
        {/* Buttons */}
        {product.stock === 0 && !bidData?.isLive ? (
          <button
            onClick={() => setNotifyOpen(true)}
            data-testid="button-notify-me-mobile"
            className="w-full h-9 rounded-xl text-xs font-semibold border-2 border-orange-300 text-orange-600 flex items-center justify-center gap-1.5 bg-orange-50 transition-all active:scale-[0.98]"
          >
            <Bell className="w-3.5 h-3.5" /> Notify Me When Available
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleAddToCart}
              disabled={product.stock === 0}
              data-testid="button-add-to-cart-mobile"
              className="flex-1 h-9 rounded-xl text-xs font-semibold border-2 border-gray-200 text-gray-700 flex items-center justify-center gap-1.5 bg-white transition-all active:scale-[0.98] hover:border-gray-400 disabled:opacity-40"
            >
              <ShoppingCart className="w-3.5 h-3.5" /> Add to Cart
            </button>
            <button
              onClick={handleBuyNow}
              disabled={product.stock === 0}
              data-testid="button-buy-now-mobile"
              className="flex-[1.4] h-9 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #5FA800 0%, #3d7000 100%)" }}
            >
              <Zap className="w-3.5 h-3.5" /> Buy Now
            </button>
          </div>
        )}
      </div>

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
