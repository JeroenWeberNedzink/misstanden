import React, { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/ui/Button';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';

const safeTrim = (v) => String(v ?? '').trim();

export default function WorkflowEditorPanel({
  workflow,
  isBusy,
  onSave,
  onToggleActive,
  onOpenHandlerAssign,
  onDelete,
  onEditStatuses,
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
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

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
    setShowDangerZone(false);
    setShowTechnicalDetails(false);
  }, [workflow?.id]);

  const statusCount = useMemo(() => {
    if (Array.isArray(workflowStatuses)) return workflowStatuses.length;

    const a = Number(workflow?.statusCount);
    if (Number.isFinite(a)) return a;

    const b = Number(workflow?.status_count);
    if (Number.isFinite(b)) return b;

    return null;
  }, [workflowStatuses, workflow?.statusCount, workflow?.status_count]);

  const validate = () => {
    const next = {};

    if (!safeTrim(form.name)) next.name = 'Naam is verplicht';
    if (!safeTrim(form.code)) next.code = 'Code is verplicht';

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
    <div className="bg-transparent">
      <div className="pb-3 border-b border-border">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-7 h-7 rounded-full bg-sky-600 text-white text-sm font-bold inline-flex items-center justify-center">
                2
              </span>
              <div className="text-base font-bold text-sky-700">Stap 2 - Bewerk workflow</div>
            </div>
            <h2 className="text-lg font-bold text-foreground truncate">{workflow?.name}</h2>
            {workflow?.description ? (
              <p className="text-xs text-muted-foreground truncate">{workflow.description}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Werk de naam en omschrijving bij voor dagelijkse administratie.</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span
              className={[
                'text-[11px] px-2.5 py-1 rounded-full border',
                workflow?.active
                  ? 'border-sky-300 bg-sky-50 text-sky-700'
                  : 'border-slate-300 bg-slate-50 text-slate-700',
              ].join(' ')}
            >
              {workflow?.active ? 'Actief' : 'Inactief'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleActive?.(!workflow?.active)}
              disabled={isBusy}
            >
              {workflow?.active ? 'Deactiveer' : 'Activeer'}
            </Button>
          </div>
        </div>
      </div>

      <div className="pt-3 space-y-5">
        <section className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Basisgegevens</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Alleen dit gedeelte is nodig voor dagelijkse administratie.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Input
              label="Naam"
              required
              value={form.name}
              onChange={(e) => handleChange({ name: e.target.value })}
              error={errors.name}
              disabled={isBusy}
              description="Zichtbaar voor gebruikers in het meldformulier."
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Omschrijving</label>
            <textarea
              value={form.description}
              onChange={(e) => handleChange({ description: e.target.value })}
              disabled={isBusy}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />
          </div>

          <div className="rounded-lg border border-sky-100 bg-sky-50/60 p-3">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-3 text-left"
              onClick={() => setShowTechnicalDetails((prev) => !prev)}
              disabled={isBusy}
            >
              <div>
                <div className="text-sm font-medium text-sky-900">Technische details</div>
                <div className="text-xs text-sky-700">
                  De interne workflowcode is alleen relevant voor beheer, koppelingen en support.
                </div>
              </div>
              <Icon
                name={showTechnicalDetails ? 'ChevronUp' : 'ChevronDown'}
                size={16}
                className="text-sky-700 shrink-0"
              />
            </button>

            {showTechnicalDetails && (
              <div className="mt-3 pt-3 border-t border-sky-100">
                <Input
                  label="Interne code"
                  value={form.code}
                  error={errors.code}
                  disabled
                  description="Deze sleutel wordt gebruikt door het systeem en is daarom hier alleen-lezen."
                />
              </div>
            )}
          </div>
        </section>

        <section className="pt-4 border-t border-sky-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-6 h-6 rounded-full bg-sky-600 text-white text-xs font-bold inline-flex items-center justify-center">
                  3
                </span>
                <div className="text-base font-bold text-sky-700">Stap 3 - Workflow stappen</div>
              </div>
              <h3 className="text-base font-semibold text-foreground">Statussen en transities</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Beheer de route van een ticket door het proces.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {Number.isFinite(statusCount) && (
                <span className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-white text-muted-foreground">
                  {statusCount} statussen
                </span>
              )}
              <Button
                variant="default"
                size="sm"
                iconName="ListChecks"
                iconPosition="left"
                disabled={isBusy}
                onClick={() => onEditStatuses?.(workflow)}
                className="font-semibold"
              >
                Beheer stappen
              </Button>
            </div>
          </div>
        </section>

        <section className="pt-4 border-t border-sky-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-6 h-6 rounded-full bg-sky-600 text-white text-xs font-bold inline-flex items-center justify-center">
                  4
                </span>
                <div className="text-base font-bold text-sky-700">Stap 4 - Team</div>
              </div>
              <h3 className="text-base font-semibold text-foreground">Handlers</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Koppel de behandelaars die voor deze workflow tickets mogen verwerken.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              iconName="Users"
              iconPosition="left"
              onClick={(e) => onOpenHandlerAssign?.(e)}
              disabled={isBusy || !workflow?.id}
            >
              Handlers beheren
            </Button>
          </div>
        </section>

        <section className="pt-4 border-t border-sky-100">
          <button
            type="button"
            className="w-full text-left flex items-center justify-between gap-2"
            onClick={() => setShowDangerZone((prev) => !prev)}
            disabled={isBusy}
          >
            <span className="text-sm font-semibold text-destructive">Gevaarzone</span>
            <Icon name={showDangerZone ? 'ChevronUp' : 'ChevronDown'} size={16} className="text-destructive" />
          </button>

          {showDangerZone && (
            <div className="mt-2 pt-2 border-t border-destructive/20 space-y-3">
              <p className="text-xs text-destructive/80">
                Verwijderen is permanent en verwijdert gekoppelde tickets en toewijzingen.
              </p>
              <Button
                variant="outline"
                size="sm"
                iconName="Trash2"
                iconPosition="left"
                disabled={isBusy || !workflow?.id}
                onClick={onDelete}
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive/60 font-semibold"
              >
                Workflow verwijderen
              </Button>
            </div>
          )}
        </section>
      </div>

      <div className="pt-3 mt-3 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={!touched || isBusy}>
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
        </div>
      </div>
    </div>
  );
}
