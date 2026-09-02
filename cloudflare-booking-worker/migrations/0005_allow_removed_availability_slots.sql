-- Preserve availability slots that have booking history while allowing an admin to remove them.
-- A cancelled booking still references its slot, so deleting the slot would violate the foreign key.
-- A nullable removed_at flag lets the slot stay in place for history while hiding it from customers.

ALTER TABLE availability_slots ADD COLUMN removed_at TEXT;

CREATE INDEX idx_availability_removed_date ON availability_slots(removed_at, date, start_time);
