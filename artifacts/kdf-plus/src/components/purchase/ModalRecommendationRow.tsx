import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import type { Product } from "@workspace/api-client-react";
import { getProductImageSrc } from "@/lib/imageUrl";

const AUTO_PX_PER_SEC = 18;

export function ModalRecommendationRow({ products }: { products: Product[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const setWidthRef = useRef(0);
  const [paused, setPaused] = useState(false);

  const loop = useMemo(() => {
    if (products.length <= 1) return products;
    return [...products, ...products];
  }, [products]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || products.length < 2) return;
    setWidthRef.current = el.scrollWidth / 2;
    const ro = new ResizeObserver(() => {
      if (scrollerRef.current) setWidthRef.current = scrollerRef.current.scrollWidth / 2;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [products.length, loop.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || products.length < 2 || paused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = setWidthRef.current;
      if (w > 0) {
        el.scrollLeft += AUTO_PX_PER_SEC * dt;
        if (el.scrollLeft >= w * 1.02) el.scrollLeft -= w;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, products.length, loop.length]);

  if (products.length === 0) return null;

  return (
    <div className="kdf-modal-rec">
      <p className="kdf-modal-rec__label">You may also like</p>
      <div
        ref={scrollerRef}
        className="kdf-modal-rec__scroller"
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
      >
        <div className="kdf-modal-rec__track">
          {loop.map((product, i) => {
            const price = parseFloat(product.price);
            const img = product.images?.[0] ? getProductImageSrc(product.images[0], { maxWidth: 200 }) : null;
            const slug = (product as { slug?: string }).slug || String(product.id);
            return (
              <Link key={`${product.id}-${i}`} href={`/products/${slug}`} className="kdf-modal-rec__card">
                <div className="kdf-modal-rec__img">
                  {img ? (
                    <img src={img} alt="" className="h-full w-full object-contain" loading="lazy" draggable={false} />
                  ) : (
                    <span className="text-lg font-black text-[#5FA800]/25">{product.name?.[0]}</span>
                  )}
                </div>
                <p className="kdf-modal-rec__name">{product.name}</p>
                <p className="kdf-modal-rec__price">Rs. {price.toLocaleString()}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
