-- One-off extra open days ("días puntuales") on dentist_exceptions.
-- Additive only. Ausencias (time_off) flow untouched; this hardens the
-- table so multi-window custom_hours rows can't silently collide:
-- one absence per dentist-date, one custom row per dentist-date-start.
-- start < end is enforced in addExtraDay validation (SQLite cannot
-- ADD CONSTRAINT to an existing table, and triggers don't survive
-- the naive statement splitter in scripts/migrate.mjs).
-- `mode` decides how custom rows combine with weekly hours:
--   'replace' (default, legacy behavior) = the custom rows ARE the day;
--   'add' = extra hours ON TOP OF the weekly schedule that day.
-- start < end is enforced in addExtraDay validation (SQLite cannot
-- ADD CONSTRAINT to an existing table, and triggers don't survive
-- the naive statement splitter in scripts/migrate.mjs).
-- Precedence (see lib/availability.ts): any time_off row on a date
-- suppresses custom rows for that date — an absent day never silently
-- becomes work. Replacing an absence happens explicitly in
-- addExtraDay (delete + insert + audit), never in the resolver.
PRAGMA foreign_keys = ON;

ALTER TABLE dentist_exceptions ADD COLUMN mode TEXT NOT NULL DEFAULT 'replace';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dentist_exceptions_time_off_unique
  ON dentist_exceptions(dentist_id, date) WHERE kind = 'time_off';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dentist_exceptions_custom_unique
  ON dentist_exceptions(dentist_id, date, start_time) WHERE kind = 'custom_hours';
