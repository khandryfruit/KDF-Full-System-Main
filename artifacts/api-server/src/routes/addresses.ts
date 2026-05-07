import { Router } from "express";
import { db, userAddressesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../lib/auth";
import type { Response } from "express";

const router = Router();

router.get("/addresses", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const addresses = await db.select().from(userAddressesTable)
      .where(eq(userAddressesTable.userId, req.user!.id))
      .orderBy(userAddressesTable.createdAt);
    res.json(addresses);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch addresses" });
  }
});

router.post("/addresses", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const { label, name, phone, address, area, city, postalCode, country, isDefault } = req.body;
    if (!name || !phone || !address || !city) {
      res.status(400).json({ error: "name, phone, address, and city are required" });
      return;
    }
    if (isDefault) {
      await db.update(userAddressesTable)
        .set({ isDefault: false })
        .where(eq(userAddressesTable.userId, req.user!.id));
    }
    const existing = await db.select().from(userAddressesTable)
      .where(eq(userAddressesTable.userId, req.user!.id));
    const [created] = await db.insert(userAddressesTable).values({
      userId: req.user!.id,
      label: label ?? "Home",
      name, phone, address,
      area: area ?? null,
      city,
      postalCode: postalCode ?? null,
      country: country ?? "Pakistan",
      isDefault: isDefault ?? existing.length === 0,
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create address" });
  }
});

router.put("/addresses/:id", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params['id'] as string);
    const { label, name, phone, address, area, city, postalCode, country, isDefault } = req.body;
    const existing = await db.select().from(userAddressesTable)
      .where(and(eq(userAddressesTable.id, id), eq(userAddressesTable.userId, req.user!.id)))
      .limit(1);
    if (!existing.length) { res.status(404).json({ error: "Address not found" }); return; }
    if (isDefault) {
      await db.update(userAddressesTable)
        .set({ isDefault: false })
        .where(eq(userAddressesTable.userId, req.user!.id));
    }
    const [updated] = await db.update(userAddressesTable)
      .set({ label, name, phone, address, area, city, postalCode, country, isDefault })
      .where(and(eq(userAddressesTable.id, id), eq(userAddressesTable.userId, req.user!.id)))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update address" });
  }
});

router.delete("/addresses/:id", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params['id'] as string);
    const existing = await db.select().from(userAddressesTable)
      .where(and(eq(userAddressesTable.id, id), eq(userAddressesTable.userId, req.user!.id)))
      .limit(1);
    if (!existing.length) { res.status(404).json({ error: "Address not found" }); return; }
    await db.delete(userAddressesTable)
      .where(and(eq(userAddressesTable.id, id), eq(userAddressesTable.userId, req.user!.id)));
    if (existing[0].isDefault) {
      const remaining = await db.select().from(userAddressesTable)
        .where(eq(userAddressesTable.userId, req.user!.id))
        .limit(1);
      if (remaining.length > 0) {
        await db.update(userAddressesTable)
          .set({ isDefault: true })
          .where(eq(userAddressesTable.id, remaining[0].id));
      }
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete address" });
  }
});

router.patch("/addresses/:id/default", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params['id'] as string);
    const existing = await db.select().from(userAddressesTable)
      .where(and(eq(userAddressesTable.id, id), eq(userAddressesTable.userId, req.user!.id)))
      .limit(1);
    if (!existing.length) { res.status(404).json({ error: "Address not found" }); return; }
    await db.update(userAddressesTable)
      .set({ isDefault: false })
      .where(eq(userAddressesTable.userId, req.user!.id));
    const [updated] = await db.update(userAddressesTable)
      .set({ isDefault: true })
      .where(and(eq(userAddressesTable.id, id), eq(userAddressesTable.userId, req.user!.id)))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to set default address" });
  }
});

export default router;
