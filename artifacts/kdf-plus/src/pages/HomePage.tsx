import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import {
  ChevronLeft, ChevronRight, ArrowRight, Star, Truck, ShieldCheck,
  RefreshCw, Headphones, Flame, Sparkles, TrendingUp, Tag,
  Volume2, VolumeX, Play, Pause, Smartphone,
} from "lucide-react";
import { useListBanners, useListCategories, useListProducts } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getProductImageSrc } from "@/lib/imageUrl";

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

/* ─── Hero Banner ────────────────────────────────────────────── */
function HeroBanner({ banners, loading }: { banners: Banner[]; loading: boolean }) {
  const [idx, setIdx]       = useState(0);
  const [paused, setPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [, setLocation]     = useLocation();

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const prev = useCallback(() => setIdx(i => (i - 1 + banners.length) % banners.length), [banners.length]);
  const next = useCallback(() => setIdx(i => (i + 1) % banners.length), [banners.length]);

  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const t = setInterval(next, 5000);
    return () => clearInterval(t);
  }, [banners.length, paused, next]);

  const handleBannerClick = (banner: Banner) => {
    if (banner.targetType === "product" && banner.targetId) setLocation(`/products/${banner.targetId}`);
    else if (banner.targetType === "category" && banner.targetId) setLocation(`/products?category=${banner.targetId}`);
    else if (banner.linkUrl) setLocation(banner.linkUrl);
    else setLocation("/products");
  };

  if (loading) {
    return (
      <div className="px-3 sm:px-6 py-4">
        <Skeleton className="w-full h-[220px] sm:h-[420px] rounded-2xl" />
      </div>
    );
  }

  /* ── fallback (no banners from DB) ── */
  if (!banners.length) {
    return (
      <div className="px-3 sm:px-6 py-4">
        <div
          className="relative overflow-hidden rounded-2xl shadow-xl h-[220px] sm:h-[420px] flex items-center"
          style={{ background: `linear-gradient(135deg, ${DARK} 0%, #1a4d00 60%, #2d7a00 100%)` }}
        >
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: "radial-gradient(circle at 20% 50%, #5FA800 0%, transparent 60%), radial-gradient(circle at 80% 20%, #8bc34a 0%, transparent 50%)" }}
          />
          <div className="relative z-10 px-6 sm:px-14 flex-1">
            <span className="inline-block text-xs font-bold uppercase tracking-widest bg-white/20 text-white px-3 py-1 rounded-full mb-3">
              Premium Quality
            </span>
            <h1 className="text-2xl sm:text-5xl font-black text-white leading-tight mb-3">
              Pakistan's Finest<br />
              <span style={{ color: "#a8e063" }}>Nuts & Dry Fruits</span>
            </h1>
            <p className="text-white/70 text-sm sm:text-lg mb-5 max-w-md hidden sm:block">
              Pure, fresh &amp; straight from the source.
            </p>
            <button
              onClick={() => setLocation("/products")}
              className="px-7 py-2.5 rounded-full font-bold text-sm text-white shadow-xl hover:opacity-90 active:scale-95 transition-all"
              style={{ backgroundColor: GREEN }}
            >
              Shop Now <ArrowRight className="inline w-4 h-4 ml-1" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="px-3 sm:px-6 py-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative rounded-2xl overflow-hidden shadow-xl h-[220px] sm:h-[420px]">

        {/* Slides */}
        {banners.map((banner, i) => {
          const desktopImg = banner.imageUrl ? getProductImageSrc(banner.imageUrl) : null;
          const mobileImg  = (banner as any).mobileImageUrl
            ? getProductImageSrc((banner as any).mobileImageUrl)
            : desktopImg;
          const bgImg = isMobile ? mobileImg : desktopImg;

          const videoSrc = isMobile
            ? ((banner as any).mobileVideoUrl || (banner as any).videoUrl || null)
            : ((banner as any).videoUrl || null);

          return (
            <div
              key={banner.id}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out cursor-pointer ${
                i === idx ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
              }`}
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
              ) : bgImg && (
                <img
                  src={bgImg}
                  alt={banner.title}
                  className="absolute inset-0 w-full h-full object-cover object-center"
                  loading={i === 0 ? "eager" : "lazy"}
                />
              )}
              {/* Gradient overlay for text readability */}
              <div
                className="absolute inset-0"
                style={{
                  background: bgImg
                    ? "linear-gradient(to right, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.05) 100%)"
                    : `linear-gradient(135deg, ${DARK} 0%, #1a4d00 60%, #2d7a00 100%)`,
                }}
              />

              {/* Content row */}
              <div className="absolute inset-0 flex items-center px-5 sm:px-12 gap-4 sm:gap-8 z-10">

                {/* ── Left: text + CTA ── */}
                <div className="flex-1 min-w-0">
                  {banner.label && (
                    <span className="inline-block text-[10px] sm:text-xs font-bold uppercase tracking-widest bg-white/20 text-white px-2.5 py-1 rounded-full mb-2 sm:mb-3">
                      {banner.label}
                    </span>
                  )}
                  <h2
                    className="text-xl sm:text-4xl lg:text-5xl font-black leading-tight mb-1.5 sm:mb-3 text-white drop-shadow"
                    style={{ textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}
                  >
                    {banner.title}
                  </h2>
                  {banner.subtitle && (
                    <p className="text-white/80 text-xs sm:text-base mb-3 sm:mb-5 max-w-xs sm:max-w-md line-clamp-2">
                      {banner.subtitle}
                    </p>
                  )}
                  {(banner as any).countdownEndAt && (
                    <div className="mb-3 sm:mb-5" onClick={e => e.stopPropagation()}>
                      <CountdownTimer endAt={(banner as any).countdownEndAt} />
                    </div>
                  )}
                  <button
                    className="inline-flex items-center gap-1.5 px-5 sm:px-8 py-2 sm:py-3 rounded-full font-bold text-xs sm:text-sm text-white shadow-lg hover:brightness-110 active:scale-95 transition-all"
                    style={{ backgroundColor: GREEN }}
                    onClick={(e) => { e.stopPropagation(); handleBannerClick(banner); }}
                  >
                    {banner.cta || "Shop Now"} <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </div>

                {/* ── Right: inner floating card (desktop image in card) ── */}
                {desktopImg && !isMobile && (
                  <div className="hidden sm:flex flex-shrink-0 items-center justify-center">
                    <div
                      className="relative bg-white/10 backdrop-blur-md border border-white/25 rounded-2xl shadow-2xl overflow-hidden hover:scale-[1.02] transition-transform duration-300"
                      style={{ width: 240, height: 220 }}
                    >
                      <img
                        src={desktopImg}
                        alt={banner.title}
                        className="w-full h-full object-cover"
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
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white hover:scale-110 transition-all"
              data-testid="button-banner-prev"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white hover:scale-110 transition-all"
              data-testid="button-banner-next"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
              {banners.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                  className={`rounded-full transition-all duration-300 ${i === idx ? "w-5 h-2" : "w-2 h-2"}`}
                  style={{ backgroundColor: i === idx ? GREEN : "rgba(255,255,255,0.6)" }}
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
function getYoutubeId(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

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
      style={{ height: isMobile ? 480 : 560 }}
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
            className={`absolute inset-0 transition-opacity duration-700 ${i === idx ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}>

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
                className="absolute inset-0 w-full h-full object-cover" alt={banner.title} />
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
        <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white leading-tight drop-shadow-2xl">
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
                className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all hover:scale-105 active:scale-95 shadow-xl ${
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
            className="absolute left-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white hover:scale-110 transition-all">
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
          </button>
          <button onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white hover:scale-110 transition-all">
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-30">
            {banners.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)}
                className={`rounded-full transition-all duration-300 ${i === idx ? "w-6 h-2.5" : "w-2.5 h-2.5"}`}
                style={{ backgroundColor: i === idx ? GREEN : "rgba(255,255,255,0.6)" }} />
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
                    <img src={thumb} className="absolute inset-0 w-full h-full object-cover" alt={reel.title} />
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
                  <img src={thumb} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={reel.title} />
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
    <div className="bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {TRUST_BADGES.map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              className={`flex items-center gap-2.5 py-3 px-3 sm:px-6 ${
                i % 2 === 0 ? "border-r border-gray-100" : ""
              } ${i < 2 ? "border-b border-gray-100 lg:border-b-0" : ""} lg:border-r lg:last:border-r-0`}
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
        <div className="grid grid-cols-2 gap-3 sm:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
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
      {/* Mobile: full-width 2-column grid */}
      <div className="grid grid-cols-2 gap-3 sm:hidden">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
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
      <div className="flex gap-3 overflow-x-auto pb-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 flex flex-col items-center gap-2">
            <Skeleton className="w-20 h-20 rounded-2xl" />
            <Skeleton className="h-2.5 rounded w-14" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
      {categories.map((cat) => (
        <Link key={cat.id} href={`/category/${cat.slug}`} data-testid={`link-category-${cat.id}`}>
          <div className="flex-shrink-0 flex flex-col items-center gap-2 group cursor-pointer">
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-transparent group-hover:border-[#5FA800] group-hover:shadow-lg transition-all duration-200 relative"
              style={{ backgroundColor: cat.color || "#f0f7e6" }}
            >
              {cat.imageUrl ? (
                <img
                  src={getProductImageSrc(cat.imageUrl)}
                  alt={cat.name}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl">
                  {cat.icon || "🥜"}
                </div>
              )}
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-[#5FA800]/0 group-hover:bg-[#5FA800]/10 transition-colors duration-200 rounded-2xl" />
            </div>
            <span className="text-xs font-semibold text-gray-700 text-center w-20 sm:w-24 line-clamp-2 group-hover:text-[#5FA800] transition-colors">
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
  const { data: bannersData,    isLoading: bannersLoading }   = useListBanners({ platform: "website" } as any);
  const { data: categoriesData, isLoading: catsLoading }      = useListCategories();
  const { data: featuredData,   isLoading: featuredLoading }  = useListProducts(
    { featured: true, limit: 10 },
    { query: { queryKey: ["products", "featured"] } }
  );
  const { data: allProductsData, isLoading: allLoading } = useListProducts(
    { limit: 20, sortBy: "newest" as const },
    { query: { queryKey: ["products", "newest"] } }
  );
  const { data: dealsData, isLoading: dealsLoading } = useListProducts(
    { limit: 10, hasDiscount: true } as any,
    { query: { queryKey: ["products", "deals"] } }
  );

  const banners         = Array.isArray(bannersData) ? (bannersData as Banner[]) : [];
  const categories      = Array.isArray(categoriesData) ? (categoriesData as Category[]) : [];
  const featuredProducts = featuredData?.items ?? [] as Product[];
  const allProducts      = allProductsData?.items ?? [] as Product[];
  const dealProducts     = dealsData?.items ?? [] as Product[];

  const { data: announcements = [] } = useQuery<any[]>({
    queryKey: ["announcements"],
    queryFn: () => fetch("/api/announcements").then(r => r.ok ? r.json() : []),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const { data: videoBanners = [] } = useQuery<VideoBanner[]>({
    queryKey: ["video-banners"],
    queryFn: () => fetch("/api/video-banners?platform=website").then(r => r.ok ? r.json() : []),
    staleTime: 60 * 1000,
  });

  const { data: mobileReels = [] } = useQuery<MobileReel[]>({
    queryKey: ["mobile-reels"],
    queryFn: () => fetch("/api/mobile-reels").then(r => r.ok ? r.json() : []),
    staleTime: 60 * 1000,
  });

  const [isMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);

  return (
    <>
      <Helmet>
        <title>KDF Plus — Premium Nuts & Dry Fruits in Pakistan</title>
        <meta name="description" content="Shop premium quality nuts, dry fruits, and seeds online in Pakistan. Fresh products, fast delivery across Karachi, Lahore, Islamabad & more." />
      </Helmet>

      {/* Scrolling announcement strip */}
      <MarqueeStrip announcements={announcements} />

      <main className="bg-gray-50 min-h-screen">

        {/* Video Banner Hero — shows above image banner if video banners exist */}
        {videoBanners.length > 0 ? (
          <VideoBannerHero banners={videoBanners} />
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

        {/* Featured Products */}
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
