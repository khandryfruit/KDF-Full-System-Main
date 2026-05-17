/**
 * Extract product entity from customer WhatsApp text (ignore filler, fix typos).
 */
import { WA_PRODUCT_ALIASES } from "./shopifyProductSearch.js";

const FILLER_PATTERN =
  /\b(i|me|we|please|pls|kindly|want|need|looking for|searching for|show me|give me|send me|mujhe|muje|mje|mjy|mjhe|do|dein|dena|dikhao|bhejo|bhej|lena|lenay|karna hai|krna hai|chahiye|chahye|chaye|chaiye|chahie|hai|ho|the|a|an|some|any|for me|for us|price|rate|qeemat|kitna|kya|ka|ki|ke|liye|wala|wali|only|just|batao|btao)\b/gi;

/** Roman Urdu typos → canonical token */
const TYPO_MAP: Record<string, string> = {
  mje: "mujhe",
  muje: "mujhe",
  mjhe: "mujhe",
  mjy: "mujhe",
  chaye: "chahiye",
  chaiye: "chahiye",
  chahie: "chahiye",
  gogi: "goji",
  goji: "goji",
  badaam: "badam",
  baadam: "badam",
  almod: "almond",
  pistay: "pista",
  khajur: "khajoor",
};

/** Longest-first specific product keys (not broad categories) */
const SPECIFIC_PRODUCT_KEYS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /\bgoji\s*berr(?:y|ies)\b/i, key: "goji" },
  { pattern: /\bgoji\b/i, key: "goji" },
  { pattern: /\bgogi\b/i, key: "goji" },
  { pattern: /\bcranberr(?:y|ies)\b/i, key: "cranberry" },
  { pattern: /\bblueberr(?:y|ies)\b/i, key: "blueberry" },
  { pattern: /\bstrawberr(?:y|ies)\b/i, key: "strawberry" },
  { pattern: /\bdried\s+mango\b/i, key: "mango" },
  { pattern: /\bmango\b/i, key: "mango" },
  { pattern: /\bkiwi\b/i, key: "kiwi" },
  { pattern: /\bpistachio(?:s)?\b/i, key: "pista" },
  { pattern: /\bpista\b/i, key: "pista" },
  { pattern: /\bپستہ|پستے\b/, key: "pista" },
  { pattern: /\bamerican\s+almond\b/i, key: "badam" },
  { pattern: /\balmonds?\b/i, key: "badam" },
  { pattern: /\bbadam\b/i, key: "badam" },
  { pattern: /\bبادام\b/, key: "badam" },
  { pattern: /\bcashew(?:s)?\b/i, key: "kaju" },
  { pattern: /\bkaju\b/i, key: "kaju" },
  { pattern: /\bکاجو\b/, key: "kaju" },
  { pattern: /\bwalnuts?\b/i, key: "akhrot" },
  { pattern: /\bakhrot\b/i, key: "akhrot" },
  { pattern: /\bاخروٹ\b/, key: "akhrot" },
  { pattern: /\banjeer\b/i, key: "anjeer" },
  { pattern: /\bfigs?\b/i, key: "anjeer" },
  { pattern: /\bانجیر\b/, key: "anjeer" },
  { pattern: /\bkhajoor\b/i, key: "khajoor" },
  { pattern: /\bdates?\b/i, key: "khajoor" },
  { pattern: /\bکھجور\b/, key: "khajoor" },
  { pattern: /\bkishmish\b/i, key: "kishmish" },
  { pattern: /\braisins?\b/i, key: "kishmish" },
];

export function normalizeWaProductText(text: string): string {
  let s = String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [from, to] of Object.entries(TYPO_MAP)) {
    s = s.replace(new RegExp(`\\b${from}\\b`, "gi"), to);
  }
  return s;
}

/** Specific product (goji, pista) — not broad "berries" browse */
export function resolveSpecificProductKey(query: string): string | null {
  const n = normalizeWaProductText(query);
  if (!n) return null;
  for (const { pattern, key } of SPECIFIC_PRODUCT_KEYS) {
    if (pattern.test(n)) return key;
  }
  return null;
}

export function isGenericBerryBrowse(query: string): boolean {
  const n = normalizeWaProductText(query);
  if (resolveSpecificProductKey(n)) return false;
  return /\b(berries|berry|بیری)\b/i.test(n);
}

export type WaProductEntity = {
  raw: string;
  entity: string;
  tokens: string[];
  specificKey: string | null;
};

export function extractWaProductEntity(text: string): WaProductEntity {
  const raw = String(text ?? "").trim();
  let n = normalizeWaProductText(raw);
  n = n.replace(FILLER_PATTERN, " ").replace(/\s+/g, " ").trim();

  const specificKey = resolveSpecificProductKey(n || raw);
  if (specificKey) {
    const syns = WA_PRODUCT_ALIASES[specificKey] ?? [];
    const entity = [specificKey, ...syns.slice(0, 2).map((s) => s.split(/\s+/)[0] ?? s)]
      .filter(Boolean)
      .join(" ")
      .trim();
    const tokens = [...new Set([specificKey, ...entity.split(/\s+/).filter((t) => t.length >= 2)])];
    return { raw, entity: specificKey, tokens, specificKey };
  }

  if (!n) return { raw, entity: raw, tokens: [], specificKey: null };

  const tokens = n.split(/\s+/).filter((t) => t.length >= 2);
  return { raw, entity: tokens.join(" ") || n, tokens, specificKey: null };
}

/** Legacy helper — strip filler for search query string */
export function extractProductSearchQuery(text: string): string {
  const { entity } = extractWaProductEntity(text);
  return entity || String(text ?? "").trim();
}
