-- Clinic-wide default turn duration (used as fallback when a dentist has
-- no per-dentist value set, or before one is selected in the calendar).
-- Additive only; safe to apply on existing DBs.
ALTER TABLE clinics ADD COLUMN default_slot_minutes INTEGER NOT NULL DEFAULT 15;
