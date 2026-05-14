import { Router, type Request } from "express";
import { db, socialSettingsTable, socialLogsTable, productsTable, socialLeadsTable } from "@workspace/db";
import { eq, desc, sql, and, asc } from "drizzle-orm";
import { adminMiddleware, type AuthRequest } from "../lib/auth";
import { logger } from "../lib/logger";
import { resolveOpenAIClient } from "../lib/resolveOpenAI";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const router = Router();

const recentSocialPayloads: Array<{ ts: string; platform: string; body: unknown }> = [];

/* ─── OAuth state helpers (signed JWT — stateless, multi-instance safe) ─ */
const OAUTH_STATE_TTL_S = 10 * 60; // 10 minutes

function createOAuthState(adminId: number): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not configured");
  return jwt.sign(
    { adminId, nonce: crypto.randomBytes(16).toString("hex") },
    secret,
    { expiresIn: OAUTH_STATE_TTL_S },
  );
}

function verifyOAuthState(state: string): { adminId: number } {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not configured");
  return jwt.verify(state, secret) as { adminId: number };
}

/* ─── Helper: get OpenAI client ─────────────────────── */
async function getOpenAIClient() {
  const { client } = await resolveOpenAIClient();
  return client;
}

/* ─── Helper: get social settings ───────────────────── */
async function getSocialSettings() {
  const [s] = await db.select().from(socialSettingsTable).limit(1);
  return s ?? null;
}

/* ─── Helper: get products for AI context ──────────── */
async function getProductsForAI() {
  try {
    const prods = await db.select({
      name: productsTable.name,
      price: productsTable.price,
      slug: productsTable.slug,
    }).from(productsTable).where(eq(productsTable.active, true)).limit(20);
    return prods.map(p => ({ name: p.name, price: String(p.price), slug: p.slug }));
  } catch { return []; }
}

/* ─── Helper: detect product/price intent ──────────── */
function detectProductIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return [
    "price","rate","kitna","cost","mehnga","sasta","amount",
    "buy","order","khareed","chahiye","lena","milega","dena",
    "available","stock","kya hai","product","item","catalog",
    "almond","badam","cashew","kaju","pistachio","pista",
    "walnut","akhrot","raisin","kishmish","dates","khajoor",
    "fig","anjeer","chilgoza","khubani","dry fruit","nut",
    "mixed","combo","pack","kg","gram","discount","offer","sale",
  ].some(kw => lower.includes(kw));
}

/* ─── Helper: extract PK phone from text ───────────── */
function extractPhone(text: string): string | null {
  const m = text.match(/(?:\+92|0)3[0-9]{9}/);
  return m ? m[0] : null;
}

/* ─── Helper: upsert social lead ────────────────────── */
async function upsertSocialLead(opts: {
  platform: string; senderId: string; senderName: string | null;
  interest: string | null; phone?: string | null;
}) {
  try {
    const { platform, senderId, senderName, interest, phone } = opts;
    const [ex] = await db.select({ id: socialLeadsTable.id, messageCount: socialLeadsTable.messageCount })
      .from(socialLeadsTable).where(and(eq(socialLeadsTable.platform, platform), eq(socialLeadsTable.senderId, senderId))).limit(1);
    if (ex) {
      await db.update(socialLeadsTable).set({
        ...(senderName ? { senderName } : {}),
        lastSeenAt: new Date(),
        messageCount: (ex.messageCount ?? 1) + 1,
        ...(interest ? { interest } : {}),
        ...(phone ? { phone } : {}),
      }).where(eq(socialLeadsTable.id, ex.id));
    } else {
      await db.insert(socialLeadsTable).values({ platform, senderId, senderName, interest, phone: phone ?? null });
    }
  } catch { /* non-critical */ }
}

/* ─── Helper: get public domain ─────────────────────── */
/* Priority:
   1. META_DOMAIN_OVERRIDE env var — explicit production custom domain
   2. X-Forwarded-Host header (non-Replit custom domain, e.g. admin.khanbabadryfruits.com)
   3. REPLIT_DOMAINS (Replit deployment domain)
   4. REPLIT_DEV_DOMAIN (Replit dev tunnel)
*/
function getPublicDomain(req?: Request): string {
  /* 1. Explicit custom domain override */
  const override = process.env.META_DOMAIN_OVERRIDE?.trim();
  if (override) return override.startsWith("http") ? override : `https://${override}`;

  /* 2. X-Forwarded-Host — detect custom domain (ignore Replit's own domains) */
  if (req) {
    const fwdHost = ((req.headers["x-forwarded-host"] as string) ?? "").split(",")[0].trim();
    const fwdProto = ((req.headers["x-forwarded-proto"] as string) ?? "").split(",")[0].trim() || "https";
    if (fwdHost && !fwdHost.includes("replit.dev") && !fwdHost.includes("replit.app")) {
      return `${fwdProto}://${fwdHost}`;
    }
  }

  /* 3. Replit production domains */
  const prodDomains = process.env.REPLIT_DOMAINS ?? "";
  const prodPrimary = prodDomains.split(",")[0]?.trim();
  if (prodPrimary) return `https://${prodPrimary}`;

  /* 4. Replit dev tunnel */
  const devDomain = process.env.REPLIT_DEV_DOMAIN ?? "";
  if (devDomain) return `https://${devDomain}`;

  return "";
}

/* ─── Helper: generate AI reply for social ──────────── */
async function generateSocialAiReply(opts: {
  platform: "instagram" | "facebook";
  type: "dm" | "comment";
  senderId: string;
  senderName: string | null;
  incomingText: string;
  postContext?: string;
  products?: Array<{ name: string; price: string; slug: string }>;
  settings: Awaited<ReturnType<typeof getSocialSettings>>;
}): Promise<string | null> {
  try {
    const { settings, platform, type, senderName, incomingText, postContext, products } = opts;
    if (!settings?.isEnabled) return null;
    if (type === "dm" && !settings.dmReplyEnabled) return null;
    if (type === "comment" && !settings.commentReplyEnabled) return null;

    const dailyCap = settings.maxDailyReplies ?? 200;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayCount = await db.execute(
      sql`SELECT COUNT(*) AS cnt FROM social_logs WHERE status = 'sent' AND created_at >= ${todayStart.toISOString()}`
    );
    const sentToday = Number((todayCount as any)?.rows?.[0]?.cnt ?? 0);
    if (sentToday >= dailyCap) return null;

    const nameCtx = senderName ? `The customer's name is ${senderName}.` : "";
    const platformCtx = `You are replying on ${platform === "instagram" ? "Instagram" : "Facebook"} to a ${type}.`;
    const postCtx = postContext ? `\n\nPost context: ${postContext}` : "";
    const commentInstruction = type === "comment"
      ? "\n\nIMPORTANT: This is a PUBLIC comment reply. Keep it SHORT (1-2 sentences max). End by encouraging them to DM you for details and ordering."
      : "";

    /* ── Product catalog context ── */
    let productCtx = "";
    if (products && products.length > 0) {
      const domain = getPublicDomain();
      const list = products.map(p =>
        `• ${p.name} — Rs. ${p.price}${domain ? ` | Order: ${domain}/product/${p.slug}` : ""}`
      ).join("\n");
      productCtx = `\n\n📦 AVAILABLE PRODUCTS (share relevant ones based on what customer asks):\n${list}\n\nAlways mention price. For DMs, share the order link. Be specific — don't list all products, pick the most relevant 2-3.`;
    }

    const systemPrompt = (settings.systemPrompt ?? "") + productCtx + `\n\n${platformCtx} ${nameCtx}${postCtx}${commentInstruction}`;

    const aiClient = await getOpenAIClient();
    const completion = await aiClient.chat.completions.create({
      model: settings.aiModel ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: incomingText },
      ],
      max_completion_tokens: type === "comment" ? 150 : 450,
    });
    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    return null;
  }
}

/* ─── Helper: call Meta Graph API ───────────────────── */
const META_API_VERSION = "v22.0";
const META_GRAPH_BASE  = `https://graph.facebook.com/${META_API_VERSION}`;

async function replyToInstagramDm(opts: {
  recipientId: string;
  message: string;
  accessToken: string;
  igAccountId?: string | null;
}) {
  /* IG Business Account ID endpoint with messaging_type RESPONSE (required for within-24h window) */
  const endpoint = opts.igAccountId
    ? `${META_GRAPH_BASE}/${opts.igAccountId}/messages`
    : `${META_GRAPH_BASE}/me/messages`;
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.accessToken}` },
    body: JSON.stringify({
      recipient:      { id: opts.recipientId },
      message:        { text: opts.message },
      messaging_type: "RESPONSE",
    }),
  });
}

async function replyToComment(opts: {
  commentId: string;
  message: string;
  accessToken: string;
}) {
  return fetch(`${META_GRAPH_BASE}/${opts.commentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.accessToken}` },
    body: JSON.stringify({ message: opts.message }),
  });
}

async function sendFbMessengerReply(opts: {
  recipientId: string;
  message: string;
  pageId: string;
  accessToken: string;
}) {
  return fetch(`${META_GRAPH_BASE}/${opts.pageId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.accessToken}` },
    body: JSON.stringify({
      recipient: { id: opts.recipientId },
      message: { text: opts.message },
      messaging_type: "RESPONSE",
    }),
  });
}

/* ══════════════════════════════════════════════════════
   SHARED WEBHOOK PROCESSORS
   Meta sends ALL events to ONE webhook URL. Both /webhooks/instagram
   and /webhooks/facebook check body.object and route accordingly.
   ══════════════════════════════════════════════════════ */

async function processIgWebhookBody(body: any, settings: Awaited<ReturnType<typeof getSocialSettings>>, opts?: { simulate?: boolean }) {
  const isSimulate = opts?.simulate ?? false;
  if (!settings?.igEnabled) { logger.warn("IG processor skipped — igEnabled is false"); return; }

  /* Deep entry-level log so we can trace exactly what IDs arrive */
  logger.info({
    entryCount: body.entry?.length ?? 0,
    entries: (body.entry ?? []).map((e: any) => ({
      entryId: e.id,
      messagingCount: e.messaging?.length ?? 0,
      changesCount:   e.changes?.length ?? 0,
      changeFields:   e.changes?.map((c: any) => c.field) ?? [],
      messagingItems: (e.messaging ?? []).map((m: any) => ({
        senderId:    m.sender?.id ?? null,
        recipientId: m.recipient?.id ?? null,
        text:        m.message?.text?.slice(0, 80) ?? null,
        isEcho:      m.message?.is_echo ?? false,
        messageKeys: m.message ? Object.keys(m.message) : [],
      })),
      changeItems: (e.changes ?? []).map((c: any) => ({
        field:      c.field,
        commentId:  c.value?.id ?? null,
        text:       c.value?.text?.slice(0, 80) ?? null,
        fromId:     c.value?.from?.id ?? null,
        fromName:   c.value?.from?.name ?? null,
        mediaId:    c.value?.media?.id ?? null,
        valueKeys:  c.value ? Object.keys(c.value) : [],
      })),
    })),
  }, "IG processor: raw entry structure");

  for (const entry of (body.entry ?? [])) {

    /* ── Instagram DMs (messaging[]) ── */
    for (const event of (entry.messaging ?? [])) {
      const senderId = event.sender?.id as string | undefined;
      const text = event.message?.text as string | undefined;
      if (!senderId || !text || event.message?.is_echo) continue;

      logger.info({ senderId, textLen: text.length }, "IG DM received");
      const [logRow] = await db.insert(socialLogsTable).values({
        platform: "instagram", type: "dm", senderId, incomingText: text, status: "pending",
      }).returning();

      const hasIntent = detectProductIntent(text);
      const products  = hasIntent ? await getProductsForAI() : [];
      const phone     = extractPhone(text);
      upsertSocialLead({ platform: "instagram", senderId, senderName: null, interest: hasIntent ? text.slice(0, 150) : null, phone }).catch(() => {});

      const aiReply = await generateSocialAiReply({
        platform: "instagram", type: "dm", senderId, senderName: null, incomingText: text, products, settings,
      });
      if (!aiReply || !settings.pageAccessToken) {
        if (logRow) await db.update(socialLogsTable).set({ status: "no_reply" }).where(eq(socialLogsTable.id, logRow.id));
        continue;
      }

      if (isSimulate) {
        /* Simulation: don't hit Meta API — fake SIM_ IDs are rejected. Log AI reply as "simulated". */
        logger.info({ senderId, aiReply: aiReply.slice(0, 80) }, "IG DM simulation — skipping Meta API call");
        if (logRow) await db.update(socialLogsTable).set({ aiReply, status: "simulated" }).where(eq(socialLogsTable.id, logRow.id));
        continue;
      }
      const replyRes = await replyToInstagramDm({
        recipientId: senderId, message: aiReply, accessToken: settings.pageAccessToken,
        igAccountId: settings.igBusinessAccountId,
      });
      const status = replyRes.ok ? "sent" : "failed";
      const errText = replyRes.ok ? null : await replyRes.text().catch(() => null);
      if (errText) logger.warn({ err: errText, senderId }, "IG DM reply failed");
      if (logRow) await db.update(socialLogsTable).set({ aiReply, status, error: errText }).where(eq(socialLogsTable.id, logRow.id));
    }

    /* ── Instagram Comments (changes[].field === "comments") ── */
    for (const change of (entry.changes ?? [])) {
      if (change.field !== "comments") continue;
      const val = change.value as any;
      const commentId = val?.id as string | undefined;
      const text = val?.text as string | undefined;
      const senderId = val?.from?.id as string | undefined;
      const senderName = val?.from?.name as string | undefined;
      const postId = val?.media?.id as string | undefined;
      if (!commentId || !text) continue;

      logger.info({ commentId, senderId, textLen: text.length }, "IG comment received");
      const [logRow] = await db.insert(socialLogsTable).values({
        platform: "instagram", type: "comment",
        senderId: senderId ?? null, senderName: senderName ?? null,
        commentId, postId: postId ?? null, incomingText: text, status: "pending",
      }).returning();

      upsertSocialLead({ platform: "instagram", senderId: senderId ?? "anon", senderName: senderName ?? null, interest: text.slice(0, 150) }).catch(() => {});

      const aiReply = await generateSocialAiReply({
        platform: "instagram", type: "comment", senderId: senderId ?? "", senderName: senderName ?? null, incomingText: text, settings,
      });
      if (!aiReply || !settings.pageAccessToken) {
        if (logRow) await db.update(socialLogsTable).set({ status: "no_reply" }).where(eq(socialLogsTable.id, logRow.id));
        continue;
      }

      if (isSimulate) {
        logger.info({ commentId, aiReply: aiReply.slice(0, 80) }, "IG comment simulation — skipping Meta API call");
        if (logRow) await db.update(socialLogsTable).set({ aiReply, status: "simulated" }).where(eq(socialLogsTable.id, logRow.id));
        continue;
      }
      const replyRes = await replyToComment({ commentId, message: aiReply, accessToken: settings.pageAccessToken });
      const status = replyRes.ok ? "sent" : "failed";
      const errText = replyRes.ok ? null : await replyRes.text().catch(() => null);
      if (errText) logger.warn({ err: errText, commentId }, "IG comment reply failed");
      if (logRow) await db.update(socialLogsTable).set({ aiReply, status, error: errText }).where(eq(socialLogsTable.id, logRow.id));

      /* Auto follow-up DM */
      if (replyRes.ok && settings.autoFollowUpDm && senderId && settings.pageAccessToken) {
        const followUpMsg = `شکریہ آپ کے comment کا 😊\n\nDetails آپ کی inbox میں send کر دی ہیں — please check کریں! ہم آپ کی مدد کرنے کے لیے تیار ہیں 💚\n\n— KDF NUTS Team`;
        await replyToInstagramDm({
          recipientId: senderId, message: followUpMsg, accessToken: settings.pageAccessToken,
          igAccountId: settings.igBusinessAccountId,
        }).catch(() => {});
      }
    }
  }
}

async function processFbWebhookBody(body: any, settings: Awaited<ReturnType<typeof getSocialSettings>>, opts?: { simulate?: boolean }) {
  const isSimulate = opts?.simulate ?? false;
  if (!settings?.fbEnabled) { logger.warn("FB processor skipped — fbEnabled is false"); return; }

  /* Deep entry-level log so we can trace exactly what IDs arrive */
  logger.info({
    entryCount: body.entry?.length ?? 0,
    entries: (body.entry ?? []).map((e: any) => ({
      entryId: e.id,
      messagingCount: e.messaging?.length ?? 0,
      changesCount:   e.changes?.length ?? 0,
      changeFields:   e.changes?.map((c: any) => c.field) ?? [],
      messagingItems: (e.messaging ?? []).map((m: any) => ({
        senderId:    m.sender?.id ?? null,
        recipientId: m.recipient?.id ?? null,
        text:        m.message?.text?.slice(0, 80) ?? null,
        isEcho:      m.message?.is_echo ?? false,
        messageKeys: m.message ? Object.keys(m.message) : [],
      })),
      changeItems: (e.changes ?? []).map((c: any) => ({
        field:      c.field,
        item:       c.value?.item ?? null,
        commentId:  c.value?.comment_id ?? null,
        text:       c.value?.message?.slice(0, 80) ?? null,
        senderId:   c.value?.sender_id ? String(c.value.sender_id) : null,
        senderName: c.value?.sender_name ?? null,
        postId:     c.value?.post_id ?? null,
        valueKeys:  c.value ? Object.keys(c.value) : [],
      })),
    })),
  }, "FB processor: raw entry structure");

  for (const entry of (body.entry ?? [])) {
    const pageId = entry.id as string | undefined;

    /* ── Facebook Messenger DMs (messaging[]) ── */
    for (const event of (entry.messaging ?? [])) {
      const senderId = event.sender?.id as string | undefined;
      const text = event.message?.text as string | undefined;
      if (!senderId || !text || event.message?.is_echo || senderId === pageId) continue;

      logger.info({ senderId, textLen: text.length }, "FB Messenger DM received");
      const [logRow] = await db.insert(socialLogsTable).values({
        platform: "facebook", type: "dm", senderId, incomingText: text, status: "pending",
      }).returning();

      const fbHasIntent = detectProductIntent(text);
      const fbProducts  = fbHasIntent ? await getProductsForAI() : [];
      const fbPhone     = extractPhone(text);
      upsertSocialLead({ platform: "facebook", senderId, senderName: null, interest: fbHasIntent ? text.slice(0, 150) : null, phone: fbPhone }).catch(() => {});

      const aiReply = await generateSocialAiReply({
        platform: "facebook", type: "dm", senderId, senderName: null, incomingText: text, products: fbProducts, settings,
      });
      if (!aiReply || !settings.pageAccessToken || !settings.fbPageId) {
        if (logRow) await db.update(socialLogsTable).set({ status: "no_reply" }).where(eq(socialLogsTable.id, logRow.id));
        continue;
      }

      if (isSimulate) {
        logger.info({ senderId, aiReply: aiReply.slice(0, 80) }, "FB DM simulation — skipping Meta API call");
        if (logRow) await db.update(socialLogsTable).set({ aiReply, status: "simulated" }).where(eq(socialLogsTable.id, logRow.id));
        continue;
      }
      const replyRes = await sendFbMessengerReply({
        recipientId: senderId, message: aiReply, pageId: settings.fbPageId, accessToken: settings.pageAccessToken,
      });
      const status = replyRes.ok ? "sent" : "failed";
      const errText = replyRes.ok ? null : await replyRes.text().catch(() => null);
      if (errText) logger.warn({ err: errText, senderId }, "FB DM reply failed");
      if (logRow) await db.update(socialLogsTable).set({ aiReply, status, error: errText }).where(eq(socialLogsTable.id, logRow.id));
    }

    /* ── Facebook Post Comments (changes[].field === "feed") ── */
    for (const change of (entry.changes ?? [])) {
      if (change.field !== "feed") continue;
      const val = change.value as any;
      if (val?.item !== "comment") continue;
      const commentId = val?.comment_id as string | undefined;
      const text = val?.message as string | undefined;
      const senderId = val?.sender_id ? String(val.sender_id) : undefined;
      const senderName = val?.sender_name as string | undefined;
      const postId = val?.post_id as string | undefined;
      if (!commentId || !text) continue;

      logger.info({ commentId, senderId, textLen: text.length }, "FB comment received");
      const [logRow] = await db.insert(socialLogsTable).values({
        platform: "facebook", type: "comment",
        senderId: senderId ?? null, senderName: senderName ?? null,
        commentId, postId: postId ?? null, incomingText: text, status: "pending",
      }).returning();

      upsertSocialLead({ platform: "facebook", senderId: senderId ?? "anon", senderName: senderName ?? null, interest: text.slice(0, 150) }).catch(() => {});

      const aiReply = await generateSocialAiReply({
        platform: "facebook", type: "comment", senderId: senderId ?? "", senderName: senderName ?? null, incomingText: text, settings,
      });
      if (!aiReply || !settings.pageAccessToken) {
        if (logRow) await db.update(socialLogsTable).set({ status: "no_reply" }).where(eq(socialLogsTable.id, logRow.id));
        continue;
      }

      if (isSimulate) {
        logger.info({ commentId, aiReply: aiReply.slice(0, 80) }, "FB comment simulation — skipping Meta API call");
        if (logRow) await db.update(socialLogsTable).set({ aiReply, status: "simulated" }).where(eq(socialLogsTable.id, logRow.id));
        continue;
      }
      const replyRes = await replyToComment({ commentId, message: aiReply, accessToken: settings.pageAccessToken });
      const status = replyRes.ok ? "sent" : "failed";
      const errText = replyRes.ok ? null : await replyRes.text().catch(() => null);
      if (errText) logger.warn({ err: errText, commentId }, "FB comment reply failed");
      if (logRow) await db.update(socialLogsTable).set({ aiReply, status, error: errText }).where(eq(socialLogsTable.id, logRow.id));

      /* Auto follow-up DM */
      if (replyRes.ok && settings.autoFollowUpDm && senderId && settings.pageAccessToken && settings.fbPageId) {
        const followUpMsg = `شکریہ آپ کے comment کا 😊\n\nDetails Messenger میں send کر دی ہیں — please inbox check کریں!\n\nKDF NUTS Team 💚`;
        await sendFbMessengerReply({ recipientId: senderId, message: followUpMsg, pageId: settings.fbPageId, accessToken: settings.pageAccessToken }).catch(() => {});
      }
    }
  }
}

/* ══════════════════════════════════════════════════════
   INSTAGRAM WEBHOOK
   ══════════════════════════════════════════════════════ */

/* Verify */
router.get("/webhooks/instagram", async (req, res) => {
  const mode = req.query["hub.mode"] as string | undefined;
  const token = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"] as string | undefined;
  const [settings] = await db.select({ token: socialSettingsTable.webhookVerifyToken }).from(socialSettingsTable).limit(1);
  const expected = settings?.token ?? "kdfnuts_social_token";
  if (mode === "subscribe" && token === expected) return res.status(200).send(challenge);
  return res.status(403).json({ error: "Forbidden" });
});

/* Events — handles BOTH object:"instagram" and object:"page" (Meta sends to one URL) */
router.post("/webhooks/instagram", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body as any;
    recentSocialPayloads.unshift({ ts: new Date().toISOString(), platform: `ig-hook(${body.object ?? "?"})`, body });
    if (recentSocialPayloads.length > 50) recentSocialPayloads.pop();
    logger.info({ object: body.object, entries: body.entry?.length ?? 0 }, "Instagram webhook received");

    const settings = await getSocialSettings();
    if (!settings?.isEnabled) return;

    /* Meta sometimes routes Page-object events to the IG webhook URL */
    if (body.object === "page") {
      await processFbWebhookBody(body, settings);
    } else {
      /* object === "instagram" or unset */
      await processIgWebhookBody(body, settings);
    }
  } catch (err) {
    logger.warn({ err }, "Instagram webhook processing error");
  }
});

/* ══════════════════════════════════════════════════════
   FACEBOOK WEBHOOK
   ══════════════════════════════════════════════════════ */

router.get("/webhooks/facebook", async (req, res) => {
  const mode = req.query["hub.mode"] as string | undefined;
  const token = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"] as string | undefined;
  const [settings] = await db.select({ token: socialSettingsTable.webhookVerifyToken }).from(socialSettingsTable).limit(1);
  const expected = settings?.token ?? "kdfnuts_social_token";
  if (mode === "subscribe" && token === expected) return res.status(200).send(challenge);
  return res.status(403).json({ error: "Forbidden" });
});

/* Events — handles BOTH object:"page" and object:"instagram" */
router.post("/webhooks/facebook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body as any;
    recentSocialPayloads.unshift({ ts: new Date().toISOString(), platform: `fb-hook(${body.object ?? "?"})`, body });
    if (recentSocialPayloads.length > 50) recentSocialPayloads.pop();
    logger.info({ object: body.object, entries: body.entry?.length ?? 0 }, "Facebook webhook received");

    const settings = await getSocialSettings();
    if (!settings?.isEnabled) return;

    /* Meta often sends Instagram DM/comment events to the Facebook webhook URL */
    if (body.object === "instagram") {
      await processIgWebhookBody(body, settings);
    } else {
      /* object === "page" or unset */
      await processFbWebhookBody(body, settings);
    }
  } catch (err) {
    logger.warn({ err }, "Facebook webhook processing error");
  }
});

/* ══════════════════════════════════════════════════════
   UNIFIED META WEBHOOK  (/api/meta/webhook)
   Single URL to register in Meta Developer Dashboard.
   Handles Instagram DMs, IG comments, FB Messenger, FB post comments.
   ══════════════════════════════════════════════════════ */

/* GET — Meta webhook verification challenge */
router.get("/meta/webhook", async (req, res) => {
  const mode      = req.query["hub.mode"]         as string | undefined;
  const token     = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"]    as string | undefined;
  const [settings] = await db.select({ token: socialSettingsTable.webhookVerifyToken }).from(socialSettingsTable).limit(1);
  const expected = settings?.token ?? "kdfnuts_social_token";
  logger.info({ mode, tokenMatch: token === expected }, "Meta webhook verification attempt");
  if (mode === "subscribe" && token === expected) return res.status(200).send(challenge);
  return res.status(403).json({ error: "Forbidden — verify token mismatch" });
});

/* POST — unified event handler (all IG + FB events come here) */
router.post("/meta/webhook", async (req, res) => {
  /* Must respond 200 immediately before processing — Meta times out in 20s */
  res.sendStatus(200);
  try {
    const body = req.body as any;
    recentSocialPayloads.unshift({ ts: new Date().toISOString(), platform: `meta-hook(${body.object ?? "?"})`, body });
    if (recentSocialPayloads.length > 50) recentSocialPayloads.pop();
    logger.info({ object: body.object, entries: body.entry?.length ?? 0 }, "Meta unified webhook received");

    /* ── WhatsApp Business Account — route to WA processor (bypasses social settings) ── */
    if (body.object === "whatsapp_business_account") {
      const { processWaWebhookBody } = await import("./whatsapp.js");
      await processWaWebhookBody(body, logger);
      return;
    }

    const settings = await getSocialSettings();
    if (!settings?.isEnabled) {
      logger.warn("Meta webhook skipped — social AI is disabled");
      return;
    }

    if (body.object === "instagram") {
      await processIgWebhookBody(body, settings);
    } else {
      /* object === "page" (Facebook) */
      await processFbWebhookBody(body, settings);
    }
  } catch (err) {
    logger.warn({ err }, "Meta webhook processing error");
  }
});

/* ══════════════════════════════════════════════════════
   META OAUTH — Auto Connect
   ══════════════════════════════════════════════════════ */

/* GET OAuth URL — returns the Facebook Login URL to open in a popup */
router.get("/admin/social/oauth/url", adminMiddleware as any, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const appId = process.env.META_APP_ID;
    if (!appId) return res.status(500).json({ error: "META_APP_ID not configured" });
    const domain = getPublicDomain(req);
    if (!domain) return res.status(500).json({ error: "Could not determine public domain" });
    /* Allow a fixed override for production deployments where the domain is stable */
    const redirectUri = process.env.META_REDIRECT_URI || `${domain}/api/admin/social/oauth/callback`;
    const scope = [
      "pages_show_list",
      "pages_messaging",
      "pages_manage_metadata",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_manage_messages",
      "instagram_manage_comments",
    ].join(",");
    /* Signed JWT state: stateless, multi-instance safe, bound to this admin's identity */
    const state = createOAuthState(authReq.user!.id);
    const url = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&state=${encodeURIComponent(state)}`;
    return res.json({ url, redirectUri });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* GET OAuth callback — Facebook redirects here after login; returns HTML popup that closes and notifies opener */
router.get("/admin/social/oauth/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;
  const errorDesc = req.query.error_description as string | undefined;
  const stateParam = req.query.state as string | undefined;

  const closePopupHtml = (success: boolean, data: Record<string, any>) => {
    const json = JSON.stringify({ success, ...data }).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
    const bg = success ? "#f0fdf4" : "#fff5f5";
    const emoji = success ? "✅" : "❌";
    const title = success ? "Connected!" : "Connection Failed";
    const bodyText = success
      ? `Facebook Page <strong>${data.pageName ?? ""}</strong>${data.igUsername ? ` &amp; Instagram <strong>@${data.igUsername}</strong>` : ""} connected successfully.`
      : `<span style="color:#dc2626">${data.error ?? "Unknown error"}</span>`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:${bg};">
  <div style="text-align:center;padding:2rem;background:white;border-radius:1rem;box-shadow:0 4px 24px rgba(0,0,0,.1);max-width:400px;width:90%;">
    <div style="font-size:3rem;margin-bottom:1rem;">${emoji}</div>
    <h2 style="margin:0 0 .5rem;color:#111;">${title}</h2>
    <p style="color:#444;margin:0 0 1.5rem;font-size:.9rem;line-height:1.5;">${bodyText}</p>
    <p style="color:#999;font-size:.75rem;">${success ? "This window will close in a moment…" : '<button onclick="window.close()" style="padding:.4rem 1.2rem;background:#dc2626;color:#fff;border:none;border-radius:.5rem;cursor:pointer;font-size:.85rem;">Close</button>'}</p>
  </div>
  <script>
    try { window.opener.postMessage(${json}, "*"); } catch(e) {}
    ${success ? "setTimeout(()=>window.close(),2000);" : ""}
  </script>
</body></html>`;
  };

  /* Validate CSRF state: verify the signed JWT before exchanging any code */
  if (!stateParam) {
    logger.warn("OAuth callback rejected: missing state parameter");
    res.setHeader("Content-Type", "text/html");
    return res.send(closePopupHtml(false, { error: "Invalid or expired OAuth state. Please try connecting again." }));
  }
  try {
    verifyOAuthState(stateParam);
  } catch {
    logger.warn("OAuth callback rejected: invalid or expired state JWT");
    res.setHeader("Content-Type", "text/html");
    return res.send(closePopupHtml(false, { error: "Invalid or expired OAuth state. Please try connecting again." }));
  }

  if (error || !code) {
    res.setHeader("Content-Type", "text/html");
    return res.send(closePopupHtml(false, { error: errorDesc || error || "No authorization code received" }));
  }

  try {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) throw new Error("META_APP_ID / META_APP_SECRET not configured");

    const domain = getPublicDomain(req);
    /* Must match exactly what was used to generate the OAuth URL */
    const redirectUri = process.env.META_REDIRECT_URI || `${domain}/api/admin/social/oauth/callback`;

    /* 1. Exchange code → short-lived user token */
    const tokenRes = await fetch(
      `${META_GRAPH_BASE}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error(tokenData.error?.message || "Token exchange failed");
    const shortLivedToken: string = tokenData.access_token;

    /* 2. Exchange → long-lived user token (60-day) */
    const llRes = await fetch(
      `${META_GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`
    );
    const llData = await llRes.json() as any;
    const longLivedToken: string = llData.access_token || shortLivedToken;
    const expiresIn: number = llData.expires_in ? Number(llData.expires_in) : 0;

    /* 3. Fetch Pages + their Page Access Tokens + linked IG account */
    const pagesRes = await fetch(
      `${META_GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longLivedToken}&limit=10`
    );
    const pagesData = await pagesRes.json() as any;
    const pages: any[] = pagesData.data ?? [];
    if (pages.length === 0) throw new Error("No Facebook Pages found. Make sure your Facebook account manages at least one Page.");

    /* Prefer the page that has an IG business account linked */
    const page = pages.find((p: any) => p.instagram_business_account) ?? pages[0];
    const pageId: string = page.id;
    const pageName: string = page.name;
    const pageAccessToken: string = page.access_token;
    const igId: string | null = page.instagram_business_account?.id ?? null;

    /* 4. Fetch IG username */
    let igUsername: string | null = null;
    if (igId) {
      const igRes = await fetch(
        `${META_GRAPH_BASE}/${igId}?fields=username,name&access_token=${pageAccessToken}`
      );
      const igData = await igRes.json() as any;
      igUsername = igData.username ?? null;
    }

    /* 5a. Subscribe the Facebook Page to webhook events */
    const subscribeFields = "messages,messaging_postbacks,feed,messaging_referrals";
    await fetch(
      `${META_GRAPH_BASE}/${pageId}/subscribed_apps?subscribed_fields=${encodeURIComponent(subscribeFields)}&access_token=${pageAccessToken}`,
      { method: "POST" }
    ).catch(() => { /* non-critical */ });

    /* 5b. Subscribe the Instagram Business Account to webhook events (comments + DMs) */
    if (igId) {
      const igFields = "messages,comments,mentions";
      await fetch(
        `${META_GRAPH_BASE}/${igId}/subscribed_apps?subscribed_fields=${encodeURIComponent(igFields)}&access_token=${pageAccessToken}`,
        { method: "POST" }
      ).catch(() => { /* non-critical */ });
    }

    /* 6. Upsert settings in DB */
    const tokenExpiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;
    const [existing] = await db.select({ id: socialSettingsTable.id }).from(socialSettingsTable).limit(1);
    const payload = {
      pageAccessToken,
      fbPageId: pageId,
      fbPageName: pageName,
      igBusinessAccountId: igId,
      igUsername,
      connectionMethod: "oauth",
      connectedAt: new Date(),
      tokenExpiresAt,
      isEnabled: true,
      igEnabled: !!igId,
      fbEnabled: true,
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(socialSettingsTable).set(payload).where(eq(socialSettingsTable.id, existing.id));
    } else {
      await db.insert(socialSettingsTable).values(payload);
    }

    res.setHeader("Content-Type", "text/html");
    return res.send(closePopupHtml(true, { pageName, igUsername }));
  } catch (err: any) {
    res.setHeader("Content-Type", "text/html");
    return res.send(closePopupHtml(false, { error: err.message || "Connection failed" }));
  }
});

/* POST disconnect — clears OAuth connection */
router.post("/admin/social/disconnect", adminMiddleware as any, async (req, res) => {
  try {
    const [existing] = await db.select({ id: socialSettingsTable.id }).from(socialSettingsTable).limit(1);
    if (!existing) return res.json({ success: true });
    await db.update(socialSettingsTable).set({
      pageAccessToken: null,
      fbPageId: null,
      fbPageName: null,
      igBusinessAccountId: null,
      igUsername: null,
      connectionMethod: null,
      connectedAt: null,
      tokenExpiresAt: null,
      isEnabled: false,
      igEnabled: true,
      fbEnabled: true,
      updatedAt: new Date(),
    }).where(eq(socialSettingsTable.id, existing.id));
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* POST webhook-subscribe — subscribe Page + IG account to all required webhook fields */
router.post("/admin/social/webhook-subscribe", adminMiddleware as any, async (req, res) => {
  try {
    const settings = await getSocialSettings();
    if (!settings?.pageAccessToken || !settings?.fbPageId) {
      return res.status(400).json({ error: "Page not connected. Connect via Facebook OAuth first." });
    }

    const results: Record<string, any> = {};

    /* 1. Subscribe Facebook Page */
    const fbFields = "messages,messaging_postbacks,feed,messaging_referrals";
    const fbR = await fetch(
      `${META_GRAPH_BASE}/${settings.fbPageId}/subscribed_apps?subscribed_fields=${encodeURIComponent(fbFields)}&access_token=${settings.pageAccessToken}`,
      { method: "POST" }
    );
    const fbData = await fbR.json() as any;
    if (!fbR.ok) {
      const fbError = fbData.error?.message || "Facebook subscribe failed";
      const fbCode  = fbData.error?.code ?? null;
      req.log.warn({ fbError, fbCode }, "Facebook subscribed_apps error");
      const hint = fbCode === 200
        ? " — App in Development mode; add your FB account as a tester in Meta Developer Console."
        : fbCode === 100
        ? " — Check that pages_manage_metadata permission is approved."
        : "";
      return res.status(400).json({ error: fbError + hint, fbCode, results });
    }
    results.facebook = { success: true, fields: fbFields };

    /* 2. Subscribe Instagram Business Account (if linked) */
    if (settings.igBusinessAccountId) {
      const igFields = "messages,comments,mentions,story_insights";
      try {
        const igR = await fetch(
          `${META_GRAPH_BASE}/${settings.igBusinessAccountId}/subscribed_apps?subscribed_fields=${encodeURIComponent(igFields)}&access_token=${settings.pageAccessToken}`,
          { method: "POST" }
        );
        const igData = await igR.json() as any;
        results.instagram = igR.ok
          ? { success: true, fields: igFields }
          : { success: false, error: igData.error?.message ?? "IG subscribe failed" };
      } catch (igErr: any) {
        results.instagram = { success: false, error: igErr.message };
      }
    } else {
      results.instagram = { success: false, error: "No Instagram Business Account linked" };
    }

    return res.json({ success: true, results });
  } catch (e: any) {
    req.log.error({ err: e }, "webhook-subscribe unexpected error");
    return res.status(500).json({ error: e.message });
  }
});

/* GET diagnostics — check token, subscriptions, IG connection */
router.get("/admin/social/diagnostics", adminMiddleware as any, async (req, res) => {
  try {
    const settings = await getSocialSettings();
    if (!settings?.pageAccessToken || !settings?.fbPageId) {
      return res.json({ connected: false, error: "Page not connected" });
    }

    const BASE = META_GRAPH_BASE;
    const tok  = settings.pageAccessToken;

    /* Token info */
    const tokenR = await fetch(`${BASE}/me?fields=id,name&access_token=${tok}`).catch(() => null);
    const tokenData = tokenR ? await tokenR.json() as any : {};

    /* Page subscriptions */
    const subR = await fetch(`${BASE}/${settings.fbPageId}/subscribed_apps?access_token=${tok}`).catch(() => null);
    const subData = subR ? await subR.json() as any : {};
    const subscriptions: string[] = (subData.data?.[0]?.subscribed_fields ?? []);

    /* IG account */
    let igInfo: any = null;
    if (settings.igBusinessAccountId) {
      const igR = await fetch(`${BASE}/${settings.igBusinessAccountId}?fields=id,name,username&access_token=${tok}`).catch(() => null);
      if (igR) igInfo = await igR.json() as any;
    }

    /* Token permissions (debug_token requires app token, use fields approach instead) */
    const pageR = await fetch(`${BASE}/${settings.fbPageId}?fields=id,name,instagram_business_account&access_token=${tok}`).catch(() => null);
    const pageData = pageR ? await pageR.json() as any : {};

    const checks = {
      fbPageConnected:    !tokenData.error,
      fbPageName:         pageData.name ?? settings.fbPageName ?? "?",
      igConnected:        !!igInfo && !igInfo.error,
      igUsername:         igInfo?.username ?? settings.igUsername ?? null,
      subscribedToFeed:   subscriptions.includes("feed"),
      subscribedToMsgs:   subscriptions.includes("messages"),
      subscribedFields:   subscriptions,
      igAccountId:        settings.igBusinessAccountId ?? null,
      pageId:             settings.fbPageId,
    };

    return res.json({ connected: true, checks, rawPageData: pageData });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ══════════════════════════════════════════════════════
   ADMIN ROUTES
   ══════════════════════════════════════════════════════ */

/* GET settings */
router.get("/admin/social/settings", adminMiddleware as any, async (req, res) => {
  try {
    const s = await getSocialSettings();
    return res.json(s ?? null);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* PUT settings */
router.put("/admin/social/settings", adminMiddleware as any, async (req, res) => {
  try {
    const {
      isEnabled, igEnabled, fbEnabled,
      pageAccessToken, igBusinessAccountId, fbPageId,
      webhookVerifyToken, aiModel, systemPrompt,
      commentReplyEnabled, dmReplyEnabled, autoFollowUpDm,
      replyDelaySec, maxDailyReplies,
    } = req.body;
    const [existing] = await db.select({ id: socialSettingsTable.id }).from(socialSettingsTable).limit(1);
    const payload = {
      isEnabled: isEnabled ?? false,
      igEnabled: igEnabled ?? true,
      fbEnabled: fbEnabled ?? true,
      pageAccessToken: pageAccessToken || null,
      igBusinessAccountId: igBusinessAccountId || null,
      fbPageId: fbPageId || null,
      webhookVerifyToken: webhookVerifyToken || "kdfnuts_social_token",
      aiModel: aiModel || "gpt-4o-mini",
      systemPrompt: systemPrompt || undefined,
      commentReplyEnabled: commentReplyEnabled ?? true,
      dmReplyEnabled: dmReplyEnabled ?? true,
      autoFollowUpDm: autoFollowUpDm ?? true,
      replyDelaySec: replyDelaySec ?? 10,
      maxDailyReplies: maxDailyReplies ?? 200,
      updatedAt: new Date(),
    };
    if (existing) {
      const [updated] = await db.update(socialSettingsTable).set(payload).where(eq(socialSettingsTable.id, existing.id)).returning();
      return res.json(updated);
    } else {
      const [created] = await db.insert(socialSettingsTable).values(payload).returning();
      return res.status(201).json(created);
    }
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* GET webhook info */
router.get("/admin/social/webhook-info", adminMiddleware as any, async (req, res) => {
  try {
    const domain = getPublicDomain(req);
    const [settings] = await db.select({
      token: socialSettingsTable.webhookVerifyToken,
      pageId: socialSettingsTable.fbPageId,
    }).from(socialSettingsTable).limit(1);
    const oauthCallbackUrl = process.env.META_REDIRECT_URI
      || (domain ? `${domain}/api/admin/social/oauth/callback` : null);
    /* Count real (non-simulated) webhook events received */
    let realEventCount = 0;
    try {
      const realRows = await db.execute(sql`SELECT COUNT(*) AS cnt FROM social_logs WHERE status != 'simulated'`);
      realEventCount = Number((realRows as any)?.rows?.[0]?.cnt ?? 0);
    } catch { /* non-critical */ }

    const metaWebhookUrl = domain ? `${domain}/api/meta/webhook` : null;
    return res.json({
      metaWebhookUrl,
      igWebhookUrl:    domain ? `${domain}/api/webhooks/instagram` : null,
      fbWebhookUrl:    domain ? `${domain}/api/webhooks/facebook` : null,
      oauthCallbackUrl,
      verifyToken: settings?.token ?? "kdfnuts_social_token",
      isProd: !!(process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim() || !!domain,
      detectedDomain: domain || null,
      pageId: settings?.pageId ?? null,
      realEventCount,
    });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* GET logs */
router.get("/admin/social/logs", adminMiddleware as any, async (req, res) => {
  try {
    const platform = req.query.platform as string | undefined;
    const type = req.query.type as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string || "100"), 200);
    let q = db.select().from(socialLogsTable).$dynamic();
    if (platform && platform !== "all") q = q.where(eq(socialLogsTable.platform, platform)) as any;
    if (type && type !== "all") q = (q as any).where(eq(socialLogsTable.type, type));
    const logs = await (q as any).orderBy(desc(socialLogsTable.createdAt)).limit(limit);
    return res.json(logs);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* GET stats */
router.get("/admin/social/stats", adminMiddleware as any, async (req, res) => {
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const rows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= ${todayStart.toISOString()}) AS today_total,
        COUNT(*) FILTER (WHERE status = 'sent' AND created_at >= ${todayStart.toISOString()}) AS today_sent,
        COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= ${todayStart.toISOString()}) AS today_failed,
        COUNT(*) FILTER (WHERE platform = 'instagram') AS total_ig,
        COUNT(*) FILTER (WHERE platform = 'facebook') AS total_fb,
        COUNT(*) FILTER (WHERE type = 'dm') AS total_dm,
        COUNT(*) FILTER (WHERE type = 'comment') AS total_comment,
        COUNT(*) AS grand_total
      FROM social_logs
    `);
    return res.json((rows as any)?.rows?.[0] ?? {});
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* GET recent webhook payloads with full parsed breakdown */
router.get("/admin/social/webhook-logs", adminMiddleware as any, (req, res) => {
  const parsed = recentSocialPayloads.slice(0, 40).map(p => {
    const body = p.body as any;
    const breakdown = (body.entry ?? []).map((e: any) => ({
      entryId: e.id ?? null,
      messaging: (e.messaging ?? []).map((m: any) => ({
        senderId:    m.sender?.id ?? null,
        recipientId: m.recipient?.id ?? null,
        text:        m.message?.text?.slice(0, 120) ?? null,
        isEcho:      m.message?.is_echo ?? false,
        messageId:   m.message?.mid ?? null,
        ok:          !!(m.sender?.id && m.message?.text && !m.message?.is_echo),
      })),
      changes: (e.changes ?? []).map((c: any) => {
        const v = c.value ?? {};
        const isIgComment = c.field === "comments";
        const isFbFeed    = c.field === "feed";
        return {
          field:      c.field,
          item:       v.item ?? null,
          commentId:  isIgComment ? (v.id ?? null) : (v.comment_id ?? null),
          text:       isIgComment ? (v.text?.slice(0, 120) ?? null) : (v.message?.slice(0, 120) ?? null),
          senderId:   isIgComment ? (v.from?.id ?? null) : (v.sender_id ? String(v.sender_id) : null),
          senderName: isIgComment ? (v.from?.name ?? null) : (v.sender_name ?? null),
          postId:     isIgComment ? (v.media?.id ?? null) : (v.post_id ?? null),
          valueKeys:  Object.keys(v),
          ok:         isIgComment ? !!(v.id && v.text) : isFbFeed ? !!(v.comment_id && v.message && v.item === "comment") : false,
        };
      }),
    }));
    return { ts: p.ts, platform: p.platform, object: body.object ?? null, entryCount: body.entry?.length ?? 0, breakdown };
  });
  res.json(parsed);
});

/* POST simulate-webhook — inject a fake event through the real processor */
router.post("/admin/social/simulate-webhook", adminMiddleware as any, async (req, res) => {
  try {
    const { platform, type, senderId: sid, text, commentId, senderName } = req.body as any;
    const fakeId = `SIM_${Date.now()}`;

    let fakeBody: any;
    if (platform === "instagram" && type === "dm") {
      fakeBody = { object: "instagram", entry: [{ id: fakeId, messaging: [{ sender: { id: sid || fakeId }, recipient: { id: "SIM_PAGE" }, message: { text: text || "Test DM — badam ka price kya hai?" } }] }] };
    } else if (platform === "facebook" && type === "dm") {
      fakeBody = { object: "page", entry: [{ id: fakeId, messaging: [{ sender: { id: sid || fakeId }, recipient: { id: fakeId }, message: { text: text || "Test DM — kaju available hai?" } }] }] };
    } else if (platform === "instagram" && type === "comment") {
      fakeBody = { object: "instagram", entry: [{ id: fakeId, changes: [{ field: "comments", value: { id: commentId || fakeId, text: text || "Price kya hai?", from: { id: sid || fakeId, name: senderName || "Test User" }, media: { id: "SIM_POST" } } }] }] };
    } else if (platform === "facebook" && type === "comment") {
      fakeBody = { object: "page", entry: [{ id: fakeId, changes: [{ field: "feed", value: { item: "comment", comment_id: commentId || fakeId, message: text || "Kaju ka price?", sender_id: sid || fakeId, sender_name: senderName || "Test User", post_id: "SIM_POST" } }] }] };
    } else {
      return res.status(400).json({ error: "Invalid platform or type" });
    }

    recentSocialPayloads.unshift({ ts: new Date().toISOString(), platform: `simulate(${platform}-${type})`, body: fakeBody });
    if (recentSocialPayloads.length > 50) recentSocialPayloads.pop();

    const settings = await getSocialSettings();
    if (!settings?.isEnabled) {
      return res.json({ success: false, skipped: true, reason: "AI engine is disabled — enable it in the AI Settings tab first" });
    }

    if (platform === "instagram") await processIgWebhookBody(fakeBody, settings, { simulate: true });
    else await processFbWebhookBody(fakeBody, settings, { simulate: true });

    return res.json({ success: true, message: "Simulation complete — check Activity Logs tab for the result" });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ══════════════════════════════════════════════════════
   INBOX / CONVERSATIONS
   ══════════════════════════════════════════════════════ */

/* GET conversations — unique senders with latest message */
router.get("/admin/social/conversations", adminMiddleware as any, async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (sender_id, platform)
        id, platform, type, sender_id, sender_name,
        incoming_text, ai_reply, status, created_at
      FROM social_logs
      WHERE sender_id IS NOT NULL
      ORDER BY sender_id, platform, created_at DESC
    `);
    const msgs: any[] = (rows as any)?.rows ?? [];

    /* Group by senderId+platform, keep latest */
    const map = new Map<string, any>();
    for (const row of msgs) {
      const key = `${row.platform}:${row.sender_id}`;
      if (!map.has(key)) map.set(key, row);
    }

    /* Attach message count */
    const counts = await db.execute(sql`
      SELECT platform, sender_id, COUNT(*) AS cnt
      FROM social_logs
      WHERE sender_id IS NOT NULL
      GROUP BY platform, sender_id
    `);
    const countMap = new Map<string, number>();
    for (const r of ((counts as any)?.rows ?? [])) {
      countMap.set(`${r.platform}:${r.sender_id}`, Number(r.cnt));
    }

    const conversations = Array.from(map.values()).map(c => ({
      ...c,
      messageCount: countMap.get(`${c.platform}:${c.sender_id}`) ?? 1,
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.json(conversations);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* GET thread for one sender */
router.get("/admin/social/conversations/:platform/:senderId", adminMiddleware as any, async (req, res) => {
  try {
    const { platform, senderId } = req.params;
    const msgs = await db.select().from(socialLogsTable)
      .where(and(eq(socialLogsTable.platform, platform), eq(socialLogsTable.senderId, senderId)))
      .orderBy(asc(socialLogsTable.createdAt)).limit(100);
    return res.json(msgs);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* POST manual reply */
router.post("/admin/social/reply", adminMiddleware as any, async (req, res) => {
  try {
    const { senderId, platform, message } = req.body as { senderId: string; platform: string; message: string };
    if (!senderId || !platform || !message?.trim()) {
      return res.status(400).json({ error: "senderId, platform, and message are required" });
    }
    const settings = await getSocialSettings();
    if (!settings?.pageAccessToken) return res.status(400).json({ error: "Page not connected" });

    let ok = false;
    if (platform === "instagram") {
      const r = await replyToInstagramDm({ recipientId: senderId, message: message.trim(), accessToken: settings.pageAccessToken });
      ok = r.ok;
    } else if (platform === "facebook" && settings.fbPageId) {
      const r = await sendFbMessengerReply({ recipientId: senderId, message: message.trim(), pageId: settings.fbPageId, accessToken: settings.pageAccessToken });
      ok = r.ok;
    }

    if (ok) {
      await db.insert(socialLogsTable).values({
        platform,
        type: "dm",
        senderId,
        incomingText: "[Manual reply sent by admin]",
        aiReply: message.trim(),
        status: "sent",
      });
    }

    return res.json({ success: ok });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════
   LEADS
   ══════════════════════════════════════════════════════ */

/* GET leads */
router.get("/admin/social/leads", adminMiddleware as any, async (req, res) => {
  try {
    const leads = await db.select().from(socialLeadsTable).orderBy(desc(socialLeadsTable.lastSeenAt)).limit(200);
    return res.json(leads);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* PATCH lead */
router.patch("/admin/social/leads/:id", adminMiddleware as any, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { isConverted, notes, phone } = req.body;
    const [updated] = await db.update(socialLeadsTable)
      .set({ ...(isConverted !== undefined ? { isConverted } : {}), ...(notes !== undefined ? { notes } : {}), ...(phone !== undefined ? { phone } : {}) })
      .where(eq(socialLeadsTable.id, id)).returning();
    return res.json(updated);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* POST test reply (simulate a message) */
router.post("/admin/social/test-reply", adminMiddleware as any, async (req, res) => {
  try {
    const { platform, type, senderName, message } = req.body as { platform: string; type: string; senderName: string; message: string };
    if (!message?.trim()) return res.status(400).json({ error: "message required" });
    const settings = await getSocialSettings();
    if (!settings) return res.status(404).json({ error: "Social settings not configured" });
    const reply = await generateSocialAiReply({
      platform: platform as any || "instagram",
      type: type as any || "dm",
      senderId: "test_sender",
      senderName: senderName || null,
      incomingText: message.trim(),
      settings,
    });
    return res.json({ success: !!reply, reply, message: reply ? "AI reply generated" : "AI not configured or disabled" });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

export default router;
