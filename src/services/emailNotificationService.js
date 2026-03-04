import { supabase } from '../lib/supabase';

const DEFAULT_EMAIL_EVENT_TYPES = [
  // Ticket
  {
    code: 'TICKET_CREATED',
    category: 'ticket',
    nameEn: 'Ticket Created',
    nameNl: 'Ticket Aangemaakt',
    descriptionEn: 'Send when a new ticket is created',
    descriptionNl: 'Versturen wanneer een nieuw ticket wordt aangemaakt',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'TICKET_ASSIGNED',
    category: 'ticket',
    nameEn: 'Ticket Assigned',
    nameNl: 'Ticket Toegewezen',
    descriptionEn: 'Send when a ticket is assigned to a handler',
    descriptionNl: 'Versturen wanneer een ticket wordt toegewezen aan een behandelaar',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'TICKET_STATUS_CHANGED',
    category: 'ticket',
    nameEn: 'Status Changed',
    nameNl: 'Status Gewijzigd',
    descriptionEn: 'Send when ticket status changes',
    descriptionNl: 'Versturen wanneer de ticket status wijzigt',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'TICKET_COMMENT_ADDED',
    category: 'ticket',
    nameEn: 'Comment Added',
    nameNl: 'Reactie Toegevoegd',
    descriptionEn: 'Send when a comment is added to a ticket',
    descriptionNl: 'Versturen wanneer een reactie wordt toegevoegd aan een ticket',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'TICKET_RESOLVED',
    category: 'ticket',
    nameEn: 'Ticket Resolved',
    nameNl: 'Ticket Opgelost',
    descriptionEn: 'Send when a ticket is marked as resolved',
    descriptionNl: 'Versturen wanneer een ticket als opgelost wordt gemarkeerd',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'TICKET_CLOSED',
    category: 'ticket',
    nameEn: 'Ticket Closed',
    nameNl: 'Ticket Gesloten',
    descriptionEn: 'Send when a ticket is closed',
    descriptionNl: 'Versturen wanneer een ticket wordt gesloten',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'TICKET_REOPENED',
    category: 'ticket',
    nameEn: 'Ticket Reopened',
    nameNl: 'Ticket Heropend',
    descriptionEn: 'Send when a resolved/closed ticket is reopened',
    descriptionNl: 'Versturen wanneer een opgelost/gesloten ticket wordt heropend',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  // Handler
  {
    code: 'HANDLER_ASSIGNED',
    category: 'handler',
    nameEn: 'Assigned to You',
    nameNl: 'Aan Jou Toegewezen',
    descriptionEn: 'Send when a ticket is assigned to you',
    descriptionNl: 'Versturen wanneer een ticket aan jou wordt toegewezen',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'HANDLER_MENTIONED',
    category: 'handler',
    nameEn: 'Mentioned in Comment',
    nameNl: 'Vermeld in Reactie',
    descriptionEn: 'Send when you are mentioned in a comment',
    descriptionNl: 'Versturen wanneer je wordt vermeld in een reactie',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'HANDLER_DAILY_DIGEST',
    category: 'handler',
    nameEn: 'Daily Digest',
    nameNl: 'Dagelijkse Samenvatting',
    descriptionEn: 'Daily summary of pending tickets',
    descriptionNl: 'Dagelijkse samenvatting van openstaande tickets',
    isSystemCritical: false,
    enabledByDefault: false,
  },
  // SLA
  {
    code: 'SLA_WARNING',
    category: 'sla',
    nameEn: 'SLA Warning',
    nameNl: 'SLA Waarschuwing',
    descriptionEn: 'Send when SLA deadline is approaching',
    descriptionNl: 'Versturen wanneer SLA deadline nadert',
    isSystemCritical: true,
    enabledByDefault: true,
  },
  {
    code: 'SLA_BREACH',
    category: 'sla',
    nameEn: 'SLA Breach',
    nameNl: 'SLA Schending',
    descriptionEn: 'Send when SLA deadline is exceeded',
    descriptionNl: 'Versturen wanneer SLA deadline wordt overschreden',
    isSystemCritical: true,
    enabledByDefault: true,
  },
  // System
  {
    code: 'SYSTEM_ERROR',
    category: 'system',
    nameEn: 'System Error',
    nameNl: 'Systeemfout',
    descriptionEn: 'Send when a critical system error occurs',
    descriptionNl: 'Versturen bij een kritieke systeemfout',
    isSystemCritical: true,
    enabledByDefault: true,
  },
  {
    code: 'SYSTEM_MAINTENANCE',
    category: 'system',
    nameEn: 'Maintenance Notice',
    nameNl: 'Onderhoudsbericht',
    descriptionEn: 'Send maintenance notifications',
    descriptionNl: 'Versturen van onderhoudsberichten',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'SYSTEM_UPDATE',
    category: 'system',
    nameEn: 'System Update',
    nameNl: 'Systeem Update',
    descriptionEn: 'Send notifications about system updates',
    descriptionNl: 'Versturen van berichten over systeem updates',
    isSystemCritical: false,
    enabledByDefault: false,
  },
];

// Helper function to convert snake_case to camelCase
const toCamelCase = (obj) => {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;

  const camelObj = {};
  Object.keys(obj).forEach(key => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    camelObj[camelKey] = toCamelCase(obj[key]);
  });
  return camelObj;
};

// Helper function to convert camelCase to snake_case
const toSnakeCase = (obj) => {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== 'object') return obj;

  const snakeObj = {};
  Object.keys(obj).forEach(key => {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    snakeObj[snakeKey] = toSnakeCase(obj[key]);
  });
  return snakeObj;
};

export const emailNotificationService = {
  async getEmailEventTypesWithMeta() {
    const { data, error } = await supabase
      .from('email_event_types')
      .select('*')
      .order('category, code');

    if (error) {
      // If the table doesn't exist, throw error (don't fail silently)
      if (error.code === 'PGRST205' || error.code === '42P01') {
        const msg = 'Email notification tables not set up. Please run SETUP_EMAIL_NOTIFICATIONS.sql';
        console.error('[EmailNotificationService]', msg);
        throw new Error(msg + ' (table: email_event_types)');
      }
      throw error;
    }

    const rows = toCamelCase(data || []);
    if (rows.length > 0) {
      return { rows, fallbackActive: false };
    }

    // Fallback for environments where seed data is missing or hidden by policy.
    // Keeps handler-profile UI usable and avoids empty preference screens.
    return { rows: DEFAULT_EMAIL_EVENT_TYPES, fallbackActive: true };
  },

  /**
   * Get all email event types
   */
  async getEmailEventTypes() {
    const result = await this.getEmailEventTypesWithMeta();
    return result.rows || [];
  },

  /**
   * Get email event types grouped by category
   */
  async getEmailEventTypesByCategory() {
    const types = await this.getEmailEventTypes();
    const grouped = {};

    types.forEach(type => {
      if (!grouped[type.category]) {
        grouped[type.category] = [];
      }
      grouped[type.category].push(type);
    });

    return grouped;
  },

  /**
   * Get admin email settings
   */
  async getAdminEmailSettings() {
    const { data, error } = await supabase
      .from('email_settings_overview')
      .select('*')
      .order('category, code');

    if (error) {
      // If the view doesn't exist, throw error (don't fail silently)
      if (error.code === 'PGRST205' || error.code === '42P01') {
        const msg = 'Email notification tables not set up. Please run SETUP_EMAIL_NOTIFICATIONS.sql in your Supabase SQL Editor.';
        console.error('[EmailNotificationService]', msg);
        console.error('[EmailNotificationService] File location: /SETUP_EMAIL_NOTIFICATIONS.sql');
        throw new Error(msg + ' (view: email_settings_overview)');
      }
      throw error;
    }
    return toCamelCase(data || []);
  },

  /**
   * Update admin email settings for a specific event type
   */
  async updateAdminEmailSetting(eventTypeCode, settings) {
    const snakeData = toSnakeCase(settings);

    const { data, error } = await supabase
      .from('email_admin_settings')
      .upsert({
        event_type_code: eventTypeCode,
        ...snakeData
      }, {
        onConflict: 'event_type_code'
      })
      .select()
      .single();

    if (error) throw error;
    return toCamelCase(data);
  },

  /**
   * Get handler email preferences
   */
  async getHandlerEmailPreferences(handlerId) {
    const { data, error } = await supabase
      .from('handler_email_preferences')
      .select('*')
      .eq('handler_id', handlerId)
      .order('created_at');

    if (error && error.code !== 'PGRST116') throw error;
    return toCamelCase(data) || [];
  },

  /**
   * Get handler email preferences grouped by category
   */
  async getHandlerEmailPreferencesByCategory(handlerId, options = {}) {
    const withMeta = Boolean(options?.withMeta);
    const [preferences, eventTypes] = await Promise.all([
      this.getHandlerEmailPreferences(handlerId),
      this.getEmailEventTypesWithMeta(),
    ]);

    const typeRows = Array.isArray(eventTypes?.rows) ? eventTypes.rows : [];
    const grouped = {};

    typeRows.forEach(type => {
      if (!grouped[type.category]) {
        grouped[type.category] = [];
      }

      const handlerPref = preferences.find(p => p.eventTypeCode === type.code);

      grouped[type.category].push({
        ...type,
        isEnabled: handlerPref ? handlerPref.isEnabled : type.enabledByDefault,
        hasHandlerPreference: !!handlerPref
      });
    });

    if (withMeta) {
      return {
        preferencesByCategory: grouped,
        meta: {
          fallbackActive: Boolean(eventTypes?.fallbackActive),
        },
      };
    }

    return grouped;
  },

  /**
   * Update handler email preference for a specific event type
   */
  async updateHandlerEmailPreference(handlerId, eventTypeCode, isEnabled) {
    const { data, error } = await supabase
      .from('handler_email_preferences')
      .upsert({
        handler_id: handlerId,
        event_type_code: eventTypeCode,
        is_enabled: isEnabled
      }, {
        onConflict: 'handler_id,event_type_code'
      })
      .select()
      .single();

    if (error) throw error;
    return toCamelCase(data);
  },

  /**
   * Bulk update handler email preferences
   */
  async updateHandlerEmailPreferences(handlerId, preferences) {
    const updates = Object.entries(preferences).map(([eventTypeCode, isEnabled]) => ({
      handler_id: handlerId,
      event_type_code: eventTypeCode,
      is_enabled: isEnabled
    }));

    const { data, error } = await supabase
      .from('handler_email_preferences')
      .upsert(updates, {
        onConflict: 'handler_id,event_type_code'
      })
      .select();

    if (error) throw error;
    return toCamelCase(data);
  },

  /**
   * Check if an email should be sent based on admin and handler settings
   */
  async shouldSendEmail(eventTypeCode, handlerId, recipientType = 'handler') {
    const { data, error } = await supabase
      .rpc('should_send_email', {
        p_event_type_code: eventTypeCode,
        p_handler_id: handlerId,
        p_recipient_type: recipientType
      });

    if (error) throw error;
    return data;
  },

  /**
   * Reset handler preferences to defaults
   */
  async resetHandlerEmailPreferences(handlerId) {
    const { error } = await supabase
      .from('handler_email_preferences')
      .delete()
      .eq('handler_id', handlerId);

    if (error) throw error;
    return true;
  }
};

export default emailNotificationService;
