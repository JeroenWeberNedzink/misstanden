import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';
import PermissionGuard from '../../../components/auth/PermissionGuard';
import { PERMISSIONS } from '../../../utils/permissions';
import { useTranslation } from 'react-i18next';

const fmtDateTime = (value, locale) => {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(locale || undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
};

const cx = (...a) => a.filter(Boolean).join(' ');

const Chip = ({ icon, children, tone = 'muted' }) => (
  <span
    className={cx(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
      tone === 'muted' && 'bg-muted/20 border-border text-muted-foreground',
      tone === 'primary' && 'bg-primary/10 border-primary/20 text-primary'
    )}
  >
    <Icon name={icon} size={12} />
    <span className="truncate">{children}</span>
  </span>
);

const KV = ({ k, v, mono = false, className = '' }) => {
  if (!v) return null;
  return (
    <div className={cx('grid grid-cols-3 gap-2 items-start', className)}>
      <div className="col-span-1 text-[11px] text-muted-foreground leading-4">{k}</div>
      <div className={cx('col-span-2 text-xs text-foreground break-words leading-5', mono && 'font-mono')}>
        {v}
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={cx(
      'flex-1 inline-flex items-center justify-center gap-2 rounded-md px-2 py-2 text-xs border transition',
      active
        ? 'bg-background border-border text-foreground shadow-sm'
        : 'bg-muted/20 border-border text-muted-foreground hover:bg-muted/30'
    )}
  >
    <Icon name={icon} size={14} />
    <span className="truncate">{label}</span>
  </button>
);

const CaseDetailsPanel = ({
  caseData,
  canEdit = true,
  isSaving = false,
  onUpdate, // async (patch) => Promise<void>
}) => {
  const { t, i18n } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);

  // normalize reporter fields from both shapes
  const reporter = useMemo(() => {
    const rd = caseData?.reporterDetails || {};
    return {
      name: rd?.name ?? caseData?.reporterName ?? caseData?.reporter_name ?? '',
      email: rd?.email ?? caseData?.reporterEmail ?? caseData?.reporter_email ?? '',
      phone: rd?.phone ?? caseData?.reporterPhone ?? caseData?.reporter_phone ?? '',
    };
  }, [caseData]);

  const reporterHasAny =
    Boolean((reporter?.name || '').trim()) ||
    Boolean((reporter?.email || '').trim()) ||
    Boolean((reporter?.phone || '').trim());

  // local editable state
  const [location, setLocation] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');

  useEffect(() => {
    setLocation(caseData?.location ?? '');
    setReporterName(reporter?.name ?? '');
    setReporterEmail(reporter?.email ?? '');
    setReporterPhone(reporter?.phone ?? '');
  }, [caseData, reporter]);

  const hasChanges = useMemo(() => {
    return (
      (location ?? '') !== (caseData?.location ?? '') ||
      (reporterName ?? '') !== (reporter?.name ?? '') ||
      (reporterEmail ?? '') !== (reporter?.email ?? '') ||
      (reporterPhone ?? '') !== (reporter?.phone ?? '')
    );
  }, [caseData, location, reporterName, reporterEmail, reporterPhone, reporter]);

  const handleCancel = () => {
    setIsEditing(false);
    setLocation(caseData?.location ?? '');
    setReporterName(reporter?.name ?? '');
    setReporterEmail(reporter?.email ?? '');
    setReporterPhone(reporter?.phone ?? '');
  };

  const handleSave = async () => {
    if (!onUpdate) {
      console.warn('CaseDetailsPanel: missing onUpdate prop');
      setIsEditing(false);
      return;
    }

    const patch = {
      location: location || null,
      reporterDetails: {
        name: reporterName || null,
        email: reporterEmail || null,
        phone: reporterPhone || null,
      },
    };

    await onUpdate(patch);
    setIsEditing(false);
  };

  // metadata (supports camelCase + snake_case)
  const reporterMeta = useMemo(() => {
    const md = caseData?.metadata;
    if (!md || typeof md !== 'object') return null;

    const rm = md?.reporterMetaClient ?? md?.reporter_meta_client;
    if (!rm || typeof rm !== 'object') return null;

    const viewport = rm?.viewport || {};
    const viewportStr =
      viewport && (viewport.w || viewport.h)
        ? `${viewport.w ?? '?'}x${viewport.h ?? '?'} (dpr ${viewport.dpr ?? '?'})`
        : null;

    const languages =
      Array.isArray(rm?.languages) && rm.languages.length
        ? rm.languages.join(', ')
        : (rm?.language || null);

    const userAgent = rm?.userAgent ?? rm?.user_agent ?? null;
    const createdFrom = rm?.createdFrom ?? rm?.created_from ?? null;
    const createdAtClient = rm?.createdAtClient ?? rm?.created_at_client ?? null;

    const statusLabel = md?.statusLabel ?? md?.status_label ?? null;
    const workflowStatusCode = md?.workflowStatusCode ?? md?.workflow_status_code ?? null;

    return {
      statusLabel,
      workflowStatusCode,
      languages,
      timezone: rm?.timezone || null,
      platform: rm?.platform || null,
      viewport: viewportStr,
      userAgent,
      createdFrom,
      createdAt: createdAtClient ? fmtDateTime(createdAtClient, i18n?.resolvedLanguage || i18n?.language) : null,
    };
  }, [caseData, i18n?.resolvedLanguage, i18n?.language]);

  // compact tab UX
  const [activeTab, setActiveTab] = useState('contact'); // contact | location | meta
  const [showUA, setShowUA] = useState(false);

  useEffect(() => {
    // if no reporter info, default to meta (often useful) else contact
    if (!reporterHasAny && reporterMeta) setActiveTab('meta');
  }, [reporterHasAny, reporterMeta]);

  const topBadges = useMemo(() => {
    const chips = [];
    if (caseData?.ticketNumber) chips.push({ icon: 'Hash', text: caseData.ticketNumber, tone: 'muted' });
    if (caseData?.status) chips.push({ icon: 'Tag', text: caseData.status, tone: 'primary' });
    if (caseData?.priority) chips.push({ icon: 'AlertCircle', text: caseData.priority, tone: 'muted' });
    return chips;
  }, [caseData]);

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-1 md:gap-3">
        {/* LEFT: Description */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-border bg-muted/10 overflow-hidden">
            <div className="p-4 md:p-5 border-b border-border flex items-center gap-2">
              <Icon name="AlignLeft" size={14} />
              <h3 className="text-xs md:text-sm font-semibold text-foreground truncate">
                {t('common.description')}
              </h3>

              {/* quick badges (small, no extra height)
              <div className="ml-2 hidden md:flex items-center gap-2 min-w-0">
                {topBadges.slice(0, 3).map((c, idx) => (
                  <Chip key={idx} icon={c.icon} tone={c.tone}>
                    {c.text}
                  </Chip>
                ))}
              </div> */}

              <PermissionGuard permission={PERMISSIONS.EDIT_TICKETS}>
                {canEdit && (
                  <div className="ml-auto flex items-center gap-2">
                    {!isEditing ? (
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded-md border border-border bg-background/60 hover:bg-muted/40 transition"
                        onClick={() => setIsEditing(true)}
                      >
                        {t('common.edit')}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded-md border border-border bg-background/60 hover:bg-muted/40 transition"
                          onClick={handleCancel}
                          disabled={isSaving}
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 transition"
                          onClick={handleSave}
                          disabled={isSaving || !hasChanges}
                        >
                          {t('common.save')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </PermissionGuard>
            </div>

            <div className="p-4 md:p-5">
              <p className="text-xs md:text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {caseData?.description || '-'}
              </p>
            </div>

            {/* subtle footer hint only when editing */}
            {isEditing && hasChanges && (
              <div className="px-4 md:px-5 pb-4 md:pb-5">
                <div className="rounded border border-border bg-muted/10 p-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon name="Info" size={12} />
                    <p className="font-medium text-foreground/90">{t('caseManagementDetail.details.unsavedChanges')}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Single compact details card with tabs */}
        <div className="lg:col-span-2 space-y-2 md:space-y-2.5">
          <div className="bg-white rounded-lg border border-border bg-muted/10 overflow-hidden">
            <div className="p-4 md:p-5 border-b border-border flex items-center gap-2">
              <Icon name="LayoutList" size={14} />
              <h3 className="text-xs md:text-sm font-semibold text-foreground">
                {t('common.details')}
              </h3>

              {/* tiny meta indicator without taking space */}
              {reporterMeta?.timezone && (
                <div className="ml-auto hidden md:flex">
                  <Chip icon="Clock">{reporterMeta.timezone}</Chip>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="p-3 md:p-4 border-b border-border">
              <div className="grid grid-cols-3 gap-2">
                <TabButton
                  active={activeTab === 'contact'}
                  onClick={() => setActiveTab('contact')}
                  icon="User"
                  label={t('caseManagementDetail.details.tabContact')}
                />
                <TabButton
                  active={activeTab === 'location'}
                  onClick={() => setActiveTab('location')}
                  icon="MapPin"
                  label={t('caseManagementDetail.details.tabLocation')}
                />
                <TabButton
                  active={activeTab === 'meta'}
                  onClick={() => setActiveTab('meta')}
                  icon="Info"
                  label={t('caseManagementDetail.details.tabMeta')}
                />
              </div>
            </div>

            {/* Content */}
            <div className="p-4 md:p-5">
              {/* CONTACT TAB */}
              {activeTab === 'contact' && (
                <>
                  {!isEditing ? (
                    reporterHasAny ? (
                      <div className="space-y-2">
                        {reporter?.name && (
                          <div className="flex items-center gap-2">
                            <Icon name="User" size={14} className="text-muted-foreground" />
                            <p className="text-xs md:text-sm text-foreground break-words">
                              {reporter.name}
                            </p>
                          </div>
                        )}
                        {reporter?.email && (
                          <div className="flex items-center gap-2">
                            <Icon name="Mail" size={14} className="text-muted-foreground" />
                            <a
                              href={`mailto:${reporter.email}`}
                              className="text-xs md:text-sm text-primary hover:underline break-words"
                            >
                              {reporter.email}
                            </a>
                          </div>
                        )}
                        {reporter?.phone && (
                          <div className="flex items-center gap-2">
                            <Icon name="Phone" size={14} className="text-muted-foreground" />
                            <a
                              href={`tel:${reporter.phone}`}
                              className="text-xs md:text-sm text-primary hover:underline break-words"
                            >
                              {reporter.phone}
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded border border-border bg-background/60 p-3 flex items-start gap-2">
                          <Icon name="UserX" size={16} className="text-muted-foreground mt-0.5" />
                          <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground">{t('caseManagement.anonymous')}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('caseManagementDetail.details.noContactInfo')}
                          </p>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="space-y-2">
                      <Input
                        type="text"
                        label={t('common.name')}
                        value={reporterName}
                        onChange={(e) => setReporterName(e?.target?.value)}
                        placeholder={t('caseManagementDetail.common.optional')}
                        disabled={isSaving}
                      />
                      <Input
                        type="email"
                        label={t('common.email')}
                        value={reporterEmail}
                        onChange={(e) => setReporterEmail(e?.target?.value)}
                        placeholder={t('caseManagementDetail.common.optional')}
                        disabled={isSaving}
                      />
                      <Input
                        type="text"
                        label={t('common.phone')}
                        value={reporterPhone}
                        onChange={(e) => setReporterPhone(e?.target?.value)}
                        placeholder={t('caseManagementDetail.common.optional')}
                        disabled={isSaving}
                      />
                    </div>
                  )}
                </>
              )}

              {/* LOCATION TAB */}
              {activeTab === 'location' && (
                <>
                  {!isEditing ? (
                    <div className="flex items-start gap-2">
                      <Icon name="MapPin" size={16} className="text-muted-foreground mt-0.5" />
                      <p className="text-xs md:text-sm text-foreground break-words">
                        {caseData?.location || t('caseManagementDetail.details.notProvided')}
                      </p>
                    </div>
                  ) : (
                    <Input
                      type="text"
                      label={t('caseManagementDetail.details.tabLocation')}
                      placeholder={t('caseManagementDetail.details.locationPlaceholder')}
                      value={location}
                      onChange={(e) => setLocation(e?.target?.value)}
                      disabled={isSaving}
                    />
                  )}
                </>
              )}

              {/* META TAB */}
              {activeTab === 'meta' && (
                <>
                  {reporterMeta ? (
                    <div className="space-y-3">
                      {/* compact highlight row */}
                      <div className="flex flex-wrap gap-2">
                        {reporterMeta.platform && (
                          <Chip icon="Monitor">{reporterMeta.platform}</Chip>
                        )}
                        {reporterMeta.languages && (
                          <Chip icon="Globe">{reporterMeta.languages}</Chip>
                        )}
                      </div>

                      <div className="space-y-2">
                        {/* <KV k="Workflow status" v={reporterMeta.workflowStatusCode} mono /> */}
                        <KV k={t('caseManagementDetail.details.timezone')} v={reporterMeta.timezone} />
                        <KV k={t('caseManagementDetail.details.viewport')} v={reporterMeta.viewport} mono />
                        <KV k={t('caseManagementDetail.details.createdClient')} v={reporterMeta.createdAt} />
                        {/* <KV k="Pagina" v={reporterMeta.createdFrom} /> */}

                        {/* User agent is huge: collapse it */}
                        <div className="pt-2 border-t border-border">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] text-muted-foreground">{t('caseManagementDetail.details.userAgent')}</div>
                            <button
                              type="button"
                              className="text-[11px] text-primary hover:underline"
                              onClick={() => setShowUA((v) => !v)}
                            >
                              {showUA ? t('caseManagementDetail.common.less') : t('caseManagementDetail.common.more')}
                            </button>
                          </div>
                          <div className={cx('text-xs text-foreground break-words mt-1', !showUA && 'line-clamp-2')}>
                            {reporterMeta.userAgent || '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t('caseManagementDetail.details.noMetadata')}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* On small screens, badges under details for quick glance */}
          <div className="md:hidden flex flex-wrap gap-2">
            {topBadges.map((c, idx) => (
              <Chip key={idx} icon={c.icon} tone={c.tone}>
                {c.text}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaseDetailsPanel;
