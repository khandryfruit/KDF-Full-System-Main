import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import type { Product } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { KdfProductCarousel } from "@/components/carousel/KdfProductCarousel";

export type RecommendationSlot =
  | "relatedProducts"
  | "bestSellers"
  | "frequentlyBoughtTogether"
  | "customersAlsoBought"
  | "recommendedWithThis"
  | "cartUpsells"
  | "lowQuantityAddOns";

export type RecommendationsResponse = Record<RecommendationSlot, Product[]> & {
  context: string;
};

async function fetchRecommendations(params: {
  context: "product" | "variant" | "cart" | "checkout";
  productId?: number;
  cartProductIds?: number[];
  limit?: number;
}): Promise<RecommendationsResponse> {
  const qs = new URLSearchParams();
  qs.set("context", params.context);
  if (params.productId) qs.set("productId", String(params.productId));
  if (params.cartProductIds?.length) qs.set("cartProductIds", params.cartProductIds.join(","));
  if (params.limit) qs.set("limit", String(params.limit));
  const res = await fetch(`/api/products/recommendations?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed to load recommendations");
  return res.json();
}

export function useProductRecommendations(params: {
  context: "product" | "variant" | "cart" | "checkout";
  productId?: number;
  cartProductIds?: number[];
  limit?: number;
  enabled?: boolean;
}) {
  const cartKey = params.cartProductIds?.join(",") ?? "";
  return useQuery({
    queryKey: ["product-recommendations", params.context, params.productId ?? 0, cartKey, params.limit ?? 8],
    queryFn: () => fetchRecommendations(params),
    enabled: params.enabled !== false,
    staleTime: 60_000,
  });
}

export function ProductRecommendationStrip({
  title,
  subtitle,
  products,
  compact = true,
  carouselOnly = false,
  maxItems = 12,
}: {
  title: string;
  subtitle?: string;
  products: Product[];
  compact?: boolean;
  carouselOnly?: boolean;
  maxItems?: number;
}) {
  const visible = useMemo(() => products.slice(0, maxItems), [products, maxItems]);
  if (visible.length === 0) return null;

  return (
    <section className="kdf-rec-strip w-full min-w-0 space-y-3">
      <div className="flex items-end justify-between gap-2 px-0.5">
        <div>
          <p className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#5FA800] sm:text-[11px]">
            <Sparkles className="h-3 w-3" />
            {title}
          </p>
          {subtitle && <p className="text-xs font-medium text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      <KdfProductCarousel
        products={visible}
        mode="peek"
        resumeMs={4500}
        className={carouselOnly ? "kdf-pdp-rec-carousel kdf-carousel--rec" : "kdf-carousel--rec"}
        compact={compact}
      />

      {!carouselOnly && (
        <div className="kdf-rec-grid hidden sm:grid">
          {visible.map((product) => (
            <ProductCard key={product.id} product={product} compact={compact} />
          ))}
        </div>
      )}
    </section>
  );
}
