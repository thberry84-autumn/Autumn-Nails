-- Preserve availability slots that have booking history while allowing an admin to remove them.
-- A cancelled booking still references its slot, so deleting the slot would violate the foreign key.
-- "removed" keeps the slot/history intact and makes it unavailable for future customers.

CREATE TABLE availability_slots_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  service_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','booked','removed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO availability_slots_new (id, date, start_time, service_ids_json, status, created_at, updated_at)
SELECT id, date, start_time, service_ids_json, status, created_at, updated_at
FROM availability_slots;

DROP TABLE availability_slots;
ALTER TABLE availability_slots_new RENAME TO availability_slots;

CREATE INDEX idx_availability_date_time ON availability_slots(date, start_time);
CREATE INDEX idx_availability_status_date ON availability_slots(status, date, start_time);
