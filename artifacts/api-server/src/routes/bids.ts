import { Router } from "express";
import { db, productBidConfigTable, bidsTable, productsTable, whatsappSettingsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import { sendWhatsAppMessage } from "../lib/whatsapp";

const router = Router();

/* ─── Public: Get active bid config for a product ────── */
router.get("/bids/:productId", async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    if (isNaN(productId)) { res.status(400).json({ error: "Invalid product ID" }); return; }

    const [config] = await db.select().from(productBidConfigTable)
      .where(eq(productBidConfigTable.productId, productId)).limit(1);

    if (!config) { res.json({ hasBidding: false }); return; }

    const now = new Date();
    const isLive = config.isActive && config.status === "active"
      && (!config.endTime || config.endTime > now);

    const recentBids = await db.select({
      id: bidsTable.id,
      bidderName: bidsTable.bidderName,
      amount: bidsTable.amount,
      createdAt: bidsTable.createdAt,
    }).from(bidsTable)
      .where(eq(bidsTable.bidConfigId, config.id))
      .orderBy(desc(bidsTable.createdAt))
      .limit(10);

    res.json({
      hasBidding: true,
      isLive,
      config: {
        id: config.id,
        status: config.status,
        startingPrice: config.startingPrice,
        currentBid: config.currentBid,
        minIncrement: config.minIncrement,
        reservePrice: config.reservePrice,
        buyNowPrice: config.buyNowPrice,
        startTime: config.startTime,
        endTime: config.endTime,
        totalBids: config.totalBids,
      },
      recentBids,
    });
  } catch (err) {
    req.log.error(err, "Get bid config error");
    res.status(500).json({ error: "Failed to get bid info" });
  }
});

/* ─── Public: Place a bid ─────────────────────────────── */
router.post("/bids/:productId", async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    if (isNaN(productId)) { res.status(400).json({ error: "Invalid product ID" }); return; }

    const { bidderName, bidderPhone, bidderEmail, amount } = req.body;
    if (!bidderName || !bidderPhone || !amount) {
      res.status(400).json({ error: "Name, phone and amount are required" }); return;
    }

    const bidAmount = parseFloat(amount);
    if (isNaN(bidAmount) || bidAmount <= 0) {
      res.status(400).json({ error: "Invalid bid amount" }); return;
    }

    const [config] = await db.select().from(productBidConfigTable)
      .where(eq(productBidConfigTable.productId, productId)).limit(1);

    if (!config) { res.status(404).json({ error: "No active auction for this product" }); return; }

    const now = new Date();
    if (!config.isActive || config.status !== "active") {
      res.status(400).json({ error: "Auction is not currently active" }); return;
    }
    /* startTime check intentionally removed — admin activating isActive=true is the source of truth */
    if (config.endTime && config.endTime <= now) {
      res.status(400).json({ error: "Auction has ended" }); return;
    }

    const currentBid = parseFloat(config.currentBid ?? "0");
    const startingPrice = parseFloat(config.startingPrice ?? "0");
    const minIncrement = parseFloat(config.minIncrement ?? "50");
    const minBid = currentBid > 0 ? currentBid + minIncrement : startingPrice;

    if (bidAmount < minBid) {
      res.status(400).json({ error: `Minimum bid is Rs. ${minBid.toLocaleString()}` }); return;
    }

    await db.update(bidsTable)
      .set({ status: "outbid" })
      .where(and(eq(bidsTable.bidConfigId, config.id), eq(bidsTable.status, "active")));

    const [bid] = await db.insert(bidsTable).values({
      productId,
      bidConfigId: config.id,
      userId: (req as any).user?.id ?? null,
      bidderName,
      bidderPhone,
      bidderEmail: bidderEmail ?? null,
      amount: String(bidAmount),
    }).returning();

    await db.update(productBidConfigTable)
      .set({
        currentBid: String(bidAmount),
        totalBids: sql`${productBidConfigTable.totalBids} + 1`,
        updatedAt: now,
      })
      .where(eq(productBidConfigTable.id, config.id));

    res.status(201).json({ success: true, bid });
  } catch (err) {
    req.log.error(err, "Place bid error");
    res.status(500).json({ error: "Failed to place bid" });
  }
});

/* ─── Admin: List all bid configs ─────────────────────── */
router.get("/admin/bids", adminMiddleware as any, async (req, res) => {
  try {
    const configs = await db.select({
      config: productBidConfigTable,
      productName: productsTable.name,
      productImage: productsTable.images,
    }).from(productBidConfigTable)
      .leftJoin(productsTable, eq(productBidConfigTable.productId, productsTable.id))
      .orderBy(desc(productBidConfigTable.createdAt));

    res.json(configs);
  } catch (err) {
    req.log.error(err, "List bid configs error");
    res.status(500).json({ error: "Failed to list auctions" });
  }
});

/* ─── Admin: Get bid config + bids for a product ──────── */
router.get("/admin/bids/:productId", adminMiddleware as any, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    const [config] = await db.select().from(productBidConfigTable)
      .where(eq(productBidConfigTable.productId, productId)).limit(1);

    const bids = config ? await db.select().from(bidsTable)
      .where(eq(bidsTable.bidConfigId, config.id))
      .orderBy(desc(bidsTable.createdAt)) : [];

    res.json({ config: config ?? null, bids });
  } catch (err) {
    req.log.error(err, "Get admin bids error");
    res.status(500).json({ error: "Failed" });
  }
});

/* ─── Admin: Create or update bid config ─────────────── */
router.post("/admin/bids", adminMiddleware as any, async (req, res) => {
  try {
    const {
      productId, isActive, status, startingPrice, minIncrement,
      reservePrice, buyNowPrice, startTime, endTime,
    } = req.body;

    if (!productId) { res.status(400).json({ error: "productId is required" }); return; }

    const existing = await db.select({ id: productBidConfigTable.id })
      .from(productBidConfigTable)
      .where(eq(productBidConfigTable.productId, parseInt(productId))).limit(1);

    const values: any = {
      productId: parseInt(productId),
      isActive: isActive ?? false,
      status: status ?? "draft",
      startingPrice: startingPrice ? String(startingPrice) : "0",
      minIncrement: minIncrement ? String(minIncrement) : "50",
      reservePrice: reservePrice ? String(reservePrice) : null,
      buyNowPrice: buyNowPrice ? String(buyNowPrice) : null,
      startTime: startTime ? new Date(startTime) : null,
      endTime: endTime ? new Date(endTime) : null,
      updatedAt: new Date(),
    };

    let config;
    if (existing.length > 0) {
      [config] = await db.update(productBidConfigTable)
        .set(values).where(eq(productBidConfigTable.id, existing[0].id)).returning();
    } else {
      [config] = await db.insert(productBidConfigTable).values(values).returning();
    }

    res.json(config);
  } catch (err) {
    req.log.error(err, "Upsert bid config error");
    res.status(500).json({ error: "Failed to save auction config" });
  }
});

/* ─── Admin: End auction and pick winner ─────────────── */
router.post("/admin/bids/:id/end", adminMiddleware as any, async (req, res) => {
  try {
    const configId = parseInt(req.params.id);
    const [config] = await db.select().from(productBidConfigTable)
      .where(eq(productBidConfigTable.id, configId)).limit(1);
    if (!config) { res.status(404).json({ error: "Auction not found" }); return; }

    const [topBid] = await db.select().from(bidsTable)
      .where(and(eq(bidsTable.bidConfigId, configId), eq(bidsTable.status, "active")))
      .orderBy(desc(bidsTable.amount)).limit(1);

    if (topBid) {
      await db.update(bidsTable).set({ status: "won" }).where(eq(bidsTable.id, topBid.id));
      await db.update(bidsTable).set({ status: "outbid" })
        .where(and(eq(bidsTable.bidConfigId, configId), eq(bidsTable.status, "active")));
    }

    const [updated] = await db.update(productBidConfigTable)
      .set({
        status: "ended",
        isActive: false,
        winnerBidId: topBid?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(productBidConfigTable.id, configId)).returning();

    /* Notify winner via WhatsApp */
    if (topBid) {
      const [product] = await db.select({ name: productsTable.name })
        .from(productsTable).where(eq(productsTable.id, config.productId)).limit(1);

      const [waSettings] = await db.select().from(whatsappSettingsTable).limit(1);
      if (waSettings?.notifyBiddingWinner) {
        sendWhatsAppMessage({
          phone: topBid.bidderPhone,
          message: `🏆 *Congratulations ${topBid.bidderName}!*\n\nYou won the auction for *${product?.name ?? "the product"}*!\n\nYour winning bid: *Rs. ${parseFloat(topBid.amount).toLocaleString()}*\n\nOur team will contact you shortly to complete your order. 🎉`,
          templateName: "bidding_winner",
        }).catch(() => {});
      }

      await db.update(productBidConfigTable).set({ winnerNotified: true })
        .where(eq(productBidConfigTable.id, configId));
    }

    res.json({ success: true, config: updated, winner: topBid ?? null });
  } catch (err) {
    req.log.error(err, "End auction error");
    res.status(500).json({ error: "Failed to end auction" });
  }
});

/* ─── Admin: Delete bid config ───────────────────────── */
router.delete("/admin/bids/:id", adminMiddleware as any, async (req, res) => {
  try {
    const configId = parseInt(req.params.id);
    await db.delete(bidsTable).where(eq(bidsTable.bidConfigId, configId));
    await db.delete(productBidConfigTable).where(eq(productBidConfigTable.id, configId));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "Delete bid config error");
    res.status(500).json({ error: "Failed to delete auction" });
  }
});

export default router;
