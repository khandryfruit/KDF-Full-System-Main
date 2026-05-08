import { Router } from "express";
import { db, whatsappSettingsTable, whatsappTemplatesTable, whatsappLogsTable, chatbotSettingsTable, whatsappCampaignsTable, whatsappConversationStatesTable, waConversationsTable, waMessagesTable } from "@workspace/db";
import { ordersTable, usersTable, productsTable } from "@workspace/db";
import { eq, desc, sql, ilike, or } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import { sendWhatsAppMessage, sendWhatsAppTemplate, sendInteractiveMenu, sendInteractiveButtons, sendCtaUrlMessage, normalizePhone, getConversationState, setConversationState, isGreeting } from "../lib/whatsapp";
import { broadcastSSE } from "../lib/sse";
import OpenAI from "openai";
import { aiSettingsTable } from "@workspace/db";
import crypto from "crypto";
import { logger } from "../lib/logger";

const router = Router();

/* ─── In-memory webhook payload log (last 50) ────────── */
const recentWebhookPayloads: Array<{ ts: string; body: unknown }> = [];

/* ─── Helper: get OpenAI from stored settings ────────── */
async function getOpenAIClient() {
  const [s] = await db.select().from(aiSettingsTable).limit(1);
  if (!s?.openaiApiKey || !s.aiEnabled) {
    throw Object.assign(new Error("AI not configured"), { status: 503 });
  }
  return new OpenAI({ apiKey: s.openaiApiKey, organization: s.openaiOrgId || undefined });
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
function getPublicWebhookUrl(): string {
  // REPLIT_DOMAINS is set in production deployments (comma-separated list)
  const prodDomains = process.env.REPLIT_DOMAINS ?? "";
  const prodPrimary = prodDomains.split(",")[0]?.trim();
  if (prodPrimary) return `https://${prodPrimary}/api/webhooks/whatsapp`;

  // REPLIT_DEV_DOMAIN is the publicly-accessible dev URL for this repl
  const devDomain = process.env.REPLIT_DEV_DOMAIN ?? "";
  if (devDomain) return `https://${devDomain}/api/webhooks/whatsapp`;

  return "";
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
    const expectedToken = settings?.webhookVerifyToken ?? "kdfnuts_webhook_token";

    if (mode === "subscribe" && token === expectedToken) {
      req.log?.info("WhatsApp webhook verified successfully");
      return res.status(200).send(challenge);
    }
    req.log?.warn({ mode, receivedToken: token, expectedToken }, "WhatsApp webhook verification failed");
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

/* ─── Helper: verify Meta webhook HMAC-SHA256 signature ─ */
function verifyMetaWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  try {
    if (!signature.startsWith("sha256=")) return false;
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const received = signature.slice(7);
    if (expected.length !== received.length) return false;
    const result: boolean = crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(received, "hex"),
    );
    return result;
  } catch {
    return false;
  }
}

/* ─── Webhook: incoming message handler ──────────────── */
router.post("/webhooks/whatsapp", async (req, res) => {
  const appSecret = process.env.META_APP_SECRET;
  const signature = req.headers["x-hub-signature-256"] as string | undefined;
  const rawBody = req.rawBody;

  if (!appSecret) {
    req.log?.error("META_APP_SECRET is not configured — rejecting WhatsApp webhook to prevent unauthenticated processing");
    res.sendStatus(403);
    return;
  }

  if (!signature || !rawBody || !verifyMetaWebhookSignature(rawBody, signature, appSecret)) {
    req.log?.warn({ signature: signature ? "present" : "missing" }, "WhatsApp webhook rejected: invalid HMAC signature");
    res.sendStatus(403);
    return;
  }

  res.sendStatus(200);
  try {
    const body = req.body as any;
    recentWebhookPayloads.unshift({ ts: new Date().toISOString(), body });
    if (recentWebhookPayloads.length > 50) recentWebhookPayloads.pop();
    if (body?.object !== "whatsapp_business_account") return;
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

        /* ── Delivery status updates ── */
        for (const s of (value.statuses ?? [])) {
          const deliveryStatus = s.status as string;
          await db.execute(
            sql`UPDATE whatsapp_logs SET delivery_status = ${deliveryStatus}, response = ${JSON.stringify(s)} WHERE message_id = ${s.id}`
          ).catch(() => {});
          /* Also sync status to waMessagesTable */
          await db.execute(
            sql`UPDATE wa_messages SET status = ${deliveryStatus}, updated_at = NOW() WHERE wa_message_id = ${s.id}`
          ).catch(() => {});
          log?.info({ messageId: s.id, deliveryStatus, errors: s.errors }, "WhatsApp delivery status update");

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

        /* ── Incoming messages ── */
        for (const msg of (value.messages ?? [])) {
          const phone = msg.from ?? "unknown";
          const msgId = msg.id as string | undefined;

          /* Extract text — works for plain text AND interactive replies */
          const msgType: string = msg.type ?? "text";
          const listReplyId: string | undefined    = msg.interactive?.list_reply?.id;
          const buttonReplyId: string | undefined  = msg.interactive?.button_reply?.id;
          const interactionId  = listReplyId ?? buttonReplyId;
          const interactionTitle: string | undefined = msg.interactive?.list_reply?.title ?? msg.interactive?.button_reply?.title;

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

          /* Deduplicate */
          if (msgId) {
            const [dup] = await db.select({ id: whatsappLogsTable.id })
              .from(whatsappLogsTable).where(eq(whatsappLogsTable.messageId, msgId)).limit(1);
            if (dup) { log?.info({ msgId }, "Duplicate webhook message, skipping"); continue; }
          }

          /* Log incoming */
          await db.insert(whatsappLogsTable).values({
            phone,
            messageId: msgId ?? null,
            templateName: "incoming",
            message: rawText,
            status: "received",
            response: JSON.stringify(msg),
          }).catch(() => {});

          if (phone === "unknown") continue;

          /* ── Upsert WA Conversation & store message ── */
          const contactName = (value.contacts?.[0]?.profile?.name as string | undefined) ?? null;
          const [waConv] = await db.insert(waConversationsTable).values({
            contactPhone: phone,
            contactName: contactName ?? undefined,
            contactWaId: phone,
            lastMessage: rawText.slice(0, 120),
            lastMessageAt: new Date(),
            unreadCount: 1,
            botMode: "auto",
            status: "open",
          }).onConflictDoUpdate({
            target: waConversationsTable.contactPhone,
            set: {
              contactName: sql`COALESCE(EXCLUDED.contact_name, ${waConversationsTable.contactName})`,
              lastMessage: rawText.slice(0, 120),
              lastMessageAt: new Date(),
              unreadCount: sql`${waConversationsTable.unreadCount} + 1`,
              updatedAt: new Date(),
            },
          }).returning().catch(() => []);

          const waConvId = (waConv as any)?.id;
          if (waConvId) {
            await db.execute(sql`
              INSERT INTO wa_messages (conversation_id, wa_message_id, direction, type, content, media_url, caption, reaction, status, is_bot, created_at)
              VALUES (${waConvId}, ${msgId ?? null}, 'in', ${msgType}, ${rawText}, ${mediaUrl}, ${mediaCaption}, ${reactionEmoji}, 'received', false, NOW())
            `).catch(() => {});
            broadcastSSE("wa_message", { conversationId: waConvId, direction: "in", content: rawText, phone, msgType, mediaUrl, mediaCaption, reactionEmoji });
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

          /* ── Check if conversation is in human or off mode ── */
          if (waConv) {
            const currentBotMode = (waConv as any)?.botMode ?? "auto";
            if (currentBotMode === "human" || currentBotMode === "off") {
              log?.info({ phone, botMode: currentBotMode }, "Bot skipped — human/off mode");
              continue;
            }
          }

          /* Load config (chatbot + WA settings) */
          const [chatbot]  = await db.select().from(chatbotSettingsTable).limit(1);
          const [waSettings] = await db.select().from(whatsappSettingsTable).limit(1);
          if (!waSettings?.isActive) continue;

          /* Get current conversation state */
          const convState = await getConversationState(phone);
          const currentState = convState?.state ?? "idle";

          /* ═══════════════════════════════════════════════
             BRANCH 0: OnDrive Confirmation Detection
             (check BEFORE menu / AI — highest priority)
             ═══════════════════════════════════════════════ */
          try {
            const { processWhatsAppConfirmation } = await import("../lib/ondriveEngine.js");
            const confResult = await processWhatsAppConfirmation({
              phone,
              text: rawText,
              interactionId,
            });
            if (confResult.handled) {
              log?.info({ phone, action: confResult.action, orderId: confResult.orderId }, "OnDrive: confirmation handled");
              continue;
            }
          } catch (confErr) {
            log?.warn(confErr, "OnDrive confirmation check failed (non-fatal)");
          }

          /* ═══════════════════════════════════════════════
             BRANCH 1: Interactive reply (button / list tap)
             ═══════════════════════════════════════════════ */
          if (msgType === "interactive" && interactionId) {
            log?.info({ phone, interactionId, interactionTitle }, "Interactive reply received");

            /* "Main Menu" button — show the menu again */
            if (interactionId === "main_menu") {
              await handleSendMenu(phone, waSettings, chatbot);
              await setConversationState(phone, "menu_shown");
              continue;
            }

            /* ── Menu item handlers ── */
            switch (interactionId) {

              case "shop_products": {
                const websiteUrl = (chatbot as any)?.websiteUrl ?? "https://kdfnuts.com";
                await sendCtaUrlMessage({
                  phone,
                  text: "🛒 *Shop at KDF NUTS* 🥜\n\nBrowse our full range of premium nuts & dry fruits:\n• Almonds, Cashews, Pistachios\n• Walnuts, Pine Nuts, Raisins\n• Mixed Nuts, Snack Packs & more!\n\nTap the button below to shop now 👇",
                  buttonText: "Shop Now",
                  url: websiteUrl,
                  settings: waSettings,
                  templateName: "menu_shop",
                });
                await setConversationState(phone, "idle");
                break;
              }

              case "hot_deals": {
                const hotDealsMsg = (chatbot as any)?.hotDealsMessage
                  ?? "🔥 *Today's Hot Deals at KDF NUTS* 🥜\n\nCheck our latest offers on premium nuts and dry fruits!\n\nVisit our website to see all deals 👇";
                const websiteUrl = (chatbot as any)?.websiteUrl ?? "https://kdfnuts.com";
                await sendCtaUrlMessage({
                  phone,
                  text: hotDealsMsg,
                  buttonText: "See Deals",
                  url: websiteUrl,
                  settings: waSettings,
                  templateName: "menu_hot_deals",
                });
                await setConversationState(phone, "idle");
                break;
              }

              case "get_discount": {
                const discountCode = (chatbot as any)?.discountCode ?? "WELCOME10";
                const discountMsg  = (chatbot as any)?.discountMessage
                  ?? `Here's your exclusive discount code! 🎁\n\n*Code:* ${discountCode}\n*Save:* 10% on your next order\n\nShop now and use the code at checkout 🛒`;
                await sendInteractiveButtons({
                  phone,
                  text: discountMsg,
                  buttons: [
                    { id: "shop_products", title: "🛒 Shop Now" },
                    { id: "main_menu",     title: "🏠 Main Menu" },
                  ],
                  settings: waSettings,
                  templateName: "menu_discount",
                });
                await setConversationState(phone, "idle");
                break;
              }

              case "track_order": {
                await sendWhatsAppMessage({
                  phone,
                  message: "📦 *Track Your Order*\n\nPlease reply with your *Order ID* (e.g. KDF-123456) and I'll look it up for you right away! 🔍",
                  templateName: "menu_track_prompt",
                });
                await setConversationState(phone, "track_order_wait");
                break;
              }

              case "talk_support": {
                await sendInteractiveButtons({
                  phone,
                  text: "💬 *You're now connected to our support team!*\n\nFeel free to type your question and our AI assistant will help you right away. I have access to your order history and can answer most questions instantly.\n\nType your question below 👇",
                  buttons: [
                    { id: "main_menu", title: "🏠 Main Menu" },
                  ],
                  settings: waSettings,
                  templateName: "menu_support",
                });
                /* Switch to AI chat mode */
                await setConversationState(phone, "ai_chat");
                break;
              }

              case "visit_website": {
                const websiteUrl = (chatbot as any)?.websiteUrl ?? "https://kdfnuts.com";
                await sendCtaUrlMessage({
                  phone,
                  text: "🌐 *Visit KDF NUTS Website*\n\nShop our full collection of premium nuts and dry fruits online. Fast delivery across Pakistan! 🚚",
                  buttonText: "Visit Website",
                  url: websiteUrl,
                  settings: waSettings,
                  templateName: "menu_website",
                });
                await setConversationState(phone, "idle");
                break;
              }

              case "track_again": {
                await sendWhatsAppMessage({
                  phone,
                  message: "📦 Please reply with another *Order ID* to track it:",
                  templateName: "menu_track_prompt",
                });
                await setConversationState(phone, "track_order_wait");
                break;
              }

              default: {
                /* Unknown interaction — show menu */
                await handleSendMenu(phone, waSettings, chatbot);
                await setConversationState(phone, "menu_shown");
              }
            }
            continue; /* Skip AI processing for interactive messages */
          }

          /* ═══════════════════════════════════════════════
             BRANCH 2: Awaiting order number (Track Order)
             ═══════════════════════════════════════════════ */
          if (currentState === "track_order_wait" && msgType === "text" && msg.text?.body) {
            const inputText = msg.text.body.trim();
            await handleTrackOrder(phone, inputText, waSettings);
            await setConversationState(phone, "idle");
            continue;
          }

          /* ═══════════════════════════════════════════════
             BRANCH 3: Text message — greeting / AI / menu
             ═══════════════════════════════════════════════ */
          if (msgType !== "text" || !msg.text?.body) continue;
          const textBody = msg.text.body.trim();

          /* Reset to idle if user says "menu" at any time */
          const isMenuKeyword = /^\s*(menu|main menu|back|home)\s*$/i.test(textBody);
          if (isMenuKeyword && (chatbot as any)?.menuEnabled) {
            await handleSendMenu(phone, waSettings, chatbot);
            await setConversationState(phone, "menu_shown");
            continue;
          }

          /* In ai_chat state — go straight to AI (skip menu check) */
          if (currentState === "ai_chat") {
            await handleAiReply({ phone, textBody, chatbot, waSettings, log });
            continue;
          }

          /* ── Product catalog intent check (before greeting/AI) ── */
          if (chatbot?.isEnabled && (chatbot as any)?.catalogEnabled) {
            const catalogMatched = await handleProductCatalog({ phone, textBody, chatbot, waSettings, log });
            if (catalogMatched) continue;
          }

          /* Greeting → send welcome menu (if menu enabled) */
          if ((chatbot as any)?.menuEnabled && isGreeting(textBody, (chatbot as any)?.menuGreetingKeywords)) {
            await handleSendMenu(phone, waSettings, chatbot);
            await setConversationState(phone, "menu_shown");
            continue;
          }

          /* AI chatbot fallback */
          if (chatbot?.isEnabled) {
            await handleAiReply({ phone, textBody, chatbot, waSettings, log });
          }
        }
      }
    }
  } catch (err) {
    log?.error(err, "Webhook event processing error");
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
    const greeting = customerName
      ? `Hello ${customerName.split(" ")[0]}! 👋\n\nWelcome to *KDF NUTS* 🥜 — Pakistan's favourite premium nuts store.\n\nHow can we help you today?`
      : `Hello! 👋\n\nWelcome to *KDF NUTS* 🥜 — Pakistan's favourite premium nuts store.\n\nHow can we help you today?`;

    await sendInteractiveMenu({ phone, greeting, settings: waSettings });
  } catch (err) {
    /* Fallback to text menu if interactive fails */
    await sendWhatsAppMessage({
      phone,
      message: `Welcome to *KDF NUTS* 🥜\n\nReply with a number:\n1️⃣ Shop Products\n2️⃣ Hot Deals\n3️⃣ Get Discount\n4️⃣ Track Order\n5️⃣ Talk to Support\n6️⃣ Visit Website`,
      templateName: "menu_fallback",
    });
  }
}

/* ─── Helper: Track Order by order number/phone ──────── */
async function handleTrackOrder(phone: string, input: string, waSettings: any): Promise<void> {
  try {
    const normalizedPhone = normalizePhone(phone);
    const altPhone = normalizedPhone.startsWith("92") ? "0" + normalizedPhone.slice(2) : phone;

    /* Try to find order by number OR by phone */
    const cleanInput = input.replace(/^kdf[-\s]?/i, "").toUpperCase().trim();
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

    if (!order) {
      await sendInteractiveButtons({
        phone,
        text: `❌ I couldn't find an order matching *"${input}"*.\n\nPlease check the order ID and try again, or browse our store 🛒`,
        buttons: [
          { id: "track_again",  title: "🔄 Try Again" },
          { id: "talk_support", title: "💬 Support" },
          { id: "main_menu",    title: "🏠 Main Menu" },
        ],
        settings: waSettings,
        templateName: "menu_track_not_found",
      });
      return;
    }

    const STATUS_EMOJI: Record<string, string> = {
      pending:          "⏳ Pending",
      processing:       "🔧 Processing",
      shipped:          "🚚 Shipped",
      out_for_delivery: "🛵 Out for Delivery",
      delivered:        "✅ Delivered",
      cancelled:        "❌ Cancelled",
    };

    const statusLabel = STATUS_EMOJI[order.status ?? ""] ?? `📦 ${order.status}`;
    const trackingLine = order.trackingId ? `\n🔍 *Tracking ID:* ${order.trackingId}` : "";
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
}): Promise<boolean> {
  const { phone, textBody, chatbot, waSettings, log } = opts;
  try {
    /* ── Detect product intent keywords ── */
    const PRODUCT_KEYWORDS = [
      "product", "products", "item", "items", "almond", "almonds", "cashew", "cashews",
      "pistachio", "pistachios", "walnut", "walnuts", "peanut", "peanuts", "raisin", "raisins",
      "pine nut", "pine nuts", "dried", "dry fruit", "dry fruits", "nut", "nuts", "makhana",
      "anjeer", "fig", "figs", "dates", "khajoor", "apricot", "khumani", "mix", "mixed",
      "gift", "pack", "bundle", "snack", "snacks", "kaju", "badam", "pista", "akhrot",
      "munakka", "kishmish", "price", "rate", "kitna", "cost", "how much", "cheap", "budget",
      "best seller", "bestseller", "popular", "sale", "discount", "offer", "buy", "order",
      "purchase", "shop", "shopping", "catalog", "catalogue", "list", "kya hai", "kya milta",
    ];
    const lowerText = textBody.toLowerCase();
    const isProductQuery = PRODUCT_KEYWORDS.some(kw => lowerText.includes(kw));
    if (!isProductQuery) return false;

    /* ── Search products: Shopify first, then custom DB ── */
    const maxProducts = Math.min((chatbot as any)?.catalogMaxProducts ?? 3, 5);

    /* Extract search term from text — strip common filler words */
    const searchTerm = textBody
      .toLowerCase()
      .replace(/\b(what|is|are|do|you|have|tell|me|about|show|your|the|a|an|any|i|want|need|looking|for|price|of|rate|kitna|kya|hai|milta|chahiye|mujhe|ap|aap|please|pls)\b/g, " ")
      .replace(/\s+/g, " ").trim()
      .slice(0, 40);

    let products: Array<{ name: string; price: string; description: string | null; imageUrl: string | null; productUrl: string }> = [];

    /* Try custom DB first */
    try {
      const websiteUrl = (chatbot as any)?.websiteUrl ?? "https://kdfnuts.com";
      const dbProducts = await db.select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        description: productsTable.description,
        images: productsTable.images,
        slug: productsTable.slug,
        stock: productsTable.stock,
        featured: productsTable.featured,
      }).from(productsTable)
        .where(
          or(
            searchTerm.length > 2 ? ilike(productsTable.name, `%${searchTerm}%`) : undefined,
            searchTerm.length > 2 ? ilike(productsTable.description, `%${searchTerm}%`) : undefined,
          ) as any
        )
        .limit(maxProducts * 2);

      /* If no keyword match, fall back to featured/in-stock */
      const source = dbProducts.filter(p => p.stock > 0);
      const finalSource = source.length > 0 ? source : await db.select({
        id: productsTable.id, name: productsTable.name, price: productsTable.price,
        description: productsTable.description, images: productsTable.images, slug: productsTable.slug,
        stock: productsTable.stock, featured: productsTable.featured,
      }).from(productsTable)
        .where(sql`active = true AND stock > 0`)
        .orderBy(desc(productsTable.featured))
        .limit(maxProducts);

      products = finalSource.slice(0, maxProducts).map(p => ({
        name: p.name,
        price: `Rs. ${parseFloat(String(p.price)).toLocaleString("en-PK")}`,
        description: p.description?.slice(0, 80) ?? null,
        imageUrl: (p.images as string[])?.[0] ?? null,
        productUrl: `${websiteUrl}/products/${p.slug}`,
      }));
    } catch (dbErr) {
      log?.warn(dbErr, "Product catalog DB lookup failed");
    }

    if (products.length === 0) return false;

    /* ── Send each product as a separate message with buttons ── */
    const intro = `🛍️ *KDF NUTS Product Catalog* 🥜\n\nYہاں کچھ products ہیں جو آپ کے لیے match کرتے ہیں:`;
    await sendWhatsAppMessage({ phone, message: intro, templateName: "catalog_intro" });
    await new Promise(r => setTimeout(r, 800));

    for (let i = 0; i < products.length; i++) {
      const p = products[i]!;
      const msgText =
        `*${p.name}*\n` +
        `💰 *Price:* ${p.price}\n` +
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

/* ─── Helper: AI auto-reply ─────────────────────────── */
async function handleAiReply(opts: {
  phone: string;
  textBody: string;
  chatbot: any;
  waSettings: any;
  log?: any;
}): Promise<void> {
  const { phone, textBody, chatbot, waSettings, log } = opts;
  try {
    /* Rate limit check */
    const cooldownSec = chatbot.replyDelaySec ?? 30;
    const [lastAiReplyRow] = await db.select({ createdAt: whatsappLogsTable.createdAt })
      .from(whatsappLogsTable)
      .where(sql`phone = ${phone} AND template_name = 'ai_reply'`)
      .orderBy(desc(whatsappLogsTable.createdAt))
      .limit(1);
    if (lastAiReplyRow) {
      const secsSinceLast = (Date.now() - new Date(lastAiReplyRow.createdAt).getTime()) / 1000;
      if (secsSinceLast < cooldownSec) {
        log?.info({ phone, secsSinceLast, cooldownSec }, "AI reply rate-limited");
        return;
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
      log?.warn({ todaySent, maxDaily }, "AI reply daily cap reached");
      return;
    }

    /* Order context */
    let orderContextBlock = "";
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
          .limit(3);

        if (recentOrders.length > 0) {
          const customerName = (recentOrders[0]?.shipping as any)?.name ?? "Customer";
          const lines = recentOrders.map(o =>
            `  • Order #${o.orderNumber}: Status=${o.status}, Total=Rs.${o.total}${o.trackingId ? `, Tracking=${o.trackingId}` : ""}, Placed=${new Date(o.createdAt).toLocaleDateString("en-PK")}`
          );
          orderContextBlock = `\n\n[CUSTOMER CONTEXT — use this to answer their questions]\nCustomer Name: ${customerName}\nPhone: ${phone}\nRecent Orders:\n${lines.join("\n")}\n[END CONTEXT]`;
        }
      } catch (ctxErr) {
        log?.warn(ctxErr, "Failed to fetch order context");
      }
    }

    /* Conversation history */
    const history = await db.select()
      .from(whatsappLogsTable)
      .where(eq(whatsappLogsTable.phone, phone))
      .orderBy(desc(whatsappLogsTable.createdAt))
      .limit(16);

    const systemContent = chatbot.systemPrompt + orderContextBlock;
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
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

    const aiClient = await getOpenAIClient();
    const completion = await aiClient.chat.completions.create({
      model: chatbot.aiModel ?? "gpt-4o-mini",
      messages,
      max_completion_tokens: 500,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) return;

    const [replyRow] = await db.insert(whatsappLogsTable).values({
      phone,
      templateName: "ai_reply",
      message: reply,
      status: "pending",
      response: null,
    }).returning();

    if (waSettings?.isActive && waSettings.accessToken && waSettings.phoneNumberId) {
      const normPhone = normalizePhone(phone);
      const waRes = await fetch(`https://graph.facebook.com/v18.0/${waSettings.phoneNumberId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${waSettings.accessToken}` },
        body: JSON.stringify({
          messaging_product: "whatsapp", recipient_type: "individual", to: normPhone,
          type: "text", text: { preview_url: false, body: reply },
        }),
      });
      const waData = await waRes.json() as any;
      const sentStatus = waRes.ok && waData?.messages?.[0]?.id ? "sent" : "failed";
      if (replyRow) {
        await db.update(whatsappLogsTable)
          .set({ status: sentStatus, response: JSON.stringify(waData), messageId: waData?.messages?.[0]?.id ?? null })
          .where(eq(whatsappLogsTable.id, replyRow.id));
      }
    }
  } catch (aiErr) {
    log?.warn(aiErr, "AI auto-reply error");
    try {
      if (chatbot?.fallbackMessage && waSettings?.isActive && waSettings.accessToken && waSettings.phoneNumberId) {
        const normPhone = normalizePhone(phone);
        await fetch(`https://graph.facebook.com/v18.0/${waSettings.phoneNumberId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${waSettings.accessToken}` },
          body: JSON.stringify({
            messaging_product: "whatsapp", recipient_type: "individual", to: normPhone,
            type: "text", text: { preview_url: false, body: chatbot.fallbackMessage },
          }),
        });
      }
    } catch { /* ignore fallback errors */ }
  }
}

/* ─── Admin: Webhook Info ────────────────────────────── */
router.get("/admin/whatsapp/webhook-info", adminMiddleware as any, async (req, res) => {
  try {
    const webhookUrl = getPublicWebhookUrl();
    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    const configured = !!(settings?.accessToken && settings?.phoneNumberId && settings?.webhookVerifyToken);
    const isProd = !!(process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
    return res.json({
      webhookUrl,
      verifyToken: settings?.webhookVerifyToken ?? "kdfnuts_webhook_token",
      configured,
      isActive: settings?.isActive ?? false,
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
    const webhookUrl = getPublicWebhookUrl();
    if (!webhookUrl) {
      return res.json({ success: false, error: "No public domain available. Deploy the app to get a public HTTPS URL." });
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
    const webhookUrl = getPublicWebhookUrl();
    return res.json({
      success: false,
      webhookUrl,
      error: err.name === "TimeoutError" ? "Request timed out — the server may not be publicly reachable." : err.message,
    });
  }
});

/* ─── Admin: Get Settings ────────────────────────────── */
/* settings GET is now registered after PUT above */

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
    const payload: Record<string, any> = {
      accessToken, phoneNumberId, businessAccountId, webhookVerifyToken,
      isActive, chatButtonEnabled, chatButtonPhone, chatButtonMessage,
      abandonedRecoveryEnabled: abandonedRecoveryEnabled ?? false,
      abandonedRecoveryDelayMinutes: abandonedRecoveryDelayMinutes ?? 45,
      abandonedRecoveryCouponCode: abandonedRecoveryCouponCode ?? null,
    };
    if (apiVersion)          payload.apiVersion          = apiVersion;
    if (businessPortfolioId) payload.businessPortfolioId = businessPortfolioId;
    // Only update appSecret if provided (non-empty) — never clear an existing secret
    if (appSecret && appSecret.trim()) payload.appSecret = appSecret.trim();

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
    const aiClient = await getOpenAIClient();
    const completion = await aiClient.chat.completions.create({
      model: chatbot.aiModel ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: chatbot.systemPrompt },
        { role: "user", content: message.trim() },
      ],
      max_completion_tokens: 400,
    });
    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    return res.json({ success: true, reply, model: chatbot.aiModel });
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
      // Build body components from parameter values
      const params: string[] = Array.isArray(templateParams) ? templateParams.filter((v: string) => typeof v === "string" && v.trim() !== "") : [];
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

/* ─── Admin: Sync Meta Templates ─────────────────────── */
router.post("/admin/whatsapp/sync-meta-templates", adminMiddleware as any, async (req, res) => {
  try {
    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    if (!settings?.accessToken) return res.status(400).json({ error: "Access token not configured" });
    if (!settings?.businessAccountId) return res.status(400).json({ error: "Business Account ID not configured — add it in API Settings" });
    const r = await fetch(`https://graph.facebook.com/v18.0/${settings.businessAccountId}/message_templates?limit=100&fields=name,status,language,category,components`, {
      headers: { Authorization: `Bearer ${settings.accessToken}` },
    });
    const data = await r.json() as any;
    if (!r.ok) return res.status(400).json({ error: data?.error?.message ?? "Failed to fetch from Meta", data });
    return res.json({ templates: data.data ?? [], total: data.data?.length ?? 0 });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
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
router.get("/admin/whatsapp/templates/approved", adminMiddleware as any, async (req, res) => {
  try {
    const templates = await db.select().from(whatsappTemplatesTable)
      .where(eq(whatsappTemplatesTable.approvalStatus, "approved"))
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
      "order_confirmation", "order_processing", "order_shipped",
      "order_out_for_delivery", "order_delivered", "order_cancelled",
      "abandoned_cart_recovery",
    ];
    const templates = await db.select().from(whatsappTemplatesTable);
    const byEvent: Record<string, typeof templates[0] | null> = {};
    for (const ev of EVENT_TYPES) {
      byEvent[ev] = templates.find(t => t.triggerEvent === ev) ?? null;
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
          const nums = matches.map(m => parseInt(m.replace(/\{\{|\}\}/g, "")));
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
    return res.json(s ?? null);
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
    } = req.body;
    const payload = {
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
      websiteUrl:           websiteUrl ?? "https://kdfnuts.com",
      discountCode:         discountCode ?? "WELCOME10",
      discountMessage:      discountMessage ?? "",
      hotDealsMessage:      hotDealsMessage ?? "",
      updatedAt:            new Date(),
    };
    const existing = await db.select().from(chatbotSettingsTable).limit(1);
    if (existing.length > 0) {
      const [u] = await db.update(chatbotSettingsTable).set(payload).where(eq(chatbotSettingsTable.id, existing[0]!.id)).returning();
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
    const phone = req.params.phone;
    /* Try wa_messages first (rich data), fall back to whatsapp_logs */
    const [conv] = await db.execute(sql`SELECT id FROM wa_conversations WHERE contact_phone = ${phone} LIMIT 1`);
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
    const [conv] = await db.execute(sql`SELECT * FROM wa_conversations WHERE contact_phone = ${req.params.phone} LIMIT 1`);
    const notes  = await db.execute(sql`SELECT * FROM wa_agent_notes WHERE phone = ${req.params.phone} ORDER BY created_at DESC LIMIT 50`);
    return res.json({ conversation: conv, notes: notes.rows ?? notes });
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
      const [conv] = await db.execute(sql`SELECT id FROM wa_conversations WHERE contact_phone = ${req.params.phone} LIMIT 1`);
      const convId = (conv as any)?.id;
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
    const [convRow] = await db.execute(sql`SELECT id FROM wa_conversations WHERE contact_phone = ${req.params.phone} LIMIT 1`);
    const convId = (convRow as any)?.id ?? 0;
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

    /* 1. Exchange auth code for short-lived user access token */
    const tokenRes = await fetch(
      `https://graph.facebook.com/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`
    );
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) {
      req.log?.error({ tokenData }, "Meta code exchange failed");
      return res.json({ success: false, error: tokenData.error?.message ?? "Token exchange failed — code may have expired. Please try connecting again." });
    }
    const userToken: string = tokenData.access_token;

    /* 2. Extend to long-lived user token (~60 days) */
    const llRes = await fetch(
      `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(userToken)}`
    );
    const llData = await llRes.json() as any;
    const longLivedToken: string = llData.access_token ?? userToken;

    /* 3. Resolve WABA ID */
    let resolvedWabaId: string | undefined = wabaId;
    if (!resolvedWabaId) {
      const wabaListRes = await fetch(`https://graph.facebook.com/v18.0/me/businesses?access_token=${longLivedToken}`);
      const wabaListData = await wabaListRes.json() as any;
      resolvedWabaId = wabaListData.data?.[0]?.id;
    }

    /* 4. Fetch phone number details */
    let phoneDetails: any = {};
    let resolvedPhoneId: string | undefined = phoneNumberId;
    if (resolvedPhoneId) {
      const phoneRes = await fetch(
        `https://graph.facebook.com/v18.0/${resolvedPhoneId}?fields=verified_name,display_phone_number,quality_rating,status&access_token=${longLivedToken}`
      );
      phoneDetails = await phoneRes.json() as any;
    } else if (resolvedWabaId) {
      const phonesRes = await fetch(
        `https://graph.facebook.com/v18.0/${resolvedWabaId}/phone_numbers?access_token=${longLivedToken}&fields=verified_name,display_phone_number,quality_rating,status`
      );
      const phonesData = await phonesRes.json() as any;
      phoneDetails = phonesData.data?.[0] ?? {};
      resolvedPhoneId = phoneDetails.id;
    }

    /* 5. Fetch WABA name */
    let businessName: string | null = null;
    if (resolvedWabaId) {
      const wabaRes = await fetch(`https://graph.facebook.com/v18.0/${resolvedWabaId}?fields=name&access_token=${longLivedToken}`);
      const wabaData = await wabaRes.json() as any;
      businessName = wabaData.name ?? null;
    }

    /* 6. Persist to DB */
    const [existing] = await db.select({ id: whatsappSettingsTable.id }).from(whatsappSettingsTable).limit(1);
    const savePayload = {
      accessToken: longLivedToken,
      phoneNumberId: resolvedPhoneId ?? null,
      businessAccountId: resolvedWabaId ?? null,
      isActive: true,
      verifiedName: phoneDetails.verified_name ?? null,
      qualityRating: phoneDetails.quality_rating ?? null,
      metaStatus: phoneDetails.status ?? null,
      connectedAt: new Date(),
      connectionMethod: "embedded_signup",
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(whatsappSettingsTable).set(savePayload).where(eq(whatsappSettingsTable.id, existing.id));
    } else {
      await db.insert(whatsappSettingsTable).values(savePayload as any);
    }
    req.log?.info({ wabaId: resolvedWabaId, phoneId: resolvedPhoneId }, "WhatsApp Embedded Signup connected");
    return res.json({
      success: true,
      wabaId: resolvedWabaId,
      phoneNumberId: resolvedPhoneId,
      displayPhone: phoneDetails.display_phone_number ?? null,
      verifiedName: phoneDetails.verified_name ?? null,
      businessName,
      qualityRating: phoneDetails.quality_rating ?? null,
      status: phoneDetails.status ?? null,
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
      phones = campaign.customPhones.split("\n").map(p => p.trim()).filter(Boolean).map(p => ({ phone: p }));
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
        messageBody: "Hello {{1}}, 👋\nThank you for your order with KDF NUTS 🥜\n\n🧾 Order ID: {{2}}\n💰 Total Amount: {{3}}\n📍 Delivery Address: {{4}}\n\nYour order has been successfully received and is now being processed.\n\nWe will notify you once your order is shipped 🚚\n\nThank you for shopping with us ❤️",
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

export default router;
