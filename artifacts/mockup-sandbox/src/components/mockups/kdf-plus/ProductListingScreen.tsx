import React, { useState } from 'react';
import { 
  ArrowLeft,
  Search,
  SlidersHorizontal,
  ChevronDown,
  X,
  Heart,
  Star,
  Check
} from 'lucide-react';
import './_group.css';

const BG_COLOR = '#F8F9FB';

export function ProductListingScreen() {
  const [showFilters, setShowFilters] = useState(false);

  const products = [
    { id: 1, title: 'Wireless Noise-Cancelling Headphones Pro Max', price: 4999, oldPrice: 6500, discount: 23, rating: 4.8, reviews: 124, gradient: 'from-green-400 to-emerald-600' },
    { id: 2, title: 'Bluetooth Over-Ear Headphones Studio', price: 3299, oldPrice: 4500, discount: 26, rating: 4.5, reviews: 89, gradient: 'from-orange-400 to-amber-500' },
    { id: 3, title: 'Sport Wireless Earbuds Premium', price: 2199, oldPrice: 3000, discount: 26, rating: 4.3, reviews: 45, gradient: 'from-emerald-400 to-teal-500' },
    { id: 4, title: 'Classic Wired Studio Headphones', price: 1599, oldPrice: 2000, discount: 20, rating: 4.6, reviews: 56, gradient: 'from-yellow-400 to-orange-500' },
    { id: 5, title: 'Gaming Headset with Mic RGB', price: 4199, oldPrice: 5800, discount: 27, rating: 4.7, reviews: 201, gradient: 'from-green-500 to-[#5FA800]' },
    { id: 6, title: 'True Wireless Earbuds Minimalist', price: 2899, oldPrice: 4000, discount: 27, rating: 4.4, reviews: 112, gradient: 'from-amber-400 to-[#F58300]' },
  ];

  const ProductCard = ({ product }: { product: any }) => (
    <div className="bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col relative group h-full">
      {/* Discount Badge */}
      <div className="absolute top-2 left-2 z-10 bg-[#F58300] text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">
        {product.discount}% OFF
      </div>
      
      {/* Wishlist Button */}
      <button className="absolute top-2 right-2 z-10 p-1.5 bg-white/80 backdrop-blur-sm rounded-full text-gray-400 hover:text-red-500 hover:bg-white transition-colors">
        <Heart size={16} strokeWidth={2.5} />
      </button>

      {/* Image Placeholder */}
      <div className={`aspect-square w-full bg-gradient-to-br ${product.gradient} relative overflow-hidden flex items-center justify-center`}>
        <div className="absolute inset-0 bg-black/5"></div>
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-grow">
        <h3 className="text-sm font-medium text-gray-800 line-clamp-2 leading-tight mb-1">{product.title}</h3>
        
        <div className="flex items-center gap-1 mb-2 mt-auto pt-2">
          <Star size={12} className="fill-[#F58300] text-[#F58300]" />
          <span className="text-xs font-semibold text-gray-700">{product.rating}</span>
          <span className="text-[10px] text-gray-400">({product.reviews})</span>
        </div>

        <div>
          <div className="flex items-end gap-1.5 mb-2">
            <span className="text-lg font-bold text-[#5FA800] leading-none">₨{product.price.toLocaleString()}</span>
            <span className="text-[11px] text-gray-400 line-through leading-none pb-0.5">₨{product.oldPrice.toLocaleString()}</span>
          </div>
          
          <button className="w-full py-[7px] px-3 bg-gradient-to-b from-[#6BC500] to-[#5FA800] text-white text-[11px] font-bold rounded-lg shadow-[0_2px_8px_rgba(95,168,0,0.28)] active:scale-[0.96] active:shadow-none transition-all duration-150 flex items-center justify-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-[390px] mx-auto min-h-[100dvh] relative font-sans" style={{ backgroundColor: BG_COLOR }}>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white shadow-sm flex flex-col">
        <div className="px-4 py-3 flex items-center gap-3">
          <button className="p-1 -ml-1 text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Search size={16} className="text-gray-400" />
            </div>
            <input 
              type="text" 
              defaultValue="Wireless Headphones"
              className="w-full bg-gray-100 text-sm font-medium text-gray-900 rounded-full py-2 pl-9 pr-8 outline-none focus:ring-2 focus:ring-[#5FA800]/20 transition-all"
            />
            <button className="absolute inset-y-0 right-3 flex items-center">
              <X size={14} className="text-gray-400" />
            </button>
          </div>
          <button onClick={() => setShowFilters(true)} className="p-2 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors relative">
            <SlidersHorizontal size={18} />
            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-[#5FA800] rounded-full border-2 border-white"></span>
          </button>
        </div>

        {/* Active Filters */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto hide-scrollbar">
          <div className="flex items-center gap-1 bg-[#5FA800]/10 text-[#5FA800] px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 border border-[#5FA800]/20">
            Electronics <X size={12} className="ml-0.5 cursor-pointer" />
          </div>
          <div className="flex items-center gap-1 bg-[#5FA800]/10 text-[#5FA800] px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 border border-[#5FA800]/20">
            Under ₨5,000 <X size={12} className="ml-0.5 cursor-pointer" />
          </div>
          <div className="flex items-center gap-1 bg-[#5FA800]/10 text-[#5FA800] px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 border border-[#5FA800]/20">
            4+ Stars <X size={12} className="ml-0.5 cursor-pointer" />
          </div>
        </div>

        {/* Sort Bar */}
        <div className="px-4 py-2 bg-white border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500">24 Results</span>
          <button className="text-xs font-bold text-gray-800 flex items-center gap-1 hover:text-[#5FA800] transition-colors">
            Sort: Relevance <ChevronDown size={14} />
          </button>
        </div>
      </header>

      <main className="p-4 pb-8">
        <div className="grid grid-cols-2 gap-3">
          {products.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        
        {/* Pagination/Load More */}
        <div className="mt-8 flex flex-col items-center">
          <span className="text-xs text-gray-500 font-medium mb-3">You've viewed 6 of 24 products</span>
          <div className="w-48 h-1 bg-gray-200 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-[#5FA800] w-1/4 rounded-full"></div>
          </div>
          <button className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-bold rounded-full shadow-sm hover:bg-gray-50 transition-colors">
            Load More
          </button>
        </div>
      </main>

      {/* Filter Bottom Sheet Preview */}
      {showFilters && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowFilters(false)}></div>
          <div className="bg-white w-full max-w-[390px] mx-auto rounded-t-3xl relative z-10 animate-in slide-in-from-bottom-full duration-300 flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-3xl z-20">
              <h2 className="font-bold text-lg text-gray-900">Filters</h2>
              <button onClick={() => setShowFilters(false)} className="p-1 text-gray-500 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1">
              {/* Price Range */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-900 mb-4">Price Range</h3>
                <div className="px-2 mb-4">
                  <div className="h-1 bg-gray-200 rounded-full relative">
                    <div className="absolute left-0 right-1/2 h-full bg-[#5FA800] rounded-full"></div>
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-[#5FA800] rounded-full shadow-sm"></div>
                    <div className="absolute right-1/2 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 bg-white border-2 border-[#5FA800] rounded-full shadow-sm"></div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2">
                    <span className="text-[10px] text-gray-500 block mb-0.5">Min (₨)</span>
                    <span className="text-sm font-bold text-gray-900">0</span>
                  </div>
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2">
                    <span className="text-[10px] text-gray-500 block mb-0.5">Max (₨)</span>
                    <span className="text-sm font-bold text-gray-900">5,000</span>
                  </div>
                </div>
              </div>

              {/* Categories */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Categories</h3>
                <div className="space-y-3">
                  {['Electronics', 'Audio', 'Wearables', 'Accessories'].map((cat, i) => (
                    <label key={cat} className="flex items-center justify-between cursor-pointer">
                      <span className={`text-sm ${i === 0 ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>{cat}</span>
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${i === 0 ? 'bg-[#5FA800] border-[#5FA800]' : 'border-gray-300'}`}>
                        {i === 0 && <Check size={14} className="text-white" />}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Rating */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Rating</h3>
                <div className="flex gap-2">
                  <button className="flex-1 py-2 border border-[#5FA800] bg-[#5FA800]/10 rounded-lg flex items-center justify-center gap-1">
                    <Star size={14} className="fill-[#F58300] text-[#F58300]" />
                    <span className="text-sm font-bold text-[#5FA800]">4+</span>
                  </button>
                  <button className="flex-1 py-2 border border-gray-200 rounded-lg flex items-center justify-center gap-1">
                    <Star size={14} className="fill-gray-300 text-gray-300" />
                    <span className="text-sm font-semibold text-gray-600">3+</span>
                  </button>
                  <button className="flex-1 py-2 border border-gray-200 rounded-lg flex items-center justify-center gap-1">
                    <Star size={14} className="fill-gray-300 text-gray-300" />
                    <span className="text-sm font-semibold text-gray-600">All</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 grid grid-cols-2 gap-3 bg-white sticky bottom-0 pb-8">
              <button className="py-3 border border-gray-300 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors">
                Clear All
              </button>
              <button onClick={() => setShowFilters(false)} className="py-3 bg-[#5FA800] text-white rounded-xl font-bold text-sm shadow-md hover:bg-green-700 transition-colors">
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
