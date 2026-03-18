import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';

const safeTrim = (v) => String(v ?? '').trim();

export default function StatusFlowNoteDialog({
  isOpen,
  onClose,
  selectedStatus,
  currentStatus,
  onConfirm,
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    const trimmedNote = safeTrim(note);
    if (!trimmedNote) {
      setError(t('caseManagementDetail.statusFlow.noteRequired'));
      return;
    }

    onConfirm?.({
      statusCode: selectedStatus.code,
      note: trimmedNote,
    });

    setNote('');
    setError('');
  };

  const handleCancel = () => {
    setNote('');
    setError('');
    onClose?.();
  };

  return (
    <>
      <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm" onClick={handleCancel} />

      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
        <div
          className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon name="ArrowRight" size={18} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground truncate">
                  {t('caseManagementDetail.statusFlow.changeStatus')}
                </h2>
                <p className="text-xs text-muted-foreground truncate">
                  {currentStatus || t('caseManagementDetail.common.unknown')} {'->'} {selectedStatus?.label}
                </p>
              </div>
            </div>

            <Button variant="ghost" size="icon" onClick={handleCancel}>
              <Icon name="X" size={20} />
            </Button>
          </div>

          <div className="p-4 space-y-4">
            <div className="p-3 bg-muted/30 border border-border rounded-lg">
              <div className="text-sm font-semibold text-foreground mb-1">{selectedStatus?.label}</div>
              {selectedStatus?.description && <div className="text-xs text-muted-foreground">{selectedStatus.description}</div>}

              {selectedStatus?.expectedDurationDays && (
                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                  <Icon name="Clock" size={12} />
                  <span>
                    {t('caseManagementDetail.statusFlow.expectedLeadTime')}:{' '}
                    <span className="font-medium text-foreground">
                      {selectedStatus.expectedDurationDays} {t('caseManagementDetail.sla.days')}
                    </span>
                  </span>
                </div>
              )}

            </div>

            <Input
              label={t('caseManagementDetail.statusFlow.noteLabel')}
              type="textarea"
              placeholder={t('caseManagementDetail.statusFlow.notePlaceholder')}
              value={note}
              onChange={(e) => {
                setNote(e?.target?.value || '');
                setError('');
              }}
              description={t('caseManagementDetail.statusFlow.noteDescription')}
              required
              error={error}
              rows={3}
            />

            <div className="flex gap-2">
              <Button
                variant="default"
                iconName="Check"
                iconPosition="left"
                onClick={handleConfirm}
                disabled={!safeTrim(note)}
                fullWidth
              >
                {t('caseManagementDetail.common.confirm')}
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
