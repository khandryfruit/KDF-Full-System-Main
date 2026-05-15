import { db, branchProductsTable, stockMovementsTable, productsTable } from "@workspace/db";
import { eq, and, or, sql } from "drizzle-orm";
import { applyPurchaseCostLayer } from "./erpCosting.js";
import { syncCatalogRow, type CatalogRow } from "./unifiedProductImport.js";
import { generateSlugFromName } from "./slugify.js";

export type PurchaseLineInput = {
  productId?: number;
  itemCode?: string;
  name: string;
  qty: number;
  unit?: string;
  unitCost: number;
  taxAmt?: number;
  batchNo?: string;
};

/** Find or create branch product for purchase line */
export async function resolveBranchProduct(
  branchId: number,
  line: PurchaseLineInput,
): Promise<number> {
  if (line.productId) return line.productId;

  const code = (line.itemCode ?? generateSlugFromName(line.name).toUpperCase().slice(0, 24)).trim();
  const [existing] = await db.select().from(branchProductsTable)
    .where(and(
      eq(branchProductsTable.itemCode, code),
      or(eq(branchProductsTable.branchId, branchId), sql`${branchProductsTable.branchId} is null`)!,
    )).limit(1);

  if (existing) return existing.id;

  const [created] = await db.insert(branchProductsTable).values({
    branchId,
    itemCode: code,
    name: line.name,
    unit: line.unit ?? "KG",
    purchasePrice: String(line.unitCost),
    lastPurchasePrice: String(line.unitCost),
    salePrice: String(Math.ceil(line.unitCost * 1.25)),
    stockQty: "0",
    isActive: true,
  }).returning({ id: branchProductsTable.id });

  return created!.id;
}

/** Post purchase: stock in + weighted avg cost + optional e-commerce sync */
export async function postPurchaseInventory(opts: {
  branchId: number;
  purchaseId: number;
  purchaseLineId: number;
  productId: number;
  qty: number;
  unitCost: number;
  syncEcommerce?: boolean;
  productName?: string;
  itemCode?: string;
  unit?: string;
}): Promise<void> {
  const { branchId, purchaseId, purchaseLineId, productId, qty, unitCost } = opts;

  const [product] = await db.select().from(branchProductsTable).where(eq(branchProductsTable.id, productId)).limit(1);
  if (!product) throw new Error("Product not found");

  const balBefore = parseFloat(String(product.stockQty));
  const balAfter = balBefore + qty;

  await db.update(branchProductsTable).set({
    stockQty: String(balAfter),
    branchId,
    updatedAt: new Date(),
  }).where(eq(branchProductsTable.id, productId));

  await db.insert(stockMovementsTable).values({
    productId,
    branchId,
    type: "in",
    qty: String(qty),
    balanceBefore: String(balBefore),
    balanceAfter: String(balAfter),
    reference: `PUR-${purchaseId}`,
    referenceType: "purchase",
    notes: `Purchase #${purchaseId}`,
  });

  await applyPurchaseCostLayer({
    productId,
    branchId,
    qty,
    unitCost,
    purchaseId,
    purchaseLineId,
  });

  if (opts.syncEcommerce !== false) {
    const row: CatalogRow = {
      rowNum: 0,
      productName: opts.productName ?? product.name,
      sku: opts.itemCode ?? product.itemCode,
      barcode: product.barcode ?? "",
      category: product.category?.split(" / ")[0] ?? "",
      subcategory: product.category?.split(" / ")[1] ?? "",
      purchasePrice: unitCost,
      salePrice: parseFloat(String(product.salePrice ?? unitCost * 1.25)),
      stock: Math.round(balAfter),
      unit: opts.unit ?? product.unit,
      branch: "",
      brand: "",
      description: product.description ?? "",
      tax: "",
      lowStockAlert: parseFloat(String(product.lowStockThreshold ?? "1")),
      images: product.imageUrl ? [product.imageUrl] : [],
    };
    await syncCatalogRow(row, { syncEcommerce: true, syncBranches: false, recordMovements: false });
  }
}

/** Transfer stock between branches */
export async function postTransferReceive(opts: {
  transferId: number;
  lineId: number;
  fromBranchId: number;
  toBranchId: number;
  productId: number;
  qty: number;
  unitCost: number;
}): Promise<void> {
  const { fromBranchId, toBranchId, productId, qty, unitCost, transferId } = opts;

  const [src] = await db.select().from(branchProductsTable).where(eq(branchProductsTable.id, productId)).limit(1);
  if (!src) throw new Error("Source product missing");

  const srcBefore = parseFloat(String(src.stockQty));
  if (srcBefore < qty) throw new Error(`Insufficient stock: ${src.name}`);

  await db.update(branchProductsTable).set({
    stockQty: String(srcBefore - qty),
    updatedAt: new Date(),
  }).where(eq(branchProductsTable.id, productId));

  await db.insert(stockMovementsTable).values({
    productId,
    branchId: fromBranchId,
    type: "transfer",
    qty: String(qty),
    balanceBefore: String(srcBefore),
    balanceAfter: String(srcBefore - qty),
    reference: `TR-${transferId}`,
    referenceType: "transfer_out",
  });

  const [destExisting] = await db.select().from(branchProductsTable)
    .where(and(eq(branchProductsTable.itemCode, src.itemCode), eq(branchProductsTable.branchId, toBranchId))).limit(1);

  let destId = destExisting?.id;
  if (!destId) {
    destId = await resolveBranchProduct(toBranchId, {
      itemCode: src.itemCode,
      name: src.name,
      unit: src.unit,
      unitCost,
      qty: 0,
    });
    await db.update(branchProductsTable).set({ branchId: toBranchId }).where(eq(branchProductsTable.id, destId));
  }

  const [dest] = await db.select().from(branchProductsTable).where(eq(branchProductsTable.id, destId)).limit(1);
  const destBefore = parseFloat(String(dest?.stockQty ?? "0"));
  const destAfter = destBefore + qty;

  await db.update(branchProductsTable).set({
    stockQty: String(destAfter),
    avgCost: src.avgCost ?? src.purchasePrice,
    updatedAt: new Date(),
  }).where(eq(branchProductsTable.id, destId));

  await db.insert(stockMovementsTable).values({
    productId: destId,
    branchId: toBranchId,
    type: "transfer",
    qty: String(qty),
    balanceBefore: String(destBefore),
    balanceAfter: String(destAfter),
    reference: `TR-${transferId}`,
    referenceType: "transfer_in",
    notes: `From branch ${fromBranchId}`,
  });
}

/** Deduct stock on sale invoice (optional POS hook) */
export async function postSaleStockOut(opts: {
  branchId: number;
  productId: number;
  qty: number;
  reference: string;
}): Promise<void> {
  const [product] = await db.select().from(branchProductsTable).where(eq(branchProductsTable.id, productId)).limit(1);
  if (!product) return;

  const balBefore = parseFloat(String(product.stockQty));
  const balAfter = Math.max(0, balBefore - opts.qty);

  await db.update(branchProductsTable).set({ stockQty: String(balAfter), updatedAt: new Date() })
    .where(eq(branchProductsTable.id, productId));

  await db.insert(stockMovementsTable).values({
    productId: opts.productId,
    branchId: opts.branchId,
    type: "out",
    qty: String(opts.qty),
    balanceBefore: String(balBefore),
    balanceAfter: String(balAfter),
    reference: opts.reference,
    referenceType: "sale",
  });

  const [web] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(eq(productsTable.externalId, product.itemCode)).limit(1);
  if (web[0]) {
    await db.update(productsTable).set({ stock: Math.round(balAfter), updatedAt: new Date() })
      .where(eq(productsTable.id, web[0].id));
  }
}
