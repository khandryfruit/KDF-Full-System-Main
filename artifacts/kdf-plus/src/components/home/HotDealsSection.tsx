import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Flame, ChevronRight } from "lucide-react";
import type { Product } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { PremiumCountdown } from "@/components/home/PremiumCountdown";
import {
  buildSmartHotDeals,
  endOfTodayIso,
  maxDiscountAmong,
} from "@/lib/hotDealsProducts";

const GREEN = "#5FA800";
const ROTATING_LINES = [
  "Flash Sale — Limited Stock",
  "Exclusive Offers",
  "Premium Dry Fruits",
];

function HotDealsHero({ maxDiscount }: { maxDiscount: number }) {
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setLineIdx((i) => (i + 1) % ROTATING_LINES.length), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="kdf-hot-deals-hero kdf-promo-banner-compact relative overflow-hidden rounded-t-2xl px-3 py-3 sm:rounded-t-[1.25rem] sm:px-5 sm:py-4">
      <div className="kdf-hot-deals-particles pointer-events-none absolute inset-0" aria-hidden />
      <div className="kdf-hot-deals-glow pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full" aria-hidden />
      <div className="kdf-hot-deals-glow-orange pointer-events-none absolute -bottom-12 left-2 h-24 w-24 rounded-full" aria-hidden />

      <div className="relative z-10 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="kdf-hot-deals-flame inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
              <Flame className="h-4 w-4 text-orange-300" strokeWidth={2.25} />
            </span>
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300/95">
              Limited time
            </span>
          </div>
          <h2 className="text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">
            <span className="kdf-hot-deals-title-glow">Hot Deals</span>
          </h2>
          <p
            key={lineIdx}
            className="mt-0.5 line-clamp-1 text-xs font-medium text-white/75 sm:text-sm"
          >
            {ROTATING_LINES[lineIdx]}
          </p>
          {maxDiscount > 0 && (
            <p className="mt-1.5 text-[10px] font-bold text-orange-100/90 sm:text-xs">
              Save up to {maxDiscount}% today
            </p>
          )}
        </div>
        <PremiumCountdown endAt={endOfTodayIso()} className="shrink-0" />
      </div>
    </div>
  );
}

function HotDealsGrid({ products, loading }: { products: Product[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="kdf-product-grid kdf-hot-deals-grid px-2 pb-3 pt-2 sm:px-5 sm:pb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-2 aspect-square rounded-xl" />
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const shown = products.slice(0, 10);
  return (
    <div className="px-2 pb-3 pt-2 sm:px-5 sm:pb-5">
      <div className="kdf-product-grid kdf-hot-deals-grid">
        {shown.map((product) => (
          <ProductCard key={product.id} product={product} hotDealBadge />
        ))}
      </div>
      {shown.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">No deals available right now.</p>
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
    <section className="kdf-home-section kdf-page-shell px-2 sm:px-6 lg:px-8 pb-8">
      <div className="overflow-hidden rounded-2xl border border-gray-100/80 bg-white shadow-[0_8px_28px_rgba(13,43,0,0.06)] max-sm:border-0 max-sm:shadow-[0_6px_22px_rgba(13,43,0,0.05)] sm:ring-1 sm:ring-black/[0.03]">
        <HotDealsHero maxDiscount={maxDiscount} />

        <div className="flex items-center justify-between gap-2 border-b border-gray-100/80 bg-white px-2.5 py-2 sm:px-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
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
