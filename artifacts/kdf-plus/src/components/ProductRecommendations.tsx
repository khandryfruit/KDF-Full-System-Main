import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, Sparkles, Tag } from "lucide-react";
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
    <section className="kdf-rec-strip w-full min-w-0 space-y-4">
      <header className="kdf-rec-strip__header px-0.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#5FA800]/10 ring-1 ring-[#5FA800]/15">
            {/frequently|together/i.test(title) ? (
              <Tag className="h-4 w-4 text-[#5FA800]" aria-hidden />
            ) : /related/i.test(title) ? (
              <Package className="h-4 w-4 text-[#5FA800]" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4 text-[#5FA800]" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight text-gray-900 sm:text-base md:text-lg">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs font-medium text-gray-500 sm:text-[13px]">{subtitle}</p>
            )}
          </div>
        </div>
      </header>

      <KdfProductCarousel
        products={visible}
        mode="peek"
        loopCopies={1}
        autoScroll={false}
        nativeScroll
        resumeMs={5000}
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
