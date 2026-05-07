import { Router } from "express";
import {
  db,
  chatSessionsTable,
  chatbotSettingsTable,
  productsTable,
  categoriesTable,
  ordersTable,
  orderItemsTable,
  aiSettingsTable,
  sameDayDeliverySettingsTable,
  shopifyProductsTable,
} from "@workspace/db";
import { eq, ilike, or, and, desc, sql, asc } from "drizzle-orm";
import { expandQuery } from "./search";
import { adminMiddleware } from "../lib/auth";
import OpenAI from "openai";

const router = Router();

/* Strip markdown formatting so AI responses read as plain human text */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")   // ***bold italic***
    .replace(/\*\*(.+?)\*\*/g, "$1")        // **bold**
    .replace(/\*(.+?)\*/g, "$1")            // *italic*
    .replace(/__(.+?)__/g, "$1")            // __underline__
    .replace(/_(.+?)_/g, "$1")              // _italic_
    .replace(/`{3}[\s\S]*?`{3}/g, "")      // ```code blocks```
    .replace(/`(.+?)`/g, "$1")             // `inline code`
    .replace(/^#{1,6}\s+/gm, "")           // # headings
    .replace(/^\s*[-*+]\s+/gm, "")         // - bullet points
    .replace(/^\s*\d+\.\s+/gm, "")         // 1. numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [link text](url)
    .replace(/\n{3,}/g, "\n\n")            // collapse excess blank lines
    .trim();
}

async function getOpenAIClient() {
  const [s] = await db.select().from(aiSettingsTable).limit(1);
  if (!s?.openaiApiKey || !s.aiEnabled) {
    throw Object.assign(
      new Error("AI is not configured or disabled. Please configure OpenAI in admin settings."),
      { status: 503 }
    );
  }
  return new OpenAI({ apiKey: s.openaiApiKey, organization: s.openaiOrgId || undefined });
}

async function getSameDayInfo(): Promise<string> {
  try {
    const [s] = await db.select().from(sameDayDeliverySettingsTable).limit(1);
    if (!s || !s.enabled) return "";
    const cutoffHour = s.cutoffHour ?? 15;
    const suffix = cutoffHour >= 12 ? "PM" : "AM";
    const hour = cutoffHour % 12 === 0 ? 12 : cutoffHour % 12;
    const cutoffFmt = `${hour}:00 ${suffix}`;
    return `\n\nSAME DAY DELIVERY INFO (IMPORTANT):\n- Same Day Delivery is available in ${s.city} only.\n- Charge: Rs. ${s.price}\n- Orders must be placed before ${cutoffFmt}.\n- If user asks about same day delivery, reply: "Yes, Same Day Delivery is available in ${s.city}. Charges: Rs. ${s.price}. Order before ${cutoffFmt} to receive today."\n- If user is outside ${s.city} or it is after ${cutoffFmt}, tell them it is not available.`;
  } catch {
    return "";
  }
}

function buildSystemPrompt(chatbot: any, sameDayInfo = ""): string {
  const customPrompt = chatbot.systemPrompt?.trim();
  const base = customPrompt && customPrompt.length > 20
    ? customPrompt
    : `You are a friendly customer support agent for KDF Nuts, a premium nuts and dry fruits brand in Pakistan. Your name is KDF Support.`;

  const toolRules = `

TOOL USAGE RULES — MANDATORY, ALWAYS FOLLOW:
1. When user asks about ANY product, price, or availability → call search_products IMMEDIATELY. Never answer with product text.
2. When user asks to "show categories", "kya categories hain", or wants to browse → call search_categories IMMEDIATELY. Never list categories as text.
3. When user says "order karna hai", "buy", "mujhe chahiye", "place order" or clearly wants to buy → call trigger_order_form IMMEDIATELY. Never ask for details via chat.
4. After calling a tool, reply with 1–2 short natural sentences only. The cards/form appear automatically.
5. NEVER use markdown: no **bold**, no *italic*, no # headings, no bullet points with - or *.
6. Keep ALL replies to 2–3 lines max. Write like a WhatsApp support agent, not a chatbot.
7. Never say you are AI or automated. Use Rs. for prices. If user writes Urdu/Roman Urdu, reply in kind.`;

  const orderInstructions = chatbot.orderingEnabled
    ? `

When a customer wants to order, use the search_products tool to find the exact product and price. Then collect this information one step at a time in a natural, conversational way: which product and variant they want, their full name, phone number, delivery address, and city. Ask for payment method — either Cash on Delivery or Bank Transfer. Show a clear order summary before confirming. Only use the place_order tool after the customer confirms. After placing the order, share the order number and thank them warmly.`
    : "";

  return `${base}${toolRules}${orderInstructions}${sameDayInfo}\n\nToday's date: ${new Date().toLocaleDateString("en-PK", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;
}

function buildTools(orderingEnabled: boolean) {
  const tools: any[] = [
    {
      type: "function",
      function: {
        name: "search_products",
        description: "Search and display products as interactive cards. MUST be called whenever the user asks about any product, price, availability, or says words like 'show', 'price', 'kitne ka', 'kya hai', 'almonds', 'cashews', 'nuts', 'dry fruits', or mentions any product name.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Product name or keyword to search for" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_categories",
        description: "Fetch and display all product categories as clickable cards. MUST be called when user asks to 'show categories', 'browse categories', 'kya categories hain', or wants to browse by type.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "trigger_order_form",
        description: "Show the customer an interactive order form inside the chat. MUST be called when user says 'order karna hai', 'buy now', 'mujhe lena hai', 'place order', 'order chahiye', 'I want to buy', or clearly expresses purchase intent.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
  ];
  if (orderingEnabled) {
    tools.push({
      type: "function",
      function: {
        name: "place_order",
        description: "Place a confirmed order for the customer. Only call after explicit confirmation.",
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  productId: { type: "number" },
                  name: { type: "string" },
                  variant: { type: "string" },
                  price: { type: "number" },
                  qty: { type: "number" },
                },
                required: ["name", "price", "qty"],
              },
            },
            customerName: { type: "string" },
            phone: { type: "string" },
            address: { type: "string" },
            city: { type: "string" },
            paymentMethod: { type: "string", enum: ["cod", "bank_transfer"] },
          },
          required: ["items", "phone", "address", "city", "paymentMethod"],
        },
      },
    });
  }
  return tools;
}

/* ── POST /api/chat/message ── */
router.post("/chat/message", async (req, res) => {
  try {
    const { sessionId, message, userId } = req.body as { sessionId?: string; message: string; userId?: number };
    if (!message?.trim()) return res.status(400).json({ error: "message is required" });

    const [chatbot] = await db.select().from(chatbotSettingsTable).limit(1);
    if (!chatbot?.isEnabled) return res.status(503).json({ error: "Chatbot is currently disabled." });

    let session = sessionId
      ? (await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.sessionId, sessionId)).limit(1))[0]
      : null;

    const newSessionId = sessionId ?? `widget_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!session) {
      [session] = await db.insert(chatSessionsTable).values({ sessionId: newSessionId, userId: userId ?? null, messages: [] }).returning();
    }

    const history: any[] = (session.messages as any[]) ?? [];
    const userMsg = { role: "user", content: message.trim(), timestamp: new Date().toISOString() };
    const updatedHistory = [...history, userMsg];

    const sameDayInfo = await getSameDayInfo();
    const systemPrompt = buildSystemPrompt(chatbot, sameDayInfo);
    const tools = buildTools(chatbot.orderingEnabled ?? false);
    const openaiMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...updatedHistory.map(m => ({ role: m.role === "admin" ? "assistant" : m.role, content: m.content })),
    ];

    const aiClient = await getOpenAIClient();
    let currentMessages = [...openaiMessages];
    let foundProducts: any[] = [];
    let foundCategories: any[] = [];
    let shouldShowOrderForm = false;
    let placedOrder: { id: number; orderNumber: string } | null = null;

    // Detect intent from user message to force the right tool on the first turn
    function detectForcedTool(msg: string): { type: "function"; function: { name: string } } | "auto" {
      const m = msg.toLowerCase();
      if (/(categor|browse|types of|kya types|show all|sab products|sab categor|all categor)/i.test(msg)) {
        return { type: "function", function: { name: "search_categories" } };
      }
      if (/(order karna|place order|mujhe lena|mujhe chahiye|order chahiye|i want to (buy|order|purchase)|buy now|khareedna|order please|order dena)/i.test(msg)) {
        return { type: "function", function: { name: "trigger_order_form" } };
      }
      if (/(almond|cashew|pistachio|walnut|raisin|peanut|hazelnut|nut|dry fruit|price|kitna|kitne|kya hai|show me|available|stock|rate|product)/i.test(msg)) {
        return { type: "function", function: { name: "search_products" } };
      }
      return "auto";
    }
    const firstToolChoice = tools.length > 0 ? detectForcedTool(message.trim()) : undefined;

    for (let i = 0; i < 6; i++) {
      const toolChoice = i === 0 ? firstToolChoice : (tools.length > 0 ? "auto" : undefined);
      const completion = await aiClient.chat.completions.create({
        model: chatbot.aiModel ?? "gpt-4o-mini",
        messages: currentMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: toolChoice,
        max_completion_tokens: 600,
      });

      const choice = completion.choices[0];
      currentMessages.push(choice.message as any);

      if (choice.finish_reason === "stop" || !choice.message.tool_calls?.length) {
        const raw = choice.message.content ?? chatbot.fallbackMessage ?? "Let me check that for you. One moment.";
        const replyText = stripMarkdown(raw);
        const historyEntry: any = { role: "assistant", content: replyText, timestamp: new Date().toISOString() };
        if (foundProducts.length > 0) historyEntry.products = foundProducts;
        if (foundCategories.length > 0) historyEntry.categories = foundCategories;
        if (shouldShowOrderForm) historyEntry.type = "order_form";
        const finalHistory = [...updatedHistory, historyEntry];
        await db.update(chatSessionsTable).set({ messages: finalHistory, updatedAt: new Date() }).where(eq(chatSessionsTable.id, session.id));
        return res.json({
          message: replyText,
          sessionId: session.sessionId,
          ...(foundProducts.length > 0 && { products: foundProducts }),
          ...(foundCategories.length > 0 && { categories: foundCategories }),
          ...(shouldShowOrderForm && { showOrderForm: true }),
          ...(placedOrder && { orderPlaced: placedOrder }),
        });
      }

      for (const toolCall of choice.message.tool_calls!) {
        const fn = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        let toolResult: string;

        if (fn === "search_products") {
          const terms = expandQuery(args.query ?? "");
          const rows = await db
            .select({ id: productsTable.id, name: productsTable.name, price: productsTable.price, originalPrice: productsTable.originalPrice, stock: productsTable.stock, variants: productsTable.variants, images: productsTable.images })
            .from(productsTable).where(and(
              eq(productsTable.active, true),
              or(
                ...terms.map(t => ilike(productsTable.name, `%${t}%`)),
                ...terms.map(t => sql`coalesce(${productsTable.tags}::text, '') ILIKE ${`%${t}%`}`),
              )
            )).limit(6);

          if (rows.length > 0) {
            foundProducts = rows.map(p => {
              const imgs = (p.images as string[]) ?? [];
              const image = imgs[0] ?? null;
              const price = Number(p.price);
              const originalPrice = p.originalPrice ? Number(p.originalPrice) : null;
              const discount = originalPrice && originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : null;
              return { id: p.id, name: p.name, price, originalPrice, discount, stock: p.stock, variants: (p.variants as any[]) ?? [], image };
            });
            toolResult = rows.map(p => {
              const vs = (p.variants as any[]) ?? [];
              const varStr = vs.length > 0 ? ` Variants: ${vs.map((v: any) => `${v.name} Rs.${v.price ?? Number(p.price)}`).join(", ")}` : "";
              return `${p.name}: Rs. ${Number(p.price).toLocaleString()} (${p.stock > 0 ? `${p.stock} in stock` : "OUT OF STOCK"})${varStr}`;
            }).join("\n");
          } else {
            foundProducts = [];
            toolResult = "No products found matching that search.";
          }
        } else if (fn === "search_categories") {
          const rows = await db.select({ id: categoriesTable.id, name: categoriesTable.name, slug: categoriesTable.slug, imageUrl: categoriesTable.imageUrl }).from(categoriesTable).where(eq(categoriesTable.active, true)).limit(20);
          foundCategories = rows.map(c => ({ id: c.id, name: c.name, slug: c.slug, image: c.imageUrl ?? null }));
          toolResult = foundCategories.length > 0
            ? `Categories available: ${foundCategories.map(c => c.name).join(", ")}`
            : "No categories found.";
        } else if (fn === "trigger_order_form") {
          shouldShowOrderForm = true;
          toolResult = "Order form triggered. Customer will see interactive form.";
        } else if (fn === "place_order") {
          try {
            const items: any[] = args.items ?? [];
            const subtotal = items.reduce((s: number, it: any) => s + Number(it.price) * Number(it.qty), 0);
            const deliveryFee = 150;
            const total = subtotal + deliveryFee;
            const orderNumber = `KDF-${Date.now().toString().slice(-8)}`;
            const [order] = await db.insert(ordersTable).values({
              orderNumber, userId: userId ?? null, status: "pending", paymentStatus: "unpaid",
              subtotal: subtotal.toFixed(2), discount: "0.00", deliveryFee: deliveryFee.toFixed(2),
              loyaltyDiscount: "0.00", walletDiscount: "0.00", total: total.toFixed(2),
              paymentMethod: args.paymentMethod ?? "cod", deliveryType: "standard", courier: "tcs",
              shippingAddress: { name: args.customerName ?? "Customer", phone: args.phone, address: args.address, city: args.city, country: "Pakistan" },
              notes: "Order placed via AI Chat",
            }).returning();
            if (items.length > 0) {
              await db.insert(orderItemsTable).values(items.map((it: any) => ({
                orderId: order.id, productId: it.productId ?? null, name: it.name,
                variant: it.variant ?? null, price: Number(it.price).toFixed(2), qty: Number(it.qty),
              })));
            }
            placedOrder = { id: order.id, orderNumber: order.orderNumber };
            toolResult = `Order ${order.orderNumber} placed. Total Rs.${total}.`;
          } catch (e: any) {
            toolResult = `Failed to place order: ${e.message}`;
          }
        } else {
          toolResult = "Unknown function.";
        }
        currentMessages.push({ role: "tool", tool_call_id: toolCall.id, content: toolResult } as any);
      }
    }
    return res.status(500).json({ error: "AI loop exceeded. Please try again." });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ error: e.message ?? "Chat error" });
  }
});

/* ── POST /api/chat/direct-order ── */
router.post("/chat/direct-order", async (req, res) => {
  try {
    const { sessionId, items, product, qty, name, phone, city, address, paymentMethod, notes, customerEmail } = req.body as {
      sessionId?: string;
      items?: Array<{ name: string; variant?: string; variantId?: string; price: number; qty: number }>;
      product?: string; qty?: number;
      name: string; phone: string; city: string; address: string;
      paymentMethod?: string; notes?: string; customerEmail?: string;
    };
    const missing = [!name && "name", !phone && "phone", !city && "city", !address && "address"].filter(Boolean);
    if (missing.length) return res.status(400).json({ error: `Please fill in: ${missing.join(", ")}.` });

    /* Normalise items — support both multi-item cart and legacy single-product */
    const orderItems: Array<{ name: string; variant?: string; price: number; qty: number }> =
      Array.isArray(items) && items.length > 0
        ? items.map(i => ({ name: i.name, variant: i.variant ?? "", price: Number(i.price) || 0, qty: Number(i.qty) || 1 }))
        : [{ name: product ?? "Product", variant: "", price: 0, qty: Number(qty) || 1 }];

    const deliveryFee = 150;
    const subtotal = orderItems.reduce((s, i) => s + i.price * i.qty, 0);
    const total = subtotal + deliveryFee;

    const orderNumber = `KDF-${Date.now().toString().slice(-8)}`;
    const [order] = await db.insert(ordersTable).values({
      orderNumber, userId: null, status: "pending", paymentStatus: "unpaid",
      subtotal: subtotal.toFixed(2), discount: "0.00", deliveryFee: deliveryFee.toFixed(2),
      loyaltyDiscount: "0.00", walletDiscount: "0.00", total: total.toFixed(2),
      paymentMethod: paymentMethod ?? "cod", deliveryType: "standard", courier: "tcs",
      shippingAddress: { name, phone, address, city, country: "Pakistan" },
      notes: notes ? `Chat form order. ${notes}` : "Order placed via Chat Form",
    }).returning();

    await db.insert(orderItemsTable).values(orderItems.map(i => ({
      orderId: order.id, productId: null, name: i.name,
      variant: i.variant || null, price: i.price.toFixed(2), qty: i.qty,
    })));

    if (sessionId) {
      const [session] = await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.sessionId, sessionId)).limit(1);
      if (session) {
        const history: any[] = (session.messages as any[]) ?? [];
        const itemSummary = orderItems.map(i => `${i.name}${i.variant ? ` (${i.variant})` : ""} ×${i.qty}`).join(", ");
        history.push({ role: "user", content: `[Order] ${itemSummary} — Name: ${name}, Phone: ${phone}, City: ${city}`, timestamp: new Date().toISOString() });
        history.push({ role: "assistant", content: `Order ${orderNumber} placed. Total: Rs. ${total.toLocaleString()}.`, timestamp: new Date().toISOString() });
        await db.update(chatSessionsTable).set({ messages: history, updatedAt: new Date() }).where(eq(chatSessionsTable.id, session.id));
      }
    }

    /* Send email confirmation (non-blocking) */
    if (customerEmail) {
      import("../lib/email").then(({ sendOrderConfirmation }) => {
        sendOrderConfirmation({ orderNumber, customerName: name, phone, city, address, paymentMethod: paymentMethod ?? "cod", items: orderItems, subtotal, deliveryFee, total, customerEmail }).catch(() => {});
      }).catch(() => {});
    }

    return res.json({ orderNumber: order.orderNumber, orderId: order.id });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "Order creation failed" });
  }
});

/* ── GET /api/chat/session/:sessionId ── */
router.get("/chat/session/:sessionId", async (req, res) => {
  try {
    const [session] = await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.sessionId, req.params.sessionId)).limit(1);
    if (!session) return res.status(404).json({ error: "Session not found" });
    return res.json(session);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── GET /api/admin/chat/sessions ── */
router.get("/admin/chat/sessions", adminMiddleware as any, async (req, res) => {
  try {
    const sessions = await db.select().from(chatSessionsTable).orderBy(desc(chatSessionsTable.updatedAt)).limit(100);
    return res.json(sessions);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── POST /api/admin/chat/reply ── (supports plain text + template messages) */
router.post("/admin/chat/reply", adminMiddleware as any, async (req, res) => {
  try {
    const { sessionId, message, type, metadata } = req.body as {
      sessionId: string; message: string; type?: string; metadata?: any;
    };
    if (!sessionId || !message?.trim()) return res.status(400).json({ error: "sessionId and message are required" });

    const [session] = await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.sessionId, sessionId)).limit(1);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const history: any[] = (session.messages as any[]) ?? [];
    const entry: any = { role: "admin", content: message.trim(), timestamp: new Date().toISOString() };
    if (type) entry.type = type;
    if (metadata) entry.metadata = metadata;
    history.push(entry);

    const [updated] = await db.update(chatSessionsTable).set({ messages: history, updatedAt: new Date() }).where(eq(chatSessionsTable.id, session.id)).returning();
    return res.json({ success: true, session: updated });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── GET /api/admin/chat/products (unified product search for chat templates) ── */
router.get("/admin/chat/products", adminMiddleware as any, async (req, res) => {
  try {
    const { q = "", source = "all", categoryId, sort = "newest", limit = "16" } = req.query as Record<string, string>;
    const lim = Math.min(Number(limit) || 16, 40);

    let websiteProducts: any[] = [];
    let shopifyProducts: any[] = [];

    if (source !== "shopify") {
      const conditions: any[] = [eq(productsTable.active, true)];
      if (q) conditions.push(or(ilike(productsTable.name, `%${q}%`), sql`coalesce(${productsTable.tags}::text,'') ILIKE ${`%${q}%`}`));
      if (categoryId) conditions.push(eq(productsTable.categoryId, Number(categoryId)));
      const orderClause = sort === "price_asc" ? asc(sql`${productsTable.price}::numeric`)
        : sort === "price_desc" ? desc(sql`${productsTable.price}::numeric`)
        : desc(productsTable.createdAt);
      const rows = await db.select({
        id: productsTable.id, name: productsTable.name, price: productsTable.price,
        originalPrice: productsTable.originalPrice, stock: productsTable.stock,
        variants: productsTable.variants, images: productsTable.images, categoryId: productsTable.categoryId,
      }).from(productsTable).where(and(...conditions)).orderBy(orderClause).limit(lim);
      websiteProducts = rows.map(p => {
        const imgs = (p.images as string[]) ?? [];
        const price = Number(p.price);
        const originalPrice = p.originalPrice ? Number(p.originalPrice) : null;
        const discount = originalPrice && originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : null;
        return { id: p.id, name: p.name, price, originalPrice, discount, stock: p.stock, variants: (p.variants as any[]) ?? [], image: imgs[0] ?? null, source: "website" };
      });
    }

    if (source !== "website") {
      const shopifyConds: any[] = [eq(shopifyProductsTable.status, "active")];
      if (q) shopifyConds.push(ilike(shopifyProductsTable.title, `%${q}%`));
      const shopifyRows = await db.select({
        id: shopifyProductsTable.id, title: shopifyProductsTable.title,
        price: shopifyProductsTable.price, compareAtPrice: shopifyProductsTable.compareAtPrice,
        inventoryQuantity: shopifyProductsTable.inventoryQuantity,
        imageUrl: shopifyProductsTable.imageUrl, variants: shopifyProductsTable.variants,
        shopifyProductId: shopifyProductsTable.shopifyProductId,
      }).from(shopifyProductsTable).where(and(...shopifyConds)).orderBy(desc(shopifyProductsTable.createdAt)).limit(lim);
      shopifyProducts = shopifyRows.map(p => {
        const price = Number(p.price) || 0;
        const compareAt = p.compareAtPrice ? Number(p.compareAtPrice) : null;
        const discount = compareAt && compareAt > price ? Math.round(((compareAt - price) / compareAt) * 100) : null;
        const vars = (p.variants as any[]) ?? [];
        return {
          id: p.id, name: p.title, price, originalPrice: compareAt, discount,
          stock: p.inventoryQuantity ?? 0,
          variants: vars.map((v: any) => ({ id: String(v.id), name: "Size", value: v.title, price: Number(v.price), stock: v.inventoryQuantity ?? 0 })),
          image: p.imageUrl ?? null, source: "shopify", shopifyProductId: p.shopifyProductId,
        };
      });
    }

    const all = source === "shopify" ? shopifyProducts
      : source === "website" ? websiteProducts
      : [...websiteProducts, ...shopifyProducts].slice(0, lim);

    return res.json(all);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── DELETE /api/admin/chat/session/:id ── */
router.delete("/admin/chat/session/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(chatSessionsTable).where(eq(chatSessionsTable.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
