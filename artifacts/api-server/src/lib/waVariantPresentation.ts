/**
 * Premium variant presentation for WhatsApp lists (title ≤24, description ≤72).
 * Full prices live in image caption + list body; rows use short titles + rich descriptions.
 */
import { formatRupeesLocal } from "./waOrderJourney.js";
import type { WaLang } from "./waPremiumJourney.js";

export type VariantOption = { id: string; title: string; price: number };

export type EnrichedVariant = VariantOption & {
  index: number;
  sizeLabel: string;
  priceFormatted: string;
  badge: string;
  savingsLine: string;
  recommended: boolean;
  description: string;
  listTitle: string;
};

const LIST_TITLE_MAX = 24;
const LIST_DESC_MAX = 72;

export function formatPriceFull(price: number): string {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return "Rs —";
  return `Rs ${Math.round(n).toLocaleString("en-PK")}`;
}

/** Short title for list row — size only, never truncate price into title */
export function formatVariantListTitle(sizeLabel: string): string {
  const label = normalizeSizeLabel(sizeLabel);
  const raw = `⚖️ ${label}`;
  return raw.length <= LIST_TITLE_MAX ? raw : `⚖️ ${clip(label, LIST_TITLE_MAX - 3)}`;
}

function clip(s: string, max: number): string {
  const t = String(s ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** Parse weight in grams from variant title (250g, 1kg, 250GM, etc.) */
export function parseWeightGrams(title: string): number | null {
  const t = String(title ?? "").toLowerCase().replace(/\s+/g, "");
  const kg = t.match(/(\d+(?:\.\d+)?)\s*kg/);
  if (kg) return Math.round(Number.parseFloat(kg[1]!) * 1000);
  const g = t.match(/(\d+(?:\.\d+)?)\s*g(?:m)?/);
  if (g) return Math.round(Number.parseFloat(g[1]!));
  const num = t.match(/^(\d+(?:\.\d+)?)/);
  if (num) {
    const n = Number.parseFloat(num[1]!);
    if (n >= 1000) return Math.round(n);
    if (n >= 50 && n <= 5000) return Math.round(n);
  }
  return null;
}

export function normalizeSizeLabel(title: string): string {
  const raw = String(title ?? "").trim();
  const grams = parseWeightGrams(raw);
  if (grams != null) {
    if (grams >= 1000 && grams % 1000 === 0) return `${grams / 1000}kg`;
    if (grams >= 1000) return `${(grams / 1000).toFixed(grams % 500 === 0 ? 0 : 1)}kg`;
    return `${grams}g`;
  }
  return raw.replace(/\s+/g, " ").slice(0, 20);
}

function badgeForIndex(i: number, count: number, lang: WaLang): string {
  if (count === 1) return lang === "en" ? "⭐ Popular" : "⭐ Popular";
  if (i === 0) return lang === "en" ? "⭐ Starter Pack" : "⭐ Starter Pack";
  if (i === count - 1) return lang === "en" ? "💎 Premium Value" : "💎 Premium Value";
  if (i === Math.floor(count / 2)) return lang === "en" ? "🔥 Best Seller" : "🔥 Best Seller";
  return lang === "en" ? "⭐ Popular" : "⭐ Popular";
}

function computeSavingsLine(
  variants: Array<{ grams: number; price: number }>,
  index: number,
  lang: WaLang,
): string {
  const cur = variants[index];
  if (!cur?.grams || cur.grams <= 0) return "";
  const base = variants[0];
  if (!base || index === 0) return "";
  const equivUnits = cur.grams / base.grams;
  if (equivUnits <= 1) return "";
  const wouldPay = Math.round(base.price * equivUnits);
  const save = wouldPay - cur.price;
  if (save < 50) return "";
  const p = formatPriceFull(save);
  if (lang === "en") return `Save ${p}`;
  if (lang === "ps") return `${p} سپما`;
  return `Save ${p}`;
}

/** Pick recommended = best Rs/gram vs smallest pack, fallback to middle tier */
function pickRecommendedIndex(variants: Array<{ grams: number; price: number }>): number {
  if (variants.length <= 1) return 0;
  const base = variants[0];
  if (!base?.grams) return Math.min(1, variants.length - 1);
  let bestIdx = 0;
  let bestPpg = base.price / base.grams;
  for (let i = 1; i < variants.length; i++) {
    const v = variants[i]!;
    if (!v.grams) continue;
    const ppg = v.price / v.grams;
    if (ppg < bestPpg) {
      bestPpg = ppg;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function enrichVariants(
  options: VariantOption[],
  lang: WaLang,
): EnrichedVariant[] {
  const sorted = options.map((v, index) => ({
    ...v,
    index,
    grams: parseWeightGrams(v.title) ?? 0,
    price: Number(v.price) || 0,
  })).sort((a, b) => {
    if (a.grams && b.grams) return a.grams - b.grams;
    return a.price - b.price;
  });

  const recommendedIdx = pickRecommendedIndex(sorted);
  const count = sorted.length;

  return sorted.map((v, i) => {
    const sizeLabel = normalizeSizeLabel(v.title);
    const priceFormatted = formatPriceFull(v.price);
    const badge = badgeForIndex(i, count, lang);
    const savingsLine = computeSavingsLine(sorted, i, lang);
    const recommended = i === recommendedIdx;

    const parts: string[] = [`💰 ${priceFormatted}`];
    if (recommended) parts.push(lang === "en" ? "🔥 Recommended" : "🔥 Recommended");
    else parts.push(badge);
    if (savingsLine) parts.push(savingsLine);

    let description = parts.join(" · ");
    if (description.length > LIST_DESC_MAX) {
      description = clip(`${priceFormatted} · ${recommended ? "🔥 Rec." : badge.split(" ")[0] ?? "⭐"}`, LIST_DESC_MAX);
    }

    return {
      id: v.id,
      title: v.title,
      price: v.price,
      index: v.index,
      sizeLabel,
      priceFormatted,
      badge,
      savingsLine,
      recommended,
      description: clip(description, LIST_DESC_MAX),
      listTitle: formatVariantListTitle(sizeLabel),
    };
  });
}

export function buildPremiumProductCaption(opts: {
  productName: string;
  description?: string | null;
  inStock?: boolean;
  variants: VariantOption[];
  lang: WaLang;
}): string {
  const enriched = enrichVariants(opts.variants, opts.lang);
  const stock = opts.inStock !== false ? "✅ In stock" : "❌ Out of stock";
  const feat = opts.description?.trim()
    ? `⭐ ${opts.description.trim().slice(0, 120)}${opts.description.length > 120 ? "…" : ""}`
    : "⭐ Premium quality · Fresh stock";

  const L = (ur: string, en: string) => (opts.lang === "en" ? en : ur);
  const lines = [
    `🥝 *${opts.productName}*`,
    feat,
    stock,
    "",
    L("⚖️ *Sizes & prices:*", "⚖️ *Sizes & prices:*"),
  ];

  for (const v of enriched) {
    const rec = v.recommended ? " 🔥" : "";
    const save = v.savingsLine ? ` · ${v.savingsLine}` : "";
    lines.push(`⚖️ *${v.sizeLabel}* — ${v.priceFormatted}${rec}${save}`);
    lines.push(`   ${v.badge}`);
  }

  lines.push("");
  lines.push(L("👇 Neeche *Sizes* tap karke select karein", "👇 Tap *Sizes* below to select"));
  return lines.join("\n").slice(0, 1024);
}

export function buildVariantPickerBody(opts: {
  productName: string;
  variants: VariantOption[];
  lang: WaLang;
}): string {
  const enriched = enrichVariants(opts.variants, opts.lang);
  const L = (ur: string, en: string, ps?: string) =>
    opts.lang === "en" ? en : opts.lang === "ps" ? (ps ?? ur) : ur;

  const lines = [
    L(
      `📦 *${opts.productName}*\n\nSize select karein — poori price neeche hai 👇`,
      `📦 *${opts.productName}*\n\nChoose your size — full prices below 👇`,
    ),
    "",
  ];

  for (const v of enriched) {
    const rec = v.recommended ? "\n   🔥 *Recommended*" : "";
    const save = v.savingsLine ? `\n   💚 *${v.savingsLine}*` : "";
    lines.push(`━━━━━━━━━━━━━━`);
    lines.push(`⚖️ *${v.sizeLabel}*`);
    lines.push(`💰 *${v.priceFormatted}*`);
    lines.push(`   ${v.badge}${rec}${save}`);
  }

  lines.push("");
  lines.push(L("👇 *Sizes* button dabayein", "👇 Press the *Sizes* button", "👇 *Sizes* وټاکئ"));
  return lines.join("\n").slice(0, 1024);
}

export function buildVariantListRows(
  enriched: EnrichedVariant[],
): Array<{ id: string; title: string; description: string }> {
  return enriched.slice(0, 10).map((v, listIdx) => ({
    id: `wa_v_${v.index}`,
    title: v.listTitle,
    description: v.description,
  }));
}

/** ≤3 variants: optional quick-pick buttons (title = size only) */
export function canUseVariantQuickButtons(count: number): boolean {
  return count > 0 && count <= 3;
}

export function buildVariantQuickButtonTitle(sizeLabel: string): string {
  return clip(`⚖️ ${normalizeSizeLabel(sizeLabel)}`, 20);
}
