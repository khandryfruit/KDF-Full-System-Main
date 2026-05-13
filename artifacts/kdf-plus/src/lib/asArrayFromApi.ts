/** Normalize list endpoints that may return `T[]` or `{ items: T[] }` / `{ data: T[] }`. */
export function asArrayFromApi<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data != null && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as T[];
    if (Array.isArray(o.data)) return o.data as T[];
    if (Array.isArray(o.results)) return o.results as T[];
    if (Array.isArray(o.categories)) return o.categories as T[];
  }
  return [];
}

/** For React Query `setQueryData` when cached value may be array or wrapped list. */
export function normalizeListCache<T>(old: unknown): T[] {
  return asArrayFromApi<T>(old);
}
