import React from 'react';
import Icon from '../../../components/AppIcon';

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatBadgeDate = (value) => {
  const d = parseDate(value);
  if (!d) return '-';
  return d.toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const isOverdue = (value) => {
  const d = parseDate(value);
  return d ? d.getTime() < Date.now() : false;
};

const formatRemaining = (value) => {
  const d = parseDate(value);
  if (!d) return null;
  const diffMs = d.getTime() - Date.now();
  const isLate = diffMs < 0;
  const absMs = Math.abs(diffMs);
  const totalHours = Math.round(absMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const parts = [];
  if (days) parts.push(`${days}d`);
  parts.push(`${hours}u`);
  return { isLate, text: `${isLate ? 'Te laat' : 'Over'} ${parts.join(' ')}` };
};

export default function SLACompactCard({ sla, statusLabel, currentStatusDurationDays }) {
  if (!sla) return null;
  const responseRemaining = formatRemaining(sla?.firstResponseDueAt);
  const nextStepRemaining = formatRemaining(sla?.nextStepDueAt);
  const resolutionRemaining = formatRemaining(sla?.resolutionDueAt);
  const hasContact =
    Boolean(sla?.contactPersonName) ||
    Boolean(sla?.contactPersonEmail) ||
    Boolean(sla?.contactPersonPhone) ||
    Boolean(sla?.contactNotes);
  const hasOverdue =
    (!sla?.firstResponseAt && sla?.firstResponseDueAt && isOverdue(sla?.firstResponseDueAt)) ||
    (sla?.nextStepDueAt && isOverdue(sla?.nextStepDueAt)) ||
    (sla?.resolutionDueAt && isOverdue(sla?.resolutionDueAt));

  return (
    <div className="bg-sky-50/70 border border-sky-200/60 rounded-2xl p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center">
          <Icon name="Clock" size={18} className="text-sky-700" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-sky-900">SLA per huidige status</h3>
          <p className="text-xs text-sky-700/80">{statusLabel || 'Onbekend'}</p>
        </div>
        {hasOverdue && (
          <div className="ml-auto inline-flex items-center gap-1 rounded-full bg-sky-200 text-sky-900 px-2 py-1 text-[11px] font-semibold">
            <Icon name="AlertTriangle" size={12} />
            SLA overschreden
          </div>
        )}
      </div>

      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-sky-100 text-sky-800 px-3 py-1 text-[11px] font-semibold">
        <Icon name="Timer" size={12} />
        {Number.isFinite(Number(currentStatusDurationDays))
          ? `SLA: ${Number(currentStatusDurationDays)} dagen`
          : 'SLA: niet ingesteld'}
      </div>

      {hasContact && (
        <div className="mb-3 rounded-xl border border-sky-100 bg-white/70 px-3 py-2">
          <div className="text-[11px] font-semibold text-sky-900">Contactpersoon</div>
          <div className="mt-1 space-y-0.5 text-[11px] text-sky-700/80">
            {sla?.contactPersonName && <div>Naam: {sla.contactPersonName}</div>}
            {sla?.contactPersonEmail && <div>Email: {sla.contactPersonEmail}</div>}
            {sla?.contactPersonPhone && <div>Telefoon: {sla.contactPersonPhone}</div>}
            {sla?.contactNotes && <div>Notitie: {sla.contactNotes}</div>}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2 bg-white/70 border border-sky-100 rounded-xl px-3 py-2">
          <div>
            <div className="text-xs font-semibold text-sky-900">Eerste reactie</div>
            <div className="text-[11px] text-sky-700/80">
              {sla?.firstResponseAt
                ? `Gereageerd op ${formatBadgeDate(sla.firstResponseAt)}`
                : `Uiterlijk ${formatBadgeDate(sla?.firstResponseDueAt)}`}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] font-semibold text-sky-800">
              {sla?.firstResponseAt ? 'Ontvangen' : isOverdue(sla?.firstResponseDueAt) ? 'Te laat' : 'In behandeling'}
            </span>
            {!sla?.firstResponseAt && responseRemaining && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                responseRemaining.isLate ? 'bg-sky-200 text-sky-900' : 'bg-sky-100 text-sky-800'
              }`}>
                {responseRemaining.text}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-start justify-between gap-2 bg-white/70 border border-sky-100 rounded-xl px-3 py-2">
          <div>
            <div className="text-xs font-semibold text-sky-900">Volgende stap</div>
            <div className="text-[11px] text-sky-700/80">
              Verwacht voor {formatBadgeDate(sla?.nextStepDueAt)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] font-semibold text-sky-800">
              {sla?.nextStepDueAt ? (isOverdue(sla?.nextStepDueAt) ? 'Te laat' : 'Verwacht') : '—'}
            </span>
            {nextStepRemaining && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                nextStepRemaining.isLate ? 'bg-sky-200 text-sky-900' : 'bg-sky-100 text-sky-800'
              }`}>
                {nextStepRemaining.text}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-start justify-between gap-2 bg-white/70 border border-sky-100 rounded-xl px-3 py-2">
          <div>
            <div className="text-xs font-semibold text-sky-900">Oplossen</div>
            <div className="text-[11px] text-sky-700/80">
              Verwacht voor {formatBadgeDate(sla?.resolutionDueAt)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] font-semibold text-sky-800">
              {sla?.resolutionDueAt ? (isOverdue(sla?.resolutionDueAt) ? 'Te laat' : 'Verwacht') : '—'}
            </span>
            {resolutionRemaining && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                resolutionRemaining.isLate ? 'bg-sky-200 text-sky-900' : 'bg-sky-100 text-sky-800'
              }`}>
                {resolutionRemaining.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
