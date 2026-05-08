import { Router, type Request, type Response } from "express";
import { eq, desc, and, sql, ilike, or } from "drizzle-orm";
import { db, waConversationsTable, waMessagesTable, ordersTable, usersTable, aiSettingsTable, whatsappSettingsTable } from "@workspace/db";
import { productsTable } from "@workspace/db";
import { shopifyProductsTable } from "@workspace/db";
import { adminMiddleware } from "../lib/auth";
import { sendWhatsAppMessage, sendInteractiveButtons, normalizePhone } from "../lib/whatsapp";
import { broadcastSSE } from "../lib/sse";
import OpenAI from "openai";

const router = Router();

async function getOpenAI() {
  const [s] = await db.select().from(aiSettingsTable).limit(1);
  if (!s?.openaiApiKey || !s.aiEnabled) return null;
  return new OpenAI({ apiKey: s.openaiApiKey, organization: s.openaiOrgId || undefined });
}

/* ─── List conversations ───────────────────────────────────── */
router.get("/admin/wa/conversations", adminMiddleware, async (req: Request, res: Response) => {
  const { search, status, page = "1", limit = "30" } = req.query as Record<string, string>;
  try {
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * pageSize;

    const conditions: any[] = [];
    if (status && status !== "all") conditions.push(eq(waConversationsTable.status, status));
    if (search) conditions.push(or(
      ilike(waConversationsTable.contactName, `%${search}%`),
      ilike(waConversationsTable.contactPhone, `%${search}%`),
    ));

    const where = conditions.length > 0 ? and(...(conditions as [any, ...any[]])) : undefined;

    const [conversations, [{ total }]] = await Promise.all([
      db.select().from(waConversationsTable)
        .where(where)
        .orderBy(desc(waConversationsTable.lastMessageAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(waConversationsTable).where(where),
    ]);

    res.json({ conversations, total, page: pageNum, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Get conversation detail with customer info ──────────── */
router.get("/admin/wa/conversations/:id", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const [conv] = await db.select().from(waConversationsTable).where(eq(waConversationsTable.id, id)).limit(1);
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }

    /* Customer info from orders */
    const phone = normalizePhone(conv.contactPhone);
    const altPhone = phone.startsWith("92") ? "0" + phone.slice(2) : conv.contactPhone;
    const orders = await db.select({
      id: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      status: ordersTable.status,
      total: ordersTable.total,
      createdAt: ordersTable.createdAt,
      shipping: ordersTable.shippingAddress,
      trackingId: ordersTable.trackingId,
    }).from(ordersTable)
      .where(sql`(shipping_address->>'phone' = ${phone} OR shipping_address->>'phone' = ${altPhone} OR shipping_address->>'phone' = ${conv.contactPhone})`)
      .orderBy(desc(ordersTable.createdAt))
      .limit(10);

    const customerName = orders[0] ? (orders[0].shipping as any)?.name ?? conv.contactName : conv.contactName;
    const city = orders[0] ? (orders[0].shipping as any)?.city ?? null : null;
    const totalSpend = orders.reduce((s: number, o: any) => s + parseFloat(String(o.total ?? "0")), 0);

    res.json({ conversation: conv, orders, customer: { name: customerName, city, totalOrders: orders.length, totalSpend } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Get messages ─────────────────────────────────────────── */
router.get("/admin/wa/conversations/:id/messages", adminMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  const { page = "1", limit = "50" } = req.query as Record<string, string>;
  try {
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * pageSize;

    const [messages, [{ total }]] = await Promise.all([
      db.select().from(waMessagesTable)
        .where(eq(waMessagesTable.conversationId, id))
        .orderBy(desc(waMessagesTable.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(waMessagesTable).where(eq(waMessagesTable.conversationId, id)),
    ]);

    res.json({ messages: messages.reverse(), total, page: pageNum, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Send reply (admin / human) ──────────────────────────── */
router.post("/admin/wa/conversations/:id/reply", adminMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  const { message } = req.body as { message: string };
  if (!message?.trim()) { res.status(400).json({ error: "message required" }); return; }
  try {
    const [conv] = await db.select().from(waConversationsTable).where(eq(waConversationsTable.id, id)).limit(1);
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }

    const sent = await sendWhatsAppMessage({ phone: normalizePhone(conv.contactPhone), message: message.trim() });
    if (!sent) { res.status(400).json({ error: "Failed to send — check WhatsApp settings" }); return; }

    const [msg] = await db.insert(waMessagesTable).values({
      conversationId: id,
      direction: "out",
      type: "text",
      content: message.trim(),
      status: "sent",
      isBot: false,
    }).returning();

    await db.update(waConversationsTable).set({
      lastMessage: message.trim().slice(0, 120),
      lastMessageAt: new Date(),
      botMode: "human",
      updatedAt: new Date(),
    }).where(eq(waConversationsTable.id, id));

    broadcastSSE("wa_message", { conversationId: id, direction: "out", content: message.trim(), isBot: false });

    res.json({ success: true, message: msg });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Unread count summary ────────────────────────────────── */
router.get("/admin/wa/unread-count", adminMiddleware, async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`SELECT COALESCE(SUM(unread_count), 0)::int AS total FROM wa_conversations`) as any;
    const total = (result.rows ?? result)[0]?.total ?? 0;
    res.json({ total });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Mark as read ────────────────────────────────────────── */
router.put("/admin/wa/conversations/:id/read", adminMiddleware, async (req: Request, res: Response) => {
  try {
    await db.update(waConversationsTable).set({ unreadCount: 0, updatedAt: new Date() })
      .where(eq(waConversationsTable.id, parseInt(req.params["id"] as string)));

    /* Broadcast updated total unread count */
    const result = await db.execute(sql`SELECT COALESCE(SUM(unread_count), 0)::int AS total FROM wa_conversations`) as any;
    const total = (result.rows ?? result)[0]?.total ?? 0;
    broadcastSSE("wa_unread_count", { total });

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

/* ─── Set bot mode ────────────────────────────────────────── */
router.put("/admin/wa/conversations/:id/bot-mode", adminMiddleware, async (req: Request, res: Response) => {
  const { mode } = req.body as { mode: string };
  if (!["auto", "human", "off"].includes(mode)) { res.status(400).json({ error: "Invalid mode" }); return; }
  try {
    const [conv] = await db.update(waConversationsTable).set({ botMode: mode, updatedAt: new Date() })
      .where(eq(waConversationsTable.id, parseInt(req.params["id"] as string))).returning();
    res.json(conv);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

/* ─── Set status (open/closed) ────────────────────────────── */
router.put("/admin/wa/conversations/:id/status", adminMiddleware, async (req: Request, res: Response) => {
  const { status } = req.body as { status: string };
  if (!["open", "closed"].includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  try {
    const [conv] = await db.update(waConversationsTable).set({ status, updatedAt: new Date() })
      .where(eq(waConversationsTable.id, parseInt(req.params["id"] as string))).returning();
    res.json(conv);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

/* ─── AI reply suggestion ─────────────────────────────────── */
router.post("/admin/wa/conversations/:id/ai-suggest", adminMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  try {
    const openai = await getOpenAI();
    if (!openai) { res.status(400).json({ error: "AI not configured" }); return; }

    const [conv] = await db.select().from(waConversationsTable).where(eq(waConversationsTable.id, id)).limit(1);
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }

    /* Last 10 messages for context */
    const recent = await db.select().from(waMessagesTable)
      .where(eq(waMessagesTable.conversationId, id))
      .orderBy(desc(waMessagesTable.createdAt))
      .limit(10);
    const history = recent.reverse().map(m =>
      `${m.direction === "in" ? "Customer" : "Agent"}: ${m.content}`
    ).join("\n");

    /* Customer orders */
    const phone = normalizePhone(conv.contactPhone);
    const altPhone = phone.startsWith("92") ? "0" + phone.slice(2) : conv.contactPhone;
    const orders = await db.select({
      orderNumber: ordersTable.orderNumber, status: ordersTable.status, total: ordersTable.total,
    }).from(ordersTable)
      .where(sql`(shipping_address->>'phone' = ${phone} OR shipping_address->>'phone' = ${altPhone})`)
      .orderBy(desc(ordersTable.createdAt)).limit(3);
    const orderCtx = orders.length > 0
      ? `\nCustomer orders: ${orders.map(o => `#${o.orderNumber} (${o.status}, Rs.${o.total})`).join(", ")}`
      : "";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `You are a helpful WhatsApp support agent for KDF NUTS (premium dry fruits store in Pakistan). Write natural, friendly replies in the same language the customer uses. Keep replies concise (2-3 sentences max). No markdown.${orderCtx}` },
        { role: "user", content: `Conversation:\n${history}\n\nWrite the next agent reply:` },
      ],
      max_tokens: 200,
    });

    res.json({ suggestion: completion.choices[0]?.message.content?.trim() ?? "" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Product search for Admin inbox ──────────────────── */
router.get("/admin/wa/products/search", adminMiddleware, async (req: Request, res: Response) => {
  const { q = "", limit = "5" } = req.query as Record<string, string>;
  const lim = Math.min(10, Math.max(1, parseInt(limit)));
  try {
    const websiteUrl = "https://khanbabadryfruits.com";
    const results: any[] = [];

    /* Custom DB products */
    const dbProds = await db.select({
      id: productsTable.id, name: productsTable.name, price: productsTable.price,
      images: productsTable.images, slug: productsTable.slug, stock: productsTable.stock,
    }).from(productsTable)
      .where(q.length > 0
        ? or(ilike(productsTable.name, `%${q}%`), ilike(productsTable.description, `%${q}%`))
        : sql`active = true AND stock > 0`
      )
      .orderBy(desc(productsTable.featured))
      .limit(lim);

    for (const p of dbProds) {
      results.push({
        id: `db_${p.id}`, name: p.name,
        price: parseFloat(String(p.price)),
        imageUrl: (p.images as string[])?.[0] ?? null,
        url: `${websiteUrl}/products/${p.slug}`,
        inStock: p.stock > 0, source: "store",
        variants: [],
      });
    }

    /* Shopify products if not enough */
    if (results.length < lim) {
      const shopProds = await db.select({
        id: shopifyProductsTable.id, title: shopifyProductsTable.title,
        price: shopifyProductsTable.price, imageUrl: shopifyProductsTable.imageUrl,
        variants: shopifyProductsTable.variants, shopifyProductId: shopifyProductsTable.shopifyProductId,
        inventoryQuantity: shopifyProductsTable.inventoryQuantity,
      }).from(shopifyProductsTable)
        .where(and(
          eq(shopifyProductsTable.status, "active"),
          q.length > 0 ? ilike(shopifyProductsTable.title, `%${q}%`) : sql`true`,
        ))
        .limit(lim - results.length);

      for (const sp of shopProds) {
        const handle = sp.shopifyProductId?.replace(/[^a-z0-9-]/gi, "-").toLowerCase() ?? "product";
        results.push({
          id: `shopify_${sp.id}`, name: sp.title,
          price: parseFloat(String(sp.price ?? "0")),
          imageUrl: sp.imageUrl ?? null,
          url: `${websiteUrl}/products/${handle}`,
          inStock: (sp.inventoryQuantity ?? 0) > 0, source: "shopify",
          variants: ((sp.variants as any[]) ?? []).filter(v => (v.inventoryQuantity ?? 0) > 0).slice(0, 4).map((v: any) => ({
            title: v.title, price: parseFloat(v.price),
          })),
        });
      }
    }

    res.json({ products: results });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Order search for Admin inbox ───────────────────── */
router.get("/admin/wa/orders/search", adminMiddleware, async (req: Request, res: Response) => {
  const { q = "" } = req.query as Record<string, string>;
  try {
    const results = await db.select({
      id: ordersTable.id, orderNumber: ordersTable.orderNumber,
      status: ordersTable.status, total: ordersTable.total,
      trackingId: ordersTable.trackingId, createdAt: ordersTable.createdAt,
      shipping: ordersTable.shippingAddress,
    }).from(ordersTable)
      .where(q.length > 0
        ? or(
            ilike(ordersTable.orderNumber, `%${q}%`),
            sql`shipping_address->>'name' ILIKE ${"%" + q + "%"}`,
            sql`shipping_address->>'phone' ILIKE ${"%" + q + "%"}`,
          )
        : sql`true`
      )
      .orderBy(desc(ordersTable.createdAt))
      .limit(8);

    res.json({ orders: results.map(o => ({
      ...o,
      customerName: (o.shipping as any)?.name ?? "",
      city: (o.shipping as any)?.city ?? "",
    }))});
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Send product card to conversation ──────────────── */
router.post("/admin/wa/conversations/:id/send-product", adminMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  const { productName, price, imageUrl, productUrl, variants } = req.body as {
    productName: string; price: number; imageUrl?: string; productUrl: string; variants?: string;
  };
  if (!productName || !productUrl) { res.status(400).json({ error: "productName and productUrl required" }); return; }
  try {
    const [conv] = await db.select().from(waConversationsTable).where(eq(waConversationsTable.id, id)).limit(1);
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    const [waSettings] = await db.select().from(whatsappSettingsTable).limit(1);
    const phone = normalizePhone(conv.contactPhone);

    let card = `🛍️ *${productName}*\n`;
    if (price > 0) card += `💰 *Price:* Rs. ${price.toLocaleString("en-PK")}\n`;
    if (variants) card += `📦 *Options:* ${variants}\n`;
    card += `🔗 ${productUrl}`;

    await sendInteractiveButtons({
      phone,
      text: card,
      buttons: [
        { id: `wa_order_${encodeURIComponent(productName)}_0`, title: "🛒 Order Now" },
        { id: "main_menu", title: "🏠 Main Menu" },
      ],
      footer: "KDF NUTS — Premium Dry Fruits Pakistan",
      settings: waSettings,
      templateName: "admin_product_share",
    });

    /* Log in messages */
    const content = `[Product shared: ${productName} — Rs.${price}]`;
    await db.insert(waMessagesTable).values({
      conversationId: id, direction: "out", type: "text",
      content, status: "sent", isBot: false,
    });
    await db.update(waConversationsTable).set({
      lastMessage: content.slice(0, 120), lastMessageAt: new Date(), updatedAt: new Date(),
    }).where(eq(waConversationsTable.id, id));

    broadcastSSE("wa_message", { conversationId: id, direction: "out", content, isBot: false });
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Analytics dashboard ────────────────────────────── */
router.get("/admin/wa/analytics", adminMiddleware, async (_req: Request, res: Response) => {
  try {
    const statsRes = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM wa_conversations) AS total_conversations,
        (SELECT COUNT(*) FROM wa_conversations WHERE status = 'open') AS open_conversations,
        (SELECT COUNT(*) FROM wa_conversations WHERE DATE(last_message_at) = CURRENT_DATE) AS active_today,
        (SELECT COALESCE(SUM(unread_count),0) FROM wa_conversations) AS total_unread,
        (SELECT COUNT(*) FROM wa_messages WHERE direction = 'in' AND DATE(created_at) = CURRENT_DATE) AS inbound_today,
        (SELECT COUNT(*) FROM wa_messages WHERE direction = 'out' AND DATE(created_at) = CURRENT_DATE) AS outbound_today,
        (SELECT COUNT(*) FROM wa_messages WHERE direction = 'out' AND is_bot = true AND DATE(created_at) = CURRENT_DATE) AS bot_replies_today,
        (SELECT COUNT(*) FROM wa_messages WHERE direction = 'in' AND created_at >= NOW() - INTERVAL '24 hours') AS messages_24h,
        (SELECT COUNT(*) FROM wa_conversations WHERE bot_mode = 'human') AS human_mode_count,
        (SELECT COUNT(*) FROM wa_conversations WHERE is_starred = true) AS starred_count,
        (SELECT COUNT(*) FROM wa_conversations WHERE created_at >= NOW() - INTERVAL '7 days') AS new_this_week
    `) as any;

    /* 7-day message volume */
    const volumeRes = await db.execute(sql`
      SELECT
        DATE(created_at) AS day,
        COUNT(*) FILTER (WHERE direction = 'in') AS inbound,
        COUNT(*) FILTER (WHERE direction = 'out') AS outbound,
        COUNT(*) FILTER (WHERE direction = 'out' AND is_bot = true) AS bot
      FROM wa_messages
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `) as any;

    /* Top intents */
    const intentsRes = await db.execute(sql`
      SELECT intent, COUNT(*) AS cnt FROM wa_conversations
      WHERE intent IS NOT NULL GROUP BY intent ORDER BY cnt DESC LIMIT 5
    `) as any;

    res.json({
      stats: (statsRes.rows ?? statsRes as any)[0] ?? {},
      volume: volumeRes.rows ?? (volumeRes as any) ?? [],
      intents: intentsRes.rows ?? (intentsRes as any) ?? [],
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ─── 24-hour session check ──────────────────────────── */
router.get("/admin/wa/conversations/:id/session", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const [conv] = await db.select({
      lastMessageAt: waConversationsTable.lastMessageAt,
      contactPhone: waConversationsTable.contactPhone,
    }).from(waConversationsTable).where(eq(waConversationsTable.id, id)).limit(1);

    if (!conv) { res.status(404).json({ error: "Not found" }); return; }

    /* Last inbound message time */
    const [lastIn] = await db.select({ createdAt: waMessagesTable.createdAt })
      .from(waMessagesTable)
      .where(and(eq(waMessagesTable.conversationId, id), sql`direction = 'in'`))
      .orderBy(desc(waMessagesTable.createdAt))
      .limit(1);

    const lastInboundAt = lastIn?.createdAt ?? null;
    const now = Date.now();
    const diffMs = lastInboundAt ? now - new Date(lastInboundAt).getTime() : Infinity;
    const within24h = diffMs < 24 * 60 * 60 * 1000;
    const hoursRemaining = within24h ? Math.floor((24 * 60 * 60 * 1000 - diffMs) / 3600000) : 0;

    res.json({ within24h, lastInboundAt, hoursRemaining });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Send payment details ───────────────────────────── */
router.post("/admin/wa/conversations/:id/send-payment", adminMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  const { amount, orderRef } = req.body as { amount?: number; orderRef?: string };
  try {
    const [conv] = await db.select().from(waConversationsTable).where(eq(waConversationsTable.id, id)).limit(1);
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    const phone = normalizePhone(conv.contactPhone);
    const [waSettings] = await db.select().from(whatsappSettingsTable).limit(1);

    const amtStr = amount ? `Rs. ${amount.toLocaleString("en-PK")}` : "";
    const refStr = orderRef ? `📋 Ref: ${orderRef}\n` : "";

    const paymentMsg =
      `💳 *Payment Details — KDF NUTS*\n\n` +
      (amtStr ? `💰 Amount: *${amtStr}*\n` : "") +
      `${refStr}\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `🏦 *Bank Transfer*\n` +
      `Bank: Meezan Bank\n` +
      `Account Title: KDF NUTS\n` +
      `Account #: 02960105654083\n` +
      `IBAN: PK02MEZN0002960105654083\n\n` +
      `📱 *JazzCash*\n` +
      `Account: 0314-7009134\n` +
      `Name: Khan Dry Fruits\n\n` +
      `📱 *Easypaisa*\n` +
      `Account: 0314-7009134\n` +
      `Name: Khan Dry Fruits\n\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `✅ After payment, send screenshot for confirmation.\n` +
      `جزاک اللہ خیر 🙏`;

    await sendInteractiveButtons({
      phone,
      text: paymentMsg,
      buttons: [
        { id: `payment_done_${id}`, title: "✅ I Have Paid" },
        { id: "main_menu", title: "🏠 Main Menu" },
      ],
      footer: "KDF NUTS — Payment Gateway",
      settings: waSettings,
      templateName: "payment_details",
    });

    const content = `[Payment details sent${amtStr ? ` — ${amtStr}` : ""}]`;
    await db.insert(waMessagesTable).values({
      conversationId: id, direction: "out", type: "text", content, status: "sent", isBot: false,
    });
    await db.update(waConversationsTable).set({
      lastMessage: content, lastMessageAt: new Date(), updatedAt: new Date(),
    }).where(eq(waConversationsTable.id, id));

    broadcastSSE("wa_message", { conversationId: id, direction: "out", content, isBot: false });
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Add/update internal note ───────────────────────── */
router.post("/admin/wa/conversations/:id/note", adminMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  const { note } = req.body as { note: string };
  if (!note?.trim()) { res.status(400).json({ error: "note required" }); return; }
  try {
    await db.update(waConversationsTable).set({
      internalNote: note.trim(), updatedAt: new Date(),
    }).where(eq(waConversationsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Toggle star ────────────────────────────────────── */
router.put("/admin/wa/conversations/:id/star", adminMiddleware, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`UPDATE wa_conversations SET is_starred = NOT is_starred, updated_at = NOW() WHERE id = ${parseInt(req.params["id"] as string)}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Send order status to conversation ─────────────── */
router.post("/admin/wa/conversations/:id/send-order-status", adminMiddleware, async (req: Request, res: Response) => {
  const convId = parseInt(req.params["id"] as string);
  const { orderId } = req.body as { orderId: number };
  try {
    const [conv] = await db.select().from(waConversationsTable).where(eq(waConversationsTable.id, convId)).limit(1);
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    const [order] = await db.select({
      orderNumber: ordersTable.orderNumber, status: ordersTable.status,
      total: ordersTable.total, trackingId: ordersTable.trackingId, createdAt: ordersTable.createdAt,
    }).from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const [waSettings] = await db.select().from(whatsappSettingsTable).limit(1);
    const phone = normalizePhone(conv.contactPhone);

    const STATUS_EMOJI: Record<string, string> = {
      pending: "⏳ Pending", processing: "🔧 Processing", shipped: "🚚 Shipped",
      out_for_delivery: "🛵 Out for Delivery", delivered: "✅ Delivered", cancelled: "❌ Cancelled",
    };
    const msg = `📦 *Order Update*\n\n🧾 Order: ${order.orderNumber}\n💰 Total: Rs. ${parseFloat(String(order.total)).toLocaleString("en-PK")}\n📊 Status: ${STATUS_EMOJI[order.status ?? ""] ?? order.status}${order.trackingId ? `\n🔍 Tracking: ${order.trackingId}` : ""}`;

    await sendWhatsAppMessage({ phone, message: msg });

    const content = `[Order status sent: ${order.orderNumber}]`;
    await db.insert(waMessagesTable).values({
      conversationId: convId, direction: "out", type: "text", content, status: "sent", isBot: false,
    });
    broadcastSSE("wa_message", { conversationId: convId, direction: "out", content, isBot: false });
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
