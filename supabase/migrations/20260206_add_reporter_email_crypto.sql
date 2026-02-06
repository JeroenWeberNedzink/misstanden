-- Add encrypted/hashed reporter email columns to tickets
ALTER TABLE IF EXISTS tickets
  ADD COLUMN IF NOT EXISTS reporter_email_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS reporter_email_hash TEXT;

-- Optional index for lookup by hash
CREATE INDEX IF NOT EXISTS idx_tickets_reporter_email_hash
  ON tickets (reporter_email_hash);
