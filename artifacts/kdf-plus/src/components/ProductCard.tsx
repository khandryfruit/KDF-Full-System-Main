import { memo, useState } from "react";
import { Link } from "wouter";
import { Plus, Minus, Heart } from "lucide-react";
import type { Product } from "@workspace/api-client-react";
import { getProductImageSrc } from "@/lib/imageUrl";
import { useCart } from "@/context/CartContext";
import { Badge } from "@/components/ui/badge";
import { VariantPickerModal } from "@/components/VariantPickerModal";
import { KdfStoreProductCard, type KdfStoreProductCardData } from "@/components/KdfStoreProductCard";

function toStoreCardData(product: Product): KdfStoreProductCardData {
  return {
    id: product.id,
    name: product.name,
    slug: (product as { slug?: string }).slug,
    price: parseFloat(product.price),
    originalPrice: product.originalPrice,
    images: product.images,
    unit: product.unit,
    weight: product.weight,
    stock: product.stock,
    variants: product.variants,
  };
}

interface ProductCardProps {
  product: Product;
  /** Premium hot-deals badge with subtle fire accent */
  hotDealBadge?: boolean;
  /** Denser card for recommendation rows / 2-up mobile grids */
  compact?: boolean;
}

function ProductCardInner({ product, hotDealBadge, compact }: ProductCardProps) {
  const { addItem, items, updateQty, removeItem } = useCart();
  const [wished, setWished] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [imgError, setImgError] = useState(false);

  const hasVariants = product.variants && product.variants.length > 0;

  const cartItem = items.find(
    (i) => i.product.id === product.id && !i.variantId
  );
  const qty = cartItem?.quantity ?? 0;

  const price = parseFloat(product.price);
  const originalPrice = product.originalPrice ? parseFloat(product.originalPrice) : null;
  const discount =
    originalPrice && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : null;

  const rawImage = product.images?.[0];
  const imageUrl = rawImage ? getProductImageSrc(rawImage, { maxWidth: 560 }) : null;

  const initial = product.name?.[0]?.toUpperCase() ?? "N";

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasVariants) {
      setShowVariants(true);
    } else {
      addItem(product, 1);
    }
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateQty(product.id, qty + 1);
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (qty === 1) {
      removeItem(product.id);
    } else {
      updateQty(product.id, qty - 1);
    }
  };

  const handleWish = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setWished(!wished);
  };

  const stock = typeof product.stock === "number" ? product.stock : null;
  const lowStock = stock !== null && stock > 0 && stock <= 8;
  const outOfStock = stock === 0;

  if (compact) {
    return (
      <>
        <KdfStoreProductCard
          product={toStoreCardData(product)}
          hotDealBadge={hotDealBadge}
          onQuickAdd={hasVariants ? () => setShowVariants(true) : undefined}
        />
        {showVariants && (
          <VariantPickerModal product={product} onClose={() => setShowVariants(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <Link href={`/products/${(product as any).slug || product.id}`} data-testid={`card-product-${product.id}`}>
        <div
          className={`kdf-product-card group relative flex h-full w-full min-w-0 cursor-pointer flex-col overflow-hidden bg-white box-border transition-[transform,box-shadow] duration-300 active:max-sm:scale-[0.99] sm:rounded-3xl sm:border sm:border-gray-100 sm:shadow-sm sm:ring-1 sm:ring-black/[0.03] md:rounded-[1.75rem] md:shadow-md hover:md:-translate-y-1 hover:md:border-[#5FA800]/30 hover:md:shadow-2xl hover:md:shadow-[#5FA800]/12${compact ? " kdf-product-card--compact" : ""}`}
        >

          <button
            onClick={handleWish}
            className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-gray-100/90 bg-white/95 shadow-sm max-sm:right-2 max-sm:top-2 sm:right-3 sm:top-3 sm:h-10 sm:w-10 md:hover:scale-110"
            data-testid={`button-wish-${product.id}`}
          >
            <Heart
              className={`h-3 w-3 sm:h-4 sm:w-4 transition-all ${wished ? "fill-red-500 text-red-500" : "text-gray-400"}`}
              strokeWidth={2}
            />
          </button>

          {lowStock && !outOfStock && (
            <div className={`absolute left-2.5 z-10 max-sm:left-2 ${discount ? "top-9 sm:top-10" : "top-2.5 max-sm:top-2"}`}>
              <Badge className="rounded-full border-0 bg-amber-500/95 px-1.5 py-0.5 text-[9px] font-bold text-white sm:px-2 sm:text-[10px]">
                {stock} left
              </Badge>
            </div>
          )}
          {outOfStock && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/75 backdrop-blur-[2px] max-sm:rounded-[20px] sm:rounded-3xl">
              <span className="rounded-full bg-gray-900/85 px-3 py-1.5 text-xs font-bold text-white">Out of stock</span>
            </div>
          )}

          {discount != null && discount > 0 && (
            <div className="kdf-product-card__badge">
              <span
                className={`kdf-discount-badge${hotDealBadge ? " kdf-discount-badge-hot" : ""}`}
                aria-label={`${discount} percent off`}
              >
                -{discount}%
              </span>
            </div>
          )}

          <div className="kdf-product-card__media relative aspect-square w-full bg-white">
            {(!imageUrl || imgError) && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gray-50">
                <span className="text-4xl font-black max-sm:text-3xl" style={{ color: "#5FA800", opacity: 0.2 }}>
                  {initial}
                </span>
              </div>
            )}
            {imageUrl && !imgError && (
              <img
                src={imageUrl}
                alt={product.name}
                loading="lazy"
                decoding="async"
                sizes="(max-width: 640px) 49vw, (max-width: 1024px) 33vw, 280px"
                onError={() => setImgError(true)}
                className="absolute inset-0 h-full w-full object-contain p-0.5 max-sm:transition-none sm:p-1 md:transition-transform md:duration-500 md:ease-out md:group-hover:scale-[1.04]"
                data-testid={`img-product-${product.id}`}
              />
            )}
          </div>

          <div className="kdf-product-card__body flex flex-col gap-0.5 sm:gap-1 sm:p-3.5 md:p-5">
            {(product.weight ?? product.unit) && (
              <p className="text-[10px] font-medium text-gray-400 sm:text-[11px]">{product.weight ?? product.unit}</p>
            )}
            <h3
              className={`line-clamp-2 font-semibold leading-snug text-gray-900 ${compact ? "text-[11px]" : "text-[13px] sm:text-sm md:text-base md:font-bold"}`}
              data-testid={`text-product-name-${product.id}`}
            >
              {product.name}
            </h3>

            {product.rating && Number(product.rating) > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-yellow-400">★</span>
                <span className="text-[11px] font-bold text-gray-700 sm:text-xs">{product.rating}</span>
                {product.reviewCount > 0 && (
                  <span className="text-[10px] text-gray-400 sm:text-[11px]">({product.reviewCount})</span>
                )}
              </div>
            )}

            <div className="mt-1 flex items-center justify-between pt-0.5">
              <div className="min-w-0">
                <span
                  className="text-[13px] font-bold text-gray-900 sm:text-sm md:text-lg"
                  data-testid={`text-price-${product.id}`}
                >
                  Rs. {price.toLocaleString()}
                </span>
                {originalPrice && originalPrice > price && (
                  <p className="text-[10px] leading-tight text-gray-400 line-through sm:text-[11px]">
                    Rs. {originalPrice.toLocaleString()}
                  </p>
                )}
              </div>

              {!hasVariants && qty > 0 ? (
                <div className="flex shrink-0 items-center gap-0.5 rounded-full px-1 py-0.5 sm:gap-1 sm:px-1.5" style={{ backgroundColor: "#5FA80015" }}>
                  <button
                    onClick={handleDecrement}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-white sm:h-8 sm:w-8"
                    style={{ backgroundColor: "#5FA800" }}
                    data-testid={`button-decrement-${product.id}`}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-4 text-center text-[11px] font-bold sm:text-xs" style={{ color: "#5FA800" }} data-testid={`text-qty-${product.id}`}>
                    {qty}
                  </span>
                  <button
                    onClick={handleIncrement}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-white sm:h-8 sm:w-8"
                    style={{ backgroundColor: "#5FA800" }}
                    data-testid={`button-increment-${product.id}`}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleAddToCart}
                  disabled={outOfStock}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-md transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:w-10 md:h-11 md:w-11 md:hover:scale-105"
                  style={{ backgroundColor: "#5FA800" }}
                  data-testid={`button-add-cart-${product.id}`}
                  aria-label={`Add ${product.name} to cart`}
                >
                  <Plus className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>
      </Link>

      {showVariants && (
        <VariantPickerModal
          product={product}
          onClose={() => setShowVariants(false)}
        />
      )}
    </>
  );
}

export const ProductCard = memo(ProductCardInner);
