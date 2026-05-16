import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Flame, ChevronRight, Sparkles } from "lucide-react";
import type { Product } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildSmartHotDeals,
  endOfTodayIso,
  maxDiscountAmong,
} from "@/lib/hotDealsProducts";

const GREEN = "#5FA800";
const ROTATING_LINES = [
  "Flash Sale — Limited Stock",
  "Exclusive Premium Offers",
  "Premium Dry Fruits & Nuts",
  "Handpicked Quality Deals",
  "Today Only — Best Prices",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function HotDealsCountdown({ endAt }: { endAt: string }) {
  const calc = () => {
    const diff = Math.max(0, Math.floor((new Date(endAt).getTime() - Date.now()) / 1000));
    return {
      h: Math.floor(diff / 3600),
      m: Math.floor((diff % 3600) / 60),
      s: diff % 60,
      done: diff === 0,
    };
  };
  const [t, setT] = useState(calc);
  useEffect(() => {
    if (t.done) return;
    const id = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(id);
  }, [endAt, t.done]);

  if (t.done) {
    return (
      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-200/90">
        Ending soon — grab deals now
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Ends in</span>
      <div className="flex items-center gap-1.5" aria-live="polite">
        {[
          { label: "h", value: t.h },
          { label: "m", value: t.m },
          { label: "s", value: t.s },
        ].map((cell, i) => (
          <span key={cell.label} className="flex items-center gap-1.5">
            <span className="kdf-hot-deals-timer-cell">
              <span className="font-mono text-lg font-black tabular-nums leading-none sm:text-xl">
                {pad2(cell.value)}
              </span>
              <span className="text-[8px] font-bold uppercase text-white/60">{cell.label}</span>
            </span>
            {i < 2 && <span className="font-bold text-white/50">:</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function HotDealsHero({ maxDiscount }: { maxDiscount: number }) {
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setLineIdx((i) => (i + 1) % ROTATING_LINES.length), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="kdf-hot-deals-hero relative overflow-hidden rounded-t-2xl px-4 py-5 sm:rounded-t-[1.25rem] sm:px-6 sm:py-6">
      <div className="kdf-hot-deals-particles pointer-events-none absolute inset-0" aria-hidden />
      <div className="kdf-hot-deals-glow pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full" aria-hidden />
      <div className="kdf-hot-deals-glow-orange pointer-events-none absolute -bottom-16 left-4 h-36 w-36 rounded-full" aria-hidden />

      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className="kdf-hot-deals-flame inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <Flame className="h-5 w-5 text-orange-300" strokeWidth={2.25} />
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300/95">
              Limited time
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            <span className="kdf-hot-deals-title-glow">Hot Deals</span>
          </h2>
          <p
            key={lineIdx}
            className="mt-1.5 animate-in fade-in text-sm font-semibold text-white/80 duration-500 sm:text-base"
          >
            {ROTATING_LINES[lineIdx]}
          </p>
          {maxDiscount > 0 && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-orange-500/15 px-3 py-1 text-xs font-bold text-orange-100">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              Save up to {maxDiscount}% today
            </p>
          )}
        </div>
        <HotDealsCountdown endAt={endOfTodayIso()} />
      </div>
    </div>
  );
}

function HotDealsGrid({ products, loading }: { products: Product[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="kdf-product-grid kdf-hot-deals-grid px-3 pb-4 pt-3 sm:px-5 sm:pb-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-2 h-[200px] rounded-xl sm:aspect-square sm:rounded-2xl" />
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const shown = products.slice(0, 10);
  return (
    <div className="px-3 pb-4 pt-3 sm:px-5 sm:pb-5">
      <div className="kdf-product-grid kdf-hot-deals-grid">
        {shown.map((product) => (
          <ProductCard key={product.id} product={product} hotDealBadge />
        ))}
      </div>
      {shown.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No deals available right now.</p>
      )}
    </div>
  );
}

export interface HotDealsSectionProps {
  products: Product[];
  extraPool?: Product[];
  loading: boolean;
}

export function HotDealsSection({ products, extraPool = [], loading }: HotDealsSectionProps) {
  const smartProducts = useMemo(
    () => buildSmartHotDeals([...products, ...extraPool], 10),
    [products, extraPool],
  );
  const maxDiscount = useMemo(() => maxDiscountAmong(smartProducts), [smartProducts]);

  if (!loading && smartProducts.length === 0) return null;

  return (
    <section className="kdf-home-section max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 pb-10">
      <div className="overflow-hidden rounded-2xl border border-gray-100/80 bg-white shadow-[0_12px_40px_rgba(13,43,0,0.06)] max-sm:border-0 max-sm:shadow-[0_8px_28px_rgba(13,43,0,0.05)] sm:ring-1 sm:ring-black/[0.03]">
        <HotDealsHero maxDiscount={maxDiscount} />

        <div className="flex items-center justify-between gap-3 border-b border-gray-100/80 bg-gradient-to-b from-[#f8fbf4] to-white px-3 py-2.5 sm:px-5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">
            Top picks · {smartProducts.length} deals
          </p>
          <Link href="/products">
            <span
              className="inline-flex items-center gap-0.5 text-xs font-bold transition-opacity hover:opacity-80"
              style={{ color: GREEN }}
            >
              View all <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </div>

        <HotDealsGrid products={smartProducts} loading={loading} />
      </div>
    </section>
  );
}
