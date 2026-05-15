import { Router } from "express";
import { db, paymentGatewaysTable, manualPaymentsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { adminMiddleware, type AuthRequest } from "../lib/auth";
import type { Response } from "express";

const router = Router();

const GATEWAY_PATCH_KEYS = new Set([
  "displayName", "description", "apiKey", "secretKey", "webhookSecret",
  "isActive", "isDefault", "sortOrder", "config", "type",
]);

function maskGateway<T extends Record<string, unknown>>(g: T): T {
  const out = { ...g };
  for (const k of ["apiKey", "secretKey", "webhookSecret"] as const) {
    const v = out[k];
    if (typeof v === "string" && v.length > 4) {
      (out as Record<string, unknown>)[k] = `••••${v.slice(-4)}`;
    }
  }
  return out;
}

/* ─── Public: list active payment gateways ───────────── */
router.get("/payment-gateways/active", async (req, res) => {
  try {
    const gateways = await db.select({
      id: paymentGatewaysTable.id,
      type: paymentGatewaysTable.type,
      displayName: paymentGatewaysTable.displayName,
      description: paymentGatewaysTable.description,
      isDefault: paymentGatewaysTable.isDefault,
      sortOrder: paymentGatewaysTable.sortOrder,
    }).from(paymentGatewaysTable)
      .where(eq(paymentGatewaysTable.isActive, true))
      .orderBy(asc(paymentGatewaysTable.sortOrder));

    const manualPayments = await db.select().from(manualPaymentsTable)
      .where(eq(manualPaymentsTable.isActive, true))
      .orderBy(asc(manualPaymentsTable.sortOrder));

    res.json({ gateways, manualPayments });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch payment options" });
  }
});

/* ─── Admin: list all payment gateways ───────────────── */
router.get("/admin/payment-gateways", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const gateways = await db.select().from(paymentGatewaysTable).orderBy(asc(paymentGatewaysTable.sortOrder));
    res.json(gateways.map(g => maskGateway(g as Record<string, unknown>)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch payment gateways" });
  }
});

/* ─── Admin: create or update payment gateway ─────────── */
router.post("/admin/payment-gateways", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, displayName, description, apiKey, secretKey, webhookSecret, isActive, isDefault, sortOrder, config } = req.body;
    if (!type || !displayName) { res.status(400).json({ error: "type and displayName are required" }); return; }

    if (isDefault) {
      await db.update(paymentGatewaysTable).set({ isDefault: false });
    }

    const existing = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.type, type as any)).limit(1);
    let gateway;
    if (existing.length > 0) {
      [gateway] = await db.update(paymentGatewaysTable).set({
        displayName, description, apiKey, secretKey, webhookSecret,
        isActive: isActive ?? existing[0].isActive,
        isDefault: isDefault ?? false,
        sortOrder: sortOrder ?? existing[0].sortOrder,
        config: config ?? existing[0].config,
        updatedAt: new Date(),
      }).where(eq(paymentGatewaysTable.type, type as any)).returning();
    } else {
      [gateway] = await db.insert(paymentGatewaysTable).values({
        name: type, type: type as any, displayName, description,
        apiKey, secretKey, webhookSecret,
        isActive: isActive ?? false,
        isDefault: isDefault ?? false,
        sortOrder: sortOrder ?? 0,
        config: config ?? {},
      }).returning();
    }
    res.json(gateway);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to save payment gateway" });
  }
});

/* ─── Admin: toggle gateway active/inactive ──────────── */
router.patch("/admin/payment-gateways/:id", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(req.body as Record<string, unknown>)) {
      if (GATEWAY_PATCH_KEYS.has(k)) updates[k] = v;
    }

    if (updates.isDefault === true) {
      await db.update(paymentGatewaysTable).set({ isDefault: false });
    }

    const [gateway] = await db.update(paymentGatewaysTable).set({
      ...updates,
      updatedAt: new Date(),
    }).where(eq(paymentGatewaysTable.id, id)).returning();

    if (!gateway) { res.status(404).json({ error: "Gateway not found" }); return; }
    res.json(gateway);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update gateway" });
  }
});

/* ─── Admin: list manual payments ──────────────────────── */
router.get("/admin/manual-payments", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const banks = await db.select().from(manualPaymentsTable).orderBy(asc(manualPaymentsTable.sortOrder));
    res.json(banks);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch manual payments" });
  }
});

/* ─── Admin: create manual payment ─────────────────────── */
router.post("/admin/manual-payments", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { bankName, accountTitle, accountNumber, iban, instructions, isActive, sortOrder } = req.body;
    if (!bankName || !accountTitle || !accountNumber) {
      res.status(400).json({ error: "bankName, accountTitle, accountNumber are required" }); return;
    }
    const [bank] = await db.insert(manualPaymentsTable).values({
      bankName, accountTitle, accountNumber, iban, instructions,
      isActive: isActive ?? true,
      sortOrder: sortOrder ?? 0,
    }).returning();
    res.json(bank);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create manual payment" });
  }
});

/* ─── Admin: update manual payment ─────────────────────── */
router.patch("/admin/manual-payments/:id", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const [bank] = await db.update(manualPaymentsTable).set({
      ...req.body,
      updatedAt: new Date(),
    }).where(eq(manualPaymentsTable.id, id)).returning();
    if (!bank) { res.status(404).json({ error: "Not found" }); return; }
    res.json(bank);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update manual payment" });
  }
});

/* ─── Admin: delete manual payment ─────────────────────── */
router.delete("/admin/manual-payments/:id", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    await db.delete(manualPaymentsTable).where(eq(manualPaymentsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete" });
  }
});

export default router;
