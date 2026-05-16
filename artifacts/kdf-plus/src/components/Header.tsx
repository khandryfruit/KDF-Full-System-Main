import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import {
  Search, MapPin, ChevronDown, User, LogOut, Package, Heart,
  ShoppingBag, Truck, Leaf, RefreshCcw, PhoneCall, Flame, Sparkles,
  Star, X, Menu, Home, LayoutGrid, Mic, TrendingUp, ArrowRight,
  ChevronRight, Shield, Zap, Gift, Phone, Clock, Navigation, Camera, Loader2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useUserLocation } from "@/context/LocationContext";
import { useSiteSettings, logoSrc } from "@/hooks/useSiteSettings";
import { getProductImageSrc } from "@/lib/imageUrl";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const GREEN  = "#5FA800";
const ORANGE = "#F58300";

/* ── Urdu / Roman-Urdu → English word map for voice/AI search ── */
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

/* ─── Typing Placeholder ─────────────────────────────────────── */
const PLACEHOLDERS = [
  "Search almonds…", "Search pistachios…", "Search cashews…",
  "Search organic honey…", "Search walnuts…", "Search dates…",
  "Search dried berries…", "Search mixed nuts…",
];
function useTypingPlaceholder() {
  const [idx, setIdx]     = useState(0);
  const [shown, setShown] = useState("");
  const [del, setDel]     = useState(false);
  useEffect(() => {
    const target = PLACEHOLDERS[idx];
    const delay  = del ? 40 : 80;
    const t = setTimeout(() => {
      if (!del) {
        if (shown.length < target.length) { setShown(target.slice(0, shown.length + 1)); }
        else { setTimeout(() => setDel(true), 1400); }
      } else {
        if (shown.length > 0) { setShown(shown.slice(0, -1)); }
        else { setDel(false); setIdx(i => (i + 1) % PLACEHOLDERS.length); }
      }
    }, delay);
    return () => clearTimeout(t);
  }, [shown, del, idx]);
  return shown || "Search nuts, dry fruits…";
}

/* ─── Mega Menu data ─────────────────────────────────────────── */
const MEGA_ITEMS = [
  {
    label: "Dry Fruits", slug: "dry-fruits",
    sub: [
      { label: "Dates", slug: "dates",       emoji: "🌴" },
      { label: "Raisins", slug: "raisins",   emoji: "🍇" },
      { label: "Apricots", slug: "apricots", emoji: "🍑" },
      { label: "Figs", slug: "figs",         emoji: "🌿" },
      { label: "Prunes", slug: "prunes",     emoji: "🫐" },
    ],
    featured: { label: "Premium Dates", badge: "New", color: "#8B4513" },
  },
  {
    label: "Nuts", slug: "nuts",
    sub: [
      { label: "Almonds", slug: "almonds",       emoji: "🥜" },
      { label: "Cashews", slug: "cashews",       emoji: "🌰" },
      { label: "Walnuts", slug: "walnuts",       emoji: "🫘" },
      { label: "Pistachios", slug: "pistachios", emoji: "🍃" },
      { label: "Pine Nuts", slug: "pine-nuts",   emoji: "🌲" },
    ],
    featured: { label: "Raw Cashews", badge: "Hot", color: GREEN },
  },
  {
    label: "Seeds", slug: "seeds",
    sub: [
      { label: "Chia Seeds", slug: "chia",         emoji: "🌱" },
      { label: "Flax Seeds", slug: "flax",         emoji: "🌾" },
      { label: "Pumpkin Seeds", slug: "pumpkin",   emoji: "🎃" },
      { label: "Sunflower Seeds", slug: "sunflower", emoji: "🌻" },
      { label: "Sesame Seeds", slug: "sesame",     emoji: "✨" },
    ],
    featured: { label: "Chia Seeds", badge: "Organic", color: "#16a34a" },
  },
  {
    label: "Organic", slug: "organic",
    sub: [
      { label: "Organic Honey", slug: "honey",           emoji: "🍯" },
      { label: "Organic Almonds", slug: "organic-almonds", emoji: "🌿" },
      { label: "Raw Walnuts", slug: "raw-walnuts",       emoji: "🥜" },
      { label: "Cold Pressed Oil", slug: "oils",         emoji: "🫙" },
      { label: "Natural Herbs", slug: "herbs",           emoji: "🌺" },
    ],
    featured: { label: "Pure Honey", badge: "100% Pure", color: ORANGE },
  },
];

/* ─── Marquee Announcement Bar ───────────────────────────────── */
function AnnouncementBar({ items }: { items: any[] }) {
  const [paused, setPaused] = useState(false);
  if (!items.length) return null;
  const doubled = [...items, ...items];

  return (
    <div
      className="overflow-hidden py-2 relative"
      style={{ background: "linear-gradient(90deg, #0a1f00 0%, #0d2b00 50%, #0a1f00 100%)" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className={`flex gap-0 whitespace-nowrap ${paused ? "" : "animate-marquee"}`}
        style={{ animationDuration: `${Math.max(20, items.length * 8)}s` }}>
        {doubled.map((ann, i) => (
          <span key={i} className="inline-flex items-center gap-2 px-8 text-xs font-medium"
            style={{ color: ann.textColor ?? "#fff" }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ORANGE }} />
            {ann.text}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Mega Menu — panel portaled to body (avoids overflow clipping + wrong anchor width on Shopify-like layouts) ─── */
function MegaMenuDropdown({ item, onNavigate, panelTopPx }: { item: typeof MEGA_ITEMS[0]; onNavigate: (path: string) => void; panelTopPx: number }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const enter = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOpen(true), 48);
  };
  const leave = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOpen(false), 220);
  };

  /* Close mega panel on scroll (reduces “stuck” overlay + layout glitches on long pages). */
  useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  const panel = open && typeof document !== "undefined" ? createPortal(
    <div
      className="pointer-events-auto fixed z-[580] max-sm:hidden animate-in fade-in slide-in-from-top-2 duration-200"
      style={{
        left: "50%",
        top: panelTopPx,
        transform: "translateX(-50%) translateZ(0)",
        width: "min(96vw, 72rem)",
        maxWidth: "72rem",
        minWidth: "min(96vw, 22rem)",
        willChange: "transform, opacity",
      }}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_24px_64px_-20px_rgba(15,23,42,0.22)] backdrop-blur-xl ring-1 ring-slate-900/[0.04]">
        <div className="grid max-h-[min(72vh,560px)] grid-cols-1 divide-y divide-slate-100 md:min-h-[280px] md:grid-cols-12 md:divide-x md:divide-y-0">
          <div className="p-4 sm:p-5 md:col-span-5 md:max-h-[min(72vh,520px)] md:overflow-y-auto">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {item.sub.map(sub => (
                <button
                  key={sub.slug}
                  type="button"
                  onClick={() => { onNavigate(`/products?category=${sub.slug}`); setOpen(false); }}
                  className="group flex min-h-[42px] w-full min-w-0 flex-row items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[#5FA800]/10"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-base leading-none ring-1 ring-slate-200/60 transition-colors group-hover:bg-white group-hover:ring-[#5FA800]/25" aria-hidden>
                    {sub.emoji}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
                    <span className="block leading-snug">{sub.label}</span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-80 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#5FA800]" strokeWidth={2.5} />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { onNavigate(`/products?category=${item.slug}`); setOpen(false); }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#5FA800]/25 bg-[#5FA800]/6 py-2.5 text-sm font-bold text-[#3d7000] transition-colors hover:bg-[#5FA800]/12"
            >
              View all {item.label}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col justify-between bg-gradient-to-br from-[#f8fdf4] via-white to-slate-50/90 p-4 sm:p-5 md:col-span-4 md:max-h-[min(72vh,520px)] md:overflow-y-auto">
            <div>
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Featured</p>
              <div
                className="rounded-xl border p-3.5 shadow-sm transition-shadow duration-200 hover:shadow-md"
                style={{ background: `${item.featured.color}12`, borderColor: `${item.featured.color}35` }}
              >
                <span
                  className="mb-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm"
                  style={{ background: item.featured.color }}
                >
                  {item.featured.badge}
                </span>
                <p className="text-[15px] font-bold leading-snug text-slate-900 sm:text-base">{item.featured.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">Premium quality — natural & pure.</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 border-t border-slate-200/70 pt-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 shrink-0 text-[#5FA800]" strokeWidth={2.25} />
                <span>Quality guaranteed</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5 shrink-0 text-[#5FA800]" strokeWidth={2.25} />
                <span>Free delivery Rs.1500+</span>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5 md:col-span-3 md:max-h-[min(72vh,520px)] md:overflow-y-auto md:bg-slate-50/40">
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Popular & offers</p>
            <div className="flex flex-col gap-1">
              {[
                { label: "Hot deals", href: "/products?featured=true", Icon: Flame, c: ORANGE },
                { label: "New arrivals", href: "/products?sortBy=newest", Icon: Sparkles, c: "#7c3aed" },
                { label: "Best sellers", href: "/products?sortBy=rating", Icon: Star, c: "#b45309" },
                { label: "All " + item.label, href: `/products?category=${item.slug}`, Icon: LayoutGrid, c: GREEN },
              ].map(row => (
                <button
                  key={row.href}
                  type="button"
                  onClick={() => { onNavigate(row.href); setOpen(false); }}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-white hover:shadow-sm"
                >
                  <row.Icon className="h-3.5 w-3.5 shrink-0" style={{ color: row.c }} strokeWidth={2.25} />
                  <span className="min-w-0 truncate">{row.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="relative z-[360]" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        type="button"
        className="group flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold tracking-tight text-slate-700 transition-colors duration-200 hover:bg-slate-100/90 md:px-3.5 md:py-2"
        style={{ color: open ? GREEN : "#334155" }}
        onClick={() => onNavigate(`/products?category=${item.slug}`)}
      >
        <span className="whitespace-nowrap">{item.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 md:h-4 md:w-4 ${open ? "rotate-180" : ""}`} style={{ color: open ? GREEN : "#94a3b8" }} />
      </button>
      {panel}
    </div>
  );
}

/* ─── Mobile Drawer ──────────────────────────────────────────── */
function MobileDrawer({ open, onClose, onNavigate, user, logout, city, cities, setCity, detectLocation, isDetecting }: {
  open: boolean; onClose: () => void; onNavigate: (p: string) => void;
  user: any; logout: () => void; city: string; cities: string[]; setCity: (c: string) => void;
  detectLocation: () => Promise<void>; isDetecting: boolean;
}) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[500] transition-all duration-300 ${open ? "bg-black/50 backdrop-blur-sm" : "pointer-events-none bg-transparent"}`}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className="fixed left-0 top-0 h-full z-[600] flex flex-col bg-white w-[300px] sm:w-[340px] shadow-2xl transition-transform duration-300 ease-out"
        style={{ transform: open ? "translateX(0)" : "translateX(-100%)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100"
          style={{ background: "linear-gradient(135deg, #0d2b00 0%, #1a4000 100%)" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm text-white"
              style={{ background: GREEN }}>K</div>
            <span className="font-bold text-white">KDF NUTS</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* User quick info */}
        {user ? (
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3"
            style={{ background: `${GREEN}08` }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shadow"
              style={{ background: GREEN }}>{user.name.charAt(0).toUpperCase()}</div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">{user.phone}</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 border-b border-gray-100 px-5 py-3">
            <button onClick={() => { onNavigate("/login"); onClose(); }}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#5FA800]/25 bg-white py-2 text-sm font-black text-[#3d7000] shadow-sm transition-all active:scale-[0.98]">
              <User className="h-3.5 w-3.5" /> Login
            </button>
            <button onClick={() => { onNavigate("/register"); onClose(); }}
              className="flex-1 rounded-xl py-2 text-sm font-black text-white shadow-md transition-all active:scale-[0.98]"
              style={{ background: `linear-gradient(135deg, ${GREEN}, #3d7000)` }}>Register</button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-2">
          {/* Quick links */}
          <div className="px-3 mb-1">
            {[
              { href: "/", label: "Home", icon: Home },
              { href: "/products", label: "All Products", icon: LayoutGrid },
              { href: "/products?featured=true", label: "Deals", icon: Flame, color: ORANGE },
              { href: "/products?sortBy=newest", label: "New Arrivals", icon: Sparkles },
              { href: "/products?sortBy=rating", label: "Best Sellers", icon: Star },
              { href: "/blog", label: "Blog", icon: Leaf },
              { href: "/track", label: "Track Order", icon: Truck, color: GREEN },
            ].map(({ href, label, icon: Icon, color }) => (
              <button key={href} type="button"
                onClick={() => { onNavigate(href); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all text-left">
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: color ?? "#6b7280" }} />
                <span style={{ color: color }}>{label}</span>
              </button>
            ))}
          </div>

          {/* Categories */}
          <div className="px-3 mt-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 py-2">Shop by Category</p>
            {MEGA_ITEMS.map(cat => (
              <div key={cat.slug}>
                <button type="button"
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-all"
                  onClick={() => setExpandedCat(expandedCat === cat.slug ? null : cat.slug)}>
                  <span>{cat.label}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedCat === cat.slug ? "rotate-180" : ""}`} />
                </button>
                {expandedCat === cat.slug && (
                  <div className="ml-4 mb-1 space-y-0.5">
                    {cat.sub.map(sub => (
                      <button key={sub.slug} type="button"
                        onClick={() => { onNavigate(`/products?category=${sub.slug}`); onClose(); }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-all text-left">
                        <span>{sub.emoji}</span><span>{sub.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* GPS Location Card */}
          <div className="px-3 mt-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 py-2">Your Delivery Location</p>
            <div className="mx-1 rounded-2xl border border-gray-100 overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${GREEN}08 0%, #fff 100%)` }}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${GREEN}18` }}>
                  <MapPin className="w-4 h-4" style={{ color: GREEN }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Delivering to</p>
                  <p className="font-bold text-gray-900 text-sm truncate">{city}</p>
                </div>
              </div>
              <div className="px-3 pb-3">
                <button
                  type="button"
                  disabled={isDetecting}
                  onClick={async () => { await detectLocation(); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #3d7000 100%)` }}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  {isDetecting ? "Detecting location…" : "Use My Location"}
                </button>
              </div>
              <div className="px-3 pb-3">
                <div className="relative">
                  <select
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    className="w-full h-9 border border-gray-200 rounded-xl px-3 pr-8 text-sm appearance-none focus:outline-none focus:border-green-500 bg-white text-gray-700"
                  >
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom actions */}
        {user && (
          <div className="px-5 py-4 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button onClick={() => { onNavigate("/account?tab=orders"); onClose(); }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 transition-all">
                <Package className="w-3.5 h-3.5" style={{ color: GREEN }} />My Orders
              </button>
              <button onClick={() => { onNavigate("/account?tab=wishlist"); onClose(); }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 transition-all">
                <Heart className="w-3.5 h-3.5 text-red-400" />Wishlist
              </button>
            </div>
            <button onClick={() => { logout(); onClose(); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-red-500 border border-red-100 hover:bg-red-50 transition-all">
              <LogOut className="w-4 h-4" />Logout
            </button>
          </div>
        )}

        {/* Support */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          <a href="tel:+92300000000"
            className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors">
            <Phone className="w-3.5 h-3.5" style={{ color: GREEN }} />24/7 Support
          </a>
        </div>
      </div>
    </>
  );
}

/* ─── Mobile Search Overlay ──────────────────────────────────── */
function MobileSearchOverlay({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate: (p: string) => void }) {
  const [q, setQ] = useState("");
  const [hints, setHints] = useState<any>({ products: [], categories: [] });
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<any>(null);

  const startVoice = () => {
    if (isListening) { recRef.current?.stop(); setIsListening(false); return; }
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    const startRec = (lang: string, fallback?: string) => {
      const rec = new SpeechRec();
      rec.continuous = false; rec.interimResults = false; rec.lang = lang;
      rec.onstart = () => setIsListening(true);
      rec.onend = () => setIsListening(false);
      rec.onerror = (err: any) => {
        setIsListening(false);
        if (fallback && (err.error === "no-speech" || err.error === "network")) {
          setTimeout(() => startRec(fallback), 400);
        }
      };
      rec.onresult = (e: any) => {
        const raw = e.results[0]?.[0]?.transcript ?? "";
        if (raw) {
          const translated = translateVoiceQuery(raw);
          setQ(translated);
          setTimeout(() => { onNavigate(`/products?search=${encodeURIComponent(translated)}`); onClose(); }, 100);
        }
      };
      recRef.current = rec;
      rec.start();
    };

    startRec("ur-PK", "en-US");
  };

  const handleCameraImg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCameraLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const r = await fetch("/api/chat/image-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: reader.result }) });
        const d = await r.json();
        if (d.detected && d.detected !== "unknown") { onNavigate(`/products?search=${encodeURIComponent(d.detected)}`); onClose(); }
      } catch {}
      finally { setIsCameraLoading(false); if (cameraRef.current) cameraRef.current.value = ""; }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => { if (open) { setQ(""); setTimeout(() => inputRef.current?.focus(), 100); } }, [open]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setHints({ products: [], categories: [] }); return; }
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}&limit=6`);
        if (r.ok) setHints(await r.json());
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = (path: string) => { onNavigate(path); setQ(""); onClose(); };

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className={`fixed inset-0 z-[700] flex flex-col bg-white transition-all duration-300 ${open ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"}`}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shadow-sm">
        <div className="flex-1 flex items-center gap-2 px-4 py-2.5 bg-gray-100 rounded-2xl">
          <Search className={`w-4 h-4 flex-shrink-0 ${loading ? "text-green-500 animate-pulse" : "text-gray-400"}`} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder={isListening ? "🎤 Listening…" : isCameraLoading ? "🔍 Analyzing image…" : "Search nuts, dry fruits…"}
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
            onKeyDown={e => { if (e.key === "Enter" && q.trim()) go(`/products?search=${encodeURIComponent(q.trim())}`); }}
          />
          {q
            ? <button onClick={() => setQ("")} className="p-1"><X className="w-4 h-4 text-gray-400" /></button>
            : <div className="flex items-center gap-2 flex-shrink-0">
                {/* Camera */}
                <button type="button" onClick={() => cameraRef.current?.click()} disabled={isCameraLoading}
                  title="Search by image"
                  className={`relative w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-90
                    ${isCameraLoading ? 'bg-green-500 shadow-sm' : 'bg-gray-200 hover:bg-gray-300'}`}>
                  {isCameraLoading
                    ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    : <Camera className="w-3.5 h-3.5 text-gray-600" />}
                  {isCameraLoading && (
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-green-600 whitespace-nowrap">
                      AI Scan
                    </span>
                  )}
                </button>
                {/* Mic */}
                <button type="button" onClick={startVoice}
                  title={isListening ? "Tap to stop" : "Voice search (Urdu/English)"}
                  className={`relative w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-90
                    ${isListening ? 'bg-red-500 shadow-sm' : 'bg-gray-200 hover:bg-gray-300'}`}>
                  <Mic className={`w-3.5 h-3.5 ${isListening ? 'text-white' : 'text-gray-600'}`} />
                  {isListening && (
                    <>
                      <span className="absolute inset-0 rounded-xl bg-red-400 animate-ping opacity-30 pointer-events-none" />
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-red-500 whitespace-nowrap">
                        Listening…
                      </span>
                    </>
                  )}
                </button>
              </div>
          }
        </div>
        <button onClick={() => { setQ(""); onClose(); }}
          className="text-sm font-semibold" style={{ color: GREEN }}>Cancel</button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" className="hidden" onChange={handleCameraImg} />

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {q.length === 0 ? (
          <div className="px-4 py-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />Trending Searches
            </p>
            <div className="flex flex-wrap gap-2">
              {["Almonds", "Cashews", "Pistachios", "Walnuts", "Dates", "Honey", "Seeds"].map(s => (
                <button key={s} type="button" onClick={() => go(`/products?search=${encodeURIComponent(s)}`)}
                  className="px-4 py-2 rounded-full text-sm font-medium border transition-all"
                  style={{ borderColor: `${GREEN}30`, color: GREEN, background: `${GREEN}08` }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {hints.products.map((p: any) => (
              <button key={p.id} type="button"
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 text-left"
                onClick={() => go(`/products/${p.slug || p.id}`)}>
                {p.image
                  ? (
                    <img
                      src={getProductImageSrc(p.image, { maxWidth: 128 })}
                      alt={p.name}
                      width={48}
                      height={48}
                      loading="lazy"
                      decoding="async"
                      className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-muted/30"
                    />
                  )
                  : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: GREEN }}>{p.name[0]}</div>
                }
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs font-bold mt-0.5" style={{ color: GREEN }}>Rs. {p.price?.toLocaleString()}</p>
                </div>
                {p.stock === 0 && <span className="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded-full flex-shrink-0">Out of stock</span>}
              </button>
            ))}
            {q && (
              <button type="button" onClick={() => go(`/products?search=${encodeURIComponent(q.trim())}`)}
                className="w-full flex items-center justify-center gap-2 py-4 text-sm font-semibold border-t border-gray-100"
                style={{ color: GREEN }}>
                <Search className="w-4 h-4" />See all results for "{q}" <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Main Header ────────────────────────────────────────────── */
export function Header() {
  const [location, navigate] = useLocation();
  const [searchQuery, setSearchQuery]     = useState("");
  /** Single scroll metric — derive `scrolled` / `shrunk` in render to avoid double setState per frame. */
  const [scrollY, setScrollY]             = useState(0);
  const scrollRafId                       = useRef<number | null>(null);
  const scrolled                          = scrollY > 8;
  const shrunk                            = scrollY > 80;
  const [cartBounce, setCartBounce]       = useState(false);
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [searchOverlay, setSearchOverlay] = useState(false);
  const [searchHints, setSearchHints]     = useState<{ products: any[]; categories: any[] }>({ products: [], categories: [] });
  const [showHints, setShowHints]         = useState(false);
  const [hintLoading, setHintLoading]     = useState(false);

  const { totalItems, setMiniCartOpen } = useCart();
  const { user, logout }               = useAuth();
  const { city, setCity, cities, detectLocation, isDetecting } = useUserLocation();
  const { data: siteSettings }         = useSiteSettings();
  const prevTotalRef    = useRef(totalItems);
  const searchRef       = useRef<HTMLDivElement>(null);
  const placeholder     = useTypingPlaceholder();
  const headerCameraRef = useRef<HTMLInputElement>(null);
  const headerRecRef    = useRef<any>(null);
  const [headerListening, setHeaderListening]   = useState(false);
  const [headerCamLoad, setHeaderCamLoad]       = useState(false);
  const desktopNavBandRef = useRef<HTMLDivElement>(null);
  const [megaMenuTopPx, setMegaMenuTopPx]       = useState(118);

  useLayoutEffect(() => {
    const update = () => {
      const el = desktopNavBandRef.current;
      if (!el || el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.height < 2) return;
      setMegaMenuTopPx(Math.round(r.bottom) + 4);
    };
    update();
    const el = desktopNavBandRef.current;
    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [shrunk, scrolled]);

  const startHeaderVoice = () => {
    if (headerListening) { headerRecRef.current?.stop(); setHeaderListening(false); return; }
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    const startRec = (lang: string, fallback?: string) => {
      const rec = new SpeechRec();
      rec.continuous = false; rec.interimResults = false; rec.lang = lang;
      rec.onstart = () => setHeaderListening(true);
      rec.onend   = () => setHeaderListening(false);
      rec.onerror = (err: any) => {
        setHeaderListening(false);
        if (fallback && (err.error === "no-speech" || err.error === "network")) {
          setTimeout(() => startRec(fallback), 400);
        }
      };
      rec.onresult = (e: any) => {
        const raw = e.results[0]?.[0]?.transcript ?? "";
        if (raw) {
          const translated = translateVoiceQuery(raw);
          setSearchQuery(translated);
          setShowHints(true);
        }
      };
      headerRecRef.current = rec;
      rec.start();
    };

    startRec("ur-PK", "en-US");
  };

  const handleHeaderCamImg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeaderCamLoad(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const r = await fetch("/api/chat/image-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: reader.result }) });
        const d = await r.json();
        if (d.detected && d.detected !== "unknown") { setSearchQuery(d.detected); setShowHints(true); }
      } catch {}
      finally { setHeaderCamLoad(false); if (headerCameraRef.current) headerCameraRef.current.value = ""; }
    };
    reader.readAsDataURL(file);
  };

  const { data: announcements = [] } = useQuery<any[]>({
    queryKey: ["announcements"],
    queryFn: () => fetch("/api/announcements").then(r => r.ok ? r.json() : []),
    staleTime: 120_000,
  });

  useEffect(() => {
    const onScroll = () => {
      if (scrollRafId.current != null) return;
      scrollRafId.current = window.requestAnimationFrame(() => {
        scrollRafId.current = null;
        setScrollY(window.scrollY);
      });
    };
    setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollRafId.current != null) {
        window.cancelAnimationFrame(scrollRafId.current);
        scrollRafId.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (totalItems > prevTotalRef.current) {
      setCartBounce(true);
      setTimeout(() => setCartBounce(false), 600);
    }
    prevTotalRef.current = totalItems;
  }, [totalItems]);

  useEffect(() => {
    const ac = new AbortController();
    const q = searchQuery.trim();
    if (!q) {
      setSearchHints({ products: [], categories: [] });
      setHintLoading(false);
      return () => ac.abort();
    }
    setHintLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`, { signal: ac.signal });
        if (r.ok) {
          const data = await r.json();
          setSearchHints(data);
          setShowHints(true);
        }
      } catch (e: unknown) {
        if ((e as Error)?.name === "AbortError") return;
      } finally {
        if (!ac.signal.aborted) setHintLoading(false);
      }
    }, 160);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [searchQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowHints(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    setShowHints(false);
    if (searchQuery.trim()) { navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`); setSearchQuery(""); }
  }, [searchQuery, navigate]);

  const handleLogout = () => { logout(); navigate("/"); };

  const hideMobileBottomNav =
    location.startsWith("/checkout") ||
    /^\/order\//.test(location) ||
    location.startsWith("/login") ||
    location.startsWith("/register");

  const path = location.split("?")[0] ?? location;
  const navActive = {
    home: path === "/" || path === "",
    categories: path.startsWith("/categor"),
    deals: path.startsWith("/products"),
    account: path.startsWith("/account") || path.startsWith("/login"),
  };
  const allProductsActive = path === "/products";

  return (
    <>
      <div className={`sticky z-40 overflow-visible transition-[padding] duration-300 ease-out ${scrolled ? "top-2 sm:top-3" : "top-0"}`}>
        {/* ── Announcement Bar ── */}
        <AnnouncementBar items={announcements} />

        {/* ── Main Header (floating glass bar when scrolled) — overflow-visible so mega menus are not clipped */}
        <header
          className={`transition-all duration-300 ease-out overflow-visible ${scrolled ? "mx-1.5 rounded-2xl ring-1 ring-slate-900/[0.06] sm:mx-3" : ""}`}
          style={{
            background: scrolled ? "rgba(255,255,255,0.88)" : "#fff",
            backdropFilter: scrolled ? "blur(20px) saturate(1.35)" : "none",
            WebkitBackdropFilter: scrolled ? "blur(20px) saturate(1.35)" : "none",
            boxShadow: scrolled
              ? "0 12px 40px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.75)"
              : "0 1px 0 rgba(0,0,0,0.06)",
          }}
        >
          <div className="kdf-page-shell overflow-visible">
            {/* Top row */}
            <div className={`flex items-center gap-2.5 transition-all duration-300 sm:gap-3 lg:gap-4 xl:gap-5 ${shrunk ? "h-[54px] lg:h-[58px]" : "h-[60px] lg:h-[70px]"}`}>

              {/* Mobile: Hamburger */}
              <button
                className="flex-shrink-0 rounded-2xl p-2 -ml-1 transition-all hover:bg-slate-100 active:scale-95 lg:hidden"
                onClick={() => setDrawerOpen(true)}
                aria-label="Menu"
              >
                <Menu className="w-5 h-5 text-gray-700" />
              </button>

              {/* Logo */}
              <Link href="/" className="flex flex-shrink-0 items-center gap-2" data-testid="link-logo">
                {logoSrc(siteSettings?.logoPath) ? (
                  <>
                    <img
                      src={logoSrc(siteSettings?.logoPath)!}
                      alt={siteSettings?.siteName ?? "KDF NUTS"}
                      width={144}
                      height={36}
                      decoding="async"
                      fetchPriority="high"
                      className={`w-auto max-w-[7.8rem] flex-shrink-0 object-contain transition-all duration-300 sm:max-w-[10rem] lg:max-w-[11rem] ${shrunk ? "h-7" : "h-8 lg:h-9"}`}
                    />
                    <span className={`hidden font-black tracking-tight text-slate-950 transition-all duration-300 sm:block ${shrunk ? "text-base" : "text-lg"}`}>
                      {siteSettings?.siteName ?? "KDF NUTS"}
                    </span>
                  </>
                ) : (
                  <>
                    <div className={`flex flex-shrink-0 items-center justify-center rounded-2xl font-black text-white shadow-sm transition-all duration-300 ${shrunk ? "h-7 w-7 text-xs" : "h-8 w-8 text-xs lg:h-9 lg:w-9 lg:text-sm"}`}
                      style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #3d7000 100%)` }}>
                      KDF
                    </div>
                    <span className={`font-black tracking-tight text-slate-950 transition-all duration-300 ${shrunk ? "text-base" : "text-lg"}`}>
                      KDF <span style={{ color: GREEN }}>NUTS</span>
                    </span>
                  </>
                )}
              </Link>

              {/* Search — desktop */}
              <div ref={searchRef} className="relative mx-auto hidden w-full max-w-md flex-1 sm:flex lg:max-w-[34rem] xl:max-w-[38rem]">
                <form onSubmit={handleSearch} className="w-full">
                  <div className="group relative">
                    <Search
                      className={`pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 transition-colors md:left-4 md:h-[1.05rem] md:w-[1.05rem] ${hintLoading ? "animate-pulse" : "text-slate-400 group-focus-within:text-[#5FA800]"}`}
                      style={hintLoading ? { color: GREEN } : {}}
                    />
                    <input
                      type="search"
                      placeholder={placeholder}
                      value={searchQuery}
                      onChange={e => {
                        setSearchQuery(e.target.value);
                        setShowHints(true);
                      }}
                      onFocus={() => searchQuery.length > 0 && setShowHints(true)}
                      className={[
                        "h-10 w-full rounded-[1.25rem] border border-slate-200/90 bg-white pl-10 pr-[5.15rem] text-[13.5px] font-medium tracking-tight text-slate-800 placeholder:text-slate-400 placeholder:font-normal outline-none transition-[box-shadow,border-color,background-color,transform] duration-200 md:h-10 md:pl-11 md:pr-[5.5rem] md:text-[14px] lg:h-11",
                        "group-focus-within:border-[#5FA800]/45 group-focus-within:bg-white group-focus-within:shadow-[0_0_0_3px_rgba(95,168,0,0.09),0_12px_30px_rgba(15,23,42,0.07)]",
                        scrolled ? "bg-white/90 backdrop-blur-sm" : "",
                      ].join(" ")}
                      style={{
                        background:
                          showHints || searchQuery
                            ? "#ffffff"
                            : scrolled
                              ? "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.98) 100%)"
                              : "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                        borderColor:
                          showHints || searchQuery ? GREEN : undefined,
                        boxShadow:
                          showHints || searchQuery
                              ? "0 0 0 1px rgba(95,168,0,0.12), 0 10px 28px rgba(15,23,42,0.07)"
                            : scrolled
                              ? "0 6px 18px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.9)"
                              : "0 6px 18px rgba(15,23,42,0.045), inset 0 1px 0 rgba(255,255,255,0.88)",
                      }}
                      data-testid="input-search"
                    />
                    <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 md:right-1.5">
                      <button
                        type="button"
                        onClick={() => headerCameraRef.current?.click()}
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 md:h-8 md:w-8 lg:h-9 lg:w-9 ${headerCamLoad ? "text-green-600" : ""}`}
                        style={{ background: `${GREEN}14`, color: headerCamLoad ? "#16a34a" : GREEN }}
                        aria-label="Search by image"
                      >
                        {headerCamLoad ? <Loader2 className="h-3.5 w-3.5 animate-spin md:h-4 md:w-4" /> : <Camera className="h-3.5 w-3.5 md:h-4 md:w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={startHeaderVoice}
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 md:h-8 md:w-8 lg:h-9 lg:w-9 ${headerListening ? "animate-pulse" : ""}`}
                        style={{ background: headerListening ? "#ef4444" : `${GREEN}14`, color: headerListening ? "#fff" : GREEN }}
                        aria-label="Voice search"
                      >
                        <Mic className="h-3.5 w-3.5 md:h-4 md:w-4" />
                      </button>
                    </div>
                    <input ref={headerCameraRef} type="file" accept="image/*" className="hidden" onChange={handleHeaderCamImg} />
                  </div>
                </form>

                {/* Search dropdown */}
                {showHints && searchQuery.length > 0 && (searchHints.products.length > 0 || searchHints.categories.length > 0) && (
                  <div
                    className="absolute left-0 right-0 top-[calc(100%+8px)] z-[300] overflow-hidden rounded-xl border border-slate-200/80 bg-white/98 shadow-[0_16px_40px_-8px_rgba(15,23,42,0.12)] backdrop-blur-md"
                  >
                    {searchHints.products.length > 0 && (
                      <>
                        <div className="px-5 pt-4 pb-2">
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Products</p>
                        </div>
                        {searchHints.products.map(p => (
                          <button key={p.id} type="button"
                            className="group flex w-full items-center gap-4 border-b border-slate-100/90 px-5 py-3 text-left transition-colors last:border-0 hover:bg-gradient-to-r hover:from-[#5FA800]/[0.06] hover:to-transparent"
                            onClick={() => { setShowHints(false); setSearchQuery(""); navigate(`/products/${p.slug || p.id}`); }}>
                            {p.image
                              ? (
                                <img
                                  src={getProductImageSrc(p.image, { maxWidth: 128 })}
                                  alt={p.name}
                                  width={56}
                                  height={56}
                                  loading="lazy"
                                  decoding="async"
                                  className="h-12 w-12 shrink-0 rounded-2xl object-cover shadow-sm ring-1 ring-black/5 md:h-14 md:w-14"
                                />
                              )
                              : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white shadow-md md:h-14 md:w-14" style={{ background: GREEN }}>{p.name[0]}</div>
                            }
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-semibold text-slate-900 group-hover:text-slate-950">{p.name}</p>
                              <p className="mt-0.5 text-sm font-bold" style={{ color: GREEN }}>Rs. {p.price?.toLocaleString()}</p>
                            </div>
                            {p.stock === 0 ? (
                              <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-500">Out of stock</span>
                            ) : (
                              <ArrowRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                            )}
                          </button>
                        ))}
                      </>
                    )}
                    {searchHints.categories.length > 0 && (
                      <div className="border-t border-slate-100/90 bg-slate-50/80 px-5 py-4 backdrop-blur-sm">
                        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">Categories</p>
                        <div className="flex flex-wrap gap-2">
                          {searchHints.categories.map(c => (
                            <button key={c.id} type="button"
                              onClick={() => { setShowHints(false); setSearchQuery(""); navigate(`/products?category=${c.slug}`); }}
                              className="rounded-full border px-4 py-1.5 text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                              style={{ background: `${GREEN}10`, borderColor: `${GREEN}28`, color: GREEN }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = GREEN; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${GREEN}10`; (e.currentTarget as HTMLElement).style.color = GREEN; }}>
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <button type="button"
                      onClick={() => { setShowHints(false); handleSearch(); }}
                      className="flex w-full items-center justify-center gap-2 border-t border-slate-100/90 bg-white py-3.5 text-sm font-bold transition-colors hover:bg-slate-50"
                      style={{ color: GREEN }}>
                      <Search className="h-4 w-4" />See all results for &ldquo;{searchQuery}&rdquo;
                    </button>
                  </div>
                )}
              </div>

              {/* Right actions */}
              <div className="ml-auto flex flex-shrink-0 items-center gap-1 sm:ml-0 sm:gap-1.5 lg:gap-2">

                {/* Mobile: search icon */}
                <button className="rounded-2xl p-2.5 transition-all hover:bg-slate-100 active:scale-95 sm:hidden"
                  onClick={() => setSearchOverlay(true)} aria-label="Search">
                  <Search className="w-5 h-5 text-gray-700" />
                </button>

                {/* Location — desktop */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="hidden h-10 items-center gap-2 rounded-[1.1rem] border border-slate-200/90 bg-white/90 px-3 text-[13px] font-bold tracking-tight text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.045)] transition-all hover:-translate-y-0.5 hover:border-[#5FA800]/35 hover:bg-white hover:shadow-[0_10px_24px_rgba(15,23,42,0.075)] active:translate-y-0 md:flex lg:h-10 lg:px-3.5"
                      data-testid="button-location"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-[#5FA800]" strokeWidth={2.25} />
                      <span className="max-w-[100px] truncate lg:max-w-[140px]">{city}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-y-auto rounded-2xl border-slate-200/90 p-1 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
                    {cities.map(c => (
                      <DropdownMenuItem key={c} onClick={() => setCity(c)}
                        className={`rounded-xl text-sm ${c === city ? "font-bold" : ""}`} style={c === city ? { color: GREEN } : {}}>
                        {c === city && <span className="mr-1.5">✓</span>}{c}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Wishlist — desktop */}
                <Link href="/account?tab=wishlist" className="hidden sm:block">
                  <button className="group relative flex h-10 w-10 items-center justify-center rounded-[1.1rem] border border-transparent bg-white/60 transition-all hover:-translate-y-0.5 hover:border-red-100 hover:bg-red-50/70 hover:shadow-[0_10px_24px_rgba(239,68,68,0.10)] active:translate-y-0 md:h-10 md:w-10" aria-label="Wishlist">
                    <Heart className="h-[1.1rem] w-[1.1rem] text-slate-500 transition-all group-hover:scale-110 group-hover:text-red-500 md:h-[1.18rem] md:w-[1.18rem]" strokeWidth={2.1} />
                  </button>
                </Link>

                {/* Cart */}
                <button
                  className="group relative flex h-10 w-10 items-center justify-center rounded-[1.1rem] border border-transparent bg-white/70 transition-all hover:-translate-y-0.5 hover:border-[#5FA800]/20 hover:bg-[#5FA800]/[0.07] hover:shadow-[0_10px_24px_rgba(95,168,0,0.12)] active:translate-y-0 md:h-10 md:w-10"
                  onClick={() => setMiniCartOpen(true)}
                  aria-label="Open cart"
                  data-testid="link-cart"
                >
                  <ShoppingBag
                    className={`h-[1.15rem] w-[1.15rem] text-slate-800 transition-transform duration-200 md:h-[1.18rem] md:w-[1.18rem] ${cartBounce ? "scale-110" : "group-hover:scale-105"}`}
                    strokeWidth={2.15}
                  />
                  {totalItems > 0 && (
                    <span
                      className={`absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border-2 border-white px-1 text-[10px] font-black text-white shadow-md transition-transform duration-200 md:h-5 md:min-w-[1.25rem] ${cartBounce ? "scale-110" : ""}`}
                      style={{ background: ORANGE }}
                      data-testid="badge-cart-count"
                    >
                      {totalItems > 99 ? "99+" : totalItems}
                    </span>
                  )}
                </button>

                {/* User — desktop */}
                {user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="hidden h-10 items-center gap-1.5 rounded-[1.1rem] border border-slate-200/80 bg-white px-1.5 pr-2.5 shadow-[0_6px_16px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] active:translate-y-0 md:flex" data-testid="button-user-menu">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold text-white shadow-inner ring-2 ring-white/40"
                          style={{ background: `linear-gradient(145deg, ${GREEN} 0%, #3d7000 100%)` }}>{user.name.charAt(0).toUpperCase()}</div>
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <div className="px-3 py-2.5">
                        <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{user.phone}</p>
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate("/account")} data-testid="menu-account"><User className="w-4 h-4 mr-2" />My Account</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/account?tab=orders")} data-testid="menu-orders"><Package className="w-4 h-4 mr-2" />My Orders</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/account?tab=wishlist")} data-testid="menu-wishlist"><Heart className="w-4 h-4 mr-2" />Wishlist</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout} className="text-red-500 focus:text-red-500" data-testid="button-logout"><LogOut className="w-4 h-4 mr-2" />Logout</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <>
                    <Link href="/login" className="hidden sm:block" data-testid="link-login">
                      <button
                        className="group inline-flex h-10 items-center justify-center gap-1.5 rounded-[1.1rem] border border-[#5FA800]/25 bg-white px-3.5 text-[13px] font-black tracking-tight text-[#356900] shadow-[0_8px_22px_rgba(95,168,0,0.12)] transition-all hover:-translate-y-0.5 hover:border-[#5FA800]/45 hover:bg-[#5FA800] hover:text-white hover:shadow-[0_14px_30px_rgba(95,168,0,0.22)] active:translate-y-0 lg:px-4"
                      >
                        <User className="h-3.5 w-3.5 transition-transform group-hover:scale-110" strokeWidth={2.3} />
                        <span>Login</span>
                      </button>
                    </Link>
                    <Link href="/login" className="sm:hidden">
                      <button className="rounded-2xl p-2.5 transition-all hover:bg-slate-100 active:scale-95">
                        <User className="w-5 h-5 text-gray-700" />
                      </button>
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* ── Desktop Nav + Trust strip ── */}
            <div
              ref={desktopNavBandRef}
              className={`hidden items-center justify-between gap-2 overflow-visible border-t border-slate-200/70 bg-gradient-to-r from-white via-slate-50/35 to-white transition-all duration-300 sm:flex ${shrunk ? "py-1.5" : "py-2"} -mx-3.5 px-3.5 sm:-mx-5 sm:px-5 lg:-mx-7 lg:px-7 xl:-mx-8 xl:px-8`}
            >
              <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 overflow-visible md:gap-1.5">
                <Link href="/products">
                  <button
                    type="button"
                    className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold tracking-tight transition-all md:px-3.5 md:py-2 md:text-[15px] ${
                      allProductsActive
                        ? "bg-slate-900 text-white shadow-md shadow-slate-900/15 ring-1 ring-slate-900/10"
                        : "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm"
                    }`}
                  >
                    All Products
                  </button>
                </Link>

                {/* Mega menus */}
                {MEGA_ITEMS.map((item) => (
                  <MegaMenuDropdown key={item.slug} item={item} onNavigate={navigate} panelTopPx={megaMenuTopPx} />
                ))}

                <Link href="/products?featured=true">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold transition-all hover:brightness-105 md:gap-1.5 md:px-3.5 md:py-2 md:text-[15px]"
                    style={{ color: ORANGE, background: `${ORANGE}14`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.5)` }}
                  >
                    <Flame className="h-3.5 w-3.5 md:h-4 md:w-4" strokeWidth={2.25} />
                    Deals
                  </button>
                </Link>
                <Link href="/products?sortBy=newest">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-all hover:bg-violet-50 hover:text-violet-800 md:gap-1.5 md:px-3.5 md:py-2 md:text-[15px]"
                  >
                    <Sparkles className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    New Arrivals
                  </button>
                </Link>
                <Link href="/products?sortBy=rating">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-all hover:bg-amber-50 hover:text-amber-900 md:gap-1.5 md:px-3.5 md:py-2 md:text-[15px]"
                  >
                    <Star className="h-3.5 w-3.5 md:h-4 md:w-4" strokeWidth={2.25} />
                    Best Sellers
                  </button>
                </Link>
                <Link href="/blog">
                  <button
                    type="button"
                    className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-all hover:bg-white hover:text-slate-900 hover:shadow-sm md:px-3.5 md:py-2 md:text-[15px]"
                  >
                    Blog
                  </button>
                </Link>
                <Link href="/track">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold transition-all hover:bg-[#5FA800]/10 md:gap-1.5 md:px-3.5 md:py-2 md:text-[15px]"
                    style={{ color: GREEN }}
                    data-testid="link-track-order"
                  >
                    <Truck className="h-3.5 w-3.5 md:h-4 md:w-4" strokeWidth={2.25} />
                    Track Order
                  </button>
                </Link>
              </nav>

              {/* Trust icons — desktop enterprise strip */}
              <div className="ml-3 hidden shrink-0 items-center gap-2 lg:flex">
                {([
                  { Icon: Truck, t: "Free delivery", s: "Rs.1500+", c: GREEN },
                  { Icon: Leaf, t: "100% Fresh", s: "Quality", c: GREEN },
                  { Icon: Shield, t: "Easy returns", s: "7 days", c: GREEN },
                  { Icon: PhoneCall, t: "24/7", s: "Support", c: GREEN, href: "tel:+92300000000" },
                ] as const).map((row, i) => {
                  const inner = (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-2.5 py-1.5 shadow-sm backdrop-blur-sm transition-all hover:border-[#5FA800]/28 hover:shadow-md">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#5FA800]/12 to-slate-50 ring-1 ring-[#5FA800]/12">
                        <row.Icon className="h-3.5 w-3.5" style={{ color: row.c }} strokeWidth={2.25} />
                      </span>
                      <span className="max-w-[6.5rem] leading-tight">
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">{row.t}</span>
                        <span className="block text-[11px] font-semibold text-slate-800">{row.s}</span>
                      </span>
                    </div>
                  );
                  if ("href" in row && row.href)
                    return (
                      <a key={i} href={row.href} className="text-inherit no-underline">
                        {inner}
                      </a>
                    );
                  return <div key={i}>{inner}</div>;
                })}
              </div>
            </div>

            {/* ── Mobile search row (premium glass strip) ── */}
            <div className="pb-2.5 sm:hidden">
              <div
                className="flex w-full items-center gap-2 rounded-2xl border border-white/70 px-3.5 py-2.5 text-sm text-gray-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl"
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(248,250,252,0.88) 50%, rgba(241,245,249,0.9) 100%)",
                  boxShadow: "0 4px 24px rgba(15,23,42,0.06), 0 0 0 1px rgba(95,168,0,0.08)",
                }}
              >
                <button type="button" className="flex min-h-[40px] flex-1 items-center gap-2.5 text-left" onClick={() => setSearchOverlay(true)}>
                  <Search className="h-5 w-5 shrink-0 text-[#5FA800]" strokeWidth={2.25} />
                  <span className="flex-1 truncate text-[13px] font-semibold text-gray-500">
                    {headerListening ? "Listening…" : headerCamLoad ? "Analyzing…" : "Search mixed nuts, dry fruits…"}
                  </span>
                </button>
                <button type="button" onClick={() => headerCameraRef.current?.click()}
                  className={`flex-shrink-0 p-0.5 transition-all active:scale-90 ${headerCamLoad ? "text-green-500" : "text-gray-400"}`}>
                  {headerCamLoad ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                </button>
                <button type="button" onClick={startHeaderVoice}
                  className={`flex-shrink-0 p-0.5 transition-all active:scale-90 ${headerListening ? "text-red-500 animate-pulse" : "text-gray-400"}`}>
                  <Mic className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </header>
      </div>

      {/* ── Mobile bottom navigation (thumb-first; search stays in header) ── */}
      {!hideMobileBottomNav && (
        <nav
          className="kdf-suppress-for-fullscreen-sheet fixed bottom-0 left-0 right-0 z-[400] sm:hidden"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.98) 40%, rgba(250,252,249,1) 100%)",
            backdropFilter: "blur(20px) saturate(1.2)",
            WebkitBackdropFilter: "blur(20px) saturate(1.2)",
            borderTop: "1px solid rgba(13,43,0,0.08)",
            boxShadow: "0 -8px 32px rgba(13,43,0,0.06), 0 -1px 0 rgba(255,255,255,0.8) inset",
          }}
          aria-label="Primary"
        >
          <div className="flex items-stretch justify-between gap-0.5 px-1 pt-1 pb-[max(12px,env(safe-area-inset-bottom))] max-w-lg mx-auto">
            {(
              [
                { key: "home", label: "Home", href: "/", Icon: Home, active: navActive.home },
                { key: "categories", label: "Categories", href: "/categories", Icon: LayoutGrid, active: navActive.categories },
                { key: "deals", label: "Deals", href: "/products", Icon: Flame, active: navActive.deals },
                { key: "cart", label: "Cart", href: null as string | null, Icon: ShoppingBag, active: false },
                { key: "account", label: "You", href: user ? "/account" : "/login", Icon: User, active: navActive.account },
              ] as const
            ).map(({ key, label, href, Icon, active }) => {
              const inner = (
                <>
                  <div
                    className={`relative flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-200 ${
                      active ? "shadow-md ring-1 ring-[#5FA800]/25" : "bg-transparent"
                    }`}
                    style={active ? { backgroundColor: "rgba(95,168,0,0.12)" } : undefined}
                  >
                    <Icon className="w-5 h-5" style={{ color: active ? GREEN : "#64748b" }} strokeWidth={active ? 2.25 : 2} />
                    {key === "cart" && totalItems > 0 && (
                      <span
                        className="absolute -top-0.5 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-white text-[10px] font-bold px-0.5 shadow-sm"
                        style={{ background: ORANGE, lineHeight: 1 }}
                      >
                        {totalItems > 9 ? "9+" : totalItems}
                      </span>
                    )}
                  </div>
                  <span
                    className={`mt-0.5 max-w-[4.5rem] text-center text-[9px] font-semibold leading-tight tracking-tight sm:max-w-none sm:text-[10px] ${active ? "text-gray-900" : "text-gray-500"}`}
                  >
                    {label}
                  </span>
                </>
              );
              if (key === "cart") {
                return (
                  <button
                    key={key}
                    type="button"
                    data-testid="link-cart"
                    className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl py-1.5 transition-transform active:scale-[0.97]"
                    onClick={() => setMiniCartOpen(true)}
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <Link key={key} href={href!} className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl py-1.5 transition-transform active:scale-[0.97]">
                  {inner}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* ── Overlays ── */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={navigate}
        user={user}
        logout={handleLogout}
        city={city}
        cities={cities}
        setCity={setCity}
        detectLocation={detectLocation}
        isDetecting={isDetecting}
      />
      <MobileSearchOverlay
        open={searchOverlay}
        onClose={() => setSearchOverlay(false)}
        onNavigate={navigate}
      />

      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee linear infinite;
        }
        .safe-area-pb {
          padding-bottom: max(8px, env(safe-area-inset-bottom));
        }
      `}</style>
    </>
  );
}
