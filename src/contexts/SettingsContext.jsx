import React, { createContext, useContext, useEffect, useState } from 'react';
import { settingsService } from '../services/SettingsService';

const SettingsContext = createContext(null);

/**
 * Extract value from JSONB structure
 * Most settings are stored as {value: actualValue}
 * This helper normalizes that
 */
const extractValue = (settingValue) => {
  if (settingValue === null || settingValue === undefined) return null;

  // If it's {value: x}, extract x
  if (typeof settingValue === 'object' && 'value' in settingValue) {
    return settingValue.value;
  }

  // Otherwise return as-is
  return settingValue;
};

/**
 * Settings Provider
 * Loads system settings from database and provides them to the entire app
 */
export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const { byKey } = await settingsService.getSettings();

      // Convert to simple object with extracted values
      const normalized = {};
      Object.keys(byKey).forEach(key => {
        normalized[key] = extractValue(byKey[key].setting_value);
      });

      setSettings(normalized);
      setError(null);
    } catch (err) {
      console.error('[SettingsContext] CRITICAL: Failed to load system settings:', err);
      console.error('[SettingsContext] Using safe defaults - maintenance mode ENABLED for safety');
      setError(err.message);
      // Set SAFE defaults - enable maintenance mode if settings are broken
      const safeDefaults = {
        ...getDefaultSettings(),
        'danger.maintenance_mode': true, // SAFE: Enable maintenance if settings fail
        'danger.maintenance_message': 'Het systeem is tijdelijk niet beschikbaar. Technische storing.'
      };
      setSettings(safeDefaults);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const getSetting = (key, defaultValue = null) => {
    return settings[key] !== undefined ? settings[key] : defaultValue;
  };

  const value = {
    settings,
    isLoading,
    error,
    getSetting,
    reload: loadSettings,

    // Convenience getters for commonly used settings
    portal: {
      name: getSetting('portal.name', 'Misstanden Portal'),
      tagline: getSetting('portal.tagline', 'Meld en los misstanden op'),
      supportEmail: getSetting('portal.support_email', 'support@example.com'),
      supportPhone: getSetting('portal.support_phone', ''),
      timezone: getSetting('portal.timezone', 'Europe/Amsterdam'),
      language: getSetting('portal.language', 'nl'),
      enableRegistration: getSetting('portal.enable_registration', false),
      enablePublicSubmissions: getSetting('portal.enable_public_submissions', true),
      enableAttachments: getSetting('portal.enable_attachments', true),
      maxAttachmentSizeMb: getSetting('portal.max_attachment_size_mb', 10),
      allowedFileTypes: getSetting('portal.allowed_file_types', ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']),
    },

    workflow: {
      autoAssign: getSetting('workflow.auto_assign', true),
      allowStatusRollback: getSetting('workflow.allow_status_rollback', false),
      requireCommentOnStatusChange: getSetting('workflow.require_comment_on_status_change', true),
      notifyOnAssignment: getSetting('workflow.notify_on_assignment', true),
    },

    sla: {
      enable: getSetting('sla.enable', true),
      defaultResponseHours: getSetting('sla.default_response_hours', 24),
      defaultResolutionHours: getSetting('sla.default_resolution_hours', 72),
      warningThresholdPercent: getSetting('sla.warning_threshold_percent', 75),
      countBusinessHoursOnly: getSetting('sla.count_business_hours_only', true),
    },

    notifications: {
      enableEmail: getSetting('notifications.enable_email', true),
      enableInApp: getSetting('notifications.enable_in_app', true),
      batchDigest: getSetting('notifications.batch_digest', false),
      digestTime: getSetting('notifications.digest_time', '09:00'),
    },

    security: {
      sessionTimeoutMinutes: getSetting('security.session_timeout_minutes', 60),
      require2fa: getSetting('security.require_2fa', false),
      apiRateLimitPerMinute: getSetting('security.api_rate_limit_per_minute', 60),
    },

    audit: {
      enableLogging: getSetting('audit.enable_logging', true),
      logReadOperations: getSetting('audit.log_read_operations', false),
      logFailedLogins: getSetting('audit.log_failed_logins', true),
      retentionDays: getSetting('audit.retention_days', 365),
    },

    retention: {
      ticketsResolvedDays: getSetting('retention.tickets_resolved_days', 730),
      ticketsClosedDays: getSetting('retention.tickets_closed_days', 1825),
      attachmentsDays: getSetting('retention.attachments_days', 730),
      commentsDays: getSetting('retention.comments_days', 1825),
      autoCleanupEnabled: getSetting('retention.auto_cleanup_enabled', false),
    },

    danger: {
      enableBulkDelete: getSetting('danger.enable_bulk_delete', false),
      enableDataExport: getSetting('danger.enable_data_export', true),
      maintenanceMode: getSetting('danger.maintenance_mode', false),
      maintenanceMessage: getSetting('danger.maintenance_message', 'De portal is tijdelijk niet beschikbaar voor onderhoud.'),
    },
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

/**
 * Hook to access system settings
 */
export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

/**
 * Default settings fallback
 */
const getDefaultSettings = () => ({
  'portal.name': 'Misstanden Portal',
  'portal.tagline': 'Meld en los misstanden op',
  'portal.support_email': 'support@example.com',
  'portal.support_phone': '',
  'portal.timezone': 'Europe/Amsterdam',
  'portal.language': 'nl',
  'portal.enable_registration': false,
  'portal.enable_public_submissions': true,
  'portal.enable_attachments': true,
  'portal.max_attachment_size_mb': 10,
  'portal.allowed_file_types': ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
  'workflow.auto_assign': true,
  'workflow.allow_status_rollback': false,
  'workflow.require_comment_on_status_change': true,
  'workflow.notify_on_assignment': true,
  'sla.enable': true,
  'sla.default_response_hours': 24,
  'sla.default_resolution_hours': 72,
  'sla.warning_threshold_percent': 75,
  'sla.count_business_hours_only': true,
  'notifications.enable_email': true,
  'notifications.enable_in_app': true,
  'notifications.batch_digest': false,
  'notifications.digest_time': '09:00',
  'security.session_timeout_minutes': 60,
  'security.require_2fa': false,
  'security.api_rate_limit_per_minute': 60,
  'audit.enable_logging': true,
  'audit.log_read_operations': false,
  'audit.log_failed_logins': true,
  'audit.retention_days': 365,
  'retention.tickets_resolved_days': 730,
  'retention.tickets_closed_days': 1825,
  'retention.attachments_days': 730,
  'retention.comments_days': 1825,
  'retention.auto_cleanup_enabled': false,
  'danger.enable_bulk_delete': false,
  'danger.enable_data_export': true,
  'danger.maintenance_mode': false,
  'danger.maintenance_message': 'De portal is tijdelijk niet beschikbaar voor onderhoud.',
});
