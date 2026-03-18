import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const PREVIEW_LIMIT = 5;

const ActionHistoryPanel = ({ history = [], actions = [], isLoading = false }) => {
  const { t, i18n } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const items = useMemo(() => {
    const src = Array.isArray(actions) && actions.length > 0 ? actions : history;

    return (Array.isArray(src) ? src : [])
      .map((raw, idx) => {
        const actionType = raw?.actionType ?? raw?.action_type ?? 'unknown';
        const performedBy = raw?.performedBy ?? raw?.performed_by ?? t('caseManagement.system');
        const timestamp = raw?.timestamp ?? raw?.createdAt ?? raw?.created_at ?? null;

        return {
          id: raw?.id ?? `${actionType}-${idx}`,
          actionType,
          action: raw?.action ?? raw?.title ?? t('caseManagementDetail.actionHistory.defaultAction'),
          description: raw?.description ?? raw?.details ?? '',
          performedBy,
          timestamp,
        };
      })
      .sort((a, b) => {
        const at = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bt = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
        return bt - at;
      });
  }, [history, actions, t]);

  useEffect(() => {
    if (items.length <= PREVIEW_LIMIT && isExpanded) {
      setIsExpanded(false);
    }
  }, [items.length, isExpanded]);

  const normalizeType = (type) => {
    const v = String(type || '').toLowerCase();
    if (!v) return 'unknown';

    if (v === 'status_update' || v === 'status_change') return 'status_change';
    if (v === 'stage_change' || v === 'current_stage') return 'stage_change';
    if (v === 'note_added' || v === 'comment' || v === 'ticket_comment') return 'note_added';
    if (v === 'assignment' || v === 'assigned' || v === 'handler_assigned') return 'assignment';
    if (v === 'message_sent' || v === 'message' || v === 'communication') return 'message_sent';
    if (v === 'attachment_added' || v === 'attachment' || v === 'upload') return 'attachment_added';
    if (v === 'priority_change' || v === 'severity_change') return 'priority_change';
    if (v === 'created' || v === 'create' || v === 'ticket_created') return 'created';

    return v;
  };

  const getActionIcon = (actionType) => {
    const icons = {
      status_change: 'RefreshCw',
      stage_change: 'GitBranch',
      note_added: 'FileEdit',
      assignment: 'UserPlus',
      message_sent: 'Send',
      attachment_added: 'Paperclip',
      priority_change: 'AlertTriangle',
      created: 'PlusCircle',
      unknown: 'Activity',
    };
    return icons[actionType] || icons.unknown;
  };

  const getAccent = (actionType) => {
    const map = {
      status_change: { text: 'text-accent' },
      stage_change: { text: 'text-primary' },
      note_added: { text: 'text-secondary' },
      assignment: { text: 'text-primary' },
      message_sent: { text: 'text-accent' },
      attachment_added: { text: 'text-warning' },
      priority_change: { text: 'text-error' },
      created: { text: 'text-success' },
      unknown: { text: 'text-muted-foreground' },
    };
    return map[actionType] || map.unknown;
  };

  const formatTimestamp = (value) => {
    if (!value) return '';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleString(i18n?.resolvedLanguage || i18n?.language || undefined, {
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

  const initialsFromName = (name) => {
    const safe = String(name || '').trim();
    if (!safe) return '?';
    const parts = safe.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
    return (first + last).toUpperCase() || '?';
  };

  const hasHiddenItems = items.length > PREVIEW_LIMIT;
  const visibleItems = hasHiddenItems && !isExpanded ? items.slice(0, PREVIEW_LIMIT) : items;
  const hiddenCount = Math.max(items.length - PREVIEW_LIMIT, 0);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon name="History" size={18} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
                {t('caseManagement.actionHistory')}
              </h2>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {isLoading
                  ? t('common.loading')
                  : `${items.length} ${items.length === 1
                    ? t('caseManagementDetail.actionHistory.singleAction')
                    : t('caseManagementDetail.actionHistory.multipleActions')}`}
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Icon name="List" size={12} />
            <span>{t('caseManagementDetail.actionHistory.log')}</span>
          </div>
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-12 rounded-md bg-muted animate-pulse" />
            <div className="h-12 rounded-md bg-muted animate-pulse" />
            <div className="h-12 rounded-md bg-muted animate-pulse" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-2 flex items-center justify-center">
              <Icon name="Inbox" size={20} className="opacity-70" />
            </div>
            <p className="text-sm">{t('caseManagementDetail.actionHistory.noActions')}</p>
            <p className="text-xs mt-1">{t('caseManagementDetail.actionHistory.changesAppear')}</p>
          </div>
        ) : (
          <div className="rounded-lg bg-background/40 overflow-hidden">
            <div className="divide-y divide-border">
              {visibleItems.map((item, index) => {
                const type = normalizeType(item?.actionType);
                const accent = getAccent(type);
                const initials = initialsFromName(item?.performedBy);
                const itemKey = `${item?.id || 'action'}_${item?.timestamp || 'na'}_${index}`;

                return (
                  <div key={itemKey} className="px-3 py-2.5 hover:bg-muted/30 transition">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-background/70 border border-border flex items-center justify-center flex-shrink-0">
                        <Icon name={getActionIcon(type)} size={15} className={accent.text} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{item?.action}</div>
                          <div className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                            {formatTimestamp(item?.timestamp) || '-'}
                          </div>
                        </div>

                        {item?.description ? (
                          <div className="mt-1 text-xs text-muted-foreground leading-snug whitespace-pre-wrap break-words">
                            {item.description}
                          </div>
                        ) : null}

                        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <div className="w-6 h-6 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center text-[10px] font-semibold">
                            {initials}
                          </div>
                          <span className="truncate">{item?.performedBy || t('caseManagement.system')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasHiddenItems && (
              <div className="px-3 py-2 border-t border-border bg-background/50">
                <button
                  type="button"
                  onClick={() => setIsExpanded((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  <Icon name={isExpanded ? 'ChevronUp' : 'ChevronDown'} size={13} />
                  {isExpanded
                    ? t('caseManagementDetail.actionHistory.showLess', { defaultValue: 'Show less' })
                    : t('caseManagementDetail.actionHistory.showMore', {
                        count: hiddenCount,
                        defaultValue: `Show ${hiddenCount} more`,
                      })}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActionHistoryPanel;
