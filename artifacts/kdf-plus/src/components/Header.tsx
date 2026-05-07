import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Search, MapPin, ChevronDown, User, LogOut, Package, Heart, ShoppingBag, Truck, Leaf, RefreshCcw, PhoneCall, Flame, Sparkles, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useUserLocation } from "@/context/LocationContext";
import { useSiteSettings, logoSrc } from "@/hooks/useSiteSettings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [announcementIdx, setAnnouncementIdx] = useState(0);
  const [cartBounce, setCartBounce] = useState(false);
  const { totalItems, setMiniCartOpen } = useCart();
  const { user, logout } = useAuth();
  const { city, setCity, cities } = useUserLocation();
  const { data: siteSettings } = useSiteSettings();
  const prevTotalRef = useRef(totalItems);

  const { data: announcements = [] } = useQuery<any[]>({
    queryKey: ["announcements"],
    queryFn: () => fetch("/api/announcements").then(r => r.ok ? r.json() : []),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  /* Scroll shadow */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Announcement cycling — driven by API data */
  useEffect(() => {
    if (announcements.length === 0) return;
    setAnnouncementIdx(0);
    const t = setInterval(() => {
      setAnnouncementIdx((i) => (i + 1) % announcements.length);
    }, 3500);
    return () => clearInterval(t);
  }, [announcements.length]);

  /* Cart icon bounce on item add */
  useEffect(() => {
    if (totalItems > prevTotalRef.current) {
      setCartBounce(true);
      setTimeout(() => setCartBounce(false), 600);
    }
    prevTotalRef.current = totalItems;
  }, [totalItems]);

  const [searchHints, setSearchHints] = useState<{ products: any[]; categories: any[] }>({ products: [], categories: [] });
  const [showHints, setShowHints] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!searchQuery.trim() || searchQuery.length < 1) { setSearchHints({ products: [], categories: [] }); return; }
      setHintLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}&limit=6`);
        if (r.ok) { const d = await r.json(); setSearchHints(d); setShowHints(true); }
      } catch {} finally { setHintLoading(false); }
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowHints(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function getImgSrc(key: string | null | undefined) {
    if (!key) return null;
    if (key.startsWith("http")) return key;
    return `/api/storage/objects/${key}`;
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowHints(false);
    if (searchQuery.trim()) {
      setLocation(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const currentAnn = announcements[announcementIdx];

  return (
    <div className="sticky top-0 z-40">
      {/* Announcement bar — only shown when there are active announcements */}
      {announcements.length > 0 && currentAnn && (
        <div
          className="text-xs py-1.5 text-center font-medium overflow-hidden transition-colors duration-300"
          style={{
            backgroundColor: currentAnn.bgColor ?? "#0D2B00",
            color: currentAnn.textColor ?? "white",
          }}
        >
          <span
            key={announcementIdx}
            className="inline-block animate-in fade-in slide-in-from-top-1 duration-500"
          >
            {currentAnn.text}
          </span>
        </div>
      )}

      {/* Main header */}
      <header
        className={`bg-white transition-shadow duration-300 ${
          scrolled ? "shadow-md" : "shadow-sm border-b border-gray-100"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-[60px] gap-3 lg:gap-4">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 flex-shrink-0 min-w-0" data-testid="link-logo">
              {logoSrc(siteSettings?.logoPath) ? (
                <>
                  <img
                    src={logoSrc(siteSettings?.logoPath)!}
                    alt={siteSettings?.siteName ?? "KDF Plus"}
                    className="h-9 w-auto max-w-[120px] object-contain flex-shrink-0"
                  />
                  <span className="font-bold text-base sm:text-lg text-gray-900 truncate max-w-[100px] sm:max-w-[160px]">
                    {siteSettings?.siteName ?? "KDF Plus"}
                  </span>
                </>
              ) : (
                <>
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0"
                    style={{ backgroundColor: "#5FA800" }}
                  >
                    <span className="text-white font-black text-sm tracking-tight">KDF</span>
                  </div>
                  <span className="font-bold text-base sm:text-lg text-gray-900 truncate max-w-[80px] sm:max-w-none">
                    KDF <span style={{ color: "#5FA800" }}>Plus</span>
                  </span>
                </>
              )}
            </Link>

            {/* Search — center, takes remaining space */}
            <div ref={searchRef} className="flex-1 max-w-2xl mx-auto hidden sm:flex relative">
              <form onSubmit={handleSearch} className="w-full">
                <div className="relative w-full group">
                  <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${hintLoading ? "text-[#5FA800] animate-pulse" : "text-gray-400 group-focus-within:text-[#5FA800]"}`} />
                  <input
                    type="search"
                    placeholder="Search... try: badam, kaju, almonds"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setShowHints(true); }}
                    onFocus={() => searchQuery.length > 0 && setShowHints(true)}
                    className="w-full h-10 pl-10 pr-4 bg-gray-100 rounded-full text-sm text-gray-800 placeholder:text-gray-400 border-2 border-transparent focus:border-[#5FA800] focus:bg-white outline-none transition-all"
                    data-testid="input-search"
                  />
                </div>
              </form>
              {showHints && searchQuery.length > 0 && (searchHints.products.length > 0 || searchHints.categories.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-[200]">
                  {searchHints.products.map(p => (
                    <button key={p.id} type="button"
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors border-b border-gray-50 last:border-0"
                      onClick={() => { setShowHints(false); setSearchQuery(""); setLocation(`/product/${p.id}`); }}>
                      {p.image ? (
                        <img src={getImgSrc(p.image)} alt={p.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-[#5FA800]/10 flex-shrink-0 flex items-center justify-center text-[#5FA800] text-sm font-bold">{p.name[0]}</div>
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
                            onClick={() => { setShowHints(false); setSearchQuery(""); setLocation(`/products?category=${c.slug}`); }}
                            className="text-xs px-3 py-1 rounded-full bg-[#5FA800]/10 font-semibold border border-[#5FA800]/20 hover:bg-[#5FA800] hover:text-white transition-colors" style={{ color: "#5FA800" }}>
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => { setShowHints(false); handleSearch({ preventDefault: () => {} } as any); }}
                    className="w-full py-2.5 text-xs text-center font-semibold bg-gray-50 border-t border-gray-100 hover:bg-gray-100 transition-colors" style={{ color: "#5FA800" }}>
                    See all results for "{searchQuery}" →
                  </button>
                </div>
              )}
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-1 ml-auto sm:ml-0 flex-shrink-0">

              {/* Location — desktop */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-full text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                    data-testid="button-location"
                  >
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5FA800" }} />
                    <span className="max-w-[72px] truncate font-medium">{city}</span>
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 max-h-72 overflow-y-auto">
                  {cities.map((c) => (
                    <DropdownMenuItem
                      key={c}
                      onClick={() => setCity(c)}
                      className={c === city ? "font-semibold" : ""}
                      style={c === city ? { color: "#5FA800" } : {}}
                      data-testid={`city-option-${c}`}
                    >
                      {c === city && <span className="mr-1.5">✓</span>}
                      {c}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Cart button */}
              <Link href="/cart" data-testid="link-cart" aria-label="Open cart">
                <button
                  className="relative p-2.5 rounded-full hover:bg-gray-100 transition-colors"
                  onClick={() => setMiniCartOpen(true)}
                >
                  <ShoppingBag
                    className={`w-5 h-5 text-gray-700 transition-transform ${cartBounce ? "scale-125" : "scale-100"}`}
                    style={{ transitionDuration: "150ms" }}
                  />
                  {totalItems > 0 && (
                    <span
                      className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-white text-[10px] font-bold px-1 ${cartBounce ? "scale-125" : "scale-100"} transition-transform`}
                      style={{ backgroundColor: "#F58300" }}
                      data-testid="badge-cart-count"
                    >
                      {totalItems > 99 ? "99+" : totalItems}
                    </span>
                  )}
                </button>
              </Link>

              {/* User */}
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="hidden sm:flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-gray-100 transition-colors"
                      data-testid="button-user-menu"
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                        style={{ backgroundColor: "#5FA800" }}
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <div className="px-3 py-2.5">
                      <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{user.phone}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setLocation("/account")} data-testid="menu-account">
                      <User className="w-4 h-4 mr-2" /> My Account
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/account?tab=orders")} data-testid="menu-orders">
                      <Package className="w-4 h-4 mr-2" /> My Orders
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/account?tab=wishlist")} data-testid="menu-wishlist">
                      <Heart className="w-4 h-4 mr-2" /> Wishlist
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-500 focus:text-red-500" data-testid="button-logout">
                      <LogOut className="w-4 h-4 mr-2" /> Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link href="/login" data-testid="link-login">
                  <button
                    className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "#5FA800" }}
                  >
                    Login
                  </button>
                </Link>
              )}

              {/* Mobile: account / login icon */}
              {user ? (
                <Link href="/account" className="sm:hidden" data-testid="link-account-mobile">
                  <button className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                      style={{ backgroundColor: "#5FA800" }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  </button>
                </Link>
              ) : (
                <Link href="/login" className="sm:hidden">
                  <button className="p-2.5 rounded-full hover:bg-gray-100 transition-colors">
                    <User className="w-5 h-5 text-gray-700" />
                  </button>
                </Link>
              )}
            </div>
          </div>

          {/* Desktop nav + trust strip */}
          <div className="hidden sm:flex items-center justify-between border-t border-gray-100 py-1 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
            {/* Category nav links */}
            <div className="flex items-center gap-0.5 flex-wrap">
              <Link href="/products">
                <button className="text-xs font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-colors whitespace-nowrap">
                  All Products
                </button>
              </Link>
              {[
                { label: "Dry Fruits", q: "dry-fruits" },
                { label: "Nuts", q: "nuts" },
                { label: "Seeds", q: "seeds" },
                { label: "Organic", q: "organic" },
              ].map(({ label, q }) => (
                <Link key={q} href={`/products?category=${q}`}>
                  <button className="text-xs font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-colors whitespace-nowrap">
                    {label}
                  </button>
                </Link>
              ))}
              <Link href="/products?featured=true">
                <button className="text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full bg-orange-50 hover:bg-orange-100 transition-colors whitespace-nowrap" style={{ color: "#F58300" }}>
                  <Flame className="w-3 h-3" /> Deals
                </button>
              </Link>
              <Link href="/products?sort=newest">
                <button className="text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-purple-50 hover:text-purple-700 transition-colors whitespace-nowrap text-gray-600">
                  <Sparkles className="w-3 h-3" /> New Arrivals
                </button>
              </Link>
              <Link href="/products?sort=best_selling">
                <button className="text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-yellow-50 hover:text-yellow-700 transition-colors whitespace-nowrap text-gray-600">
                  <Star className="w-3 h-3" /> Best Sellers
                </button>
              </Link>
              <Link href="/blog">
                <button className="text-xs font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-colors whitespace-nowrap">
                  Blog
                </button>
              </Link>
              <Link href="/track">
                <button
                  className="text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full transition-colors hover:bg-[#5FA800]/10 whitespace-nowrap"
                  style={{ color: "#5FA800" }}
                  data-testid="link-track-order"
                >
                  <Truck className="w-3 h-3" /> Track Order
                </button>
              </Link>
            </div>
            {/* Trust icons */}
            <div className="hidden lg:flex items-center gap-4 text-[11px] text-gray-500 font-medium flex-shrink-0 ml-3">
              <span className="flex items-center gap-1"><Truck className="w-3 h-3 text-[#5FA800]" /> Free Delivery Rs.1500+</span>
              <span className="flex items-center gap-1"><Leaf className="w-3 h-3 text-[#5FA800]" /> 100% Fresh</span>
              <span className="flex items-center gap-1"><RefreshCcw className="w-3 h-3 text-[#5FA800]" /> Easy Returns</span>
              <a href="tel:+92300000000" className="flex items-center gap-1 hover:text-[#5FA800] transition-colors"><PhoneCall className="w-3 h-3 text-[#5FA800]" /> 24/7 Support</a>
            </div>
          </div>

          {/* Mobile search row */}
          <div className="sm:hidden pb-2.5">
            <div ref={searchRef} className="relative">
              <div className="flex items-center gap-2 mb-2">
                <form onSubmit={handleSearch} className="flex-1">
                  <div className="relative group">
                    <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors ${hintLoading ? "text-[#5FA800] animate-pulse" : "text-gray-400 group-focus-within:text-[#5FA800]"}`} />
                    <input
                      type="search"
                      placeholder="Search nuts, dry fruits..."
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setShowHints(true); }}
                      onFocus={() => searchQuery.length > 0 && setShowHints(true)}
                      className="w-full h-9 pl-9 pr-3 bg-gray-100 rounded-full text-sm text-gray-700 placeholder:text-gray-400 border border-transparent focus:border-[#5FA800] focus:bg-white outline-none transition-all"
                      data-testid="input-search-mobile"
                    />
                  </div>
                </form>
                <Link href="/track" data-testid="link-track-order-mobile">
                  <button
                    className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-white active:scale-95 transition-transform tracking-wide"
                    style={{
                      height: "30px",
                      padding: "0 10px",
                      borderRadius: "999px",
                      backgroundColor: "#5FA800",
                      boxShadow: "0 1px 4px rgba(95,168,0,0.35)",
                    }}
                    aria-label="Track Order"
                  >
                    <Truck className="w-3 h-3" />
                    <span>Track</span>
                  </button>
                </Link>
              </div>
              {showHints && searchQuery.length > 0 && (searchHints.products.length > 0 || searchHints.categories.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-[200]">
                  {searchHints.products.map(p => (
                    <button key={p.id} type="button"
                      className="w-full flex items-center gap-3 px-4 py-2.5 active:bg-gray-100 text-left border-b border-gray-50 last:border-0"
                      onClick={() => { setShowHints(false); setSearchQuery(""); setLocation(`/product/${p.id}`); }}>
                      {p.image ? (
                        <img src={getImgSrc(p.image)} alt={p.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-[#5FA800]/10 flex-shrink-0 flex items-center justify-center text-[#5FA800] text-sm font-bold">{p.name[0]}</div>
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
                            onClick={() => { setShowHints(false); setSearchQuery(""); setLocation(`/products?category=${c.slug}`); }}
                            className="text-xs px-3 py-1 rounded-full bg-[#5FA800]/10 font-semibold border border-[#5FA800]/20" style={{ color: "#5FA800" }}>
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => { setShowHints(false); handleSearch({ preventDefault: () => {} } as any); }}
                    className="w-full py-2.5 text-xs text-center font-semibold bg-gray-50 border-t border-gray-100" style={{ color: "#5FA800" }}>
                    See all results for "{searchQuery}" →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}
