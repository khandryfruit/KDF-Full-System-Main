import { Router } from "express";
import { db, ordersTable, usersTable, productsTable, abandonedCheckoutsTable, whatsappLogsTable, whatsappCampaignsTable } from "@workspace/db";
import { shopifyEmailCampaignsTable } from "@workspace/db";
import { eq, sql, desc, gte, and } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import { orderItemsTable } from "@workspace/db";

const router = Router();

function safeNum(v: any, fallback = 0): number {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? fallback : n;
}

router.get("/admin/dashboard", adminMiddleware as any, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      statsResult,
      recentOrders,
      usersCount,
      productsCount,
      abandonedStats,
      todayStats,
      monthStats,
      waStats,
      waCampaignStats,
      emailCampaignStats,
      newCustomers,
    ] = await Promise.all([
      /* All-time order stats */
      db.select({
        totalOrders:      sql<number>`count(*)`,
        totalRevenue:     sql<number>`coalesce(sum(total::numeric), 0)`,
        avgOrderValue:    sql<number>`coalesce(avg(total::numeric), 0)`,
        pendingOrders:    sql<number>`count(*) filter (where status = 'pending')`,
        processingOrders: sql<number>`count(*) filter (where status = 'processing')`,
        shippedOrders:    sql<number>`count(*) filter (where status = 'shipped')`,
        deliveredOrders:  sql<number>`count(*) filter (where status = 'delivered')`,
        cancelledOrders:  sql<number>`count(*) filter (where status = 'cancelled')`,
        confirmedOrders:  sql<number>`count(*) filter (where status = 'confirmed')`,
        outForDelivery:   sql<number>`count(*) filter (where status = 'out_for_delivery')`,
        paidOrders:       sql<number>`count(*) filter (where payment_status = 'paid')`,
        unpaidOrders:     sql<number>`count(*) filter (where payment_status = 'unpaid')`,
      }).from(ordersTable),

      /* Recent 5 orders */
      db.select({
        id: ordersTable.id,
        orderNumber: ordersTable.orderNumber,
        status: ordersTable.status,
        total: ordersTable.total,
        paymentStatus: ordersTable.paymentStatus,
        createdAt: ordersTable.createdAt,
        shippingAddress: ordersTable.shippingAddress,
      }).from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(5),

      /* Users count */
      db.select({ count: sql<number>`count(*)` }).from(usersTable),

      /* Active products */
      db.select({ count: sql<number>`count(*)` }).from(productsTable).where(eq(productsTable.active, true)),

      /* Abandoned checkouts */
      db.select({
        total:     sql<number>`count(*)`,
        active:    sql<number>`count(*) filter (where status = 'active')`,
        recovered: sql<number>`count(*) filter (where status = 'recovered')`,
        totalValue: sql<number>`coalesce(sum(subtotal::numeric), 0)`,
      }).from(abandonedCheckoutsTable),

      /* Today stats */
      db.select({
        orders:  sql<number>`count(*)`,
        revenue: sql<number>`coalesce(sum(total::numeric), 0)`,
      }).from(ordersTable).where(gte(ordersTable.createdAt, todayStart)),

      /* This month stats */
      db.select({
        orders:  sql<number>`count(*)`,
        revenue: sql<number>`coalesce(sum(total::numeric), 0)`,
      }).from(ordersTable).where(gte(ordersTable.createdAt, monthStart)),

      /* WA logs aggregate */
      db.select({
        total:     sql<number>`count(*)`,
        sent:      sql<number>`count(*) filter (where status = 'sent')`,
        received:  sql<number>`count(*) filter (where status = 'received')`,
        failed:    sql<number>`count(*) filter (where status = 'failed')`,
        delivered: sql<number>`count(*) filter (where delivery_status = 'delivered')`,
        read:      sql<number>`count(*) filter (where delivery_status = 'read')`,
      }).from(whatsappLogsTable),

      /* WA campaigns aggregate */
      db.select({
        total:       sql<number>`count(*)`,
        sent:        sql<number>`coalesce(sum(sent_count), 0)`,
        delivered:   sql<number>`coalesce(sum(delivered_count), 0)`,
        read:        sql<number>`coalesce(sum(read_count), 0)`,
        failed:      sql<number>`coalesce(sum(failed_count), 0)`,
        recipients:  sql<number>`coalesce(sum(recipient_count), 0)`,
        active:      sql<number>`count(*) filter (where status = 'sent')`,
        draft:       sql<number>`count(*) filter (where status = 'draft')`,
      }).from(whatsappCampaignsTable),

      /* Email campaigns */
      db.select({
        total: sql<number>`count(*)`,
        sent:  sql<number>`count(*) filter (where status = 'sent')`,
        draft: sql<number>`count(*) filter (where status = 'draft')`,
      }).from(shopifyEmailCampaignsTable),

      /* New customers in last 30 days */
      db.select({ count: sql<number>`count(*)` }).from(usersTable)
        .where(gte(usersTable.createdAt, thirtyDaysAgo)),
    ]);

    const s = statsResult[0];
    const totalOrders = safeNum(s?.totalOrders);
    const deliveredOrders = safeNum(s?.deliveredOrders);
    const abandonedTotal = safeNum(abandonedStats[0]?.total);
    const recoveredCheckouts = safeNum(abandonedStats[0]?.recovered);
    const conversionRate = (totalOrders + safeNum(abandonedStats[0]?.active)) > 0
      ? parseFloat(((totalOrders / (totalOrders + safeNum(abandonedStats[0]?.active))) * 100).toFixed(1))
      : 0;
    const recoveryRate = abandonedTotal > 0
      ? parseFloat(((recoveredCheckouts / abandonedTotal) * 100).toFixed(1))
      : 0;

    res.json({
      totalOrders,
      totalRevenue: safeNum(s?.totalRevenue),
      avgOrderValue: parseFloat(safeNum(s?.avgOrderValue).toFixed(0)),
      totalUsers: safeNum(usersCount[0]?.count),
      newCustomers30d: safeNum(newCustomers[0]?.count),
      totalProducts: safeNum(productsCount[0]?.count),
      pendingOrders:    safeNum(s?.pendingOrders),
      processingOrders: safeNum(s?.processingOrders),
      shippedOrders:    safeNum(s?.shippedOrders),
      deliveredOrders,
      cancelledOrders:  safeNum(s?.cancelledOrders),
      confirmedOrders:  safeNum(s?.confirmedOrders),
      outForDelivery:   safeNum(s?.outForDelivery),
      paidOrders:       safeNum(s?.paidOrders),
      unpaidOrders:     safeNum(s?.unpaidOrders),
      todayOrders:   safeNum(todayStats[0]?.orders),
      todayRevenue:  safeNum(todayStats[0]?.revenue),
      monthOrders:   safeNum(monthStats[0]?.orders),
      monthRevenue:  safeNum(monthStats[0]?.revenue),
      abandonedCheckouts: safeNum(abandonedStats[0]?.active),
      recoveredCheckouts,
      abandonedValue: safeNum(abandonedStats[0]?.totalValue),
      recoveryRate,
      whatsapp: {
        total:     safeNum(waStats[0]?.total),
        sent:      safeNum(waStats[0]?.sent),
        received:  safeNum(waStats[0]?.received),
        failed:    safeNum(waStats[0]?.failed),
        delivered: safeNum(waStats[0]?.delivered),
        read:      safeNum(waStats[0]?.read),
      },
      campaigns: {
        total:      safeNum(waCampaignStats[0]?.total),
        sent:       safeNum(waCampaignStats[0]?.sent),
        delivered:  safeNum(waCampaignStats[0]?.delivered),
        read:       safeNum(waCampaignStats[0]?.read),
        failed:     safeNum(waCampaignStats[0]?.failed),
        recipients: safeNum(waCampaignStats[0]?.recipients),
      },
      emailCampaigns: {
        total: safeNum(emailCampaignStats[0]?.total),
        sent:  safeNum(emailCampaignStats[0]?.sent),
        draft: safeNum(emailCampaignStats[0]?.draft),
      },
      conversionRate,
      recentOrders,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get dashboard stats" });
  }
});

router.get("/admin/analytics", adminMiddleware as any, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [orderStats, dailyRevenue, topProducts, abandonedStats, waStats, paymentStats] = await Promise.all([
      db.select({
        totalOrders:    sql<number>`count(*)`,
        totalRevenue:   sql<number>`coalesce(sum(total::numeric), 0)`,
        avgOrderValue:  sql<number>`coalesce(avg(total::numeric), 0)`,
        paidOrders:     sql<number>`count(*) filter (where payment_status = 'paid')`,
        unpaidOrders:   sql<number>`count(*) filter (where payment_status = 'unpaid')`,
        pendingPayment: sql<number>`count(*) filter (where payment_status = 'pending')`,
        paidRevenue:    sql<number>`coalesce(sum(total::numeric) filter (where payment_status = 'paid'), 0)`,
        pendingRevenue: sql<number>`coalesce(sum(total::numeric) filter (where payment_status != 'paid'), 0)`,
        deliveredOrders: sql<number>`count(*) filter (where status = 'delivered')`,
        cancelledOrders: sql<number>`count(*) filter (where status = 'cancelled')`,
      }).from(ordersTable),

      db.select({
        date:    sql<string>`date_trunc('day', created_at)::date::text`,
        revenue: sql<number>`coalesce(sum(total::numeric), 0)`,
        orders:  sql<number>`count(*)`,
      }).from(ordersTable)
        .where(gte(ordersTable.createdAt, thirtyDaysAgo))
        .groupBy(sql`date_trunc('day', created_at)`)
        .orderBy(sql`date_trunc('day', created_at)`),

      db.select({
        name:         orderItemsTable.name,
        totalQty:     sql<number>`sum(qty)`,
        totalRevenue: sql<number>`coalesce(sum(price::numeric * qty), 0)`,
      }).from(orderItemsTable)
        .groupBy(orderItemsTable.name)
        .orderBy(sql`sum(qty) desc`)
        .limit(10),

      db.select({
        total:      sql<number>`count(*)`,
        active:     sql<number>`count(*) filter (where status = 'active')`,
        recovered:  sql<number>`count(*) filter (where status = 'recovered')`,
        expired:    sql<number>`count(*) filter (where status = 'expired')`,
        totalValue: sql<number>`coalesce(sum(subtotal::numeric), 0)`,
        activeValue: sql<number>`coalesce(sum(subtotal::numeric) filter (where status = 'active'), 0)`,
      }).from(abandonedCheckoutsTable),

      db.select({
        total:  sql<number>`count(*)`,
        sent:   sql<number>`count(*) filter (where status = 'sent')`,
        failed: sql<number>`count(*) filter (where status = 'failed')`,
      }).from(whatsappLogsTable),

      db.select({
        method:  ordersTable.paymentMethod,
        count:   sql<number>`count(*)`,
        revenue: sql<number>`coalesce(sum(total::numeric), 0)`,
      }).from(ordersTable)
        .groupBy(ordersTable.paymentMethod)
        .orderBy(sql`count(*) desc`),
    ]);

    const totalOrders = safeNum(orderStats[0]?.totalOrders);
    const abandonedTotal = safeNum(abandonedStats[0]?.total);
    const recoveredCheckouts = safeNum(abandonedStats[0]?.recovered);
    const conversionRate = (totalOrders + safeNum(abandonedStats[0]?.active)) > 0
      ? parseFloat(((totalOrders / (totalOrders + safeNum(abandonedStats[0]?.active))) * 100).toFixed(1))
      : 0;
    const recoveryRate = abandonedTotal > 0
      ? parseFloat(((recoveredCheckouts / abandonedTotal) * 100).toFixed(1))
      : 0;

    res.json({
      orders: {
        total: totalOrders,
        revenue: safeNum(orderStats[0]?.totalRevenue),
        avgOrderValue: safeNum(orderStats[0]?.avgOrderValue),
        paid: safeNum(orderStats[0]?.paidOrders),
        unpaid: safeNum(orderStats[0]?.unpaidOrders),
        pendingPayment: safeNum(orderStats[0]?.pendingPayment),
        paidRevenue: safeNum(orderStats[0]?.paidRevenue),
        pendingRevenue: safeNum(orderStats[0]?.pendingRevenue),
        delivered: safeNum(orderStats[0]?.deliveredOrders),
        cancelled: safeNum(orderStats[0]?.cancelledOrders),
      },
      dailyRevenue,
      topProducts,
      abandoned: {
        total: abandonedTotal,
        active: safeNum(abandonedStats[0]?.active),
        recovered: recoveredCheckouts,
        expired: safeNum(abandonedStats[0]?.expired),
        totalValue: safeNum(abandonedStats[0]?.totalValue),
        activeValue: safeNum(abandonedStats[0]?.activeValue),
        recoveryRate,
      },
      whatsapp: {
        total: safeNum(waStats[0]?.total),
        sent: safeNum(waStats[0]?.sent),
        failed: safeNum(waStats[0]?.failed),
      },
      paymentMethods: paymentStats,
      conversionRate,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get analytics" });
  }
});

export default router;
