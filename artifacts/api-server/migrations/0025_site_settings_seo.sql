-- Site-wide SEO metadata (homepage defaults + social) on site_settings
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS primary_keywords text;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS secondary_keywords text;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS long_tail_keywords text;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS og_title text;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS og_description text;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS twitter_card_type text DEFAULT 'summary_large_image';
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS robots_index boolean NOT NULL DEFAULT true;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS schema_org_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS schema_breadcrumb_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS schema_faq_enabled boolean NOT NULL DEFAULT false;
