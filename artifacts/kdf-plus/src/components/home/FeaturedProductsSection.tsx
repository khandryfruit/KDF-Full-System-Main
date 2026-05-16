import { Link } from "wouter";
import { Sparkles, ChevronRight } from "lucide-react";
import type { Product } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { PremiumProductCarousel } from "@/components/home/PremiumProductCarousel";

const GREEN = "#5FA800";

export interface FeaturedProductsSectionProps {
  products: Product[];
  loading: boolean;
}

export function FeaturedProductsSection({ products, loading }: FeaturedProductsSectionProps) {
  if (!loading && products.length === 0) return null;

  return (
    <section className="kdf-home-section kdf-page-shell px-1 sm:px-6 lg:px-8 pb-6">
      <div className="kdf-featured-shell overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/60 bg-gradient-to-r from-[#f8fbf4]/90 to-white/80 px-3 py-3 backdrop-blur-sm sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#5FA800]/12 ring-1 ring-[#5FA800]/20">
              <Sparkles className="h-4 w-4 text-[#5FA800]" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#5FA800]">Recommended</p>
              <h2 className="truncate text-base font-black tracking-tight text-gray-950 sm:text-lg">Hand-picked for you</h2>
            </div>
          </div>
          <Link href="/products?featured=true">
            <span
              className="inline-flex shrink-0 items-center gap-0.5 text-xs font-bold transition-opacity hover:opacity-80"
              style={{ color: GREEN }}
            >
              View all <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </div>

        <div className="px-0 pb-2 pt-1.5 sm:px-5 sm:pb-5 sm:pt-4">
          <div className="sm:hidden">
            <PremiumProductCarousel products={products} loading={loading} resumeMs={4000} />
          </div>

          <div className="kdf-rec-grid hidden sm:grid">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className="mb-2 aspect-square rounded-2xl" />
                    <Skeleton className="h-3 w-3/4 rounded" />
                  </div>
                ))
              : products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
          </div>
        </div>
      </div>
    </section>
  );
}
