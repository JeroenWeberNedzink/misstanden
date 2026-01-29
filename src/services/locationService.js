// services/locationService.js
import { supabase } from '../lib/supabase';

const throwIfError = (error, context = '') => {
  if (!error) return;
  const msg = context ? `${context}: ${error.message || error}` : (error.message || String(error));
  const e = new Error(msg);
  e.original = error;
  throw e;
};

export const locationService = {
  /**
   * Get all locations (optionally filter by active status)
   * Returns: Array of location objects
   */
  async getLocations({ activeOnly = true } = {}) {
    let query = supabase
      .from('locations')
      .select('*')
      .order('display_order', { ascending: true })
      .order('country_name', { ascending: true });

    if (activeOnly) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;
    throwIfError(error, 'getLocations');

    return data || [];
  },

  /**
   * Get a single location by ID
   */
  async getLocationById(id) {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('id', id)
      .single();

    throwIfError(error, 'getLocationById');
    return data;
  },

  /**
   * Get a location by country code
   */
  async getLocationByCode(countryCode) {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('country_code', countryCode)
      .single();

    throwIfError(error, 'getLocationByCode');
    return data;
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

    const { data, error } = await supabase
      .from('locations')
      .insert(payload)
      .select()
      .single();

    throwIfError(error, 'createLocation');
    return data;
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

    const { data, error } = await supabase
      .from('locations')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    throwIfError(error, 'updateLocation');
    return data;
  },

  /**
   * Delete a location
   */
  async deleteLocation(id) {
    if (!id) throw new Error('Location ID is required');

    const { error } = await supabase
      .from('locations')
      .delete()
      .eq('id', id);

    throwIfError(error, 'deleteLocation');
    return true;
  },

  /**
   * Toggle location active status
   */
  async toggleActive(id) {
    if (!id) throw new Error('Location ID is required');

    // First get current status
    const location = await this.getLocationById(id);

    // Toggle it
    return await this.updateLocation(id, { active: !location.active });
  },

  /**
   * Reorder locations
   */
  async reorderLocations(locationOrders) {
    // locationOrders: [{ id, display_order }]
    const updates = locationOrders.map(({ id, display_order }) =>
      supabase
        .from('locations')
        .update({ display_order })
        .eq('id', id)
    );

    const results = await Promise.all(updates);

    // Check for errors
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      throwIfError(errors[0].error, 'reorderLocations');
    }

    return true;
  },
};
