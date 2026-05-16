/** Sales category definitions — shared (no circular imports) */

export type WaSalesCategory = {
  id: string;
  emoji: string;
  labelEn: string;
  labelUr: string;
  families: string[];
};

export const ALL_PRODUCTS_CATEGORY: WaSalesCategory = {
  id: "all",
  emoji: "📋",
  labelEn: "All Products",
  labelUr: "تمام Products",
  families: [],
};

export const WA_SALES_CATEGORIES: WaSalesCategory[] = [
  {
    id: "almonds",
    emoji: "🥜",
    labelEn: "Almond / Badam",
    labelUr: "بادام / Almond",
    families: [
      "almond", "almonds", "badam", "بادام",
      "kagzi", "kagazi", "kaghzi", "kaghazi", "paper shell", "soft shell", "hard shell",
      "mamra", "gurbandi", "girdi", "desi", "australian", "american", "irani", "iranian",
      "california", "premium almond", "raw almond", "roasted almond", "salted almond",
    ],
  },
  { id: "pistachio", emoji: "🌰", labelEn: "Pistachio / Pista", labelUr: "پستہ / Pista", families: ["pista", "pistachio", "pistachios", "پستہ", "پستے", "irani", "iranian", "roasted", "salted"] },
  { id: "cashew", emoji: "🌰", labelEn: "Cashew / Kaju", labelUr: "کاجو / Cashew", families: ["kaju", "cashew", "cashews", "کاجو", "w180", "w240", "w320"] },
  { id: "walnut", emoji: "🌰", labelEn: "Walnut / Akhrot", labelUr: "اخروٹ / Walnut", families: ["akhrot", "walnut", "walnuts", "اخروٹ", "giri", "shell"] },
  { id: "dates", emoji: "🌴", labelEn: "Dates / Khajoor", labelUr: "کھجور / Dates", families: ["khajoor", "dates", "date", "کھجور", "chuara", "ajwa", "mazafati", "kalmi", "sukkari", "rabbi", "amber", "rajma"] },
  { id: "hazelnut", emoji: "🌰", labelEn: "Hazelnuts", labelUr: "ہیزلنٹ", families: ["hazelnut", "hazelnuts", "filbert"] },
  { id: "berries", emoji: "🍇", labelEn: "Berries", labelUr: "بیریز", families: ["berry", "berries", "goji", "cranberry", "blueberry", "strawberry"] },
  { id: "raisins", emoji: "🍇", labelEn: "Raisins / Kishmish", labelUr: "کشمش", families: ["kishmish", "raisin", "raisins", "munakka", "کشمش"] },
  { id: "figs", emoji: "🫐", labelEn: "Figs / Anjeer", labelUr: "انجیر", families: ["anjeer", "fig", "figs", "انجیر"] },
  { id: "peanuts", emoji: "🥜", labelEn: "Peanuts", labelUr: "مونگ پھلی", families: ["peanut", "peanuts", "mungphali"] },
  { id: "seeds", emoji: "🌻", labelEn: "Seeds", labelUr: "بیج", families: ["sunflower", "pumpkin", "chia", "sesame", "til", "melon", "flax", "sooraj", "mukhi"] },
  { id: "pine", emoji: "🌲", labelEn: "Chilgoza", labelUr: "چلغوزہ", families: ["chilgoza", "pine nut", "pine nuts"] },
  { id: "makhana", emoji: "🪷", labelEn: "Makhana", labelUr: "مکھانہ", families: ["makhana", "foxnut"] },
  { id: "honey", emoji: "🍯", labelEn: "Honey", labelUr: "شہد", families: ["honey", "shahad", "شہد"] },
  { id: "oils", emoji: "🫒", labelEn: "Oils & Butters", labelUr: "آئل", families: ["oil", "butter", "paste", "ghee"] },
  { id: "apricot", emoji: "🍑", labelEn: "Apricot", labelUr: "خوبانی", families: ["apricot", "khubani", "prune", "plum"] },
  { id: "saffron", emoji: "🌸", labelEn: "Saffron", labelUr: "زعفران", families: ["saffron", "zafran", "zaffran"] },
  { id: "spices", emoji: "🌶️", labelEn: "Spices", labelUr: "مصالحہ", families: ["spice", "spices", "masala", "cumin", "zeera", "haldi", "turmeric"] },
  { id: "tea", emoji: "🍵", labelEn: "Tea & Herbs", labelUr: "چائے", families: ["tea", "chai", "herb", "herbal", "green tea"] },
  { id: "chocolate", emoji: "🍫", labelEn: "Chocolate & Sweets", labelUr: "چاکلیٹ", families: ["chocolate", "cocoa", "sweet", "candy"] },
  { id: "coconut", emoji: "🥥", labelEn: "Coconut", labelUr: "ناریل", families: ["coconut", "narial", "nariel"] },
  { id: "mixed", emoji: "🎁", labelEn: "Mixed & Gift Packs", labelUr: "مکس / گفٹ", families: ["mix", "mixed", "combo", "hamper", "gift box", "gift pack", "assorted"] },
];

export function getCategoryById(categoryId: string): WaSalesCategory | null {
  if (categoryId === "all") return ALL_PRODUCTS_CATEGORY;
  return WA_SALES_CATEGORIES.find((c) => c.id === categoryId) ?? null;
}
