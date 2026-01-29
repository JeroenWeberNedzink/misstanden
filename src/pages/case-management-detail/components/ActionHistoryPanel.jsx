import React, { useMemo } from 'react';
import Icon from '../../../components/AppIcon';

/**
 * Compact ActionHistoryPanel
 * - same props: history/actions
 * - same normalization mapping
 * - more “log-like” list, less padding/borders
 */
const ActionHistoryPanel = ({ history = [], actions = [] }) => {
  const items = useMemo(() => {
    const src = (Array.isArray(actions) && actions.length > 0) ? actions : history;
    return (Array.isArray(src) ? src : [])
      .map((raw, idx) => {
        const actionType = raw?.actionType ?? raw?.action_type ?? 'unknown';
        const performedBy = raw?.performedBy ?? raw?.performed_by ?? 'Systeem';
        const timestamp = raw?.timestamp ?? raw?.createdAt ?? raw?.created_at ?? null;

        return {
          id: raw?.id ?? `${actionType}-${idx}`,
          actionType,
          action: raw?.action ?? raw?.title ?? 'Actie',
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
  }, [history, actions]);

  const normalizeType = (type) => {
    const t = String(type || '').toLowerCase();
    if (!t) return 'unknown';

    if (t === 'status_update' || t === 'status_change') return 'status_change';
    if (t === 'stage_change' || t === 'current_stage') return 'stage_change';
    if (t === 'note_added' || t === 'comment' || t === 'ticket_comment') return 'note_added';
    if (t === 'assignment' || t === 'assigned' || t === 'handler_assigned') return 'assignment';
    if (t === 'message_sent' || t === 'message' || t === 'communication') return 'message_sent';
    if (t === 'attachment_added' || t === 'attachment' || t === 'upload') return 'attachment_added';
    if (t === 'priority_change' || t === 'severity_change') return 'priority_change';
    if (t === 'created' || t === 'create' || t === 'ticket_created') return 'created';

    return t;
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

  // Compact accent (no rings, no big cards)
  const getAccent = (actionType) => {
    const map = {
      status_change: { text: 'text-accent', pillBg: 'bg-accent/10', dot: 'bg-accent' },
      stage_change: { text: 'text-primary', pillBg: 'bg-primary/10', dot: 'bg-primary' },
      note_added: { text: 'text-secondary', pillBg: 'bg-secondary/10', dot: 'bg-secondary' },
      assignment: { text: 'text-primary', pillBg: 'bg-primary/10', dot: 'bg-primary' },
      message_sent: { text: 'text-accent', pillBg: 'bg-accent/10', dot: 'bg-accent' },
      attachment_added: { text: 'text-warning', pillBg: 'bg-warning/10', dot: 'bg-warning' },
      priority_change: { text: 'text-error', pillBg: 'bg-error/10', dot: 'bg-error' },
      created: { text: 'text-success', pillBg: 'bg-success/10', dot: 'bg-success' },
      unknown: { text: 'text-muted-foreground', pillBg: 'bg-muted/40', dot: 'bg-muted-foreground' },
    };
    return map[actionType] || map.unknown;
  };

  const formatTimestamp = (value) => {
    if (!value) return '';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleString('nl-NL', {
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

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon name="History" size={18} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
                Actiegeschiedenis
              </h2>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {items.length} {items.length === 1 ? 'actie' : 'acties'}
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Icon name="List" size={12} />
            <span>Log</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {items.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-2 flex items-center justify-center">
              <Icon name="Inbox" size={20} className="opacity-70" />
            </div>
            <p className="text-sm">Nog geen acties</p>
            <p className="text-xs mt-1">Wijzigingen verschijnen hier automatisch.</p>
          </div>
        ) : (
          <div className="rounded-lg bg-background/40 overflow-hidden">
            <div className="divide-y divide-border">
              {items.map((item) => {
                const type = normalizeType(item?.actionType);
                const accent = getAccent(type);
                const initials = initialsFromName(item?.performedBy);

                return (
                  <div key={item?.id} className="px-3 py-2.5 hover:bg-muted/30 transition">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Small icon badge */}
                      <div className="w-8 h-8 rounded-md bg-background/70 border border-border flex items-center justify-center flex-shrink-0">
                        <Icon name={getActionIcon(type)} size={15} className={accent.text} />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Row 1: title + timestamp */}
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {item?.action}
                          </div>

                          <div className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                            {formatTimestamp(item?.timestamp) || '—'}
                          </div>
                        </div>

                        {/* Row 2: description (only if present) */}
                        {item?.description ? (
                          <div className="mt-1 text-xs text-muted-foreground leading-snug whitespace-pre-wrap break-words">
                            {item.description}
                          </div>
                        ) : null}

                        {/* Row 3: performer */}
                        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <div className="w-6 h-6 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center text-[10px] font-semibold">
                            {initials}
                          </div>
                          <span className="truncate">{item?.performedBy || 'Systeem'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActionHistoryPanel;