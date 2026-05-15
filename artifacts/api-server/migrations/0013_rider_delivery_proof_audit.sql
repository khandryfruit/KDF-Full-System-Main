-- Phase A: delivery proof URLs + GPS metadata + admin review + append-only rider events

ALTER TABLE delivery_verifications
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS location_accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS device_json jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cod_collected_snapshot numeric(12, 2),
  ADD COLUMN IF NOT EXISTS payment_status_snapshot text,
  ADD COLUMN IF NOT EXISTS admin_review_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS admin_review_notes text,
  ADD COLUMN IF NOT EXISTS admin_reviewed_at timestamptz;

ALTER TABLE delivery_verifications
  ALTER COLUMN photo_base64 DROP NOT NULL;

CREATE TABLE IF NOT EXISTS rider_delivery_events (
  id bigserial PRIMARY KEY,
  delivery_id integer,
  rider_id integer NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rider_delivery_events_delivery_idx
  ON rider_delivery_events (delivery_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rider_delivery_events_rider_idx
  ON rider_delivery_events (rider_id, created_at DESC);
