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
  const safeName = (name ?? "").trim() || "Product";
  if (weight?.trim()) {
    const u = unit && unit !== "gram" ? ` ${unit}` : "";
    return [safeName, `${weight.trim()}${u}`];
  }
  const m = safeName.match(/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:kg|KG|g|GM|gm|ml|L))\s*$/i);
  if (m) return [m[1].trim(), m[2].toUpperCase()];
  return [safeName, null];
}

export interface KdfStoreProductCardProps {
  product: KdfStoreProductCardData;
  topBadge?: string;
  hotDealBadge?: boolean;
  cartIcon?: "plus" | "cart";
  onQuickAdd?: (product: KdfStoreProductCardData) => void;
  className?: string;
  compact?: boolean;
}

function KdfStoreProductCardInner({
  product,
  topBadge,
  hotDealBadge,
  cartIcon = "plus",
  onQuickAdd,
  className = "",
  compact = false,
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
  const onSale = originalPrice != null && originalPrice > price;

  const [displayName, weightLine] = splitNameAndWeight(
    product.name,
    product.weight,
    product.unit,
  );

  const href = `/products/${product.slug || product.id}`;
  const rawImage = product.images?.[0];
  const imageUrl = rawImage ? getProductImageSrc(rawImage, { maxWidth: compact ? 480 : 560 }) : null;
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
    <article
      className={`kdf-store-card group relative flex h-full min-h-0 w-full min-w-0 flex-col rounded-[20px] border border-gray-100/90 bg-white ring-1 ring-black/[0.04] ${compact ? "kdf-store-card--compact" : ""} ${className}`}
      data-testid={`card-product-${product.id}`}
    >
      <Link
        href={href}
        className="flex min-h-0 flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-[#5FA800]/40 focus-visible:ring-offset-2"
      >
        <div className="kdf-store-card__media-wrap relative w-full shrink-0 overflow-hidden bg-white">
          {badgeText && (
            <span
              className={`absolute left-2 top-2 z-[8] ${
                topBadge
                  ? "rounded-full bg-gray-900/80 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm"
                  : "kdf-discount-badge"
              } ${hotDealBadge && !topBadge ? " kdf-discount-badge-hot" : ""}`}
              aria-label={topBadge ? badgeText : `${discount} percent off`}
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
              fetchPriority={compact ? "low" : "auto"}
              width={400}
              height={400}
              sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 260px"
              onError={() => setImgError(true)}
              className="absolute inset-0 h-full w-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.03]"
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

        <div className={`kdf-store-card__body flex flex-col ${compact ? "px-2.5 pt-2 pb-1" : "px-2.5 pt-2 pb-1"}`}>
          <h3 className="kdf-store-card__title line-clamp-2 font-semibold leading-snug text-gray-900">
            {displayName}
          </h3>
          {weightLine && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-gray-400">{weightLine}</p>
          )}
        </div>
      </Link>

      <div
        className="kdf-store-card__price-row relative shrink-0"
      >
        <div className="kdf-store-card__prices min-w-0">
          <span className={`kdf-store-card__price-sale ${onSale ? "kdf-store-card__price-sale--highlight" : ""}`}>
            Rs. {price.toLocaleString("en-PK")}
          </span>
          {onSale && originalPrice != null && (
            <span className="kdf-store-card__price-compare">
              Rs. {originalPrice.toLocaleString("en-PK")}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleCart}
          disabled={outOfStock}
          className="kdf-store-card__cart"
          aria-label={`Add ${displayName} to cart`}
          data-testid={`button-add-cart-${product.id}`}
        >
          {cartIcon === "cart" ? (
            <ShoppingCart className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          ) : (
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={handleWish}
        className="kdf-store-card__wish"
        aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={wished}
        data-testid={`button-wish-${product.id}`}
      >
        <Heart
          className={`h-3.5 w-3.5 ${wished ? "fill-red-500 text-red-500" : "text-gray-400"}`}
          strokeWidth={2}
        />
      </button>
    </article>
  );
}

export const KdfStoreProductCard = memo(KdfStoreProductCardInner);
