/**
 * Dynamic ecommerce categories from Admin `categories` table + canonical family mapping.
 */
import { db, categoriesTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { WaSalesCategory } from "./waCategoryDefinitions.js";
import { WA_SALES_CATEGORIES, getCategoryById } from "./waCategoryDefinitions.js";

const CACHE_MS = 60_000;
let cache: { at: number; dbCategories: Array<{ id: number; name: string; slug: string }> } | null = null;

/** DB slug/name → WhatsApp canonical category id */
const SLUG_TO_CANONICAL: Record<string, string> = {
  almonds: "almonds",
  almond: "almonds",
  badam: "almonds",
  pistachio: "pistachio",
  pistachios: "pistachio",
  pista: "pistachio",
  cashew: "cashew",
  cashews: "cashew",
  kaju: "cashew",
  walnut: "walnut",
  walnuts: "walnut",
  akhrot: "walnut",
  dates: "dates",
  date: "dates",
  khajoor: "dates",
  figs: "figs",
  fig: "figs",
  anjeer: "figs",
  berries: "berries",
  berry: "berries",
  "dried-berry": "berries",
  "dried-fruits": "mixed",
  "dried-fruits-nuts": "mixed",
  raisins: "raisins",
  kishmish: "raisins",
  peanuts: "peanuts",
  honey: "honey",
};

function norm(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .trim();
}

export async function loadActiveDbCategories(): Promise<Array<{ id: number; name: string; slug: string }>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.dbCategories;
  const rows = await db
    .select({ id: categoriesTable.id, name: categoriesTable.name, slug: categoriesTable.slug })
    .from(categoriesTable)
    .where(eq(categoriesTable.active, true))
    .orderBy(categoriesTable.sortOrder)
    .catch(() => []);
  cache = { at: now, dbCategories: rows };
  return rows;
}

export function mapDbCategoryToCanonical(slug: string, name: string): string | null {
  const s = norm(slug);
  const n = norm(name).replace(/-/g, " ");
  if (SLUG_TO_CANONICAL[s]) return SLUG_TO_CANONICAL[s];
  for (const [key, id] of Object.entries(SLUG_TO_CANONICAL)) {
    if (s.includes(key) || n.includes(key.replace(/-/g, " "))) return id;
  }
  return null;
}

export async function resolveCanonicalCategoryFromDb(query: string): Promise<{
  canonicalId: string | null;
  dbCategoryId: number | null;
  dbCategoryName: string | null;
}> {
  const staticCat = getCategoryById(query);
  if (staticCat) {
    const rows = await loadActiveDbCategories();
    const match = rows.find((r) => mapDbCategoryToCanonical(r.slug, r.name) === staticCat.id);
    return {
      canonicalId: staticCat.id,
      dbCategoryId: match?.id ?? null,
      dbCategoryName: match?.name ?? staticCat.labelEn,
    };
  }

  const q = norm(query).replace(/-/g, " ");
  const rows = await loadActiveDbCategories();
  for (const row of rows) {
    const slug = norm(row.slug);
    const name = norm(row.name);
    if (q === slug || q === name || q.includes(slug) || slug.includes(q) || q.includes(name)) {
      const canonicalId = mapDbCategoryToCanonical(row.slug, row.name);
      return { canonicalId, dbCategoryId: row.id, dbCategoryName: row.name };
    }
  }
  for (const row of rows) {
    const canonicalId = mapDbCategoryToCanonical(row.slug, row.name);
    if (canonicalId && q.includes(canonicalId)) {
      return { canonicalId, dbCategoryId: row.id, dbCategoryName: row.name };
    }
  }
  return { canonicalId: null, dbCategoryId: null, dbCategoryName: null };
}

/** Merged menu categories: live DB names + static family rules */
export async function listWaMenuCategories(): Promise<WaSalesCategory[]> {
  const dbRows = await loadActiveDbCategories();
  const seen = new Set<string>();
  const out: WaSalesCategory[] = [];

  for (const row of dbRows) {
    const canonicalId = mapDbCategoryToCanonical(row.slug, row.name);
    if (!canonicalId || seen.has(canonicalId)) continue;
    const base = getCategoryById(canonicalId);
    if (!base) continue;
    seen.add(canonicalId);
    out.push({
      ...base,
      labelEn: row.name,
      labelUr: row.name,
    });
  }

  for (const cat of WA_SALES_CATEGORIES) {
    if (!seen.has(cat.id)) out.push(cat);
  }
  return out;
}

export async function getProductIdsForDbCategory(dbCategoryId: number): Promise<number[]> {
  const rows = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.categoryId, dbCategoryId))
    .catch(() => []);
  return rows.map((r) => r.id);
}

export function invalidateWaCommerceCategoryCache(): void {
  cache = null;
}
