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
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import Select from '../../components/ui/Select';
import {
  getApiAccessToken,
  getOptionalApiAccessToken,
  isRecoverableAuth0SessionError,
  isValidApiAudience,
} from '../../lib/auth0ApiToken';
import { normalizeHandlerRecord } from '../../services/utils/handlerNormalization';

const safeTrim = (v) => String(v ?? '').trim();
const safeLower = (v) => String(v ?? '').toLowerCase();
const readCachedHandlerProfile = () => {
  try {
    const cached = sessionStorage.getItem('handler_profile');
    return cached ? normalizeHandlerRecord(JSON.parse(cached)) : null;
  } catch {
    return null;
  }
};
const parseRoles = (rawRoles) => {
  if (Array.isArray(rawRoles)) return rawRoles.map((r) => String(r || '').trim()).filter(Boolean);
  if (typeof rawRoles === 'string') {
    const trimmed = rawRoles.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((r) => String(r || '').trim()).filter(Boolean);
    } catch {
      // Continue with scalar role fallback.
    }
    return [trimmed];
  }
  return [];
};


export default function HandlerDashboard() {
  const [tickets, setTickets] = useState([]);
  const { user, isLoading: auth0Loading, getAccessTokenSilently } = useAuth0();
  const [currentHandlerId, setCurrentHandlerId] = useState(null);
  const [currentHandlerName, setCurrentHandlerName] = useState('');
  const [currentHandlerRole, setCurrentHandlerRole] = useState(null);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [assigningTicketIds, setAssigningTicketIds] = useState(new Set());
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
  }, [user, auth0Loading]);

  useEffect(() => {
    if (currentHandlerId && currentHandlerRole) {
      loadData();
    }
  }, [currentHandlerId, currentHandlerRole]);

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
    if (!user) {
      // Keep dashboard skeleton visible while Auth0 is still hydrating the session.
      if (!auth0Loading) {
        setIsDataLoading(false);
      }
      return;
    }

    try {
      let handler = null;
      let softAuthFailure = false;

      // Preferred flow: resolve handler context via authenticated backend endpoint.
      let token = await getOptionalApiAccessToken(getAccessTokenSilently);
      if (!token && isValidApiAudience()) {
        try {
          token = await getApiAccessToken(getAccessTokenSilently, { cacheMode: 'off' });
        } catch (tokenError) {
          if (isRecoverableAuth0SessionError(tokenError)) {
            softAuthFailure = true;
            if (import.meta.env.DEV) {
              console.debug('[HandlerDashboard] Auth0 API token unavailable for handler bootstrap; using cached handler profile if available', {
                message: tokenError?.message || String(tokenError),
                error: tokenError?.error || null,
              });
            }
          } else {
            throw tokenError;
          }
        }
      }

      try {
        if (!token) {
          throw new Error('Auth0 API token unavailable');
        }
        const resp = await fetch('/api/me.api.php', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await resp.json().catch(() => null);
        if (resp.ok && payload?.success && payload?.data?.handler) {
          handler = payload.data.handler;
          try {
            sessionStorage.setItem('handler_profile', JSON.stringify(normalizeHandlerRecord(handler)));
          } catch {
            // Ignore session storage write errors.
          }
        }
      } catch (apiErr) {
        if (!softAuthFailure) {
          console.warn('[HandlerDashboard] /api/me.api.php lookup failed, using cached handler profile if available', apiErr);
        }
      }

      if (!handler) {
        const cachedProfile = readCachedHandlerProfile();
        const cachedEmail = safeLower(cachedProfile?.email);
        const userEmail = safeLower(user?.email);
        const cachedUserId = safeTrim(cachedProfile?.user_id);
        const currentUserId = safeTrim(user?.sub);
        if (
          (cachedUserId && currentUserId && cachedUserId === currentUserId) ||
          (cachedEmail && userEmail && cachedEmail === userEmail)
        ) {
          handler = cachedProfile;
        }
      }

      if (!handler?.id) {
        console.warn('[HandlerDashboard] Handler not found for current user', { email: user?.email, sub: user?.sub });
        setIsDataLoading(false);
        return;
      }

      const roles = parseRoles(handler.roles);
      const role = roles.some((r) => r.toUpperCase() === 'ADMIN') ? 'admin' : 'handler';
      setCurrentHandlerId(handler.id);
      setCurrentHandlerName(String(handler?.name || user?.name || user?.email || '').trim());
      setCurrentHandlerRole(role);
      console.log('[HandlerDashboard] Handler loaded:', { id: handler.id, role, roles });
    } catch (err) {
      console.error('Error loading handler profile:', err);
      setIsDataLoading(false);
    }
  };

  const loadData = async ({ showLoadingSkeleton = true } = {}) => {
    if (!currentHandlerId) return;

    if (showLoadingSkeleton) {
      setIsDataLoading(true);
    }

    try {
      const isAdmin = currentHandlerRole === 'admin';
      const ticketsData = await ticketService?.getAllTickets(isAdmin ? {} : { handlerId: currentHandlerId });

      const allWorkflows = await workflowService.getWorkflows(false).catch((error) => {
        console.warn('[HandlerDashboard] Could not load workflows from API:', error);
        return [];
      });

      let workflowsData = Array.isArray(allWorkflows) ? [...allWorkflows] : [];
      if (isAdmin) {
        workflowsData = workflowsData.filter((workflow) => workflow?.active !== false);
      } else {
        const workflowIds = await workflowService.getHandlerWorkflowIds(currentHandlerId).catch((error) => {
          console.warn('[HandlerDashboard] Could not load handler workflow assignments, deriving from tickets:', error);
          return [];
        });
        if (workflowIds.length > 0) {
          const allowedIds = new Set(workflowIds.map((id) => safeTrim(id)).filter(Boolean));
          workflowsData = workflowsData.filter((workflow) => allowedIds.has(safeTrim(workflow?.id)));
        } else {
          const workflowCodes = Array.from(
            new Set((ticketsData || []).map((t) => safeTrim(t?.workflowType)).filter(Boolean))
          );
          if (workflowCodes.length > 0) {
            const allowedCodes = new Set(workflowCodes.map((code) => safeTrim(code)).filter(Boolean));
            workflowsData = workflowsData.filter((workflow) => allowedCodes.has(safeTrim(workflow?.code)));
          } else {
            workflowsData = [];
          }
        }
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
    } finally {
      if (showLoadingSkeleton) {
        setIsDataLoading(false);
      }
    }
  };

  const handleStatusChange = async (ticketId, newStatusCode) => {
    try {
      await ticketService?.updateTicketStatus(ticketId, null, newStatusCode);
      await loadData({ showLoadingSkeleton: false });
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleAssignHandler = async (ticketId, handlerId) => {
    if (!ticketId || !handlerId) return;
    const ticketKey = String(ticketId);
    if (assigningTicketIds.has(ticketKey)) return;

    setAssigningTicketIds((prev) => {
      const next = new Set(prev);
      next.add(ticketKey);
      return next;
    });

    try {
      await ticketService?.assignHandler(ticketId, handlerId, null, { currentHandlerId });
      await loadData({ showLoadingSkeleton: false });
    } catch (err) {
      console.error('Error assigning handler:', err);
    } finally {
      setAssigningTicketIds((prev) => {
        const next = new Set(prev);
        next.delete(ticketKey);
        return next;
      });
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
        <div className="min-h-screen app-page-gradient bg-background">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 lg:py-12">
            <div className="mb-8">
              <div className="rounded-3xl bg-gradient-to-br from-sky-800 via-sky-700 to-sky-600 text-white p-6 md:p-8 shadow-xl">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-sky-200 mb-2">
                      {t('handlerDashboard.welcomeMessage')} {user?.name || user?.email || t('handlerDashboard.fallbackUser')}
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold">
                      {t('handlerDashboard.title')}
                    </h1>
                    <p className="text-sm md:text-base text-slate-200 mt-3 max-w-2xl">
                      {/* {t('handlerDashboard.subtitle')} */}
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
                  isLoading={isDataLoading}
                  workflows={workflows}
                  currentHandlerId={currentHandlerId}
                  currentHandlerName={currentHandlerName}
                  assigningTicketIds={assigningTicketIds}
                  onQuickStatusChange={handleStatusChange}
                  onAssignToMe={handleAssignToMe}
                />
              ) : (
                <TicketsTable
                  tickets={filteredTickets}
                  isLoading={isDataLoading}
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
