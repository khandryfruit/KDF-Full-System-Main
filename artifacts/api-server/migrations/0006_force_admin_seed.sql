-- Migration 0006: Force-upsert the default super-admin account.
--
-- This migration is idempotent and safe to run multiple times.
-- It guarantees that admin@kdfnuts.com always exists with the correct
-- bcrypt hash for KdfAdmin@2024, even if earlier migrations partially
-- failed or the INSERT was skipped due to a conflict that left a bad hash.
--
-- Hash: $2b$10$J.BnACh3.ObplJqgzqkmIeUfZNTCZyZ5jM7AK6c8P5rV1JAn.YlVK
-- Password: KdfAdmin@2024  (verified bcrypt rounds=10)

-- Ensure the admin_users table exists (guard for extreme edge cases)
CREATE TABLE IF NOT EXISTS admin_users (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT 'Super Admin',
  email           TEXT NOT NULL UNIQUE,
  phone           TEXT,
  password_hash   TEXT NOT NULL,
  avatar_url      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_super        BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  last_login_ip   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns if the table was created by an earlier migration
-- without them (ALTER TABLE IF NOT EXISTS is PostgreSQL 9.6+).
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_ip TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS avatar_url    TEXT;

-- UPSERT: insert or correct the super-admin credential.
-- ON CONFLICT DO UPDATE ensures the hash is always current even if a
-- previous migration inserted a wrong hash.
INSERT INTO admin_users (name, email, password_hash, is_active, is_super, created_at, updated_at)
VALUES (
  'Super Admin',
  'admin@kdfnuts.com',
  '$2b$10$J.BnACh3.ObplJqgzqkmIeUfZNTCZyZ5jM7AK6c8P5rV1JAn.YlVK',
  TRUE,
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_active     = TRUE,
      is_super      = TRUE,
      updated_at    = NOW();
