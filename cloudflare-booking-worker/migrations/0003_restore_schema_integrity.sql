-- Restore the schema guarantees defined by migrations 0001 and 0002.
-- This migration is data-preserving: rows are copied into rebuilt tables before
-- the old tables are removed. Existing IDs and timestamps are kept.
-- The live database was audited before this migration: no duplicate
-- availability (date, start_time) pairs were present.

-- Build replacement tables first so all new foreign-key targets exist before
-- any existing application tables are removed. This avoids disabling foreign
-- key enforcement during the migration.
CREATE TABLE clients_new (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  surname TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (marketing_opt_in IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO clients_new (id, first_name, surname, email, phone, marketing_opt_in, created_at, updated_at)
SELECT id, first_name, surname, email, phone, marketing_opt_in, created_at, updated_at
FROM clients;

CREATE TABLE availability_slots_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  service_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','booked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO availability_slots_new (id, date, start_time, service_ids_json, status, created_at, updated_at)
SELECT id, date, start_time, service_ids_json, status, created_at, updated_at
FROM availability_slots;

CREATE TABLE bookings_new (
  id TEXT PRIMARY KEY,
  slot_id INTEGER NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  booked_service_id TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  price_pence INTEGER NOT NULL CHECK (price_pence >= 0),
  addons_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','completed','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (slot_id) REFERENCES availability_slots_new(id),
  FOREIGN KEY (client_id) REFERENCES clients_new(id)
);
INSERT INTO bookings_new (id, slot_id, client_id, service_id, booked_service_id, date, start_time, price_pence, addons_json, status, created_at, updated_at)
SELECT id, slot_id, client_id, service_id, booked_service_id, date, start_time, price_pence, addons_json, status, created_at, updated_at
FROM bookings;

CREATE TABLE booking_events_new (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings_new(id)
);
INSERT INTO booking_events_new (id, booking_id, event_type, metadata_json, created_at)
SELECT id, booking_id, event_type, metadata_json, created_at
FROM booking_events;

-- Replace the old tables. All existing application rows have already been
-- copied into their corresponding _new table at this point.
DROP TABLE booking_events;
DROP TABLE bookings;
DROP TABLE availability_slots;
DROP TABLE clients;

ALTER TABLE clients_new RENAME TO clients;
ALTER TABLE availability_slots_new RENAME TO availability_slots;
ALTER TABLE bookings_new RENAME TO bookings;
ALTER TABLE booking_events_new RENAME TO booking_events;

-- Recreate all indexes from the original schema plus the integrity index from 0002.
CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_availability_date_status ON availability_slots(date, status, start_time);
CREATE UNIQUE INDEX idx_availability_date_time_unique
  ON availability_slots(date, start_time);
CREATE INDEX idx_bookings_client_date ON bookings(client_id, date, start_time);
CREATE INDEX idx_bookings_status_date ON bookings(status, date, start_time);
CREATE INDEX idx_booking_events_booking ON booking_events(booking_id, created_at);
