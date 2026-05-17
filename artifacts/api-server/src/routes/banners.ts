import { Router } from "express";
import { db, bannersTable, couponsTable, productsTable } from "@workspace/db";
import { eq, ne, asc, desc, or, and, isNull, sql, ilike, inArray } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import { resolveOpenAIClient } from "../lib/resolveOpenAI";
import { logger } from "../lib/logger";

const router = Router();

/** Only columns clients may set — avoids Drizzle rejecting unknown JSON keys. */
const BANNER_WRITABLE_KEYS = new Set([
  "title",
  "subtitle",
  "imageUrl",
  "mobileImageUrl",
  "linkUrl",
  "targetType",
  "targetId",
  "bgColor",
  "textColor",
  "label",
  "cta",
  "platform",
  "sortOrder",
  "active",
  "countdownEndAt",
  "startDate",
  "endDate",
  "offerProductIds",
  "offerCategoryIds",
  "offerMode",
  "offerDisplayCount",
  "offerSort",
  "showTimer",
  "buttonBgColor",
  "buttonTextColor",
  "videoUrl",
  "mobileVideoUrl",
  "videoAutoplay",
  "videoMuted",
  "videoLoop",
  "placement",
  "aiMode",
  "aiAutoUpdate",
  "aiCampaign",
  "aiPrompt",
  "aiRefreshCadence",
  "aiSafetyNotes",
  "approvedPromotionText",
  "healthBenefitText",
  "urgencyText",
  "relatedKeywords",
  "relatedProductIds",
  "bannerStyle",
  "showTitle",
  "showSubtitle",
  "showLabel",
  "showCta",
  "showExploreCta",
  "enableAiText",
  "heroAutoplay",
  "enableFallbackBanner",
]);

function pickWritableBannerFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of BANNER_WRITABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      out[key] = body[key];
    }
  }
  /* Empty string would otherwise be coalesced away and the DB default tailwind
     gradient would apply — hero banners would then be classified as "promo"
     in the admin UI and disappear from the Hero tab. */
  if (out.bgColor === "") {
    out.bgColor = null;
  }
  return out;
}

let bannerColumnsReady = false;
async function ensureBannerSmartColumns(): Promise<void> {
  if (bannerColumnsReady) return;
  const statements = [
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "offer_category_ids" jsonb DEFAULT '[]'::jsonb`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "offer_mode" text NOT NULL DEFAULT 'discount_products'`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "offer_display_count" integer NOT NULL DEFAULT 8`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "offer_sort" text NOT NULL DEFAULT 'featured'`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "show_timer" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "button_bg_color" text`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "button_text_color" text`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "ai_mode" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "ai_auto_update" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "ai_campaign" text`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "ai_prompt" text`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "ai_refresh_cadence" text DEFAULT 'daily'`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "ai_last_generated_at" timestamp`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "ai_next_refresh_at" timestamp`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "ai_safety_notes" text`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "approved_promotion_text" text`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "health_benefit_text" text`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "urgency_text" text`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "related_keywords" jsonb DEFAULT '[]'::jsonb`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "related_product_ids" jsonb DEFAULT '[]'::jsonb`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "banner_style" text DEFAULT 'premium'`,
    `ALTER TABLE "banners" ALTER COLUMN "title" DROP NOT NULL`,
    `ALTER TABLE "banners" ALTER COLUMN "title" SET DEFAULT ''`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "show_title" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "show_subtitle" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "show_label" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "show_cta" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "show_explore_cta" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "enable_ai_text" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "hero_autoplay" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "enable_fallback_banner" boolean NOT NULL DEFAULT true`,
  ];
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
  bannerColumnsReady = true;
}

function needsCountdownColumns(payload: Record<string, unknown>): boolean {
  return payload.placement === "countdown_deal"
    || "offerCategoryIds" in payload
    || "offerMode" in payload
    || "offerDisplayCount" in payload
    || "offerSort" in payload
    || "showTimer" in payload
    || "buttonBgColor" in payload
    || "buttonTextColor" in payload
    || "aiMode" in payload
    || "aiAutoUpdate" in payload
    || "aiCampaign" in payload
    || "relatedProductIds" in payload
    || "relatedKeywords" in payload;
}

function asTextOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function asDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function asInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function asIdArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((v) => Math.trunc(v));
}

async function createCountdownBanner(title: string, payload: Record<string, unknown>) {
  await ensureBannerSmartColumns();
  const rows = await db.execute(sql`
    INSERT INTO ${bannersTable} (
      "title",
      "subtitle",
      "image_url",
      "mobile_image_url",
      "link_url",
      "bg_color",
      "text_color",
      "label",
      "cta",
      "platform",
      "placement",
      "sort_order",
      "active",
      "countdown_end_at",
      "start_date",
      "end_date",
      "offer_product_ids",
      "offer_category_ids",
      "offer_mode",
      "offer_display_count",
      "offer_sort",
      "show_timer",
      "button_bg_color",
      "button_text_color"
    ) VALUES (
      ${title},
      ${asTextOrNull(payload.subtitle)},
      ${asTextOrNull(payload.imageUrl)},
      ${asTextOrNull(payload.mobileImageUrl)},
      ${asTextOrNull(payload.linkUrl) ?? "/products"},
      ${asTextOrNull(payload.bgColor) ?? "#0D2B00"},
      ${asTextOrNull(payload.textColor) ?? "white"},
      ${asTextOrNull(payload.label)},
      ${asTextOrNull(payload.cta) ?? "Shop Now"},
      ${asTextOrNull(payload.platform) ?? "both"},
      'countdown_deal',
      ${asInt(payload.sortOrder, 0)},
      ${payload.active !== false},
      ${asDateOrNull(payload.countdownEndAt)},
      ${asDateOrNull(payload.startDate)},
      ${asDateOrNull(payload.endDate)},
      CAST(${JSON.stringify(asIdArray(payload.offerProductIds))} AS jsonb),
      CAST(${JSON.stringify(asIdArray(payload.offerCategoryIds))} AS jsonb),
      ${asTextOrNull(payload.offerMode) ?? "discount_products"},
      ${Math.max(1, Math.min(12, asInt(payload.offerDisplayCount, 8)))},
      ${asTextOrNull(payload.offerSort) ?? "featured"},
      ${payload.showTimer !== false},
      ${asTextOrNull(payload.buttonBgColor)},
      ${asTextOrNull(payload.buttonTextColor)}
    )
    RETURNING *
  `);
  return ((rows as any).rows ?? rows)[0];
}

const CAMPAIGN_KEYWORDS: Record<string, string[]> = {
  ramadan: ["dates", "khajoor", "almond", "badam", "energy", "nutrition"],
  eid: ["gift", "gift pack", "almond", "pistachio", "kaju", "dry fruit"],
  winter: ["almond", "walnut", "akhrot", "cashew", "pista", "energy"],
  summer: ["healthy", "snack", "dates", "almond", "light"],
  healthy_lifestyle: ["almond", "walnut", "seeds", "healthy", "energy"],
  back_to_school: ["snack", "almond", "dates", "energy", "kids"],
  gift_season: ["gift", "gift pack", "premium", "pistachio", "dry fruit"],
  weekend_deals: ["popular", "best seller", "almond", "cashew"],
  bulk_buying: ["bulk", "almond", "cashew", "pistachio", "wholesale"],
};

function nextRefresh(cadence: string | null | undefined): Date {
  const now = new Date();
  const days = cadence === "weekly" ? 7 : cadence === "seasonal" ? 30 : 1;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function parseKeywords(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim().toLowerCase()).filter(Boolean).slice(0, 8);
  return String(value ?? "")
    .split(/[,|\n]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

function campaignLabel(campaign: string): string {
  return campaign.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
}

async function getApprovedPromotionFacts(): Promise<string[]> {
  const now = new Date();
  const coupons = await db.select().from(couponsTable)
    .where(and(eq(couponsTable.active, true), or(isNull(couponsTable.expiresAt), sql`${couponsTable.expiresAt} >= ${now}`)))
    .orderBy(desc(couponsTable.createdAt))
    .limit(8)
    .catch(() => []);
  const facts = coupons.map((c: any) => {
    const value = c.type === "percentage" ? `${c.value}% off` : `Rs. ${c.value} off`;
    const min = Number(c.minOrder ?? 0) > 0 ? ` above Rs. ${Number(c.minOrder).toLocaleString("en-PK")}` : "";
    return `${c.code}: ${value}${min}${c.description ? ` (${c.description})` : ""}`;
  });
  facts.push("Free delivery is allowed only when configured by admin in banner copy or approved promotion text.");
  return facts;
}

async function matchProductsForBanner(opts: {
  campaign: string;
  keywords: string[];
  selectedProductIds?: number[];
  selectedCategoryIds?: number[];
  limit?: number;
}) {
  const limit = Math.min(12, Math.max(4, opts.limit ?? 8));
  const terms = [...new Set([
    ...opts.keywords,
    ...(CAMPAIGN_KEYWORDS[opts.campaign] ?? []),
  ].map((v) => v.toLowerCase().trim()).filter(Boolean))].slice(0, 10);

  const conditions: any[] = [eq(productsTable.active, true)];
  if (opts.selectedProductIds?.length) conditions.push(inArray(productsTable.id, opts.selectedProductIds));
  else if (opts.selectedCategoryIds?.length) conditions.push(inArray(productsTable.categoryId, opts.selectedCategoryIds));
  else if (terms.length) {
    conditions.push(or(...terms.map((term) => or(
      ilike(productsTable.name, `%${term}%`),
      ilike(productsTable.description, `%${term}%`),
      sql`${productsTable.tags}::text ILIKE ${"%" + term + "%"}`,
    ))));
  }

  const rows = await db.select({
    id: productsTable.id,
    name: productsTable.name,
    slug: productsTable.slug,
    price: productsTable.price,
    originalPrice: productsTable.originalPrice,
    images: productsTable.images,
    featured: productsTable.featured,
    reviewCount: productsTable.reviewCount,
    categoryId: productsTable.categoryId,
  }).from(productsTable)
    .where(and(...conditions))
    .orderBy(desc(productsTable.featured), desc(productsTable.reviewCount), desc(productsTable.createdAt))
    .limit(limit)
    .catch(() => []);

  return { products: rows, keywords: terms };
}

function stripUnauthorizedOfferLanguage(text: string, approvedFacts: string[]): string {
  const hasApprovedDiscount = approvedFacts.some((fact) => /off|discount|free delivery|coupon|code/i.test(fact));
  if (hasApprovedDiscount) return text;
  return text
    .replace(/\b(up to|flat)?\s*\d+%+\s*(off|discount)\b/gi, "premium picks")
    .replace(/\bfree delivery\b/gi, "fast delivery")
    .replace(/\bdiscount\b/gi, "value")
    .replace(/\boffer\b/gi, "selection");
}

function localSmartBannerCopy(opts: {
  campaign: string;
  approvedFacts: string[];
  products: Array<{ name: string }>;
}) {
  const campaign = opts.campaign || "healthy_lifestyle";
  const featured = opts.products[0]?.name ?? (campaign.includes("gift") || campaign === "eid" ? "Gift Packs" : "Premium Dry Fruits");
  const label = campaign === "bulk_buying" ? "Bulk Orders" : campaignLabel(campaign);
  const approved = opts.approvedFacts.find((fact) => !fact.startsWith("Free delivery is allowed")) ?? "";
  const titleMap: Record<string, string> = {
    ramadan: `Ramadan Nutrition Picks`,
    eid: `Eid Gift Packs Perfect for Family Sharing`,
    winter: `Warm Winter Energy with ${featured}`,
    summer: `Light Healthy Snacks for Summer`,
    healthy_lifestyle: `Healthy ${featured} for Daily Energy`,
    back_to_school: `Smart Snacks for School Days`,
    gift_season: `Premium Gift Picks for Every Occasion`,
    weekend_deals: `Weekend Picks Customers Love`,
    bulk_buying: `Bulk Dry Fruit Orders Made Easy`,
  };
  return {
    label,
    title: titleMap[campaign] ?? `Fresh ${featured} Picks`,
    subtitle: approved || `Premium quality, hygienic packing, and fresh stock selected for this season.`,
    cta: campaign.includes("gift") || campaign === "eid" ? "Explore Gifts" : campaign === "bulk_buying" ? "Bulk Orders" : "Shop Now",
    healthBenefitText: "Natural energy, healthy fats, and better snacking for daily routines.",
    urgencyText: approved ? "Available while approved promotion is active." : "Fresh seasonal picks updated automatically.",
  };
}

async function generateSmartBannerContent(input: {
  campaign: string;
  prompt?: string;
  approvedFacts: string[];
  products: Array<{ name: string }>;
}) {
  const fallback = localSmartBannerCopy(input);
  try {
    const { client } = await resolveOpenAIClient();
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.65,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You generate premium ecommerce homepage banner copy. Strict rule: never invent discounts, free delivery, coupon codes, or offers. Only mention promotions provided in approvedPromotionFacts. If no approved promotion exists, write health benefit, seasonal, popular product, or gift messaging. Return JSON only with label,title,subtitle,cta,healthBenefitText,urgencyText,keywords.",
        },
        {
          role: "user",
          content: JSON.stringify({
            campaign: input.campaign,
            adminPrompt: input.prompt ?? "",
            approvedPromotionFacts: input.approvedFacts,
            products: input.products.map((p: { name: string }) => p.name).slice(0, 8),
            allowedCtas: ["Shop Now", "Explore Gifts", "Healthy Picks", "Bulk Orders", "View Collection"],
          }),
        },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    return {
      label: String(parsed.label ?? fallback.label).slice(0, 80),
      title: stripUnauthorizedOfferLanguage(String(parsed.title ?? fallback.title), input.approvedFacts).slice(0, 120),
      subtitle: stripUnauthorizedOfferLanguage(String(parsed.subtitle ?? fallback.subtitle), input.approvedFacts).slice(0, 220),
      cta: String(parsed.cta ?? fallback.cta).slice(0, 40),
      healthBenefitText: String(parsed.healthBenefitText ?? fallback.healthBenefitText).slice(0, 180),
      urgencyText: stripUnauthorizedOfferLanguage(String(parsed.urgencyText ?? fallback.urgencyText), input.approvedFacts).slice(0, 180),
      keywords: parseKeywords(parsed.keywords ?? []),
      source: "openai",
    };
  } catch (err) {
    logger.warn({ err }, "AI banner generation fell back to local safe copy");
    return { ...fallback, keywords: CAMPAIGN_KEYWORDS[input.campaign] ?? [], source: "fallback" };
  }
}

async function refreshSmartBanner(banner: any) {
  await ensureBannerSmartColumns();
  const campaign = String(banner.aiCampaign ?? "healthy_lifestyle");
  const selectedProductIds = Array.isArray(banner.relatedProductIds) ? banner.relatedProductIds.map(Number).filter(Boolean) : [];
  const selectedCategoryIds = Array.isArray(banner.offerCategoryIds) ? banner.offerCategoryIds.map(Number).filter(Boolean) : [];
  const approvedFacts = [
    ...await getApprovedPromotionFacts(),
    ...(banner.approvedPromotionText ? [String(banner.approvedPromotionText)] : []),
  ].filter(Boolean);
  const matched = await matchProductsForBanner({
    campaign,
    keywords: parseKeywords(banner.relatedKeywords ?? banner.aiPrompt ?? campaign),
    selectedProductIds,
    selectedCategoryIds,
    limit: Number(banner.offerDisplayCount ?? 8),
  });
  const copy = await generateSmartBannerContent({
    campaign,
    prompt: banner.aiPrompt ?? "",
    approvedFacts,
    products: matched.products,
  });
  const relatedIds = matched.products.map((p: { id: number }) => p.id);
  const [updated] = await db.update(bannersTable).set({
    title: copy.title,
    subtitle: copy.subtitle,
    label: copy.label,
    cta: copy.cta,
    linkUrl: banner.linkUrl || "/products",
    targetType: banner.targetType || (relatedIds[0] ? "product" : "page"),
    targetId: banner.targetId ?? relatedIds[0] ?? null,
    healthBenefitText: copy.healthBenefitText,
    urgencyText: copy.urgencyText,
    relatedKeywords: [...new Set([...matched.keywords, ...copy.keywords])].slice(0, 10),
    relatedProductIds: relatedIds,
    aiSafetyNotes: `Generated from ${copy.source}. Approved promotions only: ${approvedFacts.join(" | ").slice(0, 500) || "none"}`,
    aiLastGeneratedAt: new Date(),
    aiNextRefreshAt: nextRefresh(String(banner.aiRefreshCadence ?? "daily")),
  } as any).where(eq(bannersTable.id, Number(banner.id))).returning();
  return updated;
}

router.get("/banners", async (req, res) => {
  try {
    await ensureBannerSmartColumns();
    const { platform, placement } = req.query;
    const now = new Date();
    const activeFilter = eq(bannersTable.active, true);
    const conditions: unknown[] = [];
    if (platform || placement) {
      conditions.push(
        activeFilter,
        or(isNull(bannersTable.startDate), sql`${bannersTable.startDate} <= ${now}`),
        or(isNull(bannersTable.endDate), sql`${bannersTable.endDate} >= ${now}`),
      );
    }
    if (platform) {
      conditions.push(
        or(
          eq(bannersTable.platform, platform as string),
          eq(bannersTable.platform, "both"),
          isNull(bannersTable.platform),
        ),
      );
    }
    if (placement && typeof placement === "string") {
      /* Home hero carousel: include true heroes plus any row with real media that is
         not the header strip (fixes rows wrongly tagged `promo` by older migrations). */
      if (placement === "hero") {
        const hasBannerMedia = sql`(
          length(trim(coalesce(${bannersTable.imageUrl}, ''))) > 0
          or length(trim(coalesce(${bannersTable.mobileImageUrl}, ''))) > 0
          or length(trim(coalesce(${bannersTable.videoUrl}, ''))) > 0
          or length(trim(coalesce(${bannersTable.mobileVideoUrl}, ''))) > 0
        )`;
        conditions.push(
          or(eq(bannersTable.placement, "hero"), and(ne(bannersTable.placement, "header"), ne(bannersTable.placement, "countdown_deal"), hasBannerMedia)),
        );
      } else {
        conditions.push(eq(bannersTable.placement, placement));
      }
    }
    const baseQuery = db.select().from(bannersTable);
    const banners = await (conditions.length > 0
      ? baseQuery.where(conditions.length === 1 ? conditions[0] as any : and(...(conditions as any)))
      : baseQuery
    ).orderBy(asc(bannersTable.sortOrder));
    res.set("Cache-Control", "public, max-age=20, s-maxage=45, stale-while-revalidate=180");
    res.json(banners);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/admin/banners/:id/ai-generate", adminMiddleware as any, async (req, res) => {
  try {
    await ensureBannerSmartColumns();
    const id = Number(req.params.id);
    const [banner] = await db.select().from(bannersTable).where(eq(bannersTable.id, id)).limit(1);
    if (!banner) {
      res.status(404).json({ error: "Banner not found" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const patch = pickWritableBannerFields({
      ...body,
      aiMode: body.aiMode ?? true,
      aiAutoUpdate: body.aiAutoUpdate ?? (banner as any).aiAutoUpdate ?? true,
    });
    if (Object.keys(patch).length > 0) {
      await db.update(bannersTable).set(patch as any).where(eq(bannersTable.id, id));
    }
    const [latest] = await db.select().from(bannersTable).where(eq(bannersTable.id, id)).limit(1);
    const updated = await refreshSmartBanner(latest);
    res.json({ success: true, banner: updated });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "AI banner generation failed" });
  }
});

router.post("/admin/banners/ai-preview", adminMiddleware as any, async (req, res) => {
  try {
    await ensureBannerSmartColumns();
    const body = req.body as Record<string, unknown>;
    const campaign = String(body.aiCampaign ?? "healthy_lifestyle");
    const keywords = parseKeywords(body.relatedKeywords ?? body.aiPrompt ?? campaign);
    const approvedFacts = [
      ...await getApprovedPromotionFacts(),
      ...(body.approvedPromotionText ? [String(body.approvedPromotionText)] : []),
    ];
    const matched = await matchProductsForBanner({
      campaign,
      keywords,
      selectedProductIds: Array.isArray(body.relatedProductIds) ? body.relatedProductIds.map(Number).filter(Boolean) : [],
      selectedCategoryIds: Array.isArray(body.offerCategoryIds) ? body.offerCategoryIds.map(Number).filter(Boolean) : [],
      limit: Number(body.offerDisplayCount ?? 8),
    });
    const copy = await generateSmartBannerContent({
      campaign,
      prompt: String(body.aiPrompt ?? ""),
      approvedFacts,
      products: matched.products,
    });
    res.json({
      ...copy,
      relatedKeywords: [...new Set([...matched.keywords, ...copy.keywords])].slice(0, 10),
      relatedProductIds: matched.products.map((p) => p.id),
      products: matched.products,
      safetyNotes: `Preview uses approved promotions only: ${approvedFacts.join(" | ").slice(0, 500) || "none"}`,
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "AI banner preview failed" });
  }
});

router.post("/banners", adminMiddleware as any, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const picked = pickWritableBannerFields(body);
    const title = body.title;
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title is required" });
      return;
    }
    if (needsCountdownColumns(picked)) {
      await ensureBannerSmartColumns();
    }
    if (picked.placement === "countdown_deal") {
      const banner = await createCountdownBanner(title, picked);
      req.log.info({ bannerId: banner?.id, placement: "countdown_deal" }, "countdown banner created");
      res.status(201).json(banner);
      return;
    }
    const [banner] = await db
      .insert(bannersTable)
      .values({ ...(picked as any), title } as any)
      .returning();
    req.log.info({ bannerId: banner?.id, hasImage: !!picked.imageUrl }, "banner created");
    res.status(201).json(banner);
  } catch (err: any) {
    req.log.error({ err, code: err?.code, detail: err?.detail, message: err?.message }, "banner create failed");
    res.status(500).json({
      error: "Failed to create banner",
      detail: err?.detail ?? err?.message ?? "Unknown database error",
    });
  }
});

router.put("/banners/:id", adminMiddleware as any, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const picked = pickWritableBannerFields(body);
    if (needsCountdownColumns(picked)) {
      await ensureBannerSmartColumns();
    }
    const [banner] = await db
      .update(bannersTable)
      .set(picked as any)
      .where(eq(bannersTable.id, parseInt(req.params.id)))
      .returning();
    if (!banner) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    req.log.info({ bannerId: banner.id }, "banner updated");
    res.json(banner);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.delete("/banners/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(bannersTable).where(eq(bannersTable.id, parseInt(req.params.id)));
    res.json({ success: true, message: "Banner deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

let smartBannerTimer: ReturnType<typeof setInterval> | null = null;

export function startSmartBannerScheduler(intervalMinutes = 60): void {
  if (smartBannerTimer) return;
  const run = async () => {
    try {
      await ensureBannerSmartColumns();
      const due = await db.select().from(bannersTable)
        .where(and(
          eq((bannersTable as any).aiMode, true),
          eq((bannersTable as any).aiAutoUpdate, true),
          eq(bannersTable.active, true),
          or(isNull((bannersTable as any).aiNextRefreshAt), sql`${(bannersTable as any).aiNextRefreshAt} <= NOW()`),
        ))
        .orderBy(asc(bannersTable.sortOrder))
        .limit(5)
        .catch(() => []);
      for (const banner of due as any[]) {
        await refreshSmartBanner(banner).catch((err) => logger.warn({ err, bannerId: banner.id }, "Smart banner refresh failed"));
      }
    } catch (err) {
      logger.warn({ err }, "Smart banner scheduler failed");
    }
  };
  smartBannerTimer = setInterval(() => void run(), intervalMinutes * 60_000);
  setTimeout(() => void run(), 20_000);
  logger.info({ intervalMinutes }, "Smart banner scheduler started");
}

export default router;
