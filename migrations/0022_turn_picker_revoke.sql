ALTER TABLE turn_picker_links ADD COLUMN revoked_at TEXT;
CREATE INDEX IF NOT EXISTS idx_turn_picker_links_revoked ON turn_picker_links(revoked_at);