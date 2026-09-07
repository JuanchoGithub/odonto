-- Update the built-in no-show follow-up template text stored in
-- clinics.whatsapp_templates. The original wording ("¿podría confirmar si
-- no va a venir?") was ambiguous; the new wording ("¿podría confirmar si
-- cancela el turno?") is clearer for chasing a missed turn. Only touches
-- the built-in template row; any admin-customized edits are left alone.
PRAGMA foreign_keys = ON;

UPDATE clinics
   SET whatsapp_templates = (
        SELECT json_group_array(
          CASE
            WHEN json_extract(value, '$.id') = 'builtin_no_show'
              THEN json_set(
                     value,
                     '$.body_es',
                     'Hola {{name}}, hoy {{weekday}} tenía un turno a las {{time}}, pero no se presentó, ¿podría confirmar si cancela el turno? Gracias.',
                     '$.body_en',
                     'Hi {{name}}, today {{weekday}} you had an appointment at {{time}}, but you did not show up. Could you confirm whether you are cancelling the appointment? Thank you.'
                   )
            ELSE value
          END
        ) FROM json_each(whatsapp_templates)
      )
 WHERE json_extract(whatsapp_templates, '$[0]') IS NOT NULL;