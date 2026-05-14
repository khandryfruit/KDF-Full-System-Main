export interface Product {
  id: number;
  name: string;
  sku?: string;
  price: string;
  originalPrice?: string;
  stock: number;
  images?: string[];
  unit?: string;
  weight?: number;
  variants?: unknown[];
}

export type LineDiscountMode = "percent" | "fixed";

export interface CartRow {
  rowId: string;
  productId: number;
  sku: string;
  name: string;
  qty: number;
  unit: string;
  pricePerUnit: number;
  /** Percent 0–100, or fixed Rs off line (see discountMode). */
  discount: number;
  discountMode?: LineDiscountMode;
  total: number;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string;
  email?: string;
}

export interface PosHoldV1 {
  id: string;
  savedAt: number;
  billNo: string;
  cart: CartRow[];
  selectedRow: string | null;
  billDisc: number;
  billDiscFixedRs?: number;
  packingCharge?: number;
  shippingCharge?: number;
  extraCharges: number;
  remarks: string;
  internalNotes?: string;
  customer: Customer | null;
}

export interface PosDraftV1 {
  v: 1;
  cart: CartRow[];
  selectedRow: string | null;
  billDisc: number;
  billDiscFixedRs?: number;
  packingCharge?: number;
  shippingCharge?: number;
  extraCharges: number;
  remarks: string;
  internalNotes?: string;
  customer: Customer | null;
  billNo: string;
}
