import { Router } from "express";
import { db, walletTransactionsTable, loyaltyTransactionsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { authMiddleware, adminMiddleware, type AuthRequest } from "../lib/auth";
import type { Response } from "express";

const router = Router();

function getTier(points: number): string {
  if (points >= 10000) return "Platinum";
  if (points >= 5000) return "Gold";
  if (points >= 2000) return "Silver";
  return "Bronze";
}

router.get("/wallet/balance", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await db.select({ balance: sql<string>`coalesce(sum(case when type='credit' then amount else -amount end), 0)::text` })
      .from(walletTransactionsTable).where(eq(walletTransactionsTable.userId, userId));
    res.json({ userId, balance: result[0]?.balance ?? "0" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/wallet/transactions", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const targetUserId = req.user?.role === "admin" && req.query.userId
      ? parseInt(req.query.userId as string)
      : req.user!.id;

    const [items, countResult, balanceResult] = await Promise.all([
      db.select().from(walletTransactionsTable).where(eq(walletTransactionsTable.userId, targetUserId))
        .orderBy(desc(walletTransactionsTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(walletTransactionsTable).where(eq(walletTransactionsTable.userId, targetUserId)),
      db.select({ balance: sql<string>`coalesce(sum(case when type='credit' then amount else -amount end), 0)::text` })
        .from(walletTransactionsTable).where(eq(walletTransactionsTable.userId, targetUserId)),
    ]);

    res.json({ items, balance: balanceResult[0]?.balance ?? "0", total: Number(countResult[0]?.count ?? 0), page });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/wallet/adjust", adminMiddleware as any, async (req, res) => {
  try {
    const { userId, amount, type, description } = req.body;
    if (!userId || !amount || !type || !description) {
      res.status(400).json({ error: "userId, amount, type, and description are required" });
      return;
    }
    await db.insert(walletTransactionsTable).values({ userId, amount, type, description });
    const result = await db.select({ balance: sql<string>`coalesce(sum(case when type='credit' then amount else -amount end), 0)::text` })
      .from(walletTransactionsTable).where(eq(walletTransactionsTable.userId, userId));
    res.json({ userId, balance: result[0]?.balance ?? "0" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/loyalty/balance", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await db.select({ points: sql<number>`coalesce(sum(case when type='credit' then points else -points end), 0)` })
      .from(loyaltyTransactionsTable).where(eq(loyaltyTransactionsTable.userId, userId));
    const points = Number(result[0]?.points ?? 0);
    const value = (points / 10).toFixed(2);
    res.json({ userId, points, value, tier: getTier(points) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/loyalty/transactions", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const targetUserId = req.user?.role === "admin" && req.query.userId
      ? parseInt(req.query.userId as string)
      : req.user!.id;

    const [items, countResult, pointsResult] = await Promise.all([
      db.select().from(loyaltyTransactionsTable).where(eq(loyaltyTransactionsTable.userId, targetUserId))
        .orderBy(desc(loyaltyTransactionsTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(loyaltyTransactionsTable).where(eq(loyaltyTransactionsTable.userId, targetUserId)),
      db.select({ points: sql<number>`coalesce(sum(case when type='credit' then points else -points end), 0)` })
        .from(loyaltyTransactionsTable).where(eq(loyaltyTransactionsTable.userId, targetUserId)),
    ]);

    res.json({ items, points: Number(pointsResult[0]?.points ?? 0), total: Number(countResult[0]?.count ?? 0), page });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
