import { useState } from "react";
import { Link } from "wouter";
import { MapPin, Phone, Mail, Facebook, Instagram, Send, ChevronRight, Youtube, Twitter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSiteSettings, logoSrc } from "@/hooks/useSiteSettings";

/* ─── SVG Icons ──────────────────────────────────────── */
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.77a4.85 4.85 0 0 1-1.01-.08z"/>
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

const SOCIAL_ICON_MAP: Record<string, React.ElementType> = {
  facebook: Facebook,
  instagram: Instagram,
  tiktok: TikTokIcon,
  youtube: Youtube,
  twitter: Twitter,
  twitterx: Twitter,
  whatsapp: Phone,
};

function getSocialIcon(icon: string): React.ElementType {
  return SOCIAL_ICON_MAP[icon?.toLowerCase()] ?? ChevronRight;
}

function FooterLinkList({ items }: { items: { label: string; linkValue: string; openInNewTab?: boolean }[] }) {
  return (
    <ul className="space-y-2 text-sm text-gray-500">
      {items.map(({ label, linkValue, openInNewTab }) => (
        <li key={label + linkValue}>
          {openInNewTab ? (
            <a href={linkValue} target="_blank" rel="noreferrer" className="flex items-center gap-1 group hover:text-[#5FA800] transition-colors">
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />{label}
            </a>
          ) : (
            <Link href={linkValue} className="flex items-center gap-1 group hover:text-[#5FA800] transition-colors">
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />{label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ─── Static fallbacks ─────────────────────────────── */
const FALLBACK_MENUS = [
  { id: -1, title: "Shop", items: [
    { label: "All Products", linkValue: "/products", openInNewTab: false },
    { label: "Categories", linkValue: "/categories", openInNewTab: false },
    { label: "New Arrivals", linkValue: "/products?sortBy=newest", openInNewTab: false },
    { label: "Best Sellers", linkValue: "/products?sortBy=popular", openInNewTab: false },
  ]},
  { id: -2, title: "Account", items: [
    { label: "Login", linkValue: "/login", openInNewTab: false },
    { label: "Register", linkValue: "/register", openInNewTab: false },
    { label: "My Orders", linkValue: "/account", openInNewTab: false },
    { label: "Wallet & Loyalty", linkValue: "/account?tab=wallet", openInNewTab: false },
  ]},
  { id: -3, title: "Support", items: [
    { label: "About Us", linkValue: "/about", openInNewTab: false },
    { label: "FAQ", linkValue: "/faq", openInNewTab: false },
    { label: "Privacy Policy", linkValue: "/policies/privacy-policy", openInNewTab: false },
    { label: "Terms & Conditions", linkValue: "/policies/terms-and-conditions", openInNewTab: false },
  ]},
];

export function Footer() {
  const [email, setEmail]           = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const { data: siteSettings }      = useSiteSettings();

  const { data: footerData } = useQuery<any>({
    queryKey: ["/api/footer"],
    queryFn: () => fetch("/api/footer").then(r => r.ok ? r.json() : null),
    staleTime: 5 * 60 * 1000,
  });

  const siteName     = siteSettings?.siteName ?? "KDF Plus";
  const logoUrl      = logoSrc(siteSettings?.logoPath);
  const settings     = footerData?.settings;
  const menus        = (footerData?.menus?.length ? footerData.menus : FALLBACK_MENUS) as any[];
  const socialLinks  = (footerData?.socialLinks ?? []) as any[];
  const appLinks     = footerData?.appLinks;
  const policies     = (footerData?.policies ?? []) as any[];

  const description  = settings?.description  || "Premium dry fruits delivered fresh to your doorstep across Pakistan.";
  const address      = settings?.address      || "Karachi, Pakistan";
  const phone        = settings?.phone        || "+92 300 123 4567";
  const emailAddr    = settings?.email        || "hello@kdfnuts.com";
  const copyright    = settings?.copyrightText || `© ${new Date().getFullYear()} ${siteName}. All rights reserved.`;
  const showApp      = !appLinks || appLinks.isActive !== false;

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) { setSubscribed(true); setEmail(""); }
  };

  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-16">

      {/* Newsletter Banner */}
      <div style={{ background: "linear-gradient(135deg, #5FA800 0%, #3d7000 100%)" }} className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-white text-center sm:text-left">
              <p className="font-bold text-lg">Get exclusive deals in your inbox</p>
              <p className="text-white/80 text-sm mt-0.5">Join 10,000+ customers. No spam, unsubscribe anytime.</p>
            </div>
            {subscribed ? (
              <div className="flex items-center gap-2 bg-white/20 text-white px-5 py-2.5 rounded-full text-sm font-medium">
                <Send className="w-4 h-4" />You're subscribed!
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex items-center gap-2 w-full sm:w-auto">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Enter your email address" required
                  className="flex-1 sm:w-64 px-4 py-2.5 rounded-l-full rounded-r-none text-sm border-0 outline-none text-gray-800 bg-white shadow-sm" />
                <button type="submit"
                  className="px-5 py-2.5 bg-[#F58300] hover:bg-[#d97000] text-white text-sm font-semibold rounded-r-full rounded-l-none transition-colors whitespace-nowrap">
                  Subscribe
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Brand row */}
        <div className="mb-8 pb-8 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">

            {/* Brand + contact */}
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5 mb-3">
                {logoUrl ? (
                  <img src={logoUrl} alt={siteName} className="h-10 w-auto max-w-[120px] object-contain" />
                ) : (
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0" style={{ backgroundColor: "#5FA800" }}>
                    <span className="text-white font-black text-sm tracking-tight">KDF</span>
                  </div>
                )}
                <span className="font-bold text-xl text-gray-900">{siteName}</span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">{description}</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#5FA800" }} />
                  <span>{address}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4 flex-shrink-0" style={{ color: "#5FA800" }} />
                  <a href={`tel:${phone.replace(/\s/g, "")}`} className="hover:text-gray-800 transition-colors">{phone}</a>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4 flex-shrink-0" style={{ color: "#5FA800" }} />
                  <a href={`mailto:${emailAddr}`} className="hover:text-gray-800 transition-colors">{emailAddr}</a>
                </li>
              </ul>
            </div>

            {/* WhatsApp QR scan */}
            <div id="footer-wa-qr" className="flex-shrink-0">
              <h3 className="font-bold text-gray-900 mb-2 text-xs uppercase tracking-widest">Scan to Chat</h3>
              <div className="p-2 bg-white rounded-xl border border-gray-200 shadow-sm inline-block">
                <img
                  src="/api/whatsapp/qr"
                  alt="WhatsApp QR"
                  className="w-20 h-20 rounded-lg"
                  onError={() => { const el = document.getElementById("footer-wa-qr"); if (el) el.style.display = "none"; }}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">Scan for WhatsApp</p>
            </div>

            {/* Social icons */}
            {socialLinks.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3 sm:mt-1">
                {socialLinks.map((s: any) => {
                  const Icon = getSocialIcon(s.icon);
                  return (
                    <a key={s.id} href={s.url} target="_blank" rel="noreferrer" aria-label={s.platform}
                      className="w-10 h-10 rounded-full bg-gray-100 hover:bg-primary/10 hover:text-primary flex items-center justify-center text-gray-500 transition-colors">
                      <Icon className="w-4 h-4" />
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-3 sm:mt-1">
                <a href="#" aria-label="Facebook" className="w-10 h-10 rounded-full bg-gray-100 hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center text-gray-500 transition-colors"><Facebook className="w-4 h-4" /></a>
                <a href="#" aria-label="Instagram" className="w-10 h-10 rounded-full bg-gray-100 hover:bg-pink-100 hover:text-pink-600 flex items-center justify-center text-gray-500 transition-colors"><Instagram className="w-4 h-4" /></a>
                <a href="#" aria-label="TikTok" className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 hover:text-gray-900 flex items-center justify-center text-gray-500 transition-colors"><TikTokIcon className="w-4 h-4" /></a>
              </div>
            )}
          </div>
        </div>

        {/* Links grid */}
        <div className={`grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-${showApp ? "4" : "3"} gap-8`}>
          {/* Dynamic menus */}
          {menus.map((menu: any) => (
            <div key={menu.id}>
              <h3 className="font-bold text-gray-900 mb-4 text-xs uppercase tracking-widest">{menu.title}</h3>
              <FooterLinkList items={menu.items ?? []} />
            </div>
          ))}

          {/* App Downloads */}
          {showApp && (
            <div>
              <h3 className="font-bold text-gray-900 mb-4 text-xs uppercase tracking-widest">Get the App</h3>
              <p className="text-gray-500 text-xs mb-4 leading-relaxed">Shop on the go — download the {siteName} mobile app.</p>
              <div className="flex flex-col gap-3">
                <a href={appLinks?.androidLink || "#"} target={appLinks?.androidLink ? "_blank" : undefined} rel="noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition-colors">
                  <PlayStoreIcon className="w-5 h-5 flex-shrink-0" />
                  <div className="leading-tight">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Get it on</p>
                    <p className="text-sm font-semibold">Google Play</p>
                  </div>
                </a>
                <a href={appLinks?.iosLink || "#"} target={appLinks?.iosLink ? "_blank" : undefined} rel="noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition-colors">
                  <AppStoreIcon className="w-5 h-5 flex-shrink-0" />
                  <div className="leading-tight">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Download on the</p>
                    <p className="text-sm font-semibold">App Store</p>
                  </div>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-200 mt-10 pt-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-sm text-gray-400">
            <p>{copyright}</p>
            {policies.length > 0 ? (
              <div className="flex flex-wrap justify-center items-center gap-4">
                {policies.map((p: any, i: number) => (
                  <span key={p.id} className="flex items-center gap-4">
                    <Link href={`/policies/${p.slug}`} className="hover:text-[#5FA800] transition-colors">{p.title}</Link>
                    {i < policies.length - 1 && <span className="text-gray-200 hidden sm:inline">|</span>}
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap justify-center items-center gap-4">
                <span className="hover:text-[#5FA800] transition-colors cursor-pointer">Privacy Policy</span>
                <span className="text-gray-200 hidden sm:inline">|</span>
                <span className="hover:text-[#5FA800] transition-colors cursor-pointer">Terms &amp; Conditions</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </footer>
  );
}
