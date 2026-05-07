import { Router } from "express";
import { db, couponsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

router.get("/coupons", adminMiddleware as any, async (req, res) => {
  try {
    const coupons = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
    res.json(coupons);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/coupons", adminMiddleware as any, async (req, res) => {
  try {
    const { code, type, value, ...rest } = req.body;
    if (!code || !type || !value) { res.status(400).json({ error: "code, type, and value are required" }); return; }
    const [coupon] = await db.insert(couponsTable).values({ code: code.toUpperCase(), type, value, ...rest }).returning();
    res.status(201).json(coupon);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create coupon" });
  }
});

router.put("/coupons/:id", adminMiddleware as any, async (req, res) => {
  try {
    const { usedCount, ...rest } = req.body;
    const [coupon] = await db.update(couponsTable).set(rest).where(eq(couponsTable.id, parseInt(req.params.id))).returning();
    if (!coupon) { res.status(404).json({ error: "Not found" }); return; }
    res.json(coupon);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.delete("/coupons/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(couponsTable).where(eq(couponsTable.id, parseInt(req.params.id)));
    res.json({ success: true, message: "Coupon deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/coupons/validate", async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    if (!code) { res.status(400).json({ error: "code is required" }); return; }

    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code.toUpperCase())).limit(1);

    if (!coupon || !coupon.active) {
      res.json({ valid: false, message: "Invalid or expired coupon" });
      return;
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      res.json({ valid: false, message: "Coupon has expired" });
      return;
    }

    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      res.json({ valid: false, message: "Coupon usage limit reached" });
      return;
    }

    const total = parseFloat(orderTotal ?? "0");
    if (coupon.minOrder && total < parseFloat(coupon.minOrder)) {
      res.json({ valid: false, message: `Minimum order ₨${coupon.minOrder} required` });
      return;
    }

    const discount = coupon.type === "percentage"
      ? (total * parseFloat(coupon.value) / 100).toFixed(2)
      : Math.min(parseFloat(coupon.value), total).toFixed(2);

    res.json({ valid: true, discount, coupon });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
