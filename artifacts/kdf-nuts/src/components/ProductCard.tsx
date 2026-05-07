import React, { useState, useCallback } from 'react';
import { Heart, Star, ShoppingCart, Check, Plus } from 'lucide-react';
import { useLocation } from 'wouter';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { getProductImageSrc } from '../lib/imageUrl';
import { VariantPickerModal } from './VariantPickerModal';
import type { VariantProduct } from './VariantPickerModal';

interface Product extends VariantProduct {
  slug?: string;
  originalPrice?: string | number | null;
  rating?: string | number;
  reviewCount?: number;
  stock?: number;
}

interface ProductCardProps {
  product: Product;
  mode?: 'scroll' | 'grid';
}

export function ProductCard({ product, mode = 'scroll' }: ProductCardProps) {
  const [, setLocation] = useLocation();
  const { addItem } = useCart();
  const { toggleItem, isInWishlist } = useWishlist();
  const [added, setAdded] = useState(false);
  const [showVariants, setShowVariants] = useState(false);

  const price = Number(product.price);
  const originalPrice = product.originalPrice ? Number(product.originalPrice) : null;
  const discount = originalPrice && originalPrice > price
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : null;
  const image = product.images?.[0];
  const hasVariants = product.variants && product.variants.length > 0;

  const handleAddToCart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (hasVariants) { setShowVariants(true); return; }
    addItem({ id: product.id, name: product.name, variant: 'Standard', price, qty: 1, gradient: product.gradient || 'from-green-400 to-emerald-600', image });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }, [addItem, product, price, image, hasVariants]);

  const handleWishlist = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleItem({ id: product.id, name: product.name, price, gradient: product.gradient || 'from-green-400 to-emerald-600' });
  }, [toggleItem, product.id, product.name, product.gradient, price]);

  const handleNavigate = useCallback(() => setLocation(`/product/${product.slug || product.id}`), [setLocation, product.slug, product.id]);
  const inWishlist = isInWishlist(product.id);

  const StarRow = () => (
    product.rating !== undefined ? (
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5">
          {[1,2,3,4,5].map(i => {
            const r = Number(product.rating ?? 0);
            return (
              <Star key={i} size={10}
                className={i <= Math.round(r) ? 'fill-[#F58300] text-[#F58300]' : 'fill-gray-200 text-gray-200'}
              />
            );
          })}
        </div>
        <span className="text-[10px] font-semibold text-gray-600">{Number(product.rating ?? 0).toFixed(1)}</span>
        {product.reviewCount != null && (
          <span className="text-[10px] text-gray-400">({product.reviewCount})</span>
        )}
      </div>
    ) : null
  );

  if (mode === 'scroll') {
    return (
      <>
        <div
          className="w-[158px] flex-shrink-0 bg-white rounded-2xl overflow-hidden flex flex-col relative cursor-pointer active:scale-[0.97] transition-transform duration-150 shadow-[0_2px_12px_rgba(0,0,0,0.07)] border border-gray-50"
          onClick={handleNavigate}
        >
          {discount && (
            <div className="absolute top-2 left-2 z-10 bg-[#F58300] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
              {discount}% OFF
            </div>
          )}
          <button
            onClick={handleWishlist}
            className={`absolute top-2 right-2 z-10 p-1.5 bg-white/95 backdrop-blur-sm rounded-full shadow-sm transition-all active:scale-90 ${inWishlist ? 'text-red-500' : 'text-gray-400'}`}
            aria-label="Wishlist"
          >
            <Heart size={14} strokeWidth={2.5} fill={inWishlist ? 'currentColor' : 'none'} />
          </button>

          <div className="w-full h-[150px] relative overflow-hidden bg-gray-50">
            {image ? (
              <img src={getProductImageSrc(image)} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className={`w-full h-full bg-gradient-to-br ${product.gradient || 'from-green-400 to-emerald-600'}`} />
            )}
          </div>

          <div className="p-3 flex flex-col flex-grow gap-1.5">
            <h3 className="text-[12.5px] font-semibold text-gray-900 line-clamp-2 leading-snug">{product.name}</h3>
            <StarRow />
            <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1">
              <span className="text-[15px] font-bold text-[#5FA800] leading-none">₨{price.toLocaleString()}</span>
              {originalPrice && (
                <span className="text-[11px] text-gray-400 line-through leading-none">₨{originalPrice.toLocaleString()}</span>
              )}
            </div>
            <button
              onClick={handleAddToCart}
              className={`w-full py-2 text-white text-[11px] font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 mt-1 ${added ? 'bg-emerald-500' : 'bg-[#5FA800]'}`}
              style={added ? {} : { boxShadow: '0 3px 10px rgba(95,168,0,0.30)' }}
            >
              {added ? <><Check size={11} strokeWidth={3} />Added!</> : hasVariants ? <><Plus size={11} />Options</> : <><ShoppingCart size={11} />Add to Cart</>}
            </button>
          </div>
        </div>
        {showVariants && <VariantPickerModal product={product} onClose={() => setShowVariants(false)} />}
      </>
    );
  }

  return (
    <>
      <div
        className="w-full bg-white rounded-2xl overflow-hidden flex flex-col relative cursor-pointer active:scale-[0.97] transition-transform duration-150 shadow-[0_2px_12px_rgba(0,0,0,0.07)] border border-gray-50"
        onClick={handleNavigate}
      >
        {discount && (
          <div className="absolute top-2.5 left-2.5 z-10 bg-[#F58300] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
            {discount}% OFF
          </div>
        )}
        <button
          onClick={handleWishlist}
          className={`absolute top-2.5 right-2.5 z-10 p-1.5 bg-white/95 backdrop-blur-sm rounded-full shadow-sm transition-all active:scale-90 ${inWishlist ? 'text-red-500' : 'text-gray-400'}`}
          aria-label="Wishlist"
        >
          <Heart size={14} strokeWidth={2.5} fill={inWishlist ? 'currentColor' : 'none'} />
        </button>

        <div className="w-full h-[140px] relative overflow-hidden bg-gray-50">
          {image ? (
            <img src={getProductImageSrc(image)} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${product.gradient || 'from-green-400 to-emerald-600'}`} />
          )}
        </div>

        <div className="p-3 flex flex-col flex-grow gap-1.5">
          <h3 className="text-[13px] font-semibold text-gray-900 line-clamp-2 leading-snug">{product.name}</h3>
          <StarRow />
          <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1">
            <span className="text-[15px] font-bold text-[#5FA800] leading-none">₨{price.toLocaleString()}</span>
            {originalPrice && (
              <span className="text-[11px] text-gray-400 line-through leading-none">₨{originalPrice.toLocaleString()}</span>
            )}
          </div>
          <button
            onClick={handleAddToCart}
            className={`w-full py-2 text-white text-[11px] font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 mt-1 ${added ? 'bg-emerald-500' : 'bg-[#5FA800]'}`}
            style={added ? {} : { boxShadow: '0 3px 10px rgba(95,168,0,0.30)' }}
          >
            {added ? <><Check size={11} strokeWidth={3} />Added!</> : hasVariants ? <><Plus size={11} />Choose Options</> : <><ShoppingCart size={11} />Add to Cart</>}
          </button>
        </div>
      </div>
      {showVariants && <VariantPickerModal product={product} onClose={() => setShowVariants(false)} />}
    </>
  );
}
