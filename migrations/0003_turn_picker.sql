-- Turn picker & scheduling
-- Idempotent: every CREATE uses IF NOT EXISTS; ALTER TABLE ADD COLUMN is checked in code first.

ALTER TABLE users ADD COLUMN slot_minutes INTEGER NOT NULL DEFAULT 15;

ALTER TABLE clinics ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';

CREATE TABLE IF NOT EXISTS clinic_business_hours (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  UNIQUE(clinic_id, day_of_week),
  FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dentist_schedules (
  id TEXT PRIMARY KEY,
  dentist_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  effective_from TEXT,
  effective_to TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(dentist_id, day_of_week, start_time),
  FOREIGN KEY (dentist_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dentist_schedules_dentist ON dentist_schedules(dentist_id);

CREATE TABLE IF NOT EXISTS clinic_exceptions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('holiday','closed')),
  date TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date)
);

CREATE TABLE IF NOT EXISTS dentist_exceptions (
  id TEXT PRIMARY KEY,
  dentist_id TEXT NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('time_off','custom_hours')),
  start_time TEXT,
  end_time TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (dentist_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (
    (kind = 'custom_hours' AND start_time IS NOT NULL AND end_time IS NOT NULL)
    OR (kind = 'time_off')
  )
);

CREATE INDEX IF NOT EXISTS idx_dentist_exceptions_dentist_date
  ON dentist_exceptions(dentist_id, date);

CREATE TABLE IF NOT EXISTS turn_picker_links (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  patient_id TEXT NOT NULL,
  dentist_id TEXT NOT NULL,
  slot_minutes INTEGER NOT NULL CHECK (slot_minutes IN (15,30)),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (dentist_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_turn_picker_links_token ON turn_picker_links(token);
CREATE INDEX IF NOT EXISTS idx_turn_picker_links_patient ON turn_picker_links(patient_id, created_at);

-- Seed clinic_business_hours for any existing clinic (Mon-Fri 09:00-18:00)
INSERT OR IGNORE INTO clinic_business_hours (id, clinic_id, day_of_week, start_time, end_time)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || lower(substr(hex(randomblob(2)),2)) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
       c.id, dow.d, '09:00', '18:00'
FROM clinics c
CROSS JOIN (
  SELECT 1 AS d UNION ALL SELECT 2 UNION ALL SELECT 3
  UNION ALL SELECT 4 UNION ALL SELECT 5
) dow;
