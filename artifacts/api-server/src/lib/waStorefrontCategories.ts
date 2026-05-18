/**
 * Khan Baba Dry Fruits — storefront "Shop by Category" (website parity for WhatsApp).
 * Order and labels match khanbabadryfruits.com homepage.
 */
import type { WaSalesCategory } from "./waCategoryDefinitions.js";

export type StorefrontShopCategory = {
  /** Internal family id (commerce search + product filter) */
  canonicalId: string;
  emoji: string;
  /** Exact label on website */
  labelEn: string;
  /** WhatsApp list row title (max 24 chars) */
  menuTitle: string;
  menuDescription: string;
  /** Match Admin categories.name / slug (lowercase) */
  dbNameAliases: string[];
};

/** Homepage order: Walnuts → … → Almonds */
export const STOREFRONT_SHOP_CATEGORIES: StorefrontShopCategory[] = [
  {
    canonicalId: "walnut",
    emoji: "🫘",
    labelEn: "Walnuts",
    menuTitle: "🫘 Walnuts",
    menuDescription: "Akhrot · premium giri",
    dbNameAliases: ["walnuts", "walnut", "akhrot", "اخروٹ"],
  },
  {
    canonicalId: "figs",
    emoji: "🫐",
    labelEn: "Dried Figs",
    menuTitle: "🫐 Dried Figs",
    menuDescription: "Anjeer · Turkish & more",
    dbNameAliases: ["dried figs", "dried fig", "figs", "fig", "anjeer", "انجیر"],
  },
  {
    canonicalId: "berries",
    emoji: "🍇",
    labelEn: "Dried Berry",
    menuTitle: "🍇 Dried Berry",
    menuDescription: "Goji · cranberry · mix",
    dbNameAliases: ["dried berry", "dried berries", "berries", "berry", "goji", "cranberry"],
  },
  {
    canonicalId: "dried_fruits",
    emoji: "🥭",
    labelEn: "Dried Fruits",
    menuTitle: "🥭 Dried Fruits",
    menuDescription: "Kiwi · mango · tropical",
    dbNameAliases: ["dried fruits", "dried fruit", "tropical", "mixed dried"],
  },
  {
    canonicalId: "cashew",
    emoji: "🥜",
    labelEn: "Cashews",
    menuTitle: "🥜 Cashews",
    menuDescription: "Kaju · W180 & more",
    dbNameAliases: ["cashews", "cashew", "kaju", "کاجو"],
  },
  {
    canonicalId: "dates",
    emoji: "🌴",
    labelEn: "Dates",
    menuTitle: "🌴 Dates",
    menuDescription: "Ajwa · Sukkari · Mazafati",
    dbNameAliases: ["dates", "date", "khajoor", "کھجور"],
  },
  {
    canonicalId: "pistachio",
    emoji: "🌰",
    labelEn: "Pistachio",
    menuTitle: "🌰 Pistachio",
    menuDescription: "Irani · roasted · salted",
    dbNameAliases: ["pistachio", "pistachios", "pista", "پستہ"],
  },
  {
    canonicalId: "almonds",
    emoji: "🥜",
    labelEn: "Almonds",
    menuTitle: "🥜 Almonds",
    menuDescription: "Badam · Mamra · Kagzi",
    dbNameAliases: ["almonds", "almond", "badam", "بادام"],
  },
];

export function matchStorefrontCategory(text: string): StorefrontShopCategory | null {
  const q = String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!q) return null;
  for (const cat of STOREFRONT_SHOP_CATEGORIES) {
    if (cat.dbNameAliases.some((a) => q === a || q.includes(a) || a.includes(q))) return cat;
    if (q === cat.labelEn.toLowerCase() || q.includes(cat.labelEn.toLowerCase())) return cat;
  }
  return null;
}

export function storefrontCategoryToWaSales(cat: StorefrontShopCategory, base: WaSalesCategory | null): WaSalesCategory {
  if (base) {
    return { ...base, labelEn: cat.labelEn, labelUr: cat.labelEn };
  }
  return {
    id: cat.canonicalId,
    emoji: cat.emoji,
    labelEn: cat.labelEn,
    labelUr: cat.labelEn,
    families: [],
  };
}
