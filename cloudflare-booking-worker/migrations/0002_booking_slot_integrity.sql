-- Prevent two availability records from representing the same physical appointment time.
-- Appointment duration is intentionally not stored; date + start time is the current slot identity.
CREATE UNIQUE INDEX IF NOT EXISTS idx_availability_date_time_unique
ON availability_slots(date, start_time);
