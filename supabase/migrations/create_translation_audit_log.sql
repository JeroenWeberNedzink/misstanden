-- Translation Audit Log Table
-- Tracks all changes made to translation keys

CREATE TABLE IF NOT EXISTS translation_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_path TEXT NOT NULL,
  language_code VARCHAR(2) NOT NULL CHECK (language_code IN ('en', 'nl', 'fr', 'de')),
  old_value TEXT,
  new_value TEXT,
  action VARCHAR(20) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'IMPORT_CREATE', 'IMPORT_UPDATE')),
  changed_by UUID REFERENCES handlers(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_translation_audit_key ON translation_audit_log(key_path);
CREATE INDEX IF NOT EXISTS idx_translation_audit_date ON translation_audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_translation_audit_lang ON translation_audit_log(language_code);
CREATE INDEX IF NOT EXISTS idx_translation_audit_user ON translation_audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_translation_audit_action ON translation_audit_log(action);

-- Comments
COMMENT ON TABLE translation_audit_log IS 'Audit log for all translation changes';
COMMENT ON COLUMN translation_audit_log.key_path IS 'Dot notation key path (e.g., common.save)';
COMMENT ON COLUMN translation_audit_log.language_code IS 'Language code (en, nl, fr, de)';
COMMENT ON COLUMN translation_audit_log.old_value IS 'Previous translation value (NULL for CREATE)';
COMMENT ON COLUMN translation_audit_log.new_value IS 'New translation value (NULL for DELETE)';
COMMENT ON COLUMN translation_audit_log.action IS 'Type of change (CREATE, UPDATE, DELETE, IMPORT_CREATE, IMPORT_UPDATE)';
COMMENT ON COLUMN translation_audit_log.changed_by IS 'User who made the change (NULL if system/anonymous)';
COMMENT ON COLUMN translation_audit_log.metadata IS 'Additional metadata (IP, user agent, etc.)';
