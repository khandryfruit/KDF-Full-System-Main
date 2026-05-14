import type { Customer } from "./types";

export const POS_DRAFT_STORAGE_KEY = "kdf_admin_pos_draft_v1";
export const POS_HOLDS_STORAGE_KEY = "kdf_admin_pos_holds_v1";
export const POS_HOLDS_MAX = 20;

/** Sentinel id for counter / walk-in sales (not synced as CRM row). */
export const WALKING_CUSTOMER_ID = -1;

export const WALKING_CUSTOMER: Customer = {
  id: WALKING_CUSTOMER_ID,
  name: "Walking customer",
  phone: undefined,
};

export function isWalkingCustomer(c: Customer | null | undefined): boolean {
  return c != null && c.id === WALKING_CUSTOMER_ID;
}
