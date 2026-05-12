-- Migration 0003: Missing raw-SQL tables + default seed data
-- Applied automatically at server startup via src/lib/runMigrations.ts
-- Fully idempotent: uses IF NOT EXISTS / ON CONFLICT DO NOTHING throughout.

CREATE TABLE IF NOT EXISTS shopify_order_confirmations (
  id                  serial PRIMARY KEY,
  shopify_order_id    text NOT NULL UNIQUE,
  shopify_order_number text,
  shopify_order_db_id integer,
  customer_phone      text,
  customer_name       text,
  wa_message_id       text,
  status              text NOT NULL DEFAULT 'pending',
  auto_book_enabled   boolean NOT NULL DEFAULT true,
  courier_slug        text,
  tracking_id         text,
  shipment_id         integer,
  retry_count         integer NOT NULL DEFAULT 0,
  last_sent_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courier_automation_logs (
  id                  serial PRIMARY KEY,
  shopify_order_id    text,
  shopify_order_number text,
  action              text NOT NULL,
  courier_slug        text,
  tracking_id         text,
  rule_matched        text,
  recommended_courier text,
  calculated_weight   numeric(8,2),
  cod_amount          numeric(10,2),
  status              text NOT NULL DEFAULT 'success',
  error               text,
  details             jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courier_automation_settings (
  id                  serial PRIMARY KEY,
  enabled             boolean NOT NULL DEFAULT false,
  auto_book_on_sync   boolean NOT NULL DEFAULT false,
  default_courier_slug text,
  notify_whatsapp     boolean NOT NULL DEFAULT true,
  notify_branding     text NOT NULL DEFAULT 'OnDrive Logistics',
  high_risk_cities    text[] NOT NULL DEFAULT '{}',
  rules               jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at          timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courier_weight_rules (
  id              serial PRIMARY KEY,
  product_type    text,
  sku_pattern     text,
  weight_per_unit numeric(8,3) NOT NULL DEFAULT 0.5,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopify_sync_log (
  id                  serial PRIMARY KEY,
  delivery_id         integer,
  shopify_order_id    text,
  shopify_order_number text,
  action              text NOT NULL,
  status              text NOT NULL DEFAULT 'pending',
  attempt             integer NOT NULL DEFAULT 1,
  payload             jsonb DEFAULT '{}'::jsonb,
  error               text,
  next_retry_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_modules (
  id          serial PRIMARY KEY,
  module_key  text NOT NULL UNIQUE,
  module_name text NOT NULL,
  description text,
  is_enabled  boolean NOT NULL DEFAULT true,
  app_visible boolean NOT NULL DEFAULT true,
  web_visible boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  role_access jsonb DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blog_ads (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  ad_code    text NOT NULL DEFAULT '',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blog_comments (
  id          serial PRIMARY KEY,
  post_id     integer NOT NULL,
  parent_id   integer,
  name        text NOT NULL,
  email       text,
  content     text NOT NULL,
  is_approved boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seo_redirects (
  id            serial PRIMARY KEY,
  source_path   text NOT NULL UNIQUE,
  target_url    text NOT NULL,
  redirect_type integer NOT NULL DEFAULT 301,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

INSERT INTO admin_roles (name, slug, description, is_system, color)
VALUES ('Super Admin', 'super_admin', 'Full system access', true, '#6366f1')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO admin_users (name, email, phone, password_hash, is_active, is_super)
VALUES (
  'KDF Admin',
  'admin@kdfnuts.com',
  '+923000000000',
  '$2b$10$J.BnACh3.ObplJqgzqkmIeUfZNTCZyZ5jM7AK6c8P5rV1JAn.YlVK',
  true,
  true
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO admin_user_roles (user_id, role_id)
SELECT u.id, r.id
FROM   admin_users u
JOIN   admin_roles r ON r.slug = 'super_admin'
WHERE  u.email = 'admin@kdfnuts.com'
ON CONFLICT DO NOTHING;

INSERT INTO site_settings (id, site_name)
VALUES (1, 'KDF NUTS')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_settings (id, ai_enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO courier_automation_settings (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO system_modules (module_key, module_name, description, sort_order, is_enabled) VALUES
  ('lahore_delivery', 'Lahore Local Delivery', 'Local rider dispatch for Lahore orders', 1, true),
  ('ondrive',         'OnDrive Logistics',     'WhatsApp confirmation + courier auto-booking', 2, true),
  ('shopify_sync',    'Shopify Sync',          'Product, order and customer sync with Shopify', 3, true),
  ('whatsapp',        'WhatsApp Automation',   'Campaign, template and chatbot messaging', 4, true),
  ('ai_tools',        'AI Tools',              'OpenAI-powered content and chat features', 5, true)
ON CONFLICT (module_key) DO NOTHING;
