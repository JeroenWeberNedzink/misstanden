-- Support internal note attachments (not visible to reporter)
ALTER TABLE IF EXISTS attachments
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS note_id UUID;
