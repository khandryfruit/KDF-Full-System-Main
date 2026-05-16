-- Premium homepage countdown banner controls.
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "offer_category_ids" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "offer_mode" text NOT NULL DEFAULT 'discount_products';
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "offer_display_count" integer NOT NULL DEFAULT 8;
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "offer_sort" text NOT NULL DEFAULT 'featured';
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "show_timer" boolean NOT NULL DEFAULT true;
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "button_bg_color" text;
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "button_text_color" text;

CREATE INDEX IF NOT EXISTS banners_home_countdown_active_idx
  ON banners (placement, active, sort_order)
  WHERE placement = 'countdown_deal';
