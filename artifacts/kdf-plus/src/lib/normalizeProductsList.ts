import type { Product } from "@workspace/api-client-react";

export type ProductsListShape = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
};

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeJson(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith("{") || t.startsWith("[");
}

/**
 * Normalizes product list API payloads so the UI works whether the client
 * received `{ items, total, page, limit }`, a legacy `{ data: { ... } }`
 * wrapper, a bare array, or a JSON string (e.g. misconfigured Content-Type).
 */
export function normalizeProductsListResponse(raw: unknown): ProductsListShape {
  const empty: ProductsListShape = { items: [], total: 0, page: 1, limit: 20 };

  if (raw == null) return empty;

  if (typeof raw === "string") {
    const trimmed = stripBom(raw).trim();
    if (!trimmed) return empty;
    if (!looksLikeJson(trimmed)) return empty;
    try {
      return normalizeProductsListResponse(JSON.parse(trimmed) as unknown);
    } catch {
      return empty;
    }
  }

  if (Array.isArray(raw)) {
    return {
      items: raw as Product[],
      total: raw.length,
      page: 1,
      limit: raw.length || 20,
    };
  }

  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;

    if (Array.isArray(o.items)) {
      const items = o.items as Product[];
      const total = Number(o.total);
      return {
        items,
        total: Number.isFinite(total) ? total : items.length,
        page: Number(o.page) || 1,
        limit: Number(o.limit) || 20,
      };
    }

    const nested = o.data;
    if (nested != null && typeof nested === "object") {
      return normalizeProductsListResponse(nested);
    }
    if (Array.isArray(o.data)) {
      const items = o.data as Product[];
      return {
        items,
        total: items.length,
        page: 1,
        limit: items.length || 20,
      };
    }
  }

  return empty;
}
