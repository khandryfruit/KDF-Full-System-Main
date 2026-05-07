import { Router } from "express";
import { db, failedOrdersTable, ordersTable, orderItemsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

/* List failed orders — admin only */
router.get("/admin/failed-orders", adminMiddleware as any, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(failedOrdersTable)
      .orderBy(desc(failedOrdersTable.createdAt))
      .limit(100);
    return res.json(rows);
  } catch (e: any) {
    req.log?.error(e);
    return res.status(500).json({ error: "Failed" });
  }
});

/* Create a failed order — public (called when frontend order creation fails) */
router.post("/failed-orders", async (req, res) => {
  try {
    const { userId, orderData, reason, errorMessage } = req.body;
    const [row] = await db
      .insert(failedOrdersTable)
      .values({ userId: userId ?? null, orderData: orderData ?? {}, reason: reason ?? "unknown", errorMessage: errorMessage ?? null })
      .returning();
    return res.status(201).json(row);
  } catch (e: any) {
    req.log?.error(e);
    return res.status(500).json({ error: "Failed to record" });
  }
});

/* Recover — convert failed order data into a real order */
router.post("/admin/failed-orders/:id/recover", adminMiddleware as any, async (req, res) => {
  try {
    const [failed] = await db
      .select()
      .from(failedOrdersTable)
      .where(eq(failedOrdersTable.id, parseInt(req.params.id)))
      .limit(1);

    if (!failed) return res.status(404).json({ error: "Not found" });

    const d = failed.orderData ?? {};
    const orderNumber = "KDF-R" + Date.now().toString().slice(-6);

    const items: any[] = Array.isArray(d.items) ? d.items : [];
    const subtotal = items.reduce((s: number, i: any) => s + Number(i.price ?? 0) * Number(i.qty ?? 1), 0);
    const deliveryFee = d.deliveryType === "express" ? 499 : 199;
    const total = subtotal + deliveryFee;

    const [order] = await db.insert(ordersTable).values({
      userId: failed.userId ?? undefined,
      orderNumber,
      status: "pending",
      paymentStatus: "unpaid",
      subtotal: String(subtotal),
      discount: "0",
      deliveryFee: String(deliveryFee),
      loyaltyDiscount: "0",
      walletDiscount: "0",
      total: String(total),
      deliveryType: d.deliveryType ?? "standard",
      courier: d.courier ?? "tcs",
      paymentMethod: d.paymentMethod ?? "cod",
      shippingAddress: d.shippingAddress,
    }).returning();

    if (items.length > 0) {
      await db.insert(orderItemsTable).values(
        items.map((i: any) => ({
          orderId: order.id,
          name: i.name,
          variant: i.variant ?? null,
          price: String(i.price ?? 0),
          qty: i.qty ?? 1,
          gradient: i.gradient ?? null,
        }))
      );
    }

    await db.delete(failedOrdersTable).where(eq(failedOrdersTable.id, failed.id));
    return res.json({ success: true, orderId: order.id, orderNumber });
  } catch (e: any) {
    req.log?.error(e);
    return res.status(500).json({ error: e.message });
  }
});

/* Delete a failed order */
router.delete("/admin/failed-orders/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(failedOrdersTable).where(eq(failedOrdersTable.id, parseInt(req.params.id)));
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: "Failed" });
  }
});

export default router;
