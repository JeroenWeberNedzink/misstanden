import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import { toDateSafe } from '../../../utils/slaUtils';

const iconByType = {
  created: 'PlusCircle',
  status_update: 'RefreshCw',
  status_change: 'RefreshCw',
  stage_change: 'GitBranch',
  note_added: 'FileEdit',
  assignment: 'UserPlus',
  message_sent: 'Send',
  attachment_added: 'Paperclip',
};

const normalizeType = (value) => String(value || '').toLowerCase();

const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
};

const ActionHistoryCard = ({ actions = [] }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.resolvedLanguage || i18n?.language;

  const formatDate = (value) => {
    if (!value) return '-';
    const d = toDateSafe(value);
    if (!d) return '-';
    return d.toLocaleString(locale || undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon name="History" size={18} className="text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground">{t('ticketDetailsView.activity.title')}</h3>
          </div>
          <span className="text-xs text-muted-foreground">{actions.length}</span>
        </div>
      </div>

      <div className="p-4">
        {!actions.length ? (
          <p className="text-sm text-muted-foreground">{t('ticketDetailsView.activity.empty')}</p>
        ) : (
          <div className="space-y-2">
            {actions.map((item, idx) => {
              const type = normalizeType(item?.actionType);
              const icon = iconByType[type] || 'Activity';

              return (
                <div key={`${item?.id || 'action'}-${idx}`} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-background border border-border flex items-center justify-center">
                      <Icon name={icon} size={14} className="text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{item?.action || t('ticketDetailsView.activity.defaultAction')}</p>
                        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{formatDate(item?.timestamp)}</span>
                      </div>

                      {item?.description ? (
                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">{item.description}</p>
                      ) : null}

                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary/90 text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                          {initials(item?.performedBy)}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">{item?.performedBy || t('ticketDetailsView.activity.system')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActionHistoryCard;
