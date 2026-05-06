import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { locationService } from '../../../services/locationService';

const LocationManagementPanel = () => {
  const { t } = useTranslation();
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newLocation, setNewLocation] = useState({ countryCode: '', countryName: '' });

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await locationService.getLocations({ activeOnly: false });
      setLocations(data);
    } catch (err) {
      console.error('Error loading locations:', err);
      setError('Failed to load locations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocation.countryCode || !newLocation.countryName) {
      setError('Both country code and name are required');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await locationService.createLocation({
        countryCode: newLocation.countryCode.toUpperCase(),
        countryName: newLocation.countryName,
        displayOrder: locations.length + 1,
        active: true,
      });

      setSuccess('Location added successfully');
      setNewLocation({ countryCode: '', countryName: '' });
      setIsAdding(false);
      await loadLocations();

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error adding location:', err);
      setError(err.message || 'Failed to add location');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateLocation = async (id, updates) => {
    try {
      setIsSaving(true);
      setError('');
      await locationService.updateLocation(id, updates);
      setSuccess('Location updated successfully');
      await loadLocations();
      setEditingId(null);

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error updating location:', err);
      setError(err.message || 'Failed to update location');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (id) => {
    try {
      setError('');
      await locationService.toggleActive(id);
      setSuccess('Location status updated');
      await loadLocations();

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error toggling location:', err);
      setError(err.message || 'Failed to update location status');
    }
  };

  const handleDeleteLocation = async (id) => {
    if (!window.confirm('Are you sure you want to delete this location? This action cannot be undone.')) {
      return;
    }

    try {
      setError('');
      await locationService.deleteLocation(id);
      setSuccess('Location deleted successfully');
      await loadLocations();

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error deleting location:', err);
      setError(err.message || 'Failed to delete location');
    }
  };

  const moveLocation = async (index, direction) => {
    const newLocations = [...locations];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newLocations.length) return;

    // Swap
    [newLocations[index], newLocations[targetIndex]] = [newLocations[targetIndex], newLocations[index]];

    // Update display orders
    const updates = newLocations.map((loc, idx) => ({ id: loc.id, display_order: idx + 1 }));

    try {
      await locationService.reorderLocations(updates);
      await loadLocations();
    } catch (err) {
      console.error('Error reordering locations:', err);
      setError('Failed to reorder locations');
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 animate-pulse">
        <div className="h-5 w-48 bg-muted rounded mb-5"></div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={`loc-loading-${idx}`} className="rounded-xl border border-border p-4 bg-background/60">
              <div className="h-4 w-1/3 bg-muted rounded mb-2"></div>
              <div className="h-3 w-2/3 bg-muted/70 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Location Management</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Manage countries available for misconduct reporting
          </p>
        </div>
        <Button
          onClick={() => setIsAdding(!isAdding)}
          iconName="Plus"
          iconPosition="left"
          size="sm"
        >
          Add Location
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-success/10 border border-success text-success px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {isAdding && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h4 className="text-sm font-semibold text-foreground mb-4">Add New Location</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Country Code (2 letters)"
              value={newLocation.countryCode}
              onChange={(e) => setNewLocation({ ...newLocation, countryCode: e.target.value.toUpperCase() })}
              placeholder="NL"
              maxLength={2}
            />
            <Input
              label="Country Name"
              value={newLocation.countryName}
              onChange={(e) => setNewLocation({ ...newLocation, countryName: e.target.value })}
              placeholder="Nederland"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleAddLocation} loading={isSaving} size="sm">
              Save
            </Button>
            <Button onClick={() => setIsAdding(false)} variant="outline" size="sm">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {locations.map((location, index) => (
          <div
            key={location.id}
            className={`bg-card border rounded-lg p-4 transition-all ${
              location.active ? 'border-border' : 'border-border opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveLocation(index, 'up')}
                    disabled={index === 0}
                    className="p-1 hover:bg-muted rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Icon name="ChevronUp" size={16} />
                  </button>
                  <button
                    onClick={() => moveLocation(index, 'down')}
                    disabled={index === locations.length - 1}
                    className="p-1 hover:bg-muted rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Icon name="ChevronDown" size={16} />
                  </button>
                </div>

                {editingId === location.id ? (
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Code"
                      defaultValue={location.country_code}
                      onChange={(e) => (location._tempCode = e.target.value)}
                      maxLength={2}
                    />
                    <Input
                      label="Name"
                      defaultValue={location.country_name}
                      onChange={(e) => (location._tempName = e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-semibold text-lg text-foreground">
                        {location.country_code}
                      </span>
                      <span className="text-base text-foreground">{location.country_name}</span>
                      {!location.active && (
                        <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Display order: {location.display_order}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {editingId === location.id ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        handleUpdateLocation(location.id, {
                          countryCode: location._tempCode || location.country_code,
                          countryName: location._tempName || location.country_name,
                        })
                      }
                      loading={isSaving}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setEditingId(location.id)}
                      className="p-2 hover:bg-muted rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Icon name="Edit" size={16} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(location.id)}
                      className="p-2 hover:bg-muted rounded-lg transition-colors"
                      title={location.active ? 'Deactivate' : 'Activate'}
                    >
                      <Icon
                        name={location.active ? 'Eye' : 'EyeOff'}
                        size={16}
                        className={location.active ? 'text-success' : 'text-muted-foreground'}
                      />
                    </button>
                    <button
                      onClick={() => handleDeleteLocation(location.id)}
                      className="p-2 hover:bg-destructive/10 rounded-lg transition-colors text-destructive"
                      title="Delete"
                    >
                      <Icon name="Trash2" size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {locations.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Icon name="MapPin" size={48} className="mx-auto mb-4 opacity-50" />
          <p>No locations configured yet</p>
          <p className="text-sm mt-1">Click "Add Location" to get started</p>
        </div>
      )}
    </div>
  );
};

export default LocationManagementPanel;
