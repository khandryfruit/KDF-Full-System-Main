import { Router } from "express";
import { db, aiSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { resolveOpenAIClient } from "../lib/resolveOpenAI";

const router = Router();

/* ═══════════════════════════════════════════════
   MULTI-PROVIDER CLIENT FACTORY
═══════════════════════════════════════════════ */
async function getAiSettings() {
  const [s] = await db.select().from(aiSettingsTable).limit(1);
  if (!s?.aiEnabled) {
    throw Object.assign(new Error("AI is disabled. Enable it in AI Settings."), { status: 503 });
  }
  return s;
}

async function callAI(
  task: "chat" | "content" | "seo" | "image" | "whatsapp",
  systemPrompt: string,
  userPrompt: string,
  opts?: { maxTokens?: number; jsonMode?: boolean; temperature?: number }
): Promise<string> {
  const s = await getAiSettings();
  const routing = (s.taskRouting ?? {}) as Record<string, string>;
  const provider = routing[task] ?? s.primaryProvider ?? "openai";
  const fallback  = s.fallbackProvider ?? "";
  const temperature = opts?.temperature ?? (s.creativityLevel ?? 70) / 100;
  const maxTokens   = opts?.maxTokens ?? 1200;

  try {
    return await callProvider(provider, s, systemPrompt, userPrompt, { temperature, maxTokens, jsonMode: opts?.jsonMode ?? true });
  } catch (e: any) {
    if (fallback && fallback !== provider) {
      return await callProvider(fallback, s, systemPrompt, userPrompt, { temperature, maxTokens, jsonMode: opts?.jsonMode ?? true });
    }
    throw e;
  }
}

async function callProvider(
  provider: string,
  s: typeof aiSettingsTable.$inferSelect,
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature: number; maxTokens: number; jsonMode: boolean }
): Promise<string> {
  if (provider === "gemini") {
    if (!s.geminiApiKey) throw new Error("Gemini API key not configured");
    const genai = new GoogleGenerativeAI(s.geminiApiKey);
    const model = genai.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens,
        responseMimeType: opts.jsonMode ? "application/json" : "text/plain",
      },
    });
    const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
    return result.response.text();
  }

  if (provider === "deepseek") {
    if (!s.deepseekApiKey) throw new Error("DeepSeek API key not configured");
    const client = new OpenAI({ apiKey: s.deepseekApiKey, baseURL: "https://api.deepseek.com" });
    const r = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      max_completion_tokens: opts.maxTokens,
      temperature: opts.temperature,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    });
    return r.choices[0]?.message?.content ?? "{}";
  }

  if (provider === "claude") {
    if (!s.claudeApiKey) throw new Error("Claude API key not configured");
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": s.claudeApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: opts.maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    const data = await resp.json() as any;
    if (!resp.ok) throw new Error(data.error?.message ?? "Claude API error");
    return data.content?.[0]?.text ?? "{}";
  }

  /* default: OpenAI */
  const openaiKey = (s.openaiApiKey ?? "").trim() || (process.env.OPENAI_API_KEY ?? "").trim();
  if (!openaiKey) throw new Error("OpenAI API key not configured");
  const client = new OpenAI({ apiKey: openaiKey, organization: s.openaiOrgId || undefined });
  const r = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    max_completion_tokens: opts.maxTokens,
    temperature: opts.temperature,
    ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
  });
  return r.choices[0]?.message?.content ?? "{}";
}

/* backward compat — admin AI routes expect { client, settings } */
export async function getOpenAIClient() {
  const { client } = await resolveOpenAIClient();
  const [s] = await db.select().from(aiSettingsTable).limit(1);
  if (!s) {
    throw Object.assign(new Error("AI settings row missing. Open Admin → AI Content once to initialize."), { status: 503 });
  }
  return { client, settings: s };
}

/* ═══════════════════════════════════════════════
   BUILD SYSTEM PROMPT (with personality + human-like level)
═══════════════════════════════════════════════ */
function buildSystemPrompt(s: typeof aiSettingsTable.$inferSelect): string {
  const base = s.systemPrompt || "You are an expert eCommerce content writer for KDF NUTS.";
  const humanLevel = s.humanLikeLevel ?? 80;
  const personality = s.personality ?? "professional";

  const personalityMap: Record<string, string> = {
    professional:   "Communicate in a clear, authoritative, and trustworthy manner.",
    friendly:       "Be warm, approachable, and conversational — like a trusted friend.",
    luxury:         "Sound exclusive, sophisticated, and aspirational.",
    "sales-expert": "Be persuasive, confident, and urgency-driven. Close sales naturally.",
    "seo-expert":   "Focus on keyword-rich, search-engine-friendly language.",
    "urdu-native":  "Blend Urdu naturally into English (Roman Urdu style is fine).",
    viral:          "Write punchy, shareable, scroll-stopping content.",
  };

  const humanInstructions = humanLevel >= 80
    ? "Write exactly like a real, expert human — use natural sentence variation, occasional emphasis, and confident assertions. NEVER sound like a bot."
    : humanLevel >= 50
    ? "Write clearly and naturally."
    : "Be concise and direct.";

  return `${base}\n\nPersonality: ${personalityMap[personality] ?? personalityMap["professional"]}\n${humanInstructions}`;
}

/* ═══════════════════════════════════════════════
   AI SETTINGS — GET / PUT
═══════════════════════════════════════════════ */
router.get("/admin/ai/settings", adminMiddleware as any, async (req, res) => {
  try {
    const [s] = await db.select().from(aiSettingsTable).limit(1);
    if (!s) return res.json(null);
    return res.json({
      ...s,
      openaiApiKey:   s.openaiApiKey   ? `sk-...${s.openaiApiKey.slice(-4)}`   : "",
      geminiApiKey:   s.geminiApiKey   ? `AIza...${s.geminiApiKey.slice(-4)}`  : "",
      deepseekApiKey: s.deepseekApiKey ? `sk-...${s.deepseekApiKey.slice(-4)}` : "",
      claudeApiKey:   s.claudeApiKey   ? `sk-...${s.claudeApiKey.slice(-4)}`   : "",
      _hasOpenai:   !!s.openaiApiKey,
      _hasGemini:   !!s.geminiApiKey,
      _hasDeepseek: !!s.deepseekApiKey,
      _hasClaude:   !!s.claudeApiKey,
    });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.put("/admin/ai/settings", adminMiddleware as any, async (req, res) => {
  try {
    const body = req.body as Record<string, any>;
    const existing = await db.select().from(aiSettingsTable).limit(1);
    const cur = existing[0];

    const keepIfMasked = (incoming: string | undefined, current: string) =>
      incoming && !incoming.includes("...") ? incoming : current;

    const payload = {
      systemPrompt:       body.systemPrompt       ?? cur?.systemPrompt       ?? "",
      tone:               body.tone               ?? cur?.tone               ?? "professional",
      language:           body.language           ?? cur?.language           ?? "english",
      openaiApiKey:       keepIfMasked(body.openaiApiKey,   cur?.openaiApiKey   ?? ""),
      openaiOrgId:        body.openaiOrgId        ?? cur?.openaiOrgId        ?? "",
      geminiApiKey:       keepIfMasked(body.geminiApiKey,   cur?.geminiApiKey   ?? ""),
      deepseekApiKey:     keepIfMasked(body.deepseekApiKey, cur?.deepseekApiKey ?? ""),
      claudeApiKey:       keepIfMasked(body.claudeApiKey,   cur?.claudeApiKey   ?? ""),
      primaryProvider:    body.primaryProvider    ?? cur?.primaryProvider    ?? "openai",
      fallbackProvider:   body.fallbackProvider   ?? cur?.fallbackProvider   ?? "",
      taskRouting:        body.taskRouting        ?? cur?.taskRouting        ?? {},
      personality:        body.personality        ?? cur?.personality        ?? "professional",
      creativityLevel:    body.creativityLevel    ?? cur?.creativityLevel    ?? 70,
      responseLength:     body.responseLength     ?? cur?.responseLength     ?? "medium",
      salesAggressiveness:body.salesAggressiveness?? cur?.salesAggressiveness?? 60,
      humanLikeLevel:     body.humanLikeLevel     ?? cur?.humanLikeLevel     ?? 80,
      imageProvider:      body.imageProvider      ?? cur?.imageProvider      ?? "openai",
      imageStyle:         body.imageStyle         ?? cur?.imageStyle         ?? "premium-ecommerce",
      autoGenerateImages: body.autoGenerateImages ?? cur?.autoGenerateImages ?? false,
      imageQuality:       body.imageQuality       ?? cur?.imageQuality       ?? "standard",
      brandColors:        body.brandColors        ?? cur?.brandColors        ?? "#5FA800,#F58300",
      aiEnabled:          body.aiEnabled          ?? cur?.aiEnabled          ?? false,
      updatedAt: new Date(),
    };

    let saved: typeof aiSettingsTable.$inferSelect;
    if (cur) {
      [saved] = await db.update(aiSettingsTable).set(payload).where(eq(aiSettingsTable.id, cur.id)).returning();
    } else {
      [saved] = await db.insert(aiSettingsTable).values(payload).returning();
    }

    return res.json({
      ...saved,
      openaiApiKey:   saved.openaiApiKey   ? `sk-...${saved.openaiApiKey.slice(-4)}`   : "",
      geminiApiKey:   saved.geminiApiKey   ? `AIza...${saved.geminiApiKey.slice(-4)}`  : "",
      deepseekApiKey: saved.deepseekApiKey ? `sk-...${saved.deepseekApiKey.slice(-4)}` : "",
      claudeApiKey:   saved.claudeApiKey   ? `sk-...${saved.claudeApiKey.slice(-4)}`   : "",
      _hasOpenai:   !!saved.openaiApiKey,
      _hasGemini:   !!saved.geminiApiKey,
      _hasDeepseek: !!saved.deepseekApiKey,
      _hasClaude:   !!saved.claudeApiKey,
    });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════
   AI GENERATE — CONTENT
═══════════════════════════════════════════════ */
router.post("/admin/ai/generate", adminMiddleware as any, async (req, res) => {
  try {
    const { type, name, keywords, category, existingContent, tone: reqTone, language: reqLang } = req.body as {
      type: string; name?: string; keywords?: string; category?: string;
      existingContent?: string; tone?: string; language?: string;
    };

    const s = await getAiSettings();
    const tone     = reqTone  ?? s.tone     ?? "professional";
    const language = reqLang  ?? s.language ?? "english";
    const sysPrompt = buildSystemPrompt(s);
    const lang     = language === "urdu" ? "Urdu" : "English";
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

      case "product-description-human":
        userPrompt = `Write a natural, human-sounding product description.
Product: "${name ?? ""}"
Category: "${category ?? ""}"
Keywords: "${keywords ?? ""}"
Structure:
1. Hook: One attention-grabbing opening sentence
2. Benefits: 3-4 health/quality/freshness benefits in <ul><li>
3. Origin: Where it's sourced / how it's processed
4. Usage ideas: How customers can enjoy it
5. CTA: One compelling closing sentence
Rules: Write like a real human — conversational, warm, confident. 150–250 words. Use <p>, <strong>, <ul><li>.
Return JSON: { "description": "Full HTML", "shortDescription": "One-sentence under 120 chars" }
Language: ${lang}.`;
        break;

      case "product-seo":
        userPrompt = `Generate SEO metadata for a product page.
Product: "${name ?? ""}"
Category: "${category ?? ""}"
Keywords: "${keywords ?? ""}"
Return JSON: { "metaTitle": "50-60 chars", "metaDescription": "150-160 chars", "keywords": "comma-separated" }
Language: ${lang}.`;
        break;

      case "category-description":
        userPrompt = `Write a category description for an eCommerce store.
Category: "${name ?? ""}"
Keywords: "${keywords ?? ""}"
Return JSON: { "description": "2 paragraphs in HTML <p>", "metaTitle": "50-60 chars", "metaDescription": "150-160 chars" }
Language: ${lang}. Tone: ${toneDesc}.`;
        break;

      case "blog-post":
        userPrompt = `Write a full SEO-optimized blog article for a dry fruits/nuts eCommerce store.
Topic: "${name ?? ""}"
Keywords: "${keywords ?? ""}"
Return JSON: {
  "title": "Compelling blog title",
  "content": "Full article in HTML with <h2>, <h3>, <p>, <ul><li>. Min 600 words.",
  "excerpt": "2-sentence summary",
  "metaTitle": "50-60 chars",
  "metaDescription": "150-160 chars",
  "keywords": "comma-separated keywords"
}
Language: ${lang}. Tone: ${toneDesc}.`;
        break;

      case "blog-improve":
        userPrompt = `Improve and enhance the following blog content.
EXISTING CONTENT:\n${existingContent ?? ""}
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
        userPrompt = `Shorten the following content while keeping key points.
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
Return JSON: { "altText": "Under 125 characters" }
Language: ${lang}.`;
        break;

      case "fix-grammar":
        userPrompt = `Fix all grammar, spelling, and punctuation in the following HTML content. Keep HTML structure.
CONTENT:\n${existingContent ?? ""}
Return JSON: { "content": "Fixed HTML content" }
Language: ${lang}.`;
        break;

      case "seo-optimize":
        userPrompt = `Rewrite the following product description to be fully SEO-optimized for Google.
Product: "${name ?? ""}"
Category: "${category ?? ""}"
Keywords: "${keywords ?? ""}"
EXISTING:\n${existingContent ?? ""}
Requirements: Include focus keywords naturally, use <h2>/<h3> headings, <ul><li> bullets, short sentences, semantic keywords, compelling CTA. 150-350 words.
Return JSON: { "content": "SEO-optimized HTML" }
Language: ${lang}.`;
        break;

      case "high-converting":
        userPrompt = `Rewrite as high-converting sales copy for a premium eCommerce store.
Product: "${name ?? ""}"
Category: "${category ?? ""}"
EXISTING:\n${existingContent ?? ""}
Requirements: Powerful emotional hook, power words (premium, handpicked, freshly roasted), subtle urgency, trust signals, 3-5 benefit bullets, strong CTA. Warm, engaging, persuasive.
Return JSON: { "content": "High-converting HTML sales copy" }
Language: ${lang}.`;
        break;

      case "wa-campaign":
        userPrompt = `Write a WhatsApp marketing message for a dry fruits/nuts store.
Campaign purpose: "${name ?? ""}"
Target: "${keywords ?? "existing customers"}"
Return JSON: {
  "message": "WhatsApp-friendly message under 300 chars, no HTML",
  "cta": "Call-to-action text",
  "emoji": "2-3 relevant emojis"
}
Language: ${lang}. Tone: ${toneDesc}.`;
        break;

      case "email-subject":
        userPrompt = `Write 5 compelling email subject lines for a dry fruits/nuts eCommerce store.
Campaign: "${name ?? ""}"
Return JSON: { "subjects": ["subject1", "subject2", "subject3", "subject4", "subject5"] }
Language: ${lang}.`;
        break;

      case "ad-copy":
        userPrompt = `Write ad copy (Meta/Google) for a product.
Product: "${name ?? ""}"
Keywords: "${keywords ?? ""}"
Return JSON: {
  "headline": "30 chars max",
  "description": "90 chars max",
  "cta": "Short CTA button text"
}
Language: ${lang}.`;
        break;

      default:
        return res.status(400).json({ error: `Unknown generation type: ${type}` });
    }

    const raw = await callAI("content", sysPrompt, userPrompt, { maxTokens: 1400 });
    let parsed: Record<string, any>;
    try { parsed = JSON.parse(raw); } catch { parsed = { content: raw }; }
    return res.json(parsed);

  } catch (e: any) {
    req.log?.error(e, "AI generation error");
    return res.status(e.status ?? 500).json({ error: e.message ?? "AI generation failed" });
  }
});

/* ═══════════════════════════════════════════════
   AI IMAGE GENERATION
═══════════════════════════════════════════════ */
router.post("/admin/ai/generate-image", adminMiddleware as any, async (req, res) => {
  try {
    const { prompt, style, subject, quality, size } = req.body as {
      prompt?: string; style?: string; subject?: string;
      quality?: string; size?: string;
    };

    const s = await getAiSettings();
    const provider = s.imageProvider ?? "openai";
    const imageStyle = style ?? s.imageStyle ?? "premium-ecommerce";
    const brandColors = s.brandColors ?? "#5FA800,#F58300";

    const styleDescriptions: Record<string, string> = {
      "premium-ecommerce": "professional ecommerce product photo, white background, studio lighting, sharp focus, 8K quality",
      "lifestyle":         "lifestyle photography, warm natural lighting, aspirational, high-end editorial style",
      "luxury":            "luxury brand aesthetic, dark moody tones, gold accents, premium packaging feel",
      "minimal":           "minimalist, clean white space, modern design, Scandinavian aesthetic",
      "3d-render":         "3D rendered, photorealistic, volumetric lighting, product visualization",
      "instagram":         "Instagram-worthy, vibrant colors, trendy flat-lay style, social media ready",
      "food-photography":  "professional food photography, mouth-watering, Michelin-star presentation, natural light",
    };

    const styleDesc = styleDescriptions[imageStyle] ?? styleDescriptions["premium-ecommerce"];
    const finalPrompt = prompt
      ? `${prompt}. Style: ${styleDesc}. Brand colors: ${brandColors}.`
      : `${subject ?? "premium dry fruits and nuts"} product image. ${styleDesc}. Brand colors: ${brandColors}. KDF NUTS brand, Pakistan premium quality.`;

    if (provider === "gemini") {
      if (!s.geminiApiKey) return res.status(503).json({ error: "Gemini API key not configured" });

      const genai = new GoogleGenerativeAI(s.geminiApiKey);
      const model = genai.getGenerativeModel({ model: "gemini-2.0-flash-exp-image-generation" });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: `Generate a photorealistic image: ${finalPrompt}` }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] } as any,
      });

      const parts = result.response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const img = (part as any).inlineData;
        if (img?.mimeType?.startsWith("image/")) {
          return res.json({
            imageData: `data:${img.mimeType};base64,${img.data}`,
            provider: "gemini",
            prompt: finalPrompt,
          });
        }
      }
      return res.status(500).json({ error: "Gemini did not return an image" });
    }

    /* OpenAI DALL-E */
    if (!s.openaiApiKey) return res.status(503).json({ error: "OpenAI API key not configured" });
    const client = new OpenAI({ apiKey: s.openaiApiKey, organization: s.openaiOrgId || undefined });
    const imgQuality = quality === "hd" ? "hd" : "standard";
    const imgSize = (size ?? "1024x1024") as "1024x1024" | "1792x1024" | "1024x1792";

    const response = await client.images.generate({
      model: "dall-e-3",
      prompt: finalPrompt,
      n: 1,
      size: imgSize,
      quality: imgQuality,
    });

    return res.json({
      imageUrl: response.data[0]?.url,
      provider: "openai",
      prompt: response.data[0]?.revised_prompt ?? finalPrompt,
    });

  } catch (e: any) {
    req.log?.error(e, "AI image generation error");
    return res.status(e.status ?? 500).json({ error: e.message ?? "Image generation failed" });
  }
});

/* ═══════════════════════════════════════════════
   AI PROVIDER TEST
═══════════════════════════════════════════════ */
router.post("/admin/ai/test-provider", adminMiddleware as any, async (req, res) => {
  try {
    const { provider } = req.body as { provider: string };
    const [s] = await db.select().from(aiSettingsTable).limit(1);
    if (!s) return res.status(503).json({ error: "No AI settings found" });

    const testPrompt = "Reply with JSON: { \"ok\": true, \"message\": \"Connection successful\" }";
    const testSys    = "You are a test agent. Always reply with the exact JSON requested.";

    const fakeSettings = { ...s, aiEnabled: true };
    const raw = await callProvider(provider, fakeSettings, testSys, testPrompt, {
      temperature: 0.1, maxTokens: 100, jsonMode: true,
    });

    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = { ok: true, raw }; }
    return res.json({ provider, ...parsed });
  } catch (e: any) {
    return res.status(500).json({ error: e.message, provider: req.body?.provider });
  }
});

export default router;
