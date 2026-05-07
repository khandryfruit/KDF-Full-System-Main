import { Router } from "express";
import { eq, desc, sql, ilike } from "drizzle-orm";
import { db } from "@workspace/db";
import { branchesTable } from "@workspace/db/schema";
import { adminMiddleware } from "../lib/auth";

const router = Router();

/* ═══════════════════════════════════════════════════════
   LIST BRANCHES
══════════════════════════════════════════════════════ */
router.get("/admin/branches", adminMiddleware, async (req, res) => {
  try {
    const branches = await db
      .select()
      .from(branchesTable)
      .orderBy(desc(branchesTable.isHeadOffice), branchesTable.name);
    res.json({ branches });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   CREATE BRANCH
══════════════════════════════════════════════════════ */
router.post("/admin/branches", adminMiddleware, async (req, res) => {
  try {
    const { name, slug, city, address, phone, whatsappNumber, managerName, managerPhone, email, monthlyTarget, isHeadOffice } = req.body;
    if (!name || !city) {
      res.status(400).json({ error: "name and city are required" });
      return;
    }
    const autoSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const [branch] = await db.insert(branchesTable).values({
      name, slug: autoSlug, city,
      address: address ?? null,
      phone: phone ?? null,
      whatsappNumber: whatsappNumber ?? null,
      managerName: managerName ?? null,
      managerPhone: managerPhone ?? null,
      email: email ?? null,
      monthlyTarget: monthlyTarget ?? null,
      isHeadOffice: isHeadOffice ?? false,
      isActive: true,
    }).returning();
    res.status(201).json({ branch });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   UPDATE BRANCH
══════════════════════════════════════════════════════ */
router.put("/admin/branches/:id", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { name, city, address, phone, whatsappNumber, managerName, managerPhone, email, monthlyTarget, isActive, isHeadOffice } = req.body;
    const [branch] = await db
      .update(branchesTable)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(address !== undefined ? { address } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(whatsappNumber !== undefined ? { whatsappNumber } : {}),
        ...(managerName !== undefined ? { managerName } : {}),
        ...(managerPhone !== undefined ? { managerPhone } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(monthlyTarget !== undefined ? { monthlyTarget } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(isHeadOffice !== undefined ? { isHeadOffice } : {}),
        updatedAt: new Date(),
      })
      .where(eq(branchesTable.id, id))
      .returning();
    if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
    res.json({ branch });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   DELETE BRANCH
══════════════════════════════════════════════════════ */
router.delete("/admin/branches/:id", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    await db.delete(branchesTable).where(eq(branchesTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   BRANCH STATS (per-branch analytics)
══════════════════════════════════════════════════════ */
router.get("/admin/branches/:id/stats", adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, id)).limit(1);
    if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }

    const cityPattern = `%${branch.city}%`;

    /* Orders for this branch city */
    const orderStats = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE)::int AS today_orders,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE))::int AS month_orders,
        COALESCE(SUM(total_price::numeric), 0)::numeric AS total_revenue,
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN total_price::numeric ELSE 0 END), 0)::numeric AS today_revenue,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN total_price::numeric ELSE 0 END), 0)::numeric AS month_revenue,
        COUNT(*) FILTER (WHERE financial_status = 'paid')::int AS paid_orders,
        COUNT(*) FILTER (WHERE financial_status != 'paid')::int AS cod_orders,
        COUNT(*) FILTER (WHERE fulfillment_status = 'fulfilled')::int AS fulfilled_orders,
        COUNT(*) FILTER (WHERE status = 'cancelled' OR financial_status = 'refunded')::int AS cancelled_orders
      FROM shopify_orders
      WHERE (shipping_address->>'city') ILIKE ${cityPattern}
        AND created_at >= NOW() - INTERVAL '90 days'
    `);

    /* Rider stats for this branch */
    const riderStats = await db.execute(sql`
      SELECT
        COUNT(DISTINCT r.id)::int AS total_riders,
        COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'active')::int AS active_riders,
        COUNT(rd.id)::int AS total_deliveries,
        COUNT(rd.id) FILTER (WHERE rd.status = 'delivered')::int AS delivered,
        COUNT(rd.id) FILTER (WHERE rd.status IN ('assigned','picked','out_for_delivery'))::int AS in_progress,
        COUNT(rd.id) FILTER (WHERE DATE(rd.assigned_at) = CURRENT_DATE)::int AS today_deliveries,
        COALESCE(SUM(CASE WHEN rd.status = 'delivered' THEN rd.cod_amount ELSE 0 END), 0)::numeric AS cod_collected
      FROM riders r
      LEFT JOIN rider_deliveries rd ON rd.rider_id = r.id AND rd.city ILIKE ${cityPattern}
      WHERE r.status != 'inactive'
    `);

    /* Top products for this branch */
    const topProducts = await db.execute(sql`
      SELECT
        li->>'title' AS product,
        SUM((li->>'quantity')::int) AS total_qty
      FROM shopify_orders so,
        jsonb_array_elements(so.line_items::jsonb) AS li
      WHERE (so.shipping_address->>'city') ILIKE ${cityPattern}
        AND so.created_at >= date_trunc('month', CURRENT_DATE)
      GROUP BY li->>'title'
      ORDER BY total_qty DESC
      LIMIT 5
    `);

    /* Daily revenue last 7 days */
    const dailyRevenue = await db.execute(sql`
      SELECT
        DATE(created_at) AS day,
        COUNT(*)::int AS orders,
        COALESCE(SUM(total_price::numeric), 0)::numeric AS revenue
      FROM shopify_orders
      WHERE (shipping_address->>'city') ILIKE ${cityPattern}
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    const os = (orderStats.rows?.[0] ?? {}) as any;
    const rs = (riderStats.rows?.[0] ?? {}) as any;

    res.json({
      branch,
      orders: {
        total: os.total_orders ?? 0,
        today: os.today_orders ?? 0,
        thisMonth: os.month_orders ?? 0,
        paid: os.paid_orders ?? 0,
        cod: os.cod_orders ?? 0,
        fulfilled: os.fulfilled_orders ?? 0,
        cancelled: os.cancelled_orders ?? 0,
      },
      revenue: {
        total: Number(os.total_revenue ?? 0),
        today: Number(os.today_revenue ?? 0),
        thisMonth: Number(os.month_revenue ?? 0),
      },
      riders: {
        total: rs.total_riders ?? 0,
        active: rs.active_riders ?? 0,
        deliveries: rs.total_deliveries ?? 0,
        delivered: rs.delivered ?? 0,
        inProgress: rs.in_progress ?? 0,
        todayDeliveries: rs.today_deliveries ?? 0,
        codCollected: Number(rs.cod_collected ?? 0),
      },
      topProducts: topProducts.rows ?? [],
      dailyRevenue: dailyRevenue.rows ?? [],
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   CENTRAL DASHBOARD (all branches combined)
══════════════════════════════════════════════════════ */
router.get("/admin/branches/dashboard", adminMiddleware, async (req, res) => {
  try {
    const branches = await db
      .select()
      .from(branchesTable)
      .where(eq(branchesTable.isActive, true))
      .orderBy(desc(branchesTable.isHeadOffice), branchesTable.name);

    /* Global totals */
    const globalStats = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE)::int AS today_orders,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE))::int AS month_orders,
        COALESCE(SUM(total_price::numeric), 0)::numeric AS total_revenue,
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN total_price::numeric ELSE 0 END), 0)::numeric AS today_revenue,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN total_price::numeric ELSE 0 END), 0)::numeric AS month_revenue
      FROM shopify_orders
      WHERE created_at >= NOW() - INTERVAL '90 days'
    `);

    /* Per-branch order counts */
    const branchOrders = await db.execute(sql`
      SELECT
        (shipping_address->>'city') AS city,
        COUNT(*)::int AS orders,
        COALESCE(SUM(total_price::numeric), 0)::numeric AS revenue,
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE)::int AS today_orders,
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN total_price::numeric ELSE 0 END), 0)::numeric AS today_revenue
      FROM shopify_orders
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
      GROUP BY (shipping_address->>'city')
      ORDER BY orders DESC
      LIMIT 20
    `);

    /* Rider global stats */
    const riderGlobal = await db.execute(sql`
      SELECT
        COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'active')::int AS active_riders,
        COUNT(rd.id)::int AS total_deliveries,
        COUNT(rd.id) FILTER (WHERE rd.status = 'delivered')::int AS delivered,
        COUNT(rd.id) FILTER (WHERE DATE(rd.assigned_at) = CURRENT_DATE)::int AS today_deliveries,
        COALESCE(SUM(CASE WHEN rd.status = 'delivered' THEN rd.cod_amount ELSE 0 END), 0)::numeric AS cod_collected
      FROM riders r
      LEFT JOIN rider_deliveries rd ON rd.rider_id = r.id
    `);

    /* Daily revenue last 14 days */
    const dailyRevenue = await db.execute(sql`
      SELECT
        TO_CHAR(DATE(created_at), 'Mon DD') AS day,
        DATE(created_at) AS raw_date,
        COUNT(*)::int AS orders,
        COALESCE(SUM(total_price::numeric), 0)::numeric AS revenue
      FROM shopify_orders
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE(created_at)
      ORDER BY raw_date ASC
    `);

    /* Webhook activity (last 10) */
    const recentWebhooks = await db.execute(sql`
      SELECT topic, shopify_id, processed, error, received_at
      FROM shopify_webhook_logs
      ORDER BY received_at DESC
      LIMIT 10
    `);

    /* Top cities this month */
    const topCities = await db.execute(sql`
      SELECT
        (shipping_address->>'city') AS city,
        COUNT(*)::int AS orders,
        COALESCE(SUM(total_price::numeric), 0)::numeric AS revenue
      FROM shopify_orders
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
        AND shipping_address->>'city' IS NOT NULL
      GROUP BY (shipping_address->>'city')
      ORDER BY orders DESC
      LIMIT 10
    `);

    const gs = (globalStats.rows?.[0] ?? {}) as any;
    const rg = (riderGlobal.rows?.[0] ?? {}) as any;

    res.json({
      global: {
        totalOrders: gs.total_orders ?? 0,
        todayOrders: gs.today_orders ?? 0,
        monthOrders: gs.month_orders ?? 0,
        totalRevenue: Number(gs.total_revenue ?? 0),
        todayRevenue: Number(gs.today_revenue ?? 0),
        monthRevenue: Number(gs.month_revenue ?? 0),
        activeRiders: rg.active_riders ?? 0,
        totalDeliveries: rg.total_deliveries ?? 0,
        todayDeliveries: rg.today_deliveries ?? 0,
        codCollected: Number(rg.cod_collected ?? 0),
      },
      branches,
      branchOrders: branchOrders.rows ?? [],
      dailyRevenue: dailyRevenue.rows ?? [],
      recentWebhooks: recentWebhooks.rows ?? [],
      topCities: topCities.rows ?? [],
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   SEED DEFAULT BRANCHES (Khan Dry Fruits locations)
══════════════════════════════════════════════════════ */
router.post("/admin/branches/seed", adminMiddleware, async (req, res) => {
  try {
    const existing = await db.select().from(branchesTable).limit(1);
    if (existing.length > 0) {
      res.json({ ok: true, message: "Branches already seeded", count: existing.length });
      return;
    }
    const defaults = [
      { name: "Khan Dry Fruits — Lahore (Head Office)", slug: "lahore-hq", city: "Lahore", isHeadOffice: true, address: "Main Market, Lahore", managerName: "Branch Manager" },
      { name: "Khan Dry Fruits — Islamabad", slug: "islamabad", city: "Islamabad", isHeadOffice: false, address: "F-10 Markaz, Islamabad", managerName: "Branch Manager" },
      { name: "Khan Dry Fruits — Karachi", slug: "karachi", city: "Karachi", isHeadOffice: false, address: "Tariq Road, Karachi", managerName: "Branch Manager" },
      { name: "Khan Dry Fruits — Peshawar", slug: "peshawar", city: "Peshawar", isHeadOffice: false, address: "Saddar, Peshawar", managerName: "Branch Manager" },
    ];
    const inserted = await db.insert(branchesTable).values(defaults).returning();
    res.json({ ok: true, branches: inserted });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
