import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { useAuth0 } from '@auth0/auth0-react';
import AuthContextNavigator from '../../components/navigation/AuthContextNavigator';
import TicketCardGrid from './components/TicketCardGrid';
import QuickStats from './components/QuickStats';
import SimpleFilter from './components/SimpleFilter';
import { ticketService } from '../../services/ticketService';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/AppIcon';

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
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    loadHandlerProfile();
  }, [user]);

  useEffect(() => {
    if (currentHandlerId) {
      loadData();
    }
  }, [currentHandlerId]);

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

      const severitiesData = await ticketService?.getSeverities();

      setTickets(ticketsData);
      setWorkflows(workflowsData);
      setSeverities(severitiesData);
      setLastUpdated(new Date());

      console.log('[HandlerDashboard] Loaded data:', {
        tickets: ticketsData?.length || 0,
        workflows: workflowsData?.length || 0,
        severities: severitiesData?.length || 0
      });
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  const handleStatusChange = async (ticketId, newStatusCode) => {
    try {
      // Map status codes to display labels
      const statusLabels = {
        'new': 'Nieuw',
        'in_progress': 'In Behandeling',
        'resolved': 'Opgelost',
        'closed': 'Gesloten'
      };

      const statusLabel = statusLabels[newStatusCode] || newStatusCode;
      await ticketService?.updateTicketStatus(ticketId, statusLabel, newStatusCode);
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
    const isOpen = (t) => t?.statusCode !== 'resolved' && t?.statusCode !== 'closed';
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
    if (key === 'new') {
      setStatusFilter('new');
      setScopeFilter('all');
      return;
    }
    if (key === 'in_progress') {
      setStatusFilter('in_progress');
      setScopeFilter('all');
      return;
    }
    if (key === 'resolved') {
      setStatusFilter('resolved');
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
    { key: 'all', label: 'Alles', count: stats.total, icon: 'LayoutGrid', tone: 'bg-muted text-muted-foreground' },
    { key: 'mine', label: 'Mijn Open', count: stats.mineOpen, icon: 'UserCheck', tone: 'bg-sky-50 text-sky-700' },
    { key: 'unassigned', label: 'Onbehandeld', count: stats.unassigned, icon: 'UserX', tone: 'bg-amber-50 text-amber-700' },
    { key: 'urgent', label: 'Urgent', count: stats.highPriority, icon: 'AlertTriangle', tone: 'bg-red-50 text-red-700' },
    { key: 'today', label: 'Vandaag', count: stats.today, icon: 'Calendar', tone: 'bg-emerald-50 text-emerald-700' },
    { key: 'new', label: 'Nieuw', count: tickets.filter(t => t?.statusCode === 'new').length, icon: 'Sparkles', tone: 'bg-blue-50 text-blue-700' },
  ];

  const lastUpdatedLabel = lastUpdated
    ? new Intl.DateTimeFormat('nl-NL', {
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
            <div className="mb-6 md:mb-8 space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold text-foreground text-primary">
                    {t('handlerDashboard.welcomeMessage')} {user?.name || user?.email || 'User'}
                  </h1>
                  <p className="text-sm md:text-base text-muted-foreground mt-2">
                    {t('handlerDashboard.subtitle')}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon name="RefreshCw" size={14} />
                  <span>Laatste update:</span>
                  <span className="font-semibold text-foreground">
                    {lastUpdatedLabel || 'Nog niet geladen'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-border p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Queue Focus</h2>
                      <p className="text-xs text-muted-foreground">Snel schakelen naar de juiste wachtrij</p>
                    </div>
                    <Icon name="Target" size={18} className="text-primary" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {quickViews.map((view) => (
                      <button
                        key={view.key}
                        onClick={() => applyQuickView(view.key)}
                        className={`flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-left text-sm transition-all hover:shadow-sm ${
                          scopeFilter === view.key || statusFilter === view.key ? 'ring-2 ring-primary/30' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${view.tone}`}>
                            <Icon name={view.icon} size={16} />
                          </span>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{view.label}</span>
                            <span className="text-xs text-muted-foreground">{view.count} tickets</span>
                          </div>
                        </div>
                        <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
                      </button>
                    ))}
                  </div>
              </div>
{/* 
              <SimpleFilter
                search={search}
                onSearchChange={setSearch}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                severityFilter={severityFilter}
                onSeverityChange={setSeverityFilter}
                scopeFilter={scopeFilter}
                onScopeChange={setScopeFilter}
              /> */}

              <TicketCardGrid
                tickets={filteredTickets}
                currentHandlerId={currentHandlerId}
                onQuickStatusChange={handleStatusChange}
                onAssignToMe={handleAssignToMe}
              />
            </div>
          </div>
        </div>
      </AuthContextNavigator>
    </>
  );
}
