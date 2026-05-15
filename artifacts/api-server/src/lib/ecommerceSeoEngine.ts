/**
 * Production-grade ecommerce SEO prompt engine — purchase intent, CTR, Pakistan market.
 * Used by /admin/seo/ai/* and /admin/ai/generate (product-seo, category, blog).
 */

export const SEO_BRAND = {
  name: "KDF NUTS",
  legal: "Khan Baba Dry Fruits",
  domain: "khanbabadryfruits.com",
  market: "Pakistan",
  currency: "PKR",
  delivery: "Fast delivery across Pakistan",
} as const;

/** Commercial modifiers — use 1–2 per title naturally, never stack all. */
export const COMMERCIAL_MODIFIERS = [
  "Buy",
  "Best Price",
  "Premium",
  "Original",
  "Online Pakistan",
  "Delivery",
  "Fresh",
  "Imported",
  "Wholesale",
  "Organic",
  "Order Online",
  "Same Day Delivery",
] as const;

/** Seasonal / trend intents — injected when relevant by month or product context. */
export const SEASONAL_TRENDS: Record<string, string[]> = {
  ramadan: ["Ramadan", "Iftar", "Sehri", "Ramadan gift box", "dates for Ramadan"],
  eid: ["Eid gift", "Eid hampers", "Eid dry fruits box", "Eid Mubarak gifts"],
  winter: ["Winter dry fruits", "warm snacks", "immunity boosters"],
  summer: ["healthy summer snacks", "energy boost"],
  gifts: ["gift box", "corporate gifts", "premium gift hamper", "dry fruit gift pack"],
  fitness: ["healthy snacks", "protein snacks", "gym diet", "weight management"],
  general: [
    "healthy snacks Pakistan",
    "premium dry fruits online",
    "nuts online Pakistan",
    "best dry fruits Lahore",
  ],
};

const URDU_GLOSSARY: Record<string, string> = {
  badam: "almonds",
  akhrot: "walnuts",
  pista: "pistachios",
  kaju: "cashews",
  kishmish: "raisins",
  anjeer: "figs",
  khajoor: "dates",
  chilgoza: "pine nuts",
};

export type SeoEntityType = "product" | "category" | "collection" | "blog" | "blog-full" | "alt";

export interface SeoGenerateContext {
  name?: string;
  description?: string;
  price?: string;
  category?: string;
  keywords?: string;
  existingContent?: string;
  topic?: string;
  targetKeyword?: string;
  tone?: string;
  wordCount?: number;
  tags?: string[];
}

export function buildEcommerceSeoSystemPrompt(): string {
  return `You are a senior ecommerce SEO strategist for ${SEO_BRAND.name} (${SEO_BRAND.legal}), Pakistan's premium dry fruits & nuts store (${SEO_BRAND.domain}).

PRIMARY GOAL: Rank on Google AND convert visitors into buyers — not informational traffic only.

RULES:
- Meta titles: 50–60 characters preferred (hard max 60). Lead with product/category + purchase intent.
- Meta descriptions: 140–160 characters preferred (hard max 160). Include benefit, trust, and CTA (Shop now / Order today / Free delivery where true).
- Use commercial intent naturally: Buy, Best Price, Premium, Original, Online Pakistan, Delivery, Fresh, Imported, Order Online — pick 1–2 that fit; NEVER keyword-stuff.
- Target users ready to purchase (transactional intent), not "what is almond" informational-only queries.
- Pakistan market: mention delivery/cash on delivery only when appropriate. Roman Urdu product names OK in body, English for meta tags.
- Avoid: generic filler ("best quality product"), repetition, ALL CAPS spam, fake claims.
- Output valid JSON only, no markdown fences.`;
}

/** Detect seasonal/trend keyword bundle for prompts. */
export function getTrendingKeywordHints(ctx: SeoGenerateContext): string[] {
  const text = `${ctx.name ?? ""} ${ctx.category ?? ""} ${ctx.description ?? ""} ${ctx.keywords ?? ""} ${ctx.topic ?? ""}`.toLowerCase();
  const month = new Date().getMonth() + 1;
  const hints = new Set<string>(SEASONAL_TRENDS.general);

  if (month >= 2 && month <= 4) SEASONAL_TRENDS.ramadan.forEach((k) => hints.add(k));
  if (month >= 3 && month <= 5) SEASONAL_TRENDS.eid.forEach((k) => hints.add(k));
  if (month >= 11 || month <= 1) SEASONAL_TRENDS.winter.forEach((k) => hints.add(k));

  if (/gift|hamper|box|corporate/i.test(text)) SEASONAL_TRENDS.gifts.forEach((k) => hints.add(k));
  if (/protein|gym|fitness|diet|keto/i.test(text)) SEASONAL_TRENDS.fitness.forEach((k) => hints.add(k));
  if (/date|khajoor|ramadan|iftar/i.test(text)) SEASONAL_TRENDS.ramadan.forEach((k) => hints.add(k));

  for (const [urdu, en] of Object.entries(URDU_GLOSSARY)) {
    if (text.includes(urdu)) hints.add(`${en} buy online Pakistan`);
  }

  return [...hints].slice(0, 12);
}

function ctxBlock(ctx: SeoGenerateContext): string {
  const trends = getTrendingKeywordHints(ctx).join(", ");
  return `Trending/seasonal keyword ideas (use 2–4 where relevant): ${trends}`;
}

export function buildProductSeoPrompt(ctx: SeoGenerateContext): string {
  return `${buildEcommerceSeoSystemPrompt()}

Generate high-converting PRODUCT page SEO for:

Product: ${ctx.name ?? "Unknown"}
Category: ${ctx.category ?? "Dry Fruits & Nuts"}
Price: ${ctx.price ? `Rs. ${ctx.price}` : "See site"}
Description: ${ctx.description || ctx.existingContent || "Premium dry fruit / nut"}

${ctxBlock(ctx)}
Extra keywords: ${ctx.keywords ?? "none"}

Return JSON:
{
  "metaTitle": "50-60 chars, transactional — e.g. Buy Premium [Product] Online Pakistan | Best Price & Delivery",
  "metaDescription": "140-160 chars with CTA, price/value hint, delivery trust",
  "ogTitle": "social share title, can match metaTitle or slightly shorter",
  "ogDescription": "social description, 120-200 chars, persuasive",
  "focusKeyword": "primary buy-intent keyword",
  "keywords": ["5-10 LSI + long-tail buy keywords"],
  "longTailKeywords": ["5-8 long-tail phrases buyers search"],
  "altText": "descriptive image alt under 125 chars, include product + buy context",
  "faq": [
    {"question": "buyer FAQ for featured snippet", "answer": "concise 2-3 sentences"},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ],
  "schemaSuggestions": {
    "productType": "Product",
    "suggestedProperties": ["name", "description", "offers", "aggregateRating if reviews exist"],
    "faqPage": true
  },
  "aiDescription": "150-220 word HTML product description with <p> and <ul><li>, purchase-focused, natural keywords"
}

Title formula examples (adapt, do not copy blindly):
- "Buy Premium California Almonds Online Pakistan | Best Price & Fast Delivery"
- "Fresh Imported Pistachios 500g — Order Online | KDF NUTS"`;
}

export function buildCategorySeoPrompt(ctx: SeoGenerateContext, variant: "category" | "collection" = "category"): string {
  const label = variant === "collection" ? "COLLECTION" : "CATEGORY";
  return `${buildEcommerceSeoSystemPrompt()}

Generate ${label} page SEO (broader intent than single product, still transactional):

${label} name: ${ctx.name ?? "Dry Fruits"}
Description: ${ctx.description || ctx.existingContent || ""}
${ctxBlock(ctx)}

Return JSON:
{
  "metaTitle": "50-60 chars — e.g. Buy Premium Dry Fruits Online in Pakistan | Best Prices & Fast Delivery",
  "metaDescription": "140-160 chars, category breadth, trust, CTA",
  "ogTitle": "OG title for category/collection",
  "ogDescription": "OG description",
  "focusKeyword": "category-level buy keyword",
  "keywords": ["8-12 category + commercial keywords"],
  "longTailKeywords": ["5-8 long-tail category phrases"],
  "categoryDescription": "220-280 word HTML with <h2> subheadings, <p>, <ul> — shop-ready copy",
  "faq": [{"question": "...", "answer": "..."}, {"question": "...", "answer": "..."}],
  "schemaSuggestions": {"type": "CollectionPage or ItemList", "breadcrumb": true, "faqPage": true},
  "internalLinkSuggestions": ["suggested anchor texts linking to related categories/products"]
}`;
}

export function buildBlogOutlinePrompt(ctx: SeoGenerateContext): string {
  return `${buildEcommerceSeoSystemPrompt()}

Create BLOG outline + SEO package (informational + commercial blend):

Topic: ${ctx.name || ctx.topic || "dry fruits health"}
Target keyword: ${ctx.targetKeyword || ctx.keywords || ctx.name}
${ctxBlock(ctx)}

Return JSON:
{
  "seoTitle": "50-60 char SEO title",
  "metaDescription": "140-160 chars with CTA to shop",
  "focusKeyword": "main keyword",
  "keywords": ["related keywords"],
  "longTailKeywords": ["snippet-friendly long-tails"],
  "outline": ["H2 sections"],
  "h1": "reader-facing H1",
  "h2Headings": ["H2 list"],
  "h3Headings": ["H3 under each H2, flat list"],
  "intro": "150-word intro",
  "body": "600+ words markdown with ## and ### headings",
  "conclusion": "100-word conclusion with shop CTA",
  "faq": [{"question": "People Also Ask style", "answer": "..."}, {"question": "...", "answer": "..."}, {"question": "...", "answer": "..."}],
  "internalLinkSuggestions": [{"anchor": "link text", "targetType": "product|category|blog", "suggestedSlug": "..."}],
  "buyerIntentPhrases": ["phrases to weave in for conversion"],
  "featuredSnippetTarget": "one paragraph optimized for position zero (40-60 words)"
}`;
}

export function buildBlogFullWritePrompt(ctx: SeoGenerateContext): string {
  const wc = ctx.wordCount ?? 800;
  return `${buildEcommerceSeoSystemPrompt()}

Write a complete SEO blog article (${wc} words) for ${SEO_BRAND.name}:

Topic: ${ctx.topic || ctx.name}
Target keyword: ${ctx.targetKeyword || ctx.topic}
Tone: ${ctx.tone ?? "informative"}
${ctxBlock(ctx)}

Return JSON:
{
  "title": "H1 blog title (engaging, not identical to metaTitle)",
  "seoTitle": "50-60 char meta title, purchase-aware",
  "metaDescription": "140-160 chars, meta CTA to browse/shop",
  "ogTitle": "social title",
  "ogDescription": "social description",
  "focusKeyword": "primary keyword",
  "keywords": ["tags/keywords array"],
  "longTailKeywords": ["long-tail array"],
  "slug": "url-friendly-slug",
  "tags": ["3-6 tags"],
  "content": "Full HTML: <h2>, <h3>, <p>, <ul><li>. Include FAQ section at end. Natural internal link placeholders like [shop almonds]. ${wc} words.",
  "excerpt": "150-char listing excerpt",
  "faq": [{"question": "...", "answer": "..."}, {"question": "...", "answer": "..."}, {"question": "...", "answer": "..."}],
  "h2Headings": ["extracted H2s"],
  "h3Headings": ["extracted H3s"],
  "internalLinkSuggestions": [{"anchor": "...", "targetType": "product|category", "suggestedSlug": "..."}],
  "buyerIntentPhrases": ["conversion phrases used in article"],
  "featuredSnippetTarget": "FAQ or definition block for snippets",
  "schemaSuggestions": {"article": true, "faqPage": true, "breadcrumb": true},
  "readTime": 5
}

Blend educational value with soft sells to ${SEO_BRAND.domain}.`;
}

export function buildAltTextPrompt(ctx: SeoGenerateContext): string {
  return `${buildEcommerceSeoSystemPrompt()}

Product image alt text:
Product: ${ctx.name}
Context: ${ctx.description || "Premium dry fruits Pakistan"}

Return JSON: { "altText": "under 125 chars, descriptive + product name, no 'image of'" }`;
}

export function buildProductSeoPromptCompact(ctx: SeoGenerateContext): string {
  return `${buildProductSeoPrompt(ctx)}

Return ONLY these fields for quick admin form fill:
{ "metaTitle", "metaDescription", "keywords" (comma-separated string), "focusKeyword", "altText" }
Also accept keywords as string OR array in your response — prefer array internally.`;
}

export function clampMetaTitle(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= 60) return t;
  const cut = t.slice(0, 57).replace(/\s+\S*$/, "");
  return cut.length > 40 ? `${cut}…` : t.slice(0, 60);
}

export function clampMetaDescription(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= 160) return t;
  const cut = t.slice(0, 157).replace(/\s+\S*$/, "");
  return cut.length > 100 ? `${cut}…` : t.slice(0, 160);
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") return v.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Normalize AI JSON to consistent admin/storefront field names. */
export function normalizeSeoResponse(
  type: SeoEntityType,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...raw };

  const title = (raw.metaTitle ?? raw.seoTitle ?? raw.title) as string | undefined;
  if (title) {
    out.metaTitle = clampMetaTitle(String(title));
    out.seoTitle = out.metaTitle;
  }

  if (raw.metaDescription) out.metaDescription = clampMetaDescription(String(raw.metaDescription));
  if (raw.ogTitle) out.ogTitle = clampMetaTitle(String(raw.ogTitle));
  if (!out.ogTitle && out.metaTitle) out.ogTitle = out.metaTitle;
  if (!out.ogDescription && out.metaDescription) out.ogDescription = out.metaDescription;

  if (raw.keywords) {
    const kw = asStringArray(raw.keywords);
    out.keywords = kw;
    out.keywordsCsv = kw.join(", ");
  }
  if (raw.longTailKeywords) out.longTailKeywords = asStringArray(raw.longTailKeywords);

  if (type === "product" || type === "alt") {
    if (raw.seoTitle && !out.metaTitle) out.metaTitle = clampMetaTitle(String(raw.seoTitle));
    if (raw.altText) out.altText = String(raw.altText).slice(0, 125);
  }

  return out;
}

export function getPromptForType(type: SeoEntityType, ctx: SeoGenerateContext): string {
  switch (type) {
    case "product":
      return buildProductSeoPrompt(ctx);
    case "category":
      return buildCategorySeoPrompt(ctx, "category");
    case "collection":
      return buildCategorySeoPrompt(ctx, "collection");
    case "blog":
      return buildBlogOutlinePrompt(ctx);
    case "blog-full":
      return buildBlogFullWritePrompt(ctx);
    case "alt":
      return buildAltTextPrompt(ctx);
    default:
      return buildProductSeoPrompt(ctx);
  }
}
