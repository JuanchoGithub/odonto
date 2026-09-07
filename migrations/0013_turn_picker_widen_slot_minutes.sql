-- Allow link slot_minutes beyond the original 15/30 pair. libsql enforces
-- CHECK at insert/update; widen so the Add and Generate link flows can
-- store the dentist's default duration.
-- (SQLite doesn't support ALTER CHECK directly; recreate the table.)
PRAGMA foreign_keys = OFF;
CREATE TABLE IF NOT EXISTS turn_picker_links__new (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  patient_id TEXT NOT NULL,
  dentist_id TEXT NOT NULL,
  slot_minutes INTEGER NOT NULL CHECK (slot_minutes IN (15,30,45,60,90,120)),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (dentist_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
INSERT OR IGNORE INTO turn_picker_links__new
  SELECT id, token, patient_id, dentist_id, slot_minutes, expires_at, used_at, created_by, created_at
  FROM turn_picker_links;
DROP TABLE IF EXISTS turn_picker_links;
ALTER TABLE turn_picker_links__new RENAME TO turn_picker_links;
CREATE INDEX IF NOT EXISTS idx_turn_picker_links_token ON turn_picker_links(token);
CREATE INDEX IF NOT EXISTS idx_turn_picker_links_patient ON turn_picker_links(patient_id, created_at);
PRAGMA foreign_keys = ON;
