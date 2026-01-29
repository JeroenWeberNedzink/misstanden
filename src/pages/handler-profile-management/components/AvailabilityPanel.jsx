import React from 'react';
import Icon from '../../../components/AppIcon';
import { Checkbox } from '../../../components/ui/Checkbox';
import Input from '../../../components/ui/Input';

const AvailabilityPanel = ({ availability, setAvailability }) => {
  const statusOptions = [
    { value: 'available', label: 'Beschikbaar', color: 'success' },
    { value: 'busy', label: 'Bezet', color: 'warning' },
    { value: 'away', label: 'Afwezig', color: 'muted' },
    { value: 'offline', label: 'Offline', color: 'destructive' }
  ];

  return (
    <div className="mb-6 p-6 rounded-lg bg-card border border-border">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="Calendar" size={20} color="var(--color-primary)" />
        <h2 className="text-xl font-semibold text-foreground">Beschikbaarheid</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Beheer uw beschikbaarheidsstatus voor incident-toewijzingen.
      </p>

      <div className="space-y-6">
        {/* Availability Toggle */}
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <Checkbox
            label="Beschikbaar voor nieuwe toewijzingen"
            description="Schakel dit uit om tijdelijk geen nieuwe incidenten toegewezen te krijgen"
            checked={availability?.isAvailable ?? true}
            onChange={(e) => setAvailability({ ...availability, isAvailable: e?.target?.checked })}
          />
        </div>

        {/* Status Selection */}
        <div>
          <label className="text-sm font-medium text-foreground mb-3 block">Status</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statusOptions?.map((option) => (
              <button
                key={option?.value}
                onClick={() => setAvailability({ ...availability, status: option?.value })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  availability?.status === option?.value
                    ? 'border-primary bg-primary/10' :'border-border bg-card hover:border-primary/50'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-3 h-3 rounded-full bg-${option?.color}`} />
                  <span className="text-sm font-medium text-foreground">{option?.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Status Message */}
        <Input
          label="Status Bericht (Optioneel)"
          type="text"
          placeholder="Bijv. Op vakantie tot 15 januari"
          value={availability?.statusMessage || ''}
          onChange={(e) => setAvailability({ ...availability, statusMessage: e?.target?.value })}
          description="Dit bericht is zichtbaar voor andere teamleden"
        />

        {/* Visual Status Badge */}
        <div className="p-4 rounded-lg bg-muted/30 border border-border">
          <p className="text-xs text-muted-foreground mb-2">Huidige Status Weergave:</p>
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${
              availability?.isAvailable ? 'bg-success' : 'bg-destructive'
            }`} />
            <div>
              <p className="text-sm font-medium text-foreground">
                {availability?.isAvailable ? 'Beschikbaar' : 'Niet Beschikbaar'}
              </p>
              {availability?.statusMessage && (
                <p className="text-xs text-muted-foreground">{availability?.statusMessage}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvailabilityPanel;