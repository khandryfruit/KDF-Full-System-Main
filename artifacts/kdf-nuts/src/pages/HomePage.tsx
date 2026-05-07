import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, ShoppingBag, Bell, ChevronRight, Flame, Clock, MapPin, ChevronDown, ScanLine
} from 'lucide-react';
import { getProductImageSrc } from '../lib/imageUrl';
import { useLocation } from 'wouter';
import { useCart } from '../context/CartContext';
import { useNutsLocation } from '../context/LocationContext';
import { useSiteSettings, logoSrc } from '../hooks/useSiteSettings';
import { BottomNav } from '../components/BottomNav';
import { LocationModal } from '../components/LocationModal';
import { ProductCard } from '../components/ProductCard';
import {
  useListProducts,
  useListCategories,
  useListBanners,
} from '@workspace/api-client-react';

const BG = '#F4F6F8';
const GREEN = '#5FA800';

export function HomePage() {
  const [, setLocation] = useLocation();
  const { totalItems } = useCart();
  const { city, orderType, isSet } = useNutsLocation();
  const { data: siteSettings } = useSiteSettings();
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState(2 * 3600 + 15 * 60 + 38);
  const [activeBanner, setActiveBanner] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHints, setSearchHints] = useState<{ products: any[]; categories: any[] }>({ products: [], categories: [] });
  const [showHints, setShowHints] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const BASE_URL = import.meta.env.BASE_URL ?? '/';

  const handleSearch = (q?: string) => {
    const term = (q ?? searchQuery).trim();
    setShowHints(false);
    setSearchQuery('');
    if (term) setLocation(`/products?q=${encodeURIComponent(term)}`);
    else setLocation('/products');
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!searchQuery.trim()) { setSearchHints({ products: [], categories: [] }); setShowHints(false); return; }
      try {
        const r = await fetch(`${BASE_URL}api/search?q=${encodeURIComponent(searchQuery.trim())}&limit=6`);
        if (r.ok) { const d = await r.json(); setSearchHints(d); setShowHints(true); }
      } catch {}
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowHints(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data: productsData } = useListProducts({ limit: 20 });
  const { data: categoriesData } = useListCategories();
  const { data: bannersData } = useListBanners({ platform: 'mobile' } as any);

  const products = productsData?.items ?? [];
  const categories = categoriesData ?? [];
  const banners = bannersData ?? [];

  useEffect(() => {
    const t = setInterval(() => setTimeLeft(p => p > 0 ? p - 1 : 0), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => setActiveBanner(p => (p + 1) % banners.length), 4000);
    return () => clearInterval(t);
  }, [banners.length]);

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const featuredProducts = products.filter((p: any) => p.featured);
  const allProducts = products;

  const { data: announcements = [] } = useQuery<any[]>({
    queryKey: ['announcements'],
    queryFn: () => fetch('/api/announcements').then(r => r.ok ? r.json() : []),
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  return (
    <div className="w-full min-h-[100dvh] pb-24 font-sans" style={{ backgroundColor: BG }}>
      {showLocationModal && <LocationModal onClose={() => setShowLocationModal(false)} />}

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-white" style={{ boxShadow: '0 1px 0 #f0f0f0' }}>
        <div className="px-4 pt-4 pb-3 flex flex-col gap-2.5">

          {/* Row 1: Brand + Icons */}
          <div className="flex items-start justify-between">
            {/* Brand + location */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                {logoSrc(siteSettings?.logoPath) && (
                  <img
                    src={logoSrc(siteSettings?.logoPath)!}
                    alt=""
                    className="h-8 w-8 rounded-xl object-contain shrink-0"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <h1 className="text-[26px] font-black text-gray-900 leading-none tracking-tight">
                  {siteSettings?.siteName
                    ? (() => {
                        const name = siteSettings.siteName;
                        const idx = name.lastIndexOf(' ');
                        return idx > 0
                          ? <>{name.slice(0, idx + 1)}<span style={{ color: GREEN }}>{name.slice(idx + 1)}</span></>
                          : <span style={{ color: GREEN }}>{name}</span>;
                      })()
                    : <><span className="text-gray-900">KDF </span><span style={{ color: GREEN }}>NUTS</span></>
                  }
                </h1>
              </div>
              <button
                onClick={() => setShowLocationModal(true)}
                className="flex items-center gap-1 mt-1"
              >
                <MapPin size={13} style={{ color: GREEN }} className="shrink-0" />
                <span className="text-[13px] font-semibold text-gray-700">
                  {isSet ? city : 'Select Location'}
                </span>
                <ChevronDown size={12} className="text-gray-500 mt-px" />
              </button>
            </div>

            {/* Icon buttons: Bag + Bell */}
            <div className="flex items-center gap-2 mt-0.5 shrink-0">
              {/* Shopping Bag */}
              <button
                onClick={() => setLocation('/cart')}
                className="relative w-11 h-11 flex items-center justify-center rounded-2xl"
                style={{ backgroundColor: '#F0F0F5' }}
              >
                <ShoppingBag size={21} className="text-gray-700" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#F58300] text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white leading-none">
                    {totalItems}
                  </span>
                )}
              </button>
              {/* Bell */}
              <button
                className="relative w-11 h-11 flex items-center justify-center rounded-2xl"
                style={{ backgroundColor: GREEN }}
              >
                <Bell size={21} className="text-white" />
                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
              </button>
            </div>
          </div>

          {/* Row 2: Search bar */}
          <div ref={searchContainerRef} className="relative">
            <form
              onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
              className="flex items-center bg-gray-100 rounded-2xl px-4 py-3"
            >
              <Search size={18} className="text-gray-400 shrink-0 mr-2.5" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.trim() && setShowHints(true)}
                placeholder="Search for products, brands..."
                className="bg-transparent text-[14px] text-gray-800 placeholder-gray-400 flex-1 outline-none"
              />
              {searchQuery ? (
                <button
                  type="submit"
                  className="ml-2 w-8 h-8 flex items-center justify-center rounded-xl bg-[#5FA800] shrink-0"
                >
                  <Search size={15} className="text-white" />
                </button>
              ) : (
                <div className="ml-2 w-8 h-8 flex items-center justify-center rounded-xl bg-white shadow-sm shrink-0">
                  <ScanLine size={17} className="text-gray-500" />
                </div>
              )}
            </form>

            {/* Live suggestions dropdown */}
            {showHints && (searchHints.products.length > 0 || searchHints.categories.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[200]">
                {searchHints.products.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 text-left border-b border-gray-50 last:border-0"
                    onMouseDown={(e) => { e.preventDefault(); setLocation(`/product/${p.id}`); setShowHints(false); setSearchQuery(''); }}
                  >
                    {p.image ? (
                      <img src={`${BASE_URL}api/storage/objects/${p.image}`} alt={p.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                        <Search size={14} className="text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{p.name}</p>
                      {p.price && <p className="text-[12px] text-[#5FA800] font-medium">Rs {p.price}</p>}
                    </div>
                  </button>
                ))}
                {searchHints.categories.length > 0 && (
                  <div className="px-4 py-2 bg-gray-50">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Categories</p>
                    <div className="flex flex-wrap gap-2">
                      {searchHints.categories.map((c: any) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); handleSearch(c.name); }}
                          className="text-[12px] px-3 py-1 rounded-full bg-white border border-gray-200 text-gray-700 font-medium"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSearch(); }}
                  className="w-full px-4 py-2.5 text-[13px] text-[#5FA800] font-semibold text-center border-t border-gray-100 bg-white"
                >
                  See all results for "{searchQuery}"
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* Trust strip */}
      <div className="overflow-x-auto hide-scrollbar bg-white border-b border-gray-100">
        <div className="flex items-center gap-0 min-w-max px-3 py-2.5">
          {[
            { icon: '🚚', text: 'Free Delivery Rs. 1500+' },
            { icon: '🥜', text: '100% Fresh & Organic' },
            { icon: '🔁', text: 'Easy Returns' },
            { icon: '⚡', text: 'Same Day Delivery' },
            { icon: '📞', text: '24/7 Support' },
          ].map((item, i) => (
            <div key={i} className="flex items-center">
              <div className="flex items-center gap-1.5 px-3 text-[11.5px] font-semibold text-gray-600 whitespace-nowrap">
                <span className="text-sm">{item.icon}</span>
                {item.text}
              </div>
              {i < 4 && <div className="w-px h-3 bg-gray-200 flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (() => {
        const spd = announcements[0]?.speed ?? 40;
        const duration = `${Math.max(8, Math.round(2000 / spd))}s`;
        return (
          <div className="overflow-hidden py-2 text-xs font-semibold z-30"
            style={{ backgroundColor: announcements[0].bgColor ?? '#c0392b', color: announcements[0].textColor ?? 'white' }}>
            <div className="flex whitespace-nowrap w-max" style={{ animation: `marquee ${duration} linear infinite` }}>
              {[...announcements, ...announcements].map((a: any, i: number) => (
                <span key={i} className="mr-16">{a.text}</span>
              ))}
            </div>
          </div>
        );
      })()}

      <main className="flex flex-col gap-6 pt-5">

        {/* ── Hero Banner ── */}
        <section className="px-4">
          <div className="w-full h-[185px] rounded-3xl overflow-hidden relative shadow-md bg-white">
            {banners.length > 0 ? (
              <>
                {banners.map((banner, idx) => (
                  <div
                    key={banner.id}
                    onClick={() => banner.linkUrl && setLocation(banner.linkUrl)}
                    className={`absolute inset-0 transition-opacity duration-500 cursor-pointer ${idx === activeBanner ? 'opacity-100' : 'opacity-0'}`}
                    style={{ background: `linear-gradient(135deg, #2c4c00 0%, ${GREEN} 100%)` }}
                  >
                    {banner.imageUrl && (
                      <img src={getProductImageSrc(banner.imageUrl)} alt={banner.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    )}
                    <div className="absolute inset-0 flex flex-col justify-center px-6 bg-black/15">
                      {banner.label && <span className="text-white/80 text-[11px] font-bold uppercase tracking-widest mb-1">{banner.label}</span>}
                      <h2 className="text-[22px] font-black text-white leading-tight mb-3">{banner.title}</h2>
                      {banner.cta && (
                        <button className="bg-white text-xs font-bold px-5 py-2.5 rounded-2xl w-max shadow-lg" style={{ color: GREEN }}>
                          {banner.cta}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col justify-center px-6" style={{ background: `linear-gradient(135deg, #2c4c00 0%, ${GREEN} 100%)` }}>
                <span className="text-white/80 text-[11px] font-bold uppercase tracking-widest mb-1">New Collection</span>
                <h2 className="text-[22px] font-black text-white leading-tight mb-3">Fresh<br/>Arrivals</h2>
                <button onClick={() => setLocation('/products')} className="bg-white text-xs font-bold px-5 py-2.5 rounded-2xl w-max shadow-lg" style={{ color: GREEN }}>
                  Shop Now
                </button>
              </div>
            )}
            {/* Dots */}
            {banners.length > 1 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none">
                {banners.map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full bg-white transition-all duration-300 ${i === activeBanner ? 'w-5 opacity-100' : 'w-1.5 opacity-50'}`} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Shop by Category ── */}
        <section className="px-4">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-[17px] font-black text-gray-900">Shop by Category</h2>
            <button onClick={() => setLocation('/categories')} className="text-xs font-bold flex items-center gap-0.5" style={{ color: GREEN }}>
              View All <ChevronRight size={14} />
            </button>
          </div>
          <div className="overflow-hidden -mx-4">
          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1 px-4">
            {(categories.length > 0 ? categories : ['Dry Fruits', 'Nuts', 'Seeds', 'Spices', 'Herbal', 'Gifts'].map((n, i) => ({ id: i, name: n, slug: '', icon: ['🫘','🥜','🌰','🌿','🍃','🎁'][i], color: null }))).map((cat: any) => (
              <div
                key={cat.id}
                onClick={() => setLocation(cat.slug ? `/products?category=${cat.slug}` : '/categories')}
                className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer"
              >
                <div
                  className="w-[60px] h-[60px] rounded-[20px] flex items-center justify-center text-2xl shadow-sm"
                  style={{ backgroundColor: cat.color ? `${cat.color}20` : `${GREEN}18` }}
                >
                  {cat.icon || '📦'}
                </div>
                <span className="text-[11px] font-semibold text-gray-700 whitespace-nowrap">{cat.name}</span>
              </div>
            ))}
            <div
              onClick={() => setLocation('/categories')}
              className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer"
            >
              <div className="w-[60px] h-[60px] rounded-[20px] flex items-center justify-center text-2xl shadow-sm bg-gray-100">
                ⋯
              </div>
              <span className="text-[11px] font-semibold text-gray-500 whitespace-nowrap">More</span>
            </div>
          </div>
          </div>
        </section>

        {/* ── Flash Deals ── */}
        <section className="px-4">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[17px] font-black text-gray-900 flex items-center gap-1.5">
                Flash Deals <Flame size={19} className="text-[#F58300] fill-[#F58300]" />
              </h2>
              <div className="flex items-center gap-1 bg-[#F58300]/10 px-2.5 py-1 rounded-xl border border-[#F58300]/20">
                <Clock size={11} className="text-[#F58300]" />
                <span className="text-[11px] font-black text-[#F58300] tracking-wider">{fmt(timeLeft)}</span>
              </div>
            </div>
            <button onClick={() => setLocation('/products')} className="text-xs font-bold flex items-center gap-0.5" style={{ color: GREEN }}>
              View All <ChevronRight size={14} />
            </button>
          </div>
          <div className="overflow-hidden -mx-4">
            <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 px-4">
              {(featuredProducts.length > 0 ? featuredProducts : allProducts).slice(0, 6).map((p: any) => (
                <div key={p.id} className="snap-start">
                  <ProductCard product={p} mode="scroll" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Top Picks for You ── */}
        <section className="px-4">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-[17px] font-black text-gray-900">Top Picks for You</h2>
            <button onClick={() => setLocation('/products')} className="text-xs font-bold flex items-center gap-0.5" style={{ color: GREEN }}>
              View All <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {allProducts.slice(0, 6).map((p: any) => (
              <ProductCard key={p.id} product={p} mode="grid" />
            ))}
          </div>
        </section>

        {/* ── Trending Now ── */}
        <section className="px-4 mb-2">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-[17px] font-black text-gray-900">Trending Now</h2>
            <button onClick={() => setLocation('/products')} className="text-xs font-bold flex items-center gap-0.5" style={{ color: GREEN }}>
              View All <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {allProducts.slice(6, 12).length > 0
              ? allProducts.slice(6, 12).map((p: any) => (
                  <ProductCard key={p.id} product={p} mode="grid" />
                ))
              : allProducts.slice(0, 4).map((p: any) => (
                  <ProductCard key={p.id} product={p} mode="grid" />
                ))
            }
          </div>
        </section>

      </main>

      <BottomNav />
    </div>
  );
}
