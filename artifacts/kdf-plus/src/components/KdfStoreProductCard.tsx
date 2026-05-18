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
  const imageUrl = rawImage ? getProductImageSrc(rawImage, { maxWidth: compact ? 400 : 560 }) : null;
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
      className={`kdf-store-card group relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-gray-100/90 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.04] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_14px_32px_rgba(15,23,42,0.12)] hover:ring-[#5FA800]/25 md:rounded-[22px] ${compact ? "kdf-store-card--compact" : ""} ${className}`}
      data-testid={`card-product-${product.id}`}
    >
      <Link
        href={href}
        className="flex min-h-0 flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-[#5FA800]/40 focus-visible:ring-offset-2"
      >
        <div className="kdf-store-card__media-wrap relative aspect-square w-full shrink-0 overflow-hidden bg-gradient-to-b from-white to-gray-50/80">
          {badgeText && (
            <span
              className={`kdf-store-card__badge absolute left-2.5 top-2.5 z-[8] ${
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
              <span className="text-3xl font-black opacity-20 md:text-4xl" style={{ color: "#5FA800" }}>
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
              width={400}
              height={400}
              sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 240px"
              onError={() => setImgError(true)}
              className="absolute inset-0 h-full w-full object-contain p-2 transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
          )}

          {outOfStock && (
            <div className="absolute inset-0 z-[5] flex items-center justify-center bg-white/80 backdrop-blur-[1px]">
              <span className="rounded-full bg-gray-900/85 px-2.5 py-1 text-[10px] font-bold text-white md:text-xs">
                Out of stock
              </span>
            </div>
          )}
        </div>

        <div
          className={`kdf-store-card__body flex flex-col px-3 pt-2.5 ${compact ? "pb-0" : "pb-1"} md:px-4 md:pt-3`}
        >
          <h3 className="kdf-store-card__title line-clamp-2 font-semibold leading-snug text-gray-900 md:font-bold">
            {displayName}
          </h3>
          {weightLine && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-gray-400">{weightLine}</p>
          )}
        </div>
      </Link>

      <div className="kdf-store-card__footer mt-auto flex items-end justify-between gap-2 px-3 pb-3 pt-0 md:px-4 md:pb-4">
        <div className="min-w-0 flex-1 pr-1">
          <span
            className={`block text-[15px] font-bold leading-none md:text-base ${onSale ? "text-[#5FA800]" : "text-gray-900"}`}
          >
            Rs. {price.toLocaleString("en-PK")}
          </span>
          {onSale && originalPrice != null && (
            <span className="mt-0.5 block text-[11px] font-medium text-gray-400 line-through decoration-gray-300/90 md:text-xs">
              Rs. {originalPrice.toLocaleString("en-PK")}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleCart}
          disabled={outOfStock}
          className="kdf-store-card__cart flex h-10 w-10 shrink-0 items-center justify-center gap-1 rounded-full text-white shadow-[0_6px_16px_rgba(95,168,0,0.35)] transition-[transform,box-shadow] duration-200 hover:scale-105 hover:shadow-[0_8px_22px_rgba(95,168,0,0.45)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 md:h-11 md:min-w-[2.75rem] md:px-3.5"
          style={{ background: "linear-gradient(135deg, #6bb80a 0%, #5FA800 48%, #4a8600 100%)" }}
          aria-label={`Add ${displayName} to cart`}
          data-testid={`button-add-cart-${product.id}`}
        >
          {cartIcon === "cart" ? (
            <ShoppingCart className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
          ) : (
            <Plus className="h-4 w-4 shrink-0 md:h-[1.125rem] md:w-[1.125rem]" strokeWidth={2.5} aria-hidden />
          )}
          <span className="hidden text-xs font-bold tracking-wide md:inline">Add</span>
        </button>
      </div>

      <button
        type="button"
        onClick={handleWish}
        className="kdf-store-card__wish absolute right-2.5 top-2.5 z-[12] flex h-8 w-8 items-center justify-center rounded-full border border-gray-100/90 bg-white/95 shadow-sm transition-transform hover:scale-105 md:h-9 md:w-9"
        aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={wished}
        data-testid={`button-wish-${product.id}`}
      >
        <Heart
          className={`h-3.5 w-3.5 md:h-4 md:w-4 ${wished ? "fill-red-500 text-red-500" : "text-gray-400"}`}
          strokeWidth={2}
        />
      </button>
    </article>
  );
}

export const KdfStoreProductCard = memo(KdfStoreProductCardInner);
