-- Temporary guest links for external investigators.

CREATE TABLE IF NOT EXISTS public.guest_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  token text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES public.handlers(id) ON DELETE SET NULL,
  CONSTRAINT guest_access_role_chk CHECK (role IN ('viewer', 'external_investigator'))
);

ALTER TABLE public.guest_access
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS ticket_id uuid,
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'viewer',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guest_access_role_chk'
      AND conrelid = 'public.guest_access'::regclass
  ) THEN
    ALTER TABLE public.guest_access
      ADD CONSTRAINT guest_access_role_chk
      CHECK (role IN ('viewer', 'external_investigator'));
  END IF;
END $$;

UPDATE public.guest_access
SET role = COALESCE(NULLIF(btrim(role), ''), 'viewer')
WHERE role IS NULL OR btrim(role) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_access_token_unique
  ON public.guest_access(token);

CREATE INDEX IF NOT EXISTS idx_guest_access_ticket_id
  ON public.guest_access(ticket_id);

CREATE INDEX IF NOT EXISTS idx_guest_access_expires_at
  ON public.guest_access(expires_at);

ALTER TABLE public.guest_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guest_access_no_direct_select ON public.guest_access;
CREATE POLICY guest_access_no_direct_select
  ON public.guest_access
  FOR SELECT
  TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS guest_access_no_direct_write ON public.guest_access;
CREATE POLICY guest_access_no_direct_write
  ON public.guest_access
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
