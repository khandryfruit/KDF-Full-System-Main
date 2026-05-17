import { memo, useState } from "react";
import { Link } from "wouter";
import { Heart, Plus, ShoppingCart } from "lucide-react";
import type { Product } from "@workspace/api-client-react";
import { getProductImageSrc } from "@/lib/imageUrl";
import { useCart } from "@/context/CartContext";

export type KdfStoreProductCardData = {
  id: number;
  name: string;
  slug?: string;
  price: number;
  originalPrice?: number | null;
  images?: string[];
  gradient?: string;
  unit?: string | null;
  weight?: string | null;
  stock?: number;
  variants?: Product["variants"];
};

function splitNameAndWeight(
  name: string,
  weight?: string | null,
  unit?: string | null,
): [string, string | null] {
  if (weight?.trim()) {
    const u = unit && unit !== "gram" ? ` ${unit}` : "";
    return [name.trim(), `${weight.trim()}${u}`];
  }
  const m = name.match(/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:kg|KG|g|GM|gm|ml|L))\s*$/i);
  if (m) return [m[1].trim(), m[2].toUpperCase()];
  return [name.trim(), null];
}

export interface KdfStoreProductCardProps {
  product: KdfStoreProductCardData;
  /** Top-left badge text (e.g. discount % or "Pick") */
  topBadge?: string;
  hotDealBadge?: boolean;
  cartIcon?: "plus" | "cart";
  onQuickAdd?: (product: KdfStoreProductCardData) => void;
  className?: string;
}

function KdfStoreProductCardInner({
  product,
  topBadge,
  hotDealBadge,
  cartIcon = "plus",
  onQuickAdd,
  className = "",
}: KdfStoreProductCardProps) {
  const { addItem } = useCart();
  const [wished, setWished] = useState(false);
  const [imgError, setImgError] = useState(false);

  const price = Number(product.price);
  const originalPrice =
    product.originalPrice != null ? Number(product.originalPrice) : null;
  const discount =
    originalPrice && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : null;

  const [displayName, weightLine] = splitNameAndWeight(
    product.name,
    product.weight,
    product.unit,
  );

  const href = `/products/${product.slug || product.id}`;
  const rawImage = product.images?.[0];
  const imageUrl = rawImage ? getProductImageSrc(rawImage, { maxWidth: 560 }) : null;
  const initial = product.name?.[0]?.toUpperCase() ?? "N";
  const outOfStock = product.stock === 0;
  const hasVariants = (product.variants?.length ?? 0) > 0;

  const badgeText =
    topBadge ?? (discount != null && discount > 0 ? `-${discount}%` : undefined);

  const handleCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock) return;
    if (onQuickAdd) {
      onQuickAdd(product);
      return;
    }
    if (hasVariants) {
      window.location.href = href;
      return;
    }
    addItem(product as unknown as Product, 1);
  };

  const handleWish = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setWished((w) => !w);
  };

  return (
    <div
      className={`kdf-store-card group relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-gray-100/90 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.07)] ring-1 ring-black/[0.04] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(15,23,42,0.1)] hover:ring-[#5FA800]/20 ${className}`}
      data-testid={`card-product-${product.id}`}
    >
      <Link href={href} className="flex min-h-0 flex-1 flex-col">
        <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-white">
          {badgeText && (
            <span
              className={`absolute left-2 top-2 z-[8] rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-sm ${
                topBadge ? "bg-gray-900/75 backdrop-blur-sm" : "bg-[#F58300]"
              } ${hotDealBadge && !topBadge ? "kdf-discount-badge kdf-discount-badge-hot !static" : ""}`}
            >
              {badgeText}
            </span>
          )}

          {(!imageUrl || imgError) && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
              <span className="text-3xl font-black opacity-20" style={{ color: "#5FA800" }}>
                {initial}
              </span>
            </div>
          )}
          {imageUrl && !imgError && (
            <img
              src={imageUrl}
              alt={displayName}
              loading="lazy"
              decoding="async"
              sizes="(max-width: 640px) 49vw, (max-width: 1024px) 33vw, 240px"
              onError={() => setImgError(true)}
              className="absolute inset-0 h-full w-full object-contain p-1 transition-transform duration-500 group-hover:scale-[1.03]"
            />
          )}

          {outOfStock && (
            <div className="absolute inset-0 z-[5] flex items-center justify-center bg-white/80 backdrop-blur-[1px]">
              <span className="rounded-full bg-gray-900/85 px-2.5 py-1 text-[10px] font-bold text-white">
                Out of stock
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col px-2.5 pb-2.5 pt-2 pr-11">
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900 sm:text-[15px] md:text-[17px]">
            {displayName}
          </h3>
          {weightLine && (
            <p className="mt-0.5 text-[11px] font-medium text-gray-400">{weightLine}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
            <span className="text-[15px] font-bold leading-none text-gray-900 sm:text-base">
              Rs. {price.toLocaleString("en-PK")}
            </span>
            {originalPrice != null && originalPrice > price && (
              <span className="text-[11px] text-gray-400 line-through">
                Rs. {originalPrice.toLocaleString("en-PK")}
              </span>
            )}
          </div>
        </div>
      </Link>

      <button
        type="button"
        onClick={handleWish}
        className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-gray-100/90 bg-white/95 shadow-sm transition-transform hover:scale-105"
        aria-label="Add to wishlist"
        data-testid={`button-wish-${product.id}`}
      >
        <Heart
          className={`h-3.5 w-3.5 ${wished ? "fill-red-500 text-red-500" : "text-gray-400"}`}
          strokeWidth={2}
        />
      </button>

      <button
        type="button"
        onClick={handleCart}
        disabled={outOfStock}
        className="absolute bottom-2.5 right-2.5 z-20 flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg shadow-[#5FA800]/25 transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: "#5FA800" }}
        aria-label={`Add ${displayName} to cart`}
        data-testid={`button-add-cart-${product.id}`}
      >
        {cartIcon === "cart" ? (
          <ShoppingCart className="h-4 w-4" strokeWidth={2.25} />
        ) : (
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        )}
      </button>
    </div>
  );
}

export const KdfStoreProductCard = memo(KdfStoreProductCardInner);
