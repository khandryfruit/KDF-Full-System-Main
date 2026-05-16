-- Central media library: folders, assets, usage tracking, duplicate detection

CREATE TABLE IF NOT EXISTS media_folders (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  parent_id integer REFERENCES media_folders(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_assets (
  id serial PRIMARY KEY,
  folder_id integer REFERENCES media_folders(id) ON DELETE SET NULL,
  filename text NOT NULL,
  original_filename text NOT NULL,
  object_path text NOT NULL,
  content_hash text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/webp',
  width integer,
  height integer,
  original_size integer NOT NULL DEFAULT 0,
  processed_size integer NOT NULL DEFAULT 0,
  variants jsonb NOT NULL DEFAULT '{}',
  tags jsonb NOT NULL DEFAULT '[]',
  alt_text text,
  title text,
  uploaded_by integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_assets_folder_idx ON media_assets(folder_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_hash_idx ON media_assets(content_hash);
CREATE INDEX IF NOT EXISTS media_assets_path_idx ON media_assets(object_path);
CREATE INDEX IF NOT EXISTS media_assets_tags_gin ON media_assets USING gin(tags);
CREATE INDEX IF NOT EXISTS media_assets_filename_idx ON media_assets(lower(filename));

CREATE TABLE IF NOT EXISTS media_usage (
  id serial PRIMARY KEY,
  media_id integer NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id integer NOT NULL,
  field_name text,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(media_id, entity_type, entity_id, field_name)
);

CREATE INDEX IF NOT EXISTS media_usage_media_idx ON media_usage(media_id);
CREATE INDEX IF NOT EXISTS media_usage_entity_idx ON media_usage(entity_type, entity_id);

-- Default folders
INSERT INTO media_folders (slug, name, sort_order) VALUES
  ('products', 'Products', 10),
  ('categories', 'Categories', 20),
  ('blogs', 'Blogs', 30),
  ('homepage', 'Homepage', 40),
  ('banners', 'Banners', 50),
  ('offers', 'Offers', 60),
  ('seasonal', 'Seasonal', 70),
  ('ai-generated', 'AI Generated', 80),
  ('collections', 'Collections', 90),
  ('general', 'General', 100)
ON CONFLICT (slug) DO NOTHING;
