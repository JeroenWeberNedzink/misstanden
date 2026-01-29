-- System Settings Table
-- Stores configurable system-wide settings that admins can modify

CREATE TABLE IF NOT EXISTS system_settings (
  id TEXT PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  category TEXT NOT NULL,
  description TEXT,
  is_sensitive BOOLEAN DEFAULT FALSE,
  updated_by UUID REFERENCES handlers(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_system_settings_updated_at();

-- Insert default settings
INSERT INTO system_settings (id, setting_key, setting_value, category, description, is_sensitive) VALUES
  -- General
  ('portal.name', 'portal.name', '{"value": "Misstanden Portal"}'::jsonb, 'general', 'Naam van de portal zoals weergegeven in de UI', false),
  ('portal.tagline', 'portal.tagline', '{"value": "Meld en los misstanden op"}'::jsonb, 'general', 'Tagline weergegeven op de login pagina', false),
  ('portal.support_email', 'portal.support_email', '{"value": "support@example.com"}'::jsonb, 'general', 'Support email adres voor gebruikers', false),
  ('portal.support_phone', 'portal.support_phone', '{"value": ""}'::jsonb, 'general', 'Support telefoonnummer (optioneel)', false),
  ('portal.timezone', 'portal.timezone', '{"value": "Europe/Amsterdam"}'::jsonb, 'general', 'Tijdzone voor de portal', false),
  ('portal.language', 'portal.language', '{"value": "nl"}'::jsonb, 'general', 'Standaard taal (nl, en, fr, de)', false),

  -- Portal Features
  ('portal.enable_registration', 'portal.enable_registration', '{"value": false}'::jsonb, 'portal', 'Sta nieuwe gebruikers toe om zichzelf te registreren', false),
  ('portal.enable_public_submissions', 'portal.enable_public_submissions', '{"value": true}'::jsonb, 'portal', 'Sta anonieme meldingen toe zonder login', false),
  ('portal.enable_attachments', 'portal.enable_attachments', '{"value": true}'::jsonb, 'portal', 'Sta gebruikers toe om bestanden te uploaden', false),
  ('portal.max_attachment_size_mb', 'portal.max_attachment_size_mb', '{"value": 10}'::jsonb, 'portal', 'Maximum bestandsgrootte in MB', false),
  ('portal.allowed_file_types', 'portal.allowed_file_types', '{"value": ["pdf", "jpg", "jpeg", "png", "doc", "docx"]}'::jsonb, 'portal', 'Toegestane bestandstypen', false),

  -- Workflow
  ('workflow.auto_assign', 'workflow.auto_assign', '{"value": true}'::jsonb, 'workflow', 'Automatisch tickets toewijzen aan handlers', false),
  ('workflow.allow_status_rollback', 'workflow.allow_status_rollback', '{"value": false}'::jsonb, 'workflow', 'Sta handlers toe om status terug te zetten', false),
  ('workflow.require_comment_on_status_change', 'workflow.require_comment_on_status_change', '{"value": true}'::jsonb, 'workflow', 'Verplicht commentaar bij statuswijziging', false),
  ('workflow.notify_on_assignment', 'workflow.notify_on_assignment', '{"value": true}'::jsonb, 'workflow', 'Stuur notificatie bij toewijzing van ticket', false),

  -- SLA & Timeline
  ('sla.enable', 'sla.enable', '{"value": true}'::jsonb, 'sla', 'Schakel SLA monitoring in', false),
  ('sla.default_response_hours', 'sla.default_response_hours', '{"value": 24}'::jsonb, 'sla', 'Standaard responstijd in uren', false),
  ('sla.default_resolution_hours', 'sla.default_resolution_hours', '{"value": 72}'::jsonb, 'sla', 'Standaard oplostijd in uren', false),
  ('sla.warning_threshold_percent', 'sla.warning_threshold_percent', '{"value": 75}'::jsonb, 'sla', 'Waarschuwing bij % van SLA tijd', false),
  ('sla.count_business_hours_only', 'sla.count_business_hours_only', '{"value": true}'::jsonb, 'sla', 'Tel alleen werkuren (ma-vr 9-17)', false),

  -- Notifications (Legacy - keeping for backwards compatibility)
  ('notifications.enable_email', 'notifications.enable_email', '{"value": true}'::jsonb, 'notifications', 'Schakel email notificaties in', false),
  ('notifications.enable_in_app', 'notifications.enable_in_app', '{"value": true}'::jsonb, 'notifications', 'Schakel in-app notificaties in', false),
  ('notifications.batch_digest', 'notifications.batch_digest', '{"value": false}'::jsonb, 'notifications', 'Verzamel notificaties in dagelijkse digest', false),
  ('notifications.digest_time', 'notifications.digest_time', '{"value": "09:00"}'::jsonb, 'notifications', 'Tijd voor dagelijkse digest (HH:MM)', false),

  -- Security
  ('security.session_timeout_minutes', 'security.session_timeout_minutes', '{"value": 60}'::jsonb, 'security', 'Sessie timeout in minuten', false),
  -- Password settings removed - OAuth (Auth0) is used for authentication
  -- ('security.password_min_length', 'security.password_min_length', '{"value": 8}'::jsonb, 'security', 'Minimum wachtwoord lengte', false),
  -- ('security.password_require_special_char', 'security.password_require_special_char', '{"value": true}'::jsonb, 'security', 'Verplicht speciaal karakter in wachtwoord', false),
  -- ('security.password_require_number', 'security.password_require_number', '{"value": true}'::jsonb, 'security', 'Verplicht cijfer in wachtwoord', false),
  -- ('security.max_login_attempts', 'security.max_login_attempts', '{"value": 5}'::jsonb, 'security', 'Maximum aantal login pogingen', false),
  -- ('security.lockout_duration_minutes', 'security.lockout_duration_minutes', '{"value": 15}'::jsonb, 'security', 'Account lockout duur in minuten', false),
  -- 2FA moved to user profile - admins can require it system-wide with security.require_2fa
  ('security.require_2fa', 'security.require_2fa', '{"value": false}'::jsonb, 'security', 'Verplicht 2FA voor alle gebruikers', false),
  ('security.api_rate_limit_per_minute', 'security.api_rate_limit_per_minute', '{"value": 60}'::jsonb, 'security', 'API rate limit per minuut per gebruiker', false),

  -- Audit
  ('audit.enable_logging', 'audit.enable_logging', '{"value": true}'::jsonb, 'audit', 'Schakel audit logging in', false),
  ('audit.log_read_operations', 'audit.log_read_operations', '{"value": false}'::jsonb, 'audit', 'Log ook read operaties (kan veel data genereren)', false),
  ('audit.log_failed_logins', 'audit.log_failed_logins', '{"value": true}'::jsonb, 'audit', 'Log mislukte login pogingen', false),
  ('audit.retention_days', 'audit.retention_days', '{"value": 365}'::jsonb, 'audit', 'Bewaar audit logs voor aantal dagen', false),

  -- Data Retention
  ('retention.tickets_resolved_days', 'retention.tickets_resolved_days', '{"value": 730}'::jsonb, 'retention', 'Bewaar opgeloste tickets voor aantal dagen (2 jaar)', false),
  ('retention.tickets_closed_days', 'retention.tickets_closed_days', '{"value": 1825}'::jsonb, 'retention', 'Bewaar gesloten tickets voor aantal dagen (5 jaar)', false),
  ('retention.attachments_days', 'retention.attachments_days', '{"value": 730}'::jsonb, 'retention', 'Bewaar bijlagen voor aantal dagen', false),
  ('retention.comments_days', 'retention.comments_days', '{"value": 1825}'::jsonb, 'retention', 'Bewaar commentaren voor aantal dagen', false),
  ('retention.auto_cleanup_enabled', 'retention.auto_cleanup_enabled', '{"value": false}'::jsonb, 'retention', 'Automatisch oude data opschonen', false),

  -- Danger Zone
  ('danger.enable_bulk_delete', 'danger.enable_bulk_delete', '{"value": false}'::jsonb, 'danger', 'Sta bulk verwijderen toe (gebruik met voorzichtigheid)', false),
  ('danger.enable_data_export', 'danger.enable_data_export', '{"value": true}'::jsonb, 'danger', 'Sta data export toe', false),
  ('danger.maintenance_mode', 'danger.maintenance_mode', '{"value": false}'::jsonb, 'danger', 'Onderhoudsmodus (portal niet toegankelijk)', false),
  ('danger.maintenance_message', 'danger.maintenance_message', '{"value": "De portal is tijdelijk niet beschikbaar voor onderhoud. Probeer het later opnieuw."}'::jsonb, 'danger', 'Bericht tijdens onderhoudsmodus', false)

ON CONFLICT (setting_key) DO NOTHING;

-- Grant permissions
GRANT SELECT ON system_settings TO anon, authenticated;
GRANT ALL ON system_settings TO service_role;

COMMENT ON TABLE system_settings IS 'System-wide configurable settings that can be modified by administrators';
COMMENT ON COLUMN system_settings.setting_key IS 'Unique identifier for the setting (dot notation like portal.name)';
COMMENT ON COLUMN system_settings.setting_value IS 'JSONB value, typically {value: actual_value} or any JSON structure';
COMMENT ON COLUMN system_settings.category IS 'Category for grouping settings in the UI';
COMMENT ON COLUMN system_settings.is_sensitive IS 'If true, value is masked in UI (passwords, API keys)';
