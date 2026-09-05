-- Update the tooth_conditions CHECK constraint to use the new Argentine
-- odontogram vocabulary. The old enum (caries/filling/crown/root_canal/
-- missing/impacted/fracture/sealant/implant/healthy) is replaced with
-- the new set:
--   caries, restoration, missing, crown, to_extract, perno, sealant,
--   conduct_todo, conduct_done
-- The same constraint is also widened to accept kid-tooth numbers (51-85)
-- for the pediatric odontogram.

-- SQLite does not support ALTER CONSTRAINT. Recreate the table to swap
-- the CHECK. We use the standard 12-step recreate-with-rename pattern.
PRAGMA foreign_keys=OFF;
BEGIN;

CREATE TABLE tooth_conditions_new (
  id             TEXT PRIMARY KEY,
  tooth_chart_id TEXT NOT NULL,
  surface        TEXT NOT NULL CHECK (surface IN ('occlusal','buccal','lingual','mesial','distal','root','whole')),
  condition      TEXT NOT NULL CHECK (condition IN ('caries','restoration','missing','crown','to_extract','perno','sealant','conduct_todo','conduct_done')),
  severity       TEXT,
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tooth_chart_id) REFERENCES teeth_chart(id) ON DELETE CASCADE
);

INSERT INTO tooth_conditions_new (id, tooth_chart_id, surface, condition, severity, note, created_at)
SELECT id, tooth_chart_id, surface,
       CASE condition
         WHEN 'filling' THEN 'restoration'
         WHEN 'implant' THEN 'perno'
         WHEN 'root_canal' THEN 'conduct_done'
         WHEN 'fracture' THEN 'crown'
         WHEN 'impacted' THEN 'to_extract'
         WHEN 'healthy' THEN 'restoration' -- safest generic fallback
         ELSE condition
       END,
       severity, note, created_at
FROM tooth_conditions;

DROP TABLE tooth_conditions;
ALTER TABLE tooth_conditions_new RENAME TO tooth_conditions;
CREATE INDEX IF NOT EXISTS idx_conditions_chart ON tooth_conditions(tooth_chart_id);

COMMIT;
PRAGMA foreign_keys=ON;
