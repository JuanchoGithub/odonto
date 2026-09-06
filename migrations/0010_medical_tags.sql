-- Shared dictionary of medical tag terms (Médico / Medical tab).
-- Tags are a derived view over the free-text patient columns: a term listed here
-- renders as a chip wherever it appears in the matching field. The patient's
-- stored text stays plain (banner/list/audit views are unaffected).
CREATE TABLE IF NOT EXISTS medical_tags (
  id TEXT PRIMARY KEY,
  field TEXT NOT NULL,   -- contagious_diseases | allergies_medication | current_medications | chronic_conditions | medical_history | allergies
  term TEXT NOT NULL,    -- display casing, e.g. 'Aspirin'
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_medical_tags
  ON medical_tags(field, lower(term));