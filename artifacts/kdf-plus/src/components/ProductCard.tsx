import { memo, useState } from "react";
import { Link } from "wouter";
import { Plus, Minus, Heart } from "lucide-react";
import type { Product } from "@workspace/api-client-react";
import { getProductImageSrc } from "@/lib/imageUrl";
import { useCart } from "@/context/CartContext";
import { Badge } from "@/components/ui/badge";
import { VariantPickerModal } from "@/components/VariantPickerModal";

interface ProductCardProps {
  product: Product;
}

function ProductCardInner({ product }: ProductCardProps) {
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

  return (
    <>
      <Link href={`/products/${(product as any).slug || product.id}`} data-testid={`card-product-${product.id}`}>
        <div className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl border border-gray-100/90 bg-white shadow-sm ring-1 ring-black/[0.03] transition-[transform,box-shadow,border-color] duration-300 will-change-transform hover:-translate-y-1 hover:border-[#5FA800]/25 hover:shadow-xl hover:shadow-[#5FA800]/10 active:scale-[0.99] md:active:scale-100">

          {/* Wishlist */}
          <button
            onClick={handleWish}
            className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-full bg-white/95 border border-gray-100 flex items-center justify-center shadow-sm hover:scale-110 transition-all"
            data-testid={`button-wish-${product.id}`}
          >
            <Heart
              className={`w-3.5 h-3.5 transition-colors ${wished ? "fill-red-500 text-red-500" : "text-gray-400"}`}
            />
          </button>

          {lowStock && !outOfStock && (
            <div className={`absolute left-2.5 z-10 ${discount ? "top-11" : "top-2.5"}`}>
              <Badge className="rounded-lg border-0 bg-amber-500/95 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                Only {stock} left
              </Badge>
            </div>
          )}
          {outOfStock && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-white/75 backdrop-blur-[2px]">
              <span className="rounded-full bg-gray-900/85 px-3 py-1.5 text-xs font-bold text-white">Out of stock</span>
            </div>
          )}

          {/* Discount Badge */}
          {discount && (
            <div className="absolute top-2.5 left-2.5 z-10">
              <Badge
                className="text-white text-[11px] px-2 py-0.5 font-bold rounded-lg border-0"
                style={{ backgroundColor: "#F58300" }}
              >
                -{discount}%
              </Badge>
            </div>
          )}

          {/* Image */}
          <div className="aspect-square overflow-hidden relative"
            style={{ background: "linear-gradient(135deg, #f0f7e6 0%, #e6f2d9 100%)" }}
          >
            {/* Placeholder — always rendered behind the image */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
              <span className="text-5xl font-black" style={{ color: "#5FA800", opacity: 0.25 }}>
                {initial}
              </span>
              <span className="text-[10px] font-semibold text-gray-400 text-center px-3 leading-tight line-clamp-2">
                {product.name}
              </span>
            </div>
            {/* Real image — hides itself on error, reveals placeholder underneath */}
            {imageUrl && !imgError && (
              <img
                src={imageUrl}
                alt={product.name}
                loading="lazy"
                decoding="async"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
                onError={() => setImgError(true)}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out will-change-transform group-hover:scale-[1.06]"
                data-testid={`img-product-${product.id}`}
              />
            )}
          </div>

          {/* Info */}
          <div className="flex flex-1 flex-col gap-1 p-3.5">
            {(product.weight ?? product.unit) && (
              <p className="text-[11px] text-gray-400 font-medium">{product.weight ?? product.unit}</p>
            )}
            <h3
              className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 flex-1"
              data-testid={`text-product-name-${product.id}`}
            >
              {product.name}
            </h3>

            {/* Rating */}
            {product.rating && Number(product.rating) > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-yellow-400 text-xs">★</span>
                <span className="text-xs font-bold text-gray-700">{product.rating}</span>
                {product.reviewCount > 0 && (
                  <span className="text-[11px] text-gray-400">({product.reviewCount})</span>
                )}
              </div>
            )}

            {/* Price + Cart */}
            <div className="flex items-center justify-between mt-auto pt-1.5">
              <div>
                <span
                  className="text-sm font-bold text-gray-900"
                  data-testid={`text-price-${product.id}`}
                >
                  Rs. {price.toLocaleString()}
                </span>
                {originalPrice && originalPrice > price && (
                  <p className="text-[11px] text-gray-400 line-through leading-tight">
                    Rs. {originalPrice.toLocaleString()}
                  </p>
                )}
              </div>

              {/* Cart Controls */}
              {!hasVariants && qty > 0 ? (
                <div
                  className="flex items-center gap-1 rounded-full px-1.5 py-0.5"
                  style={{ backgroundColor: "#5FA80015" }}
                >
                  <button
                    onClick={handleDecrement}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white transition-colors"
                    style={{ backgroundColor: "#5FA800" }}
                    data-testid={`button-decrement-${product.id}`}
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span
                    className="text-xs font-bold w-4 text-center"
                    style={{ color: "#5FA800" }}
                    data-testid={`text-qty-${product.id}`}
                  >
                    {qty}
                  </span>
                  <button
                    onClick={handleIncrement}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white transition-colors"
                    style={{ backgroundColor: "#5FA800" }}
                    data-testid={`button-increment-${product.id}`}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleAddToCart}
                  disabled={outOfStock}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ backgroundColor: "#5FA800" }}
                  data-testid={`button-add-cart-${product.id}`}
                  aria-label={`Add ${product.name} to cart`}
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </Link>

      {/* Variant picker modal */}
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
