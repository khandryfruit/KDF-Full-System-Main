import { useMemo, useEffect, useState, useRef } from "react";
import { KdfCarousel } from "@/components/carousel/KdfCarousel";
import {
  Users,
  ShoppingBag,
  Flame,
  Truck,
  Banknote,
  BadgeCheck,
  Package,
  Zap,
} from "lucide-react";

export type PairProduct = {
  id: number;
  name: string;
  slug?: string;
  price: number;
  originalPrice?: number | null;
  images?: string[];
  gradient?: string;
};

function seededStats(productId: number, stock: number) {
  const s = Math.abs(productId * 7919 + 104729) % 1000;
  const viewing = 9 + (s % 18);
  const orders = 4 + (s % 14);
  const urgency = stock > 0 && stock < 12;
  return { viewing, orders, urgency };
}

function SocialPulseStrip({ productId, stock }: { productId: number; stock: number }) {
  const { viewing, orders, urgency } = useMemo(() => seededStats(productId, stock), [productId, stock]);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setPulse((p) => !p), 3200);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div
      className={`rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-white/90 via-emerald-50/40 to-white/80 p-3.5 shadow-sm ring-1 ring-emerald-900/[0.04] backdrop-blur-md transition-shadow duration-500 ${pulse ? "shadow-md shadow-emerald-900/8" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] sm:text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-900/90">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <Users className="h-3.5 w-3.5 opacity-80" />
          {viewing} viewing now
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <ShoppingBag className="h-3.5 w-3.5 text-[#5FA800]" />
          <span className="font-semibold text-foreground">{orders}</span> orders today
        </span>
        {urgency ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 font-bold text-orange-700 ring-1 ring-orange-500/20">
            <Flame className="h-3 w-3" />
            Only {stock} left
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 font-semibold text-emerald-800 ring-1 ring-emerald-600/15">
            <Flame className="h-3 w-3 text-orange-500" />
            Selling fast
          </span>
        )}
      </div>
    </div>
  );
}

const DELIVERY_CARDS = [
  { icon: Banknote, title: "Cash on delivery", sub: "Pay when you receive", accent: "from-amber-500/10 to-orange-500/5" },
  { icon: Truck, title: "Same-day delivery", sub: "Available in key cities", accent: "from-sky-500/10 to-blue-500/5" },
  { icon: BadgeCheck, title: "Authentic product", sub: "Quality-checked lots", accent: "from-emerald-500/12 to-green-500/5" },
  { icon: Package, title: "Fast shipping", sub: "Packed and dispatched fast", accent: "from-teal-500/10 to-cyan-500/5" },
] as const;

function DeliveryPromiseRow() {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">Delivery & trust</p>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:overflow-visible">
        {DELIVERY_CARDS.map(({ icon: Icon, title, sub, accent }) => (
          <div
            key={title}
            className={`min-w-[132px] shrink-0 rounded-2xl border border-white/80 bg-gradient-to-br ${accent} p-3 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:min-w-0`}
          >
            <Icon className="mb-1.5 h-4 w-4 text-[#5FA800]" />
            <p className="text-[11px] font-bold leading-tight text-foreground">{title}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PairsWellMini({
  items,
  getImageSrc,
  onSelect,
}: {
  items: PairProduct[];
  getImageSrc: (path: string) => string;
  onSelect: (p: PairProduct) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-2.5">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">Pairs well with</p>
          <p className="text-xs font-semibold text-foreground/90">Customers also loved</p>
        </div>
        <BadgeCheck className="h-4 w-4 shrink-0 text-[#5FA800]/50" aria-hidden />
      </div>
      <KdfCarousel mode="peek" itemCount={items.length} loopCopies={2} resumeMs={4000} fadeColor="hsl(var(--background))" showArrows={items.length > 2}>
        {items.map((p, i) => {
          const img = p.images?.[0];
          const old = p.originalPrice != null ? Number(p.originalPrice) : null;
          const disc = old && old > p.price ? Math.round(((old - p.price) / old) * 100) : null;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className="kdf-carousel-slide--peek group flex min-w-[108px] max-w-[120px] shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-100/95 bg-white/90 text-left shadow-sm ring-1 ring-black/[0.04] backdrop-blur-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-[#5FA800]/35 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <div className={`relative aspect-square w-full overflow-hidden bg-gradient-to-br ${p.gradient || "from-emerald-100 to-green-200"}`}>
                {img ? (
                  <img
                    src={getImageSrc(img)}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-6 w-6 text-muted" />
                  </div>
                )}
                {disc != null && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-[#F58300] px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
                    {disc}% OFF
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="line-clamp-2 text-[10px] font-semibold leading-snug text-foreground">{p.name}</p>
                <p className="mt-1 text-[11px] font-black text-[#5FA800]">Rs. {p.price.toLocaleString()}</p>
              </div>
            </button>
          );
        })}
      </KdfCarousel>
    </div>
  );
}

/** Desktop: compact sticky bar when main CTAs scroll out of view */
export function StickyPurchaseConfidenceLg({
  visible,
  price,
  qty,
  name,
  onAdd,
  onBuy,
  disabled,
}: {
  visible: boolean;
  price: number;
  qty: number;
  name: string;
  onAdd: () => void;
  onBuy: () => void;
  disabled: boolean;
}) {
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-[400] hidden transition-all duration-300 lg:block ${visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"}`}
      aria-hidden={!visible}
    >
      <div
        className="pointer-events-auto mx-auto mb-4 flex max-w-[min(100%,80rem)] items-center justify-center px-6 xl:px-8"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-gray-200/90 bg-white/95 px-4 py-2.5 shadow-2xl shadow-slate-900/10 ring-1 ring-black/[0.06] backdrop-blur-xl">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] text-muted-foreground">{name}</p>
            <p className="text-sm font-black text-[#5FA800]">
              Rs. {(price * qty).toLocaleString()}
              <span className="ml-1 text-[10px] font-semibold text-muted-foreground">· Qty {qty}</span>
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={onAdd}
            className="h-9 shrink-0 rounded-xl border-2 border-gray-200 bg-white px-3 text-xs font-semibold text-gray-800 shadow-sm transition hover:border-gray-300 disabled:opacity-40"
          >
            Cart
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onBuy}
            className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-[#5FA800] to-[#3d7000] px-4 text-xs font-bold text-white shadow-lg shadow-[#5FA800]/25 transition hover:brightness-105 disabled:opacity-40"
          >
            <Zap className="h-3.5 w-3.5" />
            Buy
          </button>
        </div>
      </div>
    </div>
  );
}

export function useCtaInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting),
      { root: null, rootMargin: "0px 0px -72px 0px", threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, inView };
}

export function ProductConversionRail({
  productId,
  stock,
  pairs,
  getImageSrc,
  onPairClick,
}: {
  productId: number;
  stock: number;
  pairs: PairProduct[];
  getImageSrc: (path: string) => string;
  onPairClick: (p: PairProduct) => void;
}) {
  return (
    <div className="space-y-4 border-t border-border/50 pt-4">
      <div className="hidden sm:block">
        <SocialPulseStrip productId={productId} stock={stock} />
      </div>
      <DeliveryPromiseRow />
      <PairsWellMini items={pairs} getImageSrc={getImageSrc} onSelect={onPairClick} />
    </div>
  );
}
