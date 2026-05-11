import { Router } from "express";
import { db, ordersTable, orderItemsTable, walletTransactionsTable, loyaltyTransactionsTable, couponsTable, couponUsagesTable, usersTable, adminNotificationsTable } from "@workspace/db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { productsTable } from "@workspace/db";
import { authMiddleware, adminMiddleware, optionalAuthMiddleware, type AuthRequest } from "../lib/auth";
import { sendOrderNotification } from "./notifications";
import { sendOrderConfirmation, sendOrderStatusUpdate, sendFailedDeliveryNotification, sendReviewRequest, sendReturnRefundNotification } from "../lib/whatsapp";
import { sendSocialOrderMessage } from "../lib/socialMessenger";
import { broadcastSSE } from "../lib/sse";
import { fireCapiPurchase } from "../lib/metaCapi";
import {
  sendOrderConfirmationEmail,
  sendOrderPaidEmail,
  sendOrderCancelledEmail,
  sendOutForDeliveryEmail,
  sendDeliveredEmail,
  sendRefundEmail,
} from "../lib/email.js";
import type { Response } from "express";

const ORDER_STATUS_MESSAGES: Record<string, { title: string; message: string }> = {
  confirmed:         { title: "✅ Order Confirmed",        message: "Great news! Your order has been confirmed and will be processed soon." },
  processing:        { title: "📦 Order Packed",          message: "Your order has been packed and is ready for dispatch." },
  shipped:           { title: "🚚 Order Shipped",          message: "Your order is on its way! We'll notify you when it's out for delivery." },
  out_for_delivery:  { title: "🛵 Out for Delivery",       message: "Your order is out for delivery. Expect it soon!" },
  delivered:         { title: "✅ Order Delivered",         message: "Your order has been delivered. Enjoy your KDF NUTS!" },
  cancelled:         { title: "❌ Order Cancelled",         message: "Your order has been cancelled. Contact us if you have questions." },
};

const ONLINE_PAYMENT_METHODS = ["bank_transfer", "jazzcash", "easypaisa", "card", "wallet", "online", "free"];

const router = Router();

function generateOrderNumber(): string {
  return "KDF-" + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000).toString().padStart(3, "0");
}

router.get("/orders", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const { status, userId } = req.query;

    const conditions: any[] = [];
    if (req.user?.role !== "admin") {
      conditions.push(eq(ordersTable.userId, req.user!.id));
    } else if (userId) {
      conditions.push(eq(ordersTable.userId, parseInt(userId as string)));
    }
    if (status) conditions.push(eq(ordersTable.status, status as any));

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [orders, countResult] = await Promise.all([
      db.select().from(ordersTable).where(where).orderBy(desc(ordersTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(ordersTable).where(where),
    ]);

    const orderIds = orders.map(o => o.id);
    const items = orderIds.length > 0
      ? await db.select().from(orderItemsTable).where(sql`${orderItemsTable.orderId} = ANY(${sql.raw(`ARRAY[${orderIds.join(",")}]`)})`)
      : [];

    const ordersWithItems = orders.map(order => ({
      ...order,
      items: items.filter(item => item.orderId === order.id),
    }));

    res.json({ items: ordersWithItems, total: Number(countResult[0]?.count ?? 0), page, limit });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list orders" });
  }
});

/* ── Public tracking endpoint ─────────────────────────── */
router.get("/track", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) { res.status(400).json({ error: "Query is required" }); return; }

    const [order] = await db.select().from(ordersTable).where(
      sql`lower(${ordersTable.orderNumber}) = lower(${q}) or lower(${ordersTable.trackingId}) = lower(${q})`
    ).limit(1);

    if (!order) { res.status(404).json({ error: "Order not found. Check your order number or tracking ID." }); return; }

    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));

    const addr = order.shippingAddress as any;
    res.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      courier: order.courier,
      trackingId: order.trackingId,
      deliveryType: order.deliveryType,
      deliveryFee: order.deliveryFee,
      subtotal: order.subtotal,
      discount: order.discount,
      total: order.total,
      createdAt: order.createdAt,
      confirmedAt: order.confirmedAt,
      packedAt: order.packedAt,
      shippedAt: order.shippedAt,
      outForDeliveryAt: order.outForDeliveryAt,
      deliveredAt: order.deliveredAt,
      city: addr?.city ?? null,
      country: addr?.country ?? null,
      recipientName: addr?.name ? String(addr.name).split(" ")[0] : null,
      items: items.map(i => ({
        name: i.name,
        variant: i.variant,
        qty: i.qty,
        price: i.price,
        gradient: i.gradient,
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch tracking info" });
  }
});

router.get("/orders/:id", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (req.user?.role !== "admin" && order.userId !== req.user?.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
    res.json({ ...order, items });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/orders", optionalAuthMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const { items, shippingAddress, paymentMethod, deliveryType, courier, couponCode, useLoyaltyPoints, useWalletBalance, notes, referenceNumber, paymentScreenshot } = req.body;
    const userId = req.user?.id ?? null;
    if (!items?.length || !shippingAddress || !paymentMethod) {
      res.status(400).json({ error: "items, shippingAddress, and paymentMethod are required" });
      return;
    }

    const productIds = [...new Set(
      items.filter((i: any) => i.productId).map((i: any) => Number(i.productId))
    )] as number[];
    const dbProducts = productIds.length > 0
      ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds))
      : [];

    const resolvedItems = items.map((item: any) => {
      if (!item.productId) return item;
      const dbProduct = dbProducts.find(p => p.id === Number(item.productId));
      if (!dbProduct) return item;
      if (item.variantId) {
        const variants = (dbProduct.variants as any[]) ?? [];
        const variant = variants.find((v: any) => v.id === item.variantId);
        if (!variant) return { ...item, price: dbProduct.price };
        return { ...item, price: String(variant.price ?? dbProduct.price) };
      }
      return { ...item, price: dbProduct.price };
    });

    let subtotal = resolvedItems.reduce((sum: number, item: any) => sum + parseFloat(item.price) * item.qty, 0);
    let discount = 0;
    let loyaltyDiscount = 0;
    let walletDiscount = 0;
    let deliveryFee = deliveryType === "express" ? 499 : 199;

    if (couponCode) {
      const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, couponCode.toUpperCase())).limit(1);
      if (coupon?.active) {
        discount = coupon.type === "percentage"
          ? subtotal * (parseFloat(coupon.value) / 100)
          : parseFloat(coupon.value);
      }
    }

    if (useLoyaltyPoints && userId) {
      const pointsResult = await db.select({ sum: sql<number>`coalesce(sum(case when type='credit' then points else -points end), 0)` })
        .from(loyaltyTransactionsTable).where(eq(loyaltyTransactionsTable.userId, userId));
      const points = Number(pointsResult[0]?.sum ?? 0);
      loyaltyDiscount = Math.min(points, subtotal * 0.1);
    }

    if (useWalletBalance && userId) {
      const walletResult = await db.select({ sum: sql<number>`coalesce(sum(case when type='credit' then amount else -amount end), 0)` })
        .from(walletTransactionsTable).where(eq(walletTransactionsTable.userId, userId));
      const balance = Number(walletResult[0]?.sum ?? 0);
      walletDiscount = Math.min(balance, subtotal - discount - loyaltyDiscount);
    }

    const total = Math.max(0, subtotal - discount - loyaltyDiscount - walletDiscount + deliveryFee);

    const isOnlinePayment = ONLINE_PAYMENT_METHODS.includes(paymentMethod);
    const initialStatus = isOnlinePayment ? "confirmed" : "pending";
    const initialPaymentStatus = isOnlinePayment ? "paid" : "unpaid";
    const now = new Date();

    const [order] = await db.insert(ordersTable).values({
      userId: userId ?? null,
      orderNumber: generateOrderNumber(),
      status: initialStatus,
      subtotal: subtotal.toFixed(2),
      discount: discount.toFixed(2),
      deliveryFee: deliveryFee.toFixed(2),
      loyaltyDiscount: loyaltyDiscount.toFixed(2),
      walletDiscount: walletDiscount.toFixed(2),
      total: total.toFixed(2),
      deliveryType: deliveryType ?? "standard",
      courier: courier ?? "tcs",
      paymentMethod,
      paymentStatus: initialPaymentStatus,
      referenceNumber: referenceNumber ?? null,
      paymentScreenshot: paymentScreenshot ?? null,
      shippingAddress,
      couponCode: couponCode ?? null,
      notes: notes ?? null,
      confirmedAt: isOnlinePayment ? now : null,
    }).returning();

    const insertedItems = await db.insert(orderItemsTable).values(
      resolvedItems.map((item: any) => ({
        orderId: order.id,
        productId: item.productId ?? null,
        name: item.name,
        variant: item.variant ?? null,
        price: item.price,
        qty: item.qty,
        gradient: item.gradient ?? null,
      }))
    ).returning();

    if (couponCode) {
      await db.update(couponsTable).set({ usedCount: sql`used_count + 1` }).where(eq(couponsTable.code, couponCode.toUpperCase()));
    }

    if (walletDiscount > 0 && userId) {
      await db.insert(walletTransactionsTable).values({
        userId, amount: walletDiscount.toFixed(2), type: "debit",
        description: `Order ${order.orderNumber}`, referenceId: order.orderNumber,
      });
    }

    if (loyaltyDiscount > 0 && userId) {
      await db.insert(loyaltyTransactionsTable).values({
        userId, points: Math.round(loyaltyDiscount), type: "debit",
        description: `Redeemed for order ${order.orderNumber}`, referenceId: order.orderNumber,
      });
    }

    if (userId) {
      const earnedPoints = Math.floor(total / 10);
      if (earnedPoints > 0) {
        await db.insert(loyaltyTransactionsTable).values({
          userId, points: earnedPoints, type: "credit",
          description: `Earned for order ${order.orderNumber}`, referenceId: order.orderNumber,
        });
      }
    }

    res.status(201).json({ ...order, items: insertedItems });

    /* ── Admin real-time notification (fire-and-forget) ── */
    (async () => {
      try {
        const customerName = (shippingAddress as any)?.name ?? "Guest";
        const notifPayload = {
          title: `New Order #${order.orderNumber}`,
          message: `Rs. ${Number(order.total).toLocaleString("en-PK")} from ${customerName}`,
          type: "order",
          isRead: false,
          orderId: order.id,
        };
        const [notif] = await db.insert(adminNotificationsTable).values(notifPayload).returning();
        broadcastSSE("new_order", notif);
      } catch { /* ignore */ }
    })();

    /* ── WhatsApp order confirmation (fire-and-forget) ── */
    const phone = (shippingAddress as any)?.phone;
    if (phone) {
      const addr = (shippingAddress as any);
      const addressStr = [addr?.address, addr?.city, addr?.province]
        .filter(Boolean).join(", ") || addr?.city || "Pakistan";
      sendOrderConfirmation({
        phone,
        userId: userId ?? undefined,
        orderNumber: order.orderNumber,
        total: order.total,
        customerName: addr?.name,
        address: addressStr,
        items: insertedItems.map((i: any) => ({ name: i.name, qty: i.qty })),
      }).catch(() => {});
    }

    /* ── Order confirmation email (fire-and-forget) ── */
    const emailAddr = (shippingAddress as any)?.email ?? null;
    if (emailAddr) {
      const addr2 = shippingAddress as any;
      sendOrderConfirmationEmail({
        orderNumber: order.orderNumber,
        customerName: addr2?.name ?? "Customer",
        customerEmail: emailAddr,
        phone: addr2?.phone ?? undefined,
        city: addr2?.city ?? undefined,
        address: [addr2?.address, addr2?.province].filter(Boolean).join(", ") || undefined,
        paymentMethod: paymentMethod ?? "cod",
        items: insertedItems.map((i: any) => ({ name: i.name, variant: i.variant ?? undefined, price: Number(i.price), qty: i.qty })),
        subtotal,
        deliveryFee,
        total,
        orderId: order.id,
      }).catch(() => {});
    }

    /* ── Meta CAPI Purchase event (fire-and-forget) ── */
    fireCapiPurchase({
      id: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      items: insertedItems.map((i: any) => ({ name: i.name, productId: i.productId, price: i.price, qty: i.qty })),
      shippingAddress: shippingAddress as any,
    }, { ip: req.ip, headers: req.headers as any }).catch(() => {});

  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

/* ── PUT /orders/:id/items — admin: edit items & recalculate ── */
router.put("/orders/:id/items", adminMiddleware as any, async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const { items, discount, notes } = req.body as {
      items: Array<{ productId?: number; name: string; variant?: string; price: string; qty: number; gradient?: string }>;
      discount?: number;
      notes?: string;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "items array is required" }); return;
    }

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const subtotal = items.reduce((sum, item) => sum + parseFloat(item.price) * item.qty, 0);
    const discountAmt = discount !== undefined ? discount : Number(order.discount);
    const deliveryFee = Number(order.deliveryFee);
    const loyaltyDiscount = Number(order.loyaltyDiscount);
    const walletDiscount = Number(order.walletDiscount);
    const total = Math.max(0, subtotal - discountAmt - loyaltyDiscount - walletDiscount + deliveryFee);

    /* delete existing items and insert updated ones */
    await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, id));
    const newItems = await db.insert(orderItemsTable).values(
      items.map(item => ({
        orderId: id,
        productId: item.productId ?? null,
        name: item.name,
        variant: item.variant ?? null,
        price: item.price,
        qty: item.qty,
        gradient: item.gradient ?? null,
      }))
    ).returning();

    const [updated] = await db.update(ordersTable).set({
      subtotal: subtotal.toFixed(2),
      discount: discountAmt.toFixed(2),
      total: total.toFixed(2),
      updatedAt: new Date(),
      ...(notes !== undefined ? { notes } : {}),
    }).where(eq(ordersTable.id, id)).returning();

    res.json({ ...updated, items: newItems });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update order items" });
  }
});

router.patch("/orders/:id/payment-status", adminMiddleware as any, async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    if (!["unpaid", "pending", "paid"].includes(paymentStatus)) {
      res.status(400).json({ error: "paymentStatus must be unpaid, pending, or paid" }); return;
    }
    const now = new Date();
    const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, parseInt(req.params.id as string))).limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    /* Auto-confirm: if marking as paid and order is still pending, advance to confirmed */
    const shouldAutoConfirm = paymentStatus === "paid" && existing.status === "pending";
    const [order] = await db.update(ordersTable)
      .set({
        paymentStatus,
        updatedAt: now,
        ...(shouldAutoConfirm ? { status: "confirmed", confirmedAt: now } : {}),
      })
      .where(eq(ordersTable.id, parseInt(req.params.id as string)))
      .returning();
    if (!order) { res.status(404).json({ error: "Not found" }); return; }

    /* Send confirmation notification if auto-confirmed */
    if (shouldAutoConfirm && order.userId && ORDER_STATUS_MESSAGES["confirmed"]) {
      const msg = ORDER_STATUS_MESSAGES["confirmed"];
      sendOrderNotification(order.userId, msg.title, msg.message, {
        orderId: String(order.id),
        orderNumber: order.orderNumber,
        status: "confirmed",
      }).catch(() => {});
    }

    /* ── Payment confirmed email (fire-and-forget) ── */
    if (paymentStatus === "paid") {
      const addr = order.shippingAddress as any;
      const emailAddr = addr?.email ?? null;
      if (emailAddr) {
        sendOrderPaidEmail({
          orderNumber: order.orderNumber,
          customerName: addr?.name ?? "Customer",
          customerEmail: emailAddr,
          total: Number(order.total),
          orderId: order.id,
        }).catch(() => {});
      }
    }

    res.json(order);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.patch("/orders/:id/status", adminMiddleware as any, async (req, res) => {
  try {
    const { status, trackingId, courier, courierService, deliveryType } = req.body;
    const now = new Date();
    const timestampFields: Record<string, Date | null> = {};
    if (status === "confirmed") timestampFields.confirmedAt = now;
    if (status === "processing") timestampFields.packedAt = now;
    if (status === "shipped") timestampFields.shippedAt = now;
    if (status === "out_for_delivery") timestampFields.outForDeliveryAt = now;
    if (status === "delivered") timestampFields.deliveredAt = now;
    const [order] = await db.update(ordersTable)
      .set({
        status, updatedAt: now,
        ...(trackingId != null ? { trackingId } : {}),
        ...(courier ? { courier } : {}),
        ...(courierService ? { courierService } : {}),
        ...(deliveryType ? { deliveryType } : {}),
        ...timestampFields,
      })
      .where(eq(ordersTable.id, parseInt(req.params.id))).returning();
    if (!order) { res.status(404).json({ error: "Not found" }); return; }
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    res.json({ ...order, items });

    /* ── Auto-push notification (non-blocking, fire-and-forget) ── */
    if (order.userId && ORDER_STATUS_MESSAGES[status]) {
      const msg = ORDER_STATUS_MESSAGES[status];
      sendOrderNotification(order.userId, msg.title, msg.message, {
        orderId: String(order.id),
        orderNumber: order.orderNumber,
        status,
      }).catch(() => { /* silent */ });
    }

    /* ── Status-driven email automations (fire-and-forget) ── */
    const emailStatusAddr = (order.shippingAddress as any)?.email ?? null;
    if (emailStatusAddr) {
      const addr3 = order.shippingAddress as any;
      const baseData = {
        orderNumber: order.orderNumber,
        customerName: addr3?.name ?? "Customer",
        customerEmail: emailStatusAddr,
        phone: addr3?.phone ?? undefined,
        city: addr3?.city ?? undefined,
        total: Number(order.total),
        orderId: order.id,
      };
      if (status === "cancelled") {
        sendOrderCancelledEmail(baseData).catch(() => {});
      } else if (status === "out_for_delivery") {
        sendOutForDeliveryEmail(baseData).catch(() => {});
      } else if (status === "delivered") {
        sendDeliveredEmail(baseData).catch(() => {});
      } else if (status === "refunded") {
        sendRefundEmail(baseData).catch(() => {});
      }
    }

    /* ── WhatsApp status update (fire-and-forget) ── */
    const addr = order.shippingAddress as any;
    const waPhone = addr?.phone;
    if (waPhone) {
      sendOrderStatusUpdate({
        phone: waPhone,
        userId: order.userId ?? undefined,
        orderNumber: order.orderNumber,
        status,
        trackingId: trackingId ?? undefined,
      }).catch(() => {});

      /* ── Failed delivery WA (fire-and-forget) ── */
      if (status === "failed_delivery") {
        sendFailedDeliveryNotification({
          phone: waPhone,
          userId: order.userId ?? undefined,
          orderNumber: order.orderNumber,
          customerName: addr?.name ?? undefined,
        }).catch(() => {});
      }

      /* ── Post-delivery review request (fire-and-forget, 24h delay handled by engine) ── */
      if (status === "delivered") {
        sendReviewRequest({
          phone: waPhone,
          userId: order.userId ?? undefined,
          orderNumber: order.orderNumber,
          customerName: addr?.name ?? undefined,
        }).catch(() => {});
      }

      /* ── Return/Refund/Exchange WA notification ── */
      if (status === "returned" || status === "refunded" || status === "exchanged") {
        const typeMap: Record<string, "return"|"refund"|"exchange"> = {
          returned: "return", refunded: "refund", exchanged: "exchange",
        };
        sendReturnRefundNotification({
          phone: waPhone,
          userId: order.userId ?? undefined,
          orderNumber: order.orderNumber,
          customerName: addr?.name ?? undefined,
          type: typeMap[status] ?? "return",
        }).catch(() => {});
      }

      /* ── Social (FB/IG) order message (fire-and-forget) ── */
      sendSocialOrderMessage({
        phone: waPhone,
        orderNumber: order.orderNumber,
        status,
        customerName: addr?.name ?? undefined,
      }).catch(() => {});
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
