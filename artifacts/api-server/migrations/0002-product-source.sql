-- Migration 0002: Add product source tracking columns
-- Applied automatically at server startup via src/lib/runMigrations.ts
-- Idempotent: uses IF NOT EXISTS guards throughout.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS source      text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id text;
