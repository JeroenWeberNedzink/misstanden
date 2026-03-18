import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AuthContextNavigator from '../components/navigation/AuthContextNavigator';
import Button from '../components/ui/Button';
import Icon from '../components/AppIcon';
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { analyticsApiService } from '../services/analyticsApiService';

const formatDateInput = (date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const last12MonthsRange = () => {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - 12);
  return {
    dateFrom: formatDateInput(from),
    dateTo: formatDateInput(to),
  };
};

const summaryItem = (icon, label, value) => ({ icon, label, value });

export default function AnalyticsDashboardPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState(null);
  const [range, setRange] = useState(last12MonthsRange);

  const loadMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const data = await analyticsApiService.getDashboardMetrics({
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      });
      setMetrics(data);
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [range.dateFrom, range.dateTo]);

  useEffect(() => {
    loadMetrics().catch(() => {});
  }, [loadMetrics]);

  const summary = metrics?.summary || {};

  const summaryCards = useMemo(
    () => [
      summaryItem('FileText', t('analytics.totalReports', { defaultValue: 'Total reports' }), summary?.total_reports ?? 0),
      summaryItem('Clock', t('analytics.avgResolution', { defaultValue: 'Avg resolution (hours)' }), summary?.average_resolution_hours ?? 0),
      summaryItem('AlertTriangle', t('analytics.slaBreaches', { defaultValue: 'SLA breaches' }), summary?.sla_breaches ?? 0),
    ],
    [summary?.average_resolution_hours, summary?.sla_breaches, summary?.total_reports, t]
  );

  return (
    <AuthContextNavigator>
      <div className="min-h-screen app-page-gradient bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-5 md:py-7 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                {t('analytics.title', { defaultValue: 'Analytics Dashboard' })}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('analytics.subtitle', { defaultValue: 'Case volume, SLA performance and location heatmap insights.' })}
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {t('analytics.from', { defaultValue: 'From' })}
                </label>
                <input
                  type="date"
                  className="h-10 rounded-md border border-input bg-white text-black px-3 text-sm"
                  value={range.dateFrom}
                  onChange={(e) => setRange((prev) => ({ ...prev, dateFrom: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {t('analytics.to', { defaultValue: 'To' })}
                </label>
                <input
                  type="date"
                  className="h-10 rounded-md border border-input bg-white text-black px-3 text-sm"
                  value={range.dateTo}
                  onChange={(e) => setRange((prev) => ({ ...prev, dateTo: e.target.value }))}
                />
              </div>
              <Button variant="outline" onClick={loadMetrics} loading={loading}>
                {t('common.refresh', { defaultValue: 'Refresh' })}
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                  <Icon name={card.icon} size={16} />
                  <span>{card.label}</span>
                </div>
                <div className="text-2xl font-semibold text-foreground">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">
                {t('analytics.reportsPerMonth', { defaultValue: 'Reports per month' })}
              </h2>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics?.reports_per_month || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">
                {t('analytics.reportsPerCategory', { defaultValue: 'Reports per category' })}
              </h2>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics?.reports_per_category || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="var(--color-accent)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 xl:col-span-2">
              <h2 className="text-sm font-semibold text-foreground mb-3">
                {t('analytics.locationHeatmap', { defaultValue: 'Location heatmap (reports per country)' })}
              </h2>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics?.location_heatmap || []} layout="vertical" margin={{ left: 30, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="label" width={180} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#ff7a59" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthContextNavigator>
  );
}
