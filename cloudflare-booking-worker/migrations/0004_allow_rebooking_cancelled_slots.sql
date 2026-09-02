-- Allow a previously cancelled appointment slot to be booked again.
-- bookings.slot_id was UNIQUE, which prevented rebooking a slot after its
-- original booking had been cancelled. Booking history must be preserved, so
-- cancelled bookings remain in the table while slot_id is no longer unique.

CREATE TABLE bookings_new (
  id TEXT PRIMARY KEY,
  slot_id INTEGER NOT NULL,
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
  FOREIGN KEY (slot_id) REFERENCES availability_slots(id),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

INSERT INTO bookings_new (
  id, slot_id, client_id, service_id, booked_service_id, date, start_time,
  price_pence, addons_json, status, created_at, updated_at
)
SELECT
  id, slot_id, client_id, service_id, booked_service_id, date, start_time,
  price_pence, addons_json, status, created_at, updated_at
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

DROP TABLE booking_events;
DROP TABLE bookings;

ALTER TABLE bookings_new RENAME TO bookings;
ALTER TABLE booking_events_new RENAME TO booking_events;

CREATE INDEX idx_bookings_slot ON bookings(slot_id);
CREATE INDEX idx_bookings_client_date ON bookings(client_id, date, start_time);
CREATE INDEX idx_bookings_status_date ON bookings(status, date, start_time);
CREATE INDEX idx_booking_events_booking ON booking_events(booking_id, created_at);
