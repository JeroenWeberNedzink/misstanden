import React, { useState, useEffect } from 'react';
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

  // Filter tickets
  const filteredTickets = (tickets ?? []).filter((ticket) => {
    const matchesStatus = statusFilter === 'all' || ticket?.statusCode === statusFilter;
    const matchesSeverity = severityFilter === 'all' || ticket?.severityCode === severityFilter;

    const q = search.trim().toLowerCase();
    const matchesSearch = !q ||
      (ticket?.ticketNumber ?? '').toLowerCase().includes(q) ||
      (ticket?.description ?? '').toLowerCase().includes(q);

    return matchesStatus && matchesSeverity && matchesSearch;
  });


  return (
    <>
      <Helmet>
        <title>{t('handlerDashboard.title')} - Misstanden Portal</title>
        <meta name="description" content={t('handlerDashboard.title')} />
      </Helmet>

      <AuthContextNavigator>
        <div className="min-h-screen bg-background">
          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 lg:py-12">
            <div className="mb-6 md:mb-8">
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 text-primary">
                {t('handlerDashboard.welcomeMessage')} {user?.name || user?.email || 'User'}
              </h1>
              <p className="text-sm md:text-base text-muted-foreground">
                {t('handlerDashboard.subtitle')}
              </p>
            </div>

            <div className="space-y-6">
              <QuickStats tickets={tickets} />

              <SimpleFilter
                search={search}
                onSearchChange={setSearch}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                severityFilter={severityFilter}
                onSeverityChange={setSeverityFilter}
              />

              <TicketCardGrid tickets={filteredTickets} />
            </div>
          </div>
        </div>
      </AuthContextNavigator>
    </>
  );
}