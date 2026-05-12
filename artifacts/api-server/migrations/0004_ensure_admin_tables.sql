-- Migration 0004: Ensure admin IAM tables exist + re-seed default admin
-- Fully idempotent: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING throughout.
-- Fixes Railway deployments where migration 0000 (drizzle-kit) ran partially
-- and admin_users / admin_roles tables were never created.

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
  id             serial PRIMARY KEY,
  name           text NOT NULL,
  email          text NOT NULL,
  phone          text,
  password_hash  text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  is_super       boolean NOT NULL DEFAULT false,
  avatar_url     text,
  last_login_at  timestamptz,
  last_login_ip  text,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_users_email_unique UNIQUE (email)
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

-- Default super admin role
INSERT INTO admin_roles (name, slug, description, is_system, color)
VALUES ('Super Admin', 'super_admin', 'Full system access', true, '#6366f1')
ON CONFLICT (slug) DO NOTHING;

-- Default admin user: admin@kdfnuts.com / KdfAdmin@2024
-- Hash: bcrypt 10 rounds of "KdfAdmin@2024"
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

-- Link admin user to super_admin role
INSERT INTO admin_user_roles (user_id, role_id)
SELECT u.id, r.id
FROM   admin_users u
JOIN   admin_roles r ON r.slug = 'super_admin'
WHERE  u.email = 'admin@kdfnuts.com'
ON CONFLICT DO NOTHING;
