// services/settingsService.js
import { supabase } from '../lib/supabase';

const throwIfError = (error, context = '') => {
  if (!error) return;
  const msg = context ? `${context}: ${error.message || error}` : (error.message || String(error));
  const e = new Error(msg);
  e.original = error;
  throw e;
};

export const settingsService = {
  /**
   * Load all settings (or optionally by category).
   * Returns: { byKey, byCategory, rows }
   */
  async getSettings({ category = null } = {}) {
    let q = supabase
      .from('system_settings')
      .select('id, setting_key, setting_value, category, description, is_sensitive, updated_by, updated_at')
      .order('category', { ascending: true })
      .order('setting_key', { ascending: true });

    if (category) q = q.eq('category', category);

    const { data, error } = await q;
    throwIfError(error, 'getSettings');

    const rows = data || [];

    const byKey = {};
    const byCategory = {};

    for (const r of rows) {
      byKey[r.setting_key] = r;
      if (!byCategory[r.category]) byCategory[r.category] = [];
      byCategory[r.category].push(r);
    }

    return { rows, byKey, byCategory };
  },

  /**
   * Upsert one setting row by setting_key (unique).
   * updatedBy: your handler id/email/name.
   */
  async upsertSetting({ settingKey, value, category, description = null, isSensitive = false, updatedBy = null }) {
    if (!settingKey) throw new Error('settingKey is required');
    if (!category) throw new Error('category is required');

    const payload = {
      id: settingKey, // keep it deterministic/easy (id is PK)
      setting_key: settingKey,
      setting_value: value ?? {},
      category,
      description,
      is_sensitive: !!isSensitive,
      updated_by: updatedBy || null,
    };

    const { data, error } = await supabase
      .from('system_settings')
      .upsert(payload, { onConflict: 'setting_key' })
      .select()
      .single();

    throwIfError(error, 'upsertSetting');
    return data;
  },

  /**
   * Batch upsert (recommended for saving a whole page).
   * items: [{ settingKey, value, category, description, isSensitive }]
   */
  async upsertSettings(items = [], { updatedBy = null } = {}) {
    const payload = (items || [])
      .filter(Boolean)
      .map((it) => ({
        id: it.settingKey,
        setting_key: it.settingKey,
        setting_value: it.value ?? {},
        category: it.category,
        description: it.description ?? null,
        is_sensitive: !!it.isSensitive,
        updated_by: updatedBy || null,
      }));
    if (!payload.length) return [];

    const { data, error } = await supabase
      .from('system_settings')
      .upsert(payload, { onConflict: 'setting_key' })
      .select();

    throwIfError(error, 'upsertSettings');
    return data || [];
  },
};