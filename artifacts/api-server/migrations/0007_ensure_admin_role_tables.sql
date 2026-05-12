-- Migration 0007: Ensure admin RBAC tables exist on all deployments.
--
-- This migration is idempotent. It targets Railway and other production
-- environments where migrations 0003/0004 may have partially applied or
-- been skipped. All CREATE TABLE statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS admin_permissions (
  key         text PRIMARY KEY,
  name        text NOT NULL,
  module      text NOT NULL,
  description text
);

CREATE TABLE IF NOT EXISTS admin_roles (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  slug        text NOT NULL,
  description text,
  is_system   boolean NOT NULL DEFAULT false,
  color       text DEFAULT '#6366f1',
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_roles_slug_unique UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id        integer NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS admin_users (
  id              serial PRIMARY KEY,
  name            text NOT NULL DEFAULT 'Super Admin',
  email           text NOT NULL UNIQUE,
  phone           text,
  password_hash   text NOT NULL,
  avatar_url      text,
  is_active       boolean NOT NULL DEFAULT TRUE,
  is_super        boolean NOT NULL DEFAULT FALSE,
  last_login_at   timestamptz,
  last_login_ip   text,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_user_roles (
  user_id integer NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role_id integer NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id          serial PRIMARY KEY,
  user_id     integer,
  user_email  text,
  user_name   text,
  action      text NOT NULL,
  resource    text,
  resource_id text,
  details     text,
  old_data    jsonb,
  new_data    jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

-- Seed the Super Admin role (idempotent)
INSERT INTO admin_roles (name, slug, description, is_system, color)
VALUES ('Super Admin', 'super_admin', 'Full system access', true, '#dc2626')
ON CONFLICT (slug) DO NOTHING;

-- Seed the default super admin account (password: KdfAdmin@2024)
-- Hash: $2b$10$J.BnACh3.ObplJqgzqkmIeUfZNTCZyZ5jM7AK6c8P5rV1JAn.YlVK
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

-- Assign the super admin role to the admin user (idempotent)
INSERT INTO admin_user_roles (user_id, role_id)
SELECT u.id, r.id
FROM admin_users u, admin_roles r
WHERE u.email = 'admin@kdfnuts.com'
  AND r.slug  = 'super_admin'
ON CONFLICT DO NOTHING;

-- Also add missing columns on admin_users if the table was created by an
-- earlier migration without them (ALTER TABLE ADD COLUMN IF NOT EXISTS is
-- available since PostgreSQL 9.6).
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at  timestamptz;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_ip  text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS avatar_url     text;
