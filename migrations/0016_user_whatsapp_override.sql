-- Per-user WhatsApp message overrides.
--
-- WhatsApp message templates are stored per-clinic in
-- `clinics.whatsapp_templates` + `clinics.whatsapp_default_country_code`.
-- This migration lets any user (typically a dentist) override those with
-- their own country code + templates. A NULL column means "inherit the
-- clinic default"; setting a value overrides it. Doctors edit their own,
-- and admins/secretaries can set both the clinic-wide default and any
-- doctor's override.
PRAGMA foreign_keys = ON;

ALTER TABLE users
  ADD COLUMN whatsapp_default_country_code TEXT;

ALTER TABLE users
  ADD COLUMN whatsapp_templates TEXT;