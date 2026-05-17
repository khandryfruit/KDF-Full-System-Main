/** Coerce API product payloads so PDP never crashes on malformed JSON fields. */

export type ProductVariantRow = {
  id: string;
  name: string;
  value: string;
  price?: string;
  stock: number;
  hex?: string;
  sku?: string;
};

function asString(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

export function ensureStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((x) => asString(x)).filter(Boolean);
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return [];
    if (t.startsWith("[")) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed.map((x) => asString(x)).filter(Boolean);
      } catch {
        /* comma-separated */
      }
    }
    return t.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function ensureVariantArray(value: unknown): ProductVariantRow[] {
  let raw: unknown[] = [];
  if (Array.isArray(value)) raw = value;
  else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) raw = parsed;
    } catch {
      return [];
    }
  } else {
    return [];
  }

  return raw
    .filter((v) => v != null && typeof v === "object")
    .map((v, i) => {
      const row = v as Record<string, unknown>;
      const value = asString(row.value, asString(row.label, `Option ${i + 1}`));
      const name = asString(row.name, "Weight");
      const id = asString(row.id, `variant-${i}-${value}`);
      const stockRaw = row.stock;
      const stock =
        typeof stockRaw === "number"
          ? stockRaw
          : Number.parseInt(asString(stockRaw, "0"), 10) || 0;
      return {
        id,
        name,
        value,
        price: row.price != null ? asString(row.price) : undefined,
        stock,
        hex: row.hex != null ? asString(row.hex) : undefined,
        sku: row.sku != null ? asString(row.sku) : undefined,
      };
    });
}

export function normalizeProductDetail<T extends Record<string, unknown>>(product: T): T {
  const p = { ...product };
  p.name = asString(p.name, "Product");
  if (p.description != null && typeof p.description !== "string") {
    p.description = asString(p.description);
  }
  p.tags = ensureStringArray(p.tags);
  p.images = ensureStringArray(p.images);
  p.variants = ensureVariantArray(p.variants);
  return p;
}

export function buildVariantGroups(variants: ProductVariantRow[]) {
  const order: string[] = [];
  const map = new Map<string, ProductVariantRow[]>();
  for (const v of variants) {
    const type = v.name?.trim() || "Option";
    if (!map.has(type)) {
      map.set(type, []);
      order.push(type);
    }
    map.get(type)!.push(v);
  }
  return order.map((type) => ({ type, items: map.get(type)! }));
}
