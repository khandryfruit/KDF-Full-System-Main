-- Migration 0005: Patch admin_users table for Railway compatibility
-- Ensures columns that may be missing when migration 0000 ran partially.
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS is fully idempotent.

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS phone          text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS avatar_url     text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at  timestamptz;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_ip  text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT NOW();

-- Ensure admin_roles slug constraint exists
ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS is_system   boolean NOT NULL DEFAULT false;
ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS color       text DEFAULT '#6366f1';
ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT NOW();

-- Re-seed default admin user in case earlier migrations missed it
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
