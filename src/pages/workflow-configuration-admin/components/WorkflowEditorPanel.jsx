import React, { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/ui/Button';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';

const safeTrim = (v) => String(v ?? '').trim();

export default function WorkflowEditorPanel({
  workflow,
  isBusy,
  onSave,
  onToggleActive,
  onOpenHandlerAssign,
  onDelete,

  // ✅ NEW: open statuses editor modal/panel (DB-driven workflow_statuses)
  onEditStatuses,

  // ✅ OPTIONAL: if parent already fetched statuses list for this workflow
  // you can pass workflowStatuses=[...] to show exact count
  workflowStatuses,
}) {
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    iconName: '',
    colorScheme: '',
    displayOrder: 0,
    active: true,
  });

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState(false);

  // Keep editor in sync with selected workflow
  useEffect(() => {
    if (!workflow) return;

    setForm({
      name: workflow?.name ?? '',
      code: workflow?.code ?? '',
      description: workflow?.description ?? '',
      iconName: workflow?.iconName ?? workflow?.icon_name ?? '',
      colorScheme: workflow?.colorScheme ?? workflow?.color_scheme ?? '',
      displayOrder: Number(workflow?.displayOrder ?? workflow?.display_order ?? 0),
      active: Boolean(workflow?.active),
    });

    setErrors({});
    setTouched(false);
  }, [workflow?.id]);

  const iconOptions = useMemo(
    () => [
      { value: 'ClipboardList', label: 'ClipboardList' },
      { value: 'Workflow', label: 'Workflow' },
      { value: 'AlertTriangle', label: 'AlertTriangle' },
      { value: 'ShieldAlert', label: 'ShieldAlert' },
      { value: 'FileText', label: 'FileText' },
      { value: 'MessageSquare', label: 'MessageSquare' },
      { value: 'Users', label: 'Users' },
    ],
    []
  );

  const colorOptions = useMemo(
    () => [
      { value: 'sky', label: 'Sky' },
      { value: 'blue', label: 'Blue' },
      { value: 'emerald', label: 'Emerald' },
      { value: 'amber', label: 'Amber' },
      { value: 'rose', label: 'Rose' },
      { value: 'slate', label: 'Slate' },
    ],
    []
  );

  // ✅ Status count from:
  // 1) explicit workflowStatuses list
  // 2) workflow.statusCount (camel)
  // 3) workflow.status_count (snake)
  const statusCount = useMemo(() => {
    if (Array.isArray(workflowStatuses)) return workflowStatuses.length;

    const a = Number(workflow?.statusCount);
    if (Number.isFinite(a)) return a;

    const b = Number(workflow?.status_count);
    if (Number.isFinite(b)) return b;

    // fallback unknown
    return null;
  }, [workflowStatuses, workflow?.statusCount, workflow?.status_count]);

  const validate = () => {
    const next = {};

    if (!safeTrim(form.name)) next.name = 'Naam is verplicht';
    if (!safeTrim(form.code)) next.code = 'Code is verplicht';

    // Supabase constraint: code ~ '^[a-z0-9_]+$'
    if (safeTrim(form.code) && !/^[a-z0-9_]+$/.test(safeTrim(form.code))) {
      next.code = 'Code mag alleen: a-z, 0-9 en _';
    }

    if (!Number.isFinite(Number(form.displayOrder))) next.displayOrder = 'Ongeldige volgorde';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleChange = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setTouched(true);
  };

  const handleSave = async () => {
    if (!validate()) return;

    const payload = {
      name: safeTrim(form.name),
      code: safeTrim(form.code),
      description: safeTrim(form.description) || null,
      iconName: safeTrim(form.iconName) || null,
      colorScheme: safeTrim(form.colorScheme) || null,
      displayOrder: Number(form.displayOrder ?? 0),
      active: Boolean(form.active),
    };

    await onSave?.(payload);
    setTouched(false);
  };

  const handleReset = () => {
    if (!workflow) return;

    setForm({
      name: workflow?.name ?? '',
      code: workflow?.code ?? '',
      description: workflow?.description ?? '',
      iconName: workflow?.iconName ?? workflow?.icon_name ?? '',
      colorScheme: workflow?.colorScheme ?? workflow?.color_scheme ?? '',
      displayOrder: Number(workflow?.displayOrder ?? workflow?.display_order ?? 0),
      active: Boolean(workflow?.active),
    });

    setErrors({});
    setTouched(false);
  };

  if (!workflow) return null;

return (
  <div className="bg-card border border-border rounded-xl overflow-hidden">
    {/* Body */}
    <div className="p-4 md:p-5 space-y-4">
      {/* Title (simple, no header card) */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground truncate">
            {workflow?.name}
          </h2>
          {!!workflow?.code && (
            <p className="text-xs text-muted-foreground truncate">
              <span className="font-mono text-[11px]">{workflow.code}</span>
              {workflow?.description ? <span> · {workflow.description}</span> : null}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Naam"
          required
          value={form.name}
          onChange={(e) => handleChange({ name: e.target.value })}
          error={errors.name}
          disabled={isBusy}
          description="Omschrijving die extern gezien word door gebruikers van de pagina"
        />

        <Input
          label="Code"
          required
          value={form.code}
          onChange={(e) => handleChange({ code: e.target.value })}
          error={errors.code}
          disabled={isBusy}
          description="Omschrijving die intern word gebruikt voor deze workflow"
        />

      <div className="col-span-2 space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Omschrijving
        </label>

        <textarea
          value={form.description}
          onChange={(e) => handleChange({ description: e.target.value })}
          disabled={isBusy}
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
        />
      </div>
      </div>

      {/* ✅ Status management (DB-driven) */}
      <div className="rounded-lg border border-border bg-muted/10 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon name="ListChecks" size={14} className="text-muted-foreground" />
              <h3 className="text-xs font-medium text-foreground">Workflow statussen</h3>

              {Number.isFinite(statusCount) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {statusCount}
                </span>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground mt-0.5">
              Beheer workflow statussen en transities
            </p>
          </div>

          {/* Make Beheer stand out */}
          <Button
            variant="default"
            size="sm"
            iconName="Settings"
            iconPosition="left"
            disabled={isBusy}
            onClick={() => onEditStatuses?.(workflow)}
            className={[
              'text-xs font-semibold',
              'shadow-sm hover:shadow',
              'focus:ring-2 focus:ring-primary/30',
            ].join(' ')}
          >
            Beheer
          </Button>
        </div>
      </div>
    </div>

    {/* Footer */}
    <div className="p-4 md:p-5 border-t border-border flex items-center justify-between gap-2">
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        {touched ? (
          <>
            <span className="w-2 h-2 rounded-full bg-warning" />
            Onopgeslagen wijzigingen
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-success" />
            Up-to-date
          </>
        )}
      </div>

      {/* Actions: Reset + Save + Assign + Delete (all together) */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={!touched || isBusy}
        >
          Reset
        </Button>

        <Button
          variant="default"
          size="sm"
          iconName="Save"
          iconPosition="left"
          onClick={handleSave}
          disabled={!touched || isBusy}
          className="font-semibold"
        >
          Opslaan
        </Button>

        <Button
          variant="outline"
          size="sm"
          iconName="Users"
          iconPosition="left"
          onClick={onOpenHandlerAssign}
          disabled={isBusy || !workflow?.id}
          className="font-semibold"
        >
          Handlers
        </Button>

        <Button
          variant="outline"
          size="sm"
          iconName="Trash2"
          iconPosition="left"
          disabled={isBusy || !workflow?.id}
          onClick={onDelete}
          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50 font-semibold"
        >
          Verwijder
        </Button>
      </div>
    </div>
  </div>
);
}