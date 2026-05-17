-- Hero banner: optional copy + storefront display toggles
ALTER TABLE "banners" ALTER COLUMN "title" DROP NOT NULL;
ALTER TABLE "banners" ALTER COLUMN "title" SET DEFAULT '';

ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "show_title" boolean NOT NULL DEFAULT true;
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "show_subtitle" boolean NOT NULL DEFAULT true;
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "show_label" boolean NOT NULL DEFAULT true;
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "show_cta" boolean NOT NULL DEFAULT true;
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "show_explore_cta" boolean NOT NULL DEFAULT false;
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "enable_ai_text" boolean NOT NULL DEFAULT true;
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "hero_autoplay" boolean NOT NULL DEFAULT true;
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "enable_fallback_banner" boolean NOT NULL DEFAULT true;
