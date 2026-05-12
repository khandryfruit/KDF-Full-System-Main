import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Search, Zap, ShoppingBag, Globe, ArrowRight, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, TrendingUp, FileText,
  Link2, Image, Rss, BarChart2, Settings, Bot, ExternalLink,
  Clock, Database, Shield, Map,
} from "lucide-react";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const H = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch(url: string) {
  const r = await fetch(url, { headers: H() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

interface Dashboard {
  indexing: {
    configured: boolean;
    autoEnabled: boolean;
    siteUrl: string | null;
    recentLogs: any[];
    stats7d: { status: string; count: number }[];
  };
  merchant: { enabled: boolean; brand: string | null; storeUrl: string | null; lastSync: string | null };
  seo: { sitemapEnabled: boolean; canonicalDomain: string | null; hasGtm: boolean; hasGa4: boolean; hasOrg: boolean };
  content: { products: number; blogs: number; redirects: number; productsWithSeo: number; productsWithoutSeo: number };
  feeds: { googleXml: string; facebookJson: string; rss: string; sitemapIndex: string; sitemapImages: string };
}

function StatusDot({ ok, warn }: { ok?: boolean; warn?: boolean }) {
  if (ok) return <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5" />;
  if (warn) return <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" />;
}

function StatCard({ icon: Icon, label, value, sub, color = "blue", href }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string; href?: string;
}) {
  const [, nav] = useLocation();
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-green-50 text-green-600 border-green-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
  };
  return (
    <div
      className={`bg-white border rounded-xl p-4 ${href ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
      onClick={() => href && nav(href)}
    >
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg border ${colors[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
        {href && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm font-medium mt-0.5">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function StatusCard({ title, icon: Icon, checks }: {
  title: string; icon: any;
  checks: { label: string; ok: boolean; warn?: boolean; detail?: string }[];
}) {
  return (
    <div className="bg-white border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="space-y-2.5">
        {checks.map((c, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1.5">
              {c.ok ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
              ) : c.warn ? (
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
              )}
              <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
            </div>
            {c.detail && <span className="text-xs text-muted-foreground">{c.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedLink({ label, url, icon: Icon }: { label: string; url: string; icon: any }) {
  const fullUrl = window.location.origin + url;
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => navigator.clipboard.writeText(fullUrl)}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 border rounded transition-colors"
        >
          Copy
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:text-blue-700 px-2 py-0.5 border border-blue-200 rounded bg-blue-50 transition-colors flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          Open
        </a>
      </div>
    </div>
  );
}

export default function SEODashboardPage() {
  const [, nav] = useLocation();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const d = await apiFetch("/api/admin/seo/dashboard");
      setData(d);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  function refresh() { setRefreshing(true); load(); }

  const seoScore = (() => {
    if (!data) return 0;
    let score = 0;
    if (data.indexing.configured) score += 20;
    if (data.indexing.autoEnabled) score += 10;
    if (data.merchant.enabled) score += 15;
    if (data.seo.sitemapEnabled) score += 10;
    if (data.seo.hasGtm || data.seo.hasGa4) score += 10;
    if (data.seo.hasOrg) score += 10;
    if (data.seo.canonicalDomain) score += 5;
    const seoRatio = data.content.products > 0
      ? data.content.productsWithSeo / data.content.products
      : 0;
    score += Math.round(seoRatio * 20);
    return Math.min(score, 100);
  })();

  const scoreColor = seoScore >= 80 ? "text-green-600" : seoScore >= 50 ? "text-amber-600" : "text-red-600";
  const scoreBg = seoScore >= 80 ? "bg-green-50" : seoScore >= 50 ? "bg-amber-50" : "bg-red-50";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-green-600" />
            SEO Command Center
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Enterprise SEO dashboard — indexing, merchant feeds, schemas, and AI tools
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-muted transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* SEO Score */}
      <div className={`${scoreBg} border rounded-xl p-5 flex items-center justify-between`}>
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-1">Overall SEO Health Score</div>
          <div className={`text-4xl font-bold ${scoreColor}`}>{seoScore}<span className="text-xl">/100</span></div>
          <div className="text-xs text-muted-foreground mt-1">
            {seoScore >= 80 ? "Excellent — Your SEO is enterprise-ready" :
             seoScore >= 50 ? "Good — A few improvements will boost rankings" :
             "Needs attention — Set up indexing, merchant feeds, and schemas"}
          </div>
        </div>
        <div className="relative w-24 h-24">
          <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none"
              stroke={seoScore >= 80 ? "#16a34a" : seoScore >= 50 ? "#d97706" : "#dc2626"}
              strokeWidth="3"
              strokeDasharray={`${seoScore} ${100 - seoScore}`}
              strokeLinecap="round" />
          </svg>
          <div className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${scoreColor}`}>
            {seoScore}%
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Live Products" value={data?.content.products ?? 0} color="blue" href="/products" />
        <StatCard icon={Search} label="SEO Optimized" value={data?.content.productsWithSeo ?? 0}
          sub={`${data?.content.productsWithoutSeo ?? 0} need SEO`} color="green" />
        <StatCard icon={FileText} label="Blog Posts" value={data?.content.blogs ?? 0} color="purple" href="/blog" />
        <StatCard icon={Link2} label="Active Redirects" value={data?.content.redirects ?? 0} color="amber" href="/seo/redirects" />
      </div>

      {/* Main Grid */}
      <div className="grid md:grid-cols-2 gap-5">
        {/* Indexing Status */}
        <StatusCard title="Google Fast Indexing" icon={Zap} checks={[
          { label: "Service Account Connected", ok: data?.indexing.configured ?? false },
          { label: "Auto-indexing on save", ok: data?.indexing.autoEnabled ?? false },
          { label: "Site URL configured", ok: !!data?.indexing.siteUrl, detail: data?.indexing.siteUrl ?? "Not set" },
          {
            label: "7-day index success",
            ok: (data?.indexing.stats7d.find(s => s.status === "success")?.count ?? 0) > 0,
            detail: `${data?.indexing.stats7d.find(s => s.status === "success")?.count ?? 0} URLs`
          },
        ]} />

        {/* Merchant Status */}
        <StatusCard title="Google Merchant Center" icon={ShoppingBag} checks={[
          { label: "Feed enabled", ok: data?.merchant.enabled ?? false },
          { label: "Brand configured", ok: !!data?.merchant.brand, detail: data?.merchant.brand ?? "Not set" },
          { label: "Store URL set", ok: !!data?.merchant.storeUrl },
          { label: "XML Feed accessible", ok: data?.merchant.enabled ?? false, detail: "/api/feeds/google-merchant.xml" },
        ]} />

        {/* Technical SEO */}
        <StatusCard title="Technical SEO" icon={Settings} checks={[
          { label: "Sitemap enabled", ok: data?.seo.sitemapEnabled ?? false },
          { label: "Canonical domain set", ok: !!data?.seo.canonicalDomain, detail: data?.seo.canonicalDomain ?? "Not set" },
          { label: "Google Analytics (GA4)", ok: data?.seo.hasGa4 ?? false },
          { label: "Google Tag Manager", ok: data?.seo.hasGtm ?? false },
        ]} />

        {/* Schema Status */}
        <StatusCard title="Schema.org & AI" icon={Bot} checks={[
          { label: "Organization schema", ok: data?.seo.hasOrg ?? false },
          { label: "AI SEO generator ready", ok: true, detail: "OpenAI integrated" },
          { label: "Product schema (SSR)", ok: true },
          { label: "FAQ schema support", ok: true },
        ]} />
      </div>

      {/* Feeds & Sitemaps */}
      <div className="bg-white border rounded-xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          Live Feeds & Sitemaps
        </h3>
        <div className="grid md:grid-cols-2 gap-x-8">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Sitemaps</div>
            <FeedLink label="Sitemap Index (master)" url="/sitemap-index.xml" icon={Map} />
            <FeedLink label="Main Sitemap" url="/sitemap.xml" icon={Globe} />
            <FeedLink label="Image Sitemap" url="/sitemap-images.xml" icon={Image} />
            <FeedLink label="News Sitemap" url="/sitemap-news.xml" icon={FileText} />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Product Feeds</div>
            <FeedLink label="Google Merchant XML" url="/api/feeds/google-merchant.xml" icon={ShoppingBag} />
            <FeedLink label="Facebook Catalog JSON" url="/api/feeds/facebook-catalog.json" icon={Globe} />
            <FeedLink label="RSS Blog Feed" url="/api/feeds/rss.xml" icon={Rss} />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Fast Indexing", icon: Zap, href: "/seo/fast-indexing", color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
            { label: "Merchant Center", icon: ShoppingBag, href: "/seo/merchant-center", color: "text-blue-600 bg-blue-50 border-blue-200" },
            { label: "Redirects (301)", icon: Link2, href: "/seo/redirects", color: "text-purple-600 bg-purple-50 border-purple-200" },
            { label: "Schema Settings", icon: Database, href: "/seo/schema", color: "text-green-600 bg-green-50 border-green-200" },
            { label: "AI SEO Writer", icon: Bot, href: "/seo/ai-writer", color: "text-rose-600 bg-rose-50 border-rose-200" },
            { label: "SEO Settings", icon: Settings, href: "/seo", color: "text-slate-600 bg-slate-50 border-slate-200" },
            { label: "Blog Posts", icon: FileText, href: "/blog", color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
            { label: "Analytics", icon: BarChart2, href: "/analytics", color: "text-orange-600 bg-orange-50 border-orange-200" },
          ].map(item => (
            <button key={item.href} onClick={() => nav(item.href)}
              className={`flex flex-col items-center gap-2 p-4 border rounded-xl hover:shadow-sm transition-all ${item.color}`}>
              <item.icon className="h-6 w-6" />
              <span className="text-xs font-medium text-center">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Indexing Activity */}
      {data?.indexing.recentLogs && data.indexing.recentLogs.length > 0 && (
        <div className="bg-white border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent Indexing Activity
            </h3>
            <button onClick={() => nav("/seo/fast-indexing")}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-2">
            {data.indexing.recentLogs.map((log: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                {log.status === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : log.status === "pending" ? (
                  <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                )}
                <span className="flex-1 truncate text-muted-foreground">{log.url}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  log.status === "success" ? "bg-green-50 text-green-700" :
                  log.status === "pending" ? "bg-amber-50 text-amber-700" :
                  "bg-red-50 text-red-700"}`}>
                  {log.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
