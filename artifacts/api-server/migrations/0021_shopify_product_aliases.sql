-- Migration 0021: Shopify product aliases + conversation memory fields

CREATE TABLE IF NOT EXISTS shopify_product_aliases (
  id serial PRIMARY KEY,
  shopify_product_id text NOT NULL,
  alias text NOT NULL,
  alias_type text NOT NULL DEFAULT 'synonym',
  locale text NOT NULL DEFAULT 'any',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS shopify_product_aliases_shopify_alias_locale
  ON shopify_product_aliases (shopify_product_id, lower(alias), locale);

CREATE INDEX IF NOT EXISTS idx_shopify_product_aliases_alias_trgm
  ON shopify_product_aliases USING gin (alias gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_shopify_product_aliases_alias_lower
  ON shopify_product_aliases (lower(alias));

ALTER TABLE whatsapp_conversation_states
  ADD COLUMN IF NOT EXISTS last_intent text,
  ADD COLUMN IF NOT EXISTS last_topic text,
  ADD COLUMN IF NOT EXISTS delivery_discussed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_assistant_hash text,
  ADD COLUMN IF NOT EXISTS last_assistant_reply text;
