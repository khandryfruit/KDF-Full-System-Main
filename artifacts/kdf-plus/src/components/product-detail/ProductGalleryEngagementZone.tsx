import { useMemo, useState, useEffect } from "react";
import {
  Sparkles,
  Flame,
  Clock,
  Zap,
  ShoppingCart,
  TrendingUp,
  Star,
  Leaf,
  ChevronRight,
  Package,
} from "lucide-react";

export type GalleryEngagementProduct = {
  id: number;
  name: string;
  slug?: string;
  price: number;
  images?: string[];
  gradient?: string;
  variants?: { id: string; stock?: number; value?: string; price?: string }[];
};

export type GalleryCategory = { id: number; name: string; slug?: string };

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function useCountdownToEndOfDay() {
  const [end] = useState(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const ms = Math.max(0, end - now);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { h, m, s, ms };
}

function seededSoldPct(productId: number, stock: number) {
  const base = 52 + (Math.abs(productId * 17) % 28);
  if (stock > 0 && stock < 8) return Math.min(94, base + 15);
  return Math.min(91, base);
}

const STATIC_CATEGORIES: { label: string; href: string; emoji: string }[] = [
  { label: "Nuts", href: "/products?search=nuts", emoji: "🥜" },
  { label: "Dry Fruits", href: "/products?search=dry+fruit", emoji: "🍇" },
  { label: "Organic", href: "/products?search=organic", emoji: "🌿" },
  { label: "Seeds", href: "/products?search=seeds", emoji: "✨" },
  { label: "Gift Boxes", href: "/products?search=gift", emoji: "🎁" },
  { label: "Premium Imported", href: "/products?search=premium", emoji: "✈️" },
];

function FlashDealBlock({
  productId,
  discountPercent,
  stock,
}: {
  productId: number;
  discountPercent: number | null;
  stock: number;
}) {
  const { h, m, s } = useCountdownToEndOfDay();
  const soldPct = seededSoldPct(productId, stock);
  const disc = discountPercent ?? 18 + (productId % 12);

  return (
    <div className="relative overflow-hidden rounded-[1.35rem] border border-orange-200/60 bg-gradient-to-br from-orange-50/95 via-rose-50/80 to-amber-50/90 p-4 shadow-lg ring-1 ring-orange-500/10 animate-kdf-pdp-flash-glow">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-orange-400/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-6 -left-4 h-24 w-24 rounded-full bg-rose-400/15 blur-xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-800 ring-1 ring-orange-200/80">
            <Flame className="h-3 w-3" />
            Limited time deal
          </p>
          <p className="mt-2 text-lg font-black tracking-tight text-orange-950 sm:text-xl">Extra {disc}% off today</p>
          <p className="text-xs text-orange-900/70">Ends at midnight — stock moving fast</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-white/80 px-3 py-2 font-mono text-xl font-black tabular-nums text-orange-950 shadow-sm ring-1 ring-orange-100">
          <Clock className="h-4 w-4 text-orange-500" />
          {pad2(h)}:{pad2(m)}:{pad2(s)}
        </div>
      </div>
      <div className="relative mt-4">
        <div className="mb-1 flex justify-between text-[10px] font-semibold text-orange-900/80">
          <span>Selling fast</span>
          <span>{soldPct}% claimed</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/60 ring-1 ring-orange-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-amber-400 transition-[width] duration-700 ease-out"
            style={{ width: `${soldPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function CategoryOrbitStrip({
  apiCategories,
  onNavigate,
}: {
  apiCategories: GalleryCategory[];
  onNavigate: (path: string) => void;
}) {
  const items = useMemo(() => {
    if (apiCategories.length >= 4) {
      const emojis = ["🥜", "🍇", "🌿", "✨", "🎁", "✈️", "⭐", "💎"];
      return apiCategories.slice(0, 8).map((c, i) => ({
        label: c.name,
        href: `/products?categoryId=${c.id}`,
        emoji: emojis[i % emojis.length],
      }));
    }
    return STATIC_CATEGORIES;
  }, [apiCategories]);

  const loop = [...items, ...items];

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">Shop by mood</p>
      <div className="relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-r from-slate-50/90 via-white/70 to-emerald-50/40 py-2.5 shadow-inner ring-1 ring-black/[0.04]">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[hsl(var(--background))] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[hsl(var(--background))] to-transparent" />
        <div className="flex w-max gap-2 px-2 animate-kdf-pdp-marquee-ltr hover:[animation-play-state:paused] motion-reduce:hover:[animation-play-state:running]">
          {loop.map((c, i) => (
            <button
              key={`${c.label}-${i}`}
              type="button"
              onClick={() => onNavigate(c.href)}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-gray-200/80 bg-white/90 px-3 py-2 text-left text-xs font-semibold text-foreground shadow-sm ring-1 ring-black/[0.03] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-[#5FA800]/35 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span className="text-base leading-none">{c.emoji}</span>
              {c.label}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AiCarousel({
  products,
  getImageSrc,
  onOpen,
  onQuickAdd,
}: {
  products: GalleryEngagementProduct[];
  getImageSrc: (path: string) => string;
  onOpen: (p: GalleryEngagementProduct) => void;
  onQuickAdd: (p: GalleryEngagementProduct) => void;
}) {
  const loop = useMemo(() => {
    const base = products.length ? products : [];
    if (base.length === 0) return [];
    const min = 6;
    const filled = base.length >= min ? base : [...base, ...base, ...base].slice(0, min);
    return [...filled, ...filled];
  }, [products]);

  if (loop.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800/90">
            <Sparkles className="h-3.5 w-3.5 text-[#5FA800]" />
            AI curated for you
          </p>
          <p className="text-sm font-bold text-foreground">Recommended picks</p>
        </div>
      </div>
      <div className="relative overflow-hidden rounded-[1.25rem] border border-emerald-100/80 bg-gradient-to-b from-white/95 to-emerald-50/30 py-3 shadow-md ring-1 ring-emerald-900/[0.04]">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white to-transparent" />
        <div className="flex w-max gap-3 px-3 animate-kdf-pdp-marquee-ltr hover:[animation-play-state:paused] [animation-duration:56s]">
          {loop.map((p, i) => {
            const img = p.images?.[0];
            return (
              <div
                key={`${p.id}-${i}`}
                className="group relative w-[148px] shrink-0 overflow-hidden rounded-2xl border border-gray-100/90 bg-white shadow-md ring-1 ring-black/[0.04] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#5FA800]/15 hover:ring-[#5FA800]/25 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <button type="button" onClick={() => onOpen(p)} className="block w-full text-left">
                  <div className={`relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br ${p.gradient || "from-emerald-100 to-green-200"}`}>
                    {img ? (
                      <img src={getImageSrc(img)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-8 w-8 text-muted" />
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                      Pick
                    </span>
                  </div>
                  <div className="p-2.5">
                    <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-foreground">{p.name}</p>
                    <p className="mt-1 text-sm font-black text-[#5FA800]">Rs. {p.price.toLocaleString()}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAdd(p);
                  }}
                  className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#5FA800] text-white shadow-lg shadow-[#5FA800]/30 transition hover:scale-105 hover:brightness-110 active:scale-95"
                  title="Quick add"
                >
                  <ShoppingCart className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DualMarqueeRow({
  products,
  getImageSrc,
  onOpen,
  rtl,
}: {
  products: GalleryEngagementProduct[];
  getImageSrc: (path: string) => string;
  onOpen: (p: GalleryEngagementProduct) => void;
  rtl?: boolean;
}) {
  const loop = useMemo(() => {
    if (!products.length) return [];
    const doubled = products.length >= 5 ? products : [...products, ...products];
    return [...doubled, ...doubled];
  }, [products]);

  if (!loop.length) return null;

  return (
    <div className="relative overflow-hidden py-1">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[hsl(var(--background))] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[hsl(var(--background))] to-transparent" />
      <div
        className={`flex w-max gap-2 px-1 ${rtl ? "animate-kdf-pdp-marquee-rtl" : "animate-kdf-pdp-marquee-ltr"} hover:[animation-play-state:paused]`}
        style={{ animationDuration: rtl ? "52s" : "46s" }}
      >
        {loop.map((p, i) => {
          const img = p.images?.[0];
          return (
            <button
              key={`m-${p.id}-${i}`}
              type="button"
              onClick={() => onOpen(p)}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-gray-100/90 bg-white/90 py-1.5 pl-1.5 pr-3 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-sm transition hover:border-[#5FA800]/30 hover:shadow-md"
            >
              <span className="relative h-10 w-10 overflow-hidden rounded-lg bg-muted">
                {img ? <img src={getImageSrc(img)} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Package className="m-2 h-6 w-6 text-muted" />}
              </span>
              <span className="max-w-[120px] truncate text-left text-[11px] font-semibold">{p.name}</span>
              <span className="text-[11px] font-bold text-[#5FA800]">Rs.{p.price.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TrustActivityLayer({ productId, productName }: { productId: number; productName: string }) {
  const lines = useMemo(() => {
    const names = ["Ayesha K.", "Bilal R.", "Sara M.", "Omar H.", "Fatima S.", "Hassan T."];
    const cities = ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad"];
    const mins = [2, 4, 6, 9, 12, 15, 21];
    const pick = (arr: string[], i: number) => arr[Math.abs((productId + i) * 13) % arr.length];
    return [
      `${pick(names, 0)} from ${pick(cities, 1)} purchased ${mins[productId % mins.length]} mins ago`,
      `Trending: similar shoppers also viewed ${productName.split(" ").slice(0, 2).join(" ")}…`,
      `${pick(names, 2)} left a 5★ review for premium nuts`,
      "AI tip: pair with walnuts for a balanced omega snack routine",
    ];
  }, [productId, productName]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setIdx((i) => (i + 1) % lines.length), 5200);
    return () => window.clearInterval(t);
  }, [lines.length]);

  return (
    <div className="rounded-2xl border border-gray-100/90 bg-gradient-to-br from-slate-50/95 via-white/90 to-emerald-50/30 p-4 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5 text-[#5FA800]" />
        Live activity
      </div>
      <p className="min-h-[2.75rem] text-sm font-medium leading-relaxed text-foreground/90 transition-opacity duration-500">{lines[idx]}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900 ring-1 ring-amber-200/60">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          Bestseller lane
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-900 ring-1 ring-emerald-200/60">
          <Leaf className="h-3 w-3" />
          Wellness pick
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-900 ring-1 ring-violet-200/60">
          <Zap className="h-3 w-3" />
          High intent
        </span>
      </div>
    </div>
  );
}

export function ProductGalleryEngagementZone({
  productId,
  productName,
  discountPercent,
  stock,
  marqueeProducts,
  apiCategories,
  getImageSrc,
  onProductNavigate,
  onQuickAdd,
  onPathNavigate,
}: {
  productId: number;
  productName: string;
  discountPercent: number | null;
  stock: number;
  marqueeProducts: GalleryEngagementProduct[];
  apiCategories: GalleryCategory[];
  getImageSrc: (path: string) => string;
  onProductNavigate: (p: GalleryEngagementProduct) => void;
  onQuickAdd: (p: GalleryEngagementProduct) => void;
  onPathNavigate: (path: string) => void;
}) {
  const carouselPool = useMemo(() => marqueeProducts.slice(0, 10), [marqueeProducts]);
  const rowA = useMemo(() => marqueeProducts.filter((_, i) => i % 2 === 0), [marqueeProducts]);
  const rowB = useMemo(() => marqueeProducts.filter((_, i) => i % 2 === 1), [marqueeProducts]);

  return (
    <div className="mt-8 w-full space-y-8 lg:mt-10">
      <AiCarousel products={carouselPool} getImageSrc={getImageSrc} onOpen={onProductNavigate} onQuickAdd={onQuickAdd} />
      <FlashDealBlock productId={productId} discountPercent={discountPercent} stock={stock} />
      <CategoryOrbitStrip apiCategories={apiCategories} onNavigate={onPathNavigate} />
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">Discover more</p>
        <div className="space-y-2 rounded-[1.25rem] border border-gray-100/90 bg-muted/20 p-2 ring-1 ring-black/[0.03]">
          <DualMarqueeRow products={rowA.length ? rowA : marqueeProducts} getImageSrc={getImageSrc} onOpen={onProductNavigate} />
          <DualMarqueeRow products={rowB.length ? rowB : marqueeProducts} getImageSrc={getImageSrc} onOpen={onProductNavigate} rtl />
        </div>
      </div>
      <TrustActivityLayer productId={productId} productName={productName} />
    </div>
  );
}
