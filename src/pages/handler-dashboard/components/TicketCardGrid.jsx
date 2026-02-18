import React, { useMemo, useEffect, useState } from 'react';
import Icon from '../../../components/AppIcon';
import { useTranslation } from 'react-i18next';
import TicketCard from './TicketCard';

const safeTrim = (v) => String(v ?? '').trim();
const safeLower = (v) => String(v ?? '').toLowerCase();

const parseWorkflowStatuses = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeStatuses = (raw) => {
  const arr = parseWorkflowStatuses(raw);
  return arr
    .filter((s) => s && safeTrim(s.code) && safeTrim(s.label))
    .map((s) => ({
      code: safeTrim(s.code),
      label: safeTrim(s.label),
      description: safeTrim(s.description) || '',
      color: safeTrim(s.color) || null,
      order: Number.isFinite(Number(s.order)) ? Number(s.order) : 999,
      isTerminal: Boolean(s.isTerminal ?? s.is_terminal),
      nextCodes: Array.isArray(s.nextCodes)
        ? s.nextCodes
        : Array.isArray(s.next_codes)
        ? s.next_codes
        : [],
    }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
};

const TicketCardGrid = ({ tickets, workflows = [], currentHandlerId, onQuickStatusChange, onAssignToMe }) => {
  const { t } = useTranslation();
  const workflowStatusMap = useMemo(() => {
    const map = new Map();
    (workflows || []).forEach((wf) => {
      const code = safeTrim(wf?.code);
      if (!code) return;

      const statuses = normalizeStatuses(wf?.statuses);
      const inner = new Map();
      statuses.forEach((s) => inner.set(safeLower(s.code), s));
      map.set(code, inner);
    });
    return map;
  }, [workflows]);

  // Sort by date (newest first) - simple default
  const sortedTickets = useMemo(() => {
    const list = Array.isArray(tickets) ? [...tickets] : [];
    return list.sort((a, b) => {
      const ad = a?.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const bd = b?.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return bd - ad;
    });
  }, [tickets]);

  if (!tickets || tickets.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-border">
        <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
          <Icon name="Inbox" size={32} className="text-muted-foreground opacity-50" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{t('handlerDashboard.table.noTicketsTitle')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('handlerDashboard.table.noTickets')}
        </p>
      </div>
    );  
  }

  return (
    <div className="space-y-4">
      {/* Simple header */}
      {/* <div className="flex items-center justify-between bg-white px-4 py-2 rounded-lg border border-border">
        <h2 className="text-xl font-semibold text-foreground">
          {tickets?.length} {tickets?.length === 1 ? 'Ticket' : 'Tickets'}
        </h2>
      </div> */}

      {/* Card Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {sortedTickets.map((ticket) => (
          <TicketCard
            key={ticket?.id}
            ticket={ticket}
            workflowStatusMap={workflowStatusMap}
            currentHandlerId={currentHandlerId}
            onQuickStatusChange={onQuickStatusChange}
            onAssignToMe={onAssignToMe}
          />
        ))}
      </div>
    </div>
  );
};

export default TicketCardGrid;
