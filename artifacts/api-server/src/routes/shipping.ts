import { Router, type IRouter, type Request, type Response } from "express";
import { db, sameDayDeliverySettingsTable, shippingRulesTable } from "@workspace/db";
import { eq, asc, inArray } from "drizzle-orm";
import { productsTable } from "@workspace/db/schema";
import { adminMiddleware } from "../lib/auth";

const router: IRouter = Router();

/* ─── helpers ─────────────────────────────────────────────────────── */

async function getOrCreateSameDaySettings() {
  const rows = await db.select().from(sameDayDeliverySettingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const inserted = await db.insert(sameDayDeliverySettingsTable).values({}).returning();
  return inserted[0];
}

function parseWeightToGrams(weight: string | null | undefined): number {
  if (!weight) return 0;
  const lower = weight.toLowerCase().trim();
  const m = lower.match(/^([\d.]+)\s*(kg|kilogram|kilograms|g|gm|gram|grams|lb|lbs|pound|pounds|oz)?$/);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  const unit = m[2] ?? "g";
  if (unit.startsWith("kg") || unit.startsWith("kilo")) return val * 1000;
  if (unit.startsWith("lb") || unit.startsWith("pound")) return val * 453.592;
  if (unit.startsWith("oz")) return val * 28.3495;
  return val;
}

/* ─── same-day delivery ────────────────────────────────────────────── */

router.get("/shipping/same-day", async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSameDaySettings();
    res.json(settings);
  } catch {
    res.status(500).json({ error: "Failed to fetch same day delivery settings" });
  }
});

router.get("/admin/shipping/same-day", adminMiddleware as any, async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSameDaySettings();
    res.json(settings);
  } catch {
    res.status(500).json({ error: "Failed to fetch same day delivery settings" });
  }
});

router.put("/admin/shipping/same-day", adminMiddleware as any, async (req: Request, res: Response) => {
  const { enabled, price, city, cutoffHour } = req.body as {
    enabled?: boolean;
    price?: number;
    city?: string;
    cutoffHour?: number;
  };
  try {
    const existing = await getOrCreateSameDaySettings();
    const updated = await db
      .update(sameDayDeliverySettingsTable)
      .set({
        ...(enabled !== undefined && { enabled }),
        ...(price !== undefined && { price: Number(price) }),
        ...(city !== undefined && { city }),
        ...(cutoffHour !== undefined && { cutoffHour: Number(cutoffHour) }),
        updatedAt: new Date(),
      })
      .where(eq(sameDayDeliverySettingsTable.id, existing.id))
      .returning();
    res.json(updated[0]);
  } catch {
    res.status(500).json({ error: "Failed to update same day delivery settings" });
  }
});

/* ─── shipping rules CRUD (admin) ──────────────────────────────────── */

router.get("/admin/shipping/rules", adminMiddleware as any, async (_req: Request, res: Response) => {
  try {
    const rules = await db
      .select()
      .from(shippingRulesTable)
      .orderBy(asc(shippingRulesTable.priority), asc(shippingRulesTable.id));
    res.json(rules);
  } catch {
    res.status(500).json({ error: "Failed to fetch shipping rules" });
  }
});

router.post("/admin/shipping/rules", adminMiddleware as any, async (req: Request, res: Response) => {
  const {
    name, type, methodName, deliveryTime,
    minValue, maxValue, price,
    productIds, categoryIds, cities,
    priority, enabled,
  } = req.body;

  if (!name || !type) {
    res.status(400).json({ error: "name and type are required" });
    return;
  }

  try {
    const inserted = await db
      .insert(shippingRulesTable)
      .values({
        name,
        type,
        methodName: methodName ?? "Standard Delivery",
        deliveryTime: deliveryTime ?? "2–3 business days",
        minValue: minValue != null ? String(minValue) : null,
        maxValue: maxValue != null ? String(maxValue) : null,
        price: String(price ?? 0),
        productIds: Array.isArray(productIds) ? productIds : [],
        categoryIds: Array.isArray(categoryIds) ? categoryIds : [],
        cities: Array.isArray(cities) ? cities : [],
        priority: Number(priority ?? 10),
        enabled: enabled !== false,
      })
      .returning();
    res.status(201).json(inserted[0]);
  } catch {
    res.status(500).json({ error: "Failed to create shipping rule" });
  }
});

router.put("/admin/shipping/rules/:id", adminMiddleware as any, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const {
    name, type, methodName, deliveryTime,
    minValue, maxValue, price,
    productIds, categoryIds, cities,
    priority, enabled,
  } = req.body;

  try {
    const updated = await db
      .update(shippingRulesTable)
      .set({
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(methodName !== undefined && { methodName }),
        ...(deliveryTime !== undefined && { deliveryTime }),
        ...(minValue !== undefined && { minValue: minValue != null ? String(minValue) : null }),
        ...(maxValue !== undefined && { maxValue: maxValue != null ? String(maxValue) : null }),
        ...(price !== undefined && { price: String(price) }),
        ...(productIds !== undefined && { productIds: Array.isArray(productIds) ? productIds : [] }),
        ...(categoryIds !== undefined && { categoryIds: Array.isArray(categoryIds) ? categoryIds : [] }),
        ...(cities !== undefined && { cities: Array.isArray(cities) ? cities : [] }),
        ...(priority !== undefined && { priority: Number(priority) }),
        ...(enabled !== undefined && { enabled }),
        updatedAt: new Date(),
      })
      .where(eq(shippingRulesTable.id, id))
      .returning();

    if (!updated.length) { res.status(404).json({ error: "Rule not found" }); return; }
    res.json(updated[0]);
  } catch {
    res.status(500).json({ error: "Failed to update shipping rule" });
  }
});

router.delete("/admin/shipping/rules/:id", adminMiddleware as any, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(shippingRulesTable).where(eq(shippingRulesTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete shipping rule" });
  }
});

router.patch("/admin/shipping/rules/:id/toggle", adminMiddleware as any, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const rows = await db.select().from(shippingRulesTable).where(eq(shippingRulesTable.id, id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Rule not found" }); return; }
    const updated = await db
      .update(shippingRulesTable)
      .set({ enabled: !rows[0].enabled, updatedAt: new Date() })
      .where(eq(shippingRulesTable.id, id))
      .returning();
    res.json(updated[0]);
  } catch {
    res.status(500).json({ error: "Failed to toggle shipping rule" });
  }
});

/* ─── city delivery info (public) ──────────────────────────────────── */
/**
 * GET /api/shipping/city-info?city=Lahore
 * Returns the best delivery option for a given city (no cart needed).
 */
router.get("/shipping/city-info", async (req: Request, res: Response) => {
  const DEFAULT = { fee: 150, isFree: false, methodName: "Standard Delivery", deliveryTime: "3–5 business days", hasSpecialRule: false };
  try {
    const city = String(req.query.city ?? "").trim().toLowerCase();
    if (!city) { res.json(DEFAULT); return; }

    const rules = await db
      .select()
      .from(shippingRulesTable)
      .where(eq(shippingRulesTable.enabled, true))
      .orderBy(asc(shippingRulesTable.priority), asc(shippingRulesTable.id));

    const build = (rule: typeof rules[0], special: boolean) => ({
      fee: Number(rule.price),
      isFree: Number(rule.price) === 0,
      methodName: rule.methodName,
      deliveryTime: rule.deliveryTime,
      hasSpecialRule: special,
    });

    /* 1. City-specific flat rule */
    for (const rule of rules) {
      const cities = (rule.cities as string[] | null) ?? [];
      if (cities.length && cities.some(c => c.trim().toLowerCase() === city) && rule.type === "flat") {
        res.json(build(rule, true)); return;
      }
    }
    /* 2. City-specific amount / weight rule with no-city fallback ignored */
    for (const rule of rules) {
      const cities = (rule.cities as string[] | null) ?? [];
      if (cities.length && cities.some(c => c.trim().toLowerCase() === city)) {
        res.json(build(rule, true)); return;
      }
    }
    /* 3. Global flat rule (no city filter) */
    for (const rule of rules) {
      const cities = (rule.cities as string[] | null) ?? [];
      if (!cities.length && rule.type === "flat") {
        res.json(build(rule, false)); return;
      }
    }
    res.json(DEFAULT);
  } catch {
    res.json(DEFAULT);
  }
});

/* ─── calculate shipping (public) ──────────────────────────────────── */

/**
 * POST /api/shipping/calculate
 * Body: { items: [{productId, qty, price}], city?: string }
 * Returns: { fee, isFree, methodName, deliveryTime, ruleName }
 */
router.post("/shipping/calculate", async (req: Request, res: Response) => {
  const DEFAULT = {
    fee: 150,
    isFree: false,
    methodName: "Standard Delivery",
    deliveryTime: "2–3 business days",
    ruleName: "Default",
  };

  try {
    const { items = [], city = "" } = req.body as {
      items?: { productId: number; qty: number; price?: number }[];
      city?: string;
    };

    if (!items.length) { res.json(DEFAULT); return; }

    const rules = await db
      .select()
      .from(shippingRulesTable)
      .where(eq(shippingRulesTable.enabled, true))
      .orderBy(asc(shippingRulesTable.priority), asc(shippingRulesTable.id));

    if (!rules.length) { res.json(DEFAULT); return; }

    // Fetch product details for weight + category
    const uniqueProductIds = [...new Set(items.map((i) => i.productId))];
    const products = await db
      .select({ id: productsTable.id, weight: productsTable.weight, categoryId: productsTable.categoryId })
      .from(productsTable)
      .where(uniqueProductIds.length === 1
        ? eq(productsTable.id, uniqueProductIds[0])
        : inArray(productsTable.id, uniqueProductIds)
      );

    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let totalWeightGrams = 0;
    const cartProductIds = new Set<number>();
    const cartCategoryIds = new Set<number>();

    for (const item of items) {
      const p = productMap.get(item.productId);
      if (p) {
        totalWeightGrams += parseWeightToGrams(p.weight) * item.qty;
        if (p.categoryId) cartCategoryIds.add(p.categoryId);
      }
      if (item.price) subtotal += Number(item.price) * item.qty;
      cartProductIds.add(item.productId);
    }

    const cityLower = city.trim().toLowerCase();

    function matchesCity(ruleCities: string[] | null): boolean {
      const list = ruleCities ?? [];
      if (!list.length) return true;
      return list.some((c) => c.trim().toLowerCase() === cityLower);
    }

    function buildResult(rule: typeof rules[0]) {
      const fee = Number(rule.price);
      return { fee, isFree: fee === 0, methodName: rule.methodName, deliveryTime: rule.deliveryTime, ruleName: rule.name };
    }

    // Group by type — rules are already sorted by priority ASC
    for (const rule of rules) {
      if (!matchesCity(rule.cities as string[] | null)) continue;

      if (rule.type === "product") {
        const rIds = (rule.productIds as number[] | null) ?? [];
        if (rIds.some((id) => cartProductIds.has(id))) { res.json(buildResult(rule)); return; }
        continue;
      }

      if (rule.type === "category") {
        const cIds = (rule.categoryIds as number[] | null) ?? [];
        if (cIds.some((id) => cartCategoryIds.has(id))) { res.json(buildResult(rule)); return; }
        continue;
      }

      if (rule.type === "weight") {
        const min = rule.minValue != null ? Number(rule.minValue) : 0;
        const max = rule.maxValue != null ? Number(rule.maxValue) : Infinity;
        if (totalWeightGrams >= min && totalWeightGrams <= max) { res.json(buildResult(rule)); return; }
        continue;
      }

      if (rule.type === "amount") {
        const min = rule.minValue != null ? Number(rule.minValue) : 0;
        const max = rule.maxValue != null ? Number(rule.maxValue) : Infinity;
        if (subtotal >= min && subtotal <= max) { res.json(buildResult(rule)); return; }
        continue;
      }

      if (rule.type === "flat") {
        res.json(buildResult(rule));
        return;
      }
    }

    res.json(DEFAULT);
  } catch {
    res.status(500).json({ error: "Failed to calculate shipping" });
  }
});

export default router;
