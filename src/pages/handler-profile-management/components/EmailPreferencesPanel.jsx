import React, { useState, useEffect } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { emailNotificationService } from '../../../services/emailNotificationService';

const categoryLabels = {
  ticket: 'Ticket Meldingen',
  handler: 'Handler Notificaties',
  sla: 'SLA Waarschuwingen',
  system: 'Systeem Meldingen'
};

const categoryIcons = {
  ticket: 'Ticket',
  handler: 'User',
  sla: 'Clock',
  system: 'Settings'
};

const categoryDescriptions = {
  ticket: 'Notificaties over uw toegewezen tickets',
  handler: 'Behandelaar-specifieke updates',
  sla: 'SLA deadline waarschuwingen en schendingen',
  system: 'Systeem berichten en rapporten'
};

const EmailPreferencesPanel = ({ handlerId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [preferencesByCategory, setPreferencesByCategory] = useState({});
  const [originalPreferences, setOriginalPreferences] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({ ticket: true, handler: true, sla: true });

  useEffect(() => {
    if (handlerId) {
      loadPreferences();
    }
  }, [handlerId]);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      setError('');

      const prefs = await emailNotificationService.getHandlerEmailPreferencesByCategory(handlerId);
      setPreferencesByCategory(prefs);

      // Build original state for change tracking
      const orig = {};
      Object.entries(prefs).forEach(([category, events]) => {
        events.forEach(event => {
          orig[event.code] = event.isEnabled;
        });
      });
      setOriginalPreferences(orig);

    } catch (err) {
      console.error('Error loading email preferences:', err);
      setError(err?.message || 'Fout bij laden van email voorkeuren');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (eventCode) => {
    setPreferencesByCategory(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(category => {
        updated[category] = updated[category].map(event => {
          if (event.code === eventCode) {
            return { ...event, isEnabled: !event.isEnabled };
          }
          return event;
        });
      });
      return updated;
    });
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const hasChanges = () => {
    let changed = false;
    Object.values(preferencesByCategory).forEach(events => {
      events.forEach(event => {
        if (originalPreferences[event.code] !== event.isEnabled) {
          changed = true;
        }
      });
    });
    return changed;
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const updates = {};
      Object.values(preferencesByCategory).forEach(events => {
        events.forEach(event => {
          if (originalPreferences[event.code] !== event.isEnabled) {
            updates[event.code] = event.isEnabled;
          }
        });
      });

      await emailNotificationService.updateHandlerEmailPreferences(handlerId, updates);

      setSuccess('Email voorkeuren opgeslagen');
      await loadPreferences();

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error saving email preferences:', err);
      setError(err?.message || 'Fout bij opslaan van voorkeuren');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Weet u zeker dat u uw email voorkeuren wilt resetten naar de standaard waarden?')) {
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      await emailNotificationService.resetHandlerEmailPreferences(handlerId);

      setSuccess('Email voorkeuren gereset naar standaard');
      await loadPreferences();

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error resetting email preferences:', err);
      setError(err?.message || 'Fout bij resetten van voorkeuren');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mb-6 p-6 rounded-lg bg-card border border-border">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
          <Icon name="Loader" size={16} className="animate-spin" />
          Email voorkeuren laden…
        </div>
      </div>
    );
  }

  const categories = Object.keys(preferencesByCategory);

  return (
    <div className="mb-6 p-6 rounded-lg bg-card border border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="Mail" size={20} color="var(--color-primary)" />
          <h2 className="text-xl font-semibold text-foreground">Email Voorkeuren</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          iconName="RotateCcw"
          onClick={handleReset}
          disabled={saving}
        >
          Reset naar standaard
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Kies welke email notificaties u wilt ontvangen. Systeem-kritieke emails (zoals SLA schendingen) kunnen niet uitgeschakeld worden.
      </p>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2">
          <Icon name="AlertCircle" size={16} className="mt-0.5" />
          <div className="flex-1 text-sm">{error}</div>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 rounded-lg border border-success/30 bg-success/10 text-success flex items-start gap-2">
          <Icon name="CheckCircle" size={16} className="mt-0.5" />
          <div className="flex-1 text-sm">{success}</div>
        </div>
      )}

      {/* Categories */}
      <div className="space-y-3">
        {categories.map(category => {
          const events = preferencesByCategory[category];
          const isExpanded = expandedCategories[category];
          const enabledCount = events.filter(e => e.isEnabled).length;

          return (
            <div key={category} className="rounded-lg border border-border bg-muted/30">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon name={categoryIcons[category]} size={18} className="text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-foreground">
                      {categoryLabels[category] || category}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {categoryDescriptions[category] || ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {enabledCount}/{events.length} actief
                  </span>
                  <Icon
                    name="ChevronDown"
                    size={18}
                    className={`text-muted-foreground transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Category Content */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-2">
                  {events.map(event => {
                    const isSystemCritical = event.isSystemCritical;
                    const isEnabled = event.isEnabled;

                    return (
                      <div
                        key={event.code}
                        className={`p-3 rounded-lg border ${
                          isSystemCritical
                            ? 'border-warning/30 bg-warning/5'
                            : 'border-border bg-card'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {event.nameNl}
                              </span>
                              {isSystemCritical && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning border border-warning/30">
                                  Verplicht
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {event.descriptionNl}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => !isSystemCritical && handleToggle(event.code)}
                            disabled={isSystemCritical}
                            className={`w-11 h-6 rounded-full transition-smooth relative flex-shrink-0 ${
                              isEnabled ? 'bg-success' : 'bg-border'
                            } ${isSystemCritical ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <div
                              className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${
                                isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {categories.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Geen email voorkeuren beschikbaar
          </div>
        )}
      </div>

      {/* Save Bar */}
      {categories.length > 0 && (
        <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {hasChanges() ? (
              <span className="text-foreground font-medium">Niet-opgeslagen wijzigingen</span>
            ) : (
              <span>Alle wijzigingen opgeslagen</span>
            )}
          </div>
          <Button
            variant="primary"
            iconName="Save"
            iconPosition="left"
            onClick={handleSave}
            disabled={saving || !hasChanges()}
          >
            {saving ? 'Opslaan…' : 'Wijzigingen opslaan'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default EmailPreferencesPanel;
