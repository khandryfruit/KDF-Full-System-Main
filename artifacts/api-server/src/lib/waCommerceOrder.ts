/**
 * WhatsApp → Ecommerce order: resolve real product/variant IDs, images, and stock deduction.
 */
import { db, productsTable, type Product } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { resolveCommerceImageUrl } from "./commerceProductSearch.js";
import {
  applyCommerceStockDeduction,
  findVariantInProduct,
  parseCommerceProductId,
} from "./waCommerceOrderCore.js";

export { applyCommerceStockDeduction, findVariantInProduct, parseCommerceProductId } from "./waCommerceOrderCore.js";

export interface WaCartLineInput {
  productName?: string;
  commerceProductId?: string | number | null;
  shopifyProductId?: string | number | null;
  variantId?: string | number | null;
  variantTitle?: string | null;
  quantity?: number;
  unitPrice?: number | string;
  imageUrl?: string | null;
  sku?: string | null;
}

export interface ResolvedWaCartLine {
  productId: number;
  variantId: string;
  name: string;
  variantLabel: string;
  price: string;
  qty: number;
  gradient: string | null;
  imageUrl: string | null;
  sku: string | null;
}

export async function loadCommerceProductsByIds(ids: number[]): Promise<Map<number, Product>> {
  const unique = [...new Set(ids.filter((id) => id > 0))];
  if (!unique.length) return new Map();
  const rows = await db.select().from(productsTable).where(inArray(productsTable.id, unique));
  return new Map(rows.map((p) => [p.id, p]));
}

export async function resolveWaCartForOrder(cart: WaCartLineInput[]): Promise<ResolvedWaCartLine[]> {
  if (!cart.length) throw new Error("cart_missing");

  const productIds = cart
    .map((line) => parseCommerceProductId(line.commerceProductId ?? line.shopifyProductId))
    .filter((id): id is number => id != null);

  if (productIds.length !== cart.length) {
    throw new Error("cart_missing_product_id");
  }

  const productMap = await loadCommerceProductsByIds(productIds);
  const resolved: ResolvedWaCartLine[] = [];

  for (const line of cart) {
    const productId = parseCommerceProductId(line.commerceProductId ?? line.shopifyProductId)!;
    const product = productMap.get(productId);
    if (!product || !product.active) {
      throw new Error(`product_not_found:${productId}`);
    }

    const variant = findVariantInProduct(product, {
      variantId: line.variantId,
      variantTitle: line.variantTitle,
    });
    if (!variant) {
      throw new Error(`variant_not_found:${productId}`);
    }

    const available = Number(variant.stock ?? product.stock ?? 0);
    const qty = Math.max(1, Math.min(99, Number.parseInt(String(line.quantity ?? 1), 10) || 1));
    if (available < qty) {
      throw new Error(`insufficient_stock:${product.name}:${variant.value ?? variant.name}`);
    }

    let unitPrice = Number.parseFloat(String(line.unitPrice ?? variant.price ?? product.price));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      unitPrice = Number.parseFloat(String(variant.price ?? product.price));
    }
    if (unitPrice > 250_000) unitPrice = unitPrice / 100;

    const imgs = (Array.isArray(product.images) ? product.images : []) as string[];
    const imageUrl = resolveCommerceImageUrl(line.imageUrl ?? imgs[0] ?? null);
    const variantLabel = String(line.variantTitle ?? variant.value ?? variant.name ?? "Standard").trim();

    resolved.push({
      productId,
      variantId: String(variant.id),
      name: String(line.productName ?? product.name).trim() || product.name,
      variantLabel,
      price: unitPrice.toFixed(2),
      qty,
      gradient: product.gradient ?? null,
      imageUrl,
      sku: line.sku ?? variant.sku ?? null,
    });
  }

  return resolved;
}

export async function deductWaCommerceInventory(
  tx: typeof db,
  lines: ResolvedWaCartLine[],
): Promise<void> {
  const byProduct = new Map<number, ResolvedWaCartLine[]>();
  for (const line of lines) {
    const list = byProduct.get(line.productId) ?? [];
    list.push(line);
    byProduct.set(line.productId, list);
  }

  for (const [productId, productLines] of byProduct) {
    const [locked] = await tx
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .for("update")
      .limit(1);

    if (!locked) throw new Error(`product_not_found:${productId}`);

    let working: Pick<Product, "stock" | "variants"> = {
      stock: locked.stock,
      variants: locked.variants as ProductVariant[],
    };

    for (const line of productLines) {
      working = applyCommerceStockDeduction(working, line.variantId, line.qty);
    }

    await tx
      .update(productsTable)
      .set({
        stock: working.stock,
        variants: working.variants,
        updatedAt: new Date(),
      })
      .where(eq(productsTable.id, productId));
  }
}

export function resolvedLinesToOrderItemRows(orderId: number, lines: ResolvedWaCartLine[]) {
  return lines.map((line) => ({
    orderId,
    productId: line.productId,
    name: line.name,
    variant: line.variantLabel,
    price: line.price,
    qty: line.qty,
    gradient: line.gradient,
  }));
}

/** Attach product thumbnails to order items for admin UI */
export async function enrichOrderItemsWithProductImages<T extends { productId?: number | null }>(
  items: T[],
): Promise<Array<T & { productImage?: string | null }>> {
  const ids = [...new Set(items.map((i) => i.productId).filter((id): id is number => id != null && id > 0))];
  if (!ids.length) return items.map((i) => ({ ...i, productImage: null }));

  const rows = await db
    .select({ id: productsTable.id, images: productsTable.images })
    .from(productsTable)
    .where(inArray(productsTable.id, ids));

  const imgMap = new Map<number, string | null>();
  for (const row of rows) {
    const imgs = (Array.isArray(row.images) ? row.images : []) as string[];
    imgMap.set(row.id, resolveCommerceImageUrl(imgs[0] ?? null));
  }

  return items.map((item) => ({
    ...item,
    productImage: item.productId ? imgMap.get(item.productId) ?? null : null,
  }));
}
