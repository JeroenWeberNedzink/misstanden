// src/pages/handler/HandlerProfileManagement.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet';
import AuthContextNavigator from '../../components/navigation/AuthContextNavigator';
import { handlerProfileService } from '../../services/handlerProfileService';
import { emailNotificationService } from '../../services/emailNotificationService';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import TwoFactorAuthPanel from './components/TwoFactorAuthPanel';

/**
 * Single-page version:
 * - Contact info
 * - Email preferences (global email enabled + per-event toggles)
 * - Two-Factor Authentication (2FA)
 * - NO NotificationPreferencesPanel (for now)
 */

const HandlerProfileManagement = () => {
  const { user } = useAuth0();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [handlerProfile, setHandlerProfile] = useState(null);

  // Form state
  const [contactInfo, setContactInfo] = useState({ phone: '', email: '' });

  // Global email channel toggle (stored in notification settings table)
  const [emailChannel, setEmailChannel] = useState({ emailEnabled: true });

  useEffect(() => {
    if (user?.sub) loadProfileData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.sub]);

  const loadProfileData = async () => {
    try {
      setLoading(true);
      setError('');

      // 1) Handler profile
      const profile = await handlerProfileService?.getHandlerByUserId(user?.sub);
      setHandlerProfile(profile);

      setContactInfo({
        phone: profile?.phone || '',
        email: profile?.email || ''
      });

      // 2) Notification settings (only use emailEnabled for now)
      const notifSettings = await handlerProfileService?.getNotificationSettings(profile?.id);
      if (notifSettings) {
        setEmailChannel({
          emailEnabled: notifSettings?.emailEnabled ?? true
        });
      } else {
        setEmailChannel({ emailEnabled: true });
      }
    } catch (err) {
      console.error('Error loading profile data:', err);
      setError(err?.message || 'Fout bij het laden van profielgegevens');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccessMessage('');

      if (!handlerProfile?.id || !user?.sub) {
        throw new Error('Handler profiel niet gevonden');
      }

      // Update contact information
      await handlerProfileService?.updateHandlerContact(handlerProfile?.id, {
        phone: contactInfo?.phone,
        email: contactInfo?.email
      });

      // Save global email channel toggle
      await handlerProfileService?.updateNotificationSettings(handlerProfile?.id, {
        emailEnabled: emailChannel?.emailEnabled ?? true
      });

      setSuccessMessage('Wijzigingen succesvol opgeslagen');

      await loadProfileData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error saving changes:', err);
      setError(err?.message || 'Fout bij het opslaan van wijzigingen');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = () => {
    if (!window.confirm('Weet u zeker dat u alle instellingen wilt resetten naar standaardwaarden?')) return;

    setEmailChannel({ emailEnabled: true });
  };

  if (loading) {
    return (
      <AuthContextNavigator>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Icon name="Loader2" size={48} className="animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Profielgegevens laden...</p>
          </div>
        </div>
      </AuthContextNavigator>
    );
  }

  return (
    <>
      <Helmet>
        <title>Profiel Beheer - Misstanden Portal</title>
        <meta name="description" content="Beheer uw contactgegevens en email voorkeuren" />
      </Helmet>

      <AuthContextNavigator>
        <div className="min-h-screen bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

            {/* Profile Header */}
            <div className="mb-8 bg-card border border-border rounded-xl p-6">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  {user?.picture ? (
                    <img
                      src={user.picture}
                      alt={user?.name || 'User'}
                      className="w-24 h-24 rounded-full border-4 border-primary/20 object-cover"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-primary/10 border-4 border-primary/20 flex items-center justify-center">
                      <Icon name="User" size={40} color="var(--color-primary)" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
                    {user?.name || handlerProfile?.name || 'Handler'}
                  </h1>
                  <p className="text-sm text-muted-foreground mb-3">
                    {user?.email || handlerProfile?.email}
                  </p>

                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50">
                      <Icon name="Shield" size={16} color="var(--color-primary)" />
                      <span className="text-sm font-medium text-foreground">
                        {handlerProfile?.role || 'Handler'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50">
                      <div className={`w-2 h-2 rounded-full ${handlerProfile?.active ? 'bg-success' : 'bg-destructive'}`} />
                      <span className="text-sm font-medium text-foreground">
                        {handlerProfile?.active ? 'Actief' : 'Inactief'}
                      </span>
                    </div>

                    {user?.sub && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50">
                        <Icon name="CheckCircle" size={16} color="var(--color-success)" />
                        <span className="text-sm font-medium text-foreground">
                          OAuth Verbonden
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Error/Success */}
            {error && (
              <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
                <Icon name="AlertCircle" size={20} color="var(--color-destructive)" className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Fout</p>
                  <p className="text-sm text-destructive/80">{error}</p>
                </div>
              </div>
            )}

            {successMessage && (
              <div className="mb-6 p-4 rounded-lg bg-success/10 border border-success/20 flex items-start gap-3">
                <Icon name="CheckCircle" size={20} color="var(--color-success)" className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-success">Succes</p>
                  <p className="text-sm text-success/80">{successMessage}</p>
                </div>
              </div>
            )}

            {/* Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <ContactInfoPanel contactInfo={contactInfo} setContactInfo={setContactInfo} />
            </div>

            {/* Email Preferences Panel */}
            <div className="mb-6">
              <EmailPreferencesPanel
                handlerId={handlerProfile?.id}
                contactInfo={contactInfo}
                emailEnabled={emailChannel.emailEnabled}
                setEmailEnabled={(enabled) => setEmailChannel({ emailEnabled: enabled })}
              />
            </div>

            {/* Two-Factor Authentication Panel */}
            <TwoFactorAuthPanel />

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 mt-8">
              <Button
                variant="default"
                size="lg"
                iconName="Save"
                iconPosition="left"
                onClick={handleSaveChanges}
                loading={saving}
                disabled={saving}
                className="flex-1 sm:flex-none"
              >
                Wijzigingen Opslaan
              </Button>
              <Button
                variant="outline"
                size="lg"
                iconName="RotateCcw"
                iconPosition="left"
                onClick={handleResetToDefaults}
                disabled={saving}
                className="flex-1 sm:flex-none"
              >
                Reset naar Standaard
              </Button>
            </div>

            {/* Integration Status */}
            <div className="mt-8 p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-start gap-3">
                <Icon name="Info" size={20} color="var(--color-primary)" className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Integratie Status</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon name="Mail" size={16} color="var(--color-success)" />
                      <p className="text-xs text-muted-foreground">Email Service: Actief</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon name="MessageSquare" size={16} color="var(--color-muted-foreground)" />
                      <p className="text-xs text-muted-foreground">SMS/Push: Nog niet actief</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </AuthContextNavigator>
    </>
  );
};

export default HandlerProfileManagement;

/* ----------------------------- Small panels ----------------------------- */

const ContactInfoPanel = ({ contactInfo, setContactInfo }) => {
  return (
    <div className="mb-6 p-6 rounded-lg bg-card border border-border">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="Phone" size={20} color="var(--color-primary)" />
        <h2 className="text-xl font-semibold text-foreground">Contactinformatie</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Beheer uw contactgegevens voor e-mailcommunicatie.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          label="Telefoonnummer"
          type="tel"
          placeholder="+31612345678"
          value={contactInfo?.phone || ''}
          onChange={(e) => setContactInfo({ ...contactInfo, phone: e?.target?.value })}
          description="Optioneel (voor later, bijv. SMS of noodcontact)"
        />
        <Input
          label="E-mailadres"
          type="email"
          placeholder="handler@example.com"
          value={contactInfo?.email || ''}
          onChange={(e) => setContactInfo({ ...contactInfo, email: e?.target?.value })}
          description="E-mailadres voor email notificaties"
        />
      </div>
    </div>
  );
};


/* ----------------------------- Email panel (combined) ----------------------------- */

const categoryLabels = {
  ticket: 'Ticket Meldingen',
  handler: 'Handler Updates',
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
  ticket: 'Emails over tickets die aan u gekoppeld zijn',
  handler: 'Behandelaar-specifieke updates',
  sla: 'SLA deadline waarschuwingen en schendingen',
  system: 'Systeem berichten en rapporten'
};

const EmailPreferencesPanel = ({ handlerId, contactInfo, emailEnabled, setEmailEnabled }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [preferencesByCategory, setPreferencesByCategory] = useState({});
  const [originalPreferences, setOriginalPreferences] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({
    ticket: false,
    handler: false,
    sla: false,
    system: false
  });

  const [originalEmailEnabled, setOriginalEmailEnabled] = useState(true);

  const hasEmail = useMemo(() => !!(contactInfo?.email && contactInfo.email.length > 0), [contactInfo?.email]);

  useEffect(() => {
    if (handlerId) {
      loadPreferences();
      setOriginalEmailEnabled(emailEnabled ?? true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlerId]);

  useEffect(() => {
    setOriginalEmailEnabled(emailEnabled ?? true);
  }, [emailEnabled]);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      setError('');

      const prefs = await emailNotificationService.getHandlerEmailPreferencesByCategory(handlerId);
      setPreferencesByCategory(prefs);

      const orig = {};
      Object.entries(prefs).forEach(([, events]) => {
        events.forEach((event) => {
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

  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const handleToggleEvent = (eventCode) => {
    setPreferencesByCategory((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((category) => {
        updated[category] = updated[category].map((event) => {
          if (event.code === eventCode) return { ...event, isEnabled: !event.isEnabled };
          return event;
        });
      });
      return updated;
    });
  };

  const hasChanges = () => {
    if ((emailEnabled ?? true) !== (originalEmailEnabled ?? true)) return true;

    let changed = false;
    Object.values(preferencesByCategory).forEach((events) => {
      events.forEach((event) => {
        if (originalPreferences[event.code] !== event.isEnabled) changed = true;
      });
    });
    return changed;
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      // 1) Save global email enabled toggle (notification settings table)
      if ((emailEnabled ?? true) !== (originalEmailEnabled ?? true)) {
        await handlerProfileService.updateNotificationSettings(handlerId, {
          emailEnabled: emailEnabled ?? true
        });
        setOriginalEmailEnabled(emailEnabled ?? true);
      }

      // 2) Save per-event preferences
      const updates = {};
      Object.values(preferencesByCategory).forEach((events) => {
        events.forEach((event) => {
          if (originalPreferences[event.code] !== event.isEnabled) {
            updates[event.code] = event.isEnabled;
          }
        });
      });

      if (Object.keys(updates).length > 0) {
        await emailNotificationService.updateHandlerEmailPreferences(handlerId, updates);
      }

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
    if (!window.confirm('Weet u zeker dat u uw email voorkeuren wilt resetten naar de standaard waarden?')) return;

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
      <div className="mb-4 p-4 rounded-lg bg-card border border-border">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
          <Icon name="Loader" size={16} className="animate-spin" />
          Email voorkeuren laden...
        </div>
      </div>
    );
  }

  const categories = Object.keys(preferencesByCategory);

  return (
    <div className="mb-6 p-4 rounded-lg bg-card border border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="Mail" size={20} color="var(--color-primary)" />
          <h2 className="text-xl font-semibold text-foreground">Email Voorkeuren</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            iconName="ChevronDown"
            onClick={() => setExpandedCategories({ ticket: true, handler: true, sla: true, system: true })}
          >
            Open alles
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconName="ChevronUp"
            onClick={() => setExpandedCategories({ ticket: false, handler: false, sla: false, system: false })}
          >
            Sluit alles
          </Button>
          <Button variant="outline" size="sm" iconName="RotateCcw" onClick={handleReset} disabled={saving}>
            Reset
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Kies welke emails u wilt ontvangen. Verplichte (systeem-kritieke) emails kunnen niet uitgeschakeld worden.
      </p>

      {/* Global email enabled toggle */}
      <div className="mb-4 p-3 rounded-lg border border-border bg-muted/30">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon name="Mail" size={16} className="text-primary" />
              <p className="text-sm font-semibold text-foreground">Email notificaties</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {hasEmail ? (
                <>Notificaties worden verzonden naar <span className="font-medium text-foreground">{contactInfo.email}</span></>
              ) : (
                'Voeg eerst een e-mailadres toe bij Contactinformatie om emails te ontvangen.'
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => hasEmail && setEmailEnabled?.(!(emailEnabled ?? true))}
            disabled={!hasEmail}
            className={`w-11 h-6 rounded-full relative flex-shrink-0 transition ${
              (emailEnabled ?? true) ? 'bg-success' : 'bg-border'
            } ${!hasEmail ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-label="Toggle email notifications"
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform ${
                (emailEnabled ?? true) ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {!hasEmail && (
        <div className="mt-3 flex items-start gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
          <Icon name="AlertTriangle" size={16} color="var(--color-warning)" className="mt-0.5 flex-shrink-0" />
          <p className="text-xs text-warning">
            Vul een e-mailadres in bij Contactinformatie om email notificaties te activeren.
          </p>
        </div>
      )}
      </div>

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
      <div className="space-y-2">
        {categories.map((category) => {
          const events = preferencesByCategory[category] || [];
          const isExpanded = expandedCategories[category];
          const enabledCount = events.filter((e) => e.isEnabled).length;

          return (
            <div key={category} className="rounded-lg border border-border bg-muted/30">
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon name={categoryIcons[category] || 'Mail'} size={18} className="text-primary" />
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
                    className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {events.map((event) => {
                    const isSystemCritical = event.isSystemCritical;
                    const isEnabled = event.isEnabled;

                    return (
                      <div
                        key={event.code}
                        className={`p-2.5 rounded-lg border ${
                          isSystemCritical ? 'border-warning/30 bg-warning/5' : 'border-border bg-card'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">{event.nameNl}</span>
                              {isSystemCritical && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning border border-warning/30">
                                  Verplicht
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{event.descriptionNl}</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => !isSystemCritical && handleToggleEvent(event.code)}
                            disabled={isSystemCritical || !(emailEnabled ?? true)}
                            className={`w-11 h-6 rounded-full transition-smooth relative flex-shrink-0 ${
                              isEnabled ? 'bg-success' : 'bg-border'
                            } ${
                              isSystemCritical || !(emailEnabled ?? true)
                                ? 'opacity-50 cursor-not-allowed'
                                : ''
                            }`}
                            title={
                              !(emailEnabled ?? true)
                                ? 'Email notificaties staan uit'
                                : isSystemCritical
                                  ? 'Verplichte email'
                                  : ''
                            }
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
          <div className="p-8 text-center text-sm text-muted-foreground">Geen email voorkeuren beschikbaar</div>
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
            disabled={saving || !hasChanges() || !handlerId}
          >
            {saving ? 'Opslaan...' : 'Wijzigingen opslaan'}
          </Button>
        </div>
      )}
    </div>
  );
};
