/**
 * Security Service - Handles CSRF protection, secure storage, and rate limiting
 * Part of security hardening implementation
 */

// ==========================================
// CSRF Protection
// ==========================================

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCSRFToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create CSRF token for current session
 * Stores in sessionStorage (NOT localStorage for security)
 */
export function getCSRFToken() {
  let token = sessionStorage.getItem('csrf_token');

  if (!token) {
    token = generateCSRFToken();
    sessionStorage.setItem('csrf_token', token);
  }

  return token;
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(token) {
  const storedToken = sessionStorage.getItem('csrf_token');
  return token && storedToken && token === storedToken;
}

/**
 * Add CSRF token to request headers
 */
export function addCSRFHeader(headers = {}) {
  return {
    ...headers,
    'X-CSRF-Token': getCSRFToken()
  };
}

/**
 * Clear CSRF token (on logout)
 */
export function clearCSRFToken() {
  sessionStorage.removeItem('csrf_token');
}

// ==========================================
// Rate Limiting (Client-Side)
// ==========================================

const rateLimitStore = new Map();

/**
 * Client-side rate limiting
 * @param {string} key - Unique identifier for the rate limit (e.g., 'login', 'ticket_access')
 * @param {number} maxAttempts - Maximum number of attempts
 * @param {number} windowMs - Time window in milliseconds
 * @returns {boolean} - true if allowed, false if rate limited
 */
export function checkRateLimit(key, maxAttempts = 5, windowMs = 60000) {
  const now = Date.now();
  const limit = rateLimitStore.get(key);

  if (!limit) {
    rateLimitStore.set(key, {
      attempts: 1,
      resetAt: now + windowMs
    });
    return true;
  }

  // Reset if window expired
  if (now > limit.resetAt) {
    rateLimitStore.set(key, {
      attempts: 1,
      resetAt: now + windowMs
    });
    return true;
  }

  // Check if over limit
  if (limit.attempts >= maxAttempts) {
    return false;
  }

  // Increment attempts
  limit.attempts += 1;
  return true;
}

/**
 * Get remaining time for rate limit in seconds
 */
export function getRateLimitReset(key) {
  const limit = rateLimitStore.get(key);
  if (!limit) return 0;

  const remaining = limit.resetAt - Date.now();
  return Math.max(0, Math.ceil(remaining / 1000));
}

/**
 * Clear rate limit for a key
 */
export function clearRateLimit(key) {
  rateLimitStore.delete(key);
}

// ==========================================
// Secure Session Management
// ==========================================

/**
 * Session timeout in milliseconds (30 minutes)
 */
const SESSION_TIMEOUT = 30 * 60 * 1000;

/**
 * Session warning threshold (5 minutes before timeout)
 */
const SESSION_WARNING_THRESHOLD = 5 * 60 * 1000;

/**
 * Check if session is still valid
 */
export function isSessionValid() {
  const sessionStart = sessionStorage.getItem('session_start');
  if (!sessionStart) return false;

  const elapsed = Date.now() - parseInt(sessionStart, 10);
  return elapsed < SESSION_TIMEOUT;
}

/**
 * Get remaining session time in seconds
 */
export function getSessionRemainingTime() {
  const sessionStart = sessionStorage.getItem('session_start');
  if (!sessionStart) return 0;

  const elapsed = Date.now() - parseInt(sessionStart, 10);
  const remaining = SESSION_TIMEOUT - elapsed;
  return Math.max(0, Math.ceil(remaining / 1000));
}

/**
 * Check if session is approaching timeout
 */
export function isSessionWarning() {
  const remaining = getSessionRemainingTime() * 1000;
  return remaining > 0 && remaining <= SESSION_WARNING_THRESHOLD;
}

/**
 * Refresh session timestamp
 */
export function refreshSession() {
  sessionStorage.setItem('session_start', Date.now().toString());
}

/**
 * Clear all session data
 */
export function clearSession() {
  sessionStorage.removeItem('auth_token');
  sessionStorage.removeItem('user_role');
  sessionStorage.removeItem('handler_profile');
  sessionStorage.removeItem('session_start');
  sessionStorage.removeItem('csrf_token');
  sessionStorage.removeItem('current_case');
  sessionStorage.removeItem('prefill_ticket_id');
  sessionStorage.removeItem('prefill_access_code');
}

// ==========================================
// Input Sanitization
// ==========================================

/**
 * Sanitize user input to prevent XSS
 * Basic protection - use with caution
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;

  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate ticket ID format (UUID)
 */
export function isValidTicketId(ticketId) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(ticketId);
}

/**
 * Validate access code format
 */
export function isValidAccessCode(accessCode) {
  // Assuming 6-character alphanumeric codes
  const codeRegex = /^[A-Z0-9]{6}$/;
  return codeRegex.test(accessCode);
}

// ==========================================
// Secure Fetch Wrapper
// ==========================================

/**
 * Secure fetch wrapper that adds CSRF protection and handles errors
 */
export async function secureFetch(url, options = {}) {
  // Add CSRF token for state-changing requests
  if (options.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method.toUpperCase())) {
    options.headers = addCSRFHeader(options.headers);
  }

  // Add request timestamp for replay attack protection
  options.headers = {
    ...options.headers,
    'X-Request-Time': Date.now().toString()
  };

  try {
    const response = await fetch(url, options);

    // Check for rate limiting response
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new Error(`Rate limited. Try again in ${retryAfter || 60} seconds.`);
    }

    return response;
  } catch (error) {
    console.error('Secure fetch error:', error);
    throw error;
  }
}

// ==========================================
// Content Security Policy Helper
// ==========================================

/**
 * Generate CSP nonce for inline scripts
 */
export function generateCSPNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

// ==========================================
// Security Event Logging
// ==========================================

/**
 * Log security-relevant events (client-side only, no PII)
 */
export function logSecurityEvent(eventType, details = {}) {
  const event = {
    type: eventType,
    timestamp: new Date().toISOString(),
    // NO IP, NO USER-AGENT, NO HEADERS - privacy first!
    details: {
      ...details,
      // Only log non-sensitive metadata
      sessionValid: isSessionValid(),
      csrfTokenPresent: !!sessionStorage.getItem('csrf_token')
    }
  };

  // In production, send to secure logging endpoint (not implemented yet)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Security Event]', event);
  }

  // Store last few events in memory only (not persisted)
  if (!window._securityEvents) {
    window._securityEvents = [];
  }
  window._securityEvents.push(event);

  // Keep only last 10 events
  if (window._securityEvents.length > 10) {
    window._securityEvents.shift();
  }
}

// ==========================================
// Initialize Security
// ==========================================

/**
 * Initialize security features
 */
export function initializeSecurity() {
  // Generate CSRF token on load
  getCSRFToken();

  // Refresh session if valid
  if (isSessionValid()) {
    refreshSession();
  }

  // Clear old rate limits periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, limit] of rateLimitStore.entries()) {
      if (now > limit.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 60000); // Every minute

  logSecurityEvent('security_initialized');
}

// Auto-initialize on import
if (typeof window !== 'undefined') {
  initializeSecurity();
}
