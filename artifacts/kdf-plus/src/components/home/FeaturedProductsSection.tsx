import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Sparkles, ChevronRight } from "lucide-react";
import type { Product } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";

const GREEN = "#5FA800";
const AUTO_MS = 4500;
const TRANSITION_MS = 520;

function chunkPairs(products: Product[]): Product[][] {
  const chunks: Product[][] = [];
  for (let i = 0; i < products.length; i += 2) {
    chunks.push(products.slice(i, i + 2));
  }
  return chunks;
}

function FeaturedCarouselMobile({ products, loading }: { products: Product[]; loading: boolean }) {
  const slides = useMemo(() => chunkPairs(products), [products]);
  const loop = slides.length > 1;
  const extended = useMemo(
    () => (loop ? [...slides, slides[0]!] : slides),
    [slides, loop],
  );

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [instant, setInstant] = useState(false);
  const resumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const advance = useCallback(() => {
    if (slides.length <= 1) return;
    setIndex((i) => i + 1);
  }, [slides.length]);

  useEffect(() => {
    if (loading || paused || slides.length <= 1) return;
    const id = setInterval(advance, AUTO_MS);
    return () => clearInterval(id);
  }, [loading, paused, slides.length, advance]);

  useEffect(() => {
    if (!loop || index !== slides.length) return;
    const id = setTimeout(() => {
      setInstant(true);
      setIndex(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setInstant(false));
      });
    }, TRANSITION_MS);
    return () => clearTimeout(id);
  }, [index, slides.length, loop]);

  const pause = useCallback(() => {
    setPaused(true);
    if (resumeRef.current) clearTimeout(resumeRef.current);
  }, []);

  const resumeLater = useCallback(() => {
    if (resumeRef.current) clearTimeout(resumeRef.current);
    resumeRef.current = setTimeout(() => setPaused(false), 2800);
  }, []);

  useEffect(() => () => {
    if (resumeRef.current) clearTimeout(resumeRef.current);
  }, []);

  if (loading) {
    return (
      <div className="kdf-featured-carousel-viewport sm:hidden">
        <div className="flex gap-2.5">
          {[0, 1].map((i) => (
            <div key={i} className="min-w-0 flex-1">
              <Skeleton className="mb-2 h-[220px] rounded-xl" />
              <Skeleton className="h-3 w-3/4 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) return null;

  if (slides.length === 1) {
    return (
      <div className="kdf-featured-carousel-viewport sm:hidden">
        <div className="flex gap-2.5">
          {slides[0]!.map((p) => (
            <div key={p.id} className="kdf-featured-carousel-card min-w-0 flex-1">
              <ProductCard product={p} />
            </div>
          ))}
          {slides[0]!.length === 1 && <div className="kdf-featured-carousel-card min-w-0 flex-1" aria-hidden />}
        </div>
      </div>
    );
  }

  return (
    <div
      className="kdf-featured-carousel-viewport sm:hidden"
      onTouchStart={pause}
      onTouchEnd={resumeLater}
      onMouseEnter={pause}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className={`kdf-featured-carousel-track${instant ? " kdf-featured-carousel-track--instant" : ""}`}
        style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}
        aria-live="off"
      >
        {extended.map((pair, slideIdx) => (
          <div
            key={`slide-${slideIdx}-${pair.map((p) => p.id).join("-")}`}
            className="kdf-featured-carousel-slide"
          >
            {pair.map((p) => (
              <div key={p.id} className="kdf-featured-carousel-card">
                <ProductCard product={p} />
              </div>
            ))}
            {pair.length === 1 && <div className="kdf-featured-carousel-card" aria-hidden />}
          </div>
        ))}
      </div>
      {loop && (
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index % slides.length ? "w-5 bg-[#5FA800]" : "w-1.5 bg-gray-300"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export interface FeaturedProductsSectionProps {
  products: Product[];
  loading: boolean;
}

export function FeaturedProductsSection({ products, loading }: FeaturedProductsSectionProps) {
  if (!loading && products.length === 0) return null;

  return (
    <section className="kdf-home-section max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 pb-8">
      <div className="kdf-featured-shell overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/60 bg-gradient-to-r from-[#f8fbf4]/90 to-white/80 px-3 py-3 backdrop-blur-sm sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#5FA800]/12 ring-1 ring-[#5FA800]/20">
              <Sparkles className="h-4 w-4 text-[#5FA800]" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#5FA800]">Hand-picked</p>
              <h2 className="truncate text-base font-black tracking-tight text-gray-950 sm:text-lg">Featured Products</h2>
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

        <div className="px-2 pb-3 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
          <FeaturedCarouselMobile products={products} loading={loading} />

          <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">
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
