-- Harden foreign keys + system user + user soft-delete + clinic-scoped holidays.
--
-- 1. appointments.created_by / cancelled_by / no_show_by were plain TEXT
--    with no FK (0006/0011 added them via bare ALTER TABLE). Rebuild the
--    table to add FKs to users(id) ON DELETE RESTRICT. RESTRICT (not SET
--    NULL) forces deletes through the hardDeleteUser() service, which
--    reassigns these columns to the system user (see below) instead of
--    silently orphaning history. patient_id (CASCADE) and dentist_id
--    (RESTRICT) FKs are carried over unchanged.
-- 2. appointments.no_show_by previously stored the literal 'auto' for cron
--    sweeps, which no FK can represent. The sweep now attributes to the
--    reserved system user instead; pre-existing 'auto' rows are backfilled.
-- 3. medical_tags.created_by was NOT NULL with no FK. Rebuild: nullable +
--    FK to users(id) ON DELETE RESTRICT (dictionary outlives its creator;
--    hard-delete reassigns to system).
-- 4. users.deleted_at: soft-delete flag (NULL = active). Login and user
--    lists filter it out.
-- 5. Reserved system user id='system' (email system@internal). Its
--    password_hash is the literal '*LOCKED*' — not a valid bcrypt hash, so
--    Credentials login can never succeed. No secret is committed here.
-- 6. clinic_exceptions gains nullable clinic_id FK (NULL = global holiday,
--    preserving single-clinic behavior for existing rows).
--
-- SQLite cannot ADD CONSTRAINT, so appointments / medical_tags use the
-- standard recreate-with-rename pattern (same as 0007).

PRAGMA foreign_keys=OFF;
BEGIN;

ALTER TABLE users ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

INSERT OR IGNORE INTO users (id, email, password_hash, name, role, locale, created_at)
VALUES ('system', 'system@internal', '*LOCKED*', 'System', 'admin', 'es', datetime('now'));

UPDATE appointments SET no_show_by = 'system' WHERE no_show_by = 'auto';

CREATE TABLE appointments_new (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  dentist_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','arrived','in_chair','completed','cancelled','no_show')),
  reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  created_via TEXT NOT NULL DEFAULT 'manual',
  reprogram_count INTEGER NOT NULL DEFAULT 0,
  original_starts_at TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT,
  cancel_reason TEXT,
  no_show_at TEXT,
  no_show_by TEXT,
  completed_at TEXT,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (dentist_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (no_show_by) REFERENCES users(id) ON DELETE RESTRICT
);

INSERT OR IGNORE INTO appointments_new
  SELECT id, patient_id, dentist_id, starts_at, ends_at, status, reason, notes,
         created_at, created_by, created_via, reprogram_count, original_starts_at,
         cancelled_at, cancelled_by, cancel_reason, no_show_at, no_show_by, completed_at
  FROM appointments;

DROP TABLE appointments;
ALTER TABLE appointments_new RENAME TO appointments;
CREATE INDEX IF NOT EXISTS idx_appointments_dentist_starts
  ON appointments(dentist_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_patient
  ON appointments(patient_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status_ends ON appointments(status, ends_at);

CREATE TABLE medical_tags_new (
  id TEXT PRIMARY KEY,
  field TEXT NOT NULL,
  term TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

INSERT OR IGNORE INTO medical_tags_new
  SELECT id, field, term, created_by, created_at
  FROM medical_tags;

DROP TABLE medical_tags;
ALTER TABLE medical_tags_new RENAME TO medical_tags;
CREATE UNIQUE INDEX IF NOT EXISTS uq_medical_tags
  ON medical_tags(field, lower(term));

ALTER TABLE clinic_exceptions ADD COLUMN clinic_id TEXT REFERENCES clinics(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_clinic_exceptions_clinic ON clinic_exceptions(clinic_id);

COMMIT;
PRAGMA foreign_keys=ON;
