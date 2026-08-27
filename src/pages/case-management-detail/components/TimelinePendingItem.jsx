import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const TimelinePendingItem = ({ variant = 'note' }) => {
  const { t } = useTranslation();
  const isMessage = variant === 'message';

  return (
    <div
      className={isMessage ? 'flex justify-end' : 'px-3 py-2.5'}
      role="status"
      aria-live="polite"
      data-testid={`${variant}-pending-item`}
    >
      <div className={isMessage ? 'w-[70%] max-w-md' : 'flex items-start gap-3'}>
        {!isMessage && <div className="h-8 w-8 flex-shrink-0 animate-pulse rounded-full bg-muted" />}
        <div className={isMessage ? 'space-y-1' : 'min-w-0 flex-1 space-y-2'}>
          <div className={isMessage ? 'ml-auto h-3 w-28 animate-pulse rounded bg-muted' : 'h-3 w-40 animate-pulse rounded bg-muted'} />
          <div className={isMessage
            ? 'rounded-xl rounded-tr-md border border-primary/20 bg-primary/15 px-3 py-3'
            : 'rounded-md border border-border bg-muted/30 px-3 py-3'}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon name="Loader" size={14} className="animate-spin" />
              <span>{t(isMessage ? 'caseManagementDetail.communication.sending' : 'caseManagementDetail.notes.saving')}</span>
            </div>
            <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimelinePendingItem;
