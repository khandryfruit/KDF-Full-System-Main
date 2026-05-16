/** Preset weight options in grams */
export const PRESET_WEIGHTS_GRAMS = [100, 250, 500, 750, 1000, 2000, 5000] as const;

export type VariantStockMode = "shared" | "individual";
export type VariantPriceMode = "linear" | "custom";

export interface WeightVariantInput {
  id: string;
  name: string;
  value: string;
  price?: string;
  stock: number;
  sku?: string;
}

export interface GenerateWeightVariantsOptions {
  baseWeightGrams: number;
  basePrice: number;
  baseStock: number;
  /** Target weights in grams (unique, sorted ascending) */
  weightGramsList: number[];
  stockMode: VariantStockMode;
  priceMode: VariantPriceMode;
  /** Per-weight stock when stockMode is individual (grams → stock) */
  individualStocks?: Record<number, number>;
  /** Per-weight price override when priceMode is custom (grams → price) */
  customPrices?: Record<number, number>;
  createId?: () => string;
}

/** Parse "250g", "250GM", "1kg", "1 KG" → grams */
export function parseWeightToGrams(input: string): number | null {
  const raw = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return null;

  const kgMatch = raw.match(/^([\d.]+)KG$/);
  if (kgMatch) {
    const n = parseFloat(kgMatch[1]);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : null;
  }

  const gMatch = raw.match(/^([\d.]+)G(?:M)?$/);
  if (gMatch) {
    const n = parseFloat(gMatch[1]);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  const numOnly = raw.match(/^([\d.]+)$/);
  if (numOnly) {
    const n = parseFloat(numOnly[1]);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  return null;
}

/** Standard label: 250GM, 1KG, 2KG */
export function formatWeightLabel(grams: number): string {
  if (grams >= 1000 && grams % 1000 === 0) {
    return `${grams / 1000}KG`;
  }
  if (grams >= 1000) {
    const kg = grams / 1000;
    return Number.isInteger(kg) ? `${kg}KG` : `${kg.toFixed(2).replace(/\.?0+$/, "")}KG`;
  }
  return `${grams}GM`;
}

/** Linear proportional price (PKR, rounded) */
export function calculateLinearPrice(
  basePrice: number,
  baseWeightGrams: number,
  targetWeightGrams: number
): number {
  if (baseWeightGrams <= 0 || basePrice <= 0 || targetWeightGrams <= 0) return 0;
  return Math.round((basePrice * targetWeightGrams) / baseWeightGrams);
}

/** AI-style weight suggestions from product name */
export function suggestWeightsForProduct(productName: string): number[] {
  const n = productName.toLowerCase();

  const giftBox =
    /gift|box|hamper|basket|combo|pack/i.test(n);
  const bulk =
    /bulk|wholesale|5kg|2kg|family/i.test(n);
  const small =
    /sample|trial|mini|100g|100gm/i.test(n);

  if (giftBox) return [500, 1000, 2000];
  if (bulk) return [1000, 2000, 5000];
  if (small) return [100, 250, 500];

  const nuts =
    /badam|almond|walnut|akhrot|pista|pistachio|kaju|cashew|nut|dry fruit|dryfruit|anjeer|fig|kishmish|raisin|date|khajoor|chia|seed/i.test(
      n
    );
  if (nuts) return [250, 500, 1000];

  return [250, 500, 1000];
}

export function generateWeightVariants(opts: GenerateWeightVariantsOptions): WeightVariantInput[] {
  const {
    baseWeightGrams,
    basePrice,
    baseStock,
    weightGramsList,
    stockMode,
    priceMode,
    individualStocks = {},
    customPrices = {},
    createId = () => crypto.randomUUID?.() ?? `wv-${Date.now()}-${Math.random()}`,
  } = opts;

  const baseG = Math.max(1, baseWeightGrams);
  const weights = [...new Set(weightGramsList.filter((g) => g > 0))].sort((a, b) => a - b);
  if (!weights.length) return [];

  if (!weights.includes(baseG)) {
    weights.push(baseG);
    weights.sort((a, b) => a - b);
  }

  return weights.map((grams) => {
    const price =
      priceMode === "custom" && customPrices[grams] != null
        ? Math.round(customPrices[grams])
        : calculateLinearPrice(basePrice, baseG, grams);

    let stock = baseStock;
    if (stockMode === "individual") {
      stock = individualStocks[grams] ?? baseStock;
    }

    return {
      id: createId(),
      name: "Weight",
      value: formatWeightLabel(grams),
      price: String(price),
      stock,
      sku: "",
    };
  });
}

/** Infer base weight from existing Weight variants (smallest option) */
export function inferBaseFromVariants(
  variants: WeightVariantInput[]
): { baseGrams: number; weights: number[] } | null {
  const weightVars = variants.filter((v) => v.name === "Weight" && v.value);
  if (!weightVars.length) return null;

  const parsed = weightVars
    .map((v) => ({ grams: parseWeightToGrams(v.value), v }))
    .filter((x): x is { grams: number; v: WeightVariantInput } => x.grams != null);

  if (!parsed.length) return null;

  parsed.sort((a, b) => a.grams - b.grams);
  return {
    baseGrams: parsed[0].grams,
    weights: parsed.map((p) => p.grams),
  };
}

export function effectiveProductStock(
  variants: WeightVariantInput[],
  stockMode: VariantStockMode,
  baseStock: number
): number {
  if (!variants.length) return baseStock;
  if (stockMode === "shared") {
    const weightOnly = variants.every((v) => v.name === "Weight");
    if (weightOnly) return baseStock;
  }
  return variants.reduce((s, v) => s + (v.stock || 0), 0);
}

/** Config shape shared by admin auto-calculator panel and save handler */
export interface AutoWeightVariantConfig {
  baseWeightGrams: number;
  basePrice: number;
  baseStock: number;
  selectedGrams: number[];
  stockMode: VariantStockMode;
  priceMode: VariantPriceMode;
  customPrices: Record<number, string>;
  individualStocks: Record<number, string>;
}

export function buildAutoWeightVariants(
  config: AutoWeightVariantConfig,
  createId?: () => string
): WeightVariantInput[] {
  const sorted = [...new Set(config.selectedGrams)].sort((a, b) => a - b);
  if (!sorted.length || config.basePrice <= 0 || config.baseWeightGrams <= 0) return [];

  return generateWeightVariants({
    baseWeightGrams: config.baseWeightGrams,
    basePrice: config.basePrice,
    baseStock: config.baseStock,
    weightGramsList: sorted,
    stockMode: config.stockMode,
    priceMode: config.priceMode,
    customPrices: Object.fromEntries(
      Object.entries(config.customPrices)
        .map(([g, p]) => [Number(g), parseFloat(p)])
        .filter(([, p]) => Number.isFinite(p))
    ) as Record<number, number>,
    individualStocks: Object.fromEntries(
      Object.entries(config.individualStocks)
        .map(([g, s]) => [Number(g), parseInt(s, 10)])
        .filter(([, s]) => Number.isFinite(s))
    ) as Record<number, number>,
    createId,
  });
}

/** Keep stable variant IDs when regenerating weight options (cart / PDP selection). */
export function mergeWeightVariantsPreservingIds(
  existing: WeightVariantInput[],
  generated: WeightVariantInput[]
): WeightVariantInput[] {
  const nonWeight = existing.filter((v) => v.name !== "Weight");
  const byValue = new Map(
    existing
      .filter((v) => v.name === "Weight" && v.value)
      .map((v) => [v.value.toUpperCase().replace(/\s/g, ""), v])
  );
  const merged = generated.map((g) => {
    const prev = byValue.get(g.value.toUpperCase().replace(/\s/g, ""));
    return prev ? { ...g, id: prev.id, sku: g.sku || prev.sku } : g;
  });
  return [...nonWeight, ...merged];
}
