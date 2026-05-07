import { Router } from "express";
import { db, restockRequestsTable, productsTable, whatsappSettingsTable } from "@workspace/db";
import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import { sendWhatsAppMessage } from "../lib/whatsapp";

const router = Router();

/* ─── Public: Register for restock notification ─────── */
router.post("/restock/notify", async (req, res) => {
  try {
    const { productId, name, email, phone } = req.body;
    if (!productId || !email) {
      res.status(400).json({ error: "Product ID and email are required" }); return;
    }

    const [product] = await db.select({ id: productsTable.id, stock: productsTable.stock })
      .from(productsTable).where(eq(productsTable.id, parseInt(productId))).limit(1);
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }
    if (product.stock > 0) {
      res.status(400).json({ error: "Product is already in stock" }); return;
    }

    const existing = await db.select({ id: restockRequestsTable.id })
      .from(restockRequestsTable)
      .where(and(
        eq(restockRequestsTable.productId, parseInt(productId)),
        eq(restockRequestsTable.email, email.toLowerCase()),
        isNull(restockRequestsTable.notifiedAt),
      )).limit(1);

    if (existing.length > 0) {
      res.json({ success: true, message: "You are already on the notification list!" }); return;
    }

    await db.insert(restockRequestsTable).values({
      productId: parseInt(productId),
      name: name?.trim() ?? null,
      email: email.toLowerCase().trim(),
      phone: phone?.trim() ?? null,
    });

    res.status(201).json({ success: true, message: "We'll notify you when this product is back in stock!" });
  } catch (err) {
    req.log.error(err, "Restock notify error");
    res.status(500).json({ error: "Failed to register notification" });
  }
});

/* ─── Admin: List all restock requests ──────────────── */
router.get("/admin/restock", adminMiddleware as any, async (req, res) => {
  try {
    const requests = await db.select({
      request: restockRequestsTable,
      productName: productsTable.name,
      productStock: productsTable.stock,
    }).from(restockRequestsTable)
      .leftJoin(productsTable, eq(restockRequestsTable.productId, productsTable.id))
      .orderBy(desc(restockRequestsTable.createdAt));

    const summary = await db.select({
      productId: restockRequestsTable.productId,
      productName: productsTable.name,
      count: sql<number>`count(*)::int`,
      pendingCount: sql<number>`count(*) filter (where ${restockRequestsTable.notifiedAt} is null)::int`,
    }).from(restockRequestsTable)
      .leftJoin(productsTable, eq(restockRequestsTable.productId, productsTable.id))
      .groupBy(restockRequestsTable.productId, productsTable.name);

    res.json({ requests, summary });
  } catch (err) {
    req.log.error(err, "List restock requests error");
    res.status(500).json({ error: "Failed to list requests" });
  }
});

/* ─── Admin: Manually trigger restock notifications ─── */
router.post("/admin/restock/:productId/notify", adminMiddleware as any, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    const [product] = await db.select().from(productsTable)
      .where(eq(productsTable.id, productId)).limit(1);
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const pending = await db.select().from(restockRequestsTable)
      .where(and(
        eq(restockRequestsTable.productId, productId),
        isNull(restockRequestsTable.notifiedAt),
      ));

    if (pending.length === 0) {
      res.json({ success: true, notified: 0, message: "No pending requests to notify" }); return;
    }

    const [waSettings] = await db.select().from(whatsappSettingsTable).limit(1);
    let notified = 0;

    for (const req2 of pending) {
      if (req2.phone && waSettings?.notifyRestock) {
        await sendWhatsAppMessage({
          phone: req2.phone,
          message: `🎉 *Good news${req2.name ? `, ${req2.name}` : ""}!*\n\n*${product.name}* is back in stock at KDF NUTS!\n\nOrder now before it sells out again 🥜\n\nhttps://kdfnuts.com/products/${product.slug}`,
          templateName: "restock_alert",
        }).catch(() => {});
      }
      await db.update(restockRequestsTable)
        .set({ notifiedAt: new Date() })
        .where(eq(restockRequestsTable.id, req2.id));
      notified++;
    }

    res.json({ success: true, notified });
  } catch (err) {
    req.log.error(err, "Manual restock notify error");
    res.status(500).json({ error: "Failed to send notifications" });
  }
});

/* ─── Admin: Delete request ──────────────────────────── */
router.delete("/admin/restock/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(restockRequestsTable)
      .where(eq(restockRequestsTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "Delete restock request error");
    res.status(500).json({ error: "Failed to delete" });
  }
});

export default router;
