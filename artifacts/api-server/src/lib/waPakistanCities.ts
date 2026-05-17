/**
 * Pakistan cities for WhatsApp checkout — search, popular list, paginated picker.
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

export function parseCityButtonId(id: string): string | "__search__" | "__page__" | "__other__" | null {
  const t = String(id ?? "").trim().toLowerCase();
  if (t === "wa_city_search") return "__search__";
  if (t === "wa_city_other") return "__other__";
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

export function searchCities(query: string, limit = 10): string[] {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q || q.length < 2) return [];
  const scored: Array<{ city: string; score: number }> = [];
  for (const city of ALL_CITIES) {
    const c = city.toLowerCase();
    if (c === q) scored.push({ city, score: 100 });
    else if (c.startsWith(q)) scored.push({ city, score: 80 });
    else if (c.includes(q)) scored.push({ city, score: 50 });
    else if (q.length >= 3 && c.split(/\s+/).some((w) => w.startsWith(q))) scored.push({ city, score: 40 });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.city.localeCompare(b.city))
    .slice(0, limit)
    .map((x) => x.city);
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
  const title = popular ? `⭐ ${city}` : city;
  return {
    id: `wa_city_s_${cityToSlug(city)}`,
    title: title.length <= 24 ? title : city.slice(0, 24),
    description: popular ? "Popular city" : "Pakistan",
  };
}
