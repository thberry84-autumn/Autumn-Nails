-- Preserve availability slots that have booking history while allowing an admin to remove them.
-- A cancelled booking still references its slot, so deleting the slot would violate the foreign key.
-- The production database already uses this non-destructive flag.

ALTER TABLE availability_slots ADD COLUMN removed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_availability_removed_date ON availability_slots(removed_at, date, start_time);
