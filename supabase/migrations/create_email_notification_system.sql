-- Email Notification System
-- Manages email notification preferences for different event types

-- =====================================================
-- 1. Email Event Types Table
-- =====================================================
CREATE TABLE IF NOT EXISTS email_event_types (
  code TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('ticket', 'handler', 'sla', 'system')),
  name_en TEXT NOT NULL,
  name_nl TEXT NOT NULL,
  description_en TEXT,
  description_nl TEXT,
  is_system_critical BOOLEAN DEFAULT FALSE,
  enabled_by_default BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. Admin Email Settings Table
-- =====================================================
CREATE TABLE IF NOT EXISTS email_admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_code TEXT NOT NULL REFERENCES email_event_types(code) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT TRUE,
  send_to_reporters BOOLEAN DEFAULT TRUE,
  send_to_handlers BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES handlers(id) ON DELETE SET NULL,
  UNIQUE(event_type_code)
);

-- =====================================================
-- 3. Handler Email Preferences Table
-- =====================================================
CREATE TABLE IF NOT EXISTS handler_email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handler_id UUID NOT NULL REFERENCES handlers(id) ON DELETE CASCADE,
  event_type_code TEXT NOT NULL REFERENCES email_event_types(code) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(handler_id, event_type_code)
);

-- =====================================================
-- 4. Email Settings Overview View
-- =====================================================
CREATE OR REPLACE VIEW email_settings_overview AS
SELECT
  et.code,
  et.category,
  et.name_en,
  et.name_nl,
  et.description_en,
  et.description_nl,
  et.is_system_critical,
  et.enabled_by_default,
  COALESCE(eas.is_enabled, et.enabled_by_default) AS is_enabled,
  COALESCE(eas.send_to_reporters, true) AS send_to_reporters,
  COALESCE(eas.send_to_handlers, true) AS send_to_handlers,
  eas.updated_at,
  eas.updated_by
FROM email_event_types et
LEFT JOIN email_admin_settings eas ON et.code = eas.event_type_code
ORDER BY et.category, et.code;

-- =====================================================
-- 5. Helper Function: Should Send Email
-- =====================================================
CREATE OR REPLACE FUNCTION should_send_email(
  p_event_type_code TEXT,
  p_handler_id UUID,
  p_recipient_type TEXT -- 'handler' or 'reporter'
) RETURNS BOOLEAN AS $$
DECLARE
  v_admin_enabled BOOLEAN;
  v_handler_enabled BOOLEAN;
  v_send_to_type BOOLEAN;
  v_is_system_critical BOOLEAN;
BEGIN
  -- Get admin settings and event type info
  SELECT
    COALESCE(eas.is_enabled, et.enabled_by_default),
    CASE WHEN p_recipient_type = 'reporter' THEN COALESCE(eas.send_to_reporters, true)
         ELSE COALESCE(eas.send_to_handlers, true)
    END,
    et.is_system_critical
  INTO v_admin_enabled, v_send_to_type, v_is_system_critical
  FROM email_event_types et
  LEFT JOIN email_admin_settings eas ON et.code = eas.event_type_code
  WHERE et.code = p_event_type_code;

  -- If event type doesn't exist, don't send
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- System critical emails always send
  IF v_is_system_critical THEN
    RETURN TRUE;
  END IF;

  -- Check admin-level setting
  IF NOT v_admin_enabled OR NOT v_send_to_type THEN
    RETURN FALSE;
  END IF;

  -- For handlers, check handler-specific preference
  IF p_recipient_type = 'handler' AND p_handler_id IS NOT NULL THEN
    SELECT COALESCE(hep.is_enabled, et.enabled_by_default)
    INTO v_handler_enabled
    FROM email_event_types et
    LEFT JOIN handler_email_preferences hep
      ON et.code = hep.event_type_code
      AND hep.handler_id = p_handler_id
    WHERE et.code = p_event_type_code;

    RETURN COALESCE(v_handler_enabled, TRUE);
  END IF;

  -- For reporters, just use admin setting
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. Indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_email_admin_settings_event_type
  ON email_admin_settings(event_type_code);

CREATE INDEX IF NOT EXISTS idx_handler_email_prefs_handler
  ON handler_email_preferences(handler_id);

CREATE INDEX IF NOT EXISTS idx_handler_email_prefs_event_type
  ON handler_email_preferences(event_type_code);

-- =====================================================
-- 7. Triggers
-- =====================================================
CREATE OR REPLACE FUNCTION update_email_admin_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_email_admin_settings_updated_at
  BEFORE UPDATE ON email_admin_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_email_admin_settings_timestamp();

CREATE TRIGGER trigger_handler_email_prefs_updated_at
  BEFORE UPDATE ON handler_email_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_email_admin_settings_timestamp();

-- =====================================================
-- 8. Insert Default Email Event Types
-- =====================================================
INSERT INTO email_event_types (code, category, name_en, name_nl, description_en, description_nl, is_system_critical, enabled_by_default) VALUES
  -- Ticket Events
  ('TICKET_CREATED', 'ticket', 'Ticket Created', 'Ticket Aangemaakt', 'Send when a new ticket is created', 'Versturen wanneer een nieuw ticket wordt aangemaakt', false, true),
  ('TICKET_ASSIGNED', 'ticket', 'Ticket Assigned', 'Ticket Toegewezen', 'Send when a ticket is assigned to a handler', 'Versturen wanneer een ticket wordt toegewezen aan een behandelaar', false, true),
  ('TICKET_STATUS_CHANGED', 'ticket', 'Status Changed', 'Status Gewijzigd', 'Send when ticket status changes', 'Versturen wanneer de ticket status wijzigt', false, true),
  ('TICKET_COMMENT_ADDED', 'ticket', 'Comment Added', 'Reactie Toegevoegd', 'Send when a comment is added to a ticket', 'Versturen wanneer een reactie wordt toegevoegd aan een ticket', false, true),
  ('TICKET_RESOLVED', 'ticket', 'Ticket Resolved', 'Ticket Opgelost', 'Send when a ticket is marked as resolved', 'Versturen wanneer een ticket als opgelost wordt gemarkeerd', false, true),
  ('TICKET_CLOSED', 'ticket', 'Ticket Closed', 'Ticket Gesloten', 'Send when a ticket is closed', 'Versturen wanneer een ticket wordt gesloten', false, true),
  ('TICKET_REOPENED', 'ticket', 'Ticket Reopened', 'Ticket Heropend', 'Send when a resolved/closed ticket is reopened', 'Versturen wanneer een opgelost/gesloten ticket wordt heropend', false, true),

  -- Handler Events
  ('HANDLER_ASSIGNED', 'handler', 'Assigned to You', 'Aan Jou Toegewezen', 'Send when a ticket is assigned to you', 'Versturen wanneer een ticket aan jou wordt toegewezen', false, true),
  ('HANDLER_MENTIONED', 'handler', 'Mentioned in Comment', 'Vermeld in Reactie', 'Send when you are mentioned in a comment', 'Versturen wanneer je wordt vermeld in een reactie', false, true),
  ('HANDLER_DAILY_DIGEST', 'handler', 'Daily Digest', 'Dagelijkse Samenvatting', 'Daily summary of pending tickets', 'Dagelijkse samenvatting van openstaande tickets', false, false),

  -- SLA Events
  ('SLA_WARNING', 'sla', 'SLA Warning', 'SLA Waarschuwing', 'Send when SLA deadline is approaching', 'Versturen wanneer SLA deadline nadert', true, true),
  ('SLA_BREACH', 'sla', 'SLA Breach', 'SLA Schending', 'Send when SLA deadline is exceeded', 'Versturen wanneer SLA deadline wordt overschreden', true, true),

  -- System Events
  ('SYSTEM_ERROR', 'system', 'System Error', 'Systeemfout', 'Send when a critical system error occurs', 'Versturen bij een kritieke systeemfout', true, true),
  ('SYSTEM_MAINTENANCE', 'system', 'Maintenance Notice', 'Onderhoudsbericht', 'Send maintenance notifications', 'Versturen van onderhoudsberichten', false, true),
  ('SYSTEM_UPDATE', 'system', 'System Update', 'Systeem Update', 'Send notifications about system updates', 'Versturen van berichten over systeem updates', false, false)

ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 9. Permissions
-- =====================================================
GRANT SELECT ON email_event_types TO authenticated;
GRANT SELECT ON email_settings_overview TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_admin_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON handler_email_preferences TO authenticated;

GRANT ALL ON email_event_types TO service_role;
GRANT ALL ON email_admin_settings TO service_role;
GRANT ALL ON handler_email_preferences TO service_role;

-- =====================================================
-- 10. Comments
-- =====================================================
COMMENT ON TABLE email_event_types IS 'Defines all types of email notifications that can be sent';
COMMENT ON TABLE email_admin_settings IS 'Admin-level settings for email notifications (overrides defaults)';
COMMENT ON TABLE handler_email_preferences IS 'Individual handler preferences for email notifications';
COMMENT ON VIEW email_settings_overview IS 'Unified view of email settings combining event types and admin settings';
COMMENT ON FUNCTION should_send_email IS 'Determines if an email should be sent based on admin and handler preferences';
