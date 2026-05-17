-- Migration 0023: Multilingual product search index + WhatsApp search debug logs
-- Embeddings stored as jsonb (works on all Postgres hosts). Optional pgvector column if extension exists.

CREATE TABLE IF NOT EXISTS shopify_product_search_index (
  shopify_product_id text PRIMARY KEY,
  search_meta jsonb NOT NULL DEFAULT '{}',
  search_document text NOT NULL DEFAULT '',
  embedding jsonb,
  embedding_model text,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_product_search_index_updated
  ON shopify_product_search_index (updated_at DESC);

CREATE TABLE IF NOT EXISTS wa_product_search_logs (
  id serial PRIMARY KEY,
  phone text,
  channel text NOT NULL DEFAULT 'whatsapp',
  user_query text NOT NULL,
  match_method text,
  matched_products jsonb,
  similarity_scores jsonb,
  gpt_output text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_product_search_logs_created
  ON wa_product_search_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_product_search_logs_phone
  ON wa_product_search_logs (phone);

-- Optional pgvector for faster similarity at scale (ignored if extension unavailable)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension not available — using jsonb embeddings only';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE shopify_product_search_index
      ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);
    CREATE INDEX IF NOT EXISTS idx_shopify_product_search_embedding_vector
      ON shopify_product_search_index
      USING hnsw (embedding_vector vector_cosine_ops);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pgvector column/index skipped: %', SQLERRM;
END $$;
