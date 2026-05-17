import { useEffect, useRef, useState, useMemo } from "react";
import { ProductRecommendationStrip, useProductRecommendations } from "@/components/ProductRecommendations";

export function ProductDetailRecommendations({ productId }: { productId: number }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setLoad(true);
          obs.disconnect();
        }
      },
      { rootMargin: "280px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { data, isLoading } = useProductRecommendations({
    context: "product",
    productId,
    limit: 4,
    enabled: load && productId > 0,
  });

  const { fbt, related } = useMemo(() => {
    const fbtList = (data?.frequentlyBoughtTogether ?? []).slice(0, 4);
    const fbtIds = new Set(fbtList.map((p) => p.id));
    const relatedList = (data?.relatedProducts ?? []).filter((p) => !fbtIds.has(p.id)).slice(0, 4);
    return { fbt: fbtList, related: relatedList };
  }, [data]);

  const hasContent = fbt.length > 0 || related.length > 0;

  return (
    <div ref={sentinelRef} className="kdf-pdp-rec-lazy w-full min-w-0">
      {load && isLoading && (
        <div className="mt-8 space-y-6 border-t border-gray-100/80 pt-8">
          <div className="h-28 animate-pulse rounded-2xl bg-muted/35" />
        </div>
      )}
      {load && !isLoading && hasContent && (
        <div className="kdf-pdp-rec-section mt-8 space-y-8 border-t border-gray-100/80 pt-8">
          {fbt.length > 0 && (
            <ProductRecommendationStrip
              title="Frequently bought together"
              subtitle="Same category & popular pairings"
              products={fbt}
              carouselOnly
              maxItems={4}
            />
          )}
          {related.length > 0 && (
            <ProductRecommendationStrip
              title="Related products"
              subtitle="Similar category, tags & weight"
              products={related}
              carouselOnly
              maxItems={4}
            />
          )}
        </div>
      )}
    </div>
  );
}
