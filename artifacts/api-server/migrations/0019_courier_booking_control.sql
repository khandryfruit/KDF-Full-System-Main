-- Migration 0019: Courier booking control defaults
-- Manual review must be the default. Auto booking is opt-in only.

ALTER TABLE courier_automation_settings
  ADD COLUMN IF NOT EXISTS auto_book_on_confirmation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_booking_required boolean NOT NULL DEFAULT true;

ALTER TABLE shopify_order_confirmations
  ALTER COLUMN auto_book_enabled SET DEFAULT false;

UPDATE courier_automation_settings
SET
  auto_book_on_confirmation = COALESCE(auto_book_on_confirmation, false),
  manual_booking_required = COALESCE(manual_booking_required, true),
  auto_book_on_sync = false,
  updated_at = NOW()
WHERE id = 1;

UPDATE shopify_order_confirmations
SET auto_book_enabled = false
WHERE status IN ('pending', 'sending', 'confirmed')
  AND tracking_id IS NULL;
