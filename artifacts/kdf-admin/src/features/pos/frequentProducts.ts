import type { Product } from "./types";

const KEY = "kdf_pos_frequent_v1";
const MAX = 12;

type Entry = { id: number; hits: number; ts: number };

function read(): Entry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Entry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: Entry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
}

export function recordFrequentProduct(productId: number): void {
  const list = read();
  const i = list.findIndex((e) => e.id === productId);
  if (i >= 0) {
    list[i] = { ...list[i], hits: list[i].hits + 1, ts: Date.now() };
  } else {
    list.push({ id: productId, hits: 1, ts: Date.now() });
  }
  list.sort((a, b) => b.hits - a.hits || b.ts - a.ts);
  write(list);
}

export function frequentProductIds(): number[] {
  return read().map((e) => e.id);
}

export function pickFrequentProducts(catalog: Product[], limit = 8): Product[] {
  const ids = frequentProductIds();
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const out: Product[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (p) out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}
