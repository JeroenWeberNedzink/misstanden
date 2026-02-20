import { supabase } from '../lib/supabase';
import { normalizeHandlerRecord } from './utils/handlerNormalization';

// Helper function to convert snake_case to camelCase
const toCamelCase = (obj) => {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj?.map(toCamelCase);
  if (typeof obj !== 'object') return obj;

  const camelObj = {};
  Object.keys(obj)?.forEach(key => {
    const camelKey = key?.replace(/_([a-z])/g, (_, letter) => letter?.toUpperCase());
    camelObj[camelKey] = toCamelCase(obj?.[key]);
  });
  return camelObj;
};

// Helper function to convert camelCase to snake_case
const toSnakeCase = (obj) => {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj?.map(toSnakeCase);
  if (typeof obj !== 'object') return obj;

  const snakeObj = {};
  Object.keys(obj)?.forEach(key => {
    const snakeKey = key?.replace(/[A-Z]/g, letter => `_${letter?.toLowerCase()}`);
    snakeObj[snakeKey] = toSnakeCase(obj?.[key]);
  });
  return snakeObj;
};

export const handlerProfileService = {
  // Get handler profile by Auth0 user_id
  async getHandlerByUserId(userId) {
    const { data, error } = await supabase
      ?.from('handlers')
      ?.select('*')
      ?.eq('user_id', userId)
      ?.single();

    if (error) throw error;
    return normalizeHandlerRecord(toCamelCase(data));
  },

  // Get handler availability status
  async getAvailabilityStatus(userId) {
    const { data, error } = await supabase
      ?.from('user_availability')
      ?.select('*')
      ?.eq('user_id', userId)
      ?.single();

    if (error && error?.code !== 'PGRST116') throw error; // Ignore "not found" errors
    return toCamelCase(data);
  },

  // Get notification settings for handler
  async getNotificationSettings(handlerId) {
    const { data, error } = await supabase
      ?.from('handler_notification_settings')
      ?.select('*')
      ?.eq('handler_id', handlerId)
      ?.single();

    if (error && error?.code !== 'PGRST116') throw error;
    return toCamelCase(data);
  },

  // Update handler contact information
  async updateHandlerContact(handlerId, contactData) {
    const snakeData = toSnakeCase(contactData);
    const { data, error } = await supabase
      ?.from('handlers')
      ?.update(snakeData)
      ?.eq('id', handlerId)
      ?.select()
      ?.single();

    if (error) throw error;
    return normalizeHandlerRecord(toCamelCase(data));
  },

  // Update availability status
  async updateAvailabilityStatus(userId, availabilityData) {
    const snakeData = toSnakeCase(availabilityData);
    
    // Check if record exists
    const { data: existing } = await supabase
      ?.from('user_availability')
      ?.select('user_id')
      ?.eq('user_id', userId)
      ?.single();

    let result;
    if (existing) {
      // Update existing record
      const { data, error } = await supabase
        ?.from('user_availability')
        ?.update(snakeData)
        ?.eq('user_id', userId)
        ?.select()
        ?.single();
      
      if (error) throw error;
      result = data;
    } else {
      // Insert new record
      const { data, error } = await supabase
        ?.from('user_availability')
        ?.insert({ user_id: userId, ...snakeData })
        ?.select()
        ?.single();
      
      if (error) throw error;
      result = data;
    }

    return toCamelCase(result);
  },

  // Update notification settings
  async updateNotificationSettings(handlerId, settingsData) {
    const snakeData = toSnakeCase(settingsData);

    // Sanitize TIME fields: convert empty strings to null
    // PostgreSQL TIME fields don't accept empty strings
    if (snakeData.quiet_hours_start === '') {
      snakeData.quiet_hours_start = null;
    }
    if (snakeData.quiet_hours_end === '') {
      snakeData.quiet_hours_end = null;
    }

    // Sanitize other optional string fields
    if (snakeData.emergency_contact_phone === '') {
      snakeData.emergency_contact_phone = null;
    }
    if (snakeData.min_severity_immediate === '') {
      snakeData.min_severity_immediate = null;
    }

    // Check if record exists
    const { data: existing } = await supabase
      ?.from('handler_notification_settings')
      ?.select('id')
      ?.eq('handler_id', handlerId)
      ?.single();

    let result;
    if (existing) {
      // Update existing record
      const { data, error } = await supabase
        ?.from('handler_notification_settings')
        ?.update(snakeData)
        ?.eq('handler_id', handlerId)
        ?.select()
        ?.single();

      if (error) throw error;
      result = data;
    } else {
      // Insert new record
      const { data, error } = await supabase
        ?.from('handler_notification_settings')
        ?.insert({ handler_id: handlerId, ...snakeData })
        ?.select()
        ?.single();

      if (error) throw error;
      result = data;
    }

    return toCamelCase(result);
  }
};
