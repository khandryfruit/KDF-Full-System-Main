/**
 * SEO Extended Routes — AI SEO Generator, Redirects, Dashboard
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, sql, or, and } from "drizzle-orm";
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
import {
  getPromptForType,
  normalizeSeoResponse,
  type SeoEntityType,
  type SeoGenerateContext,
} from "../lib/ecommerceSeoEngine";

const router: IRouter = Router();

async function getOpenAI(): Promise<OpenAI | null> {
  const rows = await db.select().from(aiSettingsTable).limit(1);
  const s = rows[0];
  if (!s?.openaiApiKey) return null;
  return new OpenAI({ apiKey: s.openaiApiKey, organization: s.openaiOrgId || undefined });
}

async function runSeoAi(prompt: string, maxTokens = 2500): Promise<Record<string, unknown>> {
  const ai = await getOpenAI();
  if (!ai) throw new Error("OpenAI API key not configured. Go to AI Settings to add it.");

  const response = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an ecommerce SEO expert. Return only valid JSON." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.65,
    max_tokens: maxTokens,
  });

  const raw = JSON.parse(response.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
  return raw;
}

/* ═══════════════════════════════════════════════════════
   AI SEO GENERATOR
═══════════════════════════════════════════════════════ */

/**
 * POST /admin/seo/ai/generate
 * Types: product | category | collection | blog | alt
 */
router.post("/admin/seo/ai/generate", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const body = req.body as SeoGenerateContext & {
      type: SeoEntityType;
      content?: string;
    };

    const type = (body.type ?? "product") as SeoEntityType;
    const ctx: SeoGenerateContext = {
      name: body.name,
      description: body.description,
      price: body.price,
      category: body.category,
      keywords: body.keywords,
      existingContent: body.existingContent ?? body.content,
      topic: body.topic,
      targetKeyword: body.targetKeyword,
      tone: body.tone,
    };

    const prompt = getPromptForType(type, ctx);
    const raw = await runSeoAi(prompt, type === "blog" ? 3000 : 2200);
    const result = normalizeSeoResponse(type, raw);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI generation failed";
    logger.error({ err }, "AI SEO generate failed");
    res.status(500).json({ error: message });
  }
});

/**
 * POST /admin/seo/ai/bulk-generate
 * Generate & save meta for active products missing meta_title
 */
router.post("/admin/seo/ai/bulk-generate", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { limit = 10, dryRun = false } = req.body as { limit?: number; dryRun?: boolean };
    const cap = Math.min(Math.max(1, limit), 15);

    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        description: productsTable.description,
        price: productsTable.price,
        metaTitle: productsTable.metaTitle,
        categoryId: productsTable.categoryId,
      })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.active, true),
          or(
            sql`${productsTable.metaTitle} IS NULL`,
            sql`trim(${productsTable.metaTitle}) = ''`,
          ),
        ),
      )
      .limit(cap);

    if (dryRun) {
      res.json({
        queued: products.length,
        message: `${products.length} products need SEO meta`,
        productIds: products.map((p) => p.id),
      });
      return;
    }

    const categoryRows = await db.select({ id: categoriesTable.id, name: categoriesTable.name }).from(categoriesTable);
    const catById = new Map(categoryRows.map((c) => [c.id, c.name]));

    const results: { id: number; name: string; ok: boolean; error?: string }[] = [];

    for (const p of products) {
      try {
        const ctx: SeoGenerateContext = {
          name: p.name,
          description: p.description ?? undefined,
          price: p.price ?? undefined,
          category: p.categoryId ? catById.get(p.categoryId) ?? "Dry Fruits & Nuts" : "Dry Fruits & Nuts",
        };
        const raw = await runSeoAi(getPromptForType("product", ctx), 2000);
        const seo = normalizeSeoResponse("product", raw);

        await db
          .update(productsTable)
          .set({
            metaTitle: String(seo.metaTitle ?? ""),
            metaDescription: String(seo.metaDescription ?? ""),
            altText: seo.altText ? String(seo.altText) : undefined,
            updatedAt: new Date(),
          })
          .where(eq(productsTable.id, p.id));

        results.push({ id: p.id, name: p.name, ok: true });
      } catch (e: unknown) {
        results.push({
          id: p.id,
          name: p.name,
          ok: false,
          error: e instanceof Error ? e.message : "failed",
        });
      }
    }

    res.json({
      processed: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Bulk SEO failed";
    res.status(500).json({ error: message });
  }
});

/**
 * POST /admin/seo/ai/blog-write
 */
router.post("/admin/seo/ai/blog-write", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const { topic, targetKeyword, tone = "informative", wordCount = 800 } = req.body as {
      topic: string;
      targetKeyword?: string;
      tone?: string;
      wordCount?: number;
    };

    if (!topic?.trim()) {
      res.status(400).json({ error: "topic is required" });
      return;
    }

    const ctx: SeoGenerateContext = { topic, targetKeyword, tone, wordCount: Number(wordCount) || 800 };
    const raw = await runSeoAi(getPromptForType("blog-full", ctx), 4000);
    const result = normalizeSeoResponse("blog-full", raw);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Blog generation failed";
    logger.error({ err }, "AI blog write failed");
    res.status(500).json({ error: message });
  }
});

/**
 * POST /admin/seo/ai/apply-product/:id
 * Generate SEO and persist to product row
 */
router.post("/admin/seo/ai/apply-product/:id", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    let categoryName = "Dry Fruits & Nuts";
    if (product.categoryId) {
      const [cat] = await db
        .select({ name: categoriesTable.name })
        .from(categoriesTable)
        .where(eq(categoriesTable.id, product.categoryId))
        .limit(1);
      if (cat) categoryName = cat.name;
    }

    const ctx: SeoGenerateContext = {
      name: product.name,
      description: product.description ?? undefined,
      price: product.price ?? undefined,
      category: categoryName,
      ...(req.body as SeoGenerateContext),
    };

    const raw = await runSeoAi(getPromptForType("product", ctx), 2200);
    const seo = normalizeSeoResponse("product", raw);

    const [updated] = await db
      .update(productsTable)
      .set({
        metaTitle: String(seo.metaTitle ?? product.metaTitle ?? ""),
        metaDescription: String(seo.metaDescription ?? product.metaDescription ?? ""),
        altText: seo.altText ? String(seo.altText) : product.altText,
        updatedAt: new Date(),
      })
      .where(eq(productsTable.id, id))
      .returning();

    res.json({ product: updated, seo });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Apply failed" });
  }
});

/* ═══════════════════════════════════════════════════════
   301 REDIRECT MANAGER
═══════════════════════════════════════════════════════ */

router.get("/admin/seo/redirects", adminMiddleware as any, async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, source_path, target_url, redirect_type, hits, is_active, note, created_at, updated_at
      FROM seo_redirects ORDER BY created_at DESC
    `);
    res.json(rows.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Error" });
  }
});

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
    res.json((row as { rows?: unknown[] }).rows?.[0] ?? row);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Error" });
  }
});

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
    res.json((rows as { rows?: unknown[] }).rows?.[0] ?? {});
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Error" });
  }
});

router.delete("/admin/seo/redirects/:id", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM seo_redirects WHERE id = ${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Error" });
  }
});

/* ═══════════════════════════════════════════════════════
   SEO DASHBOARD
═══════════════════════════════════════════════════════ */

router.get("/admin/seo/dashboard", adminMiddleware as any, async (_req: Request, res: Response) => {
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
      SELECT count(*) as count FROM products
      WHERE active = true AND meta_title IS NOT NULL AND trim(meta_title) != ''
    `);

    const productsWithoutSeo = await db.execute(sql`
      SELECT count(*) as count FROM products
      WHERE active = true AND (meta_title IS NULL OR trim(meta_title) = '')
    `);

    const categoriesWithSeo = await db.execute(sql`
      SELECT count(*) as count FROM categories
      WHERE meta_title IS NOT NULL AND trim(meta_title) != ''
    `);

    res.json({
      indexing: {
        configured: !!indexingSettings[0]?.serviceAccountJson,
        autoEnabled: indexingSettings[0]?.autoIndexEnabled ?? false,
        siteUrl: indexingSettings[0]?.siteUrl ?? null,
        recentLogs: indexingLogs,
        stats7d: (indexStats as { rows?: unknown[] }).rows ?? [],
      },
      merchant: {
        enabled: merchantSettings[0]?.feedEnabled ?? false,
        brand: merchantSettings[0]?.brand ?? null,
        storeUrl: merchantSettings[0]?.storeUrl ?? null,
        lastSync: (merchantSettings[0] as { updatedAt?: Date })?.updatedAt ?? null,
      },
      seo: {
        sitemapEnabled: seoSettings[0]?.sitemapEnabled ?? false,
        canonicalDomain: seoSettings[0]?.canonicalDomain ?? null,
        hasGtm: !!((seoSettings[0] as { gtm_id?: string })?.gtm_id),
        hasGa4: !!((seoSettings[0] as { ga4_id?: string })?.ga4_id),
        hasOrg: !!((seoSettings[0] as { org_name?: string })?.org_name),
      },
      content: {
        products: Number(productCount[0]?.count ?? 0),
        blogs: Number(blogCount[0]?.count ?? 0),
        redirects: Number(((redirectCount as { rows?: { count?: string }[] }).rows?.[0] as { count?: string })?.count ?? 0),
        productsWithSeo: Number(((productsWithSeo as { rows?: { count?: string }[] }).rows?.[0] as { count?: string })?.count ?? 0),
        productsWithoutSeo: Number(((productsWithoutSeo as { rows?: { count?: string }[] }).rows?.[0] as { count?: string })?.count ?? 0),
        categoriesWithSeo: Number(((categoriesWithSeo as { rows?: { count?: string }[] }).rows?.[0] as { count?: string })?.count ?? 0),
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
  } catch (err: unknown) {
    logger.error({ err }, "SEO dashboard failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Dashboard failed" });
  }
});

router.get("/admin/seo/redirects/stats", adminMiddleware as any, async (_req: Request, res: Response) => {
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
    res.json((stats as { rows?: unknown[] }).rows?.[0] ?? {});
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Error" });
  }
});

export default router;
