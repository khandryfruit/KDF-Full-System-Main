-- Migration 0001: Add external source ID columns to products
-- Applied automatically at server startup via src/lib/runMigrations.ts
-- Idempotent: uses IF NOT EXISTS / IF EXISTS guards throughout.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS shopify_product_id      text,
  ADD COLUMN IF NOT EXISTS shopify_handle          text,
  ADD COLUMN IF NOT EXISTS woocommerce_product_id  text;

CREATE UNIQUE INDEX IF NOT EXISTS products_shopify_product_id_key
  ON products (shopify_product_id)
  WHERE shopify_product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_woocommerce_product_id_key
  ON products (woocommerce_product_id)
  WHERE woocommerce_product_id IS NOT NULL;

-- One-time backfill: for every legacy product whose slug looks like a Shopify
-- handle (all lowercase, hyphens only, no spaces) and that does not yet have a
-- shopify_handle stored, seed shopify_handle from the current slug so the Tier-2
-- lookup in the sync loop can find it on the next re-import even if the Shopify
-- handle changes later.
UPDATE products
SET    shopify_handle = slug
WHERE  shopify_handle IS NULL
  AND  shopify_product_id IS NULL
  AND  slug ~ '^[a-z0-9][a-z0-9\-]*[a-z0-9]$';
