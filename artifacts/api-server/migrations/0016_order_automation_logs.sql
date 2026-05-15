CREATE TABLE IF NOT EXISTS order_automation_logs (
  id serial PRIMARY KEY NOT NULL,
  shopify_order_db_id integer,
  shopify_order_id text,
  order_number text,
  delivery_id integer,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  message text,
  error_message text,
  payload jsonb DEFAULT '{}'::jsonb,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  next_retry_at timestamp,
  wa_message_id text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_automation_logs_status_retry_idx
  ON order_automation_logs (status, next_retry_at)
  WHERE status IN ('failed', 'pending');

CREATE INDEX IF NOT EXISTS order_automation_logs_order_idx
  ON order_automation_logs (shopify_order_db_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_automation_logs_event_idx
  ON order_automation_logs (event_type, created_at DESC);
