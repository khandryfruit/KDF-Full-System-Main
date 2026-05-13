import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, ShoppingBag, Bell, ChevronRight, Flame, Clock, MapPin, ChevronDown, Mic, Camera, Loader2,
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

/* ── Mid-page AI Promo Card Defaults ── */
const AI_PROMO_BANNERS = [
  {
    label: '🚚 FREE DELIVERY',
    title: 'Order Rs. 1,500+\nGet Free Shipping',
    subtitle: 'Delivered in 60–72 hrs across Pakistan · Same-day in Karachi',
    cta: 'Shop Now',
    linkUrl: '/products',
    icon: '🚚',
    bgColor: 'from-[#166534] to-[#14532d]',
    g1: '#0d3200', g2: '#245a00', g3: '#3d8a00',
    orb1: '#5aaa00', orb2: '#8fcc44', orb3: '#1a5000',
  },
  {
    label: '🎁 GIFT PACKS',
    title: 'Perfect for Every\nOccasion',
    subtitle: 'Eid, birthdays, corporate gifting — curated with love.',
    cta: 'Explore Gifts',
    linkUrl: '/products',
    icon: '🎁',
    bgColor: 'from-[#7c3aed] to-[#be185d]',
    g1: '#220040', g2: '#5e0055', g3: '#9e1e7a',
    orb1: '#d63da8', orb2: '#e870c4', orb3: '#6b0e90',
  },
  {
    label: '📦 BULK ORDERS',
    title: 'Wholesale Prices\nfor Bulk Buyers',
    subtitle: 'Special rates on orders above 5kg. Contact us today.',
    cta: 'Contact Now',
    linkUrl: '/products',
    icon: '📦',
    bgColor: 'from-[#0f766e] to-[#0369a1]',
    g1: '#002838', g2: '#004d68', g3: '#006d7a',
    orb1: '#00a8b4', orb2: '#4fd8e0', orb3: '#00586a',
  },
];

/* ── Promo Banner Card Component ── */
function PromoBannerCard({
  banner, idx, onClick,
}: {
  banner: typeof AI_PROMO_BANNERS[0] & { imageUrl?: string | null };
  idx: number;
  onClick?: () => void;
}) {
  const PARTICLES = [
    { top: '14%', left: '64%', sz: 5, dl: '0s' },
    { top: '52%', left: '76%', sz: 3, dl: '1.3s' },
    { top: '28%', left: '84%', sz: 6, dl: '0.6s' },
  ];
  return (
    <div
      className="relative w-full overflow-hidden select-none active:scale-[0.982] transition-transform duration-200 cursor-pointer"
      style={{
        height: '190px',
        borderRadius: '26px',
        background: banner.imageUrl
          ? undefined
          : `linear-gradient(145deg, ${banner.g1} 0%, ${banner.g2} 55%, ${banner.g3} 100%)`,
        boxShadow: `0 12px 36px ${banner.g3}60, 0 4px 14px rgba(0,0,0,0.35)`,
      }}
      onClick={onClick}
    >
      {/* Real image */}
      {banner.imageUrl && (
        <img src={getProductImageSrc(banner.imageUrl)} alt={banner.title}
          className="absolute inset-0 w-full h-full object-cover" loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      )}
      {banner.imageUrl && <div className="absolute inset-0 bg-black/38" />}

      {/* Animated orbs */}
      <div className="banner-orb-1 absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${banner.orb1}50 0%, transparent 70%)`, filter: 'blur(20px)' }} />
      <div className="banner-orb-2 absolute -bottom-6 left-2 w-24 h-24 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${banner.orb2}44 0%, transparent 70%)`, filter: 'blur(18px)' }} />
      <div className="banner-orb-3 absolute top-3 left-[45%] w-16 h-16 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${banner.orb3}30 0%, transparent 70%)`, filter: 'blur(24px)' }} />

      {/* Floating particles */}
      {PARTICLES.map((p, i) => (
        <div key={i} className="banner-particle absolute rounded-full pointer-events-none"
          style={{ top: p.top, left: p.left, width: p.sz, height: p.sz, background: 'rgba(255,255,255,0.5)', animationDelay: p.dl }} />
      ))}

      {/* Diagonal shimmer */}
      <div className="banner-shine-anim absolute inset-y-0 w-16 pointer-events-none"
        style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.14) 50%, transparent 70%)' }} />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-center px-5 pb-3 pt-3">
        {banner.label && (
          <span
            className="w-max text-[10px] font-black px-3 py-1 rounded-full mb-2.5 tracking-wider"
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.28)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            {banner.label}
          </span>
        )}
        <h2
          className="font-black text-white leading-[1.18] mb-1.5"
          style={{ fontSize: '21px', textShadow: '0 2px 14px rgba(0,0,0,0.35)' }}
        >
          {banner.title.split('\n').map((line, i, arr) => (
            <React.Fragment key={i}>{line}{i < arr.length - 1 && <br />}</React.Fragment>
          ))}
        </h2>
        {banner.subtitle && (
          <p className="text-white/72 text-[11.5px] font-medium leading-snug mb-3">{banner.subtitle}</p>
        )}
        <button
          className="banner-cta-glow w-max flex items-center gap-2 px-5 py-2.5 rounded-full font-black text-[13px] active:scale-95 transition-transform"
          style={{ background: 'rgba(255,255,255,0.93)', color: banner.g2, backdropFilter: 'blur(8px)' }}
        >
          {banner.cta || 'Shop Now'}
          <span style={{ fontSize: '15px', fontWeight: 900 }}>→</span>
        </button>
      </div>

      {/* Floating emoji top-right */}
      <div
        className="banner-icon-float absolute right-4 top-4 pointer-events-none select-none"
        style={{ fontSize: '44px', opacity: 0.28, filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.55))' }}
      >
        {banner.icon}
      </div>
    </div>
  );
}

/* ── Urdu / Roman-Urdu → English word map for voice search ── */
const URDU_WORD_MAP: Record<string, string> = {
  badam: 'almonds', badaam: 'almonds', baadam: 'almonds',
  pista: 'pistachios', pistay: 'pistachios', pisteh: 'pistachios',
  akhrot: 'walnuts', akhroot: 'walnuts', akhroat: 'walnuts',
  kaju: 'cashews', kajoo: 'cashews', kaaju: 'cashews',
  kishmish: 'raisins', kishmash: 'raisins', kismis: 'raisins',
  khajoor: 'dates', khajur: 'dates',
  anjeer: 'figs', anjir: 'figs', angeer: 'figs',
  chilgoza: 'pine nuts', chilghoza: 'pine nuts',
  mungfali: 'peanuts', mungphali: 'peanuts', moongfali: 'peanuts', moongphali: 'peanuts',
  khumani: 'apricots', khubani: 'apricots', khobani: 'apricots',
  meva: 'dry fruits', mewa: 'dry fruits', maywa: 'dry fruits',
  'بادام': 'almonds', 'پستہ': 'pistachios', 'اخروٹ': 'walnuts',
  'کاجو': 'cashews', 'کشمش': 'raisins', 'خشک میوہ': 'dry fruits',
  'انجیر': 'figs', 'کھجور': 'dates', 'مونگ پھلی': 'peanuts',
  'چلغوزہ': 'pine nuts', 'خوبانی': 'apricots', 'مغز': 'nuts',
};

const FILLER_RE = /\b(mujhe|mujhy|muje|dikhao|dikhayein|chahiye|chahie|dena|please|show me|i want|de do|lena|batao|kya hai|kitna|kitne)\b/gi;

function translateVoiceQuery(raw: string): string {
  const trimmed = raw.trim();
  if (URDU_WORD_MAP[trimmed]) return URDU_WORD_MAP[trimmed];
  const lower = trimmed.toLowerCase();
  if (URDU_WORD_MAP[lower]) return URDU_WORD_MAP[lower];
  let result = lower;
  for (const [key, val] of Object.entries(URDU_WORD_MAP)) {
    result = result.replace(new RegExp(`\\b${key.toLowerCase()}\\b`, 'gi'), val);
  }
  result = result.replace(FILLER_RE, '').replace(/\s+/g, ' ').trim();
  return result || trimmed;
}

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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const BASE_URL = import.meta.env.BASE_URL ?? '/';
  const [isListening, setIsListening] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraDetected, setCameraDetected] = useState('');

  const handleVoiceSearch = () => {
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    const startRec = (lang: string, fallback?: string) => {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = lang;
      rec.onstart = () => setIsListening(true);
      rec.onend = () => setIsListening(false);
      rec.onerror = (err: any) => {
        setIsListening(false);
        if (fallback && (err.error === 'no-speech' || err.error === 'network')) {
          setTimeout(() => startRec(fallback), 400);
        }
      };
      rec.onresult = (e: any) => {
        const raw = e.results[0]?.[0]?.transcript ?? '';
        if (raw) {
          const translated = translateVoiceQuery(raw);
          setSearchQuery(translated);
          setTimeout(() => handleSearch(translated), 60);
        }
      };
      recognitionRef.current = rec;
      rec.start();
    };

    startRec('ur-PK', 'en-US');
  };

  const handleImageSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCameraLoading(true);
    setCameraDetected('');
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const r = await fetch(`${BASE_URL}api/chat/image-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: reader.result }),
        });
        const d = await r.json();
        if (d.detected && d.detected !== 'unknown') {
          setCameraDetected(d.detected);
          handleSearch(d.detected);
        }
      } catch {}
      finally {
        setIsCameraLoading(false);
        if (cameraInputRef.current) cameraInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

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

  const { data: productsData } = useListProducts({ limit: 50 });
  const { data: featuredData } = useListProducts({ featured: true, limit: 20 });
  const { data: categoriesData } = useListCategories();
  const { data: bannersData } = useListBanners({ platform: 'mobile' } as any);

  const products = productsData?.items ?? [];
  const categories = categoriesData ?? [];
  const banners = bannersData ?? [];

  useEffect(() => {
    const t = setInterval(() => setTimeLeft(p => p > 0 ? p - 1 : 0), 1000);
    return () => clearInterval(t);
  }, []);

  const totalBanners = banners.length > 0 ? banners.length : 4;
  useEffect(() => {
    const t = setInterval(() => setActiveBanner(p => (p + 1) % totalBanners), 5000);
    return () => clearInterval(t);
  }, [totalBanners]);

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  // Use dedicated featured API query; fall back to client-side filter from full list
  const featuredFromApi = featuredData?.items ?? [];
  const featuredProducts = featuredFromApi.length > 0
    ? featuredFromApi
    : products.filter((p: any) => p.featured);
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
                <button type="submit" className="ml-2 w-9 h-9 flex items-center justify-center rounded-xl shrink-0 active:scale-90 transition-transform" style={{ background: GREEN }}>
                  <Search size={15} className="text-white" />
                </button>
              ) : (
                <div className="ml-2 flex items-center gap-1.5 shrink-0">
                  {/* Camera button */}
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isCameraLoading}
                    title="Search by image"
                    className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-90
                      ${isCameraLoading
                        ? 'bg-green-500 shadow-md shadow-green-200'
                        : 'bg-white border border-gray-100 shadow-sm hover:border-gray-300'}`}
                  >
                    {isCameraLoading
                      ? <Loader2 size={15} className="text-white animate-spin" />
                      : <Camera size={16} className="text-gray-500" />}
                    {isCameraLoading && (
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-green-600 whitespace-nowrap bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200">
                        AI Scan
                      </span>
                    )}
                  </button>
                  {/* Mic button */}
                  <button
                    type="button"
                    onClick={handleVoiceSearch}
                    title={isListening ? 'Tap to stop' : 'Voice search (Urdu/English)'}
                    className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-90
                      ${isListening
                        ? 'bg-red-500 shadow-md shadow-red-200'
                        : 'bg-white border border-gray-100 shadow-sm hover:border-gray-300'}`}
                  >
                    <Mic size={15} className={isListening ? 'text-white' : 'text-gray-500'} />
                    {isListening && (
                      <>
                        <span className="absolute inset-0 rounded-xl bg-red-400 animate-ping opacity-40 pointer-events-none" />
                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-red-500 whitespace-nowrap bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">
                          Listening…
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
              <input ref={cameraInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSearch} />
            </form>

            {/* Live suggestions dropdown */}
            {showHints && (searchHints.products.length > 0 || searchHints.categories.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[200]">
                {searchHints.products.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 text-left border-b border-gray-50 last:border-0"
                    onMouseDown={(e) => { e.preventDefault(); setLocation(`/products/${p.slug || p.id}`); setShowHints(false); setSearchQuery(''); }}
                  >
                    {p.image ? (
                      <img src={getProductImageSrc(p.image)} alt={p.name} className="w-10 h-10 rounded-xl object-cover shrink-0"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
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

        {/* ── Premium Hero Banner ── */}
        <section className="px-4">
          {(() => {
            /* AI fallback banners — shown when no DB banners exist */
            const AI_BANNERS = [
              {
                id: 'ai-0', label: '🚚 FREE DELIVERY',
                title: 'Order Rs. 1,500+\nGet Free Shipping',
                subtitle: 'Delivered in 60–72 hrs across Pakistan · Same-day in Karachi',
                cta: 'Shop Now', linkUrl: '/products',
                g1: '#0f3300', g2: '#3d7a00',
                orb1: '#6dbf2f', orb2: '#a3d96e', orb3: '#1a5200', icon: '🚚',
              },
              {
                id: 'ai-1', label: '⚡ FLASH OFFER',
                title: 'Flat 20% OFF\nPremium Dry Fruits',
                subtitle: 'Today only · Limited stock · Order before midnight',
                cta: 'Claim Offer', linkUrl: '/products',
                g1: '#5c1a00', g2: '#b83200',
                orb1: '#f97316', orb2: '#fb923c', orb3: '#7c2d12', icon: '⚡',
              },
              {
                id: 'ai-2', label: '🎁 GIFT PACKS',
                title: 'Perfect for Every\nOccasion',
                subtitle: 'Eid · Birthdays · Corporate gifting — curated with love',
                cta: 'Explore Gifts', linkUrl: '/products',
                g1: '#2d0a38', g2: '#7e1d5f',
                orb1: '#db2777', orb2: '#e879a0', orb3: '#6b21a8', icon: '🎁',
              },
              {
                id: 'ai-3', label: '✨ NEW ARRIVALS',
                title: 'Fresh Premium\nNuts Just Landed',
                subtitle: '100% authentic · Sourced directly from farms',
                cta: 'Shop New', linkUrl: '/products',
                g1: '#082440', g2: '#035b96',
                orb1: '#38bdf8', orb2: '#7dd3fc', orb3: '#0369a1', icon: '✨',
              },
            ];

            /* Merge: real DB banners take priority */
            const displayBanners = banners.length > 0
              ? banners.map((b: any, i: number) => ({
                  id: b.id,
                  label: b.label ? `🛍 ${b.label}` : '🛍 KDF NUTS',
                  title: b.title ?? '',
                  subtitle: b.subtitle ?? '',
                  cta: b.cta ?? 'Shop Now',
                  linkUrl: b.linkUrl ?? '/products',
                  imageUrl: b.imageUrl ?? null,
                  g1: ['#0f3300','#5c1a00','#2d0a38','#082440'][i % 4],
                  g2: ['#3d7a00','#b83200','#7e1d5f','#035b96'][i % 4],
                  orb1: ['#6dbf2f','#f97316','#db2777','#38bdf8'][i % 4],
                  orb2: ['#a3d96e','#fb923c','#e879a0','#7dd3fc'][i % 4],
                  orb3: ['#1a5200','#7c2d12','#6b21a8','#0369a1'][i % 4],
                  icon: ['🥜','🎁','⚡','✨'][i % 4],
                }))
              : AI_BANNERS;

            const cur = displayBanners[activeBanner % displayBanners.length];
            if (!cur) return null;

            return (
              <div
                key={cur.id}
                className="relative w-full overflow-hidden select-none active:scale-[0.99] transition-transform duration-200"
                style={{
                  height: '215px',
                  borderRadius: '28px',
                  background: `linear-gradient(145deg, ${cur.g1} 0%, ${cur.g2} 100%)`,
                  boxShadow: `0 12px 40px ${cur.g2}55, 0 4px 12px rgba(0,0,0,0.3)`,
                  cursor: 'pointer',
                }}
                onClick={() => cur.linkUrl && setLocation(cur.linkUrl)}
              >
                {/* Real banner image */}
                {(cur as any).imageUrl && (
                  <img
                    src={getProductImageSrc((cur as any).imageUrl)}
                    alt={cur.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                {(cur as any).imageUrl && <div className="absolute inset-0 bg-black/35" />}

                {/* Floating orbs — GPU-animated */}
                <div className="banner-orb-1 absolute -top-10 -right-10 w-36 h-36 rounded-full pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${cur.orb1}60 0%, transparent 70%)`, filter: 'blur(20px)' }} />
                <div className="banner-orb-2 absolute -bottom-8 left-2 w-28 h-28 rounded-full pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${cur.orb2}50 0%, transparent 70%)`, filter: 'blur(18px)' }} />
                <div className="banner-orb-3 absolute top-2 left-1/2 w-20 h-20 rounded-full pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${cur.orb3}40 0%, transparent 70%)`, filter: 'blur(24px)' }} />

                {/* Floating particles */}
                {[
                  { top: '18%', left: '68%', size: 4, delay: '0s' },
                  { top: '55%', left: '78%', size: 3, delay: '1.2s' },
                  { top: '30%', left: '85%', size: 5, delay: '0.6s' },
                ].map((p, i) => (
                  <div
                    key={i}
                    className="banner-particle absolute rounded-full pointer-events-none"
                    style={{
                      top: p.top, left: p.left,
                      width: p.size, height: p.size,
                      background: 'rgba(255,255,255,0.55)',
                      animationDelay: p.delay,
                    }}
                  />
                ))}

                {/* Diagonal shimmer */}
                <div className="banner-shine-anim absolute inset-y-0 w-20 pointer-events-none"
                  style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.14) 50%, transparent 70%)' }} />

                {/* Main content */}
                <div className="absolute inset-0 flex flex-col justify-center px-5 pb-3 pt-3">

                  {/* Label pill — glassmorphism */}
                  <span
                    className="w-max text-[10px] font-black px-3 py-1 rounded-full mb-3 tracking-wider"
                    style={{
                      background: 'rgba(255,255,255,0.18)',
                      color: 'white',
                      border: '1px solid rgba(255,255,255,0.25)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                    }}
                  >
                    {cur.label}
                  </span>

                  {/* Headline */}
                  <h2
                    className="font-black text-white leading-[1.15] mb-1.5"
                    style={{ fontSize: '21px', textShadow: '0 2px 14px rgba(0,0,0,0.35)' }}
                  >
                    {cur.title.split('\n').map((line: string, i: number) => (
                      <React.Fragment key={i}>{line}{i < cur.title.split('\n').length - 1 && <br />}</React.Fragment>
                    ))}
                  </h2>

                  {/* Subtitle */}
                  {cur.subtitle && (
                    <p className="text-white/70 text-[11.5px] font-medium leading-snug mb-3">
                      {cur.subtitle}
                    </p>
                  )}

                  {/* CTA pill */}
                  <button
                    className="banner-cta-glow w-max flex items-center gap-2 px-5 py-2.5 rounded-full font-black text-[13px] active:scale-95 transition-transform"
                    style={{
                      background: 'rgba(255,255,255,0.94)',
                      color: cur.g2,
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    {cur.cta}
                    <span style={{ fontSize: '15px', fontWeight: 900 }}>→</span>
                  </button>
                </div>

                {/* Floating emoji icon — top right */}
                <div
                  className="banner-icon-float absolute right-5 top-4 pointer-events-none select-none"
                  style={{ fontSize: '44px', opacity: 0.28, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }}
                >
                  {cur.icon}
                </div>

                {/* Swipe dots */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none z-10">
                  {displayBanners.map((_: any, i: number) => (
                    <div
                      key={i}
                      className="h-[5px] rounded-full bg-white transition-all duration-500"
                      style={{
                        width: i === activeBanner % displayBanners.length ? '22px' : '5px',
                        opacity: i === activeBanner % displayBanners.length ? 1 : 0.35,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })()}
        </section>

        {/* ── Shop by Category — Premium Redesign ── */}
        <section>
          {/* Header */}
          <div className="flex items-center justify-between px-4 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center text-sm" style={{ background: `${GREEN}18` }}>
                🏷️
              </div>
              <h2 className="text-[17px] font-black text-gray-900">Shop by Category</h2>
              {categories.length > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ background: GREEN }}>
                  {categories.length}
                </span>
              )}
            </div>
            <button
              onClick={() => setLocation('/categories')}
              className="flex items-center gap-0.5 text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ color: GREEN, background: `${GREEN}12` }}
            >
              View All <ChevronRight size={13} />
            </button>
          </div>

          {/* Cards — horizontal scroll */}
          <div className="overflow-hidden -mx-0">
            <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 px-4">
              {(() => {
                const GRADIENTS = [
                  ['#1B4A00','#5FA800'], ['#7C2D12','#C2410C'], ['#312E81','#6D28D9'],
                  ['#0C4A6E','#0284C7'], ['#78350F','#D97706'], ['#064E3B','#059669'],
                  ['#4A1942','#9D174D'], ['#1E3A5F','#1D4ED8'],
                ];
                const BADGES = [
                  { label: '🔥 Hot',       bg: '#FF4500' },
                  { label: '⭐ Top Pick',   bg: '#E8A800' },
                  { label: '💎 Premium',    bg: '#7C3AED' },
                  { label: '⚡ Fresh',      bg: '#0284C7' },
                  { label: '🛍 Popular',    bg: '#C2410C' },
                  { label: '🎁 New',        bg: '#059669' },
                  { label: '✨ Trending',   bg: '#9D174D' },
                  { label: '🌟 Best',       bg: '#5FA800' },
                ];
                const ICONS = ['🫘','🥜','🌰','🌿','🍃','🎁','🍯','🧂'];

                const catList = categories.length > 0
                  ? categories
                  : ['Dry Fruits','Nuts','Seeds','Spices','Herbal','Gifts'].map((n,i) => ({ id:i, name:n, slug:'', icon:ICONS[i], imageUrl:null }));

                return catList.map((cat: any, idx: number) => {
                  const [g1, g2] = GRADIENTS[idx % GRADIENTS.length];
                  const badge = BADGES[idx % BADGES.length];
                  const floatClass = idx % 2 === 0 ? 'cat-float-even' : 'cat-float-odd';

                  return (
                    <div
                      key={cat.id}
                      onClick={() => setLocation(cat.slug ? `/products?category=${cat.slug}` : '/categories')}
                      className={`relative flex-shrink-0 cursor-pointer rounded-2xl overflow-hidden active:scale-[0.93] transition-transform duration-150 ${floatClass}`}
                      style={{
                        width: '112px',
                        height: '118px',
                        background: `linear-gradient(155deg, ${g1} 0%, ${g2} 100%)`,
                        boxShadow: `0 6px 20px ${g2}55`,
                      }}
                    >
                      {/* Shimmer overlay */}
                      <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div
                          className="absolute inset-y-0 w-12 bg-white/10"
                          style={{ animation: 'shimmer-slide 3.5s ease-in-out infinite', left: '-3rem' }}
                        />
                      </div>

                      {/* Category image */}
                      {cat.imageUrl ? (
                        <img
                          src={getProductImageSrc(cat.imageUrl)}
                          alt={cat.name}
                          className="absolute inset-0 w-full h-full object-cover opacity-35 mix-blend-luminosity"
                          loading="lazy"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-4xl opacity-60" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}>
                            {cat.icon || ICONS[idx % ICONS.length]}
                          </span>
                        </div>
                      )}

                      {/* Badge */}
                      <div
                        className="badge-pulse-anim absolute top-2 left-2 px-1.5 py-[3px] rounded-full text-white flex items-center"
                        style={{ fontSize: '8px', fontWeight: 900, background: badge.bg, letterSpacing: '0.02em' }}
                      >
                        {badge.label}
                      </div>

                      {/* Bottom gradient + name */}
                      <div
                        className="absolute bottom-0 left-0 right-0 px-2.5 pt-5 pb-2.5"
                        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)' }}
                      >
                        <p className="text-white text-[11.5px] font-black leading-tight drop-shadow">
                          {cat.name}
                        </p>
                      </div>
                    </div>
                  );
                });
              })()}

              {/* "More" card */}
              <div
                onClick={() => setLocation('/categories')}
                className="relative flex-shrink-0 cursor-pointer rounded-2xl overflow-hidden active:scale-[0.93] transition-transform duration-150 flex flex-col items-center justify-center gap-1 border-2 border-dashed"
                style={{ width: '112px', height: '118px', borderColor: `${GREEN}40`, background: `${GREEN}08` }}
              >
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl" style={{ background: `${GREEN}15` }}>
                  ⋯
                </div>
                <span className="text-[11px] font-black" style={{ color: GREEN }}>All Categories</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Promo Banner 1 — FREE DELIVERY ── */}
        {(() => {
          const src = banners.length > 0 ? banners[0] : null;
          const b = src
            ? { ...AI_PROMO_BANNERS[0], label: src.label ?? AI_PROMO_BANNERS[0].label, title: src.title, subtitle: (src.subtitle ?? AI_PROMO_BANNERS[0].subtitle), cta: (src.cta ?? AI_PROMO_BANNERS[0].cta), bgColor: ((src as any).bgColor ?? AI_PROMO_BANNERS[0].bgColor), linkUrl: (src.linkUrl ?? AI_PROMO_BANNERS[0].linkUrl) }
            : AI_PROMO_BANNERS[0];
          return (
            <section className="px-4">
              <PromoBannerCard banner={b} idx={0} onClick={() => setLocation(b.linkUrl)} />
            </section>
          );
        })()}

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

        {/* ── Promo Banner 2 — GIFT PACKS ── */}
        {(() => {
          const src = banners.length > 1 ? banners[1] : null;
          const b = src
            ? { ...AI_PROMO_BANNERS[1], label: src.label ?? AI_PROMO_BANNERS[1].label, title: src.title, subtitle: (src.subtitle ?? AI_PROMO_BANNERS[1].subtitle), cta: (src.cta ?? AI_PROMO_BANNERS[1].cta), bgColor: ((src as any).bgColor ?? AI_PROMO_BANNERS[1].bgColor), linkUrl: (src.linkUrl ?? AI_PROMO_BANNERS[1].linkUrl) }
            : AI_PROMO_BANNERS[1];
          return (
            <section className="px-4">
              <PromoBannerCard banner={b} idx={1} onClick={() => setLocation(b.linkUrl)} />
            </section>
          );
        })()}

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

        {/* ── Promo Banner 3 — BULK ORDERS ── */}
        {(() => {
          const src = banners.length > 2 ? banners[2] : null;
          const b = src
            ? { ...AI_PROMO_BANNERS[2], label: src.label ?? AI_PROMO_BANNERS[2].label, title: src.title, subtitle: (src.subtitle ?? AI_PROMO_BANNERS[2].subtitle), cta: (src.cta ?? AI_PROMO_BANNERS[2].cta), bgColor: ((src as any).bgColor ?? AI_PROMO_BANNERS[2].bgColor), linkUrl: (src.linkUrl ?? AI_PROMO_BANNERS[2].linkUrl) }
            : AI_PROMO_BANNERS[2];
          return (
            <section className="px-4">
              <PromoBannerCard banner={b} idx={2} onClick={() => setLocation(b.linkUrl)} />
            </section>
          );
        })()}

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
