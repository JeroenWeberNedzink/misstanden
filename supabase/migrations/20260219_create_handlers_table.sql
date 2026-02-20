-- Create handlers table used by admin/user management and ticket assignment.
-- Idempotent: safe to run on environments where parts may already exist.

CREATE TABLE IF NOT EXISTS public.handlers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NULL,
  active boolean NULL DEFAULT true,
  phone text NULL,
  created_at date NULL DEFAULT now(),
  updated_at date NULL DEFAULT now(),
  roles jsonb NULL DEFAULT '["HANDLER"]'::jsonb,
  last_login timestamp with time zone NULL,
  user_id text NULL,
  picture text NULL,
  permissions jsonb NULL DEFAULT '{}'::jsonb,
  roles_tmp text[] NULL DEFAULT ARRAY['HANDLER'::text],
  CONSTRAINT handlers_pkey PRIMARY KEY (id),
  CONSTRAINT handlers_email_unique UNIQUE (email)
) TABLESPACE pg_default;

ALTER TABLE public.handlers
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS created_at date DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at date DEFAULT now(),
  ADD COLUMN IF NOT EXISTS roles jsonb DEFAULT '["HANDLER"]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_login timestamp with time zone,
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS picture text,
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS roles_tmp text[] DEFAULT ARRAY['HANDLER'::text];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.handlers WHERE name IS NULL) THEN
    ALTER TABLE public.handlers
      ALTER COLUMN name SET NOT NULL;
  ELSE
    RAISE NOTICE 'Skipping NOT NULL on handlers.name because NULL values exist';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'handlers_email_unique'
      AND conrelid = 'public.handlers'::regclass
  ) THEN
    ALTER TABLE public.handlers
      ADD CONSTRAINT handlers_email_unique UNIQUE (email);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_handlers_roles
  ON public.handlers USING gin (roles) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_handlers_active
  ON public.handlers USING btree (active) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_handlers_user_id
  ON public.handlers USING btree (user_id) TABLESPACE pg_default;

DO $$
BEGIN
  IF to_regprocedure('public.create_default_notification_settings()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS on_handler_created_notification_settings ON public.handlers;
    CREATE TRIGGER on_handler_created_notification_settings
    AFTER INSERT ON public.handlers
    FOR EACH ROW
    EXECUTE FUNCTION public.create_default_notification_settings();
  ELSE
    RAISE NOTICE 'Skipping trigger on_handler_created_notification_settings: function public.create_default_notification_settings() not found';
  END IF;
END $$;
