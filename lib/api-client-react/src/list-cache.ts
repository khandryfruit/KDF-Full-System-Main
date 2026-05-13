/** Normalize cached list values that may be `T[]` or `{ items: T[] }`. */
export function normalizeListCache<T>(old: unknown): T[] {
  if (Array.isArray(old)) return old as T[];
  if (old != null && typeof old === "object") {
    const o = old as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as T[];
    if (Array.isArray(o.data)) return o.data as T[];
  }
  return [];
}
