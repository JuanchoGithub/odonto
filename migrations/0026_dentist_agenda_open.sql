-- Per-dentist manual agenda opening ("abrir agenda").
-- Additive only. NULL = no manual extension; the 14-day / automatic
-- month-end rule applies. Values are clinic-local YYYY-MM-DD dates.
-- Past dates are ignored by the horizon (fold-back), never a reduction.
PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN agenda_open_until TEXT;
