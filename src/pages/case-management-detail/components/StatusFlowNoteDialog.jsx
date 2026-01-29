import React, { useState } from 'react';
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
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    const trimmedNote = safeTrim(note);
    if (!trimmedNote) {
      setError('Notitie is verplicht.');
      return;
    }

    onConfirm?.({
      statusCode: selectedStatus.code,
      note: trimmedNote,
    });

    // Reset
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
      {/* Backdrop */}
      <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm" onClick={handleCancel} />

      {/* Dialog */}
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
        <div
          className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon name="ArrowRight" size={18} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground truncate">
                  Status wijzigen
                </h2>
                <p className="text-xs text-muted-foreground truncate">
                  {currentStatus || 'Onbekend'} → {selectedStatus?.label}
                </p>
              </div>
            </div>

            <Button variant="ghost" size="icon" onClick={handleCancel}>
              <Icon name="X" size={20} />
            </Button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4">
            {/* Selected Status Info */}
            <div className="p-3 bg-muted/30 border border-border rounded-lg">
              <div className="text-sm font-semibold text-foreground mb-1">
                {selectedStatus?.label}
              </div>
              {selectedStatus?.description && (
                <div className="text-xs text-muted-foreground">
                  {selectedStatus.description}
                </div>
              )}

              {/* Expected Duration */}
              {selectedStatus?.expectedDurationDays && (
                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                  <Icon name="Clock" size={12} />
                  <span>Verwachte doorlooptijd: <span className="font-medium text-foreground">{selectedStatus.expectedDurationDays} dagen</span></span>
                </div>
              )}

              {/* Contact Person */}
              {selectedStatus?.contactPersonName && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <div className="text-xs font-medium text-foreground mb-1">
                    Contactpersoon
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedStatus.contactPersonName}
                  </div>
                  {selectedStatus.contactPersonEmail && (
                    <div className="text-xs text-primary mt-0.5">
                      {selectedStatus.contactPersonEmail}
                    </div>
                  )}
                  {selectedStatus.contactPersonPhone && (
                    <div className="text-xs text-primary mt-0.5">
                      {selectedStatus.contactPersonPhone}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Note Input */}
            <div>
              <Input
                label="Notitie (verplicht)"
                type="textarea"
                placeholder="Bijv. 'Onderzoek afgerond, rapport opgesteld'"
                value={note}
                onChange={(e) => {
                  setNote(e?.target?.value || '');
                  setError('');
                }}
                description="Leg uit waarom deze statuswijziging wordt doorgevoerd"
                required
                error={error}
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="default"
                iconName="Check"
                iconPosition="left"
                onClick={handleConfirm}
                disabled={!safeTrim(note)}
                fullWidth
              >
                Bevestigen
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                Annuleren
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
