-- Appointment outcomes: reprogram tracking + cancellation / no-show audit fields.
-- Additive only; safe to apply on existing DBs.
ALTER TABLE appointments ADD COLUMN reprogram_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN original_starts_at TEXT;
ALTER TABLE appointments ADD COLUMN cancelled_at TEXT;
ALTER TABLE appointments ADD COLUMN cancelled_by TEXT;
ALTER TABLE appointments ADD COLUMN cancel_reason TEXT;
ALTER TABLE appointments ADD COLUMN no_show_at TEXT;
ALTER TABLE appointments ADD COLUMN no_show_by TEXT;
ALTER TABLE appointments ADD COLUMN completed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_appointments_status_ends ON appointments(status, ends_at);
