-- Separate hero / header / promo banners for storefront + admin filtering.
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "placement" text NOT NULL DEFAULT 'hero';

-- Legacy rows: gradient-only promo cards (no hero image/video).
UPDATE "banners"
SET "placement" = 'promo'
WHERE trim(coalesce("bg_color", '')) LIKE 'from-%'
  AND NOT (
    nullif(trim(coalesce("image_url", '')), '') IS NOT NULL
    OR nullif(trim(coalesce("mobile_image_url", '')), '') IS NOT NULL
    OR nullif(trim(coalesce("video_url", '')), '') IS NOT NULL
    OR nullif(trim(coalesce("mobile_video_url", '')), '') IS NOT NULL
  );
