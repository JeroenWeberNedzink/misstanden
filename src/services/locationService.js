// services/locationService.js
import { getSharedTokenProvider } from '../lib/serviceTokenProvider';

const WORKFLOW_API_URL = '/api/workflows.api.php';
const CATALOG_API_URL = '/api/catalog.api.php';
let locationTokenProvider = null;

const setTokenProvider = (provider) => {
  locationTokenProvider = typeof provider === 'function' ? provider : null;
};

const getAuthHeaders = async () => {
  const provider = locationTokenProvider || getSharedTokenProvider();
  if (!provider) return {};
  try {
    const token = await provider();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const getAuthHeadersWithRetry = async (requireAdmin = false) => {
  let headers = await getAuthHeaders();
  if (requireAdmin && !headers.Authorization) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    headers = await getAuthHeaders();
  }
  return headers;
};

const getAdminAuthHeadersOrNull = async () => {
  const authHeaders = await getAuthHeadersWithRetry(true);
  return authHeaders.Authorization ? authHeaders : null;
};

const hasTokenProvider = () => Boolean(locationTokenProvider || getSharedTokenProvider());

const apiGet = async (action, params = {}, { requireAdmin = true, authHeaders = null } = {}) => {
  const headers = authHeaders || await getAuthHeadersWithRetry(requireAdmin);
  if (requireAdmin && !headers.Authorization) {
    throw new Error('Authorization token required');
  }

  const query = new URLSearchParams({ action, ...params }).toString();
  const response = await fetch(`${WORKFLOW_API_URL}?${query}`, {
    method: 'GET',
    headers,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Workflows API error (${response.status})`);
  }
  return json?.data;
};

const apiPost = async (action, payload = {}, { requireAdmin = true, authHeaders = null } = {}) => {
  const headers = authHeaders || await getAuthHeadersWithRetry(requireAdmin);
  if (requireAdmin && !headers.Authorization) {
    throw new Error('Authorization token required');
  }

  const response = await fetch(WORKFLOW_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Workflows API error (${response.status})`);
  }
  return json?.data;
};

const catalogGet = async (action, params = {}) => {
  const query = new URLSearchParams({ action, ...params }).toString();
  const response = await fetch(`${CATALOG_API_URL}?${query}`, {
    method: 'GET',
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Catalog API error (${response.status})`);
  }
  return json?.data;
};

export const locationService = {
  setTokenProvider,

  /**
   * Get all locations (optionally filter by active status)
   * Returns: Array of location objects
   */
  async getLocations({ activeOnly = true } = {}) {
    const adminAuthHeaders = hasTokenProvider() ? await getAdminAuthHeadersOrNull() : null;
    if (adminAuthHeaders) {
      try {
        const data = await apiGet(
          'locations_list',
          { include_inactive: activeOnly ? '0' : '1' },
          { requireAdmin: true, authHeaders: adminAuthHeaders }
        );
        return Array.isArray(data?.rows) ? data.rows : [];
      } catch (apiError) {
        if (!activeOnly) {
          throw apiError;
        }
        console.warn('[locationService] Admin locations API failed, using public catalog API', apiError);
      }
    }

    const data = await catalogGet('locations', { include_inactive: activeOnly ? '0' : '1' });
    return Array.isArray(data?.rows) ? data.rows : [];
  },

  /**
   * Get a single location by ID
   */
  async getLocationById(id) {
    const adminAuthHeaders = hasTokenProvider() ? await getAdminAuthHeadersOrNull() : null;
    if (adminAuthHeaders) {
      const data = await apiGet('location_by_id', { id }, { requireAdmin: true, authHeaders: adminAuthHeaders });
      return data?.row || null;
    }

    try {
      const data = await catalogGet('location_by_id', { id });
      return data?.row || null;
    } catch (error) {
      if (String(error?.message || '').toLowerCase().includes('not found')) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get a location by country code
   */
  async getLocationByCode(countryCode) {
    const adminAuthHeaders = hasTokenProvider() ? await getAdminAuthHeadersOrNull() : null;
    if (adminAuthHeaders) {
      const data = await apiGet(
        'location_by_code',
        { country_code: String(countryCode || '').toUpperCase() },
        { requireAdmin: true, authHeaders: adminAuthHeaders }
      );
      return data?.row || null;
    }

    try {
      const data = await catalogGet('location_by_code', {
        country_code: String(countryCode || '').toUpperCase(),
      });
      return data?.row || null;
    } catch (error) {
      if (String(error?.message || '').toLowerCase().includes('not found')) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Create a new location
   */
  async createLocation({ countryCode, countryName, displayOrder = 0, active = true, createdBy = null }) {
    if (!countryCode) throw new Error('Country code is required');
    if (!countryName) throw new Error('Country name is required');

    const payload = {
      country_code: countryCode.toUpperCase(),
      country_name: countryName,
      display_order: displayOrder,
      active,
      created_by: createdBy,
    };

    const data = await apiPost('location_create', { payload }, { requireAdmin: true });
    return data?.row || data;
  },

  /**
   * Update an existing location
   */
  async updateLocation(id, { countryCode, countryName, displayOrder, active, updatedBy = null }) {
    if (!id) throw new Error('Location ID is required');

    const payload = {};
    if (countryCode !== undefined) payload.country_code = countryCode.toUpperCase();
    if (countryName !== undefined) payload.country_name = countryName;
    if (displayOrder !== undefined) payload.display_order = displayOrder;
    if (active !== undefined) payload.active = active;
    if (updatedBy !== undefined) payload.updated_by = updatedBy;

    const data = await apiPost('location_update', { id, patch: payload }, { requireAdmin: true });
    return data?.row || data;
  },

  /**
   * Delete a location
   */
  async deleteLocation(id) {
    if (!id) throw new Error('Location ID is required');

    await apiPost('location_delete', { id }, { requireAdmin: true });
    return true;
  },

  /**
   * Toggle location active status
   */
  async toggleActive(id) {
    if (!id) throw new Error('Location ID is required');

    const data = await apiPost('location_toggle_active', { id }, { requireAdmin: true });
    return data?.row || data;
  },

  /**
   * Reorder locations
   */
  async reorderLocations(locationOrders) {
    const items = Array.isArray(locationOrders) ? locationOrders : [];

    await apiPost('locations_reorder', { items }, { requireAdmin: true });
    return true;
  },
};
