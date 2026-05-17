/**
 * Pakistan cities for WhatsApp checkout — smart detect, aliases, fuzzy match, search.
 */

export const PAKISTAN_CITIES: readonly string[] = [
  "Lahore", "Karachi", "Islamabad", "Rawalpindi", "Multan", "Faisalabad", "Peshawar", "Quetta",
  "Sialkot", "Gujranwala", "Bahawalpur", "Sargodha", "Hyderabad", "Sukkur", "Abbottabad", "Mardan",
  "Swat", "Mingora", "Dera Ghazi Khan", "DG Khan", "Okara", "Kasur", "Jhelum", "Gujrat",
  "Sheikhupura", "Rahim Yar Khan", "Vehari", "Kohat", "Bannu", "Chiniot", "Narowal", "Attock",
  "Khairpur", "Larkana", "Gwadar", "Turbat", "Muzaffarabad", "Mirpur", "Gilgit", "Skardu", "Hunza",
  "Sahiwal", "Wah Cantonment", "Wah", "Kamoke", "Hafizabad", "Mandi Bahauddin", "Jhang", "Sadiqabad",
  "Gojra", "Muridke", "Burewala", "Pakpattan", "Toba Tek Singh", "Daska", "Chakwal", "Khuzdar",
  "Matiari", "Thatta", "Badin", "Nawabshah", "Shaheed Benazirabad", "Mirpur Khas", "Jacobabad",
  "Shikarpur", "Dadu", "Nowshera", "Haripur", "Mansehra", "Timergara", "Charsadda", "Swabi",
  "Tank", "Dera Ismail Khan", "DI Khan", "Layyah", "Bhakkar", "Mianwali", "Khushab", "Lodhran",
  "Khanewal", "Hasilpur", "Arifwala", "Chishtian", "Ahmadpur East", "Vihari", "Shujaabad",
  "Hub", "Pasni", "Panjgur", "Zhob", "Loralai", "Chaman", "Hangu", "Parachinar",
  "Bagh", "Kotli", "Bhimber", "Hattian Bala", "Neelum", "Haveli", "Poonch", "Sudhnuti",
  "Aliabad", "Nagar", "Ghanche", "Shigar", "Kharmang", "Astore", "Diamer", "Ghizer",
] as const;

/** Normalized unique cities (DG Khan / Dera Ghazi Khan deduped) */
const NORMALIZED = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of PAKISTAN_CITIES) {
    const name = raw.trim();
    const key = name.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name === "DG Khan" ? "Dera Ghazi Khan" : name === "DI Khan" ? "Dera Ismail Khan" : name);
  }
  return out.sort((a, b) => a.localeCompare(b));
})();

export const ALL_CITIES = NORMALIZED;

export const POPULAR_CITIES = [
  "Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta",
];

/** Common abbreviations & Roman Urdu shortcuts → canonical city */
export const CITY_ALIASES: Record<string, string> = {
  lhr: "Lahore",
  lahore: "Lahore",
  lahor: "Lahore",
  karachi: "Karachi",
  khi: "Karachi",
  krachi: "Karachi",
  isb: "Islamabad",
  isl: "Islamabad",
  islamabad: "Islamabad",
  rwp: "Rawalpindi",
  pindi: "Rawalpindi",
  rawalpindi: "Rawalpindi",
  fsd: "Faisalabad",
  faisalabad: "Faisalabad",
  multan: "Multan",
  multn: "Multan",
  mul: "Multan",
  pew: "Peshawar",
  peshawar: "Peshawar",
  psx: "Peshawar",
  que: "Quetta",
  quetta: "Quetta",
  larkana: "Larkana",
  lark: "Larkana",
  hyd: "Hyderabad",
  hyderabad: "Hyderabad",
  skt: "Sialkot",
  sialkot: "Sialkot",
  grw: "Gujranwala",
  gujranwala: "Gujranwala",
  bwp: "Bahawalpur",
  sgd: "Sargodha",
  swl: "Sahiwal",
  mianwali: "Mianwali",
  dgk: "Dera Ghazi Khan",
  dik: "Dera Ismail Khan",
};

export type CityMatch = { city: string; score: number; reason: string };

export type CityResolveResult = {
  kind: "confirm" | "suggest" | "none";
  city?: string;
  confidence: number;
  suggestions: string[];
  reason: string;
};

function normKey(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = new Uint16Array(rows * cols);
  for (let i = 0; i < rows; i++) dp[i * cols] = i;
  for (let j = 0; j < cols; j++) dp[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const idx = i * cols + j;
      dp[idx] = Math.min(
        dp[(i - 1) * cols + j]! + 1,
        dp[i * cols + (j - 1)]! + 1,
        dp[(i - 1) * cols + (j - 1)]! + cost,
      );
    }
  }
  return dp[(rows - 1) * cols + (cols - 1)]!;
}

function fuzzyScore(query: string, city: string): number {
  const q = normKey(query);
  const c = normKey(city);
  if (!q || !c) return 0;
  if (c === q) return 100;
  if (c.startsWith(q)) return 92;
  if (c.includes(q)) return 78;
  const words = c.split(" ");
  if (words.some((w) => w.startsWith(q))) return 72;
  if (q.length >= 3) {
    const dist = levenshtein(q, c);
    const maxLen = Math.max(q.length, c.length);
    const ratio = 1 - dist / maxLen;
    if (ratio >= 0.75) return Math.round(65 + ratio * 25);
    for (const w of words) {
      if (w.length >= 3) {
        const wd = levenshtein(q, w);
        const wr = 1 - wd / Math.max(q.length, w.length);
        if (wr >= 0.8) return Math.round(60 + wr * 28);
      }
    }
  }
  return 0;
}

export function cityToSlug(city: string): string {
  return city
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

export function cityFromSlug(slug: string): string | null {
  const s = slug.toLowerCase().replace(/_/g, " ");
  const hit = ALL_CITIES.find((c) => cityToSlug(c) === slug || c.toLowerCase() === s);
  return hit ?? null;
}

export function parseCityButtonId(id: string): string | "__search__" | "__page__" | "__other__" | "__confirm__" | "__change__" | null {
  const t = String(id ?? "").trim().toLowerCase();
  if (t === "wa_city_search") return "__search__";
  if (t === "wa_city_other") return "__other__";
  if (t === "wa_city_confirm") return "__confirm__";
  if (t === "wa_city_change") return "__change__";
  if (t === "wa_city_all" || t.startsWith("wa_city_page_")) return "__page__";
  if (t.startsWith("wa_city_s_")) {
    const slug = t.slice("wa_city_s_".length);
    return cityFromSlug(slug) ?? slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const legacy: Record<string, string> = {
    wa_city_lahore: "Lahore",
    wa_city_karachi: "Karachi",
    wa_city_islamabad: "Islamabad",
    wa_city_rawalpindi: "Rawalpindi",
    wa_city_faisalabad: "Faisalabad",
    wa_city_multan: "Multan",
    wa_city_peshawar: "Peshawar",
  };
  return legacy[t] ?? null;
}

/** Score all cities for a query — aliases, prefix, fuzzy */
export function smartSearchCities(query: string, limit = 10): CityMatch[] {
  const q = normKey(query);
  if (!q || q.length < 1) return [];

  const aliasCity = CITY_ALIASES[q];
  if (aliasCity && ALL_CITIES.includes(aliasCity)) {
    return [{ city: aliasCity, score: 99, reason: "alias" }];
  }

  const scored: CityMatch[] = [];
  for (const city of ALL_CITIES) {
    const cKey = normKey(city);
    let score = 0;
    let reason = "match";
    if (cKey === q) {
      score = 100;
      reason = "exact";
    } else if (cKey.startsWith(q)) {
      score = 90;
      reason = "prefix";
    } else if (cKey.includes(q)) {
      score = 75;
      reason = "contains";
    } else {
      const fz = fuzzyScore(q, city);
      if (fz >= 62) {
        score = fz;
        reason = "fuzzy";
      }
    }
    if (score > 0) scored.push({ city, score, reason });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.city.localeCompare(b.city))
    .slice(0, limit);
}

export function searchCities(query: string, limit = 10): string[] {
  return smartSearchCities(query, limit).map((x) => x.city);
}

/** Resolve typed city — confirm single match or return suggestions */
export function resolveCityInput(query: string): CityResolveResult {
  const q = normKey(query);
  if (!q) {
    return { kind: "none", confidence: 0, suggestions: [], reason: "empty" };
  }

  const aliasCity = CITY_ALIASES[q];
  if (aliasCity && ALL_CITIES.includes(aliasCity)) {
    return {
      kind: "confirm",
      city: aliasCity,
      confidence: 99,
      suggestions: [aliasCity],
      reason: "alias",
    };
  }

  const matches = smartSearchCities(query, 8);
  if (!matches.length) {
    return { kind: "none", confidence: 0, suggestions: [], reason: "no_match" };
  }

  const top = matches[0]!;
  const second = matches[1];
  const strongMatches = matches.filter((m) => m.score >= 70);

  if (q.length <= 3 && top.score < 100 && top.reason !== "alias") {
    const unique = [...new Set(matches.filter((m) => m.score >= 55).map((m) => m.city))].slice(0, 6);
    if (unique.length) {
      return {
        kind: "suggest",
        confidence: top.score,
        suggestions: unique,
        reason: "short_query",
      };
    }
  }

  if (q.length <= 3 && strongMatches.length >= 2) {
    const unique = [...new Set(strongMatches.map((m) => m.city))].slice(0, 6);
    return {
      kind: "suggest",
      confidence: top.score,
      suggestions: unique,
      reason: "short_prefix",
    };
  }

  if (top.score >= 98 || (top.reason === "exact" && top.score >= 100)) {
    return {
      kind: "confirm",
      city: top.city,
      confidence: top.score,
      suggestions: [top.city],
      reason: top.reason,
    };
  }

  if (top.score >= 88 && (!second || top.score - second.score >= 12)) {
    return {
      kind: "confirm",
      city: top.city,
      confidence: top.score,
      suggestions: [top.city],
      reason: top.reason,
    };
  }

  if (top.score >= 75 && top.reason === "alias") {
    return {
      kind: "confirm",
      city: top.city,
      confidence: top.score,
      suggestions: [top.city],
      reason: "alias",
    };
  }

  const suggestions = matches.filter((m) => m.score >= 55).map((m) => m.city);
  const unique = [...new Set(suggestions)].slice(0, 6);
  return {
    kind: "suggest",
    confidence: top.score,
    suggestions: unique.length ? unique : [top.city],
    reason: "multiple",
  };
}

export function getCityPage(page: number, pageSize = 10): { cities: string[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(ALL_CITIES.length / pageSize));
  const p = Math.max(0, Math.min(page, totalPages - 1));
  return {
    cities: ALL_CITIES.slice(p * pageSize, p * pageSize + pageSize),
    page: p,
    totalPages,
  };
}

/** Rough mobile prefix → city hint (Pakistan) */
export function suggestCityFromPhone(phone: string): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const local = digits.startsWith("92") ? `0${digits.slice(2)}` : digits;
  const prefix4 = local.slice(0, 4);
  const prefix3 = local.slice(0, 3);
  const map: Record<string, string> = {
    "0300": "Lahore", "0301": "Lahore", "0302": "Lahore", "0303": "Lahore", "0304": "Lahore",
    "0305": "Lahore", "0306": "Lahore", "0307": "Lahore", "0308": "Lahore", "0309": "Lahore",
    "0310": "Lahore", "0311": "Lahore", "0312": "Lahore", "0313": "Lahore", "0314": "Lahore",
    "0315": "Lahore", "0320": "Karachi", "0321": "Karachi", "0322": "Karachi", "0323": "Karachi",
    "0324": "Karachi", "0331": "Karachi", "0332": "Karachi", "0333": "Karachi", "0334": "Karachi",
    "0335": "Karachi", "0336": "Karachi", "0345": "Multan", "0346": "Multan",
    "0342": "Faisalabad", "0343": "Faisalabad",
    "0344": "Multan",
    "0347": "Sargodha",
    "0340": "Islamabad", "0341": "Islamabad", "0349": "Islamabad",
    "0348": "Sialkot",
  };
  return map[prefix4] ?? map[prefix3] ?? null;
}

export function cityListRow(city: string, popular = false): { id: string; title: string; description?: string } {
  const title = popular ? `⭐ ${city}` : `🏙 ${city}`;
  const plain = popular ? `⭐ ${city}` : city;
  return {
    id: `wa_city_s_${cityToSlug(city)}`,
    title: plain.length <= 24 ? plain : city.slice(0, 24),
    description: popular ? "Popular" : "Tap to select",
  };
}
