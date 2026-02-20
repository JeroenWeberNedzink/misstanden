/**
 * Translation Service
 * Handles all translation management API calls
 */

import { supabase } from '../lib/supabase';

const API_BASE = '/api/translations.api.php';
let tokenProvider = null;

const setTokenProvider = (provider) => {
  tokenProvider = typeof provider === 'function' ? provider : null;
};

const getAuthHeaders = async () => {
  if (!tokenProvider) return {};
  try {
    const token = await tokenProvider();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const fetchWithAuth = async (url, options = {}) => {
  const authHeaders = await getAuthHeaders();
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders,
    },
  });
};

export const translationService = {
  setTokenProvider,

  /**
   * Get all translations for a language (returns flattened object)
   * @param {string} lang - Language code (en, nl, fr, de)
   * @returns {Promise<Object>} Flattened translations object
   */
  async getTranslations(lang = 'en') {
    const res = await fetchWithAuth(`${API_BASE}?action=list&lang=${lang}`);

    if (!res.ok) {
      throw new Error(`Failed to load translations for ${lang}`);
    }

    const data = await res.json();
    return data.data.translations;
  },

  /**
   * Create new translation key in all languages
   * @param {string} keyPath - Dot notation key path (e.g., "common.save")
   * @param {Object} translations - Object with values for each language { en: "Save", nl: "Opslaan", ... }
   * @returns {Promise<Object>} API response
   */
  async createKey(keyPath, translations) {
    const res = await fetchWithAuth(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        keyPath,
        translations
      })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to create translation key');
    }

    return res.json();
  },

  /**
   * Update translation value for a specific language
   * @param {string} keyPath - Dot notation key path
   * @param {string} lang - Language code
   * @param {string} value - New translation value
   * @returns {Promise<Object>} API response
   */
  async updateValue(keyPath, lang, value) {
    const res = await fetchWithAuth(API_BASE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyPath,
        lang,
        value
      })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to update translation');
    }

    return res.json();
  },

  /**
   * Delete translation key from all languages
   * @param {string} keyPath - Dot notation key path
   * @returns {Promise<Object>} API response
   */
  async deleteKey(keyPath) {
    const res = await fetchWithAuth(API_BASE, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyPath })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to delete translation key');
    }

    return res.json();
  },

  /**
   * Export translations as JSON file
   * @param {string} lang - Language code
   * @returns {Promise<Blob>} JSON file blob
   */
  async exportTranslations(lang) {
    const res = await fetchWithAuth(`${API_BASE}?action=export&lang=${lang}`);

    if (!res.ok) {
      throw new Error('Failed to export translations');
    }

    return res.blob();
  },

  /**
   * Import translations from JSON data
   * @param {string} lang - Target language code
   * @param {Object} jsonData - Translation data to import
   * @returns {Promise<Object>} Import results (imported, updated, failed counts)
   */
  async importTranslations(lang, jsonData) {
    const res = await fetchWithAuth(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'import',
        lang,
        data: jsonData
      })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to import translations');
    }

    return res.json();
  },

  /**
   * Detect missing translations across all languages
   * @returns {Promise<Array>} Array of objects with missing translation info
   */
  async detectMissing() {
    const res = await fetchWithAuth(`${API_BASE}?action=detect-missing`);

    if (!res.ok) {
      throw new Error('Failed to detect missing translations');
    }

    const data = await res.json();
    return data.data.missing;
  },

  /**
   * Get audit history for a translation key
   * @param {string} keyPath - Dot notation key path
   * @param {number} limit - Maximum number of records to return
   * @returns {Promise<Array>} Array of audit log entries
   */
  async getHistory(keyPath, limit = 50) {
    const { data, error } = await supabase
      .from('translation_audit_log')
      .select(`
        *,
        changed_by_user:handlers(name, email)
      `)
      .eq('key_path', keyPath)
      .order('changed_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];
  },

  /**
   * Get all audit history with optional filters
   * @param {Object} filters - Optional filters { languageCode, action, userId }
   * @param {number} limit - Maximum number of records
   * @returns {Promise<Array>} Array of audit log entries
   */
  async getAllHistory(filters = {}, limit = 100) {
    let query = supabase
      .from('translation_audit_log')
      .select(`
        *,
        changed_by_user:handlers(name, email)
      `)
      .order('changed_at', { ascending: false })
      .limit(limit);

    if (filters.languageCode) {
      query = query.eq('language_code', filters.languageCode);
    }

    if (filters.action) {
      query = query.eq('action', filters.action);
    }

    if (filters.userId) {
      query = query.eq('changed_by', filters.userId);
    }

    const { data, error} = await query;

    if (error) throw error;

    return data || [];
  },

  /**
   * Bulk copy translations from one language to another
   * @param {string} fromLang - Source language code
   * @param {string} toLang - Target language code
   * @param {Array<string>} keyPaths - Array of key paths to copy (optional, copies all if not provided)
   * @returns {Promise<Object>} Copy results
   */
  async bulkCopyLanguage(fromLang, toLang, keyPaths = null) {
    // Get source translations
    const sourceTranslations = await this.getTranslations(fromLang);

    // Get target translations
    const targetTranslations = await this.getTranslations(toLang);

    let copied = 0;
    let failed = 0;

    const keysToCopy = keyPaths || Object.keys(sourceTranslations);

    for (const key of keysToCopy) {
      if (sourceTranslations[key]) {
        try {
          await this.updateValue(key, toLang, sourceTranslations[key]);
          copied++;
        } catch (err) {
          console.error(`Failed to copy ${key}:`, err);
          failed++;
        }
      }
    }

    return {
      copied,
      failed,
      total: keysToCopy.length
    };
  },

  /**
   * Fill missing translations by copying from source language
   * @param {Array} missingTranslations - Array of missing translation objects from detectMissing()
   * @param {string} sourceLang - Source language to copy from (default: 'en')
   * @param {Function} onProgress - Optional progress callback (current, total)
   * @returns {Promise<Object>} Fill results with breakdown per language
   */
  async fillMissingTranslations(missingTranslations, sourceLang = 'en', onProgress = null) {
    const sourceTranslations = await this.getTranslations(sourceLang);

    const results = {
      en: { copied: 0, failed: 0, skipped: 0 },
      nl: { copied: 0, failed: 0, skipped: 0 },
      fr: { copied: 0, failed: 0, skipped: 0 },
      de: { copied: 0, failed: 0, skipped: 0 }
    };

    let processed = 0;
    const total = missingTranslations.length;

    for (const missing of missingTranslations) {
      const sourceValue = sourceTranslations[missing.key];

      if (!sourceValue) {
        // Source doesn't have this key either, skip
        missing.missingIn.forEach(lang => {
          results[lang].skipped++;
        });
        processed++;
        onProgress?.(processed, total);
        continue;
      }

      // Copy to all missing languages
      for (const targetLang of missing.missingIn) {
        try {
          await this.updateValue(missing.key, targetLang, sourceValue);
          results[targetLang].copied++;
        } catch (err) {
          console.error(`Failed to copy ${missing.key} to ${targetLang}:`, err);
          results[targetLang].failed++;
        }
      }

      processed++;
      onProgress?.(processed, total);
    }

    return results;
  },

  /**
   * Bulk delete multiple translation keys
   * @param {Array<string>} keyPaths - Array of key paths to delete
   * @returns {Promise<Object>} Delete results
   */
  async bulkDelete(keyPaths) {
    let deleted = 0;
    let failed = 0;

    for (const keyPath of keyPaths) {
      try {
        await this.deleteKey(keyPath);
        deleted++;
      } catch (err) {
        console.error(`Failed to delete ${keyPath}:`, err);
        failed++;
      }
    }

    return {
      deleted,
      failed,
      total: keyPaths.length
    };
  }
};
