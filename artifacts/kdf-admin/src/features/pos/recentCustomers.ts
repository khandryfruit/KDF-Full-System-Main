import type { Customer } from "./types";

const KEY = "kdf_admin_pos_recent_customers_v1";
const MAX = 10;

function readRaw(): Customer[] {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return [];
    const arr = JSON.parse(s) as Customer[];
    return Array.isArray(arr) ? arr.filter((c) => c && typeof c.id === "number" && c.id > 0) : [];
  } catch {
    return [];
  }
}

export function readRecentCustomers(): Customer[] {
  return readRaw();
}

/** Call when a saved customer is selected or after a successful sale. */
export function touchRecentCustomer(c: Customer | null): void {
  if (!c || c.id <= 0) return;
  const prev = readRaw().filter((x) => x.id !== c.id);
  const next = [{ id: c.id, name: c.name, phone: c.phone, email: c.email }, ...prev].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}
