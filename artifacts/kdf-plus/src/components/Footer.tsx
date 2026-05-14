import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "wouter";
import {
  MapPin, Phone, Mail, Facebook, Instagram, ChevronRight,
  Youtube, Twitter, Shield, Truck, Package, Clock,
  ChevronUp, ArrowRight, Calendar, BookOpen, CheckCircle,
  Sparkles, Zap, Heart, ExternalLink, X, ChevronDown,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSiteSettings, logoSrc } from "@/hooks/useSiteSettings";
import { getProductImageSrc } from "@/lib/imageUrl";

const GREEN  = "#5FA800";
const ORANGE = "#F58300";
const VOID   = "#020617";
const DEEP   = "#071018";

/* ─── Premium config (admin JSON: footer_settings.premium_config) ─── */
type PremiumCfg = {
  newsletterHeadline?: string;
  newsletterSub?: string;
  aiTipsEnabled?: boolean;
  showNewsletter?: boolean;
  showInstagram?: boolean;
  tagline?: string;
  rotatingLines?: string[];
  healthTips?: string[];
  instagramUrls?: string[];
  stickyCtaLabel?: string;
  stickyCtaHref?: string;
};

const DEFAULT_ROTATING = [
  "Flash sales · limited batches",
  "AI-curated picks for immunity & energy",
  "Trending dry fruits this week",
  "Seasonal harvest · freshest stock",
  "Smart picks for fitness & focus",
];

const DEFAULT_HEALTH = [
  "Walnuts for omega-3 brain support",
  "Dates & figs — natural fibre boost",
  "Almonds: clean protein, anytime snack",
  "Cashews: creamy energy without the crash",
];

function parsePremium(raw: string | null | undefined): PremiumCfg {
  if (!raw || typeof raw !== "string") return {};
  try {
    const o = JSON.parse(raw) as unknown;
    return typeof o === "object" && o != null ? (o as PremiumCfg) : {};
  } catch {
    return {};
  }
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.77a4.85 4.85 0 0 1-1.01-.08z" />
    </svg>
  );
}
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}
function AppStoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}
function PlayStoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.18 23.76c.3.17.64.24.99.2L14.9 12 3.18.04C2.83 0 2.5.07 2.2.24 1.6.57 1.2 1.21 1.2 2v20c0 .79.4 1.43 1 1.76zm5.42-14.44l2.25-2.25 7.78 4.46-2.26 2.26-7.77-4.47zm-1.54-.88L14.19 5.2l1.78 1.77-8.91 5.12V8.44zm0 7.12V13.4l8.91 5.12-1.78 1.77-7.13-4.23zm2.3 1.32l7.77-4.47 2.26 2.26-7.78 4.46-2.25-2.25z" />
    </svg>
  );
}
function VisaIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-6 w-auto" fill="none">
      <rect width="48" height="48" rx="6" fill="#1A1F71" />
      <text x="7" y="31" fontFamily="Arial" fontWeight="bold" fontSize="18" fill="white">VISA</text>
    </svg>
  );
}
function MasterCardIcon() {
  return (
    <svg viewBox="0 0 48 32" className="h-6 w-auto">
      <rect width="48" height="32" rx="4" fill="#252525" />
      <circle cx="18" cy="16" r="10" fill="#EB001B" />
      <circle cx="30" cy="16" r="10" fill="#F79E1B" />
      <path d="M24 7.7a10 10 0 010 16.6A10 10 0 0124 7.7z" fill="#FF5F00" />
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

const FALLBACK_MENUS = [
  { id: -1, title: "Shop", items: [
    { label: "All Products",    linkValue: "/products",                  openInNewTab: false },
    { label: "Categories",      linkValue: "/categories",                openInNewTab: false },
    { label: "New Arrivals",    linkValue: "/products?sortBy=newest",    openInNewTab: false },
    { label: "Best Sellers",    linkValue: "/products?sortBy=popular",   openInNewTab: false },
    { label: "Deals & Offers",  linkValue: "/products?featured=true",    openInNewTab: false },
  ]},
  { id: -2, title: "Customer", items: [
    { label: "Login",           linkValue: "/login",                     openInNewTab: false },
    { label: "Register",        linkValue: "/register",                  openInNewTab: false },
    { label: "My Orders",       linkValue: "/account",                   openInNewTab: false },
    { label: "Wishlist",        linkValue: "/wishlist",                  openInNewTab: false },
    { label: "Wallet",          linkValue: "/account?tab=wallet",        openInNewTab: false },
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
  { icon: Package, label: "Cash on Delivery",   sub: "Nationwide" },
  { icon: Clock,   label: "Fast Dispatch",      sub: "Same day · Lahore" },
];

function FooterLinkItem({ label, linkValue, openInNewTab }: { label: string; linkValue: string; openInNewTab?: boolean }) {
  const cls =
    "kdf-flink group flex items-center gap-2 text-sm text-slate-400 transition-colors duration-200 hover:text-white py-1.5 rounded-lg px-1 -mx-1 hover:bg-white/[0.04]";
  const inner = (
    <>
      <ChevronRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 flex-shrink-0" style={{ color: GREEN }} />
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

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fn = () => setReduced(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduced;
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
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-36 sm:bottom-28 right-4 z-[450] flex h-11 w-11 items-center justify-center rounded-full text-white shadow-[0_8px_32px_rgba(95,168,0,0.35)] ring-1 ring-white/10 transition-transform duration-200 hover:scale-105 active:scale-95 motion-reduce:transition-none"
      style={{ background: `linear-gradient(145deg, ${GREEN}, #2d5a00)` }}
      aria-label="Scroll to top"
    >
      <ChevronUp className="w-5 h-5" />
    </button>
  );
}

function NewsletterBand({
  premium,
  email,
  setEmail,
  subState,
  onSubmit,
}: {
  premium: PremiumCfg;
  email: string;
  setEmail: (s: string) => void;
  subState: "idle" | "loading" | "done" | "error";
  onSubmit: (e: React.FormEvent) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const bandRef = useRef<HTMLDivElement>(null);
  const [lineIdx, setLineIdx] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);

  const rotating = useMemo(() => {
    const custom = (premium.rotatingLines ?? []).filter(Boolean);
    const merged = [...custom, ...DEFAULT_ROTATING];
    return Array.from(new Set(merged)).slice(0, 8);
  }, [premium.rotatingLines]);

  const tips = useMemo(() => {
    const custom = (premium.healthTips ?? []).filter(Boolean);
    return [...custom, ...DEFAULT_HEALTH].slice(0, 6);
  }, [premium.healthTips]);

  useEffect(() => {
    if (reduced || rotating.length <= 1) return;
    const t = setInterval(() => setLineIdx(i => (i + 1) % rotating.length), 4200);
    return () => clearInterval(t);
  }, [reduced, rotating.length]);

  useEffect(() => {
    if (reduced || !premium.aiTipsEnabled || tips.length <= 1) return;
    const t = setInterval(() => setTipIdx(i => (i + 1) % tips.length), 5300);
    return () => clearInterval(t);
  }, [reduced, premium.aiTipsEnabled, tips.length]);

  const onMove = useCallback((e: React.MouseEvent) => {
    const el = bandRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fx = (e.clientX - r.left) / Math.max(1, r.width);
    const fy = (e.clientY - r.top) / Math.max(1, r.height);
    el.style.setProperty("--fx", String(fx));
    el.style.setProperty("--fy", String(fy));
  }, []);

  const headline = premium.newsletterHeadline ?? "Get Exclusive Deals & AI Recommended Healthy Products";
  const sub = premium.newsletterSub ?? "Flash sales, seasonal picks, and curated wellness tips — zero spam.";

  return (
    <section
      ref={bandRef}
      onMouseMove={onMove}
      className="kdf-nl-band relative isolate mt-16 overflow-hidden border-y border-white/[0.06]"
      style={{
        background: `linear-gradient(135deg, ${VOID} 0%, ${DEEP} 45%, #0a1628 100%)`,
        ["--fx" as string]: "0.5",
        ["--fy" as string]: "0.35",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-90 motion-reduce:opacity-40"
        style={{
          background: `radial-gradient(ellipse 80% 60% at calc(var(--fx, 0.5) * 100%) calc(var(--fy, 0.35) * 100%), ${GREEN}22, transparent 55%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay motion-reduce:hidden"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      {!reduced && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {["🥜", "🌰", "🍇", "🌴", "✨", "🍯"].map((emoji, i) => (
            <span
              key={i}
              className="kdf-float-emoji absolute text-lg opacity-[0.12] motion-reduce:animate-none"
              style={{ left: `${8 + i * 15}%`, top: `${20 + (i % 3) * 18}%`, animationDelay: `${i * 0.7}s` }}
              aria-hidden
            >
              {emoji}
            </span>
          ))}
        </div>
      )}

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">
              <Sparkles className="h-3 w-3" style={{ color: ORANGE }} aria-hidden />
              Intelligence layer
            </p>
            <h2 className="text-balance text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-[2rem] lg:leading-[1.15]">
              {headline}
            </h2>
            <p className="mt-3 max-w-lg text-pretty text-sm leading-relaxed text-slate-400 sm:text-base">{sub}</p>

            <div className="mt-5 min-h-[1.5rem] text-sm font-medium text-slate-200/90">
              <span className="inline-flex items-center gap-2 text-[#7fe045]">
                <Zap className="h-4 w-4 shrink-0 motion-reduce:animate-none kdf-pulse-glow" aria-hidden />
                <span key={lineIdx} className="motion-reduce:animate-none kdf-fade-up">
                  {rotating[lineIdx % rotating.length]}
                </span>
              </span>
            </div>

            {premium.aiTipsEnabled !== false && (
              <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 backdrop-blur-md">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Health tip</p>
                <p key={tipIdx} className="mt-1 text-xs leading-relaxed text-slate-300 motion-reduce:animate-none kdf-fade-up">
                  {tips[tipIdx % tips.length]}
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-6">
            {subState === "done" ? (
              <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-5 backdrop-blur-xl">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 ring-1 ring-emerald-400/30">
                  <CheckCircle className="h-6 w-6 text-emerald-300" />
                </div>
                <div>
                  <p className="font-bold text-white">You&apos;re in.</p>
                  <p className="text-xs text-slate-400">Watch your inbox for member-only drops.</p>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-3">
                <div className="relative rounded-2xl border border-white/[0.12] bg-white/[0.06] p-1 shadow-[0_0_0_1px_rgba(95,168,0,0.08)] backdrop-blur-xl ring-1 ring-[#5FA800]/15 transition-shadow duration-300 focus-within:ring-[#5FA800]/35 focus-within:shadow-[0_0_40px_-12px_rgba(95,168,0,0.45)]">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <div className="relative flex-1">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@email.com"
                        required
                        className="w-full rounded-xl border border-transparent bg-[#0b1220]/80 py-3.5 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#5FA800]/40"
                        autoComplete="email"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={subState === "loading"}
                      className="group relative flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-xl px-7 py-3.5 text-sm font-black text-white shadow-[0_12px_40px_rgba(245,131,0,0.25)] transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 sm:min-w-[160px] motion-reduce:transition-none"
                      style={{ background: `linear-gradient(135deg, ${ORANGE}, #c45f00)` }}
                    >
                      <span className="pointer-events-none absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-[100%] motion-reduce:hidden" />
                      {subState === "loading" ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        <>
                          Subscribe
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <p className="text-center text-[10px] text-slate-600 sm:text-left">
                  By subscribing you agree to our{" "}
                  <Link href="/policies/privacy-policy" className="underline decoration-slate-600 underline-offset-2 hover:text-slate-400">Privacy Policy</Link>.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function BlogCardLux({ post }: { post: Record<string, unknown> }) {
  const imgRaw = (post.featuredImagePath ?? post.featured_image_path) as string | undefined;
  const imgSrc = imgRaw ? getProductImageSrc(imgRaw, { maxWidth: 400 }) : null;
  const created = (post.createdAt ?? post.created_at) as string | undefined;
  const formattedDate = created
    ? new Date(created).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const excerpt = (post.excerpt as string) || String(post.content ?? "").replace(/<[^>]+>/g, "").slice(0, 100);
  const tags = String(post.tags ?? "");
  const badge = tags.split(",").map(t => t.trim()).filter(Boolean)[0] ?? "Journal";

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] ring-1 ring-transparent transition-all duration-300 hover:-translate-y-1 hover:border-[#5FA800]/25 hover:ring-[#5FA800]/20 hover:shadow-[0_20px_50px_-24px_rgba(95,168,0,0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-900/80">
        {imgSrc ? (
          <img src={imgSrc} alt={String(post.title)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100" loading="lazy" decoding="async" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
            <BookOpen className="h-10 w-10 text-slate-600" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent opacity-80" />
        <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90 backdrop-blur-md">
          {badge}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h4 className="line-clamp-2 text-sm font-bold leading-snug text-white group-hover:text-[#a8e063] transition-colors">
          {String(post.title)}
        </h4>
        {excerpt ? <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">{excerpt}</p> : null}
        <div className="mt-auto flex items-center justify-between pt-3">
          {formattedDate ? (
            <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
              <Calendar className="h-3 w-3" />{formattedDate}
            </span>
          ) : <span />}
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: GREEN }}>Read</span>
        </div>
      </div>
    </Link>
  );
}

export function Footer() {
  const [email, setEmail]         = useState("");
  const [subState, setSubState]   = useState<"idle" | "loading" | "done" | "error">("idle");
  const [qrError, setQrError]     = useState(false);
  const [lightbox, setLightbox]  = useState<string | null>(null);
  const { data: siteSettings }    = useSiteSettings();
  const reduced = usePrefersReducedMotion();

  const { data: footerData } = useQuery<Record<string, unknown>>({
    queryKey: ["/api/footer"],
    queryFn: () => fetch("/api/footer").then(r => r.ok ? r.json() : null),
    staleTime: 5 * 60 * 1000,
  });

  const { data: blogData } = useQuery<{ posts?: Record<string, unknown>[] } | null>({
    queryKey: ["/api/blog-posts-footer-v2"],
    queryFn: () => fetch("/api/blog-posts?limit=4&status=published").then(r => r.ok ? r.json() : null),
    staleTime: 10 * 60 * 1000,
  });

  const siteName    = siteSettings?.siteName ?? "KDF NUTS";
  const logoUrl     = logoSrc(siteSettings?.logoPath);
  const settings    = footerData?.settings as Record<string, unknown> | undefined;
  const premium     = useMemo(
    () => parsePremium((settings?.premiumConfig ?? settings?.premium_config) as string | undefined),
    [settings?.premiumConfig, settings?.premium_config],
  );
  const menus       = ((footerData?.menus as unknown[])?.length ? footerData?.menus : FALLBACK_MENUS) as typeof FALLBACK_MENUS;
  const socialLinks = (footerData?.socialLinks ?? []) as Record<string, unknown>[];
  const appLinks    = footerData?.appLinks as Record<string, unknown> | null | undefined;
  const policies    = (footerData?.policies ?? []) as { id: number; title: string; slug: string }[];
  const blogPosts   = blogData?.posts ?? [];
  const showApp     = !appLinks || appLinks.isActive !== false;
  const showNews    = premium.showNewsletter !== false;
  const showInsta   = premium.showInstagram !== false && (premium.instagramUrls?.length ?? 0) > 0;

  const description = (settings?.description as string) || "Premium dry fruits & nuts — sourced with care, delivered fresh across Pakistan.";
  const address       = (settings?.address as string) || "Lahore, Pakistan";
  const phone         = (settings?.phone as string) || "+92 304 999 6000";
  const emailAddr     = (settings?.email as string) || "support@kdfnuts.com";
  const copyright     = (settings?.copyrightText as string) || `© ${new Date().getFullYear()} ${siteName}. Crafted for wellness & taste.`;
  const tagline       = premium.tagline ?? "Nature refined. Nutrition elevated.";

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubState("loading");
    try {
      const res = await fetch("/api/newsletter-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setSubState("done");
        setEmail("");
        return;
      }
    } catch {
      /* network */
    }
    await new Promise(r => setTimeout(r, 500));
    setSubState("done");
    setEmail("");
  };

  const stickyLabel = premium.stickyCtaLabel ?? "Shop bestsellers";
  const stickyHref  = premium.stickyCtaHref ?? "/products?sortBy=popular";

  const qrSrc = (appLinks?.qrImagePath as string | undefined)?.trim()
    ? ((appLinks!.qrImagePath as string).startsWith("http")
        ? (appLinks!.qrImagePath as string)
        : getProductImageSrc(appLinks!.qrImagePath as string, { maxWidth: 320 }))
    : "/api/whatsapp/qr";

  return (
    <>
      <ScrollToTop />

      {showNews && (
        <NewsletterBand
          premium={premium}
          email={email}
          setEmail={setEmail}
          subState={subState}
          onSubmit={handleSubscribe}
        />
      )}

      <footer className="relative border-t border-white/[0.06] bg-[#020617] text-slate-300" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}>
        {/* trust strip */}
        <div className="border-b border-white/[0.05] bg-[#030b14]">
          <div className="mx-auto flex max-w-7xl gap-3 overflow-x-auto px-4 py-4 sm:px-6 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TRUST_BADGES.map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex min-w-[200px] shrink-0 items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 backdrop-blur-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-[#5FA800]/25" style={{ background: `${GREEN}18` }}>
                  <Icon className="h-4 w-4" style={{ color: GREEN }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white">{label}</p>
                  <p className="text-[10px] text-slate-500">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          {/* Brand + columns */}
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img src={logoUrl} alt={siteName} className="h-11 w-auto max-w-[140px] object-contain brightness-110" loading="lazy" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl font-black text-white shadow-lg ring-1 ring-white/10" style={{ background: `linear-gradient(145deg, ${GREEN}, #2d5a00)` }}>
                    K
                  </div>
                )}
                <div>
                  <span className="text-lg font-black tracking-tight text-white">{siteName}</span>
                  <p className="kdf-tagline text-xs font-medium text-slate-500">{tagline}</p>
                </div>
              </div>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-400">{description}</p>

              <ul className="mt-6 space-y-3">
                <li className="flex gap-3 text-sm">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06]">
                    <MapPin className="h-3.5 w-3.5" style={{ color: GREEN }} />
                  </span>
                  <span className="leading-snug text-slate-400">{address}</span>
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06]">
                    <Phone className="h-3.5 w-3.5" style={{ color: GREEN }} />
                  </span>
                  <a href={`tel:${phone.replace(/\s/g, "")}`} className="text-slate-400 transition-colors hover:text-white">{phone}</a>
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06]">
                    <Mail className="h-3.5 w-3.5" style={{ color: GREEN }} />
                  </span>
                  <a href={`mailto:${emailAddr}`} className="text-slate-400 transition-colors hover:text-white">{emailAddr}</a>
                </li>
                <li className="flex gap-3 text-sm text-slate-500">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06]">
                    <Clock className="h-3.5 w-3.5" style={{ color: GREEN }} />
                  </span>
                  <span className="leading-snug">Live care Mon–Sat 9–8 · Sun 11–6</span>
                </li>
              </ul>

              <a
                href={`https://wa.me/${phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_24px_-8px_rgba(37,211,102,0.5)] transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none"
              >
                <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                WhatsApp us
              </a>

              <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Social</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {socialLinks.length > 0 ? (
                  socialLinks.map((s) => {
                    const key = String(s.icon ?? "link").toLowerCase();
                    const Icon = SOCIAL_ICON_MAP[key] ?? ExternalLink;
                    const col  = SOCIAL_COLORS[key] ?? { bg: "#222", hover: "#555", color: "#94a3b8" };
                    return (
                      <a
                        key={String(s.id)}
                        href={String(s.url)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={String(s.platform)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-400 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#5FA800]/30 hover:text-white hover:shadow-[0_0_20px_-6px_rgba(95,168,0,0.45)] motion-reduce:hover:translate-y-0"
                        style={{ color: col.color }}
                      >
                        <Icon className="h-4 w-4" />
                      </a>
                    );
                  })
                ) : (
                  [Facebook, Instagram, TikTokIcon, Youtube].map((Icon, i) => (
                    <span
                      key={i}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-slate-600"
                      aria-hidden
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Desktop link columns */}
            <div className="hidden lg:col-span-5 lg:block">
              <div className="grid grid-cols-3 gap-8">
                {menus.map(menu => (
                  <div key={menu.id}>
                    <h3 className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      <span className="h-px w-6 rounded-full" style={{ background: `linear-gradient(90deg, ${GREEN}, transparent)` }} />
                      {menu.title}
                    </h3>
                    <ul className="space-y-0.5">
                      {(menu.items ?? []).map(item => (
                        <FooterLinkItem key={item.label + item.linkValue} {...item} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile accordions */}
            <div className="space-y-2 lg:col-span-5 lg:hidden">
              {menus.map(menu => (
                <details key={menu.id} className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 open:bg-white/[0.04]">
                  <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm font-bold text-white [&::-webkit-details-marker]:hidden">
                    {menu.title}
                    <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" />
                  </summary>
                  <ul className="border-t border-white/[0.06] pb-3 pt-1">
                    {(menu.items ?? []).map(item => (
                      <FooterLinkItem key={item.label + item.linkValue} {...item} />
                    ))}
                  </ul>
                </details>
              ))}
            </div>

            <div className="space-y-8 lg:col-span-3">
              {blogPosts.length > 0 && (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Journal</h3>
                    <Link href="/blog" className="group inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider transition-colors hover:text-white" style={{ color: GREEN }}>
                      View all
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    {blogPosts.slice(0, 4).map(post => (
                      <BlogCardLux key={String(post.id)} post={post} />
                    ))}
                  </div>
                </div>
              )}

              {showInsta && (
                <div>
                  <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Gallery</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {(premium.instagramUrls ?? []).slice(0, 6).map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setLightbox(url)}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-white/[0.08] ring-1 ring-transparent transition-all duration-300 hover:ring-[#5FA800]/40"
                      >
                        <img src={url} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 motion-reduce:group-hover:scale-100" loading="lazy" />
                        <span className="pointer-events-none absolute inset-0 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!qrError && (
                <div className="rounded-2xl border border-[#25D366]/20 bg-gradient-to-br from-[#25D366]/10 to-transparent p-4">
                  <div className="flex gap-4">
                    <div className={`relative shrink-0 rounded-xl bg-white p-2 shadow-lg ring-1 ring-black/5 ${reduced ? "" : "kdf-qr-pulse"}`}>
                      <img src={qrSrc} alt="Scan QR" className="h-16 w-16 rounded-lg" loading="lazy" onError={() => setQrError(true)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">Instant WhatsApp</p>
                      <p className="mt-1 text-xs text-slate-500">Scan or tap — human team, real answers.</p>
                      <a href={`https://wa.me/${phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-bold text-[#4ade80] hover:underline">
                        Open chat <ExternalLink className="ml-1 inline h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {showApp && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur-md">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Apps</h3>
                    {(appLinks?.downloadCountLabel as string)?.trim() ? (
                      <span className="rounded-full border border-[#5FA800]/30 bg-[#5FA800]/10 px-2 py-0.5 text-[10px] font-bold text-[#b6f076]">
                        {String(appLinks?.downloadCountLabel)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <a
                      href={String(appLinks?.androidLink || "#")}
                      target={appLinks?.androidLink ? "_blank" : undefined}
                      rel="noreferrer"
                      className="group flex flex-1 items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0b1220] px-3 py-3 transition-all duration-200 hover:border-[#5FA800]/35 hover:shadow-[0_0_24px_-10px_rgba(95,168,0,0.35)]"
                    >
                      <PlayStoreIcon className="h-6 w-6 shrink-0 text-white" />
                      <div className="leading-tight">
                        <p className="text-[9px] uppercase tracking-wider text-slate-500">Get it on</p>
                        <p className="text-sm font-bold text-white">{(appLinks?.androidLabel as string) || "Google Play"}</p>
                      </div>
                      <ArrowRight className="ml-auto h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-[#5FA800]" />
                    </a>
                    <a
                      href={String(appLinks?.iosLink || "#")}
                      target={appLinks?.iosLink ? "_blank" : undefined}
                      rel="noreferrer"
                      className="group flex flex-1 items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0b1220] px-3 py-3 transition-all duration-200 hover:border-[#5FA800]/35 hover:shadow-[0_0_24px_-10px_rgba(95,168,0,0.35)]"
                    >
                      <AppStoreIcon className="h-6 w-6 shrink-0 text-white" />
                      <div className="leading-tight">
                        <p className="text-[9px] uppercase tracking-wider text-slate-500">Download on</p>
                        <p className="text-sm font-bold text-white">{(appLinks?.iosLabel as string) || "App Store"}</p>
                      </div>
                      <ArrowRight className="ml-auto h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-[#5FA800]" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* bottom */}
        <div className="border-t border-white/[0.06] bg-[#010409]">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
            <p className="order-2 text-center text-xs text-slate-600 sm:order-1 sm:text-left">{copyright}</p>
            <div className="order-1 flex flex-wrap items-center justify-center gap-2 sm:order-2">
              <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-slate-600 sm:inline">We accept</span>
              <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1 ring-1 ring-white/[0.06]"><VisaIcon /></div>
              <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1 ring-1 ring-white/[0.06]"><MasterCardIcon /></div>
              <span className="rounded-md px-2 py-1 text-[10px] font-bold" style={{ background: `${GREEN}22`, color: GREEN }}>COD</span>
            </div>
            <div className="order-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-600">
              {policies.length > 0 ? (
                policies.map((p, i) => (
                  <span key={p.id} className="inline-flex items-center gap-3">
                    {i > 0 ? <span className="text-slate-800">·</span> : null}
                    <Link href={`/policies/${p.slug}`} className="transition-colors hover:text-white">{p.title}</Link>
                  </span>
                ))
              ) : (
                <>
                  <Link href="/policies/privacy-policy" className="hover:text-white">Privacy</Link>
                  <span className="text-slate-800">·</span>
                  <Link href="/policies/terms-and-conditions" className="hover:text-white">Terms</Link>
                  <span className="text-slate-800">·</span>
                  <Link href="/policies/refund-policy" className="hover:text-white">Refund</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-[440] flex border-t border-white/[0.08] bg-[#020617]/95 px-3 py-2.5 backdrop-blur-xl sm:hidden">
        <Link href={stickyHref} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black text-white shadow-[0_0_24px_-8px_rgba(95,168,0,0.5)]" style={{ background: `linear-gradient(135deg, ${GREEN}, #2d5a00)` }}>
          <Heart className="h-4 w-4" />
          {stickyLabel}
        </Link>
      </div>
      <div className="h-[52px] sm:hidden" aria-hidden />

      {lightbox && (
        <button
          type="button"
          className="fixed inset-0 z-[600] flex cursor-default items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          aria-label="Close image preview"
        >
          <span className="absolute right-4 top-4 cursor-pointer rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={e => { e.stopPropagation(); setLightbox(null); }}><X className="h-5 w-5" /></span>
          <img src={lightbox} alt="" className="max-h-[85vh] max-w-full cursor-default rounded-2xl object-contain shadow-2xl ring-1 ring-white/10" onClick={e => e.stopPropagation()} />
        </button>
      )}

      <style>{`
        @keyframes kdf-float-emoji {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(6deg); }
        }
        .kdf-float-emoji { animation: kdf-float-emoji 7s ease-in-out infinite; }
        @keyframes kdf-fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .kdf-fade-up { animation: kdf-fade-up 0.45s ease-out both; }
        @keyframes kdf-pulse-glow {
          0%, 100% { filter: drop-shadow(0 0 0 transparent); }
          50% { filter: drop-shadow(0 0 6px rgba(95,168,0,0.55)); }
        }
        .kdf-pulse-glow { animation: kdf-pulse-glow 2.8s ease-in-out infinite; }
        @keyframes kdf-qr-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37,211,102,0.25); }
          50% { box-shadow: 0 0 0 10px rgba(37,211,102,0); }
        }
        .kdf-qr-pulse { animation: kdf-qr-pulse 2.5s ease-out infinite; }
        @keyframes kdf-tagline-shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .kdf-tagline {
          background: linear-gradient(90deg, #64748b, #94a3b8, #64748b);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: kdf-tagline-shimmer 8s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .kdf-float-emoji, .kdf-fade-up, .kdf-pulse-glow, .kdf-qr-pulse, .kdf-tagline { animation: none !important; }
        }
      `}</style>
    </>
  );
}
