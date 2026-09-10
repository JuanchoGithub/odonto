-- Harden built-in WhatsApp templates: always enabled with canonical scope.
-- Admins edit text only; the AttendSheet must never render zero buttons.
--   builtin_confirmation → enabled=1, applies_to='upcoming'
--   builtin_no_show      → enabled=1, applies_to='past'
-- Custom templates are untouched. Rows with empty/missing JSON are left alone
-- (read-time parseTemplates falls back to the built-in seeds).
PRAGMA foreign_keys = ON;

UPDATE clinics
   SET whatsapp_templates = (
         SELECT json_group_array(
           CASE
             WHEN json_extract(value, '$.id') = 'builtin_confirmation'
               THEN json_set(value, '$.enabled', 1, '$.applies_to', 'upcoming')
             WHEN json_extract(value, '$.id') = 'builtin_no_show'
               THEN json_set(value, '$.enabled', 1, '$.applies_to', 'past')
             ELSE value
           END
         ) FROM json_each(whatsapp_templates)
       )
 WHERE json_extract(whatsapp_templates, '$[0]') IS NOT NULL;

UPDATE users
   SET whatsapp_templates = (
         SELECT json_group_array(
           CASE
             WHEN json_extract(value, '$.id') = 'builtin_confirmation'
               THEN json_set(value, '$.enabled', 1, '$.applies_to', 'upcoming')
             WHEN json_extract(value, '$.id') = 'builtin_no_show'
               THEN json_set(value, '$.enabled', 1, '$.applies_to', 'past')
             ELSE value
           END
         ) FROM json_each(whatsapp_templates)
       )
 WHERE whatsapp_templates IS NOT NULL
   AND json_extract(whatsapp_templates, '$[0]') IS NOT NULL;
