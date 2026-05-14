-- Enrich abandoned_checkouts for Shopify sync, recovery URLs, and order matching
ALTER TABLE abandoned_checkouts ADD COLUMN IF NOT EXISTS checkout_url text;
ALTER TABLE abandoned_checkouts ADD COLUMN IF NOT EXISTS shopify_checkout_token text;
ALTER TABLE abandoned_checkouts ADD COLUMN IF NOT EXISTS shopify_checkout_id text;
ALTER TABLE abandoned_checkouts ADD COLUMN IF NOT EXISTS total_discounts numeric(12, 2);
ALTER TABLE abandoned_checkouts ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE abandoned_checkouts ADD COLUMN IF NOT EXISTS sync_source text DEFAULT 'native';

CREATE INDEX IF NOT EXISTS abandoned_checkouts_shopify_token_idx ON abandoned_checkouts (shopify_checkout_token);
CREATE INDEX IF NOT EXISTS abandoned_checkouts_shopify_id_idx ON abandoned_checkouts (shopify_checkout_id);
