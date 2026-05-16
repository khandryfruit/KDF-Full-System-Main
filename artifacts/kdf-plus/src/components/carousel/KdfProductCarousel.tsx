import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useKdfCarousel, type KdfCarouselMode } from "@/components/carousel/useKdfCarousel";

export interface KdfProductCarouselProps {
  products: Product[];
  loading?: boolean;
  className?: string;
  mode?: KdfCarouselMode;
  fadeColor?: string;
  loopCopies?: 2 | 3;
  resumeMs?: number;
}

export function KdfProductCarousel({
  products,
  loading,
  className = "",
  mode = "peek",
  fadeColor = "#fff",
  loopCopies = 3,
  resumeMs = 4000,
}: KdfProductCarouselProps) {
  const [centerMod, setCenterMod] = useState(0);

  const loop = useMemo(() => {
    if (products.length === 0) return [];
    if (products.length === 1) return products;
    const n = loopCopies === 2 ? 2 : 3;
    return Array.from({ length: n }, () => products).flat();
  }, [products, loopCopies]);

  const { scrollerRef, scrollerClassName, scrollerProps, scrollBy } = useKdfCarousel({
    itemCount: products.length,
    loopCopies,
    resumeMs,
  });

  const updateCenter = useCallback(() => {
    if (mode !== "center") return;
    const vp = scrollerRef.current;
    if (!vp) return;
    const mid = vp.getBoundingClientRect().left + vp.getBoundingClientRect().width / 2;
    let best = 0;
    let bestDist = Infinity;
    vp.querySelectorAll<HTMLElement>("[data-slide-mod]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.left + r.width / 2 - mid);
      const mod = Number(el.dataset.slideMod);
      if (dist < bestDist && !Number.isNaN(mod)) {
        bestDist = dist;
        best = mod;
      }
    });
    setCenterMod(best);
  }, [mode, scrollerRef]);

  useEffect(() => {
    if (mode !== "center" || loading) return;
    const vp = scrollerRef.current;
    if (!vp) return;
    updateCenter();
    vp.addEventListener("scroll", updateCenter, { passive: true });
    return () => vp.removeEventListener("scroll", updateCenter);
  }, [mode, loading, loop.length, updateCenter, scrollerRef]);

  if (loading) {
    return (
      <div className={"kdf-carousel kdf-carousel--" + mode + " " + className}>
        <div className="kdf-carousel-track">
          {[0, 1].map((i) => (
            <div key={i} className="kdf-carousel-slide kdf-carousel-slide--peek">
              <div className="kdf-carousel-card">
                <Skeleton className="aspect-square w-full rounded-2xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) return null;

  return (
    <div
      className={"kdf-carousel kdf-carousel--" + mode + " " + className}
      style={{ ["--kdf-carousel-fade" as string]: fadeColor }}
    >
      <div className="kdf-carousel-fade kdf-carousel-fade--left" aria-hidden />
      <div className="kdf-carousel-fade kdf-carousel-fade--right" aria-hidden />

      {products.length > 1 && (
        <>
          <button type="button" className="kdf-carousel-nav kdf-carousel-nav--prev" onClick={() => scrollBy("left")} aria-label="Scroll left">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className="kdf-carousel-nav kdf-carousel-nav--next" onClick={() => scrollBy("right")} aria-label="Scroll right">
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      <div ref={scrollerRef} data-carousel-scroller className={scrollerClassName} {...scrollerProps}>
        <div className="kdf-carousel-track">
          {loop.map((product, i) => {
            const mod = products.length > 0 ? i % products.length : 0;
            const slideClass =
              mode === "center"
                ? "kdf-carousel-slide kdf-carousel-slide--center" + (mod === centerMod ? " is-center" : "")
                : "kdf-carousel-slide kdf-carousel-slide--peek";
            return (
              <div key={product.id + "-" + i} data-slide-mod={mod} className={slideClass}>
                <div className="kdf-carousel-card">
                  <ProductCard product={product} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
