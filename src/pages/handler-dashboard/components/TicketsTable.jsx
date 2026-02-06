import React, { useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import TicketTableRow from './TicketTableRow';

// ---- helpers (local) ----
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

const TicketsTable = ({ tickets, workflows = [], onStatusChange, onAssignHandler, handlerOptions, userRole }) => {
  const [sortConfig, setSortConfig] = useState({ key: 'submitted_at', direction: 'desc' });

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev?.key === key && prev?.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // ✅ Build a workflow -> statusCode -> statusMeta map, based on DB-driven workflow statuses
  const workflowStatusMap = useMemo(() => {
    const map = new Map(); // workflowCode -> Map(statusCodeLower -> meta)
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

  const sortedTickets = useMemo(() => {
    const list = Array.isArray(tickets) ? [...tickets] : [];
    const key = sortConfig?.key;

    return list.sort((a, b) => {
      let aValue = a?.[key];
      let bValue = b?.[key];

      // Handle nested handlers object
      if (key === 'handlers') {
        aValue = a?.handlers?.name || '';
        bValue = b?.handlers?.name || '';
      }

      // Dates: compare timestamps properly
      if (key === 'submitted_at' || key === 'submittedAt') {
        const ad = aValue ? new Date(aValue).getTime() : 0;
        const bd = bValue ? new Date(bValue).getTime() : 0;
        return sortConfig.direction === 'asc' ? ad - bd : bd - ad;
      }

      // Default string/number compare
      const av = (aValue ?? '').toString().toLowerCase();
      const bv = (bValue ?? '').toString().toLowerCase();

      if (av === bv) return 0;
      if (sortConfig.direction === 'asc') return av > bv ? 1 : -1;
      return av < bv ? 1 : -1;
    });
  }, [tickets, sortConfig]);

  const SortableHeader = ({ label, sortKey }) => (
    <th
      className="px-4 py-4 text-left cursor-pointer hover:bg-muted/50 transition-smooth"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <Icon
          name={sortConfig?.key === sortKey && sortConfig?.direction === 'asc' ? 'ArrowUp' : 'ArrowDown'}
          size={16}
          color={sortConfig?.key === sortKey ? 'var(--color-primary)' : 'var(--color-muted-foreground)'}
        />
      </div>
    </th>
  );

  if (!tickets || tickets.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
          <Icon name="Inbox" size={32} color="var(--color-muted-foreground)" />
        </div>
        <h3 className="text-lg md:text-xl font-semibold text-foreground mb-2">Geen Tickets Gevonden</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Er zijn geen tickets die overeenkomen met de geselecteerde filters.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between mb-6 px-4 md:px-0">
        <h2 className="text-xl md:text-2xl font-semibold text-foreground">
          Tickets Overzicht
          <span className="ml-3 text-sm font-normal text-muted-foreground">
            ({tickets?.length} {tickets?.length === 1 ? 'ticket' : 'tickets'})
          </span>
        </h2>
        <div className="hidden md:flex items-center gap-2">
          <Button variant="outline" size="sm" iconName="Download" iconPosition="left">
            Exporteer
          </Button>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-4 w-12"></th>
              <SortableHeader label="Ticket #" sortKey="ticket_number" />
              <SortableHeader label="Datum" sortKey="submitted_at" />
              <SortableHeader label="Workflow" sortKey="workflow_type" />
              <SortableHeader label="Ernst" sortKey="severity_code" />
              {/* Sort by status_code (still works) */}
              <SortableHeader label="Status" sortKey="status_code" />
              <SortableHeader label="Handler" sortKey="handlers" />
              <th className="px-4 py-4 text-left">
                <span className="text-sm font-semibold text-foreground">Acties</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedTickets?.map((ticket) => (
              <TicketTableRow
                key={ticket?.id}
                ticket={ticket}
                onStatusChange={onStatusChange}
                onAssignHandler={onAssignHandler}
                handlerOptions={handlerOptions}
                userRole={userRole}
                viewMode="desktop"
                workflowStatusMap={workflowStatusMap}   // ✅ pass map
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="lg:hidden space-y-4">
        {sortedTickets?.map((ticket) => (
          <TicketTableRow
            key={ticket?.id}
            ticket={ticket}
            onStatusChange={onStatusChange}
            onAssignHandler={onAssignHandler}
            handlerOptions={handlerOptions}
            userRole={userRole}
            viewMode="mobile"
            workflowStatusMap={workflowStatusMap}   // ✅ pass map
          />
        ))}
      </div>
    </div>
  );
};

export default TicketsTable;
