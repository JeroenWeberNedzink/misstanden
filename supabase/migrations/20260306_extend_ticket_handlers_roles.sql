-- Extend ticket_handlers with assignment role metadata.
-- Keeps existing many-to-many assignment behavior while adding role semantics.

ALTER TABLE IF EXISTS public.ticket_handlers
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'secondary',
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz NOT NULL DEFAULT now();

UPDATE public.ticket_handlers
SET role = COALESCE(NULLIF(btrim(role), ''), 'secondary')
WHERE role IS NULL OR btrim(role) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ticket_handlers_role_chk'
      AND conrelid = 'public.ticket_handlers'::regclass
  ) THEN
    ALTER TABLE public.ticket_handlers
      ADD CONSTRAINT ticket_handlers_role_chk
      CHECK (role IN ('primary', 'secondary', 'legal', 'observer'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ticket_handlers_role
  ON public.ticket_handlers(role);

CREATE INDEX IF NOT EXISTS idx_ticket_handlers_assigned_at
  ON public.ticket_handlers(assigned_at DESC);

COMMENT ON COLUMN public.ticket_handlers.role IS 'Assignment role: primary, secondary, legal, observer';
COMMENT ON COLUMN public.ticket_handlers.assigned_at IS 'Timestamp when this handler assignment was created';
