-- Clinical summary fields for the patient detail page.
-- All nullable: existing patients (and the seed) keep working without backfill.
--
-- Applied via scripts/migrate.mjs, tracked in _migrations. Do not edit after
-- first deploy - edit is only safe during the initial landing of this PR.

ALTER TABLE patients ADD COLUMN chronic_conditions TEXT;
ALTER TABLE patients ADD COLUMN contagious_diseases TEXT;
ALTER TABLE patients ADD COLUMN current_medications TEXT;
ALTER TABLE patients ADD COLUMN allergies_medication TEXT;
ALTER TABLE patients ADD COLUMN blood_pressure TEXT;
ALTER TABLE patients ADD COLUMN blood_type TEXT;
ALTER TABLE patients ADD COLUMN diabetes TEXT;
ALTER TABLE patients ADD COLUMN pregnant TEXT;
ALTER TABLE patients ADD COLUMN last_medical_update TEXT;

-- The `pregnant` enum is enforced in code (zod + form <select>) rather than
-- a CHECK constraint so the migration is a pure additive ALTER.
-- Values: 'yes' | 'no' | 'unknown' | '' (empty = not recorded)
