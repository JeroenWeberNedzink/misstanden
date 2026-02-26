import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import AuthContextNavigator from '../../components/navigation/AuthContextNavigator';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import PriorityFilters from './components/PriorityFilters';
import PriorityCasesTable from './components/PriorityCasesTable';
import { priorityWorkflowService } from '../../services/priorityWorkflowService';

export default function HandlerPriorityWorkflow() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [cases, setCases] = useState([]);
  const [handlers, setHandlers] = useState([]);
  const { t } = useTranslation();
  const [filters, setFilters] = useState({
    severity: 'all',
    workflowType: 'all',
    handlerId: 'all'
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (handlers?.length > 0) {
      loadPriorityCases();
    }
  }, [filters]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [casesData, handlersData] = await Promise.all([
        priorityWorkflowService?.getPriorityCases(filters),
        priorityWorkflowService?.getActiveHandlers()
      ]);

      setCases(casesData);
      setHandlers(handlersData);
    } catch (err) {
      setError(err?.message || t('common.error'));
      console.error('Error loading priority cases:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPriorityCases = async () => {
    setIsLoading(true);
    setError('');
    try {
      const casesData = await priorityWorkflowService?.getPriorityCases(filters);
      setCases(casesData);
    } catch (err) {
      setError(err?.message || t('common.error'));
      console.error('Error loading priority cases:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({
      severity: 'all',
      workflowType: 'all',
      handlerId: 'all'
    });
  };

  const handlePriorityUpdate = async (ticketId, newSeverity) => {
    try {
      await priorityWorkflowService?.updateTicketPriority(ticketId, newSeverity);
      await loadPriorityCases();
    } catch (err) {
      alert(`Fout bij het updaten van priority: ${err?.message}`);
    }
  };

  const handleReassign = async (ticketId, newHandlerId) => {
    try {
      await priorityWorkflowService?.reassignTicket(ticketId, newHandlerId);
      await loadPriorityCases();
    } catch (err) {
      alert(`Fout bij het reassignen: ${err?.message}`);
    }
  };

  const criticalCount = cases?.filter(c => c?.severityCode === 'critical')?.length || 0;
  const overdueCount = cases?.filter(c => c?.isOverdue)?.length || 0;

  return (
    <>
      <Helmet>
        <title>{t('priorityWorkflow.title')} | Case Management</title>
      </Helmet>
      <AuthContextNavigator />
      <div className="min-h-screen app-page-gradient bg-background py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                  Handler Priority Workflow
                </h1>
                <p className="text-muted-foreground">
                  Focus on time-sensitive cases with intelligent prioritization
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  iconName="RefreshCw"
                  iconPosition="left"
                  onClick={loadPriorityCases}
                  disabled={isLoading}
                >
                  Ververs
                </Button>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="card bg-error/10 border-error mb-6">
              <div className="flex items-start gap-3">
                <Icon name="AlertCircle" size={20} color="var(--color-error)" />
                <div>
                  <h3 className="font-semibold text-error mb-1">Fout bij laden</h3>
                  <p className="text-sm text-error/80">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Priority Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-6">
            <div className="card hover:shadow-lg transition-smooth">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-error/10 flex items-center justify-center">
                  <Icon name="AlertTriangle" size={24} color="var(--color-error)" />
                </div>
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
                {criticalCount}
              </h3>
              <p className="text-sm font-medium text-foreground mb-1">
                Critical Cases
              </p>
              <p className="text-xs text-muted-foreground">
                Requires immediate attention
              </p>
            </div>

            <div className="card hover:shadow-lg transition-smooth">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-warning/10 flex items-center justify-center">
                  <Icon name="Clock" size={24} color="var(--color-warning)" />
                </div>
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
                {overdueCount}
              </h3>
              <p className="text-sm font-medium text-foreground mb-1">
                Overdue Cases
              </p>
              <p className="text-xs text-muted-foreground">
                Past deadline
              </p>
            </div>

            <div className="card hover:shadow-lg transition-smooth">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon name="ListChecks" size={24} color="var(--color-primary)" />
                </div>
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
                {cases?.length || 0}
              </h3>
              <p className="text-sm font-medium text-foreground mb-1">
                Total Priority Cases
              </p>
              <p className="text-xs text-muted-foreground">
                Urgent and high severity
              </p>
            </div>
          </div>

          {/* Filters */}
          <PriorityFilters
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            handlers={handlers}
          />

          {/* Priority Cases Table */}
          <PriorityCasesTable
            cases={cases}
            isLoading={isLoading}
            handlers={handlers}
            onPriorityUpdate={handlePriorityUpdate}
            onReassign={handleReassign}
          />
        </div>
      </div>
    </>
  );
}
