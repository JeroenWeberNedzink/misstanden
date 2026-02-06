-- Add per-ticket status email notification toggle (default true)
ALTER TABLE IF EXISTS tickets
  ADD COLUMN IF NOT EXISTS status_email_notify BOOLEAN DEFAULT true;
