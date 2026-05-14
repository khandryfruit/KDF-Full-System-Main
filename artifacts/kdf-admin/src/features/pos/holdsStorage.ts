import { POS_HOLDS_MAX, POS_HOLDS_STORAGE_KEY } from "./constants";
import type { PosHoldV1 } from "./types";

function readRaw(): PosHoldV1[] {
  try {
    const raw = localStorage.getItem(POS_HOLDS_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (h): h is PosHoldV1 =>
        h &&
        typeof h === "object" &&
        typeof (h as PosHoldV1).id === "string" &&
        Array.isArray((h as PosHoldV1).cart),
    );
  } catch {
    return [];
  }
}

function writeRaw(list: PosHoldV1[]): void {
  try {
    localStorage.setItem(POS_HOLDS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* */
  }
}

export function listHolds(): PosHoldV1[] {
  return readRaw();
}

export function pushHold(hold: PosHoldV1): PosHoldV1[] {
  const next = [hold, ...readRaw()];
  const trimmed = next.slice(0, POS_HOLDS_MAX);
  writeRaw(trimmed);
  return trimmed;
}

export function removeHoldById(id: string): PosHoldV1[] {
  const next = readRaw().filter((h) => h.id !== id);
  writeRaw(next);
  return next;
}
