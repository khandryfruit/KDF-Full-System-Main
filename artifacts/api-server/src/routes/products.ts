import { Router } from "express";
import { db, productsTable } from "@workspace/db";
import { eq, ilike, and, desc, asc, sql } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

router.get("/products", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const { categoryId, search, featured, sortBy } = req.query;

    const conditions: any[] = [eq(productsTable.active, true)];
    if (categoryId) conditions.push(eq(productsTable.categoryId, parseInt(categoryId as string)));
    if (featured === "true") conditions.push(eq(productsTable.featured, true));
    if (search) conditions.push(ilike(productsTable.name, `%${search}%`));

    let orderBy: any = desc(productsTable.createdAt);
    if (sortBy === "price_asc") orderBy = asc(productsTable.price);
    else if (sortBy === "price_desc") orderBy = desc(productsTable.price);
    else if (sortBy === "rating") orderBy = desc(productsTable.rating);

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [items, countResult] = await Promise.all([
      db.select().from(productsTable).where(where).orderBy(orderBy).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(productsTable).where(where),
    ]);

    res.json({ items, total: Number(countResult[0]?.count ?? 0), page, limit });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list products" });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const param = req.params.id;
    const isNumeric = /^\d+$/.test(param);
    const where = isNumeric
      ? eq(productsTable.id, parseInt(param))
      : eq(productsTable.slug, param);
    const [product] = await db.select().from(productsTable).where(where).limit(1);
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }
    res.json(product);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/products", adminMiddleware as any, async (req, res) => {
  try {
    const { name, price, stock, ...rest } = req.body;
    if (!name || !price) { res.status(400).json({ error: "name and price are required" }); return; }
    const slug = (rest.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now());
    const [product] = await db.insert(productsTable).values({ name, price, stock: stock ?? 0, slug, ...rest }).returning();
    res.status(201).json(product);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create product" });
  }
});

router.put("/products/:id", adminMiddleware as any, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [product] = await db.update(productsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(productsTable.id, id)).returning();
    if (!product) { res.status(404).json({ error: "Not found" }); return; }
    res.json(product);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

router.delete("/products/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(productsTable).where(eq(productsTable.id, parseInt(req.params.id)));
    res.json({ success: true, message: "Product deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

export default router;
