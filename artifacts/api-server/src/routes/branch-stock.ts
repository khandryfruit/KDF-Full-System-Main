import { Router } from "express";
import { eq, and, desc, ilike, sql, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { branchProductsTable, stockMovementsTable } from "@workspace/db/schema";
import { adminMiddleware, branchMiddleware } from "../lib/auth";
import type { BranchAuthRequest } from "../lib/auth";

const router = Router();

/* ═══════════════════════════════════════════════════════════
   ADMIN ROUTES — product & stock management
═══════════════════════════════════════════════════════════ */

/* GET /api/admin/stock/products */
router.get("/products", adminMiddleware, async (req, res) => {
  const { q, category, branchId, lowStock, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, parseInt(limit));
  const offset   = (pageNum - 1) * limitNum;

  const conditions: any[] = [];
  if (branchId) conditions.push(eq(branchProductsTable.branchId, parseInt(branchId)));
  if (category) conditions.push(ilike(branchProductsTable.category, `%${category}%`));
  if (q) conditions.push(or(
    ilike(branchProductsTable.name,     `%${q}%`),
    ilike(branchProductsTable.itemCode, `%${q}%`),
    ilike(branchProductsTable.barcode,  `%${q}%`),
  )!);
  if (lowStock === "1") conditions.push(sql`${branchProductsTable.stockQty} <= ${branchProductsTable.lowStockThreshold}`);

  const where = conditions.length ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(branchProductsTable).where(where);
  const products = await db.select().from(branchProductsTable).where(where).orderBy(branchProductsTable.name).limit(limitNum).offset(offset);
  res.json({ products, total, page: pageNum, limit: limitNum });
});

/* GET /api/admin/stock/products/:id */
router.get("/products/:id", adminMiddleware, async (req, res) => {
  const [product] = await db.select().from(branchProductsTable).where(eq(branchProductsTable.id, parseInt(req.params.id))).limit(1);
  if (!product) { res.status(404).json({ error: "Not found" }); return; }
  res.json(product);
});

/* POST /api/admin/stock/products */
router.post("/products", adminMiddleware, async (req, res) => {
  const data = req.body;
  const [product] = await db.insert(branchProductsTable).values({
    branchId:          data.branchId ?? null,
    itemCode:          data.itemCode,
    name:              data.name,
    unit:              data.unit ?? "KG",
    category:          data.category ?? null,
    purchasePrice:     data.purchasePrice ?? null,
    salePrice:         data.salePrice ?? null,
    stockQty:          data.stockQty ?? "0",
    lowStockThreshold: data.lowStockThreshold ?? "1",
    isActive:          data.isActive ?? true,
    barcode:           data.barcode ?? null,
    description:       data.description ?? null,
    imageUrl:          data.imageUrl ?? null,
  }).returning();
  res.status(201).json(product);
});

/* PUT /api/admin/stock/products/:id */
router.put("/products/:id", adminMiddleware, async (req, res) => {
  const data = req.body;
  const [product] = await db.update(branchProductsTable).set({
    ...data, updatedAt: new Date(),
  }).where(eq(branchProductsTable.id, parseInt(req.params.id))).returning();
  if (!product) { res.status(404).json({ error: "Not found" }); return; }
  res.json(product);
});

/* DELETE /api/admin/stock/products/:id */
router.delete("/products/:id", adminMiddleware, async (req, res) => {
  await db.update(branchProductsTable).set({ isActive: false, updatedAt: new Date() })
    .where(eq(branchProductsTable.id, parseInt(req.params.id)));
  res.json({ ok: true });
});

/* POST /api/admin/stock/adjust — manual stock adjustment */
router.post("/adjust", adminMiddleware, async (req, res) => {
  const { productId, type, qty, notes, branchId } = req.body;
  if (!productId || !type || qty == null) {
    res.status(400).json({ error: "productId, type, qty required" }); return;
  }
  const [product] = await db.select().from(branchProductsTable).where(eq(branchProductsTable.id, productId)).limit(1);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const balBefore = parseFloat(String(product.stockQty));
  let balAfter = balBefore;
  if (type === "in")         balAfter = balBefore + parseFloat(qty);
  else if (type === "out")   balAfter = balBefore - parseFloat(qty);
  else if (type === "adjustment") balAfter = parseFloat(qty);

  await db.update(branchProductsTable).set({ stockQty: String(balAfter), updatedAt: new Date() })
    .where(eq(branchProductsTable.id, productId));

  const [movement] = await db.insert(stockMovementsTable).values({
    productId, branchId: branchId ?? null, type,
    qty: String(type === "adjustment" ? Math.abs(balAfter - balBefore) : qty),
    balanceBefore: String(balBefore), balanceAfter: String(balAfter),
    referenceType: "adjustment", notes: notes ?? null,
  }).returning();
  res.json({ movement, balanceAfter: balAfter });
});

/* GET /api/admin/stock/movements?productId=&branchId= */
router.get("/movements", adminMiddleware, async (req, res) => {
  const { productId, branchId, page = "1", limit = "50" } = req.query as Record<string, string>;
  const conditions: any[] = [];
  if (productId) conditions.push(eq(stockMovementsTable.productId, parseInt(productId)));
  if (branchId)  conditions.push(eq(stockMovementsTable.branchId,  parseInt(branchId)));
  const where = conditions.length ? and(...conditions) : undefined;
  const movements = await db.select().from(stockMovementsTable).where(where)
    .orderBy(desc(stockMovementsTable.createdAt))
    .limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
  res.json(movements);
});

/* GET /api/admin/stock/overview — dashboard stats */
router.get("/overview", adminMiddleware, async (_req, res) => {
  const [totals] = await db.select({
    total:    sql<number>`count(*)::int`,
    active:   sql<number>`count(*) filter (where is_active = true)::int`,
    lowStock: sql<number>`count(*) filter (where stock_qty <= low_stock_threshold and is_active = true)::int`,
    outStock: sql<number>`count(*) filter (where stock_qty <= 0 and is_active = true)::int`,
    stockVal: sql<number>`coalesce(sum(stock_qty::numeric * coalesce(purchase_price::numeric, 0)), 0)::numeric`,
  }).from(branchProductsTable);
  res.json(totals);
});

/* ═══════════════════════════════════════════════════════════
   BRANCH ROUTES — read product catalogue + search
═══════════════════════════════════════════════════════════ */

/* GET /api/branch/stock/products — branch staff search (clean URL) */
router.get("/branch/products", branchMiddleware, async (req: BranchAuthRequest, res) => {
  const { q, category, page = "1", limit = "100" } = req.query as Record<string, string>;
  const branchId = req.branchUser!.branchId;

  const conditions: any[] = [
    eq(branchProductsTable.isActive, true),
    or(eq(branchProductsTable.branchId, branchId!), sql`${branchProductsTable.branchId} is null`)!,
  ];
  if (category) conditions.push(ilike(branchProductsTable.category, `%${category}%`));
  if (q) conditions.push(or(
    ilike(branchProductsTable.name,     `%${q}%`),
    ilike(branchProductsTable.itemCode, `%${q}%`),
    ilike(branchProductsTable.barcode,  `%${q}%`),
  )!);

  const products = await db.select().from(branchProductsTable)
    .where(and(...conditions)).orderBy(branchProductsTable.name)
    .limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
  res.json(products);
});

/* GET /api/branch/stock/search?q= — used by Branch POS item autocomplete */
router.get("/search", branchMiddleware, async (req: BranchAuthRequest, res) => {
  const { q = "", limit = "20" } = req.query as Record<string, string>;
  const branchId = req.branchUser!.branchId;

  const conditions: any[] = [
    eq(branchProductsTable.isActive, true),
    or(eq(branchProductsTable.branchId, branchId!), sql`${branchProductsTable.branchId} is null`)!,
  ];
  if (q.trim()) conditions.push(or(
    ilike(branchProductsTable.name,     `%${q}%`),
    ilike(branchProductsTable.itemCode, `%${q}%`),
    ilike(branchProductsTable.barcode,  `%${q}%`),
  )!);

  const products = await db.select({
    id:            branchProductsTable.id,
    itemCode:      branchProductsTable.itemCode,
    name:          branchProductsTable.name,
    unit:          branchProductsTable.unit,
    salePrice:     branchProductsTable.salePrice,
    purchasePrice: branchProductsTable.purchasePrice,
    stockQty:      branchProductsTable.stockQty,
    category:      branchProductsTable.category,
    barcode:       branchProductsTable.barcode,
  }).from(branchProductsTable)
    .where(and(...conditions))
    .orderBy(branchProductsTable.name)
    .limit(parseInt(limit));
  res.json(products);
});

export default router;
