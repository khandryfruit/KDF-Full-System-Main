import type { CSSProperties } from "react";

/** Trim banner copy; never invent storefront fallbacks here. */
export function bannerCopy(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw
    .replace(/AI\s*Smart\s*Seasonal\s*Picks/gi, "Healthy Seasonal Picks")
    .replace(/AI\s*Smart\s*Pick/gi, "Seasonal Pick")
    .replace(/\boofer\b/gi, "offer");
}

export type BannerDisplayFlags = {
  showTitle?: boolean;
  showSubtitle?: boolean;
  showLabel?: boolean;
  showCta?: boolean;
  showExploreCta?: boolean;
  enableAiText?: boolean;
};

function flag(b: Record<string, unknown>, camel: string, snake: string, defaultOn = true): boolean {
  const v = b[camel] ?? b[snake];
  if (v === undefined || v === null) return defaultOn;
  return v !== false;
}

export function bannerFlags(b: Record<string, unknown>): BannerDisplayFlags {
  return {
    showTitle: flag(b, "showTitle", "show_title"),
    showSubtitle: flag(b, "showSubtitle", "show_subtitle"),
    showLabel: flag(b, "showLabel", "show_label"),
    showCta: flag(b, "showCta", "show_cta"),
    showExploreCta: flag(b, "showExploreCta", "show_explore_cta", false),
    enableAiText: flag(b, "enableAiText", "enable_ai_text"),
  };
}

export function heroOverlayStyle(hasMedia: boolean, isMobile: boolean): CSSProperties {
  if (!hasMedia) {
    return { background: "linear-gradient(135deg, #0b2e00 0%, #1a4d00 60%, #2d7a00 100%)" };
  }
  if (isMobile) {
    return {
      background:
        "linear-gradient(180deg, rgba(13,43,0,0.08) 0%, rgba(0,0,0,0.18) 42%, rgba(0,0,0,0.55) 100%)",
    };
  }
  return {
    background:
      "linear-gradient(105deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.22) 42%, rgba(0,0,0,0.02) 72%, transparent 100%)",
  };
}
