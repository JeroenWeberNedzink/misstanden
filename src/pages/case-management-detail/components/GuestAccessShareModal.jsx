import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

export default function GuestAccessShareModal({
  open,
  ticketNumber,
  link,
  loading = false,
  error = '',
  expiresInHours = 72,
  onClose,
  onCreateLink,
}) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setCopied(false);
    }
  }, [open]);

  if (!open) return null;

  const copyLink = async () => {
    if (!link) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else if (inputRef.current) {
        inputRef.current.select();
        document.execCommand('copy');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  const title = t('caseManagementDetail.shareModal.title', { defaultValue: 'Deel eenmalige toegang' });

  return (
    <>
      <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon name="Share2" size={18} className="text-primary" />
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {t('caseManagementDetail.shareModal.subtitle', {
                  defaultValue: 'Ticket {{ticketNumber}}',
                  ticketNumber: ticketNumber || '-',
                })}
              </p>
            </div>
            <Button variant="ghost" size="icon" iconName="X" onClick={onClose} />
          </div>

          <div className="p-5 space-y-4">
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <Icon name="Lock" size={16} className="mt-0.5 text-warning" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">
                    {t('caseManagementDetail.shareModal.oneTimeTitle', { defaultValue: 'Eenmalige link' })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('caseManagementDetail.shareModal.oneTimeDescription', {
                      defaultValue: 'Na de eerste succesvolle opening wordt deze link ongeldig. Maak daarna een nieuwe link.',
                    })}
                  </p>
                </div>
              </div>
            </div>

            {loading && (
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="Loader2" size={16} className="animate-spin" />
                {t('caseManagementDetail.shareModal.creating', { defaultValue: 'Link maken...' })}
              </div>
            )}

            {!loading && error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {!loading && link && (
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('caseManagementDetail.shareModal.linkLabel', { defaultValue: 'Toegangslink' })}
                </label>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    readOnly
                    value={link}
                    onFocus={(event) => event.target.select()}
                    className="min-w-0 flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono"
                  />
                  <Button
                    variant={copied ? 'success' : 'default'}
                    size="sm"
                    iconName={copied ? 'Check' : 'Copy'}
                    iconPosition="left"
                    onClick={copyLink}
                  >
                    {copied
                      ? t('caseManagementDetail.shareModal.copied', { defaultValue: 'Gekopieerd' })
                      : t('caseManagementDetail.shareModal.copy', { defaultValue: 'Kopieer' })}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('caseManagementDetail.shareModal.expires', {
                    defaultValue: 'Verloopt over {{hours}} uur als de link niet eerder wordt geopend.',
                    hours: expiresInHours,
                  })}
                </p>
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('caseManagementDetail.shareModal.close', { defaultValue: 'Sluiten' })}
            </Button>
            <Button
              variant="default"
              iconName="RefreshCw"
              iconPosition="left"
              loading={loading}
              onClick={onCreateLink}
            >
              {link
                ? t('caseManagementDetail.shareModal.createNew', { defaultValue: 'Nieuwe link maken' })
                : t('caseManagementDetail.shareModal.create', { defaultValue: 'Link maken' })}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
