-- Odontogram history: a full-chart snapshot plus change details captured on
-- every write, so doctors can review who changed what and when, and view the
-- mouth as it was at any past point.
CREATE TABLE IF NOT EXISTS odontogram_history (
  id           TEXT PRIMARY KEY,
  patient_id   TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL CHECK (action IN ('set','clear_surface','clear_tooth')),
  tooth_number INTEGER,
  surface      TEXT,
  condition    TEXT,
  note         TEXT,
  snapshot     TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_odontogram_history_patient
  ON odontogram_history (patient_id, created_at);