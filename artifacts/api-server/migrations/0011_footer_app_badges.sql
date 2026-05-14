-- Footer app store: official/custom badges, per-platform toggles, screenshot gallery JSON
ALTER TABLE app_links ADD COLUMN IF NOT EXISTS android_badge_path text;
ALTER TABLE app_links ADD COLUMN IF NOT EXISTS ios_badge_path text;
ALTER TABLE app_links ADD COLUMN IF NOT EXISTS show_android_button boolean NOT NULL DEFAULT true;
ALTER TABLE app_links ADD COLUMN IF NOT EXISTS show_ios_button boolean NOT NULL DEFAULT true;
ALTER TABLE app_links ADD COLUMN IF NOT EXISTS use_official_badges boolean NOT NULL DEFAULT true;
ALTER TABLE app_links ADD COLUMN IF NOT EXISTS screenshot_paths text;
