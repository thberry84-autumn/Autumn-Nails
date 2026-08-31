-- Autumn Nails booking system v1
-- Online booking stores only the personal data needed to administer appointments.
-- Consultation / health information remains outside this database.

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  surname TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (marketing_opt_in IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);

CREATE TABLE IF NOT EXISTS availability_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  service_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','booked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_availability_date_status ON availability_slots(date, status, start_time);

CREATE TABLE IF NOT EXISTS bookings (
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
  FOREIGN KEY (slot_id) REFERENCES availability_slots(id),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);
CREATE INDEX IF NOT EXISTS idx_bookings_client_date ON bookings(client_id, date, start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_status_date ON bookings(status, date, start_time);

CREATE TABLE IF NOT EXISTS booking_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);
CREATE INDEX IF NOT EXISTS idx_booking_events_booking ON booking_events(booking_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
