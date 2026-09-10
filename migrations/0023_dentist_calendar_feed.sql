-- Per-dentist subscribable calendar feed (iPhone calendar subscription).
-- calendar_token: unguessable per-dentist secret, generated ONCE (server action
-- fills it when NULL) and never rotated — it is embedded in the Blob pathname
-- so the feed URL stays stable forever.
-- calendar_url: public Blob URL of the rolling 6-week ICS file
-- (last 28 days + next 14 days), overwritten on every appointment write.
ALTER TABLE users ADD COLUMN calendar_token TEXT;
ALTER TABLE users ADD COLUMN calendar_url TEXT;
CREATE INDEX IF NOT EXISTS idx_users_calendar_token ON users(calendar_token);
