-- Ensure ticket_handlers exists and is reachable by PostgREST roles used by the app.
-- Idempotent and safe to run on environments where the table already exists.

CREATE TABLE IF NOT EXISTS public.ticket_handlers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  handler_id uuid NOT NULL REFERENCES public.handlers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, handler_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_handlers_ticket_id
  ON public.ticket_handlers(ticket_id);

CREATE INDEX IF NOT EXISTS idx_ticket_handlers_handler_id
  ON public.ticket_handlers(handler_id);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ticket_handlers TO anon, authenticated, service_role;

-- This frontend currently accesses ticket_handlers directly with the anon key.
-- Keep RLS disabled for parity with existing ticket table access model.
ALTER TABLE public.ticket_handlers DISABLE ROW LEVEL SECURITY;

-- Ask PostgREST to refresh cached schema metadata.
NOTIFY pgrst, 'reload schema';
