import { useMemo } from "react";
import {
  Search, Sparkles, Hash, Share2, Code2, Settings2, ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AIGenerateButton, AIGenerateWithPreview } from "@/components/AIGenerateButton";
import { GoogleSearchPreview } from "@/components/seo/GoogleSearchPreview";
import {
  overallSeoScore,
  parseKeywordList,
  scoreMetaDescription,
  scoreMetaTitle,
  stringifyKeywords,
} from "@/lib/seoScore";
import { useLocation } from "wouter";

export type SiteSeoFormState = {
  metaTitle: string;
  metaDescription: string;
  primaryKeywords: string;
  secondaryKeywords: string;
  longTailKeywords: string;
  ogTitle: string;
  ogDescription: string;
  twitterCardType: string;
  robotsIndex: boolean;
  schemaOrgEnabled: boolean;
  schemaBreadcrumbEnabled: boolean;
  schemaFaqEnabled: boolean;
};

function ScoreBadge({ score, label, tone }: { score: number; label: string; tone: "good" | "warn" | "bad" }) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-red-50 text-red-800 border-red-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      SEO {score}% · {label}
    </span>
  );
}

function KeywordChips({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const list = useMemo(() => parseKeywordList(value), [value]);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea
        rows={3}
        value={list.join("\n")}
        placeholder={placeholder}
        className="resize-none text-sm font-mono"
        onChange={(e) => onChange(stringifyKeywords(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)))}
      />
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.slice(0, 12).map((kw) => (
            <Badge key={kw} variant="secondary" className="text-[10px] font-normal">
              {kw}
            </Badge>
          ))}
          {list.length > 12 && (
            <Badge variant="outline" className="text-[10px]">+{list.length - 12} more</Badge>
          )}
        </div>
      )}
    </div>
  );
}

export function SiteSeoSettingsPanel({
  siteName,
  form,
  onChange,
  canonicalDomain,
}: {
  siteName: string;
  form: SiteSeoFormState;
  onChange: (patch: Partial<SiteSeoFormState>) => void;
  canonicalDomain?: string;
}) {
  const [, nav] = useLocation();
  const titleLen = form.metaTitle.length;
  const descLen = form.metaDescription.length;
  const titleScore = scoreMetaTitle(titleLen);
  const descScore = scoreMetaDescription(descLen);
  const kwCount =
    parseKeywordList(form.primaryKeywords).length +
    parseKeywordList(form.secondaryKeywords).length;
  const totalScore = overallSeoScore(titleLen, descLen, kwCount);

  const previewUrl = (canonicalDomain || "https://khanbabadryfruits.com").replace(/\/$/, "");

  const aiContext = {
    name: siteName,
    keywords: parseKeywordList(form.primaryKeywords).join(", "),
    existingContent: form.metaDescription,
    metaTitle: form.metaTitle,
  };

  const applyAi = (r: Record<string, string | string[]>) => {
    const patch: Partial<SiteSeoFormState> = {};
    if (r.metaTitle) patch.metaTitle = String(r.metaTitle);
    if (r.metaDescription) patch.metaDescription = String(r.metaDescription);
    if (r.ogTitle) patch.ogTitle = String(r.ogTitle);
    if (r.ogDescription) patch.ogDescription = String(r.ogDescription);
    if (Array.isArray(r.primaryKeywords)) patch.primaryKeywords = stringifyKeywords(r.primaryKeywords as string[]);
    else if (typeof r.primaryKeywords === "string") patch.primaryKeywords = r.primaryKeywords;
    if (Array.isArray(r.secondaryKeywords)) patch.secondaryKeywords = stringifyKeywords(r.secondaryKeywords as string[]);
    if (Array.isArray(r.longTailKeywords)) patch.longTailKeywords = stringifyKeywords(r.longTailKeywords as string[]);
    if (Array.isArray(r.keywords)) patch.primaryKeywords = stringifyKeywords(r.keywords as string[]);
    onChange(patch);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Search className="h-5 w-5 text-[#5FA800]" />
            SEO Management
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Homepage meta tags, keywords, social previews, and structured data defaults.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-[#5FA800]/10 text-[#3d7000] border-[#5FA800]/30">
            Overall SEO score: {totalScore}%
          </Badge>
          <AIGenerateWithPreview type="site-seo" context={aiContext} label="Generate all (AI)" onResult={applyAi} />
          <AIGenerateButton type="site-seo-optimize" context={aiContext} label="Optimize" onResult={applyAi} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Meta title</CardTitle>
          <CardDescription>Shown in Google results and browser tabs (50–60 characters ideal).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ScoreBadge score={titleScore.score} label={titleScore.label} tone={titleScore.tone} />
            <div className="flex items-center gap-2">
              <span className={`text-xs ${titleLen > 60 ? "text-destructive" : titleLen >= 50 ? "text-emerald-600" : "text-muted-foreground"}`}>
                {titleLen}/60
              </span>
              <AIGenerateButton type="site-seo" context={aiContext} label="AI title" onResult={applyAi} />
            </div>
          </div>
          <Input
            value={form.metaTitle}
            maxLength={70}
            placeholder={`${siteName} – Premium Dry Fruits Online in Pakistan`}
            onChange={(e) => onChange({ metaTitle: e.target.value })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Meta description</CardTitle>
          <CardDescription>High-CTR snippet for search results (120–160 characters ideal).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ScoreBadge score={descScore.score} label={descScore.label} tone={descScore.tone} />
            <div className="flex items-center gap-2">
              <span className={`text-xs ${descLen > 160 ? "text-destructive" : descLen >= 120 ? "text-emerald-600" : "text-muted-foreground"}`}>
                {descLen}/160
              </span>
              <AIGenerateButton type="site-seo" context={aiContext} label="AI description" onResult={applyAi} />
            </div>
          </div>
          <Textarea
            rows={4}
            maxLength={180}
            value={form.metaDescription}
            placeholder="Buy premium dry fruits online in Pakistan including almonds, pistachios, walnuts, dates & healthy snacks with fast delivery."
            className="resize-none"
            onChange={(e) => onChange({ metaDescription: e.target.value })}
          />
        </CardContent>
      </Card>

      <GoogleSearchPreview
        title={form.metaTitle || siteName}
        description={form.metaDescription}
        url={`${previewUrl}/`}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="h-4 w-4" />
            Keywords manager
          </CardTitle>
          <CardDescription>One keyword per line. Used for AI context and SEO planning.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <KeywordChips
            label="Primary keywords"
            value={form.primaryKeywords}
            onChange={(v) => onChange({ primaryKeywords: v })}
            placeholder="almonds Pakistan&#10;premium dry fruits&#10;buy pistachio online"
          />
          <KeywordChips
            label="Secondary keywords"
            value={form.secondaryKeywords}
            onChange={(v) => onChange({ secondaryKeywords: v })}
            placeholder="healthy snacks&#10;imported nuts&#10;dry fruits Lahore"
          />
          <KeywordChips
            label="Long-tail keywords"
            value={form.longTailKeywords}
            onChange={(v) => onChange({ longTailKeywords: v })}
            placeholder="buy roasted almonds online Pakistan&#10;best quality pistachio price Lahore"
          />
          <AIGenerateButton type="site-seo-keywords" context={aiContext} label="Suggest keywords (AI)" onResult={applyAi} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Social meta (Open Graph & Twitter)
          </CardTitle>
          <CardDescription>Facebook, WhatsApp link previews, and Twitter/X cards.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Open Graph title</Label>
            <Input
              value={form.ogTitle}
              placeholder={form.metaTitle || "Defaults to meta title"}
              onChange={(e) => onChange({ ogTitle: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Open Graph description</Label>
            <Textarea
              rows={2}
              value={form.ogDescription}
              placeholder={form.metaDescription || "Defaults to meta description"}
              className="resize-none"
              onChange={(e) => onChange({ ogDescription: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-[#1877f2]/5 p-3 text-xs">
              <p className="font-semibold text-[#1877f2] mb-1">Facebook / WhatsApp preview</p>
              <p className="font-medium line-clamp-1">{form.ogTitle || form.metaTitle || siteName}</p>
              <p className="text-muted-foreground line-clamp-2 mt-0.5">{form.ogDescription || form.metaDescription || "…"}</p>
            </div>
            <div className="rounded-xl border bg-slate-900/5 p-3 text-xs">
              <p className="font-semibold mb-1">Twitter / X card</p>
              <p className="font-medium line-clamp-1">{form.ogTitle || form.metaTitle || siteName}</p>
              <p className="text-muted-foreground line-clamp-2 mt-0.5">{form.ogDescription || form.metaDescription || "…"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            Structured data & technical SEO
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Organization schema</Label>
              <p className="text-xs text-muted-foreground">JSON-LD for brand in search</p>
            </div>
            <Switch checked={form.schemaOrgEnabled} onCheckedChange={(v) => onChange({ schemaOrgEnabled: v })} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Breadcrumb schema</Label>
              <p className="text-xs text-muted-foreground">Product & category breadcrumbs</p>
            </div>
            <Switch checked={form.schemaBreadcrumbEnabled} onCheckedChange={(v) => onChange({ schemaBreadcrumbEnabled: v })} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">FAQ schema</Label>
              <p className="text-xs text-muted-foreground">When FAQs are enabled on pages</p>
            </div>
            <Switch checked={form.schemaFaqEnabled} onCheckedChange={(v) => onChange({ schemaFaqEnabled: v })} />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Allow search indexing</Label>
              <p className="text-xs text-muted-foreground">Disable to add noindex for staging</p>
            </div>
            <Switch checked={form.robotsIndex} onCheckedChange={(v) => onChange({ robotsIndex: v })} />
          </div>
          <button
            type="button"
            onClick={() => nav("/seo")}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Advanced: Search Console, sitemap, robots.txt
            <ExternalLink className="h-3 w-3" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
