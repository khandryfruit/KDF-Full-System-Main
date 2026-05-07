import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CartItem {
  id: number;
  name: string;
  variant: string;
  variantId?: string;
  price: number;
  qty: number;
  gradient: string;
  image?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: number, variantId?: string) => void;
  updateQty: (id: number, qty: number, variantId?: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const STORAGE_KEY = 'kdf_cart';

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CartItem[];
  } catch {}
  return [];
}

function itemMatches(item: CartItem, id: number, variantId?: string): boolean {
  if (item.id !== id) return false;
  if (variantId !== undefined) return item.variantId === variantId;
  return true;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
  }, [items]);

  const addItem = (newItem: CartItem) => {
    setItems(prev => {
      const matches = (i: CartItem) =>
        i.id === newItem.id &&
        (newItem.variantId !== undefined
          ? i.variantId === newItem.variantId
          : i.variantId === undefined && i.variant === newItem.variant);
      const existing = prev.find(matches);
      if (existing) {
        return prev.map(i => matches(i) ? { ...i, qty: i.qty + newItem.qty } : i);
      }
      return [...prev, newItem];
    });
  };

  const removeItem = (id: number, variantId?: string) => {
    setItems(prev => prev.filter(i => !itemMatches(i, id, variantId)));
  };

  const updateQty = (id: number, qty: number, variantId?: string) => {
    if (qty < 1) { removeItem(id, variantId); return; }
    setItems(prev => prev.map(i => itemMatches(i, id, variantId) ? { ...i, qty } : i));
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((sum, i) => sum + i.qty, 0);
  const totalPrice = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clearCart, totalItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
