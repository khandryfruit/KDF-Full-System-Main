/**
 * SEO Extended Routes — AI SEO Generator, Redirects, Dashboard, Sitemaps, RSS
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  productsTable,
  categoriesTable,
  blogPostsTable,
  seoSettingsTable,
  googleIndexingSettingsTable,
  indexingLogsTable,
  googleMerchantSettingsTable,
  aiSettingsTable,
} from "@workspace/db/schema";
import { adminMiddleware } from "../lib/auth";
import OpenAI from "openai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */

async function getOpenAI(): Promise<OpenAI | null> {
  const rows = await db.select().from(aiSettingsTable).limit(1);
  const s = rows[0];
  if (!s?.openaiApiKey) return null;
  return new OpenAI({ apiKey: s.openaiApiKey, organization: s.openaiOrgId || undefined });
}

function escapeXml(str: string): string {
  return (str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ═══════════════════════════════════════════════════════
   AI SEO GENERATOR
═══════════════════════════════════════════════════════ */

/**
 * POST /admin/seo/ai/generate
 * Generate SEO content with AI: title, description, keywords, FAQ, alt text
 */
router.post("/admin/seo/ai/generate", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { type, content, name, description, price, category, existingContent } = req.body as {
      type: "product" | "blog" | "category" | "alt";
      content?: string;
      name?: string;
      description?: string;
      price?: string;
      category?: string;
      existingContent?: string;
    };

    const ai = await getOpenAI();
    if (!ai) {
      res.status(400).json({ error: "OpenAI API key not configured. Go to AI Settings to add it." });
      return;
    }

    let prompt = "";
    if (type === "product") {
      prompt = `You are an expert SEO copywriter for an e-commerce store selling premium dry fruits and nuts (KDF NUTS / Khan Baba). Generate SEO content for this product:

Product Name: ${name}
Category: ${category || "Dry Fruits & Nuts"}
Price: ${price ? `Rs. ${price}` : "N/A"}
Description: ${description || existingContent || ""}

Return a JSON object with these fields:
{
  "seoTitle": "60 chars max, keyword-rich title",
  "metaDescription": "150-160 chars, compelling description with CTA",
  "focusKeyword": "primary keyword",
  "keywords": ["5-8 LSI keywords"],
  "altText": "descriptive alt text for main product image",
  "faq": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ],
  "aiDescription": "150-word SEO-optimized product description"
}

Focus on Pakistani market, include Urdu product names where relevant (badam=almonds, akhrot=walnuts, pista=pistachios, kaju=cashews).`;
    } else if (type === "blog") {
      prompt = `You are an expert SEO blogger for KDF NUTS, a premium dry fruits brand in Pakistan. Generate a complete SEO blog post outline and content for:

Topic: ${name || content}
Category: ${category || "Health & Nutrition"}

Return a JSON object:
{
  "seoTitle": "60 chars, compelling title",
  "metaDescription": "150-160 chars description",
  "focusKeyword": "main keyword",
  "keywords": ["related keywords"],
  "outline": ["Section 1", "Section 2", "..."],
  "intro": "150-word introduction paragraph",
  "body": "Complete 600-word blog body with H2/H3 structure in markdown",
  "conclusion": "100-word conclusion with CTA",
  "faq": [{"question": "...", "answer": "..."}, {"question": "...", "answer": "..."}]
}`;
    } else if (type === "category") {
      prompt = `Generate SEO content for a product category page:

Category: ${name}
Description: ${description || ""}

Return JSON:
{
  "seoTitle": "60 chars title",
  "metaDescription": "150-160 chars",
  "focusKeyword": "main keyword",
  "keywords": ["related keywords"],
  "categoryDescription": "200-word SEO-friendly category description"
}`;
    } else if (type === "alt") {
      prompt = `Generate a descriptive, SEO-friendly alt text for a product image.

Product: ${name}
Context: ${description || "Premium dry fruits and nuts"}

Return JSON: { "altText": "descriptive alt text under 125 chars" }`;
    }

    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 2000,
    });

    const result = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    res.json(result);
  } catch (err: any) {
    logger.error({ err }, "AI SEO generate failed");
    res.status(500).json({ error: err.message || "AI generation failed" });
  }
});

/**
 * POST /admin/seo/ai/bulk-generate
 * Bulk AI SEO generation for products without SEO content
 */
router.post("/admin/seo/ai/bulk-generate", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { limit = 10 } = req.body as { limit?: number };
    const ai = await getOpenAI();
    if (!ai) {
      res.status(400).json({ error: "OpenAI API key not configured" });
      return;
    }

    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        description: productsTable.description,
        price: productsTable.price,
        seoTitle: sql<string>`products.seo_title`,
      })
      .from(productsTable)
      .where(eq(productsTable.active, true))
      .limit(Math.min(limit, 20));

    const missing = products.filter(p => !p.seoTitle);
    res.json({ total: products.length, missing: missing.length, message: `${missing.length} products need SEO content` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   AI BLOG WRITER
═══════════════════════════════════════════════════════ */

/**
 * POST /admin/seo/ai/blog-write
 * Full AI blog post generation
 */
router.post("/admin/seo/ai/blog-write", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { topic, targetKeyword, tone = "informative", wordCount = 800 } = req.body as {
      topic: string;
      targetKeyword?: string;
      tone?: string;
      wordCount?: number;
    };

    const ai = await getOpenAI();
    if (!ai) {
      res.status(400).json({ error: "OpenAI API key not configured" });
      return;
    }

    const prompt = `Write a complete, SEO-optimized blog post for KDF NUTS (Khan Baba Dry Fruits), a premium dry fruits and nuts brand in Pakistan.

Topic: ${topic}
Target Keyword: ${targetKeyword || topic}
Tone: ${tone}
Target Word Count: ${wordCount} words

Return a complete JSON object:
{
  "title": "Compelling H1 blog title",
  "seoTitle": "60-char SEO title (can differ from H1)",
  "metaDescription": "155-char meta description with CTA",
  "focusKeyword": "${targetKeyword || topic}",
  "slug": "url-friendly-slug",
  "tags": ["tag1", "tag2", "tag3"],
  "content": "Complete blog post in HTML format with proper H2/H3 tags, paragraphs, lists. Include the target keyword naturally. Write ${wordCount} words.",
  "excerpt": "150-word excerpt for blog listing",
  "faq": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ],
  "readTime": 5
}

Make the content informative, helpful, and optimized for Pakistani readers. Include relevant health benefits, tips, and use cases for dry fruits.`;

    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 3000,
    });

    const result = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    res.json(result);
  } catch (err: any) {
    logger.error({ err }, "AI blog write failed");
    res.status(500).json({ error: err.message || "Blog generation failed" });
  }
});

/* ═══════════════════════════════════════════════════════
   301 REDIRECT MANAGER
═══════════════════════════════════════════════════════ */

/** GET /admin/seo/redirects */
router.get("/admin/seo/redirects", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, source_path, target_url, redirect_type, hits, is_active, note, created_at, updated_at
      FROM seo_redirects ORDER BY created_at DESC
    `);
    res.json(rows.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /admin/seo/redirects */
router.post("/admin/seo/redirects", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { sourcePath, targetUrl, redirectType = 301, note } = req.body as {
      sourcePath: string;
      targetUrl: string;
      redirectType?: number;
      note?: string;
    };

    if (!sourcePath || !targetUrl) {
      res.status(400).json({ error: "sourcePath and targetUrl are required" });
      return;
    }

    const [row] = await db.execute(sql`
      INSERT INTO seo_redirects (source_path, target_url, redirect_type, note)
      VALUES (${sourcePath}, ${targetUrl}, ${redirectType}, ${note ?? null})
      ON CONFLICT (source_path) DO UPDATE SET target_url = ${targetUrl}, redirect_type = ${redirectType}, note = ${note ?? null}, updated_at = NOW()
      RETURNING *
    `);
    res.json((row as any).rows?.[0] ?? row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /admin/seo/redirects/:id */
router.put("/admin/seo/redirects/:id", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sourcePath, targetUrl, redirectType, isActive, note } = req.body as {
      sourcePath?: string;
      targetUrl?: string;
      redirectType?: number;
      isActive?: boolean;
      note?: string;
    };

    await db.execute(sql`
      UPDATE seo_redirects SET
        ${sourcePath !== undefined ? sql`source_path = ${sourcePath},` : sql``}
        ${targetUrl !== undefined ? sql`target_url = ${targetUrl},` : sql``}
        ${redirectType !== undefined ? sql`redirect_type = ${redirectType},` : sql``}
        ${isActive !== undefined ? sql`is_active = ${isActive},` : sql``}
        ${note !== undefined ? sql`note = ${note},` : sql``}
        updated_at = NOW()
      WHERE id = ${Number(id)}
    `);

    const rows = await db.execute(sql`SELECT * FROM seo_redirects WHERE id = ${Number(id)}`);
    res.json((rows as any).rows?.[0] ?? {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /admin/seo/redirects/:id */
router.delete("/admin/seo/redirects/:id", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM seo_redirects WHERE id = ${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   SEO DASHBOARD — UNIFIED METRICS
═══════════════════════════════════════════════════════ */

/** GET /admin/seo/dashboard */
router.get("/admin/seo/dashboard", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const [
      indexingSettings,
      indexingLogs,
      merchantSettings,
      seoSettings,
      productCount,
      blogCount,
      redirectCount,
    ] = await Promise.all([
      db.select().from(googleIndexingSettingsTable).limit(1),
      db.select().from(indexingLogsTable).orderBy(desc(indexingLogsTable.createdAt)).limit(5),
      db.select().from(googleMerchantSettingsTable).limit(1),
      db.select().from(seoSettingsTable).limit(1),
      db.select({ count: sql<number>`count(*)` }).from(productsTable).where(eq(productsTable.active, true)),
      db.select({ count: sql<number>`count(*)` }).from(blogPostsTable).where(eq(blogPostsTable.status, "published")),
      db.execute(sql`SELECT count(*) as count FROM seo_redirects WHERE is_active = true`),
    ]);

    const indexStats = await db.execute(sql`
      SELECT status, count(*) as count
      FROM indexing_logs
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY status
    `);

    const productsWithSeo = await db.execute(sql`
      SELECT count(*) as count FROM products WHERE active = true AND seo_title IS NOT NULL AND seo_title != ''
    `);

    const productsWithoutSeo = await db.execute(sql`
      SELECT count(*) as count FROM products WHERE active = true AND (seo_title IS NULL OR seo_title = '')
    `);

    res.json({
      indexing: {
        configured: !!indexingSettings[0]?.serviceAccountJson,
        autoEnabled: indexingSettings[0]?.autoIndexEnabled ?? false,
        siteUrl: indexingSettings[0]?.siteUrl ?? null,
        recentLogs: indexingLogs,
        stats7d: (indexStats as any).rows ?? [],
      },
      merchant: {
        enabled: merchantSettings[0]?.feedEnabled ?? false,
        brand: merchantSettings[0]?.brand ?? null,
        storeUrl: merchantSettings[0]?.storeUrl ?? null,
        lastSync: (merchantSettings[0] as any)?.updatedAt ?? null,
      },
      seo: {
        sitemapEnabled: seoSettings[0]?.sitemapEnabled ?? false,
        canonicalDomain: seoSettings[0]?.canonicalDomain ?? null,
        hasGtm: !!((seoSettings[0] as any)?.gtm_id),
        hasGa4: !!((seoSettings[0] as any)?.ga4_id),
        hasOrg: !!((seoSettings[0] as any)?.org_name),
      },
      content: {
        products: Number(productCount[0]?.count ?? 0),
        blogs: Number(blogCount[0]?.count ?? 0),
        redirects: Number(((redirectCount as any).rows?.[0] as any)?.count ?? 0),
        productsWithSeo: Number(((productsWithSeo as any).rows?.[0] as any)?.count ?? 0),
        productsWithoutSeo: Number(((productsWithoutSeo as any).rows?.[0] as any)?.count ?? 0),
      },
      feeds: {
        googleXml: "/api/feeds/google-merchant.xml",
        facebookJson: "/api/feeds/facebook-catalog.json",
        rss: "/feeds/rss.xml",
        sitemapIndex: "/sitemap-index.xml",
        sitemapImages: "/sitemap-images.xml",
        sitemapNews: "/sitemap-news.xml",
      },
    });
  } catch (err: any) {
    logger.error({ err }, "SEO dashboard failed");
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   REDIRECT STATS
   Note: sitemap-index.xml, sitemap-images.xml, sitemap-news.xml,
   and /feeds/rss.xml are served at root level in app.ts
═══════════════════════════════════════════════════════ */

/** GET /admin/seo/redirects/stats */
router.get("/admin/seo/redirects/stats", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const stats = await db.execute(sql`
      SELECT
        count(*) as total,
        count(*) FILTER (WHERE is_active = true) as active,
        sum(hits) as total_hits,
        count(*) FILTER (WHERE redirect_type = 301) as permanent,
        count(*) FILTER (WHERE redirect_type = 302) as temporary
      FROM seo_redirects
    `);
    res.json((stats as any).rows?.[0] ?? {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
