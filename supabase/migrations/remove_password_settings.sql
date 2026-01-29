-- =====================================================
-- Remove Password-Related Settings (OAuth Login Only)
-- Run this in Supabase SQL Editor
-- =====================================================

-- Since the application uses OAuth (Auth0) for authentication,
-- password-related settings are not applicable and should be removed.

DELETE FROM system_settings
WHERE setting_key IN (
  'security.password_min_length',
  'security.password_require_special_char',
  'security.password_require_number',
  'security.max_login_attempts',
  'security.lockout_duration_minutes'
);

-- Also remove the old enable_2fa setting from system settings
-- (2FA is now user-specific in handler profiles, not a system-wide toggle)
DELETE FROM system_settings
WHERE setting_key = 'security.enable_2fa';

-- Add new require_2fa setting for admins to enforce 2FA for all users
INSERT INTO system_settings (id, setting_key, setting_value, category, description, is_sensitive)
VALUES (
  'security.require_2fa',
  'security.require_2fa',
  '{"value": false}'::jsonb,
  'security',
  'Require all users to enable 2FA for account access',
  false
)
ON CONFLICT (setting_key) DO NOTHING;

-- Log the changes
DO $$
BEGIN
  RAISE NOTICE 'Password-related settings removed successfully.';
  RAISE NOTICE 'Added new security.require_2fa setting for admin control.';
END $$;
