import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  Search, MapPin, ChevronDown, User, LogOut, Package, Heart,
  ShoppingBag, Truck, Leaf, RefreshCcw, PhoneCall, Flame, Sparkles,
  Star, X, Menu, Home, LayoutGrid, Mic, TrendingUp, ArrowRight,
  ChevronRight, Shield, Zap, Gift, Phone, Clock,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useUserLocation } from "@/context/LocationContext";
import { useSiteSettings, logoSrc } from "@/hooks/useSiteSettings";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const GREEN  = "#5FA800";
const ORANGE = "#F58300";

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

/* ─── Mega Menu Dropdown ─────────────────────────────────────── */
function MegaMenuDropdown({ item, onNavigate }: { item: typeof MEGA_ITEMS[0]; onNavigate: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const enter = () => { clearTimeout(timerRef.current); setOpen(true); };
  const leave = () => { timerRef.current = setTimeout(() => setOpen(false), 120); };

  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        className="flex items-center gap-0.5 text-[13px] font-medium px-3 py-2 rounded-full transition-all duration-150 whitespace-nowrap group"
        style={{ color: open ? GREEN : "#374151" }}
        onClick={() => onNavigate(`/products?category=${item.slug}`)}
      >
        {item.label}
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} style={{ color: open ? GREEN : "#9ca3af" }} />
      </button>

      {open && (
        <div className="absolute top-full left-0 pt-2 z-[300]" style={{ minWidth: "340px" }}
          onMouseEnter={enter} onMouseLeave={leave}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
            style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)" }}>
            <div className="grid grid-cols-2 gap-0">
              {/* Sub-categories */}
              <div className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 px-1">{item.label}</p>
                <div className="space-y-0.5">
                  {item.sub.map(sub => (
                    <button key={sub.slug} type="button"
                      onClick={() => { onNavigate(`/products?category=${sub.slug}`); setOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-all group text-left">
                      <span className="text-base leading-none">{sub.emoji}</span>
                      <span className="group-hover:text-gray-900 font-medium">{sub.label}</span>
                      <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GREEN }} />
                    </button>
                  ))}
                  <button type="button"
                    onClick={() => { onNavigate(`/products?category=${item.slug}`); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all mt-1"
                    style={{ color: GREEN }}>
                    View all {item.label} <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Featured */}
              <div className="p-4 border-l border-gray-50 flex flex-col justify-between"
                style={{ background: "linear-gradient(135deg, #f8fdf4 0%, #fff 100%)" }}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Featured</p>
                  <div className="rounded-xl p-3 mb-3"
                    style={{ background: `${item.featured.color}12`, border: `1px solid ${item.featured.color}20` }}>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white mb-2 inline-block"
                      style={{ background: item.featured.color }}>{item.featured.badge}</span>
                    <p className="font-bold text-sm text-gray-900 mt-1">{item.featured.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">100% Natural & Pure</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Shield className="w-3.5 h-3.5" style={{ color: GREEN }} />
                    <span>Quality Guaranteed</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Truck className="w-3.5 h-3.5" style={{ color: GREEN }} />
                    <span>Free delivery Rs.1500+</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Mobile Drawer ──────────────────────────────────────────── */
function MobileDrawer({ open, onClose, onNavigate, user, logout, city, cities, setCity }: {
  open: boolean; onClose: () => void; onNavigate: (p: string) => void;
  user: any; logout: () => void; city: string; cities: string[]; setCity: (c: string) => void;
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
          <div className="px-5 py-3 border-b border-gray-100 flex gap-2">
            <button onClick={() => { onNavigate("/login"); onClose(); }}
              className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: GREEN }}>Login</button>
            <button onClick={() => { onNavigate("/register"); onClose(); }}
              className="flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all"
              style={{ borderColor: GREEN, color: GREEN }}>Register</button>
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
              { href: "/products?sort=newest", label: "New Arrivals", icon: Sparkles },
              { href: "/products?sort=best_selling", label: "Best Sellers", icon: Star },
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

          {/* City picker */}
          <div className="px-3 mt-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 py-2">Delivery City</p>
            <div className="flex flex-wrap gap-1.5 px-3">
              {cities.slice(0, 8).map(c => (
                <button key={c} type="button" onClick={() => setCity(c)}
                  className="px-3 py-1 rounded-full text-xs font-semibold border transition-all"
                  style={c === city
                    ? { background: GREEN, color: "#fff", borderColor: GREEN }
                    : { background: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }}>
                  {c}
                </button>
              ))}
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
  const inputRef = useRef<HTMLInputElement>(null);

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
            placeholder="Search nuts, dry fruits…"
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
            onKeyDown={e => { if (e.key === "Enter" && q.trim()) go(`/products?search=${encodeURIComponent(q.trim())}`); }}
          />
          {q && <button onClick={() => setQ("")}><X className="w-4 h-4 text-gray-400" /></button>}
        </div>
        <button onClick={() => { setQ(""); onClose(); }}
          className="text-sm font-semibold" style={{ color: GREEN }}>Cancel</button>
      </div>

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
                onClick={() => go(`/product/${p.id}`)}>
                {p.image
                  ? <img src={p.image.startsWith("http") ? p.image : `/api/storage/objects/${p.image}`} alt={p.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
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
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery]     = useState("");
  const [scrolled, setScrolled]           = useState(false);
  const [scrollY, setScrollY]             = useState(0);
  const [cartBounce, setCartBounce]       = useState(false);
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [searchOverlay, setSearchOverlay] = useState(false);
  const [searchHints, setSearchHints]     = useState<{ products: any[]; categories: any[] }>({ products: [], categories: [] });
  const [showHints, setShowHints]         = useState(false);
  const [hintLoading, setHintLoading]     = useState(false);

  const { totalItems, setMiniCartOpen } = useCart();
  const { user, logout }               = useAuth();
  const { city, setCity, cities }      = useUserLocation();
  const { data: siteSettings }         = useSiteSettings();
  const prevTotalRef = useRef(totalItems);
  const searchRef    = useRef<HTMLDivElement>(null);
  const placeholder  = useTypingPlaceholder();

  const { data: announcements = [] } = useQuery<any[]>({
    queryKey: ["announcements"],
    queryFn: () => fetch("/api/announcements").then(r => r.ok ? r.json() : []),
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    const onScroll = () => { const y = window.scrollY; setScrolled(y > 8); setScrollY(y); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (totalItems > prevTotalRef.current) {
      setCartBounce(true);
      setTimeout(() => setCartBounce(false), 600);
    }
    prevTotalRef.current = totalItems;
  }, [totalItems]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!searchQuery.trim()) { setSearchHints({ products: [], categories: [] }); return; }
      setHintLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}&limit=6`);
        if (r.ok) { setSearchHints(await r.json()); setShowHints(true); }
      } catch { /* ignore */ } finally { setHintLoading(false); }
    }, 280);
    return () => clearTimeout(t);
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
  const shrunk = scrollY > 80;

  function getImgSrc(key: string | null | undefined) {
    if (!key) return null;
    if (key.startsWith("http")) return key;
    return `/api/storage/objects/${key}`;
  }

  return (
    <>
      <div className="sticky top-0 z-40">
        {/* ── Announcement Bar ── */}
        <AnnouncementBar items={announcements} />

        {/* ── Main Header ── */}
        <header
          className="transition-all duration-300"
          style={{
            background: scrolled ? "rgba(255,255,255,0.97)" : "#fff",
            backdropFilter: scrolled ? "blur(12px)" : "none",
            WebkitBackdropFilter: scrolled ? "blur(12px)" : "none",
            boxShadow: scrolled ? "0 2px 20px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" : "0 1px 0 rgba(0,0,0,0.06)",
          }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Top row */}
            <div className={`flex items-center gap-3 lg:gap-4 transition-all duration-300 ${shrunk ? "h-[54px]" : "h-[62px]"}`}>

              {/* Mobile: Hamburger */}
              <button
                className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-gray-100 transition-colors flex-shrink-0"
                onClick={() => setDrawerOpen(true)}
                aria-label="Menu"
              >
                <Menu className="w-5 h-5 text-gray-700" />
              </button>

              {/* Logo */}
              <Link href="/" className="flex items-center gap-2 flex-shrink-0" data-testid="link-logo">
                {logoSrc(siteSettings?.logoPath) ? (
                  <>
                    <img src={logoSrc(siteSettings?.logoPath)!} alt={siteSettings?.siteName ?? "KDF NUTS"}
                      className={`w-auto object-contain flex-shrink-0 transition-all duration-300 ${shrunk ? "h-7" : "h-9"}`} />
                    <span className={`font-black text-gray-900 hidden sm:block transition-all duration-300 ${shrunk ? "text-base" : "text-lg"}`}>
                      {siteSettings?.siteName ?? "KDF NUTS"}
                    </span>
                  </>
                ) : (
                  <>
                    <div className={`rounded-xl flex items-center justify-center flex-shrink-0 font-black text-white shadow-sm transition-all duration-300 ${shrunk ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm"}`}
                      style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #3d7000 100%)` }}>
                      KDF
                    </div>
                    <span className={`font-black text-gray-900 transition-all duration-300 ${shrunk ? "text-base" : "text-lg"}`}>
                      KDF <span style={{ color: GREEN }}>NUTS</span>
                    </span>
                  </>
                )}
              </Link>

              {/* Search — desktop */}
              <div ref={searchRef} className="hidden sm:flex flex-1 max-w-2xl mx-auto relative">
                <form onSubmit={handleSearch} className="w-full">
                  <div className="relative group">
                    <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors z-10 ${hintLoading ? "animate-pulse" : "text-gray-400 group-focus-within:text-green-600"}`}
                      style={hintLoading ? { color: GREEN } : {}} />
                    <input
                      type="search"
                      placeholder={placeholder}
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setShowHints(true); }}
                      onFocus={() => searchQuery.length > 0 && setShowHints(true)}
                      className="w-full h-[42px] pl-11 pr-12 rounded-2xl text-sm text-gray-800 placeholder:text-gray-400 outline-none transition-all duration-200"
                      style={{
                        background: showHints || searchQuery ? "#fff" : "#f3f4f6",
                        border: showHints || searchQuery ? `2px solid ${GREEN}` : "2px solid transparent",
                        boxShadow: showHints || searchQuery ? `0 0 0 3px ${GREEN}15` : "none",
                      }}
                      data-testid="input-search"
                    />
                    <button type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-xl transition-all hover:scale-110"
                      style={{ background: `${GREEN}12`, color: GREEN }}>
                      <Mic className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>

                {/* Search dropdown */}
                {showHints && searchQuery.length > 0 && (searchHints.products.length > 0 || searchHints.categories.length > 0) && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl z-[300] overflow-hidden"
                    style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)" }}>
                    {searchHints.products.length > 0 && (
                      <>
                        <div className="px-4 pt-3 pb-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Products</p>
                        </div>
                        {searchHints.products.map(p => (
                          <button key={p.id} type="button"
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors border-b border-gray-50 last:border-0 group"
                            onClick={() => { setShowHints(false); setSearchQuery(""); navigate(`/product/${p.id}`); }}>
                            {p.image
                              ? <img src={getImgSrc(p.image)!} alt={p.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                              : <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white flex-shrink-0 text-sm" style={{ background: GREEN }}>{p.name[0]}</div>
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-gray-800">{p.name}</p>
                              <p className="text-xs font-bold mt-0.5" style={{ color: GREEN }}>Rs. {p.price?.toLocaleString()}</p>
                            </div>
                            {p.stock === 0 ? (
                              <span className="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded-full flex-shrink-0">Out of stock</span>
                            ) : (
                              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </>
                    )}
                    {searchHints.categories.length > 0 && (
                      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Categories</p>
                        <div className="flex gap-2 flex-wrap">
                          {searchHints.categories.map(c => (
                            <button key={c.id} type="button"
                              onClick={() => { setShowHints(false); setSearchQuery(""); navigate(`/products?category=${c.slug}`); }}
                              className="text-xs px-3 py-1 rounded-full font-semibold border transition-all hover:text-white"
                              style={{ background: `${GREEN}12`, borderColor: `${GREEN}20`, color: GREEN }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = GREEN; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${GREEN}12`; (e.currentTarget as HTMLElement).style.color = GREEN; }}>
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <button type="button"
                      onClick={() => { setShowHints(false); handleSearch(); }}
                      className="w-full py-3 text-xs text-center font-semibold bg-white border-t border-gray-100 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                      style={{ color: GREEN }}>
                      <Search className="w-3.5 h-3.5" />See all results for "{searchQuery}"
                    </button>
                  </div>
                )}
              </div>

              {/* Right actions */}
              <div className="flex items-center gap-0.5 ml-auto sm:ml-0 flex-shrink-0">

                {/* Mobile: search icon */}
                <button className="sm:hidden p-2.5 rounded-xl hover:bg-gray-100 transition-colors"
                  onClick={() => setSearchOverlay(true)} aria-label="Search">
                  <Search className="w-5 h-5 text-gray-700" />
                </button>

                {/* Location — desktop */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors text-sm" data-testid="button-location">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: GREEN }} />
                      <span className="max-w-[70px] truncate font-medium text-gray-700">{city}</span>
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48 max-h-72 overflow-y-auto">
                    {cities.map(c => (
                      <DropdownMenuItem key={c} onClick={() => setCity(c)}
                        className={c === city ? "font-semibold" : ""} style={c === city ? { color: GREEN } : {}}>
                        {c === city && <span className="mr-1.5">✓</span>}{c}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Wishlist — desktop */}
                <Link href="/account?tab=wishlist" className="hidden sm:block">
                  <button className="relative p-2.5 rounded-xl hover:bg-gray-100 transition-colors group" aria-label="Wishlist">
                    <Heart className="w-5 h-5 text-gray-500 group-hover:text-red-400 transition-colors" />
                  </button>
                </Link>

                {/* Cart */}
                <button
                  className="relative p-2.5 rounded-xl hover:bg-gray-100 transition-all group"
                  onClick={() => setMiniCartOpen(true)}
                  aria-label="Open cart"
                  data-testid="link-cart"
                >
                  <ShoppingBag
                    className={`w-5 h-5 text-gray-700 transition-transform duration-150 ${cartBounce ? "scale-125" : "scale-100"}`}
                  />
                  {totalItems > 0 && (
                    <span
                      className={`absolute -top-0.5 -right-0.5 min-w-[19px] h-[19px] flex items-center justify-center rounded-full text-white text-[10px] font-bold px-1 transition-transform duration-150 ${cartBounce ? "scale-125" : "scale-100"}`}
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
                      <button className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-gray-100 transition-colors" data-testid="button-user-menu">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                          style={{ background: GREEN }}>{user.name.charAt(0).toUpperCase()}</div>
                        <ChevronDown className="w-3 h-3 text-gray-400" />
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
                      <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-sm active:scale-95"
                        style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #3d7000 100%)` }}>
                        Login
                      </button>
                    </Link>
                    <Link href="/login" className="sm:hidden">
                      <button className="p-2.5 rounded-xl hover:bg-gray-100 transition-colors">
                        <User className="w-5 h-5 text-gray-700" />
                      </button>
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* ── Desktop Nav + Trust strip ── */}
            <div className={`hidden sm:flex items-center justify-between border-t border-gray-100 transition-all duration-300 ${shrunk ? "py-0.5" : "py-1"} -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8`}>
              <nav className="flex items-center gap-0.5 flex-wrap">
                <Link href="/products">
                  <button className="text-[13px] font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-all whitespace-nowrap">
                    All Products
                  </button>
                </Link>

                {/* Mega menus */}
                {MEGA_ITEMS.map(item => (
                  <MegaMenuDropdown key={item.slug} item={item} onNavigate={navigate} />
                ))}

                <Link href="/products?featured=true">
                  <button className="text-[13px] font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full transition-all whitespace-nowrap"
                    style={{ color: ORANGE, background: `${ORANGE}10` }}>
                    <Flame className="w-3.5 h-3.5" />Deals
                  </button>
                </Link>
                <Link href="/products?sort=newest">
                  <button className="text-[13px] font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-purple-50 hover:text-purple-700 transition-all whitespace-nowrap text-gray-600">
                    <Sparkles className="w-3.5 h-3.5" />New Arrivals
                  </button>
                </Link>
                <Link href="/products?sort=best_selling">
                  <button className="text-[13px] font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-yellow-50 hover:text-yellow-700 transition-all whitespace-nowrap text-gray-600">
                    <Star className="w-3.5 h-3.5" />Best Sellers
                  </button>
                </Link>
                <Link href="/blog">
                  <button className="text-[13px] font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-all whitespace-nowrap">
                    Blog
                  </button>
                </Link>
                <Link href="/track">
                  <button className="text-[13px] font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full transition-all whitespace-nowrap"
                    style={{ color: GREEN }}
                    data-testid="link-track-order">
                    <Truck className="w-3.5 h-3.5" />Track Order
                  </button>
                </Link>
              </nav>

              {/* Trust icons */}
              <div className="hidden lg:flex items-center gap-4 text-[11px] text-gray-500 font-medium flex-shrink-0 ml-3">
                <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" style={{ color: GREEN }} />Free Delivery Rs.1500+</span>
                <span className="flex items-center gap-1.5"><Leaf className="w-3.5 h-3.5" style={{ color: GREEN }} />100% Fresh</span>
                <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" style={{ color: GREEN }} />Easy Returns</span>
                <a href="tel:+92300000000" className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                  <PhoneCall className="w-3.5 h-3.5" style={{ color: GREEN }} />24/7 Support
                </a>
              </div>
            </div>

            {/* ── Mobile search row ── */}
            <div className="sm:hidden pb-2.5">
              <button onClick={() => setSearchOverlay(true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-100 rounded-2xl text-sm text-gray-400 text-left">
                <Search className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 truncate">Search nuts, dry fruits…</span>
                <Mic className="w-4 h-4 flex-shrink-0" />
              </button>
            </div>
          </div>
        </header>
      </div>

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-[400] sm:hidden"
        style={{
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.06)",
        }}>
        <div className="flex items-center justify-around px-2 py-2 safe-area-pb">
          {[
            { label: "Home",       href: "/",        icon: Home,        testId: "" },
            { label: "Categories", href: "/products", icon: LayoutGrid,  testId: "" },
            { label: "Search",     href: null,        icon: Search,      testId: "" },
            { label: "Cart",       href: null,        icon: ShoppingBag, testId: "link-cart" },
            { label: "Account",    href: user ? "/account" : "/login", icon: User, testId: "" },
          ].map(({ label, href, icon: Icon, testId }) => (
            <button key={label} type="button"
              data-testid={testId || undefined}
              className="flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all active:scale-90 relative"
              onClick={() => {
                if (label === "Search") { setSearchOverlay(true); }
                else if (label === "Cart") { setMiniCartOpen(true); }
                else if (href) { navigate(href); }
              }}>
              <div className="relative">
                <Icon className="w-5 h-5 text-gray-500" />
                {label === "Cart" && totalItems > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-white text-[9px] font-bold px-0.5"
                    style={{ background: ORANGE, lineHeight: 1 }}>
                    {totalItems > 9 ? "9+" : totalItems}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-medium text-gray-500">{label}</span>
            </button>
          ))}
        </div>
      </nav>

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
