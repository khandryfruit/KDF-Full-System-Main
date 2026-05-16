import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Sparkles } from "lucide-react";
import type { Product } from "@workspace/api-client-react";
import { useCart } from "@/context/CartContext";
import { getProductImageSrc } from "@/lib/imageUrl";

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
  compact = false,
}: {
  title: string;
  subtitle?: string;
  products: Product[];
  compact?: boolean;
}) {
  const { addItem } = useCart();
  const visible = useMemo(() => products.slice(0, compact ? 6 : 10), [products, compact]);
  if (visible.length === 0) return null;

  return (
    <section className="space-y-2.5">
      <div className="flex items-end justify-between gap-2 px-0.5">
        <div>
          <p className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#5FA800]">
            <Sparkles className="h-3 w-3" />
            {title}
          </p>
          {subtitle && <p className="text-xs font-semibold text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((product) => {
          const image = product.images?.[0];
          const price = Number(product.price ?? 0);
          const firstVariant = product.variants?.find((v) => v.stock !== 0) ?? product.variants?.[0];
          return (
            <article
              key={product.id}
              className={`${compact ? "min-w-[116px] max-w-[126px]" : "min-w-[136px] max-w-[150px]"} shrink-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ring-1 ring-black/[0.03]`}
            >
              <div className="aspect-square bg-gray-50">
                <img
                  src={getProductImageSrc(image, { maxWidth: compact ? 180 : 260 })}
                  alt={product.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </div>
              <div className="space-y-1.5 p-2">
                <p className="line-clamp-2 text-[11px] font-bold leading-snug text-gray-900">{product.name}</p>
                <p className="text-xs font-black text-[#5FA800]">Rs. {price.toLocaleString()}</p>
                <button
                  type="button"
                  onClick={() => addItem(product, 1, firstVariant?.id, firstVariant?.value)}
                  className="flex h-8 w-full items-center justify-center gap-1 rounded-xl bg-[#5FA800] text-[11px] font-black text-white transition active:scale-[0.98]"
                >
                  <ShoppingCart className="h-3 w-3" />
                  Add
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
