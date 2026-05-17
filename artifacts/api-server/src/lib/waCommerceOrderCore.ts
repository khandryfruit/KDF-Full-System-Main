import type { Product, ProductVariant } from "@workspace/db";

export function parseCommerceProductId(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(String(raw).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function findVariantInProduct(
  product: Pick<Product, "variants">,
  opts: { variantId?: string | number | null; variantTitle?: string | null },
): ProductVariant | null {
  const variants = (Array.isArray(product.variants) ? product.variants : []) as ProductVariant[];
  if (!variants.length) return null;

  const idHint = opts.variantId != null && String(opts.variantId).trim() !== ""
    ? String(opts.variantId).trim()
    : null;
  if (idHint) {
    const byId = variants.find((v) => String(v.id) === idHint);
    if (byId) return byId;
    const idx = Number.parseInt(idHint, 10);
    if (Number.isFinite(idx) && idx >= 1 && idx <= variants.length) {
      return variants[idx - 1] ?? null;
    }
  }

  const title = String(opts.variantTitle ?? "").trim().toLowerCase();
  if (!title) return variants[0] ?? null;

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const wanted = norm(title);
  return (
    variants.find((v) => {
      const label = norm(`${v.name ?? ""} ${v.value ?? ""}`.trim());
      return label === wanted || label.includes(wanted) || wanted.includes(label);
    }) ?? variants[0] ?? null
  );
}

export function applyCommerceStockDeduction(
  product: Pick<Product, "stock" | "variants">,
  variantId: string,
  qty: number,
): { stock: number; variants: ProductVariant[] } {
  const q = Math.max(1, Math.min(99, Math.floor(qty)));
  const variants = (Array.isArray(product.variants) ? [...product.variants] : []) as ProductVariant[];

  if (variants.length > 0) {
    const idx = variants.findIndex((v) => String(v.id) === String(variantId));
    if (idx < 0) {
      throw new Error(`Variant not found on product (variantId=${variantId})`);
    }
    const v = variants[idx]!;
    const available = Number(v.stock ?? 0);
    if (available < q) {
      throw new Error(`Insufficient stock for ${v.name ?? v.value ?? "variant"} (have ${available}, need ${q})`);
    }
    variants[idx] = { ...v, stock: available - q };
    const totalStock = variants.reduce((sum, row) => sum + Math.max(0, Number(row.stock ?? 0)), 0);
    return { stock: totalStock, variants };
  }

  const available = Number(product.stock ?? 0);
  if (available < q) {
    throw new Error(`Insufficient stock (have ${available}, need ${q})`);
  }
  return { stock: available - q, variants };
}
