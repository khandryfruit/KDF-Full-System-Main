import React from 'react';
import { ArrowLeft, Heart, ShoppingCart, Trash2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { BottomNav } from '../components/BottomNav';
import { useWishlist } from '../context/WishlistContext';

export function WishlistPage() {
  const [, setLocation] = useLocation();
  const { items, toggleItem } = useWishlist();

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] pb-20 font-sans">
      {/* Header */}
      <div className="bg-white sticky top-0 z-20 px-4 py-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => setLocation('/account')} className="p-2 -ml-2 rounded-full active:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-800" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Wishlist</h1>
        {items.length > 0 && (
          <span className="text-xs text-gray-400 font-medium">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      <div className="p-4">
        {/* Empty state */}
        {items.length === 0 && (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <Heart className="w-10 h-10 text-red-300" />
            </div>
            <p className="font-semibold text-gray-700 mb-1">Your wishlist is empty</p>
            <p className="text-sm text-gray-400 mb-6">Save items you love to buy them later</p>
            <button
              onClick={() => setLocation('/home')}
              className="bg-[#5FA800] text-white font-bold px-6 py-3 rounded-xl text-sm shadow-md"
            >
              Explore Products
            </button>
          </div>
        )}

        {/* Items */}
        {items.length > 0 && (
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 flex items-center gap-3">
                {/* Image / gradient */}
                <div
                  onClick={() => setLocation(`/products/${(item as any).slug || item.id}`)}
                  className={`w-16 h-16 rounded-xl flex-shrink-0 bg-gradient-to-br ${item.gradient} cursor-pointer active:scale-95 transition-transform`}
                />
                {/* Info */}
                <div className="flex-1 min-w-0" onClick={() => setLocation(`/products/${(item as any).slug || item.id}`)}>
                  <p className="font-semibold text-gray-900 text-sm truncate cursor-pointer">{item.name}</p>
                  <p className="text-[#5FA800] font-bold text-base mt-0.5">₨{item.price.toLocaleString()}</p>
                </div>
                {/* Actions */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => setLocation(`/products/${(item as any).slug || item.id}`)}
                    className="w-8 h-8 rounded-xl bg-[#5FA800]/10 text-[#5FA800] flex items-center justify-center active:bg-[#5FA800]/20 transition-colors"
                    title="View product"
                  >
                    <ShoppingCart className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleItem(item)}
                    className="w-8 h-8 rounded-xl bg-red-50 text-red-400 flex items-center justify-center active:bg-red-100 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
