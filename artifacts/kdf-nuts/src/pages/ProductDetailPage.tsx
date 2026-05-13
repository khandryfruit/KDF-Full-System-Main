import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Share2, Heart, Star, Minus, Plus, RotateCcw, Lock, Truck, Package, ShoppingCart, Check, X, Send, Loader2, ChevronDown, MapPin, Clock, Shield, Bell, Gavel, Timer, TrendingUp, ImagePlus, Camera, MessageCircle } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getProductImageSrc } from '../lib/imageUrl';
import { useLocation, useParams } from 'wouter';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useListProducts } from '@workspace/api-client-react';

const BASE_URL = import.meta.env.BASE_URL ?? '/';
const API_BASE = "/api";

/* ─── Mini Cart Drawer ────────────────────────────────── */
interface MiniCartProps {
  visible: boolean;
  onClose: () => void;
  product: { id: number; name: string; price: number; gradient: string; image?: string };
  qty: number;
  cartTotal: number;
  cartCount: number;
  onViewCart: () => void;
  onCheckout: () => void;
}

function MiniCartDrawer({ visible, onClose, product, qty, cartTotal, cartCount, onViewCart, onCheckout }: MiniCartProps) {
  const [rendered, setRendered] = useState(false);
  useEffect(() => { if (visible) setRendered(true); }, [visible]);
  if (!rendered && !visible) return null;
  const imgSrc = product.image ? getProductImageSrc(product.image) : null;

  return (
    <>
      <div onClick={onClose} className={`fixed inset-0 z-[60] bg-black/40 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />
      <div className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-[70] transition-transform duration-300 ease-out ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        onTransitionEnd={() => { if (!visible) setRendered(false); }}>
        <div className="bg-white rounded-t-3xl shadow-2xl overflow-hidden">
          <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#5FA800] flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
              </div>
              <span className="font-bold text-gray-900 text-sm">Added to Cart!</span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"><X className="w-4 h-4 text-gray-500" /></button>
          </div>
          <div className="flex items-center gap-3.5 px-5 py-4">
            <div className={`w-16 h-16 rounded-2xl flex-shrink-0 overflow-hidden bg-gradient-to-br ${product.gradient}`}>
              {imgSrc && <img src={imgSrc} alt={product.name} className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm leading-snug truncate">{product.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">Qty: {qty}</p>
              <p className="text-[#5FA800] font-bold text-base mt-1">₨{(product.price * qty).toLocaleString()}</p>
            </div>
          </div>
          <div className="mx-5 mb-4 bg-[#F8F9FB] rounded-2xl px-4 py-3 flex items-center justify-between">
            <div><p className="text-[11px] text-gray-400 font-medium">Cart Total</p><p className="font-bold text-gray-900 text-base">₨{cartTotal.toLocaleString()}</p></div>
            <div className="text-right"><p className="text-[11px] text-gray-400 font-medium">Items</p><p className="font-bold text-gray-900 text-base">{cartCount}</p></div>
          </div>
          <div className="px-5 pb-6 grid grid-cols-2 gap-2.5">
            <button onClick={onClose} className="py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-sm transition-colors">Continue</button>
            <button onClick={onViewCart} className="py-3 rounded-xl border-2 border-[#5FA800]/40 bg-[#5FA800]/5 text-[#5FA800] font-semibold text-sm transition-colors">View Cart</button>
            <button onClick={onCheckout} className="col-span-2 py-3.5 rounded-xl bg-[#5FA800] text-white font-bold text-[15px] shadow-[0_3px_12px_rgba(95,168,0,0.30)] active:scale-[0.98] transition-all">
              Checkout  ₨{cartTotal.toLocaleString()}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Star Picker ─────────────────────────────────────── */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="transition-transform active:scale-90">
          <Star className={`w-7 h-7 transition-colors ${n <= (hover || value) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} />
        </button>
      ))}
    </div>
  );
}

/* ─── Reviews Section ─────────────────────────────────── */
interface Review { id: number; name: string; rating: number; comment: string; images?: string[]; createdAt: string; }

function ReviewsSection({ productId, productName }: { productId: number; productName: string }) {
  const [form, setForm] = useState({ name: '', email: '', rating: 0, comment: '' });
  const [submitted, setSubmitted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [reviewImages, setReviewImages] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: reviews = [], refetch } = useQuery<Review[]>({
    queryKey: ['reviews', productId],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/products/${productId}/reviews`);
      if (!r.ok) throw new Error('Failed to load reviews');
      return r.json();
    },
  });

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setReviewImages(prev => [...prev, ...files].slice(0, 3));
    e.target.value = '';
  };

  const submitMut = useMutation({
    mutationFn: async () => {
      setUploading(true);
      const imagePaths: string[] = [];
      for (const file of reviewImages) {
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch(`${API_BASE}/uploads/review-image`, { method: 'POST', body: fd });
        if (r.ok) { const d = await r.json(); imagePaths.push(d.objectPath); }
      }
      setUploading(false);
      const r = await fetch(`${API_BASE}/products/${productId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, rating: form.rating, comment: form.comment, images: imagePaths }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to submit review');
      }
      return r.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      setForm({ name: '', email: '', rating: 0, comment: '' });
      setReviewImages([]);
      setSubmitError('');
      refetch();
    },
    onError: (e: Error) => { setUploading(false); setSubmitError(e.message); },
  });

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div className="bg-white px-4 py-5 mb-2">
      {/* Lightbox */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-[90] bg-black/90 flex items-center justify-center" onClick={() => setLightboxSrc(null)}>
          <button className="absolute top-4 right-4 text-white z-10" onClick={() => setLightboxSrc(null)}>
            <X className="w-7 h-7" />
          </button>
          <img src={lightboxSrc} alt="Review photo" className="max-h-[88vh] max-w-[92vw] object-contain rounded-xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900">Reviews</h3>
        <div className="flex items-center gap-1.5">
          {reviews.length > 0 && (
            <>
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-3.5 h-3.5 ${i < Math.round(avgRating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} />
                ))}
              </div>
              <span className="text-xs font-bold text-gray-800">{avgRating.toFixed(1)}</span>
              <span className="text-[11px] text-gray-400">({reviews.length})</span>
            </>
          )}
          <button
            onClick={() => setShowForm(f => !f)}
            className="ml-2 text-[11px] font-semibold text-[#5FA800] border border-[#5FA800]/30 bg-[#5FA800]/5 px-2.5 py-1 rounded-full active:bg-[#5FA800]/10 transition-colors"
          >
            {showForm ? 'Cancel' : '+ Write Review'}
          </button>
        </div>
      </div>

      {/* Write review form */}
      {showForm && (
        <div className="bg-[#F8F9FB] rounded-2xl p-4 mb-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Review for {productName}</p>
          <div>
            <label className="text-[11px] font-semibold text-gray-400 mb-1 block">Your Rating *</label>
            <StarPicker value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-400 mb-1 block">Your Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Doe" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#5FA800] bg-white" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-400 mb-1 block">Email (optional)</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#5FA800] bg-white" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-400 mb-1 block">Comment *</label>
            <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} placeholder="Share your honest experience…" rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#5FA800] bg-white resize-none" />
          </div>
          {/* Image upload */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 mb-2 flex items-center gap-1 block">
              <Camera className="w-3 h-3" /> Add Photos (optional, up to 3)
            </label>
            <div className="flex flex-wrap gap-2">
              {reviewImages.map((f, i) => (
                <div key={i} className="relative w-14 h-14 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0">
                  <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => setReviewImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center">
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ))}
              {reviewImages.length < 3 && (
                <button onClick={() => fileRef.current?.click()} className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-0.5 text-gray-400 active:bg-gray-50 transition-colors flex-shrink-0">
                  <ImagePlus className="w-4 h-4" />
                  <span className="text-[9px] font-medium">Add</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImagePick} className="hidden" />
          </div>
          {submitError && <p className="text-xs text-red-500">{submitError}</p>}
          {submitted ? (
            <div className="text-center py-2">
              <p className="text-sm font-semibold text-[#5FA800]">🎉 Thanks! Your review is pending approval.</p>
              <button onClick={() => { setSubmitted(false); setShowForm(false); }} className="text-xs text-gray-400 mt-1 underline">Done</button>
            </div>
          ) : (
            <button
              onClick={() => submitMut.mutate()}
              disabled={submitMut.isPending || uploading || !form.name || !form.comment || form.rating === 0}
              className="w-full py-3 rounded-xl bg-[#5FA800] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all shadow-[0_2px_8px_rgba(95,168,0,0.28)]"
            >
              {(submitMut.isPending || uploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {uploading ? 'Uploading…' : 'Submit Review'}
            </button>
          )}
        </div>
      )}

      {/* Reviews list */}
      {reviews.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-gray-400">No reviews yet.</p>
          <p className="text-xs text-gray-300 mt-0.5">Be the first to review this product!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="bg-[#F8F9FB] rounded-2xl p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#5FA800]/10 flex items-center justify-center text-xs font-bold text-[#5FA800]">
                    {r.name[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{r.name}</span>
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`w-3 h-3 ${i < r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} />
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{r.comment}</p>
              {r.images && r.images.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {r.images.map((img, i) => (
                    <button key={i} onClick={() => setLightboxSrc(`${API_BASE}${img}`)} className="w-12 h-12 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0 active:opacity-70 transition-opacity">
                      <img src={`${API_BASE}${img}`} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-300 mt-1.5">
                {new Date(r.createdAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Product Accordion (Description / Reviews / Shipping) ── */
function ProductAccordion({ product, productId }: { product: any; productId: number }) {
  const [open, setOpen] = useState<'description' | 'reviews' | 'shipping' | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);

  const toggle = (tab: 'description' | 'reviews' | 'shipping') => {
    setOpen(prev => {
      if (prev === tab) return null;
      if (tab === 'reviews') setReviewsLoaded(true);
      return tab;
    });
  };

  const sections: Array<{ id: 'description' | 'reviews' | 'shipping'; emoji: string; label: string; count?: number }> = [
    { id: 'description', emoji: '📄', label: 'Description' },
    { id: 'reviews',     emoji: '⭐', label: 'Reviews', count: product.reviewCount ?? 0 },
    { id: 'shipping',    emoji: '🚚', label: 'Shipping & Returns' },
  ];

  return (
    <div className="px-3 pb-4 space-y-2">
      {sections.map(({ id, emoji, label, count }) => {
        const isOpen = open === id;
        return (
          <div key={id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header */}
            <button
              onClick={() => toggle(id)}
              className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50 transition-colors"
            >
              <span className="text-[18px] leading-none flex-shrink-0">{emoji}</span>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-sm font-bold text-gray-900">{label}</span>
                {count != null && count > 0 && (
                  <span className="text-[10px] font-bold bg-[#5FA800]/10 text-[#5FA800] px-2 py-0.5 rounded-full flex-shrink-0">{count}</span>
                )}
              </div>
              <ChevronDown
                className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-300"
                style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>

            {/* Animated body — CSS grid trick for smooth height animation */}
            <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.28s ease' }}>
              <div style={{ overflow: 'hidden' }}>
                <div className="px-4 pb-5 pt-1 border-t border-gray-50">

                  {id === 'description' && (
                    product.description ? (
                      <>
                        <div
                          className={`prose prose-sm max-w-none text-gray-600 leading-relaxed [&_p]:mb-2.5 [&_ul]:pl-4 [&_ul]:space-y-1 [&_li]:list-disc [&_strong]:font-semibold text-sm overflow-hidden transition-all duration-300`}
                          style={{ WebkitLineClamp: descExpanded ? 'unset' : 3, display: '-webkit-box', WebkitBoxOrient: descExpanded ? 'unset' : 'vertical', overflow: descExpanded ? 'visible' : 'hidden' }}
                          dangerouslySetInnerHTML={{ __html: product.description }}
                        />
                        <button
                          onClick={e => { e.stopPropagation(); setDescExpanded(v => !v); }}
                          className="mt-2.5 text-xs font-bold flex items-center gap-1 transition-colors"
                          style={{ color: '#5FA800' }}
                        >
                          {descExpanded ? 'Show Less ↑' : 'Read More ↓'}
                        </button>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">No description available.</p>
                    )
                  )}

                  {id === 'reviews' && reviewsLoaded && (
                    <ReviewsSection productId={productId} productName={product.name} />
                  )}
                  {id === 'reviews' && !reviewsLoaded && (
                    <div className="py-4 text-center text-sm text-gray-400">Loading reviews…</div>
                  )}

                  {id === 'shipping' && (
                    <div className="space-y-2.5">
                      {[
                        { icon: <Truck className="w-4 h-4" />, title: 'Standard Delivery', body: '3–5 business days nationwide. Free on orders above Rs. 1,500. Rs. 150 fee on smaller orders.' },
                        { icon: <Clock className="w-4 h-4" />, title: 'Same-Day (Karachi & Lahore)', body: 'Order before 12 PM. Additional charges may apply.' },
                        { icon: <RotateCcw className="w-4 h-4" />, title: '7-Day Easy Returns', body: 'Damaged or incorrect items? Contact support to start a hassle-free return.' },
                        { icon: <Shield className="w-4 h-4" />, title: 'Secure Payments', body: 'Cash on Delivery and bank transfer accepted. All transactions are secure.' },
                        { icon: <MapPin className="w-4 h-4" />, title: 'Delivery Coverage', body: 'All major cities: Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad & more.' },
                        { icon: <Package className="w-4 h-4" />, title: 'Premium Packaging', body: 'Food-safe airtight packaging for maximum freshness and shelf life.' },
                      ].map(({ icon, title, body }) => (
                        <div key={title} className="flex gap-3 p-3 bg-gray-50 rounded-xl">
                          <div className="w-7 h-7 rounded-lg bg-[#5FA800]/10 flex items-center justify-center text-[#5FA800] flex-shrink-0">{icon}</div>
                          <div>
                            <p className="text-xs font-bold text-gray-800 mb-0.5">{title}</p>
                            <p className="text-xs text-gray-500 leading-relaxed">{body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Product Detail Page ─────────────────────────────── */
export function ProductDetailPage() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const { addItem, totalItems, totalPrice } = useCart();
  const { toggleItem, isInWishlist } = useWishlist();

  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [addedBounce, setAddedBounce] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyForm, setNotifyForm] = useState({ name: "", email: "", phone: "" });
  const [notifyDone, setNotifyDone] = useState(false);
  const [showBidForm, setShowBidForm] = useState(false);
  const [bidForm, setBidForm] = useState({ bidderName: "", bidderPhone: "", amount: "" });

  /* Supports both /product/123 (ID) and /product/premium-almonds (slug) */
  /* Route is /products/:slug — fall back to .id for legacy /product/:id links */
  const param = (params as any).slug ?? (params as any).id ?? "";
  const { data: product, isLoading, isError } = useQuery({
    queryKey: ["product", param],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/products/${encodeURIComponent(param)}`);
      if (!r.ok) throw new Error("Product not found");
      const data = await r.json();
      const canonicalSlug = r.headers.get("X-Canonical-Slug");
      return { ...data, _canonicalSlug: canonicalSlug };
    },
    enabled: !!param,
    staleTime: 60_000,
    retry: 1,
  });

  const productId: number = (product as any)?.id ?? 0;
  const { data: relatedData } = useListProducts({ limit: 8 });
  const relatedProducts = (relatedData?.items ?? []).filter((p: any) => p.id !== productId).slice(0, 4);

  const { data: bidData, refetch: refetchBid } = useQuery({
    queryKey: ["bids-nuts", productId],
    queryFn: () => fetch(`${API_BASE}/bids/${productId}`).then(r => r.json()),
    enabled: !!productId,
    refetchInterval: 30000,
  });

  const notifyMutation = useMutation({
    mutationFn: (data: any) => fetch(`${API_BASE}/restock/notify`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); return d; }),
    onSuccess: () => setNotifyDone(true),
  });

  const bidMutation = useMutation({
    mutationFn: (data: any) => fetch(`${API_BASE}/bids/${productId}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); return d; }),
    onSuccess: () => {
      setShowBidForm(false); setBidForm({ bidderName: "", bidderPhone: "", amount: "" }); refetchBid();
    },
  });

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [productId]);

  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [productId, selectedImageIndex]);

  useEffect(() => {
    if (!product) return;
    const variants = (product as any).variants as any[] | undefined;
    if (variants && variants.length > 0) {
      const first = variants.find((v: any) => v.stock !== 0) ?? variants[0];
      setSelectedVariant(first.id);
    } else {
      setSelectedVariant(null);
    }
  }, [product?.id]);

  /* ── SEO: silently replace legacy/unclean slug in the browser URL ── */
  useEffect(() => {
    if (!product) return;
    const canonicalSlug = (product as any)._canonicalSlug as string | null;
    if (!canonicalSlug) return;
    // Use BASE_URL (e.g. /kdf-nuts/) to build the correct canonical path.
    // window.history.replaceState silently updates the address bar without any
    // page reload, so the user sees the clean URL and shares/bookmarks will use it.
    const base = (BASE_URL || "/").replace(/\/$/, "");
    window.history.replaceState(null, "", `${base}/products/${canonicalSlug}`);
  }, [product]);

  /* ── SEO: dynamic page title, meta tags, canonical, JSON-LD ── */
  useEffect(() => {
    if (!product) return;
    const slug = (product as any).slug || product.id;
    const canonicalBase = "https://khanbabadryfruits.com";
    const pageUrl = `${canonicalBase}/products/${slug}`;
    const title = (product as any).meta_title || `${product.name} | KDF NUTS`;
    const rawDesc = (product as any).meta_description
      || (product as any).description?.replace(/<[^>]+>/g, "").slice(0, 160)
      || `Buy ${product.name} online from KDF NUTS. Premium quality dry fruits delivered across Pakistan.`;
    const desc = rawDesc.slice(0, 160);

    const images: string[] = (product as any).images ?? [];
    const firstImage = images[0];
    const imgUrl = firstImage
      ? (firstImage.startsWith("http") ? firstImage : `${canonicalBase}/api/storage/objects/${firstImage}`)
      : "";

    const price = Number(product.price);
    const inStock = ((product as any).stock ?? 1) > 0;

    document.title = title;

    /* helper: upsert a <meta> tag */
    const setMeta = (name: string, content: string, prop = false) => {
      const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let el = document.querySelector<HTMLMetaElement>(sel);
      if (!el) {
        el = document.createElement("meta");
        prop ? el.setAttribute("property", name) : el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    /* helper: upsert <link rel="canonical"> */
    const setCanonical = (url: string) => {
      let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!el) { el = document.createElement("link"); el.setAttribute("rel", "canonical"); document.head.appendChild(el); }
      el.setAttribute("href", url);
    };

    /* helper: upsert JSON-LD */
    const setJsonLd = (data: object) => {
      const id = "product-jsonld";
      let el = document.getElementById(id);
      if (!el) { el = document.createElement("script"); el.id = id; el.setAttribute("type", "application/ld+json"); document.head.appendChild(el); }
      el.textContent = JSON.stringify(data);
    };

    /* Standard meta */
    setMeta("description", desc);
    setMeta("keywords", `${product.name}, dry fruits, nuts, KDF NUTS, buy online Pakistan`);
    setMeta("robots", "index, follow");

    /* Canonical */
    setCanonical(pageUrl);

    /* Open Graph */
    setMeta("og:type",         "product",  true);
    setMeta("og:title",        title,      true);
    setMeta("og:description",  desc,       true);
    setMeta("og:url",          pageUrl,    true);
    setMeta("og:site_name",    "KDF NUTS", true);
    setMeta("og:locale",       "en_PK",    true);
    setMeta("product:price:amount",   String(price),    true);
    setMeta("product:price:currency", "PKR",            true);
    if (imgUrl) {
      setMeta("og:image",       imgUrl,  true);
      setMeta("og:image:width", "800",   true);
      setMeta("og:image:height","800",   true);
      setMeta("og:image:alt",   product.name, true);
    }

    /* Twitter Card */
    setMeta("twitter:card",        imgUrl ? "summary_large_image" : "summary");
    setMeta("twitter:title",       title);
    setMeta("twitter:description", desc);
    setMeta("twitter:site",        "@kdfnuts");
    if (imgUrl) setMeta("twitter:image", imgUrl);

    /* JSON-LD Product Schema */
    setJsonLd({
      "@context":   "https://schema.org",
      "@type":      "Product",
      name:         product.name,
      description:  rawDesc,
      url:          pageUrl,
      ...(imgUrl && { image: [imgUrl] }),
      brand:        { "@type": "Brand", name: "KDF NUTS" },
      offers: {
        "@type":         "Offer",
        url:             pageUrl,
        priceCurrency:   "PKR",
        price:           price.toFixed(2),
        availability:    inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        seller:          { "@type": "Organization", name: "KDF NUTS" },
      },
      ...(Number(product.rating) > 0 && {
        aggregateRating: {
          "@type":       "AggregateRating",
          ratingValue:   Number(product.rating).toFixed(1),
          reviewCount:   (product as any).reviewCount ?? 1,
          bestRating:    "5",
          worstRating:   "1",
        },
      }),
    });

    return () => {
      document.title = "KDF NUTS";
      document.getElementById("product-jsonld")?.remove();
      /* reset canonical back to site root so stale product URL never lingers */
      const canon = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (canon) canon.href = "https://khanbabadryfruits.com";
    };
  }, [product]);

  if (isLoading) {
    return (
      <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] flex flex-col font-sans">
        <div className="sticky top-0 z-50 bg-white px-4 py-3 flex items-center border-b border-gray-100">
          <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
          <div className="flex-1 flex justify-center"><div className="w-28 h-4 bg-gray-100 rounded-full animate-pulse" /></div>
          <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
        </div>
        <div className="w-full aspect-square bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 animate-pulse" />
        <div className="bg-white px-4 py-5 space-y-3">
          <div className="w-16 h-5 bg-gray-100 rounded-full animate-pulse" />
          <div className="w-3/4 h-6 bg-gray-100 rounded-lg animate-pulse" />
          <div className="w-1/2 h-8 bg-gray-100 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <Package className="w-12 h-12 text-gray-300" />
          <p className="text-gray-800 font-semibold">Product not found</p>
          <button onClick={() => window.history.back()} className="text-[#5FA800] font-bold text-sm">Go Back</button>
        </div>
      </div>
    );
  }

  const allVariants = (product as any).variants as any[] | undefined;
  const activeVariant = allVariants?.find((v: any) => v.id === selectedVariant);
  const price = activeVariant?.price ? Number(activeVariant.price) : Number(product.price);
  const originalPrice = product.originalPrice ? Number(product.originalPrice) : null;
  const discount = originalPrice && originalPrice > price
    ? Math.round(((originalPrice - price) / originalPrice) * 100) : null;
  const images = (product as any).images ?? [];
  const currentImage = images[selectedImageIndex];
  const imageSrc = getProductImageSrc(currentImage);

  const handleAddToCart = () => {
    addItem({ id: product.id, name: product.name, variant: activeVariant?.value ?? 'Standard', variantId: activeVariant?.id, price, qty: quantity, gradient: (product as any).gradient || 'from-green-400 to-emerald-600', image: currentImage });
    setAddedBounce(true);
    setTimeout(() => setAddedBounce(false), 600);
    setDrawerVisible(true);
  };

  const handleBuyNow = () => {
    addItem({ id: product.id, name: product.name, variant: activeVariant?.value ?? 'Standard', variantId: activeVariant?.id, price, qty: quantity, gradient: (product as any).gradient || 'from-green-400 to-emerald-600', image: currentImage });
    setLocation('/checkout');
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: product.name, url });
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
  };

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] flex flex-col font-sans relative pb-[140px]">

      {/* Top Navigation */}
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors">
          <ChevronLeft className="w-6 h-6 text-gray-800" />
        </button>
        <h1 className="text-[17px] font-semibold text-gray-900 truncate max-w-[200px]">Product Details</h1>
        <div className="flex items-center gap-1 -mr-2">
          <button onClick={handleShare} className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors">
            <Share2 className="w-5 h-5 text-gray-800" />
          </button>
          <button
            onClick={() => toggleItem({ id: product.id, name: product.name, price, gradient: (product as any).gradient || 'from-green-400 to-emerald-600' })}
            className={`p-2 rounded-full transition-all duration-150 ${isInWishlist(product.id) ? 'text-red-500 scale-110' : 'hover:bg-gray-100 text-gray-800'}`}
          >
            <Heart className="w-5 h-5" fill={isInWishlist(product.id) ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto pb-[76px] hide-scrollbar flex-1">

        {/* Product Image */}
        <div className={`relative w-full bg-gradient-to-br ${(product as any).gradient || 'from-green-400 to-emerald-600'} overflow-hidden`} style={{ aspectRatio: '1 / 1', maxHeight: '430px' }}>
          {!imgLoaded && !imgError && imageSrc && (
            <div className="absolute inset-0 bg-gradient-to-br from-gray-100 via-gray-200 to-gray-100 animate-pulse" />
          )}
          {imageSrc && !imgError ? (
            <img
              key={imageSrc}
              src={imageSrc}
              alt={product.name}
              className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => { setImgError(true); setImgLoaded(true); }}
              loading="eager"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Package className="w-16 h-16 text-white/30" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/5 pointer-events-none" />
          {discount && (
            <div className="absolute top-3 left-3 bg-[#F58300] text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-md">
              {discount}% OFF
            </div>
          )}
          {/* Dot navigation */}
          {images.length > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {images.map((_: any, i: number) => (
                <button key={i} onClick={() => setSelectedImageIndex(i)}
                  className={`transition-all duration-200 rounded-full ${i === selectedImageIndex ? 'w-5 h-2 bg-[#5FA800]' : 'w-2 h-2 bg-white/70'}`} />
              ))}
            </div>
          )}
        </div>

        {/* Thumbnail strip */}
        {images.length > 1 && (
          <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-white border-b border-gray-100 hide-scrollbar">
            {images.map((img: string, i: number) => (
              <button key={i} onClick={() => setSelectedImageIndex(i)}
                className={`flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${i === selectedImageIndex ? 'border-[#5FA800] shadow-md scale-105' : 'border-gray-200'}`}>
                <img src={getProductImageSrc(img) ?? ''} alt={`view ${i + 1}`} className="w-full h-full object-cover" loading="lazy"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              </button>
            ))}
          </div>
        )}

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1.5 px-4 py-2 bg-[#F8F9FB] text-[11px] text-gray-400 overflow-hidden">
          <button onClick={() => setLocation('/home')} className="hover:text-[#5FA800] transition-colors flex-shrink-0">Home</button>
          <span>/</span>
          <button onClick={() => setLocation('/products')} className="hover:text-[#5FA800] transition-colors flex-shrink-0">Products</button>
          <span>/</span>
          <span className="text-gray-600 font-medium truncate">{product.name}</span>
        </div>

        {/* Product Info */}
        <div className="bg-white px-4 py-4 mb-2">
          <div className="flex items-start justify-between mb-2">
            {/* Stock badge */}
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              product.stock === 0 ? 'text-red-500 border-red-400/40 bg-red-50'
              : product.stock < 10 ? 'text-orange-500 border-orange-400/40 bg-orange-50'
              : 'text-[#5FA800] border-[#5FA800]/40 bg-[#5FA800]/5'
            }`}>
              {product.stock === 0 ? 'Out of Stock' : product.stock < 10 ? `Low Stock — ${product.stock} left` : `In Stock (${product.stock})`}
            </span>
            {product.rating && Number(product.rating) > 0 && (
              <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="text-xs font-bold text-amber-700">{Number(product.rating).toFixed(1)}</span>
                <span className="text-[10px] text-amber-500/70">({product.reviewCount})</span>
              </div>
            )}
          </div>
          <h2 className="text-[20px] font-bold text-gray-900 leading-snug mb-3">{product.name}</h2>
          <div className="flex items-end gap-2 mb-1">
            <span className="text-[26px] font-bold text-[#5FA800] leading-none">₨{price.toLocaleString()}</span>
            {originalPrice && <span className="text-sm text-gray-400 line-through mb-0.5">₨{originalPrice.toLocaleString()}</span>}
          </div>
          {(product as any).weight && (
            <p className="text-xs text-gray-500 mt-1.5">Net weight: {(product as any).weight} {(product as any).unit || ''}</p>
          )}
        </div>

        {/* Active Auction Panel */}
        {bidData?.hasBidding && bidData?.isLive && (
          <div className="mx-4 mb-2 border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-yellow-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Gavel className="w-4 h-4 text-orange-600" />
              <span className="font-bold text-orange-700 text-sm">Live Auction</span>
              <span className="ml-auto text-[10px] bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <Timer className="w-2.5 h-2.5" />
                {bidData.config?.endTime ? (() => {
                  const diff = new Date(bidData.config.endTime).getTime() - Date.now();
                  if (diff <= 0) return "Ended";
                  const h = Math.floor(diff / 3600000); const m = Math.floor((diff % 3600000) / 60000);
                  return h > 0 ? `${h}h ${m}m` : `${m}m left`;
                })() : "Active"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-[10px] text-gray-500">Starting</p><p className="font-bold text-xs">₨{parseFloat(bidData.config.startingPrice ?? "0").toLocaleString()}</p></div>
              <div><p className="text-[10px] text-gray-500">Current Bid</p><p className="font-bold text-base text-green-700">₨{parseFloat(bidData.config.currentBid ?? "0").toLocaleString()}</p></div>
              <div><p className="text-[10px] text-gray-500">Bids</p><p className="font-bold text-xs flex items-center justify-center gap-0.5"><TrendingUp className="w-2.5 h-2.5" />{bidData.config.totalBids ?? 0}</p></div>
            </div>
            {!showBidForm ? (
              <button onClick={() => setShowBidForm(true)} className="w-full h-9 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all">
                <Gavel style={{ width: 14, height: 14 }} /> Place a Bid
              </button>
            ) : (
              <div className="space-y-2 bg-white rounded-xl p-3 border border-orange-200">
                <div className="flex items-center justify-between"><p className="text-xs font-bold">Place Your Bid</p><button onClick={() => setShowBidForm(false)}><X style={{ width: 14, height: 14 }} className="text-gray-400" /></button></div>
                <p className="text-[10px] text-gray-500">Min: ₨{(parseFloat(bidData.config.currentBid ?? "0") + parseFloat(bidData.config.minIncrement ?? "50")).toLocaleString()}</p>
                <input value={bidForm.bidderName} onChange={e => setBidForm(f => ({ ...f, bidderName: e.target.value }))} placeholder="Your name *" className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2" />
                <input value={bidForm.bidderPhone} onChange={e => setBidForm(f => ({ ...f, bidderPhone: e.target.value }))} placeholder="Phone number *" className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2" />
                <input type="number" value={bidForm.amount} onChange={e => setBidForm(f => ({ ...f, amount: e.target.value }))} placeholder="Bid amount (₨) *" className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2" />
                <button onClick={() => bidMutation.mutate({ ...bidForm, productId })} disabled={bidMutation.isPending} className="w-full h-8 bg-orange-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 disabled:opacity-50">
                  {bidMutation.isPending ? <><Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> Placing…</> : "Confirm Bid"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Notify Me When Available */}
        {product.stock === 0 && !bidData?.isLive && (
          <div className="mx-4 mb-2">
            {!notifyOpen ? (
              <button onClick={() => setNotifyOpen(true)} className="w-full h-11 border-2 border-orange-300 text-orange-600 font-bold rounded-2xl text-sm flex items-center justify-center gap-2 active:scale-95 transition-all bg-orange-50">
                <Bell style={{ width: 16, height: 16 }} /> Notify Me When Available
              </button>
            ) : notifyDone ? (
              <div className="rounded-2xl bg-green-50 border border-green-200 p-4 text-center text-sm text-green-700">
                <p className="font-bold mb-1">You're on the list! ✅</p>
                <p className="text-xs text-green-600">We'll notify you when this product restocks.</p>
                <button className="mt-2 text-xs text-green-600 hover:underline" onClick={() => { setNotifyOpen(false); setNotifyDone(false); }}>Close</button>
              </div>
            ) : (
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-orange-700 flex items-center gap-1.5"><Bell style={{ width: 14, height: 14 }} /> Get Notified</p>
                  <button onClick={() => setNotifyOpen(false)}><X style={{ width: 14, height: 14 }} className="text-gray-400" /></button>
                </div>
                <input value={notifyForm.name} onChange={e => setNotifyForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name (optional)" className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 bg-white" />
                <input value={notifyForm.email} onChange={e => setNotifyForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address *" className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 bg-white" />
                <input value={notifyForm.phone} onChange={e => setNotifyForm(f => ({ ...f, phone: e.target.value }))} placeholder="WhatsApp number" className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 bg-white" />
                <button onClick={() => notifyMutation.mutate({ ...notifyForm, productId })} disabled={notifyMutation.isPending || !notifyForm.email} className="w-full h-10 bg-[#5FA800] text-white font-bold rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all">
                  {notifyMutation.isPending ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />Saving…</> : "Notify Me"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Quantity */}
        <div className="bg-white px-4 py-3 mb-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Quantity</h3>
              <p className="text-xs text-gray-400 mt-0.5">Total: <span className="font-semibold text-[#5FA800]">₨{(price * quantity).toLocaleString()}</span></p>
            </div>
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors border-r border-gray-200">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-9 text-center font-bold text-gray-900 text-[15px]">{quantity}</span>
              <button onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors border-l border-gray-200">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Variants */}
        {allVariants && allVariants.length > 0 && (
          <div className="bg-white px-4 py-4 mb-2">
            {(() => {
              const groups = allVariants.reduce((acc: any, v: any) => {
                if (!acc[v.name]) acc[v.name] = [];
                acc[v.name].push(v);
                return acc;
              }, {});
              return Object.entries(groups).map(([groupName, options]: any) => (
                <div key={groupName} className="mb-3 last:mb-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{groupName}</h3>
                    {activeVariant && options.some((v: any) => v.id === activeVariant.id) && activeVariant.price && (
                      <span className="text-xs font-bold text-[#5FA800] transition-all duration-200">
                        ₨{Number(activeVariant.price).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {options.map((v: any) => {
                      const isSelected = selectedVariant === v.id;
                      const outOfStock = v.stock === 0;
                      return v.name === 'Color' ? (
                        <button key={v.id} title={v.value}
                          onClick={() => !outOfStock && setSelectedVariant(v.id)}
                          disabled={outOfStock}
                          className={`w-8 h-8 rounded-full border-2 shadow-md transition-transform ${isSelected ? 'border-[#5FA800] scale-110' : 'border-white hover:scale-110'} ${outOfStock ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}`}
                          style={{ backgroundColor: v.hex || '#ccc' }} />
                      ) : (
                        <button key={v.id}
                          onClick={() => !outOfStock && setSelectedVariant(v.id)}
                          disabled={outOfStock}
                          className={`px-4 py-2 rounded-xl text-xs font-semibold border-2 transition-all hover:scale-105 active:scale-95 relative ${
                            isSelected
                              ? 'border-[#5FA800] bg-[#5FA800] text-white shadow-md'
                              : outOfStock
                              ? 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed'
                              : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-[#5FA800] hover:text-[#5FA800]'
                          }`}>
                          {v.value}
                          {outOfStock && <span className="ml-1 text-[9px] opacity-60">Out</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        {/* Tags */}
        {(product as any).tags && (product as any).tags.length > 0 && (
          <div className="bg-white px-4 py-3 mb-2">
            <div className="flex flex-wrap gap-2">
              {((product as any).tags as string[]).map(tag => (
                <span key={tag} className="text-[11px] font-medium bg-[#5FA800]/8 text-[#5FA800] px-2.5 py-1 rounded-full border border-[#5FA800]/20">#{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Tabbed Accordion: Description / Reviews / Shipping */}
        <ProductAccordion product={product} productId={productId} />

        {/* Why KDF NUTS */}
        <div className="bg-white px-4 py-4 mb-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Why KDF NUTS?</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: <Truck className="w-4 h-4" />, label: 'Fast Delivery', sub: 'Same day Karachi & Lahore' },
              { icon: <RotateCcw className="w-4 h-4" />, label: 'Easy Returns', sub: '7-day hassle-free' },
              { icon: <Lock className="w-4 h-4" />, label: 'Secure Pay', sub: '100% safe & secure' },
              { icon: <Package className="w-4 h-4" />, label: '100% Original', sub: 'Quality guaranteed' },
            ].map(({ icon, label, sub }) => (
              <div key={label} className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50">
                <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-[#5FA800] flex-shrink-0">{icon}</div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-700">{label}</p>
                  <p className="text-[10px] text-gray-400 leading-tight">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Related */}
        {relatedProducts.length > 0 && (
          <div className="bg-white py-4 mb-4">
            <h3 className="text-sm font-bold text-gray-900 px-4 mb-3">You May Also Like</h3>
            <div className="flex overflow-x-auto gap-3 px-4 pb-1 snap-x hide-scrollbar">
              {relatedProducts.map((prod: any) => {
                const rPrice = Number(prod.price);
                const rOldPrice = prod.originalPrice ? Number(prod.originalPrice) : null;
                const rImage = prod.images?.[0];
                const rDisc = rOldPrice && rOldPrice > rPrice ? Math.round(((rOldPrice - rPrice) / rOldPrice) * 100) : null;
                return (
                  <div key={prod.id} onClick={() => setLocation(`/products/${prod.slug || prod.id}`)}
                    className="cursor-pointer flex-shrink-0 w-36 border border-gray-100 rounded-2xl overflow-hidden snap-start shadow-sm active:scale-[0.97] transition-transform">
                    <div className={`w-full aspect-square bg-gradient-to-br ${prod.gradient || 'from-green-400 to-emerald-600'} relative overflow-hidden`}>
                      {rImage && <img src={getProductImageSrc(rImage) ?? ''} alt={prod.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
                      {rDisc && <span className="absolute top-1.5 left-1.5 bg-[#F58300] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{rDisc}% OFF</span>}
                    </div>
                    <div className="p-2.5">
                      <h4 className="text-xs font-semibold text-gray-900 truncate mb-1">{prod.name}</h4>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold text-[#5FA800]">₨{rPrice.toLocaleString()}</span>
                        {rOldPrice && <span className="text-[10px] text-gray-400 line-through">₨{rOldPrice.toLocaleString()}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed Bottom Action Bar ── */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white/95 backdrop-blur-md border-t border-gray-100 px-4 pt-2 z-[200] shadow-[0_-6px_20px_rgba(0,0,0,0.07)]"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        {/* WhatsApp Order Row */}
        <button
          onClick={() => {
            const msg = encodeURIComponent(`Hi! I want to order *${product.name}* (₨${price.toLocaleString()}${activeVariant ? ` — ${activeVariant.value}` : ""}). Please confirm availability.\n\n🔗 ${window.location.href}`);
            window.open(`https://wa.me/923000000000?text=${msg}`, "_blank");
          }}
          className="w-full mb-2 h-8 bg-[#25D366] text-white font-semibold rounded-xl text-[12px] flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all duration-150 shadow-[0_2px_6px_rgba(37,211,102,0.30)]"
        >
          <MessageCircle style={{ width: 13, height: 13 }} strokeWidth={2.5} />
          Order via WhatsApp
        </button>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => toggleItem({ id: product.id, name: product.name, price, gradient: (product as any).gradient || 'from-green-400 to-emerald-600' })}
            className={`flex-shrink-0 w-10 h-9 border rounded-xl flex items-center justify-center active:scale-90 transition-all duration-150 shadow-sm ${isInWishlist(product.id) ? 'border-red-300 bg-red-50 text-red-500' : 'border-gray-200 text-gray-500'}`}
          >
            <Heart style={{ width: 17, height: 17 }} fill={isInWishlist(product.id) ? 'currentColor' : 'none'} />
          </button>
          {product.stock === 0 && !bidData?.isLive ? (
            <button
              onClick={() => setNotifyOpen(true)}
              className="flex-1 h-9 border-2 border-orange-300 text-orange-600 font-semibold rounded-xl text-[13px] flex items-center justify-center gap-1.5 active:scale-[0.96] transition-all duration-150 bg-orange-50"
            >
              <Bell style={{ width: 14, height: 14 }} /> Notify Me
            </button>
          ) : (
            <>
              <button
                onClick={handleAddToCart}
                disabled={product.stock === 0}
                className={`flex-1 h-9 font-semibold rounded-xl text-[13px] flex items-center justify-center gap-1.5 transition-all duration-150 shadow-[0_2px_8px_rgba(95,168,0,0.28)] disabled:opacity-50 disabled:cursor-not-allowed ${addedBounce ? 'bg-[#4d8a00] scale-95' : 'bg-[#5FA800] active:scale-[0.96]'} text-white`}
              >
                {addedBounce ? <><Check style={{ width: 14, height: 14 }} strokeWidth={3} /> Added!</> : <><ShoppingCart style={{ width: 14, height: 14 }} strokeWidth={2.5} /> Add to Cart</>}
              </button>
              <button
                onClick={handleBuyNow}
                disabled={product.stock === 0}
                className="flex-1 h-9 bg-[#F58300] text-white font-semibold rounded-xl text-[13px] flex items-center justify-center active:scale-[0.96] transition-all duration-150 shadow-[0_2px_8px_rgba(245,131,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Buy Now
              </button>
            </>
          )}
        </div>
      </div>

      <MiniCartDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        product={{ id: product.id, name: product.name, price, gradient: (product as any).gradient || 'from-green-400 to-emerald-600', image: currentImage }}
        qty={quantity}
        cartTotal={totalPrice}
        cartCount={totalItems}
        onViewCart={() => { setDrawerVisible(false); setLocation('/cart'); }}
        onCheckout={() => { setDrawerVisible(false); setLocation('/checkout'); }}
      />
    </div>
  );
}
