import { Router } from "express";
import { db, categoriesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

router.get("/categories", async (req, res) => {
  try {
    const categories = await db.select().from(categoriesTable).where(eq(categoriesTable.active, true)).orderBy(asc(categoriesTable.sortOrder));
    res.json(categories);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list categories" });
  }
});

router.post("/categories", adminMiddleware as any, async (req, res) => {
  try {
    const { name, slug, ...rest } = req.body;
    if (!name || !slug) { res.status(400).json({ error: "name and slug are required" }); return; }
    const [cat] = await db.insert(categoriesTable).values({ name, slug, ...rest }).returning();
    res.status(201).json(cat);
    import("../lib/googleIndexing").then(({ autoIndex, getSafeSettings }) => {
      getSafeSettings().then(s => { if (s.siteUrl && s.autoIndexEnabled) autoIndex(`${s.siteUrl.replace(/\/$/, "")}/categories/${slug}`, "category"); }).catch(() => {});
    }).catch(() => {});
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create category" });
  }
});

router.put("/categories/:id", adminMiddleware as any, async (req, res) => {
  try {
    const [cat] = await db.update(categoriesTable).set(req.body).where(eq(categoriesTable.id, parseInt(req.params.id))).returning();
    if (!cat) { res.status(404).json({ error: "Not found" }); return; }
    res.json(cat);
    if (cat.slug) {
      import("../lib/googleIndexing").then(({ autoIndex, getSafeSettings }) => {
        getSafeSettings().then(s => { if (s.siteUrl && s.autoIndexEnabled) autoIndex(`${s.siteUrl.replace(/\/$/, "")}/categories/${cat.slug}`, "category"); }).catch(() => {});
      }).catch(() => {});
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update category" });
  }
});

router.delete("/categories/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(categoriesTable).where(eq(categoriesTable.id, parseInt(req.params.id)));
    res.json({ success: true, message: "Category deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
