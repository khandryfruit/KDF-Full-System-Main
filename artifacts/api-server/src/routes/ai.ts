import { Router } from "express";
import { db, aiSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import OpenAI from "openai";

const router = Router();

/* ─── helpers ──────────────────────────────────────── */
async function getOpenAIClient() {
  const [s] = await db.select().from(aiSettingsTable).limit(1);
  if (!s?.openaiApiKey || !s.aiEnabled) {
    throw Object.assign(new Error("AI is not configured or disabled. Please set your OpenAI API key in AI Content settings."), { status: 503 });
  }
  const client = new OpenAI({
    apiKey: s.openaiApiKey,
    organization: s.openaiOrgId || undefined,
  });
  return { client, settings: s };
}

/* ─── AI Settings ─────────────────────────────────── */
router.get("/admin/ai/settings", adminMiddleware as any, async (req, res) => {
  try {
    const [s] = await db.select().from(aiSettingsTable).limit(1);
    if (!s) return res.json(null);
    /* mask the key for display — only show last 4 chars */
    return res.json({
      ...s,
      openaiApiKey: s.openaiApiKey ? `sk-...${s.openaiApiKey.slice(-4)}` : "",
      _hasKey: !!s.openaiApiKey,
    });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.put("/admin/ai/settings", adminMiddleware as any, async (req, res) => {
  try {
    const { systemPrompt, tone, language, openaiApiKey, openaiOrgId, aiEnabled } = req.body as {
      systemPrompt?: string; tone?: string; language?: string;
      openaiApiKey?: string; openaiOrgId?: string; aiEnabled?: boolean;
    };

    const existing = await db.select().from(aiSettingsTable).limit(1);
    const currentKey = existing[0]?.openaiApiKey ?? "";

    /* if the client sends back the masked placeholder, keep existing key */
    const newKey = openaiApiKey && !openaiApiKey.startsWith("sk-...") ? openaiApiKey : currentKey;

    const payload = {
      systemPrompt: systemPrompt ?? "",
      tone: tone ?? "professional",
      language: language ?? "english",
      openaiApiKey: newKey,
      openaiOrgId: openaiOrgId ?? existing[0]?.openaiOrgId ?? "",
      aiEnabled: aiEnabled ?? existing[0]?.aiEnabled ?? false,
      updatedAt: new Date(),
    };

    if (existing.length > 0) {
      const [u] = await db.update(aiSettingsTable).set(payload).where(eq(aiSettingsTable.id, existing[0]!.id)).returning();
      return res.json({ ...u, openaiApiKey: u.openaiApiKey ? `sk-...${u.openaiApiKey.slice(-4)}` : "", _hasKey: !!u.openaiApiKey });
    }
    const [c] = await db.insert(aiSettingsTable).values(payload).returning();
    return res.status(201).json({ ...c, openaiApiKey: c.openaiApiKey ? `sk-...${c.openaiApiKey.slice(-4)}` : "", _hasKey: !!c.openaiApiKey });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── AI Generate ──────────────────────────────────── */
router.post("/admin/ai/generate", adminMiddleware as any, async (req, res) => {
  try {
    const { type, name, keywords, category, existingContent, tone: reqTone, language: reqLang } = req.body as {
      type: string; name?: string; keywords?: string; category?: string;
      existingContent?: string; tone?: string; language?: string;
    };

    const { client, settings } = await getOpenAIClient();
    const tone      = reqTone  ?? settings.tone     ?? "professional";
    const language  = reqLang  ?? settings.language ?? "english";
    const sysPrompt = settings.systemPrompt || "You are an expert eCommerce content writer for KDF NUTS, a premium dry fruits and nuts store in Pakistan.";

    const lang = language === "urdu" ? "Urdu" : "English";
    const toneDesc = tone === "friendly" ? "friendly and conversational" : tone === "marketing" ? "persuasive and marketing-focused" : "professional";

    let userPrompt = "";

    switch (type) {
      case "product-title":
        userPrompt = `Generate a compelling, SEO-optimized product title for an eCommerce store.
Product name hint: "${name ?? ""}"
Keywords: "${keywords ?? ""}"
Category: "${category ?? ""}"
Return JSON: { "title": "..." }
The title should be concise (under 70 chars). Language: ${lang}. Tone: ${toneDesc}.`;
        break;

      case "product-description":
        userPrompt = `Write a high-converting product description for an eCommerce listing.
Product: "${name ?? ""}"
Category: "${category ?? ""}"
Keywords: "${keywords ?? ""}"
Return JSON:
{
  "description": "2-3 paragraph HTML description using <p> tags and <ul><li> bullet points for benefits",
  "shortDescription": "1-sentence summary under 120 chars"
}
Language: ${lang}. Tone: ${toneDesc}. Include key benefits, quality, and a subtle call-to-action.`;
        break;

      case "product-seo":
        userPrompt = `Generate SEO metadata for a product page.
Product: "${name ?? ""}"
Category: "${category ?? ""}"
Keywords: "${keywords ?? ""}"
Return JSON:
{
  "metaTitle": "SEO title 50-60 chars",
  "metaDescription": "Compelling description 150-160 chars",
  "keywords": "comma-separated keyword list"
}
Language: ${lang}.`;
        break;

      case "category-description":
        userPrompt = `Write a category description for an eCommerce store.
Category: "${name ?? ""}"
Keywords: "${keywords ?? ""}"
Return JSON:
{
  "description": "2 paragraphs in HTML using <p> tags",
  "metaTitle": "SEO title 50-60 chars",
  "metaDescription": "SEO description 150-160 chars"
}
Language: ${lang}. Tone: ${toneDesc}.`;
        break;

      case "blog-post":
        userPrompt = `Write a full, SEO-optimized blog article for a dry fruits/nuts eCommerce store.
Topic: "${name ?? ""}"
Keywords: "${keywords ?? ""}"
Return JSON:
{
  "title": "Compelling blog title",
  "content": "Full article in HTML with <h2>, <h3>, <p>, <ul><li> tags. Min 600 words.",
  "excerpt": "2-sentence summary",
  "metaTitle": "SEO title 50-60 chars",
  "metaDescription": "SEO description 150-160 chars",
  "keywords": "comma-separated keywords"
}
Language: ${lang}. Tone: ${toneDesc}.`;
        break;

      case "blog-improve":
        userPrompt = `Improve and enhance the following blog content.
EXISTING CONTENT:
${existingContent ?? ""}
Return JSON: { "content": "Improved HTML article", "excerpt": "2-sentence summary" }
Language: ${lang}. Tone: ${toneDesc}.`;
        break;

      case "rewrite":
        userPrompt = `Rewrite the following content to be more ${toneDesc}.
CONTENT: ${existingContent ?? ""}
Return JSON: { "content": "Rewritten content" }
Language: ${lang}.`;
        break;

      case "shorten":
        userPrompt = `Shorten the following content while keeping the key points.
CONTENT: ${existingContent ?? ""}
Return JSON: { "content": "Shortened version" }
Language: ${lang}.`;
        break;

      case "expand":
        userPrompt = `Expand the following content with more details and engaging information.
CONTENT: ${existingContent ?? ""}
Return JSON: { "content": "Expanded version" }
Language: ${lang}. Tone: ${toneDesc}.`;
        break;

      case "alt-text":
        userPrompt = `Write concise, descriptive alt text for a product image.
Product: "${name ?? ""}"
Description: "${existingContent ?? ""}"
Return JSON: { "altText": "Descriptive alt text under 125 characters" }
Language: ${lang}.`;
        break;

      case "fix-grammar":
        userPrompt = `Fix all grammar, spelling, and punctuation mistakes in the following product description HTML.
Keep the same HTML structure and meaning. Only fix language errors — do not change the content.
CONTENT:
${existingContent ?? ""}
Return JSON: { "content": "Fixed HTML content" }
Language: ${lang}.`;
        break;

      case "seo-optimize":
        userPrompt = `Rewrite the following product description to be fully SEO-optimized for Google search.
Product name: "${name ?? ""}"
Category: "${category ?? ""}"
Keywords: "${keywords ?? ""}"
EXISTING CONTENT:
${existingContent ?? ""}

Requirements:
- Naturally include focus keywords (product name + category) in first paragraph
- Add H2/H3 headings using HTML tags
- Use <ul><li> bullet points for benefits/features
- Write short, scannable sentences (max 20 words each)
- Include semantic/LSI keywords naturally
- Add a compelling CTA at the end
- Minimum 150 words, maximum 350 words
- Sound natural and human, not robotic

Return JSON: { "content": "SEO-optimized HTML description" }
Language: ${lang}.`;
        break;

      case "high-converting":
        userPrompt = `Rewrite the following product description as a high-converting sales copy for a premium eCommerce store.
Product name: "${name ?? ""}"
Category: "${category ?? ""}"
EXISTING CONTENT:
${existingContent ?? ""}

Requirements:
- Open with a powerful emotional hook (first line must grab attention)
- Highlight premium quality, freshness, and health benefits
- Use power words: premium, handpicked, freshly roasted, natural, rich, wholesome
- Add subtle urgency (e.g., "Limited stock available", "Bestseller")
- Build trust with sourcing details (e.g., "Sourced directly from...")
- Include 3–5 benefit bullet points using <ul><li>
- End with a strong CTA (e.g., "Order now and taste the difference")
- Write like a professional human copywriter — warm, engaging, persuasive
- Use <p>, <strong>, <ul><li> HTML tags

Return JSON: { "content": "High-converting HTML sales copy" }
Language: ${lang}.`;
        break;

      case "product-description-human":
        userPrompt = `Write a natural, human-sounding product description for an eCommerce listing.
Product: "${name ?? ""}"
Category: "${category ?? ""}"
Keywords: "${keywords ?? ""}"

Structure to follow:
1. Hook: One attention-grabbing opening sentence
2. Benefits: 3-4 health/quality/freshness benefits in <ul><li>
3. Origin: Where it's sourced / how it's processed
4. Usage ideas: How customers can enjoy it
5. CTA: One compelling closing sentence

Rules:
- Write like a real human — conversational, warm, confident
- Avoid clichés like "look no further" or "top-notch quality"
- Use simple English, short sentences
- Use <p>, <strong>, <ul><li> HTML tags
- 150–250 words total

Return JSON:
{
  "description": "Full HTML description",
  "shortDescription": "One-sentence summary under 120 chars"
}
Language: ${lang}.`;
        break;

      default:
        return res.status(400).json({ error: `Unknown generation type: ${type}` });
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user",   content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1200,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, string>;
    try { parsed = JSON.parse(raw); } catch { parsed = { content: raw }; }

    return res.json(parsed);
  } catch (e: any) {
    req.log?.error(e, "AI generation error");
    const status = e.status ?? 500;
    return res.status(status).json({ error: e.message ?? "AI generation failed" });
  }
});

export default router;
