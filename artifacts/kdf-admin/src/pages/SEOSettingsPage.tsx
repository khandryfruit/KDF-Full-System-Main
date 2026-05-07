import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  useGetSeoSettings,
  useUpdateSeoSettings,
  getGetSeoSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Search, Map, Shield, ExternalLink, Copy, CheckCircle } from "lucide-react";

export default function SEOSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSeoSettings();
  const updateMutation = useUpdateSeoSettings();

  const [googleVerificationCode, setGoogleVerificationCode] = useState("");
  const [robotsTxtContent, setRobotsTxtContent] = useState(
    "User-agent: *\nAllow: /\n\nSitemap: /sitemap.xml"
  );
  const [siteNoindex, setSiteNoindex] = useState(false);
  const [sitemapEnabled, setSitemapEnabled] = useState(true);
  const [canonicalDomain, setCanonicalDomain] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (settings) {
      setGoogleVerificationCode(settings.googleVerificationCode ?? "");
      setRobotsTxtContent(
        settings.robotsTxtContent ?? "User-agent: *\nAllow: /\n\nSitemap: /sitemap.xml"
      );
      setSiteNoindex(settings.siteNoindex ?? false);
      setSitemapEnabled(settings.sitemapEnabled ?? true);
      setCanonicalDomain(settings.canonicalDomain ?? "");
    }
  }, [settings]);

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        data: {
          googleVerificationCode: googleVerificationCode || undefined,
          robotsTxtContent,
          siteNoindex,
          sitemapEnabled,
          canonicalDomain: canonicalDomain || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetSeoSettingsQueryKey() });
      toast({ title: "SEO settings saved successfully" });
    } catch {
      toast({ title: "Failed to save SEO settings", variant: "destructive" });
    }
  }

  function copyMetaTag() {
    if (!googleVerificationCode) return;
    navigator.clipboard.writeText(
      `<meta name="google-site-verification" content="${googleVerificationCode}" />`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">SEO Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage Google indexing, sitemap, and search engine optimization settings.
        </p>
      </div>

      {/* Google Search Console */}
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
                {copied ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs gap-1">
              <Globe className="h-3 w-3" />
              This tag is automatically injected in the website &lt;head&gt;
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Index Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-orange-500" />
            Index Control
          </CardTitle>
          <CardDescription>
            Control how search engines crawl and index your website.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Block all search engines (noindex)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sets <code>Disallow: /</code> in robots.txt. Use only for staging/private sites.
              </p>
            </div>
            <Switch
              checked={siteNoindex}
              onCheckedChange={setSiteNoindex}
            />
          </div>
          {siteNoindex && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700 font-medium">⚠️ Site is currently blocking all search engines</p>
              <p className="text-xs text-red-600 mt-1">
                Your site will not appear in Google search results while this is enabled.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sitemap */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5 text-green-500" />
            Sitemap
          </CardTitle>
          <CardDescription>
            Auto-generated sitemap including all products, categories, and published blog posts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Sitemap</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Serve an auto-generated <code>/sitemap.xml</code>
              </p>
            </div>
            <Switch
              checked={sitemapEnabled}
              onCheckedChange={setSitemapEnabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="canonical">Canonical Domain</Label>
            <Input
              id="canonical"
              placeholder="https://www.yoursite.com"
              value={canonicalDomain}
              onChange={(e) => setCanonicalDomain(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Used as the base URL in sitemap entries and robots.txt. Leave blank to auto-detect.
            </p>
          </div>
          {sitemapEnabled && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => window.open("/sitemap.xml", "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Preview sitemap.xml
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => window.open("/robots.txt", "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Preview robots.txt
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Robots.txt */}
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
            rows={8}
            value={robotsTxtContent}
            onChange={(e) => setRobotsTxtContent(e.target.value)}
            className="font-mono text-sm"
            placeholder={"User-agent: *\nAllow: /\n\nSitemap: /sitemap.xml"}
          />
          <p className="text-xs text-muted-foreground">
            Note: If "Block all search engines" is enabled above, this content is overridden with <code>Disallow: /</code>.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.isPending} className="min-w-32">
          {updateMutation.isPending ? "Saving…" : "Save SEO Settings"}
        </Button>
      </div>
    </div>
  );
}
