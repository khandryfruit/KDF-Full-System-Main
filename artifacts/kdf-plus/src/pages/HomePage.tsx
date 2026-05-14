import { useState, useEffect, useRef, useCallback, Fragment, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import {
  ChevronLeft, ChevronRight, ArrowRight, Star, Truck, ShieldCheck,
  RefreshCw, Headphones, Flame, Sparkles, TrendingUp, Tag,
  Volume2, VolumeX, Play, Pause, Smartphone, Zap, Shield,
} from "lucide-react";
import { useListBanners, useListCategories, useListProducts } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getProductImageSrc } from "@/lib/imageUrl";
import { normalizeProductsListResponse } from "@/lib/normalizeProductsList";
import { asArrayFromApi } from "@/lib/asArrayFromApi";

/* ─── Types ─────────────────────────────────────────────────── */
type Banner = import("@workspace/api-client-react").Banner;
type Product = import("@workspace/api-client-react").Product;
type Category = import("@workspace/api-client-react").Category;

/* ─── Constants ─────────────────────────────────────────────── */
const GREEN = "#5FA800";
const DARK  = "#0D2B00";

const PROMO_ANNOUNCEMENTS = [
  "🚚 Free Delivery on Orders Above Rs. 1,500 — Shop Now!",
  "🔥 New Stock: Iranian Figs, Omani Dates & Premium Cashews",
  "🎁 Gift Packs Available — Perfect for Eid & Corporate Gifting",
  "⚡ Same-Day Delivery in Karachi & Lahore Before 3PM",
  "✨ Use Code NUTS10 for 10% Off Your First Order",
];

const TRUST_BADGES = [
  { icon: Truck,         title: "Free Delivery",      desc: "On orders Rs. 1,500+" },
  { icon: ShieldCheck,   title: "100% Authentic",     desc: "Directly from source" },
  { icon: RefreshCw,     title: "Easy Returns",        desc: "7-day hassle-free" },
  { icon: Headphones,    title: "24/7 Support",        desc: "WhatsApp & phone" },
];


/* ─── Marquee Strip ──────────────────────────────────────────── */
function MarqueeStrip({ announcements }: { announcements: any[] }) {
  if (announcements.length === 0) return null;
  const bg  = announcements[0]?.bgColor   ?? "#c0392b";
  const fg  = announcements[0]?.textColor ?? "white";
  const spd = announcements[0]?.speed     ?? 40;
  const duration = `${Math.max(8, Math.round(2000 / spd))}s`;
  return (
    <div
      className="w-full overflow-hidden py-2 text-xs font-semibold"
      style={{ backgroundColor: bg, color: fg }}
    >
      <div
        className="flex whitespace-nowrap w-max"
        style={{ animation: `marquee ${duration} linear infinite` }}
      >
        {[...announcements, ...announcements].map((a: any, i: number) => (
          <span key={i} className="mr-16">{a.text}</span>
        ))}
      </div>
    </div>
  );
}

/* ─── Countdown Timer ────────────────────────────────────────── */
function CountdownTimer({ endAt }: { endAt: string }) {
  const calc = () => {
    const diff = Math.max(0, Math.floor((new Date(endAt).getTime() - Date.now()) / 1000));
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return { h, m, s, done: diff === 0 };
  };
  const [t, setT] = useState(calc);
  useEffect(() => {
    if (t.done) return;
    const id = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(id);
  }, [endAt, t.done]);
  if (t.done) return null;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    <div className="flex items-center gap-1 mt-2 sm:mt-3">
      <span className="text-white/70 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mr-1">Ends in</span>
      {[pad(t.h), pad(t.m), pad(t.s)].map((val, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="bg-black/40 backdrop-blur-sm text-white font-mono font-bold text-sm sm:text-lg px-1.5 sm:px-2 py-0.5 rounded-md min-w-[2rem] sm:min-w-[2.5rem] text-center">
            {val}
          </span>
          {i < 2 && <span className="text-white/60 font-bold text-sm sm:text-lg">:</span>}
        </span>
      ))}
    </div>
  );
}

/* ─── AI Fallback Slides ─── */
const BANNER_AI_SLIDES = [
  { label: '🚚 FREE DELIVERY', headline: "Pakistan's Finest\nNuts & Dry Fruits", sub: 'Order Rs. 1,500+ and get free shipping nationwide', cta: 'Shop Now', g1: '#0b2e00', g2: '#2d6600', g3: '#4a9e00', orb1: '#6dbf2f', orb2: '#a3d96e', orb3: '#1a5200', icon: '🥜' },
  { label: '⚡ FLASH OFFER', headline: "Flat 20% OFF\nPremium Selection", sub: 'Today only · Limited stock available', cta: 'Claim Offer', g1: '#4a0e00', g2: '#8c2200', g3: '#c23000', orb1: '#f97316', orb2: '#fb923c', orb3: '#7c2d12', icon: '⚡' },
  { label: '🎁 GIFT PACKS', headline: "Perfect for Every\nOccasion", sub: 'Eid · Birthdays · Corporate gifting — curated with love', cta: 'Explore Gifts', g1: '#200832', g2: '#5e1155', g3: '#9e1a7a', orb1: '#db2777', orb2: '#e879a0', orb3: '#6b21a8', icon: '🎁' },
  { label: '✨ NEW ARRIVALS', headline: "Fresh Premium\nNuts Just Landed", sub: '100% authentic · Sourced directly from farms', cta: 'See New', g1: '#051830', g2: '#0a3870', g3: '#0e5aaa', orb1: '#38bdf8', orb2: '#7dd3fc', orb3: '#0369a1', icon: '✨' },
];

/* ─── Hero Banner ────────────────────────────────────────────── */
function HeroBanner({ banners, loading }: { banners: Banner[]; loading: boolean }) {
  const [idx, setIdx]             = useState(0);
  const [fallbackIdx, setFallbackIdx] = useState(0);
  const [paused, setPaused]       = useState(false);
  const [isMobile, setIsMobile]   = useState(() => window.innerWidth < 768);
  const [, setLocation]           = useLocation();
  const touchStartX               = useRef<number | null>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const prev = useCallback(() => setIdx(i => (i - 1 + banners.length) % banners.length), [banners.length]);
  const next = useCallback(() => setIdx(i => (i + 1) % banners.length), [banners.length]);

  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const t = setInterval(next, 5600);
    return () => clearInterval(t);
  }, [banners.length, paused, next]);

  /* fallback auto-rotate — only active when no DB banners */
  useEffect(() => {
    if (banners.length > 0) return;
    const t = setInterval(() => setFallbackIdx(p => (p + 1) % BANNER_AI_SLIDES.length), 5600);
    return () => clearInterval(t);
  }, [banners.length]);

  const handleBannerClick = (banner: Banner) => {
    if (banner.targetType === "product" && banner.targetId) setLocation(`/products/${banner.targetId}`);
    else if (banner.targetType === "category" && banner.targetId) setLocation(`/products?category=${banner.targetId}`);
    else if (banner.linkUrl) setLocation(banner.linkUrl);
    else setLocation("/products");
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
        <Skeleton className="w-full min-h-[232px] h-[min(68vw,300px)] sm:min-h-[248px] sm:h-[min(30vh,340px)] md:h-[min(28vh,360px)] lg:min-h-[272px] lg:h-[min(32vh,380px)] lg:max-h-[400px] rounded-2xl sm:rounded-2xl" />
      </div>
    );
  }

  /* ── fallback (no banners from DB) — Premium AI Banners ── */
  if (!banners.length) {
    const s = BANNER_AI_SLIDES[fallbackIdx];
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div
          className="relative flex flex-col justify-end overflow-hidden min-h-[232px] h-[min(68vw,300px)] sm:min-h-[248px] sm:h-[min(30vh,340px)] md:h-[min(28vh,360px)] lg:min-h-[272px] lg:h-[min(32vh,380px)] lg:max-h-[400px] sm:justify-center rounded-2xl sm:rounded-2xl cursor-pointer ring-1 ring-black/[0.04] transition-opacity active:opacity-95"
          style={{
            background: `linear-gradient(145deg, ${s.g1} 0%, ${s.g2} 55%, ${s.g3} 100%)`,
            boxShadow: `0 16px 40px ${s.g3}40, 0 8px 24px rgba(0,0,0,0.22)`,
          }}
          onClick={() => setLocation('/products')}
        >
          {/* Animated floating orbs */}
          <div className="plus-orb-1 absolute -top-12 -right-12 w-52 h-52 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${s.orb1}55 0%, transparent 70%)`, filter: 'blur(28px)' }} />
          <div className="plus-orb-2 absolute -bottom-10 left-4 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${s.orb2}45 0%, transparent 70%)`, filter: 'blur(22px)' }} />
          <div className="plus-orb-3 absolute top-4 left-1/3 w-28 h-28 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${s.orb3}35 0%, transparent 70%)`, filter: 'blur(30px)' }} />
          {/* Floating particles */}
          {[{top:'15%',left:'62%',sz:5,dl:'0s'},{top:'50%',left:'75%',sz:3,dl:'1.5s'},{top:'28%',left:'82%',sz:6,dl:'0.7s'},{top:'65%',left:'55%',sz:4,dl:'2s'}].map((p, i) => (
            <div key={i} className="plus-particle absolute rounded-full pointer-events-none"
              style={{ top: p.top, left: p.left, width: p.sz, height: p.sz, background: 'rgba(255,255,255,0.55)', animationDelay: p.dl }} />
          ))}
          {/* Diagonal shimmer */}
          <div className="plus-shine-anim absolute inset-y-0 w-24 pointer-events-none"
            style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%)' }} />
          {/* Content */}
          <div className="relative z-10 px-6 pb-8 pt-12 sm:px-14 sm:pb-0 sm:pt-0 flex-1 flex flex-col justify-end sm:justify-center">
            <span className="inline-block text-[11px] sm:text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full mb-3 sm:mb-4"
              style={{ background: 'rgba(255,255,255,0.18)', color: 'white', border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(10px)' }}>
              {s.label}
            </span>
            <h1 className="mb-2 text-2xl font-black leading-tight text-white sm:mb-3 sm:text-4xl lg:text-5xl"
              style={{ textShadow: '0 2px 20px rgba(0,0,0,0.45)' }}>
              {s.headline.split('\n').map((line, i) => (
                <Fragment key={i}>{line}{i < s.headline.split('\n').length - 1 && <br />}</Fragment>
              ))}
            </h1>
            <p className="text-white/70 text-xs sm:text-base mb-4 sm:mb-6 max-w-md">{s.sub}</p>
            <button
              className="plus-cta-glow inline-flex items-center gap-2 px-6 sm:px-8 py-2.5 sm:py-3.5 rounded-full font-black text-sm text-white shadow-xl hover:brightness-110 active:scale-95 transition-all"
              style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.3)' }}
            >
              {s.cta} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          {/* Floating icon right */}
          <div className="plus-icon-float absolute right-6 sm:right-16 bottom-4 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 pointer-events-none select-none"
            style={{ fontSize: 'clamp(48px,8vw,80px)', opacity: 0.22, filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.5))' }}>
            {s.icon}
          </div>
          {/* Slide dots */}
          <div className="absolute bottom-3 sm:bottom-4 left-0 right-0 flex justify-center gap-1.5 pointer-events-none z-20">
            {BANNER_AI_SLIDES.map((_, i) => (
              <div key={i} className="h-[5px] rounded-full bg-white transition-all duration-500"
                style={{ width: i === fallbackIdx ? '20px' : '5px', opacity: i === fallbackIdx ? 1 : 0.35 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const ORB_PALETTES = [
    { o1: '#6dbf2f', o2: '#a3d96e', o3: '#1a5200' },
    { o1: '#f97316', o2: '#fb923c', o3: '#7c2d12' },
    { o1: '#db2777', o2: '#e879a0', o3: '#6b21a8' },
    { o1: '#38bdf8', o2: '#7dd3fc', o3: '#0369a1' },
  ];

  return (
    <div
      className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="relative overflow-hidden min-h-[232px] h-[min(68vw,300px)] sm:min-h-[248px] sm:h-[min(30vh,340px)] md:h-[min(28vh,360px)] lg:min-h-[272px] lg:h-[min(32vh,380px)] lg:max-h-[400px] rounded-2xl sm:rounded-2xl ring-1 ring-black/[0.04]"
        style={{
          boxShadow:
            "0 14px 40px rgba(13,43,0,0.12), 0 6px 18px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.14)",
        }}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current == null || banners.length <= 1) return;
          const end = e.changedTouches[0]?.clientX ?? touchStartX.current;
          const d = end - touchStartX.current;
          touchStartX.current = null;
          if (d < -52) next();
          else if (d > 52) prev();
        }}
      >
        {/* Slides */}
        {banners.map((banner, i) => {
          const desktopImg = banner.imageUrl
            ? getProductImageSrc(banner.imageUrl, { maxWidth: isMobile ? 960 : 1600 })
            : null;
          const mobileImg = (banner as any).mobileImageUrl
            ? getProductImageSrc((banner as any).mobileImageUrl, { maxWidth: 800 })
            : desktopImg;
          const bgImg = isMobile ? mobileImg : desktopImg;

          const videoSrc = isMobile
            ? ((banner as any).mobileVideoUrl || (banner as any).videoUrl || null)
            : ((banner as any).videoUrl || null);

          const pal = ORB_PALETTES[i % ORB_PALETTES.length];

          return (
            <div
              key={banner.id}
              className={`absolute inset-0 cursor-pointer transition-opacity duration-500 ease-out motion-reduce:transition-none ${
                i === idx ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
              }`}
              style={{ willChange: i === idx || i === (idx + 1) % banners.length ? "opacity" : undefined }}
              onClick={() => handleBannerClick(banner)}
            >
              {/* Video background (takes priority over image) */}
              {videoSrc ? (
                <video
                  key={videoSrc}
                  className="absolute inset-0 w-full h-full object-cover object-center"
                  src={videoSrc.startsWith("http") ? videoSrc : `/api/storage/objects/${videoSrc}`}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload={i === 0 ? "auto" : "none"}
                />
              ) : bgImg ? (
                <img
                  src={bgImg}
                  alt={banner.title}
                  className="absolute inset-0 h-full w-full object-cover object-center lg:object-[center_22%]"
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={i === 0 ? "high" : "low"}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                /* No image — AI gradient background */
                <div className="absolute inset-0"
                  style={{ background: `linear-gradient(145deg, #0b2e00 0%, #2d6600 55%, #4a9e00 100%)` }} />
              )}

              {/* Ambient orbs — visible on no-image slides, subtle on image slides */}
              {!bgImg && !videoSrc && (<>
                <div className="plus-orb-1 absolute -top-12 -right-12 w-52 h-52 rounded-full pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${pal.o1}55 0%, transparent 70%)`, filter: 'blur(28px)' }} />
                <div className="plus-orb-2 absolute -bottom-10 left-8 w-40 h-40 rounded-full pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${pal.o2}45 0%, transparent 70%)`, filter: 'blur(22px)' }} />
                <div className="plus-orb-3 absolute top-6 left-1/3 w-28 h-28 rounded-full pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${pal.o3}35 0%, transparent 70%)`, filter: 'blur(30px)' }} />
              </>)}

              {/* Diagonal shimmer — always visible */}
              <div className="plus-shine-anim absolute inset-y-0 w-24 pointer-events-none z-[5]"
                style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%)' }} />

              {/* Gradient overlay — mobile: bottom-heavy for luxury editorial layout */}
              <div
                className="absolute inset-0"
                style={{
                  background: bgImg
                    ? isMobile
                      ? "linear-gradient(180deg, rgba(13,43,0,0.15) 0%, rgba(0,0,0,0.25) 38%, rgba(0,0,0,0.82) 100%)"
                      : "linear-gradient(to right, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.05) 100%)"
                    : `linear-gradient(135deg, ${DARK} 0%, #1a4d00 60%, #2d7a00 100%)`,
                }}
              />

              {/* Content — mobile: bottom stack + glass CTAs; desktop: side-by-side */}
              <div className="absolute inset-0 z-10 flex flex-col justify-end gap-3 px-4 pb-5 pt-12 sm:flex-row sm:items-center sm:justify-start sm:gap-10 sm:px-14 sm:pb-0 sm:pt-0 lg:gap-14 lg:px-16">

                <div className="flex-1 min-w-0 sm:self-center">
                  {/* Trust micro-row — mobile only */}
                  {isMobile && (
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/95 backdrop-blur-md">
                        <Zap className="w-3 h-3 text-amber-300" aria-hidden /> Instant checkout
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/95 backdrop-blur-md">
                        <Shield className="w-3 h-3 text-emerald-200" aria-hidden /> Trusted quality
                      </span>
                    </div>
                  )}
                  {banner.label && (
                    <span className="inline-block text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-white/95 px-3 py-1.5 rounded-full mb-2 sm:mb-3 border border-white/25 bg-white/10 backdrop-blur-md shadow-sm">
                      {banner.label}
                    </span>
                  )}
                  <h2
                    className="mb-1.5 max-w-[20rem] text-[1.45rem] font-black leading-[1.12] tracking-tight text-white drop-shadow-lg sm:mb-2.5 sm:max-w-2xl sm:text-3xl md:text-4xl lg:max-w-3xl lg:text-[2.35rem] lg:leading-[1.08]"
                    style={{ textShadow: "0 3px 22px rgba(0,0,0,0.45)" }}
                  >
                    {banner.title}
                  </h2>
                  {banner.subtitle && (
                    <p className="mb-2.5 max-w-[19rem] text-sm font-medium leading-snug text-white/90 sm:mb-4 sm:max-w-xl sm:text-base lg:text-lg">
                      {banner.subtitle}
                    </p>
                  )}
                  {(banner as any).countdownEndAt && (
                    <div className="mb-3 sm:mb-5" onClick={e => e.stopPropagation()}>
                      <CountdownTimer endAt={(banner as any).countdownEndAt} />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                    <button
                      className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white ring-1 ring-white/20 transition-opacity duration-200 hover:opacity-95 active:opacity-100 sm:px-7 sm:py-3 sm:text-[15px]"
                      style={{ backgroundColor: GREEN, boxShadow: `0 8px 24px ${GREEN}45` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBannerClick(banner);
                      }}
                    >
                      {banner.cta || "Shop Now"} <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-white/45 bg-white/12 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-opacity duration-200 hover:bg-white/20 active:opacity-95 sm:px-7 sm:py-3 sm:text-[15px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocation("/products");
                      }}
                    >
                      Explore catalog
                    </button>
                  </div>
                </div>

                {/* ── Right: inner floating card (desktop image in card) ── */}
                {desktopImg && !isMobile && (
                  <div className="hidden sm:flex flex-shrink-0 items-center justify-center">
                    <div
                      className="relative overflow-hidden rounded-2xl border border-white/25 bg-white/10 shadow-lg backdrop-blur-sm transition-shadow duration-200 hover:shadow-xl"
                      style={{ width: 200, height: 186 }}
                    >
                      <img
                        src={desktopImg}
                        alt={banner.title}
                        className="h-full w-full object-cover object-center"
                      />
                      {/* Card inner label */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-4 py-3">
                        <p className="text-white font-bold text-sm leading-tight drop-shadow">{banner.title}</p>
                        {banner.subtitle && (
                          <p className="text-white/75 text-xs mt-0.5 line-clamp-1">{banner.subtitle}</p>
                        )}
                        <button
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-white bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors"
                          onClick={(e) => { e.stopPropagation(); handleBannerClick(banner); }}
                        >
                          {banner.cta || "Shop Now"} <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Nav arrows */}
        {banners.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-2.5 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-gray-700 shadow-md transition-opacity duration-200 hover:opacity-100 sm:left-3 sm:h-9 sm:w-9 opacity-90"
              data-testid="button-banner-prev"
            >
              <ChevronLeft className="h-4 w-4 sm:h-[1.05rem] sm:w-[1.05rem]" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-2.5 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-gray-700 shadow-md transition-opacity duration-200 hover:opacity-100 sm:right-3 sm:h-9 sm:w-9 opacity-90"
              data-testid="button-banner-next"
            >
              <ChevronRight className="h-4 w-4 sm:h-[1.05rem] sm:w-[1.05rem]" />
            </button>
            <div className="absolute bottom-2.5 left-1/2 z-20 flex -translate-x-1/2 gap-1.5 sm:bottom-3">
              {banners.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                  className={`h-1.5 rounded-full transition-[width,opacity,background-color] duration-300 ease-out ${i === idx ? "w-5 sm:w-6" : "w-1.5 sm:w-2"}`}
                  style={{ backgroundColor: i === idx ? GREEN : "rgba(255,255,255,0.55)" }}
                  data-testid={`button-banner-dot-${i}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Cloudflare / YouTube / Direct video player helper ─────── */
type VideoBanner = {
  id: number; title: string; subtitle?: string;
  cfStreamId?: string; cfAccountId?: string;
  youtubeUrl?: string; directVideoUrl?: string; mobileVideoUrl?: string;
  fallbackImageUrl?: string; mobileFallbackImageUrl?: string;
  autoplay: boolean; muted: boolean; loop: boolean; showControls: boolean;
  ctaButtons?: Array<{ label: string; url: string; style: string }>;
  platform: string; sortOrder: number; active: boolean; isPriority: boolean;
  overlayOpacity?: number; textPosition?: string;
};

type MobileReel = {
  id: number; title: string; description?: string;
  cfStreamId?: string; cfAccountId?: string;
  directVideoUrl?: string; instagramUrl?: string; youtubeUrl?: string;
  thumbnailUrl?: string; autoplay: boolean; muted: boolean; loop: boolean;
  ctaLabel?: string; ctaUrl?: string; linkedProductId?: number;
  viewCount: number; likeCount: number;
};

function getYoutubeId(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** Rows in `video_banners` without any playable media still hide image banners; filter those out. */
function videoBannerHasRenderableMedia(b: VideoBanner): boolean {
  if (b.cfStreamId && b.cfAccountId) return true;
  if ((b.directVideoUrl ?? "").trim() || (b.mobileVideoUrl ?? "").trim()) return true;
  if (b.youtubeUrl && getYoutubeId(b.youtubeUrl)) return true;
  if ((b.fallbackImageUrl ?? "").trim() || (b.mobileFallbackImageUrl ?? "").trim()) return true;
  return false;
}

/* ─── Video Banner Hero ──────────────────────────────────────── */
function VideoBannerHero({ banners }: { banners: VideoBanner[] }) {
  const [idx, setIdx]     = useState(0);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const prev = useCallback(() => setIdx(i => (i - 1 + banners.length) % banners.length), [banners.length]);
  const next = useCallback(() => setIdx(i => (i + 1) % banners.length), [banners.length]);

  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const t = setInterval(next, 8000);
    return () => clearInterval(t);
  }, [banners.length, paused, next]);

  if (!banners.length) return null;

  const b = banners[idx];
  const overlayAlpha = ((b.overlayOpacity ?? 50) / 100).toFixed(2);
  const textAlign = b.textPosition === "center" ? "text-center items-center" : b.textPosition === "right" ? "text-right items-end" : "text-left items-start";

  const mobileVideo = isMobile ? (b.mobileVideoUrl || b.directVideoUrl) : b.directVideoUrl;
  const fallback = isMobile
    ? (b.mobileFallbackImageUrl || b.fallbackImageUrl)
    : b.fallbackImageUrl;

  return (
    <div
      className="relative overflow-hidden bg-black"
      style={{ height: isMobile ? 380 : 420 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slides */}
      {banners.map((banner, i) => {
        const vid = isMobile ? (banner.mobileVideoUrl || banner.directVideoUrl) : banner.directVideoUrl;
        const fb  = isMobile ? (banner.mobileFallbackImageUrl || banner.fallbackImageUrl) : banner.fallbackImageUrl;
        const cfSrc = banner.cfStreamId && banner.cfAccountId
          ? `https://customer-${banner.cfAccountId}.cloudflarestream.com/${banner.cfStreamId}/iframe?autoplay=${banner.autoplay}&muted=${muted}&loop=${banner.loop}&preload=true&poster=${fb ?? ""}`
          : null;
        const ytId = banner.youtubeUrl ? getYoutubeId(banner.youtubeUrl) : null;

        return (
          <div key={banner.id}
            className={`absolute inset-0 transition-opacity duration-500 ease-out motion-reduce:transition-none ${i === idx ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}>

            {/* Video Layer: Cloudflare (iframe) */}
            {cfSrc ? (
              <iframe
                src={cfSrc}
                className="absolute inset-0 w-full h-full object-cover border-0"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                style={{ pointerEvents: "none" }}
              />
            ) : vid ? (
              /* Direct video */
              <video
                key={`${banner.id}-${vid}`}
                ref={i === idx ? videoRef : undefined}
                className="absolute inset-0 w-full h-full object-cover"
                src={vid.startsWith("http") ? vid : `/api/storage/objects/${vid}`}
                autoPlay={banner.autoplay}
                muted={muted}
                loop={banner.loop}
                playsInline
                preload={i === 0 ? "auto" : "none"}
              />
            ) : ytId ? (
              /* YouTube embed */
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?autoplay=${banner.autoplay ? 1 : 0}&mute=1&loop=1&playlist=${ytId}&controls=0&modestbranding=1`}
                className="absolute inset-0 w-full h-full border-0"
                allow="autoplay; encrypted-media"
                style={{ pointerEvents: "none", transform: "scale(1.1)", transformOrigin: "center" }}
              />
            ) : fb ? (
              /* Fallback image */
              <img src={fb.startsWith("http") ? fb : `/api/storage/objects/${fb}`}
                className="absolute inset-0 w-full h-full object-cover" alt={banner.title}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#0D2B00] to-[#1a5200]" />
            )}

            {/* Dark overlay */}
            <div className="absolute inset-0 z-10"
              style={{ background: `rgba(0,0,0,${overlayAlpha})` }} />
          </div>
        );
      })}

      {/* Content overlay */}
      <div className={`relative z-20 h-full flex flex-col justify-center px-6 sm:px-16 gap-4 ${textAlign}`}>
        {(b as any).label && (
          <span className="inline-block text-[11px] font-bold uppercase tracking-widest bg-white/20 text-white px-3 py-1 rounded-full">
            {(b as any).label}
          </span>
        )}
        <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white leading-tight drop-shadow-lg max-w-4xl">
          {b.title}
        </h2>
        {b.subtitle && (
          <p className="text-white/80 text-sm sm:text-xl max-w-lg drop-shadow">
            {b.subtitle}
          </p>
        )}
        {b.ctaButtons && b.ctaButtons.length > 0 && (
          <div className="flex gap-3 flex-wrap mt-2">
            {b.ctaButtons.map((cta, ci) => (
              <button key={ci}
                onClick={() => setLocation(cta.url)}
                className={`px-5 py-2.5 rounded-full font-bold text-sm transition-opacity duration-200 hover:opacity-95 active:opacity-100 shadow-lg ${
                  cta.style === "outline"
                    ? "border-2 border-white text-white hover:bg-white/20"
                    : cta.style === "secondary"
                    ? "bg-white text-gray-900 hover:bg-gray-100"
                    : "text-white"
                }`}
                style={cta.style === "primary" ? { backgroundColor: GREEN } : {}}>
                {cta.label} <ArrowRight className="inline w-4 h-4 ml-1" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 z-30 flex gap-2">
        {/* Mute toggle (only for direct/CF video) */}
        {(b.directVideoUrl || b.mobileVideoUrl || (b.cfStreamId && b.cfAccountId)) && (
          <button
            onClick={() => { setMuted(m => !m); if (videoRef.current) videoRef.current.muted = !muted; }}
            className="w-9 h-9 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70 transition-colors">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Nav arrows */}
      {banners.length > 1 && (
        <>
          <button onClick={prev}
            className="absolute left-2.5 top-1/2 z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-700 opacity-90 shadow-md transition-opacity duration-200 hover:opacity-100 sm:left-3 sm:h-9 sm:w-9">
            <ChevronLeft className="h-4 w-4 sm:h-[1.05rem] sm:w-[1.05rem]" />
          </button>
          <button onClick={next}
            className="absolute right-2.5 top-1/2 z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-700 opacity-90 shadow-md transition-opacity duration-200 hover:opacity-100 sm:right-3 sm:h-9 sm:w-9">
            <ChevronRight className="h-4 w-4 sm:h-[1.05rem] sm:w-[1.05rem]" />
          </button>
          <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-1.5">
            {banners.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-[width,opacity] duration-300 ease-out ${i === idx ? "w-5 sm:w-6" : "w-1.5 sm:w-2"}`}
                style={{ backgroundColor: i === idx ? GREEN : "rgba(255,255,255,0.55)" }} />
            ))}
          </div>
        </>
      )}

      {/* Priority badge */}
      {b.isPriority && (
        <div className="absolute top-4 left-4 z-30">
          <span className="text-[11px] font-bold text-yellow-800 bg-yellow-300 px-3 py-1 rounded-full">⭐ Featured</span>
        </div>
      )}
    </div>
  );
}

/* ─── Mobile Reels Section ───────────────────────────────────── */
function MobileReelsSection({ reels }: { reels: MobileReel[] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [mutedMap, setMutedMap]   = useState<Record<number, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  const toggleMute = (id: number) => setMutedMap(m => ({ ...m, [id]: !m[id] }));

  // IntersectionObserver: auto-advance active reel on scroll
  useEffect(() => {
    const items = containerRef.current?.querySelectorAll("[data-reel]");
    if (!items) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const idx = parseInt((e.target as HTMLElement).dataset.reel ?? "0");
          setActiveIdx(idx);
          // POST view
          fetch(`/api/mobile-reels/${reels[idx]?.id}/view`, { method: "POST" }).catch(() => {});
        }
      });
    }, { root: containerRef.current, threshold: 0.6 });
    items.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [reels]);

  if (!reels.length) return null;

  return (
    <section className="py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${GREEN}15` }}>
              <Smartphone className="w-4 h-4" style={{ color: GREEN }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Trending</p>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">Featured Reels</h2>
            </div>
          </div>
        </div>

        {/* Horizontal scroll on desktop, full-screen snap on mobile */}
        <div className="sm:hidden">
          {/* Mobile: vertical snap scroll */}
          <div ref={containerRef}
            className="flex flex-col gap-0 overflow-y-auto snap-y snap-mandatory"
            style={{ height: "70vh", scrollbarWidth: "none" }}>
            {reels.map((reel, i) => {
              const isMuted = mutedMap[reel.id] !== false;
              const vid = reel.directVideoUrl;
              const thumb = reel.thumbnailUrl?.startsWith("http") ? reel.thumbnailUrl : reel.thumbnailUrl ? `/api/storage/objects/${reel.thumbnailUrl}` : null;
              return (
                <div key={reel.id} data-reel={i}
                  className="relative flex-shrink-0 w-full snap-center bg-black"
                  style={{ height: "70vh" }}>
                  {vid ? (
                    <video
                      src={vid}
                      className="absolute inset-0 w-full h-full object-cover"
                      autoPlay={i === activeIdx}
                      muted={isMuted}
                      loop
                      playsInline
                      preload={i === 0 ? "auto" : "metadata"}
                    />
                  ) : thumb ? (
                    <img src={thumb} className="absolute inset-0 w-full h-full object-cover" alt={reel.title}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900" />
                  )}
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                  {/* Content */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 z-10">
                    <p className="text-white font-bold text-lg leading-tight mb-1">{reel.title}</p>
                    {reel.description && <p className="text-white/70 text-sm mb-3 line-clamp-2">{reel.description}</p>}
                    {reel.ctaLabel && reel.ctaUrl && (
                      <button onClick={() => setLocation(reel.ctaUrl!)}
                        className="px-5 py-2 rounded-full font-bold text-sm text-white shadow-lg"
                        style={{ backgroundColor: GREEN }}>
                        {reel.ctaLabel} <ArrowRight className="inline w-3.5 h-3.5 ml-1" />
                      </button>
                    )}
                  </div>

                  {/* Mute button */}
                  {vid && (
                    <button onClick={() => toggleMute(reel.id)}
                      className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center">
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  )}

                  {/* Progress dots */}
                  <div className="absolute top-1/2 -translate-y-1/2 right-3 z-20 flex flex-col gap-1.5">
                    {reels.map((_, di) => (
                      <div key={di} className={`rounded-full transition-all ${di === i ? "w-1.5 h-6" : "w-1.5 h-1.5"}`}
                        style={{ backgroundColor: di === i ? GREEN : "rgba(255,255,255,0.5)" }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Desktop: horizontal card grid */}
        <div className="hidden sm:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {reels.slice(0, 5).map(reel => {
            const isMuted = mutedMap[reel.id] !== false;
            const vid = reel.directVideoUrl;
            const thumb = reel.thumbnailUrl?.startsWith("http") ? reel.thumbnailUrl : reel.thumbnailUrl ? `/api/storage/objects/${reel.thumbnailUrl}` : null;
            return (
              <div key={reel.id} className="relative group rounded-2xl overflow-hidden bg-black cursor-pointer hover:shadow-xl transition-shadow"
                style={{ aspectRatio: "9/16" }}
                onClick={() => reel.ctaUrl && setLocation(reel.ctaUrl)}>
                {vid ? (
                  <video src={vid} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    muted={isMuted} loop playsInline preload="metadata" autoPlay />
                ) : thumb ? (
                  <img src={thumb} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={reel.title}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-b from-gray-700 to-gray-900" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
                  <p className="text-white font-semibold text-sm line-clamp-2">{reel.title}</p>
                  {reel.ctaLabel && (
                    <span className="inline-block mt-1.5 px-3 py-1 rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: GREEN }}>
                      {reel.ctaLabel}
                    </span>
                  )}
                </div>
                {vid && (
                  <button onClick={e => { e.stopPropagation(); toggleMute(reel.id); }}
                    className="absolute top-3 right-3 z-20 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                )}
                <div className="absolute top-3 left-3 z-20">
                  <div className="w-6 h-6 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                    <Play className="w-3 h-3 text-white fill-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Trust Badges ───────────────────────────────────────────── */
function TrustStrip() {
  return (
    <div className="bg-white/90 backdrop-blur-md border-b border-[#0D2B00]/[0.06]">
      <div className="max-w-7xl mx-auto px-3 sm:px-8">
        <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 overflow-x-auto sm:overflow-visible gap-0 sm:gap-0 pb-1 sm:pb-0 snap-x snap-mandatory scrollbar-hide sm:snap-none">
          {TRUST_BADGES.map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              className={`flex min-w-[46%] sm:min-w-0 shrink-0 snap-start items-center gap-3 py-3.5 px-3 sm:px-6 sm:border-r sm:border-gray-100 sm:last:border-r-0 ${
                i % 2 === 0 ? "sm:border-r" : ""
              } ${i < 2 ? "lg:border-b-0" : ""}`}
            >
              <div
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${GREEN}15` }}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: GREEN }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-gray-900 leading-tight">{title}</p>
                <p className="text-[11px] sm:text-xs text-gray-500 leading-tight">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Section Header ─────────────────────────────────────────── */
function SectionHeader({
  icon: Icon, label, title, viewAllHref, testId,
}: {
  icon?: React.ElementType; label?: string; title: string;
  viewAllHref: string; testId: string;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${GREEN}15` }}>
            <Icon className="w-4 h-4" style={{ color: GREEN }} />
          </div>
        )}
        <div>
          {label && <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: GREEN }}>{label}</p>}
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">{title}</h2>
        </div>
      </div>
      <Link href={viewAllHref} data-testid={testId}>
        <button className="flex items-center gap-1 text-sm font-semibold hover:opacity-80 transition-opacity" style={{ color: GREEN }}>
          View All <ChevronRight className="w-4 h-4" />
        </button>
      </Link>
    </div>
  );
}

/* ─── Horizontal Product Carousel ───────────────────────────── */
function ProductCarousel({ products, loading, skeletonCount = 5 }: {
  products: Product[]; loading: boolean; skeletonCount?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "right" ? 280 : -280, behavior: "smooth" });
  };

  if (loading) {
    return (
      <>
        {/* Mobile skeleton: 2-col grid */}
        <div className="flex gap-3 overflow-x-auto pb-2 sm:hidden snap-x snap-mandatory scrollbar-hide -mx-1 px-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[min(78vw,280px)] snap-start">
              <Skeleton className="aspect-square rounded-2xl mb-2" />
              <Skeleton className="h-3 rounded w-3/4 mb-1" />
              <Skeleton className="h-3 rounded w-1/2" />
            </div>
          ))}
        </div>
        {/* Desktop skeleton: horizontal */}
        <div className="hidden sm:flex gap-4 overflow-hidden">
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-52">
              <Skeleton className="aspect-square rounded-2xl mb-2" />
              <Skeleton className="h-3 rounded w-3/4 mb-1" />
              <Skeleton className="h-3 rounded w-1/2" />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Mobile: horizontal snap carousel (app-like browsing) */}
      <div
        className="flex gap-3 overflow-x-auto pb-2 sm:hidden snap-x snap-mandatory scrollbar-hide -mx-1 px-1"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {products.map((product) => (
          <div key={product.id} className="flex-shrink-0 w-[min(78vw,280px)] snap-start first:pl-0.5">
            <ProductCard product={product} />
          </div>
        ))}
      </div>

      {/* Desktop: horizontal carousel with arrows */}
      <div className="relative group/carousel hidden sm:block">
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-9 h-9 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-all hover:scale-110"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {products.map((product) => (
            <div key={product.id} className="flex-shrink-0 w-52" style={{ scrollSnapAlign: "start" }}>
              <ProductCard product={product} />
            </div>
          ))}
        </div>

        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-9 h-9 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-all hover:scale-110"
        >
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>
    </>
  );
}

/* ─── Category Grid ──────────────────────────────────────────── */
function CategoryGrid({ categories, loading }: { categories: Category[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 sm:mx-0 sm:px-0 snap-x snap-mandatory scrollbar-hide">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 flex flex-col items-center gap-2 snap-start">
            <Skeleton className="w-[88px] h-[88px] sm:w-24 sm:h-24 rounded-[22px]" />
            <Skeleton className="h-2.5 rounded w-14" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x snap-mandatory scrollbar-hide [scrollbar-width:none] [-ms-overflow-style:none]"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {categories.map((cat) => (
        <Link key={cat.id} href={`/category/${cat.slug}`} data-testid={`link-category-${cat.id}`} className="snap-start shrink-0">
          <div className="flex flex-col items-center gap-2 group cursor-pointer w-[88px] sm:w-[104px]">
            <div
              className="w-[88px] h-[88px] sm:w-24 sm:h-24 rounded-[22px] overflow-hidden border border-black/[0.06] shadow-[0_8px_24px_rgba(13,43,0,0.08)] group-hover:shadow-[0_12px_32px_rgba(95,168,0,0.18)] group-active:scale-[0.97] transition-all duration-300 relative ring-1 ring-white/80"
              style={{ backgroundColor: cat.color || "#f0f7e6" }}
            >
              {cat.imageUrl ? (
                <img
                  src={getProductImageSrc(cat.imageUrl, { maxWidth: 480 })}
                  alt={cat.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl">
                  {cat.icon || "🥜"}
                </div>
              )}
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-[#5FA800]/0 group-hover:bg-[#5FA800]/10 transition-colors duration-200 rounded-2xl" />
            </div>
            <span className="text-[11px] sm:text-xs font-bold text-gray-800 text-center w-[88px] sm:w-24 line-clamp-2 group-hover:text-[#5FA800] transition-colors leading-tight tracking-tight">
              {cat.name}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─── Mid Promo Banner ───────────────────────────────────────── */
function PromoBanner({
  badge, title, subtitle, cta, href, gradient,
}: {
  badge: string; title: string; subtitle: string; cta: string; href: string;
  gradient: string;
}) {
  const [, setLocation] = useLocation();
  return (
    <div
      className="rounded-2xl overflow-hidden relative cursor-pointer group"
      style={{ background: gradient }}
      onClick={() => setLocation(href)}
    >
      <div className="absolute inset-0 opacity-10"
        style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(255,255,255,0.4) 0%, transparent 60%)" }}
      />
      <div className="relative z-10 p-6 sm:p-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <span className="inline-block text-xs font-bold uppercase tracking-widest bg-white/20 text-white px-3 py-1 rounded-full mb-3">
            {badge}
          </span>
          <h3 className="text-2xl sm:text-3xl font-black text-white mb-1">{title}</h3>
          <p className="text-white/80 text-sm">{subtitle}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setLocation(href); }}
          className="flex-shrink-0 bg-white font-bold text-sm px-7 py-3 rounded-full shadow-lg group-hover:scale-105 transition-all"
          style={{ color: "#0D2B00" }}
        >
          {cta} <ArrowRight className="inline w-4 h-4 ml-1" />
        </button>
      </div>
    </div>
  );
}


/* ─── Product Grid Section ────────────────────────────────────── */
function ProductGrid({ products, loading }: { products: Product[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="aspect-square rounded-2xl mb-2" />
            <Skeleton className="h-3 rounded w-3/4 mb-1" />
            <Skeleton className="h-3 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────── */
export default function HomePage() {
  const { data: bannersData, isLoading: bannersLoading } = useListBanners(
    {
      platform: "website",
      placement: "hero",
    },
    { query: { staleTime: 120_000 } },
  );
  const { data: categoriesData, isLoading: catsLoading } = useListCategories({
    query: { staleTime: 120_000 },
  });
  const { data: featuredData,   isLoading: featuredLoading }  = useListProducts(
    { featured: true, limit: 10 },
    { query: { queryKey: ["products", "featured"], staleTime: 120_000, refetchOnWindowFocus: false } },
  );
  const { data: allProductsData, isLoading: allLoading } = useListProducts(
    { limit: 20, sortBy: "newest" as const },
    { query: { queryKey: ["products", "newest"], staleTime: 120_000, refetchOnWindowFocus: false } },
  );
  const { data: dealsData, isLoading: dealsLoading } = useListProducts(
    { limit: 10, hasDiscount: true } as any,
    { query: { queryKey: ["products", "deals"], staleTime: 120_000, refetchOnWindowFocus: false } },
  );

  const banners = useMemo(() => asArrayFromApi<Banner>(bannersData), [bannersData]);
  const categories = useMemo(() => asArrayFromApi<Category>(categoriesData), [categoriesData]);
  const featuredProducts = useMemo(
    () => normalizeProductsListResponse(featuredData).items as Product[],
    [featuredData],
  );
  const allProducts = useMemo(
    () => normalizeProductsListResponse(allProductsData).items as Product[],
    [allProductsData],
  );
  const dealProducts = useMemo(
    () => normalizeProductsListResponse(dealsData).items as Product[],
    [dealsData],
  );

  const { data: announcements = [] } = useQuery<any[]>({
    queryKey: ["announcements"],
    queryFn: () => fetch("/api/announcements").then(r => r.ok ? r.json() : []),
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const { data: videoBanners = [] } = useQuery<VideoBanner[]>({
    queryKey: ["video-banners"],
    queryFn: () => fetch("/api/video-banners?platform=website").then(r => r.ok ? r.json() : []),
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const { data: mobileReels = [] } = useQuery<MobileReel[]>({
    queryKey: ["mobile-reels"],
    queryFn: () => fetch("/api/mobile-reels").then(r => r.ok ? r.json() : []),
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const [isMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);

  const playableVideoBanners = (Array.isArray(videoBanners) ? videoBanners : []).filter(videoBannerHasRenderableMedia);

  return (
    <>
      <Helmet>
        <title>KDF Plus — Premium Nuts & Dry Fruits in Pakistan</title>
        <meta name="description" content="Shop premium quality nuts, dry fruits, and seeds online in Pakistan. Fresh products, fast delivery across Karachi, Lahore, Islamabad & more." />
      </Helmet>

      {/* Scrolling announcement strip */}
      <MarqueeStrip announcements={announcements} />

      <main className="min-h-screen bg-gradient-to-b from-[#f3faf1] via-[#f7f8f6] to-[#f0f2ee]">

        {/* Video hero only when at least one row has real media; otherwise image /fallback hero */}
        {playableVideoBanners.length > 0 ? (
          <VideoBannerHero banners={playableVideoBanners} />
        ) : (
          <HeroBanner banners={banners} loading={bannersLoading} />
        )}

        {/* Trust strip */}
        <TrustStrip />

        {/* Categories */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <SectionHeader
            icon={Tag}
            title="Shop by Category"
            viewAllHref="/categories"
            testId="link-all-categories"
          />
          <CategoryGrid categories={categories} loading={catsLoading} />
        </section>

        {/* Deals / Hot Deals */}
        {(dealsLoading || dealProducts.length > 0) && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
            <div className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-gray-100">
              <SectionHeader
                icon={Flame}
                label="Limited Time"
                title="Hot Deals"
                viewAllHref="/products"
                testId="link-all-deals"
              />
              <ProductCarousel products={dealProducts} loading={dealsLoading} />
            </div>
          </section>
        )}

        {/* Featured Products — only render when there are featured products or still loading */}
        {(featuredLoading || featuredProducts.length > 0) && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
            <div className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-gray-100">
              <SectionHeader
                icon={Sparkles}
                label="Hand-Picked"
                title="Featured Products"
                viewAllHref="/products?featured=true"
                testId="link-all-featured"
              />
              <ProductCarousel products={featuredProducts} loading={featuredLoading} />
            </div>
          </section>
        )}

        {/* Mobile Reels */}
        {mobileReels.length > 0 && (
          <MobileReelsSection reels={mobileReels} />
        )}

        {/* Mid promo banner */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          <PromoBanner
            badge="Free Delivery"
            title="Order Rs. 1,500+ Get Free Shipping"
            subtitle="Delivered in 60–72 hours across Pakistan · Same-day in Karachi"
            cta="Shop Now"
            href="/products"
            gradient={`linear-gradient(135deg, ${DARK} 0%, #1a5200 100%)`}
          />
        </section>

        {/* New Arrivals */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          <div className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-gray-100">
            <SectionHeader
              icon={TrendingUp}
              label="Just In"
              title="New Arrivals"
              viewAllHref="/products?sortBy=newest"
              testId="link-all-new"
            />
            <ProductGrid products={allProducts.slice(0, 10)} loading={allLoading} />
          </div>
        </section>

        {/* Second promo banner */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          <div className="grid sm:grid-cols-2 gap-4">
            <PromoBanner
              badge="Gift Packs"
              title="Perfect for Every Occasion"
              subtitle="Eid, birthdays, corporate gifting — curated with love."
              cta="Explore Gifts"
              href="/category/gifting"
              gradient="linear-gradient(135deg, #7b2d8b 0%, #c0392b 100%)"
            />
            <PromoBanner
              badge="Bulk Orders"
              title="Wholesale Prices for Bulk Buyers"
              subtitle="Special rates on orders above 5kg. Contact us today."
              cta="Contact Now"
              href="/products"
              gradient="linear-gradient(135deg, #1a5276 0%, #117a8b 100%)"
            />
          </div>
        </section>

        {/* All products */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
          <div className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-gray-100">
            <SectionHeader
              title="All Products"
              viewAllHref="/products"
              testId="link-all-products"
            />
            <ProductGrid products={allProducts} loading={allLoading} />
            {!allLoading && allProducts.length > 0 && (
              <div className="flex justify-center mt-8">
                <Link href="/products">
                  <button
                    className="px-10 py-3 rounded-full font-bold text-sm text-white shadow-lg hover:opacity-90 active:scale-95 transition-all"
                    style={{ backgroundColor: GREEN }}
                  >
                    View All Products <ArrowRight className="inline w-4 h-4 ml-1" />
                  </button>
                </Link>
              </div>
            )}
          </div>
        </section>

      </main>

    </>
  );
}
