-- Turn reprogram via WhatsApp: single-use links that MOVE the same appointment.
-- Additive only (no table rebuild, no status CHECK change).
-- turn_picker_links.purpose: 'create' (new turn, existing behavior) vs
--   'reprogram' (move appointments.id = appointment_id, dentist+duration locked).
-- appointments.reprogram_link_id / reprogram_pending_at: visible "pending"
--   flag while the link is active. Status stays 'scheduled' so the sweep,
--   billing, dashboard and calendar keep working unchanged. Cleared on
--   consume / revoke / expiry / terminal flip.
PRAGMA foreign_keys = ON;

ALTER TABLE turn_picker_links ADD COLUMN purpose TEXT NOT NULL DEFAULT 'create';
ALTER TABLE turn_picker_links ADD COLUMN appointment_id TEXT REFERENCES appointments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tpl_appointment ON turn_picker_links(appointment_id);

ALTER TABLE appointments ADD COLUMN reprogram_link_id TEXT REFERENCES turn_picker_links(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN reprogram_pending_at TEXT;
CREATE INDEX IF NOT EXISTS idx_appointments_reprogram_link ON appointments(reprogram_link_id);
