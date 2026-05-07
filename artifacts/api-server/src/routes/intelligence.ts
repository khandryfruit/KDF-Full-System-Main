import { Router } from "express";
import { db } from "@workspace/db";
import { shopifyOrdersTable, shopifyStoresTable, shopifyCustomersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

/* ─── Segment computation ─────────────────────────────── */
type CustomerStats = {
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  returnedOrders: number;
  totalSpent: number;
};

type Segment = "HIGH_VALUE" | "RISKY" | "LOW_INTENT" | "REPEAT" | "NEW";

function computeSegment(s: CustomerStats): Segment {
  const rate = s.totalOrders > 0 ? (s.deliveredOrders / s.totalOrders) * 100 : 0;
  const cancelRate = s.totalOrders > 0 ? (s.cancelledOrders / s.totalOrders) * 100 : 0;

  if (s.totalSpent >= 5000 && s.deliveredOrders >= 2)       return "HIGH_VALUE";
  if (s.totalOrders >= 3 && rate < 50)                      return "RISKY";
  if (s.totalOrders >= 3 && cancelRate >= 50 && rate < 30)  return "LOW_INTENT";
  if (s.deliveredOrders >= 2)                               return "REPEAT";
  return "NEW";
}

/* ─── Raw aggregation query ───────────────────────────── */
async function getCustomerAggregates() {
  const result = await db.execute(sql`
    SELECT
      COALESCE(customer_phone, customer_email)           AS customer_key,
      customer_phone,
      customer_email,
      MAX(customer_name)                                 AS customer_name,
      shopify_customer_id,
      COUNT(*)::int                                      AS total_orders,
      SUM(CASE WHEN fulfillment_status = 'fulfilled'
               THEN 1 ELSE 0 END)::int                  AS delivered_orders,
      SUM(CASE WHEN financial_status IN ('refunded','partially_refunded')
               THEN 1 ELSE 0 END)::int                  AS returned_orders,
      SUM(CASE WHEN financial_status = 'voided'
               THEN 1 ELSE 0 END)::int                  AS cancelled_orders,
      COALESCE(SUM(total_price::numeric), 0)             AS total_spent,
      MAX(shopify_created_at)                            AS last_order_at,
      MIN(shopify_created_at)                            AS first_order_at,
      STRING_AGG(DISTINCT COALESCE(
        (shipping_address->>'city'), ''), ', ')          AS cities,
      (SELECT STRING_AGG(title, ', ')
       FROM (
         SELECT DISTINCT li->>'title' AS title
         FROM shopify_orders o2,
              jsonb_array_elements(COALESCE(o2.line_items, '[]'::jsonb)) li
         WHERE COALESCE(o2.customer_phone, o2.customer_email)
             = COALESCE(shopify_orders.customer_phone, shopify_orders.customer_email)
         LIMIT 3
       ) t)                                              AS top_products
    FROM shopify_orders
    WHERE customer_phone IS NOT NULL OR customer_email IS NOT NULL
    GROUP BY COALESCE(customer_phone, customer_email),
             customer_phone, customer_email, shopify_customer_id
    ORDER BY total_orders DESC
  `);
  return result.rows as any[];
}

/* ─── Helper: shopify store ──────────────────────────── */
async function getStore() {
  const [store] = await db.select().from(shopifyStoresTable)
    .where(eq(shopifyStoresTable.isConnected, true)).limit(1);
  return store ?? null;
}

/* ══════════════════════════════════════════════════════
   GET /admin/intelligence/overview
   ══════════════════════════════════════════════════════ */
router.get("/admin/intelligence/overview", adminMiddleware as any, async (req, res) => {
  try {
    const rows = await getCustomerAggregates();

    const segmentCounts: Record<Segment, number> = {
      HIGH_VALUE: 0, RISKY: 0, LOW_INTENT: 0, REPEAT: 0, NEW: 0,
    };
    let totalDelivered = 0, totalOrdersAll = 0, totalRevenue = 0;
    const cityMap: Record<string, number> = {};

    for (const row of rows) {
      const stats: CustomerStats = {
        totalOrders:    Number(row.total_orders),
        deliveredOrders:Number(row.delivered_orders),
        cancelledOrders:Number(row.cancelled_orders),
        returnedOrders: Number(row.returned_orders),
        totalSpent:     Number(row.total_spent),
      };
      segmentCounts[computeSegment(stats)]++;
      totalDelivered   += stats.deliveredOrders;
      totalOrdersAll   += stats.totalOrders;
      totalRevenue     += stats.totalSpent;

      for (const city of (row.cities ?? "").split(", ")) {
        const c = city.trim();
        if (c) cityMap[c] = (cityMap[c] ?? 0) + 1;
      }
    }

    const topCities = Object.entries(cityMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([city, count]) => ({ city, count }));

    const [orderTotal] = await db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM shopify_orders`
    ).then(r => r.rows as any[]);

    return res.json({
      totalCustomers:  rows.length,
      totalOrders:     Number(orderTotal?.cnt ?? 0),
      avgDeliveryRate: totalOrdersAll > 0
        ? Math.round((totalDelivered / totalOrdersAll) * 100) : 0,
      totalRevenue:    Math.round(totalRevenue),
      segments:        segmentCounts,
      topCities,
    });
  } catch (e: any) {
    logger.warn({ err: e.message }, "intelligence/overview error");
    return res.status(500).json({ error: e.message });
  }
});

/* ══════════════════════════════════════════════════════
   GET /admin/intelligence/customers
   ══════════════════════════════════════════════════════ */
router.get("/admin/intelligence/customers", adminMiddleware as any, async (req, res) => {
  try {
    const segment = (req.query.segment as string) || "ALL";
    const search  = ((req.query.search  as string) || "").toLowerCase();
    const page    = Math.max(1, Number(req.query.page  ?? 1));
    const limit   = Math.min(100, Math.max(10, Number(req.query.limit ?? 50)));

    const rows = await getCustomerAggregates();

    const enriched = rows.map(row => {
      const stats: CustomerStats = {
        totalOrders:    Number(row.total_orders),
        deliveredOrders:Number(row.delivered_orders),
        cancelledOrders:Number(row.cancelled_orders),
        returnedOrders: Number(row.returned_orders),
        totalSpent:     Number(row.total_spent),
      };
      const seg = computeSegment(stats);
      const deliveryRate = stats.totalOrders > 0
        ? Math.round((stats.deliveredOrders / stats.totalOrders) * 100) : 0;
      return {
        customerKey:     row.customer_key,
        phone:           row.customer_phone,
        email:           row.customer_email,
        name:            row.customer_name || "Unknown",
        shopifyCustomerId: row.shopify_customer_id,
        segment:         seg,
        deliveryRate,
        ...stats,
        totalSpent:      Math.round(stats.totalSpent),
        lastOrderAt:     row.last_order_at,
        firstOrderAt:    row.first_order_at,
        topProducts:     row.top_products ?? null,
      };
    });

    const filtered = enriched.filter(c => {
      if (segment !== "ALL" && c.segment !== segment) return false;
      if (search) {
        const hay = `${c.name} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const total   = filtered.length;
    const offset  = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    return res.json({ customers: paginated, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (e: any) {
    logger.warn({ err: e.message }, "intelligence/customers error");
    return res.status(500).json({ error: e.message });
  }
});

/* ══════════════════════════════════════════════════════
   GET /admin/intelligence/products
   Product delivery intelligence
   ══════════════════════════════════════════════════════ */
router.get("/admin/intelligence/products", adminMiddleware as any, async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        li->>'title'                                        AS product_title,
        li->>'sku'                                          AS sku,
        COUNT(*)::int                                       AS total_orders,
        SUM(CASE WHEN o.fulfillment_status = 'fulfilled'
                 THEN 1 ELSE 0 END)::int                   AS delivered_orders,
        SUM(CASE WHEN o.financial_status IN ('refunded','partially_refunded')
                 THEN 1 ELSE 0 END)::int                   AS returned_orders,
        COALESCE(SUM((li->>'price')::numeric * (li->>'quantity')::int), 0) AS revenue
      FROM shopify_orders o,
           jsonb_array_elements(COALESCE(o.line_items, '[]'::jsonb)) AS li
      WHERE li->>'title' IS NOT NULL
      GROUP BY li->>'title', li->>'sku'
      ORDER BY total_orders DESC
      LIMIT 100
    `);

    const products = (result.rows as any[]).map(row => {
      const total     = Number(row.total_orders);
      const delivered = Number(row.delivered_orders);
      const returned  = Number(row.returned_orders);
      const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;
      const returnRate   = total > 0 ? Math.round((returned  / total) * 100) : 0;
      const risk = returnRate >= 40 ? "HIGH_RISK"
                 : deliveryRate >= 70 ? "HIGH_CONVERSION" : "NORMAL";
      return {
        title: row.product_title,
        sku:   row.sku ?? null,
        totalOrders: total,
        deliveredOrders: delivered,
        returnedOrders:  returned,
        deliveryRate,
        returnRate,
        revenue: Math.round(Number(row.revenue)),
        risk,
      };
    });

    return res.json({ products });
  } catch (e: any) {
    logger.warn({ err: e.message }, "intelligence/products error");
    return res.status(500).json({ error: e.message });
  }
});

/* ══════════════════════════════════════════════════════
   GET /admin/intelligence/audiences
   Filtered customer lists for marketing
   ══════════════════════════════════════════════════════ */
router.get("/admin/intelligence/audiences", adminMiddleware as any, async (req, res) => {
  try {
    const rows = await getCustomerAggregates();

    const audienceMap: Record<Segment, any[]> = {
      HIGH_VALUE: [], RISKY: [], LOW_INTENT: [], REPEAT: [], NEW: [],
    };

    for (const row of rows) {
      const stats: CustomerStats = {
        totalOrders:    Number(row.total_orders),
        deliveredOrders:Number(row.delivered_orders),
        cancelledOrders:Number(row.cancelled_orders),
        returnedOrders: Number(row.returned_orders),
        totalSpent:     Number(row.total_spent),
      };
      const seg = computeSegment(stats);
      audienceMap[seg].push({
        name:            row.customer_name || "Unknown",
        phone:           row.customer_phone,
        email:           row.customer_email,
        totalOrders:     stats.totalOrders,
        deliveredOrders: stats.deliveredOrders,
        totalSpent:      Math.round(stats.totalSpent),
        deliveryRate: stats.totalOrders > 0
          ? Math.round((stats.deliveredOrders / stats.totalOrders) * 100) : 0,
        lastOrderAt: row.last_order_at,
      });
    }

    const summaries = (Object.keys(audienceMap) as Segment[]).map(seg => ({
      segment: seg,
      count:   audienceMap[seg].length,
      withPhone: audienceMap[seg].filter(c => c.phone).length,
      withEmail: audienceMap[seg].filter(c => c.email).length,
    }));

    return res.json({ summaries, audiences: audienceMap });
  } catch (e: any) {
    logger.warn({ err: e.message }, "intelligence/audiences error");
    return res.status(500).json({ error: e.message });
  }
});

/* ══════════════════════════════════════════════════════
   POST /admin/intelligence/sync-tags
   Push segment tags back to Shopify for customers
   that have a shopifyCustomerId
   ══════════════════════════════════════════════════════ */
router.post("/admin/intelligence/sync-tags", adminMiddleware as any, async (req, res) => {
  try {
    const store = await getStore();
    if (!store?.accessToken) {
      return res.status(400).json({ error: "Shopify store not connected" });
    }

    const rows = await getCustomerAggregates();
    const SEGMENT_TAG_MAP: Record<Segment, string> = {
      HIGH_VALUE: "HIGH_VALUE",
      RISKY:      "RISKY_CUSTOMER",
      LOW_INTENT: "LOW_INTENT",
      REPEAT:     "REPEAT_BUYER",
      NEW:        "NEW_CUSTOMER",
    };
    const ALL_TAGS = Object.values(SEGMENT_TAG_MAP);

    let synced = 0, failed = 0;

    for (const row of rows) {
      if (!row.shopify_customer_id) continue;
      const stats: CustomerStats = {
        totalOrders:    Number(row.total_orders),
        deliveredOrders:Number(row.delivered_orders),
        cancelledOrders:Number(row.cancelled_orders),
        returnedOrders: Number(row.returned_orders),
        totalSpent:     Number(row.total_spent),
      };
      const seg = computeSegment(stats);
      const newTag = SEGMENT_TAG_MAP[seg];

      try {
        /* Fetch existing tags first */
        const getResp = await fetch(
          `https://${store.shopDomain}/admin/api/2024-01/customers/${row.shopify_customer_id}.json?fields=id,tags`,
          { headers: { "X-Shopify-Access-Token": store.accessToken } }
        );
        if (!getResp.ok) { failed++; continue; }
        const { customer } = await getResp.json() as any;
        const existingTags = (customer.tags ?? "").split(",").map((t: string) => t.trim()).filter(Boolean);
        const cleaned = existingTags.filter((t: string) => !ALL_TAGS.includes(t));
        cleaned.push(newTag);

        const putResp = await fetch(
          `https://${store.shopDomain}/admin/api/2024-01/customers/${row.shopify_customer_id}.json`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": store.accessToken,
            },
            body: JSON.stringify({ customer: { id: row.shopify_customer_id, tags: cleaned.join(", ") } }),
          }
        );
        putResp.ok ? synced++ : failed++;
      } catch { failed++; }

      await new Promise(r => setTimeout(r, 200)); // rate limit
    }

    logger.info({ synced, failed }, "Shopify tag sync complete");
    return res.json({ success: true, synced, failed, total: rows.filter(r => r.shopify_customer_id).length });
  } catch (e: any) {
    logger.warn({ err: e.message }, "intelligence/sync-tags error");
    return res.status(500).json({ error: e.message });
  }
});

export default router;
