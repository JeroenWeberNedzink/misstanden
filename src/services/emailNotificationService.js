import { supabase } from '../lib/supabase';

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
  /**
   * Get all email event types
   */
  async getEmailEventTypes() {
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
    return toCamelCase(data || []);
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
  async getHandlerEmailPreferencesByCategory(handlerId) {
    const preferences = await this.getHandlerEmailPreferences(handlerId);
    const eventTypes = await this.getEmailEventTypes();

    const grouped = {};

    eventTypes.forEach(type => {
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
