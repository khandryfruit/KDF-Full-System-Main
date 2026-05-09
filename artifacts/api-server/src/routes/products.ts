import { Router } from "express";
import { db, productsTable } from "@workspace/db";
import { eq, ilike, and, desc, asc, sql } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";
import { generateSlugFromName, ensureUniqueSlug } from "../lib/slugify";

const router = Router();

/** Returns true if the slug is already in its canonical clean form */
function isCleanSlug(slug: string): boolean {
  return generateSlugFromName(slug) === slug;
}

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

router.get("/products/check-slug", adminMiddleware as any, async (req, res) => {
  try {
    const { slug, excludeId } = req.query;
    if (!slug) { res.status(400).json({ error: "slug required" }); return; }
    const conditions: any[] = [eq(productsTable.slug, slug as string)];
    if (excludeId) conditions.push(sql`${productsTable.id} != ${parseInt(excludeId as string)}`);
    const [existing] = await db.select({ id: productsTable.id }).from(productsTable).where(and(...conditions)).limit(1);
    res.json({ available: !existing, canonical: generateSlugFromName(slug as string) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/**
 * POST /api/admin/products/backfill-slugs
 * One-time migration: sanitizes all existing product slugs.
 * Safe to run multiple times (idempotent).
 * Must be registered before /products/:id to avoid route collision.
 */
router.post("/admin/products/backfill-slugs", adminMiddleware as any, backfillSlugsHandler);

/**
 * POST /api/products/fix-slugs (legacy alias, kept for backward compat)
 */
router.post("/products/fix-slugs", adminMiddleware as any, backfillSlugsHandler);

async function backfillSlugsHandler(req: any, res: any) {
  try {
    const allProducts = await db
      .select({ id: productsTable.id, name: productsTable.name, slug: productsTable.slug })
      .from(productsTable)
      .orderBy(asc(productsTable.id));

    let fixed = 0;
    let skipped = 0;
    const log: { id: number; old: string; new: string }[] = [];

    for (const p of allProducts) {
      const clean = generateSlugFromName(p.slug);
      if (clean === p.slug) { skipped++; continue; }

      const newSlug = await ensureUniqueSlug(clean, p.id);
      await db.update(productsTable).set({ slug: newSlug, updatedAt: new Date() }).where(eq(productsTable.id, p.id));
      log.push({ id: p.id, old: p.slug, new: newSlug });
      fixed++;
    }

    res.json({ success: true, fixed, skipped, log });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fix slugs" });
  }
}

/**
 * GET /products/:id
 * Supports numeric ID, clean slug, or legacy unclean slug (with spaces/uppercase).
 * If the param is an unclean slug, the product is found via its cleaned form
 * and the response includes X-Canonical-Slug so the frontend can redirect.
 */
router.get("/products/:id", async (req, res) => {
  try {
    const param = req.params.id;
    const isNumeric = /^\d+$/.test(param);

    if (isNumeric) {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, parseInt(param))).limit(1);
      if (!product) { res.status(404).json({ error: "Product not found" }); return; }
      res.json(product);
      return;
    }

    // Try exact slug match first
    let [product] = await db.select().from(productsTable).where(eq(productsTable.slug, param)).limit(1);

    // Fallback: clean the param and try again (handles legacy %20-decoded spaces and uppercase)
    if (!product) {
      const cleaned = generateSlugFromName(param);
      if (cleaned !== param && cleaned.length > 0) {
        [product] = await db.select().from(productsTable).where(eq(productsTable.slug, cleaned)).limit(1);
      }
    }

    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    // Signal unclean URL to the frontend for client-side canonical redirect
    if (!isCleanSlug(param) || param !== product.slug) {
      res.setHeader("X-Canonical-Slug", product.slug);
    }

    res.json(product);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/products", adminMiddleware as any, async (req, res) => {
  try {
    const { name, price, stock, slug: rawSlug, ...rest } = req.body;
    if (!name || !price) { res.status(400).json({ error: "name and price are required" }); return; }
    // Always sanitize: whether slug is provided by admin or generated from name
    const baseSlug = rawSlug?.trim() ? rawSlug.trim() : name;
    const slug = await ensureUniqueSlug(baseSlug);
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
    const { slug: rawSlug, name, ...rest } = req.body;

    let finalSlug: string | undefined;
    if (rawSlug !== undefined) {
      // Always sanitize the provided slug through generateSlugFromName
      const base = rawSlug.trim() ? rawSlug.trim() : (name ?? "");
      if (base) finalSlug = await ensureUniqueSlug(base, id);
    } else if (name !== undefined) {
      // If name changed but no explicit slug, re-generate slug from new name
      const [existing] = await db.select({ slug: productsTable.slug }).from(productsTable).where(eq(productsTable.id, id)).limit(1);
      // Only auto-update slug if current slug looks like it was auto-generated from the old name
      // (i.e., don't overwrite manually set slugs on name-only edits)
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    }

    const updateData: any = { ...rest, updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (finalSlug !== undefined) updateData.slug = finalSlug;

    const [product] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, id)).returning();
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

export { generateSlugFromName };
export default router;
