-- Re-classify image/video banners that were marked `promo` by 0008 (e.g. non-default
-- gradient + media) so storefront `?placement=hero` and admin Hero tab see them again.
UPDATE "banners"
SET "placement" = 'hero'
WHERE "placement" = 'promo'
  AND (
    nullif(trim(coalesce("image_url", '')), '') IS NOT NULL
    OR nullif(trim(coalesce("mobile_image_url", '')), '') IS NOT NULL
    OR nullif(trim(coalesce("video_url", '')), '') IS NOT NULL
    OR nullif(trim(coalesce("mobile_video_url", '')), '') IS NOT NULL
  );
