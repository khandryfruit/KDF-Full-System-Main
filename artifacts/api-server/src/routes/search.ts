import { Router } from "express";
import { db, productsTable, categoriesTable } from "@workspace/db";
import { eq, ilike, or, and, sql } from "drizzle-orm";

const router = Router();

/* ── Synonym / alias map — user input → search terms ── */
const SYNONYMS: Record<string, string[]> = {
  badam: ["almond"],
  kaju: ["cashew"],
  pista: ["pistachio"],
  akhrot: ["walnut"],
  angoor: ["raisin"],
  kishmish: ["raisin"],
  khajoor: ["date"],
  anjeer: ["fig"],
  mungfali: ["peanut"],
  moongfali: ["peanut"],
  khumani: ["apricot"],
  aarooy: ["apricot"],
  meva: ["dry fruit"],
  mewa: ["dry fruit"],
  // common misspellings
  almonz: ["almond"],
  almonds: ["almond"],
  "cashews": ["cashew"],
  pistachios: ["pistachio"],
  walnuts: ["walnut"],
  raisins: ["raisin"],
  peanuts: ["peanut"],
  hazelnuts: ["hazelnut"],
  hasel: ["hazelnut"],
  hazel: ["hazelnut"],
  "dry fruits": ["dry fruit"],
  "dried fruit": ["dry fruit"],
  "nuts": ["nut"],
};

export function expandQuery(q: string): string[] {
  const lower = q.toLowerCase().trim();
  const terms = new Set<string>([lower]);
  for (const [key, values] of Object.entries(SYNONYMS)) {
    if (lower === key || lower.startsWith(key) || key.startsWith(lower)) {
      values.forEach(v => terms.add(v));
    }
  }
  // also try prefix (first 3+ chars) for partial typing
  if (lower.length >= 3) terms.add(lower.slice(0, Math.ceil(lower.length * 0.8)));
  return Array.from(terms).filter(t => t.length >= 1);
}

/* ── 30-second in-memory cache ── */
const cache = new Map<string, { data: any; exp: number }>();
function getCached(k: string) {
  const e = cache.get(k);
  return e && e.exp > Date.now() ? e.data : null;
}
function setCache(k: string, data: any) {
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  cache.set(k, { data, exp: Date.now() + 30_000 });
}

/* ── GET /api/search ── */
router.get("/search", async (req, res) => {
  const q = ((req.query.q as string) ?? "").trim();
  const type = (req.query.type as string) ?? "all";
  const limit = Math.min(20, parseInt(req.query.limit as string) || 8);

  if (!q) return res.json({ products: [], categories: [], query: "" });

  const cacheKey = `${q}|${type}|${limit}`;
  const hit = getCached(cacheKey);
  if (hit) return res.json(hit);

  try {
    const terms = expandQuery(q);

    const productCond = and(
      eq(productsTable.active, true),
      or(
        ...terms.map(t => ilike(productsTable.name, `%${t}%`)),
        ...terms.map(t => sql`coalesce(${productsTable.tags}::text, '') ILIKE ${`%${t}%`}`),
        ...terms.map(t => ilike(productsTable.description, `%${t}%`)),
      )
    );

    const catCond = and(
      eq(categoriesTable.active, true),
      or(...terms.map(t => ilike(categoriesTable.name, `%${t}%`)))
    );

    const [productRows, categoryRows] = await Promise.all([
      (type === "all" || type === "products")
        ? db.select({
            id: productsTable.id,
            name: productsTable.name,
            slug: productsTable.slug,
            price: productsTable.price,
            originalPrice: productsTable.originalPrice,
            stock: productsTable.stock,
            images: productsTable.images,
            variants: productsTable.variants,
          }).from(productsTable).where(productCond).limit(limit)
        : Promise.resolve([]),

      (type === "all" || type === "categories")
        ? db.select({
            id: categoriesTable.id,
            name: categoriesTable.name,
            slug: categoriesTable.slug,
            imageUrl: categoriesTable.imageUrl,
          }).from(categoriesTable).where(catCond).limit(4)
        : Promise.resolve([]),
    ]);

    const products = (productRows as any[]).map(p => {
      const imgs = (p.images as string[]) ?? [];
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: Number(p.price),
        originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
        stock: p.stock,
        image: imgs[0] ?? null,
        variants: (p.variants as any[]) ?? [],
      };
    });

    const categories = (categoryRows as any[]).map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      image: c.imageUrl ?? null,
    }));

    const result = { products, categories, query: q };
    setCache(cacheKey, result);
    return res.json(result);
  } catch (e: any) {
    req.log.error(e);
    return res.status(500).json({ error: e.message ?? "Search failed" });
  }
});

export default router;
