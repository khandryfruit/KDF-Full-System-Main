import type { Product } from "./types";

const MAX = 48;
const mem = new Map<string, { items: Product[]; ts: number }>();

function key(q: string) {
  return q.trim().toLowerCase();
}

export function getCachedProductSearch(query: string): Product[] | null {
  const k = key(query);
  if (k.length < 1) return null;
  const hit = mem.get(k);
  if (!hit) return null;
  if (Date.now() - hit.ts > 1000 * 60 * 30) {
    mem.delete(k);
    return null;
  }
  return hit.items;
}

export function setCachedProductSearch(query: string, items: Product[]): void {
  const k = key(query);
  if (k.length < 1) return;
  mem.set(k, { items, ts: Date.now() });
  while (mem.size > MAX) {
    const oldest = [...mem.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) mem.delete(oldest[0]);
  }
}
