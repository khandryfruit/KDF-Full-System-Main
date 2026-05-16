import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";

const SCROLL_SPEED = 22;
const RESUME_MS = 2200;

export interface PremiumProductCarouselProps {
  products: Product[];
  loading?: boolean;
  className?: string;
}

export function PremiumProductCarousel({ products, loading, className = "" }: PremiumProductCarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const setWidthRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [centerMod, setCenterMod] = useState(0);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);

  const loop = useMemo(() => {
    if (products.length === 0) return [];
    if (products.length === 1) return products;
    return [...products, ...products, ...products];
  }, [products]);

  const measureSetWidth = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || products.length === 0) return;
    setWidthRef.current = vp.scrollWidth / 3;
    if (setWidthRef.current > 0 && vp.scrollLeft < setWidthRef.current * 0.25) {
      vp.scrollLeft = setWidthRef.current;
    }
  }, [products.length]);

  useEffect(() => {
    measureSetWidth();
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(measureSetWidth);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [measureSetWidth, loop.length]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || loading || products.length < 2 || paused || dragging.current) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.048, (now - last) / 1000);
      last = now;
      const setW = setWidthRef.current;
      if (setW > 0) {
        vp.scrollLeft += SCROLL_SPEED * dt;
        if (vp.scrollLeft >= setW * 2.05) vp.scrollLeft -= setW;
        else if (vp.scrollLeft < setW * 0.95) vp.scrollLeft += setW;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loading, products.length, paused, loop.length]);

  const updateCenterFromScroll = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const vpRect = vp.getBoundingClientRect();
    const mid = vpRect.left + vpRect.width / 2;
    let bestMod = 0;
    let bestDist = Infinity;
    vp.querySelectorAll<HTMLElement>("[data-carousel-slide]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.left + r.width / 2 - mid);
      const mod = Number(el.dataset.slideMod);
      if (dist < bestDist && !Number.isNaN(mod)) {
        bestDist = dist;
        bestMod = mod;
      }
    });
    setCenterMod(bestMod);
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || loading) return;
    updateCenterFromScroll();
    vp.addEventListener("scroll", updateCenterFromScroll, { passive: true });
    return () => vp.removeEventListener("scroll", updateCenterFromScroll);
  }, [loading, loop.length, updateCenterFromScroll]);

  const pause = useCallback(() => {
    setPaused(true);
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
  }, []);

  const resumeLater = useCallback(() => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      dragging.current = false;
      setPaused(false);
    }, RESUME_MS);
  }, []);

  useEffect(() => () => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
  }, []);

  if (loading) {
    return (
      <div className={`kdf-premium-carousel-viewport ${className}`}>
        <div className="kdf-premium-carousel-track">
          {[0, 1].map((i) => (
            <div key={i} className="kdf-premium-carousel-slide is-center">
              <Skeleton className="aspect-square w-full rounded-[20px]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) return null;

  return (
    <div
      className={`kdf-premium-carousel-viewport ${className}`}
      onPointerDown={() => {
        dragging.current = true;
        pause();
      }}
      onPointerUp={resumeLater}
      onPointerCancel={resumeLater}
      onTouchStart={pause}
      onTouchEnd={resumeLater}
    >
      <div className="kdf-premium-carousel-fade kdf-premium-carousel-fade--left" aria-hidden />
      <div className="kdf-premium-carousel-fade kdf-premium-carousel-fade--right" aria-hidden />
      <div
        ref={viewportRef}
        className={`kdf-premium-carousel-scroller${paused ? " is-manual" : " is-auto"}`}
      >
        <div className="kdf-premium-carousel-track">
          {loop.map((product, i) => {
            const mod = products.length > 0 ? i % products.length : 0;
            return (
              <div
                key={`${product.id}-${i}`}
                data-carousel-slide
                data-product-id={product.id}
                data-slide-mod={mod}
                className={`kdf-premium-carousel-slide${mod === centerMod ? " is-center" : ""}`}
              >
                <ProductCard product={product} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
