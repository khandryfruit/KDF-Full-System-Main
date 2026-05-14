-- Premium footer JSON (admin-editable) + optional app store QR / labels
ALTER TABLE footer_settings ADD COLUMN IF NOT EXISTS premium_config text;

ALTER TABLE app_links ADD COLUMN IF NOT EXISTS qr_image_path text;
ALTER TABLE app_links ADD COLUMN IF NOT EXISTS download_count_label text;
ALTER TABLE app_links ADD COLUMN IF NOT EXISTS android_label text;
ALTER TABLE app_links ADD COLUMN IF NOT EXISTS ios_label text;
