-- Production reset: wipe all operational + master data for go-live.
-- Tracked + idempotent (plain DELETEs, safe to re-run). Contains NO
-- credentials. After this runs, recreate the clinic + users via
-- Settings in the UI (see scripts/bootstrap-admin.mjs for the first admin).
--
-- Order is FK-safe children-first (the migrate runner does not guarantee
-- PRAGMA foreign_keys=ON, so do NOT rely on cascades here).
-- _migrations is intentionally untouched.
DELETE FROM payments;
DELETE FROM invoice_lines;
DELETE FROM invoices;
DELETE FROM treatments;
DELETE FROM tooth_conditions;
DELETE FROM teeth_chart;
DELETE FROM odontogram_history;
DELETE FROM attachments;
DELETE FROM turn_picker_links;
DELETE FROM appointments;
DELETE FROM audit_log;
DELETE FROM medical_tags;
DELETE FROM dentist_exceptions;
DELETE FROM dentist_schedules;
DELETE FROM clinic_exceptions;
DELETE FROM clinic_business_hours;
DELETE FROM patients;
DELETE FROM insurers;
DELETE FROM users;
DELETE FROM clinics;
