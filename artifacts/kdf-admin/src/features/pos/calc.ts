import type { CartRow } from "./types";

export const fmtRs = (n: number) =>
  `Rs ${n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const uid = () => Math.random().toString(36).slice(2, 8);

export function calcRow(row: CartRow): CartRow {
  const raw = row.qty * row.pricePerUnit;
  const total = Math.max(0, raw - (raw * row.discount) / 100);
  return { ...row, total };
}
