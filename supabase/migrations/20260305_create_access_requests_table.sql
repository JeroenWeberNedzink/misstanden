-- Access requests for users who authenticated with OAuth but do not yet have portal access.
-- Idempotent migration.

CREATE TABLE IF NOT EXISTS public.access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  email text NULL,
  name text NULL,
  picture text NULL,
  status text NOT NULL DEFAULT 'pending',
  request_message text NULL,
  review_notes text NULL,
  created_handler_id uuid NULL REFERENCES public.handlers(id) ON DELETE SET NULL,
  reviewed_by uuid NULL REFERENCES public.handlers(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT access_requests_status_chk CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS picture text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS request_message text,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS created_handler_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'access_requests_status_chk'
      AND conrelid = 'public.access_requests'::regclass
  ) THEN
    ALTER TABLE public.access_requests
      ADD CONSTRAINT access_requests_status_chk CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'access_requests_created_handler_id_fkey'
      AND conrelid = 'public.access_requests'::regclass
  ) THEN
    ALTER TABLE public.access_requests
      ADD CONSTRAINT access_requests_created_handler_id_fkey
      FOREIGN KEY (created_handler_id) REFERENCES public.handlers(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'access_requests_reviewed_by_fkey'
      AND conrelid = 'public.access_requests'::regclass
  ) THEN
    ALTER TABLE public.access_requests
      ADD CONSTRAINT access_requests_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES public.handlers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_access_requests_status_created_at
  ON public.access_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_requests_user_id
  ON public.access_requests (user_id);

CREATE INDEX IF NOT EXISTS idx_access_requests_email_lower
  ON public.access_requests ((lower(email)));

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_pending_user_unique
  ON public.access_requests (user_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_pending_email_unique
  ON public.access_requests ((lower(email)))
  WHERE status = 'pending' AND email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_access_requests_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_access_requests_updated_at ON public.access_requests;
CREATE TRIGGER trigger_access_requests_updated_at
  BEFORE UPDATE ON public.access_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_access_requests_updated_at();
