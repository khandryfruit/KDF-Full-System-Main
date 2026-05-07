import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { ordersTable } from "@workspace/db/schema";
import { eq, ilike, or, desc, sql } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

router.get("/users", adminMiddleware as any, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const { search } = req.query;

    const where = search
      ? or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.phone, `%${search}%`))
      : undefined;

    const [items, countResult] = await Promise.all([
      db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, email: usersTable.email, role: usersTable.role, city: usersTable.city, country: usersTable.country, address: usersTable.address, postalCode: usersTable.postalCode, createdAt: usersTable.createdAt })
        .from(usersTable).where(where).orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(usersTable).where(where),
    ]);

    res.json({ items, total: Number(countResult[0]?.count ?? 0), page, limit });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list users" });
  }
});

router.get("/users/:id", adminMiddleware as any, async (req, res) => {
  try {
    const [user] = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, email: usersTable.email, role: usersTable.role, city: usersTable.city, country: usersTable.country, address: usersTable.address, postalCode: usersTable.postalCode, createdAt: usersTable.createdAt })
      .from(usersTable).where(eq(usersTable.id, parseInt(req.params.id))).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.put("/users/:id", adminMiddleware as any, async (req, res) => {
  try {
    const { passwordHash, ...rest } = req.body;
    const [user] = await db.update(usersTable).set({ ...rest, updatedAt: new Date() }).where(eq(usersTable.id, parseInt(req.params.id))).returning({
      id: usersTable.id, name: usersTable.name, phone: usersTable.phone, email: usersTable.email, role: usersTable.role, city: usersTable.city, country: usersTable.country, address: usersTable.address, postalCode: usersTable.postalCode, createdAt: usersTable.createdAt,
    });
    if (!user) { res.status(404).json({ error: "Not found" }); return; }
    res.json(user);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/* ── Admin: full customer profile (orders + stats) ── */
router.get("/users/:id/profile", adminMiddleware as any, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const [user] = await db.select({
      id: usersTable.id, name: usersTable.name, phone: usersTable.phone,
      email: usersTable.email, role: usersTable.role, city: usersTable.city,
      country: usersTable.country, address: usersTable.address,
      postalCode: usersTable.postalCode, createdAt: usersTable.createdAt,
    }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const orders = await db.select({
      id: ordersTable.id, orderNumber: ordersTable.orderNumber,
      status: ordersTable.status, total: ordersTable.total,
      paymentMethod: ordersTable.paymentMethod, createdAt: ordersTable.createdAt,
      items: ordersTable.items,
    }).from(ordersTable)
      .where(sql`(shipping_address->>'phone')::text = ${user.phone ?? ""}`)
      .orderBy(desc(ordersTable.createdAt));

    const totalSpent = orders.reduce((s, o) => s + Number(o.total ?? 0), 0);
    res.json({ ...user, orders, totalSpent, orderCount: orders.length, lastActivity: orders[0]?.createdAt ?? user.createdAt });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

/* ── Admin: send WhatsApp message to a customer ── */
router.post("/users/:id/send-whatsapp", adminMiddleware as any, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const [user] = await db.select({ name: usersTable.name, phone: usersTable.phone })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (!user.phone) { res.status(400).json({ error: "Customer has no phone number" }); return; }

    const { message } = req.body ?? {};
    if (!message) { res.status(400).json({ error: "message is required" }); return; }

    const { sendWhatsAppMessage } = await import("../lib/whatsapp.js");
    const finalMsg = message.replace(/\{customer_name\}/g, user.name ?? "Valued Customer").replace(/\{name\}/g, user.name ?? "Valued Customer");
    const ok = await (sendWhatsAppMessage as any)({ phone: user.phone, message: finalMsg });
    res.json({ success: !!ok, message: ok ? "Message sent!" : "Send failed — check WhatsApp settings" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

export default router;
