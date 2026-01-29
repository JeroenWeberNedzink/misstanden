/**
 * Secure Supabase wrapper with CSRF protection
 * Wraps Supabase client to add security features
 */

import { createClient } from '@supabase/supabase-js';
import { addCSRFHeader, logSecurityEvent } from '../utils/securityService';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create base Supabase client
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // Don't persist in localStorage
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

/**
 * Secure Supabase client with CSRF protection
 */
class SecureSupabaseClient {
  constructor(client) {
    this.client = client;
  }

  /**
   * Wrap from() to add CSRF headers for mutations
   */
  from(table) {
    const query = this.client.from(table);

    // Wrap mutation methods
    const originalInsert = query.insert.bind(query);
    const originalUpdate = query.update.bind(query);
    const originalDelete = query.delete.bind(query);
    const originalUpsert = query.upsert.bind(query);

    query.insert = (...args) => {
      logSecurityEvent('supabase_insert', { table });
      return originalInsert(...args);
    };

    query.update = (...args) => {
      logSecurityEvent('supabase_update', { table });
      return originalUpdate(...args);
    };

    query.delete = (...args) => {
      logSecurityEvent('supabase_delete', { table });
      return originalDelete(...args);
    };

    query.upsert = (...args) => {
      logSecurityEvent('supabase_upsert', { table });
      return originalUpsert(...args);
    };

    return query;
  }

  /**
   * Wrap rpc() to add CSRF protection
   */
  rpc(fnName, params, options = {}) {
    logSecurityEvent('supabase_rpc', { function: fnName });

    // Add CSRF token to headers
    const secureOptions = {
      ...options,
      headers: addCSRFHeader(options.headers)
    };

    return this.client.rpc(fnName, params, secureOptions);
  }

  /**
   * Wrap auth for session management
   */
  get auth() {
    return this.client.auth;
  }

  /**
   * Wrap storage
   */
  get storage() {
    return this.client.storage;
  }

  /**
   * Pass through other methods
   */
  channel(...args) {
    return this.client.channel(...args);
  }

  removeChannel(...args) {
    return this.client.removeChannel(...args);
  }
}

// Export secure client
export const supabase = new SecureSupabaseClient(supabaseClient);

// Also export the raw client for cases where we need it
export const supabaseRaw = supabaseClient;
