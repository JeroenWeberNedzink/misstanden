-- Automatic SLA escalation log.
-- Used by scheduled endpoint to record and deduplicate missed first-response SLAs.

CREATE TABLE IF NOT EXISTS public.sla_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  escalated_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sla_escalations
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS ticket_id uuid,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.sla_escalations
SET reason = COALESCE(NULLIF(btrim(reason), ''), 'unspecified')
WHERE reason IS NULL OR btrim(reason) = '';

CREATE INDEX IF NOT EXISTS idx_sla_escalations_ticket_id
  ON public.sla_escalations(ticket_id);

CREATE INDEX IF NOT EXISTS idx_sla_escalations_escalated_at
  ON public.sla_escalations(escalated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_escalations_ticket_reason_unique
  ON public.sla_escalations(ticket_id, reason);

ALTER TABLE public.sla_escalations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sla_escalations_no_direct_select ON public.sla_escalations;
CREATE POLICY sla_escalations_no_direct_select
  ON public.sla_escalations
  FOR SELECT
  TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS sla_escalations_no_direct_write ON public.sla_escalations;
CREATE POLICY sla_escalations_no_direct_write
  ON public.sla_escalations
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
