// src/pages/handler/HandlerProfileManagement.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Helmet } from 'react-helmet';
import AuthContextNavigator from '../../components/navigation/AuthContextNavigator';
import { handlerProfileService } from '../../services/handlerProfileService';
import { emailNotificationService } from '../../services/emailNotificationService';
import { emailVerificationService } from '../../services/emailVerificationService';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import TwoFactorAuthPanel from './components/TwoFactorAuthPanel';
import { getApiAccessToken } from '../../lib/auth0ApiToken';
import { normalizeHandlerRecord } from '../../services/utils/handlerNormalization';

/**
 * Single-page version:
 * - Contact info
 * - Email preferences (global email enabled + per-event toggles)
 * - Two-Factor Authentication (2FA)
 * - NO NotificationPreferencesPanel (for now)
 */
const permissionLabelMap = {
  canViewTickets: 'Tickets bekijken',
  canEditTickets: 'Tickets bewerken',
  canDeleteTickets: 'Tickets verwijderen',
  canManageUsers: 'Gebruikers beheren',
  canExportData: 'Data exporteren',
  canManageWorkflows: 'Workflows beheren',
};

const roleLabelMap = {
  ADMIN: 'Administrator',
  HANDLER: 'Handler',
  SUPER_ADMIN: 'Super Admin',
  USER: 'Gebruiker',
};
const rolePriority = ['SUPER_ADMIN', 'ADMIN', 'HANDLER', 'USER'];

const formatRoleLabel = (role) => {
  const code = String(role || '').toUpperCase().trim();
  if (!code) return 'Handler';
  return roleLabelMap[code] || code;
};

const summarizePermissions = (permissions) => {
  if (!permissions || typeof permissions !== 'object') return [];

  return Object.entries(permissions)
    .filter(([key, value]) => !/^\d+$/.test(key) && value === true)
    .map(([key]) => permissionLabelMap[key] || key)
    .sort((a, b) => a.localeCompare(b, 'nl-NL'));
};

const pickPrimaryRole = (roles = [], fallbackRole = '') => {
  const normalized = (Array.isArray(roles) ? roles : [])
    .map((role) => String(role || '').toUpperCase().trim())
    .filter(Boolean);

  for (const candidate of rolePriority) {
    if (normalized.includes(candidate)) return candidate;
  }

  const fallback = String(fallbackRole || '').toUpperCase().trim();
  return fallback || normalized[0] || 'HANDLER';
};
const readCachedHandlerProfile = () => {
  try {
    const cached = sessionStorage.getItem('handler_profile');
    return cached ? normalizeHandlerRecord(JSON.parse(cached)) : null;
  } catch {
    return null;
  }
};

const HandlerProfileManagement = () => {
  const { user, getAccessTokenSilently } = useAuth0();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [handlerProfile, setHandlerProfile] = useState(null);

  // Form state
  const [contactInfo, setContactInfo] = useState({ phone: '', email: '' });

  // Global email channel toggle (stored in notification settings table)
  const [emailChannel, setEmailChannel] = useState({ emailEnabled: true });
  const [emailVerification, setEmailVerification] = useState({
    isVerified: Boolean(user?.email_verified),
    email: String(user?.email || ''),
    statusAvailable: true,
    sendAvailable: true,
    warning: '',
    loading: false,
    sending: false,
    message: '',
    error: '',
    updatedAt: null,
    requestedAt: null,
  });

  const roles = useMemo(() => {
    const list = Array.isArray(handlerProfile?.roles) ? handlerProfile.roles : [];
    if (list.length > 0) return list.map((role) => String(role || '').toUpperCase());
    if (handlerProfile?.role) return [String(handlerProfile.role).toUpperCase()];
    return ['HANDLER'];
  }, [handlerProfile?.role, handlerProfile?.roles]);

  const enabledPermissionLabels = useMemo(
    () => summarizePermissions(handlerProfile?.permissions),
    [handlerProfile?.permissions]
  );

  useEffect(() => {
    if (user?.sub) loadProfileData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.sub]);

  useEffect(() => {
    setEmailVerification((prev) => ({
      ...prev,
      isVerified: Boolean(user?.email_verified),
      email: String(user?.email || prev.email || ''),
    }));
  }, [user?.email, user?.email_verified]);

  const refreshEmailVerificationStatus = async ({ silent = false } = {}) => {
    try {
      setEmailVerification((prev) => ({
        ...prev,
        loading: !silent,
        error: '',
      }));

      const token = await getApiAccessToken(getAccessTokenSilently);
      const status = await emailVerificationService.getStatus(token);
      setEmailVerification((prev) => ({
        ...prev,
        loading: false,
        isVerified: Boolean(status?.emailVerified),
        email: status?.email || prev.email,
        updatedAt: status?.updatedAt || prev.updatedAt || null,
        statusAvailable: status?.verificationAvailable !== false,
        sendAvailable: status?.sendAvailable !== false,
        warning: status?.warning || '',
      }));
    } catch (err) {
      console.error('Error loading email verification status:', err);
      setEmailVerification((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || 'Kon verificatiestatus niet laden',
      }));
    }
  };

  const handleSendVerificationEmail = async () => {
    try {
      setEmailVerification((prev) => ({
        ...prev,
        sending: true,
        message: '',
        error: '',
      }));

      const token = await getApiAccessToken(getAccessTokenSilently);
      const result = await emailVerificationService.sendVerificationEmail(token);
      setEmailVerification((prev) => ({
        ...prev,
        sending: false,
        isVerified: Boolean(result?.emailVerified),
        email: result?.email || prev.email,
        requestedAt: result?.requestedAt || prev.requestedAt || null,
        message: Boolean(result?.emailVerified)
          ? 'E-mailadres is al geverifieerd.'
          : 'Verificatie e-mail verzonden. Controleer uw inbox.',
      }));

      await refreshEmailVerificationStatus({ silent: true });
    } catch (err) {
      console.error('Error sending verification email:', err);
      setEmailVerification((prev) => ({
        ...prev,
        sending: false,
        error: err?.message || 'Verificatie e-mail verzenden mislukt',
      }));
    }
  };

  const loadProfileData = async () => {
    try {
      setLoading(true);
      setError('');

      // 1) Handler profile (prefer backend context for RLS-safe lookup)
      let profile = null;
      try {
        const token = await getApiAccessToken(getAccessTokenSilently);
        const response = await fetch('/api/me.api.php', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.success && payload?.data?.handler) {
          profile = payload.data.handler;
        }
      } catch (apiError) {
        console.warn('[HandlerProfile] /api/me.api.php lookup failed, using cached handler profile if available:', apiError);
      }

      if (!profile) {
        const cachedProfile = readCachedHandlerProfile();
        const cachedEmail = String(cachedProfile?.email || '').trim().toLowerCase();
        const normalizedEmail = String(user?.email || '').trim().toLowerCase();
        const cachedUserId = String(cachedProfile?.user_id || '').trim();
        const normalizedSub = String(user?.sub || '').trim();
        if (
          (cachedUserId && normalizedSub && cachedUserId === normalizedSub) ||
          (cachedEmail && normalizedEmail && cachedEmail === normalizedEmail)
        ) {
          profile = cachedProfile;
        }
      }

      setHandlerProfile(profile);

      setContactInfo({
        phone: profile?.phone || '',
        email: profile?.email || user?.email || ''
      });

      if (!profile?.id) {
        setEmailChannel({ emailEnabled: true });
        setError('Geen gekoppeld handler-profiel gevonden voor dit account. Neem contact op met een administrator.');
        return;
      }

      // 2) Notification settings (only use emailEnabled for now)
      const notifSettings = await handlerProfileService?.getNotificationSettings(profile.id);
      if (notifSettings) {
        setEmailChannel({
          emailEnabled: notifSettings?.emailEnabled ?? true
        });
      } else {
        setEmailChannel({ emailEnabled: true });
      }

      await refreshEmailVerificationStatus({ silent: true });
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
        <div className="min-h-screen app-page-gradient bg-background flex items-center justify-center">
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
        <div className="min-h-screen app-page-gradient bg-background">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28 space-y-6">
            <AccountOverviewPanel
              user={user}
              handlerProfile={handlerProfile}
              roles={roles}
              permissionCount={enabledPermissionLabels.length}
              emailVerification={emailVerification}
              onSendVerification={handleSendVerificationEmail}
              onRefreshVerification={refreshEmailVerificationStatus}
            />

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 flex items-start gap-3 shadow-sm">
                <Icon name="AlertTriangle" size={18} color="var(--color-destructive)" className="flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-destructive">Fout</p>
                  <p className="text-sm text-destructive/90">{error}</p>
                </div>
              </div>
            )}

            {successMessage && (
              <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 flex items-start gap-3 shadow-sm">
                <Icon name="CheckCircle" size={18} color="var(--color-success)" className="flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-success">Opgeslagen</p>
                  <p className="text-sm text-success/90">{successMessage}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6">
                <ContactInfoPanel contactInfo={contactInfo} setContactInfo={setContactInfo} />

                <EmailPreferencesPanel
                  handlerId={handlerProfile?.id}
                  contactInfo={contactInfo}
                  emailEnabled={emailChannel.emailEnabled}
                  setEmailEnabled={(enabled) => setEmailChannel({ emailEnabled: enabled })}
                />
              </div>

              <div className="space-y-6">
                {/* <AccessSummaryPanel
                  user={user}
                  roles={roles}
                  enabledPermissionLabels={enabledPermissionLabels}
                  handlerProfile={handlerProfile}
                /> */}

                <TwoFactorAuthPanel />

                <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
                  <div className="flex items-start gap-3">
                    <Icon name="Info" size={18} color="var(--color-primary)" className="flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-2">Integratie Status</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <Icon name="Mail" size={14} color="var(--color-success)" />
                          <span>Email Service: Actief</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Icon name="MessageSquare" size={14} color="var(--color-muted-foreground)" />
                          <span>SMS/Push: Nog niet actief</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-4 z-20">
              <div className="rounded-xl border border-border bg-card/95 backdrop-blur px-4 py-3 shadow-lg flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Sla uw profielwijzigingen op om contactgegevens en notificatiegedrag direct toe te passen.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button
                    variant="default"
                    size="default"
                    iconName="Save"
                    iconPosition="left"
                    onClick={handleSaveChanges}
                    loading={saving}
                    disabled={saving}
                    className="w-full sm:w-auto"
                  >
                    Wijzigingen Opslaan
                  </Button>
                  <Button
                    variant="outline"
                    size="default"
                    iconName="RotateCcw"
                    iconPosition="left"
                    onClick={handleResetToDefaults}
                    disabled={saving}
                    className="w-full sm:w-auto"
                  >
                    Reset naar Standaard
                  </Button>
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
const compactId = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (raw.length <= 16) return raw;
  return `${raw.slice(0, 8)}...${raw.slice(-6)}`;
};

const formatDateTimeNl = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const StatTile = ({ label, value, icon, compact = false }) => (
  <div className="rounded-xl border border-border bg-muted/20 px-3.5 py-3 min-h-[84px] flex flex-col justify-between">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      <Icon name={icon} size={12} />
      <span>{label}</span>
    </div>
    <p className={`mt-1 ${compact ? 'text-sm' : 'text-2xl'} font-semibold text-foreground leading-tight break-all`}>{value}</p>
  </div>
);

const AccountOverviewPanel = ({
  user,
  handlerProfile,
  roles,
  permissionCount,
  emailVerification,
  onSendVerification,
  onRefreshVerification,
}) => {
  const displayName = user?.name || handlerProfile?.name || 'Handler';
  const displayEmail = emailVerification?.email || handlerProfile?.email || user?.email || '-';
  const primaryRole = formatRoleLabel(pickPrimaryRole(roles, handlerProfile?.role));
  const isEmailVerified = Boolean(emailVerification?.isVerified);
  const statusAvailable = emailVerification?.statusAvailable !== false;
  const sendAvailable = emailVerification?.sendAvailable !== false;
  const isExternallyManagedEmail = !isEmailVerified && statusAvailable && !sendAvailable;
  const verificationWarning = String(emailVerification?.warning || '').trim();
  const verificationMessage = String(emailVerification?.message || '').trim();
  const verificationError = String(emailVerification?.error || '').trim();
  const initials = String(displayName)
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="p-6 md:p-7">
        <div className="flex flex-col lg:flex-row lg:items-start gap-5">
          <div className="flex-shrink-0">
            <div className="w-20 h-20 rounded-2xl border border-primary/20 bg-gradient-to-br from-sky-700 to-sky-500 flex items-center justify-center shadow-md shadow-sky-700/20">
              <span className="text-2xl font-semibold text-white tracking-wide">{initials}</span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight">
              {displayName}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 break-all">{displayEmail}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                <Icon name="Shield" size={12} />
                {primaryRole}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${handlerProfile?.active ? 'bg-success/10 text-success border-success/20' : 'bg-destructive/10 text-destructive border-destructive/20'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${handlerProfile?.active ? 'bg-success' : 'bg-destructive'}`} />
                {handlerProfile?.active ? 'Actief' : 'Inactief'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                <Icon name="CheckCircle" size={12} />
                OAuth verbonden
              </span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${(isEmailVerified || isExternallyManagedEmail) ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20'}`}>
                <Icon name={isEmailVerified || isExternallyManagedEmail ? 'CheckCircle' : 'AlertCircle'} size={12} />
                {isEmailVerified
                  ? 'E-mail geverifieerd'
                  : isExternallyManagedEmail
                    ? 'E-mailstatus via organisatie (SSO)'
                    : 'E-mail niet geverifieerd'}
              </span>
            </div>

            {isExternallyManagedEmail && (
              <div className="mt-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">E-mailstatus is correct ingesteld</p>
                    <p className="text-xs text-muted-foreground">
                      Verificatie wordt beheerd door uw organisatie (SSO/Entra). Er is geen actie nodig in dit portaal.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      iconName="RefreshCw"
                      onClick={() => onRefreshVerification?.({ silent: false })}
                      disabled={emailVerification?.loading}
                      className="w-full sm:w-auto"
                    >
                      {emailVerification?.loading ? 'Bezig...' : 'Status vernieuwen'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {!isEmailVerified && !isExternallyManagedEmail && (
              <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">Bevestig uw e-mailadres</p>
                    <p className="text-xs text-muted-foreground">
                      Verificatie is nodig voor betrouwbare e-mailnotificaties.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      iconName="RefreshCw"
                      onClick={() => onRefreshVerification?.({ silent: false })}
                      disabled={emailVerification?.loading || emailVerification?.sending}
                      className="w-full sm:w-auto"
                    >
                      {emailVerification?.loading ? 'Bezig...' : 'Status vernieuwen'}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      iconName="Mail"
                      onClick={onSendVerification}
                      loading={emailVerification?.sending}
                      disabled={emailVerification?.sending || !sendAvailable}
                      className="w-full sm:w-auto"
                    >
                      Verificatie e-mail sturen
                    </Button>
                  </div>
                </div>

                {!!verificationWarning && (
                  <p className="text-xs text-warning mt-2">{verificationWarning}</p>
                )}
                {!!verificationMessage && (
                  <p className="text-xs text-success mt-2">{verificationMessage}</p>
                )}
                {!!verificationError && (
                  <p className="text-xs text-destructive mt-2">{verificationError}</p>
                )}
                {!!emailVerification?.requestedAt && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Laatst verzonden: {formatDateTimeNl(emailVerification.requestedAt)}
                  </p>
                )}
              </div>
            )}

            {isEmailVerified && emailVerification?.updatedAt && (
              <p className="text-[11px] text-muted-foreground mt-3">
                Verificatie bevestigd op {formatDateTimeNl(emailVerification.updatedAt)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 w-full md:w-[320px] lg:w-[340px]">
            <StatTile label="Rollen" value={String(roles?.length || 0)} icon="Users" />
            <StatTile label="Rechten" value={String(permissionCount || 0)} icon="Key" />
            <StatTile label="Handler ID" value={compactId(handlerProfile?.id)} icon="Fingerprint" compact />
            <StatTile label="User ID" value={compactId(handlerProfile?.user_id || user?.sub)} icon="Link2" compact />
          </div>
        </div>
      </div>
    </section>
  );
};

const AccessSummaryPanel = ({ user, roles, enabledPermissionLabels, handlerProfile }) => {
  const roleList = roles?.length ? roles : ['HANDLER'];

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="ShieldCheck" size={18} color="var(--color-primary)" />
        <h2 className="text-lg font-semibold text-foreground">Toegang & identiteit</h2>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Rollen</p>
          <div className="flex flex-wrap gap-2">
            {roleList.map((role) => (
              <span
                key={role}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
              >
                {formatRoleLabel(role)}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Actieve rechten</p>
          <div className="space-y-1.5">
            {enabledPermissionLabels.length > 0 ? (
              enabledPermissionLabels.map((label) => (
                <div key={label} className="text-sm text-foreground flex items-center gap-2">
                  <Icon name="CheckCircle" size={14} color="var(--color-success)" />
                  <span>{label}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Geen expliciete rechten gevonden.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Account koppeling</p>
          <p className="text-xs text-foreground mt-1 break-all">sub: {handlerProfile?.user_id || user?.sub || '-'}</p>
          <p className="text-xs text-muted-foreground mt-1">Gebruik deze koppeling voor support en debugging.</p>
        </div>
      </div>
    </section>
  );
};

const ContactInfoPanel = ({ contactInfo, setContactInfo }) => {
  return (
    <div className="p-5 rounded-xl bg-card border border-border shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="Phone" size={20} color="var(--color-primary)" />
        <h2 className="text-lg font-semibold text-foreground">Contactinformatie</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Beheer uw contactgegevens voor e-mailcommunicatie.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
  const [preferencesMeta, setPreferencesMeta] = useState({ fallbackActive: false });
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

      const result = await emailNotificationService.getHandlerEmailPreferencesByCategory(handlerId, { withMeta: true });
      const prefs = result?.preferencesByCategory || {};
      setPreferencesByCategory(prefs);
      setPreferencesMeta({
        fallbackActive: Boolean(result?.meta?.fallbackActive),
      });

      const orig = {};
      Object.entries(prefs).forEach(([, events]) => {
        events.forEach((event) => {
          orig[event.code] = event.isEnabled;
        });
      });
      setOriginalPreferences(orig);
    } catch (err) {
      console.error('Error loading email preferences:', err);
      setPreferencesMeta({ fallbackActive: false });
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
      <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
          <Icon name="Loader" size={16} className="animate-spin" />
          Email voorkeuren laden...
        </div>
      </div>
    );
  }

  const categories = Object.keys(preferencesByCategory);

  return (
    <div className="p-5 rounded-xl bg-card border border-border shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="Mail" size={20} color="var(--color-primary)" />
          <h2 className="text-lg font-semibold text-foreground">Email voorkeuren</h2>
        </div>
        {categories.length > 0 && (
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
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Kies welke emails u wilt ontvangen. Verplichte (systeem-kritieke) emails kunnen niet uitgeschakeld worden.
      </p>

      {preferencesMeta?.fallbackActive && (
        <div className="mb-4 p-3 rounded-lg border border-warning/30 bg-warning/10 text-warning flex items-start gap-2">
          <Icon name="AlertTriangle" size={16} className="mt-0.5" />
          <div className="flex-1 text-sm">
            Standaard e-mailvoorkeuren worden gebruikt. Geavanceerde e-mailinstellingen zijn momenteel tijdelijk niet beschikbaar.
          </div>
        </div>
      )}

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
