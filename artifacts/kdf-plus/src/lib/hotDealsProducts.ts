import type { Product } from "@workspace/api-client-react";

export function getProductDiscountPercent(product: Product): number {
  const price = Number.parseFloat(String(product.price ?? "0"));
  const original = product.originalPrice ? Number.parseFloat(String(product.originalPrice)) : 0;
  if (!original || original <= price || price <= 0) return 0;
  return Math.round((1 - price / original) * 100);
}

function hotDealScore(product: Product): number {
  const discount = getProductDiscountPercent(product);
  const reviews = Number(product.reviewCount ?? 0);
  const featured = product.featured ? 25 : 0;
  const stock = typeof product.stock === "number" ? product.stock : 99;
  const lowStock = stock > 0 && stock <= 12 ? 18 : 0;
  const rating = Number(product.rating ?? 0) * 4;
  return discount * 3 + Math.min(reviews, 40) + featured + lowStock + rating;
}

/** Pick best hot-deal products: highest discount, popularity, low stock, featured. */
export function buildSmartHotDeals(products: Product[], limit = 10): Product[] {
  const seen = new Set<number>();
  const unique: Product[] = [];
  for (const p of products) {
    if (p?.id == null || seen.has(p.id)) continue;
    seen.add(p.id);
    unique.push(p);
  }
  return [...unique]
    .sort((a, b) => hotDealScore(b) - hotDealScore(a))
    .slice(0, limit);
}

export function maxDiscountAmong(products: Product[]): number {
  if (!products.length) return 0;
  return Math.max(0, ...products.map(getProductDiscountPercent));
}

/** End of local calendar day — urgency countdown for hot deals strip. */
export function endOfTodayIso(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
