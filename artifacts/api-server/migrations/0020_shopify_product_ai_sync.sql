-- Migration 0020: Enrich Shopify product data for AI ordering
-- AI ordering must use synced Shopify data only.

ALTER TABLE shopify_products
  ADD COLUMN IF NOT EXISTS collections jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS handle text,
  ADD COLUMN IF NOT EXISTS shopify_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_shopify_products_status_synced_at
  ON shopify_products (status, synced_at);

CREATE INDEX IF NOT EXISTS idx_shopify_products_variants_gin
  ON shopify_products USING gin (variants);
