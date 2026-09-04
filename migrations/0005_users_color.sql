-- Per-user (dentist) calendar color for the appointments calendar.
-- NULL means "use the deterministic palette fallback derived from the user id"
-- (see lib/colors.ts). Admins can pick a color in Settings → Users.
ALTER TABLE users ADD COLUMN color TEXT;
