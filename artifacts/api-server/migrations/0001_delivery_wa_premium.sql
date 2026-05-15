CREATE TABLE IF NOT EXISTS delivery_track_tokens (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  delivery_id INTEGER NOT NULL,
  shopify_order_db_id INTEGER,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  click_count INTEGER NOT NULL DEFAULT 0,
  last_clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS delivery_track_tokens_delivery_id_idx ON delivery_track_tokens(delivery_id);
CREATE INDEX IF NOT EXISTS delivery_track_tokens_token_idx ON delivery_track_tokens(token);

CREATE TABLE IF NOT EXISTS delivery_wa_notifications (
  id SERIAL PRIMARY KEY,
  delivery_id INTEGER NOT NULL,
  shopify_order_db_id INTEGER,
  event_type TEXT NOT NULL DEFAULT 'rider_assigned',
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  wa_message_id TEXT,
  template_name TEXT,
  message_preview TEXT,
  tracking_token TEXT,
  tracking_url TEXT,
  invoice_snapshot JSONB,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS delivery_wa_notifications_delivery_id_idx ON delivery_wa_notifications(delivery_id);
CREATE INDEX IF NOT EXISTS delivery_wa_notifications_status_idx ON delivery_wa_notifications(status);
CREATE INDEX IF NOT EXISTS delivery_wa_notifications_created_at_idx ON delivery_wa_notifications(created_at DESC);

ALTER TABLE rider_delivery_settings ADD COLUMN IF NOT EXISTS premium_wa_on_assign BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE rider_delivery_settings ADD COLUMN IF NOT EXISTS show_rider_phone_to_customer BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE rider_delivery_settings ADD COLUMN IF NOT EXISTS show_rider_photo_to_customer BOOLEAN NOT NULL DEFAULT true;
