-- Add last-modified timestamps so the client cache can run incremental delta
-- syncs ("rows changed since watermark") instead of re-reading tables. Bumped
-- on every write path. Applied to all client-synced entities so every snapshot
-- (appointments, invoices, payments, treatments, catalog) is delta-able.
--
-- NOTE: SQLite forbids non-constant DEFAULT expressions in ALTER TABLE ...
-- ADD COLUMN, so the columns are added nullable and backfilled. All write
-- paths set updated_at explicitly going forward.

ALTER TABLE appointments ADD COLUMN updated_at TEXT;
UPDATE appointments SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_updated_at ON appointments(updated_at);

ALTER TABLE invoices ADD COLUMN updated_at TEXT;
UPDATE invoices SET updated_at = COALESCE(issued_at, datetime('now')) WHERE updated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_updated_at ON invoices(updated_at);

ALTER TABLE payments ADD COLUMN updated_at TEXT;
UPDATE payments SET updated_at = COALESCE(paid_at, datetime('now')) WHERE updated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_updated_at ON payments(updated_at);

ALTER TABLE treatments ADD COLUMN updated_at TEXT;
UPDATE treatments SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_treatments_updated_at ON treatments(updated_at);

ALTER TABLE treatment_catalog ADD COLUMN updated_at TEXT;
UPDATE treatment_catalog SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_updated_at ON treatment_catalog(updated_at);