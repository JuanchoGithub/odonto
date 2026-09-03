CREATE TABLE IF NOT EXISTS insurers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  plan TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_insurers_name ON insurers(name);

ALTER TABLE patients ADD COLUMN insurer_id TEXT REFERENCES insurers(id) ON DELETE SET NULL;

ALTER TABLE patients ADD COLUMN insurance_plan TEXT;

CREATE INDEX IF NOT EXISTS idx_patients_insurer ON patients(insurer_id);
