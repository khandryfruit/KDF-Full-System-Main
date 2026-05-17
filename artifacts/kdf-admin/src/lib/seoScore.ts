export function scoreMetaTitle(len: number): { score: number; label: string; tone: "good" | "warn" | "bad" } {
  if (len === 0) return { score: 0, label: "Add a title", tone: "bad" };
  if (len >= 50 && len <= 60) return { score: 100, label: "Ideal length", tone: "good" };
  if (len >= 40 && len <= 65) return { score: 75, label: "Good", tone: "good" };
  if (len < 40) return { score: 45, label: "Too short", tone: "warn" };
  return { score: 30, label: "Too long — may truncate", tone: "bad" };
}

export function scoreMetaDescription(len: number): { score: number; label: string; tone: "good" | "warn" | "bad" } {
  if (len === 0) return { score: 0, label: "Add a description", tone: "bad" };
  if (len >= 120 && len <= 160) return { score: 100, label: "Ideal length", tone: "good" };
  if (len >= 100 && len <= 170) return { score: 75, label: "Good", tone: "good" };
  if (len < 100) return { score: 45, label: "Too short", tone: "warn" };
  return { score: 30, label: "Too long — may truncate", tone: "bad" };
}

export function overallSeoScore(titleLen: number, descLen: number, keywordCount: number): number {
  const t = scoreMetaTitle(titleLen).score;
  const d = scoreMetaDescription(descLen).score;
  const k = Math.min(100, keywordCount * 8);
  if (titleLen === 0 && descLen === 0) return 0;
  return Math.round(t * 0.4 + d * 0.45 + k * 0.15);
}

export function parseKeywordList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    /* csv fallback */
  }
  return raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

export function stringifyKeywords(list: string[]): string {
  return JSON.stringify(list.filter(Boolean));
}
