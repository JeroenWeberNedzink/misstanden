import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { useAuth0 } from '@auth0/auth0-react';
import AuthContextNavigator from '../../components/navigation/AuthContextNavigator';
import TicketCardGrid from './components/TicketCardGrid';
import TicketsTable from './components/TicketsTable';
import QuickStats from './components/QuickStats';
import { ticketService } from '../../services/ticketService';
import { workflowService } from '../../services/workflowService';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import Select from '../../components/ui/Select';

const safeTrim = (v) => String(v ?? '').trim();
const safeLower = (v) => String(v ?? '').toLowerCase();

export default function HandlerDashboard() {
  const [tickets, setTickets] = useState([]);
  const { user } = useAuth0();
  const [currentHandlerId, setCurrentHandlerId] = useState(null);
  const [currentHandlerRole, setCurrentHandlerRole] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [severities, setSeverities] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [layout, setLayout] = useState('cards');
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const localeByLanguage = {
    en: 'en-GB',
    nl: 'nl-NL',
    fr: 'fr-FR',
    de: 'de-DE',
    pt: 'pt-PT',
  };
  const activeLanguage = String(i18n?.resolvedLanguage || i18n?.language || 'en')
    .toLowerCase()
    .split('-')[0];
  const activeLocale = localeByLanguage[activeLanguage] || 'en-GB';

  useEffect(() => {
    loadHandlerProfile();
  }, [user]);

  useEffect(() => {
    if (currentHandlerId) {
      loadData();
    }
  }, [currentHandlerId]);

  const normalizeStatuses = (raw) => {
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .filter((s) => s && safeTrim(s.code) && safeTrim(s.label))
      .map((s) => ({
        code: safeTrim(s.code),
        label: safeTrim(s.label),
        color: safeTrim(s.color) || null,
        order: Number.isFinite(Number(s.sortOrder ?? s.sort_order ?? 0)) ? Number(s.sortOrder ?? s.sort_order ?? 0) : 0,
        isTerminal: Boolean(s.isTerminal ?? s.is_terminal),
        nextCodes: Array.isArray(s.nextCodes)
          ? s.nextCodes
          : Array.isArray(s.next_codes)
          ? s.next_codes
          : [],
      }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  };

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

  const statusOptions = useMemo(() => {
    const byCode = new Map();
    (workflows || []).forEach((wf) => {
      normalizeStatuses(wf?.statuses).forEach((s) => {
        const key = safeLower(s.code);
        const existing = byCode.get(key);
        if (!existing || (s.order ?? 0) < (existing.order ?? 0)) {
          byCode.set(key, s);
        }
      });
    });
    return Array.from(byCode.values())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((s) => ({ value: s.code, label: s.label, color: s.color }));
  }, [workflows]);

  const severityOptions = useMemo(() => {
    const base = [{ value: 'all', label: t('handlerDashboard.filters.allPriorities') }];
    const list = Array.isArray(severities) ? severities : [];
    return base.concat(
      list.map((s) => ({
        value: s?.code || s?.severity_code || s?.id || s?.name || 'medium',
        label: s?.label || s?.name || s?.code || t('handlerDashboard.severity.medium'),
      }))
    );
  }, [severities, t]);

  const getStatusMetaForTicket = (ticket) => {
    const wfCode = safeTrim(ticket?.workflowType || ticket?.workflow_type);
    const statusCode = safeTrim(ticket?.statusCode || ticket?.status_code);
    const wfMap = workflowStatusMap.get(wfCode);
    return wfMap?.get(safeLower(statusCode)) || null;
  };

  const loadHandlerProfile = async () => {
    if (!user?.email) return;

    try {
      // Find handler by email
      const handlers = await ticketService.getAllHandlers();
      const handler = handlers?.find(h => h?.email?.toLowerCase() === user?.email?.toLowerCase());

      if (handler?.id) {
        setCurrentHandlerId(handler.id);

        // Determine role from roles array (supports both old 'role' and new 'roles' fields)
        let role = 'handler';
        if (handler.roles && Array.isArray(handler.roles)) {
          role = handler.roles.includes('ADMIN') ? 'admin' : 'handler';
        } else if (handler.role) {
          role = handler.role; // Fallback to old role field during migration
        }

        setCurrentHandlerRole(role);
        console.log('[HandlerDashboard] Handler loaded:', { id: handler.id, role, roles: handler.roles });
      } else {
        console.warn('Handler not found for user:', user.email);
      }
    } catch (err) {
      console.error('Error loading handler profile:', err);
    }
  };

  const loadData = async () => {
    if (!currentHandlerId) return;

    try {
      // Get tickets filtered by handler's assigned workflows
      const ticketsData = await ticketService?.getAllTickets({ handlerId: currentHandlerId });

      // Get handler's assigned workflows
      const { data: handlerWorkflows } = await supabase
        .from('handler_workflows')
        .select('workflow_id')
        .eq('handler_id', currentHandlerId);

      const workflowIds = (handlerWorkflows || []).map(hw => hw.workflow_id);

      console.log('[HandlerDashboard] Handler workflows:', workflowIds);

      // Get only workflows that the handler has access to
      let workflowsData = [];
      if (workflowIds.length > 0) {
        const { data: workflows } = await supabase
          .from('workflows')
          .select('*')
          .in('id', workflowIds)
          .eq('active', true)
          .order('display_order');

        workflowsData = ticketService.toCamelCase(workflows || []);
      }

      // Attach DB-driven statuses to workflows (from workflow_statuses table)
      const workflowsWithStatuses = await Promise.all(
        (workflowsData || []).map(async (wf) => {
          const statuses = await workflowService
            .getWorkflowStatuses(wf.id)
            .catch(() => []);
          return { ...wf, statuses };
        })
      );

      const severitiesData = await ticketService?.getSeverities();

      setTickets(ticketsData);
      setWorkflows(workflowsWithStatuses);
      setSeverities(severitiesData);
      setLastUpdated(new Date());

      console.log('[HandlerDashboard] Loaded data:', {
        tickets: ticketsData?.length || 0,
        workflows: workflowsWithStatuses?.length || 0,
        severities: severitiesData?.length || 0
      });
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  const handleStatusChange = async (ticketId, newStatusCode) => {
    try {
      await ticketService?.updateTicketStatus(ticketId, null, newStatusCode);
      await loadData();
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleAssignHandler = async (ticketId, handlerId) => {
    try {
      await ticketService?.assignHandler(ticketId, handlerId);
      await loadData();
    } catch (err) {
      console.error('Error assigning handler:', err);
    }
  };

  const handleAssignToMe = async (ticketId) => {
    if (!currentHandlerId) return;
    await handleAssignHandler(ticketId, currentHandlerId);
  };

  const getTicketHandlerId = (ticket) =>
    ticket?.handlerId ||
    ticket?.handler_id ||
    ticket?.assignedTo ||
    ticket?.assigned_to ||
    ticket?.handlers?.id ||
    null;

  const todayKey = useMemo(() => new Date().toDateString(), []);

  const stats = useMemo(() => {
    const list = tickets ?? [];
    const isOpen = (t) => !getStatusMetaForTicket(t)?.isTerminal;
    const isUnassigned = (t) => !getTicketHandlerId(t) && isOpen(t);
    const isHigh = (t) => t?.severityCode === 'critical' || t?.severityCode === 'high';
    const isMine = (t) => getTicketHandlerId(t) && getTicketHandlerId(t) === currentHandlerId;
    const isToday = (t) => {
      if (!t?.submittedAt) return false;
      return new Date(t.submittedAt).toDateString() === todayKey;
    };

    return {
      total: list.length,
      open: list.filter(isOpen).length,
      unassigned: list.filter(isUnassigned).length,
      highPriority: list.filter(isHigh).length,
      mineOpen: list.filter((t) => isOpen(t) && isMine(t)).length,
      today: list.filter(isToday).length,
    };
  }, [tickets, currentHandlerId, todayKey]);

  const applyQuickView = (key) => {
    if (key === 'all') {
      setScopeFilter('all');
      setStatusFilter('all');
      setSeverityFilter('all');
      return;
    }
    if (key === 'mine') {
      setScopeFilter('mine');
      setStatusFilter('all');
      setSeverityFilter('all');
      return;
    }
    if (key === 'unassigned') {
      setScopeFilter('unassigned');
      setStatusFilter('all');
      setSeverityFilter('all');
      return;
    }
    if (key === 'urgent') {
      setScopeFilter('urgent');
      setStatusFilter('all');
      setSeverityFilter('all');
      return;
    }
    if (key === 'today') {
      setScopeFilter('today');
      setStatusFilter('all');
      setSeverityFilter('all');
      return;
    }
    if (statusOptions.some((o) => o.value === key)) {
      setStatusFilter(key);
      setScopeFilter('all');
      return;
    }
  };

  // Filter tickets
  const filteredTickets = (tickets ?? []).filter((ticket) => {
    const matchesStatus = statusFilter === 'all' || ticket?.statusCode === statusFilter;
    const matchesSeverity = severityFilter === 'all' || ticket?.severityCode === severityFilter;

    const q = search.trim().toLowerCase();
    const matchesSearch = !q ||
      (ticket?.ticketNumber ?? '').toLowerCase().includes(q) ||
      (ticket?.description ?? '').toLowerCase().includes(q);

    const matchesScope = (() => {
      if (scopeFilter === 'all') return true;
      if (scopeFilter === 'mine') return getTicketHandlerId(ticket) === currentHandlerId;
      if (scopeFilter === 'unassigned') return !getTicketHandlerId(ticket);
      if (scopeFilter === 'urgent') return ticket?.severityCode === 'critical' || ticket?.severityCode === 'high';
      if (scopeFilter === 'today') {
        if (!ticket?.submittedAt) return false;
        return new Date(ticket.submittedAt).toDateString() === todayKey;
      }
      return true;
    })();

    return matchesStatus && matchesSeverity && matchesSearch && matchesScope;
  });

  const quickViews = [
    { key: 'all', label: t('handlerDashboard.quickViews.all'), count: stats.total, icon: 'LayoutGrid', tone: 'bg-muted text-muted-foreground' },
    { key: 'mine', label: t('handlerDashboard.quickViews.mine'), count: stats.mineOpen, icon: 'UserCheck', tone: 'bg-sky-50 text-sky-700' },
    { key: 'unassigned', label: t('handlerDashboard.quickViews.unassigned'), count: stats.unassigned, icon: 'UserX', tone: 'bg-amber-50 text-amber-700' },
    { key: 'urgent', label: t('handlerDashboard.quickViews.urgent'), count: stats.highPriority, icon: 'AlertTriangle', tone: 'bg-red-50 text-red-700' },
    { key: 'today', label: t('handlerDashboard.quickViews.today'), count: stats.today, icon: 'Calendar', tone: 'bg-emerald-50 text-emerald-700' },
  ];

  const lastUpdatedLabel = lastUpdated
    ? new Intl.DateTimeFormat(activeLocale, {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    }).format(lastUpdated)
    : null;

  return (
    <>
      <Helmet>
        <title>{t('handlerDashboard.title')} - Misstanden Portal</title>
        <meta name="description" content={t('handlerDashboard.title')} />
      </Helmet>

      <AuthContextNavigator>
        <div className="min-h-screen bg-background">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 lg:py-12">
            <div className="mb-8">
              <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 text-white p-6 md:p-8 shadow-xl">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-sky-200 mb-2">
                      {t('handlerDashboard.title')}
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold">
                      {t('handlerDashboard.welcomeMessage')} {user?.name || user?.email || t('handlerDashboard.fallbackUser')}
                    </h1>
                    <p className="text-sm md:text-base text-slate-200 mt-3 max-w-2xl">
                      {t('handlerDashboard.subtitle')}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-300 mt-4">
                      <Icon name="RefreshCw" size={14} />
                      <span>{t('handlerDashboard.lastUpdated')}</span>
                      <span className="font-semibold text-white">
                        {lastUpdatedLabel || t('handlerDashboard.notLoaded')}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full xl:w-auto">
                    {[
                      { label: t('handlerDashboard.summary.open'), value: stats.open, icon: 'Inbox' },
                      { label: t('handlerDashboard.summary.unassigned'), value: stats.unassigned, icon: 'UserX' },
                      { label: t('handlerDashboard.summary.urgent'), value: stats.highPriority, icon: 'AlertTriangle' },
                      { label: t('handlerDashboard.summary.today'), value: stats.today, icon: 'Calendar' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl bg-white/10 border border-white/10 px-4 py-3">
                        <div className="flex items-center justify-between text-xs text-slate-200 mb-2">
                          <span>{item.label}</span>
                          <Icon name={item.icon} size={14} />
                        </div>
                        <div className="text-2xl font-bold">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">


              <div className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-4">
                <div className="flex flex-col xl:flex-row gap-3 xl:items-center">
                  <div className="flex-1">
                    <div className="relative">
                      <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('handlerDashboard.searchPlaceholder')}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                  <div className="min-w-[220px]">
                    <Select
                      value={statusFilter}
                      onChange={(value) => setStatusFilter(value)}
                      options={[
                        { value: 'all', label: t('handlerDashboard.filters.allStatuses') },
                        ...statusOptions.map((o) => ({ value: o.value, label: o.label || o.value })),
                      ]}
                    />
                  </div>
                  <div className="min-w-[220px]">
                    <Select
                      value={severityFilter}
                      onChange={(value) => setSeverityFilter(value)}
                      options={severityOptions}
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-1">
                    <button
                      onClick={() => setLayout('cards')}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                        layout === 'cards' ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('handlerDashboard.layout.cards')}
                    </button>
                    <button
                      onClick={() => setLayout('table')}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                        layout === 'table' ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('handlerDashboard.layout.table')}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {quickViews.map((view) => (
                    <button
                      key={view.key}
                      onClick={() => applyQuickView(view.key)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                        scopeFilter === view.key ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon name={view.icon} size={14} />
                      <span>{view.label}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-foreground">
                        {view.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {layout === 'cards' ? (
                <TicketCardGrid
                  tickets={filteredTickets}
                  workflows={workflows}
                  currentHandlerId={currentHandlerId}
                  onQuickStatusChange={handleStatusChange}
                  onAssignToMe={handleAssignToMe}
                />
              ) : (
                <TicketsTable
                  tickets={filteredTickets}
                  workflows={workflows}
                  onStatusChange={handleStatusChange}
                  onAssignHandler={handleAssignHandler}
                  handlerOptions={[]}
                  userRole={currentHandlerRole}
                />
              )}
            </div>
          </div>
        </div>
      </AuthContextNavigator>
    </>
  );
}
