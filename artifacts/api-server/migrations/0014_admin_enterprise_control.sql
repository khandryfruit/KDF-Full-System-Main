-- Enterprise Admin Control Center tables

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS admin_level text NOT NULL DEFAULT 'staff';
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS totp_secret text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_reset_password boolean NOT NULL DEFAULT false;

ALTER TABLE admin_activity_logs ADD COLUMN IF NOT EXISTS severity text DEFAULT 'info';
ALTER TABLE admin_activity_logs ADD COLUMN IF NOT EXISTS device_type text;
ALTER TABLE admin_activity_logs ADD COLUMN IF NOT EXISTS browser text;
ALTER TABLE admin_activity_logs ADD COLUMN IF NOT EXISTS os text;
ALTER TABLE admin_activity_logs ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE admin_activity_logs ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE admin_activity_logs ADD COLUMN IF NOT EXISTS session_id integer;

CREATE INDEX IF NOT EXISTS admin_activity_logs_action_idx ON admin_activity_logs(action);
CREATE INDEX IF NOT EXISTS admin_activity_logs_resource_idx ON admin_activity_logs(resource);
CREATE INDEX IF NOT EXISTS admin_activity_logs_created_idx ON admin_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_activity_logs_user_idx ON admin_activity_logs(user_id);

ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS hierarchy_level integer NOT NULL DEFAULT 50;
ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS dashboard_widgets jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS allowed_modules jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  ip_address text,
  user_agent text,
  device_type text,
  browser text,
  os text,
  country text,
  city text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_sessions_user_idx ON admin_sessions(user_id);

CREATE TABLE IF NOT EXISTS admin_login_history (
  id serial PRIMARY KEY,
  user_id integer REFERENCES admin_users(id) ON DELETE SET NULL,
  email text,
  success boolean NOT NULL DEFAULT true,
  fail_reason text,
  ip_address text,
  user_agent text,
  device_type text,
  browser text,
  country text,
  city text,
  is_suspicious boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_login_history_user_idx ON admin_login_history(user_id);
CREATE INDEX IF NOT EXISTS admin_login_history_created_idx ON admin_login_history(created_at DESC);

CREATE TABLE IF NOT EXISTS admin_api_keys (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  last_used_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_approval_requests (
  id serial PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  resource_type text,
  resource_id text,
  title text NOT NULL,
  payload jsonb,
  requested_by integer REFERENCES admin_users(id),
  reviewed_by integer REFERENCES admin_users(id),
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS admin_approvals_status_idx ON admin_approval_requests(status);

CREATE TABLE IF NOT EXISTS admin_security_settings (
  id serial PRIMARY KEY,
  scope text NOT NULL DEFAULT 'global',
  user_id integer REFERENCES admin_users(id) ON DELETE CASCADE,
  two_factor_enabled boolean NOT NULL DEFAULT false,
  two_factor_secret text,
  ip_whitelist jsonb DEFAULT '[]'::jsonb,
  country_allowlist jsonb DEFAULT '[]'::jsonb,
  password_min_length integer NOT NULL DEFAULT 10,
  password_require_upper boolean NOT NULL DEFAULT true,
  password_require_number boolean NOT NULL DEFAULT true,
  password_require_symbol boolean NOT NULL DEFAULT false,
  session_timeout_minutes integer NOT NULL DEFAULT 480,
  max_failed_logins integer NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO admin_security_settings (scope) SELECT 'global' WHERE NOT EXISTS (
  SELECT 1 FROM admin_security_settings WHERE scope = 'global'
);

CREATE TABLE IF NOT EXISTS admin_role_dashboards (
  role_id integer PRIMARY KEY REFERENCES admin_roles(id) ON DELETE CASCADE,
  widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
  kpi_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_internal_notes (
  id serial PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_by integer REFERENCES admin_users(id),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_notes_entity_idx ON admin_internal_notes(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS admin_control_alerts (
  id serial PRIMARY KEY,
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text,
  resource_type text,
  resource_id text,
  is_read boolean NOT NULL DEFAULT false,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_tasks (
  id serial PRIMARY KEY,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  assigned_to integer REFERENCES admin_users(id),
  created_by integer REFERENCES admin_users(id),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
