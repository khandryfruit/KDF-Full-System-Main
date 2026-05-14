import { Router } from "express";
import {
  db,
  chatSessionsTable,
  chatLeadsTable,
  chatbotSettingsTable,
  productsTable,
  categoriesTable,
  ordersTable,
  orderItemsTable,
  aiSettingsTable,
  sameDayDeliverySettingsTable,
  shopifyProductsTable,
  shopifyOrdersTable,
  shipmentsTable,
  couriersTable,
} from "@workspace/db";
import { eq, ilike, or, and, desc, sql, asc, inArray } from "drizzle-orm";
import { expandQuery } from "./search";
import { adminMiddleware } from "../lib/auth";
import { trackWithCourierApiForShopify } from "./couriers";
import { resolveOpenAIClient } from "../lib/resolveOpenAI";
import { logger } from "../lib/logger";

const router = Router();

/* ── Best-sellers cache (5-minute TTL) ── */
let _bsCache: Map<string, number> = new Map();
let _bsCacheTime = 0;
async function getBestSellers(): Promise<Map<string, number>> {
  if (Date.now() - _bsCacheTime < 5 * 60 * 1000) return _bsCache;
  try {
    const result = await db.execute(sql`
      SELECT lower(li->>'title') as title, COUNT(*)::int as cnt
      FROM shopify_orders, jsonb_array_elements(line_items) as li
      WHERE li->>'title' IS NOT NULL
      GROUP BY lower(li->>'title')
      ORDER BY cnt DESC
      LIMIT 100
    `);
    const map = new Map<string, number>();
    for (const row of (result as any).rows ?? (result as any)) {
      if (row.title) map.set(String(row.title), Number(row.cnt));
    }
    _bsCache = map;
    _bsCacheTime = Date.now();
  } catch { /* silently ignore */ }
  return _bsCache;
}

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
1. When user asks about ANY product, price, or availability → call search_products IMMEDIATELY with the EXACT product keyword the customer used. Never answer with product text.
2. When user asks to "show categories", "kya categories hain", or wants to browse → call search_categories IMMEDIATELY. Never list categories as text.
3. When user says "order karna hai", "buy", "mujhe chahiye", "place order" or clearly wants to buy → call trigger_order_form IMMEDIATELY. Never ask for details via chat.
4. After calling a tool, reply with 1–2 short natural sentences only. The cards/form appear automatically.
5. NEVER use markdown: no **bold**, no *italic*, no # headings, no bullet points with - or *.
6. Keep ALL replies to 2–3 lines max. Write like a WhatsApp support agent, not a chatbot.
7. Never say you are AI or automated. Use Rs. for prices. If user writes Urdu/Roman Urdu, reply in kind.
8. When customer mentions ANY product(s) with weight/quantity in one message → call auto_add_to_cart IMMEDIATELY with ALL products in the items array. CRITICAL: If multiple products are mentioned (e.g. "1kg almonds aur 500g pista", "badam aur kaju chahiye"), include ALL of them: items:[{query:"almonds",variantHint:"1kg",qty:1},{query:"pista",variantHint:"500g",qty:1}]. Never omit any mentioned product. Word map: badam=almonds, pista=pistachios, akhrot=walnuts, kaju=cashews, kishmish=raisins, mungphali=peanuts, anjeer=figs, khajoor=dates, chilgoza=pine nuts, moongphali=peanuts.
9. When customer says "human", "banda", "manager", "real person", "complaint", "nahi samajh raha", or repeats the same problem more than once → call escalate_to_human.
10. When customer asks for recommendations, best sellers, popular products, viral products, or seems undecided → call get_recommendations IMMEDIATELY. Never list products as text.
11. TRACKING/ORDER STATUS — CRITICAL: When customer asks about their order, parcel, tracking, delivery status, "mera order", "kahan hai", "dispatch hua", "delivered", "tracking number", "courier", "parcel", "shipment" → call track_order IMMEDIATELY. Pass any phone/order number they mention. If no details provided, ask ONCE for their phone number (03xx format), then call track_order with the phone.

CRITICAL PRODUCT SEARCH RULES:
- Pass the EXACT product name/keyword to search_products. If customer says "اخروٹ", pass query="اخروٹ". If they say "walnuts", pass query="walnuts". If they say "akhrot", pass query="akhrot".
- NEVER broaden the search. If customer asks for walnuts, search ONLY "walnuts" — not "nuts" or "dry fruits".
- The search system automatically handles Urdu↔English translation (اخروٹ=walnuts, بادام=almonds, کاجو=cashews, پستہ=pistachios, کشمش=raisins, خشک میوہ=dry fruits).
- Results are already filtered to show only the most relevant products. Trust the results shown.
- NEVER list product names, prices, or variants as text in your reply. After calling search_products, write ONLY 1 short sentence (e.g. "Yeh raha badam ka collection!" or "Walnut products mil gaye!"). The product cards appear automatically — do NOT repeat the info in text.`;

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

  tools.push(
    {
      type: "function",
      function: {
        name: "auto_add_to_cart",
        description: "Auto-detect products and add them to cart from natural language. ALWAYS call when customer mentions a product name + quantity/weight in voice or text (e.g. '1 kilo badam', '500 gram pista', 'mujhe 2 kg cashews chahiye', 'ek kilo almonds dena'). Word map: badam=almonds, pista=pistachios, akhrot=walnuts, kaju=cashews, kishmish=raisins, mungphali=peanuts, anjeer=figs, khajoor=dates.",
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Product name in any language (e.g. 'badam', 'almonds', 'pista')" },
                  variantHint: { type: "string", description: "Weight or size if mentioned (e.g. '1kg', '500g', '250g', '1 kilo', '500 gram')" },
                  qty: { type: "number", description: "Number of units to add, default 1" },
                },
                required: ["query", "qty"],
              },
            },
          },
          required: ["items"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_recommendations",
        description: "Show AI-powered product recommendations with Best Seller / Popular / Trending badges. MUST call when customer asks 'recommend something', 'what's popular', 'best seller', 'konsa le loon', 'suggest karo', 'kya acha hai', 'trending', 'most popular', 'top products', 'viral', or seems undecided about what to buy.",
        parameters: {
          type: "object",
          properties: {
            category: { type: "string", description: "Optional product category to filter (e.g. 'almonds', 'dates', 'nuts'). Leave empty for global best sellers." },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "escalate_to_human",
        description: "Show human agent contact options when customer asks for a real person, manager, human, or when AI has failed to resolve the issue after 2+ turns.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "track_order",
        description: "Look up a customer's order and live courier tracking status. MUST call immediately when customer asks about: order status, tracking, parcel, delivery, dispatch, 'mera order', 'kahan hai', 'mila nahi', 'tracking number', 'courier', 'shipment', 'parcel', 'delivered', 'COD', 'order confirm'. Pass phone/order_number/name if customer mentioned them.",
        parameters: {
          type: "object",
          properties: {
            phone:        { type: "string", description: "Customer phone number (03xx-xxxxxxx format or +92xxx)" },
            order_number: { type: "string", description: "Order number if customer mentioned it (e.g. #1234 or 1234 or KDF-1234)" },
            name:         { type: "string", description: "Customer name if mentioned" },
          },
          required: [],
        },
      },
    }
  );

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
    const { sessionId: rawSid, message, userId } = req.body as { sessionId?: string; message: string; userId?: number };
    const sessionId = typeof rawSid === "string" ? rawSid.trim() : rawSid != null ? String(rawSid).trim() : "";
    if (!message?.trim()) return res.status(400).json({ error: "message is required" });

    const [chatbot] = await db.select().from(chatbotSettingsTable).limit(1);
    if (!chatbot?.isEnabled) return res.status(503).json({ error: "Chatbot is currently disabled." });

    let session = sessionId
      ? (await db.select().from(chatSessionsTable).where(eq(chatSessionsTable.sessionId, sessionId)).limit(1))[0]
      : null;

    const newSessionId = sessionId || `widget_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

    const { client: aiClient, keyFromEnv } = await resolveOpenAIClient();
    if (keyFromEnv) {
      logger.info({ chat: "widget", keySource: "env" }, "OpenAI: using OPENAI_API_KEY (DB key empty)");
    }
    let currentMessages = [...openaiMessages];
    let foundProducts: any[] = [];
    let foundCategories: any[] = [];
    let shouldShowOrderForm = false;
    let placedOrder: { id: number; orderNumber: string } | null = null;
    let foundAutoCart: any[] = [];
    let shouldEscalate = false;
    let foundOrderStatus: any = null;

    // Detect intent from user message to force the right tool on the first turn
    function detectForcedTool(msg: string): { type: "function"; function: { name: string } } | "auto" {
      const m = msg.toLowerCase();
      /* Tracking FIRST — highest priority to prevent product search hijack */
      if (/(mera order|meri parcel|tracking|track|kahan hai|parcel|shipment|dispatch hua|delivered|deliver|courier|tracking number|order status|order confirm|cod|mila nahi|nahi mila|order kahan|parcel kahan|mujhe nahi mila|order update|delivery status|status batao|parcel status)/i.test(msg)) {
        return { type: "function", function: { name: "track_order" } };
      }
      if (/(categor|browse|types of|kya types|show all|sab products|sab categor|all categor)/i.test(msg)) {
        return { type: "function", function: { name: "search_categories" } };
      }
      if (/(human|banda|manager|real person|complaint|nahi samajh|escalate|agent chahiye|support agent|live support)/i.test(msg)) {
        return { type: "function", function: { name: "escalate_to_human" } };
      }
      if (/(order karna|place order|mujhe lena|order chahiye|i want to (buy|order|purchase)|buy now|khareedna|order please|order dena)/i.test(msg)) {
        return { type: "function", function: { name: "trigger_order_form" } };
      }
      if (/(\d+\s*(kilo|kg|gram|g|pound)|(ek|do|teen|char|panch|1|2|3|4|5)\s*(kilo|kg|gram|g)|(badam|pista|kaju|akhrot|kishmish|mungphali|anjeer|khajoor|chilgoza|moongphali).{0,20}\d|(almond|cashew|pistachio|walnut|raisin|peanut|fig|date).{0,20}\d|\d.{0,20}(badam|pista|kaju|akhrot))/i.test(msg)) {
        return { type: "function", function: { name: "auto_add_to_cart" } };
      }
      if (/(recommend|best seller|bestseller|popular|trending|konsa loon|konsa le|kya le|suggest|kya acha|viral|most order|sabse zyada|best quality|top products|popular products|kya popular|kya trending)/i.test(msg)) {
        return { type: "function", function: { name: "get_recommendations" } };
      }
      if (/(almond|cashew|pistachio|walnut|raisin|peanut|hazelnut|nut|dry fruit|price|kitna|kitne|kya hai|show me|available|stock|rate|product|badam|kaju|pista|akhrot|kishmish|khajoor|anjeer|chilgoza|rewari|گری|اخروٹ|بادام|کاجو|پستہ|کشمش|خشک میوہ)/i.test(msg)) {
        return { type: "function", function: { name: "search_products" } };
      }
      return "auto";
    }
    const firstToolChoice = tools.length > 0 ? detectForcedTool(message.trim()) : undefined;

    for (let i = 0; i < 6; i++) {
      const toolChoice = i === 0 ? firstToolChoice : (tools.length > 0 ? "auto" : undefined);
      let completion;
      try {
        completion = await aiClient.chat.completions.create({
          model: chatbot.aiModel ?? "gpt-4o-mini",
          messages: currentMessages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: toolChoice,
          max_completion_tokens: 600,
        });
      } catch (apiErr: any) {
        logger.error(
          { err: apiErr?.message, code: apiErr?.code, status: apiErr?.status, iteration: i },
          "chat/message OpenAI completions.create failed"
        );
        throw Object.assign(
          new Error(apiErr?.message || "OpenAI request failed. Check billing and API key."),
          { status: 502, code: "OPENAI_UPSTREAM" }
        );
      }

      const choice = completion?.choices?.[0];
      if (!choice?.message) {
        logger.warn({ choicesLen: completion?.choices?.length, iteration: i }, "chat/message empty OpenAI choice");
        throw Object.assign(new Error("The AI returned an empty response. Please try again."), { status: 502, code: "OPENAI_EMPTY_CHOICE" });
      }

      currentMessages.push(choice.message as any);

      if (!choice.message.tool_calls?.length) {
        const raw = choice.message.content ?? chatbot.fallbackMessage ?? "Let me check that for you. One moment.";
        const replyText = stripMarkdown(raw);
        const historyEntry: any = { role: "assistant", content: replyText, timestamp: new Date().toISOString() };
        if (foundProducts.length > 0) historyEntry.products = foundProducts;
        if (foundCategories.length > 0) historyEntry.categories = foundCategories;
        if (shouldShowOrderForm) historyEntry.type = "order_form";
        if (foundOrderStatus) historyEntry.orderStatus = foundOrderStatus;
        const finalHistory = [...updatedHistory, historyEntry];
        await db.update(chatSessionsTable).set({ messages: finalHistory, updatedAt: new Date() }).where(eq(chatSessionsTable.id, session.id));
        return res.json({
          message: replyText,
          sessionId: session.sessionId,
          ...(foundProducts.length > 0 && { products: foundProducts }),
          ...(foundCategories.length > 0 && { categories: foundCategories }),
          ...(shouldShowOrderForm && { showOrderForm: true }),
          ...(placedOrder && { orderPlaced: placedOrder }),
          ...(foundAutoCart.length > 0 && { autoCart: foundAutoCart }),
          ...(shouldEscalate && { escalateToHuman: true }),
          ...(foundOrderStatus && { orderStatus: foundOrderStatus }),
        });
      }

      for (const rawTool of choice.message.tool_calls!) {
        const toolCall = rawTool as { id: string; function: { name: string; arguments?: string } };
        const fn = toolCall.function?.name ?? "";
        let args: any;
        try {
          args = JSON.parse(toolCall.function?.arguments || "{}");
        } catch {
          logger.warn({ fn, iteration: i }, "chat/message invalid tool JSON from model");
          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: "Invalid tool arguments. Ask the customer to rephrase briefly.",
          } as any);
          continue;
        }
        let toolResult: string;

        if (fn === "search_products") {
          const query = String(args.query ?? "");
          const terms = expandQuery(query);
          const sellers = await getBestSellers();
          const rows = await db
            .select({
              id: shopifyProductsTable.id,
              title: shopifyProductsTable.title,
              price: shopifyProductsTable.price,
              compareAtPrice: shopifyProductsTable.compareAtPrice,
              imageUrl: shopifyProductsTable.imageUrl,
              variants: shopifyProductsTable.variants,
              inventoryQuantity: shopifyProductsTable.inventoryQuantity,
              productType: shopifyProductsTable.productType,
              tags: shopifyProductsTable.tags,
            })
            .from(shopifyProductsTable)
            .where(and(
              eq(shopifyProductsTable.status, "active"),
              or(
                ...terms.map(t => ilike(shopifyProductsTable.title, `%${t}%`)),
                ...terms.map(t => sql`coalesce(${shopifyProductsTable.tags}::text,'') ILIKE ${`%${t}%`}`),
                ...terms.map(t => ilike(shopifyProductsTable.productType, `%${t}%`)),
              )
            ))
            .orderBy(desc(shopifyProductsTable.inventoryQuantity))
            .limit(18);

          if (rows.length > 0) {
            // Score each product by relevance:
            // 30 = search term is at the VERY START of title (primary product, e.g. "Walnut Kernels...")
            // 20 = search term within first 35 chars of title (product is primarily this item)
            // 10 = search term appears later in title (likely ingredient in "Gift Box - Almonds, Walnuts...")
            //  5 = product type matches
            //  1 = tag-only match (lowest priority)
            const scored = rows.map(p => {
              const titleLow = p.title.toLowerCase();
              const typeLow = (p.productType ?? "").toLowerCase();
              let relevance = 0;
              for (const t of terms) {
                const tl = t.toLowerCase();
                const pos = titleLow.indexOf(tl);
                if (pos !== -1) {
                  if (pos === 0) relevance = Math.max(relevance, 30);
                  else if (pos <= 28) relevance = Math.max(relevance, 20);
                  else relevance = Math.max(relevance, 10);
                }
              }
              if (relevance === 0) {
                for (const t of terms) {
                  if (typeLow.includes(t.toLowerCase())) { relevance = 5; break; }
                }
              }
              if (relevance === 0) relevance = 1;
              return { ...p, relevance };
            });

            // If primary matches exist (term in first 35 chars of title), drop all weaker matches
            const hasPrimaryMatch = scored.some(p => p.relevance >= 20);
            const filtered = hasPrimaryMatch
              ? scored.filter(p => p.relevance >= 20)
              : scored.filter(p => p.relevance >= 5).length > 0
                ? scored.filter(p => p.relevance >= 5)
                : scored;

            const topSellers = Array.from(sellers.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);
            const ranked = filtered
              .map(p => ({ ...p, sellerScore: sellers.get(p.title.toLowerCase()) ?? 0 }))
              .sort((a, b) => b.relevance - a.relevance || b.sellerScore - a.sellerScore)
              .slice(0, 6);
            foundProducts = ranked.map(p => {
              const vars = (p.variants as any[]) ?? [];
              const minPrice = vars.length > 0 ? Math.min(...vars.map((v: any) => Number(v.price))) : Number(p.price);
              const compareAt = p.compareAtPrice ? Number(p.compareAtPrice) : null;
              const discount = compareAt && compareAt > minPrice ? Math.round(((compareAt - minPrice) / compareAt) * 100) : null;
              const sellerRank = topSellers.indexOf(p.title.toLowerCase());
              const badge = sellerRank >= 0 && sellerRank < 3 ? "Best Seller" : sellerRank < 7 ? "Popular" : p.score > 200 ? "Trending" : null;
              const inStock = (p.inventoryQuantity ?? 0) > 0 || vars.some((v: any) => (v.inventoryQuantity ?? 0) > 0);
              return {
                id: p.id,
                name: p.title,
                price: minPrice,
                originalPrice: compareAt,
                discount,
                stock: inStock ? Math.max(p.inventoryQuantity ?? 0, 1) : 0,
                variants: vars.map((v: any) => ({ id: String(v.id), name: v.title, value: v.title, price: Number(v.price), stock: v.inventoryQuantity ?? 0 })),
                image: p.imageUrl ?? null,
                badge,
              };
            });
            toolResult = ranked.map(p => {
              const vs = (p.variants as any[]) ?? [];
              const varStr = vs.length > 0 ? ` | ${vs.map((v: any) => `${v.title} Rs.${v.price}`).join(", ")}` : "";
              const stock = (p.inventoryQuantity ?? 0) > 0 ? "in stock" : "limited";
              return `${p.title}: Rs. ${Number(p.price).toLocaleString()} (${stock})${varStr}`;
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
        } else if (fn === "auto_add_to_cart") {
          const reqItems: Array<{ query: string; variantHint?: string; qty: number }> = args.items ?? [];
          const autoCartResult: any[] = [];

          // Helper: resolve a product query to a cart item (uses shopify_products)
          async function resolveProduct(query: string, variantHint: string | undefined, qty: number) {
            const terms = expandQuery(query);
            const rows = await db
              .select({
                id: shopifyProductsTable.id,
                title: shopifyProductsTable.title,
                price: shopifyProductsTable.price,
                variants: shopifyProductsTable.variants,
                imageUrl: shopifyProductsTable.imageUrl,
                inventoryQuantity: shopifyProductsTable.inventoryQuantity,
              })
              .from(shopifyProductsTable)
              .where(and(
                eq(shopifyProductsTable.status, "active"),
                or(...terms.map(t => ilike(shopifyProductsTable.title, `%${t}%`)))
              ))
              .orderBy(desc(shopifyProductsTable.inventoryQuantity))
              .limit(1);
            if (rows.length === 0) return null;
            const product = rows[0];
            const variants = (product.variants as any[]) ?? [];
            let selectedVariant: any = null;
            if (variants.length > 0 && variantHint) {
              const hint = variantHint.toLowerCase().replace(/\s/g, "").replace(/kilo/g, "kg").replace(/gram/g, "g").replace(/gm/g, "g");
              selectedVariant = variants.find((v: any) => {
                const vt = (v.title ?? "").toLowerCase().replace(/\s/g, "").replace(/kilo/g, "kg").replace(/gram/g, "g");
                return vt.includes(hint) || hint.includes(vt);
              });
            }
            if (!selectedVariant && variants.length > 0) selectedVariant = variants[0];
            const price = selectedVariant?.price ? Number(selectedVariant.price) : Number(product.price);
            return {
              productId: product.id,
              name: product.title,
              variant: selectedVariant?.title ?? null,
              variantId: selectedVariant?.id ? String(selectedVariant.id) : null,
              price,
              qty: Number(qty) || 1,
              image: product.imageUrl ?? null,
            };
          }

          for (const item of reqItems) {
            const result = await resolveProduct(item.query, item.variantHint, item.qty);
            if (result) autoCartResult.push(result);
          }

          // Server-side fallback: scan original message for any products the AI missed
          const PRODUCT_VOCAB: Array<{ words: string[]; search: string }> = [
            { words: ["pista", "pistachio", "pistachios"], search: "pistachio" },
            { words: ["badam", "almond", "almonds"], search: "almond" },
            { words: ["kaju", "cashew", "cashews"], search: "cashew" },
            { words: ["akhrot", "walnut", "walnuts"], search: "walnut" },
            { words: ["kishmish", "raisin", "raisins"], search: "raisin" },
            { words: ["mungphali", "moongphali", "peanut", "peanuts"], search: "peanut" },
            { words: ["anjeer", "fig", "figs"], search: "fig" },
            { words: ["khajoor", "date", "dates"], search: "date" },
            { words: ["chilgoza", "pine nut", "pine nuts"], search: "pine nut" },
          ];
          const msgLow = message.toLowerCase();
          const aiQueriedWords = new Set(reqItems.flatMap(it => it.query.toLowerCase().split(/\s+/)));
          const alreadyAddedIds = new Set(autoCartResult.map(r => r.productId));

          for (const { words, search } of PRODUCT_VOCAB) {
            const inMsg = words.find(w => msgLow.includes(w));
            if (!inMsg) continue;
            const alreadyQueried = words.some(w => aiQueriedWords.has(w));
            if (alreadyQueried) continue;

            // Extract weight closest to this keyword in the message
            const kIdx = msgLow.indexOf(inMsg);
            const nearby = msgLow.substring(Math.max(0, kIdx - 12), Math.min(msgLow.length, kIdx + 18));
            const wm = nearby.match(/(\d+)\s*(kg|kilo|gram|gm|g)\b/i);
            const variantHint = wm ? wm[1] + (wm[2].toLowerCase() === "kilo" ? "kg" : wm[2].toLowerCase().startsWith("gram") || wm[2].toLowerCase() === "gm" ? "g" : wm[2]) : undefined;

            const result = await resolveProduct(search, variantHint, 1);
            if (result && !alreadyAddedIds.has(result.productId)) {
              autoCartResult.push(result);
              alreadyAddedIds.add(result.productId);
            }
          }

          if (autoCartResult.length > 0) {
            foundAutoCart = autoCartResult;
            const summary = autoCartResult.map(i => `${i.name}${i.variant ? ` (${i.variant})` : ""} ×${i.qty} — Rs.${(i.price * i.qty).toLocaleString()}`).join(", ");
            toolResult = `Auto-added to cart: ${summary}. Total Rs.${autoCartResult.reduce((s, i) => s + i.price * i.qty, 0).toLocaleString()}. Now ask for delivery address and name.`;
          } else {
            toolResult = "Products not found. Will show search results.";
          }
        } else if (fn === "get_recommendations") {
          const category = args.category as string | undefined;
          const sellers = await getBestSellers();
          const whereConditions: any[] = [eq(shopifyProductsTable.status, "active")];
          if (category) {
            const catTerms = expandQuery(category);
            whereConditions.push(or(...catTerms.map(t => ilike(shopifyProductsTable.title, `%${t}%`))));
          }
          const recRows = await db
            .select({
              id: shopifyProductsTable.id,
              title: shopifyProductsTable.title,
              price: shopifyProductsTable.price,
              compareAtPrice: shopifyProductsTable.compareAtPrice,
              imageUrl: shopifyProductsTable.imageUrl,
              variants: shopifyProductsTable.variants,
              inventoryQuantity: shopifyProductsTable.inventoryQuantity,
            })
            .from(shopifyProductsTable)
            .where(and(...whereConditions))
            .orderBy(desc(shopifyProductsTable.inventoryQuantity))
            .limit(30);
          const ranked = recRows
            .map(p => ({ ...p, score: sellers.get(p.title.toLowerCase()) ?? 0 }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 6);
          if (ranked.length > 0) {
            foundProducts = ranked.map((p, idx) => {
              const vars = (p.variants as any[]) ?? [];
              const minPrice = vars.length > 0 ? Math.min(...vars.map((v: any) => Number(v.price))) : Number(p.price);
              const compareAt = p.compareAtPrice ? Number(p.compareAtPrice) : null;
              const discount = compareAt && compareAt > minPrice ? Math.round(((compareAt - minPrice) / compareAt) * 100) : null;
              const badge = idx === 0 ? "Best Seller" : idx === 1 ? "Most Popular" : idx < 4 ? "Trending" : null;
              return {
                id: p.id,
                name: p.title,
                price: minPrice,
                originalPrice: compareAt,
                discount,
                stock: p.inventoryQuantity ?? 0,
                variants: vars.map((v: any) => ({ id: String(v.id), name: v.title, value: v.title, price: Number(v.price), stock: v.inventoryQuantity ?? 0 })),
                image: p.imageUrl ?? null,
                badge,
                orderCount: p.score,
              };
            });
            toolResult = `Top recommendations: ${ranked.slice(0, 3).map(p => `${p.title} (${p.score} orders)`).join(", ")}. Show as product cards.`;
          } else {
            foundProducts = [];
            toolResult = "No recommendations available.";
          }
        } else if (fn === "escalate_to_human") {
          shouldEscalate = true;
          toolResult = "Human support escalation card will be shown to customer.";
        } else if (fn === "track_order") {
          /* ── Unified Smart Order Tracker ─────────────────────────────────
             Search: shopify_orders → shipments → live courier API
             Priority: order_number > phone > name (session lead phone fallback)
          ─────────────────────────────────────────────────────────────── */
          try {
            const rawPhone   = (args.phone ?? "") as string;
            const rawOrderNo = (args.order_number ?? "") as string;
            const rawName    = (args.name ?? "") as string;

            /* Normalize phone: 03xx → +923xx and vice versa for search */
            function normPhone(p: string) {
              const d = p.replace(/\D/g, "");
              if (d.startsWith("92") && d.length >= 12) return `+${d}`;
              if (d.startsWith("0") && d.length === 11) return `+92${d.slice(1)}`;
              return p.trim();
            }
            const phone03   = rawPhone ? rawPhone.replace(/\D/g, "").replace(/^92/, "0").slice(0, 11) : "";
            const phone92   = rawPhone ? normPhone(rawPhone) : "";
            const orderNo   = rawOrderNo.replace(/^#/, "").replace(/^KDF-/i, "").trim();

            /* Also check session lead for phone (customer already provided it) */
            let sessionPhone03 = "";
            let sessionPhone92 = "";
            if (!rawPhone && session?.sessionId) {
              const lead = (await db.select({ phone: chatLeadsTable.phone }).from(chatLeadsTable)
                .where(eq(chatLeadsTable.sessionId, session.sessionId)).limit(1))[0];
              if (lead?.phone) {
                sessionPhone03 = lead.phone.replace(/\D/g, "").replace(/^92/, "0").slice(0, 11);
                sessionPhone92 = normPhone(lead.phone);
              }
            }

            const searchPhone03 = phone03 || sessionPhone03;
            const searchPhone92 = phone92 || sessionPhone92;

            /* Build OR conditions for shopify_orders search */
            const orConds: any[] = [];
            if (orderNo) {
              orConds.push(
                eq(shopifyOrdersTable.orderNumber, orderNo),
                ilike(shopifyOrdersTable.orderNumber, `%${orderNo}%`),
              );
            }
            if (searchPhone03 || searchPhone92) {
              if (searchPhone03) orConds.push(ilike(shopifyOrdersTable.customerPhone, `%${searchPhone03}%`));
              if (searchPhone92) orConds.push(ilike(shopifyOrdersTable.customerPhone, `%${searchPhone92}%`));
              if (searchPhone03) orConds.push(sql`${shopifyOrdersTable.shippingAddress}->>'phone' ILIKE ${'%' + searchPhone03 + '%'}`);
            }
            if (rawName) {
              orConds.push(ilike(shopifyOrdersTable.customerName, `%${rawName}%`));
            }

            if (orConds.length === 0) {
              /* No search criteria — ask customer for phone */
              foundOrderStatus = { notFound: true, askPhone: true };
              toolResult = "NO_CRITERIA: Ask customer for their phone number (03xx format) to look up their order.";
            } else {
              const shopifyOrders = await db.select({
                id:                shopifyOrdersTable.id,
                shopifyOrderId:    shopifyOrdersTable.shopifyOrderId,
                orderNumber:       shopifyOrdersTable.orderNumber,
                customerName:      shopifyOrdersTable.customerName,
                customerPhone:     shopifyOrdersTable.customerPhone,
                status:            shopifyOrdersTable.status,
                fulfillmentStatus: shopifyOrdersTable.fulfillmentStatus,
                financialStatus:   shopifyOrdersTable.financialStatus,
                totalPrice:        shopifyOrdersTable.totalPrice,
                trackingNumber:    shopifyOrdersTable.trackingNumber,
                trackingUrl:       shopifyOrdersTable.trackingUrl,
                lineItems:         shopifyOrdersTable.lineItems,
                shippingAddress:   shopifyOrdersTable.shippingAddress,
                shopifyCreatedAt:  shopifyOrdersTable.shopifyCreatedAt,
              }).from(shopifyOrdersTable)
                .where(or(...orConds))
                .orderBy(desc(shopifyOrdersTable.shopifyCreatedAt))
                .limit(1);

              if (shopifyOrders.length === 0) {
                foundOrderStatus = { notFound: true };
                toolResult = "No order found for the given details. Inform customer politely. Ask them to check phone number or provide order number.";
              } else {
                const ord = shopifyOrders[0];

                /* Get shipment record */
                const shipmentConds: any[] = [eq(shipmentsTable.shopifyOrderId, ord.shopifyOrderId)];
                if (ord.customerPhone) shipmentConds.push(ilike(shipmentsTable.customerPhone, `%${(ord.customerPhone ?? "").replace(/\D/g,"").slice(-10)}%`));
                const shipments = await db.select().from(shipmentsTable)
                  .where(or(...shipmentConds))
                  .orderBy(desc(shipmentsTable.createdAt))
                  .limit(1);
                const ship = shipments[0] ?? null;

                /* Live courier tracking (async, 8s timeout) */
                let liveStatus: string | null = null;
                let liveStatusLabel = "";
                if (ship?.trackingId && ship?.courierId) {
                  try {
                    const [courierRow] = await db.select().from(couriersTable).where(eq(couriersTable.id, ship.courierId)).limit(1);
                    if (courierRow) {
                      const tracked = await Promise.race([
                        trackWithCourierApiForShopify(courierRow, ship.trackingId),
                        new Promise<null>(r => setTimeout(() => r(null), 8000)),
                      ]);
                      if (tracked) {
                        liveStatus = (tracked as any).status ?? ship.status;
                        /* Update shipment in DB with fresh status */
                        if (liveStatus !== ship.status) {
                          await db.update(shipmentsTable).set({ status: liveStatus as any, lastTrackedAt: new Date() }).where(eq(shipmentsTable.id, ship.id)).catch(() => {});
                        }
                      }
                    }
                  } catch { /* non-blocking */ }
                }

                const statusMap: Record<string, string> = {
                  pending: "Order Received", processing: "Processing", shipped: "Shipped",
                  in_transit: "In Transit", out_for_delivery: "Out for Delivery",
                  delivered: "Delivered", failed: "Delivery Failed", returned: "Returned",
                  unfulfilled: "Processing", partial: "Partially Fulfilled", fulfilled: "Fulfilled",
                };
                const courierNames: Record<string, string> = {
                  leopards: "Leopards Courier", tcs: "TCS Couriers", postex: "PostEx",
                  trax: "Trax", callcourier: "CallCourier", mp: "M&P Couriers",
                };
                const trackingStatus = liveStatus ?? ship?.status ?? ord.fulfillmentStatus ?? ord.status ?? "pending";
                liveStatusLabel = statusMap[trackingStatus] ?? trackingStatus;
                const courierName = ship?.courierSlug ? (courierNames[ship.courierSlug] ?? ship.courierSlug) : (ord.trackingNumber ? "Courier" : null);
                const trackingId  = ship?.trackingId ?? ord.trackingNumber ?? null;

                /* Build tracking URL */
                const trackingUrlMap: Record<string, string> = {
                  leopards: `https://leopardscourier.com/tracking?tracking_number=${trackingId}`,
                  tcs:      `https://www.tcsexpress.com/tracking/${trackingId}`,
                  postex:   `https://postex.pk/tracking/${trackingId}`,
                  trax:     `https://trax.pk/track/${trackingId}`,
                };
                const trackingUrl = ship?.courierSlug ? (trackingUrlMap[ship.courierSlug] ?? ord.trackingUrl) : ord.trackingUrl;

                const items = (ord.lineItems ?? []) as Array<{ title: string; quantity: number; price: string; variantTitle?: string }>;
                const addr  = ord.shippingAddress as { name?: string; city?: string; address1?: string } | null;

                foundOrderStatus = {
                  found:             true,
                  orderNumber:       ord.orderNumber,
                  customerName:      ord.customerName ?? addr?.name ?? "Customer",
                  phone:             ord.customerPhone,
                  status:            statusMap[ord.status] ?? ord.status,
                  fulfillmentStatus: liveStatusLabel,
                  financialStatus:   ord.financialStatus,
                  totalPrice:        ord.totalPrice,
                  courierName,
                  trackingId,
                  trackingUrl: trackingUrl ?? null,
                  dispatchedAt:  ship?.createdAt ? new Date(ship.createdAt).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : null,
                  city:          addr?.city ?? null,
                  items:         items.slice(0, 5).map(it => ({ name: it.title + (it.variantTitle ? ` (${it.variantTitle})` : ""), qty: it.quantity, price: it.price })),
                };

                toolResult = [
                  `ORDER FOUND — ${ord.orderNumber}`,
                  `Customer: ${ord.customerName}`,
                  `Status: ${liveStatusLabel}`,
                  `Courier: ${courierName ?? "Pending booking"}`,
                  `Tracking: ${trackingId ?? "Not assigned yet"}`,
                  `Total: Rs.${ord.totalPrice}`,
                  `Payment: ${ord.financialStatus}`,
                  items.length > 0 ? `Items: ${items.map(i => i.title + " x" + i.quantity).join(", ")}` : "",
                  trackingUrl ? `Track: ${trackingUrl}` : "",
                ].filter(Boolean).join("\n");
              }
            }
          } catch (trackErr: any) {
            foundOrderStatus = { error: true };
            toolResult = `Tracking lookup failed: ${trackErr.message}. Ask customer to contact support on WhatsApp.`;
          }
        } else {
          toolResult = "Unknown function.";
        }
        currentMessages.push({ role: "tool", tool_call_id: toolCall.id, content: toolResult } as any);
      }
    }
    return res.status(500).json({ error: "AI loop exceeded. Please try again." });
  } catch (e: any) {
    logger.error(
      { err: e?.message, code: e?.code, status: e?.status ?? e?.statusCode },
      "chat/message handler error"
    );
    return res.status(e.status ?? 500).json({
      error: e.message ?? "Chat error",
      ...(e.code && { code: e.code }),
    });
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

/* ── GET /api/admin/chat/ai-health — widget / OpenAI diagnostics (no secrets) ── */
router.get("/admin/chat/ai-health", adminMiddleware as any, async (_req, res) => {
  try {
    const [chatbot] = await db.select().from(chatbotSettingsTable).limit(1);
    const [ai] = await db.select().from(aiSettingsTable).limit(1);
    const hasEnvKey = !!(process.env.OPENAI_API_KEY ?? "").trim();
    const hasDbKey = !!(ai?.openaiApiKey ?? "").trim();
    let credentialsResolveOk = false;
    let credentialError: string | null = null;
    let keyFromEnv = false;
    try {
      const r = await resolveOpenAIClient();
      credentialsResolveOk = true;
      keyFromEnv = r.keyFromEnv;
    } catch (e: any) {
      credentialError = e.message ?? String(e);
    }
    return res.json({
      chatbotEnabled: chatbot?.isEnabled === true,
      aiEnabledInDb: ai?.aiEnabled === true,
      hasOpenAiKeyInDb: hasDbKey,
      hasOpenAiKeyInEnv: hasEnvKey,
      credentialsResolveOk,
      keyFromEnv,
      credentialError,
      widgetModel: chatbot?.aiModel ?? "gpt-4o-mini",
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── GET /api/admin/chat/sessions ── */
router.get("/admin/chat/sessions", adminMiddleware as any, async (req, res) => {
  try {
    const sessions = await db.select().from(chatSessionsTable).orderBy(desc(chatSessionsTable.updatedAt)).limit(100);
    /* Enrich each session with lead data (name, phone, source) by sessionId */
    const sessionIds = sessions.map(s => s.sessionId).filter(Boolean);
    let leadsMap: Record<string, { name: string; phone: string; source?: string | null }> = {};
    if (sessionIds.length) {
      const leads = await db.select({ sessionId: chatLeadsTable.sessionId, name: chatLeadsTable.name, phone: chatLeadsTable.phone, source: chatLeadsTable.source })
        .from(chatLeadsTable)
        .where(inArray(chatLeadsTable.sessionId, sessionIds));
      for (const l of leads) { if (l.sessionId) leadsMap[l.sessionId] = { name: l.name, phone: l.phone, source: l.source }; }
    }
    const enriched = sessions.map(s => ({ ...s, lead: leadsMap[s.sessionId] ?? null }));
    return res.json(enriched);
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

/* ════════════════════════════════════════════
   CHAT LEADS / CRM
════════════════════════════════════════════ */

/* ── POST /api/chat/lead — public, save pre-chat lead ── */
router.post("/chat/lead", async (req, res) => {
  try {
    const { name, phone, email, city, source, sessionId, visitSource, deviceInfo } = req.body ?? {};
    if (!name?.trim() || !phone?.trim()) {
      return res.status(400).json({ error: "Name and phone are required" });
    }
    const [lead] = await db.insert(chatLeadsTable).values({
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim() || null,
      city: city?.trim() || null,
      source: source || "kdf_nuts",
      sessionId: sessionId || null,
      visitSource: visitSource || null,
      deviceInfo: deviceInfo || null,
    }).returning();
    return res.status(201).json(lead);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── PATCH /api/chat/lead/activity — public, track product interest/cart/order per session ── */
router.patch("/chat/lead/activity", async (req, res) => {
  try {
    const { sessionId, productId, name, variant, price, qty, action } = req.body ?? {};
    if (!sessionId || !name || !action) return res.status(400).json({ error: "sessionId, name and action required" });
    const VALID_ACTIONS = ["view", "cart_add", "buy_now", "order_placed"];
    if (!VALID_ACTIONS.includes(action)) return res.status(400).json({ error: "Invalid action" });

    const [lead] = await db.select().from(chatLeadsTable).where(eq(chatLeadsTable.sessionId, sessionId)).limit(1);
    if (!lead) return res.status(204).end();

    const entry = { productId, name, variant: variant || undefined, price, qty: qty || 1, action, timestamp: new Date().toISOString() };
    const existing: any[] = (lead.interestedProducts as any[]) ?? [];

    const isAbandoned = action === "cart_add" || action === "buy_now";
    const existingAbandoned: any[] = (lead.cartAbandoned as any[]) ?? [];

    const deduped = existing.some(e => e.productId === productId && e.action === action && e.variant === entry.variant)
      ? existing : [...existing, entry];

    const abandonedDeduped = isAbandoned && !existingAbandoned.some(e => e.productId === productId && e.variant === entry.variant)
      ? [...existingAbandoned, entry] : existingAbandoned;

    const newStatus = action === "order_placed" ? "ordered" : lead.status;

    await db.update(chatLeadsTable).set({
      interestedProducts: deduped,
      ...(isAbandoned ? { cartAbandoned: abandonedDeduped } : {}),
      ...(newStatus !== lead.status ? { status: newStatus } : {}),
      updatedAt: new Date(),
    }).where(eq(chatLeadsTable.id, lead.id));

    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── POST /api/admin/chat/leads/bulk-wa — send WA message to multiple leads ── */
router.post("/admin/chat/leads/bulk-wa", adminMiddleware as any, async (req, res) => {
  try {
    const { leadIds, message, sendToAll, statusFilter } = req.body ?? {};
    if (!message?.trim()) return res.status(400).json({ error: "message required" });
    let targets: any[] = [];
    if (sendToAll) {
      const conditions: any[] = [];
      if (statusFilter) conditions.push(eq(chatLeadsTable.status, statusFilter));
      targets = await db.select({ id: chatLeadsTable.id, name: chatLeadsTable.name, phone: chatLeadsTable.phone })
        .from(chatLeadsTable).where(conditions.length ? and(...conditions) : undefined);
    } else {
      if (!Array.isArray(leadIds) || leadIds.length === 0) return res.status(400).json({ error: "leadIds required" });
      targets = await db.select({ id: chatLeadsTable.id, name: chatLeadsTable.name, phone: chatLeadsTable.phone })
        .from(chatLeadsTable).where(inArray(chatLeadsTable.id, leadIds));
    }
    res.json({ success: true, count: targets.length, message: `Bulk WA started for ${targets.length} leads` });
    const { sendWhatsAppMessage } = await import("../lib/whatsapp");
    void (async () => {
      for (const lead of targets) {
        try {
          const phone = lead.phone?.replace(/\D/g, "");
          if (!phone || phone.length < 10) continue;
          const msg = message.replace(/\{\{name\}\}/g, lead.name ?? "Customer").replace(/\{\{phone\}\}/g, lead.phone ?? "");
          await sendWhatsAppMessage({ phone, message: msg, templateName: "bulk_lead_campaign" });
          await new Promise(r => setTimeout(r, 2000));
        } catch {}
      }
    })();
    return;
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── GET /api/admin/chat/leads/export — CSV export (must be before :id routes) ── */
router.get("/admin/chat/leads/export", adminMiddleware as any, async (req, res) => {
  try {
    const leads = await db.select().from(chatLeadsTable).orderBy(desc(chatLeadsTable.createdAt));
    const rows = leads.map(l => {
      const products = ((l.interestedProducts as any[]) ?? []).map((p: any) => p.name).filter(Boolean).join("; ");
      return [
        l.id,
        `"${(l.name ?? "").replace(/"/g, '""')}"`,
        `"${(l.phone ?? "").replace(/"/g, '""')}"`,
        `"${(l.email ?? "").replace(/"/g, '""')}"`,
        `"${(l.city ?? "").replace(/"/g, '""')}"`,
        `"${(l.source ?? "").replace(/"/g, '""')}"`,
        `"${(l.status ?? "").replace(/"/g, '""')}"`,
        `"${products.replace(/"/g, '""')}"`,
        `"${new Date(l.createdAt).toLocaleString("en-PK")}"`,
      ].join(",");
    });
    const csv = ["ID,Name,Phone,Email,City,Source,Status,Interested Products,Date", ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="chat-leads-${Date.now()}.csv"`);
    return res.send(csv);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── GET /api/admin/chat/leads ── */
router.get("/admin/chat/leads", adminMiddleware as any, async (req, res) => {
  try {
    const { q, city, status, source, limit = "25", offset = "0" } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (q) conditions.push(or(ilike(chatLeadsTable.name, `%${q}%`), ilike(chatLeadsTable.phone, `%${q}%`), ilike(chatLeadsTable.email!, `%${q}%`)));
    if (city) conditions.push(ilike(chatLeadsTable.city!, `%${city}%`));
    if (status) conditions.push(eq(chatLeadsTable.status, status));
    if (source) conditions.push(eq(chatLeadsTable.source, source));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [leads, countRows] = await Promise.all([
      db.select().from(chatLeadsTable).where(where).orderBy(desc(chatLeadsTable.createdAt)).limit(Number(limit)).offset(Number(offset)),
      db.select({ count: sql<number>`count(*)::int` }).from(chatLeadsTable).where(where),
    ]);
    return res.json({ leads, total: countRows[0]?.count ?? 0 });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── PUT /api/admin/chat/leads/:id/status ── */
router.put("/admin/chat/leads/:id/status", adminMiddleware as any, async (req, res) => {
  try {
    const { status } = req.body ?? {};
    const VALID = ["new", "contacted", "interested", "ordered", "follow_up", "converted"];
    if (!VALID.includes(status)) return res.status(400).json({ error: "Invalid status" });
    const [lead] = await db.update(chatLeadsTable).set({ status, updatedAt: new Date() }).where(eq(chatLeadsTable.id, Number(req.params.id))).returning();
    return res.json(lead);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── DELETE /api/admin/chat/leads/:id ── */
router.delete("/admin/chat/leads/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(chatLeadsTable).where(eq(chatLeadsTable.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── GET /api/chat/products/search (public — no auth — fast product picker for order form) ── */
router.get("/chat/products/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 12, 24);
    if (!q) return res.json({ products: [] });

    const rows = await db.select({
      id: shopifyProductsTable.id,
      title: shopifyProductsTable.title,
      price: shopifyProductsTable.price,
      compareAtPrice: shopifyProductsTable.compareAtPrice,
      inventoryQuantity: shopifyProductsTable.inventoryQuantity,
      imageUrl: shopifyProductsTable.imageUrl,
      variants: shopifyProductsTable.variants,
    })
    .from(shopifyProductsTable)
    .where(and(
      eq(shopifyProductsTable.status, "active"),
      or(
        ilike(shopifyProductsTable.title, `%${q}%`),
        ilike(shopifyProductsTable.title, `%${expandQuery(q)}%`),
      )
    ))
    .orderBy(desc(shopifyProductsTable.updatedAt))
    .limit(limit);

    const products = rows.map(p => {
      const price = Number(p.price) || 0;
      const compareAt = p.compareAtPrice ? Number(p.compareAtPrice) : null;
      const discount = compareAt && compareAt > price ? Math.round(((compareAt - price) / compareAt) * 100) : null;
      const vars = (p.variants as any[]) ?? [];
      return {
        id: p.id,
        name: p.title,
        price,
        originalPrice: compareAt,
        discount,
        stock: p.inventoryQuantity ?? 0,
        variants: vars.map((v: any) => ({
          id: String(v.id),
          value: v.title,
          price: Number(v.price) || price,
          stock: v.inventoryQuantity ?? 0,
        })),
        image: p.imageUrl ?? null,
      };
    });

    return res.json({ products });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* ── POST /api/chat/image-search (camera product detection via OpenAI Vision) ── */
router.post("/chat/image-search", async (req, res) => {
  try {
    const { image } = req.body ?? {};
    if (!image || typeof image !== "string") return res.status(400).json({ error: "image required" });

    const { client: openai } = await resolveOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a product identifier for a premium dry fruits & nuts e-commerce store.
Carefully examine the image and identify the primary product shown.

Reply with ONLY one English product name from this list (no punctuation, no extra words):
almonds, walnuts, cashews, pistachios, dates, raisins, figs, pine nuts, peanuts, apricots, hazelnuts, mixed nuts, seeds, honey, dry fruits, gift box

Rules:
- If a bag/package/bowl is shown, identify what is INSIDE it
- Focus on the most prominent or closest item
- If you see a mix of multiple nuts, reply: mixed nuts
- If truly unidentifiable, reply: unknown`
          },
          { type: "image_url", image_url: { url: image, detail: "auto" } },
        ],
      }],
      max_tokens: 15,
    });

    const detected = (completion.choices[0]?.message?.content ?? "unknown").trim().toLowerCase()
      .replace(/[^a-z\s]/g, "").trim();
    if (!detected || detected === "unknown") return res.json({ detected: "unknown", products: [] });

    const expanded = expandQuery(detected);
    const searchTerms = [...new Set([detected, ...expanded])];

    const rows = await db.select({
      id: shopifyProductsTable.id,
      title: shopifyProductsTable.title,
      price: shopifyProductsTable.price,
      compareAtPrice: shopifyProductsTable.compareAtPrice,
      inventoryQuantity: shopifyProductsTable.inventoryQuantity,
      imageUrl: shopifyProductsTable.imageUrl,
      variants: shopifyProductsTable.variants,
    })
    .from(shopifyProductsTable)
    .where(and(
      eq(shopifyProductsTable.status, "active"),
      or(...searchTerms.map(t => ilike(shopifyProductsTable.title, `%${t}%`)))
    ))
    .orderBy(desc(shopifyProductsTable.updatedAt))
    .limit(8);

    const products = rows.map(p => {
      const price = Number(p.price) || 0;
      const compareAt = p.compareAtPrice ? Number(p.compareAtPrice) : null;
      const discount = compareAt && compareAt > price ? Math.round(((compareAt - price) / compareAt) * 100) : null;
      const vars = (p.variants as any[]) ?? [];
      return {
        id: p.id, name: p.title, price, originalPrice: compareAt, discount, stock: p.inventoryQuantity ?? 0,
        variants: vars.map((v: any) => ({ id: String(v.id), value: v.title, price: Number(v.price) || price, stock: v.inventoryQuantity ?? 0 })),
        image: p.imageUrl ?? null,
      };
    });

    return res.json({ detected, products });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
