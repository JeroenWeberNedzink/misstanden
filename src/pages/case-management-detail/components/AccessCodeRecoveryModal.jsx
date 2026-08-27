import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';

const AccessCodeRecoveryModal = ({ isOpen, onClose, onGenerate }) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const resetAndClose = () => {
    if (isGenerating) return;
    setReason('');
    setAccessCode('');
    setCopied(false);
    setError('');
    onClose?.();
  };

  const handleGenerate = async () => {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10 || isGenerating) return;
    try {
      setIsGenerating(true);
      setError('');
      const result = await onGenerate?.(trimmedReason);
      const code = String(result?.accessCode || '');
      if (!/^\d{6}$/.test(code)) throw new Error(t('caseManagementDetail.accessCodeRecovery.failed'));
      setAccessCode(code);
    } catch (err) {
      setError(err?.message || t('caseManagementDetail.accessCodeRecovery.failed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(accessCode);
      setCopied(true);
    } catch {
      setError(t('caseManagementDetail.accessCodeRecovery.copyFailed'));
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm" onClick={resetAndClose} />
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="access-code-recovery-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <Icon name="Key" size={18} />
              </div>
              <div>
                <h2 id="access-code-recovery-title" className="text-base font-semibold text-foreground">
                  {t('caseManagementDetail.accessCodeRecovery.title')}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t('caseManagementDetail.accessCodeRecovery.subtitle')}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={resetAndClose} disabled={isGenerating} aria-label={t('common.cancel')}>
              <Icon name="X" size={20} />
            </Button>
          </div>

          <div className="space-y-4 p-4">
            {!accessCode ? (
              <>
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
                  <div className="flex items-start gap-2">
                    <Icon name="AlertTriangle" size={16} className="mt-0.5 shrink-0 text-warning" />
                    <div className="space-y-1">
                      <p className="font-medium">{t('caseManagementDetail.accessCodeRecovery.warningTitle')}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {t('caseManagementDetail.accessCodeRecovery.warningDescription')}
                      </p>
                    </div>
                  </div>
                </div>

                <Input
                  label={t('caseManagementDetail.accessCodeRecovery.reasonLabel')}
                  type="textarea"
                  rows={3}
                  value={reason}
                  maxLength={500}
                  placeholder={t('caseManagementDetail.accessCodeRecovery.reasonPlaceholder')}
                  description={t('caseManagementDetail.accessCodeRecovery.auditNotice')}
                  onChange={(event) => {
                    setReason(event?.target?.value || '');
                    setError('');
                  }}
                  required
                  error={error}
                />

                <div className="flex gap-2">
                  <Button
                    variant="warning"
                    iconName="Key"
                    iconPosition="left"
                    onClick={handleGenerate}
                    loading={isGenerating}
                    disabled={isGenerating || reason.trim().length < 10}
                    fullWidth
                  >
                    {t('caseManagementDetail.accessCodeRecovery.generate')}
                  </Button>
                  <Button variant="outline" onClick={resetAndClose} disabled={isGenerating}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-center">
                  <p className="text-sm font-medium text-foreground">
                    {t('caseManagementDetail.accessCodeRecovery.generatedTitle')}
                  </p>
                  <code className="mt-3 block select-all text-3xl font-bold tracking-[0.3em] text-foreground">
                    {accessCode}
                  </code>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {t('caseManagementDetail.accessCodeRecovery.oneTimeNotice')}
                  </p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex gap-2">
                  <Button
                    variant="default"
                    iconName={copied ? 'Check' : 'Copy'}
                    iconPosition="left"
                    onClick={handleCopy}
                    fullWidth
                  >
                    {copied
                      ? t('caseManagementDetail.accessCodeRecovery.copied')
                      : t('caseManagementDetail.accessCodeRecovery.copy')}
                  </Button>
                  <Button variant="outline" onClick={resetAndClose}>
                    {t('caseManagementDetail.accessCodeRecovery.done')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default AccessCodeRecoveryModal;
