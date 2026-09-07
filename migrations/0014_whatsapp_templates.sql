-- WhatsApp integration: per-clinic default country code + configurable message templates.
-- The default templates are stored as JSON (an array) so admins can add/edit more from
-- Settings without a migration. Two seeds ship:
--   1) confirmation — for upcoming/active turns
--   2) no_show      — for missed/no-show follow-up
-- Built-in kinds ("confirmation" and "no_show") cannot be deleted via the UI; they may
-- be edited and toggled enabled. Custom kinds may be added/removed freely.
PRAGMA foreign_keys = ON;

ALTER TABLE clinics
  ADD COLUMN whatsapp_default_country_code TEXT NOT NULL DEFAULT '+54';

ALTER TABLE clinics
  ADD COLUMN whatsapp_templates TEXT NOT NULL DEFAULT '[]';

-- Seed the two built-in templates for any existing clinic rows so the panel has
-- something to ship with on day 1. New clinics get these defaults from the
-- `clinicSettings` helper when the user reaches the dashboard.
UPDATE clinics
   SET whatsapp_templates = json_array(
        json_object(
          'id', 'builtin_confirmation',
          'kind', 'confirmation',
          'label_es', 'Confirmación de turno',
          'label_en', 'Appointment confirmation',
          'body_es', 'Hola, {{name}}. Hoy {{weekday}} tiene turno a las {{time}}, confirme por favor.',
          'body_en', 'Hi {{name}}. Today {{weekday}} you have an appointment at {{time}}, please confirm.',
          'applies_to', 'upcoming',
          'enabled', 1
        ),
        json_object(
          'id', 'builtin_no_show',
          'kind', 'no_show',
          'label_es', 'Recordatorio de inasistencia',
          'label_en', 'No-show follow-up',
          'body_es', 'Hola {{name}}, hoy {{weekday}} tenía un turno a las {{time}}, pero no se presentó, ¿podría confirmar si no va a venir? Gracias.',
          'body_en', 'Hi {{name}}, today {{weekday}} you had an appointment at {{time}}, but you did not show up. Could you confirm whether you are still coming? Thank you.',
          'applies_to', 'past',
          'enabled', 1
        )
      )
 WHERE whatsapp_templates = '[]'
    OR whatsapp_templates IS NULL
    OR length(whatsapp_templates) = 0;
