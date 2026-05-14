/**
 * Grocery / loose weight selling: price is treated as Rs per kg for kg and g rows
 * (KDF convention — e.g. almonds Rs 5000/kg; cashier enters Rs 300 → 0.06 kg ≈ 60 g).
 */

export function isWeightLikeUnit(unit: string | undefined): boolean {
  const u = (unit ?? "").toLowerCase().trim();
  return ["kg", "kgs", "kilogram", "g", "gram", "grams", "gm", "litre", "l", "ml"].includes(u);
}

/** Effective Rs per 1 kg (or per litre for L). */
export function pricePerKgFromRow(pricePerUnit: number, unit: string | undefined): number {
  if (pricePerUnit <= 0) return 0;
  const u = (unit ?? "kg").toLowerCase().trim();
  if (u === "ml") return pricePerUnit * 1000;
  if (u === "g" || u === "gram" || u === "grams" || u === "gm") {
    return pricePerUnit;
  }
  if (u === "kg" || u === "kgs" || u === "kilogram") return pricePerUnit;
  if (u === "litre" || u === "l") return pricePerUnit;
  return pricePerUnit;
}

/** Quantity in kg from rupees amount. */
export function qtyKgFromRupees(pricePerUnit: number, unit: string | undefined, rs: number): number {
  const ppk = pricePerKgFromRow(pricePerUnit, unit);
  if (ppk <= 0 || rs <= 0) return 0;
  const raw = rs / ppk;
  return Math.round(raw * 1e6) / 1e6;
}

export function formatWeightFromKg(qtyKg: number): string {
  if (qtyKg <= 0 || !Number.isFinite(qtyKg)) return "—";
  const g = qtyKg * 1000;
  if (g < 1000 && g >= 0.5) {
    const rounded = Math.round(g * 10) / 10;
    return `${rounded} g`;
  }
  const s = qtyKg >= 1 ? qtyKg.toFixed(3) : qtyKg.toFixed(4);
  return `${s.replace(/\.?0+$/, "")} kg`;
}
