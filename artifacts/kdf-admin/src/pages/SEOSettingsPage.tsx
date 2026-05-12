import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Globe, Search, Map, Shield, ExternalLink, Copy, CheckCircle,
  BarChart2, Tag, Settings, ArrowRight,
} from "lucide-react";
import { useLocation } from "wouter";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const H = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { ...H(), ...(opts?.headers ?? {}) } });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${r.status}`); }
  return r.json();
}

const TAB_IDS = ["search-console", "analytics", "sitemap", "robots"] as const;
type TabId = typeof TAB_IDS[number];

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "search-console", label: "Search Console", icon: Search },
  { id: "analytics",      label: "Analytics & GTM", icon: BarChart2 },
  { id: "sitemap",        label: "Sitemap",          icon: Map },
  { id: "robots",         label: "Robots.txt",       icon: Shield },
];

export default function SEOSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, nav] = useLocation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>("search-console");
  const [copied, setCopied] = useState(false);

  const [googleVerificationCode, setGoogleVerificationCode] = useState("");
  const [robotsTxtContent, setRobotsTxtContent] = useState("User-agent: *\nAllow: /\n\nSitemap: /sitemap-index.xml\nSitemap: /sitemap.xml");
  const [siteNoindex, setSiteNoindex] = useState(false);
  const [sitemapEnabled, setSitemapEnabled] = useState(true);
  const [canonicalDomain, setCanonicalDomain] = useState("");
  const [gtmId, setGtmId] = useState("");
  const [ga4Id, setGa4Id] = useState("");

  useEffect(() => {
    apiFetch("/api/seo-settings")
      .then((s: any) => {
        setGoogleVerificationCode(s.googleVerificationCode ?? s.google_verification_code ?? "");
        setRobotsTxtContent(s.robotsTxtContent ?? s.robots_txt_content ?? "User-agent: *\nAllow: /\n\nSitemap: /sitemap-index.xml\nSitemap: /sitemap.xml");
        setSiteNoindex(s.siteNoindex ?? s.site_noindex ?? false);
        setSitemapEnabled(s.sitemapEnabled ?? s.sitemap_enabled ?? true);
        setCanonicalDomain(s.canonicalDomain ?? s.canonical_domain ?? "");
        setGtmId(s.gtm_id ?? s.gtmId ?? "");
        setGa4Id(s.ga4_id ?? s.ga4Id ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/api/seo-settings", {
        method: "PUT",
        body: JSON.stringify({
          googleVerificationCode: googleVerificationCode || undefined,
          robotsTxtContent,
          siteNoindex,
          sitemapEnabled,
          canonicalDomain: canonicalDomain || undefined,
          gtmId: gtmId || undefined,
          ga4Id: ga4Id || undefined,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["seo-settings"] });
      toast({ title: "SEO settings saved successfully" });
    } catch (err: any) {
      toast({ title: err.message || "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function copyMetaTag() {
    if (!googleVerificationCode) return;
    navigator.clipboard.writeText(`<meta name="google-site-verification" content="${googleVerificationCode}" />`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SEO Settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Search Console verification, Analytics, Sitemap, and Robots.txt configuration
          </p>
        </div>
        <button onClick={() => nav("/seo/dashboard")}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 px-3 py-1.5 border border-blue-200 bg-blue-50 rounded-lg transition-colors">
          SEO Dashboard <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md font-medium transition-colors whitespace-nowrap ${tab === t.id ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Search Console Tab */}
      {tab === "search-console" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-blue-500" />
              Google Search Console
            </CardTitle>
            <CardDescription>
              Verify your site with Google to enable Search Console access and track search performance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gv-code">Google Verification Code</Label>
              <Input
                id="gv-code"
                placeholder="e.g. abc123XYZverificationcode"
                value={googleVerificationCode}
                onChange={(e) => setGoogleVerificationCode(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Found in Google Search Console → Settings → Ownership verification → HTML tag method. Copy only the <strong>content value</strong>, not the entire tag.
              </p>
            </div>
            {googleVerificationCode && (
              <div className="bg-muted rounded-lg p-3 flex items-center justify-between gap-2">
                <code className="text-xs text-muted-foreground break-all">
                  {`<meta name="google-site-verification" content="${googleVerificationCode}" />`}
                </code>
                <Button variant="ghost" size="icon" onClick={copyMetaTag} className="shrink-0">
                  {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs gap-1">
                <Globe className="h-3 w-3" />
                This tag is automatically injected in the website &lt;head&gt;
              </Badge>
            </div>

            {/* Index Control */}
            <div className="pt-4 border-t space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-orange-500" />
                Index Control
              </Label>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Block all search engines (noindex)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sets <code>Disallow: /</code> in robots.txt. Use only for staging/private sites.
                  </p>
                </div>
                <Switch checked={siteNoindex} onCheckedChange={setSiteNoindex} />
              </div>
              {siteNoindex && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700 font-medium">⚠️ Site is currently blocking all search engines</p>
                  <p className="text-xs text-red-600 mt-1">Your site will not appear in Google search results while this is enabled.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analytics & GTM Tab */}
      {tab === "analytics" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-blue-600" />
                Google Tag Manager (GTM)
              </CardTitle>
              <CardDescription>
                GTM is injected in the storefront &lt;head&gt; automatically. Add it once and manage all tags from GTM dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="gtm-id">GTM Container ID</Label>
                <Input
                  id="gtm-id"
                  placeholder="GTM-XXXXXXX"
                  value={gtmId}
                  onChange={(e) => setGtmId(e.target.value.toUpperCase())}
                />
                <p className="text-xs text-muted-foreground">
                  Format: GTM-XXXXXXX. Found in your Google Tag Manager account.
                </p>
              </div>
              {gtmId && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-700 font-medium">✅ GTM active: {gtmId}</p>
                  <p className="text-xs text-green-600 mt-1">Tag Manager is injected automatically on every storefront page load.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-orange-500" />
                Google Analytics 4 (GA4)
              </CardTitle>
              <CardDescription>
                GA4 tracks page views, events, conversions, and e-commerce data. Injected directly if GTM is not used.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="ga4-id">GA4 Measurement ID</Label>
                <Input
                  id="ga4-id"
                  placeholder="G-XXXXXXXXXX"
                  value={ga4Id}
                  onChange={(e) => setGa4Id(e.target.value.toUpperCase())}
                />
                <p className="text-xs text-muted-foreground">
                  Format: G-XXXXXXXXXX. Found in GA4 Admin → Data Streams → Measurement ID.
                </p>
              </div>
              {ga4Id && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-sm text-orange-700 font-medium">✅ GA4 active: {ga4Id}</p>
                  <p className="text-xs text-orange-600 mt-1">Analytics tracking is injected in the storefront &lt;head&gt;.</p>
                </div>
              )}
              {gtmId && ga4Id && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  <strong>Tip:</strong> You have both GTM and GA4 set. If GA4 is already configured inside GTM, remove the GA4 Measurement ID here to avoid double-counting.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <strong>Advanced schemas</strong> (Organization, LocalBusiness, FAQ, Breadcrumb) are configured in{" "}
            <button onClick={() => nav("/seo/schema")} className="underline font-medium">Schema.org Settings</button>.
          </div>
        </div>
      )}

      {/* Sitemap Tab */}
      {tab === "sitemap" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Map className="h-5 w-5 text-green-500" />
              Sitemap Configuration
            </CardTitle>
            <CardDescription>
              Auto-generated sitemaps: main, images, news, and a sitemap index.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Enable Sitemap</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Serve auto-generated <code>/sitemap.xml</code></p>
              </div>
              <Switch checked={sitemapEnabled} onCheckedChange={setSitemapEnabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="canonical">Canonical Domain</Label>
              <Input
                id="canonical"
                placeholder="https://khanbabadryfruits.com"
                value={canonicalDomain}
                onChange={(e) => setCanonicalDomain(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Used as base URL in all sitemaps, schemas, and robots.txt. Leave blank to auto-detect.
              </p>
            </div>
            {sitemapEnabled && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Sitemap Index", url: "/sitemap-index.xml" },
                  { label: "Main Sitemap", url: "/sitemap.xml" },
                  { label: "Image Sitemap", url: "/sitemap-images.xml" },
                  { label: "News Sitemap", url: "/sitemap-news.xml" },
                  { label: "Blog RSS Feed", url: "/api/feeds/rss.xml" },
                  { label: "Robots.txt", url: "/robots.txt" },
                ].map(item => (
                  <Button key={item.url} variant="outline" size="sm" className="gap-1 justify-start"
                    onClick={() => window.open(item.url, "_blank")}>
                    <ExternalLink className="h-3 w-3" />
                    {item.label}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Robots.txt Tab */}
      {tab === "robots" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-purple-500" />
              Robots.txt
            </CardTitle>
            <CardDescription>
              Customize crawler access rules. Changes are reflected immediately at <code>/robots.txt</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              rows={10}
              value={robotsTxtContent}
              onChange={(e) => setRobotsTxtContent(e.target.value)}
              className="font-mono text-sm"
              placeholder={"User-agent: *\nAllow: /\n\nSitemap: /sitemap-index.xml\nSitemap: /sitemap.xml"}
            />
            <p className="text-xs text-muted-foreground">
              Note: If "Block all search engines" is enabled in Search Console tab, this content is overridden with <code>Disallow: /</code>.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Button variant="outline" size="sm" className="gap-1"
                onClick={() => window.open("/robots.txt", "_blank")}>
                <ExternalLink className="h-3.5 w-3.5" />
                Preview robots.txt
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="min-w-32">
          {saving ? "Saving…" : "Save SEO Settings"}
        </Button>
      </div>
    </div>
  );
}
