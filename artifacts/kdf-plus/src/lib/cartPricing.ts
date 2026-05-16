import type { CartItem } from "@/context/CartContext";

export function getCartItemUnitPrice(item: CartItem): number {
  const variant = item.variantId
    ? (item.product.variants ?? []).find((v) => v.id === item.variantId)
    : undefined;
  const raw = variant?.price ?? item.product.price ?? "0";
  const price = Number.parseFloat(String(raw));
  return Number.isFinite(price) ? price : 0;
}

export function getCartItemLineTotal(item: CartItem): number {
  return getCartItemUnitPrice(item) * item.quantity;
}
