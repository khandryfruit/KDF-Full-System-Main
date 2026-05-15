-- WhatsApp message delivery tracking + retry support
ALTER TABLE whatsapp_logs ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE whatsapp_logs ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE whatsapp_logs ADD COLUMN IF NOT EXISTS trigger_event text;
ALTER TABLE whatsapp_logs ADD COLUMN IF NOT EXISTS shopify_order_id text;

CREATE INDEX IF NOT EXISTS whatsapp_logs_trigger_order_idx
  ON whatsapp_logs (trigger_event, shopify_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_logs_delivery_status_idx
  ON whatsapp_logs (delivery_status, created_at DESC)
  WHERE delivery_status IS NOT NULL;
