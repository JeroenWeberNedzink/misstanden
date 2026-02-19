import React, { useState, useEffect } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { emailNotificationService } from '../../../services/emailNotificationService';

const categoryLabels = {
  ticket: 'Ticket Events',
  handler: 'Handler Notificaties',
  sla: 'SLA Waarschuwingen',
  system: 'Systeem Berichten'
};

const categoryIcons = {
  ticket: 'Ticket',
  handler: 'Users',
  sla: 'Clock',
  system: 'Settings'
};

export default function EmailNotificationSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [settings, setSettings] = useState([]);
  const [draft, setDraft] = useState({});
  const [original, setOriginal] = useState({});

  const [activeCategory, setActiveCategory] = useState('ticket');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError('');

      const data = await emailNotificationService.getAdminEmailSettings();

      if (!data || data.length === 0) {
        setError('Email notification system not configured. Please run the setup SQL script.');
        setSettings([]);
        setOriginal({});
        setDraft({});
        setLoading(false);
        return;
      }

      setSettings(data);

      // Build original and draft state
      const orig = {};
      const draftData = {};

      data.forEach(setting => {
        orig[setting.code] = {
          isEnabled: setting.isEnabled,
          sendToReporters: setting.sendToReporters,
          sendToHandlers: setting.sendToHandlers
        };
        draftData[setting.code] = { ...orig[setting.code] };
      });

      setOriginal(orig);
      setDraft(draftData);

    } catch (err) {
      console.error('Error loading email settings:', err);
      setError(err?.message || 'Fout bij laden van email instellingen');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (code, field) => {
    setDraft(prev => ({
      ...prev,
      [code]: {
        ...prev[code],
        [field]: !prev[code]?.[field]
      }
    }));
  };

  const hasChanges = () => {
    return Object.keys(draft).some(code => {
      const orig = original[code];
      const curr = draft[code];
      return orig?.isEnabled !== curr?.isEnabled ||
             orig?.sendToReporters !== curr?.sendToReporters ||
             orig?.sendToHandlers !== curr?.sendToHandlers;
    });
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const promises = Object.keys(draft).map(code => {
        const orig = original[code];
        const curr = draft[code];

        if (orig?.isEnabled !== curr?.isEnabled ||
            orig?.sendToReporters !== curr?.sendToReporters ||
            orig?.sendToHandlers !== curr?.sendToHandlers) {
          return emailNotificationService.updateAdminEmailSetting(code, curr);
        }
        return null;
      }).filter(Boolean);

      await Promise.all(promises);

      setSuccess('Email instellingen opgeslagen');
      await loadSettings();

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error saving email settings:', err);
      setError(err?.message || 'Fout bij opslaan van instellingen');
    } finally {
      setSaving(false);
    }
  };

  const resetChanges = () => {
    setDraft({ ...original });
  };

  const categorySettings = settings.filter(s => s.category === activeCategory);

  const categories = [...new Set(settings.map(s => s.category))];

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 animate-pulse">
        <div className="h-5 w-56 bg-muted rounded mb-5"></div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={`email-loading-${idx}`} className="rounded-xl border border-border p-4 bg-background/60">
              <div className="h-4 w-1/2 bg-muted rounded mb-2"></div>
              <div className="h-3 w-5/6 bg-muted/70 rounded"></div>
            </div>
          ))}
        </div>
        <div className="mt-5 text-sm text-muted-foreground">Email instellingen laden...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon name="Mail" size={24} className="text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">Email Notificatie Configuratie</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Bepaal welke email notificaties verzonden worden en naar wie. Systeem-kritieke emails (zoals SLA schendingen) kunnen niet uitgeschakeld worden.
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-3">
          <Icon name="AlertCircle" size={18} />
          <div className="flex-1 text-sm">{error}</div>
          <Button variant="ghost" size="sm" iconName="X" onClick={() => setError('')} />
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl border border-success/30 bg-success/10 text-success flex items-start gap-3">
          <Icon name="CheckCircle" size={18} />
          <div className="flex-1 text-sm">{success}</div>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-smooth text-sm ${
              activeCategory === cat
                ? 'bg-primary/10 border-primary/25 text-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/30'
            }`}
          >
            <Icon name={categoryIcons[cat] || 'Folder'} size={16} />
            <span className="font-medium">{categoryLabels[cat] || cat}</span>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-muted/40 border border-border text-muted-foreground">
              {settings.filter(s => s.category === cat).length}
            </span>
          </button>
        ))}
      </div>

      {/* Settings List */}
      <div className="space-y-3">
        {categorySettings.map(setting => {
          const currentDraft = draft[setting.code] || {};
          const isSystemCritical = setting.isSystemCritical;

          return (
            <div
              key={setting.code}
              className={`rounded-xl border bg-card p-5 ${
                isSystemCritical ? 'border-warning/30 bg-warning/5' : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-foreground">
                      {setting.nameNl}
                    </h4>
                    {isSystemCritical && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/20 text-warning border border-warning/30 font-medium">
                        Kritiek
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {setting.descriptionNl}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1 font-mono">
                    {setting.code}
                  </p>
                </div>

                {/* Controls */}
                <div className="flex flex-col gap-3 items-end">
                  {/* Main Toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {isSystemCritical ? 'Altijd aan' : 'Ingeschakeld'}
                    </span>
                    <button
                      type="button"
                      onClick={() => !isSystemCritical && handleToggle(setting.code, 'isEnabled')}
                      disabled={isSystemCritical}
                      className={`w-12 h-6 rounded-full transition-smooth relative ${
                        currentDraft.isEnabled ? 'bg-success' : 'bg-border'
                      } ${isSystemCritical ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${
                          currentDraft.isEnabled ? 'translate-x-6' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Recipient Toggles */}
                  {currentDraft.isEnabled && (
                    <div className="flex items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={currentDraft.sendToReporters}
                          onChange={() => handleToggle(setting.code, 'sendToReporters')}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-muted-foreground">Melders</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={currentDraft.sendToHandlers}
                          onChange={() => handleToggle(setting.code, 'sendToHandlers')}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-muted-foreground">Behandelaars</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {categorySettings.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <Icon name="Mail" size={40} className="mx-auto mb-3 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">Geen email instellingen in deze categorie.</div>
          </div>
        )}
      </div>

      {/* Save Bar */}
      <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {hasChanges() ? (
            <span>
              <span className="font-medium text-foreground">Wijzigingen</span> klaar om op te slaan
            </span>
          ) : (
            <span>Geen wijzigingen</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={resetChanges}
            disabled={saving || !hasChanges()}
          >
            Reset
          </Button>
          <Button
            variant="primary"
            iconName="Save"
            iconPosition="left"
            onClick={saveSettings}
            disabled={saving || !hasChanges()}
          >
            {saving ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </div>
      </div>
    </div>
  );
}
