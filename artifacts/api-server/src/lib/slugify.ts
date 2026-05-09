import { db, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Converts any string into a clean, SEO-friendly slug.
 * Rules: lowercase, alphanumeric + hyphens only, no leading/trailing hyphens,
 * no consecutive hyphens. e.g. "Cashews nuts 250g" → "cashews-nuts-250g"
 */
export function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Ensures the slug is unique in the products table.
 * Appends -2, -3, etc. if a collision is found.
 * excludeId: skip checking this product ID (for updates).
 */
export async function ensureUniqueSlug(base: string, excludeId?: number): Promise<string> {
  const cleanBase = generateSlugFromName(base);
  let candidate = cleanBase;
  let suffix = 2;
  while (true) {
    const existing = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.slug, candidate))
      .limit(1);
    if (existing.length === 0 || (excludeId !== undefined && existing[0]!.id === excludeId)) {
      return candidate;
    }
    candidate = `${cleanBase}-${suffix}`;
    suffix++;
  }
}
