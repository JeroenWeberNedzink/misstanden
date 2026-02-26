import React, { useEffect, useMemo, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { getApiAccessToken } from '../../../lib/auth0ApiToken';

const STORAGE_KEY = 'sla_backfill_next_step_due_ran_at';

const formatDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('nl-NL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function SlaBackfillPanel({ onShowToast }) {
  const { getAccessTokenSilently } = useAuth0();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [lastRunAt, setLastRunAt] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [autoRunDone, setAutoRunDone] = useState(Boolean(localStorage.getItem(STORAGE_KEY)));

  const canAutoRun = useMemo(() => !autoRunDone && !isRunning, [autoRunDone, isRunning]);

  const runBackfill = async (opts = {}) => {
    setIsRunning(true);
    setError('');
    try {
      const token = await getApiAccessToken(getAccessTokenSilently);
      const resp = await fetch('/api/sla-backfill.api.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(opts),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success) {
        throw new Error(json?.message || 'Backfill mislukt');
      }

      const now = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, now);
      setLastRunAt(now);
      setAutoRunDone(true);
      setResult(json);
      onShowToast?.(`Backfill afgerond (${json.updated} bijgewerkt)`);
    } catch (err) {
      const msg = err?.message || 'Backfill mislukt';
      setError(msg);
      onShowToast?.(msg, true);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (canAutoRun) {
      runBackfill({ auto: true });
    }
  }, [canAutoRun]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white/70 p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center">
            <Icon name="Clock" size={22} className="text-sky-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">SLA Backfill</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Zet <span className="font-mono">next_step_due</span> voor bestaande tickets op basis van
              <span className="font-mono"> workflow_statuses.expected_duration_days</span>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-800 px-3 py-1 font-semibold">
                Laatst uitgevoerd: {formatDateTime(lastRunAt)}
              </span>
              {result && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 font-semibold">
                  {result.updated} bijgewerkt · {result.skipped} overgeslagen
                </span>
              )}
            </div>
          </div>
          {autoRunDone && (
            <div className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-3 py-1 text-xs font-semibold">
              <Icon name="CheckCircle" size={14} />
              Eenmalig uitgevoerd
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="default"
            size="sm"
            iconName="Wand2"
            iconPosition="left"
            disabled={isRunning}
            onClick={() => runBackfill({})}
          >
            {isRunning ? 'Bezig...' : 'Backfill uitvoeren'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconName="RefreshCw"
            iconPosition="left"
            disabled={isRunning}
            onClick={() => runBackfill({ force: true })}
          >
            Forceer opnieuw
          </Button>
        </div>
      </div>
    </div>
  );
}
