-- Link auto-generated visit invoices to their appointment (one per turno).
-- Manual invoices keep appointment_id NULL and are unaffected by the unique index.
ALTER TABLE invoices ADD COLUMN appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_appointment ON invoices(appointment_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_appointment ON invoices(appointment_id) WHERE appointment_id IS NOT NULL;
