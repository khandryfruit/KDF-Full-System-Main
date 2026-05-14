import { POS_DRAFT_STORAGE_KEY } from "./constants";
import type { PosDraftV1 } from "./types";

export function readDraft(): PosDraftV1 | null {
  try {
    const raw = localStorage.getItem(POS_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<PosDraftV1>;
    if (d.v !== 1 || !Array.isArray(d.cart)) return null;
    return {
      v: 1,
      cart: d.cart,
      selectedRow: typeof d.selectedRow === "string" || d.selectedRow === null ? d.selectedRow : null,
      billDisc: typeof d.billDisc === "number" ? d.billDisc : 0,
      extraCharges: typeof d.extraCharges === "number" ? d.extraCharges : 0,
      remarks: typeof d.remarks === "string" ? d.remarks : "",
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
