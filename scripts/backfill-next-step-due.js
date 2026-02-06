/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const addDaysISO = (dateLike, days) => {
  if (!dateLike || !Number.isFinite(Number(days))) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(days));
  return d.toISOString();
};

const getArgFlag = (flag) => process.argv.includes(flag);
const FORCE = getArgFlag('--force');
const LIMIT = (() => {
  const idx = process.argv.indexOf('--limit');
  if (idx > -1) {
    const val = Number(process.argv[idx + 1]);
    if (Number.isFinite(val) && val > 0) return val;
  }
  return null;
})();

async function fetchWorkflows() {
  const { data, error } = await supabase.from('workflows').select('id, code');
  if (error) throw error;
  const map = new Map();
  (data || []).forEach((w) => map.set(String(w.code), w.id));
  return map;
}

async function fetchStatuses() {
  const { data, error } = await supabase
    .from('workflow_statuses')
    .select('workflow_id, code, expected_duration_days');
  if (error) throw error;

  const map = new Map(); // key: workflow_id:code -> days
  (data || []).forEach((s) => {
    const key = `${s.workflow_id}:${String(s.code)}`;
    const days = Number(s.expected_duration_days);
    map.set(key, Number.isFinite(days) ? days : null);
  });
  return map;
}

async function fetchTickets() {
  let q = supabase
    .from('tickets')
    .select('id, workflow_type, status_code, submitted_at, last_update_at, next_step_due')
    .order('submitted_at', { ascending: true });

  if (!FORCE) {
    q = q.is('next_step_due', null);
  }

  if (LIMIT) {
    q = q.limit(LIMIT);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function run() {
  console.log(`Backfill next_step_due ${FORCE ? '(force)' : '(only null)'}...`);
  const workflowMap = await fetchWorkflows();
  const statusMap = await fetchStatuses();
  const tickets = await fetchTickets();

  let updated = 0;
  let skipped = 0;

  for (const t of tickets) {
    const wfId = workflowMap.get(String(t.workflow_type));
    if (!wfId) {
      skipped += 1;
      continue;
    }
    const key = `${wfId}:${String(t.status_code)}`;
    const days = statusMap.get(key);
    if (!Number.isFinite(days)) {
      skipped += 1;
      continue;
    }

    const baseDate = t.last_update_at || t.submitted_at;
    const nextStepDue = addDaysISO(baseDate, days);
    if (!nextStepDue) {
      skipped += 1;
      continue;
    }

    const { error } = await supabase
      .from('tickets')
      .update({ next_step_due: nextStepDue })
      .eq('id', t.id);

    if (error) {
      console.warn(`Failed to update ticket ${t.id}:`, error.message || error);
      continue;
    }

    updated += 1;
  }

  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
