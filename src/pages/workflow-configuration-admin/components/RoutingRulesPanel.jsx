import React, { useState, useEffect } from 'react';
import Button from '../../../components/ui/Button';
import Select from '../../../components/ui/Select';
import Icon from '../../../components/AppIcon';
import { workflowService } from '../../../services/workflowService';

export default function RoutingRulesPanel({ workflow, onRulesUpdated }) {
  const [routingRules, setRoutingRules] = useState([]);
  const [handlers, setHandlers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedHandler, setSelectedHandler] = useState('');

  useEffect(() => {
    loadData();
  }, [workflow?.id]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [rulesData, handlersData] = await Promise.all([
        workflowService?.getRoutingRules(workflow?.id),
        workflowService?.getActiveHandlers()
      ]);
      setRoutingRules(rulesData);
      setHandlers(handlersData);
    } catch (err) {
      console.error('Error loading routing rules:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddRule = async () => {
    if (!selectedHandler) return;

    try {
      setIsAdding(true);
      await workflowService?.addRoutingRule(workflow?.id, selectedHandler);
      await loadData();
      setSelectedHandler('');
      onRulesUpdated?.();
    } catch (err) {
      console.error('Error adding routing rule:', err);
      alert('Fout bij het toevoegen van routing regel');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveRule = async (ruleId) => {
    if (!window.confirm('Weet u zeker dat u deze routing regel wilt verwijderen?')) return;

    try {
      await workflowService?.removeRoutingRule(ruleId);
      await loadData();
      onRulesUpdated?.();
    } catch (err) {
      console.error('Error removing routing rule:', err);
      alert('Fout bij het verwijderen van routing regel');
    }
  };

  const assignedHandlerIds = routingRules?.map(rule => rule?.handler?.id);
  const availableHandlers = handlers?.filter(h => !assignedHandlerIds?.includes(h?.id));

  const handlerOptions = availableHandlers?.map(handler => ({
    value: handler?.id,
    label: handler?.name,
    description: handler?.email
  }));

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon name={workflow?.iconName || 'Workflow'} size={24} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">
              {workflow?.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {workflow?.description || 'Geen beschrijving'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className={`px-2 py-1 rounded-full ${
            workflow?.active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
          }`}>
            {workflow?.active ? 'Actief' : 'Inactief'}
          </div>
          <span>•</span>
          <span>Code: <span className="font-mono">{workflow?.code}</span></span>
        </div>
      </div>

      {/* Add Handler Section */}
      <div className="p-6 bg-muted/30 border-b border-border">
        <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <Icon name="UserPlus" size={16} />
          Handler Toewijzen
        </h4>
        <div className="flex gap-3">
          <div className="flex-1">
            <Select
              options={handlerOptions}
              value={selectedHandler}
              onChange={setSelectedHandler}
              placeholder="Selecteer handler..."
              searchable
              disabled={availableHandlers?.length === 0}
            />
          </div>
          <Button
            onClick={handleAddRule}
            disabled={!selectedHandler || isAdding}
            loading={isAdding}
            iconName="Plus"
          >
            Toevoegen
          </Button>
        </div>
        {availableHandlers?.length === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Alle actieve handlers zijn al toegewezen aan deze workflow
          </p>
        )}
      </div>

      {/* Routing Rules List */}
      <div className="p-6">
        <h4 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
          <Icon name="Users" size={16} />
          Toegewezen Handlers ({routingRules?.length})
        </h4>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : routingRules?.length === 0 ? (
          <div className="text-center py-8">
            <Icon name="Users" size={40} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nog geen handlers toegewezen
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Voeg handlers toe om tickets automatisch te routeren
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {routingRules?.map((rule) => (
              <div
                key={rule?.id}
                className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon name="User" size={18} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {rule?.handler?.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {rule?.handler?.email}
                    </p>
                    {rule?.handler?.role && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                        {rule?.handler?.role}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  iconName="Trash2"
                  onClick={() => handleRemoveRule(rule?.id)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}