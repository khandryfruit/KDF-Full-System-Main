import { db, branchProductsTable, erpCostLayersTable, erpPriceHistoryTable, erpPriceSuggestionsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

export type CostingResult = {
  avgCost: number;
  lastPurchasePrice: number;
  totalQty: number;
  suggestedSalePrice?: number;
};

/** Weighted average cost from remaining cost layers + new receipt */
export async function applyPurchaseCostLayer(opts: {
  productId: number;
  branchId: number;
  qty: number;
  unitCost: number;
  purchaseId: number;
  purchaseLineId: number;
  defaultMarginPct?: number;
}): Promise<CostingResult> {
  const { productId, branchId, qty, unitCost, purchaseId, purchaseLineId, defaultMarginPct = 25 } = opts;

  const layers = await db.select().from(erpCostLayersTable)
    .where(and(
      eq(erpCostLayersTable.productId, productId),
      eq(erpCostLayersTable.branchId, branchId),
      sql`${erpCostLayersTable.qtyRemaining} > 0`,
    ));

  let prevQty = 0;
  let prevValue = 0;
  for (const l of layers) {
    const q = parseFloat(String(l.qtyRemaining));
    const c = parseFloat(String(l.unitCost));
    prevQty += q;
    prevValue += q * c;
  }

  const newQty = prevQty + qty;
  const newValue = prevValue + qty * unitCost;
  const avgCost = newQty > 0 ? newValue / newQty : unitCost;

  await db.insert(erpCostLayersTable).values({
    productId,
    branchId,
    purchaseId,
    purchaseLineId,
    qtyReceived: String(qty),
    qtyRemaining: String(qty),
    unitCost: String(unitCost),
  });

  const [product] = await db.select().from(branchProductsTable).where(eq(branchProductsTable.id, productId)).limit(1);
  const currentSale = parseFloat(String(product?.salePrice ?? "0"));
  const suggestedSalePrice = Math.ceil(avgCost * (1 + defaultMarginPct / 100));

  await db.update(branchProductsTable).set({
    purchasePrice: String(unitCost),
    lastPurchasePrice: String(unitCost),
    avgCost: String(avgCost.toFixed(2)),
    updatedAt: new Date(),
  }).where(eq(branchProductsTable.id, productId));

  await db.insert(erpPriceHistoryTable).values({
    productId,
    branchId,
    purchasePrice: String(unitCost),
    salePrice: product?.salePrice ?? null,
    avgCost: String(avgCost.toFixed(2)),
    source: "purchase",
  });

  if (currentSale > 0 && suggestedSalePrice > currentSale * 1.02) {
    const existing = await db.select().from(erpPriceSuggestionsTable)
      .where(and(
        eq(erpPriceSuggestionsTable.productId, productId),
        eq(erpPriceSuggestionsTable.status, "pending"),
      )).limit(1);
    if (!existing.length) {
      await db.insert(erpPriceSuggestionsTable).values({
        productId,
        branchId,
        currentSalePrice: String(currentSale),
        suggestedSalePrice: String(suggestedSalePrice),
        avgCost: String(avgCost.toFixed(2)),
        marginPct: String(defaultMarginPct),
      });
    }
  }

  return {
    avgCost,
    lastPurchasePrice: unitCost,
    totalQty: newQty,
    suggestedSalePrice: suggestedSalePrice > currentSale ? suggestedSalePrice : undefined,
  };
}

export async function getProductCostSummary(productId: number, branchId?: number) {
  const conditions = [eq(erpCostLayersTable.productId, productId), sql`${erpCostLayersTable.qtyRemaining} > 0`];
  if (branchId) conditions.push(eq(erpCostLayersTable.branchId, branchId));

  const layers = await db.select().from(erpCostLayersTable).where(and(...conditions));
  let qty = 0;
  let value = 0;
  for (const l of layers) {
    const q = parseFloat(String(l.qtyRemaining));
    qty += q;
    value += q * parseFloat(String(l.unitCost));
  }
  const [p] = await db.select().from(branchProductsTable).where(eq(branchProductsTable.id, productId)).limit(1);
  return {
    layers,
    qtyOnHand: parseFloat(String(p?.stockQty ?? "0")),
    weightedAvgCost: qty > 0 ? value / qty : parseFloat(String(p?.avgCost ?? p?.purchasePrice ?? "0")),
    lastPurchasePrice: parseFloat(String(p?.lastPurchasePrice ?? p?.purchasePrice ?? "0")),
    salePrice: parseFloat(String(p?.salePrice ?? "0")),
  };
}
