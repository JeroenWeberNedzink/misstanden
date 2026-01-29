-- Fix Email Event Types Schema
-- Adds missing columns to existing email_event_types table

-- =====================================================
-- 1. Add missing columns if they don't exist
-- =====================================================

-- Add name_en column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_event_types' AND column_name = 'name_en'
  ) THEN
    ALTER TABLE email_event_types ADD COLUMN name_en TEXT;
  END IF;
END $$;

-- Add name_nl column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_event_types' AND column_name = 'name_nl'
  ) THEN
    ALTER TABLE email_event_types ADD COLUMN name_nl TEXT;
  END IF;
END $$;

-- Add description_en column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_event_types' AND column_name = 'description_en'
  ) THEN
    ALTER TABLE email_event_types ADD COLUMN description_en TEXT;
  END IF;
END $$;

-- Add description_nl column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_event_types' AND column_name = 'description_nl'
  ) THEN
    ALTER TABLE email_event_types ADD COLUMN description_nl TEXT;
  END IF;
END $$;

-- Add is_system_critical column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_event_types' AND column_name = 'is_system_critical'
  ) THEN
    ALTER TABLE email_event_types ADD COLUMN is_system_critical BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add enabled_by_default column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_event_types' AND column_name = 'enabled_by_default'
  ) THEN
    ALTER TABLE email_event_types ADD COLUMN enabled_by_default BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

-- =====================================================
-- 2. Update existing rows with translations if needed
-- =====================================================

-- If name_en is empty, copy from name (assuming existing column is named 'name')
UPDATE email_event_types
SET name_en = COALESCE(name_en, name)
WHERE name_en IS NULL AND name IS NOT NULL;

-- If name_nl is empty, copy from name or name_en
UPDATE email_event_types
SET name_nl = COALESCE(name_nl, name, name_en)
WHERE name_nl IS NULL;

-- =====================================================
-- 3. Set NOT NULL constraints after data is populated
-- =====================================================

-- Make name_en NOT NULL if it has values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM email_event_types WHERE name_en IS NULL
  ) THEN
    ALTER TABLE email_event_types ALTER COLUMN name_en SET NOT NULL;
  END IF;
END $$;

-- Make name_nl NOT NULL if it has values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM email_event_types WHERE name_nl IS NULL
  ) THEN
    ALTER TABLE email_event_types ALTER COLUMN name_nl SET NOT NULL;
  END IF;
END $$;

-- =====================================================
-- 4. Recreate the view
-- =====================================================

DROP VIEW IF EXISTS email_settings_overview;

CREATE VIEW email_settings_overview AS
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

-- Grant permissions
GRANT SELECT ON email_settings_overview TO authenticated;
GRANT ALL ON email_settings_overview TO service_role;

RAISE NOTICE 'Email event types schema fixed successfully!';
