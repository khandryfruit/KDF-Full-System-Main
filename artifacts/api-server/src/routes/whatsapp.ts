import { Router } from "express";
import { db, aiSettingsTable, whatsappSettingsTable, whatsappTemplatesTable, whatsappLogsTable, chatbotSettingsTable, whatsappCampaignsTable, whatsappConversationStatesTable, waConversationsTable, waMessagesTable, waFlowsTable, waAutomationRulesTable, waAutomationLogsTable, waWebhookFailuresTable, socialSettingsTable, couponsTable, shippingRulesTable } from "@workspace/db";
import { ordersTable, orderItemsTable, usersTable, shipmentsTable, adminNotificationsTable } from "@workspace/db";
import { shopifyProductsTable, shopifyOrdersTable, shopifyStoresTable } from "@workspace/db";
import { eq, desc, asc, sql, ilike, or, and, inArray } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import { sendWhatsAppMessage, sendWhatsAppTemplate, sendInteractiveMenu, sendInteractiveButtons, sendCtaUrlMessage, normalizePhone, getConversationState, setConversationState, isGreeting, markWhatsAppMessageRead, sendWhatsAppTypingIndicator } from "../lib/whatsapp";
import { handleMenuItemTap } from "../lib/waMenuHandlers.js";
import { DEFAULT_GREETING, KHAN_BRAND_NAME, KHAN_WEBSITE_URL } from "../lib/waMenuDefaults.js";
import { broadcastSSE } from "../lib/sse";
import type OpenAI from "openai";
import { resolveOpenAIClient } from "../lib/resolveOpenAI";
import { createAdminAlert } from "../lib/adminAlerts.js";
import { buildAiBrainSystemPrompt } from "../lib/aiBrain.js";
import crypto from "crypto";
import { logger } from "../lib/logger";
import { verifyMetaWebhookSignatureAny, isValidMetaWebhookVerifyToken } from "../lib/metaWebhookVerify";
import { getMetaAppSecrets, getMetaAppSecret } from "../lib/waSecrets";
import { buildWhatsappHealthReport } from "../lib/whatsappHealth.js";
import { classifyWaFailure } from "../lib/waFailureClassifier.js";
import { createAdminAlert } from "../lib/adminAlerts.js";
import {
  expandWaProductSearchTerms,
  searchShopifyProductIdsByAlias,
  fetchShopifyProductsByIds,
  productRootTermsFromQuery,
} from "../lib/shopifyProductSearch.js";
import {
  loadConversationMemory,
  persistConversationTurn,
  shouldBlockRepeatedReply,
  buildMemorySummaryBlock,
  isActiveCommerceFlow,
} from "../lib/whatsappConversationMemory.js";
import { isDeliveryOnlyMessage, isTrackingOnlyMessage, tryDeterministicWaReply, sendDeterministicWaReply } from "../lib/waIntentEngine.js";

const router = Router();

/* ─── In-memory webhook payload log (last 50) ────────── */
const recentWebhookPayloads: Array<{ ts: string; body: unknown }> = [];

export function rememberWhatsappWebhookPayload(body: unknown): void {
  recentWebhookPayloads.unshift({ ts: new Date().toISOString(), body });
  if (recentWebhookPayloads.length > 50) recentWebhookPayloads.pop();
}

/* ─── Helper: get OpenAI client (DB key or OPENAI_API_KEY env) ────────── */
async function getOpenAIClient() {
  const { client } = await resolveOpenAIClient();
  return client;
}

async function logWaProcessingStep(opts: {
  phone?: string | null;
  messageId?: string | null;
  step: string;
  status?: "received" | "sent" | "failed";
  detail?: string | null;
  payload?: unknown;
  failureReason?: string | null;
}) {
  await db.insert(whatsappLogsTable).values({
    phone: opts.phone ?? "system",
    messageId: opts.messageId ?? null,
    templateName: `processing:${opts.step}`,
    message: opts.detail ?? opts.step,
    status: opts.status ?? "received",
    response: opts.payload ? JSON.stringify(opts.payload).slice(0, 4000) : null,
    failureReason: opts.failureReason ?? null,
  } as any).catch(() => {});
}

type WaIntent =
  | "greeting"
  | "conversation"
  | "product_search"
  | "pricing"
  | "recommendation"
  | "bulk_order"
  | "order_start"
  | "tracking"
  | "delivery"
  | "cancellation"
  | "complaint"
  | "human_agent"
  | "support"
  | "general";

function normalizeIntentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectWaIntent(text: string): { intent: WaIntent; confidence: number; reason: string; productQuery?: string } {
  const t = normalizeIntentText(text);
  const has = (words: string[]) => words.some((w) => t.includes(w));
  const exact = (words: string[]) => words.includes(t);
  const productWords = [
    "almond", "almonds", "badam", "pista", "pistay", "pisty", "piste", "pistah", "pieta", "pietas", "peta", "pistachio", "pistachios", "kaju", "cashew", "cashews",
    "akhrot", "walnut", "walnuts", "khajoor", "dates", "anjeer", "fig", "figs", "kishmish", "raisin",
    "raisins", "munakka", "makhana", "dry fruit", "dry fruits", "nuts", "peanut", "peanuts", "chilgoza",
  ];
  const productActionWords = ["price", "rate", "qeemat", "kitna", "how much", "chahiye", "chaye", "chahye", "chaiye", "chahe", "need", "show", "available", "recommend", "suggest", "best"];
  const billWords = ["bill", "bil", "invoice", "receipt", "bna", "bana", "banao", "bnao", "bejo", "bhejo", "bhej do", "checkout", "total bna", "total bana"];
  if (has(["cancel order", "order cancel", "cancel kr", "cancel kar", "nahi chahiye"])) return { intent: "cancellation", confidence: 0.94, reason: "cancel keyword" };
  if (isDeliveryOnlyMessage(text)) return { intent: "delivery", confidence: 0.92, reason: "delivery/shipping keyword without product" };
  if (has(["track", "tracking", "where is my order", "order status", "mera order", "parcel kahan"])) return { intent: "tracking", confidence: 0.9, reason: "tracking/status keyword" };
  if (has(["delivery kahan", "delivery status", "parcel status"])) return { intent: "tracking", confidence: 0.88, reason: "delivery status = tracking" };
  if (has(["complaint", "shikayat", "problem", "issue", "refund", "return", "bad quality", "damage"])) return { intent: "complaint", confidence: 0.9, reason: "complaint keyword" };
  if (has(["human", "agent", "representative", "real person", "admin se", "support se", "call me", "phone kar", "baat karni hai", "bat krni h", "bat krna h", "baat krna", "baat karna"])) return { intent: "conversation", confidence: 0.9, reason: "conversation/human support phrase" };
  if (has(["bulk", "wholesale", "20kg", "10kg", "5kg", "carton", "large quantity"])) return { intent: "bulk_order", confidence: 0.9, reason: "bulk order keyword", productQuery: productWords.find((w) => t.includes(w)) };
  if (has(billWords) && has(productWords)) return { intent: "order_start", confidence: 0.92, reason: "product + bill/checkout keyword", productQuery: productWords.find((w) => t.includes(w)) };
  if (has(billWords)) return { intent: "order_start", confidence: 0.82, reason: "bill/checkout keyword without product" };
  if (has(productWords) && has(["order", "buy", "purchase", "mangwana", "bhej", "checkout"])) return { intent: "order_start", confidence: 0.9, reason: "product + order keyword", productQuery: productWords.find((w) => t.includes(w)) };
  if (has(productWords) && has(["chahiye", "need", "lena", "lena hai", "mangwana", "bhej do"])) return { intent: "order_start", confidence: 0.88, reason: "product need/order phrase", productQuery: productWords.find((w) => t.includes(w)) };
  if (has(["order krna", "order karna", "order karwana", "order place", "place order", "buy krna", "lena hai", "bill bna", "bill bana", "bill bna k", "bill bana k"])) return { intent: "order_start", confidence: 0.78, reason: "order intent without product" };
  if (has(productWords) && has(["recommend", "suggest", "best", "healthy", "gift", "kids", "energy"])) return { intent: "recommendation", confidence: 0.86, reason: "product recommendation keyword", productQuery: productWords.find((w) => t.includes(w)) };
  if (has(productWords) && has(["price", "rate", "qeemat", "kitna", "how much", "rs", "rupees"])) return { intent: "pricing", confidence: 0.9, reason: "product + price keyword", productQuery: productWords.find((w) => t.includes(w)) };
  if (has(productWords) && (has(productActionWords) || t.split(" ").length <= 4)) return { intent: "product_search", confidence: 0.82, reason: "clear product keyword", productQuery: productWords.find((w) => t.includes(w)) };
  if (exact(["hi", "hello", "hey", "salam", "salaam", "assalam", "assalam o alaikum", "aoa", "helo", "hii"])) return { intent: "greeting", confidence: 0.88, reason: "greeting only" };
  if (has(["help", "madad", "support", "poochna", "sawal", "question"])) return { intent: "support", confidence: 0.72, reason: "support keyword" };
  return { intent: "general", confidence: 0.45, reason: "no strong deterministic intent" };
}

function shouldSendCatalogForIntent(intent: WaIntent): boolean {
  return ["product_search", "pricing", "recommendation", "bulk_order"].includes(intent);
}

function isGenericCategoryQuery(query: string | undefined): boolean {
  const q = normalizeIntentText(query ?? "");
  return ["dry fruit", "dry fruits", "nuts", "mewa"].includes(q);
}

function naturalIntentReply(intent: WaIntent, text: string): string | null {
  const roman = /[a-z]/i.test(text) && !/[اآبپتٹثجچحخدڈذرڑزژسشصضطظعغفقکگلمنوہھیے]/.test(text);
  if (intent === "conversation" || intent === "support") {
    return roman
      ? "Ji bilkul 😊\n\nKis baare mein baat karna chahte hain?\nMain madad ke liye yahin hoon 👍"
      : "جی بالکل 😊\n\nکس بارے میں بات کرنا چاہتے ہیں؟\nمیں مدد کے لیے موجود ہوں 👍";
  }
  if (intent === "greeting") {
    return roman
      ? "Assalam o Alaikum 😊\n\nKhan Dry Fruits mein khush aamdeed. Aap kis cheez mein madad chahte hain?"
      : "وعلیکم السلام 😊\n\nKhan Dry Fruits میں خوش آمدید۔ آپ کس چیز میں مدد چاہتے ہیں؟";
  }
  if (intent === "human_agent") {
    return roman
      ? "Ji, main aapko support team se connect kar deta hoon 😊\n\nApna masla ya sawal yahin likh dein, team dekh legi."
      : "جی، میں آپ کو سپورٹ ٹیم سے connect کر دیتا ہوں 😊\n\nاپنا سوال یا مسئلہ یہاں لکھ دیں۔";
  }
  return null;
}

/* ─── Public: Chat Button Config ────────────────────── */
router.get("/whatsapp/chat-config", async (req, res) => {
  try {
    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    if (!settings?.chatButtonEnabled || !settings.chatButtonPhone) {
      return res.json({ enabled: false });
    }
    return res.json({
      enabled: true,
      phone: settings.chatButtonPhone,
      message: settings.chatButtonMessage ?? "Hi! I'd like to know more about your products.",
    });
  } catch {
    return res.json({ enabled: false });
  }
});

/* ─── Public: Webhook URL info ──────────────────────── */
const ADMIN_TO_API_HOST: Record<string, string> = {
  "admin.khanbabadryfruits.com": "api.khanbabadryfruits.com",
};

function mapAdminHostToApi(host: string): string {
  const bare = host.split(":")[0]!.toLowerCase();
  if (ADMIN_TO_API_HOST[bare]) return ADMIN_TO_API_HOST[bare]!;
  if (bare.startsWith("admin.")) return `api.${bare.slice("admin.".length)}`;
  return bare;
}

function resolvePublicApiBase(reqHost?: string): string {
  const fromEnv = (
    process.env.PUBLIC_API_URL
    ?? process.env.API_PUBLIC_URL
    ?? process.env.META_DOMAIN_OVERRIDE
    ?? process.env.KDF_DEFAULT_API_URL
    ?? ""
  ).trim();
  if (fromEnv) return fromEnv.startsWith("http") ? fromEnv.replace(/\/$/, "") : `https://${fromEnv.replace(/\/$/, "")}`;

  const apiHost = (process.env.API_HOST ?? process.env.RAILWAY_PUBLIC_DOMAIN ?? "").trim();
  if (apiHost) return apiHost.startsWith("http") ? apiHost.replace(/\/$/, "") : `https://${apiHost.replace(/\/$/, "")}`;

  const prodPrimary = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  if (prodPrimary) return `https://${prodPrimary}`;

  const devDomain = (process.env.REPLIT_DEV_DOMAIN ?? "").trim();
  if (devDomain) return `https://${devDomain}`;

  if (reqHost) return `https://${mapAdminHostToApi(reqHost)}`;

  if (process.env.NODE_ENV === "production") {
    return "https://api.khanbabadryfruits.com";
  }
  return "";
}

function getPublicWebhookUrl(reqHost?: string): string {
  const base = resolvePublicApiBase(reqHost);
  return base ? `${base}/api/webhooks/whatsapp` : "";
}

function getUnifiedWebhookUrl(reqHost?: string): string {
  const base = resolvePublicApiBase(reqHost);
  return base ? `${base}/api/meta/webhook` : "";
}

/* ─── Webhook Verification (Meta GET) ───────────────── */
router.get("/webhooks/whatsapp", async (req, res) => {
  try {
    const mode      = req.query["hub.mode"] as string | undefined;
    const token     = req.query["hub.verify_token"] as string | undefined;
    const challenge = req.query["hub.challenge"] as string | undefined;

    if (!mode || !token || !challenge) {
      return res.status(400).json({ error: "Missing hub params" });
    }

    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    const [social] = await db.select({ token: socialSettingsTable.webhookVerifyToken }).from(socialSettingsTable).limit(1);
    const tokenOk = isValidMetaWebhookVerifyToken(token, [
      settings?.webhookVerifyToken,
      social?.token,
      "kdfnuts_webhook_token",
      "kdfnuts_social_token",
    ]);

    if (mode === "subscribe" && tokenOk) {
      req.log?.info("WhatsApp webhook verified successfully");
      return res.status(200).send(challenge);
    }
    req.log?.warn({ mode, receivedToken: token }, "WhatsApp webhook verification failed");
    return res.status(403).json({ error: "Forbidden: token mismatch" });
  } catch (err) {
    req.log?.error(err, "Webhook verification error");
    return res.status(500).json({ error: "Internal error" });
  }
});

/* ─── Webhook Events (Meta POST) ────────────────────── */
router.get("/admin/whatsapp/webhook-logs", adminMiddleware as any, (req, res) => {
  res.json(recentWebhookPayloads.slice(0, 30));
});

router.get("/admin/whatsapp/processing-logs", adminMiddleware as any, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(20, parseInt(String(req.query.limit ?? "100"), 10) || 100));
    const rows = await db.execute(sql`
      SELECT id, phone, message_id, template_name, message, status, failure_reason, response, created_at
      FROM whatsapp_logs
      WHERE template_name LIKE 'processing:%'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    res.json(rows.rows ?? []);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load processing logs" });
  }
});

/* ─── Webhook: incoming message handler ──────────────── */
router.post("/webhooks/whatsapp", async (req, res) => {
  const secrets = await getMetaAppSecrets();
  const signature = req.headers["x-hub-signature-256"] as string | undefined;
  const rawBody = req.rawBody;

  if (secrets.length > 0) {
    const { ok, matchedIndex } = verifyMetaWebhookSignatureAny(rawBody ?? Buffer.alloc(0), signature, secrets);
    if (!ok) {
      req.log?.warn(
        { signature: signature ? "present" : "missing", rawBodyLen: rawBody?.length ?? 0, secretCount: secrets.length },
        "WhatsApp webhook rejected: invalid HMAC — App Secret must match Meta Developer → App → Basic → App Secret",
      );
      await db.insert(waWebhookFailuresTable).values({
        payload: req.body as Record<string, unknown>,
        error: "invalid_hmac_signature",
        signature: signature ?? null,
      }).catch(() => {});
      void createAdminAlert({
        title: "WhatsApp webhook failed: App Secret mismatch",
        message: "Reason: Customer message webhook rejected because Meta HMAC signature did not match.\nAction: Copy the Meta App Secret into WhatsApp API Settings or META_APP_SECRET, then redeploy.",
        type: "wa_health",
        dedupeMinutes: 30,
      });
      res.sendStatus(403);
      return;
    }
    if (matchedIndex > 0) {
      req.log?.info("WA webhook HMAC matched fallback secret — update App Secret in WA Settings to match Meta App Secret");
    }
  } else if (process.env.NODE_ENV === "production") {
    req.log?.warn("META app secret not configured — rejecting webhook in production");
    res.sendStatus(403);
    return;
  } else {
    req.log?.warn("META app secret not configured — accepting webhook without signature verification (dev only)");
  }

  res.sendStatus(200);
  try {
    const body = req.body as any;
    rememberWhatsappWebhookPayload(body);
    if (body?.object !== "whatsapp_business_account") {
      req.log?.debug({ object: body?.object }, "WA webhook ignored: not whatsapp_business_account");
      return;
    }
    const msgCount = (body.entry ?? []).reduce((n: number, e: { changes?: unknown[] }) => n + (e.changes?.length ?? 0), 0);
    req.log?.info({ entries: body.entry?.length ?? 0, changes: msgCount }, "WA webhook POST accepted, processing");
    await processWaWebhookBody(body, req.log ?? logger);
  } catch (err) {
    req.log?.error(err, "Webhook event processing error");
  }
});

/* ─── Exported: process a whatsapp_business_account webhook body ── */
export async function processWaWebhookBody(body: any, log: any = logger): Promise<void> {
  try {
    for (const entry of (body.entry ?? [])) {
      for (const change of (entry.changes ?? [])) {
        const value = change?.value ?? {};

        if (Array.isArray(value.errors) && value.errors.length > 0) {
          log?.warn({ errors: value.errors }, "WhatsApp webhook value.errors from Meta");
          await db.insert(waWebhookFailuresTable).values({
            payload: { errors: value.errors, metadata: value.metadata },
            error: "meta_webhook_value_errors",
          }).catch(() => {});
        }

        if (change?.field === "message_template_status_update" || change?.field === "message_template_quality_update") {
          const templateName = String(value.message_template_name ?? value.name ?? value.template_name ?? "").trim();
          const templateId = String(value.message_template_id ?? value.template_id ?? value.id ?? "").trim();
          const language = String(value.message_template_language ?? value.language ?? "").trim();
          const event = String(value.event ?? value.status ?? value.quality_score ?? "").toLowerCase();
          const reason = value.reason ?? value.rejection_reason ?? value.disable_info ?? value.other_info ?? null;
          const approvalStatus =
            event.includes("approved") ? "approved" :
            event.includes("rejected") ? "rejected" :
            event.includes("paused") ? "paused" :
            event.includes("disabled") ? "disabled" :
            event.includes("pending") ? "pending" :
            event || "unknown";

          if (templateName || templateId) {
            await db.execute(sql`
              UPDATE whatsapp_templates
              SET approval_status = ${approvalStatus},
                  rejection_reason = ${reason ? JSON.stringify(reason).slice(0, 1000) : null},
                  meta_template_id = COALESCE(NULLIF(${templateId}, ''), meta_template_id)
              WHERE (${templateId} <> '' AND meta_template_id = ${templateId})
                 OR (${templateName} <> '' AND name = ${templateName} AND (${language} = '' OR language = ${language}))
            `).catch((err: unknown) => log?.warn({ err, templateName, templateId }, "WA template status update failed"));
          }
          log?.info({ field: change.field, templateName, templateId, language, approvalStatus }, "WA template webhook status update");
          if (approvalStatus === "rejected" || approvalStatus === "paused" || approvalStatus === "disabled") {
            void createAdminAlert({
              title: `WhatsApp template ${approvalStatus}: ${templateName || templateId || "unknown"}`,
              message: `Reason: Meta reported template status ${approvalStatus}${reason ? ` (${JSON.stringify(reason).slice(0, 300)})` : ""}.\nAction: Open WhatsApp Templates, fix the template, submit again, then retry failed messages.`,
              type: "wa_health",
              dedupeMinutes: 60,
            });
          }
          continue;
        }

        /* ── Delivery status updates ── */
        for (const s of (value.statuses ?? [])) {
          const deliveryStatus = s.status as string;
          const failureReason =
            deliveryStatus === "failed"
              ? String(s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? "delivery_failed").slice(0, 500)
              : null;
          await db.execute(
            sql`UPDATE whatsapp_logs SET
              delivery_status = ${deliveryStatus},
              response = ${JSON.stringify(s)},
              failure_reason = COALESCE(${failureReason}, failure_reason),
              status = CASE WHEN ${deliveryStatus} = 'failed' THEN 'failed' ELSE status END
            WHERE message_id = ${s.id}`,
          ).catch(() => {});
          await db.execute(
            sql`UPDATE wa_messages SET status = ${deliveryStatus}, updated_at = NOW() WHERE wa_message_id = ${s.id}`,
          ).catch(() => {});
          log?.info({ messageId: s.id, deliveryStatus, errors: s.errors, failureReason }, "WhatsApp delivery status update");

          void import("../lib/deliveryWaPremium.js").then(({ markDeliveryWaFromWebhook }) =>
            markDeliveryWaFromWebhook(s.id, deliveryStatus),
          ).catch(() => {});

          if (deliveryStatus === "delivered" || deliveryStatus === "read") {
            const [logRow] = await db.select({ id: whatsappLogsTable.id, templateName: whatsappLogsTable.templateName })
              .from(whatsappLogsTable).where(eq(whatsappLogsTable.messageId, s.id)).limit(1);
            if (logRow?.templateName?.startsWith("campaign:")) {
              const campaignId = parseInt(logRow.templateName.replace("campaign:", ""));
              if (!isNaN(campaignId)) {
                if (deliveryStatus === "delivered") {
                  await db.execute(sql`UPDATE whatsapp_campaigns SET delivered_count = delivered_count + 1 WHERE id = ${campaignId}`).catch(() => {});
                } else if (deliveryStatus === "read") {
                  await db.execute(sql`UPDATE whatsapp_campaigns SET read_count = read_count + 1 WHERE id = ${campaignId}`).catch(() => {});
                }
              }
            }
          }
        }

        /* ── Incoming messages (field must be "messages" for customer replies) ── */
        if (change?.field && change.field !== "messages") {
          log?.debug({ field: change.field }, "WA webhook change ignored (not messages field)");
        }
        for (const msg of (value.messages ?? [])) {
          const phoneRaw = msg.from ?? "unknown";
          const phone = phoneRaw === "unknown" ? phoneRaw : normalizePhone(phoneRaw);
          const msgId = msg.id as string | undefined;

          /* Extract text — works for plain text AND interactive replies */
          const msgType: string = msg.type ?? "text";
          const listReplyId: string | undefined    = msg.interactive?.list_reply?.id;
          const buttonReplyId: string | undefined  = msg.interactive?.button_reply?.id;
          const legacyButtonPayload: string | undefined = msg.button?.payload;
          const interactionId  = listReplyId ?? buttonReplyId ?? legacyButtonPayload;
          const interactionTitle: string | undefined = msg.interactive?.list_reply?.title ?? msg.interactive?.button_reply?.title ?? msg.button?.text;

          /* ── Extract rich content based on message type ── */
          let rawText = "";
          let mediaUrl: string | null = null;
          let mediaCaption: string | null = null;
          let reactionEmoji: string | null = null;

          switch (msgType) {
            case "text":
              rawText = msg.text?.body ?? "";
              break;
            case "interactive":
              rawText = interactionTitle ?? interactionId ?? "";
              break;
            case "button":
              rawText = msg.button?.text ?? msg.button?.payload ?? "[Button reply]";
              break;
            case "image":
            case "video":
            case "document":
            case "sticker":
              rawText = `[${msgType}]`;
              mediaUrl = msg[msgType]?.id ? `https://media-msgid/${msg[msgType].id}` : null;
              mediaCaption = msg[msgType]?.caption ?? null;
              if (mediaCaption) rawText = `[${msgType}] ${mediaCaption}`;
              break;
            case "audio":
            case "voice":
              rawText = `[Voice note 🎤]`;
              mediaUrl = msg.audio?.id ? `https://media-msgid/${msg.audio.id}` : null;
              break;
            case "location":
              rawText = `📍 Location: ${msg.location?.name ?? `${msg.location?.latitude},${msg.location?.longitude}`}`;
              break;
            case "reaction":
              reactionEmoji = msg.reaction?.emoji ?? "❤️";
              rawText = `[Reaction: ${reactionEmoji}]`;
              break;
            case "contacts":
              rawText = `[Contact shared]`;
              break;
            default:
              rawText = msg.type ?? "non-text";
          }

          /* Deduplicate — prefer inbox row so retries still persist if audit log existed */
          if (msgId) {
            const dupInbox = await db.execute(
              sql`SELECT id FROM wa_messages WHERE wa_message_id = ${msgId} AND direction = 'in' LIMIT 1`,
            ).catch(() => ({ rows: [] }));
            if (dupInbox.rows.length) {
              log?.info({ msgId }, "Duplicate inbound WA message, skipping");
              continue;
            }
          }

          /* Log incoming (whatsapp_logs — audit trail) */
          await db.insert(whatsappLogsTable).values({
            phone,
            messageId: msgId ?? null,
            templateName: "incoming",
            message: rawText,
            status: "received",
            response: JSON.stringify(msg),
          }).catch((err: unknown) => log?.warn({ err, phone, msgId }, "WA inbound whatsapp_logs insert failed"));
          await logWaProcessingStep({
            phone,
            messageId: msgId,
            step: "webhook_received",
            detail: `Webhook received: ${msgType}${interactionId ? ` (${interactionId})` : ""}`,
            payload: { msgType, rawText, interactionId, interactionTitle, metadata: value.metadata },
          });

          if (phone === "unknown") continue;

          const contactName =
            (value.contacts?.find((c: { wa_id?: string }) => c.wa_id === phoneRaw || c.wa_id === phone)?.profile?.name as string | undefined)
            ?? (value.contacts?.[0]?.profile?.name as string | undefined)
            ?? null;

          const { persistInboundWaMessage } = await import("../lib/waInbound.js");
          const { conversationId: waConvId } = await persistInboundWaMessage({
            phoneRaw,
            msgId,
            msgType,
            rawText,
            mediaUrl,
            mediaCaption,
            reactionEmoji,
            contactName,
            metadata: value.metadata,
          }, log);

          const [waConv] = waConvId
            ? await db.select().from(waConversationsTable).where(eq(waConversationsTable.id, waConvId)).limit(1)
            : [];

          if (!waConvId) {
            log?.error({ phone, msgId }, "WA inbound not in inbox — check DB / wa_conversations table");
            await logWaProcessingStep({
              phone,
              messageId: msgId,
              step: "inbox_persist",
              status: "failed",
              detail: "Inbound webhook reached backend but could not be saved to admin inbox.",
              failureReason: "wa_conversation_persist_failed",
            });
          } else {
            await logWaProcessingStep({
              phone,
              messageId: msgId,
              step: "inbox_persist",
              detail: "Inbound message saved to admin inbox.",
              payload: { conversationId: waConvId },
            });
          }

          /* ── Intent detection + save in conversation ── */
          const lowerText = rawText.toLowerCase();
          const AI_KEYWORDS: Record<string, string> = {
            badam: "almonds", almond: "almonds", pista: "pistachios", pistachio: "pistachios",
            akhrot: "walnuts", walnut: "walnuts", kaju: "cashews", cashew: "cashews",
            "dry fruit": "dry_fruits", "dry fruits": "dry_fruits", mewa: "dry_fruits",
            price: "price_inquiry", rate: "price_inquiry", qeemat: "price_inquiry",
            discount: "discount", offer: "discount", sale: "discount",
            delivery: "delivery", "deliver kar": "delivery", shipping: "delivery",
            cod: "cod", "cash on delivery": "cod",
            complaint: "complaint", problem: "complaint", shikayat: "complaint",
            return: "return_request", refund: "return_request", wapas: "return_request",
            order: "order_inquiry", track: "order_inquiry",
          };
          let detectedIntent: string | null = null;
          for (const [kw, intent] of Object.entries(AI_KEYWORDS)) {
            if (lowerText.includes(kw)) { detectedIntent = intent; break; }
          }
          if (detectedIntent && waConvId) {
            await db.execute(sql`UPDATE wa_conversations SET intent = ${detectedIntent} WHERE id = ${waConvId}`).catch(() => {});
          }

          if ((msgType === "interactive" || msgType === "button") && (interactionTitle || interactionId || rawText)) {
            await showHumanPresenceBeforeReply({
              inboundMessageId: msgId,
              text: interactionTitle ?? interactionId ?? rawText,
              mode: "simple",
              log,
            });
          }

          /* ── Order Confirm/Cancel is highest priority and must run even if bot mode is human/off. */
          try {
            const { processWhatsAppConfirmation, isConfirmationReply, isCancellationReply } = await import("../lib/ondriveEngine.js");
            const preConvState = await getConversationState(phone);
            const preState = preConvState?.state ?? "idle";
            const isCheckoutState = String(preState).startsWith("wa_order_") || String(preState).startsWith("order_await_");
            const isTemplateButton = Boolean(interactionId?.startsWith("confirm_order_") || interactionId?.startsWith("cancel_order_"));
            if (!isCheckoutState || isTemplateButton) {
              const confResult = await processWhatsAppConfirmation({
                phone,
                text: rawText,
                interactionId,
              });
              if (confResult.handled) {
                await logWaProcessingStep({
                  phone,
                  messageId: msgId,
                  step: "template_button_processed",
                  status: "sent",
                  detail: `Order button/text processed: ${confResult.action ?? "handled"}`,
                  payload: { orderId: confResult.orderId, action: confResult.action, rawText, interactionId, preState },
                });
                log?.info({ phone, action: confResult.action, orderId: confResult.orderId }, "OnDrive: confirmation handled");
                continue;
              }
            }
            if (!isCheckoutState && (isConfirmationReply(rawText) || isCancellationReply(rawText) || isConfirmationReply(interactionId ?? "") || isCancellationReply(interactionId ?? ""))) {
              await logWaProcessingStep({
                phone,
                messageId: msgId,
                step: "template_button_processed",
                status: "failed",
                detail: "Customer clicked/replied confirm/cancel but no pending Shopify confirmation was found for this phone.",
                payload: { rawText, interactionId, preState },
                failureReason: "no_pending_order_confirmation_for_phone",
              });
            }
          } catch (confErr) {
            await logWaProcessingStep({
              phone,
              messageId: msgId,
              step: "template_button_processed",
              status: "failed",
              detail: "Confirmation button webhook reached backend but processing failed.",
              payload: { error: confErr instanceof Error ? confErr.message : String(confErr), rawText, interactionId },
              failureReason: confErr instanceof Error ? confErr.message : String(confErr),
            });
            log?.warn(confErr, "OnDrive confirmation check failed (non-fatal)");
          }

          /* ── Check if conversation is in human or off mode ── */
          if (waConv) {
            const currentBotMode = (waConv as any)?.botMode ?? "auto";
            if (currentBotMode === "human" || currentBotMode === "off") {
              await logWaProcessingStep({
                phone,
                messageId: msgId,
                step: "ai_skipped",
                detail: `AI skipped because conversation bot mode is ${currentBotMode}.`,
                payload: { botMode: currentBotMode },
              });
              log?.info({ phone, botMode: currentBotMode }, "Bot skipped — human/off mode");
              continue;
            }
          }

          /* Load config (chatbot + WA settings) */
          const [chatbot]  = await db.select().from(chatbotSettingsTable).limit(1);
          const [waSettings] = await db.select().from(whatsappSettingsTable).limit(1);
          if (!waSettings?.isActive) {
            await logWaProcessingStep({
              phone,
              messageId: msgId,
              step: "ai_skipped",
              status: "failed",
              detail: "WhatsApp settings are inactive, so no customer reply could be sent.",
              failureReason: "whatsapp_settings_inactive",
            });
            continue;
          }

          /* Get current conversation state */
          const convState = await getConversationState(phone);
          let currentState = convState?.state ?? "idle";
          const voiceText = (msgType === "audio" || msgType === "voice")
            ? await transcribeWhatsAppVoice({ mediaId: msg.audio?.id ?? msg.voice?.id, waSettings, phone, messageId: msgId })
            : null;
          const inboundText = voiceText ?? msg.text?.body ?? "";
          const isTextLike = msgType === "text" || Boolean(voiceText);
          if ((msgType === "audio" || msgType === "voice") && !voiceText) {
            await sendWaText(phone, "Voice note clear nahi ho saka. Please dobara voice bhej dein ya 1, 2, 3 mein se option select kar dein.", waSettings, "voice_transcription_failed");
            continue;
          }

          /* ═══════════════════════════════════════════════
             BRANCH 1: Interactive reply (button / list tap)
             ═══════════════════════════════════════════════ */
          if (msgType === "interactive" && interactionId) {
            log?.info({ phone, interactionId, interactionTitle }, "Interactive reply received");

            if (interactionId === "wa_chat_order_confirm" || interactionId === "wa_chat_order_cancel") {
              if (currentState !== "wa_order_await_confirm") {
                await logWaProcessingStep({
                  phone,
                  messageId: msgId,
                  step: "commerce_button_without_active_state",
                  status: "failed",
                  detail: "Customer clicked WhatsApp commerce confirm/cancel button but no active order confirmation state was found.",
                  payload: { interactionId, interactionTitle, currentState },
                  failureReason: "no_active_whatsapp_checkout_state",
                });
                await sendWaText(
                  phone,
                  interactionId === "wa_chat_order_cancel"
                    ? "Order cancel request receive ho gayi. Is chat mein koi active checkout pending nahi mila. Naya order start karna ho to product ka naam bhej dein."
                    : "Order session expire ya complete ho chuka hai. Please naya bill/order banane ke liye product ka naam bhej dein.",
                  waSettings,
                );
                continue;
              }
              try {
                await handleCommerceOrderFlow(
                  phone,
                  interactionId === "wa_chat_order_confirm" ? "confirm" : "cancel",
                  currentState,
                  waSettings,
                  log,
                );
              } catch (commerceErr) {
                await logWaProcessingStep({
                  phone,
                  messageId: msgId,
                  step: "commerce_button_processing_failed",
                  status: "failed",
                  detail: "Commerce confirm/cancel button reached backend but processing failed.",
                  payload: { error: commerceErr instanceof Error ? commerceErr.message : String(commerceErr), interactionId, currentState },
                  failureReason: commerceErr instanceof Error ? commerceErr.message : String(commerceErr),
                });
                await sendWaText(phone, "Order button process nahi ho saka. Team ko alert kar diya gaya hai, please thori dair baad try karein.", waSettings);
              }
              continue;
            }

            /* "Main Menu" button — show the menu again */
            if (interactionId === "main_menu") {
              await sendQuickOrderMenu(phone, waSettings);
              continue;
            }

            /* ── Menu item handlers (editable items + defaults) ── */
            const menuHandled = await handleMenuItemTap({
              phone,
              interactionId,
              chatbot,
              waSettings,
            });
            if (!menuHandled) switch (interactionId) {
              default: {
                /* wa_order_PRODUCTNAME_IDX — from AI product card "Order Now" button */
                if (interactionId.startsWith("wa_order_")) {
                  try {
                    const parts = interactionId.split("_");
                    const productNameEncoded = parts.slice(2, parts.length - 1).join("_");
                    const productName = decodeURIComponent(productNameEncoded.replace(/_/g, " "));
                    await startCommerceOrderFromText({
                      phone,
                      textBody: `${productName} order`,
                      waSettings,
                      detectedIntent: { intent: "order_start", confidence: 0.95, reason: "product card button", productQuery: productName } as any,
                    });
                  } catch {
                    await sendQuickOrderMenu(phone, waSettings);
                  }
                } else {
                  /* Truly unknown — show menu */
                  await handleSendMenu(phone, waSettings, chatbot);
                  await setConversationState(phone, "menu_shown");
                }
              }
            }
            continue; /* Skip AI processing for interactive messages */
          }

          /* ═══════════════════════════════════════════════
             BRANCH 2: Awaiting order number (Track Order)
             ═══════════════════════════════════════════════ */
          if ((currentState === "track_order_wait" || currentState === "awaiting_tracking_input") && isTextLike && inboundText) {
            const inputText = inboundText.trim();
            await showHumanPresenceBeforeReply({ inboundMessageId: msgId, text: inputText, mode: "complex", log });
            await handleTrackOrder(phone, inputText, waSettings);
            await setConversationState(phone, "idle");
            continue;
          }

          /* ═══════════════════════════════════════════════
             BRANCH 2b: Order placement flow states
             ═══════════════════════════════════════════════ */
          if (currentState === "wa_order_await_confirm" && isTextLike && inboundText) {
            const confirmStateText = inboundText.trim();
            const confirmStateIntent = detectWaIntent(confirmStateText);
            if (
              ["greeting", "conversation", "general", "support"].includes(confirmStateIntent.intent) &&
              !isCommerceConfirmationText(confirmStateText) &&
              !isCommerceCancellationText(confirmStateText)
            ) {
              await logWaProcessingStep({
                phone,
                messageId: msgId,
                step: "stale_order_state_reset",
                detail: "Greeting/general message arrived while checkout was waiting for confirm/cancel; reset stale order state and routed to AI.",
                payload: { previousState: currentState, text: confirmStateText, intent: confirmStateIntent },
              });
              await setConversationState(phone, "idle", {});
              currentState = "idle";
            }
          }
          if (["wa_order_await_product", "wa_order_await_product_choice", "wa_order_await_variant", "wa_order_await_quantity", "wa_order_await_name", "wa_order_await_phone", "wa_order_await_address", "wa_order_await_city", "wa_order_await_payment", "wa_order_await_notes", "wa_order_await_confirm"].includes(currentState) && isTextLike && inboundText) {
            await showHumanPresenceBeforeReply({ inboundMessageId: msgId, text: inboundText.trim(), mode: "simple", log });
            const commerceText = inboundText.trim();
            if (isDeliveryOnlyMessage(commerceText) || isTrackingOnlyMessage(commerceText)) {
              const midFlowIntent = detectWaIntent(commerceText);
              const midReply = await tryDeterministicWaReply({
                phone,
                textBody: commerceText,
                currentState,
                detectedIntent: midFlowIntent.intent,
                productQuery: midFlowIntent.productQuery,
              });
              if (midReply) {
                await sendDeterministicWaReply({
                  phone,
                  textBody: commerceText,
                  reply: midReply,
                  intent: midFlowIntent.intent,
                  send: async (p, m, t) => { await sendWaText(p, m, waSettings, t); },
                });
                continue;
              }
            }
            try {
              await handleCommerceOrderFlow(phone, commerceText, currentState, waSettings, log);
            } catch (commerceErr) {
              await logWaProcessingStep({
                phone,
                messageId: msgId,
                step: "commerce_text_processing_failed",
                status: "failed",
                detail: "Commerce text state reached backend but processing failed.",
                payload: { error: commerceErr instanceof Error ? commerceErr.message : String(commerceErr), currentState, text: inboundText.trim() },
                failureReason: commerceErr instanceof Error ? commerceErr.message : String(commerceErr),
              });
              await sendWaText(phone, "Order flow mein issue aa gaya. Please product ka naam dobara bhej dein, main fresh bill bana deta hoon.", waSettings);
              await setConversationState(phone, "idle", {});
            }
            continue;
          }

          if (["order_await_qty", "order_await_name", "order_await_address", "order_await_city", "order_await_confirm"].includes(currentState) && isTextLike && inboundText) {
            await showHumanPresenceBeforeReply({ inboundMessageId: msgId, text: inboundText.trim(), mode: "simple", log });
            await handleOrderFlow(phone, inboundText.trim(), currentState, waSettings, log);
            continue;
          }

          /* ═══════════════════════════════════════════════
             BRANCH 3: Text message — greeting / AI / menu
             ═══════════════════════════════════════════════ */
          if (!isTextLike || !inboundText) continue;
          const textBody = inboundText.trim();
          await showHumanPresenceBeforeReply({
            inboundMessageId: msgId,
            text: textBody,
            mode: /product|price|rate|almond|badam|pista|kaju|akhrot|kg|bulk|buy|order/i.test(textBody) ? "product" : "simple",
            log,
          });

          /* Reset to idle if user says "menu" at any time */
          const isMenuKeyword = /^\s*(menu|main menu|back|home)\s*$/i.test(textBody);
          if (isMenuKeyword && (chatbot as any)?.menuEnabled) {
            await sendQuickOrderMenu(phone, waSettings);
            continue;
          }

          /* In ai_chat state — go straight to AI (skip menu/static shortcuts) */
          if (currentState === "ai_chat") {
            const detected = detectWaIntent(textBody);
            await logWaProcessingStep({
              phone,
              messageId: msgId,
              step: "intent_detected",
              detail: `Detected intent: ${detected.intent} (${detected.reason})`,
              payload: { textBody, ...detected, route: "ai_chat" },
            });
            const aiChatDeterministic = await tryDeterministicWaReply({
              phone,
              textBody,
              currentState,
              detectedIntent: detected.intent,
              productQuery: detected.productQuery,
            });
            if (aiChatDeterministic) {
              await sendDeterministicWaReply({
                phone,
                textBody,
                reply: aiChatDeterministic,
                intent: detected.intent,
                send: async (p, m, t) => { await sendWaText(p, m, waSettings, t); },
              });
              continue;
            }
            await handleAiReply({ phone, textBody, chatbot, waSettings, log, detectedIntent: detected });
            continue;
          }

          const detected = detectWaIntent(textBody);
          await logWaProcessingStep({
            phone,
            messageId: msgId,
            step: "intent_detected",
            detail: `Detected intent: ${detected.intent} (${detected.reason})`,
            payload: { textBody, ...detected },
          });

          if (detected.intent === "greeting" && isGreeting(textBody, (chatbot as any)?.menuGreetingKeywords)) {
            await sendQuickOrderMenu(phone, waSettings);
            continue;
          }

          if (await handleQuickOrderNumber({ phone, textBody, currentState, waSettings, detectedIntent: detected })) {
            continue;
          }

          if (detected.intent === "order_start" && ((chatbot as any)?.orderingEnabled !== false)) {
            const started = await startCommerceOrderFromText({ phone, textBody, waSettings, detectedIntent: detected });
            if (started) continue;
          }

          /* Greeting menu is only a fallback when AI is disabled. If AI is enabled, OpenAI must use admin prompt. */
          if (!chatbot?.isEnabled && detected.intent === "greeting" && (chatbot as any)?.menuEnabled && isGreeting(textBody, (chatbot as any)?.menuGreetingKeywords)) {
            await sendQuickOrderMenu(phone, waSettings);
            continue;
          }

          /* Deterministic replies: delivery, tracking, contextual price — never generic greeting */
          const deterministicReply = await tryDeterministicWaReply({
            phone,
            textBody,
            currentState,
            detectedIntent: detected.intent,
            productQuery: detected.productQuery,
          });
          if (deterministicReply) {
            await sendDeterministicWaReply({
              phone,
              textBody,
              reply: deterministicReply,
              intent: detected.intent === "delivery" || isDeliveryOnlyMessage(textBody) ? "delivery" : detected.intent,
              send: async (p, m, t) => { await sendWaText(p, m, waSettings, t); },
            });
            continue;
          }

          /* AI chatbot: all normal text must go through admin prompt + OpenAI. */
          if (chatbot?.isEnabled) {
            await handleAiReply({ phone, textBody, chatbot, waSettings, log, detectedIntent: detected });
          } else {
            await logWaProcessingStep({
              phone,
              messageId: msgId,
              step: "ai_skipped",
              detail: "AI chatbot is disabled or missing in admin settings.",
              payload: { hasChatbotSettings: Boolean(chatbot), chatbotEnabled: chatbot?.isEnabled ?? false },
            });
            await sendWaText(phone, "Ji 😊 bot currently limited mode mein hai. Aap product, price, order status ya delivery ka sawal bhej dein, team/AI assist karega.", waSettings);
          }
        }
      }
    }
  } catch (err) {
    log?.error(err, "Webhook event processing error");
  }
}

function humanReplyDelayMs(text: string, mode: "simple" | "product" | "complex" = "simple"): number {
  const lower = text.toLowerCase();
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const looksProduct = mode === "product" || /price|rate|product|almond|badam|pista|kaju|akhrot|bulk|kg|order|buy|catalog|available/.test(lower);
  const looksComplex = mode === "complex" || words > 18 || /bulk|20kg|complaint|refund|return|urgent|problem|tracking|status|address|change/.test(lower);
  const [min, max] = looksComplex ? [3000, 6000] : looksProduct ? [2000, 4000] : [1000, 2000];
  const jitter = Math.floor(Math.random() * (max - min + 1));
  return min + jitter;
}

async function showHumanPresenceBeforeReply(opts: {
  inboundMessageId?: string | null;
  text: string;
  mode?: "simple" | "product" | "complex";
  log?: any;
}): Promise<void> {
  try {
    if (opts.inboundMessageId) {
      await markWhatsAppMessageRead(opts.inboundMessageId).catch(() => false);
      await sendWhatsAppTypingIndicator(opts.inboundMessageId).catch(() => false);
    }
    await new Promise((resolve) => setTimeout(resolve, humanReplyDelayMs(opts.text, opts.mode)));
  } catch (err) {
    opts.log?.debug?.({ err }, "Human-like WA presence failed");
  }
}

/* ─── Helper: Send interactive welcome menu ─────────── */
async function handleSendMenu(
  phone: string,
  waSettings: any,
  chatbot: any,
): Promise<void> {
  try {
    const normalizedLookup = normalizePhone(phone);
    const altPhone = normalizedLookup.startsWith("92") ? "0" + normalizedLookup.slice(2) : phone;
    const [recentOrder] = await db.select({
      shipping: ordersTable.shippingAddress,
    }).from(ordersTable)
      .where(sql`(shipping_address->>'phone' = ${normalizedLookup} OR shipping_address->>'phone' = ${altPhone} OR shipping_address->>'phone' = ${phone})`)
      .orderBy(desc(ordersTable.createdAt))
      .limit(1);
    const customerName = (recentOrder?.shipping as any)?.name ?? "";

    /* Use custom greeting from chatbot settings if configured */
    const customGreeting = (chatbot as any)?.greetingMessage as string | null | undefined;
    const greeting = customGreeting
      ? (customerName ? customGreeting.replace(/\{name\}/g, customerName.split(" ")[0]!) : customGreeting)
      : (customerName
        ? `Hello ${customerName.split(" ")[0]}! 👋\n\nWelcome to *${KHAN_BRAND_NAME}* — premium dry fruits, nuts & grocery.\n\nTap the menu below to browse, track, or get support.`
        : DEFAULT_GREETING);

    /* Use custom menu items from chatbot settings if configured */
    const customItems = (chatbot as any)?.menuItems ?? null;
    await sendInteractiveMenu({ phone, greeting, settings: waSettings, customItems });
  } catch (err) {
    /* Fallback to text menu if interactive fails */
    await sendWhatsAppMessage({
      phone,
      message: `Welcome to *${KHAN_BRAND_NAME}*\n\n1️⃣ Shop Products\n2️⃣ Today's Deals\n3️⃣ Claim Discount\n4️⃣ Track Order\n5️⃣ Support\n6️⃣ Delivery Info\n7️⃣ Payment Methods\n8️⃣ Visit Website`,
      templateName: "menu_fallback",
    });
  }
}

/* ─── Helper: Track Order by order number/phone ──────── */
async function handleTrackOrder(phone: string, input: string, waSettings: any): Promise<void> {
  try {
    const normalizedPhone = normalizePhone(phone);
    const altPhone = normalizedPhone.startsWith("92") ? "0" + normalizedPhone.slice(2) : phone;
    const cleanInput = input.replace(/^kdf[-\s]?/i, "").toUpperCase().trim();

    /* ── 1. Search ecommerce orders (by order number or phone) ── */
    const [order] = await db.select({
      orderNumber: ordersTable.orderNumber,
      status:      ordersTable.status,
      total:       ordersTable.total,
      trackingId:  ordersTable.trackingId,
      createdAt:   ordersTable.createdAt,
      shipping:    ordersTable.shippingAddress,
    }).from(ordersTable)
      .where(
        sql`(UPPER(order_number) LIKE ${"%" + cleanInput + "%"} OR UPPER(order_number) LIKE ${"KDF-" + cleanInput + "%"}
            OR (shipping_address->>'phone' = ${normalizedPhone} OR shipping_address->>'phone' = ${altPhone}))`
      )
      .orderBy(desc(ordersTable.createdAt))
      .limit(1);

    if (order) {
      const STATUS_EMOJI: Record<string, string> = {
        pending:          "⏳ Pending",
        processing:       "🔧 Processing",
        shipped:          "🚚 Shipped",
        out_for_delivery: "🛵 Out for Delivery",
        delivered:        "✅ Delivered",
        cancelled:        "❌ Cancelled",
      };
      const statusLabel = STATUS_EMOJI[order.status ?? ""] ?? `📦 ${order.status}`;
      const trackingLine = order.trackingId ? `\n🔍 *Tracking No:* *${order.trackingId}*` : "";
      const dateLine = `📅 Placed: ${new Date(order.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}`;

      await sendInteractiveButtons({
        phone,
        text: `📦 *Order Status*\n\n🧾 *Order:* ${order.orderNumber}\n💰 *Total:* Rs. ${order.total}\n📊 *Status:* ${statusLabel}${trackingLine}\n${dateLine}`,
        buttons: [
          { id: "track_again", title: "🔄 Track Another" },
          { id: "main_menu",   title: "🏠 Main Menu" },
        ],
        footer: "Reply anytime to track another order",
        settings: waSettings,
        templateName: "menu_track_result",
      });
      return;
    }

    /* ── 2. Search shipments by CN/tracking ID ── */
    const [shipment] = await db.select({
      id:           shipmentsTable.id,
      trackingId:   shipmentsTable.trackingId,
      courierSlug:  shipmentsTable.courierSlug,
      status:       shipmentsTable.status,
      customerName: (shipmentsTable as any).customerName,
      createdAt:    shipmentsTable.createdAt,
    }).from(shipmentsTable)
      .where(sql`UPPER(tracking_id) = ${cleanInput}`)
      .orderBy(desc(shipmentsTable.createdAt))
      .limit(1);

    if (shipment) {
      const SHIP_STATUS: Record<string, string> = {
        pending:          "⏳ Booked",
        in_transit:       "🚚 In Transit",
        out_for_delivery: "🛵 Out for Delivery",
        delivered:        "✅ Delivered",
        returned:         "↩️ Returned",
        failed:           "❌ Failed",
      };
      const statusLabel = SHIP_STATUS[shipment.status ?? ""] ?? `📦 ${shipment.status}`;
      const trackingUrls: Record<string, string> = {
        tcs:      `https://www.tcsexpress.com/track/${shipment.trackingId}`,
        postex:   `https://postex.pk/tracking/${shipment.trackingId}`,
        leopards: `https://leopardscourier.com/tracking?tracking_number=${shipment.trackingId}`,
        trax:     `https://trax.pk/tracking/${shipment.trackingId}`,
      };
      const trackUrl = trackingUrls[shipment.courierSlug ?? ""] ?? "";
      const couriersLabel = (shipment.courierSlug ?? "courier").toUpperCase();
      const dateLine = `📅 Booked: ${new Date(shipment.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}`;

      await sendInteractiveButtons({
        phone,
        text: `🚚 *Shipment Tracking*\n\n🔍 *CN:* *${shipment.trackingId}*\n🏢 *Courier:* ${couriersLabel}\n📊 *Status:* ${statusLabel}\n${dateLine}${trackUrl ? `\n\n🌐 *Track:* ${trackUrl}` : ""}`,
        buttons: [
          { id: "track_again", title: "🔄 Track Another" },
          { id: "main_menu",   title: "🏠 Main Menu" },
        ],
        footer: "Expected delivery: 2-3 working days",
        settings: waSettings,
        templateName: "menu_track_shipment",
      });
      return;
    }

    /* ── 3. Search Shopify orders by order number or phone ── */
    const [shopifyOrder] = await db.select({
      orderNumber:     shopifyOrdersTable.orderNumber,
      financialStatus: shopifyOrdersTable.financialStatus,
      fulfillmentStatus: shopifyOrdersTable.fulfillmentStatus,
      totalPrice:      shopifyOrdersTable.totalPrice,
      createdAt:       shopifyOrdersTable.createdAt,
      shippingAddress: shopifyOrdersTable.shippingAddress,
      trackingNumber: shopifyOrdersTable.trackingNumber,
      trackingUrl:    shopifyOrdersTable.trackingUrl,
    }).from(shopifyOrdersTable)
      .where(
        sql`(UPPER(order_number) LIKE ${"%" + cleanInput + "%"}
            OR shipping_address->>'phone' = ${normalizedPhone}
            OR shipping_address->>'phone' = ${altPhone})`
      )
      .orderBy(desc(shopifyOrdersTable.createdAt))
      .limit(1);

    if (shopifyOrder) {
      const fulfillLabel = shopifyOrder.fulfillmentStatus === "fulfilled" ? "✅ Fulfilled" : shopifyOrder.fulfillmentStatus === "partial" ? "🔄 Partially Fulfilled" : "⏳ Unfulfilled";
      const trackLine = shopifyOrder.trackingNumber ? `\n🔍 *Tracking:* *${shopifyOrder.trackingNumber}*` : "";
      const trackLinkLine = shopifyOrder.trackingUrl ? `\n🌐 *Track:* ${shopifyOrder.trackingUrl}` : "";
      const dateLine = `📅 Placed: ${new Date(shopifyOrder.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}`;

      await sendInteractiveButtons({
        phone,
        text: `🛒 *Order Status*\n\n🧾 *Order:* ${shopifyOrder.orderNumber}\n💰 *Total:* Rs. ${shopifyOrder.totalPrice}\n📊 *Fulfillment:* ${fulfillLabel}${trackLine}${trackLinkLine}\n${dateLine}`,
        buttons: [
          { id: "track_again", title: "🔄 Track Another" },
          { id: "main_menu",   title: "🏠 Main Menu" },
        ],
        footer: "Reply anytime to track another order",
        settings: waSettings,
        templateName: "menu_track_shopify",
      });
      return;
    }

    /* ── 4. Nothing found ── */
    await sendInteractiveButtons({
      phone,
      text: `❌ I couldn't find any order or shipment matching *"${input}"*.\n\nYou can search by:\n• Order number (e.g. KDF-1234)\n• Tracking / CN number\n• Your phone number`,
      buttons: [
        { id: "track_again",  title: "🔄 Try Again" },
        { id: "talk_support", title: "💬 Support" },
        { id: "main_menu",    title: "🏠 Main Menu" },
      ],
      settings: waSettings,
      templateName: "menu_track_not_found",
    });
  } catch (err) {
    await sendWhatsAppMessage({
      phone,
      message: "Sorry, I couldn't look up that order right now. Please try again or contact our support team.",
      templateName: "menu_track_error",
    });
  }
}

/* ─── Helper: WhatsApp Product Catalog ──────────────── */
async function handleProductCatalog(opts: {
  phone: string;
  textBody: string;
  chatbot: any;
  waSettings: any;
  log?: any;
  detectedIntent?: ReturnType<typeof detectWaIntent>;
}): Promise<boolean> {
  const { phone, textBody, chatbot, waSettings, log, detectedIntent } = opts;
  try {
    if (detectedIntent && !shouldSendCatalogForIntent(detectedIntent.intent)) return false;
    if (isGenericCategoryQuery(detectedIntent?.productQuery) && detectedIntent?.intent !== "pricing") return false;

    /* ── Search products: Shopify first, then custom DB ── */
    const maxProducts = Math.min((chatbot as any)?.catalogMaxProducts ?? 3, 5);

    /* Extract search term from text — strip common filler words */
    const requestedProductQuery = detectedIntent?.productQuery && /\b\d+(?:\.\d+)?\s*(kg|kgs|kilogram|g|gm|gram|grams)\b/i.test(textBody)
      ? textBody
      : detectedIntent?.productQuery ?? textBody;
    const searchTerm = requestedProductQuery
      .toLowerCase()
      .replace(/\b(what|is|are|do|you|have|tell|me|about|show|your|the|a|an|any|i|want|need|looking|for|price|of|rate|kitna|kya|hai|milta|chahiye|chaye|chahye|chaiye|chahe|mujhe|muje|mjy|mje|ap|aap|please|pls|order|buy|purchase|lena|bhej|recommend|suggest|best)\b/g, " ")
      .replace(/\s+/g, " ").trim()
      .slice(0, 40);
    if (searchTerm.length < 2 && !detectedIntent?.productQuery) return false;

    const products = await searchProductsForWa(searchTerm, maxProducts);

    if (products.length === 0) return false;
    await logWaProcessingStep({
      phone,
      step: "catalog_triggered",
      detail: `Catalog sent for ${detectedIntent?.intent ?? "product intent"}.`,
      payload: { searchTerm, requestedProductQuery, detectedIntent, products: products.map((p) => p.name) },
    });

    /* ── Send each product as a separate message with buttons ── */
    const intro = `جی 😊 official catalog ke matching options yeh hain:`;
    await sendWhatsAppMessage({ phone, message: intro, templateName: "catalog_intro" });
    await new Promise(r => setTimeout(r, 800));

    for (let i = 0; i < products.length; i++) {
      const p = products[i]!;
      const msgText =
        `*${p.name}*\n` +
        `💰 *Price:* ${p.price}\n` +
        (p.variants ? `📦 *Official options:*\n${p.variants}\n` : "") +
        (p.description ? `📝 ${p.description}\n` : "") +
        `\n🔗 ${p.productUrl}`;

      /* WhatsApp has no native product card in free-form messages.
         We send product info as text + interactive buttons (View / Buy / More) */
      await sendInteractiveButtons({
        phone,
        text: msgText,
        buttons: [
          { id: `catalog_view_${i}`, title: "🔗 View Product" },
          { id: `catalog_buy_${i}`,  title: "🛒 Buy Now" },
          { id: "main_menu",         title: "🏠 Main Menu" },
        ],
        footer: `KDF NUTS — Pakistan's premium dry fruits`,
        settings: waSettings,
        templateName: "catalog_product",
      });

      if (i < products.length - 1) await new Promise(r => setTimeout(r, 600));
    }

    /* After product list, offer support */
    await new Promise(r => setTimeout(r, 800));
    await sendInteractiveButtons({
      phone,
      text: `آپ کسی بھی product کے بارے میں مزید جاننا چاہتے ہیں؟ 😊\nOr directly order کرنا چاہتے ہیں? 📦`,
      buttons: [
        { id: "talk_support", title: "💬 Ask Support" },
        { id: "shop_products", title: "🛒 Shop Online" },
        { id: "main_menu",    title: "🏠 Main Menu" },
      ],
      settings: waSettings,
      templateName: "catalog_cta",
    });

    /* Log as ai_reply */
    await db.insert(whatsappLogsTable).values({
      phone,
      templateName: "catalog_reply",
      message: `[Product catalog: ${products.map(p => p.name).join(", ")}]`,
      status: "sent",
    }).catch(() => {});

    return true;
  } catch (err) {
    log?.warn(err, "handleProductCatalog error");
    return false;
  }
}

/* ─── Interactive handler: catalog button taps ─────── */
/* catalog_view_N and catalog_buy_N are handled by generic default in switch → show menu */

/* ─── Helper: send a WhatsApp text via Graph API ────── */
async function sendWaText(phone: string, message: string, _waSettings: any, templateName = "bot_reply"): Promise<string | null> {
  const { sendWhatsAppMessage } = await import("../lib/whatsapp.js");
  const ok = await sendWhatsAppMessage({ phone, message, templateName });
  if (!ok) return null;
  const [row] = await db
    .select({ messageId: whatsappLogsTable.messageId })
    .from(whatsappLogsTable)
    .where(eq(whatsappLogsTable.phone, normalizePhone(phone)))
    .orderBy(desc(whatsappLogsTable.createdAt))
    .limit(1);
  return row?.messageId ?? null;
}

/* ─── Helper: search products (DB + Shopify) ────────── */
function formatRupees(value: unknown): string {
  const n = Number.parseFloat(String(value ?? "0"));
  return `Rs. ${Number.isFinite(n) ? Math.round(n).toLocaleString("en-PK") : "0"}`;
}

function parseMoneyValue(value: unknown): number {
  const matches = String(value ?? "").match(/\d[\d,]*(?:\.\d+)?/g);
  if (!matches?.length) return 0;
  const n = Number.parseFloat(matches[matches.length - 1]!.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseCatalogUnitPrice(value: unknown): number {
  const n = parseMoneyValue(value);
  if (!Number.isFinite(n)) return 0;
  // Some synced catalog payloads store PKR as paisa/cents (85000 => Rs. 850).
  if (n >= 50000 && Number.isInteger(n) && n % 100 === 0) return n / 100;
  return n;
}

function generateWhatsappOrderNumber(): string {
  return "KDF-WA-" + Date.now().toString().slice(-7) + Math.floor(Math.random() * 1000).toString().padStart(3, "0");
}

function normalizeCheckoutPhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function isInvalidCheckoutName(value: unknown): boolean {
  const normalized = normalizeProductText(value);
  if (normalized.length < 3) return true;
  return /^(ok|okay|yes|confirm|confirmed|same|no|nahi|nai|done|cod)$/i.test(normalized);
}

function isValidCheckoutPhone(value: unknown): boolean {
  const digits = normalizeCheckoutPhone(value);
  return digits.length >= 10 && digits.length <= 15;
}

function isCommerceConfirmationText(value: unknown): boolean {
  const normalized = normalizeProductText(value);
  return /^(confirm|confirmed|yes confirm|confirm order|order confirm|ji confirm|han confirm|haan confirm|ok confirm|book order|place order)$/.test(normalized);
}

function isCommerceCancellationText(value: unknown): boolean {
  const normalized = normalizeProductText(value);
  return /^(cancel|cancel order|order cancel|no cancel|nahi cancel|nai cancel|cancel karo|cancel krdo)$/.test(normalized);
}

function normalizeProductText(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeVariantText(value: unknown): string {
  return normalizeProductText(value)
    .replace(/\bgrams?\b/g, "g")
    .replace(/\bgm\b/g, "g")
    .replace(/\bkgs?\b/g, "kg")
    .replace(/\bkilograms?\b/g, "kg")
    .replace(/\s+/g, "");
}

const PRODUCT_ALIASES: Record<string, string[]> = {
  badam: ["almond", "almonds"],
  almond: ["badam", "almonds"],
  almonds: ["badam", "almond"],
  pista: ["pistachio", "pistachios", "pistay", "pisty", "piste", "pistah", "pieta", "pietas", "peta"],
  pistay: ["pista", "pistachio", "pistachios"],
  pisty: ["pista", "pistachio", "pistachios"],
  piste: ["pista", "pistachio", "pistachios"],
  pistah: ["pista", "pistachio", "pistachios"],
  pieta: ["pista", "pistachio", "pistachios"],
  pietas: ["pista", "pistachio", "pistachios"],
  peta: ["pista", "pistachio", "pistachios"],
  pistachio: ["pista", "pistachios", "pistay", "piste", "pieta"],
  pistachios: ["pista", "pistachio", "pistay", "piste", "pieta"],
  kaju: ["cashew", "cashews"],
  cashew: ["kaju", "cashews"],
  cashews: ["kaju", "cashew"],
  akhrot: ["walnut", "walnuts"],
  walnut: ["akhrot", "walnuts"],
  walnuts: ["akhrot", "walnut"],
};

const PRODUCT_ROOT_WORDS = new Set([
  "badam", "almond", "almonds", "pista", "pistay", "pisty", "piste", "pistah", "pieta", "pietas", "peta", "pistachio", "pistachios", "kaju", "cashew", "cashews",
  "akhrot", "walnut", "walnuts", "khajoor", "dates", "anjeer", "fig", "figs", "kishmish", "raisin",
  "raisins", "munakka", "makhana", "peanut", "peanuts", "chilgoza",
]);

function normalizeCatalogProductQuery(query: string): string {
  return normalizeProductText(query)
    .replace(/\b\d+(?:\.\d+)?\s*(kg|kgs|kilogram|g|gm|gram|grams)\b/g, " ")
    .replace(/\b(price|rate|qeemat|kitna|how much|available|chahiye|chaye|chahye|chaiye|chahe|need|show|buy|order|yes|ji|han|haan|please|pls|mujhe|muje|mjy|mje)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryWantsBundle(query: string): boolean {
  return /\b(gift|box|combo|mix|mixed|assorted|portion|hamper|basket)\b/.test(normalizeProductText(query));
}

function isBundleProductName(name: string): boolean {
  return /\b(gift|box|combo|mix|mixed|assorted|portion|hamper|basket)\b/.test(normalizeProductText(name));
}

function productRootTerms(query: string): string[] {
  const q = normalizeCatalogProductQuery(query);
  const roots = new Set<string>(productRootTermsFromQuery(query));
  for (const token of q.split(/\s+/)) {
    if (PRODUCT_ROOT_WORDS.has(token)) {
      roots.add(token);
      for (const alias of PRODUCT_ALIASES[token] ?? []) roots.add(alias);
    }
  }
  return [...roots];
}

function expandProductSearchTerms(query: string): string[] {
  const q = normalizeCatalogProductQuery(query) || normalizeProductText(query);
  const terms = new Set<string>([q, ...expandWaProductSearchTerms(query)]);
  for (const token of q.split(/\s+/)) {
    for (const alias of PRODUCT_ALIASES[token] ?? []) terms.add(alias);
  }
  return [...terms].filter((t) => t.length > 1);
}

function productMatchAnalysis(query: string, name: string, tags?: unknown): { score: number; reason: string; excludedReason?: string; roots: string[] } {
  const expanded = expandProductSearchTerms(query);
  const q = expanded[0] ?? normalizeProductText(query);
  const n = normalizeProductText(name);
  const tagText = normalizeProductText(Array.isArray(tags) ? tags.join(" ") : tags);
  const roots = productRootTerms(query);
  if (!q || !n) return { score: 0, reason: "empty_query_or_name", roots };
  if (roots.length > 0 && isBundleProductName(name) && !queryWantsBundle(query)) {
    return { score: 0, reason: "excluded_bundle_for_specific_product_query", excludedReason: "bundle_or_gift_product", roots };
  }
  if (roots.length > 0 && /\b(oil|butter|powder|paste)\b/.test(n) && !/\b(oil|butter|powder|paste)\b/.test(normalizeProductText(query))) {
    return { score: 0, reason: "excluded_different_product_form", excludedReason: "different_product_form", roots };
  }
  const terms = expanded.flatMap((term) => term.split(/\s+/)).filter((t) => t.length > 1);
  let score = 0;
  if (n === q) score += 100;
  if (n.includes(q)) score += 70;
  for (const root of roots) {
    if (n.split(/\s+/).includes(root)) score += 45;
    else if (n.includes(root)) score += 25;
    if (tagText.includes(root)) score += 12;
  }
  for (const term of terms) {
    if (n.split(/\s+/).includes(term)) score += 18;
    else if (n.includes(term)) score += 8;
    if (tagText.includes(term)) score += 5;
  }
  if (roots.length > 0 && !roots.some((root) => n.includes(root) || tagText.includes(root))) {
    return { score: 0, reason: "excluded_missing_primary_product_root", excludedReason: "missing_primary_product_root", roots };
  }
  return { score, reason: score > 0 ? "matched_primary_product_terms" : "no_positive_match", roots };
}

function productMatchScore(query: string, name: string, tags?: unknown): number {
  return productMatchAnalysis(query, name, tags).score;
}

function formatShopifyVariants(variants: unknown): { label: string; lines: string[]; cheapestPrice: number | null; options: Array<{ id: string; title: string; price: number; compareAtPrice?: number | null; sku?: string; inventoryQuantity?: number; inventoryItemId?: string; weight?: number; weightUnit?: string }> } {
  const arr = Array.isArray(variants) ? variants : [];
  const options = arr
    .filter((v: any) => Number(v?.inventoryQuantity ?? 1) > 0)
    .slice(0, 8)
    .map((v: any) => {
      const title = String(v.title ?? "Default").replace(/^default title$/i, "Standard");
      const price = parseCatalogUnitPrice(v.price);
      const compareAtPrice = v.compareAtPrice ? parseCatalogUnitPrice(v.compareAtPrice) : null;
      return {
        id: String(v.id ?? ""),
        title,
        price,
        compareAtPrice,
        sku: v.sku ? String(v.sku) : undefined,
        inventoryQuantity: Number(v.inventoryQuantity ?? 0),
        inventoryItemId: v.inventoryItemId ? String(v.inventoryItemId) : undefined,
        weight: v.weight != null ? Number(v.weight) : undefined,
        weightUnit: v.weightUnit ? String(v.weightUnit) : undefined,
      };
    });
  const cheapest = options.length ? Math.min(...options.map((v) => v.price).filter((v) => Number.isFinite(v))) : null;
  return {
    label: options.map((v) => `${v.title} — ${formatRupees(v.price)}${v.compareAtPrice && v.compareAtPrice > v.price ? ` (was ${formatRupees(v.compareAtPrice)})` : ""}`).join("\n"),
    lines: options.map((v) => `${v.title} — ${formatRupees(v.price)}${v.compareAtPrice && v.compareAtPrice > v.price ? ` (was ${formatRupees(v.compareAtPrice)})` : ""}`),
    cheapestPrice: cheapest != null && Number.isFinite(cheapest) ? cheapest : null,
    options,
  };
}

async function searchProductsForWa(query: string, limit = 4): Promise<Array<{
  name: string; price: string; compareAt: string | null;
  description: string | null; imageUrl: string | null;
  productUrl: string; variants: string; inStock: boolean;
  source?: "shopify" | "local"; rawPrice?: number; variantLines?: string[];
  shopifyProductId?: string; variantOptions?: Array<{ id: string; title: string; price: number; compareAtPrice?: number | null; sku?: string; inventoryQuantity?: number; inventoryItemId?: string; weight?: number; weightUnit?: string }>;
}>> {
  const websiteUrl = "https://khanbabadryfruits.com";
  const results: Array<any> = [];
  const searchTerms = expandProductSearchTerms(query);
  const matchDiagnostics: Array<{ title: string; score: number; reason: string; excludedReason?: string; source: string; roots?: string[] }> = [];

  try {
    const aliasProductIds = await searchShopifyProductIdsByAlias(query, limit * 3);
    let shopProds: any[] = [];
    if (aliasProductIds.length) {
      shopProds = await fetchShopifyProductsByIds(aliasProductIds);
    }
    if (shopProds.length < limit) {
      const fallback = await db.select({
        title: shopifyProductsTable.title,
        price: shopifyProductsTable.price,
        compareAtPrice: shopifyProductsTable.compareAtPrice,
        description: shopifyProductsTable.description,
        imageUrl: shopifyProductsTable.imageUrl,
        variants: shopifyProductsTable.variants,
        inventoryQuantity: shopifyProductsTable.inventoryQuantity,
        shopifyProductId: shopifyProductsTable.shopifyProductId,
        handle: shopifyProductsTable.handle,
        collections: shopifyProductsTable.collections,
        tags: shopifyProductsTable.tags,
      }).from(shopifyProductsTable)
        .where(and(
          eq(shopifyProductsTable.status, "active"),
          searchTerms.length ? or(...searchTerms.flatMap((term) => [ilike(shopifyProductsTable.title, `%${term}%`), ilike(shopifyProductsTable.tags, `%${term}%`)])) : sql`false`,
        ))
        .orderBy(desc(shopifyProductsTable.inventoryQuantity))
        .limit(limit * 3);
      const seen = new Set(shopProds.map((p) => p.shopifyProductId));
      for (const row of fallback) {
        if (!seen.has(row.shopifyProductId)) shopProds.push(row);
      }
    }

    const scoredShopify = shopProds
      .map((sp: any) => ({ sp, match: productMatchAnalysis(query, sp.title, sp.tags) }));
    matchDiagnostics.push(...scoredShopify.map((x: any) => ({ title: x.sp.title, score: x.match.score, reason: x.match.reason, excludedReason: x.match.excludedReason, source: "shopify", roots: x.match.roots })));
    for (const sp of scoredShopify
      .filter((x: any) => x.match.score > 0)
      .sort((a: any, b: any) => b.match.score - a.match.score)
      .slice(0, limit)) {
      const variants = formatShopifyVariants(sp.sp.variants);
      const basePrice = variants.cheapestPrice ?? parseCatalogUnitPrice(sp.sp.price);
      const handle = sp.sp.handle || sp.sp.shopifyProductId?.replace(/[^a-z0-9-]/gi, "-").toLowerCase() || "product";
      results.push({
        name: sp.sp.title,
        price: variants.lines.length ? `From ${formatRupees(basePrice)}` : formatRupees(parseCatalogUnitPrice(sp.sp.price)),
        compareAt: sp.sp.compareAtPrice ? formatRupees(parseCatalogUnitPrice(sp.sp.compareAtPrice)) : null,
        description: sp.sp.description ? String(sp.sp.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) : null,
        imageUrl: sp.sp.imageUrl ?? null,
        productUrl: `${websiteUrl}/products/${handle}`,
        variants: variants.label,
        variantLines: variants.lines,
        rawPrice: basePrice,
        inStock: (sp.sp.inventoryQuantity ?? 0) > 0 || variants.lines.length > 0,
        source: "shopify",
        shopifyProductId: sp.sp.shopifyProductId,
        variantOptions: variants.options,
      });
    }
  } catch { /* Shopify table may be empty */ }

  await logWaProcessingStep({
    step: "shopify_product_lookup",
    status: results.length ? "sent" : "failed",
    detail: results.length ? `Shopify/live catalog lookup found ${results.length} matching product(s).` : `No exact Shopify/live catalog match for "${query}".`,
    payload: {
      query,
      normalizedQuery: normalizeCatalogProductQuery(query),
      searchTerms,
      count: results.length,
      products: results.map((p) => ({ name: p.name, price: p.price, variants: p.variantLines, source: p.source })),
      diagnostics: matchDiagnostics.slice(0, 20),
    },
    failureReason: results.length ? null : "no_matching_shopify_product",
  });

  return results;
}

/* ─── Helper: format product card as WA text ────────── */
function formatProductCard(p: ReturnType<typeof searchProductsForWa> extends Promise<Array<infer T>> ? T : never, idx: number): string {
  let card = `*${idx + 1}. ${p.name}*\n`;
  card += `💰 *Price:* ${p.price}`;
  if (p.compareAt) card += ` ~~${p.compareAt}~~ 🔥`;
  card += "\n";
  if (p.variants) card += `📦 *Available options:*\n${p.variants}\n`;
  if (p.description) card += `📝 ${p.description}\n`;
  card += `${p.inStock ? "✅ In Stock" : "❌ Out of Stock"}\n`;
  card += `🔗 ${p.productUrl}`;
  return card;
}

async function buildEmergencyAiFallback(opts: {
  textBody: string;
  intent: ReturnType<typeof detectWaIntent>;
  phone?: string;
}): Promise<string> {
  const { textBody, intent, phone } = opts;
  const roman = /[a-z]/i.test(textBody) && !/[اآبپتٹثجچحخدڈذرڑزژسشصضطظعغفقکگلمنوہھیے]/.test(textBody);
  const state = phone ? await getConversationState(phone).catch(() => null) : null;
  if (state?.state?.startsWith("wa_order_")) {
    return roman
      ? "Ji 😊 order ki detail safe hai, restart nahi kar raha. Bas ek moment technical issue aya hai; aap wahi next detail bhej dein, main order continue kar deta hoon."
      : "جی 😊 order کی detail safe ہے، restart نہیں کر رہا۔ بس ایک moment technical issue آیا ہے؛ آپ وہی next detail بھیج دیں، میں order continue کر دیتا ہوں۔";
  }
  if (shouldSendCatalogForIntent(intent.intent) && !isGenericCategoryQuery(intent.productQuery)) {
    const query = intent.productQuery && /\b\d+(?:\.\d+)?\s*(kg|kgs|kilogram|g|gm|gram|grams)\b/i.test(textBody)
      ? textBody
      : intent.productQuery ?? textBody;
    const products = await searchProductsForWa(query, 3).catch(() => []);
    if (products.length > 0) {
      const lines = products.map((p) => {
        const variants = p.variantLines?.length ? `\n${p.variantLines.map((v) => `- ${v}`).join("\n")}` : ` ${p.price}`;
        return `*${p.name}*${variants}`;
      });
      return roman
        ? `Ji 😊 official catalog ke mutabiq matching options:\n\n${lines.join("\n\n")}\n\nAap chahein to main order bhi start kar deta hoon 👍`
        : `جی 😊 official catalog کے مطابق matching options:\n\n${lines.join("\n\n")}\n\nآپ چاہیں تو میں order بھی start کر دیتا ہوں 👍`;
    }
  }
  if (intent.intent === "greeting") {
    return roman
      ? "Assalam o Alaikum 😊 Alhamdulillah, main theek hoon. Aap batayein, kis product ya order mein madad chahiye?"
      : "وعلیکم السلام 😊 الحمدللہ، میں ٹھیک ہوں۔ آپ بتائیں کس product یا order میں مدد چاہیے؟";
  }
  if (intent.intent === "delivery") {
    const delivery = await tryDeterministicWaReply({
      phone: phone ?? "",
      textBody,
      currentState: "idle",
      detectedIntent: "delivery",
    });
    if (delivery) return delivery;
  }
  if (intent.intent === "conversation" || intent.intent === "support" || intent.intent === "general") {
    return roman
      ? "Ji 😊 batayein — product, price, delivery, ya order status?"
      : "جی 😊 بتائیں — product، price، delivery، یا order status؟";
  }
  return roman
    ? "Ji 😊 aapka message receive ho gaya. Aap thori detail share kar dein, main madad karta hoon."
    : "جی 😊 آپ کا message receive ہو گیا۔ تھوڑی detail share کر دیں، میں مدد کرتا ہوں۔";
}

const QUICK_ORDER_CATEGORIES = [
  { key: "badam", label: "بادام / Badam" },
  { key: "akhrot", label: "اخروٹ / Akhrot" },
  { key: "kaju", label: "کاجو / Kaju" },
  { key: "pista", label: "پستہ / Pista" },
  { key: "anjeer", label: "خشک انجیر / Anjeer" },
];

async function sendQuickOrderMenu(phone: string, waSettings: any): Promise<void> {
  await setConversationState(phone, "quick_order_menu", { source: "quick_order_menu" });
  await sendWaText(phone, `جی 😊 خوش آمدید

آسان آرڈر کے لیے نمبر منتخب کریں:

1️⃣ پروڈکٹس دیکھیں
2️⃣ آرڈر کریں
3️⃣ قیمت پوچھیں
4️⃣ موجودہ آرڈر ٹریک کریں
5️⃣ کسٹمر سپورٹ
6️⃣ انسان سے بات کریں

آپ صرف نمبر reply کر سکتے ہیں، مثال: 2`, waSettings, "quick_order_menu");
}

async function transcribeWhatsAppVoice(opts: {
  mediaId?: string;
  waSettings: any;
  phone: string;
  messageId?: string;
}): Promise<string | null> {
  if (!opts.mediaId || !opts.waSettings?.accessToken) return null;
  try {
    const version = opts.waSettings.apiVersion ?? "v18.0";
    const meta = await fetch(`https://graph.facebook.com/${version}/${opts.mediaId}`, {
      headers: { Authorization: `Bearer ${opts.waSettings.accessToken}` },
    }).then((r) => r.json() as Promise<any>);
    if (!meta?.url) throw new Error(meta?.error?.message ?? "WhatsApp media URL missing");
    const mediaRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${opts.waSettings.accessToken}` } });
    if (!mediaRes.ok) throw new Error(`WhatsApp media download failed: ${mediaRes.status}`);
    const buffer = Buffer.from(await mediaRes.arrayBuffer());
    const { client } = await resolveOpenAIClient();
    const { toFile } = await import("openai");
    const file = await toFile(buffer, "whatsapp-voice.ogg", { type: meta.mime_type ?? "audio/ogg" });
    const result = await (client as any).audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "text",
    });
    const text = String(result ?? "").trim();
    if (text) {
      await logWaProcessingStep({
        phone: opts.phone,
        messageId: opts.messageId,
        step: "voice_transcribed",
        detail: "WhatsApp voice note converted to text for AI/order flow.",
        payload: { mediaId: opts.mediaId, textPreview: text.slice(0, 300) },
      });
    }
    return text || null;
  } catch (err) {
    await logWaProcessingStep({
      phone: opts.phone,
      messageId: opts.messageId,
      step: "voice_transcription_failed",
      status: "failed",
      detail: "Voice note could not be transcribed.",
      payload: { error: err instanceof Error ? err.message : String(err) },
      failureReason: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function sendQuickCategoryMenu(phone: string, waSettings: any, mode: "order" | "price"): Promise<void> {
  await setConversationState(phone, mode === "order" ? "quick_order_category" : "quick_price_category", { mode });
  await sendWaText(phone, `براہ کرم category منتخب کریں:

${QUICK_ORDER_CATEGORIES.map((cat, idx) => `${idx + 1}️⃣ ${cat.label}`).join("\n")}

0️⃣ انسان سے بات کریں`, waSettings, "quick_category_menu");
}

async function handleQuickOrderNumber(opts: {
  phone: string;
  textBody: string;
  currentState: string;
  waSettings: any;
  detectedIntent?: ReturnType<typeof detectWaIntent>;
}): Promise<boolean> {
  const choice = opts.textBody.trim().replace(/[^0-9]/g, "");
  if (!choice) return false;

  if (choice === "0" || (opts.currentState === "quick_order_menu" && choice === "6")) {
    await setConversationState(opts.phone, "human_requested", { requestedAt: new Date().toISOString() });
    await createAdminAlert({ title: "WhatsApp human handoff requested", message: `Customer ${opts.phone} requested human support.`, type: "wa_human_handoff", dedupeMinutes: 5 });
    await sendWaText(opts.phone, "جی 😊 ہماری team کو notify کر دیا ہے۔ ایک representative آپ سے جلد رابطہ کرے گا۔", opts.waSettings, "human_handoff_requested");
    return true;
  }

  if (opts.currentState === "quick_order_category" || opts.currentState === "quick_price_category") {
    const category = QUICK_ORDER_CATEGORIES[Number(choice) - 1];
    if (!category) {
      await sendQuickCategoryMenu(opts.phone, opts.waSettings, opts.currentState === "quick_order_category" ? "order" : "price");
      return true;
    }
    if (opts.currentState === "quick_price_category") {
      await handleProductCatalog({ phone: opts.phone, textBody: category.key, waSettings: opts.waSettings, detectedIntent: { intent: "product_price", confidence: 0.9, reason: "quick menu category", productQuery: category.key } as any });
      await setConversationState(opts.phone, "idle", {});
      return true;
    }
    await persistConversationTurn(opts.phone, {
      intent: "order_start",
      topic: "category_selected",
      mergeStateData: { selectedCategory: category.label, selectedCategoryKey: category.key },
    });
    return startCommerceOrderFromText({
      phone: opts.phone,
      textBody: `${category.key} order`,
      waSettings: opts.waSettings,
      detectedIntent: { intent: "order_start", confidence: 0.95, reason: "quick menu category", productQuery: category.key } as any,
    });
  }

  if (opts.currentState !== "quick_order_menu" && opts.currentState !== "menu_shown") return false;

  if (choice === "1") {
    await sendQuickCategoryMenu(opts.phone, opts.waSettings, "price");
    return true;
  }
  if (choice === "2") {
    await sendQuickCategoryMenu(opts.phone, opts.waSettings, "order");
    return true;
  }
  if (choice === "3") {
    await sendQuickCategoryMenu(opts.phone, opts.waSettings, "price");
    return true;
  }
  if (choice === "4") {
    await setConversationState(opts.phone, "awaiting_tracking_input", {});
    await sendWaText(opts.phone, "Order track karne ke liye apna order number, tracking ID, ya phone number bhej dein.", opts.waSettings, "quick_track_prompt");
    return true;
  }
  if (choice === "5") {
    await setConversationState(opts.phone, "ai_chat", {});
    await sendWaText(opts.phone, "جی 😊 آپ اپنا سوال آسان الفاظ میں لکھ دیں یا voice note بھیج دیں۔", opts.waSettings, "quick_support_prompt");
    return true;
  }
  return false;
}

async function calculateWhatsAppOrderTotal(opts: {
  productQuery: string;
  quantity?: number;
  variantTitle?: string;
  city?: string;
  couponCode?: string;
}) {
  const products = await searchProductsForWa(opts.productQuery, 1);
  const product = products[0];
  if (!product) {
    return { ok: false, reason: "No matching product found. Cannot calculate total without official price." };
  }
  const qty = Math.max(1, Math.min(99, Number(opts.quantity ?? 1) || 1));
  let unitPrice = parseCatalogUnitPrice(product.rawPrice);
  let matchedVariant = product.variantLines?.[0] ?? "";
  if (opts.variantTitle && product.variantLines?.length) {
    const wanted = normalizeProductText(opts.variantTitle);
    const found = product.variantLines.find((line) => normalizeProductText(line).includes(wanted));
    if (found) {
      matchedVariant = found;
      const priceMatch = found.match(/Rs\.\s*([\d,]+)/i);
      if (priceMatch) unitPrice = parseCatalogUnitPrice(priceMatch[1]);
    }
  }
  const subtotal = unitPrice * qty;

  let discount = 0;
  let promo = "No active promotion applied";
  if (opts.couponCode) {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, opts.couponCode.toUpperCase())).limit(1).catch(() => []);
    if (coupon?.active && (!coupon.expiresAt || new Date(coupon.expiresAt) >= new Date()) && subtotal >= Number(coupon.minOrder ?? 0)) {
      discount = coupon.type === "percentage" ? subtotal * Number(coupon.value) / 100 : Math.min(Number(coupon.value), subtotal);
      promo = `${coupon.code} applied: -${formatRupees(discount)}`;
    }
  }

  let delivery = 300;
  let deliveryLabel = "Estimated standard delivery";
  const city = normalizeProductText(opts.city ?? "");
  const rules = await db.select().from(shippingRulesTable).where(eq(shippingRulesTable.enabled, true)).orderBy(asc(shippingRulesTable.priority), asc(shippingRulesTable.id)).catch(() => []);
  const amountForShipping = subtotal - discount;
  const matchingRule = rules.find((rule: any) => {
    const cities = Array.isArray(rule.cities) ? rule.cities.map(normalizeProductText) : [];
    if (cities.length && city && !cities.some((c: string) => city.includes(c))) return false;
    const min = Number(rule.minValue ?? 0);
    const max = Number(rule.maxValue ?? 0);
    if (rule.type === "amount" && min && amountForShipping < min) return false;
    if (rule.type === "amount" && max && amountForShipping > max) return false;
    return ["amount", "flat"].includes(rule.type);
  });
  if (matchingRule) {
    delivery = Number(matchingRule.price ?? 0);
    deliveryLabel = `${matchingRule.methodName} (${matchingRule.deliveryTime})`;
  }
  if (amountForShipping >= 10000) {
    delivery = 0;
    deliveryLabel = "FREE delivery (order above Rs. 10,000)";
  }

  const total = Math.max(0, subtotal - discount + delivery);
  return {
    ok: true,
    product: product.name,
    variant: matchedVariant,
    quantity: qty,
    unitPrice: formatRupees(unitPrice),
    subtotal: formatRupees(subtotal),
    discount: formatRupees(discount),
    promotion: promo,
    delivery: formatRupees(delivery),
    deliveryLabel,
    total: formatRupees(total),
    note: "Totals use official catalog price and configured shipping/promotion rules.",
  };
}

const WA_SHOPIFY_API_VERSION = "2024-01";

function parseCommerceOrderRequest(text: string, fallbackQuery?: string) {
  const normalized = normalizeProductText(text);
  const weightMatch = normalized.match(/\b(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|g|gm|gram|grams)\b/i);
  const qtyMatch =
    normalized.match(/\b(?:qty|quantity|pack|packs|pcs|piece)\s*(\d+)\b/i) ??
    normalized.match(/\b(\d+)\s*(x|pcs|piece|pack|packs|qty|quantity)\b/i);
  const quantity = qtyMatch ? Math.max(1, Number(qtyMatch[1])) : 1;
  const variantTitle = weightMatch
    ? `${weightMatch[1]}${weightMatch[2].toLowerCase().startsWith("k") ? "KG" : "g"}`
    : undefined;
  const productQuery = (fallbackQuery || normalized
    .replace(/\b(order|buy|purchase|mangwana|bhej|bejo|checkout|bill|bil|invoice|receipt|bna|bana|banao|bnao|karna|krna|hai|chahiye|please|pls|mujhe|ap|aap|ke|k)\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(kg|kgs|kilogram|g|gm|gram|grams|x|pcs|piece|pack)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()) || normalized;
  return { productQuery, quantity, variantTitle, quantityExplicit: Boolean(qtyMatch) };
}

async function findCommerceProductVariant(productQuery: string, variantHint?: string) {
  const products = await searchProductsForWa(productQuery, 1);
  const product = products[0];
  if (!product || product.source !== "shopify") return null;
  let selected = product.variantOptions?.[0] ?? null;
  if (variantHint && product.variantOptions?.length) {
    const wanted = normalizeVariantText(variantHint);
    selected = product.variantOptions.find((v) => {
      const title = normalizeVariantText(v.title);
      return title === wanted || title.includes(wanted) || wanted.includes(title);
    }) ?? selected;
  }
  if (!selected) return null;
  return {
    product,
    variant: selected,
    unitPrice: parseCatalogUnitPrice(selected.price),
    variantTitle: selected.title,
    variantId: selected.id,
  };
}

function buildCommerceSummary(data: Record<string, any>): string {
  if (Array.isArray(data.cart) && data.cart.length > 1) {
    const lines = data.cart.map((item: any) =>
      `• ${item.quantity} x ${item.productName} (${item.variantTitle}) — ${formatRupees(Number(item.unitPrice ?? 0) * Number(item.quantity ?? 1))}`,
    );
    return `🧾 *Order Summary*\n\n${lines.join("\n")}\n\n` +
      `💵 *Subtotal:* ${formatRupees(data.subtotal)}\n` +
      `🚚 *Delivery:* ${data.deliveryLabel ?? "Will confirm by city"}\n` +
      `━━━━━━━━━━\n` +
      `💵 *Final:* ${formatRupees(data.total ?? data.subtotal)}`;
  }
  return `🧾 *Order Summary*\n\n` +
    `🥜 *Product:* ${data.productName}\n` +
    `⚖ *Variant:* ${data.variantTitle}\n` +
    `📦 *Qty:* ${data.quantity}\n` +
    `💰 *Price:* ${formatRupees(data.unitPrice)}\n` +
    `💵 *Subtotal:* ${formatRupees(data.subtotal)}\n` +
    `🚚 *Delivery:* ${data.deliveryLabel ?? "Will confirm by city"}\n` +
    `━━━━━━━━━━\n` +
    `💵 *Final:* ${formatRupees(data.total ?? data.subtotal)}`;
}

function normalizeCommerceTotals(stateData: Record<string, any>): Record<string, any> {
  const cart = Array.isArray(stateData.cart) && stateData.cart.length
    ? stateData.cart
    : [{
      productName: stateData.productName,
      shopifyProductId: stateData.shopifyProductId,
      variantId: stateData.variantId,
      variantTitle: stateData.variantTitle,
      quantity: stateData.quantity,
      unitPrice: stateData.unitPrice,
      imageUrl: stateData.imageUrl,
      sku: stateData.sku,
    }];

  const cleanCart = cart.map((item: any) => ({
    ...item,
    productName: String(item.productName ?? stateData.productName ?? "Product").trim(),
    variantTitle: String(item.variantTitle ?? stateData.variantTitle ?? "Standard").trim(),
    quantity: Math.max(1, Number.parseInt(String(item.quantity ?? 1), 10) || 1),
    unitPrice: parseCatalogUnitPrice(item.unitPrice),
  })).filter((item: any) => item.productName && item.unitPrice > 0);

  const subtotal = cleanCart.reduce((sum: number, item: any) => sum + item.unitPrice * item.quantity, 0);
  const delivery = subtotal >= 10000 ? 0 : parseMoneyValue(stateData.delivery ?? 300) || 300;
  const deliveryLabel = subtotal >= 10000
    ? "Rs. 0 (FREE delivery above Rs. 10,000)"
    : `${formatRupees(delivery)} (Estimated standard delivery)`;
  const total = Math.max(0, subtotal + delivery);

  return {
    ...stateData,
    cart: cleanCart,
    quantity: cleanCart[0]?.quantity ?? stateData.quantity,
    unitPrice: cleanCart[0]?.unitPrice ?? stateData.unitPrice,
    subtotal,
    delivery,
    deliveryLabel,
    total,
  };
}

function validateCommerceCheckoutState(stateData: Record<string, any>): string | null {
  if (!Array.isArray(stateData.cart) || stateData.cart.length === 0) return "cart_missing";
  if (stateData.cart.some((item: any) => !item.productName || !item.variantTitle || Number(item.unitPrice ?? 0) <= 0)) return "invalid_cart_item";
  if (stateData.cart.some((item: any) => Number(item.quantity ?? 0) < 1 || Number(item.quantity ?? 0) > 99)) return "invalid_quantity";
  if (Number(stateData.subtotal ?? 0) <= 0 || Number(stateData.total ?? 0) <= 0) return "invalid_total";
  if (isInvalidCheckoutName(stateData.customerName)) return "invalid_customer_name";
  if (!isValidCheckoutPhone(stateData.customerPhone)) return "invalid_customer_phone";
  if (!String(stateData.address ?? "").trim() || String(stateData.address ?? "").trim().length < 8) return "invalid_address";
  if (!String(stateData.city ?? "").trim() || String(stateData.city ?? "").trim().length < 2) return "invalid_city";
  return null;
}

async function buildCommerceStateDataFromSelection(params: {
  product: Awaited<ReturnType<typeof searchProductsForWa>>[number];
  variant: { id: string; title: string; price: number; sku?: string; inventoryQuantity?: number };
  quantity: number;
}) {
  const unitPrice = parseCatalogUnitPrice(params.variant.price);
  const subtotal = unitPrice * params.quantity;
  const totalCalc = await calculateWhatsAppOrderTotal({
    productQuery: params.product.name,
    quantity: params.quantity,
    variantTitle: params.variant.title,
  }).catch(() => null);
  return {
    cart: [{
      productName: params.product.name,
      shopifyProductId: params.product.shopifyProductId,
      variantId: params.variant.id,
      variantTitle: params.variant.title,
      quantity: params.quantity,
      unitPrice,
      imageUrl: params.product.imageUrl,
      sku: params.variant.sku,
    }],
    productName: params.product.name,
    shopifyProductId: params.product.shopifyProductId,
    variantId: params.variant.id,
    variantTitle: params.variant.title,
    quantity: params.quantity,
    unitPrice,
    subtotal,
    delivery: totalCalc && (totalCalc as any).ok ? parseMoneyValue((totalCalc as any).delivery) : 300,
    deliveryLabel: totalCalc && (totalCalc as any).ok ? `${(totalCalc as any).delivery} (${(totalCalc as any).deliveryLabel})` : "Will confirm by city",
    total: totalCalc && (totalCalc as any).ok ? parseMoneyValue((totalCalc as any).total) : subtotal + 300,
    source: "whatsapp_ai_commerce",
  };
}

async function startCommerceOrderFromText(opts: {
  phone: string;
  textBody: string;
  waSettings: any;
  detectedIntent: ReturnType<typeof detectWaIntent>;
}): Promise<boolean> {
  const parsed = parseCommerceOrderRequest(opts.textBody, opts.detectedIntent.productQuery);
  if (!parsed.productQuery || parsed.productQuery.length < 2) {
    await logWaProcessingStep({
      phone: opts.phone,
      step: "commerce_order_needs_product",
      status: "received",
      detail: "Customer asked for bill/order but product or variant was missing.",
      payload: { textBody: opts.textBody, detectedIntent: opts.detectedIntent },
    });
    await setConversationState(opts.phone, "wa_order_await_product", { source: "whatsapp_ai_commerce" });
    await sendWaText(opts.phone, "Ji 😊 bill bana deta hoon. Sab se pehle product ka naam bhej dein.\n\nExample: *Badam*, *Kaju*, *Pista*", opts.waSettings);
    return true;
  }
  const products = await searchProductsForWa(parsed.productQuery, 4);
  const product = products[0];
  if (!product || product.source !== "shopify") {
    await logWaProcessingStep({
      phone: opts.phone,
      step: "commerce_order_start_failed",
      status: "failed",
      detail: "Could not start WhatsApp commerce order because no official Shopify product matched.",
      payload: parsed,
      failureReason: "shopify_product_not_found",
    });
    await sendWaText(opts.phone, "Sorry, is product ka official data nahi mila. Please product ka exact naam bhej dein.", opts.waSettings);
    return true;
  }
  const needsProductChoice = products.length > 1 && !/\b(shell|kaghzi|kagzi|with shell|without shell|baghair|bghair|soft|hard)\b/i.test(opts.textBody);
  if (needsProductChoice) {
    await setConversationState(opts.phone, "wa_order_await_product_choice", { productQuery: parsed.productQuery, products });
    await logWaProcessingStep({
      phone: opts.phone,
      step: "commerce_product_choice_requested",
      status: "received",
      detail: "Multiple matching products found; asking customer to choose exact product.",
      payload: { query: parsed.productQuery, products: products.map((p) => ({ name: p.name, variants: p.variantLines })) },
    });
    await sendWaText(
      opts.phone,
      `جی 😊 Shopify catalog mein yeh matching products available hain:\n\n${products.map((p, i) => `${i + 1}️⃣ ${p.name}`).join("\n")}\n\nKaunsa chahiye? Number reply kar dein.`,
      opts.waSettings,
    );
    return true;
  }
  if (!parsed.variantTitle && (product.variantOptions?.length ?? 0) > 1) {
    await setConversationState(opts.phone, "wa_order_await_variant", { productQuery: parsed.productQuery, product });
    await logWaProcessingStep({
      phone: opts.phone,
      step: "commerce_order_variant_requested",
      status: "received",
      detail: "Product found; asking customer to select official Shopify variant.",
      payload: { product: product.name, variants: product.variantLines },
    });
    const variantMenu = product.variantOptions?.map((v: any, i: number) =>
      `${i + 1}️⃣ ${v.title} — ${formatRupees(parseCatalogUnitPrice(v.price))}${v.compareAtPrice && v.compareAtPrice > v.price ? ` (was ${formatRupees(v.compareAtPrice)})` : ""}`,
    ).join("\n") || product.variants;
    await sendWaText(opts.phone, `جی 😊 *${product.name}* ke available Shopify variants:\n\n${variantMenu}\n\nNumber reply kar dein, example: 3`, opts.waSettings);
    return true;
  }
  const found = await findCommerceProductVariant(parsed.productQuery, parsed.variantTitle);
  if (!found) {
    await logWaProcessingStep({
      phone: opts.phone,
      step: "commerce_order_start_failed",
      status: "failed",
      detail: "Could not start WhatsApp commerce order because no official Shopify variant matched.",
      payload: parsed,
      failureReason: "shopify_variant_not_found",
    });
    await sendWaText(opts.phone, "Sorry, is product/variant ka official price nahi mila. Please product ka exact naam ya weight bhej dein.", opts.waSettings);
    return true;
  }
  if (!parsed.quantityExplicit) {
    await setConversationState(opts.phone, "wa_order_await_quantity", {
      product: found.product,
      variant: found.variant,
      productName: found.product.name,
      selectedProductName: found.product.name,
      selectedVariantTitle: found.variantTitle,
      selectedCategory: parsed.productQuery,
      variantTitle: found.variantTitle,
      unitPrice: found.unitPrice,
    });
    await sendWaText(opts.phone, `Perfect 😊\n\n*${found.product.name}*\nVariant: *${found.variantTitle}*\nPrice: *${formatRupees(found.unitPrice)}*\n\nQuantity kitni chahiye? (Example: 1, 2, 3)`, opts.waSettings);
    return true;
  }
  const stateData = await buildCommerceStateDataFromSelection({ product: found.product, variant: found.variant, quantity: parsed.quantity });
  await setConversationState(opts.phone, "wa_order_await_name", stateData);
  await logWaProcessingStep({
    phone: opts.phone,
    step: "commerce_order_started",
    status: "received",
    detail: "WhatsApp commerce order started from official Shopify variant.",
    payload: stateData,
  });
  await sendWaText(opts.phone, `${buildCommerceSummary(stateData)}\n\nOrder confirm karne ke liye apna *naam* bhej dein 😊`, opts.waSettings);
  return true;
}

async function createEcommerceOrderFromWhatsApp(phone: string, rawStateData: Record<string, any>) {
  const stateData = normalizeCommerceTotals(rawStateData);
  const validationError = validateCommerceCheckoutState(stateData);
  if (validationError) {
    throw new Error(`Order validation failed: ${validationError}`);
  }

  const orderNumber = generateWhatsappOrderNumber();
  const shippingAddress = {
    name: String(stateData.customerName).trim(),
    phone: normalizeCheckoutPhone(stateData.customerPhone || phone),
    address: String(stateData.address).trim(),
    city: String(stateData.city).trim(),
    country: "Pakistan",
  };
  const paymentMethod = /bank/i.test(String(stateData.paymentMethod ?? "")) ? "bank_transfer" : "cod";
  const now = new Date();

  const result = await (db as any).transaction(async (tx: any) => {
    const [order] = await tx.insert(ordersTable).values({
      userId: null,
      orderNumber,
      status: "confirmed",
      paymentStatus: paymentMethod === "cod" ? "unpaid" : "pending",
      subtotal: Number(stateData.subtotal).toFixed(2),
      discount: "0.00",
      deliveryFee: Number(stateData.delivery ?? 0).toFixed(2),
      loyaltyDiscount: "0.00",
      walletDiscount: "0.00",
      total: Number(stateData.total).toFixed(2),
      deliveryType: "standard",
      courier: null,
      paymentMethod,
      shippingAddress,
      notes: [stateData.notes ? `Customer note: ${stateData.notes}` : "", "Source: WhatsApp AI Commerce", "Courier booking: Manual review required"].filter(Boolean).join("\n"),
      trackingId: null,
      confirmedAt: now,
    }).returning();

    const insertedItems = await tx.insert(orderItemsTable).values(
      stateData.cart.map((item: any) => ({
        orderId: order.id,
        productId: null,
        name: item.productName,
        variant: item.variantTitle,
        price: Number(item.unitPrice).toFixed(2),
        qty: Number(item.quantity ?? 1),
        gradient: null,
      })),
    ).returning();

    const [shipment] = await tx.insert(shipmentsTable).values({
      orderId: order.id,
      courierId: null,
      courierSlug: null,
      trackingId: null,
      status: "pending",
      statusHistory: [{ status: "pending", timestamp: now.toISOString(), note: "Order confirmed; courier booking pending admin review" }],
      customerName: shippingAddress.name,
      customerPhone: shippingAddress.phone,
      customerAddress: shippingAddress.address,
      customerCity: shippingAddress.city,
      codAmount: Number(stateData.total).toFixed(2),
      pieces: stateData.cart.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 1), 0),
      contentDesc: stateData.cart.map((item: any) => item.productName).join(", ").slice(0, 250),
      isCod: paymentMethod === "cod",
      bookingSource: "manual_pending",
      rawResponse: { note: "Courier not booked yet. Admin must review and click Book Courier.", orderNumber },
    } as any).returning();

    return { order, insertedItems, shipment, stateData };
  });

  const notifPayload = {
    title: `New WhatsApp Order #${result.order.orderNumber}`,
    message: `Rs. ${Number(result.order.total).toLocaleString("en-PK")} from ${shippingAddress.name}`,
    type: "order",
    isRead: false,
    orderId: result.order.id,
  };
  const [notif] = await db.insert(adminNotificationsTable).values(notifPayload as any).returning().catch(() => [null]);
  if (notif) broadcastSSE("new_order", notif);

  return result;
}

async function createShopifyOrderFromWhatsApp(phone: string, stateData: Record<string, any>) {
  const [store] = await db.select().from(shopifyStoresTable).where(eq(shopifyStoresTable.isConnected, true)).limit(1);
  if (!store?.shopDomain || !store.accessToken) {
    throw new Error("Shopify store not connected or access token missing");
  }
  const lineItems = (stateData.cart ?? []).map((item: any) => ({
    variant_id: Number(item.variantId),
    quantity: Number(item.quantity ?? 1),
  })).filter((li: any) => li.variant_id && li.quantity > 0);
  if (!lineItems.length) throw new Error("No valid Shopify variant in WhatsApp cart");
  const customerName = String(stateData.customerName ?? "WhatsApp Customer").trim();
  const [firstName, ...lastParts] = customerName.split(/\s+/);
  const payload = {
    order: {
      line_items: lineItems,
      customer: {
        first_name: firstName || customerName,
        last_name: lastParts.join(" "),
        phone,
      },
      shipping_address: {
        first_name: firstName || customerName,
        last_name: lastParts.join(" "),
        name: customerName,
        phone: stateData.customerPhone || phone,
        address1: stateData.address,
        city: stateData.city,
        country: "Pakistan",
      },
      phone: stateData.customerPhone || phone,
      financial_status: "pending",
      tags: "WhatsApp, NEW ORDER, CONFIRMED",
      note: [stateData.notes ? `Notes: ${stateData.notes}` : "", `Source: WhatsApp AI Commerce`, `Payment: ${stateData.paymentMethod ?? "COD"}`].filter(Boolean).join("\n"),
    },
  };
  const url = `https://${store.shopDomain}/admin/api/${WA_SHOPIFY_API_VERSION}/orders.json`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": store.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const raw = await resp.text();
  let json: any = {};
  try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
  if (!resp.ok || !json.order) {
    throw new Error(`Shopify order create failed ${resp.status}: ${raw.slice(0, 500)}`);
  }
  const o = json.order;
  const addr = o.shipping_address ?? {};
  const items = (o.line_items ?? []).map((li: any) => ({
    id: String(li.id),
    title: li.title,
    quantity: li.quantity,
    price: li.price,
    sku: li.sku,
    variantTitle: li.variant_title,
  }));
  const [orderRow] = await db.insert(shopifyOrdersTable).values({
    storeId: store.id,
    shopifyOrderId: String(o.id),
    orderNumber: o.name ?? `#${o.order_number}`,
    customerName,
    customerEmail: o.customer?.email ?? null,
    customerPhone: stateData.customerPhone || phone,
    status: "confirmed",
    fulfillmentStatus: o.fulfillment_status ?? null,
    financialStatus: o.financial_status ?? "pending",
    currency: o.currency ?? "PKR",
    totalPrice: o.total_price ?? String(stateData.total ?? stateData.subtotal ?? 0),
    subtotalPrice: o.subtotal_price ?? String(stateData.subtotal ?? 0),
    totalTax: o.total_tax ?? "0",
    totalDiscounts: o.total_discounts ?? "0",
    shippingAddress: { name: customerName, address1: addr.address1 ?? stateData.address, city: addr.city ?? stateData.city, country: addr.country ?? "Pakistan", phone: stateData.customerPhone || phone, zip: addr.zip },
    lineItems: items,
    tags: "WhatsApp, NEW ORDER, CONFIRMED",
    note: payload.order.note,
    shopifyCreatedAt: o.created_at ? new Date(o.created_at) : new Date(),
    shopifyUpdatedAt: o.updated_at ? new Date(o.updated_at) : new Date(),
    syncedAt: new Date(),
  } as any).onConflictDoUpdate({
    target: shopifyOrdersTable.shopifyOrderId,
    set: {
      status: "confirmed",
      fulfillmentStatus: o.fulfillment_status ?? null,
      financialStatus: o.financial_status ?? "pending",
      totalPrice: o.total_price ?? String(stateData.total ?? stateData.subtotal ?? 0),
      lineItems: items,
      tags: "WhatsApp, NEW ORDER, CONFIRMED",
      shopifyUpdatedAt: o.updated_at ? new Date(o.updated_at) : new Date(),
      syncedAt: new Date(),
      updatedAt: new Date(),
    },
  }).returning();
  return { order: o, orderRow, lineItems: items };
}

async function handleCommerceOrderFlow(phone: string, text: string, state: string, waSettings: any, log?: any): Promise<void> {
  const convState = await getConversationState(phone);
  const stateData: Record<string, any> = JSON.parse((convState as any)?.stateData ?? "{}");
  const trimmed = text.trim();
  if (state === "wa_order_await_product") {
    await startCommerceOrderFromText({
      phone,
      textBody: trimmed,
      waSettings,
      detectedIntent: { intent: "order_start", confidence: 0.88, reason: "product provided during commerce flow", productQuery: trimmed },
    });
    return;
  }
  if (state === "wa_order_await_product_choice") {
    const products = Array.isArray(stateData.products) ? stateData.products : [];
    const selectedIndex = Number.parseInt(trimmed.replace(/[^0-9]/g, ""), 10) - 1;
    const selected = products[selectedIndex] ?? products.find((p: any) => normalizeProductText(p.name).includes(normalizeProductText(trimmed)));
    if (!selected) {
      await sendWaText(phone, `Please in options mein se number ya naam select karein:\n\n${products.map((p: any, i: number) => `${i + 1}. ${p.name}`).join("\n")}`, waSettings);
      return;
    }
    if ((selected.variantOptions?.length ?? 0) > 1) {
      await setConversationState(phone, "wa_order_await_variant", { productQuery: stateData.productQuery, product: selected });
      await sendWaText(phone, `جی 😊 *${selected.name}* ke available variants:\n\n${selected.variantLines?.map((v: string) => `• ${v}`).join("\n") || selected.variants}\n\nKaunsa variant chahiye?`, waSettings);
      return;
    }
    const variant = selected.variantOptions?.[0];
    if (!variant) {
      await sendWaText(phone, "Is product ka variant/price available nahi. Please doosra product select kar dein.", waSettings);
      return;
    }
    await setConversationState(phone, "wa_order_await_quantity", {
      product: selected,
      variant,
      productName: selected.name,
      selectedProductName: selected.name,
      selectedVariantTitle: variant.title,
      selectedCategory: stateData.productQuery ?? "",
      variantTitle: variant.title,
      unitPrice: parseCatalogUnitPrice(variant.price),
    });
    await sendWaText(phone, `Perfect 😊\n\n*${selected.name}*\nVariant: *${variant.title}*\nPrice: *${formatRupees(parseCatalogUnitPrice(variant.price))}*\n\nQuantity kitni chahiye? (Example: 1, 2, 3)`, waSettings);
    return;
  }
  if (state === "wa_order_await_variant") {
    const product = stateData.product;
    const options = Array.isArray(product?.variantOptions) ? product.variantOptions : [];
    const wanted = normalizeProductText(trimmed);
    const selectedIndex = Number.parseInt(trimmed.replace(/[^0-9]/g, ""), 10) - 1;
    const selectedByNumber = Number.isFinite(selectedIndex) && selectedIndex >= 0 ? options[selectedIndex] : null;
    const selected = selectedByNumber ?? options.find((v: any) => {
      const title = normalizeVariantText(v.title);
      return title === normalizeVariantText(trimmed) || title.includes(normalizeVariantText(trimmed)) || normalizeVariantText(trimmed).includes(title);
    })
      ?? null;
    if (!product || !selected) {
      await sendWaText(phone, `Please available Shopify variants mein se number select karein:\n\n${options.map((v: any, i: number) => `${i + 1}️⃣ ${v.title} — ${formatRupees(parseCatalogUnitPrice(v.price))}`).join("\n")}`, waSettings);
      return;
    }
    await setConversationState(phone, "wa_order_await_quantity", {
      product,
      variant: selected,
      productName: product.name,
      selectedProductName: product.name,
      selectedVariantTitle: selected.title,
      selectedCategory: stateData.productQuery ?? "",
      variantTitle: selected.title,
      unitPrice: parseCatalogUnitPrice(selected.price),
    });
    await logWaProcessingStep({ phone, step: "commerce_variant_selected", detail: "Customer selected official Shopify variant.", payload: { product: product.name, variant: selected } });
    await sendWaText(phone, `Perfect 😊\n\n*${product.name}*\nVariant: *${selected.title}*\nPrice: *${formatRupees(parseCatalogUnitPrice(selected.price))}*\n\nQuantity kitni chahiye? (Example: 1, 2, 3)`, waSettings);
    return;
  }
  if (state === "wa_order_await_quantity") {
    const qty = Math.max(1, Number.parseInt(trimmed.replace(/[^0-9]/g, ""), 10) || 1);
    const product = stateData.product;
    const variant = stateData.variant;
    if (!product || !variant) {
      await setConversationState(phone, "wa_order_await_product", { source: "whatsapp_ai_commerce" });
      await sendWaText(phone, "Product detail missing ho gayi. Please product ka naam dobara bhej dein.", waSettings);
      return;
    }
    const nextState = await buildCommerceStateDataFromSelection({ product, variant, quantity: qty });
    await setConversationState(phone, "wa_order_await_name", nextState);
    await logWaProcessingStep({ phone, step: "commerce_quantity_selected", detail: "Customer selected quantity and order summary was generated.", payload: nextState });
    await sendWaText(phone, `${buildCommerceSummary(nextState)}\n\nOrder confirm karne ke liye apna *naam* bhej dein 😊`, waSettings);
    return;
  }
  if (/\b(add|aur|more|extra|include|shamil)\b/i.test(trimmed) && /\b(almond|badam|pista|pistachio|kaju|cashew|akhrot|walnut|kg|g)\b/i.test(trimmed)) {
    const parsed = parseCommerceOrderRequest(trimmed);
    const found = await findCommerceProductVariant(parsed.productQuery || stateData.productName, parsed.variantTitle);
    if (found) {
      const nextItem = {
        productName: found.product.name,
        shopifyProductId: found.product.shopifyProductId,
        variantId: found.variantId,
        variantTitle: found.variantTitle,
        quantity: parsed.quantity,
        unitPrice: parseCatalogUnitPrice(found.unitPrice),
        imageUrl: found.product.imageUrl,
        sku: found.variant.sku,
      };
      const cart = Array.isArray(stateData.cart) ? stateData.cart : [];
      const existing = cart.find((item: any) => String(item.variantId) === String(nextItem.variantId));
      if (existing) existing.quantity = Number(existing.quantity ?? 1) + nextItem.quantity;
      else cart.push(nextItem);
      stateData.cart = cart;
      stateData.subtotal = cart.reduce((sum: number, item: any) => sum + Number(item.unitPrice ?? 0) * Number(item.quantity ?? 1), 0);
      stateData.total = stateData.subtotal + Number(stateData.delivery ?? 0);
      await setConversationState(phone, state, stateData);
      await logWaProcessingStep({ phone, step: "commerce_cart_updated", detail: "WhatsApp cart updated from follow-up message.", payload: { added: nextItem, cart } });
      await sendWaText(phone, `Done 😊 item cart mein add kar diya.\n\n${cart.map((item: any) => `• ${item.quantity} x ${item.productName} (${item.variantTitle}) — ${formatRupees(Number(item.unitPrice ?? 0) * Number(item.quantity ?? 1))}`).join("\n")}\n\nSubtotal: ${formatRupees(stateData.subtotal)}\n\nAb ${state === "wa_order_await_name" ? "apna naam" : "next detail"} bhej dein.`, waSettings);
      return;
    }
  }
  if (state === "wa_order_await_name") {
    if (isInvalidCheckoutName(trimmed)) {
      await logWaProcessingStep({ phone, step: "commerce_validation_failed", status: "failed", detail: "Invalid customer name captured during WhatsApp checkout.", payload: { value: trimmed }, failureReason: "invalid_customer_name" });
      await sendWaText(phone, "Please apna *proper naam* bhej dein. Sirf Ok/Yes/Confirm naam ke liye accept nahi hoga.", waSettings);
      return;
    }
    stateData.customerName = trimmed;
    await setConversationState(phone, "wa_order_await_phone", stateData);
    await sendWaText(phone, `Shukriya *${stateData.customerName}* 😊\n\nApna phone number confirm kar dein. Current WhatsApp number use karna hai to reply karein: *same*`, waSettings);
    return;
  }
  if (state === "wa_order_await_phone") {
    const customerPhone = /^same$/i.test(trimmed) ? phone : trimmed;
    if (!isValidCheckoutPhone(customerPhone)) {
      await logWaProcessingStep({ phone, step: "commerce_validation_failed", status: "failed", detail: "Invalid customer phone captured during WhatsApp checkout.", payload: { value: trimmed }, failureReason: "invalid_customer_phone" });
      await sendWaText(phone, "Please valid phone number bhej dein, ya current WhatsApp number use karne ke liye *same* reply karein.", waSettings);
      return;
    }
    stateData.customerPhone = normalizeCheckoutPhone(customerPhone);
    await setConversationState(phone, "wa_order_await_address", stateData);
    await sendWaText(phone, "Delivery ke liye apna complete address bhej dein 🏠", waSettings);
    return;
  }
  if (state === "wa_order_await_address") {
    stateData.address = trimmed;
    await setConversationState(phone, "wa_order_await_city", stateData);
    await sendWaText(phone, "City ka naam bhej dein 📍", waSettings);
    return;
  }
  if (state === "wa_order_await_city") {
    stateData.city = trimmed;
    const calc = await calculateWhatsAppOrderTotal({
      productQuery: stateData.productName,
      quantity: stateData.quantity,
      variantTitle: stateData.variantTitle,
      city: stateData.city,
    }).catch(() => null);
    if (calc && (calc as any).ok) {
      stateData.deliveryLabel = `${(calc as any).delivery} (${(calc as any).deliveryLabel})`;
      stateData.delivery = parseMoneyValue((calc as any).delivery);
      stateData.total = parseMoneyValue((calc as any).total) || stateData.subtotal + stateData.delivery;
    }
    await setConversationState(phone, "wa_order_await_payment", stateData);
    await sendWaText(phone, `${buildCommerceSummary(stateData)}\n\nPayment method bhej dein: *COD* ya *Bank Transfer*`, waSettings);
    return;
  }
  if (state === "wa_order_await_payment") {
    stateData.paymentMethod = /bank|transfer|online/i.test(trimmed) ? "Bank Transfer" : "COD";
    await setConversationState(phone, "wa_order_await_notes", stateData);
    await sendWaText(phone, "Koi optional note ho to bhej dein, warna reply karein *no*.", waSettings);
    return;
  }
  if (state === "wa_order_await_notes") {
    stateData.notes = /^no|none|nahi|nai$/i.test(trimmed) ? "" : trimmed;
    const finalState = normalizeCommerceTotals(stateData);
    await setConversationState(phone, "wa_order_await_confirm", finalState);
    await sendInteractiveButtons({
      phone,
      text: `${buildCommerceSummary(finalState)}\n\nNaam: ${finalState.customerName}\nPhone: ${finalState.customerPhone}\nAddress: ${finalState.address}, ${finalState.city}\nPayment: ${finalState.paymentMethod}\n\nOrder confirm karein?`,
      buttons: [
        { id: "wa_chat_order_confirm", title: "✅ Confirm" },
        { id: "wa_chat_order_cancel", title: "❌ Cancel" },
      ],
      settings: waSettings,
      templateName: "wa_order_review",
    });
    return;
  }
  if (state === "wa_order_await_confirm") {
    const lower = trimmed.toLowerCase();
    if (isCommerceCancellationText(lower)) {
      await setConversationState(phone, "idle", {});
      await sendWaText(phone, "Order cancel kar diya gaya hai. Koi baat nahi 😊", waSettings);
      return;
    }
    if (!isCommerceConfirmationText(lower)) {
      await sendWaText(phone, "Please reply *confirm* ya *cancel*.", waSettings);
      return;
    }
    await logWaProcessingStep({ phone, step: "commerce_confirm_clicked", status: "received", detail: "Customer confirmed WhatsApp commerce order.", payload: { state, stateData } });
    const finalState = normalizeCommerceTotals(stateData);
    const validationError = validateCommerceCheckoutState(finalState);
    if (validationError) {
      await logWaProcessingStep({ phone, step: "commerce_order_validation_failed", status: "failed", detail: "WhatsApp commerce order blocked before DB save.", payload: finalState, failureReason: validationError });
      if (validationError === "invalid_customer_name") {
        await setConversationState(phone, "wa_order_await_name", finalState);
        await sendWaText(phone, "Order save failed: customer name valid nahi. Please apna *proper naam* bhej dein.", waSettings);
        return;
      }
      if (validationError === "invalid_customer_phone") {
        await setConversationState(phone, "wa_order_await_phone", finalState);
        await sendWaText(phone, "Order save failed: phone number valid nahi. Please valid phone number bhej dein ya *same* reply karein.", waSettings);
        return;
      }
      if (validationError === "invalid_quantity") {
        await setConversationState(phone, "wa_order_await_quantity", {
          ...finalState,
          product: { name: finalState.cart[0]?.productName, shopifyProductId: finalState.cart[0]?.shopifyProductId, imageUrl: finalState.cart[0]?.imageUrl },
          variant: { id: finalState.cart[0]?.variantId, title: finalState.cart[0]?.variantTitle, price: finalState.cart[0]?.unitPrice },
        });
        await sendWaText(phone, "Order save failed: quantity valid nahi. Agar aap ne *250g* likha tha to woh variant/weight hai, quantity nahi. Please quantity bhej dein: *1, 2, 3*.", waSettings);
        return;
      }
      await sendWaText(phone, "Order save failed: order details invalid hain. Please product/quantity dobara confirm kar dein.", waSettings);
      return;
    }
    try {
      await logWaProcessingStep({ phone, step: "ecommerce_order_save_started", detail: "Saving WhatsApp order into ecommerce orders tables.", payload: finalState });
      const ecommerce = await createEcommerceOrderFromWhatsApp(phone, finalState);
      await logWaProcessingStep({
        phone,
        step: "ecommerce_order_saved",
        status: "sent",
        detail: `Ecommerce order ${ecommerce.order.orderNumber} saved. Courier booking is pending admin review.`,
        payload: { orderId: ecommerce.order.id, orderNumber: ecommerce.order.orderNumber, shipmentId: ecommerce.shipment.id, bookingStatus: "manual_pending", total: ecommerce.order.total },
      });
      await setConversationState(phone, "idle", {});

      let shopifyCreated: Awaited<ReturnType<typeof createShopifyOrderFromWhatsApp>> | null = null;
      try {
        await logWaProcessingStep({ phone, step: "shopify_order_create_started", detail: "Syncing saved WhatsApp ecommerce order to Shopify order table/API.", payload: finalState });
        shopifyCreated = await createShopifyOrderFromWhatsApp(phone, finalState);
      } catch (shopifyErr) {
        const shopifyReason = shopifyErr instanceof Error ? shopifyErr.message : String(shopifyErr);
        await logWaProcessingStep({ phone, step: "shopify_order_created", status: "failed", detail: "Shopify sync failed after ecommerce order save.", payload: { error: shopifyReason, ecommerceOrderId: ecommerce.order.id }, failureReason: shopifyReason });
        await createAdminAlert({ title: "WhatsApp Shopify sync failed", message: shopifyReason, type: "wa_order_failure", dedupeMinutes: 10 });
      }

      await logWaProcessingStep({
        phone,
        step: "admin_order_sync_completed",
        status: "sent",
        detail: "WhatsApp order is visible in Ecommerce Admin Orders.",
        payload: { orderId: ecommerce.order.id, orderNumber: ecommerce.order.orderNumber, shipmentId: ecommerce.shipment.id, bookingStatus: "manual_pending", shopifySynced: Boolean(shopifyCreated) },
      });
      if (shopifyCreated) {
        await logWaProcessingStep({
          phone,
          step: "courier_booking_held",
          status: "sent",
          detail: "Shopify sync completed, but courier/rider automation was not started because manual booking is required by default.",
          payload: { shopifyOrderId: shopifyCreated.order.id, ecommerceOrderId: ecommerce.order.id },
        });
      }
      await sendWaText(phone, `جزاک اللہ 😊\n\nآپ کا آرڈر کامیابی سے confirm ہو گیا ہے۔\n\nOrder ID:\n${ecommerce.order.orderNumber}\n\nہماری team order review کر کے courier book کرے گی۔ Booking کے بعد tracking update آپ کو WhatsApp پر مل جائے گا۔`, waSettings);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log?.warn(err, "WhatsApp ecommerce order save failed");
      await logWaProcessingStep({ phone, step: "ecommerce_order_save_failed", status: "failed", detail: "Ecommerce DB save failed; no confirmation was sent.", payload: { error: reason, stateData: finalState }, failureReason: reason });
      await createAdminAlert({ title: "WhatsApp order save failed", message: reason, type: "wa_order_failure", dedupeMinutes: 10 });
      await sendWaText(phone, "Order save failed. Team ko alert kar diya gaya hai, confirmation abhi nahi hui.", waSettings);
    }
    return;
  }
  await logWaProcessingStep({
    phone,
    step: "commerce_state_unhandled",
    status: "failed",
    detail: "WhatsApp commerce flow received a message/button for an unsupported or stale state.",
    payload: { state, text: trimmed },
    failureReason: "unhandled_whatsapp_commerce_state",
  });
  await sendWaText(phone, "Is order session ka state expire ho gaya hai. Naya order start karne ke liye product ka naam bhej dein.", waSettings);
}

/* ─── Helper: WA Order placement flow ───────────────── */
async function handleOrderFlow(
  phone: string,
  text: string,
  state: string,
  waSettings: any,
  log?: any,
): Promise<void> {
  try {
    const convState = await getConversationState(phone);
    const stateData: Record<string, any> = JSON.parse((convState as any)?.stateData ?? "{}");

    if (state === "order_await_qty") {
      /* Parse quantity */
      const qty = parseInt(text.replace(/[^0-9]/g, "")) || 1;
      const productName = stateData.productName ?? "Product";
      const price = stateData.price ?? 0;
      stateData.qty = qty;
      stateData.subtotal = qty * price;
      await setConversationState(phone, "order_await_name", stateData);
      await sendWaText(phone, `✅ *${qty}x ${productName}* selected\n💰 Subtotal: Rs. ${stateData.subtotal.toLocaleString("en-PK")}\n\n📝 Please enter your *full name* for delivery:`, waSettings);
      return;
    }

    if (state === "order_await_name") {
      stateData.customerName = text.trim();
      await setConversationState(phone, "order_await_address", stateData);
      await sendWaText(phone, `👤 Name: *${stateData.customerName}*\n\n🏠 Please enter your *full delivery address* (street, area):`, waSettings);
      return;
    }

    if (state === "order_await_address") {
      stateData.address = text.trim();
      await setConversationState(phone, "order_await_city", stateData);
      await sendWaText(phone, `📍 Address saved!\n\n🏙️ Please enter your *city*:`, waSettings);
      return;
    }

    if (state === "order_await_city") {
      stateData.city = text.trim();
      const calculated = await calculateWhatsAppOrderTotal({
        productQuery: String(stateData.productName ?? ""),
        quantity: Number(stateData.qty ?? 1),
        variantTitle: String(stateData.variant ?? ""),
        city: stateData.city,
      }).catch(() => null);
      if (calculated && (calculated as any).ok) {
        stateData.subtotalLabel = (calculated as any).subtotal;
        stateData.deliveryLabel = (calculated as any).delivery;
        stateData.finalTotalLabel = (calculated as any).total;
        stateData.deliveryMethod = (calculated as any).deliveryLabel;
        stateData.totalNumeric = parseMoneyValue((calculated as any).total) || stateData.subtotal;
      }
      await setConversationState(phone, "order_await_confirm", stateData);
      const summary =
        `📋 *Order Summary*\n\n` +
        `🛍️ *Product:* ${stateData.productName ?? "Item"}\n` +
        `📦 *Qty:* ${stateData.qty ?? 1}\n` +
        `💰 *Subtotal:* ${stateData.subtotalLabel ?? `Rs. ${(stateData.subtotal ?? 0).toLocaleString("en-PK")}`}\n` +
        `🚚 *Delivery:* ${stateData.deliveryLabel ?? "To be confirmed"}${stateData.deliveryMethod ? ` (${stateData.deliveryMethod})` : ""}\n` +
        `✅ *Final Total:* ${stateData.finalTotalLabel ?? `Rs. ${(stateData.subtotal ?? 0).toLocaleString("en-PK")}`}\n` +
        `👤 *Name:* ${stateData.customerName}\n` +
        `🏠 *Address:* ${stateData.address}, ${stateData.city}\n` +
        `💳 *Payment:* Cash on Delivery (COD)\n\n` +
        `Reply *CONFIRM* to place order or *CANCEL* to cancel.`;
      await sendWaText(phone, summary, waSettings);
      return;
    }

    if (state === "order_await_confirm") {
      const lower = text.toLowerCase().trim();
      const isConfirm = ["confirm", "yes", "ok", "han", "haan", "ji", "theek", "bilkul", "zaroor"].some(k => lower.includes(k));
      const isCancel = ["cancel", "nahi", "no", "band", "nai"].some(k => lower.includes(k));

      if (isConfirm) {
        /* Create order in DB */
        const orderNumber = `WA-${Date.now().toString(36).toUpperCase()}`;
        await db.insert(ordersTable).values({
          orderNumber,
          status: "pending",
          total: String(stateData.totalNumeric ?? stateData.subtotal ?? 0),
          shippingAddress: {
            name: stateData.customerName,
            address: stateData.address,
            city: stateData.city,
            phone,
          },
          items: [{ name: stateData.productName, qty: stateData.qty ?? 1, price: stateData.price ?? 0 }],
          paymentMethod: "cod",
          source: "whatsapp",
        } as any).catch(() => {});

        await setConversationState(phone, "idle", {});
        await sendInteractiveButtons({
          phone,
          text: `🎉 *Order Placed Successfully!*\n\n📋 *Order ID:* ${orderNumber}\n💰 *Total:* ${stateData.finalTotalLabel ?? `Rs. ${(stateData.subtotal ?? 0).toLocaleString("en-PK")}`}\n\nHamara team aapko confirm karega. Shukriya! 🙏`,
          buttons: [
            { id: `track_order`, title: "📦 Track Order" },
            { id: "main_menu", title: "🏠 Main Menu" },
          ],
          settings: waSettings,
          templateName: "wa_order_placed",
        });
      } else if (isCancel) {
        await setConversationState(phone, "idle", {});
        await sendWaText(phone, `❌ Order cancelled. Koi baat nahi! 😊\n\nAgar dobara order karna chahein toh batayein.`, waSettings);
      } else {
        await sendWaText(phone, `Please reply *CONFIRM* to place order or *CANCEL* to cancel.`, waSettings);
      }
      return;
    }
  } catch (err) {
    log?.warn(err, "handleOrderFlow error");
    await setConversationState(phone, "idle", {}).catch(() => {});
  }
}

/* ─── Helper: AI auto-reply (with full tool support) ── */
async function handleAiReply(opts: {
  phone: string;
  textBody: string;
  chatbot: any;
  waSettings: any;
  log?: any;
  detectedIntent?: ReturnType<typeof detectWaIntent>;
}): Promise<void> {
  const { phone, textBody, chatbot, waSettings, log, detectedIntent } = opts;
  const intent = detectedIntent ?? detectWaIntent(textBody);
  try {
    await logWaProcessingStep({
      phone,
      step: "ai_triggered",
      detail: "AI reply pipeline started.",
      payload: { textBody: textBody.slice(0, 500), model: chatbot?.aiModel ?? "gpt-4o-mini", chatbotEnabled: chatbot?.isEnabled, detectedIntent: intent },
    });
    /* Rate limit check */
    const cooldownSec = Number(chatbot.replyDelaySec ?? 0);
    const [lastAiReplyRow] = await db.select({ createdAt: whatsappLogsTable.createdAt })
      .from(whatsappLogsTable)
      .where(sql`phone = ${phone} AND template_name = 'ai_reply'`)
      .orderBy(desc(whatsappLogsTable.createdAt))
      .limit(1);
    if (lastAiReplyRow) {
      const secsSinceLast = (Date.now() - new Date(lastAiReplyRow.createdAt).getTime()) / 1000;
      if (cooldownSec > 0 && secsSinceLast < cooldownSec) {
        await logWaProcessingStep({
          phone,
          step: "ai_cooldown_observed",
          detail: `Cooldown window observed (${Math.round(secsSinceLast)}s/${cooldownSec}s), but AI continues so customer does not receive a missing/static reply.`,
          payload: { secsSinceLast, cooldownSec },
        });
      }
    }

    /* Daily cap */
    const maxDaily = chatbot.maxDailyReplies ?? 100;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const dailyCount = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM whatsapp_logs WHERE template_name = 'ai_reply' AND created_at >= ${todayStart.toISOString()}`
    );
    const todaySent = Number((dailyCount as any)?.rows?.[0]?.cnt ?? 0);
    if (todaySent >= maxDaily) {
      await logWaProcessingStep({
        phone,
        step: "ai_skipped",
        status: "failed",
        detail: `AI daily cap reached (${todaySent}/${maxDaily}).`,
        payload: { todaySent, maxDaily },
        failureReason: "ai_daily_cap_reached",
      });
      log?.warn({ todaySent, maxDaily }, "AI reply daily cap reached");
      await sendWaText(phone, "Ji 😊 aapka message receive ho gaya. Bot ka daily AI limit complete ho gaya hai, lekin team aapka message check kar rahi hai.", waSettings);
      return;
    }

    /* Order context + customer name */
    let orderContextBlock = "";
    let customerName = "";
    if (chatbot.orderContextEnabled !== false) {
      try {
        const normalizedLookup = normalizePhone(phone);
        const altPhone = normalizedLookup.startsWith("92") ? "0" + normalizedLookup.slice(2) : phone;
        const recentOrders = await db.select({
          orderNumber: ordersTable.orderNumber,
          status:      ordersTable.status,
          total:       ordersTable.total,
          trackingId:  ordersTable.trackingId,
          createdAt:   ordersTable.createdAt,
          shipping:    ordersTable.shippingAddress,
        }).from(ordersTable)
          .where(sql`(shipping_address->>'phone' = ${normalizedLookup} OR shipping_address->>'phone' = ${altPhone} OR shipping_address->>'phone' = ${phone})`)
          .orderBy(desc(ordersTable.createdAt))
          .limit(5);

        if (recentOrders.length > 0) {
          customerName = (recentOrders[0]?.shipping as any)?.name ?? "";
          const lines = recentOrders.map((o: any) =>
            `  • Order #${o.orderNumber}: Status=${o.status}, Total=Rs.${o.total}${o.trackingId ? `, Tracking=${o.trackingId}` : ""}, Placed=${new Date(o.createdAt).toLocaleDateString("en-PK")}`
          );
          orderContextBlock = `\n\n[CUSTOMER CONTEXT]\nCustomer Name: ${customerName || "Unknown"}\nPhone: ${phone}\nRecent Orders:\n${lines.join("\n")}\n[END CONTEXT]`;
        }
      } catch (ctxErr) {
        log?.warn(ctxErr, "Failed to fetch order context");
      }
    }

    const convState = await getConversationState(phone).catch(() => null);
    const sessionMemory = await loadConversationMemory(phone);
    const memoryBlock = buildMemorySummaryBlock(sessionMemory);
    const memorySummary = [
      `Phone: ${phone}`,
      customerName ? `Known customer name: ${customerName}` : "",
      convState?.state ? `Active state: ${convState.state}` : "",
      memoryBlock,
    ].filter(Boolean).join("\n");

    /* Conversation history from wa_messages */
    const history = await db.select()
      .from(whatsappLogsTable)
      .where(eq(whatsappLogsTable.phone, phone))
      .orderBy(desc(whatsappLogsTable.createdAt))
      .limit(16);

    /* Build AI tools */
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "search_products",
          description: "Search KDF NUTS products by name/keyword. Use when customer asks about any product, price, availability, badam, pista, akhrot, kaju, dry fruits, etc.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Product search term e.g. almonds, badam, 500g, cashews" },
              limit: { type: "number", description: "Max products to return (1-5)", default: 3 },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "calculate_order_total",
          description: "Calculate exact order total using official Shopify/live catalog variant price, configured shipping rules, and an approved coupon code if the customer provides one.",
          parameters: {
            type: "object",
            properties: {
              productQuery: { type: "string", description: "Product name from customer, e.g. Almond, Badam, Pistachio" },
              quantity: { type: "number", description: "Quantity requested by customer", default: 1 },
              variantTitle: { type: "string", description: "Variant/weight requested, e.g. 250g, 500g, 1KG, 2KG" },
              city: { type: "string", description: "Delivery city if customer mentioned it" },
              couponCode: { type: "string", description: "Coupon/promo code only if customer mentioned one" },
            },
            required: ["productQuery"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "track_order",
          description: "Look up order status/tracking by order number or phone number. Use when customer asks 'where is my order', 'track', 'status', etc.",
          parameters: {
            type: "object",
            properties: {
              input: { type: "string", description: "Order number or customer phone number" },
            },
            required: ["input"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "start_order",
          description: "Start a WhatsApp order placement flow for a specific product. Use when customer explicitly wants to buy/order a product.",
          parameters: {
            type: "object",
            properties: {
              productName: { type: "string", description: "Product name" },
              price: { type: "number", description: "Price per unit in PKR" },
              variantTitle: { type: "string", description: "Selected variant e.g. 500g, 1kg" },
            },
            required: ["productName", "price"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "escalate_to_human",
          description: "Transfer to human agent when customer is frustrated, has complex complaint, or explicitly asks for human/real person.",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
    ];

    let whatsappInstructions = `WhatsApp sales behavior:
- For any product/price/variant question, use the official catalog context if provided and answer only from that data.
- Product, variant, price, stock, discount, SKU, image, and availability data must come from synced Shopify catalog only. Never use local/manual products or guessed prices.
- For quantity + variant total questions, use official catalog prices shown in context. If no official match is found, ask for exact product/weight.
- If customer asks "Badam price", "Pistachio", "Almond 500g", etc., show only matching products and their official options/prices.
- Product matching is strict: if customer asks one product (for example "1kg walnut"), answer only that product family and variants. Never include gift boxes, combos, mixed packs, or unrelated products unless customer explicitly asks for gift/combo/mix.
- If a requested variant/weight is available, lead with that exact variant price. If unavailable, say it is unavailable and show only alternative variants of the same product.
- If customer asks a broad need like "Mujhe dry fruits chahiye", first ask natural qualifying questions: budget, gift/use, quantity.
- Never spam catalog/products for greetings, support, or general conversation.
- If customer wants to order a named product, ask for variant/quantity and keep the conversation moving naturally.
- If customer wants tracking/order status, use recent order context if available; otherwise ask for order number/phone.
- Detect customer language automatically: Urdu script, Roman Urdu, English, Punjabi, Pashto, or mixed. Reply in the same style.
- Use senior-citizen mode by default on WhatsApp: short, clear, one question at a time, no long paragraphs.
- Customers may reply with only numbers from the quick menu. Treat number replies as valid intent, not confusion.
- Voice notes may arrive as transcribed text. Treat the transcription exactly like the customer typed it.
- Keep replies short, human, and conversion-focused.
- NEVER repeat the same greeting or "main madad ke liye yahin hoon" style line twice in one chat.
- If customer asks "Delivery" or delivery charges, answer delivery charges directly — never send a generic welcome.
- If [CONVERSATION MEMORY] shows an active order flow or selected product, continue that flow — do not restart with greeting.`;
    if (isActiveCommerceFlow(convState?.state) || sessionMemory.selectedProductName) {
      whatsappInstructions += `\n- CRITICAL: Customer is mid-order or has selected a product. Do NOT send generic greetings. Answer the exact question (delivery, price, variant) using memory context.`;
    }
    let catalogContextBlock = "";
    if (shouldSendCatalogForIntent(intent.intent) && !isGenericCategoryQuery(intent.productQuery)) {
      const catalogQuery = intent.productQuery && /\b\d+(?:\.\d+)?\s*(kg|kgs|kilogram|g|gm|gram|grams)\b/i.test(textBody)
        ? textBody
        : intent.productQuery ?? textBody;
      const products = await searchProductsForWa(catalogQuery, 4);
      if (products.length > 0) {
        catalogContextBlock = `\n\n[OFFICIAL SHOPIFY/LIVE CATALOG CONTEXT]\nUse ONLY these products, variants, and prices. Never invent prices.\n${products.map((p, idx) => {
          const variants = p.variantLines?.length ? p.variantLines.map((v) => `    - ${v}`).join("\n") : `    - ${p.price}`;
          return `${idx + 1}. ${p.name}\n${variants}\n    Stock: ${p.inStock ? "In stock" : "Out of stock"}\n    URL: ${p.productUrl}`;
        }).join("\n")}\n[END CATALOG CONTEXT]`;
        await logWaProcessingStep({
          phone,
          step: "catalog_result",
          status: "received",
          detail: `Catalog context preloaded with ${products.length} product(s) before OpenAI call.`,
          payload: { query: catalogQuery, products: products.map((p) => ({ name: p.name, price: p.price, variants: p.variantLines, source: p.source })) },
        });
      } else {
        await logWaProcessingStep({
          phone,
          step: "catalog_result",
          status: "failed",
          detail: "No matching catalog products found before OpenAI call.",
          payload: { query: catalogQuery },
          failureReason: "catalog_no_match",
        });
      }
    }
    const [globalAiSettings] = await db.select().from(aiSettingsTable).limit(1).catch(() => []);
    const brainPrompt = buildAiBrainSystemPrompt(chatbot, {
      channel: "whatsapp",
      detectedIntent: `${intent.intent} (${intent.reason}). Confidence: ${intent.confidence}`,
      extraInstructions: whatsappInstructions,
      contextBlocks: [orderContextBlock, catalogContextBlock],
      globalAiSettings,
      memorySummary,
    });
    const systemContent = brainPrompt.systemPrompt;
    await logWaProcessingStep({
      phone,
      step: "prompt_loaded",
      detail: brainPrompt.promptLoaded ? "AI Behaviour Instructions loaded from Admin DB and injected through Central AI Brain." : "No saved AI Behaviour Instructions found; Central AI Brain used safe default business prompt.",
      payload: {
        promptLoaded: brainPrompt.promptLoaded,
        promptSource: brainPrompt.promptSource,
        promptLength: brainPrompt.promptLength,
        promptPreview: brainPrompt.promptPreview,
        promptVersion: brainPrompt.promptVersion,
        detectedIntent: intent,
      },
    });

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
    ];
    for (const h of [...history].reverse()) {
      const hAny = h as any;
      if (hAny.templateName === "incoming" && hAny.message) {
        messages.push({ role: "user", content: hAny.message });
      } else if (hAny.templateName === "ai_reply" && hAny.message) {
        messages.push({ role: "assistant", content: hAny.message });
      }
    }
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== textBody) {
      messages.push({ role: "user", content: textBody });
    }
    await logWaProcessingStep({
      phone,
      step: "ai_prompt_built",
      detail: `AI prompt built for intent ${intent.intent}.`,
      payload: {
        intent,
        promptPreview: systemContent.slice(0, 1200),
        historyMessages: messages.length,
      },
    });

    const aiClient = await getOpenAIClient();

    let reply = "";
    await logWaProcessingStep({
      phone,
      step: "openai_request_sent",
      detail: `OpenAI request sent with model ${chatbot.aiModel ?? "gpt-4o-mini"} using stable no-tools WhatsApp mode.`,
      payload: {
        model: chatbot.aiModel ?? "gpt-4o-mini",
        messages: messages.length,
        promptSource: brainPrompt.promptSource,
        promptLoaded: brainPrompt.promptLoaded,
        catalogContextLoaded: Boolean(catalogContextBlock),
      },
    });
    const completion = await aiClient.chat.completions.create({
      model: chatbot.aiModel ?? "gpt-4o-mini",
      messages,
      max_tokens: 600,
    });
    const choice = completion.choices[0];
    reply = choice?.message?.content?.trim() ?? "";
    await logWaProcessingStep({
      phone,
      step: "openai_response_returned",
      status: "received",
      detail: "OpenAI returned a text response in stable no-tools WhatsApp mode.",
      payload: {
        model: completion.model,
        finishReason: choice?.finish_reason ?? null,
        responsePreview: reply.slice(0, 1000),
      },
    });

    if (!reply) {
      await logWaProcessingStep({
        phone,
        step: "ai_skipped",
        status: "failed",
        detail: "AI produced no reply text.",
        failureReason: "ai_empty_reply",
      });
      throw new Error("ai_empty_reply");
    }

    if (shouldBlockRepeatedReply(reply, sessionMemory)) {
      const roman = /[a-z]/i.test(textBody);
      reply = roman
        ? "Ji 😊 samajh gaya. Delivery, price, ya order — kis cheez ki detail chahiye?"
        : "جی 😊 سمجھ گیا۔ Delivery، price، یا order — کس چیز کی detail چاہیے؟";
    }

    const { sendWhatsAppMessage } = await import("../lib/whatsapp.js");
    const ok = await sendWhatsAppMessage({ phone, message: reply, templateName: "ai_reply" });
    await persistConversationTurn(phone, {
      intent: intent.intent,
      topic: intent.intent,
      assistantReply: reply,
      mergeStateData: {
        lastUserMessage: textBody.slice(0, 500),
        deliveryDiscussed: intent.intent === "delivery" || sessionMemory.deliveryDiscussed,
      },
    });
    await logWaProcessingStep({
      phone,
      step: "ai_reply_sent",
      status: ok ? "sent" : "failed",
      detail: ok ? "AI reply sent to customer." : "AI generated a reply but WhatsApp send failed.",
      payload: { finalSentMessage: reply.slice(0, 1000), detectedIntent: intent, fallbackTriggered: false },
      failureReason: ok ? null : "ai_whatsapp_send_failed",
    });
  } catch (aiErr) {
    await logWaProcessingStep({
      phone,
      step: "ai_reply_sent",
      status: "failed",
      detail: "AI reply pipeline failed.",
      payload: { error: aiErr instanceof Error ? aiErr.message : String(aiErr) },
      failureReason: aiErr instanceof Error ? aiErr.message : String(aiErr),
    });
    log?.warn(aiErr, "AI auto-reply error");
    try {
      const { sendWhatsAppMessage: sendWa } = await import("../lib/whatsapp.js");
      const fallback = await buildEmergencyAiFallback({ textBody, intent, phone });
      await logWaProcessingStep({
        phone,
        step: "fallback_triggered",
        status: "failed",
        detail: "Emergency fallback was used only because OpenAI generation failed.",
        payload: {
          detectedIntent: intent,
          fallbackPreview: fallback.slice(0, 500),
          openAiError: aiErr instanceof Error ? aiErr.message : String(aiErr),
        },
        failureReason: aiErr instanceof Error ? aiErr.message : "ai_generation_failed",
      });
      await sendWa({ phone, message: fallback, templateName: "ai_fallback" });
    } catch { /* ignore fallback errors */ }
  }
}

/* ─── Admin: Template funnel (sent → delivered → read → failed) ─── */
router.get("/admin/whatsapp/template-funnel", adminMiddleware as any, async (req, res) => {
  try {
    const hours = Math.min(168, parseInt(String(req.query.hours ?? "48"), 10) || 48);
    const rows = await db.execute(sql`
      SELECT
        COALESCE(trigger_event, template_name, 'unknown') AS template,
        COUNT(*)::int AS sent,
        COUNT(*) FILTER (WHERE delivery_status = 'delivered')::int AS delivered,
        COUNT(*) FILTER (WHERE delivery_status = 'read')::int AS read_count,
        COUNT(*) FILTER (WHERE status = 'failed' OR delivery_status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status = 'received')::int AS inbound_replies
      FROM whatsapp_logs
      WHERE created_at > NOW() - (${hours} || ' hours')::interval
        AND template_name IS NOT NULL
        AND template_name != 'incoming'
      GROUP BY 1
      ORDER BY sent DESC
      LIMIT 40
    `);
    return res.json({ hours, funnel: rows.rows });
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Funnel failed" });
  }
});

/* ─── Admin: Message logs with delivery status ─── */
router.get("/admin/whatsapp/message-logs", adminMiddleware as any, async (req, res) => {
  try {
    const status = String(req.query.status ?? "all");
    const limit = Math.min(100, parseInt(String(req.query.limit ?? "50"), 10) || 50);
    const rows =
      status === "failed"
        ? await db.select().from(whatsappLogsTable).where(eq(whatsappLogsTable.status, "failed")).orderBy(desc(whatsappLogsTable.createdAt)).limit(limit)
        : status === "delivered"
          ? await db.select().from(whatsappLogsTable).where(eq(whatsappLogsTable.deliveryStatus, "delivered")).orderBy(desc(whatsappLogsTable.createdAt)).limit(limit)
          : await db.select().from(whatsappLogsTable).orderBy(desc(whatsappLogsTable.createdAt)).limit(limit);
    return res.json(rows);
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Logs failed" });
  }
});

/* ─── Admin: Retry failed WhatsApp message log ─── */
router.post("/admin/whatsapp/message-logs/:id/retry", adminMiddleware as any, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [row] = await db.select().from(whatsappLogsTable).where(eq(whatsappLogsTable.id, id)).limit(1);
    if (!row) return res.status(404).json({ error: "Log not found" });
    if (!row.phone || !row.message) return res.status(400).json({ error: "Missing phone or message" });

    const { sendWhatsAppMessage } = await import("../lib/whatsapp.js");
    const { sendLifecycleWhatsApp } = await import("../lib/waTemplateEvents.js");
    const trigger = (row as { trigger_event?: string }).trigger_event ?? row.templateName ?? "manual_retry";
    let success = false;
    if (trigger && trigger !== "incoming" && trigger !== "ai_reply") {
      const r = await sendLifecycleWhatsApp({
        triggerEvent: trigger,
        phone: row.phone,
        fallbackText: row.message,
        bodyParams: row.message.split("\n").filter(Boolean).slice(0, 4),
      });
      success = r.success;
    } else {
      success = await sendWhatsAppMessage({
        phone: row.phone,
        message: row.message,
        templateName: row.templateName ?? "manual_retry",
      });
    }

    await db.execute(sql`
      UPDATE whatsapp_logs SET retry_count = COALESCE(retry_count, 0) + 1
      WHERE id = ${id}
    `).catch(() => {});

    return res.json({ ok: success, logId: id });
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Retry failed" });
  }
});

/* ─── Admin: Monitoring / debug dashboard aggregates ─── */
router.get("/admin/whatsapp/monitoring", adminMiddleware as any, async (_req, res) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    const serverIp = await import("../lib/meezan.js").then((m) => m.getServerIp()).catch(() => "unknown");

    const logStats = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent' AND created_at >= ${since24h})::int AS sent,
        COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= ${since24h})::int AS failed,
        COUNT(*) FILTER (WHERE status = 'received' AND created_at >= ${since24h})::int AS inbound,
        COUNT(*) FILTER (WHERE delivery_status = 'delivered' AND created_at >= ${since24h})::int AS delivered,
        COUNT(*) FILTER (WHERE delivery_status = 'read' AND created_at >= ${since24h})::int AS read_count,
        COUNT(*) FILTER (WHERE template_name LIKE 'automation:%' AND status = 'sent' AND created_at >= ${since24h})::int AS automation_sent,
        COUNT(*) FILTER (WHERE template_name LIKE '[template]%' AND status = 'sent' AND created_at >= ${since24h})::int AS templates_sent,
        COUNT(*) FILTER (WHERE template_name LIKE '[template]%' AND status = 'failed' AND created_at >= ${since24h})::int AS templates_failed
      FROM whatsapp_logs
    `);

    const automationStats = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent' AND created_at >= ${since24h})::int AS fired,
        COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= ${since24h})::int AS automation_failed,
        COUNT(*) FILTER (WHERE status = 'skipped' AND created_at >= ${since24h})::int AS skipped
      FROM wa_automation_logs
    `);

    const inboxStats = await db.execute(sql`
      SELECT
        COUNT(*)::int AS open_conversations,
        COALESCE(SUM(unread_count), 0)::int AS unread_total
      FROM wa_conversations
      WHERE status = 'open'
    `);

    const recentFailures = await db.select().from(whatsappLogsTable)
      .where(eq(whatsappLogsTable.status, "failed"))
      .orderBy(desc(whatsappLogsTable.createdAt))
      .limit(20);

    const recentInbound = await db.select().from(whatsappLogsTable)
      .where(eq(whatsappLogsTable.status, "received"))
      .orderBy(desc(whatsappLogsTable.createdAt))
      .limit(20);

    const webhookFailures = await db.select().from(waWebhookFailuresTable)
      .orderBy(desc(waWebhookFailuresTable.createdAt))
      .limit(15);

    const ls = (logStats.rows ?? logStats)[0] as Record<string, number>;
    const as = (automationStats.rows ?? automationStats)[0] as Record<string, number>;
    const is = (inboxStats.rows ?? inboxStats)[0] as Record<string, number>;

    const sent = Number(ls?.sent ?? 0);
    const failed = Number(ls?.failed ?? 0);
    const inbound = Number(ls?.inbound ?? 0);

    const templateFunnel = await db.execute(sql`
      SELECT
        COALESCE(trigger_event, template_name) AS template,
        COUNT(*)::int AS sent,
        COUNT(*) FILTER (WHERE delivery_status = 'delivered')::int AS delivered,
        COUNT(*) FILTER (WHERE delivery_status = 'read')::int AS read_count,
        COUNT(*) FILTER (WHERE status = 'failed' OR delivery_status = 'failed')::int AS failed
      FROM whatsapp_logs
      WHERE created_at >= ${since24h}
        AND template_name IS NOT NULL AND template_name != 'incoming'
      GROUP BY 1
      ORDER BY sent DESC
      LIMIT 15
    `).catch(() => ({ rows: [] }));

    const health = await buildWhatsappHealthReport();

    return res.json({
      generatedAt: new Date().toISOString(),
      serverIp,
      health,
      templateFunnel: templateFunnel.rows,
      integration: {
        isActive: settings?.isActive ?? false,
        hasToken: !!settings?.accessToken,
        hasPhoneId: !!settings?.phoneNumberId,
        hasAppSecret: !!(settings?.appSecret || process.env.META_APP_SECRET),
        webhookUrl: getPublicWebhookUrl(),
        unifiedWebhookUrl: getUnifiedWebhookUrl(),
      },
      metrics24h: {
        sent,
        failed,
        inbound,
        delivered: Number(ls?.delivered ?? 0),
        read: Number(ls?.read_count ?? 0),
        deliveryRate: sent > 0 ? Math.round((Number(ls?.delivered ?? 0) / sent) * 100) : 0,
        replyRate: sent > 0 ? Math.round((inbound / sent) * 100) : 0,
        automationFired: Number(as?.fired ?? 0),
        automationFailed: Number(as?.automation_failed ?? 0),
        templatesSent: Number(ls?.templates_sent ?? 0),
        templatesFailed: Number(ls?.templates_failed ?? 0),
        openConversations: Number(is?.open_conversations ?? 0),
        unreadTotal: Number(is?.unread_total ?? 0),
      },
      recentWebhookPayloads: recentWebhookPayloads.slice(0, 10),
      recentFailures: recentFailures.map((f: any) => ({
        ...f,
        classification: classifyWaFailure(f.failureReason ?? f.response ?? f.message),
      })),
      recentInbound,
      webhookFailures: webhookFailures.map((f: any) => ({
        ...f,
        classification: classifyWaFailure(f.error ?? f.payload),
      })),
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ─── Admin: Webhook diagnostics (inbound health) ─────── */
router.get("/admin/whatsapp/webhook-diagnostics", adminMiddleware as any, async (req, res) => {
  try {
    const since1h = new Date(Date.now() - 60 * 60 * 1000);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    const secrets = await getMetaAppSecrets();
    const envSecret = !!process.env.META_APP_SECRET?.trim();
    const dbSecret = !!settings?.appSecret?.trim();
    const verifyToken = settings?.webhookVerifyToken ?? "kdfnuts_webhook_token";
    const dbSecretLooksLikeVerifyToken =
      !!settings?.appSecret?.trim() && settings.appSecret.trim() === verifyToken;
    const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() || req.hostname;
    const dedicatedUrl = getPublicWebhookUrl(host);
    const publicBase = (process.env.PUBLIC_API_URL ?? process.env.API_PUBLIC_URL ?? "").replace(/\/$/, "");
    const unifiedUrl = publicBase ? `${publicBase}/api/meta/webhook` : `https://${host}/api/meta/webhook`;

    const inboundStats = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'received' AND created_at >= ${since1h})::int AS inbound_1h,
        COUNT(*) FILTER (WHERE status = 'received' AND created_at >= ${since24h})::int AS inbound_24h,
        MAX(created_at) FILTER (WHERE status = 'received') AS last_inbound_at
      FROM whatsapp_logs
      WHERE template_name = 'incoming'
    `);
    const is = (inboundStats.rows ?? inboundStats)[0] as Record<string, unknown>;

    const hmacFailures = await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM wa_webhook_failures
      WHERE error = 'invalid_hmac_signature' AND created_at >= ${since24h}
    `);
    const hmacCount = Number((hmacFailures.rows ?? hmacFailures)[0]?.n ?? 0);

    const recentInbound = await db.select({
      phone: whatsappLogsTable.phone,
      message: whatsappLogsTable.message,
      createdAt: whatsappLogsTable.createdAt,
    }).from(whatsappLogsTable)
      .where(eq(whatsappLogsTable.status, "received"))
      .orderBy(desc(whatsappLogsTable.createdAt))
      .limit(5);

    const issues: string[] = [];
    if (!secrets.length) {
      issues.push("App Secret not set — webhooks accepted without HMAC (set in WA Settings or META_APP_SECRET).");
    }
    if (dbSecretLooksLikeVerifyToken) {
      issues.push(
        "CRITICAL: App Secret field contains the Verify Token — they are different. Use Meta App → Settings → Basic → App Secret (not kdfnuts_webhook_token).",
      );
    }
    if (hmacCount > 0) {
      issues.push(
        `${hmacCount} customer message webhook(s) REJECTED (invalid HMAC). Fix: Meta Developer → Your App → Settings → Basic → copy App Secret → paste in WA API Settings → App Secret OR Railway env META_APP_SECRET. Then redeploy.`,
      );
    }
    if (hmacCount > 0 || Number(is?.inbound_1h ?? 0) === 0) {
      issues.push(
        "Meta Console: Webhooks → product must be «WhatsApp Business Account» (NOT «User»). Subscribe: messages.",
      );
    }
    if (Number(is?.inbound_24h ?? 0) === 0 && Number(is?.inbound_1h ?? 0) === 0) {
      issues.push("No inbound messages logged in 24h — Meta may not be delivering webhooks (check Callback URL + subscribe to messages field).");
    }
    if (!settings?.phoneNumberId) {
      issues.push("phone_number_id not configured in WhatsApp settings.");
    }
    if (!dedicatedUrl && !publicBase) {
      issues.push("PUBLIC_API_URL not set — webhook URL may be wrong in Meta Developer Console.");
    }

    const healthy = hmacCount === 0 && !dbSecretLooksLikeVerifyToken && Number(is?.inbound_1h ?? 0) > 0;

    const metaConsoleChecklist = [
      "developers.facebook.com → Your App → WhatsApp → Configuration (recommended)",
      "OR Webhooks → Select product: WhatsApp Business Account (NOT User)",
      "Callback URL: " + (dedicatedUrl || "https://api.khanbabadryfruits.com/api/webhooks/whatsapp"),
      "Verify token: " + verifyToken,
      "Webhook fields: subscribe to messages, message_template_status_update, message_template_quality_update",
      "App Secret (Basic settings) = same as WA API Settings → App Secret",
    ];

    return res.json({
      healthy,
      issues,
      appSecret: {
        envConfigured: envSecret,
        dbConfigured: dbSecret,
        secretCount: secrets.length,
        dbLooksLikeVerifyToken: dbSecretLooksLikeVerifyToken,
      },
      webhookUrls: {
        dedicated: dedicatedUrl || null,
        unified: unifiedUrl,
        recommended: "Use ONE URL in Meta — prefer unified /api/meta/webhook if IG/FB also use it",
      },
      metaSetup: {
        subscribeFields: ["messages", "message_template_status_update", "message_template_quality_update"],
        verifyToken: settings?.webhookVerifyToken ?? "kdfnuts_webhook_token",
        hasAppSecret: secrets.length > 0,
        phoneNumberId: settings?.phoneNumberId ?? null,
        isActive: settings?.isActive ?? false,
      },
      inbound: {
        last1h: Number(is?.inbound_1h ?? 0),
        last24h: Number(is?.inbound_24h ?? 0),
        lastReceivedAt: is?.last_inbound_at ?? null,
        recentSamples: recentInbound,
      },
      webhookFailures24h: {
        hmacRejected: hmacCount,
      },
      livePayloadCount: recentWebhookPayloads.length,
      metaConsoleChecklist,
    });
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

/* ─── Admin: Webhook Info ────────────────────────────── */
router.get("/admin/whatsapp/webhook-info", adminMiddleware as any, async (req, res) => {
  try {
    const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() || req.hostname;
    const webhookUrl = getPublicWebhookUrl(host);
    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    const configured = !!(settings?.accessToken && settings?.phoneNumberId && settings?.webhookVerifyToken);
    const isProd = !!(process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
    const appSecret = await getMetaAppSecret();
    return res.json({
      webhookUrl,
      unifiedWebhookUrl: getUnifiedWebhookUrl(host),
      verifyToken: settings?.webhookVerifyToken ?? "kdfnuts_webhook_token",
      configured,
      isActive: settings?.isActive ?? false,
      hasAppSecret: !!appSecret,
      isProd,
      urlAvailable: !!webhookUrl,
    });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Admin: Test Webhook (self-verify) ──────────────── */
router.post("/admin/whatsapp/test-webhook", adminMiddleware as any, async (req, res) => {
  try {
    const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() || req.hostname;
    const bodyUrl = typeof req.body?.webhookUrl === "string" ? req.body.webhookUrl.trim() : "";
    const webhookUrl = bodyUrl || getPublicWebhookUrl(host);
    if (!webhookUrl) {
      return res.json({
        success: false,
        error: "No public API URL configured. Set PUBLIC_API_URL=https://api.khanbabadryfruits.com on api-server (Railway).",
      });
    }

    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    const verifyToken = settings?.webhookVerifyToken ?? "kdfnuts_webhook_token";
    const challenge = `challenge_${Date.now()}`;

    const testUrl = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${encodeURIComponent(challenge)}`;

    const resp = await fetch(testUrl, { signal: AbortSignal.timeout(8000) });
    const body = await resp.text();

    if (resp.ok && body.trim() === challenge) {
      return res.json({ success: true, webhookUrl, message: "Webhook verification passed! Meta can connect to your endpoint." });
    }
    return res.json({
      success: false,
      webhookUrl,
      error: resp.status === 403
        ? "Token mismatch — make sure the Verify Token in Meta Dashboard matches the one saved in settings."
        : `Unexpected response (HTTP ${resp.status}): ${body.slice(0, 200)}`,
    });
  } catch (err: any) {
    const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() || req.hostname;
    const webhookUrl = getPublicWebhookUrl(host);
    return res.json({
      success: false,
      webhookUrl: webhookUrl || undefined,
      error: err.name === "TimeoutError" ? "Request timed out — the server may not be publicly reachable." : err.message,
    });
  }
});

/* ─── Admin: Get Settings ────────────────────────────── */
/* settings GET is now registered after PUT above */

/* ─── Admin: Clear DB app secret (use META_APP_SECRET env only) ─── */
router.post("/admin/whatsapp/clear-app-secret", adminMiddleware as any, async (_req, res) => {
  try {
    const [row] = await db.select({ id: whatsappSettingsTable.id }).from(whatsappSettingsTable).limit(1);
    if (!row) return res.status(404).json({ error: "No settings row" });
    await db.update(whatsappSettingsTable)
      .set({ appSecret: null, updatedAt: new Date() })
      .where(eq(whatsappSettingsTable.id, row.id));
    const envSet = !!process.env.META_APP_SECRET?.trim();
    return res.json({
      success: true,
      message: envSet
        ? "Database App Secret cleared. Server will use META_APP_SECRET from Railway."
        : "Database App Secret cleared. Set META_APP_SECRET on api-server or paste App Secret in settings.",
      envConfigured: envSet,
    });
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

const MASKED_SECRET_PLACEHOLDER = "••••••••";

function isMaskedOrEmptySecret(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return true;
  return value.trim() === MASKED_SECRET_PLACEHOLDER || /^[•*]+$/.test(value.trim());
}

/* ─── Admin: Integration backup checklist (no secrets) ─── */
router.get("/admin/whatsapp/integration-backup", adminMiddleware as any, async (req, res) => {
  try {
    const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() || req.hostname;
    const [s] = await db.select().from(whatsappSettingsTable).limit(1);
    return res.json({
      savedAt: new Date().toISOString(),
      note: "Store Railway env separately. Never commit access tokens or app secrets to git.",
      database: {
        hasRow: !!s,
        phoneNumberId: s?.phoneNumberId ?? null,
        businessAccountId: s?.businessAccountId ?? null,
        webhookVerifyToken: s?.webhookVerifyToken ?? "kdfnuts_webhook_token",
        apiVersion: s?.apiVersion ?? "v18.0",
        businessPortfolioId: s?.businessPortfolioId ?? null,
        isActive: s?.isActive ?? false,
        hasAccessToken: !!s?.accessToken,
        hasAppSecretInDb: !!s?.appSecret,
      },
      metaDeveloperConsole: {
        callbackUrl: getPublicWebhookUrl(host),
        unifiedCallbackUrl: getUnifiedWebhookUrl(host),
        verifyToken: s?.webhookVerifyToken ?? "kdfnuts_webhook_token",
        subscribeFields: ["messages", "message_deliveries", "message_reads"],
        product: "WhatsApp Business Account (not User)",
      },
      railwayEnvRequired: [
        "DATABASE_URL",
        "SESSION_SECRET",
        "PUBLIC_API_URL=https://api.khanbabadryfruits.com",
        "META_APP_SECRET=<Meta App → Settings → Basic → App Secret>",
      ],
    });
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

/* ─── Admin: Save Settings ───────────────────────────── */
router.put("/admin/whatsapp/settings", adminMiddleware as any, async (req, res) => {
  try {
    const {
      accessToken, phoneNumberId, businessAccountId, webhookVerifyToken,
      isActive, chatButtonEnabled, chatButtonPhone, chatButtonMessage,
      abandonedRecoveryEnabled, abandonedRecoveryDelayMinutes, abandonedRecoveryCouponCode,
      appSecret, apiVersion, businessPortfolioId,
    } = req.body;
    const existing = await db.select().from(whatsappSettingsTable).limit(1);
    const prev = existing[0];
    const payload: Record<string, any> = {
      isActive: isActive ?? prev?.isActive ?? false,
      chatButtonEnabled: chatButtonEnabled ?? prev?.chatButtonEnabled ?? false,
      chatButtonPhone: chatButtonPhone ?? prev?.chatButtonPhone ?? null,
      chatButtonMessage: chatButtonMessage ?? prev?.chatButtonMessage ?? null,
      abandonedRecoveryEnabled: abandonedRecoveryEnabled ?? prev?.abandonedRecoveryEnabled ?? false,
      abandonedRecoveryDelayMinutes: abandonedRecoveryDelayMinutes ?? prev?.abandonedRecoveryDelayMinutes ?? 45,
      abandonedRecoveryCouponCode: abandonedRecoveryCouponCode ?? prev?.abandonedRecoveryCouponCode ?? null,
      webhookVerifyToken: webhookVerifyToken?.trim() || prev?.webhookVerifyToken || "kdfnuts_webhook_token",
    };
    if (typeof accessToken === "string" && accessToken.trim() && !isMaskedOrEmptySecret(accessToken)) {
      payload.accessToken = accessToken.trim();
    } else if (prev?.accessToken) {
      payload.accessToken = prev.accessToken;
    }
    if (phoneNumberId?.trim()) payload.phoneNumberId = phoneNumberId.trim();
    else if (prev?.phoneNumberId) payload.phoneNumberId = prev.phoneNumberId;
    if (businessAccountId?.trim()) payload.businessAccountId = businessAccountId.trim();
    else if (prev?.businessAccountId) payload.businessAccountId = prev.businessAccountId;
    if (apiVersion?.trim()) payload.apiVersion = apiVersion.trim();
    else if (prev?.apiVersion) payload.apiVersion = prev.apiVersion;
    if (businessPortfolioId?.trim()) payload.businessPortfolioId = businessPortfolioId.trim();
    else if (prev?.businessPortfolioId) payload.businessPortfolioId = prev.businessPortfolioId;
    if (appSecret && appSecret.trim() && !isMaskedOrEmptySecret(appSecret)) {
      payload.appSecret = appSecret.trim();
    } else if (prev?.appSecret) {
      payload.appSecret = prev.appSecret;
    }

    if (existing.length > 0) {
      const [updated] = await db.update(whatsappSettingsTable)
        .set({ ...payload, updatedAt: new Date() })
        .where(eq(whatsappSettingsTable.id, existing[0]!.id))
        .returning();
      // Mask appSecret in response
      const resp = { ...updated, appSecret: updated.appSecret ? "••••••••" : null };
      return res.json(resp);
    } else {
      const [created] = await db.insert(whatsappSettingsTable).values(payload).returning();
      const resp = { ...created, appSecret: created.appSecret ? "••••••••" : null };
      return res.status(201).json(resp);
    }
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Admin: Mask secret but return other settings ────── */
router.get("/admin/whatsapp/settings", adminMiddleware as any, async (req, res) => {
  try {
    const [s] = await db.select().from(whatsappSettingsTable).limit(1);
    if (!s) return res.json(null);
    // Mask sensitive values before sending to frontend
    const safe = { ...s, appSecret: s.appSecret ? "••••••••" : null };
    return res.json(safe);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Admin: Test AI Reply ───────────────────────────── */
router.post("/admin/whatsapp/test-ai-reply", adminMiddleware as any, async (req, res) => {
  try {
    const { message } = req.body as { message?: string };
    if (!message?.trim()) return res.status(400).json({ error: "message required" });
    const [chatbot] = await db.select().from(chatbotSettingsTable).limit(1);
    if (!chatbot) return res.status(404).json({ error: "Chatbot settings not found" });
    const testText = message.trim();
    const detected = detectWaIntent(testText);
    let catalogContext = "";
    if (shouldSendCatalogForIntent(detected.intent) && !isGenericCategoryQuery(detected.productQuery)) {
      const products = await searchProductsForWa(detected.productQuery ?? testText, 4);
      if (products.length > 0) {
        catalogContext = `\n\n[OFFICIAL SHOPIFY/LIVE CATALOG CONTEXT]\nUse ONLY these products, variants, and prices. Never invent prices.\n${products.map((p, idx) => {
          const variants = p.variantLines?.length ? p.variantLines.map((v) => `    - ${v}`).join("\n") : `    - ${p.price}`;
          return `${idx + 1}. ${p.name}\n${variants}`;
        }).join("\n")}\n[END CATALOG CONTEXT]`;
      }
    }
    const [globalAiSettings] = await db.select().from(aiSettingsTable).limit(1).catch(() => []);
    const brainPrompt = buildAiBrainSystemPrompt(chatbot, {
      channel: "admin_test",
      detectedIntent: `${detected.intent} (${detected.reason})`,
      extraInstructions: "Reply naturally in the customer's language. Never invent prices, variants, discounts, or totals. If catalog context is provided, answer only from that official data.",
      contextBlocks: [catalogContext],
      globalAiSettings,
    });
    const aiClient = await getOpenAIClient();
    const completion = await aiClient.chat.completions.create({
      model: chatbot.aiModel ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: brainPrompt.systemPrompt },
        { role: "user", content: testText },
      ],
      max_tokens: 400,
    });
    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    return res.json({ success: true, reply, model: chatbot.aiModel, promptLoaded: brainPrompt.promptLoaded, promptSource: brainPrompt.promptSource, promptVersion: brainPrompt.promptVersion });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message ?? "AI test failed" });
  }
});

/* ─── Admin: Test Send ───────────────────────────────── */
router.post("/admin/whatsapp/test", adminMiddleware as any, async (req, res) => {
  try {
    const { phone, message, useTemplate, templateName: tplName, languageCode, templateParams } = req.body;
    if (!phone) return res.status(400).json({ error: "phone required" });
    if (useTemplate && tplName) {
      // Keep ALL params (do NOT filter empty strings — count must exactly match template variable count)
      const params: string[] = Array.isArray(templateParams)
        ? templateParams.map((v: any) => (typeof v === "string" && v.trim() !== "") ? v.trim() : "—")
        : [];
      const components = params.length
        ? [{ type: "body", parameters: params.map((v: string) => ({ type: "text", text: v })) }]
        : [];
      const result = await sendWhatsAppTemplate({ phone, templateName: tplName, languageCode: languageCode ?? "en_US", components });
      return res.json(result);
    }
    if (!message) return res.status(400).json({ error: "message required" });
    const ok = await sendWhatsAppMessage({ phone, message, templateName: "test" });
    return res.json({ success: ok });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

/* ─── Admin: Fetch Meta Templates (live from Meta API) ────── */
router.get("/admin/whatsapp/meta-templates", adminMiddleware as any, async (req, res) => {
  try {
    const { fetchAllMetaTemplates, clearMetaTemplateListCache } = await import("../lib/metaTemplateSync.js");
    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    if (!settings?.accessToken) return res.json({ templates: [], error: "no_token" });
    if (!settings?.businessAccountId) return res.json({ templates: [], error: "no_waba_id" });

    if (req.query.refresh === "1") clearMetaTemplateListCache();

    const templates = await fetchAllMetaTemplates(settings.accessToken, settings.businessAccountId);
    return res.json({ templates, total: templates.length });
  } catch (e: unknown) {
    return res.json({ templates: [], error: e instanceof Error ? e.message : "Meta API error" });
  }
});

/* ─── Admin: Sync Meta → Database (production two-way) ─────────────────────── */
router.post("/admin/whatsapp/sync-meta-templates", adminMiddleware as any, async (_req, res) => {
  try {
    const { syncMetaTemplatesToDatabase, clearMetaTemplateListCache } = await import("../lib/metaTemplateSync.js");
    clearMetaTemplateListCache();
    const result = await syncMetaTemplatesToDatabase();
    if (!result.ok) return res.status(400).json(result);

    const dbTemplates = await db.select().from(whatsappTemplatesTable).orderBy(whatsappTemplatesTable.name);
    return res.json({
      ...result,
      templates: dbTemplates,
    });
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Sync failed" });
  }
});

/* ─── Admin: List Templates ──────────────────────────── */
router.get("/admin/whatsapp/templates", adminMiddleware as any, async (req, res) => {
  try {
    const templates = await db.select().from(whatsappTemplatesTable).orderBy(whatsappTemplatesTable.id);
    return res.json(templates);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Admin: Approved Templates (for conversation picker) ── */
router.get("/admin/whatsapp/templates/approved", adminMiddleware as any, async (_req, res) => {
  try {
    const templates = await db
      .select()
      .from(whatsappTemplatesTable)
      .where(eq(whatsappTemplatesTable.approvalStatus, "approved"))
      .orderBy(whatsappTemplatesTable.name);
    return res.json(templates);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

/** All templates usable in pickers (approved + pending review from Meta sync). */
router.get("/admin/whatsapp/templates/for-picker", adminMiddleware as any, async (_req, res) => {
  try {
    const templates = await db
      .select()
      .from(whatsappTemplatesTable)
      .where(inArray(whatsappTemplatesTable.approvalStatus, ["approved", "pending"]))
      .orderBy(whatsappTemplatesTable.name);
    return res.json(templates);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Admin: Templates grouped by trigger event ──────────── */
router.get("/admin/whatsapp/templates/by-event", adminMiddleware as any, async (req, res) => {
  try {
    const EVENT_TYPES = [
      "order_confirmation",
      "paid_order_message",
      "order_processing",
      "order_shipped",
      "order_out_for_delivery",
      "order_delivered",
      "cancel_order",
      "order_cancelled",
      "shipment_return_update",
      "abandoned_cart_recovery",
      "rider_assigned",
      "order_failed_delivery",
    ];
    const templates = await db.select().from(whatsappTemplatesTable);
    const byEvent: Record<string, typeof templates[0] | null> = {};
    for (const ev of EVENT_TYPES) {
      byEvent[ev] = templates.find((t: any) => t.triggerEvent === ev) ?? null;
    }
    return res.json(byEvent);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Fix Template Format (convert {var} → {{N}}) ── */
router.post("/admin/whatsapp/templates/fix-format", adminMiddleware as any, async (req, res) => {
  try {
    const templates = await db.select().from(whatsappTemplatesTable);
    let fixed = 0;

    // Mapping of old named vars to numbered params per trigger event
    const VAR_MAPS: Record<string, Array<{ pattern: RegExp; replacement: string }>> = {
      order_confirmation: [
        { pattern: /\{orderNumber\}|#\{orderNumber\}|\{order_number\}/g, replacement: "{{1}}" },
        { pattern: /\{total\}|Rs\. \{total\}|Rs\.\{total\}/g, replacement: "Rs. {{2}}" },
        { pattern: /\{customerName\}|\{customer_name\}|\{name\}/g, replacement: "{{3}}" },
      ],
      order_processing: [
        { pattern: /\{orderNumber\}|#\{orderNumber\}|\{order_number\}/g, replacement: "{{1}}" },
      ],
      order_shipped: [
        { pattern: /\{orderNumber\}|#\{orderNumber\}|\{order_number\}/g, replacement: "{{1}}" },
        { pattern: /\{trackingId\}|\{tracking_id\}|\{tracking\}/g, replacement: "{{2}}" },
        { pattern: /\{deliveryTime\}|\{delivery_time\}|\{days\}/g, replacement: "{{3}}" },
      ],
      order_out_for_delivery: [
        { pattern: /\{orderNumber\}|#\{orderNumber\}|\{order_number\}/g, replacement: "{{1}}" },
      ],
      order_delivered: [
        { pattern: /\{orderNumber\}|#\{orderNumber\}|\{order_number\}/g, replacement: "{{1}}" },
      ],
      order_cancelled: [
        { pattern: /\{orderNumber\}|#\{orderNumber\}|\{order_number\}/g, replacement: "{{1}}" },
      ],
    };

    // Generic fallback: convert any remaining {word} to {{N}} sequentially
    function fixGeneric(body: string): string {
      let counter = 1;
      const seen = new Map<string, number>();
      return body.replace(/\{([a-zA-Z_]+)\}/g, (_, varName) => {
        if (!seen.has(varName)) { seen.set(varName, counter++); }
        return `{{${seen.get(varName)}}}`;
      });
    }

    for (const tpl of templates) {
      let body = tpl.messageBody;
      const originalBody = body;

      // Apply known mappings for this trigger event
      const maps = tpl.triggerEvent ? VAR_MAPS[tpl.triggerEvent] ?? [] : [];
      for (const { pattern, replacement } of maps) {
        body = body.replace(pattern, replacement);
      }

      // Generic fix for any remaining single-brace vars
      body = fixGeneric(body);

      if (body !== originalBody) {
        const newParamCount = (() => {
          const matches = body.match(/\{\{(\d+)\}\}/g);
          if (!matches) return 0;
          const nums = matches.map((m: string) => parseInt(m.replace(/\{\{|\}\}/g, "")));
          return Math.max(...nums, 0);
        })();

        await db.update(whatsappTemplatesTable)
          .set({
            messageBody: body,
            paramCount: newParamCount,
            // Reset Meta status since body changed
            submittedToMeta: false,
            approvalStatus: "draft",
            metaTemplateId: null,
            rejectionReason: null,
          })
          .where(eq(whatsappTemplatesTable.id, tpl.id));
        fixed++;
      }
    }

    return res.json({ success: true, fixed, total: templates.length });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Create Template (skip if name exists) ────── */
router.post("/admin/whatsapp/templates", adminMiddleware as any, async (req, res) => {
  try {
    const { name, templateId, messageBody, isActive, category, language, headerText, footerText, paramCount, triggerEvent } = req.body;
    if (!name || !messageBody) return res.status(400).json({ error: "name and messageBody required" });
    const [existing] = await db.select().from(whatsappTemplatesTable).where(eq(whatsappTemplatesTable.name, name)).limit(1);
    if (existing) return res.status(200).json({ ...existing, _skipped: true });
    const autoParamCount = paramCount ?? (messageBody.match(/\{\{(\d+)\}\}/g)?.length ?? 0);
    const [t] = await db.insert(whatsappTemplatesTable).values({
      name, templateId, messageBody, isActive: isActive ?? true,
      category: category ?? "UTILITY", language: language ?? "en_US",
      headerText: headerText ?? null, footerText: footerText ?? null,
      paramCount: autoParamCount, triggerEvent: triggerEvent ?? null,
      approvalStatus: "draft", submittedToMeta: false,
    }).returning();
    return res.status(201).json(t);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Update Template ─────────────────────────── */
router.put("/admin/whatsapp/templates/:id", adminMiddleware as any, async (req, res) => {
  try {
    const { name, templateId, messageBody, isActive, category, language, headerText, footerText, paramCount, triggerEvent, approvalStatus } = req.body;
    const autoParamCount = paramCount ?? (messageBody ? (messageBody.match(/\{\{(\d+)\}\}/g)?.length ?? 0) : undefined);
    const [t] = await db.update(whatsappTemplatesTable)
      .set({
        ...(name !== undefined && { name }),
        ...(templateId !== undefined && { templateId }),
        ...(messageBody !== undefined && { messageBody }),
        ...(isActive !== undefined && { isActive }),
        ...(category !== undefined && { category }),
        ...(language !== undefined && { language }),
        ...(headerText !== undefined && { headerText }),
        ...(footerText !== undefined && { footerText }),
        ...(autoParamCount !== undefined && { paramCount: autoParamCount }),
        ...(triggerEvent !== undefined && { triggerEvent }),
        ...(approvalStatus !== undefined && { approvalStatus }),
        // Reset Meta status if body changes (requires resubmission)
        ...(messageBody !== undefined && { submittedToMeta: false, approvalStatus: "draft", metaTemplateId: null }),
      })
      .where(eq(whatsappTemplatesTable.id, parseInt(req.params.id)))
      .returning();
    if (!t) return res.status(404).json({ error: "Not found" });
    return res.json(t);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Submit Template to Meta ─────────────────── */
router.post("/admin/whatsapp/templates/:id/submit-to-meta", adminMiddleware as any, async (req, res) => {
  try {
    const [tpl] = await db.select().from(whatsappTemplatesTable).where(eq(whatsappTemplatesTable.id, parseInt(req.params.id))).limit(1);
    if (!tpl) return res.status(404).json({ error: "Template not found" });
    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    if (!settings?.accessToken) return res.status(400).json({ error: "WhatsApp access token not configured" });
    if (!settings?.businessAccountId) return res.status(400).json({ error: "Business Account ID not configured — add it in API Settings" });

    // Build example values for variables (required by Meta for templates with {{N}} params)
    const paramCount = tpl.paramCount ?? 0;
    const EXAMPLE_VALS: Record<string, string[]> = {
      order_confirmation:      ["KDF-123456", "Rs. 2500"],
      order_processing:        ["KDF-123456"],
      order_shipped:           ["KDF-123456", "TRK987654321", "2-3 days"],
      order_out_for_delivery:  ["KDF-123456"],
      order_delivered:         ["KDF-123456"],
      order_cancelled:         ["KDF-123456"],
      abandoned_cart_recovery: [],
    };
    const fallbackExamples = ["KDF-123456", "TRK987654321", "2-3 days", "Rs. 2500", "Sample Value"];
    const exampleVals: string[] = paramCount > 0
      ? (tpl.triggerEvent && EXAMPLE_VALS[tpl.triggerEvent]
          ? EXAMPLE_VALS[tpl.triggerEvent]!.slice(0, paramCount)
          : fallbackExamples.slice(0, paramCount))
      : [];
    // Pad to paramCount if needed
    while (exampleVals.length < paramCount) exampleVals.push(`Sample ${exampleVals.length + 1}`);

    // Build components array for Meta
    const components: any[] = [];
    if (tpl.headerText) components.push({ type: "HEADER", format: "TEXT", text: tpl.headerText });
    const bodyComponent: any = { type: "BODY", text: tpl.messageBody };
    if (exampleVals.length > 0) bodyComponent.example = { body_text: [exampleVals] };
    components.push(bodyComponent);
    if (tpl.footerText) components.push({ type: "FOOTER", text: tpl.footerText });

    const metaPayload = {
      name: tpl.name,
      language: tpl.language,
      category: tpl.category,
      components,
    };

    const r = await fetch(`https://graph.facebook.com/v18.0/${settings.businessAccountId}/message_templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
      body: JSON.stringify(metaPayload),
    });
    const data = await r.json() as any;

    if (!r.ok) {
      return res.status(400).json({ error: data?.error?.message ?? "Meta API error", details: data });
    }

    const metaId = data.id as string | undefined;
    const metaStatus = (data.status as string | undefined) ?? "PENDING";

    await db.update(whatsappTemplatesTable)
      .set({
        metaTemplateId: metaId ?? null,
        submittedToMeta: true,
        metaSubmittedAt: new Date(),
        approvalStatus: metaStatus === "APPROVED" ? "approved" : metaStatus === "REJECTED" ? "rejected" : "pending",
        rejectionReason: data.rejected_reason ?? null,
      })
      .where(eq(whatsappTemplatesTable.id, tpl.id));

    const [updated] = await db.select().from(whatsappTemplatesTable).where(eq(whatsappTemplatesTable.id, tpl.id)).limit(1);
    return res.json({ success: true, metaId, metaStatus, template: updated });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Refresh Template Status from Meta ────────── */
router.post("/admin/whatsapp/templates/:id/refresh-status", adminMiddleware as any, async (req, res) => {
  try {
    const [tpl] = await db.select().from(whatsappTemplatesTable).where(eq(whatsappTemplatesTable.id, parseInt(req.params.id))).limit(1);
    if (!tpl) return res.status(404).json({ error: "Template not found" });
    if (!tpl.submittedToMeta) return res.status(400).json({ error: "Template not submitted to Meta yet" });

    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    if (!settings?.accessToken || !settings?.businessAccountId) return res.status(400).json({ error: "WhatsApp not configured" });

    const r = await fetch(
      `https://graph.facebook.com/v18.0/${settings.businessAccountId}/message_templates?name=${encodeURIComponent(tpl.name)}&fields=name,status,rejected_reason,id`,
      { headers: { Authorization: `Bearer ${settings.accessToken}` } }
    );
    const data = await r.json() as any;
    if (!r.ok) return res.status(400).json({ error: data?.error?.message ?? "Meta API error" });

    const metaTpl = data.data?.[0];
    if (!metaTpl) return res.status(404).json({ error: "Template not found in Meta — may have been deleted" });

    const metaStatus: string = metaTpl.status ?? "PENDING";
    const newStatus = metaStatus === "APPROVED" ? "approved" : metaStatus === "REJECTED" ? "rejected" : metaStatus === "PAUSED" ? "paused" : "pending";

    await db.update(whatsappTemplatesTable)
      .set({
        approvalStatus: newStatus,
        rejectionReason: metaTpl.rejected_reason ?? null,
        metaTemplateId: metaTpl.id ?? tpl.metaTemplateId,
      })
      .where(eq(whatsappTemplatesTable.id, tpl.id));

    const [updated] = await db.select().from(whatsappTemplatesTable).where(eq(whatsappTemplatesTable.id, tpl.id)).limit(1);
    return res.json({ success: true, metaStatus, template: updated });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Delete Template (+ Meta if submitted) ────── */
router.delete("/admin/whatsapp/templates/:id", adminMiddleware as any, async (req, res) => {
  try {
    const [tpl] = await db.select().from(whatsappTemplatesTable).where(eq(whatsappTemplatesTable.id, parseInt(req.params.id))).limit(1);
    if (!tpl) return res.status(404).json({ success: true }); // Already gone

    // Attempt Meta deletion if submitted (non-blocking)
    if (tpl.submittedToMeta && tpl.metaTemplateId) {
      const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
      if (settings?.accessToken && settings?.businessAccountId) {
        fetch(`https://graph.facebook.com/v18.0/${settings.businessAccountId}/message_templates?name=${encodeURIComponent(tpl.name)}&hsm_id=${tpl.metaTemplateId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${settings.accessToken}` },
        }).catch(() => {});
      }
    }

    await db.delete(whatsappTemplatesTable).where(eq(whatsappTemplatesTable.id, tpl.id));
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Logs ────────────────────────────────────── */
router.get("/admin/whatsapp/logs", adminMiddleware as any, async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const logs = await db.select().from(whatsappLogsTable).orderBy(desc(whatsappLogsTable.createdAt)).limit(limit);
    return res.json(logs);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Admin: Chatbot Settings ────────────────────────── */
router.get("/admin/whatsapp/chatbot-settings", adminMiddleware as any, async (req, res) => {
  try {
    const [s] = await db.select().from(chatbotSettingsTable).limit(1);
    const [globalAiSettings] = await db.select().from(aiSettingsTable).limit(1).catch(() => []);
    if (!s) return res.json(null);
    const brainPrompt = buildAiBrainSystemPrompt(s, { channel: "admin_test", globalAiSettings });
    return res.json({
      ...s,
      aiBrain: {
        promptLoaded: brainPrompt.promptLoaded,
        promptSource: brainPrompt.promptSource,
        promptVersion: brainPrompt.promptVersion,
        promptLength: brainPrompt.promptLength,
        promptPreview: brainPrompt.promptPreview,
      },
    });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.put("/admin/whatsapp/chatbot-settings", adminMiddleware as any, async (req, res) => {
  try {
    const {
      isEnabled, orderingEnabled, aiModel, systemPrompt, fallbackMessage,
      orderContextEnabled, replyDelaySec, maxDailyReplies,
      menuEnabled, menuGreetingKeywords, websiteUrl,
      discountCode, discountMessage, hotDealsMessage,
      catalogEnabled, catalogMaxProducts,
      menuItems, greetingMessage,
    } = req.body;
    const payload: Record<string, unknown> = {
      isEnabled:            isEnabled ?? false,
      orderingEnabled:      orderingEnabled ?? false,
      aiModel:              aiModel ?? "gpt-4o-mini",
      systemPrompt:         systemPrompt ?? "",
      fallbackMessage:      fallbackMessage ?? "",
      orderContextEnabled:  orderContextEnabled ?? true,
      replyDelaySec:        Number(replyDelaySec ?? 30),
      maxDailyReplies:      Number(maxDailyReplies ?? 100),
      menuEnabled:          menuEnabled ?? false,
      menuGreetingKeywords: menuGreetingKeywords ?? "hi,hello,hey,salam,salaam,asslam,start,menu,help,shop,helo,hii",
      catalogEnabled:       catalogEnabled ?? false,
      catalogMaxProducts:   Number(catalogMaxProducts ?? 3),
      websiteUrl:           websiteUrl ?? KHAN_WEBSITE_URL,
      discountCode:         discountCode ?? "WELCOME10",
      discountMessage:      discountMessage ?? "",
      hotDealsMessage:      hotDealsMessage ?? "",
      updatedAt:            new Date(),
    };
    if (menuItems !== undefined) payload.menuItems = menuItems;
    if (greetingMessage !== undefined) payload.greetingMessage = greetingMessage;
    const existing = await db.select().from(chatbotSettingsTable).limit(1);
    if (existing.length > 0) {
      const [u] = await db.update(chatbotSettingsTable).set(payload as any).where(eq(chatbotSettingsTable.id, existing[0]!.id)).returning();
      return res.json(u);
    }
    const [c] = await db.insert(chatbotSettingsTable).values(payload as any).returning();
    return res.status(201).json(c);
  } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
});

/* ─── Admin: Chatbot Stats (today's AI reply count) ─── */
router.get("/admin/whatsapp/chatbot-stats", adminMiddleware as any, async (req, res) => {
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const result = await db.execute(
      sql`SELECT
            COUNT(*) FILTER (WHERE template_name = 'ai_reply') as total_ai_replies,
            COUNT(*) FILTER (WHERE template_name = 'ai_reply' AND created_at >= ${todayStart.toISOString()}) as today_ai_replies,
            COUNT(*) FILTER (WHERE template_name = 'incoming' AND created_at >= NOW() - INTERVAL '24 hours') as incoming_24h,
            COUNT(DISTINCT phone) FILTER (WHERE template_name = 'incoming') as unique_customers
          FROM whatsapp_logs`
    );
    return res.json((result as any).rows?.[0] ?? {});
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Conversations (unique phones) ────────────── */
router.get("/admin/whatsapp/conversations", adminMiddleware as any, async (req, res) => {
  try {
    const { status, assigned, search, intent } = req.query as Record<string, string>;
    const rows = await db.execute(sql`
      SELECT
        c.id, c.contact_phone as phone, c.contact_name, c.contact_wa_id,
        c.last_message, c.last_message_at, c.unread_count, c.bot_mode,
        c.status, c.assigned_to, c.agent_name, c.internal_note, c.intent,
        c.is_starred, c.tags, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM wa_messages m WHERE m.conversation_id = c.id) as message_count
      FROM wa_conversations c
      WHERE 1=1
        ${status  ? sql`AND c.status = ${status}`               : sql``}
        ${assigned === "me" ? sql`AND c.assigned_to IS NOT NULL` : sql``}
        ${intent   ? sql`AND c.intent = ${intent}`              : sql``}
        ${search   ? sql`AND (c.contact_phone ILIKE ${'%' + search + '%'} OR c.contact_name ILIKE ${'%' + search + '%'})` : sql``}
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT 200
    `);
    return res.json(rows.rows ?? rows);
  } catch (e) { req.log?.error(e); return res.status(500).json({ error: "Failed" }); }
});

/* ─── Admin: Single Conversation messages ─────────────── */
router.get("/admin/whatsapp/conversations/:phone", adminMiddleware as any, async (req, res) => {
  try {
    const phoneParam = req.params.phone;
    const phone = normalizePhone(phoneParam);
    /* Try wa_messages first (rich data), fall back to whatsapp_logs */
    const convResult = await db.execute(sql`
      SELECT id FROM wa_conversations
      WHERE contact_phone = ${phone} OR contact_phone = ${phoneParam} OR contact_wa_id = ${phoneParam}
      LIMIT 1
    `);
    const conv = (convResult.rows ?? convResult as any)[0];
    const convId = (conv as any)?.id;
    if (convId) {
      const msgs = await db.execute(sql`
        SELECT m.*, 'wa_message' as source
        FROM wa_messages m
        WHERE m.conversation_id = ${convId}
        ORDER BY m.created_at ASC
        LIMIT 200
      `);
      /* Mark as read */
      await db.execute(sql`UPDATE wa_conversations SET unread_count = 0 WHERE id = ${convId}`).catch(() => {});
      return res.json(msgs.rows ?? msgs);
    }
    /* Fallback to logs */
    const messages = await db.select().from(whatsappLogsTable)
      .where(eq(whatsappLogsTable.phone, phone))
      .orderBy(whatsappLogsTable.createdAt)
      .limit(200);
    return res.json(messages);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/* ─── Admin: Conversation detail (meta + notes) ────────── */
router.get("/admin/whatsapp/conversations/:phone/detail", adminMiddleware as any, async (req, res) => {
  try {
    const convR = await db.execute(sql`SELECT * FROM wa_conversations WHERE contact_phone = ${req.params.phone} LIMIT 1`);
    const conv = (convR.rows ?? convR as any)[0];
    const notesR = await db.execute(sql`SELECT * FROM wa_agent_notes WHERE phone = ${req.params.phone} ORDER BY created_at DESC LIMIT 50`);
    return res.json({ conversation: conv, notes: notesR.rows ?? notesR });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/* ─── Admin: Manual Reply ────────────────────────────── */
router.post("/admin/whatsapp/conversations/:phone/reply", adminMiddleware as any, async (req, res) => {
  try {
    const { message, agentName } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });
    const ok = await sendWhatsAppMessage({ phone: req.params.phone, message, templateName: "admin_reply" });
    if (ok) {
      /* Log to wa_messages */
      const convR2 = await db.execute(sql`SELECT id FROM wa_conversations WHERE contact_phone = ${req.params.phone} LIMIT 1`);
      const convId = ((convR2.rows ?? convR2 as any)[0] as any)?.id;
      if (convId) {
        await db.execute(sql`
          INSERT INTO wa_messages (conversation_id, direction, type, content, status, is_bot, agent_name, created_at)
          VALUES (${convId}, 'out', 'text', ${message}, 'sent', false, ${agentName ?? 'Admin'}, NOW())
        `).catch(() => {});
        await db.execute(sql`
          UPDATE wa_conversations SET last_message = ${message.slice(0, 120)}, last_message_at = NOW(), agent_name = ${agentName ?? 'Admin'}, last_agent_at = NOW() WHERE id = ${convId}
        `).catch(() => {});
        broadcastSSE("wa_message", { conversationId: convId, direction: "out", content: message, phone: req.params.phone, agentName: agentName ?? "Admin" });
      }
    }
    return res.json({ success: ok });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Assign conversation ─────────────────────── */
router.patch("/admin/whatsapp/conversations/:phone/assign", adminMiddleware as any, async (req, res) => {
  try {
    const { agentName, agentId } = req.body;
    await db.execute(sql`
      UPDATE wa_conversations SET assigned_to = ${agentId ?? agentName ?? null}, agent_name = ${agentName ?? null}, updated_at = NOW()
      WHERE contact_phone = ${req.params.phone}
    `);
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Toggle bot mode ─────────────────────────── */
router.patch("/admin/whatsapp/conversations/:phone/bot-mode", adminMiddleware as any, async (req, res) => {
  try {
    const { mode } = req.body; // "auto" | "human" | "off"
    if (!["auto", "human", "off"].includes(mode)) return res.status(400).json({ error: "Invalid mode" });
    await db.execute(sql`UPDATE wa_conversations SET bot_mode = ${mode}, updated_at = NOW() WHERE contact_phone = ${req.params.phone}`);
    broadcastSSE("wa_bot_mode", { phone: req.params.phone, mode });
    return res.json({ success: true, mode });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Toggle conversation status ──────────────── */
router.patch("/admin/whatsapp/conversations/:phone/status", adminMiddleware as any, async (req, res) => {
  try {
    const { status } = req.body; // "open" | "resolved" | "spam"
    await db.execute(sql`UPDATE wa_conversations SET status = ${status}, updated_at = NOW() WHERE contact_phone = ${req.params.phone}`);
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Toggle star ─────────────────────────────── */
router.patch("/admin/whatsapp/conversations/:phone/star", adminMiddleware as any, async (req, res) => {
  try {
    await db.execute(sql`UPDATE wa_conversations SET is_starred = NOT is_starred, updated_at = NOW() WHERE contact_phone = ${req.params.phone}`);
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Internal note ───────────────────────────── */
router.post("/admin/whatsapp/conversations/:phone/note", adminMiddleware as any, async (req, res) => {
  try {
    const { note, agentName } = req.body;
    if (!note?.trim()) return res.status(400).json({ error: "note required" });
    const convR3 = await db.execute(sql`SELECT id FROM wa_conversations WHERE contact_phone = ${req.params.phone} LIMIT 1`);
    const convId = ((convR3.rows ?? convR3 as any)[0] as any)?.id ?? 0;
    await db.execute(sql`
      INSERT INTO wa_agent_notes (conversation_id, phone, agent_name, note, created_at)
      VALUES (${convId}, ${req.params.phone}, ${agentName ?? 'Admin'}, ${note.trim()}, NOW())
    `);
    /* Update internal_note shortcut on conversation */
    await db.execute(sql`UPDATE wa_conversations SET internal_note = ${note.trim()}, updated_at = NOW() WHERE contact_phone = ${req.params.phone}`);
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Send template from conversation ──────────── */
router.post("/admin/whatsapp/conversations/:phone/send-template", adminMiddleware as any, async (req, res) => {
  try {
    const { templateName, languageCode, components } = req.body;
    if (!templateName) return res.status(400).json({ error: "templateName required" });
    const result = await sendWhatsAppTemplate({ phone: req.params.phone, templateName, languageCode: languageCode ?? "en_US", components: components ?? [] });
    return res.json(result);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Retry failed message ────────────────────── */
router.post("/admin/whatsapp/logs/:id/retry", adminMiddleware as any, async (req, res) => {
  try {
    const logId = parseInt(req.params.id);
    const [log] = await db.select().from(whatsappLogsTable).where(eq(whatsappLogsTable.id, logId)).limit(1);
    if (!log) return res.status(404).json({ error: "Log entry not found" });
    if (!log.phone || !log.message) return res.status(400).json({ error: "Log missing phone or message" });

    await db.update(whatsappLogsTable).set({ status: "pending" }).where(eq(whatsappLogsTable.id, logId));

    const ok = await sendWhatsAppMessage({
      phone: log.phone,
      message: log.message,
      templateName: log.templateName ?? undefined,
      userId: log.userId ?? undefined,
    });

    return res.json({ success: ok });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Manual send for an order ───────────────── */
router.post("/admin/whatsapp/send-order", adminMiddleware as any, async (req, res) => {
  try {
    const { phone, message, orderId, orderNumber } = req.body;
    if (!phone || !message) return res.status(400).json({ error: "phone and message are required" });

    const ok = await sendWhatsAppMessage({
      phone,
      message,
      templateName: "manual_order_message",
    });

    return res.json({ success: ok });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Notification toggles (GET) ─────────────── */
router.get("/admin/whatsapp/notification-settings", adminMiddleware as any, async (req, res) => {
  try {
    const [settings] = await db.select({
      notifyOrderConfirmation: whatsappSettingsTable.notifyOrderConfirmation,
      notifyOrderProcessing: whatsappSettingsTable.notifyOrderProcessing,
      notifyOrderShipped: whatsappSettingsTable.notifyOrderShipped,
      notifyOrderOutForDelivery: whatsappSettingsTable.notifyOrderOutForDelivery,
      notifyOrderDelivered: whatsappSettingsTable.notifyOrderDelivered,
      notifyOrderCancelled: whatsappSettingsTable.notifyOrderCancelled,
      notifyRestock: whatsappSettingsTable.notifyRestock,
      notifyBiddingWinner: whatsappSettingsTable.notifyBiddingWinner,
    }).from(whatsappSettingsTable).limit(1);
    return res.json(settings ?? {});
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Notification toggles (PUT) ─────────────── */
router.put("/admin/whatsapp/notification-settings", adminMiddleware as any, async (req, res) => {
  try {
    const {
      notifyOrderConfirmation, notifyOrderProcessing, notifyOrderShipped,
      notifyOrderOutForDelivery, notifyOrderDelivered, notifyOrderCancelled,
      notifyRestock, notifyBiddingWinner,
    } = req.body;

    const [existing] = await db.select({ id: whatsappSettingsTable.id }).from(whatsappSettingsTable).limit(1);
    const values = {
      notifyOrderConfirmation: notifyOrderConfirmation ?? true,
      notifyOrderProcessing: notifyOrderProcessing ?? true,
      notifyOrderShipped: notifyOrderShipped ?? true,
      notifyOrderOutForDelivery: notifyOrderOutForDelivery ?? true,
      notifyOrderDelivered: notifyOrderDelivered ?? true,
      notifyOrderCancelled: notifyOrderCancelled ?? true,
      notifyRestock: notifyRestock ?? true,
      notifyBiddingWinner: notifyBiddingWinner ?? true,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(whatsappSettingsTable).set(values).where(eq(whatsappSettingsTable.id, existing.id));
    } else {
      await db.insert(whatsappSettingsTable).values(values as any);
    }
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Meta App Config (for Embedded Signup) ──── */
router.get("/admin/whatsapp/meta-config", adminMiddleware as any, (req, res) => {
  const appId = process.env.META_APP_ID ?? null;
  const configId = process.env.META_CONFIG_ID ?? null;
  return res.json({ appId, configId, isConfigured: !!(appId && configId) });
});

/* ─── Admin: Meta App Health Diagnostic ────────────────── */
router.get("/admin/whatsapp/meta-app-diagnostic", adminMiddleware as any, async (req, res) => {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const GV = "v20.0";

  if (!appId || !appSecret) {
    return res.json({
      success: false,
      error: "META_APP_ID and META_APP_SECRET environment secrets are not configured.",
      checks: [],
    });
  }

  const checks: Array<{
    id: string;
    label: string;
    status: "pass" | "fail" | "warn" | "unknown";
    detail: string;
    fixUrl?: string;
    fixLabel?: string;
  }> = [];

  try {
    /* Step 1: Get App Access Token via client_credentials */
    const tokenRes = await fetch(
      `https://graph.facebook.com/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&grant_type=client_credentials`
    );
    const tokenData = await tokenRes.json() as any;
    const appToken: string | null = tokenData.access_token ?? null;

    if (!appToken) {
      return res.json({
        success: false,
        error: `Could not get App Access Token: ${tokenData.error?.message ?? "Unknown error"}. Check that META_APP_ID and META_APP_SECRET match your Meta App exactly.`,
        checks: [],
      });
    }

    /* Step 2: Fetch App fields */
    const appRes = await fetch(
      `https://graph.facebook.com/${GV}/${appId}?fields=name,status,privacy_policy_url,terms_of_service_url,icon_url,user_support_url,data_deletion_request_url,data_deletion_data_url,app_domains,business,social_discovery&access_token=${appToken}`
    );
    const app = await appRes.json() as any;

    const appName: string = app.name ?? "Unknown App";
    const appStatus: string = app.status ?? "UNKNOWN"; // "LIVE" | "DEVELOPMENT" | "STAGING"

    /* Check 1: App Mode */
    checks.push({
      id: "app_mode",
      label: "App Mode: Live (not Development)",
      status: appStatus === "LIVE" ? "pass" : "fail",
      detail: appStatus === "LIVE"
        ? `App "${appName}" is LIVE — Facebook Login works for all users.`
        : `App "${appName}" is in ${appStatus} mode. This causes "Facebook Login is currently unavailable" for users who are not app developers/testers. Switch to LIVE mode in Meta Developer Portal → App Review → Status.`,
      fixUrl: `https://developers.facebook.com/apps/${appId}/dashboard/`,
      fixLabel: "Open App Dashboard → Switch to Live",
    });

    /* Check 2: Privacy Policy URL */
    const hasPrivacy = !!(app.privacy_policy_url);
    checks.push({
      id: "privacy_policy",
      label: "Privacy Policy URL",
      status: hasPrivacy ? "pass" : "fail",
      detail: hasPrivacy
        ? `Set: ${app.privacy_policy_url}`
        : "Missing. Required to go Live. Add it in: Meta App Dashboard → Settings → Basic → Privacy Policy URL.",
      fixUrl: `https://developers.facebook.com/apps/${appId}/settings/basic/`,
      fixLabel: "Open Basic Settings",
    });

    /* Check 3: Terms of Service URL */
    const hasTerms = !!(app.terms_of_service_url);
    checks.push({
      id: "terms_of_service",
      label: "Terms of Service URL",
      status: hasTerms ? "pass" : "warn",
      detail: hasTerms
        ? `Set: ${app.terms_of_service_url}`
        : "Not set. Recommended for Live apps. Add it in: Meta App Dashboard → Settings → Basic → Terms of Service URL.",
      fixUrl: `https://developers.facebook.com/apps/${appId}/settings/basic/`,
      fixLabel: "Open Basic Settings",
    });

    /* Check 4: App Icon */
    const hasIcon = !!(app.icon_url);
    checks.push({
      id: "app_icon",
      label: "App Icon",
      status: hasIcon ? "pass" : "fail",
      detail: hasIcon
        ? "App icon is set."
        : "No app icon. Required for Live mode. Upload a 1024×1024 PNG in: Meta App Dashboard → Settings → Basic → App Icon.",
      fixUrl: `https://developers.facebook.com/apps/${appId}/settings/basic/`,
      fixLabel: "Open Basic Settings → Upload Icon",
    });

    /* Check 5: Data Deletion Callback URL */
    const hasDataDeletion = !!(app.data_deletion_request_url || app.data_deletion_data_url);
    checks.push({
      id: "data_deletion",
      label: "Data Deletion Callback URL",
      status: hasDataDeletion ? "pass" : "fail",
      detail: hasDataDeletion
        ? "Data Deletion URL is configured."
        : "Missing. Required for Facebook Login apps. Set in: Meta App Dashboard → Settings → Basic → Data Deletion Request → provide a URL or instructions.",
      fixUrl: `https://developers.facebook.com/apps/${appId}/settings/basic/`,
      fixLabel: "Open Basic Settings → Data Deletion",
    });

    /* Check 6: App Domains */
    const domains: string[] = app.app_domains ?? [];
    const requiredDomains = ["khanbabadryfruits.com", "admin.khanbabadryfruits.com"];
    const missingDomains = requiredDomains.filter(d => !domains.some((ad: string) => ad.includes(d)));
    checks.push({
      id: "app_domains",
      label: "App Domains (khanbabadryfruits.com)",
      status: missingDomains.length === 0 ? "pass" : "fail",
      detail: missingDomains.length === 0
        ? `Configured domains: ${domains.join(", ")}`
        : `Missing domains: ${missingDomains.join(", ")}. Current domains: [${domains.join(", ") || "none"}]. Add missing domains in: Meta App Dashboard → Settings → Basic → App Domains. Also add them to: Facebook Login for Business → Settings → Allowed Domains for JavaScript SDK.`,
      fixUrl: `https://developers.facebook.com/apps/${appId}/settings/basic/`,
      fixLabel: "Open Basic Settings → App Domains",
    });

    /* Check 7: Business Verification */
    const hasBusiness = !!(app.business?.id);
    checks.push({
      id: "business_verification",
      label: "Business Verification",
      status: hasBusiness ? "pass" : "warn",
      detail: hasBusiness
        ? `Linked to business: ${app.business?.name ?? app.business?.id}`
        : "App does not have a verified business linked. Business Verification is required for Advanced Access to WhatsApp permissions. Go to: Meta Business Manager → Settings → Business Info → Start Verification.",
      fixUrl: "https://business.facebook.com/settings/info",
      fixLabel: "Open Business Manager → Verification",
    });

    /* Step 3: Check permissions via stored system user token if available */
    let systemToken: string | null = null;
    try {
      const [settings] = await db.select({ accessToken: whatsappSettingsTable.accessToken })
        .from(whatsappSettingsTable).limit(1);
      systemToken = settings?.accessToken ?? null;
    } catch { /* non-critical */ }

    const permissionsToCheck = [
      { name: "whatsapp_business_messaging", label: "whatsapp_business_messaging (send messages)" },
      { name: "whatsapp_business_management", label: "whatsapp_business_management (manage templates/WABAs)" },
      { name: "business_management", label: "business_management (access Business Manager)" },
    ];

    if (systemToken) {
      /* Check token info */
      const debugRes = await fetch(
        `https://graph.facebook.com/${GV}/debug_token?input_token=${systemToken}&access_token=${appToken}`
      );
      const debugData = await debugRes.json() as any;
      const tokenInfo = debugData.data ?? {};

      /* Token validity */
      const isTokenValid = tokenInfo.is_valid === true;
      const tokenExpiry = tokenInfo.expires_at === 0 ? "Never (permanent)" : tokenInfo.expires_at
        ? new Date(tokenInfo.expires_at * 1000).toLocaleDateString()
        : "Unknown";
      const grantedScopes: string[] = tokenInfo.scopes ?? [];

      checks.push({
        id: "token_valid",
        label: "System User Token — Valid",
        status: isTokenValid ? "pass" : "fail",
        detail: isTokenValid
          ? `Token is valid. Type: ${tokenInfo.type ?? "unknown"}. Expires: ${tokenExpiry}. App: ${tokenInfo.application ?? "unknown"}.`
          : `Token is INVALID or expired. ${tokenInfo.error?.message ?? "Generate a new permanent System User token in Meta Business Manager → System Users."}`,
        fixUrl: "https://business.facebook.com/settings/system-users",
        fixLabel: "Open System Users → Regenerate Token",
      });

      for (const perm of permissionsToCheck) {
        const hasScope = grantedScopes.includes(perm.name);
        checks.push({
          id: `perm_${perm.name}`,
          label: `Permission: ${perm.label}`,
          status: isTokenValid ? (hasScope ? "pass" : "fail") : "unknown",
          detail: !isTokenValid
            ? "Cannot check — token is invalid."
            : hasScope
              ? `Granted on this token.`
              : `NOT granted on this token. Go to: Meta Business Manager → System Users → your System User → Generate New Token → enable this permission.`,
          fixUrl: "https://business.facebook.com/settings/system-users",
          fixLabel: "Open System Users → Regenerate Token with correct permissions",
        });
      }

      /* Check token app binding */
      const tokenAppId = tokenInfo.app_id;
      if (tokenAppId && tokenAppId !== appId) {
        checks.push({
          id: "token_app_mismatch",
          label: "Token App ID matches META_APP_ID",
          status: "fail",
          detail: `Token was generated for App ID ${tokenAppId}, but META_APP_ID is ${appId}. Regenerate the System User token and select the correct app (${appId}).`,
          fixUrl: "https://business.facebook.com/settings/system-users",
          fixLabel: "Open System Users → Regenerate Token",
        });
      }
    } else {
      for (const perm of permissionsToCheck) {
        checks.push({
          id: `perm_${perm.name}`,
          label: `Permission: ${perm.label}`,
          status: "unknown",
          detail: "No System User token saved yet — save credentials first, then re-run diagnostic to verify permission scopes.",
        });
      }
    }

    /* Check 8: OAuth Redirect URIs (informational — can't verify via API) */
    checks.push({
      id: "oauth_redirect",
      label: "OAuth Redirect URIs (manual check required)",
      status: "warn",
      detail: "Cannot auto-verify. Ensure these are listed under: Meta App → Facebook Login for Business → Settings → Valid OAuth Redirect URIs:\n• https://admin.khanbabadryfruits.com\n• https://admin.khanbabadryfruits.com/admin/whatsapp",
      fixUrl: `https://developers.facebook.com/apps/${appId}/fb-login-for-business/settings/`,
      fixLabel: "Open Facebook Login for Business → Settings",
    });

    /* Check 9: Embedded Signup Config ID */
    const configId = process.env.META_CONFIG_ID;
    checks.push({
      id: "config_id",
      label: "META_CONFIG_ID (Embedded Signup Config)",
      status: configId ? "pass" : "warn",
      detail: configId
        ? `META_CONFIG_ID is set: ${configId}. Embedded Signup popup will use this configuration.`
        : "META_CONFIG_ID is not set. Embedded Signup requires a Config ID from: Meta App → WhatsApp → Embedded Signup Configuration. Note: For self-owned WABAs, use Manual API Setup instead.",
      fixUrl: `https://developers.facebook.com/apps/${appId}/whatsapp-business/wa-dev-console/`,
      fixLabel: "Open WhatsApp → Embedded Signup Config",
    });

    const failCount = checks.filter(c => c.status === "fail").length;
    const warnCount = checks.filter(c => c.status === "warn").length;

    return res.json({
      success: true,
      appId,
      appName,
      appStatus,
      checks,
      summary: {
        total: checks.length,
        pass: checks.filter(c => c.status === "pass").length,
        fail: failCount,
        warn: warnCount,
        unknown: checks.filter(c => c.status === "unknown").length,
      },
      mainIssue: appStatus !== "LIVE"
        ? `App is in ${appStatus} mode — this is the primary cause of "Facebook Login is currently unavailable". Switch to LIVE mode in Meta Developer Portal.`
        : failCount > 0
          ? `${failCount} check(s) failed. Fix them to restore full functionality.`
          : "All critical checks passed.",
    });
  } catch (e: any) {
    return res.json({
      success: false,
      error: `Diagnostic failed: ${e.message}`,
      checks,
    });
  }
});

/* ─── Admin: Existing WABA pre-check (before opening signup) ── */
router.get("/admin/whatsapp/meta-existing-waba", adminMiddleware as any, async (req, res) => {
  try {
    const [settings] = await db.select({
      businessAccountId: whatsappSettingsTable.businessAccountId,
      phoneNumberId:     whatsappSettingsTable.phoneNumberId,
      verifiedName:      whatsappSettingsTable.verifiedName,
      accessToken:       whatsappSettingsTable.accessToken,
      connectionMethod:  whatsappSettingsTable.connectionMethod,
      metaStatus:        whatsappSettingsTable.metaStatus,
    }).from(whatsappSettingsTable).limit(1);

    if (!settings?.businessAccountId || !settings?.accessToken) {
      return res.json({ hasExisting: false });
    }

    /* Optionally verify WABA is still valid via Graph API */
    const GV = "v20.0";
    let wabaName: string | null = null;
    let phoneDisplay: string | null = null;
    try {
      const wabaRes = await fetch(
        `https://graph.facebook.com/${GV}/${settings.businessAccountId}?fields=id,name&access_token=${settings.accessToken}`
      );
      const wabaData = await wabaRes.json() as any;
      wabaName = wabaData.name ?? null;

      if (settings.phoneNumberId) {
        const phoneRes = await fetch(
          `https://graph.facebook.com/${GV}/${settings.phoneNumberId}?fields=display_phone_number,verified_name,status&access_token=${settings.accessToken}`
        );
        const phoneData = await phoneRes.json() as any;
        phoneDisplay = phoneData.display_phone_number ?? null;
      }
    } catch { /* non-critical — use DB values */ }

    return res.json({
      hasExisting: true,
      wabaId: settings.businessAccountId,
      wabaName,
      phoneNumberId: settings.phoneNumberId,
      phoneDisplay,
      verifiedName: settings.verifiedName,
      connectionMethod: settings.connectionMethod,
    });
  } catch (e: any) {
    return res.json({ hasExisting: false });
  }
});

/* ─── Resolve WABA + Phone from token (Manual setup helper) ── */
router.post("/admin/whatsapp/resolve-from-token", adminMiddleware, async (req, res) => {
  const { token } = req.body ?? {};
  if (!token || typeof token !== "string") return res.status(400).json({ error: "token required" });
  try {
    const result = await discoverWabaAndPhone(token.trim());
    return res.json({
      success: result.wabaId !== null || result.allWabas.length > 0,
      wabaId: result.wabaId,
      wabaName: result.wabaName,
      phoneId: result.phoneId,
      phoneDetails: result.phoneDetails,
      allWabas: result.allWabas,
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message ?? "Discovery failed" });
  }
});

/* ─── Helper: auto-discover WABA + phone via Graph API chain ── */
async function discoverWabaAndPhone(token: string): Promise<{
  wabaId: string | null;
  wabaName: string | null;
  phoneId: string | null;
  phoneDetails: Record<string, any>;
  allWabas: Array<{ id: string; name: string; phones: any[] }>;
}> {
  const GV = "v20.0";
  const gFetch = (url: string) => fetch(url).then(r => r.json()) as Promise<any>;

  /* Step A: get user ID */
  const meData = await gFetch(`https://graph.facebook.com/${GV}/me?fields=id,name&access_token=${token}`);
  const userId: string = meData.id ?? "me";

  /* Step B: get all business portfolios this user has access to */
  const bizData = await gFetch(
    `https://graph.facebook.com/${GV}/${userId}/businesses?fields=id,name&limit=25&access_token=${token}`
  );
  const businesses: any[] = bizData.data ?? [];

  /* Step C: for each business, fetch BOTH owned AND client WABAs.
     Existing WABAs attached to an app may appear as "client" accounts,
     not "owned" ones — so we must check both edges. */
  const seenIds = new Set<string>();
  const allWabas: Array<{ id: string; name: string; phones: any[] }> = [];

  const addWaba = async (waba: any, bizName: string) => {
    if (seenIds.has(waba.id)) return;
    seenIds.add(waba.id);
    const phonesData = await gFetch(
      `https://graph.facebook.com/${GV}/${waba.id}/phone_numbers?fields=id,verified_name,display_phone_number,quality_rating,status&access_token=${token}`
    );
    allWabas.push({ id: waba.id, name: waba.name ?? bizName, phones: phonesData.data ?? [] });
  };

  for (const biz of businesses) {
    /* Owned WABAs */
    const ownedData = await gFetch(
      `https://graph.facebook.com/${GV}/${biz.id}/owned_whatsapp_business_accounts?fields=id,name&access_token=${token}`
    );
    for (const waba of (ownedData.data ?? [])) await addWaba(waba, biz.name);

    /* Client WABAs — existing accounts attached/shared via the app */
    const clientData = await gFetch(
      `https://graph.facebook.com/${GV}/${biz.id}/client_whatsapp_business_accounts?fields=id,name&access_token=${token}`
    );
    for (const waba of (clientData.data ?? [])) await addWaba(waba, biz.name);
  }

  /* Step D: also check WABAs accessible directly via the user token
     (covers accounts not linked to a business portfolio) */
  const directData = await gFetch(
    `https://graph.facebook.com/${GV}/me/whatsapp_business_accounts?fields=id,name&access_token=${token}`
  ).catch(() => ({ data: [] }));
  for (const waba of (directData.data ?? [])) await addWaba(waba, waba.name ?? "");

  /* Pick: prefer WABA with phones; among those, prefer ones with an active/connected status */
  const withPhones = allWabas.filter(w => w.phones.length > 0);
  const chosen = withPhones.find(w => w.phones.some((p: any) => p.status === "CONNECTED"))
    ?? withPhones[0]
    ?? allWabas[0]
    ?? null;

  if (!chosen) return { wabaId: null, wabaName: null, phoneId: null, phoneDetails: {}, allWabas };

  /* Prefer an already-CONNECTED phone */
  const phone = chosen.phones.find((p: any) => p.status === "CONNECTED") ?? chosen.phones[0] ?? {};
  return {
    wabaId: chosen.id,
    wabaName: chosen.name,
    phoneId: phone.id ?? null,
    phoneDetails: phone,
    allWabas,
  };
}

/* ─── Admin: Meta OAuth Token Exchange (Embedded Signup) ── */
router.post("/admin/whatsapp/meta-exchange-token", adminMiddleware as any, async (req, res) => {
  try {
    const { code, wabaId, phoneNumberId } = req.body as { code: string; wabaId?: string; phoneNumberId?: string };
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      return res.status(400).json({ success: false, error: "META_APP_ID and META_APP_SECRET are not configured as environment secrets." });
    }
    if (!code) return res.status(400).json({ success: false, error: "code is required" });

    const GV = "v20.0";

    /* 1. Exchange auth code → short-lived user token */
    const tokenRes = await fetch(
      `https://graph.facebook.com/${GV}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`
    );
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) {
      req.log?.error({ tokenData }, "Meta code exchange failed");
      return res.json({ success: false, error: tokenData.error?.message ?? "Token exchange failed — code may have expired. Please try connecting again." });
    }
    const userToken: string = tokenData.access_token;

    /* 2. Extend → long-lived user token (~60 days) */
    const llRes = await fetch(
      `https://graph.facebook.com/${GV}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(userToken)}`
    );
    const llData = await llRes.json() as any;
    const longLivedToken: string = llData.access_token ?? userToken;

    /* 3. Resolve WABA + phone using correct Graph API chain */
    let resolvedWabaId: string | undefined | null = wabaId ?? null;
    let resolvedPhoneId: string | undefined | null = phoneNumberId ?? null;
    let phoneDetails: Record<string, any> = {};
    let businessName: string | null = null;

    /* If embedded signup provided IDs, fetch their details directly */
    if (resolvedPhoneId) {
      const phoneRes = await fetch(
        `https://graph.facebook.com/${GV}/${resolvedPhoneId}?fields=id,verified_name,display_phone_number,quality_rating,status&access_token=${longLivedToken}`
      );
      phoneDetails = await phoneRes.json() as any;
    }

    if (resolvedWabaId) {
      const wabaRes = await fetch(
        `https://graph.facebook.com/${GV}/${resolvedWabaId}?fields=id,name&access_token=${longLivedToken}`
      );
      const wabaData = await wabaRes.json() as any;
      businessName = wabaData.name ?? null;
      /* Also get phone if not provided */
      if (!resolvedPhoneId) {
        const phonesRes = await fetch(
          `https://graph.facebook.com/${GV}/${resolvedWabaId}/phone_numbers?fields=id,verified_name,display_phone_number,quality_rating,status&access_token=${longLivedToken}`
        );
        const phonesData = await phonesRes.json() as any;
        phoneDetails = phonesData.data?.[0] ?? {};
        resolvedPhoneId = phoneDetails.id ?? null;
      }
    }

    /* 4. If still not resolved — auto-discover via businesses → owned_whatsapp_business_accounts chain */
    if (!resolvedWabaId || !resolvedPhoneId) {
      req.log?.info("Embedded signup did not provide IDs — running auto-discovery");
      const discovered = await discoverWabaAndPhone(longLivedToken);
      req.log?.info({ discovered: { wabaCount: discovered.allWabas.length, wabaId: discovered.wabaId, phoneId: discovered.phoneId } }, "Auto-discovery result");

      if (!resolvedWabaId && discovered.wabaId) {
        resolvedWabaId = discovered.wabaId;
        businessName = discovered.wabaName;
      }
      if (!resolvedPhoneId && discovered.phoneId) {
        resolvedPhoneId = discovered.phoneId;
        phoneDetails = discovered.phoneDetails;
      }
    }

    /* 5. Persist to DB */
    const [existing] = await db.select({ id: whatsappSettingsTable.id }).from(whatsappSettingsTable).limit(1);
    const savePayload = {
      accessToken: longLivedToken,
      phoneNumberId: resolvedPhoneId ?? null,
      businessAccountId: resolvedWabaId ?? null,
      isActive: true,
      verifiedName: (phoneDetails as any).verified_name ?? null,
      qualityRating: (phoneDetails as any).quality_rating ?? null,
      metaStatus: (phoneDetails as any).status ?? null,
      connectedAt: new Date(),
      connectionMethod: "embedded_signup",
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(whatsappSettingsTable).set(savePayload).where(eq(whatsappSettingsTable.id, existing.id));
    } else {
      await db.insert(whatsappSettingsTable).values(savePayload as any);
    }

    req.log?.info({ wabaId: resolvedWabaId, phoneId: resolvedPhoneId }, "WhatsApp Embedded Signup connected successfully");
    return res.json({
      success: true,
      wabaId: resolvedWabaId,
      phoneNumberId: resolvedPhoneId,
      displayPhone: (phoneDetails as any).display_phone_number ?? null,
      verifiedName: (phoneDetails as any).verified_name ?? null,
      businessName,
      qualityRating: (phoneDetails as any).quality_rating ?? null,
      status: (phoneDetails as any).status ?? null,
    });
  } catch (e: any) {
    req.log?.error(e, "Meta token exchange error");
    return res.status(500).json({ success: false, error: e.message });
  }
});

/* ─── Admin: Test API Connection ─────────────────────── */
router.post("/admin/whatsapp/test-connection", adminMiddleware as any, async (req, res) => {
  try {
    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    if (!settings?.accessToken || !settings.phoneNumberId) {
      return res.json({ success: false, status: "not_configured", message: "Access token and Phone Number ID are required" });
    }
    const r = await fetch(`https://graph.facebook.com/v18.0/${settings.phoneNumberId}`, {
      headers: { Authorization: `Bearer ${settings.accessToken}` },
    });
    const data = await r.json() as any;
    if (r.ok && data.id) {
      return res.json({ success: true, status: "connected", message: `Connected — ${data.display_phone_number ?? data.id}`, data });
    }
    const errMsg = data.error?.message ?? `HTTP ${r.status}`;
    const errType = data.error?.code === 190 ? "invalid_token"
      : data.error?.code === 100 ? "invalid_phone_id"
      : data.error?.code === 80007 ? "rate_limit"
      : "api_error";
    return res.json({ success: false, status: errType, message: errMsg, data });
  } catch (e: any) {
    return res.json({ success: false, status: "network_error", message: e.message });
  }
});

/* ─── Admin: Campaigns (GET list) ────────────────────── */
router.get("/admin/whatsapp/campaigns", adminMiddleware as any, async (req, res) => {
  try {
    const campaigns = await db.select().from(whatsappCampaignsTable).orderBy(desc(whatsappCampaignsTable.createdAt));
    return res.json(campaigns);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Campaigns (POST create) ─────────────────── */
router.post("/admin/whatsapp/campaigns", adminMiddleware as any, async (req, res) => {
  try {
    const { name, type, messageBody, templateId, templateParams, audience, audienceFilter, customPhones, rateLimitDelay, maxDelay, frequencyCapHours } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    if (!templateId && !messageBody) return res.status(400).json({ error: "Either templateId or messageBody is required" });
    const [campaign] = await db.insert(whatsappCampaignsTable).values({
      name, type: type ?? "custom",
      messageBody: messageBody ?? "",
      templateId: templateId ?? null,
      templateParams: templateParams ? JSON.stringify(templateParams) : null,
      audience: audience ?? "all_customers",
      audienceFilter: audienceFilter ?? null,
      customPhones: customPhones ?? null,
      rateLimitDelay: rateLimitDelay ?? 2,
      maxDelay: maxDelay ?? 5,
      frequencyCapHours: frequencyCapHours ?? 24,
      status: "draft",
    }).returning();
    return res.json(campaign);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Audience Count Estimator ──────────────── */
router.get("/admin/whatsapp/campaigns/audience-count", adminMiddleware as any, async (req, res) => {
  try {
    const { audience, filter } = req.query as { audience?: string; filter?: string };
    let count = 0;
    if (audience === "all_customers") {
      const r = await db.execute(sql`SELECT COUNT(DISTINCT (shipping_address->>'phone')) AS cnt FROM orders WHERE shipping_address->>'phone' IS NOT NULL`) as any;
      count = Number((r.rows ?? r)[0]?.cnt ?? 0);
    } else if (audience === "by_order_status" && filter) {
      const r = await db.execute(sql`SELECT COUNT(DISTINCT (shipping_address->>'phone')) AS cnt FROM orders WHERE status::text = ${filter} AND shipping_address->>'phone' IS NOT NULL`) as any;
      count = Number((r.rows ?? r)[0]?.cnt ?? 0);
    } else if (audience === "chat_leads") {
      const r = await db.execute(sql`SELECT COUNT(*) AS cnt FROM chat_leads WHERE phone IS NOT NULL`) as any;
      count = Number((r.rows ?? r)[0]?.cnt ?? 0);
    }
    return res.json({ count });
  } catch { return res.json({ count: 0 }); }
});

/* ─── Admin: Campaign Duplicate ─────────────────────── */
router.post("/admin/whatsapp/campaigns/:id/duplicate", adminMiddleware as any, async (req, res) => {
  try {
    const [src] = await db.select().from(whatsappCampaignsTable)
      .where(eq(whatsappCampaignsTable.id, Number(req.params.id))).limit(1);
    if (!src) return res.status(404).json({ error: "Campaign not found" });
    const [dup] = await db.insert(whatsappCampaignsTable).values({
      name: `${src.name} (copy)`,
      type: src.type, messageBody: src.messageBody,
      templateId: src.templateId, templateParams: src.templateParams,
      headerImageUrl: src.headerImageUrl,
      audience: src.audience, audienceFilter: src.audienceFilter, customPhones: src.customPhones,
      rateLimitDelay: src.rateLimitDelay, maxDelay: src.maxDelay, frequencyCapHours: src.frequencyCapHours,
      tags: src.tags, status: "draft",
      recipientCount: 0, sentCount: 0, failedCount: 0, deliveredCount: 0, readCount: 0, skippedCount: 0,
    }).returning();
    return res.json(dup);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Campaigns (DELETE) ─────────────────────── */
router.delete("/admin/whatsapp/campaigns/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(whatsappCampaignsTable).where(eq(whatsappCampaignsTable.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Campaign Send ───────────────────────────── */
router.post("/admin/whatsapp/campaigns/:id/send", adminMiddleware as any, async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const [campaign] = await db.select().from(whatsappCampaignsTable).where(eq(whatsappCampaignsTable.id, campaignId));
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status === "sending") return res.status(400).json({ error: "Campaign is already sending" });

    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    if (!settings?.accessToken || !settings.phoneNumberId) return res.status(400).json({ error: "WhatsApp not configured" });

    // Build recipient list
    let phones: Array<{ phone: string; name?: string }> = [];
    if (campaign.audience === "all_customers") {
      const rows = await db.select({
        phone: sql<string>`(shipping_address->>'phone')::text`,
        name:  sql<string>`(shipping_address->>'name')::text`,
      }).from(ordersTable);
      const seen = new Set<string>();
      for (const r of rows) {
        if (r.phone && !seen.has(r.phone)) { seen.add(r.phone); phones.push({ phone: r.phone, name: r.name ?? undefined }); }
      }
    } else if (campaign.audience === "by_order_status" && campaign.audienceFilter) {
      const rows = await db.select({
        phone: sql<string>`(shipping_address->>'phone')::text`,
        name:  sql<string>`(shipping_address->>'name')::text`,
      }).from(ordersTable).where(sql`status::text = ${campaign.audienceFilter}`);
      const seen = new Set<string>();
      for (const r of rows) {
        if (r.phone && !seen.has(r.phone)) { seen.add(r.phone); phones.push({ phone: r.phone, name: r.name ?? undefined }); }
      }
    } else if (campaign.audience === "custom_phones" && campaign.customPhones) {
      phones = campaign.customPhones.split("\n").map((p: string) => p.trim()).filter(Boolean).map((p: string) => ({ phone: p }));
    } else if (campaign.audience === "chat_leads") {
      const leadsR = await db.execute(sql`SELECT phone, full_name AS name FROM chat_leads WHERE phone IS NOT NULL`) as any;
      const seen = new Set<string>();
      for (const r of (leadsR.rows ?? leadsR) as any[]) {
        if (r.phone && !seen.has(r.phone)) { seen.add(r.phone); phones.push({ phone: r.phone, name: r.name ?? undefined }); }
      }
    }

    await db.update(whatsappCampaignsTable).set({
      recipientCount: phones.length,
      status: "sending",
      sentCount: 0, failedCount: 0, skippedCount: 0, deliveredCount: 0, readCount: 0,
    }).where(eq(whatsappCampaignsTable.id, campaignId));

    const minDelay = Math.max(1, campaign.rateLimitDelay ?? 2) * 1000;
    const maxDelay = Math.max(minDelay, (campaign.maxDelay ?? 5) * 1000);
    const freqCapMs = (campaign.frequencyCapHours ?? 24) * 3600 * 1000;
    const templateName = campaign.templateId ?? null;
    const templateParams: string[] = campaign.templateParams ? JSON.parse(campaign.templateParams) : [];

    // Background send
    (async () => {
      let sent = 0; let failed = 0; let skipped = 0;
      for (const recipient of phones) {
        // ── Pause/cancel check: re-read status from DB every recipient ──
        const [currentCampaign] = await db.select({ status: whatsappCampaignsTable.status })
          .from(whatsappCampaignsTable).where(eq(whatsappCampaignsTable.id, campaignId)).limit(1);
        if (currentCampaign?.status === "paused") {
          // Wait until resumed or cancelled
          let waited = 0;
          while (waited < 7200) { // max 2 hours wait
            await new Promise(r => setTimeout(r, 10000)); waited += 10;
            const [check] = await db.select({ status: whatsappCampaignsTable.status })
              .from(whatsappCampaignsTable).where(eq(whatsappCampaignsTable.id, campaignId)).limit(1);
            if (check?.status === "sending") break;
            if (check?.status === "cancelled") {
              await db.update(whatsappCampaignsTable)
                .set({ sentCount: sent, failedCount: failed, skippedCount: skipped })
                .where(eq(whatsappCampaignsTable.id, campaignId)).catch(() => {});
              return;
            }
          }
        }
        if (currentCampaign?.status === "cancelled") {
          await db.update(whatsappCampaignsTable)
            .set({ sentCount: sent, failedCount: failed, skippedCount: skipped })
            .where(eq(whatsappCampaignsTable.id, campaignId)).catch(() => {});
          return;
        }

        try {
          const normalizedPhone = recipient.phone.startsWith("92")
            ? recipient.phone
            : "92" + recipient.phone.replace(/^0/, "");

          // ── Frequency cap: skip if sent to this phone recently ──
          if (freqCapMs > 0) {
            const cutoff = new Date(Date.now() - freqCapMs).toISOString();
            const [recent] = await db.select({ id: whatsappLogsTable.id })
              .from(whatsappLogsTable)
              .where(sql`phone = ${normalizedPhone} AND template_name LIKE 'campaign:%' AND created_at > ${cutoff}`)
              .limit(1);
            if (recent) { skipped++; continue; }
          }

          let ok = false;
          if (templateName) {
            // Template-based send (Meta policy compliant)
            const [tpl] = await db.select().from(whatsappTemplatesTable)
              .where(eq(whatsappTemplatesTable.name, templateName)).limit(1);
            if (tpl) {
              const components: any[] = [];
              if (templateParams.length > 0) {
                components.push({
                  type: "body",
                  parameters: templateParams.map(v => ({ type: "text", text: v })),
                });
              }
              const waRes = await fetch(`https://graph.facebook.com/v18.0/${settings.phoneNumberId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
                body: JSON.stringify({
                  messaging_product: "whatsapp", recipient_type: "individual", to: normalizedPhone,
                  type: "template",
                  template: { name: tpl.name, language: { code: tpl.language }, ...(components.length > 0 ? { components } : {}) },
                }),
              });
              const waData = await waRes.json() as any;
              ok = waRes.ok && !!waData?.messages?.[0]?.id;
              await db.insert(whatsappLogsTable).values({
                phone: normalizedPhone, templateName: `campaign:${campaignId}`,
                message: tpl.messageBody, status: ok ? "sent" : "failed",
                messageId: waData?.messages?.[0]?.id ?? null,
                response: JSON.stringify(waData),
              }).catch(() => {});
            }
          } else {
            // Free-text fallback (for existing campaigns without template)
            const msg = (campaign.messageBody ?? "")
              .replace(/\{customer_name\}/g, recipient.name ?? "Valued Customer")
              .replace(/\{name\}/g, recipient.name ?? "Valued Customer");
            ok = await sendWhatsAppMessage({ phone: normalizedPhone, message: msg, templateName: `campaign:${campaignId}` });
          }

          if (ok) sent++; else failed++;
        } catch { failed++; }

        // Incremental progress update every 10 messages
        if ((sent + failed + skipped) % 10 === 0) {
          await db.update(whatsappCampaignsTable)
            .set({ sentCount: sent, failedCount: failed, skippedCount: skipped })
            .where(eq(whatsappCampaignsTable.id, campaignId)).catch(() => {});
        }

        // Random delay between min and max
        const delay = minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
        await new Promise(r => setTimeout(r, delay));
      }
      await db.update(whatsappCampaignsTable)
        .set({ status: "sent", sentCount: sent, failedCount: failed, skippedCount: skipped, sentAt: new Date() })
        .where(eq(whatsappCampaignsTable.id, campaignId));
    })();

    return res.json({ success: true, message: `Sending to ${phones.length} recipients in background`, total: phones.length });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Send WhatsApp for a Specific Order ──────── */
router.post("/admin/whatsapp/send-order/:orderId", adminMiddleware as any, async (req, res) => {
  try {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, Number(req.params.orderId)));
    if (!order) return res.status(404).json({ error: "Order not found" });
    const addr  = order.shippingAddress as any;
    const phone = addr?.phone;
    const name  = addr?.name ?? "Customer";
    if (!phone) return res.status(400).json({ error: "Order has no phone number" });
    const addressStr = [addr?.address, addr?.city, addr?.province].filter(Boolean).join(", ") || addr?.city || "Pakistan";
    const { sendOrderConfirmation } = await import("../lib/whatsapp.js");
    const result = await (sendOrderConfirmation as any)({
      phone, customerName: name, orderNumber: order.orderNumber,
      total: String(order.total),
      address: addressStr,
    });
    return res.json({ success: !!result?.success, message: result?.success ? "WhatsApp confirmation sent!" : (result?.error ?? "Send failed — check your WhatsApp settings") });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Seed Default Order Confirmation Template ─── */
router.post("/admin/whatsapp/templates/seed-order-confirmation", adminMiddleware as any, async (req, res) => {
  try {
    const existing = await db.select({ id: whatsappTemplatesTable.id })
      .from(whatsappTemplatesTable)
      .where(eq(whatsappTemplatesTable.triggerEvent, "order_confirmation"))
      .limit(1);

    if (existing.length > 0) {
      return res.json({ success: true, alreadyExists: true, message: "Order confirmation template already exists" });
    }

    const [tpl] = await db.insert(whatsappTemplatesTable).values({
      name: "order_confirmation",
      messageBody:
        "Hello {{1}}, 👋\nThank you for your order with KDF NUTS 🥜\n\n🧾 Order ID: {{2}}\n💰 Total Amount: {{3}}\n📍 Delivery Address: {{4}}\n\nYour order has been successfully received and is now being processed.\n\nWe will notify you once your order is shipped 🚚\n\nThank you for shopping with us ❤️",
      category: "UTILITY",
      language: "en_US",
      paramCount: 4,
      triggerEvent: "order_confirmation",
      approvalStatus: "draft",
      submittedToMeta: false,
      isActive: true,
    }).returning();

    return res.json({ success: true, template: tpl, message: "Order confirmation template created! Go to Templates tab to submit it to Meta." });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Seed All Standard Event Templates ──────────── */
router.post("/admin/whatsapp/templates/seed-all-templates", adminMiddleware as any, async (req, res) => {
  try {
    const DEFAULTS: Array<{
      name: string; messageBody: string; paramCount: number; triggerEvent: string; category: string;
    }> = [
      {
        name: "order_confirmation",
        messageBody: "Assalam o Alaikum {{1}},\n\nThank you for your order with Khan Dry Fruits. We have received order {{2}}.\n\nOrder total: {{3}}\nPayment: {{4}}\n\nYour order is being prepared. We will notify you on WhatsApp when it ships.\n\nReply to this message for any assistance.",
        paramCount: 4, triggerEvent: "order_confirmation", category: "UTILITY",
      },
      {
        name: "order_processing",
        messageBody: "📦 Hello! Your KDF NUTS order *#{{1}}* has been packed and is ready for dispatch.\n\nWe'll notify you as soon as it ships. Thank you for your patience! 🙏",
        paramCount: 1, triggerEvent: "order_processing", category: "UTILITY",
      },
      {
        name: "order_shipped",
        messageBody: "🚚 Great news! Your KDF NUTS order *#{{1}}* has been shipped!\n\n🔍 Tracking ID: {{2}}\n\nExpected delivery in 2–3 business days. We'll keep you updated! 📦",
        paramCount: 2, triggerEvent: "order_shipped", category: "UTILITY",
      },
      {
        name: "order_out_for_delivery",
        messageBody: "🛵 Your KDF NUTS order *#{{1}}* is *out for delivery* today!\n\nPlease be available to receive your package. Our rider will contact you shortly. 🎉",
        paramCount: 1, triggerEvent: "order_out_for_delivery", category: "UTILITY",
      },
      {
        name: "order_delivered",
        messageBody: "✅ Your KDF NUTS order *#{{1}}* has been *delivered*! We hope you love your products 🥜\n\nEnjoy and thank you for shopping with us ❤️\n\nRate your experience by replying to this message!",
        paramCount: 1, triggerEvent: "order_delivered", category: "UTILITY",
      },
      {
        name: "order_cancelled",
        messageBody: "❌ Your KDF NUTS order *#{{1}}* has been *cancelled*.\n\nIf you have any questions, please reply to this message or contact us on WhatsApp. We're happy to help! 🙏",
        paramCount: 1, triggerEvent: "order_cancelled", category: "UTILITY",
      },
      {
        name: "cancel_order",
        messageBody: "❌ Your KDF NUTS order *#{{1}}* has been *cancelled*.\n\nReply here if you need help placing a new order. 🙏",
        paramCount: 1, triggerEvent: "cancel_order", category: "UTILITY",
      },
      {
        name: "paid_order_message",
        messageBody: "✅ Payment received for order *#{{1}}* — *{{2}}*.\n\nThank you! Your order is being prepared. 🥜",
        paramCount: 2, triggerEvent: "paid_order_message", category: "UTILITY",
      },
      {
        name: "shipment_return_update",
        messageBody: "↩️ Update for order *#{{1}}*: return/refund is being processed.\n\nOur team will contact you shortly.",
        paramCount: 1, triggerEvent: "shipment_return_update", category: "UTILITY",
      },
      {
        name: "rider_assigned",
        messageBody: "🛵 Your order *#{{1}}* is out for delivery with *{{2}}*.\n\nPlease keep your phone on. Track your order from the link we sent.",
        paramCount: 2, triggerEvent: "rider_assigned", category: "UTILITY",
      },
      {
        name: "abandoned_cart_recovery",
        messageBody: "Hey! 👋 You left something in your KDF NUTS cart 🥜\n\nDon't miss out — your selected premium nuts & dry fruits are waiting for you!\n\n🛒 Complete your order now and enjoy fast delivery across Pakistan.\n\nVisit: https://kdfnuts.com",
        paramCount: 0, triggerEvent: "abandoned_cart_recovery", category: "MARKETING",
      },
    ];

    let created = 0;
    let skipped = 0;
    for (const def of DEFAULTS) {
      const [existing] = await db.select({ id: whatsappTemplatesTable.id })
        .from(whatsappTemplatesTable)
        .where(eq(whatsappTemplatesTable.triggerEvent, def.triggerEvent))
        .limit(1);
      if (existing) { skipped++; continue; }
      await db.insert(whatsappTemplatesTable).values({
        name: def.name,
        messageBody: def.messageBody,
        category: def.category,
        language: "en_US",
        paramCount: def.paramCount,
        triggerEvent: def.triggerEvent,
        approvalStatus: "draft",
        submittedToMeta: false,
        isActive: true,
      });
      created++;
    }

    return res.json({
      success: true,
      created,
      skipped,
      message: `${created} template(s) created, ${skipped} already existed. Go to Templates tab to submit them to Meta.`,
    });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Bulk Send WhatsApp to Orders ────────────── */
router.post("/admin/whatsapp/bulk-send", adminMiddleware as any, async (req, res) => {
  try {
    const { orderIds, message } = req.body as { orderIds: number[]; message: string };
    if (!Array.isArray(orderIds) || !message) return res.status(400).json({ error: "orderIds array and message required" });
    const [settings] = await db.select({ delay: whatsappSettingsTable.rateLimitDelaySeconds }).from(whatsappSettingsTable).limit(1);
    const delayMs = Math.max(0, (settings?.delay ?? 2) * 1000);
    res.json({ success: true, message: `Bulk send started for ${orderIds.length} orders` });
    void (async () => {
      for (const orderId of orderIds) {
        try {
          const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
          if (!order) continue;
          const phone = (order.shippingAddress as any)?.phone;
          const name  = (order.shippingAddress as any)?.name ?? "Customer";
          if (!phone) continue;
          const msg = message
            .replace(/\{customer_name\}/g, name)
            .replace(/\{order_number\}/g, order.orderNumber ?? String(orderId));
          await sendWhatsAppMessage({ phone, message: msg });
          if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
        } catch { /* continue */ }
      }
    })();
    return;
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Conversation States ────────────────────── */
router.get("/admin/whatsapp/conversation-states", adminMiddleware as any, async (req, res) => {
  try {
    const rows = await db.select().from(whatsappConversationStatesTable)
      .orderBy(desc(whatsappConversationStatesTable.updatedAt))
      .limit(100);
    return res.json(rows);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.delete("/admin/whatsapp/conversation-states/:phone", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(whatsappConversationStatesTable)
      .where(eq(whatsappConversationStatesTable.phone, decodeURIComponent(req.params.phone)));
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.delete("/admin/whatsapp/conversation-states", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(whatsappConversationStatesTable);
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Public: WhatsApp QR code PNG ──────────────────── */
router.get("/whatsapp/qr", async (req, res) => {
  try {
    const [settings] = await db.select({
      phone: whatsappSettingsTable.chatButtonPhone,
      qrMessage: whatsappSettingsTable.qrMessage,
      qrVersion: whatsappSettingsTable.qrVersion,
    }).from(whatsappSettingsTable).limit(1);

    const rawPhone = settings?.phone ?? "";
    if (!rawPhone) return res.status(404).json({ error: "WhatsApp not configured" });

    // Normalize to international format (Pakistan: 03xx → 923xx)
    let phone = rawPhone.replace(/[^0-9]/g, "");
    if (phone.startsWith("0")) phone = "92" + phone.slice(1);

    const message = settings?.qrMessage ?? "Hello! I want to place an order 🥜";
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    const QRCode = (await import("qrcode")).default;
    const sharp = (await import("sharp")).default;
    const qrSize = 512;

    // High-quality QR: H error correction allows 30% occlusion (for logo)
    const qrBuf: Buffer = await (QRCode as any).toBuffer(waUrl, {
      type: "png",
      width: qrSize,
      margin: 3,
      errorCorrectionLevel: "H",
      color: { dark: "#111111", light: "#FFFFFF" },
    });

    // Center logo overlay — WhatsApp green square with "W"
    const logoSize = Math.round(qrSize * 0.18);
    const pad = Math.round(logoSize * 0.15);
    const inner = logoSize - pad * 2;
    const rOuter = Math.round(logoSize * 0.22);
    const rInner = Math.round(inner * 0.22);
    const fs = Math.round(inner * 0.62);
    const cx = Math.round(logoSize / 2);
    const ty = Math.round(pad + inner * 0.73);
    const logoSvg = `<svg width="${logoSize}" height="${logoSize}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${logoSize}" height="${logoSize}" rx="${rOuter}" ry="${rOuter}" fill="white"/>
      <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${rInner}" ry="${rInner}" fill="#25D366"/>
      <text x="${cx}" y="${ty}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="${fs}" fill="white">W</text>
    </svg>`;

    const logoBuffer = await sharp(Buffer.from(logoSvg)).png().toBuffer();

    const finalBuf = await sharp(qrBuf)
      .composite([{ input: logoBuffer, gravity: "center" }])
      .png()
      .toBuffer();

    // Track scan non-blocking
    db.execute(
      sql`UPDATE whatsapp_settings SET qr_scan_count = COALESCE(qr_scan_count, 0) + 1, qr_last_scanned = NOW() WHERE id = (SELECT id FROM whatsapp_settings LIMIT 1)`
    ).catch(() => {});

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("ETag", `"qr-v${settings?.qrVersion ?? 1}"`);
    return res.send(finalBuf);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: QR settings (GET) ──────────────────────── */
router.get("/admin/whatsapp/qr-settings", adminMiddleware as any, async (req, res) => {
  try {
    const [s] = await db.select({
      phone: whatsappSettingsTable.chatButtonPhone,
      qrMessage: whatsappSettingsTable.qrMessage,
      qrScanCount: whatsappSettingsTable.qrScanCount,
      qrVersion: whatsappSettingsTable.qrVersion,
      qrLastScanned: whatsappSettingsTable.qrLastScanned,
    }).from(whatsappSettingsTable).limit(1);
    return res.json(s ?? {
      phone: null, qrMessage: "Hello! I want to place an order 🥜",
      qrScanCount: 0, qrVersion: 1, qrLastScanned: null,
    });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: QR settings (PUT — save message) ───────── */
router.put("/admin/whatsapp/qr-settings", adminMiddleware as any, async (req, res) => {
  try {
    const { qrMessage } = req.body as { qrMessage?: string };
    const [existing] = await db.select({ id: whatsappSettingsTable.id }).from(whatsappSettingsTable).limit(1);
    if (existing) {
      const [updated] = await db.update(whatsappSettingsTable)
        .set({ qrMessage: qrMessage ?? "Hello! I want to place an order 🥜", updatedAt: new Date() })
        .where(eq(whatsappSettingsTable.id, existing.id))
        .returning({ qrMessage: whatsappSettingsTable.qrMessage, qrVersion: whatsappSettingsTable.qrVersion });
      return res.json(updated);
    }
    return res.status(404).json({ error: "WhatsApp settings not configured yet" });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Regenerate QR (bumps version, busts cache) ─ */
router.post("/admin/whatsapp/qr-settings/regenerate", adminMiddleware as any, async (req, res) => {
  try {
    const [existing] = await db.select({ id: whatsappSettingsTable.id, qrVersion: whatsappSettingsTable.qrVersion })
      .from(whatsappSettingsTable).limit(1);
    if (!existing) return res.status(404).json({ error: "WhatsApp settings not configured yet" });
    const newVersion = (existing.qrVersion ?? 1) + 1;
    await db.update(whatsappSettingsTable)
      .set({ qrVersion: newVersion, updatedAt: new Date() })
      .where(eq(whatsappSettingsTable.id, existing.id));
    return res.json({ success: true, qrVersion: newVersion });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════════
   PHASE 2: WhatsApp Cost & Analytics Dashboard
   GET /admin/wa/cost-stats
   ═══════════════════════════════════════════════════════════════ */
router.get("/admin/wa/cost-stats", adminMiddleware as any, async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days ?? 30), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [overall] = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('sent','delivered','read')) AS total_messages,
        COUNT(*) FILTER (WHERE status IN ('delivered','read')) AS delivered,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE template_name LIKE 'campaign:%') AS marketing,
        COUNT(*) FILTER (WHERE template_name NOT LIKE 'campaign:%' AND template_name != 'incoming') AS utility,
        COUNT(*) FILTER (WHERE template_name = 'incoming') AS service
      FROM whatsapp_logs
      WHERE created_at >= ${since.toISOString()}
        AND status != 'received'
    `) as any;
    const row = (overall.rows ?? overall)[0] ?? {};

    const total = Number(row.total_messages ?? 0);
    const delivered = Number(row.delivered ?? 0);
    const failed = Number(row.failed ?? 0);
    const marketing = Number(row.marketing ?? 0);
    const utility = Number(row.utility ?? 0);
    const service = Number(row.service ?? 0);
    const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

    /* Meta WhatsApp pricing (PKR approx): marketing ~Rs.9/msg, utility ~Rs.2.5/msg, service ~Rs.1.5/msg */
    const estimatedCostPKR = Math.round(marketing * 9 + utility * 2.5 + service * 1.5);
    const estimatedCostUSD = +(estimatedCostPKR / 279).toFixed(2);

    /* Daily trend */
    const dailyR = await db.execute(sql`
      SELECT
        DATE(created_at) AS date,
        COUNT(*) FILTER (WHERE status IN ('sent','delivered','read')) AS sent,
        COUNT(*) FILTER (WHERE status IN ('delivered','read')) AS delivered_cnt,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_cnt
      FROM whatsapp_logs
      WHERE created_at >= ${since.toISOString()} AND status != 'received'
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `) as any;
    const dailyTrend = ((dailyR.rows ?? dailyR) as any[]).map((d: any) => ({
      date: d.date,
      sent: Number(d.sent ?? 0),
      delivered: Number(d.delivered_cnt ?? 0),
      failed: Number(d.failed_cnt ?? 0),
      estimatedCostPKR: Math.round(Number(d.sent ?? 0) * 4),
    }));

    /* By type (template_name prefix) */
    const typeR = await db.execute(sql`
      SELECT
        CASE
          WHEN template_name = 'incoming' THEN 'Incoming'
          WHEN template_name LIKE 'campaign:%' THEN 'Campaign'
          WHEN template_name LIKE 'order_%' THEN 'Order Notification'
          WHEN template_name = 'ai_reply' THEN 'AI Reply'
          WHEN template_name LIKE 'menu_%' OR template_name = 'menu_sent' THEN 'Menu'
          ELSE 'Other'
        END AS type,
        COUNT(*) AS cnt
      FROM whatsapp_logs
      WHERE created_at >= ${since.toISOString()}
      GROUP BY 1
      ORDER BY cnt DESC
    `) as any;
    const byType = ((typeR.rows ?? typeR) as any[]).map((r: any) => ({ type: r.type, count: Number(r.cnt) }));

    /* Campaign performance */
    const campR = await db.execute(sql`
      SELECT
        c.id AS campaign_id,
        c.name,
        c.sent_count AS sent,
        c.delivered_count AS delivered,
        c.failed_count AS failed,
        c.read_count AS reads
      FROM whatsapp_campaigns c
      WHERE c.created_at >= ${since.toISOString()} AND c.status != 'draft'
      ORDER BY c.created_at DESC
      LIMIT 10
    `) as any;
    const campaignPerformance = ((campR.rows ?? campR) as any[]).map((r: any) => ({
      campaignId: r.campaign_id,
      name: r.name,
      sent: Number(r.sent ?? 0),
      delivered: Number(r.delivered ?? 0),
      failed: Number(r.failed ?? 0),
      readCount: Number(r.reads ?? 0),
      deliveryRate: Number(r.sent) > 0 ? Math.round((Number(r.delivered) / Number(r.sent)) * 100) : 0,
    }));

    return res.json({
      totalMessages: total,
      delivered,
      failed,
      deliveryRate,
      estimatedCostPKR,
      estimatedCostUSD,
      marketingConversations: marketing,
      utilityConversations: utility,
      serviceConversations: service,
      byType,
      dailyTrend,
      campaignPerformance,
      days,
    });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Chatbot Performance Analytics ────────────── */
router.get("/admin/wa/analytics/chatbot", adminMiddleware as any, async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days ?? 30), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [summary] = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE template_name = 'ai_reply') AS ai_replies,
        COUNT(*) FILTER (WHERE template_name = 'ai_reply' AND created_at >= NOW() - INTERVAL '1 day') AS ai_replies_today,
        COUNT(*) FILTER (WHERE template_name = 'incoming') AS incoming_total,
        COUNT(*) FILTER (WHERE template_name LIKE 'menu%') AS menu_interactions,
        COUNT(DISTINCT phone) FILTER (WHERE template_name = 'incoming') AS unique_customers,
        COUNT(DISTINCT phone) FILTER (WHERE template_name = 'ai_reply') AS bot_handled_customers
      FROM whatsapp_logs WHERE created_at >= ${since.toISOString()}
    `) as any;
    const row = (summary.rows ?? summary)[0] ?? {};
    const [convStats] = await db.execute(sql`
      SELECT
        COUNT(*) AS total_conversations,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
        COUNT(*) FILTER (WHERE bot_mode = 'human') AS human_mode_count,
        COUNT(*) FILTER (WHERE bot_mode = 'bot') AS bot_mode_count
      FROM wa_conversations
    `) as any;
    const conv = (convStats.rows ?? convStats)[0] ?? {};
    const topFlows = await db.select({ name: waFlowsTable.name, action: waFlowsTable.action, firedCount: waFlowsTable.firedCount, keywords: waFlowsTable.keywords })
      .from(waFlowsTable).orderBy(desc(waFlowsTable.firedCount)).limit(6);
    const dailyR = await db.execute(sql`
      SELECT DATE(created_at) AS date,
        COUNT(*) FILTER (WHERE template_name = 'ai_reply') AS ai_replies,
        COUNT(*) FILTER (WHERE template_name = 'incoming') AS incoming
      FROM whatsapp_logs WHERE created_at >= ${since.toISOString()}
      GROUP BY DATE(created_at) ORDER BY DATE(created_at) ASC
    `) as any;
    const aiReplies = Number(row.ai_replies ?? 0);
    const incoming = Number(row.incoming_total ?? 0);
    const totalConvs = Number(conv.total_conversations ?? 0);
    return res.json({
      aiReplies, aiRepliesToday: Number(row.ai_replies_today ?? 0),
      incomingTotal: incoming, menuInteractions: Number(row.menu_interactions ?? 0),
      uniqueCustomers: Number(row.unique_customers ?? 0), botHandledCustomers: Number(row.bot_handled_customers ?? 0),
      botHandleRate: incoming > 0 ? Math.round((aiReplies / incoming) * 100) : 0,
      totalConversations: totalConvs, resolvedConversations: Number(conv.resolved ?? 0),
      humanModeConversations: Number(conv.human_mode_count ?? 0), botModeConversations: Number(conv.bot_mode_count ?? 0),
      resolutionRate: totalConvs > 0 ? Math.round((Number(conv.resolved ?? 0) / totalConvs) * 100) : 0,
      topFlows: topFlows.map((f: any) => ({ name: f.name, action: f.action, firedCount: f.firedCount, keywords: f.keywords as string[] })),
      dailyTrend: ((dailyR.rows ?? dailyR) as any[]).map((d: any) => ({ date: d.date, aiReplies: Number(d.ai_replies ?? 0), incoming: Number(d.incoming ?? 0) })),
      days,
    });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════════
   PHASE 4: AI Flow Builder — CRUD for wa_flows
   ═══════════════════════════════════════════════════════════════ */
router.get("/admin/wa/flows", adminMiddleware as any, async (req, res) => {
  try {
    const flows = await db.select().from(waFlowsTable).orderBy(desc(waFlowsTable.priority), desc(waFlowsTable.createdAt));
    return res.json(flows);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post("/admin/wa/flows", adminMiddleware as any, async (req, res) => {
  try {
    const { name, description, triggerType, keywords, action, actionData, isEnabled, priority } = req.body;
    if (!name || !action) return res.status(400).json({ error: "name and action are required" });
    const [flow] = await db.insert(waFlowsTable).values({
      name,
      description: description ?? null,
      triggerType: triggerType ?? "keyword",
      keywords: keywords ?? [],
      action,
      actionData: actionData ?? {},
      isEnabled: isEnabled ?? true,
      priority: priority ?? 0,
    }).returning();
    return res.status(201).json(flow);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.put("/admin/wa/flows/:id", adminMiddleware as any, async (req, res) => {
  try {
    const { name, description, triggerType, keywords, action, actionData, isEnabled, priority } = req.body;
    const [flow] = await db.update(waFlowsTable).set({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(triggerType !== undefined && { triggerType }),
      ...(keywords !== undefined && { keywords }),
      ...(action !== undefined && { action }),
      ...(actionData !== undefined && { actionData }),
      ...(isEnabled !== undefined && { isEnabled }),
      ...(priority !== undefined && { priority }),
      updatedAt: new Date(),
    }).where(eq(waFlowsTable.id, Number(req.params.id))).returning();
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    return res.json(flow);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.delete("/admin/wa/flows/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(waFlowsTable).where(eq(waFlowsTable.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.patch("/admin/wa/flows/:id/toggle", adminMiddleware as any, async (req, res) => {
  try {
    const [current] = await db.select({ isEnabled: waFlowsTable.isEnabled }).from(waFlowsTable).where(eq(waFlowsTable.id, Number(req.params.id))).limit(1);
    if (!current) return res.status(404).json({ error: "Flow not found" });
    const [updated] = await db.update(waFlowsTable).set({ isEnabled: !current.isEnabled, updatedAt: new Date() })
      .where(eq(waFlowsTable.id, Number(req.params.id))).returning();
    return res.json(updated);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Test a Flow with a sample message ────────── */
router.post("/admin/wa/flows/:id/test", adminMiddleware as any, async (req, res) => {
  try {
    const [flow] = await db.select().from(waFlowsTable).where(eq(waFlowsTable.id, Number(req.params.id))).limit(1);
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    const msg = String(req.body.message ?? "").toLowerCase().trim();
    const kws = (flow.keywords as string[]) ?? [];
    const matched = kws.length === 0 || kws.some(kw => msg.includes(kw.toLowerCase()));
    const ad = flow.actionData as Record<string, any>;
    const actionLabel: Record<string, string> = {
      ai_reply: "Would reply with AI (OpenAI)",
      send_menu: "Would display the interactive welcome menu",
      send_message: `Would send: "${(ad?.message ?? "(no message set)").slice(0, 120)}"`,
      send_url: `Would share URL: ${ad?.url ?? "(none)"}`,
      send_discount: `Would send discount code: ${ad?.discountCode ?? "(none)"}`,
      track_order: "Would ask for order ID and look up tracking status",
      human_support: "Would hand off conversation to a human agent",
      collect_order_id: "Would prompt customer to type their order ID",
      show_catalog: "Would send top products with buy links",
    };
    return res.json({ matched, flowName: flow.name, action: flow.action, actionDescription: actionLabel[flow.action] ?? flow.action, keywords: kws, message: req.body.message ?? "" });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════════
   Smart Automation Rules — CRUD for wa_automation_rules
   ═══════════════════════════════════════════════════════════════ */
router.get("/admin/wa/automation/stats", adminMiddleware as any, async (req, res) => {
  try {
    const [totals] = await db.execute(sql`
      SELECT
        COUNT(*) AS total_rules,
        COUNT(*) FILTER (WHERE is_active = true) AS active_rules,
        COALESCE(SUM(fired_count), 0) AS total_fired
      FROM wa_automation_rules
    `) as any;
    const row = ((totals.rows ?? totals) as any[])[0] ?? {};

    const [logStats] = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent') AS sent_today,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_today
      FROM wa_automation_logs
      WHERE created_at >= CURRENT_DATE
    `) as any;
    const logRow = ((logStats.rows ?? logStats) as any[])[0] ?? {};

    return res.json({
      totalRules: Number(row.total_rules ?? 0),
      activeRules: Number(row.active_rules ?? 0),
      totalFired: Number(row.total_fired ?? 0),
      sentToday: Number(logRow.sent_today ?? 0),
      failedToday: Number(logRow.failed_today ?? 0),
    });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.get("/admin/wa/automation/logs", adminMiddleware as any, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const logs = await db.execute(sql`
      SELECT l.*, r.name AS rule_name
      FROM wa_automation_logs l
      LEFT JOIN wa_automation_rules r ON r.id = l.rule_id
      ORDER BY l.created_at DESC
      LIMIT ${limit}
    `) as any;
    return res.json(logs.rows ?? logs);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.get("/admin/wa/automation/rules", adminMiddleware as any, async (req, res) => {
  try {
    const rules = await db.select().from(waAutomationRulesTable).orderBy(desc(waAutomationRulesTable.createdAt));
    return res.json(rules);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post("/admin/wa/automation/rules", adminMiddleware as any, async (req, res) => {
  try {
    const { name, triggerType, triggerConfig, messageTemplate, isActive } = req.body;
    if (!name || !triggerType) return res.status(400).json({ error: "name and triggerType are required" });
    const [rule] = await db.insert(waAutomationRulesTable).values({
      name,
      triggerType,
      triggerConfig: triggerConfig ?? {},
      messageTemplate: messageTemplate ?? null,
      isActive: isActive ?? true,
    }).returning();
    return res.status(201).json(rule);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.put("/admin/wa/automation/rules/:id", adminMiddleware as any, async (req, res) => {
  try {
    const { name, triggerType, triggerConfig, messageTemplate, isActive } = req.body;
    const [rule] = await db.update(waAutomationRulesTable).set({
      ...(name !== undefined && { name }),
      ...(triggerType !== undefined && { triggerType }),
      ...(triggerConfig !== undefined && { triggerConfig }),
      ...(messageTemplate !== undefined && { messageTemplate }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: new Date(),
    }).where(eq(waAutomationRulesTable.id, Number(req.params.id))).returning();
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    return res.json(rule);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.delete("/admin/wa/automation/rules/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(waAutomationRulesTable).where(eq(waAutomationRulesTable.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.patch("/admin/wa/automation/rules/:id/toggle", adminMiddleware as any, async (req, res) => {
  try {
    const [current] = await db.select({ isActive: waAutomationRulesTable.isActive }).from(waAutomationRulesTable).where(eq(waAutomationRulesTable.id, Number(req.params.id))).limit(1);
    if (!current) return res.status(404).json({ error: "Rule not found" });
    const [updated] = await db.update(waAutomationRulesTable).set({ isActive: !current.isActive, updatedAt: new Date() })
      .where(eq(waAutomationRulesTable.id, Number(req.params.id))).returning();
    return res.json(updated);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════════
   PHASE 5: Campaign Pause / Resume / Cancel
   ═══════════════════════════════════════════════════════════════ */
router.post("/admin/wa/campaigns/:id/pause", adminMiddleware as any, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [camp] = await db.select({ status: whatsappCampaignsTable.status }).from(whatsappCampaignsTable).where(eq(whatsappCampaignsTable.id, id)).limit(1);
    if (!camp) return res.status(404).json({ error: "Campaign not found" });
    if (!["sending", "draft", "scheduled"].includes(camp.status)) return res.status(400).json({ error: "Campaign cannot be paused in its current state" });
    const [updated] = await db.update(whatsappCampaignsTable)
      .set({ status: "paused", pausedAt: new Date() })
      .where(eq(whatsappCampaignsTable.id, id)).returning();
    return res.json({ success: true, campaign: updated });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post("/admin/wa/campaigns/:id/resume", adminMiddleware as any, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [camp] = await db.select({ status: whatsappCampaignsTable.status }).from(whatsappCampaignsTable).where(eq(whatsappCampaignsTable.id, id)).limit(1);
    if (!camp) return res.status(404).json({ error: "Campaign not found" });
    if (camp.status !== "paused") return res.status(400).json({ error: "Only paused campaigns can be resumed" });
    const [updated] = await db.update(whatsappCampaignsTable)
      .set({ status: "draft", pausedAt: null })
      .where(eq(whatsappCampaignsTable.id, id)).returning();
    return res.json({ success: true, campaign: updated });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post("/admin/wa/campaigns/:id/cancel", adminMiddleware as any, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db.update(whatsappCampaignsTable)
      .set({ status: "cancelled" })
      .where(eq(whatsappCampaignsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Campaign not found" });
    return res.json({ success: true, campaign: updated });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

/* ─── Admin: Schedule Campaign ───────────────────────── */
router.post("/admin/wa/campaigns/:id/schedule", adminMiddleware as any, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { scheduledAt } = req.body;
    if (!scheduledAt) return res.status(400).json({ error: "scheduledAt is required" });
    const [updated] = await db.update(whatsappCampaignsTable)
      .set({ status: "scheduled", scheduledAt: new Date(scheduledAt) })
      .where(eq(whatsappCampaignsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Campaign not found" });
    return res.json({ success: true, campaign: updated });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

export default router;
