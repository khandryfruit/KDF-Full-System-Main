import { Router } from "express";
import { eq, and, desc, ilike, sql, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { branchProductsTable, stockMovementsTable, shopifyProductsTable } from "@workspace/db/schema";
import { adminMiddleware, branchMiddleware } from "../lib/auth";
import type { BranchAuthRequest } from "../lib/auth";

const router = Router();

/* ═══════════════════════════════════════════════════════════
   ADMIN ROUTES — product & stock management
═══════════════════════════════════════════════════════════ */

/* GET /api/admin/stock/products */
router.get("/products", adminMiddleware, async (req, res) => {
  const { q, category, branchId, lowStock, page = "1", limit = "50", source } = req.query as Record<string, string>;
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
  const [{ total: branchTotal }] = await db.select({ total: sql<number>`count(*)::int` }).from(branchProductsTable).where(where);
  const branchProducts = await db.select().from(branchProductsTable).where(where).orderBy(branchProductsTable.name).limit(limitNum).offset(offset);
  const branchMapped = branchProducts.map(p => ({ ...p, source: "branch" as const }));

  /* Also include Shopify products (merged view, not paginated — capped at 500) */
  let shopifyMapped: any[] = [];
  if (!branchId && !lowStock) {
    const shopifyConds: any[] = [eq(shopifyProductsTable.status, "active")];
    if (q) shopifyConds.push(or(ilike(shopifyProductsTable.title, `%${q}%`), ilike(shopifyProductsTable.sku, `%${q}%`))!);
    if (category) shopifyConds.push(ilike(shopifyProductsTable.productType, `%${category}%`));

    /* Exclude items already in branch_products by name (case-insensitive) */
    const existingNames = branchMapped.map(p => p.name.toLowerCase());
    const shopifyRaw = await db.select({
      id: shopifyProductsTable.id,
      shopifyProductId: shopifyProductsTable.shopifyProductId,
      title: shopifyProductsTable.title,
      price: shopifyProductsTable.price,
      sku: shopifyProductsTable.sku,
      inventoryQuantity: shopifyProductsTable.inventoryQuantity,
      productType: shopifyProductsTable.productType,
      imageUrl: shopifyProductsTable.imageUrl,
      status: shopifyProductsTable.status,
    }).from(shopifyProductsTable).where(and(...shopifyConds)).orderBy(shopifyProductsTable.title).limit(500);

    shopifyMapped = shopifyRaw
      .filter(sp => !existingNames.includes(sp.title.toLowerCase()))
      .map(sp => ({
        id: -(sp.id),
        itemCode: sp.sku ?? `SHOPIFY-${sp.id}`,
        name: sp.title,
        unit: "Pcs",
        category: sp.productType ?? null,
        purchasePrice: null,
        salePrice: sp.price,
        stockQty: String(sp.inventoryQuantity ?? 0),
        lowStockThreshold: "1",
        isActive: true,
        barcode: sp.sku ?? null,
        description: null,
        branchId: null,
        imageUrl: sp.imageUrl ?? null,
        createdAt: new Date().toISOString(),
        source: "shopify" as const,
        shopifyProductId: sp.shopifyProductId,
      }));
  }

  const products  = [...branchMapped, ...shopifyMapped];
  const total     = (branchTotal as number) + shopifyMapped.length;
  res.json({ products, total, page: pageNum, limit: limitNum });
});

/* POST /api/admin/stock/import-shopify — import Shopify products into branch_products */
router.post("/import-shopify", adminMiddleware, async (req, res) => {
  const { branchId } = req.body as { branchId?: number };

  /* Fetch all active Shopify products */
  const shopifyProducts = await db.select({
    id: shopifyProductsTable.id,
    title: shopifyProductsTable.title,
    price: shopifyProductsTable.price,
    sku: shopifyProductsTable.sku,
    inventoryQuantity: shopifyProductsTable.inventoryQuantity,
    productType: shopifyProductsTable.productType,
    imageUrl: shopifyProductsTable.imageUrl,
  }).from(shopifyProductsTable).where(eq(shopifyProductsTable.status, "active"));

  /* Get existing branch product names to avoid duplicates */
  const existing = await db.select({ name: branchProductsTable.name }).from(branchProductsTable).where(eq(branchProductsTable.isActive, true));
  const existingLower = new Set(existing.map(e => e.name.toLowerCase()));

  const toInsert = shopifyProducts
    .filter(sp => !existingLower.has(sp.title.toLowerCase()))
    .map(sp => ({
      branchId: branchId ?? null,
      itemCode: sp.sku ?? `SHOPIFY-${sp.id}`,
      name: sp.title,
      unit: "Pcs" as string,
      category: sp.productType ?? null,
      purchasePrice: null,
      salePrice: sp.price ?? null,
      stockQty: String(sp.inventoryQuantity ?? 0),
      lowStockThreshold: "1",
      isActive: true,
      barcode: sp.sku ?? null,
      description: null,
      imageUrl: sp.imageUrl ?? null,
    }));

  if (toInsert.length === 0) {
    res.json({ imported: 0, skipped: shopifyProducts.length, message: "All Shopify products already exist in stock" });
    return;
  }

  /* Insert in batches of 50 */
  let imported = 0;
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50);
    await db.insert(branchProductsTable).values(batch);
    imported += batch.length;
  }

  res.json({ imported, skipped: shopifyProducts.length - imported, message: `Successfully imported ${imported} products from Shopify` });
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
  const limitNum = Math.min(50, parseInt(limit));

  /* 1 — search branch_products */
  const branchConds: any[] = [
    eq(branchProductsTable.isActive, true),
    or(eq(branchProductsTable.branchId, branchId!), sql`${branchProductsTable.branchId} is null`)!,
  ];
  if (q.trim()) branchConds.push(or(
    ilike(branchProductsTable.name,     `%${q}%`),
    ilike(branchProductsTable.itemCode, `%${q}%`),
    ilike(branchProductsTable.barcode,  `%${q}%`),
  )!);

  const branchResults = await db.select({
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
    .where(and(...branchConds))
    .orderBy(branchProductsTable.name)
    .limit(limitNum);

  /* 2 — also search shopify_products for any not already found */
  const branchNames = new Set(branchResults.map(p => p.name.toLowerCase()));
  const shopifyConds: any[] = [eq(shopifyProductsTable.status, "active")];
  if (q.trim()) shopifyConds.push(or(
    ilike(shopifyProductsTable.title, `%${q}%`),
    ilike(shopifyProductsTable.sku,   `%${q}%`),
  )!);

  const shopifyResults = await db.select({
    id:                shopifyProductsTable.id,
    title:             shopifyProductsTable.title,
    price:             shopifyProductsTable.price,
    sku:               shopifyProductsTable.sku,
    inventoryQuantity: shopifyProductsTable.inventoryQuantity,
    productType:       shopifyProductsTable.productType,
  }).from(shopifyProductsTable)
    .where(and(...shopifyConds))
    .orderBy(shopifyProductsTable.title)
    .limit(limitNum);

  const shopifyMapped = shopifyResults
    .filter(sp => !branchNames.has(sp.title.toLowerCase()))
    .map(sp => ({
      id:            -(sp.id),
      itemCode:      sp.sku ?? `SHOPIFY-${sp.id}`,
      name:          sp.title,
      unit:          "Pcs",
      salePrice:     sp.price,
      purchasePrice: null,
      stockQty:      String(sp.inventoryQuantity ?? 0),
      category:      sp.productType ?? null,
      barcode:       sp.sku ?? null,
      source:        "shopify",
    }));

  const combined = [...branchResults, ...shopifyMapped].slice(0, limitNum);
  res.json(combined);
});

export default router;
