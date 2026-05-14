import { POS_DRAFT_STORAGE_KEY } from "./constants";
import type { PosDraftV1 } from "./types";

export function readDraft(): PosDraftV1 | null {
  try {
    const raw = localStorage.getItem(POS_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<PosDraftV1>;
    if (d.v !== 1 || !Array.isArray(d.cart)) return null;
    const extra =
      typeof d.extraCharges === "number" && !Number.isNaN(d.extraCharges) ? d.extraCharges : 0;
    const packing =
      typeof (d as { packingCharge?: number }).packingCharge === "number"
        ? (d as { packingCharge: number }).packingCharge
        : 0;
    const shipping =
      typeof (d as { shippingCharge?: number }).shippingCharge === "number"
        ? (d as { shippingCharge: number }).shippingCharge
        : 0;
    const hasSplit = packing > 0 || shipping > 0;
    const legacyExtra = !hasSplit && extra > 0 ? extra : 0;
    const shipFinal = hasSplit ? shipping : legacyExtra;
    const packFinal = hasSplit ? packing : 0;
    return {
      v: 1,
      cart: d.cart,
      selectedRow: typeof d.selectedRow === "string" || d.selectedRow === null ? d.selectedRow : null,
      billDisc: typeof d.billDisc === "number" ? d.billDisc : 0,
      billDiscFixedRs:
        typeof (d as { billDiscFixedRs?: number }).billDiscFixedRs === "number"
          ? (d as { billDiscFixedRs: number }).billDiscFixedRs
          : 0,
      packingCharge: packFinal,
      shippingCharge: shipFinal,
      extraCharges: packFinal + shipFinal,
      remarks: typeof d.remarks === "string" ? d.remarks : "",
      internalNotes:
        typeof (d as { internalNotes?: string }).internalNotes === "string"
          ? (d as { internalNotes: string }).internalNotes
          : "",
      customer: d.customer && typeof d.customer === "object" ? d.customer : null,
      billNo: typeof d.billNo === "string" && d.billNo ? d.billNo : `POS-${Date.now()}`,
    };
  } catch {
    return null;
  }
}

export function writeDraft(draft: PosDraftV1): void {
  try {
    localStorage.setItem(POS_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(POS_DRAFT_STORAGE_KEY);
  } catch {
    /* */
  }
}
