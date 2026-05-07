import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Search, SlidersHorizontal, X, ShoppingCart, Star, Check } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import { useCart } from '../context/CartContext';
import { ProductCard } from '../components/ProductCard';
import { useListProducts, useListCategories, ListProductsSortBy } from '@workspace/api-client-react';
import { BottomNav } from '../components/BottomNav';

const BG_COLOR = '#F8F9FB';

export function ProductListingPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);

  const { totalItems } = useCart();
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState(params.get('q') || '');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState(params.get('category') || '');
  const [sortBy, setSortBy] = useState<ListProductsSortBy>(ListProductsSortBy.newest);
  const [minRating, setMinRating] = useState<number | undefined>(undefined);
  const [showHints, setShowHints] = useState(false);
  const [searchHints, setSearchHints] = useState<{ products: any[]; categories: any[] }>({ products: [], categories: [] });
  const [hintLoading, setHintLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const BASE_URL = import.meta.env.BASE_URL ?? "/";

  function getImgSrc(key: string | null | undefined) {
    if (!key) return null;
    if (key.startsWith("http")) return key;
    return `${BASE_URL}api/storage/objects/${key}`;
  }

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!searchQuery.trim()) { setSearchHints({ products: [], categories: [] }); return; }
      setHintLoading(true);
      try {
        const r = await fetch(`${BASE_URL}api/search?q=${encodeURIComponent(searchQuery.trim())}&limit=6`);
        if (r.ok) { const d = await r.json(); setSearchHints(d); setShowHints(true); }
      } catch {} finally { setHintLoading(false); }
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowHints(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const { data: categories } = useListCategories();
  const selectedCategory = (categories ?? []).find((c: any) => c.slug === selectedCategorySlug);

  const { data: productsData, isLoading } = useListProducts({
    search: searchQuery || undefined,
    categoryId: selectedCategory?.id,
    sortBy,
    limit: 50,
  });

  const products = productsData?.items ?? [];

  const filteredProducts = minRating
    ? products.filter((p: any) => Number(p.rating) >= minRating)
    : products;

  return (
    <div className="w-full min-h-[100dvh] relative font-sans" style={{ backgroundColor: BG_COLOR }}>
      <header className="sticky top-0 z-40 bg-white shadow-sm flex flex-col">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => window.history.back()} className="p-1 -ml-1 text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1 relative" ref={searchRef}>
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Search size={16} className={hintLoading ? "text-[#5FA800] animate-pulse" : "text-gray-400"} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowHints(true); }}
              onFocus={() => searchQuery.length > 0 && setShowHints(true)}
              placeholder="Search... try: badam, kaju, almonz"
              className="w-full bg-gray-100 text-sm font-medium text-gray-900 rounded-full py-2 pl-9 pr-8 outline-none focus:ring-2 focus:ring-[#5FA800]/20 transition-all"
            />
            {searchQuery && (
              <button className="absolute inset-y-0 right-3 flex items-center" onClick={() => { setSearchQuery(''); setShowHints(false); }}>
                <X size={14} className="text-gray-400" />
              </button>
            )}
            {showHints && searchQuery.length > 0 && (searchHints.products.length > 0 || searchHints.categories.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
                {searchHints.products.map(p => (
                  <button key={p.id} type="button"
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 text-left transition-colors border-b border-gray-50 last:border-0"
                    onClick={() => { setShowHints(false); setLocation(`/product/${p.id}`); }}>
                    {p.image ? (
                      <img src={getImgSrc(p.image) ?? undefined} alt={p.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-[#5FA800]/10 flex-shrink-0 flex items-center justify-center text-[#5FA800] text-xs font-bold">{p.name[0]}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs font-bold" style={{ color: "#5FA800" }}>Rs. {p.price.toLocaleString()}</p>
                    </div>
                    {p.stock === 0 && <span className="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded-full flex-shrink-0">Out of stock</span>}
                  </button>
                ))}
                {searchHints.categories.length > 0 && (
                  <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Categories</p>
                    <div className="flex gap-2 flex-wrap">
                      {searchHints.categories.map(c => (
                        <button key={c.id} type="button"
                          onClick={() => { setSelectedCategorySlug(c.slug); setShowHints(false); }}
                          className="text-xs px-3 py-1 rounded-full bg-[#5FA800]/10 font-semibold border border-[#5FA800]/20 hover:bg-[#5FA800] hover:text-white transition-colors" style={{ color: "#5FA800" }}>
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <button onClick={() => setShowFilters(true)} className="p-2 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors relative">
            <SlidersHorizontal size={18} />
            {(selectedCategorySlug || minRating) && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-[#5FA800] rounded-full border-2 border-white"></span>}
          </button>
          <button onClick={() => setLocation('/cart')} className="p-2 text-gray-700 hover:bg-gray-100 rounded-full transition-colors relative">
            <ShoppingCart size={22} />
            {totalItems > 0 && (
              <span className="absolute top-0 right-0 bg-[#F58300] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white leading-none">
                {totalItems > 9 ? '9+' : totalItems}
              </span>
            )}
          </button>
        </div>

        {selectedCategorySlug && (
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto hide-scrollbar">
            <div className="flex items-center gap-1 bg-[#5FA800]/10 text-[#5FA800] px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 border border-[#5FA800]/20">
              {(selectedCategory as any)?.name || selectedCategorySlug}
              <button onClick={() => setSelectedCategorySlug('')}><X size={12} className="ml-0.5" /></button>
            </div>
          </div>
        )}

        <div className="px-4 py-2 bg-white border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500">{isLoading ? 'Loading...' : `${filteredProducts.length} Results`}</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as ListProductsSortBy)} className="text-xs font-bold text-gray-800 bg-transparent outline-none cursor-pointer">
            <option value={ListProductsSortBy.newest}>Sort: Newest</option>
            <option value={ListProductsSortBy.price_asc}>Price: Low to High</option>
            <option value={ListProductsSortBy.price_desc}>Price: High to Low</option>
            <option value={ListProductsSortBy.rating}>Top Rated</option>
          </select>
        </div>
      </header>

      <main className="px-2.5 pt-3 pb-24">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-52 animate-pulse"></div>)}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Search size={48} className="mb-4 text-gray-300" />
            <p className="font-semibold text-lg">No products found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredProducts.map((product: any) => <ProductCard key={product.id} product={product} mode="grid" />)}
          </div>
        )}
      </main>

      <BottomNav />

      {showFilters && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowFilters(false)}></div>
          <div className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl relative z-10 flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-3xl z-20">
              <h2 className="font-bold text-lg text-gray-900">Filters</h2>
              <button onClick={() => setShowFilters(false)} className="p-1 text-gray-500 hover:bg-gray-100 rounded-full"><X size={20} /></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Category</h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between cursor-pointer" onClick={() => setSelectedCategorySlug('')}>
                    <span className={`text-sm ${!selectedCategorySlug ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>All Categories</span>
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${!selectedCategorySlug ? 'bg-[#5FA800] border-[#5FA800]' : 'border-gray-300'}`}>
                      {!selectedCategorySlug && <Check size={14} className="text-white" />}
                    </div>
                  </label>
                  {(categories ?? []).map((cat: any) => (
                    <label key={cat.id} className="flex items-center justify-between cursor-pointer" onClick={() => setSelectedCategorySlug(cat.slug)}>
                      <span className={`text-sm ${selectedCategorySlug === cat.slug ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>{cat.name}</span>
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedCategorySlug === cat.slug ? 'bg-[#5FA800] border-[#5FA800]' : 'border-gray-300'}`}>
                        {selectedCategorySlug === cat.slug && <Check size={14} className="text-white" />}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Minimum Rating</h3>
                <div className="flex gap-2">
                  {([4, 3, undefined] as (number | undefined)[]).map((r, i) => (
                    <button key={i} onClick={() => setMinRating(r)} className={`flex-1 py-2 border ${minRating === r ? 'border-[#5FA800] bg-[#5FA800]/10' : 'border-gray-200'} rounded-lg flex items-center justify-center gap-1`}>
                      <Star size={14} className={minRating === r ? 'fill-[#F58300] text-[#F58300]' : 'fill-gray-300 text-gray-300'} />
                      <span className={`text-sm font-bold ${minRating === r ? 'text-[#5FA800]' : 'text-gray-600'}`}>{r ? `${r}+` : 'All'}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 grid grid-cols-2 gap-3 bg-white sticky bottom-0 pb-8">
              <button onClick={() => { setSelectedCategorySlug(''); setMinRating(undefined); }} className="py-3 border border-gray-300 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors">Clear All</button>
              <button onClick={() => setShowFilters(false)} className="py-3 bg-[#5FA800] text-white rounded-xl font-bold text-sm shadow-md">Apply Filters</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
