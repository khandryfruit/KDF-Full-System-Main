import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  MapPin, Phone, Mail, Facebook, Instagram, ChevronRight,
  Youtube, Twitter, Shield, Truck, Package, Clock,
  ChevronUp, ArrowRight, Calendar, BookOpen, CheckCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSiteSettings, logoSrc } from "@/hooks/useSiteSettings";

const GREEN  = "#5FA800";
const ORANGE = "#F58300";

/* ─── SVG Icons ───────────────────────────────────────────────── */
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.77a4.85 4.85 0 0 1-1.01-.08z"/>
    </svg>
  );
}
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
    </svg>
  );
}
function AppStoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}
function PlayStoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.18 23.76c.3.17.64.24.99.2L14.9 12 3.18.04C2.83 0 2.5.07 2.2.24 1.6.57 1.2 1.21 1.2 2v20c0 .79.4 1.43 1 1.76zm5.42-14.44l2.25-2.25 7.78 4.46-2.26 2.26-7.77-4.47zm-1.54-.88L14.19 5.2l1.78 1.77-8.91 5.12V8.44zm0 7.12V13.4l8.91 5.12-1.78 1.77-7.13-4.23zm2.3 1.32l7.77-4.47 2.26 2.26-7.78 4.46-2.25-2.25z"/>
    </svg>
  );
}
function VisaIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-6 w-auto" fill="none">
      <rect width="48" height="48" rx="6" fill="#1A1F71"/>
      <text x="7" y="31" fontFamily="Arial" fontWeight="bold" fontSize="18" fill="white">VISA</text>
    </svg>
  );
}
function MasterCardIcon() {
  return (
    <svg viewBox="0 0 48 32" className="h-6 w-auto">
      <rect width="48" height="32" rx="4" fill="#252525"/>
      <circle cx="18" cy="16" r="10" fill="#EB001B"/>
      <circle cx="30" cy="16" r="10" fill="#F79E1B"/>
      <path d="M24 7.7a10 10 0 010 16.6A10 10 0 0124 7.7z" fill="#FF5F00"/>
    </svg>
  );
}

const SOCIAL_ICON_MAP: Record<string, React.ElementType> = {
  facebook: Facebook, instagram: Instagram, tiktok: TikTokIcon,
  youtube: Youtube, twitter: Twitter, twitterx: Twitter, whatsapp: WhatsAppIcon,
};
const SOCIAL_COLORS: Record<string, { bg: string; hover: string; color: string }> = {
  facebook:  { bg: "#E7F3FF", hover: "#1877F2", color: "#1877F2" },
  instagram: { bg: "#FCE4EC", hover: "#E1306C", color: "#E1306C" },
  tiktok:    { bg: "#F0F0F0", hover: "#000000", color: "#000000" },
  youtube:   { bg: "#FFE9E9", hover: "#FF0000", color: "#FF0000" },
  whatsapp:  { bg: "#E8F9EF", hover: "#25D366", color: "#25D366" },
  twitter:   { bg: "#E8F5FD", hover: "#1DA1F2", color: "#1DA1F2" },
  twitterx:  { bg: "#F0F0F0", hover: "#000000", color: "#000000" },
};

/* ─── Fallbacks ─────────────────────────────────────────────── */
const FALLBACK_MENUS = [
  { id: -1, title: "Shop", items: [
    { label: "All Products",    linkValue: "/products",                  openInNewTab: false },
    { label: "Categories",      linkValue: "/categories",                openInNewTab: false },
    { label: "New Arrivals",    linkValue: "/products?sortBy=newest",    openInNewTab: false },
    { label: "Best Sellers",    linkValue: "/products?sortBy=popular",   openInNewTab: false },
    { label: "Deals & Offers",  linkValue: "/products?featured=true",    openInNewTab: false },
  ]},
  { id: -2, title: "Account", items: [
    { label: "Login",           linkValue: "/login",                     openInNewTab: false },
    { label: "Register",        linkValue: "/register",                  openInNewTab: false },
    { label: "My Orders",       linkValue: "/account",                   openInNewTab: false },
    { label: "Wallet & Loyalty",linkValue: "/account?tab=wallet",        openInNewTab: false },
    { label: "Wishlist",        linkValue: "/wishlist",                  openInNewTab: false },
    { label: "Track Order",     linkValue: "/track",                     openInNewTab: false },
  ]},
  { id: -3, title: "Support", items: [
    { label: "About Us",        linkValue: "/about",                     openInNewTab: false },
    { label: "FAQ",             linkValue: "/faq",                       openInNewTab: false },
    { label: "Contact Us",      linkValue: "/contact",                   openInNewTab: false },
    { label: "Privacy Policy",  linkValue: "/policies/privacy-policy",   openInNewTab: false },
    { label: "Refund Policy",   linkValue: "/policies/refund-policy",    openInNewTab: false },
    { label: "Terms & Conditions", linkValue: "/policies/terms-and-conditions", openInNewTab: false },
  ]},
];

const TRUST_BADGES = [
  { icon: Shield,  label: "Secure Checkout",   sub: "256-bit SSL" },
  { icon: Truck,   label: "Free Delivery",      sub: "On orders Rs.1500+" },
  { icon: Package, label: "Cash on Delivery",   sub: "Available nationwide" },
  { icon: Clock,   label: "Fast Dispatch",      sub: "Same day in Lahore" },
];

/* ─── Sub-components ──────────────────────────────────────────── */
function FooterLinkItem({ label, linkValue, openInNewTab }: { label: string; linkValue: string; openInNewTab?: boolean }) {
  const cls = "flex items-center gap-2 group text-sm text-gray-400 hover:text-white transition-all duration-200 py-1";
  const inner = (
    <>
      <ChevronRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 flex-shrink-0 text-[#5FA800]" />
      <span className="group-hover:translate-x-0.5 transition-transform duration-200">{label}</span>
    </>
  );
  return (
    <li>
      {openInNewTab
        ? <a href={linkValue} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
        : <Link href={linkValue} className={cls}>{inner}</Link>}
    </li>
  );
}

function BlogCard({ post }: { post: any }) {
  const imgSrc = post.featuredImagePath || post.featured_image_path;
  const formattedDate = post.createdAt || post.created_at
    ? new Date(post.createdAt || post.created_at).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const excerpt = post.excerpt || post.content?.replace(/<[^>]+>/g, "").slice(0, 90) || "";

  return (
    <Link href={`/blog/${post.slug}`}
      className="group flex gap-3 p-3 rounded-xl hover:bg-white/5 transition-all duration-200 cursor-pointer">
      <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-white/10">
        {imgSrc ? (
          <img
            src={imgSrc.startsWith("/objects/") ? `/api/storage${imgSrc}` : imgSrc}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-white/30" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-white/90 line-clamp-2 group-hover:text-[#5FA800] transition-colors duration-200 leading-snug">
          {post.title}
        </h4>
        {excerpt && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{excerpt}</p>}
        {formattedDate && (
          <p className="text-[10px] text-gray-600 mt-1 flex items-center gap-1">
            <Calendar className="w-2.5 h-2.5" />{formattedDate}
          </p>
        )}
      </div>
    </Link>
  );
}

function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-36 sm:bottom-24 right-4 z-[450] w-10 h-10 rounded-full shadow-lg flex items-center justify-center text-white transition-all duration-300 hover:scale-110 active:scale-95"
      style={{ background: `linear-gradient(135deg, ${GREEN}, #3d7000)` }}
      aria-label="Scroll to top"
    >
      <ChevronUp className="w-5 h-5" />
    </button>
  );
}

/* ─── Main Footer ─────────────────────────────────────────────── */
export function Footer() {
  const [email, setEmail]         = useState("");
  const [subState, setSubState]   = useState<"idle" | "loading" | "done" | "error">("idle");
  const [qrError, setQrError]     = useState(false);
  const { data: siteSettings }    = useSiteSettings();

  const { data: footerData } = useQuery<any>({
    queryKey: ["/api/footer"],
    queryFn: () => fetch("/api/footer").then(r => r.ok ? r.json() : null),
    staleTime: 5 * 60 * 1000,
  });

  const { data: blogData } = useQuery<any>({
    queryKey: ["/api/blog-posts-footer"],
    queryFn: () => fetch("/api/blog-posts?limit=3&status=published").then(r => r.ok ? r.json() : null),
    staleTime: 10 * 60 * 1000,
  });

  const siteName    = siteSettings?.siteName ?? "KDF NUTS";
  const logoUrl     = logoSrc(siteSettings?.logoPath);
  const settings    = footerData?.settings;
  const menus       = (footerData?.menus?.length ? footerData.menus : FALLBACK_MENUS) as any[];
  const socialLinks = (footerData?.socialLinks ?? []) as any[];
  const appLinks    = footerData?.appLinks;
  const policies    = (footerData?.policies ?? []) as any[];
  const blogPosts   = blogData?.posts ?? [];
  const showApp     = !appLinks || appLinks.isActive !== false;

  const description = settings?.description  || "Premium dry fruits & nuts delivered fresh to your doorstep across Pakistan. Lahore | Karachi | Islamabad.";
  const address     = settings?.address      || "Lahore, Pakistan";
  const phone       = settings?.phone        || "+92 304 999 6000";
  const emailAddr   = settings?.email        || "support@kdfnuts.com";
  const copyright   = settings?.copyrightText || `© ${new Date().getFullYear()} ${siteName}. All rights reserved.`;

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubState("loading");
    await new Promise(r => setTimeout(r, 800));
    setSubState("done");
    setEmail("");
  };

  return (
    <>
      <ScrollToTop />
      <footer className="mt-16" style={{ background: "#0D1117" }}>

        {/* ── Trust Badges Bar ────────────────────────────────── */}
        <div style={{ background: "linear-gradient(90deg, #0a1a00 0%, #0f2400 50%, #0a1a00 100%)", borderTop: `1px solid ${GREEN}22` }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {TRUST_BADGES.map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex items-center gap-3 group">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200 group-hover:scale-110"
                    style={{ background: `${GREEN}22` }}>
                    <Icon className="w-4 h-4" style={{ color: GREEN }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/90 leading-none">{label}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-none truncate">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Newsletter ────────────────────────────────────────── */}
        <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #3d7000 60%, #2a5000 100%)` }}>
          {/* subtle pattern */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: "radial-gradient(circle at 20% 50%, #fff 1px, transparent 1px), radial-gradient(circle at 80% 20%, #fff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }} />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
              <div className="text-white text-center lg:text-left flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-1">Stay in the Loop</p>
                <h2 className="text-2xl sm:text-3xl font-black leading-tight">
                  Get exclusive deals<br className="hidden sm:block" /> in your inbox
                </h2>
                <p className="text-white/70 text-sm mt-2 max-w-sm mx-auto lg:mx-0">
                  Join 10,000+ happy customers. Get flash sales, new arrivals & health tips. No spam, ever.
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-3 justify-center lg:justify-start">
                  {["Flash sales", "New arrivals", "Health tips"].map(t => (
                    <span key={t} className="flex items-center gap-1 text-[11px] text-white/70">
                      <CheckCircle className="w-3 h-3 text-white/50" />{t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="w-full lg:w-auto lg:min-w-[420px]">
                {subState === "done" ? (
                  <div className="flex items-center gap-3 bg-white/15 backdrop-blur-sm border border-white/20 text-white px-6 py-4 rounded-2xl">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">You're subscribed!</p>
                      <p className="text-xs text-white/70 mt-0.5">Welcome to KDF NUTS family 🎉</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="email" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="Enter your email address" required
                        className="w-full pl-11 pr-4 py-3.5 rounded-xl text-sm outline-none text-gray-800 bg-white shadow-lg placeholder-gray-400 focus:ring-2 focus:ring-white/50"
                      />
                    </div>
                    <button
                      type="submit" disabled={subState === "loading"}
                      className="flex items-center justify-center gap-2 px-6 py-3.5 text-white text-sm font-bold rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 whitespace-nowrap shadow-lg disabled:opacity-70"
                      style={{ background: ORANGE }}
                    >
                      {subState === "loading" ? (
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <><ArrowRight className="w-4 h-4" />Subscribe</>
                      )}
                    </button>
                  </form>
                )}
                <p className="text-[10px] text-white/40 mt-2 text-center sm:text-left">
                  By subscribing you agree to our Privacy Policy. Unsubscribe anytime.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Main Footer Body ─────────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

            {/* Brand Column */}
            <div className="lg:col-span-3">
              {/* Logo */}
              <div className="flex items-center gap-2.5 mb-4">
                {logoUrl ? (
                  <img src={logoUrl} alt={siteName} className="h-10 w-auto max-w-[120px] object-contain" />
                ) : (
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${GREEN}, #3d7000)` }}>
                    <span className="text-white font-black text-sm tracking-tight">KDF</span>
                  </div>
                )}
                <div>
                  <span className="font-black text-lg text-white">{siteName}</span>
                  <p className="text-[10px] text-gray-500 leading-none mt-0.5">Premium Dry Fruits & Nuts</p>
                </div>
              </div>

              <p className="text-gray-400 text-sm leading-relaxed mb-5">{description}</p>

              {/* Contact info */}
              <ul className="space-y-2.5 mb-6">
                <li className="flex items-start gap-2.5 text-sm text-gray-400 group">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${GREEN}20` }}>
                    <MapPin className="w-3.5 h-3.5" style={{ color: GREEN }} />
                  </div>
                  <span className="leading-snug">{address}</span>
                </li>
                <li className="flex items-center gap-2.5 text-sm">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${GREEN}20` }}>
                    <Phone className="w-3.5 h-3.5" style={{ color: GREEN }} />
                  </div>
                  <a href={`tel:${phone.replace(/\s/g, "")}`} className="text-gray-400 hover:text-white transition-colors">{phone}</a>
                </li>
                <li className="flex items-center gap-2.5 text-sm">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${GREEN}20` }}>
                    <Mail className="w-3.5 h-3.5" style={{ color: GREEN }} />
                  </div>
                  <a href={`mailto:${emailAddr}`} className="text-gray-400 hover:text-white transition-colors">{emailAddr}</a>
                </li>
                <li className="flex items-start gap-2.5 text-sm text-gray-400">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${GREEN}20` }}>
                    <Clock className="w-3.5 h-3.5" style={{ color: GREEN }} />
                  </div>
                  <span className="leading-snug">Mon–Sat: 9 AM – 8 PM<br />Sunday: 11 AM – 6 PM</span>
                </li>
              </ul>

              {/* Social icons */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-3">Follow us</p>
                <div className="flex flex-wrap gap-2">
                  {socialLinks.length > 0 ? (
                    socialLinks.map((s: any) => {
                      const Icon = SOCIAL_ICON_MAP[s.icon?.toLowerCase()] ?? ChevronRight;
                      const col  = SOCIAL_COLORS[s.icon?.toLowerCase()] ?? { bg: "#222", hover: "#555", color: "#aaa" };
                      return (
                        <a key={s.id} href={s.url} target="_blank" rel="noreferrer" aria-label={s.platform}
                          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
                          style={{ background: "#1a1f2a", color: col.color }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = col.hover; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#1a1f2a"; (e.currentTarget as HTMLElement).style.color = col.color; }}>
                          <Icon className="w-4 h-4" />
                        </a>
                      );
                    })
                  ) : (
                    <>
                      {[
                        { icon: Facebook,    platform: "Facebook",  col: SOCIAL_COLORS.facebook },
                        { icon: Instagram,   platform: "Instagram", col: SOCIAL_COLORS.instagram },
                        { icon: TikTokIcon,  platform: "TikTok",    col: SOCIAL_COLORS.tiktok },
                        { icon: WhatsAppIcon,platform: "WhatsApp",  col: SOCIAL_COLORS.whatsapp },
                        { icon: Youtube,     platform: "YouTube",   col: SOCIAL_COLORS.youtube },
                      ].map(({ icon: Icon, platform, col }) => (
                        <a key={platform} href="#" aria-label={platform}
                          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
                          style={{ background: "#1a1f2a", color: col.color }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = col.hover; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#1a1f2a"; (e.currentTarget as HTMLElement).style.color = col.color; }}>
                          <Icon className="w-4 h-4" />
                        </a>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Nav Columns */}
            <div className="lg:col-span-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
                {menus.map((menu: any) => (
                  <div key={menu.id}>
                    <h3 className="font-bold text-white text-[11px] uppercase tracking-widest mb-4 flex items-center gap-2">
                      <span className="w-4 h-0.5 rounded-full inline-block" style={{ background: GREEN }} />
                      {menu.title}
                    </h3>
                    <ul className="space-y-0.5">
                      {(menu.items ?? []).map((item: any) => (
                        <FooterLinkItem key={item.label + item.linkValue} {...item} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Blog + QR + App */}
            <div className="lg:col-span-4 space-y-6">

              {/* Latest Blog Posts */}
              {blogPosts.length > 0 && (
                <div className="rounded-2xl p-4" style={{ background: "#161b27", border: "1px solid #ffffff0f" }}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-white text-[11px] uppercase tracking-widest flex items-center gap-2">
                      <span className="w-4 h-0.5 rounded-full" style={{ background: ORANGE }} />
                      Latest Blog Posts
                    </h3>
                    <Link href="/blog" className="text-[10px] font-semibold hover:underline flex items-center gap-0.5 transition-colors" style={{ color: GREEN }}>
                      View all <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                  <div className="divide-y" style={{ borderColor: "#ffffff08" }}>
                    {blogPosts.slice(0, 3).map((post: any) => (
                      <BlogCard key={post.id} post={post} />
                    ))}
                  </div>
                </div>
              )}

              {/* WhatsApp QR */}
              {!qrError && (
                <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: "#0d1f14", border: "1px solid #25D36620" }}>
                  <div className="p-2 rounded-xl bg-white inline-block flex-shrink-0 shadow-md"
                    style={{ animation: "float 3s ease-in-out infinite" }}>
                    <img
                      src="/api/whatsapp/qr"
                      alt="WhatsApp QR"
                      className="w-16 h-16 rounded-lg block"
                      onError={() => setQrError(true)}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                      <span className="font-bold text-white text-sm">Scan to Chat</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-snug mb-2.5">
                      Scan the QR code to start a WhatsApp conversation with us instantly.
                    </p>
                    <a
                      href={`https://wa.me/${(phone || "").replace(/\D/g, "")}`}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all duration-200 hover:scale-105"
                      style={{ background: "#25D366" }}
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" />
                      Chat on WhatsApp
                    </a>
                  </div>
                </div>
              )}

              {/* App Downloads */}
              {showApp && (
                <div className="rounded-2xl p-4" style={{ background: "#161b27", border: "1px solid #ffffff0f" }}>
                  <h3 className="font-bold text-white text-[11px] uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="w-4 h-0.5 rounded-full" style={{ background: GREEN }} />
                    Get the App
                  </h3>
                  <p className="text-xs text-gray-400 mb-3">Shop on the go — download the KDF NUTS mobile app.</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <a href={appLinks?.androidLink || "#"} target={appLinks?.androidLink ? "_blank" : undefined} rel="noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 flex-1"
                      style={{ background: "#1a1f2a", border: "1px solid #ffffff10" }}>
                      <PlayStoreIcon className="w-5 h-5 text-white flex-shrink-0" />
                      <div className="leading-tight">
                        <p className="text-[9px] text-gray-500 uppercase tracking-wide">Get it on</p>
                        <p className="text-xs font-bold text-white">Google Play</p>
                      </div>
                    </a>
                    <a href={appLinks?.iosLink || "#"} target={appLinks?.iosLink ? "_blank" : undefined} rel="noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 flex-1"
                      style={{ background: "#1a1f2a", border: "1px solid #ffffff10" }}>
                      <AppStoreIcon className="w-5 h-5 text-white flex-shrink-0" />
                      <div className="leading-tight">
                        <p className="text-[9px] text-gray-500 uppercase tracking-wide">Download on</p>
                        <p className="text-xs font-bold text-white">App Store</p>
                      </div>
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom Bar ───────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid #ffffff0d" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">

              {/* Copyright */}
              <p className="text-xs text-gray-500 text-center md:text-left">{copyright}</p>

              {/* Payment badges */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold hidden sm:block">We accept</span>
                <div className="flex items-center gap-2">
                  <div className="px-2 py-1 rounded bg-[#1a1f2a] flex items-center"><VisaIcon /></div>
                  <div className="px-2 py-1 rounded bg-[#1a1f2a] flex items-center"><MasterCardIcon /></div>
                  <div className="px-3 py-1 rounded text-[10px] font-bold flex items-center gap-1" style={{ background: `${GREEN}20`, color: GREEN }}>
                    <Package className="w-3 h-3" />COD
                  </div>
                  <div className="px-3 py-1 rounded text-[10px] font-bold flex items-center gap-1 text-gray-300" style={{ background: "#1a1f2a" }}>
                    <Shield className="w-3 h-3 text-gray-400" />Secure
                  </div>
                </div>
              </div>

              {/* Policy links */}
              <div className="flex flex-wrap justify-center items-center gap-3 text-xs text-gray-500">
                {policies.length > 0 ? (
                  policies.map((p: any, i: number) => (
                    <span key={p.id} className="flex items-center gap-3">
                      <Link href={`/policies/${p.slug}`} className="hover:text-white transition-colors">{p.title}</Link>
                      {i < policies.length - 1 && <span className="text-gray-700">·</span>}
                    </span>
                  ))
                ) : (
                  <>
                    <Link href="/policies/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
                    <span className="text-gray-700">·</span>
                    <Link href="/policies/terms-and-conditions" className="hover:text-white transition-colors">Terms</Link>
                    <span className="text-gray-700">·</span>
                    <Link href="/policies/refund-policy" className="hover:text-white transition-colors">Refund</Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

      </footer>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-4px); }
        }
      `}</style>
    </>
  );
}
