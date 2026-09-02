-- Add the non-destructive removal flag to databases that already applied 0005.
-- This keeps the slot record and any booking history intact while allowing the
-- admin to hide a cancelled/unused appointment space from customers.

ALTER TABLE availability_slots ADD COLUMN removed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_availability_removed_date ON availability_slots(removed_at, date, start_time);
