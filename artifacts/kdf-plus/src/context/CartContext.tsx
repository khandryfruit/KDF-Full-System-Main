import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Product } from "@workspace/api-client-react";
import { getSessionId, trackAbandonedCheckout } from "@/lib/abandonedCheckout";

export interface CartItem {
  product: Product;
  quantity: number;
  variantId?: string;
  variantLabel?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, quantity: number, variantId?: string, variantLabel?: string) => void;
  removeItem: (productId: number, variantId?: string) => void;
  updateQty: (productId: number, quantity: number, variantId?: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  miniCartOpen: boolean;
  setMiniCartOpen: (open: boolean) => void;
  lastAdded: CartItem | null;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [miniCartOpen, setMiniCartOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<CartItem | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("kdf_cart");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setItems(parsed.filter((item) => item?.product?.price !== undefined));
          }
        } catch {
          try { localStorage.removeItem("kdf_cart"); } catch {}
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("kdf_cart", JSON.stringify(items)); } catch {}
    if (items.length > 0) {
      const subtotal = items.reduce((sum, item) => {
        const variant = item.variantId
          ? (item.product.variants ?? []).find(v => v.id === item.variantId)
          : undefined;
        const price = variant?.price ? parseFloat(variant.price) : parseFloat(item.product.price ?? "0") || 0;
        return sum + price * item.quantity;
      }, 0);
      trackAbandonedCheckout({
        sessionId: getSessionId(),
        cartItems: items.map((item) => ({
          productId: item.product.id,
          name: item.product.name,
          price: item.product.price ?? "0",
          qty: item.quantity,
          variant: item.variantId,
          variantLabel: item.variantLabel,
          image: item.product.images?.[0] ?? undefined,
        })),
        subtotal,
        checkoutStep: "cart",
      });
    }
  }, [items]);

  const addItem = useCallback((product: Product, quantity: number, variantId?: string, variantLabel?: string) => {
    const newItem: CartItem = { product, quantity, variantId, variantLabel };
    setLastAdded(newItem);
    setMiniCartOpen(true);
    setItems((prev) => {
      const existing = prev.find(
        (item) => item.product.id === product.id && item.variantId === variantId
      );
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.variantId === variantId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, newItem];
    });
  }, []);

  const removeItem = useCallback((productId: number, variantId?: string) => {
    setItems((prev) =>
      prev.filter(
        (item) => !(item.product.id === productId && item.variantId === variantId)
      )
    );
  }, []);

  const updateQty = useCallback((productId: number, quantity: number, variantId?: string) => {
    if (quantity <= 0) {
      removeItem(productId, variantId);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.product.id === productId && item.variantId === variantId
          ? { ...item, quantity }
          : item
      )
    );
  }, [removeItem]);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  const totalPrice = items.reduce((sum, item) => {
    if (!item?.product?.price) return sum;
    const variant = item.variantId
      ? (item.product.variants ?? []).find(v => v.id === item.variantId)
      : undefined;
    const price = variant?.price ? parseFloat(variant.price) : parseFloat(item.product.price) || 0;
    return sum + price * item.quantity;
  }, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQty,
        clearCart,
        totalItems,
        totalPrice,
        miniCartOpen,
        setMiniCartOpen,
        lastAdded,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
